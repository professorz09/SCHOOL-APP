import { Router } from 'express';
import { adminDb, userDb } from '../lib/db';
import { ok, fail, ApiError, requireBody } from '../lib/helpers';
import { requireAuth, requireRole } from '../middleware/auth';

export const staffRouter = Router();

// POST /api/staff/deactivate
staffRouter.post('/deactivate', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const { staffId } = requireBody<{ staffId: string }>(req, ['staffId']);
    const { error } = await adminDb.from('staff').update({
      is_active: false,
      status: 'SUSPENDED',
      updated_at: new Date().toISOString(),
    }).eq('id', staffId).eq('school_id', req.user.school_id!);
    if (error) throw new ApiError(500, error.message);
    ok(res, { staffId });
  } catch (err) { fail(res, err); }
});

// POST /api/staff/salary/pay — record_salary_payment RPC (auth.uid() required)
staffRouter.post('/salary/pay', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const body = requireBody<{
      staffId: string; month: string; amount: number;
      note?: string; method?: string; transactionId?: string;
    }>(req, ['staffId', 'month', 'amount']);

    if (!Number.isFinite(body.amount) || body.amount <= 0)
      throw new ApiError(400, 'Amount must be positive');

    const db = userDb(req.jwt);
    const { error } = await db.rpc('record_salary_payment', {
      p_staff_id: body.staffId,
      p_month:    body.month,
      p_amount:   Math.round(body.amount),
      p_note:     body.note ?? null,
      p_method:   body.method ?? null,
      p_txn_id:   body.transactionId ?? null,
    });
    if (error) throw new ApiError(500, error.message);

    ok(res, { staffId: body.staffId, month: body.month, amount: body.amount });
  } catch (err) { fail(res, err); }
});

// POST /api/staff/salary/update — update_staff_salary RPC (auth.uid() required)
staffRouter.post('/salary/update', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const body = requireBody<{
      staffId: string; newAmount: number; effectiveFrom: string; reason: string;
    }>(req, ['staffId', 'newAmount', 'effectiveFrom', 'reason']);

    if (!Number.isFinite(body.newAmount) || body.newAmount < 0)
      throw new ApiError(400, 'Salary must be non-negative');

    const db = userDb(req.jwt);
    const { error } = await db.rpc('update_staff_salary', {
      p_staff_id:       body.staffId,
      p_new_amount:     Math.round(body.newAmount),
      p_effective_from: body.effectiveFrom,
      p_reason:         body.reason || null,
    });
    if (error) throw new ApiError(500, error.message);

    ok(res, { staffId: body.staffId, newAmount: body.newAmount });
  } catch (err) { fail(res, err); }
});

// POST /api/staff/relieve — set_staff_relieving_date RPC (auth.uid() required)
staffRouter.post('/relieve', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const body = requireBody<{
      staffId: string; date: string; reason: string;
    }>(req, ['staffId', 'date', 'reason']);
    if (!body.date) throw new ApiError(400, 'Relieving date required');

    const db = userDb(req.jwt);
    const { error } = await db.rpc('set_staff_relieving_date', {
      p_staff_id: body.staffId,
      p_date:     body.date,
      p_reason:   body.reason || null,
    });
    if (error) throw new ApiError(500, error.message);

    ok(res, { staffId: body.staffId, date: body.date });
  } catch (err) { fail(res, err); }
});
