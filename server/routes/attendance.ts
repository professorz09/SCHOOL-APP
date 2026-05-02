import { Router } from 'express';
import { adminDb, userDb } from '../lib/db';
import { ok, fail, ApiError, requireBody } from '../lib/helpers';
import { requireAuth, requireRole } from '../middleware/auth';

export const attendanceRouter = Router();

// GET /api/attendance?sectionId=&date=
attendanceRouter.get('/', requireAuth, requireRole('TEACHER', 'PRINCIPAL'), async (req, res) => {
  try {
    const { sectionId, date } = req.query as Record<string, string>;
    if (!sectionId || !date) throw new ApiError(400, 'sectionId and date required');

    const { data: record } = await adminDb
      .from('attendance_records')
      .select('*, attendance_student_details(*)')
      .eq('section_id', sectionId)
      .eq('date', date)
      .maybeSingle();

    ok(res, record ?? null);
  } catch (err) { fail(res, err); }
});

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

    // Fetch section info for school_id, academic_year_id
    const { data: section } = await adminDb
      .from('sections')
      .select('id, class_name, section, academic_year_id, school_id')
      .eq('id', body.sectionId)
      .single();
    if (!section) throw new ApiError(404, 'Section not found');

    // Block if locked
    const { data: existing } = await adminDb
      .from('attendance_records')
      .select('id, is_locked, approval_status')
      .eq('section_id', body.sectionId)
      .eq('date', body.date)
      .maybeSingle();

    if (existing?.is_locked) throw new ApiError(403, 'Attendance is locked — principal ne approve kar diya hai');

    const present = body.records.filter(r => r.isPresent).length;
    const absent  = body.records.length - present;

    let attendanceId: string;
    if (existing) {
      attendanceId = existing.id;
      // Update header counts, reset to PENDING if re-submitted
      await adminDb
        .from('attendance_records')
        .update({
          total_present:   present,
          total_absent:    absent,
          total_students:  body.records.length,
          marked_by:       req.user.id,
          approval_status: 'PENDING',
        })
        .eq('id', attendanceId);
      await adminDb.from('attendance_student_details').delete().eq('attendance_id', attendanceId);
    } else {
      const { data: record, error } = await adminDb
        .from('attendance_records')
        .insert({
          school_id:       section.school_id,
          academic_year_id: section.academic_year_id,
          section_id:      body.sectionId,
          class_name:      section.class_name,
          section:         section.section,
          date:            body.date,
          total_present:   present,
          total_absent:    absent,
          total_students:  body.records.length,
          marked_by:       req.user.id,
          approval_status: 'PENDING',
          is_locked:       false,
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
    const { error: re } = await adminDb.from('attendance_student_details').insert(rows);
    if (re) throw new ApiError(500, re.message);

    ok(res, { attendanceId, date: body.date, present, absent, total: body.records.length });
  } catch (err) { fail(res, err); }
});

// POST /api/attendance/mark-by-principal — principal marks directly (APPROVED immediately)
attendanceRouter.post('/mark-by-principal', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const body = requireBody<{
      className: string; section: string; date: string;
      records: { studentId: string; isPresent: boolean }[];
    }>(req, ['className', 'section', 'date', 'records']);

    if (!Array.isArray(body.records) || body.records.length === 0) {
      throw new ApiError(400, 'records array required');
    }

    // Resolve active year + section
    const { data: ay } = await adminDb
      .from('academic_years').select('id')
      .eq('school_id', req.user.school_id!).eq('is_active', true).maybeSingle();
    if (!ay) throw new ApiError(400, 'No active academic year');
    const yearId = (ay as any).id as string;

    const { data: secRows } = await adminDb
      .from('sections').select('id')
      .eq('school_id', req.user.school_id!)
      .eq('academic_year_id', yearId)
      .eq('class_name', body.className)
      .eq('section', body.section)
      .limit(1);
    const sectionId = ((secRows ?? [])[0] as any)?.id;
    if (!sectionId) throw new ApiError(404, `Section ${body.className}-${body.section} not found`);

    const present = body.records.filter(r => r.isPresent).length;
    const absent  = body.records.length - present;

    const { data: rec, error: rErr } = await adminDb
      .from('attendance_records').insert({
        school_id:        req.user.school_id,
        academic_year_id: yearId,
        section_id:       sectionId,
        class_name:       body.className,
        section:          body.section,
        date:             body.date,
        total_present:    present,
        total_absent:     absent,
        total_students:   body.records.length,
        marked_by:        req.user.id,
        approved_by:      req.user.id,
        approval_status:  'APPROVED',
        is_locked:        true,
      }).select('id').single();
    if (rErr) {
      if (/duplicate/i.test(rErr.message))
        throw new ApiError(409, 'Attendance already marked for this date');
      throw new ApiError(500, rErr.message);
    }
    const attendanceId = (rec as any).id as string;

    const detail = body.records.map(r => ({
      attendance_id: attendanceId,
      student_id:    r.studentId,
      is_present:    r.isPresent,
    }));
    const { error: dErr } = await adminDb.from('attendance_student_details').insert(detail);
    if (dErr) {
      await adminDb.from('attendance_records').delete().eq('id', attendanceId);
      throw new ApiError(500, dErr.message);
    }

    ok(res, { attendanceId, date: body.date, present, absent, total: body.records.length }, 201);
  } catch (err) { fail(res, err); }
});

