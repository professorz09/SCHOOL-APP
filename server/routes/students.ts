import { Router } from 'express';
import { adminDb } from '../lib/db';
import { ok, fail, ApiError, requireBody } from '../lib/helpers';
import { requireAuth, requireRole } from '../middleware/auth';

export const studentsRouter = Router();

const PRINCIPAL = requireRole('PRINCIPAL');

// GET /api/students?yearId=&classId=&search=
studentsRouter.get('/', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const { yearId, search } = req.query as Record<string, string>;

    let q = adminDb
      .from('student_academic_records')
      .select(`
        id, roll_no, status,
        students!inner(id, name, father_name, phone, dob),
        sections!inner(id, class_name, section_name, academic_year_id)
      `)
      .eq('sections.academic_years.school_id', req.user.school_id!);

    if (yearId) q = q.eq('sections.academic_year_id', yearId);

    const { data, error } = await q.order('roll_no');
    if (error) throw new ApiError(500, error.message);

    let result = data ?? [];
    if (search) {
      const s = search.toLowerCase();
      result = result.filter((r: any) =>
        r.students?.name?.toLowerCase().includes(s) ||
        String(r.roll_no).includes(s)
      );
    }
    ok(res, result);
  } catch (err) { fail(res, err); }
});

// GET /api/students/:id
studentsRouter.get('/:id', requireAuth, requireRole('PRINCIPAL', 'TEACHER'), async (req, res) => {
  try {
    const { data, error } = await adminDb
      .from('students')
      .select(`
        *,
        student_academic_records(
          id, roll_no, status,
          sections(id, class_name, section_name,
            academic_years(id, label, is_active))
        )
      `)
      .eq('id', req.params.id)
      .single();
    if (error || !data) throw new ApiError(404, 'Student not found');
    ok(res, data);
  } catch (err) { fail(res, err); }
});

// POST /api/students/create
studentsRouter.post('/create', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const body = requireBody<{
      name: string; dob?: string; fatherName?: string; phone?: string;
      motherName?: string; address?: string; gender?: string;
    }>(req, ['name']);

    const { data: student, error: se } = await adminDb
      .from('students')
      .insert({
        name:        body.name,
        dob:         body.dob ?? null,
        father_name: body.fatherName ?? null,
        phone:       body.phone ?? null,
        mother_name: body.motherName ?? null,
        address:     body.address ?? null,
        gender:      body.gender ?? null,
        school_id:   req.user.school_id,
      })
      .select()
      .single();
    if (se) throw new ApiError(500, se.message);

    await adminDb.rpc('log_audit', {
      p_action: 'CREATE_STUDENT',
      p_entity_type: 'student',
      p_entity_id: student.id,
      p_details: { name: body.name },
    });
    ok(res, student, 201);
  } catch (err) { fail(res, err); }
});

// POST /api/students/assign  — assign student to a section for a year
studentsRouter.post('/assign', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const body = requireBody<{
      studentId: string; sectionId: string; rollNo?: number; academicYearId: string;
    }>(req, ['studentId', 'sectionId', 'academicYearId']);

    // Verify section belongs to school's year
    const { data: section } = await adminDb
      .from('sections')
      .select('id, academic_years!inner(school_id)')
      .eq('id', body.sectionId)
      .single();
    if (!section) throw new ApiError(404, 'Section not found');

    // Upsert academic record for (student, year) — no overwrite, update only status
    const { data: existing } = await adminDb
      .from('student_academic_records')
      .select('id')
      .eq('student_id', body.studentId)
      .eq('academic_year_id', body.academicYearId)
      .maybeSingle();

    let record;
    if (existing) {
      const { data, error } = await adminDb
        .from('student_academic_records')
        .update({ section_id: body.sectionId, roll_no: body.rollNo ?? null })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw new ApiError(500, error.message);
      record = data;
    } else {
      const { data, error } = await adminDb
        .from('student_academic_records')
        .insert({
          student_id:       body.studentId,
          academic_year_id: body.academicYearId,
          section_id:       body.sectionId,
          roll_no:          body.rollNo ?? null,
          status:           'STUDYING',
        })
        .select()
        .single();
      if (error) throw new ApiError(500, error.message);
      record = data;
    }

    await adminDb.rpc('log_audit', {
      p_action: 'ASSIGN_STUDENT_CLASS',
      p_entity_type: 'student_academic_record',
      p_entity_id: record.id,
      p_details: { studentId: body.studentId, sectionId: body.sectionId },
    });
    ok(res, record);
  } catch (err) { fail(res, err); }
});
