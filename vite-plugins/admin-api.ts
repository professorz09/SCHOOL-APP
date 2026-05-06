// Vite dev plugin: exposes /api/admin/* endpoints used by the Super Admin UI.
//
// These endpoints perform writes that need the Supabase service-role key, so
// they cannot run in the browser. The plugin verifies the caller's JWT and
// confirms the caller is an active SUPER_ADMIN before performing any work.
//
// Runs in both `vite` (dev) and `vite preview` modes.

import type { Plugin, Connect, ViteDevServer, PreviewServer } from 'vite';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { IncomingMessage, ServerResponse } from 'node:http';

const SUPABASE_URL      = process.env.SUPABASE_URL ?? '';
const SERVICE_KEY       = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '';

const MOBILE_EMAIL_DOMAIN = '@edugrow.local';
const mobileToEmail = (m: string) => `${m.trim()}${MOBILE_EMAIL_DOMAIN}`;

function makeAdminClient(): SupabaseClient {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in env');
  }
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ─── helpers ───────────────────────────────────────────────────────────────

async function readJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', (c) => { buf += c; });
    req.on('end', () => {
      if (!buf) return resolve({});
      try { resolve(JSON.parse(buf)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

async function requireSuperAdmin(
  req: IncomingMessage,
  admin: SupabaseClient,
): Promise<{ id: string; school_id: string | null }> {
  const profile = await requireAuthedProfile(req, admin);
  if (profile.role !== 'SUPER_ADMIN') {
    throw Object.assign(new Error('super admin only'), { status: 403 });
  }
  return { id: profile.id, school_id: profile.school_id };
}

async function requirePrincipal(
  req: IncomingMessage,
  admin: SupabaseClient,
): Promise<{ id: string; school_id: string }> {
  const profile = await requireAuthedProfile(req, admin);
  if (profile.role !== 'PRINCIPAL') {
    throw Object.assign(new Error('principal only'), { status: 403 });
  }
  if (!profile.school_id) {
    throw Object.assign(new Error('principal has no school'), { status: 403 });
  }
  return { id: profile.id, school_id: profile.school_id };
}

async function requireAuthedProfile(
  req: IncomingMessage,
  admin: SupabaseClient,
): Promise<{ id: string; role: string; school_id: string | null }> {
  const auth = req.headers['authorization'] ?? req.headers['Authorization' as never];
  const header = Array.isArray(auth) ? auth[0] : auth;
  if (!header || !header.toLowerCase().startsWith('bearer ')) {
    throw Object.assign(new Error('missing bearer token'), { status: 401 });
  }
  const token = header.slice(7);
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) {
    throw Object.assign(new Error('invalid token'), { status: 401 });
  }
  const userId = data.user.id;
  const { data: profile, error: profErr } = await admin
    .from('users')
    .select('id, role, is_active, school_id')
    .eq('id', userId)
    .single();
  if (profErr || !profile) {
    throw Object.assign(new Error('user profile not found'), { status: 401 });
  }
  if (!profile.is_active) throw Object.assign(new Error('account inactive'), { status: 403 });
  return { id: profile.id, role: profile.role, school_id: profile.school_id };
}

// Helper: create or reuse a Supabase auth user, then mirror them into public.users.
async function upsertSchoolUser(
  admin: SupabaseClient,
  args: {
    mobile: string;
    name: string;
    role: 'TEACHER' | 'DRIVER' | 'PARENT';
    schoolId: string;
    password: string;
    email?: string | null;
  },
): Promise<{ userId: string; created: boolean; reused: boolean }> {
  const email = mobileToEmail(args.mobile);

  // Already in public.users? → reuse, return its id (no new auth row needed).
  // SECURITY: must enforce school boundary — a user from another school can NEVER
  // be silently linked into this principal's school. Only PARENT may legitimately
  // span schools (siblings in different schools), but even then the existing row
  // must belong to *this* school for reuse — otherwise reject with 409.
  const { data: existing } = await admin
    .from('users').select('id, school_id, role, is_active')
    .eq('mobile_number', args.mobile).maybeSingle();
  if (existing) {
    if (existing.role !== args.role) {
      throw Object.assign(
        new Error(`mobile ${args.mobile} already registered as ${existing.role}`),
        { status: 409 },
      );
    }
    if (existing.school_id && existing.school_id !== args.schoolId) {
      throw Object.assign(
        new Error(`mobile ${args.mobile} is already registered with another school`),
        { status: 409 },
      );
    }
    return { userId: existing.id, created: false, reused: true };
  }

  let authUserId: string;
  let createdNewAuthUser = false;
  const created = await admin.auth.admin.createUser({
    email, password: args.password, email_confirm: true,
    user_metadata: { mobile_number: args.mobile, name: args.name, role: args.role },
  });
  if (created.error) {
    const found = await findExistingAuthUserId(admin, email);
    if (!found) throw Object.assign(new Error(created.error.message), { status: 500 });
    authUserId = found;
  } else {
    authUserId = created.data.user.id;
    createdNewAuthUser = true;
  }

  const { error: insErr } = await admin.from('users').insert({
    id: authUserId,
    mobile_number: args.mobile,
    role: args.role,
    name: args.name,
    email: args.email ?? null,
    school_id: args.schoolId,
    first_login_changed: false,
    is_active: true,
  });
  if (insErr) {
    if (createdNewAuthUser) {
      try { await admin.auth.admin.deleteUser(authUserId); } catch { /* ignore */ }
    }
    throw Object.assign(new Error(insErr.message), { status: 500 });
  }
  return { userId: authUserId, created: createdNewAuthUser, reused: false };
}

async function findExistingAuthUserId(
  admin: SupabaseClient,
  email: string,
): Promise<string | null> {
  // Walk up to 10 pages of 200 — enough for any realistic onboarding scenario.
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find(
      (u: { email?: string | null; id: string }) =>
        (u.email ?? '').toLowerCase() === email.toLowerCase(),
    );
    if (found) return found.id;
    if (data.users.length < 200) break;
  }
  return null;
}

async function logAuditAs(
  admin: SupabaseClient,
  userId: string,
  schoolId: string | null,
  action: string,
  entityType: string,
  entityId: string | null,
  details: Record<string, unknown>,
) {
  await admin.from('audit_logs').insert({
    user_id: userId,
    school_id: schoolId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    details,
  });
}

// ─── handlers ──────────────────────────────────────────────────────────────

interface OnboardSchoolBody {
  school: {
    name: string; code: string; location: string; address: string; phone: string;
    principalName: string; principalEmail: string; principalPhone: string;
    status: string; plan: string;
    paymentStartDate: string; annualAmount: number;
  };
  principalMobile: string;   // 10 digits
  principalPassword: string;
}

async function handleOnboardSchool(
  req: IncomingMessage, res: ServerResponse, admin: SupabaseClient,
) {
  const caller = await requireSuperAdmin(req, admin);
  const body = (await readJsonBody(req)) as OnboardSchoolBody;
  const s = body.school;
  if (!s?.name || !s.code || !body.principalMobile || !body.principalPassword) {
    return sendJson(res, 400, { error: 'missing required fields' });
  }
  if (!/^\d{10}$/.test(body.principalMobile)) {
    return sendJson(res, 400, { error: 'principal mobile must be 10 digits' });
  }
  if (body.principalPassword.length < 6) {
    return sendJson(res, 400, { error: 'password must be at least 6 chars' });
  }

  // 1. Reject duplicate school code early.
  {
    const { data: dup } = await admin
      .from('schools').select('id').eq('code', s.code).maybeSingle();
    if (dup) return sendJson(res, 409, { error: `school code ${s.code} already exists` });
  }

  // 2. Reject duplicate principal mobile (across the whole users table).
  {
    const { data: dup } = await admin
      .from('users').select('id').eq('mobile_number', body.principalMobile).maybeSingle();
    if (dup) return sendJson(res, 409, { error: `mobile ${body.principalMobile} is already registered` });
  }

  const annual = Number(s.annualAmount);
  if (!Number.isFinite(annual) || annual <= 0) {
    return sendJson(res, 400, { error: 'annualAmount must be positive' });
  }

  const principalEmail = mobileToEmail(body.principalMobile);

  // 3. Create (or reuse) the principal's auth.users row first. The auth
  // schema is owned by GoTrue and cannot participate in a SQL transaction,
  // so it lives outside the RPC. If anything below fails we explicitly
  // delete it.
  let authUserId: string | null = null;
  let createdNewAuthUser = false;
  try {
    const created = await admin.auth.admin.createUser({
      email: principalEmail,
      password: body.principalPassword,
      email_confirm: true,
      user_metadata: {
        mobile_number: body.principalMobile,
        name: s.principalName,
        role: 'PRINCIPAL',
      },
    });
    if (created.error) {
      const existing = await findExistingAuthUserId(admin, principalEmail);
      if (!existing) return sendJson(res, 500, { error: created.error.message });
      authUserId = existing;
    } else {
      authUserId = created.data.user.id;
      createdNewAuthUser = true;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'auth create failed';
    return sendJson(res, 500, { error: msg });
  }

  // 4. Single transactional RPC: school + principal users row + billing
  // schedule + first billing year + audit. Postgres rolls back the whole
  // block if any step fails.
  // The RPC derives the caller from auth.uid() and enforces is_super_admin()
  // internally, so we MUST pass through the user's JWT (not the service-role
  // key) to make this call. We build a per-request client bound to that JWT.
  const userJwt = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${userJwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: rpcRows, error: rpcErr } = await userClient.rpc('onboard_school', {
    p_principal_user_id:  authUserId,
    p_school_name:        s.name,
    p_school_code:        s.code,
    p_location:           s.location ?? '',
    p_address:            s.address ?? '',
    p_phone:              s.phone ?? '',
    p_principal_name:     s.principalName,
    p_principal_email:    s.principalEmail ?? '',
    p_principal_phone:    s.principalPhone ?? '',
    p_principal_mobile:   body.principalMobile,
    p_status:             s.status,
    p_plan:               s.plan,
    p_payment_start_date: s.paymentStartDate,
    p_annual_amount:      annual,
  });
  if (rpcErr) {
    // Atomic cleanup: only delete the auth user if we created it just now.
    if (createdNewAuthUser && authUserId) {
      try { await admin.auth.admin.deleteUser(authUserId); } catch { /* ignore */ }
    }
    return sendJson(res, 500, { error: rpcErr.message });
  }

  const schoolRow = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
  if (!schoolRow) {
    if (createdNewAuthUser && authUserId) {
      try { await admin.auth.admin.deleteUser(authUserId); } catch { /* ignore */ }
    }
    return sendJson(res, 500, { error: 'onboard_school returned no row' });
  }

  return sendJson(res, 200, { school: schoolRow, principalUserId: authUserId });
}

interface CreateSuperAdminBody {
  name: string; mobileNumber: string; password: string; email?: string; phone?: string;
}

async function handleCreateSuperAdmin(
  req: IncomingMessage, res: ServerResponse, admin: SupabaseClient,
) {
  const caller = await requireSuperAdmin(req, admin);
  const body = (await readJsonBody(req)) as CreateSuperAdminBody;
  if (!body.name || !body.mobileNumber || !body.password) {
    return sendJson(res, 400, { error: 'name, mobileNumber and password required' });
  }
  if (!/^\d{10}$/.test(body.mobileNumber)) {
    return sendJson(res, 400, { error: 'mobileNumber must be 10 digits' });
  }

  const { data: dup } = await admin
    .from('users').select('id').eq('mobile_number', body.mobileNumber).maybeSingle();
  if (dup) return sendJson(res, 409, { error: 'mobile already registered' });

  const email = mobileToEmail(body.mobileNumber);
  let userId: string | null = null;
  const created = await admin.auth.admin.createUser({
    email, password: body.password, email_confirm: true,
    user_metadata: { mobile_number: body.mobileNumber, name: body.name, role: 'SUPER_ADMIN' },
  });
  if (created.error) {
    const existing = await findExistingAuthUserId(admin, email);
    if (existing) userId = existing;
    else return sendJson(res, 500, { error: created.error.message });
  } else {
    userId = created.data.user.id;
  }

  const { data: row, error } = await admin.from('users').insert({
    id: userId,
    mobile_number: body.mobileNumber,
    role: 'SUPER_ADMIN',
    name: body.name,
    email: body.email ?? null,
    school_id: null,
    first_login_changed: false,
    is_active: true,
  }).select('*').single();
  if (error) return sendJson(res, 500, { error: error.message });

  await logAuditAs(admin, caller.id, null, 'create_admin', 'user', userId, {
    name: body.name, role: 'SUPER_ADMIN', mobile_number: body.mobileNumber,
  });
  return sendJson(res, 200, { user: row });
}

interface SetUserActiveBody { userId: string; isActive: boolean; }
async function handleSetUserActive(
  req: IncomingMessage, res: ServerResponse, admin: SupabaseClient,
) {
  const caller = await requireSuperAdmin(req, admin);
  const body = (await readJsonBody(req)) as SetUserActiveBody;
  if (!body.userId || typeof body.isActive !== 'boolean') {
    return sendJson(res, 400, { error: 'userId and isActive required' });
  }
  const { data: target, error: tErr } = await admin
    .from('users').select('id, role, name').eq('id', body.userId).single();
  if (tErr || !target) return sendJson(res, 404, { error: 'user not found' });
  if (target.role === 'SUPER_ADMIN' && target.id === caller.id) {
    return sendJson(res, 400, { error: 'cannot change own status' });
  }
  const { error } = await admin.from('users')
    .update({ is_active: body.isActive, updated_at: new Date().toISOString() })
    .eq('id', body.userId);
  if (error) return sendJson(res, 500, { error: error.message });

  // Force-logout on deactivate: invalidate every active session for the
  // target user so an already-open browser tab can't keep working until the
  // JWT naturally expires (~1 hour). Best-effort — failure here doesn't
  // roll back the deactivation.
  if (!body.isActive) {
    try { await admin.auth.admin.signOut(body.userId); } catch { /* ignore */ }
  }

  await logAuditAs(admin, caller.id, null,
    body.isActive ? 'activate_user' : 'deactivate_user',
    'user', body.userId, { name: target.name, role: target.role });
  return sendJson(res, 200, { ok: true });
}

interface ResetPasswordBody { userId: string; newPassword: string; }
async function handleResetPassword(
  req: IncomingMessage, res: ServerResponse, admin: SupabaseClient,
) {
  const caller = await requireSuperAdmin(req, admin);
  const body = (await readJsonBody(req)) as ResetPasswordBody;
  if (!body.userId || !body.newPassword || body.newPassword.length < 6) {
    return sendJson(res, 400, { error: 'userId and newPassword (>=6 chars) required' });
  }
  const { data: target, error: tErr } = await admin
    .from('users').select('id, name, role').eq('id', body.userId).single();
  if (tErr || !target) return sendJson(res, 404, { error: 'user not found' });

  const { error: updErr } = await admin.auth.admin.updateUserById(body.userId, {
    password: body.newPassword,
  });
  if (updErr) return sendJson(res, 500, { error: updErr.message });

  // Force them to change on next login.
  await admin.from('users')
    .update({ first_login_changed: false, updated_at: new Date().toISOString() })
    .eq('id', body.userId);

  await logAuditAs(admin, caller.id, null, 'reset_password', 'user', body.userId, {
    name: target.name, role: target.role,
  });
  return sendJson(res, 200, { ok: true });
}

interface DeleteSchoolBody { schoolId: string; }
async function handleDeleteSchool(
  req: IncomingMessage, res: ServerResponse, admin: SupabaseClient,
) {
  const caller = await requireSuperAdmin(req, admin);
  const body = (await readJsonBody(req)) as DeleteSchoolBody;
  if (!body.schoolId) return sendJson(res, 400, { error: 'schoolId required' });

  const { data: school, error: sErr } = await admin
    .from('schools').select('id, name').eq('id', body.schoolId).single();
  if (sErr || !school) return sendJson(res, 404, { error: 'school not found' });

  // Soft-delete: status flip → cascade trigger deactivates dependants.
  const { error } = await admin.from('schools')
    .update({ is_deleted: true, status: 'INACTIVE', updated_at: new Date().toISOString() })
    .eq('id', body.schoolId);
  if (error) return sendJson(res, 500, { error: error.message });

  await logAuditAs(admin, caller.id, null, 'delete_school', 'school', body.schoolId, {
    name: school.name,
  });
  return sendJson(res, 200, { ok: true });
}

// ─── parent/staff/teacher account creation (principal-only) ────────────────

interface CreateSchoolUserBody {
  mobile: string;
  name: string;
  password?: string;        // defaults to mobile
  email?: string;
  role: 'TEACHER' | 'DRIVER' | 'PARENT';
}

async function handleCreateSchoolUser(
  req: IncomingMessage, res: ServerResponse, admin: SupabaseClient,
) {
  const caller = await requirePrincipal(req, admin);
  const body = (await readJsonBody(req)) as CreateSchoolUserBody;
  if (!body.mobile || !body.name || !body.role) {
    return sendJson(res, 400, { error: 'mobile, name and role required' });
  }
  if (!/^\d{10}$/.test(body.mobile)) {
    return sendJson(res, 400, { error: 'mobile must be 10 digits' });
  }
  if (!['TEACHER','DRIVER','PARENT'].includes(body.role)) {
    return sendJson(res, 400, { error: 'invalid role' });
  }
  const password = body.password ?? body.mobile;     // default = mobile (force change on first login)

  let result;
  try {
    result = await upsertSchoolUser(admin, {
      mobile: body.mobile, name: body.name, role: body.role,
      schoolId: caller.school_id, password, email: body.email ?? null,
    });
  } catch (e) {
    const err = e as { status?: number; message?: string };
    return sendJson(res, err.status ?? 500, { error: err.message ?? 'failed' });
  }

  await logAuditAs(admin, caller.id, caller.school_id,
    result.reused ? 'link_user' : 'create_user',
    'user', result.userId,
    { name: body.name, role: body.role, mobile_number: body.mobile });

  return sendJson(res, 200, { userId: result.userId, reused: result.reused });
}

interface LinkParentBody {
  parentUserId: string;
  studentId: string;
  relation: string;
}

async function handleLinkParentStudent(
  req: IncomingMessage, res: ServerResponse, admin: SupabaseClient,
) {
  const caller = await requirePrincipal(req, admin);
  const body = (await readJsonBody(req)) as LinkParentBody;
  if (!body.parentUserId || !body.studentId) {
    return sendJson(res, 400, { error: 'parentUserId and studentId required' });
  }

  // Ensure both belong to the principal's school (defense in depth).
  const { data: parent } = await admin.from('users')
    .select('school_id, role').eq('id', body.parentUserId).single();
  if (!parent || parent.role !== 'PARENT' || parent.school_id !== caller.school_id) {
    return sendJson(res, 400, { error: 'parent not in this school' });
  }
  const { data: student } = await admin.from('students')
    .select('school_id').eq('id', body.studentId).single();
  if (!student || student.school_id !== caller.school_id) {
    return sendJson(res, 400, { error: 'student not in this school' });
  }

  const { error } = await admin.from('parent_student_links').upsert({
    parent_user_id: body.parentUserId,
    student_id: body.studentId,
    relation: body.relation ?? 'PARENT',
  }, { onConflict: 'parent_user_id,student_id' });
  if (error) return sendJson(res, 500, { error: error.message });

  await logAuditAs(admin, caller.id, caller.school_id, 'link_parent_student',
    'parent_student_link', body.studentId,
    { parent_user_id: body.parentUserId, relation: body.relation });
  return sendJson(res, 200, { ok: true });
}

interface SchoolUserResetBody {
  userId: string;
  newPassword: string;
}

async function handleResetSchoolUserPassword(
  req: IncomingMessage, res: ServerResponse, admin: SupabaseClient,
) {
  const caller = await requirePrincipal(req, admin);
  const body = (await readJsonBody(req)) as SchoolUserResetBody;
  if (!body.userId || !body.newPassword || body.newPassword.length < 4) {
    return sendJson(res, 400, { error: 'userId and newPassword (>=4) required' });
  }
  const { data: target } = await admin.from('users')
    .select('id, name, role, school_id').eq('id', body.userId).single();
  if (!target || target.school_id !== caller.school_id) {
    return sendJson(res, 404, { error: 'user not in this school' });
  }
  if (target.role === 'PRINCIPAL' || target.role === 'SUPER_ADMIN') {
    return sendJson(res, 403, { error: 'cannot reset principal/super admin password here' });
  }
  const { error: updErr } = await admin.auth.admin.updateUserById(body.userId, {
    password: body.newPassword,
  });
  if (updErr) return sendJson(res, 500, { error: updErr.message });

  await admin.from('users')
    .update({ first_login_changed: false, updated_at: new Date().toISOString() })
    .eq('id', body.userId);

  await logAuditAs(admin, caller.id, caller.school_id, 'reset_password', 'user', body.userId,
    { name: target.name, role: target.role });
  return sendJson(res, 200, { ok: true });
}

interface SetSchoolUserActiveBody { userId: string; isActive: boolean; }

async function handleSetSchoolUserActive(
  req: IncomingMessage, res: ServerResponse, admin: SupabaseClient,
) {
  const caller = await requirePrincipal(req, admin);
  const body = (await readJsonBody(req)) as SetSchoolUserActiveBody;
  if (!body.userId || typeof body.isActive !== 'boolean') {
    return sendJson(res, 400, { error: 'userId and isActive required' });
  }
  const { data: target } = await admin.from('users')
    .select('id, name, role, school_id').eq('id', body.userId).single();
  if (!target || target.school_id !== caller.school_id) {
    return sendJson(res, 404, { error: 'user not in this school' });
  }
  if (target.role === 'PRINCIPAL' || target.role === 'SUPER_ADMIN') {
    return sendJson(res, 403, { error: 'cannot change principal/super admin status here' });
  }
  const { error } = await admin.from('users')
    .update({ is_active: body.isActive, updated_at: new Date().toISOString() })
    .eq('id', body.userId);
  if (error) return sendJson(res, 500, { error: error.message });

  if (!body.isActive) {
    try { await admin.auth.admin.signOut(body.userId); } catch { /* ignore */ }
  }

  await logAuditAs(admin, caller.id, caller.school_id,
    body.isActive ? 'activate_user' : 'deactivate_user',
    'user', body.userId, { name: target.name, role: target.role });
  return sendJson(res, 200, { ok: true });
}

// ─── plugin ────────────────────────────────────────────────────────────────

function buildMiddleware(admin: SupabaseClient): Connect.NextHandleFunction {
  return async (req, res, next) => {
    if (!req.url || !req.url.startsWith('/api/admin/')) return next();
    if (req.method !== 'POST') return next();

    try {
      switch (req.url) {
        case '/api/admin/onboard-school':         return await handleOnboardSchool(req, res, admin);
        case '/api/admin/create-super-admin':     return await handleCreateSuperAdmin(req, res, admin);
        case '/api/admin/set-user-active':        return await handleSetUserActive(req, res, admin);
        case '/api/admin/reset-password':         return await handleResetPassword(req, res, admin);
        case '/api/admin/delete-school':          return await handleDeleteSchool(req, res, admin);
        case '/api/admin/create-school-user':     return await handleCreateSchoolUser(req, res, admin);
        case '/api/admin/link-parent-student':    return await handleLinkParentStudent(req, res, admin);
        case '/api/admin/reset-school-user-password': return await handleResetSchoolUserPassword(req, res, admin);
        case '/api/admin/set-school-user-active': return await handleSetSchoolUserActive(req, res, admin);
        default: return next();
      }
    } catch (e) {
      const err = e as { status?: number; message?: string } | undefined;
      const status = typeof err?.status === 'number' ? err.status : 500;
      sendJson(res, status, { error: err?.message ?? 'internal error' });
    }
  };
}

export function adminApiPlugin(): Plugin {
  return {
    name: 'edugrow-admin-api',
    configureServer(server: ViteDevServer) {
      try {
        const admin = makeAdminClient();
        server.middlewares.use(buildMiddleware(admin));
        server.config.logger.info('  ➜  admin api: /api/admin/* (dev)');
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        server.config.logger.warn(
          `[admin-api] disabled: ${msg}. Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to enable.`,
        );
      }
    },
    configurePreviewServer(server: PreviewServer) {
      try {
        const admin = makeAdminClient();
        server.middlewares.use(buildMiddleware(admin));
      } catch { /* silent in preview */ }
    },
  };
}
