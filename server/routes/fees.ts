import { Router } from 'express';
import { adminDb, userDb } from '../lib/db';
import { ok, fail, ApiError, requireBody } from '../lib/helpers';
import { requireAuth, requireRole } from '../middleware/auth';

export const feesRouter = Router();

// GET /api/fees/structures?yearId=
feesRouter.get('/structures', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const { yearId } = req.query as Record<string, string>;
    let q = adminDb
      .from('fee_structures')
      .select('*')
      .eq('school_id', req.user.school_id!);
    if (yearId) q = q.eq('academic_year_id', yearId);
    const { data, error } = await q.order('class_name');
    if (error) throw new ApiError(500, error.message);
    ok(res, data);
  } catch (err) { fail(res, err); }
});

// GET /api/fees/student/:studentId?yearId=
feesRouter.get('/student/:studentId', requireAuth, requireRole('PRINCIPAL', 'TEACHER', 'PARENT', 'STUDENT'), async (req, res) => {
  try {
    const { yearId } = req.query as Record<string, string>;

    let q = adminDb
      .from('fee_installments')
      .select('*')
      .eq('student_id', req.params.studentId)
      .order('due_date');
    if (yearId) q = q.eq('academic_year_id', yearId);
    const { data: installments, error: ie } = await q;
    if (ie) throw new ApiError(500, ie.message);

    const { data: payments } = await adminDb
      .from('payment_records')
      .select('*, payment_installment_links(installment_id, amount_applied)')
      .eq('student_id', req.params.studentId)
      .order('date', { ascending: false });

    ok(res, { installments, payments });
  } catch (err) { fail(res, err); }
});

// POST /api/fees/structure/create
feesRouter.post('/structure/create', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const body = requireBody<{
      name: string; className: string; academicYearId: string;
      feeHeads: { name: string; amount: number; frequency: string; description?: string }[];
      monthlyDueDates: { month: string; date: string }[];
      lateFee?: Record<string, unknown>;
    }>(req, ['name', 'className', 'academicYearId', 'feeHeads', 'monthlyDueDates']);

    if (!Array.isArray(body.feeHeads) || body.feeHeads.length === 0) {
      throw new ApiError(400, 'feeHeads array required');
    }

    const { data, error } = await adminDb
      .from('fee_structures')
      .insert({
        school_id:        req.user.school_id,
        academic_year_id: body.academicYearId,
        name:             body.name,
        class_name:       body.className,
        fee_heads:        body.feeHeads,
        monthly_due_dates: body.monthlyDueDates,
        late_fee:         body.lateFee ?? {},
      })
      .select()
      .single();
    if (error) throw new ApiError(500, error.message);

    ok(res, data, 201);
  } catch (err) { fail(res, err); }
});

// POST /api/fees/schedule/generate — generate fee installments for a student
feesRouter.post('/schedule/generate', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const body = requireBody<{
      studentId: string; yearId: string;
      heads: { name: string; amount: number; frequency: string; description?: string }[];
      dueDates: { month: string; date: string }[];
      isRte?: boolean; discountAmount?: number; discountPct?: number;
    }>(req, ['studentId', 'yearId', 'heads', 'dueDates']);

    // Use user JWT so auth.uid() is set for the SECURITY DEFINER RPC
    const db = userDb(req.jwt);
    const { data, error } = await db.rpc('generate_student_fee_schedule', {
      p_student_id:      body.studentId,
      p_year_id:         body.yearId,
      p_heads:           body.heads,
      p_due_dates:       body.dueDates,
      p_is_rte:          body.isRte ?? false,
      p_discount_amount: body.discountAmount ?? 0,
      p_discount_pct:    body.discountPct ?? 0,
    });
    if (error) throw new ApiError(500, error.message);

    ok(res, { installmentCount: data });
  } catch (err) { fail(res, err); }
});

