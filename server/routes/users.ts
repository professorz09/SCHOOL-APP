import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../db/pool';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router({ mergeParams: true });
router.use(authenticate);

// GET /api/schools/:schoolId/users
router.get('/', requireRole('SUPER_ADMIN', 'PRINCIPAL'), async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  if (req.user?.role === 'PRINCIPAL' && req.user?.schoolId !== schoolId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const result = await pool.query(`SELECT id, mobile_number, role, name, email, is_active, last_login, created_at FROM users WHERE school_id = $1 ORDER BY name`, [schoolId]);
    return res.json(result.rows);
  } catch (err: unknown) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/schools/:schoolId/users
router.post('/', requireRole('SUPER_ADMIN', 'PRINCIPAL'), async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  const { mobileNumber, password, role, name, email } = req.body;
  if (!mobileNumber || !password || !role || !name) {
    return res.status(400).json({ error: 'mobileNumber, password, role, name required' });
  }

  // Principals can only create lower-privilege users for their school
  const PRINCIPAL_ALLOWED_ROLES = ['TEACHER', 'DRIVER', 'STUDENT', 'PARENT'];
  if (req.user?.role === 'PRINCIPAL' && !PRINCIPAL_ALLOWED_ROLES.includes(role)) {
    return res.status(403).json({ error: 'Principals cannot create users with this role' });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(`
      INSERT INTO users (mobile_number, password_hash, role, name, email, school_id)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, mobile_number, role, name, email, is_active, created_at
    `, [mobileNumber, hash, role, name, email, schoolId]);
    return res.status(201).json(result.rows[0]);
  } catch (err: unknown) {
    const pgErr = err as { code?: string };
    if (pgErr.code === '23505') return res.status(409).json({ error: 'Mobile number already registered' });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/schools/:schoolId/users/:id
router.put('/:id', requireRole('SUPER_ADMIN', 'PRINCIPAL'), async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  const id = parseInt(req.params.id);
  if (req.user?.role === 'PRINCIPAL' && req.user?.schoolId !== schoolId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { name, email, isActive, password } = req.body;
  try {
    let hash: string | undefined;
    if (password) hash = await bcrypt.hash(password, 10);
    const result = await pool.query(`
      UPDATE users SET
        name = COALESCE($3, name), email = COALESCE($4, email),
        is_active = COALESCE($5, is_active),
        password_hash = COALESCE($6, password_hash), updated_at = NOW()
      WHERE id = $1 AND school_id = $2 RETURNING id, mobile_number, role, name, email, is_active
    `, [id, schoolId, name, email, isActive, hash]);
    if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
    return res.json(result.rows[0]);
  } catch (err: unknown) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/schools/:schoolId/users/:id — deactivate user (soft delete)
router.delete('/:id', requireRole('SUPER_ADMIN', 'PRINCIPAL'), async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  const id = parseInt(req.params.id);
  // Prevent self-deletion
  if (id === req.user!.userId) {
    return res.status(400).json({ error: 'Cannot deactivate your own account' });
  }
  try {
    const result = await pool.query(
      `UPDATE users SET is_active = FALSE, updated_at = NOW() WHERE id = $1 AND school_id = $2 RETURNING id, mobile_number, role, name, is_active`,
      [id, schoolId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
    return res.json(result.rows[0]);
  } catch (err: unknown) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
