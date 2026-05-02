import { Router } from 'express';
import { adminDb } from '../lib/db';
import { ok, fail, ApiError, requireBody } from '../lib/helpers';
import { requireAuth, requireRole } from '../middleware/auth';

export const teacherRouter = Router();

// Helper: get staff row for a user
async function getStaffId(userId: string, schoolId: string): Promise<string> {
  const { data, error } = await adminDb
    .from('staff')
    .select('id')
    .eq('user_id', userId)
    .eq('school_id', schoolId)
    .maybeSingle();
  if (error) throw new ApiError(500, error.message);
  if (!data) throw new ApiError(404, 'Teacher staff profile not found');
  return (data as any).id;
}

// POST /api/teacher/check-in
teacherRouter.post('/check-in', requireAuth, requireRole('TEACHER'), async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const now   = new Date().toTimeString().slice(0, 8); // HH:MM:SS

    // Check school settings
    const { data: settings } = await adminDb
      .from('school_settings')
      .select('enable_teacher_checkin, late_after_time')
      .eq('school_id', req.user.school_id!)
      .maybeSingle();

    if (settings && !(settings as any).enable_teacher_checkin) {
      throw new ApiError(403, 'Teacher check-in is not enabled for this school');
    }

    const staffId = await getStaffId(req.user.id, req.user.school_id!);

    // Check already checked in
    const { data: existing } = await adminDb
      .from('staff_attendance')
      .select('id, check_in_time')
      .eq('staff_id', staffId)
      .eq('date', today)
      .maybeSingle();

    if (existing && (existing as any).check_in_time) {
      throw new ApiError(400, 'Already checked in today');
    }

    const lateAfter = (settings as any)?.late_after_time ?? '09:30:00';
    const status    = now > lateAfter ? 'LATE' : 'PRESENT';

    let data: any;
    if (existing) {
      // Record exists but no check_in_time — update it
      const { data: updated, error } = await adminDb
        .from('staff_attendance')
        .update({ check_in_time: now, status, marked_by: req.user.id })
        .eq('id', (existing as any).id)
        .select()
        .single();
      if (error) throw new ApiError(500, error.message);
      data = updated;
    } else {
      const { data: inserted, error } = await adminDb
        .from('staff_attendance')
        .insert({
          school_id:     req.user.school_id,
          staff_id:      staffId,
          date:          today,
          status,
          check_in_time: now,
          marked_by:     req.user.id,
          is_locked:     false,
        })
        .select()
        .single();
      if (error) throw new ApiError(500, error.message);
      data = inserted;
    }

    ok(res, { ...data, status, checkInTime: now });
  } catch (err) { fail(res, err); }
});

// POST /api/teacher/check-out
teacherRouter.post('/check-out', requireAuth, requireRole('TEACHER'), async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const now   = new Date().toTimeString().slice(0, 8);

    const staffId = await getStaffId(req.user.id, req.user.school_id!);

    const { data: record } = await adminDb
      .from('staff_attendance')
      .select('id, check_in_time, check_out_time')
      .eq('staff_id', staffId)
      .eq('date', today)
      .maybeSingle();

    if (!record || !(record as any).check_in_time) throw new ApiError(400, 'Aaj check-in nahi hua hai');
    if ((record as any).check_out_time) throw new ApiError(400, 'Already checked out today');

    const { data, error } = await adminDb
      .from('staff_attendance')
      .update({ check_out_time: now })
      .eq('id', (record as any).id)
      .select()
      .single();
    if (error) throw new ApiError(500, error.message);

    ok(res, { ...(data as any), checkOutTime: now });
  } catch (err) { fail(res, err); }
});

// GET /api/teacher/attendance?date=&staffId=
teacherRouter.get('/attendance', requireAuth, requireRole('PRINCIPAL', 'TEACHER'), async (req, res) => {
  try {
    const { date, staffId } = req.query as Record<string, string>;

    let q = adminDb
      .from('staff_attendance')
      .select('*, staff!inner(id, name, role, school_id)')
      .eq('staff.school_id', req.user.school_id!);

    if (date)    q = q.eq('date', date);
    if (staffId) q = q.eq('staff_id', staffId);
    else if (req.user.role === 'TEACHER') {
      const myStaffId = await getStaffId(req.user.id, req.user.school_id!);
      q = q.eq('staff_id', myStaffId);
    }

    const { data, error } = await q.order('date', { ascending: false });
    if (error) throw new ApiError(500, error.message);
    ok(res, data);
  } catch (err) { fail(res, err); }
});
