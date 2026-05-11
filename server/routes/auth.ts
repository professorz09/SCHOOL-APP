import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { createClient } from '@supabase/supabase-js';
import { adminDb, userDb } from '../lib/db';
import { ok, fail, ApiError, requireBody } from '../lib/helpers';
import { requireAuth, requireRole } from '../middleware/auth';

export const authRouter = Router();

const MOBILE_EMAIL_DOMAIN = '@edugrow.local';
const toEmail = (m: string) => `${m.trim()}${MOBILE_EMAIL_DOMAIN}`;

// ─── Brute-force defence ─────────────────────────────────────────────
// Per-mobile lockout. The global authLimiter on /api/auth (app.ts) already
// caps at 20/15min PER IP, which handles drive-by bots hitting many
// accounts from one host. This per-mobile limit specifically targets
// brute-forcing ONE account from many IPs (botnet) — without it, an
// attacker with even 50 IPs could land 1000 guesses on the principal's
// password in 15 min while staying under each IP's per-IP cap.
//
// 8 attempts per 15 min: enough room for the principal's own mistypes,
// narrow enough that password guessing is infeasible. The error message
// is generic so the attacker can't tell whether the mobile exists.
const loginLimiterByMobile = rateLimit({
  windowMs: 15 * 60_000,
  limit: 8,
  keyGenerator: (req: any) => `login-mob:${(req.body?.mobile ?? '').toString().trim().slice(-10) || req.ip}`,
  validate: { keyGeneratorIpFallback: false },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { ok: false, error: 'Too many login attempts. Try again in a few minutes.' },
});

// POST /api/auth/login
authRouter.post('/login', loginLimiterByMobile, async (req, res) => {
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
      .select('id, name, role, school_id, first_login_changed, is_active, email, email_otp_2fa')
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
    type ProfileRow = {
      id: string; name: string; role: string; school_id: string | null;
      first_login_changed: boolean; is_active: boolean;
      email: string | null; email_otp_2fa: boolean;
    };
    const p = profile as ProfileRow;

    // School-level inactivity check. We surface this as a *distinct*
    // error (not the generic password message) because:
    //   • The password is correct — telling the user it's wrong is a
    //     bug, not a feature. Confused users blast the support line.
    //   • School inactivity is not a secret: anyone can see the school
    //     is offline by attempting any other action.
    // User enumeration risk is lower for school-level state than for
    // per-user state.
    if (p.school_id) {
      const { data: school } = await adminDb
        .from('schools')
        .select('status, name')
        .eq('id', p.school_id)
        .maybeSingle();
      const sch = school as { status: string; name: string } | null;
      if (sch && (sch.status === 'INACTIVE' || sch.status === 'SUSPENDED')) {
        try { await adminDb.auth.admin.signOut(data.user.id); } catch { /* ignore */ }
        console.warn('[auth.login] school inactive', { mobile, role: p.role, schoolStatus: sch.status });
        throw new ApiError(
          403,
          `${sch.name} abhi ${sch.status === 'SUSPENDED' ? 'suspended' : 'inactive'} hai. Super-admin se contact karein.`,
        );
      }
    }

    if (!p.is_active) {
      try { await adminDb.auth.admin.signOut(data.user.id); } catch { /* ignore */ }
      console.warn('[auth.login] inactive account', { mobile, role: p.role });
      throw new ApiError(401, GENERIC_ERR);
    }

    // ── 2FA gate ─────────────────────────────────────────────────────
    // Principal / super-admin accounts that toggled email-OTP 2FA on
    // get their just-minted Supabase session immediately revoked here.
    // The client then drives an OTP round-trip via supabase.auth's
    // native signInWithOtp + verifyOtp — which creates a fresh session
    // only after the OTP from the user's email is presented. Password
    // alone never gets through.
    if (p.email_otp_2fa && p.email && p.email.trim().length > 0) {
      try { await adminDb.auth.admin.signOut(data.user.id); } catch { /* ignore */ }
      ok(res, {
        requires2FA: true,
        email: p.email,
        // Echo the basics so the client can show "Hi, principal_name —
        // we sent a code to ***@school.com" in the OTP step UI.
        userHint: { name: p.name, role: p.role },
      });
      return;
    }

    ok(res, {
      accessToken:   data.session.access_token,
      refreshToken:  data.session.refresh_token,
      expiresAt:     data.session.expires_at,
      user: {
        id:                p.id,
        name:              p.name,
        role:              p.role,
        school_id:         p.school_id,
        mustChangePassword: !p.first_login_changed,
      },
    });
  } catch (err) { fail(res, err); }
});

// POST /api/auth/2fa/toggle — flip email_otp_2fa for the calling user.
// Only PRINCIPAL / SUPER_ADMIN allowed; the BEFORE UPDATE trigger
// (migration 0095) double-enforces eligibility at the DB level, so a
// rogue RPC or direct-REST attempt also bounces.
authRouter.post('/2fa/toggle', requireAuth, async (req, res) => {
  try {
    const { enabled } = requireBody<{ enabled: boolean }>(req, ['enabled']);
    if (req.user.role !== 'PRINCIPAL' && req.user.role !== 'SUPER_ADMIN') {
      throw new ApiError(403, '2FA is only available for principal / super-admin accounts');
    }
    if (enabled) {
      // Email is mandatory for the OTP to have a destination.
      const { data } = await adminDb.from('users').select('email').eq('id', req.user.id).maybeSingle();
      const email = (data as { email: string | null } | null)?.email;
      if (!email || email.trim().length === 0) {
        throw new ApiError(400, 'Set an email on your profile first — that\'s where the OTP will be sent.');
      }
    }
    const { error } = await adminDb.from('users')
      .update({ email_otp_2fa: enabled })
      .eq('id', req.user.id);
    if (error) throw new ApiError(500, error.message);
    ok(res, { ok: true, enabled });
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
