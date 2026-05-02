import { Router } from 'express';
import { adminDb } from '../lib/db';
import { ok, fail, ApiError, requireBody } from '../lib/helpers';
import { requireAuth, requireRole } from '../middleware/auth';

export const examsRouter = Router();

// POST /api/exam/create
examsRouter.post('/create', requireAuth, requireRole('PRINCIPAL', 'TEACHER'), async (req, res) => {
  try {
    const body = requireBody<{
      type: string; className: string; subject: string;
      date: string; maxMarks: number; academicYearId: string; sectionId?: string;
    }>(req, ['type', 'className', 'subject', 'date', 'maxMarks', 'academicYearId']);

    const { data, error } = await adminDb
      .from('exams')
      .insert({
        school_id:        req.user.school_id,
        academic_year_id: body.academicYearId,
        type:             body.type,
        class:            body.className,
        subject:          body.subject,
        date:             body.date,
        max_marks:        body.maxMarks,
        section_id:       body.sectionId ?? null,
        created_by:       req.user.id,
      })
      .select()
      .single();
    if (error) throw new ApiError(500, error.message);

    await adminDb.rpc('log_audit', {
      p_action: 'CREATE_EXAM',
      p_entity_type: 'exam',
      p_entity_id: data.id,
      p_details: { type: body.type, subject: body.subject, date: body.date },
    });
    ok(res, data, 201);
  } catch (err) { fail(res, err); }
});

// GET /api/exam?yearId=&class=
examsRouter.get('/', requireAuth, requireRole('PRINCIPAL', 'TEACHER'), async (req, res) => {
  try {
    const { yearId, className } = req.query as Record<string, string>;
    let q = adminDb.from('exams').select('*').eq('school_id', req.user.school_id!);
    if (yearId)    q = q.eq('academic_year_id', yearId);
    if (className) q = q.eq('class', className);
    const { data, error } = await q.order('date', { ascending: false });
    if (error) throw new ApiError(500, error.message);
    ok(res, data);
  } catch (err) { fail(res, err); }
});

// POST /api/result/upload
examsRouter.post('/result/upload', requireAuth, requireRole('PRINCIPAL', 'TEACHER'), async (req, res) => {
  try {
    const body = requireBody<{
      examId: string;
      results: { studentId: string; marks: number; grade?: string }[];
    }>(req, ['examId', 'results']);

    if (!Array.isArray(body.results) || body.results.length === 0) {
      throw new ApiError(400, 'results array required');
    }

    const { data: exam } = await adminDb
      .from('exams')
      .select('id, max_marks, school_id')
      .eq('id', body.examId)
      .single();
    if (!exam) throw new ApiError(404, 'Exam not found');

    // Upsert results — immutable: create new, never overwrite marks
    // If a result already exists, skip (immutable rule)
    const { data: existing } = await adminDb
      .from('results')
      .select('student_id')
      .eq('exam_id', body.examId);

    const existingIds = new Set((existing ?? []).map((r: any) => r.student_id));
    const toInsert = body.results
      .filter(r => !existingIds.has(r.studentId))
      .map(r => ({
        exam_id:    body.examId,
        student_id: r.studentId,
        marks:      r.marks,
        grade:      r.grade ?? null,
        pass_fail:  r.marks >= (exam.max_marks * 0.33) ? 'PASS' : 'FAIL',
      }));

    if (toInsert.length > 0) {
      const { error } = await adminDb.from('results').insert(toInsert);
      if (error) throw new ApiError(500, error.message);
    }

    await adminDb.rpc('log_audit', {
      p_action: 'UPLOAD_EXAM_RESULTS',
      p_entity_type: 'exam',
      p_entity_id: body.examId,
      p_details: { uploaded: toInsert.length, skipped: body.results.length - toInsert.length },
    });
    ok(res, { uploaded: toInsert.length, skipped: body.results.length - toInsert.length });
  } catch (err) { fail(res, err); }
});
