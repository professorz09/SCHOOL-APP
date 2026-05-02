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
    }>(req, ['academicYearId', 'className', 'section', 'classId', 'day', 'slotId', 'subject', 'teacherName', 'room']);

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
      teacher_name:     body.teacherName,
      room:             body.room,
    };

    if (body.id) {
      const { error } = await adminDb.from('timetable_entries').update(payload).eq('id', body.id);
      if (error) throw new ApiError(500, error.message);
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
    const { error } = await adminDb.from('timetable_entries').delete().eq('id', id);
    if (error) throw new ApiError(500, error.message);
    ok(res, { id });
  } catch (err) { fail(res, err); }
});
