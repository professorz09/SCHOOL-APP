import { Router, Response } from 'express';
import pool from '../db/pool';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router({ mergeParams: true });
router.use(authenticate);

// GET /api/schools/:schoolId/complaints
router.get('/', async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  if (req.user?.role === 'PRINCIPAL' && req.user?.schoolId !== schoolId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { status, fromRole } = req.query;
  try {
    let query = `SELECT * FROM complaints WHERE school_id = $1`;
    const params: (string | number | boolean | null)[] = [schoolId];
    if (status) { query += ` AND status = $${params.length+1}`; params.push(status); }
    if (fromRole) { query += ` AND from_role = $${params.length+1}`; params.push(fromRole); }

    // Parents/students can only see their own complaints
    if (req.user?.role === 'PARENT' || req.user?.role === 'STUDENT') {
      query += ` AND from_user_id = $${params.length+1}`;
      params.push(req.user.userId);
    }

    query += ` ORDER BY created_at DESC`;
    const result = await pool.query(query, params);
    return res.json(result.rows);
  } catch (err: unknown) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/schools/:schoolId/complaints
router.post('/', async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  if (req.user?.role === 'PRINCIPAL' && req.user?.schoolId !== schoolId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { subject, description, fromClass } = req.body;
  if (!subject) return res.status(400).json({ error: 'subject required' });
  try {
    const result = await pool.query(`
      INSERT INTO complaints (school_id, from_role, from_name, from_user_id, from_class, subject, description)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
    `, [schoolId, req.user!.role, req.user!.name, req.user!.userId, fromClass, subject, description]);
    return res.status(201).json(result.rows[0]);
  } catch (err: unknown) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/schools/:schoolId/complaints/:id/resolve
router.put('/:id/resolve', requireRole('SUPER_ADMIN', 'PRINCIPAL'), async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  const id = parseInt(req.params.id);
  if (req.user?.role === 'PRINCIPAL' && req.user?.schoolId !== schoolId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { response, status } = req.body;
  try {
    const result = await pool.query(`
      UPDATE complaints SET
        status = COALESCE($3, 'RESOLVED'), response = $4, resolved_at = NOW()
      WHERE id = $1 AND school_id = $2 RETURNING *
    `, [id, schoolId, status, response]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Complaint not found' });
    return res.json(result.rows[0]);
  } catch (err: unknown) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/schools/:schoolId/complaints/:id
router.delete('/:id', requireRole('SUPER_ADMIN', 'PRINCIPAL'), async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  const id = parseInt(req.params.id);
  try {
    const result = await pool.query(`DELETE FROM complaints WHERE id = $1 AND school_id = $2`, [id, schoolId]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Complaint not found' });
    return res.json({ message: 'Complaint deleted' });
  } catch (err: unknown) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
