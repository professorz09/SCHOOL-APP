import { Router } from 'express';
import { adminDb, userDb } from '../lib/db';
import { ok, fail, ApiError, requireBody } from '../lib/helpers';
import { requireAuth, requireRole } from '../middleware/auth';

export const transportRouter = Router();

// ─── Shared helpers ──────────────────────────────────────────────────────────

type InstallmentRow = { id: string; paid_amount: number; write_off_amount: number };

/** Cancel TRANSPORT fee_installments tied to `assignmentId` from `fromDate` forward. */
async function cancelInstallmentsAfter(
  assignmentId: string,
  fromDate: string,
): Promise<{ deleted: number; cancelled: number }> {
  const { data: rows } = await adminDb
    .from('fee_installments')
    .select('id, paid_amount, write_off_amount')
    .eq('related_id', assignmentId)
    .eq('fee_type', 'TRANSPORT')
    .gte('due_date', fromDate);

  const all      = (rows ?? []) as InstallmentRow[];
  const fresh    = all.filter(r => Number(r.paid_amount) === 0 && Number(r.write_off_amount) === 0);
  const partial  = all.filter(r => Number(r.paid_amount) > 0  || Number(r.write_off_amount) > 0);

  if (fresh.length) {
    await adminDb.from('fee_installments').delete().in('id', fresh.map(r => r.id));
  }
  for (const r of partial) {
    const frozen = Number(r.paid_amount) + Number(r.write_off_amount);
    await adminDb.from('fee_installments')
      .update({ status: 'CANCELLED', amount: frozen, updated_at: new Date().toISOString() })
      .eq('id', r.id);
  }
  return { deleted: fresh.length, cancelled: partial.length };
}

/**
 * Flat monthly schedule fallback (no fee structure). Inserts one TRANSPORT
 * installment per month from startDate to endDate (or academic year end).
 * Idempotency: deletes unpaid existing rows for the assignment first.
 */
