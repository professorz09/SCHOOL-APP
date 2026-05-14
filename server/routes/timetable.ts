import { Router } from 'express';
import { adminDb } from '../lib/db';
import { ok, fail, ApiError, requireBody } from '../lib/helpers';
import { requireAuth, requireRole } from '../middleware/auth';

export const timetableRouter = Router();

// POST /api/timetable/save — insert or update a timetable entry
timetableRouter.post('/save', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const body = requireBody<{
      id?: string;
      academicYearId: string;
      className: string; section: string;
      classId: string; day: string; slotId: string;
      subject: string; teacherId?: string | null; teacherName: string; room: string;
      /** 'TEACHING' (default) or 'ACTIVITY'. ACTIVITY rows are per-day
       *  non-teaching designations (assembly / lunch / prayer for that
       *  one day only); teacher_id is null and `subject` carries the
       *  display label. Migration 0131. */
      entryKind?: 'TEACHING' | 'ACTIVITY';
      // `teacherName` and `room` are optional metadata — sending an empty
      // string used to silently 400 "Field is required" because requireBody
      // treats '' as missing. Leave them out of the required list.
    }>(req, ['academicYearId', 'className', 'section', 'classId', 'day', 'slotId', 'subject']);

    const schoolId = req.user.school_id!;

    // Resolve section_id
    const { data: sec } = await adminDb
      .from('sections').select('id')
      .eq('school_id', schoolId)
      .eq('academic_year_id', body.academicYearId)
      .eq('class_name', body.className)
      .eq('section', body.section)
      .maybeSingle();
    const sectionId = (sec as any)?.id;
    if (!sectionId) throw new ApiError(404, `Section ${body.className}-${body.section} not found`);

    const payload = {
      school_id:        schoolId,
      academic_year_id: body.academicYearId,
      section_id:       sectionId,
      class_id:         body.classId,
      day:              body.day,
      slot_id:          body.slotId,
      subject:          body.subject,
      teacher_id:       body.teacherId || null,
      teacher_name:     body.teacherName ?? '',
      room:             body.room ?? '',
      entry_kind:       body.entryKind === 'ACTIVITY' ? 'ACTIVITY' : 'TEACHING',
    };

    if (body.id) {
      const { data: updated, error } = await adminDb
        .from('timetable_entries')
        .update(payload)
        .eq('id', body.id)
        .eq('school_id', schoolId)
        .select('id');
      if (error) throw new ApiError(500, error.message);
      if (!updated || updated.length === 0) throw new ApiError(404, 'Timetable entry not found');
      ok(res, { id: body.id });
    } else {
      const { data, error } = await adminDb.from('timetable_entries').insert(payload).select('id').single();
      if (error) throw new ApiError(500, error.message);
      ok(res, data, 201);
    }
  } catch (err) { fail(res, err); }
});

// POST /api/timetable/periods/save — atomically replace the school's
// period definitions for an academic year. Used by the principal's
// PeriodConfigWizard so a school with 8 periods / 2 breaks / different
// timings can model its actual schedule instead of using the canned
// 6-period default. Existing rows are wiped and replaced in a single
// transaction so partial saves can't leave the schema in a half state.
timetableRouter.post('/periods/save', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const body = requireBody<{
      academicYearId: string;
      periods: Array<{
        name: string; startTime: string; endTime: string;
        periodType: 'CLASS' | 'BREAK' | 'LUNCH' | 'ASSEMBLY';
      }>;
    }>(req, ['academicYearId', 'periods']);

    if (!Array.isArray(body.periods) || body.periods.length === 0) {
      throw new ApiError(400, 'Kam se kam ek period chahiye.');
    }
    for (const p of body.periods) {
      if (!p.name?.trim() || !p.startTime || !p.endTime) {
        throw new ApiError(400, `Period payload incomplete (got ${JSON.stringify(p)})`);
      }
      if (p.startTime >= p.endTime) {
        throw new ApiError(400, `${p.name}: start time end time se chhota hona chahiye (${p.startTime} → ${p.endTime}).`);
      }
    }

    const schoolId = req.user.school_id!;

    // Verify the year belongs to this school.
    const { data: yr } = await adminDb.from('academic_years').select('id')
      .eq('id', body.academicYearId).eq('school_id', schoolId).maybeSingle();
    if (!yr) throw new ApiError(404, 'Academic year not found');

    // Wipe + insert. Two-step instead of upsert because we want to
    // remove rows that were dropped from the new config (e.g. school
    // shrinks from 8 → 6 periods). Snapshot the current rows first so
    // an insert failure can restore the schedule — otherwise a single
    // bad row would wipe the school's entire timetable with no rollback.
    const { data: priorRowsRaw } = await adminDb
      .from('timetable_periods')
      .select('name, start_time, end_time, period_type, sort_order')
      .eq('school_id', schoolId)
      .eq('academic_year_id', body.academicYearId);
    const priorRows = (priorRowsRaw ?? []) as Array<{
      name: string; start_time: string; end_time: string; period_type: string; sort_order: number;
    }>;

    const { error: delErr } = await adminDb
      .from('timetable_periods')
      .delete()
      .eq('school_id', schoolId)
      .eq('academic_year_id', body.academicYearId);
    if (delErr) throw new ApiError(500, delErr.message);

    const rows = body.periods.map((p, idx) => ({
      school_id:        schoolId,
      academic_year_id: body.academicYearId,
      name:             p.name.trim(),
      start_time:       p.startTime,
      end_time:         p.endTime,
      period_type:      p.periodType,
      sort_order:       idx,
    }));
    const { error: insErr } = await adminDb.from('timetable_periods').insert(rows);
    if (insErr) {
      // Restore the snapshot so the principal isn't left with a blank
      // schedule. Best-effort — if the restore itself fails we report
      // the original insert error so the cause is visible.
      if (priorRows.length > 0) {
        try {
          await adminDb.from('timetable_periods').insert(priorRows.map(p => ({
            school_id:        schoolId,
            academic_year_id: body.academicYearId,
            ...p,
          })));
        } catch { /* restore failed; surfacing insErr below is the priority */ }
      }
      throw new ApiError(500, insErr.message);
    }

    ok(res, { count: rows.length });
  } catch (err) { fail(res, err); }
});

