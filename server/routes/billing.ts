import { Router, Response } from 'express';
import pool from '../db/pool';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router({ mergeParams: true });
router.use(authenticate);
router.use(requireRole('SUPER_ADMIN'));

const PLAN_PRICES: Record<string, number> = { BASIC: 36000, STANDARD: 72000, PREMIUM: 120000 };

// GET /api/billing
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT sbs.*, s.name as school_name,
        (SELECT json_agg(json_build_object(
          'id', sby.id, 'yearLabel', sby.year_label, 'startDate', sby.start_date, 'endDate', sby.end_date,
          'annualAmount', sby.annual_amount, 'carriedForward', sby.carried_forward,
          'totalDue', sby.total_due, 'totalPaid', sby.total_paid, 'outstanding', sby.outstanding
        ) ORDER BY sby.start_date DESC)
        FROM school_billing_years sby WHERE sby.school_id = sbs.school_id) as billing_years
      FROM school_billing_schedules sbs
      JOIN schools s ON s.id = sbs.school_id
      WHERE s.is_deleted = FALSE
    `);
    return res.json(result.rows);
  } catch (err: unknown) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/billing/:schoolId
router.get('/:schoolId', async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  try {
    const billing = await pool.query(`SELECT * FROM school_billing_schedules WHERE school_id = $1`, [schoolId]);
    const years = await pool.query(`SELECT * FROM school_billing_years WHERE school_id = $1 ORDER BY start_date DESC`, [schoolId]);
    const payments = await pool.query(`SELECT * FROM school_payments WHERE school_id = $1 ORDER BY paid_at DESC`, [schoolId]);
    return res.json({
      billing: billing.rows[0] || null,
      billingYears: years.rows,
      payments: payments.rows,
    });
  } catch (err: unknown) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/billing/:schoolId/pay
router.post('/:schoolId/pay', async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  const { yearId, amount, txnId, method, notes } = req.body;
  if (!yearId || !amount) return res.status(400).json({ error: 'yearId and amount required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const payment = await client.query(`
      INSERT INTO school_payments (school_id, billing_year_id, amount, txn_id, method, notes)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
    `, [schoolId, yearId, amount, txnId, method, notes]);

    const updated = await client.query(`
      UPDATE school_billing_years SET
        total_paid = total_paid + $1,
        outstanding = GREATEST(0, outstanding - $1)
      WHERE id = $2 RETURNING *
    `, [amount, yearId]);

    await client.query('COMMIT');
    return res.status(201).json({ payment: payment.rows[0], billingYear: updated.rows[0] });
  } catch (err: unknown) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// POST /api/billing/:schoolId/new-year
router.post('/:schoolId/new-year', async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  const { carriedForward } = req.body;

  try {
    const billing = await pool.query(`SELECT * FROM school_billing_schedules WHERE school_id = $1`, [schoolId]);
    if (!billing.rows[0]) return res.status(404).json({ error: 'Billing setup not found' });

    const existingYears = await pool.query(`
      SELECT * FROM school_billing_years WHERE school_id = $1 ORDER BY start_date DESC LIMIT 1
    `, [schoolId]);

    let newStart: string;
    if (existingYears.rows[0]) {
      const lastEnd = new Date(existingYears.rows[0].end_date);
      lastEnd.setDate(lastEnd.getDate() + 1);
      newStart = lastEnd.toISOString().split('T')[0];
    } else {
      newStart = billing.rows[0].billing_start_date;
    }

    const endD = new Date(newStart);
    endD.setFullYear(endD.getFullYear() + 1);
    endD.setDate(endD.getDate() - 1);
    const newEnd = endD.toISOString().split('T')[0];
    const startYear = new Date(newStart).getFullYear();
    const yearLabel = `${startYear}-${String(startYear + 1).slice(-2)}`;
    const cf = parseInt(carriedForward) || 0;
    const totalDue = billing.rows[0].annual_amount + cf;

    const result = await pool.query(`
      INSERT INTO school_billing_years (school_id, year_label, start_date, end_date, annual_amount, carried_forward, total_due, total_paid, outstanding)
      VALUES ($1,$2,$3,$4,$5,$6,$7,0,$7) RETURNING *
    `, [schoolId, yearLabel, newStart, newEnd, billing.rows[0].annual_amount, cf, totalDue]);

    return res.status(201).json(result.rows[0]);
  } catch (err: unknown) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/billing/:schoolId/plan
router.put('/:schoolId/plan', async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  const { plan, customAmount } = req.body;
  const annualAmount = customAmount || PLAN_PRICES[plan] || 36000;
  try {
    await pool.query(`
      UPDATE school_billing_schedules SET plan = $2, annual_amount = $3, updated_at = NOW() WHERE school_id = $1
    `, [schoolId, plan, annualAmount]);
    await pool.query(`UPDATE schools SET plan = $2, updated_at = NOW() WHERE id = $1`, [schoolId, plan]);
    return res.json({ message: 'Plan updated' });
  } catch (err: unknown) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
