import { Router, Response } from 'express';
import pool from '../db/pool';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router({ mergeParams: true });
router.use(authenticate);

// GET /api/schools/:schoolId/timetable
// STUDENT/PARENT: scoped to their section; TEACHER+: full access
router.get('/', async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  const { academicYearId, classId } = req.query;
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

  // PARENT: restrict to first linked student's section
  if (role === 'PARENT') {
    const links = await pool.query(`SELECT student_id FROM parent_student_links WHERE parent_user_id = $1`, [req.user!.userId]);
    if (links.rows.length === 0) return res.json([]);
    const sr = await pool.query(
      `SELECT section_id FROM student_academic_records WHERE student_id = $1 ${academicYearId ? 'AND academic_year_id = $2' : ''} LIMIT 1`,
      academicYearId ? [links.rows[0].student_id, academicYearId] : [links.rows[0].student_id]
    );
    if (!sr.rows[0]) return res.json([]);
    sectionId = String(sr.rows[0].section_id);
  }

  try {
    let query = `SELECT * FROM timetable_entries WHERE school_id = $1`;
    const params: (string | number | boolean | null)[] = [schoolId];
    if (sectionId) { query += ` AND section_id = $${params.length+1}`; params.push(sectionId as string); }
    if (academicYearId) { query += ` AND academic_year_id = $${params.length+1}`; params.push(academicYearId as string); }
    if (classId) { query += ` AND class_id = $${params.length+1}`; params.push(classId as string); }
    query += ` ORDER BY day, slot_id`;
    const result = await pool.query(query, params);
    return res.json(result.rows);
  } catch (err: unknown) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/schools/:schoolId/timetable
router.post('/', requireRole('SUPER_ADMIN', 'PRINCIPAL'), async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  if (req.user?.role === 'PRINCIPAL' && req.user?.schoolId !== schoolId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { sectionId, academicYearId, classId, day, slotId, subject, teacherId, teacherName, room } = req.body;
  if (!sectionId || !academicYearId || !day || !slotId) {
    return res.status(400).json({ error: 'sectionId, academicYearId, day, slotId required' });
  }

  try {
    // Conflict check
    if (teacherId) {
      const conflict = await pool.query(`
        SELECT te.*, sec.class_name, sec.section FROM timetable_entries te
        JOIN sections sec ON sec.id = te.section_id
        WHERE te.teacher_id = $1 AND te.day = $2 AND te.slot_id = $3 AND te.academic_year_id = $4 AND te.school_id = $5
      `, [teacherId, day, slotId, academicYearId, schoolId]);
      if (conflict.rows.length > 0) {
        return res.status(409).json({ error: 'Teacher conflict', conflict: conflict.rows[0] });
      }
    }

    const result = await pool.query(`
      INSERT INTO timetable_entries (school_id, academic_year_id, section_id, class_id, day, slot_id, subject, teacher_id, teacher_name, room)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (section_id, day, slot_id) DO UPDATE SET
        subject = EXCLUDED.subject, teacher_id = EXCLUDED.teacher_id,
        teacher_name = EXCLUDED.teacher_name, room = EXCLUDED.room
      RETURNING *
    `, [schoolId, academicYearId, sectionId, classId, day, slotId, subject, teacherId, teacherName, room]);

    return res.status(201).json(result.rows[0]);
  } catch (err: unknown) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/schools/:schoolId/timetable/:id
router.delete('/:id', requireRole('SUPER_ADMIN', 'PRINCIPAL'), async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  const id = parseInt(req.params.id);
  if (req.user?.role === 'PRINCIPAL' && req.user?.schoolId !== schoolId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    await pool.query(`DELETE FROM timetable_entries WHERE id = $1 AND school_id = $2`, [id, schoolId]);
    return res.json({ message: 'Entry deleted' });
  } catch (err: unknown) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