async function addFlatTransportSchedule(
  studentId: string,
  academicYearId: string,
  monthlyAmount: number,
  startDate: string,
  endDate: string | null,
  assignmentId: string,
  schoolId: string,
): Promise<number> {
  const { data: ay } = await adminDb
    .from('academic_years')
    .select('start_date, end_date')
    .eq('id', academicYearId)
    .single();
  if (!ay) return 0;

  const ayRow     = ay as { start_date: string; end_date: string };
  const start     = new Date(startDate);
  const end       = endDate ? new Date(endDate) : new Date(ayRow.end_date);
  const yearStart = new Date(ayRow.start_date);
  const yearEnd   = new Date(ayRow.end_date);
  const cursor    = new Date(Math.max(start.getTime(), yearStart.getTime()));
  cursor.setDate(10);

  const rows: Record<string, unknown>[] = [];
  while (cursor <= end && cursor <= yearEnd) {
    rows.push({
      student_id:       studentId,
      school_id:        schoolId,
      academic_year_id: academicYearId,
      month:            cursor.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
      due_date:         cursor.toISOString().slice(0, 10),
      fee_type:         'TRANSPORT',
      amount:           monthlyAmount,
      payer_type:       'PARENT',
      related_id:       assignmentId,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  if (!rows.length) return 0;

  await adminDb.from('fee_installments').delete()
    .eq('related_id', assignmentId)
    .eq('fee_type', 'TRANSPORT')
    .eq('paid_amount', 0)
    .eq('write_off_amount', 0);

  const { error } = await adminDb.from('fee_installments').insert(rows);
  if (error) throw new Error(error.message);
  return rows.length;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// Helper: assert a student belongs to the caller's school.
async function assertStudentInSchool(studentId: string, schoolId: string): Promise<void> {
  const { data } = await adminDb
    .from('students')
    .select('id')
    .eq('id', studentId)
    .eq('school_id', schoolId)
    .maybeSingle();
  if (!data) throw new ApiError(404, 'Student not found');
}

// GET /api/transport/student/:studentId
transportRouter.get('/student/:studentId', requireAuth, requireRole('PRINCIPAL', 'DRIVER', 'PARENT'), async (req, res) => {
  try {
    const studentId = String(req.params.studentId);
    await assertStudentInSchool(studentId, req.user.school_id!);
    const { data, error } = await adminDb
      .from('student_transport_assignments')
      .select('*, transport_vehicles(id, vehicle_no, route_name), route_stops(id, name, estimated_time)')
      .eq('student_id', studentId)
      .order('start_date', { ascending: false });
    if (error) throw new ApiError(500, error.message);
    ok(res, data);
  } catch (err) { fail(res, err); }
});

// GET /api/transport/vehicles
transportRouter.get('/vehicles', requireAuth, requireRole('PRINCIPAL', 'DRIVER'), async (req, res) => {
  try {
    const { data, error } = await adminDb
      .from('transport_vehicles')
      .select('*, route_stops(*)')
      .eq('school_id', req.user.school_id!)
      .eq('is_active', true)
      .order('vehicle_no');
    if (error) throw new ApiError(500, error.message);
    ok(res, data);
  } catch (err) { fail(res, err); }
});

// ─── Vehicle CRUD ─────────────────────────────────────────────────────────────

// POST /api/transport/vehicles/add
transportRouter.post('/vehicles/add', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    // routeName is optional — the principal labels routes later via stops/add.
    // Previously this required a non-empty routeName, which silently rejected
    // every "Add Vehicle" submission from the UI (the form sends an empty
    // string by design).
    const body = requireBody<{
      vehicleNo: string; type: string; capacity: number; routeName?: string;
    }>(req, ['vehicleNo', 'type', 'capacity']);

    // If the same vehicle_no exists for this school but is_active=false
    // (soft-deleted), reactivate instead of failing on the global UNIQUE
    // constraint — gives the UI an idempotent "add" experience.
    const { data: existing } = await adminDb
      .from('transport_vehicles')
      .select('id, school_id, is_active')
      .eq('vehicle_no', body.vehicleNo)
      .maybeSingle();
    if (existing) {
      const ex = existing as { id: string; school_id: string; is_active: boolean };
      if (ex.school_id !== req.user.school_id) {
        throw new ApiError(409, `Vehicle number ${body.vehicleNo} is already registered to another school`);
      }
      if (ex.is_active) {
        throw new ApiError(409, `Vehicle ${body.vehicleNo} already exists`);
      }
      const { data: revived, error: revErr } = await adminDb
        .from('transport_vehicles')
        .update({
          is_active: true,
          type:       body.type,
          capacity:   body.capacity,
          route_name: body.routeName ?? '',
          updated_at: new Date().toISOString(),
        })
        .eq('id', ex.id)
        .select('id, vehicle_no, type, capacity, route_name, driver_id, driver_name, driver_phone, is_active')
        .single();
      if (revErr) throw new ApiError(500, revErr.message);
      ok(res, revived, 200);
      return;
    }

    const { data, error } = await adminDb.from('transport_vehicles').insert({
      school_id:  req.user.school_id!,
      vehicle_no: body.vehicleNo,
      type:       body.type,
      capacity:   body.capacity,
      route_name: body.routeName ?? '',
    }).select('id, vehicle_no, type, capacity, route_name, driver_id, driver_name, driver_phone, is_active').single();
    if (error) {
      // Map the unique-violation 23505 to a friendly message.
      if (/duplicate key|unique/i.test(error.message)) {
        throw new ApiError(409, `Vehicle number ${body.vehicleNo} already exists`);
      }
      throw new ApiError(500, error.message);
    }
    ok(res, data, 201);
  } catch (err) { fail(res, err); }
});

// POST /api/transport/vehicles/update
transportRouter.post('/vehicles/update', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const body = requireBody<{ id: string; patch: Record<string, unknown> }>(req, ['id', 'patch']);
    const allowed = ['vehicle_no','type','capacity','route_name','driver_id','driver_name','driver_phone'];
    const safe: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const k of allowed) if (body.patch[k] !== undefined) safe[k] = body.patch[k];
    const { error } = await adminDb.from('transport_vehicles').update(safe)
      .eq('id', body.id).eq('school_id', req.user.school_id!);
    if (error) throw new ApiError(500, error.message);
    ok(res, { id: body.id });
  } catch (err) { fail(res, err); }
});

