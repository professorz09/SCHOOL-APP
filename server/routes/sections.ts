import { Router, Response } from 'express';
import pool from '../db/pool';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router({ mergeParams: true });
router.use(authenticate);

// GET /api/schools/:schoolId/sections
router.get('/', async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  const { academicYearId } = req.query;
  if (req.user?.role === 'PRINCIPAL' && req.user?.schoolId !== schoolId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    let query = `SELECT * FROM sections WHERE school_id = $1`;
    const params: (string | number | boolean | null)[] = [schoolId];
    if (academicYearId) {
      query += ` AND academic_year_id = $2`;
      params.push(academicYearId);
    }
    query += ` ORDER BY class_name, section`;
    const result = await pool.query(query, params);
    return res.json(result.rows);
  } catch (err: unknown) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/schools/:schoolId/sections
router.post('/', requireRole('SUPER_ADMIN', 'PRINCIPAL'), async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  if (req.user?.role === 'PRINCIPAL' && req.user?.schoolId !== schoolId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { academicYearId, className, section, classTeacher } = req.body;
  if (!academicYearId || !className || !section) {
    return res.status(400).json({ error: 'academicYearId, className, section required' });
  }
  try {
    const result = await pool.query(`
      INSERT INTO sections (academic_year_id, school_id, class_name, section, class_teacher)
      VALUES ($1,$2,$3,$4,$5) RETURNING *
    `, [academicYearId, schoolId, className, section, classTeacher]);
    return res.status(201).json(result.rows[0]);
  } catch (err: unknown) {
    if (err.code === '23505') return res.status(409).json({ error: 'Section already exists' });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/schools/:schoolId/sections/:id
router.put('/:id', requireRole('SUPER_ADMIN', 'PRINCIPAL'), async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  const id = parseInt(req.params.id);
  if (req.user?.role === 'PRINCIPAL' && req.user?.schoolId !== schoolId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { className, section, classTeacher } = req.body;
  try {
    const result = await pool.query(`
      UPDATE sections SET
        class_name = COALESCE($3, class_name),
        section = COALESCE($4, section),
        class_teacher = COALESCE($5, class_teacher)
      WHERE id = $1 AND school_id = $2 RETURNING *
    `, [id, schoolId, className, section, classTeacher]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Section not found' });
    return res.json(result.rows[0]);
  } catch (err: unknown) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/schools/:schoolId/sections/:id
router.delete('/:id', requireRole('SUPER_ADMIN', 'PRINCIPAL'), async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  const id = parseInt(req.params.id);
  if (req.user?.role === 'PRINCIPAL' && req.user?.schoolId !== schoolId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    await pool.query(`DELETE FROM sections WHERE id = $1 AND school_id = $2`, [id, schoolId]);
    return res.json({ message: 'Section deleted' });
  } catch (err: unknown) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
