import { Router } from 'express';
import { adminDb } from '../lib/db';
import { ok, fail, ApiError, requireBody } from '../lib/helpers';
import { requireAuth, requireRole } from '../middleware/auth';

export const teacherRouter = Router();

// Helper: get staff row for a user
async function getStaffId(userId: string, schoolId: string): Promise<string> {
  const { data, error } = await adminDb
    .from('staff')
    .select('id')
    .eq('user_id', userId)
    .eq('school_id', schoolId)
    .maybeSingle();
  if (error) throw new ApiError(500, error.message);
  if (!data) throw new ApiError(404, 'Teacher staff profile not found');
  return (data as any).id;
}

// POST /api/teacher/check-in
teacherRouter.post('/check-in', requireAuth, requireRole('TEACHER'), async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const now   = new Date().toTimeString().slice(0, 8); // HH:MM:SS

    // Check school settings
    const { data: settings } = await adminDb
      .from('school_settings')
      .select('enable_teacher_checkin, late_after_time')
      .eq('school_id', req.user.school_id!)
      .maybeSingle();

    if (settings && !(settings as any).enable_teacher_checkin) {
      throw new ApiError(403, 'Teacher check-in is not enabled for this school');
    }

    const staffId = await getStaffId(req.user.id, req.user.school_id!);

    // Check already checked in
    const { data: existing } = await adminDb
      .from('staff_attendance')
      .select('id, check_in_time')
      .eq('staff_id', staffId)
      .eq('date', today)
      .maybeSingle();

    if (existing && (existing as any).check_in_time) {
      throw new ApiError(400, 'Already checked in today');
    }

    const lateAfter = (settings as any)?.late_after_time ?? '09:30:00';
    const status    = now > lateAfter ? 'LATE' : 'PRESENT';

    let data: any;
    if (existing) {
      // Record exists but no check_in_time — update it
      const { data: updated, error } = await adminDb
        .from('staff_attendance')
        .update({ check_in_time: now, status, marked_by: req.user.id })
        .eq('id', (existing as any).id)
        .select()
        .single();
      if (error) throw new ApiError(500, error.message);
      data = updated;
    } else {
      const { data: inserted, error } = await adminDb
        .from('staff_attendance')
        .insert({
          school_id:     req.user.school_id,
          staff_id:      staffId,
          date:          today,
          status,
          check_in_time: now,
          marked_by:     req.user.id,
          is_locked:     false,
        })
        .select()
        .single();
      if (error) throw new ApiError(500, error.message);
      data = inserted;
    }

    ok(res, { ...data, status, checkInTime: now });
  } catch (err) { fail(res, err); }
});

// POST /api/teacher/check-out
teacherRouter.post('/check-out', requireAuth, requireRole('TEACHER'), async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const now   = new Date().toTimeString().slice(0, 8);

    const staffId = await getStaffId(req.user.id, req.user.school_id!);

    const { data: record } = await adminDb
      .from('staff_attendance')
      .select('id, check_in_time, check_out_time')
      .eq('staff_id', staffId)
      .eq('date', today)
      .maybeSingle();

    if (!record || !(record as any).check_in_time) throw new ApiError(400, 'Aaj check-in nahi hua hai');
    if ((record as any).check_out_time) throw new ApiError(400, 'Already checked out today');

    const { data, error } = await adminDb
      .from('staff_attendance')
      .update({ check_out_time: now })
      .eq('id', (record as any).id)
      .select()
      .single();
    if (error) throw new ApiError(500, error.message);

    ok(res, { ...(data as any), checkOutTime: now });
  } catch (err) { fail(res, err); }
});

// GET /api/teacher/attendance?date=&staffId=
teacherRouter.get('/attendance', requireAuth, requireRole('PRINCIPAL', 'TEACHER'), async (req, res) => {
  try {
    const { date, staffId } = req.query as Record<string, string>;

    let q = adminDb
      .from('staff_attendance')
      .select('*, staff!inner(id, name, role, school_id)')
      .eq('staff.school_id', req.user.school_id!);

    if (date)    q = q.eq('date', date);
    if (staffId) q = q.eq('staff_id', staffId);
    else if (req.user.role === 'TEACHER') {
      const myStaffId = await getStaffId(req.user.id, req.user.school_id!);
      q = q.eq('staff_id', myStaffId);
    }

    const { data, error } = await q.order('date', { ascending: false });
    if (error) throw new ApiError(500, error.message);
    ok(res, data);
  } catch (err) { fail(res, err); }
});

// ─── Teacher Notice ────────────────────────────────────────────────────────────