// POST /api/transport/vehicles/deactivate
transportRouter.post('/vehicles/deactivate', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const { id } = requireBody<{ id: string }>(req, ['id']);
    const { error } = await adminDb.from('transport_vehicles')
      .update({ is_active: false }).eq('id', id).eq('school_id', req.user.school_id!);
    if (error) throw new ApiError(500, error.message);
    ok(res, { id });
  } catch (err) { fail(res, err); }
});

// ─── Stop CRUD ────────────────────────────────────────────────────────────────

// Helper: assert a vehicle belongs to the caller's school.
async function assertVehicleInSchool(vehicleId: string, schoolId: string): Promise<void> {
  const { data } = await adminDb
    .from('transport_vehicles')
    .select('id')
    .eq('id', vehicleId)
    .eq('school_id', schoolId)
    .maybeSingle();
  if (!data) throw new ApiError(404, 'Vehicle not found');
}

// Helper: assert a stop's vehicle belongs to the caller's school.
async function assertStopInSchool(stopId: string, schoolId: string): Promise<void> {
  const { data } = await adminDb
    .from('route_stops')
    .select('id, transport_vehicles!inner(school_id)')
    .eq('id', stopId)
    .eq('transport_vehicles.school_id', schoolId)
    .maybeSingle();
  if (!data) throw new ApiError(404, 'Stop not found');
}

// POST /api/transport/stops/add
transportRouter.post('/stops/add', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const body = requireBody<{
      vehicleId: string; name: string; estimatedTime: string;
      lat?: number; lng?: number; sortOrder?: number;
    }>(req, ['vehicleId', 'name', 'estimatedTime']);
    await assertVehicleInSchool(body.vehicleId, req.user.school_id!);
    const { data, error } = await adminDb.from('route_stops').insert({
      vehicle_id:     body.vehicleId,
      name:           body.name,
      estimated_time: body.estimatedTime,
      lat:            body.lat ?? null,
      lng:            body.lng ?? null,
      sort_order:     body.sortOrder ?? 0,
    }).select('id, name, estimated_time, lat, lng').single();
    if (error) throw new ApiError(500, error.message);
    ok(res, data, 201);
  } catch (err) { fail(res, err); }
});

// POST /api/transport/stops/update
transportRouter.post('/stops/update', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const body = requireBody<{
      stopId: string; patch: Record<string, unknown>;
    }>(req, ['stopId', 'patch']);
    await assertStopInSchool(body.stopId, req.user.school_id!);
    const safe: Record<string, unknown> = {};
    if (body.patch.name !== undefined)          safe.name           = body.patch.name;
    if (body.patch.estimatedTime !== undefined) safe.estimated_time = body.patch.estimatedTime;
    if (body.patch.lat !== undefined)           safe.lat            = body.patch.lat;
    if (body.patch.lng !== undefined)           safe.lng            = body.patch.lng;
    const { error } = await adminDb.from('route_stops').update(safe).eq('id', body.stopId);
    if (error) throw new ApiError(500, error.message);
    ok(res, { stopId: body.stopId });
  } catch (err) { fail(res, err); }
});

// POST /api/transport/stops/remove
transportRouter.post('/stops/remove', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const { stopId } = requireBody<{ stopId: string }>(req, ['stopId']);
    await assertStopInSchool(stopId, req.user.school_id!);
    const { error } = await adminDb.from('route_stops').delete().eq('id', stopId);
    if (error) throw new ApiError(500, error.message);
    ok(res, { stopId });
  } catch (err) { fail(res, err); }
});

