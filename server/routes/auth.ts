import { Router } from 'express';
import { adminDb } from '../lib/db';
import { ok, fail, ApiError, requireBody } from '../lib/helpers';
import { requireAuth } from '../middleware/auth';

export const authRouter = Router();

const MOBILE_EMAIL_DOMAIN = '@edugrow.local';
const toEmail = (m: string) => `${m.trim()}${MOBILE_EMAIL_DOMAIN}`;

// POST /api/auth/login
authRouter.post('/login', async (req, res) => {
  try {
    const { mobile, password } = requireBody<{ mobile: string; password: string }>(req, ['mobile', 'password']);

    const { data, error } = await adminDb.auth.signInWithPassword({
      email: toEmail(mobile),
      password,
    });
    if (error || !data.session) throw new ApiError(401, error?.message ?? 'Login failed');

    const { data: profile } = await adminDb
      .from('users')
      .select('id, name, role, school_id, first_login_changed')
      .eq('id', data.user.id)
      .single();

    ok(res, {
      accessToken:   data.session.access_token,
      refreshToken:  data.session.refresh_token,
      expiresAt:     data.session.expires_at,
      user: {
        id:                profile?.id,
        name:              profile?.name,
        role:              profile?.role,
        school_id:         profile?.school_id,
        mustChangePassword: !(profile?.first_login_changed),
      },
    });
  } catch (err) { fail(res, err); }
});

// POST /api/auth/logout
authRouter.post('/logout', requireAuth, async (req, res) => {
  try {
    await adminDb.auth.admin.signOut(req.user.id);
    ok(res, { message: 'Logged out' });
  } catch (err) { fail(res, err); }
});

// GET /api/auth/me
authRouter.get('/me', requireAuth, async (req, res) => {
  try {
    const { data: profile } = await adminDb
      .from('users')
      .select('id, name, role, school_id, mobile_number')
      .eq('id', req.user.id)
      .single();
    ok(res, profile);
  } catch (err) { fail(res, err); }
});

// POST /api/auth/change-password
authRouter.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { password } = requireBody<{ password: string }>(req, ['password']);
    if (password.length < 6) throw new ApiError(400, 'Password must be at least 6 characters');

    const { error } = await adminDb.auth.admin.updateUserById(req.user.id, { password });
    if (error) throw new ApiError(500, error.message);

    await adminDb.rpc('mark_first_login_complete');
    ok(res, { message: 'Password changed' });
  } catch (err) { fail(res, err); }
});
