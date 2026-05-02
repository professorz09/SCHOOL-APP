import { Router } from 'express';
import { adminDb } from '../lib/db';
import { ok, fail, ApiError, requireBody } from '../lib/helpers';
import { requireAuth, requireRole } from '../middleware/auth';

export const teacherRouter = Router();

// POST /api/teacher/check-in
teacherRouter.post('/check-in', requireAuth, requireRole('TEACHER'), async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const now   = new Date().toTimeString().split(' ')[0];

    // Check school settings — is check-in enabled?
    const { data: settings } = await adminDb
      .from('school_settings')
      .select('enable_teacher_checkin, late_after_time')
      .eq('school_id', req.user.school_id!)
      .maybeSingle();

    if (settings && !settings.enable_teacher_checkin) {
      throw new ApiError(403, 'Teacher check-in is not enabled for this school');
    }

    // Check if already checked in today
    const { data: existing } = await adminDb
      .from('teacher_attendance')
      .select('id, check_in_time')
      .eq('teacher_id', req.user.id)
      .eq('date', today)
      .maybeSingle();

    if (existing) throw new ApiError(400, 'Already checked in today');

    const lateAfter  = settings?.late_after_time ?? '09:30:00';
    const status     = now > lateAfter ? 'LATE' : 'PRESENT';

    const { data, error } = await adminDb
      .from('teacher_attendance')
      .insert({
        teacher_id:     req.user.id,
        date:           today,
        check_in_time:  now,
        status,
      })
      .select()
      .single();
    if (error) throw new ApiError(500, error.message);

    ok(res, { ...data, status });
  } catch (err) { fail(res, err); }
});

// POST /api/teacher/check-out
teacherRouter.post('/check-out', requireAuth, requireRole('TEACHER'), async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const now   = new Date().toTimeString().split(' ')[0];

    const { data: record } = await adminDb
      .from('teacher_attendance')
      .select('id, check_out_time')
      .eq('teacher_id', req.user.id)
      .eq('date', today)
      .maybeSingle();

    if (!record) throw new ApiError(400, 'No check-in found for today');
    if (record.check_out_time) throw new ApiError(400, 'Already checked out today');

    const { data, error } = await adminDb
      .from('teacher_attendance')
      .update({ check_out_time: now })
      .eq('id', record.id)
      .select()
      .single();
    if (error) throw new ApiError(500, error.message);

    ok(res, data);
  } catch (err) { fail(res, err); }
});

// GET /api/teacher/attendance?date=&teacherId=
teacherRouter.get('/attendance', requireAuth, requireRole('PRINCIPAL', 'TEACHER'), async (req, res) => {
  try {
    const { date, teacherId } = req.query as Record<string, string>;
    let q = adminDb
      .from('teacher_attendance')
      .select('*, users!inner(name, role)')
      .eq('users.school_id', req.user.school_id!);

    if (date)      q = q.eq('date', date);
    if (teacherId) q = q.eq('teacher_id', teacherId);
    else if (req.user.role === 'TEACHER') q = q.eq('teacher_id', req.user.id);

    const { data, error } = await q.order('date', { ascending: false });
    if (error) throw new ApiError(500, error.message);
    ok(res, data);
  } catch (err) { fail(res, err); }
});
