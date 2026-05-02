import { Router } from 'express';
import { adminDb } from '../lib/db';
import { ok, fail, ApiError, requireBody } from '../lib/helpers';
import { requireAuth, requireRole } from '../middleware/auth';

export const attendanceRouter = Router();

// POST /api/attendance/submit — teacher marks attendance
attendanceRouter.post('/submit', requireAuth, requireRole('TEACHER', 'PRINCIPAL'), async (req, res) => {
  try {
    const body = requireBody<{
      sectionId: string; date: string;
      records: { studentId: string; isPresent: boolean }[];
    }>(req, ['sectionId', 'date', 'records']);

    if (!Array.isArray(body.records) || body.records.length === 0) {
      throw new ApiError(400, 'records array required');
    }

    // Check if already exists and locked
    const { data: existing } = await adminDb
      .from('attendance_records')
      .select('id, is_locked')
      .eq('section_id', body.sectionId)
      .eq('date', body.date)
      .maybeSingle();

    if (existing?.is_locked) throw new ApiError(403, 'Attendance is locked and cannot be modified');

    let attendanceId: string;
    if (existing) {
      attendanceId = existing.id;
      // Delete old student records — new submission replaces them (but record header is immutable)
      await adminDb.from('attendance_students').delete().eq('attendance_id', attendanceId);
    } else {
      const { data: record, error } = await adminDb
        .from('attendance_records')
        .insert({
          section_id: body.sectionId,
          date:       body.date,
          status:     'SUBMITTED',
          is_locked:  false,
          submitted_by: req.user.id,
        })
        .select()
        .single();
      if (error) throw new ApiError(500, error.message);
      attendanceId = record.id;
    }

    const rows = body.records.map(r => ({
      attendance_id: attendanceId,
      student_id:    r.studentId,
      is_present:    r.isPresent,
    }));
    const { error: re } = await adminDb.from('attendance_students').insert(rows);
    if (re) throw new ApiError(500, re.message);

    ok(res, { attendanceId, date: body.date, count: rows.length });
  } catch (err) { fail(res, err); }
});

// POST /api/attendance/approve — principal locks the record
attendanceRouter.post('/approve', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const { attendanceId } = requireBody<{ attendanceId: string }>(req, ['attendanceId']);

    const { data: record } = await adminDb
      .from('attendance_records')
      .select('id, is_locked, sections!inner(academic_years!inner(school_id))')
      .eq('id', attendanceId)
      .single();
    if (!record) throw new ApiError(404, 'Attendance record not found');
    if (record.is_locked) throw new ApiError(400, 'Already approved');

    const { error } = await adminDb
      .from('attendance_records')
      .update({ is_locked: true, status: 'APPROVED', approved_by: req.user.id })
      .eq('id', attendanceId);
    if (error) throw new ApiError(500, error.message);

    await adminDb.rpc('log_audit', {
      p_action: 'APPROVE_ATTENDANCE',
      p_entity_type: 'attendance_record',
      p_entity_id: attendanceId,
      p_details: {},
    });
    ok(res, { attendanceId, approved: true });
  } catch (err) { fail(res, err); }
});

// GET /api/attendance?sectionId=&date=
attendanceRouter.get('/', requireAuth, requireRole('TEACHER', 'PRINCIPAL'), async (req, res) => {
  try {
    const { sectionId, date } = req.query as Record<string, string>;
    if (!sectionId || !date) throw new ApiError(400, 'sectionId and date required');

    const { data: record } = await adminDb
      .from('attendance_records')
      .select('*, attendance_students(*)')
      .eq('section_id', sectionId)
      .eq('date', date)
      .maybeSingle();

    ok(res, record ?? null);
  } catch (err) { fail(res, err); }
});
