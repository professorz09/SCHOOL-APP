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
}

const PROFILE_FIELDS =
  'id, mobile_number, role, name, email, school_id, first_login_changed, is_active';

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
  return session;
}

class AuthService {
  /** Login with mobile number + password. Returns the session or throws. */
  async login(mobileNumber: string, password: string): Promise<AuthSession> {
    const cleaned = mobileNumber.trim();
    if (!cleaned || !password) throw new Error('Mobile number and password required');

    // Step 1: Authenticate via API server (no Supabase client call needed here)
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mobile: cleaned, password }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error ?? 'Invalid mobile number or password');

    const { accessToken, refreshToken } = json.data as { accessToken: string; refreshToken: string };

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

    // Best-effort: audit trail + last_login update. Failures must not block login.
    try {
      await supabase.rpc('log_audit', {
        p_action: 'login',
        p_entity_type: 'user',
        p_entity_id: profile.id,
        p_details: { role: profile.role, mobile_number: profile.mobile_number },
      });
    } catch { /* ignore */ }
    try {
      await supabase.from('users').update({ last_login: new Date().toISOString() }).eq('id', profile.id);
    } catch { /* ignore */ }

    return buildSession(profile);
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
   * Verifies `currentPassword` by re-authenticating, then updates and marks
   * `first_login_changed = true`.
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const { data: sess } = await supabase.auth.getSession();
    const user = sess.session?.user;
    if (!user || !user.email) throw new Error('Not authenticated');

    const { error: verifyErr } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (verifyErr) throw new Error('Current password is incorrect');

    const { error: updErr } = await supabase.auth.updateUser({ password: newPassword });
    if (updErr) throw new Error(updErr.message);

    // The first_login_changed column is locked down by a BEFORE UPDATE trigger
    // (see supabase/migrations/0001_init.sql) so a normal user can't flip it
    // by writing to public.users directly. Use the SECURITY DEFINER RPC
    // instead — it sets the flag for auth.uid() server-side.
    const { error: profErr } = await supabase.rpc('mark_first_login_complete');
    if (profErr) throw new Error(profErr.message);
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
