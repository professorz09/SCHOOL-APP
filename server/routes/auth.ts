import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
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

    // Uniform error surface: distinct internal causes (no user / wrong pwd /
     // deactivated) all surface to the client as "Invalid mobile number or
     // password". Distinct messages enable user enumeration and role-targeted
     // phishing. Real cause is logged server-side for ops debugging.
    const GENERIC_ERR = 'Invalid mobile number or password';

    const { data, error } = await adminDb.auth.signInWithPassword({
      email: toEmail(mobile),
      password,
    });
    if (error || !data.session) {
      console.warn('[auth.login] signIn failed', { mobile, reason: error?.message });
      throw new ApiError(401, GENERIC_ERR);
    }

    const { data: profile, error: profileErr } = await adminDb
      .from('users')
      .select('id, name, role, school_id, first_login_changed, is_active')
      .eq('id', data.user.id)
      .maybeSingle();
    if (profileErr) {
      console.error('[auth.login] profile lookup failed', profileErr.message);
      throw new ApiError(401, GENERIC_ERR);
    }
    if (!profile) {
      console.warn('[auth.login] no profile row for', data.user.id);
      throw new ApiError(401, GENERIC_ERR);
    }
    if (!(profile as { is_active: boolean }).is_active) {
      // Sign the supabase session out so a stale refresh token can't be used.
      try { await adminDb.auth.admin.signOut(data.user.id); } catch { /* ignore */ }
      console.warn('[auth.login] inactive account', { mobile, role: (profile as { role: string }).role });
      throw new ApiError(401, GENERIC_ERR);
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
// Hardened: requires the current password (verified server-side via a fresh
// signInWithPassword), 8-char minimum, at least one letter + one digit, must
// not contain the user's mobile number, and writes an audit row.
authRouter.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = requireBody<{
      currentPassword: string;
      newPassword: string;
    }>(req, ['currentPassword', 'newPassword']);
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
      throw new ApiError(400, 'Current and new password are required');
    }
    if (newPassword.length < 8) throw new ApiError(400, 'Password must be at least 8 characters');
    if (!/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      throw new ApiError(400, 'Password must contain at least one letter and one digit');
    }

    // Look up the caller's email + mobile from the auth user record. The
    // service-role admin API gives us the canonical email (mobile@edugrow.local).
    const { data: authUserRes, error: authErr } = await adminDb.auth.admin.getUserById(req.user.id);
    if (authErr || !authUserRes?.user?.email) throw new ApiError(401, 'User not found');
    const callerEmail = authUserRes.user.email;

    // Verify current password by attempting a sign-in on a fresh anon client.
    // Using a per-request client avoids session bleed across requests.
    const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
    const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '';
    const verifyClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: verifyErr } = await verifyClient.auth.signInWithPassword({
      email: callerEmail,
      password: currentPassword,
    });
    if (verifyErr) throw new ApiError(401, 'Current password is incorrect');
    // Best-effort: drop the verifier session so its refresh token can't be reused.
    try { await verifyClient.auth.signOut(); } catch { /* ignore */ }

    // Defence-in-depth: reject the user's mobile number as their password
    // (this is the default temp pwd we hand out, and re-using it is a
    // first-login footgun).
    const { data: profile } = await adminDb
      .from('users')
      .select('mobile_number')
      .eq('id', req.user.id)
      .maybeSingle();
    const mobile = (profile as { mobile_number: string | null } | null)?.mobile_number ?? '';
    if (mobile && newPassword.includes(mobile)) {
      throw new ApiError(400, 'Password cannot contain your mobile number');
    }

    const { error } = await adminDb.auth.admin.updateUserById(req.user.id, { password: newPassword });
    if (error) throw new ApiError(500, error.message);

    // mark_first_login_complete uses auth.uid() server-side, but here we're
    // using the service-role client where auth.uid() is null. Update directly.
    await adminDb.from('users').update({ first_login_changed: true }).eq('id', req.user.id);

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
