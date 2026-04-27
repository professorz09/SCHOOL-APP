import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../db/pool';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router({ mergeParams: true });
router.use(authenticate);

// GET /api/schools/:schoolId/staff
// TEACHER sees only non-sensitive fields (no salary/aadhaar); PRINCIPAL+ sees all
router.get('/', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'TEACHER'), async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  const isAdminRole = req.user?.role === 'SUPER_ADMIN' || req.user?.role === 'PRINCIPAL';
  try {
    const result = await pool.query(
      isAdminRole
        ? `SELECT s.*,
            COALESCE(json_agg(sca.class_name) FILTER (WHERE sca.id IS NOT NULL), '[]') as assigned_classes,
            COALESCE(
              (SELECT json_agg(json_build_object(
                'id', sp.id, 'month', sp.month, 'amount', sp.amount, 'paidAt', sp.paid_at,
                'transactionId', sp.transaction_id, 'note', sp.note
              ) ORDER BY sp.paid_at DESC)
              FROM salary_payments sp WHERE sp.staff_id = s.id), '[]'
            ) as salary_history
           FROM staff s
           LEFT JOIN staff_class_assignments sca ON sca.staff_id = s.id
           WHERE s.school_id = $1
           GROUP BY s.id ORDER BY s.name`
        : `SELECT s.id, s.name, s.role, s.subject, s.phone, s.email, s.photo,
            s.joining_date, s.address, s.status, s.school_id, s.created_at,
            COALESCE(json_agg(sca.class_name) FILTER (WHERE sca.id IS NOT NULL), '[]') as assigned_classes
           FROM staff s
           LEFT JOIN staff_class_assignments sca ON sca.staff_id = s.id
           WHERE s.school_id = $1
           GROUP BY s.id ORDER BY s.name`,
      [schoolId]
    );
    return res.json(result.rows);
  } catch (err: unknown) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/schools/:schoolId/staff/:id — TEACHER sees non-sensitive fields only; PRINCIPAL+ sees all