// POST /api/attendance/reject — principal rejects a teacher-submitted record
attendanceRouter.post('/reject', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const body = requireBody<{ attendanceId: string; reason?: string }>(req, ['attendanceId']);

    const { data: record } = await adminDb.from('attendance_records')
      .select('id, school_id').eq('id', body.attendanceId).maybeSingle();
    if (!record) throw new ApiError(404, 'Attendance record not found');
    if ((record as any).school_id !== req.user.school_id) throw new ApiError(403, 'Access denied');

    const { error } = await adminDb.from('attendance_records')
      .update({ approval_status: 'REJECTED', approved_by: req.user.id })
      .eq('id', body.attendanceId);
    if (error) throw new ApiError(500, error.message);

    ok(res, { attendanceId: body.attendanceId, rejected: true });
  } catch (err) { fail(res, err); }
});

// POST /api/attendance/update-students — correction-mode: replace per-student rows
attendanceRouter.post('/update-students', requireAuth, requireRole('PRINCIPAL', 'TEACHER'), async (req, res) => {
  try {
    const body = requireBody<{
      attendanceId: string;
      students: { studentId: string; isPresent: boolean }[];
    }>(req, ['attendanceId', 'students']);

    // Verify record belongs to this school
    const { data: own } = await adminDb.from('attendance_records')
      .select('id, school_id').eq('id', body.attendanceId)
      .eq('school_id', req.user.school_id!).maybeSingle();
    if (!own) throw new ApiError(404, 'Attendance record not found');

    if (body.students.length) {
      const rows = body.students.map(s => ({
        attendance_id: body.attendanceId,
        student_id:    s.studentId,
        is_present:    s.isPresent,
      }));
      const { error: uErr } = await adminDb.from('attendance_student_details')
        .upsert(rows, { onConflict: 'attendance_id,student_id' });
      if (uErr) throw new ApiError(500, uErr.message);
    }

    // Drop rows for students no longer in the input
    const keepIds = new Set(body.students.map(s => s.studentId));
    const { data: existing } = await adminDb.from('attendance_student_details')
      .select('student_id').eq('attendance_id', body.attendanceId);
    const toDelete = ((existing ?? []) as { student_id: string }[])
      .map(r => r.student_id).filter(sid => !keepIds.has(sid));

    if (toDelete.length) {
      const { error: dErr } = await adminDb.from('attendance_student_details').delete()
        .eq('attendance_id', body.attendanceId).in('student_id', toDelete);
      if (dErr) throw new ApiError(500, dErr.message);
    }

    const present = body.students.filter(s => s.isPresent).length;
    const absent  = body.students.length - present;

    const { error: rErr } = await adminDb.from('attendance_records').update({
      total_present:  present,
      total_absent:   absent,
      total_students: body.students.length,
    }).eq('id', body.attendanceId);
    if (rErr) throw new ApiError(500, rErr.message);

    ok(res, { attendanceId: body.attendanceId, present, absent, total: body.students.length });
  } catch (err) { fail(res, err); }
});

// POST /api/attendance/approve — principal approves & locks
attendanceRouter.post('/approve', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const { attendanceId } = requireBody<{ attendanceId: string }>(req, ['attendanceId']);

    const { data: record } = await adminDb
      .from('attendance_records')
      .select('id, is_locked, school_id')
      .eq('id', attendanceId)
      .single();
    if (!record) throw new ApiError(404, 'Attendance record not found');
    if (record.school_id !== req.user.school_id) throw new ApiError(403, 'Access denied');
    if (record.is_locked) throw new ApiError(400, 'Already approved and locked');

    const { error } = await adminDb
      .from('attendance_records')
      .update({ is_locked: true, approval_status: 'APPROVED', approved_by: req.user.id })
      .eq('id', attendanceId);
    if (error) throw new ApiError(500, error.message);

    ok(res, { attendanceId, approved: true });
  } catch (err) { fail(res, err); }
});
