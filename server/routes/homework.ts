import { Router, Response } from 'express';
import pool from '../db/pool';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router({ mergeParams: true });
router.use(authenticate);

// GET /api/schools/:schoolId/homework
// STUDENT/PARENT: scoped to student's enrolled section; TEACHER+: full access
router.get('/', async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  const { academicYearId, teacherId } = req.query;
  let { sectionId } = req.query;
  const role = req.user?.role;

  if (role === 'DRIVER') return res.status(403).json({ error: 'Forbidden' });

  // STUDENT: restrict to their enrolled section
  if (role === 'STUDENT') {
    const sr = await pool.query(
      `SELECT sar.section_id FROM students s
       JOIN student_academic_records sar ON sar.student_id = s.id
         ${academicYearId ? 'AND sar.academic_year_id = $3' : ''}
       WHERE s.user_id = $1 AND s.school_id = $2 LIMIT 1`,
      academicYearId ? [req.user!.userId, schoolId, academicYearId] : [req.user!.userId, schoolId]
    );
    if (!sr.rows[0]) return res.json([]);
    sectionId = String(sr.rows[0].section_id);
  }

  // PARENT: restrict to linked student's section
  if (role === 'PARENT') {
    const links = await pool.query(`SELECT student_id FROM parent_student_links WHERE parent_user_id = $1`, [req.user!.userId]);
    if (links.rows.length === 0) return res.json([]);
    const firstStudentId = links.rows[0].student_id;
    const sr = await pool.query(
      `SELECT sar.section_id FROM student_academic_records sar
       WHERE sar.student_id = $1 ${academicYearId ? 'AND sar.academic_year_id = $2' : ''} LIMIT 1`,
      academicYearId ? [firstStudentId, academicYearId] : [firstStudentId]
    );
    if (!sr.rows[0]) return res.json([]);
    sectionId = String(sr.rows[0].section_id);
  }

  try {
    const params: (string | number)[] = [schoolId];
    let query = `SELECT * FROM homework_assignments WHERE school_id = $1`;
    if (sectionId) { query += ` AND section_id = $${params.length + 1}`; params.push(sectionId as string); }
    if (academicYearId) { query += ` AND academic_year_id = $${params.length + 1}`; params.push(academicYearId as string); }
    if (teacherId) { query += ` AND teacher_id = $${params.length + 1}`; params.push(teacherId as string); }
    query += ` ORDER BY assigned_date DESC`;
    const result = await pool.query(query, params);
    return res.json(result.rows);
  } catch (err: unknown) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/schools/:schoolId/homework
router.post('/', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'TEACHER'), async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  const { sectionId, academicYearId, teacherId, className, section, subject, title, description, dueDate, totalStudents } = req.body;
  if (!academicYearId || !title) {
    return res.status(400).json({ error: 'academicYearId and title required' });
  }
  try {
    const result = await pool.query(`
      INSERT INTO homework_assignments (school_id, academic_year_id, section_id, teacher_id, class_name, section, subject, title, description, due_date, total_students)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *
    `, [schoolId, academicYearId, sectionId, teacherId, className, section, subject, title, description, dueDate, totalStudents || 0]);
    return res.status(201).json(result.rows[0]);
  } catch (err: unknown) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/schools/:schoolId/homework/:id
router.put('/:id', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'TEACHER'), async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  const id = parseInt(req.params.id);
  const { subject, title, description, dueDate } = req.body;
  try {
    const result = await pool.query(`
      UPDATE homework_assignments SET
        subject = COALESCE($3, subject), title = COALESCE($4, title),
        description = COALESCE($5, description), due_date = COALESCE($6, due_date)
      WHERE id = $1 AND school_id = $2 RETURNING *
    `, [id, schoolId, subject, title, description, dueDate]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Homework not found' });
    return res.json(result.rows[0]);
  } catch (err: unknown) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/schools/:schoolId/homework/:id
router.delete('/:id', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'TEACHER'), async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  const id = parseInt(req.params.id);
  try {
    const result = await pool.query(`DELETE FROM homework_assignments WHERE id = $1 AND school_id = $2`, [id, schoolId]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Homework not found' });
    return res.json({ message: 'Homework deleted' });
  } catch (err: unknown) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
