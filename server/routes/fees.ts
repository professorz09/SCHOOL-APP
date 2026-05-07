import { Router } from 'express';
import { adminDb, userDb } from '../lib/db';
import { ok, fail, ApiError, requireBody } from '../lib/helpers';
import { requireAuth, requireRole, requireEditorMode } from '../middleware/auth';

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
      date?: string; note?: string; useAdvance?: boolean; applyLateFee?: boolean; discountAmount?: number;
    }>(req, ['studentId', 'amount', 'method']);

    if (body.amount <= 0) throw new ApiError(400, 'Amount must be positive');

    const discount = Math.max(0, Math.round(body.discountAmount ?? 0));
    const discountNote = discount > 0 ? ` (with ₹${discount} discount)` : '';

    // RPC requires auth.uid() — use user JWT
    const db = userDb(req.jwt);
    const { data: paymentId, error } = await db.rpc('record_fee_payment', {
      p_student_id:      body.studentId,
      p_amount:          Math.round(body.amount),
      p_method:          body.method,
      p_date:            body.date ?? new Date().toISOString().split('T')[0],
      p_note:            (body.note ?? '') + discountNote || null,
      p_use_advance:     body.useAdvance ?? false,
      p_apply_late_fee:  body.applyLateFee ?? true,
      p_discount_amount: discount,
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

// POST /api/fees/pay-installment — strict per-row payment via pay_installment RPC.
// Cash + optional discount apply only to the supplied installment_id; overpay
// is hard-rejected by the RPC (no advance dump).
feesRouter.post('/pay-installment', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const body = requireBody<{
      installmentId: string; amount: number;
      discount?: number; method?: string; date?: string; note?: string;
      useAdvance?: boolean;
    }>(req, ['installmentId', 'amount']);

    const amount   = Math.max(0, Math.round(body.amount));
    const discount = Math.max(0, Math.round(body.discount ?? 0));
    if (amount === 0 && discount === 0 && !body.useAdvance) {
      throw new ApiError(400, 'Amount, discount and advance cannot all be zero');
    }

    const db = userDb(req.jwt);
    const { data: paymentId, error } = await db.rpc('pay_installment', {
      p_installment_id: body.installmentId,
      p_amount:         amount,
      p_discount:       discount,
      p_method:         body.method ?? 'CASH',
      p_date:           body.date ?? new Date().toISOString().split('T')[0],
      p_note:           body.note ?? null,
      p_use_advance:    body.useAdvance ?? false,
    });
    if (error) throw new ApiError(400, error.message);

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
    // Status precedence (was buggy — first two branches were equivalent so
    // WAIVED was unreachable):
    //   PAID    — cleared by cash alone (no write-off needed for closure)
    //   WAIVED  — cash + write-off together close the row
    //   PARTIAL — some cash paid but row not cleared
    //   UNPAID  — nothing paid yet
    const newStatus: string =
      paidAmount >= totalAmount                 ? 'PAID'    :
      paidAmount + newWriteOff >= totalAmount   ? 'WAIVED'  :
      paidAmount > 0                            ? 'PARTIAL' : 'UNPAID';

    // Insert audit row FIRST so a failure here doesn't leave a mutated
    // installment with no write-off log. If insert succeeds and the
    // subsequent update fails, the audit row is harmlessly orphan.
    const { error: woErr } = await adminDb.from('fee_write_offs').insert({
      installment_id: body.installmentId,
      student_id:     r.student_id,
      school_id:      req.user.school_id,
      amount:         writeOff,
      reason:         body.reason,
      approved_by:    req.user.id,
    });
    if (woErr) throw new ApiError(500, `write-off log failed: ${woErr.message}`);

    const { error: updErr } = await adminDb.from('fee_installments').update({
      write_off_amount: newWriteOff,
      write_off_reason: body.reason,
      status:           newStatus,
      updated_at:       new Date().toISOString(),
    }).eq('id', body.installmentId);
    if (updErr) throw new ApiError(500, updErr.message);

    ok(res, { installmentId: body.installmentId, writeOffAmount: newWriteOff, status: newStatus });
  } catch (err) { fail(res, err); }
});

