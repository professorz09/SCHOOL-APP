import { Router, Response } from 'express';
import pool from '../db/pool';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router({ mergeParams: true });
router.use(authenticate);

// GET /api/schools/:schoolId/exams/tests
router.get('/tests', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'TEACHER'), async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  const { sectionId, academicYearId, teacherId } = req.query;
  try {
    let query = `SELECT * FROM test_schedules WHERE school_id = $1`;
    const params: (string | number | boolean | null)[] = [schoolId];
    if (sectionId) { query += ` AND section_id = $${params.length+1}`; params.push(sectionId); }
    if (academicYearId) { query += ` AND academic_year_id = $${params.length+1}`; params.push(academicYearId); }
    if (teacherId) { query += ` AND teacher_id = $${params.length+1}`; params.push(teacherId); }
    query += ` ORDER BY scheduled_date DESC`;
    const result = await pool.query(query, params);
    return res.json(result.rows);
  } catch (err: unknown) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/schools/:schoolId/exams/tests
router.post('/tests', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'TEACHER'), async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  if (req.user?.role === 'PRINCIPAL' && req.user?.schoolId !== schoolId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { sectionId, academicYearId, teacherId, className, section, subject, testType, title, scheduledDate, duration, maxMarks, syllabus } = req.body;
  if (!academicYearId || !title) return res.status(400).json({ error: 'academicYearId and title required' });
  try {
    const result = await pool.query(`
      INSERT INTO test_schedules (school_id, academic_year_id, section_id, teacher_id, class_name, section, subject, test_type, title, scheduled_date, duration, max_marks, syllabus)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *
    `, [schoolId, academicYearId, sectionId, teacherId, className, section, subject, testType || 'UNIT_TEST', title, scheduledDate, duration, maxMarks, syllabus]);
    return res.status(201).json(result.rows[0]);
  } catch (err: unknown) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/schools/:schoolId/exams/results
// STUDENT: own results only; PARENT: linked children only; TEACHER+: full access
router.get('/results', async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  const { testId, academicYearId } = req.query;
  let { studentId } = req.query;
  const role = req.user?.role;

  if (role === 'DRIVER') return res.status(403).json({ error: 'Forbidden' });

  // STUDENT can only see their own results
  if (role === 'STUDENT') {
    const sr = await pool.query(`SELECT id FROM students WHERE user_id = $1 AND school_id = $2`, [req.user!.userId, schoolId]);
    if (!sr.rows[0]) return res.json([]);
    studentId = String(sr.rows[0].id);
  }

  // PARENT can only see linked children's results
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
    let query = `
      SELECT er.*, s.name as student_name, ts.title as test_title, ts.subject, ts.max_marks, ts.test_type
      FROM exam_results er
      JOIN students s ON s.id = er.student_id
      JOIN test_schedules ts ON ts.id = er.test_id
      WHERE ts.school_id = $1
    `;
    const params: (string | number | boolean | null)[] = [schoolId];
    if (testId) { query += ` AND er.test_id = $${params.length+1}`; params.push(testId as string); }
    if (studentId) { query += ` AND er.student_id = $${params.length+1}`; params.push(studentId as string); }
    if (academicYearId) { query += ` AND er.academic_year_id = $${params.length+1}`; params.push(academicYearId as string); }
    query += ` ORDER BY er.created_at DESC`;
    const result = await pool.query(query, params);
    return res.json(result.rows);
  } catch (err: unknown) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/schools/:schoolId/exams/results (bulk upload results)
router.post('/results', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'TEACHER'), async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  if (req.user?.role === 'PRINCIPAL' && req.user?.schoolId !== schoolId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { testId, results, academicYearId } = req.body;
  if (!testId || !results || !Array.isArray(results)) {
    return res.status(400).json({ error: 'testId and results array required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = [];
    for (const r of results) {
      const res2 = await client.query(`
        INSERT INTO exam_results (test_id, student_id, academic_year_id, obtained_marks, grade, remarks)
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (test_id, student_id) DO UPDATE SET
          obtained_marks = EXCLUDED.obtained_marks, grade = EXCLUDED.grade, remarks = EXCLUDED.remarks
        RETURNING *
      `, [testId, r.studentId, academicYearId, r.obtainedMarks, r.grade, r.remarks]);
      inserted.push(res2.rows[0]);
    }
    // Mark test as results_uploaded
    await client.query(`UPDATE test_schedules SET results_uploaded = TRUE WHERE id = $1`, [testId]);
    await client.query('COMMIT');
    return res.status(201).json(inserted);
  } catch (err: unknown) {
    await client.query('ROLLBACK');
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// PUT /api/schools/:schoolId/exams/tests/:id
router.put('/tests/:id', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'TEACHER'), async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  const id = parseInt(req.params.id);
  const { subject, testType, title, scheduledDate, duration, maxMarks, syllabus } = req.body;
  try {
    const result = await pool.query(`
      UPDATE test_schedules SET
        subject = COALESCE($3, subject), test_type = COALESCE($4, test_type),
        title = COALESCE($5, title), scheduled_date = COALESCE($6, scheduled_date),
        duration = COALESCE($7, duration), max_marks = COALESCE($8, max_marks),
        syllabus = COALESCE($9, syllabus)
      WHERE id = $1 AND school_id = $2 RETURNING *
    `, [id, schoolId, subject, testType, title, scheduledDate, duration, maxMarks, syllabus]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Test not found' });
    return res.json(result.rows[0]);
  } catch (err: unknown) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/schools/:schoolId/exams/tests/:id
router.delete('/tests/:id', requireRole('SUPER_ADMIN', 'PRINCIPAL'), async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  const id = parseInt(req.params.id);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const test = await client.query(`SELECT id FROM test_schedules WHERE id = $1 AND school_id = $2`, [id, schoolId]);
    if (!test.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Test not found' });
    }
    await client.query(`DELETE FROM exam_results WHERE test_id = $1`, [id]);
    await client.query(`DELETE FROM test_schedules WHERE id = $1 AND school_id = $2`, [id, schoolId]);
    await client.query('COMMIT');
    return res.json({ message: 'Test and results deleted' });
  } catch (err: unknown) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// DELETE /api/schools/:schoolId/exams/results/:id
router.delete('/results/:id', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'TEACHER'), async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  const id = parseInt(req.params.id);
  try {
    const result = await pool.query(`
      DELETE FROM exam_results er
      USING test_schedules ts
      WHERE er.id = $1 AND er.test_id = ts.id AND ts.school_id = $2
    `, [id, schoolId]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Result not found' });
    return res.json({ message: 'Result deleted' });
  } catch (err: unknown) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
