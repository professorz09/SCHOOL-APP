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

feesRouter.post('/payment/reverse', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const body = requireBody<{ paymentId: string; reason: string; editorMode: boolean }>(
      req, ['paymentId', 'reason', 'editorMode'],
    );

    if (!body.editorMode) {
      throw new ApiError(403, 'Editor Mode must be ON to reverse a payment');
    }
    const reason = body.reason.trim();
    if (reason.length < 3) {
      throw new ApiError(400, 'Reason is required (min 3 characters)');
    }

    // Load original payment with its links — single round trip.
    const { data: origData } = await adminDb
      .from('payment_records')
      .select('id, school_id, student_id, amount, method, date, receipt_no, advance_amount, note, created_at, reversed_at, reverses_payment_id, payment_installment_links(installment_id, amount_applied)')
      .eq('id', body.paymentId).maybeSingle();
    const orig = origData as {
      id: string; school_id: string; student_id: string; amount: number;
      method: string; date: string; receipt_no: string; advance_amount: number;
      note: string | null; created_at: string;
      reversed_at: string | null; reverses_payment_id: string | null;
      payment_installment_links: Array<{ installment_id: string; amount_applied: number }>;
    } | null;

    if (!orig) throw new ApiError(404, 'Payment not found');
    if (orig.school_id !== req.user.school_id) throw new ApiError(403, 'Cross-school access denied');
    if (orig.reversed_at) throw new ApiError(409, 'This payment has already been reversed');
    if (orig.reverses_payment_id) throw new ApiError(409, 'This row IS a reversal — cannot reverse a reversal');
    if (Number(orig.amount) <= 0) throw new ApiError(400, 'Cannot reverse a non-positive payment');

    // Same calendar day (IST).
    if (istDate(orig.created_at) !== istDate()) {
      throw new ApiError(403, 'Same-day only: payment can be reversed on the day it was recorded (IST)');
    }

    // Daily cap — 3 reversals per principal per IST day. Count via audit_logs.
    const startOfTodayIST = `${istDate()}T00:00:00+05:30`;
    const { count: reversalsToday } = await adminDb
      .from('audit_logs').select('id', { count: 'exact', head: true })
      .eq('user_id', req.user.id)
      .eq('action', 'fee_payment_reversed')
      .gte('created_at', startOfTodayIST);
    if ((reversalsToday ?? 0) >= 3) {
      throw new ApiError(429, 'Daily limit reached: max 3 reversals per principal per day');
    }

    // ─── Atomic rollback ────────────────────────────────────────────────
    //  (a) insert reversal row with negative amount
    //  (b) per-link: subtract amount_applied from each installment.paid_amount
    //  (c) link the reversal row to the same installments (negative amounts)
    //  (d) stamp reversed_at on the original
    // We don't have a single transaction primitive across these supabase-js
    // calls, so we enforce the constraint AT_MOST_ONCE via the reversed_at
    // check above + the unique reverses_payment_id (no two reversal rows
    // can point to the same original because the next attempt's load will
    // see reversed_at and reject).
    const reversalAmount = -Math.abs(Number(orig.amount));
    const reversalDate = istDate();

    const { data: revRow, error: revErr } = await adminDb
      .from('payment_records').insert({
        school_id:           orig.school_id,
        student_id:          orig.student_id,
        amount:              reversalAmount,
        method:              orig.method,
        date:                reversalDate,
        receipt_no:          `REV-${orig.receipt_no}`,
        advance_amount:      -Math.abs(Number(orig.advance_amount ?? 0)),
        note:                `Reversal of ${orig.receipt_no}: ${reason}`,
        reverses_payment_id: orig.id,
        reversed_by:         req.user.id,
        reversal_reason:     reason,
      })
      .select('id').single();
    if (revErr || !revRow) throw new ApiError(500, `Reversal insert failed: ${revErr?.message}`);
    const reversalId = (revRow as { id: string }).id;

    // Roll back installment paid_amount and re-link with negative amounts.
    for (const link of orig.payment_installment_links) {
      const applied = Number(link.amount_applied);
      // Read current installment row to avoid drift.
      const { data: instRow } = await adminDb
        .from('fee_installments')
        .select('id, amount, paid_amount, write_off_amount')
        .eq('id', link.installment_id).single();
      const inst = instRow as { id: string; amount: number; paid_amount: number; write_off_amount: number } | null;
      if (!inst) continue;
      const newPaid = Math.max(0, Number(inst.paid_amount) - applied);
      const totalAmount = Number(inst.amount);
      const writeOff   = Number(inst.write_off_amount);
      // Status is computed-on-read on the client, but DB still has a status
      // column some legacy paths use — keep it sensible.
      const newStatus =
        newPaid >= totalAmount - writeOff ? 'PAID' :
        newPaid > 0                       ? 'PARTIAL' :
                                            'UNPAID';
      await adminDb.from('fee_installments').update({
        paid_amount: newPaid,
        status:      newStatus,
        updated_at:  new Date().toISOString(),
      }).eq('id', inst.id);

      await adminDb.from('payment_installment_links').insert({
        payment_id:     reversalId,
        installment_id: inst.id,
        amount_applied: -applied,
      });
    }

    // Refund any advance credit the original generated.
    if (Number(orig.advance_amount ?? 0) > 0) {
      const { data: advRow } = await adminDb
        .from('advance_balances').select('amount')
        .eq('student_id', orig.student_id).maybeSingle();
      const cur = (advRow as { amount: number } | null)?.amount ?? 0;
      const next = Math.max(0, Number(cur) - Number(orig.advance_amount));
      await adminDb.from('advance_balances').upsert({
        student_id: orig.student_id, amount: next,
      }, { onConflict: 'student_id' });
    }

    // Stamp the original with reversal metadata so the next attempt rejects.
    await adminDb.from('payment_records').update({
      reversed_at:     new Date().toISOString(),
      reversed_by:     req.user.id,
      reversal_reason: reason,
    }).eq('id', orig.id);

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
        receipt_no: orig.receipt_no,
        amount:     orig.amount,
        student_id: orig.student_id,
        reason,
        reversal_id: reversalId,
      },
    });

    ok(res, { reversalId, originalId: orig.id });
  } catch (err) { fail(res, err); }
});
