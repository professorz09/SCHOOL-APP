import { Router, Response } from 'express';
import pool from '../db/pool';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router({ mergeParams: true });
router.use(authenticate);

// GET /api/schools/:schoolId/attendance
router.get('/', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'TEACHER'), async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  const { sectionId, academicYearId, date, startDate, endDate } = req.query;
  try {
    let query = `SELECT ar.*, u.name as marked_by_name FROM attendance_records ar
                 LEFT JOIN users u ON u.id = ar.marked_by
                 WHERE ar.school_id = $1`;
    const params: (string | number | boolean | null)[] = [schoolId];
    if (sectionId) { query += ` AND ar.section_id = $${params.length+1}`; params.push(sectionId); }
    if (academicYearId) { query += ` AND ar.academic_year_id = $${params.length+1}`; params.push(academicYearId); }
    if (date) { query += ` AND ar.date = $${params.length+1}`; params.push(date); }
    if (startDate) { query += ` AND ar.date >= $${params.length+1}`; params.push(startDate); }
    if (endDate) { query += ` AND ar.date <= $${params.length+1}`; params.push(endDate); }
    query += ` ORDER BY ar.date DESC`;
    const result = await pool.query(query, params);
    return res.json(result.rows);
  } catch (err: unknown) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/schools/:schoolId/attendance/:id/details
router.get('/:id/details', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'TEACHER'), async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  const id = parseInt(req.params.id);
  try {
    const result = await pool.query(`
      SELECT asd.*, s.name as student_name, s.roll_no
      FROM attendance_student_details asd
      JOIN students s ON s.id = asd.student_id
      JOIN attendance_records ar ON ar.id = asd.attendance_id
      WHERE asd.attendance_id = $1 AND ar.school_id = $2
    `, [id, schoolId]);
    return res.json(result.rows);
  } catch (err: unknown) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/schools/:schoolId/attendance
router.post('/', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'TEACHER'), async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  if (req.user?.role === 'PRINCIPAL' && req.user?.schoolId !== schoolId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { sectionId, academicYearId, date, className, section, presentIds, absentIds } = req.body;
  if (!sectionId || !academicYearId || !date) {
    return res.status(400).json({ error: 'sectionId, academicYearId, date required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const allStudentIds = [...(presentIds || []), ...(absentIds || [])];

    const arResult = await client.query(`
      INSERT INTO attendance_records (school_id, academic_year_id, section_id, class_name, section, date, total_present, total_absent, total_students, marked_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (section_id, date) DO UPDATE SET
        total_present = EXCLUDED.total_present, total_absent = EXCLUDED.total_absent,
        total_students = EXCLUDED.total_students, marked_by = EXCLUDED.marked_by
      RETURNING *
    `, [schoolId, academicYearId, sectionId, className, section, date,
        (presentIds || []).length, (absentIds || []).length, allStudentIds.length, req.user!.userId]);

    const ar = arResult.rows[0];

    // Delete existing details and re-insert
    await client.query(`DELETE FROM attendance_student_details WHERE attendance_id = $1`, [ar.id]);

    for (const sid of (presentIds || [])) {
      await client.query(`INSERT INTO attendance_student_details (attendance_id, student_id, is_present) VALUES ($1,$2,TRUE)`, [ar.id, sid]);
    }
    for (const sid of (absentIds || [])) {
      await client.query(`INSERT INTO attendance_student_details (attendance_id, student_id, is_present) VALUES ($1,$2,FALSE)`, [ar.id, sid]);
    }

    // Update attendance_percent in student_academic_records
    if (allStudentIds.length > 0) {
      await client.query(`
        UPDATE student_academic_records sar SET attendance_percent = (
          SELECT ROUND(100.0 * SUM(CASE WHEN asd.is_present THEN 1 ELSE 0 END) / COUNT(*), 2)
          FROM attendance_student_details asd
          JOIN attendance_records ar2 ON ar2.id = asd.attendance_id
          WHERE asd.student_id = sar.student_id AND ar2.academic_year_id = sar.academic_year_id
        )
        WHERE sar.academic_year_id = $1 AND sar.student_id = ANY($2::int[])
      `, [academicYearId, allStudentIds]);
    }

    await client.query('COMMIT');
    return res.status(201).json(ar);
  } catch (err: unknown) {
    await client.query('ROLLBACK');
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// PUT /api/schools/:schoolId/attendance/:id — update attendance record
router.put('/:id', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'TEACHER'), async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  const id = parseInt(req.params.id);
  const { presentIds, absentIds } = req.body;
  const allStudentIds = [...(presentIds || []), ...(absentIds || [])];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const arResult = await client.query(`
      UPDATE attendance_records SET
        total_present = $3, total_absent = $4, total_students = $5, marked_by = $6
      WHERE id = $1 AND school_id = $2 RETURNING *
    `, [id, schoolId, (presentIds || []).length, (absentIds || []).length, allStudentIds.length, req.user!.userId]);

    if (!arResult.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Attendance record not found' });
    }

    await client.query(`DELETE FROM attendance_student_details WHERE attendance_id = $1`, [id]);
    for (const sid of (presentIds || [])) {
      await client.query(`INSERT INTO attendance_student_details (attendance_id, student_id, is_present) VALUES ($1,$2,TRUE)`, [id, sid]);
    }
    for (const sid of (absentIds || [])) {
      await client.query(`INSERT INTO attendance_student_details (attendance_id, student_id, is_present) VALUES ($1,$2,FALSE)`, [id, sid]);
    }

    if (allStudentIds.length > 0) {
      const ar = arResult.rows[0];
      await client.query(`
        UPDATE student_academic_records sar SET attendance_percent = (
          SELECT ROUND(100.0 * SUM(CASE WHEN asd.is_present THEN 1 ELSE 0 END) / COUNT(*), 2)
          FROM attendance_student_details asd
          JOIN attendance_records ar2 ON ar2.id = asd.attendance_id
          WHERE asd.student_id = sar.student_id AND ar2.academic_year_id = sar.academic_year_id
        )
        WHERE sar.academic_year_id = $1 AND sar.student_id = ANY($2::int[])
      `, [ar.academic_year_id, allStudentIds]);
    }

    await client.query('COMMIT');
    return res.json(arResult.rows[0]);
  } catch (err: unknown) {
    await client.query('ROLLBACK');
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// DELETE /api/schools/:schoolId/attendance/:id
router.delete('/:id', requireRole('SUPER_ADMIN', 'PRINCIPAL'), async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  const id = parseInt(req.params.id);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ar = await client.query(`SELECT * FROM attendance_records WHERE id = $1 AND school_id = $2`, [id, schoolId]);
    if (!ar.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Attendance record not found' });
    }
    await client.query(`DELETE FROM attendance_student_details WHERE attendance_id = $1`, [id]);
    await client.query(`DELETE FROM attendance_records WHERE id = $1 AND school_id = $2`, [id, schoolId]);
    await client.query('COMMIT');
    return res.json({ message: 'Attendance record deleted' });
  } catch (err: unknown) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

export default router;
