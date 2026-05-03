import { Router } from 'express';
import { adminDb } from '../lib/db';
import { ok, fail, ApiError, requireBody } from '../lib/helpers';
import { requireAuth, requireRole } from '../middleware/auth';

export const examsRouter = Router();

// GET /api/exam?yearId=&sectionId=
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

// POST /api/exam/create
examsRouter.post('/create', requireAuth, requireRole('PRINCIPAL', 'TEACHER'), async (req, res) => {
  try {
    const body = requireBody<{
      title: string; testType: string; className: string; subject: string;
      scheduledDate: string; maxMarks: number; academicYearId: string;
      examType?: string; passMarks?: number; passMarksConfig?: Record<string, number>;
      sectionId?: string; duration?: number; syllabus?: string;
    }>(req, ['title', 'testType', 'className', 'subject', 'scheduledDate', 'maxMarks', 'academicYearId']);

    // Resolve teacher staff_id if submitting as teacher
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

    // Immutable rule: skip students who already have results
    const { data: existing } = await adminDb
      .from('exam_results')
      .select('student_id')
      .eq('test_id', body.testId);
    const existingIds = new Set(((existing ?? []) as any[]).map(r => r.student_id));

    const maxMarks = (test as any).max_marks ?? 100;
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
    }

    // Mark test as results_uploaded
    if (toInsert.length > 0) {
      await adminDb.from('test_schedules').update({ results_uploaded: true }).eq('id', body.testId);
    }

    ok(res, {
      uploaded: toInsert.length,
      skipped:  body.results.length - toInsert.length,
    });
  } catch (err) { fail(res, err); }
});

// GET /api/exam/:testId/results
examsRouter.get('/:testId/results', requireAuth, requireRole('PRINCIPAL', 'TEACHER'), async (req, res) => {
  try {
    const { data, error } = await adminDb
      .from('exam_results')
      .select('*, students(name, admission_no)')
      .eq('test_id', req.params.testId)
      .order('obtained_marks', { ascending: false });
    if (error) throw new ApiError(500, error.message);
    ok(res, data);
  } catch (err) { fail(res, err); }
});

// POST /api/exam/:testId/lock-results — lock exam results (principal only)
examsRouter.post('/:testId/lock-results', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const { data: test, error: getErr } = await adminDb
      .from('test_schedules')
      .select('id, school_id, result_status')
      .eq('id', req.params.testId)
      .single();
    if (getErr) throw new ApiError(500, getErr.message);
    if (!test) throw new ApiError(404, 'Exam not found');
    if ((test as any).school_id !== req.user.school_id) throw new ApiError(403, 'Access denied');

    // Resolve staff_id for locked_by
    const { data: staff } = await adminDb
      .from('staff')
      .select('id')
      .eq('user_id', req.user.id)
      .eq('school_id', req.user.school_id!)
      .maybeSingle();
    const staffId = (staff as any)?.id ?? null;

    const { error: updateErr } = await adminDb
      .from('test_schedules')
      .update({
        result_status: 'LOCKED',
        locked_at: new Date().toISOString(),
        locked_by: staffId,
      })
      .eq('id', req.params.testId);
    if (updateErr) throw new ApiError(500, updateErr.message);

    ok(res, { testId: req.params.testId, resultStatus: 'LOCKED' });
  } catch (err) { fail(res, err); }
});

// POST /api/exam/:testId/unlock-results — unlock exam results (principal only)
examsRouter.post('/:testId/unlock-results', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const { data: test, error: getErr } = await adminDb
      .from('test_schedules')
      .select('id, school_id')
      .eq('id', req.params.testId)
      .single();
    if (getErr) throw new ApiError(500, getErr.message);
    if (!test) throw new ApiError(404, 'Exam not found');
    if ((test as any).school_id !== req.user.school_id) throw new ApiError(403, 'Access denied');

    const { error: updateErr } = await adminDb
      .from('test_schedules')
      .update({
        result_status: 'SUBMITTED',
        locked_at: null,
        locked_by: null,
      })
      .eq('id', req.params.testId);
    if (updateErr) throw new ApiError(500, updateErr.message);

    ok(res, { testId: req.params.testId, resultStatus: 'SUBMITTED' });
  } catch (err) { fail(res, err); }
});

// POST /api/exam/:testId/configure-pass-marks — update pass marks for FINAL exam
examsRouter.post('/:testId/configure-pass-marks', requireAuth, requireRole('PRINCIPAL', 'TEACHER'), async (req, res) => {
  try {
    const body = requireBody<{
      passMarks?: number;
      passMarksConfig?: Record<string, number>;
    }>(req, []);

    const { data: test, error: getErr } = await adminDb
      .from('test_schedules')
      .select('id, school_id, exam_type')
      .eq('id', req.params.testId)
      .single();
    if (getErr) throw new ApiError(500, getErr.message);
    if (!test) throw new ApiError(404, 'Exam not found');
    if ((test as any).school_id !== req.user.school_id) throw new ApiError(403, 'Access denied');
    if ((test as any).exam_type !== 'FINAL') throw new ApiError(400, 'Pass marks configuration only for FINAL exams');

    const updateData: any = {};
    if (body.passMarks !== undefined) updateData.pass_marks = body.passMarks;
    if (body.passMarksConfig !== undefined) updateData.pass_marks_config = body.passMarksConfig;

    const { error: updateErr } = await adminDb
      .from('test_schedules')
      .update(updateData)
      .eq('id', req.params.testId);
    if (updateErr) throw new ApiError(500, updateErr.message);

    ok(res, { testId: req.params.testId, ...updateData });
  } catch (err) { fail(res, err); }
});
