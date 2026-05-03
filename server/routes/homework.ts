import { Router } from 'express';
import { adminDb } from '../lib/db';
import { ok, fail, ApiError } from '../lib/helpers';
import { requireAuth, requireRole } from '../middleware/auth';

export const homeworkRouter = Router();

// Helper: get staff id from user id
async function getStaffId(userId: string, schoolId: string): Promise<string> {
  const { data, error } = await adminDb
    .from('staff')
    .select('id')
    .eq('user_id', userId)
    .eq('school_id', schoolId)
    .maybeSingle();
  if (error) throw new ApiError(500, error.message);
  if (!data) throw new ApiError(404, 'Staff profile not found');
  return (data as any).id;
}

// GET /api/homework?sectionId=&yearId=
// Used by both student and teacher to list homework for a section
homeworkRouter.get('/', requireAuth, async (req, res) => {
  try {
    const { sectionId, yearId } = req.query as Record<string, string>;
    if (!sectionId || !yearId) throw new ApiError(400, 'sectionId and yearId are required');

    const { data, error } = await adminDb
      .from('homework_assignments')
      .select('id, subject, title, description, assigned_date, due_date, teacher_id')
      .eq('school_id', req.user.school_id!)
      .eq('academic_year_id', yearId)
      .eq('section_id', sectionId)
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('assigned_date', { ascending: false });
    if (error) throw new ApiError(500, error.message);

    const rows = (data ?? []) as Array<{
      id: string; subject: string | null; title: string;
      description: string | null; assigned_date: string;
      due_date: string | null; teacher_id: string | null;
    }>;

    // Batch-resolve teacher names
    const teacherIds = Array.from(new Set(rows.map(r => r.teacher_id).filter(Boolean))) as string[];
    const teacherMap = new Map<string, string>();
    if (teacherIds.length) {
      const { data: staff } = await adminDb
        .from('staff').select('id, name').in('id', teacherIds);
      for (const s of ((staff ?? []) as { id: string; name: string }[])) {
        teacherMap.set(s.id, s.name);
      }
    }

    const result = rows.map(r => ({
      id: r.id,
      subject: r.subject ?? '',
      title: r.title,
      description: r.description ?? '',
      assignedDate: r.assigned_date,
      dueDate: r.due_date ?? r.assigned_date,
      teacher: r.teacher_id ? (teacherMap.get(r.teacher_id) ?? '') : '',
    }));

    ok(res, result);
  } catch (e) {
    fail(res, e);
  }
});

// POST /api/homework/create
// Teacher creates a homework assignment
homeworkRouter.post('/create', requireAuth, requireRole('TEACHER'), async (req, res) => {
  try {
    const { sectionId, subject, title, description, dueDate, academicYearId } = req.body as {
      sectionId: string; subject: string; title: string;
      description?: string; dueDate?: string; academicYearId: string;
    };
    if (!sectionId || !title || !academicYearId) {
      throw new ApiError(400, 'sectionId, title, and academicYearId are required');
    }

    const staffId = await getStaffId(req.user.id, req.user.school_id!);

    // Get class_name + section label for denormalized columns
    const { data: sec } = await adminDb
      .from('sections')
      .select('class_name, section')
      .eq('id', sectionId)
      .maybeSingle();

    const { data, error } = await adminDb
      .from('homework_assignments')
      .insert({
        school_id: req.user.school_id,
        academic_year_id: academicYearId,
        section_id: sectionId,
        teacher_id: staffId,
        class_name: (sec as any)?.class_name ?? null,
        section: (sec as any)?.section ?? null,
        subject: subject || null,
        title,
        description: description || null,
        due_date: dueDate || null,
        assigned_date: new Date().toISOString().split('T')[0],
      })
      .select()
      .single();
    if (error) throw new ApiError(500, error.message);

    ok(res, data);
  } catch (e) {
    fail(res, e);
  }
});

// DELETE /api/homework/:id
// Teacher deletes their own homework
homeworkRouter.delete('/:id', requireAuth, requireRole('TEACHER'), async (req, res) => {
  try {
    const staffId = await getStaffId(req.user.id, req.user.school_id!);

    // Verify ownership
    const { data: existing } = await adminDb
      .from('homework_assignments')
      .select('id, teacher_id')
      .eq('id', req.params.id)
      .eq('school_id', req.user.school_id!)
      .maybeSingle();
    if (!existing) throw new ApiError(404, 'Homework not found');
    if ((existing as any).teacher_id !== staffId) throw new ApiError(403, 'Not your homework');

    const { error } = await adminDb
      .from('homework_assignments')
      .delete()
      .eq('id', req.params.id);
    if (error) throw new ApiError(500, error.message);

    ok(res, { id: req.params.id });
  } catch (e) {
    fail(res, e);
  }
});