router.get('/:id', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'TEACHER'), async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  const id = parseInt(req.params.id);
  const isAdminRole = req.user?.role === 'SUPER_ADMIN' || req.user?.role === 'PRINCIPAL';
  try {
    const selectFields = isAdminRole
      ? `s.*, COALESCE(json_agg(sca.class_name) FILTER (WHERE sca.id IS NOT NULL), '[]') as assigned_classes`
      : `s.id, s.name, s.role, s.subject, s.phone, s.email, s.photo, s.joining_date, s.address, s.status, s.school_id, s.created_at,
         COALESCE(json_agg(sca.class_name) FILTER (WHERE sca.id IS NOT NULL), '[]') as assigned_classes`;
    const result = await pool.query(
      `SELECT ${selectFields}
       FROM staff s
       LEFT JOIN staff_class_assignments sca ON sca.staff_id = s.id
       WHERE s.id = $1 AND s.school_id = $2
       GROUP BY s.id`,
      [id, schoolId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Staff not found' });
    return res.json(result.rows[0]);
  } catch (err: unknown) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/schools/:schoolId/staff
router.post('/', requireRole('SUPER_ADMIN', 'PRINCIPAL'), async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  if (req.user?.role === 'PRINCIPAL' && req.user?.schoolId !== schoolId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const {
    name, role, subject, phone, email, aadhaarNo, salary, joiningDate, address, photo, assignedClasses
  } = req.body;
  if (!name || !role) return res.status(400).json({ error: 'name and role required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const staffResult = await client.query(`
      INSERT INTO staff (school_id, name, role, subject, phone, email, aadhaar_no, salary, joining_date, address, photo)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *
    `, [schoolId, name, role, subject, phone, email, aadhaarNo, salary || 0, joiningDate, address, photo]);

    const staff = staffResult.rows[0];

    // Save class assignments
    if (assignedClasses && Array.isArray(assignedClasses)) {
      for (const cls of assignedClasses) {
        await client.query(`INSERT INTO staff_class_assignments (staff_id, class_name) VALUES ($1,$2)`, [staff.id, cls]);
      }
    }

    // Create user account for TEACHER and DRIVER
    if ((role === 'TEACHER' || role === 'DRIVER') && phone) {
      const cleanPhone = phone.replace(/\D/g, '').slice(-10);
      if (cleanPhone) {
        const tempPassword = `${cleanPhone.slice(-4)}`;
        const hash = await bcrypt.hash(tempPassword, 10);
        const existingUser = await client.query(`SELECT id FROM users WHERE mobile_number = $1`, [cleanPhone]);
        if (existingUser.rows.length === 0) {
          const userResult = await client.query(`
            INSERT INTO users (mobile_number, password_hash, role, name, email, school_id, first_login_changed)
            VALUES ($1,$2,$3,$4,$5,$6,FALSE) RETURNING id
          `, [cleanPhone, hash, role, name, email, schoolId]);
          await client.query(`UPDATE staff SET user_id = $1 WHERE id = $2`, [userResult.rows[0].id, staff.id]);
        }
      }
    }

    await client.query('COMMIT');
    return res.status(201).json({ ...staff, assignedClasses: assignedClasses || [] });
  } catch (err: unknown) {
    await client.query('ROLLBACK');
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// PUT /api/schools/:schoolId/staff/:id
router.put('/:id', requireRole('SUPER_ADMIN', 'PRINCIPAL'), async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  const id = parseInt(req.params.id);
  if (req.user?.role === 'PRINCIPAL' && req.user?.schoolId !== schoolId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const {
    name, role, subject, phone, email, aadhaarNo, salary, joiningDate, address, photo, status, assignedClasses
  } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`
      UPDATE staff SET
        name = COALESCE($3, name), role = COALESCE($4, role), subject = COALESCE($5, subject),
        phone = COALESCE($6, phone), email = COALESCE($7, email), aadhaar_no = COALESCE($8, aadhaar_no),
        salary = COALESCE($9, salary), joining_date = COALESCE($10, joining_date),
        address = COALESCE($11, address), photo = COALESCE($12, photo), status = COALESCE($13, status), updated_at = NOW()
      WHERE id = $1 AND school_id = $2 RETURNING *
    `, [id, schoolId, name, role, subject, phone, email, aadhaarNo, salary, joiningDate, address, photo, status]);

    if (!result.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Staff not found' });
    }

    if (assignedClasses !== undefined) {
      await client.query(`DELETE FROM staff_class_assignments WHERE staff_id = $1`, [id]);
      for (const cls of assignedClasses) {
        await client.query(`INSERT INTO staff_class_assignments (staff_id, class_name) VALUES ($1,$2)`, [id, cls]);
      }
    }

    await client.query('COMMIT');
    return res.json(result.rows[0]);
  } catch (err: unknown) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// DELETE /api/schools/:schoolId/staff/:id (deactivate - permanent identity rule)
router.delete('/:id', requireRole('SUPER_ADMIN', 'PRINCIPAL'), async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  const id = parseInt(req.params.id);
  if (req.user?.role === 'PRINCIPAL' && req.user?.schoolId !== schoolId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    await pool.query(`UPDATE staff SET is_active = FALSE, status = 'SUSPENDED', updated_at = NOW() WHERE id = $1 AND school_id = $2`, [id, schoolId]);
    return res.json({ message: 'Staff deactivated' });
  } catch (err: unknown) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/schools/:schoolId/staff/:id/salary
router.post('/:id/salary', requireRole('SUPER_ADMIN', 'PRINCIPAL'), async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  const id = parseInt(req.params.id);
  if (req.user?.role === 'PRINCIPAL' && req.user?.schoolId !== schoolId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { month, note } = req.body;
  if (!month) return res.status(400).json({ error: 'month required' });

  try {
    const staff = await pool.query(`SELECT * FROM staff WHERE id = $1 AND school_id = $2`, [id, schoolId]);
    if (!staff.rows[0]) return res.status(404).json({ error: 'Staff not found' });

    const txnId = `TXN-${Date.now()}`;
    const result = await pool.query(`
      INSERT INTO salary_payments (staff_id, school_id, month, amount, transaction_id, note)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
    `, [id, schoolId, month, staff.rows[0].salary, txnId, note]);

    return res.status(201).json(result.rows[0]);
  } catch (err: unknown) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
