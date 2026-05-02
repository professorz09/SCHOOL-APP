import { Router } from 'express';
import { adminDb } from '../lib/db';
import { ok, fail, ApiError, requireBody } from '../lib/helpers';
import { requireAuth, requireRole } from '../middleware/auth';

export const adminSchoolsRouter = Router();

const SA = requireRole('SUPER_ADMIN');

// ─── PUT /api/admin/schools/:id/billing ──────────────────────────────────────
// Set / update the fixed monthly billing amount for a school.
adminSchoolsRouter.put('/:id/billing', requireAuth, SA, async (req, res) => {
  try {
    const schoolId = req.params.id;
    const body = requireBody<{ fixedAmount: number }>(req, ['fixedAmount']);

    const amount = Math.round(Number(body.fixedAmount));
    if (!Number.isFinite(amount) || amount < 0) {
      throw new ApiError(400, 'fixedAmount must be a non-negative number');
    }

    // Verify school exists first
    const { data: school, error: se } = await adminDb
      .from('schools')
      .select('id')
      .eq('id', schoolId)
      .single();
    if (se || !school) throw new ApiError(404, 'School not found');

    const { error } = await adminDb
      .from('schools')
      .update({ billing_fixed_amount: amount, updated_at: new Date().toISOString() })
      .eq('id', schoolId);
    if (error) throw new ApiError(500, error.message);

    ok(res, { schoolId, fixedAmount: amount });
  } catch (err) { fail(res, err); }
});

// ─── POST /api/admin/schools/:id/payments ────────────────────────────────────
// Record a payment for a school.
adminSchoolsRouter.post('/:id/payments', requireAuth, SA, async (req, res) => {
  try {
    const schoolId = req.params.id;
    const body = requireBody<{ amount: number; paidOn: string }>(req, ['amount', 'paidOn']);

    const amount = Math.round(Number(body.amount));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new ApiError(400, 'amount must be a positive number');
    }
    if (!body.paidOn) throw new ApiError(400, 'paidOn date is required');

    // Verify school exists before inserting payment
    const { data: schoolCheck, error: sce } = await adminDb
      .from('schools')
      .select('id')
      .eq('id', schoolId)
      .single();
    if (sce || !schoolCheck) throw new ApiError(404, 'School not found');

    const { data, error } = await adminDb
      .from('school_fee_payments')
      .insert({
        school_id:  schoolId,
        amount,
        paid_on:    body.paidOn,
        note:       (req.body.note as string | undefined) ?? null,
        created_by: req.user.id,
      })
      .select('id, school_id, amount, paid_on, note, created_by, created_at')
      .single();
    if (error) {
      // FK violation or check constraint → 400, anything else → 500
      const is4xx = error.code === '23503' || error.code === '23514';
      throw new ApiError(is4xx ? 400 : 500, error.message);
    }

    ok(res, data, 201);
  } catch (err) { fail(res, err); }
});

// ─── GET /api/admin/schools/:id/payments ─────────────────────────────────────
// List all payments for a school, newest first.
adminSchoolsRouter.get('/:id/payments', requireAuth, SA, async (req, res) => {
  try {
    const schoolId = req.params.id;

    const { data: school, error: se } = await adminDb
      .from('schools')
      .select('id, billing_fixed_amount, created_at')
      .eq('id', schoolId)
      .single();
    if (se || !school) throw new ApiError(404, 'School not found');

    const { data: payments, error: pe } = await adminDb
      .from('school_fee_payments')
      .select('id, school_id, amount, paid_on, note, created_by, created_at')
      .eq('school_id', schoolId)
      .order('paid_on', { ascending: false });
    if (pe) throw new ApiError(500, pe.message);

    // Calculate outstanding balance
    const fixedAmount: number = Number(school.billing_fixed_amount ?? 0);
    const schoolCreatedAt = new Date(school.created_at);
    const now = new Date();
    const monthsElapsed = Math.max(
      0,
      (now.getFullYear() - schoolCreatedAt.getFullYear()) * 12 +
      (now.getMonth() - schoolCreatedAt.getMonth()) + 1,
    );
    const totalExpected  = fixedAmount * monthsElapsed;
    const totalPaid      = (payments ?? []).reduce((s, p) => s + Number(p.amount), 0);
    const outstanding    = Math.max(0, totalExpected - totalPaid);

    ok(res, {
      fixedAmount,
      monthsElapsed,
      totalExpected,
      totalPaid,
      outstanding,
      payments: payments ?? [],
    });
  } catch (err) { fail(res, err); }
});
