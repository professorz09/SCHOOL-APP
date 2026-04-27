import { Router, Response } from 'express';
import pool from '../db/pool';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router({ mergeParams: true });
router.use(authenticate);

// GET /api/schools/:schoolId/fees/installments
router.get('/installments', async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  const { studentId, academicYearId, status, payerType } = req.query;
  const role = req.user?.role;

  // STUDENT/PARENT can only see their own fees
  let scopedStudentId: string | number | null = studentId as string || null;
  if (role === 'STUDENT') {
    // Find the student record linked to this user
    const sr = await pool.query(`SELECT id FROM students WHERE user_id = $1 AND school_id = $2`, [req.user!.userId, schoolId]);
    if (!sr.rows[0]) return res.json([]);
    scopedStudentId = sr.rows[0].id;
  } else if (role === 'PARENT') {
    // Only allow querying their linked student's fees
    if (!studentId) {
      const links = await pool.query(`SELECT student_id FROM parent_student_links WHERE parent_user_id = $1`, [req.user!.userId]);
      if (links.rows.length === 0) return res.json([]);
      // Return fees for first linked student (caller should specify studentId for multiple)
      scopedStudentId = links.rows[0].student_id;
    } else {
      // Verify parent is linked to requested student
      const link = await pool.query(`SELECT 1 FROM parent_student_links WHERE parent_user_id = $1 AND student_id = $2`, [req.user!.userId, studentId]);
      if (!link.rows[0]) return res.status(403).json({ error: 'Forbidden' });
    }
  } else if (role === 'DRIVER') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    let query = `SELECT fi.*, s.name as student_name, s.admission_no FROM fee_installments fi
                 JOIN students s ON s.id = fi.student_id
                 WHERE fi.school_id = $1`;
    const params: (string | number | boolean | null)[] = [schoolId];
    if (scopedStudentId) { query += ` AND fi.student_id = $${params.length + 1}`; params.push(scopedStudentId); }
    if (academicYearId) { query += ` AND fi.academic_year_id = $${params.length + 1}`; params.push(academicYearId as string); }
    if (status) { query += ` AND fi.status = $${params.length + 1}`; params.push(status as string); }
    if (payerType) { query += ` AND fi.payer_type = $${params.length + 1}`; params.push(payerType as string); }
    query += ` ORDER BY fi.due_date ASC`;
    const result = await pool.query(query, params);
    return res.json(result.rows);
  } catch (err: unknown) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/schools/:schoolId/fees/pay
