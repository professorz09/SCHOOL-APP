// Flat /api/admin/* endpoints used by the Super Admin UI and principal
// account-management flows. Ported from the legacy Vite dev plugin
// (vite-plugins/admin-api.ts) so the same routes work on Vercel where
// only the bundled Express server runs.
//
// Response shape is intentionally flat (e.g. `{ school, principalUserId }`)
// to match what `src/lib/adminApi.ts` already expects — DO NOT wrap with
// the `ok()` / `fail()` helpers used by admin-schools.ts.

import { Router, type Request, type Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminDb, userDb } from '../lib/db';
import { requireAuth, requireRole } from '../middleware/auth';

export const adminRouter = Router();

const SA = requireRole('SUPER_ADMIN');
const PRINCIPAL = requireRole('PRINCIPAL');

const MOBILE_EMAIL_DOMAIN = '@edugrow.local';
const mobileToEmail = (m: string) => `${m.trim()}${MOBILE_EMAIL_DOMAIN}`;

function send(res: Response, status: number, body: unknown) {
  res.status(status).json(body);
}

async function findExistingAuthUserId(admin: SupabaseClient, email: string): Promise<string | null> {
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
  userId: string, schoolId: string | null, action: string,
  entityType: string, entityId: string | null, details: Record<string, unknown>,
) {
  await adminDb.from('audit_logs').insert({
    user_id: userId, school_id: schoolId, action,
    entity_type: entityType, entity_id: entityId, details,
  });
}

async function upsertSchoolUser(args: {
  mobile: string; name: string;
  role: 'TEACHER' | 'DRIVER' | 'PARENT';
  schoolId: string; password: string; email?: string | null;
}): Promise<{ userId: string; created: boolean; reused: boolean }> {
  const email = mobileToEmail(args.mobile);

  const { data: existing } = await adminDb
    .from('users').select('id, school_id, role, is_active')
    .eq('mobile_number', args.mobile).maybeSingle();
  if (existing) {
    if (existing.role !== args.role) {
      throw Object.assign(new Error(`mobile ${args.mobile} already registered as ${existing.role}`), { status: 409 });
    }
    if (existing.school_id && existing.school_id !== args.schoolId) {
      throw Object.assign(new Error(`mobile ${args.mobile} is already registered with another school`), { status: 409 });
    }
    return { userId: existing.id, created: false, reused: true };
  }

  let authUserId: string;
  let createdNewAuthUser = false;
  const created = await adminDb.auth.admin.createUser({
    email, password: args.password, email_confirm: true,
    user_metadata: { mobile_number: args.mobile, name: args.name, role: args.role },
  });
  if (created.error) {
    const found = await findExistingAuthUserId(adminDb, email);
    if (!found) throw Object.assign(new Error(created.error.message), { status: 500 });
    authUserId = found;
  } else {
    authUserId = created.data.user.id;
    createdNewAuthUser = true;
  }

  const { error: insErr } = await adminDb.from('users').insert({
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
      try { await adminDb.auth.admin.deleteUser(authUserId); } catch { /* ignore */ }
    }
    throw Object.assign(new Error(insErr.message), { status: 500 });
  }
  return { userId: authUserId, created: createdNewAuthUser, reused: false };
}

