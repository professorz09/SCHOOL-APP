// Supabase-backed auth service.
// Mobile numbers are stored verbatim and translated to a virtual email
// (`<mobile>@edugrow.local`) for Supabase Auth, since SMS-based phone auth
// would require an external SMS provider.

import { supabase, mobileToEmail } from '@/lib/supabase';

export type Role =
  | 'SUPER_ADMIN'
  | 'PRINCIPAL'
  | 'TEACHER'
  | 'STUDENT'
  | 'PARENT'
  | 'DRIVER';

export interface AuthSession {
  userId: string;
  role: Role;
  schoolId?: string | null;
  mobileNumber: string;
  name: string;
  email?: string | null;
  mustChangePassword: boolean;
  linkedStudentIds?: string[];
}

export interface ParentUser {
  id: string;
  mobileNumber: string;
  name: string;
  email?: string | null;
}

interface UserProfileRow {
  id: string;
  mobile_number: string;
  role: Role;
  name: string;
  email: string | null;
  school_id: string | null;
  first_login_changed: boolean;
  is_active: boolean;
  editor_mode_until: string | null;
}

const PROFILE_FIELDS =
  'id, mobile_number, role, name, email, school_id, first_login_changed, is_active, editor_mode_until';

async function fetchProfile(userId: string): Promise<UserProfileRow | null> {
  const { data, error } = await supabase
    .from('users')
    .select(PROFILE_FIELDS)
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as UserProfileRow) ?? null;
}

async function fetchLinkedStudentIds(parentUserId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('parent_student_links')
    .select('student_id')
    .eq('parent_user_id', parentUserId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: { student_id: string }) => r.student_id);
}

async function buildSession(profile: UserProfileRow): Promise<AuthSession> {
  // School-deletion gate — if this user's school has been soft-deleted,
  // refuse to establish a session. Super-admin has no school_id so
  // they're never blocked here (and they're the ones who restore /
  // permanent-delete in the first place). Migration 0127.
  if (profile.school_id) {
    const { data: sch } = await supabase
      .from('schools')
      .select('deleted_at')
      .eq('id', profile.school_id)
      .maybeSingle();
    if (sch && (sch as { deleted_at: string | null }).deleted_at) {
      await supabase.auth.signOut().catch(() => {});
      throw new Error('Yeh school delete kar di gayi hai. Principal ya platform admin se contact karein.');
    }
  }

  const session: AuthSession = {
    userId: profile.id,
    role: profile.role,
    schoolId: profile.school_id,
    mobileNumber: profile.mobile_number,
    name: profile.name,
    email: profile.email,
    mustChangePassword: !profile.first_login_changed,
  };
  if (profile.role === 'PARENT') {
    session.linkedStudentIds = await fetchLinkedStudentIds(profile.id);
  }
  // Mirror server-side Editor-Mode window into the local store so UI gates
  // and countdown timers reflect the persisted timestamp on first paint.
  try {
    const { useEditorModeStore } = await import('@/store/editorModeStore');
    useEditorModeStore.getState().hydrate(profile.editor_mode_until ?? null);
  } catch { /* store import shouldn't fail; ignore so login isn't blocked */ }
  return session;
}

/** Result of the password-only step of login. Either the full session
 *  is ready (no 2FA) or the user has email-OTP 2FA on and the caller
 *  must finish via verifyLoginOtp() with the code from the email. */
export type LoginResult =
  | { kind: 'SESSION'; session: AuthSession }
  | { kind: 'OTP_REQUIRED'; email: string; userHint?: { name: string; role: string } };

