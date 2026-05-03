import { Router } from 'express';
import { adminDb, userDb } from '../lib/db';
import { ok, fail, ApiError, requireBody } from '../lib/helpers';
import { requireAuth, requireRole } from '../middleware/auth';

export const promotionRouter = Router();

const PRINCIPAL = requireRole('PRINCIPAL');

// GET /api/promotion/preview?fromYearId=&toYearId=
// Returns per-student promotion candidates with auto-suggested decision
// based on final exam results (pass → PROMOTE, fail → RETAIN, 12th → TC).
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

    // Fetch final exam pass/fail: look for a final-type test in this year.
    // Column: exam_results.obtained_marks (not marks_obtained).
    // test_schedules has no passing_marks column — we default to 33% of max_marks.
    const { data: finalTests } = await adminDb
      .from('test_schedules')
      .select('id, class_name, max_marks')
      .eq('school_id', req.user.school_id!)
      .eq('academic_year_id', fromYearId)
      .in('test_type', ['FINAL', 'final', 'MAIN', 'main_exam', 'Annual', 'annual']);

    // Build a map: student_id → passed (bool)
    const studentPassMap = new Map<string, boolean>();

    if (finalTests && finalTests.length > 0) {
      const testIds = (finalTests as any[]).map(t => t.id);
      const { data: results } = await adminDb
        .from('exam_results')
        .select('student_id, obtained_marks, test_id')
        .in('test_id', testIds)
        .eq('academic_year_id', fromYearId);

      if (results && results.length > 0) {
        const testMap = new Map<string, any>((finalTests as any[]).map(t => [t.id, t]));
        const byStudent = new Map<string, { obtained: number; max: number }>();

        for (const r of results as any[]) {
          const test = testMap.get(r.test_id);
          if (!test) continue;
          const cur = byStudent.get(r.student_id) ?? { obtained: 0, max: 0 };
          cur.obtained += Number(r.obtained_marks ?? 0);
          cur.max      += Number(test.max_marks ?? 100);
          byStudent.set(r.student_id, cur);
        }

        for (const [sid, totals] of byStudent) {
          // Pass if obtained >= 33% of max (standard Indian board threshold)
          const passingThreshold = totals.max * 0.33;
          studentPassMap.set(sid, totals.obtained >= passingThreshold);
        }
      }
    }

    const preview = ((records ?? []) as any[]).map(r => {
      const fc: string = r.class_name ?? '';
      const is12 = /^12th/i.test(fc.trim());
      const hasExamData = studentPassMap.has(r.student_id);
      const examPassed  = studentPassMap.get(r.student_id) ?? null;

      let suggestedDecision: 'PROMOTE' | 'RETAIN' | 'TC' = 'PROMOTE';
      if (is12) {
        suggestedDecision = 'TC';
      } else if (hasExamData) {
        suggestedDecision = examPassed ? 'PROMOTE' : 'RETAIN';
      }

      return {
        studentId:         r.student_id,
        recordId:          r.id,
        studentName:       r.students?.name,
        admissionNo:       r.students?.admission_no,
        fromClass:         fc,
        fromSection:       r.section,
        rollNo:            r.roll_no,
        status:            alreadyAssigned.has(r.student_id) ? 'ALREADY_ASSIGNED' : 'PENDING',
        examPassed:        hasExamData ? examPassed : null,
        hasExamData,
        suggestedDecision,
      };
    });

    ok(res, {
      total:           preview.length,
      pending:         preview.filter(p => p.status === 'PENDING').length,
      alreadyAssigned: preview.filter(p => p.status === 'ALREADY_ASSIGNED').length,
      hasAnyExamData:  studentPassMap.size > 0,
      preview,
    });
  } catch (err) { fail(res, err); }
});