// ─── POST /api/admin/onboard-school ────────────────────────────────────────
adminRouter.post('/onboard-school', requireAuth, SA, async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      school: {
        name: string; code: string; location: string; address: string; phone: string;
        principalName: string; principalEmail: string; principalPhone: string;
        status: string; plan: string;
        paymentStartDate: string; annualAmount: number;
      };
      principalMobile: string;
      principalPassword: string;
    };
    const s = body?.school;
    if (!s?.name || !s.code || !body.principalMobile || !body.principalPassword) {
      return send(res, 400, { error: 'missing required fields' });
    }
    if (!/^\d{10}$/.test(body.principalMobile)) {
      return send(res, 400, { error: 'principal mobile must be 10 digits' });
    }
    if (body.principalPassword.length < 6) {
      return send(res, 400, { error: 'password must be at least 6 chars' });
    }

    {
      const { data: dup } = await adminDb.from('schools').select('id').eq('code', s.code).maybeSingle();
      if (dup) return send(res, 409, { error: `school code ${s.code} already exists` });
    }
    {
      const { data: dup } = await adminDb.from('users').select('id').eq('mobile_number', body.principalMobile).maybeSingle();
      if (dup) return send(res, 409, { error: `mobile ${body.principalMobile} is already registered` });
    }

    const annual = Number(s.annualAmount);
    if (!Number.isFinite(annual) || annual <= 0) {
      return send(res, 400, { error: 'annualAmount must be positive' });
    }

    const principalEmail = mobileToEmail(body.principalMobile);

    let authUserId: string | null = null;
    let createdNewAuthUser = false;
    const created = await adminDb.auth.admin.createUser({
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
      const existing = await findExistingAuthUserId(adminDb, principalEmail);
      if (!existing) return send(res, 500, { error: created.error.message });
      authUserId = existing;
    } else {
      authUserId = created.data.user.id;
      createdNewAuthUser = true;
    }

    // RPC enforces is_super_admin() via auth.uid(), so call it through the
    // caller's JWT — not the service-role key.
    const userClient = userDb(req.jwt);
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
      if (createdNewAuthUser && authUserId) {
        try { await adminDb.auth.admin.deleteUser(authUserId); } catch { /* ignore */ }
      }
      return send(res, 500, { error: rpcErr.message });
    }

    const schoolRow = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
    if (!schoolRow) {
      if (createdNewAuthUser && authUserId) {
        try { await adminDb.auth.admin.deleteUser(authUserId); } catch { /* ignore */ }
      }
      return send(res, 500, { error: 'onboard_school returned no row' });
    }

    return send(res, 200, { school: schoolRow, principalUserId: authUserId });
  } catch (e) {
    const err = e as { status?: number; message?: string };
    return send(res, err.status ?? 500, { error: err.message ?? 'internal error' });
  }
});

// ─── POST /api/admin/create-super-admin ────────────────────────────────────
adminRouter.post('/create-super-admin', requireAuth, SA, async (req, res) => {
  try {
    const body = req.body as { name: string; mobileNumber: string; password: string; email?: string };
    if (!body.name || !body.mobileNumber || !body.password) {
      return send(res, 400, { error: 'name, mobileNumber and password required' });
    }
    if (!/^\d{10}$/.test(body.mobileNumber)) {
      return send(res, 400, { error: 'mobileNumber must be 10 digits' });
    }
    const { data: dup } = await adminDb.from('users').select('id').eq('mobile_number', body.mobileNumber).maybeSingle();
    if (dup) return send(res, 409, { error: 'mobile already registered' });

    const email = mobileToEmail(body.mobileNumber);
    let userId: string | null = null;
    const created = await adminDb.auth.admin.createUser({
      email, password: body.password, email_confirm: true,
      user_metadata: { mobile_number: body.mobileNumber, name: body.name, role: 'SUPER_ADMIN' },
    });
    if (created.error) {
      const existing = await findExistingAuthUserId(adminDb, email);
      if (existing) userId = existing;
      else return send(res, 500, { error: created.error.message });
    } else {
      userId = created.data.user.id;
    }

    const { data: row, error } = await adminDb.from('users').insert({
      id: userId,
      mobile_number: body.mobileNumber,
      role: 'SUPER_ADMIN',
      name: body.name,
      email: body.email ?? null,
      school_id: null,
      first_login_changed: false,
      is_active: true,
    }).select('*').single();
    if (error) return send(res, 500, { error: error.message });

    await logAuditAs(req.user.id, null, 'create_admin', 'user', userId, {
      name: body.name, role: 'SUPER_ADMIN', mobile_number: body.mobileNumber,
    });
    return send(res, 200, { user: row });
  } catch (e) {
    const err = e as { status?: number; message?: string };
    return send(res, err.status ?? 500, { error: err.message ?? 'internal error' });
  }
});

// ─── POST /api/admin/set-user-active ───────────────────────────────────────
adminRouter.post('/set-user-active', requireAuth, SA, async (req, res) => {
  try {
    const body = req.body as { userId: string; isActive: boolean };
    if (!body.userId || typeof body.isActive !== 'boolean') {
      return send(res, 400, { error: 'userId and isActive required' });
    }
    const { data: target, error: tErr } = await adminDb
      .from('users').select('id, role, name').eq('id', body.userId).single();
    if (tErr || !target) return send(res, 404, { error: 'user not found' });
    if (target.role === 'SUPER_ADMIN' && target.id === req.user.id) {
      return send(res, 400, { error: 'cannot change own status' });
    }
    const { error } = await adminDb.from('users')
      .update({ is_active: body.isActive, updated_at: new Date().toISOString() })
      .eq('id', body.userId);
    if (error) return send(res, 500, { error: error.message });

    if (!body.isActive) {
      try { await adminDb.auth.admin.signOut(body.userId); } catch { /* ignore */ }
    }
    await logAuditAs(req.user.id, null,
      body.isActive ? 'activate_user' : 'deactivate_user',
      'user', body.userId, { name: target.name, role: target.role });
    return send(res, 200, { ok: true });
  } catch (e) {
    const err = e as { status?: number; message?: string };
    return send(res, err.status ?? 500, { error: err.message ?? 'internal error' });
  }
});

