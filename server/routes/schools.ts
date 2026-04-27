import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../db/pool';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// GET /api/schools
router.get('/', requireRole('SUPER_ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT s.*, 
        (SELECT COUNT(*) FROM students st WHERE st.school_id = s.id AND st.is_active = TRUE) as student_count,
        (SELECT COUNT(*) FROM staff sf WHERE sf.school_id = s.id AND sf.is_active = TRUE) as teacher_count
      FROM schools s
      WHERE s.is_deleted = FALSE
      ORDER BY s.created_at DESC
    `);
    return res.json(result.rows);
  } catch (err: unknown) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/schools/:id
router.get('/:id', requireRole('SUPER_ADMIN', 'PRINCIPAL'), async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id);
  if (req.user?.role === 'PRINCIPAL' && req.user?.schoolId !== id) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const school = await pool.query(`SELECT * FROM schools WHERE id = $1 AND is_deleted = FALSE`, [id]);
    if (!school.rows[0]) return res.status(404).json({ error: 'School not found' });

    const years = await pool.query(`
      SELECT ay.*, 
        json_agg(json_build_object(
          'id', sec.id, 'className', sec.class_name, 'section', sec.section,
          'classTeacher', sec.class_teacher, 'studentCount', sec.student_count
        )) FILTER (WHERE sec.id IS NOT NULL) as sections
      FROM academic_years ay
      LEFT JOIN sections sec ON sec.academic_year_id = ay.id
      WHERE ay.school_id = $1
      GROUP BY ay.id
      ORDER BY ay.start_date DESC
    `, [id]);

    return res.json({ ...school.rows[0], academicYears: years.rows });
  } catch (err: unknown) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/schools
router.post('/', requireRole('SUPER_ADMIN'), async (req: AuthRequest, res: Response) => {
  const {
    name, code, location, address, phone,
    principalName, principalEmail, principalPhone,
    status, plan, paymentStartDate, password
  } = req.body;

  if (!name || !code) return res.status(400).json({ error: 'name and code required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const schoolResult = await client.query(`
      INSERT INTO schools (name, code, location, address, phone, principal_name, principal_email, principal_phone, status, plan, payment_start_date, payment_status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'PENDING')
      RETURNING *
    `, [name, code, location, address, phone, principalName, principalEmail, principalPhone, status || 'ACTIVE', plan || 'BASIC', paymentStartDate || new Date().toISOString().split('T')[0]]);

    const school = schoolResult.rows[0];

    // Create principal user account (always when principalPhone is supplied)
    let tempPassword: string | undefined;
    if (principalPhone) {
      const cleanPhone = principalPhone.replace(/\D/g, '').slice(-10);
      // Use caller-supplied password or auto-generate a temp password
      tempPassword = password || `${code.toUpperCase()}@${new Date().getFullYear()}`;
      const hash = await bcrypt.hash(tempPassword, 10);
      const existingUser = await client.query(`SELECT id FROM users WHERE mobile_number = $1`, [cleanPhone]);
      if (existingUser.rows.length > 0) {
        await client.query(`
          UPDATE users SET school_id = $1, email = $2, password_hash = $3, role = 'PRINCIPAL',
            first_login_changed = FALSE, updated_at = NOW()
          WHERE mobile_number = $4
        `, [school.id, principalEmail, hash, cleanPhone]);
      } else {
        await client.query(`
          INSERT INTO users (mobile_number, password_hash, role, name, email, school_id, first_login_changed)
          VALUES ($1, $2, 'PRINCIPAL', $3, $4, $5, FALSE)
        `, [cleanPhone, hash, principalName || 'Principal', principalEmail, school.id]);
      }
    }

    // Setup billing
    if (plan) {
      const amounts: Record<string, number> = { BASIC: 36000, STANDARD: 72000, PREMIUM: 120000 };
      const annualAmount = amounts[plan] || 36000;
      const startDate = paymentStartDate || new Date().toISOString().split('T')[0];
      const endD = new Date(startDate);
      endD.setFullYear(endD.getFullYear() + 1);
      endD.setDate(endD.getDate() - 1);
      const endDate = endD.toISOString().split('T')[0];
      const yearLabel = `${new Date(startDate).getFullYear()}-${String(new Date(startDate).getFullYear() + 1).slice(-2)}`;

      await client.query(`
        INSERT INTO school_billing_schedules (school_id, plan, annual_amount, billing_start_date)
        VALUES ($1,$2,$3,$4)
        ON CONFLICT (school_id) DO UPDATE SET plan=$2, annual_amount=$3, updated_at=NOW()
      `, [school.id, plan, annualAmount, startDate]);

      await client.query(`
        INSERT INTO school_billing_years (school_id, year_label, start_date, end_date, annual_amount, carried_forward, total_due, total_paid, outstanding)
        VALUES ($1,$2,$3,$4,$5,0,$5,0,$5)
      `, [school.id, yearLabel, startDate, endDate, annualAmount]);
    }

    await client.query('COMMIT');
    // Include temp password in response so caller can communicate it to principal
    return res.status(201).json({ ...school, principalTempPassword: tempPassword || null });
  } catch (err: unknown) {
    await client.query('ROLLBACK');
    const pgErr = err as { code?: string };
    if (pgErr.code === '23505') return res.status(409).json({ error: 'School code already exists' });
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// PUT /api/schools/:id
router.put('/:id', requireRole('SUPER_ADMIN', 'PRINCIPAL'), async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id);
  if (req.user?.role === 'PRINCIPAL' && req.user?.schoolId !== id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const {
    name, location, address, phone, principalName, principalEmail, principalPhone,
    status, plan, paymentStatus, paymentStartDate
  } = req.body;

  try {
    const result = await pool.query(`
      UPDATE schools SET
        name = COALESCE($2, name),
        location = COALESCE($3, location),
        address = COALESCE($4, address),
        phone = COALESCE($5, phone),
        principal_name = COALESCE($6, principal_name),
        principal_email = COALESCE($7, principal_email),
        principal_phone = COALESCE($8, principal_phone),
        status = COALESCE($9, status),
        plan = COALESCE($10, plan),
        payment_status = COALESCE($11, payment_status),
        payment_start_date = COALESCE($12, payment_start_date),
        updated_at = NOW()
      WHERE id = $1 AND is_deleted = FALSE
      RETURNING *
    `, [id, name, location, address, phone, principalName, principalEmail, principalPhone, status, plan, paymentStatus, paymentStartDate]);

    if (!result.rows[0]) return res.status(404).json({ error: 'School not found' });
    return res.json(result.rows[0]);
  } catch (err: unknown) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/schools/:id (soft delete)
router.delete('/:id', requireRole('SUPER_ADMIN'), async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id);
  try {
    await pool.query(`UPDATE schools SET is_deleted = TRUE, status = 'INACTIVE', updated_at = NOW() WHERE id = $1`, [id]);
    await pool.query(`UPDATE users SET is_active = FALSE WHERE school_id = $1`, [id]);
    return res.json({ message: 'School deactivated' });
  } catch (err: unknown) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
