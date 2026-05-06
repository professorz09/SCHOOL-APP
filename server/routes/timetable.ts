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