// POST /api/promotion/execute
// Handles PROMOTE, RETAIN, and TC decisions.
// - PROMOTE: creates new academic record in destination year + updates promoted_to_record_id
// - RETAIN:  marks old record as FAILED; student stays for re-enrolment
// - TC:      marks old record as TRANSFERRED; inserts tc_records row; tc_date required
// All decisions are logged in promotion_log.
promotionRouter.post('/execute', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const body = requireBody<{
      fromYearId: string; toYearId: string;
      promotions: {
        studentId: string; recordId?: string;
        decision: 'PROMOTE' | 'RETAIN' | 'TC';
        toClassName?: string; toSection?: string;
        rollNo?: string; toSectionId?: string;
        tcDate?: string; tcRemarks?: string;
        feeStructureId?: string;
      }[];
    }>(req, ['fromYearId', 'toYearId', 'promotions']);

    if (!Array.isArray(body.promotions) || body.promotions.length === 0) {
      throw new ApiError(400, 'promotions array required');
    }

    const schoolId = req.user.school_id!;
    let promoted = 0;
    let retained = 0;
    let tcIssued = 0;
    let skipped  = 0;
    const errors: { studentId: string; error: string }[] = [];

    // Resolve the caller's user id for audit columns
    const { data: userRow } = await adminDb
      .from('users')
      .select('id')
      .eq('id', req.user.id)
      .maybeSingle();
    const issuedBy = (userRow as any)?.id ?? null;

    for (const p of body.promotions) {
      try {
        // Fetch the from-record to get its id for audit linkage
        const { data: fromRec } = await adminDb
          .from('student_academic_records')
          .select('id')
          .eq('student_id', p.studentId)
          .eq('academic_year_id', body.fromYearId)
          .maybeSingle();
        const fromRecordId = p.recordId ?? (fromRec as any)?.id ?? null;

        if (p.decision === 'PROMOTE') {
          // ── PROMOTE ─────────────────────────────────────────────────────────
          if (!p.toClassName?.trim()) throw new Error('toClassName is required for PROMOTE');

          // Check already in new year
          const { data: existing } = await adminDb
            .from('student_academic_records')
            .select('id')
            .eq('student_id', p.studentId)
            .eq('academic_year_id', body.toYearId)
            .maybeSingle();
          if (existing) { skipped++; continue; }

          // Resolve section_id
          let sectionId = p.toSectionId ?? null;
          if (!sectionId && p.toSection) {
            const { data: sec } = await adminDb
              .from('sections')
              .select('id')
              .eq('school_id', schoolId)
              .eq('academic_year_id', body.toYearId)
              .eq('class_name', p.toClassName)
              .eq('section', p.toSection)
              .maybeSingle();
            sectionId = (sec as any)?.id ?? null;
          }

          const { data: newRec, error: insErr } = await adminDb
            .from('student_academic_records')
            .insert({
              student_id:         p.studentId,
              academic_year_id:   body.toYearId,
              section_id:         sectionId,
              class_name:         p.toClassName,
              section:            p.toSection ?? '',
              roll_no:            p.rollNo ?? null,
              fee_status:         'PENDING',
              total_fee:          0,
              paid_fee:           0,
              attendance_percent: 0,
              status:             'STUDYING',
            })
            .select('id')
            .single();
          if (insErr) throw new Error(insErr.message);

          const newRecordId = (newRec as any).id;

          // Mark old record as PROMOTED + set promoted_to_record_id
          await adminDb
            .from('student_academic_records')
            .update({ status: 'PROMOTED', promoted_to_record_id: newRecordId })
            .eq('student_id', p.studentId)
            .eq('academic_year_id', body.fromYearId);

          // Generate fee schedule for new year if feeStructureId provided
          if (p.feeStructureId) {
            const { data: feeStruct } = await adminDb
              .from('fee_structures')
              .select('fee_heads, monthly_due_dates')
              .eq('id', p.feeStructureId)
              .maybeSingle();
            if (feeStruct) {
              const db = userDb(req.jwt);
              await db.rpc('generate_student_fee_schedule', {
                p_student_id:      p.studentId,
                p_year_id:         body.toYearId,
                p_heads:           (feeStruct as any).fee_heads ?? [],
                p_due_dates:       (feeStruct as any).monthly_due_dates ?? [],
                p_is_rte:          false,
                p_discount_amount: 0,
                p_discount_pct:    0,
              });
            }
          }

          // Log
          await adminDb.from('promotion_log').insert({
            school_id:      schoolId,
            from_year_id:   body.fromYearId,
            to_year_id:     body.toYearId,
            student_id:     p.studentId,
            from_record_id: fromRecordId,
            to_record_id:   newRecordId,
            decision:       'PROMOTE',
            from_class:     null,
            to_class:       p.toClassName,
            promoted_by:    issuedBy,
          });

          promoted++;

        } else if (p.decision === 'RETAIN') {
          // ── RETAIN ──────────────────────────────────────────────────────────
          await adminDb
            .from('student_academic_records')
            .update({ status: 'FAILED' })
            .eq('student_id', p.studentId)
            .eq('academic_year_id', body.fromYearId);

          await adminDb.from('promotion_log').insert({
            school_id:      schoolId,
            from_year_id:   body.fromYearId,
            to_year_id:     body.toYearId,
            student_id:     p.studentId,
            from_record_id: fromRecordId,
            to_record_id:   null,
            decision:       'RETAIN',
            from_class:     null,
            to_class:       null,
            promoted_by:    issuedBy,
          });

          retained++;

        } else if (p.decision === 'TC') {
          // ── TC ───────────────────────────────────────────────────────────────
          const tcDate = p.tcDate ?? new Date().toISOString().split('T')[0];

          await adminDb
            .from('student_academic_records')
            .update({ status: 'TRANSFERRED' })
            .eq('student_id', p.studentId)
            .eq('academic_year_id', body.fromYearId);

          // Upsert tc_records (ignore duplicate for same student+year)
          await adminDb.from('tc_records').upsert({
            school_id:        schoolId,
            student_id:       p.studentId,
            academic_year_id: body.fromYearId,
            from_record_id:   fromRecordId,
            tc_date:          tcDate,
            remarks:          p.tcRemarks ?? null,
            issued_by:        issuedBy,
          }, { onConflict: 'student_id,academic_year_id', ignoreDuplicates: false });

          await adminDb.from('promotion_log').insert({
            school_id:      schoolId,
            from_year_id:   body.fromYearId,
            to_year_id:     null,
            student_id:     p.studentId,
            from_record_id: fromRecordId,
            to_record_id:   null,
            decision:       'TC',
            from_class:     null,
            to_class:       null,
            tc_date:        tcDate,
            promoted_by:    issuedBy,
          });

          tcIssued++;
        }
      } catch (e) {
        errors.push({ studentId: p.studentId, error: e instanceof Error ? e.message : String(e) });
      }
    }

    ok(res, { promoted, retained, tcIssued, skipped, errors });
  } catch (err) { fail(res, err); }
});

