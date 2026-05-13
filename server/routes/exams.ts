import { Router } from 'express';
import { adminDb } from '../lib/db';
import { ok, fail, ApiError, requireBody } from '../lib/helpers';
import { requireAuth, requireRole, requireEditorMode } from '../middleware/auth';

export const examsRouter = Router();

// GET /api/exam?yearId=&sectionId=&className=
examsRouter.get('/', requireAuth, requireRole('PRINCIPAL', 'TEACHER'), async (req, res) => {
  try {
    const { yearId, sectionId, className } = req.query as Record<string, string>;
    let q = adminDb.from('test_schedules').select('*').eq('school_id', req.user.school_id!);
    if (yearId)    q = q.eq('academic_year_id', yearId);
    if (sectionId) q = q.eq('section_id', sectionId);
    if (className) q = q.eq('class_name', className);
    const { data, error } = await q.order('scheduled_date', { ascending: false });
    if (error) throw new ApiError(500, error.message);
    ok(res, data);
  } catch (err) { fail(res, err); }
});

// GET /api/exam/marksheet?className=&yearId=
// Returns all FINAL exam results for every student in the class, grouped by student.
examsRouter.get('/marksheet', requireAuth, requireRole('PRINCIPAL', 'TEACHER', 'PARENT', 'STUDENT'), async (req, res) => {
  try {
    const { className, yearId } = req.query as Record<string, string>;
    if (!className || !yearId) throw new ApiError(400, 'className and yearId required');

    // Get all FINAL exams for this class / year
    const { data: exams, error: eErr } = await adminDb
      .from('test_schedules')
      .select('id, title, subject, max_marks, pass_marks, pass_marks_config, scheduled_date, result_status')
      .eq('school_id', req.user.school_id!)
      .eq('academic_year_id', yearId)
      .eq('class_name', className)
      .eq('exam_type', 'FINAL')
      .order('scheduled_date');
    if (eErr) throw new ApiError(500, eErr.message);
    if (!exams || exams.length === 0) { ok(res, { exams: [], students: [] }); return; }

    const examIds = (exams as any[]).map(e => e.id);

    // Get all results for these exams
    const { data: results, error: rErr } = await adminDb
      .from('exam_results')
      .select('test_id, student_id, obtained_marks, grade, remarks, students(id, name, admission_no, roll_no, class_name, section)')
      .in('test_id', examIds);
    if (rErr) throw new ApiError(500, rErr.message);

    // Group results by student
    const studentMap = new Map<string, any>();
    for (const r of ((results ?? []) as any[])) {
      if (!r.students) continue;
      const sid = r.student_id;
      if (!studentMap.has(sid)) {
        studentMap.set(sid, {
          studentId: sid,
          name: r.students.name,
          admissionNo: r.students.admission_no,
          rollNo: r.students.roll_no,
          className: r.students.class_name,
          section: r.students.section,
          results: {},
        });
      }
      studentMap.get(sid).results[r.test_id] = {
        obtainedMarks: r.obtained_marks,
        grade: r.grade,
        remarks: r.remarks,
      };
    }

    ok(res, {
      exams,
      students: Array.from(studentMap.values()).sort((a, b) =>
        (parseInt(a.rollNo) || 9999) - (parseInt(b.rollNo) || 9999)
      ),
    });
  } catch (err) { fail(res, err); }
});

// POST /api/exam/create
examsRouter.post('/create', requireAuth, requireRole('PRINCIPAL', 'TEACHER'), async (req, res) => {
  try {
    const body = requireBody<{
      title: string; testType: string; className: string; subject: string;
      scheduledDate: string; maxMarks: number; academicYearId: string;
      examType?: string; passMarks?: number; passMarksConfig?: Record<string, number>;
      sectionId?: string; duration?: number; syllabus?: string;
    }>(req, ['title', 'testType', 'className', 'subject', 'scheduledDate', 'maxMarks', 'academicYearId']);

    let staffId: string | null = null;
    if (req.user.role === 'TEACHER') {
      const { data: staff } = await adminDb
        .from('staff')
        .select('id')
        .eq('user_id', req.user.id)
        .eq('school_id', req.user.school_id!)
        .maybeSingle();
      staffId = (staff as any)?.id ?? null;
    }

    const { data, error } = await adminDb
      .from('test_schedules')
      .insert({
        school_id:          req.user.school_id,
        academic_year_id:   body.academicYearId,
        section_id:         body.sectionId ?? null,
        teacher_id:         staffId,
        class_name:         body.className,
        subject:            body.subject,
        test_type:          body.testType,
        title:              body.title,
        scheduled_date:     body.scheduledDate,
        max_marks:          body.maxMarks,
        duration:           body.duration ?? null,
        syllabus:           body.syllabus ?? null,
        results_uploaded:   false,
        exam_type:          body.examType ?? 'REGULAR',
        pass_marks:         body.passMarks ?? null,
        pass_marks_config:  body.passMarksConfig ?? {},
        result_status:      'DRAFT',
      })
      .select()
      .single();
    if (error) throw new ApiError(500, error.message);

    ok(res, data, 201);
  } catch (err) { fail(res, err); }
});

