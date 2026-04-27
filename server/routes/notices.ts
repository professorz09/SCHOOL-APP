import { Router, Response } from 'express';
import pool from '../db/pool';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router({ mergeParams: true });
router.use(authenticate);

// GET /api/schools/:schoolId/notices
router.get('/', async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  if (req.user?.role === 'PRINCIPAL' && req.user?.schoolId !== schoolId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { audience } = req.query;
  try {
    let query = `SELECT * FROM notices WHERE school_id = $1 AND is_active = TRUE`;
    const params: (string | number | boolean | null)[] = [schoolId];
    if (audience && audience !== 'ALL') {
      query += ` AND (audience = $${params.length+1} OR audience = 'ALL')`;
      params.push(audience);
    }
    query += ` ORDER BY pinned DESC, sent_at DESC`;
    const result = await pool.query(query, params);
    return res.json(result.rows);
  } catch (err: unknown) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/schools/:schoolId/notices
router.post('/', requireRole('SUPER_ADMIN', 'PRINCIPAL'), async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  if (req.user?.role === 'PRINCIPAL' && req.user?.schoolId !== schoolId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { title, body, audience, pinned, sentByName } = req.body;
  if (!title || !body) return res.status(400).json({ error: 'title and body required' });
  try {
    const result = await pool.query(`
      INSERT INTO notices (school_id, title, body, audience, sent_by, sent_by_name, pinned)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
    `, [schoolId, title, body, audience || 'ALL', req.user!.userId, sentByName || req.user!.name, pinned || false]);
    return res.status(201).json(result.rows[0]);
  } catch (err: unknown) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/schools/:schoolId/notices/:id
router.put('/:id', requireRole('SUPER_ADMIN', 'PRINCIPAL'), async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  const id = parseInt(req.params.id);
  if (req.user?.role === 'PRINCIPAL' && req.user?.schoolId !== schoolId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { title, body, audience, pinned } = req.body;
  try {
    const result = await pool.query(`
      UPDATE notices SET title = COALESCE($3, title), body = COALESCE($4, body),
        audience = COALESCE($5, audience), pinned = COALESCE($6, pinned)
      WHERE id = $1 AND school_id = $2 RETURNING *
    `, [id, schoolId, title, body, audience, pinned]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Notice not found' });
    return res.json(result.rows[0]);
  } catch (err: unknown) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/schools/:schoolId/notices/:id
router.delete('/:id', requireRole('SUPER_ADMIN', 'PRINCIPAL'), async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  const id = parseInt(req.params.id);
  if (req.user?.role === 'PRINCIPAL' && req.user?.schoolId !== schoolId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    await pool.query(`UPDATE notices SET is_active = FALSE WHERE id = $1 AND school_id = $2`, [id, schoolId]);
    return res.json({ message: 'Notice deleted' });
  } catch (err: unknown) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
