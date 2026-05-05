import { Router } from 'express';
import { adminDb, userDb } from '../lib/db';
import { ok, fail, ApiError, requireBody } from '../lib/helpers';
import { requireAuth, requireRole } from '../middleware/auth';

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

    const { data: profile, error: profileErr } = await adminDb
      .from('users')
      .select('id, name, role, school_id, first_login_changed, is_active')
      .eq('id', data.user.id)
      .maybeSingle();
    if (profileErr) throw new ApiError(500, 'Profile lookup failed');
    if (!profile) throw new ApiError(401, 'Profile not found');
    if (!(profile as { is_active: boolean }).is_active) {
      // Sign the supabase session out so a stale refresh token can't be used.
      try { await adminDb.auth.admin.signOut(data.user.id); } catch { /* ignore */ }
      // Tailor the message to the role — a deactivated principal needs to
      // talk to the platform team (super-admin), while a student/parent
      // needs to talk to their school office. Generic message hides this
      // distinction and confused users.
      const role = (profile as { role: string }).role;
      const message =
        role === 'PRINCIPAL'
          ? 'Account is inactive — please contact the EduGrow super-admin / platform support.'
        : role === 'TEACHER' || role === 'DRIVER' || role === 'PEON'
          ? 'Account is inactive — please contact your school principal.'
        : /* PARENT, STUDENT, anything else */
          'Account is inactive — please contact your school office.';
      throw new ApiError(403, message);
    }

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
      .select('id, name, role, school_id, mobile_number, editor_mode_until')
      .eq('id', req.user.id)
      .maybeSingle();
    ok(res, profile);
  } catch (err) { fail(res, err); }
});

// POST /api/auth/editor-mode/enable — flip on the 30-min privileged window.
// Server-side state (users.editor_mode_until) is the source of truth so a
// direct API caller can't bypass UI gating by setting `editorMode:true`.
authRouter.post('/editor-mode/enable', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const db = userDb(req.jwt);
    const { data, error } = await db.rpc('enable_editor_mode', { p_minutes: 30 });
    if (error) throw new ApiError(500, error.message);
    ok(res, { until: data });
  } catch (err) { fail(res, err); }
});

// POST /api/auth/editor-mode/disable — clear the window for the caller.
authRouter.post('/editor-mode/disable', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const db = userDb(req.jwt);
    const { error } = await db.rpc('disable_editor_mode');
    if (error) throw new ApiError(500, error.message);
    ok(res, { until: null });
  } catch (err) { fail(res, err); }
});

// POST /api/auth/change-password
// Hardened: 8-char minimum, must contain at least one letter and one digit,
// must differ from the user's mobile number (which is the default temp pwd),
// and writes an audit log row. The route doesn't re-verify the current
// password — that's done client-side via signInWithPassword before calling
// this — so a successful response means the password was rotated.
authRouter.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { password } = requireBody<{ password: string }>(req, ['password']);
    if (typeof password !== 'string') throw new ApiError(400, 'Password is required');
    if (password.length < 8) throw new ApiError(400, 'Password must be at least 8 characters');
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      throw new ApiError(400, 'Password must contain at least one letter and one digit');
    }

    // Defence-in-depth: reject the user's mobile number as their password
    // (this is the default temp pwd we hand out, and re-using it is a
    // first-login footgun).
    const { data: profile } = await adminDb
      .from('users')
      .select('mobile_number')
      .eq('id', req.user.id)
      .maybeSingle();
    const mobile = (profile as { mobile_number: string | null } | null)?.mobile_number ?? '';
    if (mobile && password.includes(mobile)) {
      throw new ApiError(400, 'Password cannot contain your mobile number');
    }

    const { error } = await adminDb.auth.admin.updateUserById(req.user.id, { password });
    if (error) throw new ApiError(500, error.message);

    await adminDb.rpc('mark_first_login_complete');

    const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0].trim()
      ?? req.socket.remoteAddress ?? null;
    await adminDb.from('audit_logs').insert({
      user_id:     req.user.id,
      school_id:   req.user.school_id,
      action:      'password_changed',
      entity_type: 'user',
      entity_id:   req.user.id,
      ip_address:  ip,
      details:     { self: true },
    });

    ok(res, { message: 'Password changed' });
  } catch (err) { fail(res, err); }
});