// POST /api/exam/result/upload
examsRouter.post('/result/upload', requireAuth, requireRole('PRINCIPAL', 'TEACHER'), async (req, res) => {
  try {
    const body = requireBody<{
      testId: string; academicYearId: string;
      results: { studentId: string; marks: number; grade?: string; remarks?: string }[];
    }>(req, ['testId', 'academicYearId', 'results']);

    if (!Array.isArray(body.results) || body.results.length === 0) {
      throw new ApiError(400, 'results array required');
    }

    const { data: test } = await adminDb
      .from('test_schedules')
      .select('id, max_marks, school_id')
      .eq('id', body.testId)
      .single();
    if (!test) throw new ApiError(404, 'Test not found');
    if ((test as any).school_id !== req.user.school_id) throw new ApiError(403, 'Access denied');

    // Validate that every student in the batch belongs to the caller's school.
    // The test ownership check above only guards the test row itself; without
    // this check a teacher could inject exam results for students from another
    // school by supplying foreign student IDs in the results array.
    const submittedStudentIds = body.results.map((r: any) => r.studentId);
    if (submittedStudentIds.length > 0) {
      const { data: validStudents } = await adminDb
        .from('students').select('id')
        .eq('school_id', req.user.school_id!).in('id', submittedStudentIds);
      const validSet = new Set(((validStudents ?? []) as any[]).map((r: any) => r.id));
      const intruder = submittedStudentIds.find((id: string) => !validSet.has(id));
      if (intruder) throw new ApiError(403, `Student ${intruder} does not belong to this school`);
    }

    const { data: existing } = await adminDb
      .from('exam_results')
      .select('student_id')
      .eq('test_id', body.testId);
    const existingIds = new Set(((existing ?? []) as any[]).map(r => r.student_id));

    const maxMarks = (test as any).max_marks ?? 100;
    // Validate each row's marks against the test's max_marks — earlier
    // this endpoint silently accepted negative values or marks > max
    // (only /edit-results and the teacher path enforced the range).
    for (const r of body.results) {
      const m = Number(r.marks);
      if (!Number.isFinite(m) || m < 0 || m > maxMarks) {
        throw new ApiError(400, `Marks must be between 0 and ${maxMarks} (got ${r.marks} for student ${r.studentId})`);
      }
    }
    const toInsert = body.results
      .filter(r => !existingIds.has(r.studentId))
      .map(r => ({
        test_id:          body.testId,
        student_id:       r.studentId,
        academic_year_id: body.academicYearId,
        obtained_marks:   r.marks,
        grade:            r.grade ?? null,
        remarks:          r.remarks ?? null,
      }));

    if (toInsert.length > 0) {
      const { error } = await adminDb.from('exam_results').insert(toInsert);
      if (error) throw new ApiError(500, error.message);
      await adminDb.from('test_schedules').update({ results_uploaded: true }).eq('id', body.testId);
    }

    ok(res, { uploaded: toInsert.length, skipped: body.results.length - toInsert.length });
  } catch (err) { fail(res, err); }
});

// GET /api/exam/:testId/results
examsRouter.get('/:testId/results', requireAuth, requireRole('PRINCIPAL', 'TEACHER'), async (req, res) => {
  try {
    // Verify the test belongs to the caller's school before exposing results.
    const { data: test } = await adminDb
      .from('test_schedules').select('id, school_id')
      .eq('id', req.params.testId).maybeSingle();
    if (!test) throw new ApiError(404, 'Test not found');
    if ((test as any).school_id !== req.user.school_id) throw new ApiError(403, 'Access denied');

    const { data, error } = await adminDb
      .from('exam_results')
      .select('*, students(name, admission_no)')
      .eq('test_id', req.params.testId)
      .order('obtained_marks', { ascending: false });
    if (error) throw new ApiError(500, error.message);
    ok(res, data);
  } catch (err) { fail(res, err); }
});

