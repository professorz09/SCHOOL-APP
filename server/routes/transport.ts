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

// GET /api/transport/student/:studentId
transportRouter.get('/student/:studentId', requireAuth, requireRole('PRINCIPAL', 'DRIVER', 'PARENT'), async (req, res) => {
  try {
    const { data, error } = await adminDb
      .from('student_transport_assignments')
      .select('*, transport_vehicles(id, vehicle_no, route_name), route_stops(id, name, estimated_time)')
      .eq('student_id', req.params.studentId)
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

// POST /api/transport/assign — full atomic transport assignment with fee schedule
transportRouter.post('/assign', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const body = requireBody<{
      studentId: string; vehicleId: string; stopId: string;
      monthlyAmount: number; startDate: string; academicYearId: string;
      endDate?: string; reason?: string; feeStructureId?: string;
    }>(req, ['studentId', 'vehicleId', 'stopId', 'monthlyAmount', 'startDate', 'academicYearId']);

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
        stop_id:          body.stopId,
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
