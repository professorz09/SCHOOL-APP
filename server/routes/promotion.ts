import { Router } from 'express';
import { adminDb } from '../lib/db';
import { ok, fail, ApiError, requireBody } from '../lib/helpers';
import { requireAuth, requireRole } from '../middleware/auth';

export const promotionRouter = Router();

const PRINCIPAL = requireRole('PRINCIPAL');

// GET /api/promotion/preview?fromYearId=&toYearId=
promotionRouter.get('/preview', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const { fromYearId, toYearId } = req.query as Record<string, string>;
    if (!fromYearId || !toYearId) throw new ApiError(400, 'fromYearId and toYearId required');

    const { data: records, error } = await adminDb
      .from('student_academic_records')
      .select(`
        id, student_id, roll_no, class_name, section, status,
        students!inner(id, name, father_name, admission_no, school_id)
      `)
      .eq('academic_year_id', fromYearId)
      .eq('students.school_id', req.user.school_id!)
      .eq('status', 'STUDYING');
    if (error) throw new ApiError(500, error.message);

    // Who's already in new year?
    const { data: newYearRecords } = await adminDb
      .from('student_academic_records')
      .select('student_id')
      .eq('academic_year_id', toYearId);

    const alreadyAssigned = new Set(((newYearRecords ?? []) as any[]).map(r => r.student_id));

    const preview = ((records ?? []) as any[]).map(r => ({
      studentId:    r.student_id,
      studentName:  r.students?.name,
      admissionNo:  r.students?.admission_no,
      fromClass:    r.class_name,
      fromSection:  r.section,
      rollNo:       r.roll_no,
      status:       alreadyAssigned.has(r.student_id) ? 'ALREADY_ASSIGNED' : 'PENDING',
    }));

    ok(res, {
      total:           preview.length,
      pending:         preview.filter(p => p.status === 'PENDING').length,
      alreadyAssigned: preview.filter(p => p.status === 'ALREADY_ASSIGNED').length,
      preview,
    });
  } catch (err) { fail(res, err); }
});

// POST /api/promotion/execute
promotionRouter.post('/execute', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const body = requireBody<{
      fromYearId: string; toYearId: string;
      promotions: {
        studentId: string; toClassName: string; toSection: string;
        rollNo?: string; toSectionId?: string;
      }[];
    }>(req, ['fromYearId', 'toYearId', 'promotions']);

    if (!Array.isArray(body.promotions) || body.promotions.length === 0) {
      throw new ApiError(400, 'promotions array required');
    }

    let promoted = 0;
    let skipped  = 0;
    const errors: { studentId: string; error: string }[] = [];

    for (const p of body.promotions) {
      try {
        // Mark old record as PROMOTED — immutable rule
        await adminDb
          .from('student_academic_records')
          .update({ status: 'PROMOTED' })
          .eq('student_id', p.studentId)
          .eq('academic_year_id', body.fromYearId);

        // Check if already in new year
        const { data: existing } = await adminDb
          .from('student_academic_records')
          .select('id')
          .eq('student_id', p.studentId)
          .eq('academic_year_id', body.toYearId)
          .maybeSingle();

        if (existing) { skipped++; continue; }

        // Resolve section_id if not provided
        let sectionId = p.toSectionId ?? null;
        if (!sectionId) {
          const { data: sec } = await adminDb
            .from('sections')
            .select('id')
            .eq('school_id', req.user.school_id!)
            .eq('academic_year_id', body.toYearId)
            .eq('class_name', p.toClassName)
            .eq('section', p.toSection)
            .maybeSingle();
          sectionId = (sec as any)?.id ?? null;
        }

        const { error } = await adminDb
          .from('student_academic_records')
          .insert({
            student_id:       p.studentId,
            academic_year_id: body.toYearId,
            section_id:       sectionId,
            class_name:       p.toClassName,
            section:          p.toSection,
            roll_no:          p.rollNo ?? null,
            fee_status:       'PENDING',
            total_fee:        0,
            paid_fee:         0,
            attendance_percent: 0,
            status:           'STUDYING',
          });
        if (error) throw new Error(error.message);
        promoted++;
      } catch (e) {
        errors.push({ studentId: p.studentId, error: e instanceof Error ? e.message : String(e) });
      }
    }

    ok(res, { promoted, skipped, errors });
  } catch (err) { fail(res, err); }
});