// POST /api/transport/assign — full atomic transport assignment with fee schedule
transportRouter.post('/assign', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    // stopId is now OPTIONAL — schools can assign a student to a vehicle
    // before the route is mapped (driver builds stops on the first trip
    // via /api/transport/stop/add-current). Vehicle is still required.
    const body = requireBody<{
      studentId: string; vehicleId: string; stopId?: string;
      monthlyAmount: number; startDate: string; academicYearId: string;
      endDate?: string; reason?: string; feeStructureId?: string;
    }>(req, ['studentId', 'vehicleId', 'monthlyAmount', 'startDate', 'academicYearId']);

    await assertStudentInSchool(body.studentId, req.user.school_id!);
    await assertVehicleInSchool(body.vehicleId, req.user.school_id!);
    if (body.stopId) await assertStopInSchool(body.stopId, req.user.school_id!);

    // 1. Snapshot prior active assignment for rollback
    const { data: priorRow } = await adminDb
      .from('student_transport_assignments')
      .select('id, end_date, end_reason')
      .eq('student_id', body.studentId)
      .eq('is_active', true)
      .maybeSingle();
    const prior = priorRow as { id: string; end_date: string | null; end_reason: string | null } | null;

    // 2. Close prior assignment (end_date = day before new start)
    const startD   = new Date(body.startDate);
    const closeIso = new Date(startD.getTime() - 86400000).toISOString().slice(0, 10);
    await adminDb.from('student_transport_assignments')
      .update({ is_active: false, end_date: closeIso, end_reason: body.reason ?? 'Replaced by new assignment' })
      .eq('student_id', body.studentId)
      .eq('is_active', true);

    // 3. Cancel prior installments from new start date forward
    if (prior) {
      await cancelInstallmentsAfter(prior.id, body.startDate);
    }

    // 4. Insert new assignment
    const { data, error } = await adminDb
      .from('student_transport_assignments')
      .insert({
        student_id:       body.studentId,
        academic_year_id: body.academicYearId,
        vehicle_id:       body.vehicleId,
        stop_id:          body.stopId ?? null,
        monthly_amount:   Math.round(body.monthlyAmount),
        start_date:       body.startDate,
        end_date:         body.endDate ?? null,
        reason:           body.reason ?? null,
        is_active:        true,
        fee_structure_id: body.feeStructureId ?? null,
      })
      .select()
      .single();

    if (error) {
      if (prior) {
        await adminDb.from('student_transport_assignments')
          .update({ is_active: true, end_date: prior.end_date, end_reason: prior.end_reason })
          .eq('id', prior.id);
      }
      throw new ApiError(500, error.message);
    }
    const newId = (data as any).id as string;

    // 5. Generate fee schedule
    let installmentCount = 0;
    if (body.feeStructureId) {
      const db = userDb(req.jwt);
      const { data: count, error: rpcErr } = await db.rpc('generate_transport_fee_schedule', {
        p_student_id:       body.studentId,
        p_year_id:          body.academicYearId,
        p_assignment_id:    newId,
        p_fee_structure_id: body.feeStructureId,
      });
      if (rpcErr) {
        await adminDb.from('student_transport_assignments').delete().eq('id', newId);
        if (prior) {
          await adminDb.from('student_transport_assignments')
            .update({ is_active: true, end_date: prior.end_date, end_reason: prior.end_reason })
            .eq('id', prior.id);
        }
        throw new ApiError(500, `Transport fee schedule failed: ${rpcErr.message}`);
      }
      installmentCount = (count as number) ?? 0;
    } else {
      try {
        installmentCount = await addFlatTransportSchedule(
          body.studentId, body.academicYearId, Math.round(body.monthlyAmount),
          body.startDate, body.endDate ?? null, newId, req.user.school_id!,
        );
      } catch (e) {
        console.warn('[transport/assign] flat schedule failed:', (e as Error).message);
      }
    }

    ok(res, { ...(data as any), installmentCount }, 201);
  } catch (err) { fail(res, err); }
});

// POST /api/transport/remove — close active assignment + cancel future installments
transportRouter.post('/remove', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const body = requireBody<{
      studentId: string; endDate: string; reason?: string;
    }>(req, ['studentId', 'endDate']);

    await assertStudentInSchool(body.studentId, req.user.school_id!);

    const { data: active } = await adminDb
      .from('student_transport_assignments')
      .select('id')
      .eq('student_id', body.studentId)
      .eq('is_active', true)
      .maybeSingle();
    if (!active) throw new ApiError(404, 'No active transport assignment found');

    const assignmentId = (active as any).id as string;

    const { error } = await adminDb
      .from('student_transport_assignments')
      .update({ is_active: false, end_date: body.endDate, end_reason: body.reason ?? 'Service cancelled' })
      .eq('id', assignmentId);
    if (error) throw new ApiError(500, error.message);

    const { deleted, cancelled } = await cancelInstallmentsAfter(assignmentId, body.endDate);

    ok(res, { assignmentId, endDate: body.endDate, deleted, cancelled });
  } catch (err) { fail(res, err); }
});
