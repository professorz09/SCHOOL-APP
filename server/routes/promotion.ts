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
        id, student_id, roll_no, status,
        students!inner(id, name, father_name),
        sections!inner(id, class_name, section_name)
      `)
      .eq('sections.academic_year_id', fromYearId)
      .eq('status', 'STUDYING');
    if (error) throw new ApiError(500, error.message);

    // Already assigned to new year?
    const { data: newYearRecords } = await adminDb
      .from('student_academic_records')
      .select('student_id')
      .eq('academic_year_id', toYearId);

    const alreadyAssigned = new Set((newYearRecords ?? []).map((r: any) => r.student_id));

    const preview = (records ?? []).map((r: any) => ({
      studentId:   r.student_id,
      studentName: r.students?.name,
      fromClass:   r.sections?.class_name,
      fromSection: r.sections?.section_name,
      rollNo:      r.roll_no,
      status:      alreadyAssigned.has(r.student_id) ? 'ALREADY_ASSIGNED' : 'PENDING',
    }));

    ok(res, { total: preview.length, preview });
  } catch (err) { fail(res, err); }
});

// POST /api/promotion/execute
promotionRouter.post('/execute', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const body = requireBody<{
      fromYearId: string; toYearId: string;
      promotions: { studentId: string; toSectionId: string; rollNo?: number }[];
    }>(req, ['fromYearId', 'toYearId', 'promotions']);

    if (!Array.isArray(body.promotions) || body.promotions.length === 0) {
      throw new ApiError(400, 'promotions array required');
    }

    let promoted = 0;
    let skipped  = 0;

    for (const p of body.promotions) {
      // Mark old record as PROMOTED (immutable — new record for new year)
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

      const { error } = await adminDb
        .from('student_academic_records')
        .insert({
          student_id:       p.studentId,
          academic_year_id: body.toYearId,
          section_id:       p.toSectionId,
          roll_no:          p.rollNo ?? null,
          status:           'STUDYING',
        });
      if (error) throw new ApiError(500, error.message);
      promoted++;
    }

    await adminDb.rpc('log_audit', {
      p_action: 'PROMOTE_STUDENTS',
      p_entity_type: 'academic_year',
      p_entity_id: body.toYearId,
      p_details: { promoted, skipped, fromYearId: body.fromYearId },
    });
    ok(res, { promoted, skipped });
  } catch (err) { fail(res, err); }
});