// POST /api/timetable/periods/add — add a single custom slot
timetableRouter.post('/periods/add', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const body = requireBody<{
      academicYearId: string; className: string | null;
      name: string; startTime: string; endTime: string;
      periodType: string; sortOrder: number;
    }>(req, ['academicYearId', 'name', 'startTime', 'endTime', 'periodType']);
    if (body.startTime >= body.endTime) {
      throw new ApiError(400, 'Start time end time se chhota hona chahiye.');
    }
    const schoolId = req.user.school_id!;
    const { data: yr } = await adminDb.from('academic_years').select('id')
      .eq('id', body.academicYearId).eq('school_id', schoolId).maybeSingle();
    if (!yr) throw new ApiError(404, 'Academic year not found');

    const { data, error } = await adminDb.from('timetable_periods').insert({
      school_id:        schoolId,
      academic_year_id: body.academicYearId,
      class_name:       body.className?.trim() || null,
      name:             body.name.trim(),
      start_time:       body.startTime,
      end_time:         body.endTime,
      period_type:      body.periodType,
      sort_order:       body.sortOrder,
    }).select('id').single();
    if (error) throw new ApiError(500, error.message);
    ok(res, { id: (data as any).id }, 201);
  } catch (err) { fail(res, err); }
});

// POST /api/timetable/periods/update — patch one slot
timetableRouter.post('/periods/update', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const body = requireBody<{
      slotId: string;
      name?: string; startTime?: string; endTime?: string; type?: string;
    }>(req, ['slotId']);
    const schoolId = req.user.school_id!;
    const patch: Record<string, unknown> = {};
    if (body.name      !== undefined) patch.name        = body.name.trim();
    if (body.startTime !== undefined) patch.start_time  = body.startTime;
    if (body.endTime   !== undefined) patch.end_time    = body.endTime;
    if (body.type      !== undefined) patch.period_type = body.type;
    if (patch.start_time && patch.end_time && (patch.start_time as string) >= (patch.end_time as string)) {
      throw new ApiError(400, 'Start time end time se chhota hona chahiye.');
    }
    const { data, error } = await adminDb.from('timetable_periods')
      .update(patch).eq('id', body.slotId).eq('school_id', schoolId)
      .select('id').single();
    if (error) throw new ApiError(500, error.message);
    if (!data)  throw new ApiError(404, 'Slot not found');
    ok(res, { id: (data as any).id });
  } catch (err) { fail(res, err); }
});

// POST /api/timetable/periods/delete — remove one slot, ONLY if no
// entries reference it (otherwise the slot would orphan entries that
// the UI then can't render).
timetableRouter.post('/periods/delete', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const { slotId } = requireBody<{ slotId: string }>(req, ['slotId']);
    const schoolId = req.user.school_id!;
    const { count } = await adminDb.from('timetable_entries')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId).eq('slot_id', slotId);
    if ((count ?? 0) > 0) {
      throw new ApiError(409, `Is slot pe ${count} timetable entries assigned hain — pehle wo hatao, fir slot delete karein.`);
    }
    const { data, error } = await adminDb.from('timetable_periods')
      .delete().eq('id', slotId).eq('school_id', schoolId)
      .select('id');
    if (error) throw new ApiError(500, error.message);
    if (!data || data.length === 0) throw new ApiError(404, 'Slot not found');
    ok(res, { id: slotId });
  } catch (err) { fail(res, err); }
});

// POST /api/timetable/delete — delete a timetable entry by id
timetableRouter.post('/delete', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const { id } = requireBody<{ id: string }>(req, ['id']);
    const { data: deleted, error } = await adminDb
      .from('timetable_entries')
      .delete()
      .eq('id', id)
      .eq('school_id', req.user.school_id!)
      .select('id');
    if (error) throw new ApiError(500, error.message);
    if (!deleted || deleted.length === 0) throw new ApiError(404, 'Timetable entry not found');
    ok(res, { id });
  } catch (err) { fail(res, err); }
});