// Record payment — allocates oldest PARENT dues first (Oldest Due First logic)
router.post('/pay', requireRole('SUPER_ADMIN', 'PRINCIPAL'), async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  if (req.user?.role === 'PRINCIPAL' && req.user?.schoolId !== schoolId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { studentId, amount, method, note, academicYearId } = req.body;
  if (!studentId || !amount || !method) {
    return res.status(400).json({ error: 'studentId, amount, method required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get student info
    const studentRes = await client.query(
      `SELECT s.*, sar.class_name FROM students s
       LEFT JOIN student_academic_records sar ON sar.student_id = s.id AND sar.academic_year_id = $2
       WHERE s.id = $1 AND s.school_id = $3`,
      [studentId, academicYearId, schoolId]
    );
    const student = studentRes.rows[0];
    if (!student) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Student not found' }); }

    // Get advance balance
    const advRes = await client.query(`SELECT amount FROM advance_balances WHERE student_id = $1`, [studentId]);
    const existingAdvance = advRes.rows[0]?.amount || 0;
    let remaining = parseInt(amount) + parseInt(existingAdvance);

    // Get unpaid PARENT installments oldest first — scoped to requested academic year and school
    const installments = await client.query(`
      SELECT * FROM fee_installments
      WHERE student_id = $1 AND school_id = $2
        AND payer_type = 'PARENT' AND status NOT IN ('PAID','WAIVED')
        ${academicYearId ? 'AND academic_year_id = $3' : ''}
      ORDER BY due_date ASC
    `, academicYearId ? [studentId, schoolId, academicYearId] : [studentId, schoolId]);

    const appliedInstallments: { id: number; amount: number }[] = [];

    for (const inst of installments.rows) {
      if (remaining <= 0) break;
      const due = inst.amount - inst.paid_amount - inst.write_off_amount;
      if (due <= 0) continue;
      const applying = Math.min(remaining, due);
      const newPaid = parseInt(inst.paid_amount) + applying;
      const total = inst.amount - inst.write_off_amount;
      const newStatus = newPaid >= total ? 'PAID' : newPaid > 0 ? 'PARTIAL' : 'UNPAID';
      await client.query(`
        UPDATE fee_installments SET paid_amount = $1, status = $2, updated_at = NOW() WHERE id = $3
      `, [newPaid, newStatus, inst.id]);
      appliedInstallments.push({ id: inst.id, amount: applying });
      remaining -= applying;
    }

    // Store advance balance
    await client.query(`
      INSERT INTO advance_balances (student_id, amount) VALUES ($1,$2)
      ON CONFLICT (student_id) DO UPDATE SET amount = $2, updated_at = NOW()
    `, [studentId, remaining > 0 ? remaining : 0]);

    // Generate receipt number
    const receiptCount = await client.query(`SELECT COUNT(*) FROM payment_records WHERE school_id = $1`, [schoolId]);
    const receiptNo = `RCT-${new Date().getFullYear()}-${String(parseInt(receiptCount.rows[0].count) + 1).padStart(4, '0')}`;

    // Create payment record
    const paymentRes = await client.query(`
      INSERT INTO payment_records (student_id, school_id, academic_year_id, amount, method, receipt_no, advance_amount, note)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
    `, [studentId, schoolId, academicYearId, amount, method, receiptNo, remaining > 0 ? remaining : 0, note]);

    // Link installments to payment
    for (const inst of appliedInstallments) {
      await client.query(`
        INSERT INTO payment_installment_links (payment_id, installment_id, amount_applied)
        VALUES ($1,$2,$3)
      `, [paymentRes.rows[0].id, inst.id, inst.amount]);
    }

    // Update student_academic_records paid_fee
    await client.query(`
      UPDATE student_academic_records SET 
        paid_fee = (SELECT COALESCE(SUM(paid_amount), 0) FROM fee_installments WHERE student_id = $1 AND academic_year_id = $2),
        fee_status = CASE
          WHEN (SELECT COUNT(*) FROM fee_installments WHERE student_id = $1 AND academic_year_id = $2 AND status NOT IN ('PAID','WAIVED')) = 0 THEN 'PAID'
          WHEN (SELECT COUNT(*) FROM fee_installments WHERE student_id = $1 AND academic_year_id = $2 AND status IN ('UNPAID') AND due_date < CURRENT_DATE) > 0 THEN 'OVERDUE'
          ELSE 'PENDING'
        END
      WHERE student_id = $1 AND academic_year_id = $2
    `, [studentId, academicYearId]);

    await client.query('COMMIT');
    return res.status(201).json({
      payment: paymentRes.rows[0],
      applied: parseInt(amount) - Math.max(0, remaining - parseInt(existingAdvance)),
      advance: remaining > 0 ? remaining : 0,
      receiptNo,
    });
  } catch (err: unknown) {
    await client.query('ROLLBACK');
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// POST /api/schools/:schoolId/fees/govt-pay
router.post('/govt-pay', requireRole('SUPER_ADMIN', 'PRINCIPAL'), async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  if (req.user?.role === 'PRINCIPAL' && req.user?.schoolId !== schoolId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { studentIds, totalAmount, referenceNo, note, academicYearId } = req.body;
  if (!studentIds || !totalAmount) {
    return res.status(400).json({ error: 'studentIds and totalAmount required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let remaining = parseInt(totalAmount);

    for (const sid of studentIds) {
      if (remaining <= 0) break;
      const installments = await client.query(`
        SELECT * FROM fee_installments
        WHERE student_id = $1 AND payer_type = 'GOVERNMENT' AND status NOT IN ('PAID','WAIVED')
          AND academic_year_id = $2
        ORDER BY due_date ASC
      `, [sid, academicYearId]);

      for (const inst of installments.rows) {
        if (remaining <= 0) break;
        const due = inst.amount - inst.paid_amount - inst.write_off_amount;
        if (due <= 0) continue;
        const applying = Math.min(remaining, due);
        const newPaid = parseInt(inst.paid_amount) + applying;
        const total = inst.amount - inst.write_off_amount;
        const newStatus = newPaid >= total ? 'PAID' : 'PARTIAL';
        await client.query(`
          UPDATE fee_installments SET paid_amount = $1, status = $2, updated_at = NOW() WHERE id = $3
        `, [newPaid, newStatus, inst.id]);
        remaining -= applying;
      }
    }

    const gpResult = await client.query(`
      INSERT INTO government_payments (school_id, amount, reference_no, note)
      VALUES ($1,$2,$3,$4) RETURNING *
    `, [schoolId, totalAmount, referenceNo, note]);

    for (const sid of studentIds) {
      await client.query(`
        INSERT INTO govt_payment_student_links (govt_payment_id, student_id) VALUES ($1,$2)
      `, [gpResult.rows[0].id, sid]);
    }

    await client.query('COMMIT');
    return res.status(201).json(gpResult.rows[0]);
  } catch (err: unknown) {
    await client.query('ROLLBACK');
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// POST /api/schools/:schoolId/fees/write-off
router.post('/write-off', requireRole('SUPER_ADMIN', 'PRINCIPAL'), async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  if (req.user?.role === 'PRINCIPAL' && req.user?.schoolId !== schoolId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { installmentId, amount, reason } = req.body;
  if (!installmentId || !amount) return res.status(400).json({ error: 'installmentId and amount required' });

  try {
    const inst = await pool.query(`SELECT * FROM fee_installments WHERE id = $1 AND school_id = $2`, [installmentId, schoolId]);
    if (!inst.rows[0]) return res.status(404).json({ error: 'Installment not found' });

    const row = inst.rows[0];
    const maxWriteOff = row.amount - row.paid_amount;
    const writeOff = Math.min(parseInt(amount), maxWriteOff);
    const newWriteOff = parseInt(row.write_off_amount) + writeOff;
    const newStatus = (row.paid_amount + newWriteOff >= row.amount) ? 'WAIVED' : row.status;

    await pool.query(`
      UPDATE fee_installments SET write_off_amount = $1, write_off_reason = $2, status = $3, updated_at = NOW() WHERE id = $4
    `, [newWriteOff, reason, newStatus, installmentId]);

    return res.json({ message: 'Write-off applied', writeOff, status: newStatus });
  } catch (err: unknown) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/schools/:schoolId/fees/payments
router.get('/payments', async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  const role = req.user?.role;
  if (role === 'DRIVER') return res.status(403).json({ error: 'Forbidden' });

  const { academicYearId } = req.query;
  let { studentId } = req.query;

  // STUDENT sees only their own payment records
  if (role === 'STUDENT') {
    const sr = await pool.query(`SELECT id FROM students WHERE user_id = $1 AND school_id = $2`, [req.user!.userId, schoolId]);
    if (!sr.rows[0]) return res.json([]);
    studentId = String(sr.rows[0].id);
  }
  // PARENT sees only their linked children's records
  if (role === 'PARENT') {
    if (!studentId) {
      const links = await pool.query(`SELECT student_id FROM parent_student_links WHERE parent_user_id = $1`, [req.user!.userId]);
      if (links.rows.length === 0) return res.json([]);
      studentId = String(links.rows[0].student_id);
    } else {
      const link = await pool.query(`SELECT 1 FROM parent_student_links WHERE parent_user_id = $1 AND student_id = $2`, [req.user!.userId, studentId]);
      if (!link.rows[0]) return res.status(403).json({ error: 'Forbidden' });
    }
  }

  try {
    let query = `SELECT pr.*, s.name as student_name, s.admission_no
                 FROM payment_records pr
                 JOIN students s ON s.id = pr.student_id
                 WHERE pr.school_id = $1`;
    const params: (string | number | boolean | null)[] = [schoolId];
    if (studentId) { query += ` AND pr.student_id = $${params.length + 1}`; params.push(studentId as string); }
    if (academicYearId) { query += ` AND pr.academic_year_id = $${params.length + 1}`; params.push(academicYearId as string); }
    query += ` ORDER BY pr.created_at DESC`;
    const result = await pool.query(query, params);
    return res.json(result.rows);
  } catch (err: unknown) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/schools/:schoolId/fees/govt-payments — management/staff only
router.get('/govt-payments', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'TEACHER'), async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  try {
    const result = await pool.query(`
      SELECT gp.*, COALESCE(json_agg(gl.student_id), '[]') as allocated_student_ids
      FROM government_payments gp
      LEFT JOIN govt_payment_student_links gl ON gl.govt_payment_id = gp.id
      WHERE gp.school_id = $1
      GROUP BY gp.id
      ORDER BY gp.created_at DESC
    `, [schoolId]);
    return res.json(result.rows);
  } catch (err: unknown) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/schools/:schoolId/fees/advance/:studentId
router.get('/advance/:studentId', async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  const studentId = parseInt(req.params.studentId);
  const role = req.user?.role;

  // DRIVER blocked
  if (role === 'DRIVER') return res.status(403).json({ error: 'Forbidden' });

  // STUDENT can only see their own advance balance
  if (role === 'STUDENT') {
    const sr = await pool.query(`SELECT id FROM students WHERE user_id = $1 AND school_id = $2`, [req.user!.userId, schoolId]);
    if (!sr.rows[0] || sr.rows[0].id !== studentId) return res.status(403).json({ error: 'Forbidden' });
  }
  // PARENT can only see linked children's advance
  if (role === 'PARENT') {
    const link = await pool.query(`SELECT 1 FROM parent_student_links WHERE parent_user_id = $1 AND student_id = $2`, [req.user!.userId, studentId]);
    if (!link.rows[0]) return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const result = await pool.query(`SELECT amount FROM advance_balances WHERE student_id = $1`, [studentId]);
    return res.json({ studentId, advance: result.rows[0]?.amount || 0 });
  } catch (err: unknown) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