// POST /api/fees/pay — oldest-due-first via record_fee_payment RPC
feesRouter.post('/pay', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const body = requireBody<{
      studentId: string; amount: number; method: string;
      date?: string; note?: string; useAdvance?: boolean; applyLateFee?: boolean;
    }>(req, ['studentId', 'amount', 'method']);

    if (body.amount <= 0) throw new ApiError(400, 'Amount must be positive');

    // RPC requires auth.uid() — use user JWT
    const db = userDb(req.jwt);
    const { data: paymentId, error } = await db.rpc('record_fee_payment', {
      p_student_id:    body.studentId,
      p_amount:        Math.round(body.amount),
      p_method:        body.method,
      p_date:          body.date ?? new Date().toISOString().split('T')[0],
      p_note:          body.note ?? null,
      p_use_advance:   body.useAdvance ?? false,
      p_apply_late_fee: body.applyLateFee ?? true,
    });
    if (error) throw new ApiError(500, error.message);

    // Return the new payment record
    const { data: payment } = await adminDb
      .from('payment_records')
      .select('*, payment_installment_links(installment_id, amount_applied)')
      .eq('id', paymentId)
      .single();

    ok(res, { paymentId, payment });
  } catch (err) { fail(res, err); }
});

// POST /api/fees/govt-pay — bulk RTE / government payment
feesRouter.post('/govt-pay', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const body = requireBody<{
      studentIds: string[]; totalAmount: number; referenceNo: string; note: string;
    }>(req, ['studentIds', 'totalAmount', 'referenceNo', 'note']);

    if (!Array.isArray(body.studentIds) || body.studentIds.length === 0)
      throw new ApiError(400, 'studentIds array required');
    if (body.totalAmount <= 0) throw new ApiError(400, 'Amount must be positive');

    const db = userDb(req.jwt);
    const { error } = await db.rpc('record_govt_payment', {
      p_amount:      Math.round(body.totalAmount),
      p_date:        new Date().toISOString().split('T')[0],
      p_reference:   body.referenceNo,
      p_note:        body.note,
      p_student_ids: body.studentIds,
    });
    if (error) throw new ApiError(500, error.message);

    ok(res, { success: true, studentCount: body.studentIds.length });
  } catch (err) { fail(res, err); }
});

// POST /api/fees/writeoff
feesRouter.post('/writeoff', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const body = requireBody<{
      installmentId: string; amount: number; reason: string;
    }>(req, ['installmentId', 'amount', 'reason']);

    const { data: inst } = await adminDb
      .from('fee_installments')
      .select('id, student_id, amount, paid_amount, write_off_amount, school_id')
      .eq('id', body.installmentId)
      .single();
    if (!inst) throw new ApiError(404, 'Installment not found');
    if ((inst as any).school_id !== req.user.school_id) throw new ApiError(403, 'Access denied');

    const r = inst as any;
    const maxWriteOff = Math.max(0, Number(r.amount) - Number(r.paid_amount) - Number(r.write_off_amount));
    const writeOff = Math.min(body.amount, maxWriteOff);
    if (writeOff <= 0) throw new ApiError(400, 'Nothing left to write off on this installment');

    const newWriteOff = Number(r.write_off_amount) + writeOff;
    const paidAmount  = Number(r.paid_amount);
    const totalAmount = Number(r.amount);
    const newStatus: string =
      paidAmount >= totalAmount - newWriteOff  ? 'PAID'    :
      paidAmount + newWriteOff >= totalAmount  ? 'WAIVED'  :
      paidAmount > 0                           ? 'PARTIAL' : 'UNPAID';

    await adminDb.from('fee_installments').update({
      write_off_amount: newWriteOff,
      write_off_reason: body.reason,
      status:           newStatus,
      updated_at:       new Date().toISOString(),
    }).eq('id', body.installmentId);

    await adminDb.from('fee_write_offs').insert({
      installment_id: body.installmentId,
      student_id:     r.student_id,
      school_id:      req.user.school_id,
      amount:         writeOff,
      reason:         body.reason,
      approved_by:    req.user.id,
    });

    ok(res, { installmentId: body.installmentId, writeOffAmount: newWriteOff, status: newStatus });
  } catch (err) { fail(res, err); }
});