// ─── POST /api/admin/reset-password ────────────────────────────────────────
adminRouter.post('/reset-password', requireAuth, SA, async (req, res) => {
  try {
    const body = req.body as { userId: string; newPassword: string };
    if (!body.userId || !body.newPassword || body.newPassword.length < 6) {
      return send(res, 400, { error: 'userId and newPassword (>=6 chars) required' });
    }
    const { data: target, error: tErr } = await adminDb
      .from('users').select('id, name, role').eq('id', body.userId).single();
    if (tErr || !target) return send(res, 404, { error: 'user not found' });

    const { error: updErr } = await adminDb.auth.admin.updateUserById(body.userId, {
      password: body.newPassword,
    });
    if (updErr) return send(res, 500, { error: updErr.message });

    await adminDb.from('users')
      .update({ first_login_changed: false, updated_at: new Date().toISOString() })
      .eq('id', body.userId);

    await logAuditAs(req.user.id, null, 'reset_password', 'user', body.userId, {
      name: target.name, role: target.role,
    });
    return send(res, 200, { ok: true });
  } catch (e) {
    const err = e as { status?: number; message?: string };
    return send(res, err.status ?? 500, { error: err.message ?? 'internal error' });
  }
});

// ─── POST /api/admin/delete-school ─────────────────────────────────────────
adminRouter.post('/delete-school', requireAuth, SA, async (req, res) => {
  try {
    const body = req.body as { schoolId: string };
    if (!body.schoolId) return send(res, 400, { error: 'schoolId required' });

    const { data: school, error: sErr } = await adminDb
      .from('schools').select('id, name').eq('id', body.schoolId).single();
    if (sErr || !school) return send(res, 404, { error: 'school not found' });

    const { error } = await adminDb.from('schools')
      .update({ is_deleted: true, status: 'INACTIVE', updated_at: new Date().toISOString() })
      .eq('id', body.schoolId);
    if (error) return send(res, 500, { error: error.message });

    await logAuditAs(req.user.id, null, 'delete_school', 'school', body.schoolId, {
      name: school.name,
    });
    return send(res, 200, { ok: true });
  } catch (e) {
    const err = e as { status?: number; message?: string };
    return send(res, err.status ?? 500, { error: err.message ?? 'internal error' });
  }
});

// ─── POST /api/admin/create-school-user (principal) ────────────────────────
adminRouter.post('/create-school-user', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    if (!req.user.school_id) return send(res, 403, { error: 'principal has no school' });
    const body = req.body as {
      mobile: string; name: string; password?: string; email?: string;
      role: 'TEACHER' | 'DRIVER' | 'PARENT';
    };
    if (!body.mobile || !body.name || !body.role) {
      return send(res, 400, { error: 'mobile, name and role required' });
    }
    if (!/^\d{10}$/.test(body.mobile)) {
      return send(res, 400, { error: 'mobile must be 10 digits' });
    }
    if (!['TEACHER', 'DRIVER', 'PARENT'].includes(body.role)) {
      return send(res, 400, { error: 'invalid role' });
    }
    const password = body.password ?? body.mobile;

    let result;
    try {
      result = await upsertSchoolUser({
        mobile: body.mobile, name: body.name, role: body.role,
        schoolId: req.user.school_id, password, email: body.email ?? null,
      });
    } catch (e) {
      const err = e as { status?: number; message?: string };
      return send(res, err.status ?? 500, { error: err.message ?? 'failed' });
    }

    await logAuditAs(req.user.id, req.user.school_id,
      result.reused ? 'link_user' : 'create_user',
      'user', result.userId,
      { name: body.name, role: body.role, mobile_number: body.mobile });

    return send(res, 200, { userId: result.userId, reused: result.reused });
  } catch (e) {
    const err = e as { status?: number; message?: string };
    return send(res, err.status ?? 500, { error: err.message ?? 'internal error' });
  }
});

