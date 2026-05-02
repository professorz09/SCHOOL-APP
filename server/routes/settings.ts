import { Router } from 'express';
import { adminDb } from '../lib/db';
import { ok, fail, ApiError } from '../lib/helpers';
import { requireAuth, requireRole } from '../middleware/auth';

export const settingsRouter = Router();

const PRINCIPAL = requireRole('PRINCIPAL');

// GET /api/settings
settingsRouter.get('/', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const { data, error } = await adminDb
      .from('school_settings')
      .select('*')
      .eq('school_id', req.user.school_id!)
      .maybeSingle();
    if (error) throw new ApiError(500, error.message);
    ok(res, data ?? {});
  } catch (err) { fail(res, err); }
});

// PUT /api/settings
settingsRouter.put('/', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const allowed = [
      'enable_teacher_checkin',
      'attendance_start_time',
      'attendance_end_time',
      'late_after_time',
    ];
    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (Object.keys(updates).length === 0) throw new ApiError(400, 'No valid fields to update');

    const { data, error } = await adminDb
      .from('school_settings')
      .upsert({ school_id: req.user.school_id!, ...updates }, { onConflict: 'school_id' })
      .select()
      .single();
    if (error) throw new ApiError(500, error.message);

    await adminDb.rpc('log_audit', {
      p_action: 'UPDATE_SETTINGS',
      p_entity_type: 'school_settings',
      p_entity_id: req.user.school_id!,
      p_details: updates,
    });
    ok(res, data);
  } catch (err) { fail(res, err); }
});
