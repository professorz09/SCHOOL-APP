import { Router } from 'express';
import { adminDb } from '../lib/db';
import { ok, fail, ApiError } from '../lib/helpers';
import { requireAuth, requireRole } from '../middleware/auth';

export const settingsRouter = Router();

const ALLOWED_FIELDS = [
  'enable_teacher_checkin',
  'attendance_start_time',
  'attendance_end_time',
  'late_after_time',
  'school_name_display',
  'currency_symbol',
  'academic_year_auto_close',
];

// GET /api/settings
settingsRouter.get('/', requireAuth, requireRole('PRINCIPAL', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const { data, error } = await adminDb
      .from('school_settings')
      .select('*')
      .eq('school_id', req.user.school_id!)
      .maybeSingle();
    if (error) throw new ApiError(500, error.message);
    ok(res, data ?? { school_id: req.user.school_id });
  } catch (err) { fail(res, err); }
});

// PUT /api/settings
settingsRouter.put('/', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const updates: Record<string, unknown> = {};
    for (const key of ALLOWED_FIELDS) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (Object.keys(updates).length === 0) {
      throw new ApiError(400, `No valid fields. Allowed: ${ALLOWED_FIELDS.join(', ')}`);
    }

    const { data, error } = await adminDb
      .from('school_settings')
      .upsert(
        { school_id: req.user.school_id!, ...updates, updated_at: new Date().toISOString() },
        { onConflict: 'school_id' }
      )
      .select()
      .single();
    if (error) throw new ApiError(500, error.message);

    ok(res, data);
  } catch (err) { fail(res, err); }
});