// ─── POST /api/admin/link-parent-student (principal) ───────────────────────
adminRouter.post('/link-parent-student', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    if (!req.user.school_id) return send(res, 403, { error: 'principal has no school' });
    const body = req.body as { parentUserId: string; studentId: string; relation: string };
    if (!body.parentUserId || !body.studentId) {
      return send(res, 400, { error: 'parentUserId and studentId required' });
    }

    const { data: parent } = await adminDb.from('users')
      .select('school_id, role').eq('id', body.parentUserId).single();
    if (!parent || parent.role !== 'PARENT' || parent.school_id !== req.user.school_id) {
      return send(res, 400, { error: 'parent not in this school' });
    }
    const { data: student } = await adminDb.from('students')
      .select('school_id').eq('id', body.studentId).single();
    if (!student || student.school_id !== req.user.school_id) {
      return send(res, 400, { error: 'student not in this school' });
    }

    const { error } = await adminDb.from('parent_student_links').upsert({
      parent_user_id: body.parentUserId,
      student_id: body.studentId,
      relation: body.relation ?? 'PARENT',
    }, { onConflict: 'parent_user_id,student_id' });
    if (error) return send(res, 500, { error: error.message });

    await logAuditAs(req.user.id, req.user.school_id, 'link_parent_student',
      'parent_student_link', body.studentId,
      { parent_user_id: body.parentUserId, relation: body.relation });
    return send(res, 200, { ok: true });
  } catch (e) {
    const err = e as { status?: number; message?: string };
    return send(res, err.status ?? 500, { error: err.message ?? 'internal error' });
  }
});

// ─── POST /api/admin/reset-school-user-password (principal) ────────────────
adminRouter.post('/reset-school-user-password', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    if (!req.user.school_id) return send(res, 403, { error: 'principal has no school' });
    const body = req.body as { userId: string; newPassword: string };
    if (!body.userId || !body.newPassword || body.newPassword.length < 4) {
      return send(res, 400, { error: 'userId and newPassword (>=4) required' });
    }
    const { data: target } = await adminDb.from('users')
      .select('id, name, role, school_id').eq('id', body.userId).single();
    if (!target || target.school_id !== req.user.school_id) {
      return send(res, 404, { error: 'user not in this school' });
    }
    if (target.role === 'PRINCIPAL' || target.role === 'SUPER_ADMIN') {
      return send(res, 403, { error: 'cannot reset principal/super admin password here' });
    }
    const { error: updErr } = await adminDb.auth.admin.updateUserById(body.userId, {
      password: body.newPassword,
    });
    if (updErr) return send(res, 500, { error: updErr.message });

    await adminDb.from('users')
      .update({ first_login_changed: false, updated_at: new Date().toISOString() })
      .eq('id', body.userId);

    await logAuditAs(req.user.id, req.user.school_id, 'reset_password', 'user', body.userId,
      { name: target.name, role: target.role });
    return send(res, 200, { ok: true });
  } catch (e) {
    const err = e as { status?: number; message?: string };
    return send(res, err.status ?? 500, { error: err.message ?? 'internal error' });
  }
});

// ─── POST /api/admin/set-school-user-active (principal) ────────────────────
adminRouter.post('/set-school-user-active', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    if (!req.user.school_id) return send(res, 403, { error: 'principal has no school' });
    const body = req.body as { userId: string; isActive: boolean };
    if (!body.userId || typeof body.isActive !== 'boolean') {
      return send(res, 400, { error: 'userId and isActive required' });
    }
    const { data: target } = await adminDb.from('users')
      .select('id, name, role, school_id').eq('id', body.userId).single();
    if (!target || target.school_id !== req.user.school_id) {
      return send(res, 404, { error: 'user not in this school' });
    }
    if (target.role === 'PRINCIPAL' || target.role === 'SUPER_ADMIN') {
      return send(res, 403, { error: 'cannot change principal/super admin status here' });
    }
    const { error } = await adminDb.from('users')
      .update({ is_active: body.isActive, updated_at: new Date().toISOString() })
      .eq('id', body.userId);
    if (error) return send(res, 500, { error: error.message });

    if (!body.isActive) {
      try { await adminDb.auth.admin.signOut(body.userId); } catch { /* ignore */ }
    }
    await logAuditAs(req.user.id, req.user.school_id,
      body.isActive ? 'activate_user' : 'deactivate_user',
      'user', body.userId, { name: target.name, role: target.role });
    return send(res, 200, { ok: true });
  } catch (e) {
    const err = e as { status?: number; message?: string };
    return send(res, err.status ?? 500, { error: err.message ?? 'internal error' });
  }
});