// POST /api/exam/:testId/lock-results
examsRouter.post('/:testId/lock-results', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const { data: test, error: getErr } = await adminDb
      .from('test_schedules').select('id, school_id').eq('id', req.params.testId).single();
    if (getErr) throw new ApiError(500, getErr.message);
    if (!test) throw new ApiError(404, 'Exam not found');
    if ((test as any).school_id !== req.user.school_id) throw new ApiError(403, 'Access denied');

    const { data: staff } = await adminDb
      .from('staff').select('id').eq('user_id', req.user.id).eq('school_id', req.user.school_id!).maybeSingle();

    await adminDb.from('test_schedules').update({
      result_status: 'LOCKED',
      locked_at: new Date().toISOString(),
      locked_by: (staff as any)?.id ?? null,
    }).eq('id', req.params.testId);

    ok(res, { testId: req.params.testId, resultStatus: 'LOCKED' });
  } catch (err) { fail(res, err); }
});

// POST /api/exam/:testId/unlock-results
examsRouter.post('/:testId/unlock-results', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const { data: test, error: getErr } = await adminDb
      .from('test_schedules').select('id, school_id').eq('id', req.params.testId).single();
    if (getErr) throw new ApiError(500, getErr.message);
    if (!test) throw new ApiError(404, 'Exam not found');
    if ((test as any).school_id !== req.user.school_id) throw new ApiError(403, 'Access denied');

    await adminDb.from('test_schedules').update({
      result_status: 'SUBMITTED', locked_at: null, locked_by: null,
    }).eq('id', req.params.testId);

    ok(res, { testId: req.params.testId, resultStatus: 'SUBMITTED' });
  } catch (err) { fail(res, err); }
});

// POST /api/exam/:testId/edit-results
// Principal-only. Upserts marks for an already-uploaded test (including
// LOCKED ones). The principal must have Editor Mode toggled on for the
// active year — that's enforced in the UI store, but the server still logs
// the override flag for audit. Marks above max_marks are rejected.
examsRouter.post('/:testId/edit-results', requireAuth, requireRole('PRINCIPAL'), requireEditorMode, async (req, res) => {
  try {
    const body = requireBody<{
      academicYearId: string;
      results: { studentId: string; marks: number; remarks?: string | null }[];
    }>(req, ['academicYearId', 'results']);

    const { data: test, error: tErr } = await adminDb
      .from('test_schedules')
      .select('id, school_id, max_marks, result_status')
      .eq('id', req.params.testId)
      .maybeSingle();
    if (tErr) throw new ApiError(500, tErr.message);
    if (!test) throw new ApiError(404, 'Test not found');
    if ((test as any).school_id !== req.user.school_id) throw new ApiError(403, 'Access denied');

    const maxMarks = (test as any).max_marks ?? 100;
    for (const r of body.results) {
      if (r.marks < 0 || r.marks > maxMarks) {
        throw new ApiError(400, `Marks ${r.marks} for student ${r.studentId} out of range (0..${maxMarks})`);
      }
    }

    const rows = body.results.map(r => ({
      test_id: req.params.testId,
      student_id: r.studentId,
      academic_year_id: body.academicYearId,
      obtained_marks: r.marks,
      remarks: r.remarks ?? null,
    }));
    const { error: uErr } = await adminDb
      .from('exam_results')
      .upsert(rows, { onConflict: 'test_id,student_id' });
    if (uErr) throw new ApiError(500, uErr.message);

    ok(res, { testId: req.params.testId, count: rows.length, status: (test as any).result_status });
  } catch (err) { fail(res, err); }
});

// POST /api/exam/:testId/configure-pass-marks
examsRouter.post('/:testId/configure-pass-marks', requireAuth, requireRole('PRINCIPAL', 'TEACHER'), async (req, res) => {
  try {
    const body = requireBody<{ passMarks?: number; passMarksConfig?: Record<string, number> }>(req, []);

    const { data: test, error: getErr } = await adminDb
      .from('test_schedules').select('id, school_id, exam_type').eq('id', req.params.testId).single();
    if (getErr) throw new ApiError(500, getErr.message);
    if (!test) throw new ApiError(404, 'Exam not found');
    if ((test as any).school_id !== req.user.school_id) throw new ApiError(403, 'Access denied');
    if ((test as any).exam_type !== 'FINAL') throw new ApiError(400, 'Pass marks configuration only for FINAL exams');

    const updateData: any = {};
    if (body.passMarks !== undefined) updateData.pass_marks = body.passMarks;
    if (body.passMarksConfig !== undefined) updateData.pass_marks_config = body.passMarksConfig;

    await adminDb.from('test_schedules').update(updateData).eq('id', req.params.testId);
    ok(res, { testId: req.params.testId, ...updateData });
  } catch (err) { fail(res, err); }
});