// ─── Payment Reversal ─────────────────────────────────────────────────────
//
// POST /api/fees/payment/reverse — controlled "undo" for a wrongly-entered
// payment. Creates a NEW payment_records row with negative amount, links
// back to the original via reverses_payment_id, rolls back paid_amount on
// every linked installment, and stamps reversed_at on the original.
//
// Server-enforced guards (UI mirrors them but never trusts the UI):
//   1. PRINCIPAL only
//   2. editorMode=true must be passed (matches Editor Mode store on client)
//   3. Same calendar day in IST — accountant-friendly than 24h sliding
//   4. Original not already reversed
//   5. Original not itself a reversal (no double-undo chain)
//   6. Reason required (≥ 3 chars after trim)
//   7. Daily cap: 3 reversals per principal per IST day
const istDate = (d?: string | Date) =>
  new Date(d ?? Date.now()).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

feesRouter.post('/payment/reverse', requireAuth, requireRole('PRINCIPAL'), requireEditorMode, async (req, res) => {
  try {
    const body = requireBody<{ paymentId: string; reason: string }>(
      req, ['paymentId', 'reason'],
    );

    const reason = body.reason.trim();
    if (reason.length < 3) {
      throw new ApiError(400, 'Reason is required (min 3 characters)');
    }

    // Pre-flight: validate ownership + same-day window + daily cap. The
    // ironclad write happens inside reverse_payment() RPC (one transaction,
    // idempotent guard via stamped reversed_at).
    const { data: origData } = await adminDb
      .from('payment_records')
      .select('id, school_id, amount, created_at, reversed_at, reverses_payment_id')
      .eq('id', body.paymentId).maybeSingle();
    const orig = origData as {
      id: string; school_id: string; amount: number;
      created_at: string; reversed_at: string | null; reverses_payment_id: string | null;
    } | null;

    if (!orig) throw new ApiError(404, 'Payment not found');
    if (orig.school_id !== req.user.school_id) throw new ApiError(403, 'Cross-school access denied');
    if (orig.reversed_at) throw new ApiError(409, 'This payment has already been reversed');
    if (orig.reverses_payment_id) throw new ApiError(409, 'This row IS a reversal — cannot reverse a reversal');
    if (Number(orig.amount) <= 0) throw new ApiError(400, 'Cannot reverse a non-positive payment');

    if (istDate(orig.created_at) !== istDate()) {
      throw new ApiError(403, 'Same-day only: payment can be reversed on the day it was recorded (IST)');
    }

    const startOfTodayIST = `${istDate()}T00:00:00+05:30`;
    const { count: reversalsToday } = await adminDb
      .from('audit_logs').select('id', { count: 'exact', head: true })
      .eq('user_id', req.user.id)
      .eq('action', 'fee_payment_reversed')
      .gte('created_at', startOfTodayIST);
    if ((reversalsToday ?? 0) >= 3) {
      throw new ApiError(429, 'Daily limit reached: max 3 reversals per principal per day');
    }

    // Atomic write — RPC stamps reversed_at FIRST as the idempotent guard,
    // then mutates installments / links / advance_balances inside the same
    // transaction.
    const { data: rpcData, error: rpcErr } = await adminDb.rpc('reverse_payment', {
      p_payment_id: orig.id,
      p_user_id:    req.user.id,
      p_reason:     reason,
    });
    if (rpcErr) {
      // Map known error codes back to friendly HTTP statuses.
      if (rpcErr.message.includes('already_reversed')) throw new ApiError(409, 'This payment has already been reversed');
      if (rpcErr.message.includes('cannot_reverse_a_reversal')) throw new ApiError(409, 'This row IS a reversal — cannot reverse a reversal');
      if (rpcErr.message.includes('non_positive_amount')) throw new ApiError(400, 'Cannot reverse a non-positive payment');
      if (rpcErr.message.includes('payment_not_found')) throw new ApiError(404, 'Payment not found');
      throw new ApiError(500, `Reversal failed: ${rpcErr.message}`);
    }
    const reversalRow = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as
      { reversal_id: string; original_id: string } | null;
    if (!reversalRow) throw new ApiError(500, 'Reversal returned no rows');
    const reversalId = reversalRow.reversal_id;

    // Audit
    const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0].trim()
      ?? req.socket.remoteAddress
      ?? null;
    await adminDb.from('audit_logs').insert({
      user_id:     req.user.id,
      school_id:   req.user.school_id,
      action:      'fee_payment_reversed',
      entity_type: 'payment_record',
      entity_id:   orig.id,
      ip_address:  ip,
      details: {
        amount:      orig.amount,
        reason,
        reversal_id: reversalId,
      },
    });

    ok(res, { reversalId, originalId: orig.id });
  } catch (err) { fail(res, err); }
});
