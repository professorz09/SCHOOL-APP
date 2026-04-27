import { Router, Response } from 'express';
import pool from '../db/pool';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router({ mergeParams: true });
router.use(authenticate);

// GET /api/broadcasts
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    let query = `SELECT * FROM broadcasts`;
    const params: (string | number | boolean | null)[] = [];

    if (req.user?.role !== 'SUPER_ADMIN' && req.user?.schoolId) {
      query += ` WHERE $1 = ANY(target_schools) OR target_schools IS NULL OR array_length(target_schools, 1) = 0`;
      params.push(req.user.schoolId);
    }

    query += ` ORDER BY sent_at DESC`;
    const result = await pool.query(query, params);
    return res.json(result.rows);
  } catch (err: unknown) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/broadcasts
router.post('/', requireRole('SUPER_ADMIN'), async (req: AuthRequest, res: Response) => {
  const { title, message, targetSchools } = req.body;
  if (!title || !message) return res.status(400).json({ error: 'title and message required' });
  try {
    const result = await pool.query(`
      INSERT INTO broadcasts (sent_by, title, message, target_schools)
      VALUES ($1,$2,$3,$4) RETURNING *
    `, [req.user!.userId, title, message, targetSchools || null]);
    return res.status(201).json(result.rows[0]);
  } catch (err: unknown) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/broadcasts/:id
router.delete('/:id', requireRole('SUPER_ADMIN'), async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id);
  try {
    await pool.query(`DELETE FROM broadcasts WHERE id = $1`, [id]);
    return res.json({ message: 'Broadcast deleted' });
  } catch (err: unknown) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