class AuthService {
  /** Login with mobile number + password.
   *
   *  Returns either a full session OR an OTP_REQUIRED challenge. The
   *  caller (LoginPage) branches on `kind`. The Supabase client session
   *  has been revoked server-side in the OTP_REQUIRED case, so calling
   *  signInWithOtp + verifyOtp is the only path forward. */
  async login(mobileNumber: string, password: string): Promise<LoginResult> {
    const cleaned = mobileNumber.trim();
    if (!cleaned || !password) throw new Error('Mobile number and password required');

    // Step 1: Authenticate via API server (no Supabase client call needed here)
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mobile: cleaned, password }),
    });

    // Tolerate non-JSON / empty bodies (rate-limit edge cases, network blips,
    // upstream proxy issues). Without this, the user saw an opaque
    // "Failed to execute 'json' on 'Response': Unexpected end of JSON input"
    // instead of the actual auth error. Read body as text first, then try
    // to parse — same defensive pattern apiClient uses.
    const raw = await res.text();
    type LoginJson = {
      ok?: boolean;
      error?: string;
      data?: {
        accessToken?: string;
        refreshToken?: string;
        // 2FA challenge response (no tokens issued)
        requires2FA?: boolean;
        email?: string;
        userHint?: { name: string; role: string };
      };
    };
    let json: LoginJson | null = null;
    if (raw) {
      try { json = JSON.parse(raw); } catch { /* leave json null */ }
    }
    if (!res.ok) {
      throw new Error(json?.error ?? `Invalid mobile number or password (HTTP ${res.status})`);
    }

    // Branch 1: 2FA challenge. Server has already revoked the session.
    // Caller must finish via verifyLoginOtp() after the user types the
    // 6-digit code from their email.
    if (json?.data?.requires2FA && json.data.email) {
      // Trigger Supabase native email OTP send. shouldCreateUser=false
      // so an attacker can't enroll a new auth row by guessing emails.
      const { error: otpErr } = await supabase.auth.signInWithOtp({
        email: json.data.email,
        options: { shouldCreateUser: false },
      });
      if (otpErr) throw new Error(`Could not send verification code: ${otpErr.message}`);
      return {
        kind: 'OTP_REQUIRED',
        email: json.data.email,
        userHint: json.data.userHint,
      };
    }

    if (!json?.data?.accessToken || !json?.data?.refreshToken) {
      throw new Error('Login server returned an unexpected response. Try again or contact support.');
    }
    const { accessToken, refreshToken } = json.data;

    // Step 2: Establish Supabase client session with returned tokens so RLS
    // reads (profile fetch, etc.) use the authenticated user context.
    const { error: sessErr } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (sessErr) throw new Error(sessErr.message);

    // Step 3: Fetch full profile (mobile_number, is_active, etc.) — read-only.
    const { data: userSnap } = await supabase.auth.getUser();
    if (!userSnap.user) throw new Error('Session not established');

    const profile = await fetchProfile(userSnap.user.id);
    if (!profile) {
      await supabase.auth.signOut();
      throw new Error('Profile not found. Contact your administrator.');
    }
    if (!profile.is_active) {
      await supabase.auth.signOut();
      throw new Error('Account is deactivated.');
    }

    // last_login is enough for "when did this user last access" — we don't
    // need an audit_logs row per login. Supabase Auth (auth.audit_log_entries)
    // already records every sign-in internally; duplicating into our
    // audit_logs added thousands of rows/month with no incremental value.
    try {
      await supabase.from('users').update({ last_login: new Date().toISOString() }).eq('id', profile.id);
    } catch { /* ignore */ }

    return { kind: 'SESSION', session: await buildSession(profile) };
  }

  /** Step 2 of email-OTP 2FA. Verifies the 6-digit code Supabase sent
   *  to the user's email. On success Supabase mints a fresh session. */
  async verifyLoginOtp(email: string, otp: string): Promise<AuthSession> {
    const cleaned = otp.trim().replace(/\s+/g, '');
    if (!cleaned) throw new Error('Enter the verification code');
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: cleaned,
      type: 'email',
    });
    if (error) throw new Error(error.message);
    if (!data.user) throw new Error('Verification failed — try again');
    const profile = await fetchProfile(data.user.id);
    if (!profile) {
      await supabase.auth.signOut();
      throw new Error('Profile not found. Contact your administrator.');
    }
    if (!profile.is_active) {
      await supabase.auth.signOut();
      throw new Error('Account is deactivated.');
    }
    return buildSession(profile);
  }

  /** Re-trigger an OTP send. shouldCreateUser=false so resends can't
   *  enrol a new auth row by accident. */
  async resendLoginOtp(email: string): Promise<void> {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    if (error) throw new Error(error.message);
  }

  /** Restore session if Supabase has a valid stored token. */
  async getCurrentSession(): Promise<AuthSession | null> {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return null;
    const profile = await fetchProfile(data.session.user.id);
    if (!profile || !profile.is_active) {
      await supabase.auth.signOut();
      return null;
    }
    return buildSession(profile);
  }

  /** Sign out the current user (clears Supabase tokens from storage). */
  async logout(): Promise<void> {
    await supabase.auth.signOut();
  }

  /**
   * Change the password of the currently-signed-in user.
   *
   * Earlier this verified the old password by calling
   * `signInWithPassword(currentPassword)` first — but that fires a
   * SIGNED_IN auth event which kicks off `refreshSessionFromSupabase`
   * in the background. That refresh reads `first_login_changed=false`
   * from the DB BEFORE the RPC below has run, and lands AFTER the
   * local setSession in FirstLoginPasswordChange — overwriting
   * `mustChangePassword:false` back to true. The user then saw the
   * password screen on every subsequent login.
   *
   * We drop the re-auth verify (the active session token is already
   * proof of authentication) and rely on `updateUser` which uses the
   * current JWT. After the RPC commits we explicitly issue an
   * `getUser` call so any subsequent USER_UPDATED-triggered refresh
   * reads the fresh profile, not a stale snapshot.
   *
   * The `_currentPassword` parameter is kept in the signature for
   * UX consistency (the form still asks for it) and minimal-change
   * call sites, but is no longer used to verify against Supabase.
   * The form's local check `newPassword !== currentPassword` is
   * sufficient to catch "I typed the same value twice".
   */
  async changePassword(_currentPassword: string, newPassword: string): Promise<void> {
    const { data: sess } = await supabase.auth.getSession();
    const user = sess.session?.user;
    if (!user || !user.email) throw new Error('Not authenticated');

    const { error: updErr } = await supabase.auth.updateUser({ password: newPassword });
    if (updErr) throw new Error(updErr.message);

    // The first_login_changed column is locked down by a BEFORE UPDATE trigger
    // (see supabase/migrations/0001_init.sql) so a normal user can't flip it
    // by writing to public.users directly. Use the SECURITY DEFINER RPC
    // instead — it sets the flag for auth.uid() server-side.
    const { error: profErr } = await supabase.rpc('mark_first_login_complete');
    if (profErr) throw new Error(profErr.message);

    // Force a fresh getUser so any later USER_UPDATED listener that
    // calls getCurrentSession reads the post-RPC profile and doesn't
    // re-set mustChangePassword=true from a stale fetch.
    await supabase.auth.getUser();
  }

  // ── Backward-compat shims ──────────────────────────────────────────────
  // These wrappers preserve the call sites in SettingsManager/etc. that
  // previously hit the in-memory mock service. They now just delegate to
  // changePassword(); the userId/role argument is ignored because Supabase
  // changes the password of the current session.

  async changePrincipalPassword(
    _userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<boolean> {
    try {
      await this.changePassword(currentPassword, newPassword);
      return true;
    } catch {
      return false;
    }
  }

  async changeParentPassword(
    _userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<boolean> {
    return this.changePrincipalPassword(_userId, currentPassword, newPassword);
  }

  // ── Compatibility shims ────────────────────────────────────────────────
  // SchoolsManager used to call createPrincipalAccount() *after* schoolService.
  // Principal creation is now atomic inside schoolService.create() (which goes
  // through /api/admin/onboard-school). This shim is therefore a no-op kept
  // only so older call sites don't crash.
  // Parent-related stubs remain pending Task #4.

  createPrincipalAccount(..._args: unknown[]): void {
    /* handled by schoolService.create → /api/admin/onboard-school */
  }
  getParentByMobile(_mobile: string): ParentUser | undefined {
    throw new Error('getParentByMobile: pending migration to Supabase (Task #4).');
  }
  createParentAccount(..._args: unknown[]): ParentUser {
    throw new Error('createParentAccount: pending migration to Supabase (Task #4).');
  }
  linkStudentToParent(_parentId: string, _studentId: string): void {
    throw new Error('linkStudentToParent: pending migration to Supabase (Task #4).');
  }
  getTempPassword(_mobile: string): string {
    throw new Error('getTempPassword: pending migration to Supabase (Task #4).');
  }
}

export const authService = new AuthService();
