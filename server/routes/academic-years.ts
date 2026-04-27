import { Router, Response } from 'express';
import pool from '../db/pool';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router({ mergeParams: true });
router.use(authenticate);

// GET /api/schools/:schoolId/academic-years
router.get('/', async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  if (req.user?.role === 'PRINCIPAL' && req.user?.schoolId !== schoolId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const result = await pool.query(`
      SELECT ay.*,
        json_agg(json_build_object(
          'id', s.id, 'className', s.class_name, 'section', s.section,
          'classTeacher', s.class_teacher, 'studentCount', s.student_count
        )) FILTER (WHERE s.id IS NOT NULL) as sections
      FROM academic_years ay
      LEFT JOIN sections s ON s.academic_year_id = ay.id
      WHERE ay.school_id = $1
      GROUP BY ay.id
      ORDER BY ay.start_date DESC
    `, [schoolId]);
    return res.json(result.rows);
  } catch (err: unknown) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/schools/:schoolId/academic-years
router.post('/', requireRole('SUPER_ADMIN', 'PRINCIPAL'), async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  if (req.user?.role === 'PRINCIPAL' && req.user?.schoolId !== schoolId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { label, startDate, endDate, board, medium, classes } = req.body;
  if (!label || !startDate || !endDate) {
    return res.status(400).json({ error: 'label, startDate, endDate required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Deactivate other years first
    await client.query(`UPDATE academic_years SET is_active = FALSE WHERE school_id = $1`, [schoolId]);

    const ayResult = await client.query(`
      INSERT INTO academic_years (school_id, label, start_date, end_date, is_active, board, medium)
      VALUES ($1,$2,$3,$4,TRUE,$5,$6)
      RETURNING *
    `, [schoolId, label, startDate, endDate, board, medium]);

    const ay = ayResult.rows[0];

    // Create sections from classes config
    if (classes && Array.isArray(classes)) {
      for (const cls of classes) {
        for (const section of (cls.sections || [])) {
          await client.query(`
            INSERT INTO sections (academic_year_id, school_id, class_name, section)
            VALUES ($1,$2,$3,$4)
          `, [ay.id, schoolId, cls.name, section]);
        }
      }
    }

    await client.query('COMMIT');
    return res.status(201).json(ay);
  } catch (err: unknown) {
    await client.query('ROLLBACK');
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// PUT /api/schools/:schoolId/academic-years/:id
router.put('/:id', requireRole('SUPER_ADMIN', 'PRINCIPAL'), async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  const id = parseInt(req.params.id);
  if (req.user?.role === 'PRINCIPAL' && req.user?.schoolId !== schoolId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { label, startDate, endDate, isActive, board, medium } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (isActive) {
      await client.query(`UPDATE academic_years SET is_active = FALSE WHERE school_id = $1`, [schoolId]);
    }
    const result = await client.query(`
      UPDATE academic_years SET
        label = COALESCE($3, label),
        start_date = COALESCE($4, start_date),
        end_date = COALESCE($5, end_date),
        is_active = COALESCE($6, is_active),
        board = COALESCE($7, board),
        medium = COALESCE($8, medium)
      WHERE id = $1 AND school_id = $2
      RETURNING *
    `, [id, schoolId, label, startDate, endDate, isActive, board, medium]);
    await client.query('COMMIT');
    if (!result.rows[0]) return res.status(404).json({ error: 'Academic year not found' });
    return res.json(result.rows[0]);
  } catch (err: unknown) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// DELETE /api/schools/:schoolId/academic-years/:id (close year)
router.delete('/:id', requireRole('SUPER_ADMIN', 'PRINCIPAL'), async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  const id = parseInt(req.params.id);
  if (req.user?.role === 'PRINCIPAL' && req.user?.schoolId !== schoolId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    await pool.query(`UPDATE academic_years SET is_active = FALSE WHERE id = $1 AND school_id = $2`, [id, schoolId]);
    return res.json({ message: 'Academic year closed' });
  } catch (err: unknown) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