// GET /api/promotion/previous-year-data?yearId=
// Returns classes/sections and fee structures from the given year
// (used by the new-year wizard to pre-fill from the previous year).
promotionRouter.get('/previous-year-data', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const { yearId } = req.query as Record<string, string>;
    if (!yearId) throw new ApiError(400, 'yearId required');

    const schoolId = req.user.school_id!;

    // Verify year belongs to school
    const { data: yr } = await adminDb
      .from('academic_years')
      .select('id, label')
      .eq('id', yearId)
      .eq('school_id', schoolId)
      .maybeSingle();
    if (!yr) throw new ApiError(404, 'Academic year not found');

    // Sections: class_name + section + stream + capacity
    const { data: sections, error: secErr } = await adminDb
      .from('sections')
      .select('id, class_name, section, stream, capacity')
      .eq('academic_year_id', yearId)
      .eq('school_id', schoolId)
      .order('class_name')
      .order('section');
    if (secErr) throw new ApiError(500, secErr.message);

    // Fee structures for this year
    const { data: feeStructures, error: feeErr } = await adminDb
      .from('fee_structures')
      .select('id, name, class_name, billing_cycle, structure_type')
      .eq('academic_year_id', yearId)
      .eq('school_id', schoolId)
      .order('name');
    if (feeErr) throw new ApiError(500, feeErr.message);

    ok(res, {
      yearLabel:     (yr as any).label,
      sections:      sections ?? [],
      feeStructures: feeStructures ?? [],
    });
  } catch (err) { fail(res, err); }
});