// POST /api/teacher/notice/create
teacherRouter.post('/notice/create', requireAuth, requireRole('TEACHER'), async (req, res) => {
  try {
    const body = requireBody<{
      title: string; body: string; audience: string; sentByName: string;
    }>(req, ['title', 'body', 'audience']);

    const { data, error } = await adminDb
      .from('notices')
      .insert({
        school_id:    req.user.school_id,
        title:        body.title,
        body:         body.body,
        audience:     body.audience,
        sent_by:      req.user.id,
        sent_by_name: body.sentByName || req.user.name || '',
        pinned:       false,
      })
      .select('id, title, body, audience, sent_at, sent_by, sent_by_name')
      .single();
    if (error) throw new ApiError(500, error.message);
    ok(res, data, 201);
  } catch (err) { fail(res, err); }
});

// ─── Teacher Test Schedule ─────────────────────────────────────────────────────

// POST /api/teacher/test/create
teacherRouter.post('/test/create', requireAuth, requireRole('TEACHER'), async (req, res) => {
  try {
    const body = requireBody<{
      schoolId: string; academicYearId: string; sectionId: string | null;
      teacherId: string; className: string; section: string; subject: string;
      testType: string; title: string; scheduledDate: string | null;
      duration: number; maxMarks: number; syllabus: string;
    }>(req, ['academicYearId', 'teacherId', 'className', 'title', 'testType']);

    const { data, error } = await adminDb
      .from('test_schedules')
      .insert({
        school_id:       req.user.school_id,
        academic_year_id: body.academicYearId,
        section_id:      body.sectionId || null,
        teacher_id:      body.teacherId,
        class_name:      body.className,
        section:         body.section,
        subject:         body.subject,
        test_type:       body.testType,
        title:           body.title,
        scheduled_date:  body.scheduledDate || null,
        duration:        body.duration,
        max_marks:       body.maxMarks,
        syllabus:        body.syllabus,
        results_uploaded: false,
      })
      .select('id, section_id, class_name, section, subject, test_type, title, scheduled_date, duration, max_marks, syllabus, results_uploaded, result_status')
      .single();
    if (error) throw new ApiError(500, error.message);
    ok(res, data, 201);
  } catch (err) { fail(res, err); }
});

// POST /api/teacher/test/publish-results
// Bulk upsert exam_results for a test + flip results_uploaded flag.
// Teacher writes go through here because RLS only allows PRINCIPAL/SUPER_ADMIN
// direct write access on test_schedules / exam_results.
teacherRouter.post('/test/publish-results', requireAuth, requireRole('TEACHER'), async (req, res) => {
  try {
    const body = requireBody<{
      testId: string; academicYearId: string;
      results: { studentId: string; obtainedMarks: number; remarks?: string | null }[];
    }>(req, ['testId', 'academicYearId', 'results']);

    // Verify the test belongs to the caller's school (defence-in-depth — RLS
    // is bypassed since we use adminDb here).
    const { data: test, error: tErr } = await adminDb
      .from('test_schedules')
      .select('id, school_id')
      .eq('id', body.testId)
      .maybeSingle();
    if (tErr) throw new ApiError(500, tErr.message);
    if (!test) throw new ApiError(404, 'Test not found');
    if ((test as any).school_id !== req.user.school_id) {
      throw new ApiError(403, 'Test belongs to another school');
    }

    if (body.results.length > 0) {
      const rows = body.results.map(r => ({
        test_id: body.testId,
        student_id: r.studentId,
        academic_year_id: body.academicYearId,
        obtained_marks: r.obtainedMarks,
        remarks: r.remarks ?? null,
      }));
      const { error: rErr } = await adminDb
        .from('exam_results')
        .upsert(rows, { onConflict: 'test_id,student_id' });
      if (rErr) throw new ApiError(500, rErr.message);
    }

    // Flip the test into SUBMITTED — awaiting principal publish/lock.
    // result_status check constraint allows DRAFT / SUBMITTED / LOCKED.
    const { error: uErr } = await adminDb
      .from('test_schedules')
      .update({ results_uploaded: true, result_status: 'SUBMITTED' })
      .eq('id', body.testId);
    if (uErr) throw new ApiError(500, uErr.message);

    ok(res, { testId: body.testId, count: body.results.length });
  } catch (err) { fail(res, err); }
});

// ─── Teacher Complaint ─────────────────────────────────────────────────────────

// POST /api/teacher/complaint/create
teacherRouter.post('/complaint/create', requireAuth, requireRole('TEACHER'), async (req, res) => {
  try {
    const body = requireBody<{ subject: string; description: string; fromName: string }>(
      req, ['subject', 'description'],
    );

    const { data, error } = await adminDb
      .from('complaints')
      .insert({
        school_id:    req.user.school_id,
        from_role:    'TEACHER',
        from_name:    body.fromName || req.user.name || '',
        from_user_id: req.user.id,
        subject:      body.subject,
        description:  body.description,
        status:       'PENDING',
      })
      .select('id, subject, description, status, response, created_at, resolved_at')
      .single();
    if (error) throw new ApiError(500, error.message);
    ok(res, data, 201);
  } catch (err) { fail(res, err); }
});
