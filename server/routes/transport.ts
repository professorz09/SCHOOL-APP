import { Router } from 'express';
import rateLimit from 'express-rate-limit';
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
  const { data: rows, error: selErr } = await adminDb
    .from('fee_installments')
    .select('id, paid_amount, write_off_amount')
    .eq('related_id', assignmentId)
    .eq('fee_type', 'TRANSPORT')
    .gte('due_date', fromDate);
  if (selErr) throw new ApiError(500, `cancelInstallmentsAfter select failed: ${selErr.message}`);

  const all      = (rows ?? []) as InstallmentRow[];
  const fresh    = all.filter(r => Number(r.paid_amount) === 0 && Number(r.write_off_amount) === 0);
  const partial  = all.filter(r => Number(r.paid_amount) > 0  || Number(r.write_off_amount) > 0);

  if (fresh.length) {
    const { error: delErr } = await adminDb
      .from('fee_installments').delete().in('id', fresh.map(r => r.id));
    if (delErr) throw new ApiError(500, `cancelInstallmentsAfter delete failed: ${delErr.message}`);
  }
  // Group partial rows by their frozen amount and batch the UPDATE — the
  // per-row loop was an N+1 and a mid-loop failure used to leave the
  // assignment in a split half-cancelled state. Each group is one round-trip.
  const byFrozen = new Map<number, string[]>();
  for (const r of partial) {
    const frozen = Number(r.paid_amount) + Number(r.write_off_amount);
    const list = byFrozen.get(frozen) ?? [];
    list.push(r.id);
    byFrozen.set(frozen, list);
  }
  const nowIso = new Date().toISOString();
  for (const [frozen, ids] of byFrozen.entries()) {
    const { error: upErr } = await adminDb
      .from('fee_installments')
      .update({ status: 'CANCELLED', amount: frozen, updated_at: nowIso })
      .in('id', ids);
    if (upErr) throw new ApiError(500, `cancelInstallmentsAfter update failed: ${upErr.message}`);
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
  // setDate(10) can rewind cursor *before* start (e.g. start=15-Apr → 10-Apr),
  // creating a phantom installment for the pre-assignment period. Skip
  // forward one month when that happens. Matches fee.service.ts:974.
  if (cursor < start) cursor.setMonth(cursor.getMonth() + 1);

  // Local-tz YYYY-MM-DD formatter — toISOString() converts to UTC and
  // shifts late-month IST dates back a day (the "1st of month" can land
  // on the last day of the previous month). Mirrors fee.service.ts:980.
  const fmtYmd = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const rows: Record<string, unknown>[] = [];
  while (cursor <= end && cursor <= yearEnd) {
    rows.push({
      student_id:       studentId,
      school_id:        schoolId,
      academic_year_id: academicYearId,
      month:            cursor.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
      due_date:         fmtYmd(cursor),
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
    // route_stops embed removed — student_transport_assignments.stop_id was
    // dropped in migration 0115, so the PostgREST relationship no longer
    // exists. Drivers manage stops on transport_vehicles independently.
    const { data, error } = await adminDb
      .from('student_transport_assignments')
      .select('*, transport_vehicles(id, vehicle_no, route_name)')
      .eq('student_id', studentId)
      .order('start_date', { ascending: false });
    if (error) throw new ApiError(500, error.message);
    ok(res, data);
  } catch (err) { fail(res, err); }
});

// GET /api/transport/vehicles
// Open to PARENT + STUDENT too — TransportView (student/parent side) loads
// the vehicles list through this endpoint to resolve the assigned vehicle's
// route + stops. Without this, the parent-side "No Transport Assignment"
// screen rendered even when the assignment row existed, because the
// vehicles cache came back empty (silent 403 from requireRole).
// Scoping is still safe: the query filters by req.user.school_id.
transportRouter.get('/vehicles', requireAuth, requireRole('PRINCIPAL', 'DRIVER', 'PARENT', 'STUDENT', 'TEACHER'), async (req, res) => {
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

// Helper: when the caller is a DRIVER, also assert the vehicle is the
// one assigned to *their* staff row. Principals can touch any vehicle in
// the school; drivers only their own. Returns silently when allowed.
async function assertCallerOwnsVehicle(
  vehicleId: string,
  user: { id: string; role: string; school_id: string | null },
): Promise<void> {
  await assertVehicleInSchool(vehicleId, user.school_id!);
  if (user.role === 'PRINCIPAL' || user.role === 'SUPER_ADMIN') return;
  if (user.role !== 'DRIVER') throw new ApiError(403, 'Only the assigned driver or the principal can edit this route');
  const { data: staff } = await adminDb.from('staff').select('id').eq('user_id', user.id).maybeSingle();
  const staffId = (staff as { id: string } | null)?.id;
  if (!staffId) throw new ApiError(403, 'Driver staff record not found');
  const { data: v } = await adminDb
    .from('transport_vehicles')
    .select('id')
    .eq('id', vehicleId)
    .eq('driver_id', staffId)
    .maybeSingle();
  if (!v) throw new ApiError(403, 'You are not the assigned driver for this vehicle');
}

async function assertCallerOwnsStop(
  stopId: string,
  user: { id: string; role: string; school_id: string | null },
): Promise<void> {
  if (user.role === 'PRINCIPAL' || user.role === 'SUPER_ADMIN') {
    await assertStopInSchool(stopId, user.school_id!);
    return;
  }
  // For DRIVER, look up the stop's vehicle and verify ownership.
  const { data: row } = await adminDb
    .from('route_stops').select('vehicle_id').eq('id', stopId).maybeSingle();
  const vehicleId = (row as { vehicle_id: string } | null)?.vehicle_id;
  if (!vehicleId) throw new ApiError(404, 'Stop not found');
  await assertCallerOwnsVehicle(vehicleId, user);
}

// 50 writes per 24h per user across add + update + remove combined. Keeps
// a panicked / confused driver from flooding the route with adds and a
// compromised account from grinding through edits. Principal has the
// same cap — they shouldn't legitimately need more than 50 stop tweaks
// in a single day across the whole fleet.
const stopMutationLimiter = rateLimit({
  windowMs: 24 * 60 * 60_000,
  limit: 50,
  keyGenerator: (req: any) => `route-stops:${req.user?.id ?? req.ip}`,
  validate: { keyGeneratorIpFallback: false },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { ok: false, error: 'Route edit limit reached (50/day). Try again tomorrow.' },
});

// POST /api/transport/stops/add
// Principal can manage any school vehicle's stops; DRIVER can only edit
// the vehicle they're assigned to. assertCallerOwnsVehicle enforces both.
transportRouter.post('/stops/add', requireAuth, requireRole('PRINCIPAL', 'DRIVER'), stopMutationLimiter, async (req, res) => {
  try {
    const body = requireBody<{
      vehicleId: string; name: string; estimatedTime: string;
      lat?: number; lng?: number; sortOrder?: number;
    }>(req, ['vehicleId', 'name', 'estimatedTime']);
    await assertCallerOwnsVehicle(body.vehicleId, req.user);
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
transportRouter.post('/stops/update', requireAuth, requireRole('PRINCIPAL', 'DRIVER'), stopMutationLimiter, async (req, res) => {
  try {
    const body = requireBody<{
      stopId: string; patch: Record<string, unknown>;
    }>(req, ['stopId', 'patch']);
    await assertCallerOwnsStop(body.stopId, req.user);
    const safe: Record<string, unknown> = {};
    if (body.patch.name !== undefined)          safe.name           = body.patch.name;
    if (body.patch.estimatedTime !== undefined) safe.estimated_time = body.patch.estimatedTime;
    if (body.patch.lat !== undefined)           safe.lat            = body.patch.lat;
    if (body.patch.lng !== undefined)           safe.lng            = body.patch.lng;
    // sort_order is whitelisted so drivers can reorder stops via the
    // up/down arrows on the Route page.
    if (body.patch.sortOrder !== undefined)     safe.sort_order     = body.patch.sortOrder;
    const { error } = await adminDb.from('route_stops').update(safe).eq('id', body.stopId);
    if (error) throw new ApiError(500, error.message);
    ok(res, { stopId: body.stopId });
  } catch (err) { fail(res, err); }
});

// POST /api/transport/stops/remove
transportRouter.post('/stops/remove', requireAuth, requireRole('PRINCIPAL', 'DRIVER'), stopMutationLimiter, async (req, res) => {
  try {
    const { stopId } = requireBody<{ stopId: string }>(req, ['stopId']);
    await assertCallerOwnsStop(stopId, req.user);
    const { error } = await adminDb.from('route_stops').delete().eq('id', stopId);
    if (error) throw new ApiError(500, error.message);
    ok(res, { stopId });
  } catch (err) { fail(res, err); }
});

// POST /api/transport/assign — full atomic transport assignment with fee schedule
transportRouter.post('/assign', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    // Student is only linked to a VEHICLE — stop_id was dropped in migration
    // 0115 so any incoming stopId is silently ignored. Drivers manage the
    // stops on their assigned vehicle independently of who rides it.
    const body = requireBody<{
      studentId: string; vehicleId: string;
      monthlyAmount: number; startDate: string; academicYearId: string;
      endDate?: string; reason?: string; feeStructureId?: string;
    }>(req, ['studentId', 'vehicleId', 'monthlyAmount', 'startDate', 'academicYearId']);

    await assertStudentInSchool(body.studentId, req.user.school_id!);
    await assertVehicleInSchool(body.vehicleId, req.user.school_id!);

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


// ─── LIVE GPS / TRIP STATE ────────────────────────────────────────────────
//
// Driver client UPDATEs vehicle_live every 15 sec while tracking. We
// rate-limit at the route level (1 ping per 5 sec per driver) so a
// runaway client can't flood the table — the driver UI is hard-capped
// at 15 sec already, this is just defence in depth.

const driverPingLimiter = rateLimit({
  windowMs: 5_000,
  limit: 1,
  // The express-rate-limit validator string-greps for `req.ip` and warns
  // about IPv6 even when our keyGenerator resolves req.user.id first.
  // Suppress the false positive — auth users are the primary identity here.
  keyGenerator: (req: any) => `transport-ping:${req.user?.id ?? req.ip}`,
  validate: { keyGeneratorIpFallback: false },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { ok: false, error: 'Too many pings — driver UI should send 1 every 15s, not faster.' },
});

// Resolve the staff_id (driver) for the calling auth user. Driver
// rows live on staff.user_id; vehicles join on staff.id (driver_id).
async function resolveDriverStaffIdForUser(userId: string, schoolId: string): Promise<string | null> {
  const { data } = await adminDb
    .from('staff').select('id')
    .eq('user_id', userId).eq('school_id', schoolId).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

// POST /api/transport/ping — driver upserts their vehicle's live state.
// Body: { lat, lng, speedKmh?, currentStopIdx?, isTracking, tripStartedAt? }
// Stops the trip if isTracking=false.
transportRouter.post('/ping', requireAuth, requireRole('DRIVER'), driverPingLimiter, async (req, res) => {
  try {
    const body = requireBody<{
      lat: number; lng: number;
      speedKmh?: number;
      currentStopIdx?: number | null;
      isTracking: boolean;
      tripStartedAt?: string | null;
    }>(req, ['lat', 'lng', 'isTracking']);

    if (typeof body.lat !== 'number' || typeof body.lng !== 'number'
        || isNaN(body.lat) || isNaN(body.lng)
        || body.lat < -90 || body.lat > 90
        || body.lng < -180 || body.lng > 180) {
      throw new ApiError(400, 'Invalid coordinates');
    }

    const schoolId = req.user.school_id;
    if (!schoolId) throw new ApiError(403, 'Driver has no school');

    // Resolve which vehicle this driver is assigned to. The driver
    // can only ping for their own vehicle — the join below is the
    // authorisation check.
    const staffId = await resolveDriverStaffIdForUser(req.user.id, schoolId);
    if (!staffId) throw new ApiError(404, 'No staff record for this driver account');

    const { data: vehicle } = await adminDb
      .from('transport_vehicles').select('id')
      .eq('school_id', schoolId)
      .eq('driver_id', staffId)
      .maybeSingle();
    const vehicleId = (vehicle as { id: string } | null)?.id;
    if (!vehicleId) throw new ApiError(404, 'No vehicle assigned to this driver');

    // UPSERT the live row. PK is vehicle_id so a re-ping just updates
    // the existing row — table size never grows beyond N vehicles.
    const now = new Date().toISOString();
    const tripEnded = body.isTracking === false;
    const payload: Record<string, unknown> = {
      vehicle_id:        vehicleId,
      school_id:         schoolId,
      lat:               body.lat,
      lng:               body.lng,
      speed_kmh:         typeof body.speedKmh === 'number' ? body.speedKmh : null,
      last_seen:         now,
      is_tracking:       body.isTracking,
      current_stop_idx:  body.currentStopIdx ?? null,
      trip_started_at:   body.tripStartedAt ?? null,
      trip_ended_at:     tripEnded ? now : null,
      updated_at:        now,
    };

    const { error } = await adminDb.from('vehicle_live')
      .upsert(payload, { onConflict: 'vehicle_id' });
    if (error) throw new ApiError(500, error.message);

    ok(res, { vehicleId, lastSeen: now });
  } catch (err) { fail(res, err); }
});

// POST /api/transport/emergency-alert — driver triggers an emergency.
// Inserts an audit_logs row + a high-priority notice for the principal.
// Rate-limited heavily because false alarms / mis-taps are common.
const emergencyLimiter = rateLimit({
  windowMs: 5 * 60_000, // 5 min
  limit: 3,
  keyGenerator: (req: any) => `emergency:${req.user?.id ?? req.ip}`,
  validate: { keyGeneratorIpFallback: false },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { ok: false, error: 'Emergency alert limit (3/5min) reached. Call school directly if real emergency.' },
});
transportRouter.post('/emergency-alert', requireAuth, requireRole('DRIVER'), emergencyLimiter, async (req, res) => {
  try {
    const body = requireBody<{ lat?: number; lng?: number; note?: string }>(req, []);
    const schoolId = req.user.school_id;
    if (!schoolId) throw new ApiError(403, 'Driver has no school');

    const staffId = await resolveDriverStaffIdForUser(req.user.id, schoolId);
    const { data: vehicle } = await adminDb
      .from('transport_vehicles').select('id, vehicle_no')
      .eq('school_id', schoolId)
      .eq('driver_id', staffId ?? '')
      .maybeSingle();
    const v = vehicle as { id: string; vehicle_no: string } | null;

    await adminDb.from('audit_logs').insert({
      user_id:     req.user.id,
      school_id:   schoolId,
      action:      'driver_emergency_alert',
      entity_type: 'transport_vehicle',
      entity_id:   v?.id ?? null,
      details:     {
        driverName: req.user.name,
        vehicleNo:  v?.vehicle_no ?? null,
        lat:        body.lat ?? null,
        lng:        body.lng ?? null,
        note:       body.note ?? null,
      },
    });

    ok(res, { ok: true, vehicleId: v?.id ?? null });
  } catch (err) { fail(res, err); }
});

// GET /api/transport/live — read all vehicle_live rows for the
// caller's school. Used by the principal's "Live Buses" widget on
// initial paint; subsequent updates come via Realtime subscription.
transportRouter.get('/live', requireAuth, requireRole('PRINCIPAL', 'TEACHER', 'DRIVER'), async (req, res) => {
  try {
    const schoolId = req.user.school_id;
    if (!schoolId) { ok(res, []); return; }

    // 30-min staleness cutoff — anything older is reported as offline
    // even if its row says is_tracking=true (driver phone died, etc).
    const STALE_MIN = 30;
    const cutoff = new Date(Date.now() - STALE_MIN * 60_000).toISOString();

    const { data, error } = await adminDb
      .from('vehicle_live')
      .select('vehicle_id, lat, lng, speed_kmh, last_seen, is_tracking, current_stop_idx, trip_started_at')
      .eq('school_id', schoolId);
    if (error) throw new ApiError(500, error.message);

    // Server-side normalisation so the client doesn't have to redo
    // staleness logic in 3 places.
    type Row = {
      vehicle_id: string; lat: number | null; lng: number | null;
      speed_kmh: number | null; last_seen: string;
      is_tracking: boolean; current_stop_idx: number | null;
      trip_started_at: string | null;
    };
    const rows = ((data ?? []) as Row[]).map(r => ({
      vehicleId:      r.vehicle_id,
      lat:            r.lat,
      lng:            r.lng,
      speedKmh:       r.speed_kmh,
      lastSeen:       r.last_seen,
      isLive:         r.is_tracking && r.last_seen >= cutoff,
      isTracking:     r.is_tracking,
      currentStopIdx: r.current_stop_idx,
      tripStartedAt:  r.trip_started_at,
    }));
    ok(res, rows);
  } catch (err) { fail(res, err); }
});
