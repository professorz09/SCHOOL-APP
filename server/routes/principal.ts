import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { adminDb, userDb } from '../lib/db';
import { ok, fail, ApiError, requireBody } from '../lib/helpers';
import { requireAuth, requireRole } from '../middleware/auth';
import {
  generateSchoolBackup, assertBackupAllowed, logBackupSuccess,
  type BackupKind,
} from '../lib/backup';

export const principalRouter = Router();

const PRINCIPAL = requireRole('PRINCIPAL');

// Resetting a user's password is sensitive — even though only the
// principal can call it, a compromised account could otherwise loop
// it to lock the entire school out. 20/hr is well above any real
// onboarding rush. Declared up here so the route handler below can
// reference it (limiter declared inline next to inventory works
// because that handler appears AFTER its declaration).
const resetPasswordLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 20,
  keyGenerator: (req: any) => `pw-reset:${req.user?.id ?? req.ip}`,
  validate: { keyGeneratorIpFallback: false },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { ok: false, error: 'Password-reset limit reached (20/hour). Try again later.' },
});

// ─── Connected Users (students + staff) — for the Settings → Users screen ──

// GET /api/principal/users/list — server-paginated. Used by Settings → Users
// where a school can have ~2000+ rows (students × 2 parents + staff). Same
// pattern as the slim list endpoint in studentService.getList — bounded
// page size and ILIKE search keep this constant-cost regardless of school
// size. Excludes the calling principal's own row so they can't accidentally
// reset their own password from this screen.
//
//   ?offset  — start row (default 0)
//   ?limit   — page size, capped server-side (default 50, max 200)
//   ?search  — case-insensitive ILIKE match on name OR mobile_number
//   ?role    — exact role filter ('TEACHER' | 'PARENT' | …) — narrows
//              before the count, so the badge in the UI stays accurate
// ─── GET /api/principal/backup?kind=quick|full ───────────────────────────────
// Same shape as the SuperAdmin route — but the school comes from the
// caller's session, not URL params. Quick = 1/24h, Full = 1/7d.
principalRouter.get('/backup', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const schoolId = req.user.school_id;
    if (!schoolId) throw new ApiError(403, 'No school in session');
    const rawKind = String(req.query.kind ?? 'quick').toUpperCase() as BackupKind;
    if (rawKind !== 'QUICK' && rawKind !== 'FULL') {
      throw new ApiError(400, 'kind must be "quick" or "full"');
    }

    await assertBackupAllowed(schoolId, rawKind);
    const result = await generateSchoolBackup(schoolId, rawKind);
    await logBackupSuccess(schoolId, req.user.id, rawKind, result.zipBytes.length);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('Content-Length', String(result.zipBytes.length));
    res.send(result.zipBytes);
  } catch (err) { fail(res, err); }
});

principalRouter.get('/users/list', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const offset = Math.max(0, parseInt(String(req.query.offset ?? '0'), 10) || 0);
    const limit  = Math.max(1, Math.min(200, parseInt(String(req.query.limit ?? '50'), 10) || 50));
    const search = String(req.query.search ?? '').trim();
    const role   = String(req.query.role ?? '').trim();

    let q = adminDb
      .from('users')
      .select('id, name, mobile_number, role, email, is_active, first_login_changed, last_login',
              { count: 'exact' })
      .eq('school_id', req.user.school_id!)
      .neq('id', req.user.id);

    if (role) q = q.eq('role', role);
    if (search) {
      // Escape ILIKE wildcards so a literal % / _ in a phone number can't
      // widen the match (defence-in-depth — Supabase parameterises these,
      // but explicit escaping makes the intent obvious in the logs).
      const safe = search.replace(/[%_]/g, ch => `\\${ch}`);
      q = q.or(`name.ilike.%${safe}%,mobile_number.ilike.%${safe}%`);
    }

    const { data, count, error } = await q
      .order('role').order('name')
      .range(offset, offset + limit - 1);
    if (error) throw new ApiError(500, error.message);

    const items = data ?? [];
    const total = count ?? items.length;
    ok(res, {
      items,
      total,
      hasMore:    offset + items.length < total,
      nextOffset: offset + items.length,
    });
  } catch (err) { fail(res, err); }
});

// Roles a principal is allowed to reset. PRINCIPAL and SUPER_ADMIN are
// excluded so a same-school co-principal or platform admin can't be locked
// out by a single principal action — those roles must use Settings → Security
// (self) or contact platform support.
const RESETTABLE_ROLES = new Set(['STUDENT', 'PARENT', 'TEACHER', 'DRIVER', 'PEON', 'STAFF']);

// POST /api/principal/users/reset-password — generates a random one-time
// temporary password, sets it on the auth user, and flips
// first_login_changed=false so the user MUST set a new password on next
// login. The temp password is returned in the response (and only there) so
// the principal can hand it over in person — it is never stored in the
// database. Previously this set the password to the user's mobile number,
// which is enumerable and was a takeover vector during the reset window.
//
// Guards:
//   1. Same-school check (cross-school target → 403)
//   2. Self-reset blocked (would lock principal out)
//   3. Role allowlist (no resetting other principals or super-admins)
//   4. Rate limit: same target can only be reset once per 7 days
//   5. Force logout: invalidates all active sessions for the target user
//   6. Audit log includes target role + IP (NOT the temp password)
function generateTempPassword(): string {
  // 10-char alphanumeric, mixed case + digit; satisfies the new
  // change-password complexity rule so the user can immediately replace it
  // without a "weaker than current" rejection.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const buf = new Uint8Array(10);
  // crypto is global in Node 19+ and available in this codebase already.
  (globalThis.crypto ?? require('node:crypto').webcrypto).getRandomValues(buf);
  let out = '';
  for (let i = 0; i < buf.length; i++) out += alphabet[buf[i] % alphabet.length];
  // Force at least one digit + one letter even if the random pick missed.
  return out.slice(0, 8) + '7Aa';
}

principalRouter.post('/users/reset-password', resetPasswordLimiter, requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const { userId } = requireBody<{ userId: string }>(req, ['userId']);

    if (userId === req.user.id) {
      throw new ApiError(400, 'Cannot reset your own password from here. Use Settings → Security.');
    }

    // Verify same-school ownership + load target details before touching anything.
    const { data: target } = await adminDb
      .from('users')
      .select('id, name, role, school_id, mobile_number')
      .eq('id', userId).maybeSingle();
    const t = target as { id: string; name: string; role: string; school_id: string | null; mobile_number: string } | null;
    if (!t) throw new ApiError(404, 'User not found');
    if (t.school_id !== req.user.school_id) {
      throw new ApiError(403, 'User is not in your school');
    }
    if (!RESETTABLE_ROLES.has(t.role)) {
      throw new ApiError(403, `Role ${t.role} cannot be reset from here. ${t.name} must change their password from their own Settings.`);
    }

    // Rate limit — once per 7 days per target user, regardless of which
    // principal does it. Prevents spam-locking a single user.
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recent } = await adminDb
      .from('audit_logs')
      .select('id, created_at')
      .eq('action', 'principal_reset_user_password')
      .eq('entity_id', t.id)
      .gte('created_at', sevenDaysAgo)
      .limit(1);
    if ((recent ?? []).length > 0) {
      const last = (recent as { created_at: string }[])[0].created_at;
      const nextAvailable = new Date(new Date(last).getTime() + 7 * 24 * 60 * 60 * 1000)
        .toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      throw new ApiError(429, `${t.name} ka password 7 din me ek baar hi reset ho sakta hai. Next available: ${nextAvailable}.`);
    }

    // Generate a fresh random temp password — never reuse the mobile number,
    // never persist the temp password anywhere besides the response.
    const tempPassword = generateTempPassword();
    const { error: pwErr } = await adminDb.auth.admin.updateUserById(t.id, {
      password: tempPassword,
    });
    if (pwErr) throw new ApiError(500, `Password reset failed: ${pwErr.message}`);

    const { error: flagErr } = await adminDb
      .from('users')
      .update({ first_login_changed: false, updated_at: new Date().toISOString() })
      .eq('id', t.id);
    if (flagErr) throw new ApiError(500, `Flag flip failed: ${flagErr.message}`);

    // Force logout: invalidate every active session for the target user so
    // their old JWT can't keep working until expiry. Best-effort — if the
    // sign-out API call fails the password is still reset.
    try {
      await adminDb.auth.admin.signOut(t.id);
    } catch (e) {
      console.warn('[reset-password] signOut failed', e);
    }

    // Audit who reset whom + IP for accountability.
    const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0].trim()
      ?? req.socket.remoteAddress
      ?? null;
    await adminDb.from('audit_logs').insert({
      user_id:     req.user.id,
      school_id:   req.user.school_id,
      action:      'principal_reset_user_password',
      entity_type: 'user',
      entity_id:   t.id,
      ip_address:  ip,
      details:     { target_name: t.name, target_role: t.role, target_mobile: t.mobile_number },
    });

    ok(res, { ok: true, name: t.name, mobile: t.mobile_number, tempPassword });
  } catch (err) { fail(res, err); }
});

// ─── Notices ─────────────────────────────────────────────────────────────────

// GET /api/principal/notice/list — also returns target student name when present
principalRouter.get('/notice/list', requireAuth, async (req, res) => {
  try {
    const { data, error } = await adminDb
      .from('notices')
      .select('id, title, body, audience, pinned, sent_by_name, created_at, target_student_id, students(name)')
      .eq('school_id', req.user.school_id!)
      .eq('is_active', true)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw new ApiError(500, error.message);
    // Flatten the joined student.name into target_student_name so the client
    // doesn't have to dig through the nested object.
    const rows = (data ?? []).map((n: any) => ({
      ...n,
      target_student_name: n.students?.name ?? null,
      students: undefined,
    }));
    ok(res, rows);
  } catch (err) { fail(res, err); }
});

// POST /api/principal/notice/create
principalRouter.post('/notice/create', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const body = requireBody<{
      title: string; body: string; audience: string;
      pinned?: boolean; sentBy?: string;
      targetStudentId?: string | null;
    }>(req, ['title', 'body', 'audience']);

    // SPECIFIC_STUDENT audience must include a target id; other audiences must NOT
    // (we store NULL so per-row filters stay clean).
    if (body.audience === 'SPECIFIC_STUDENT' && !body.targetStudentId) {
      throw new ApiError(400, 'targetStudentId required for SPECIFIC_STUDENT notices');
    }
    const targetId = body.audience === 'SPECIFIC_STUDENT' ? body.targetStudentId : null;

    const { data, error } = await adminDb.from('notices').insert({
      school_id:         req.user.school_id,
      title:             body.title,
      body:              body.body,
      audience:          body.audience,
      pinned:            body.pinned ?? false,
      sent_by:           req.user.id,
      sent_by_name:      body.sentBy || req.user.name || '',
      target_student_id: targetId,
    }).select('id, title, body, audience, pinned, sent_by_name, created_at, is_active, target_student_id, students(name)').single();
    if (error) throw new ApiError(500, error.message);
    const out: any = data;
    out.target_student_name = out?.students?.name ?? null;
    delete out.students;
    ok(res, out, 201);
  } catch (err) { fail(res, err); }
});

// POST /api/principal/notice/delete — soft delete
principalRouter.post('/notice/delete', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const { noticeId } = requireBody<{ noticeId: string }>(req, ['noticeId']);

    const { error } = await adminDb.from('notices')
      .update({ is_active: false })
      .eq('id', noticeId).eq('school_id', req.user.school_id!);
    if (error) throw new ApiError(500, error.message);
    ok(res, { noticeId });
  } catch (err) { fail(res, err); }
});

// ─── Complaints ───────────────────────────────────────────────────────────────

// POST /api/principal/complaint/resolve
principalRouter.post('/complaint/resolve', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const body = requireBody<{ complaintId: string; response: string }>(req, ['complaintId', 'response']);

    const COMPLAINT_FIELDS = 'id, from_role, from_name, from_class, subject, description, status, response, created_at, resolved_at';
    const { data, error } = await adminDb.from('complaints')
      .update({ status: 'RESOLVED', response: body.response, resolved_at: new Date().toISOString() })
      .eq('id', body.complaintId).eq('school_id', req.user.school_id!)
      .select(COMPLAINT_FIELDS).single();
    if (error) throw new ApiError(500, error.message);
    ok(res, data);
  } catch (err) { fail(res, err); }
});

// POST /api/principal/complaint/reject
principalRouter.post('/complaint/reject', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const body = requireBody<{ complaintId: string; reason: string }>(req, ['complaintId', 'reason']);

    const COMPLAINT_FIELDS = 'id, from_role, from_name, from_class, subject, description, status, response, created_at, resolved_at';
    const { data, error } = await adminDb.from('complaints')
      .update({ status: 'REJECTED', response: body.reason, resolved_at: new Date().toISOString() })
      .eq('id', body.complaintId).eq('school_id', req.user.school_id!)
      .select(COMPLAINT_FIELDS).single();
    if (error) throw new ApiError(500, error.message);
    ok(res, data);
  } catch (err) { fail(res, err); }
});

// ─── Expenses ─────────────────────────────────────────────────────────────────

// POST /api/principal/expense/add
principalRouter.post('/expense/add', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const body = requireBody<{
      category: string; description: string; amount: number; date: string; approvedBy?: string;
    }>(req, ['category', 'description', 'amount', 'date']);

    // Stamp the active academic year so reports / analytics scope correctly.
    // Falls back to NULL only if the school has no active year (shouldn't
    // happen in normal flow but doesn't block the write).
    const { data: yr } = await adminDb.from('academic_years')
      .select('id').eq('school_id', req.user.school_id!)
      .eq('is_active', true).maybeSingle();

    const { data, error } = await adminDb.from('expenses').insert({
      school_id:        req.user.school_id,
      academic_year_id: (yr as { id: string } | null)?.id ?? null,
      category:         body.category,
      description:      body.description,
      amount:           body.amount,
      date:             body.date,
      created_by:       req.user.id,
    }).select('id, school_id, academic_year_id, category, description, amount, date, created_by, created_at').single();
    if (error) throw new ApiError(500, error.message);
    ok(res, data, 201);
  } catch (err) { fail(res, err); }
});

// POST /api/principal/expense/update — same-school only
principalRouter.post('/expense/update', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const body = requireBody<{
      id: string; category?: string; description?: string;
      amount?: number; date?: string;
    }>(req, ['id']);

    const patch: Record<string, unknown> = {};
    if (body.category    !== undefined) patch.category    = body.category;
    if (body.description !== undefined) patch.description = body.description;
    if (body.amount      !== undefined) patch.amount      = body.amount;
    if (body.date        !== undefined) patch.date        = body.date;
    if (Object.keys(patch).length === 0) throw new ApiError(400, 'No fields to update');

    const { data, error } = await adminDb.from('expenses')
      .update(patch)
      .eq('id', body.id).eq('school_id', req.user.school_id!)
      .select('id, school_id, academic_year_id, category, description, amount, date, created_by, created_at').single();
    if (error) throw new ApiError(500, error.message);
    if (!data) throw new ApiError(404, 'Expense not found');
    ok(res, data);
  } catch (err) { fail(res, err); }
});

// POST /api/principal/expense/void
//
// Soft-cancels an expense without removing the row. Financial records
// stay immutable on disk; the principal sees a "VOIDED" badge in the
// list and the original line + a reason are preserved in the audit
// log. Rules enforced server-side:
//   • Caller must be the same school's principal (RLS + explicit eq).
//   • Reason is mandatory (>= 3 chars) — UI also gates this, but the
//     server is the last line of defence.
//   • Void window: 7 days from the original `created_at`. Older rows
//     are immutable — corrections must be done with a counter-entry.
//   • Idempotent: re-voiding an already-voided row is a 409.
principalRouter.post('/expense/void', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const { id, reason } = requireBody<{ id: string; reason: string }>(req, ['id', 'reason']);
    const r = (reason ?? '').trim();
    if (r.length < 3) throw new ApiError(400, 'Reason must be at least 3 characters');

    const { data: existing, error: lookupErr } = await adminDb.from('expenses')
      .select('id, school_id, voided_at, created_at, amount, category, description')
      .eq('id', id).eq('school_id', req.user.school_id!).maybeSingle();
    if (lookupErr) throw new ApiError(500, lookupErr.message);
    if (!existing) throw new ApiError(404, 'Expense not found');
    if (existing.voided_at) throw new ApiError(409, 'Expense is already voided');

    // 7-day void window. After that, file a corrective counter-entry
    // — never rewrite history.
    const ageMs = Date.now() - new Date(existing.created_at).getTime();
    if (ageMs > 7 * 24 * 60 * 60 * 1000) {
      throw new ApiError(403, '7 din se purana expense void nahi ho sakta — naya correction entry banayein');
    }

    const { data, error } = await adminDb.from('expenses')
      .update({ voided_at: new Date().toISOString(), voided_by: req.user.id, void_reason: r })
      .eq('id', id).eq('school_id', req.user.school_id!)
      .select('id, school_id, academic_year_id, category, description, amount, date, created_by, created_at, voided_at, voided_by, void_reason').single();
    if (error) throw new ApiError(500, error.message);
    ok(res, data);
  } catch (err) { fail(res, err); }
});

// POST /api/principal/expense/delete
//
// Hard delete is allowed ONLY on the same calendar day the expense was
// recorded. The reasoning: same-day rows are still effectively a draft —
// no monthly report has consumed them yet, so removing a typo or a
// duplicate keeps the books clean without an awkward "void" trail.
// Anything older must use /expense/void which preserves the row.
principalRouter.post('/expense/delete', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const { id } = requireBody<{ id: string }>(req, ['id']);
    const { data: existing, error: lookupErr } = await adminDb.from('expenses')
      .select('id, school_id, created_at, voided_at')
      .eq('id', id).eq('school_id', req.user.school_id!).maybeSingle();
    if (lookupErr) throw new ApiError(500, lookupErr.message);
    if (!existing) throw new ApiError(404, 'Expense not found');
    if (existing.voided_at) throw new ApiError(409, 'Voided rows cannot be deleted');

    // Same-day check anchored to IST so a principal in India sees the
    // same boundary the row's `date` field uses.
    const istNow   = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const istThen  = new Date(new Date(existing.created_at).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const sameDay = istNow.toDateString() === istThen.toDateString();
    if (!sameDay) {
      throw new ApiError(403, 'Same-day delete only — purane expenses ko Void karein');
    }

    const { error } = await adminDb.from('expenses')
      .delete().eq('id', id).eq('school_id', req.user.school_id!);
    if (error) throw new ApiError(500, error.message);
    ok(res, { id });
  } catch (err) { fail(res, err); }
});

// ─── Approvals ────────────────────────────────────────────────────────────────

const APPROVAL_FIELDS = 'id, school_id, request_type, requested_by, entity_type, entity_id, old_value, new_value, status, approved_by, approved_at, created_at';

// POST /api/principal/approval/approve
principalRouter.post('/approval/approve', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const { approvalId } = requireBody<{ approvalId: string }>(req, ['approvalId']);

    const { data: row, error: readErr } = await adminDb.from('approvals')
      .select(APPROVAL_FIELDS)
      .eq('id', approvalId).eq('school_id', req.user.school_id!).maybeSingle();
    if (readErr) throw new ApiError(500, readErr.message);
    if (!row) throw new ApiError(404, 'Approval not found');
    const a = row as any;
    if (a.status !== 'PENDING') throw new ApiError(409, `Approval is already ${a.status}`);

    if (a.request_type === 'PROFILE_CHANGE' || a.request_type === 'STUDENT_FIELD_CHANGE') {
      // Conditional flip first to claim the row; only proceed to apply if we
      // were the one to win the race. apply_change_request is idempotent on
      // a non-PENDING row but we still don't want both principals' RPCs to
      // run side-effects twice.
      const { data: claimed } = await adminDb.from('approvals')
        .update({ status: 'APPROVED', approved_by: req.user.id, approved_at: new Date().toISOString() })
        .eq('id', approvalId)
        .eq('school_id', req.user.school_id!)
        .eq('status', 'PENDING')
        .select('id');
      if (!claimed || claimed.length === 0) {
        throw new ApiError(409, 'Approval was just acted on by someone else — refresh and try again');
      }
      const db = userDb(req.jwt);
      const { error: rpcErr } = await db.rpc('apply_change_request', {
        p_approval_id: approvalId, p_approve: true, p_reason: null,
      });
      if (rpcErr) throw new ApiError(500, rpcErr.message);
    } else {
      const { data: updated, error } = await adminDb.from('approvals').update({
        status: 'APPROVED',
        approved_by: req.user.id,
        approved_at: new Date().toISOString(),
      }).eq('id', approvalId).eq('school_id', req.user.school_id!).eq('status', 'PENDING')
        .select('id');
      if (error) throw new ApiError(500, error.message);
      if (!updated || updated.length === 0) {
        throw new ApiError(409, 'Approval was just acted on by someone else — refresh and try again');
      }
    }

    const { data: updated } = await adminDb.from('approvals')
      .select(APPROVAL_FIELDS).eq('id', approvalId).single();
    ok(res, updated);
  } catch (err) { fail(res, err); }
});

// POST /api/principal/approval/reject
principalRouter.post('/approval/reject', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const body = requireBody<{ approvalId: string; reason?: string }>(req, ['approvalId']);

    const { data: cur, error: readErr } = await adminDb.from('approvals')
      .select('new_value, status').eq('id', body.approvalId).eq('school_id', req.user.school_id!).maybeSingle();
    if (readErr) throw new ApiError(500, readErr.message);
    if (!cur) throw new ApiError(404, 'Approval not found');
    if ((cur as any).status !== 'PENDING') throw new ApiError(409, `Approval is already ${(cur as any).status}`);
    const nv = ((cur as any)?.new_value as Record<string, unknown>) ?? {};
    nv['rejectionReason'] = body.reason ?? null;

    const { data, error } = await adminDb.from('approvals').update({
      status: 'REJECTED',
      new_value: nv,
      approved_by: req.user.id,
      approved_at: new Date().toISOString(),
    }).eq('id', body.approvalId).eq('school_id', req.user.school_id!).eq('status', 'PENDING')
      .select(APPROVAL_FIELDS);
    if (error) throw new ApiError(500, error.message);
    if (!data || data.length === 0) throw new ApiError(409, 'Approval was just acted on by someone else — refresh and try again');
    ok(res, data[0]);
  } catch (err) { fail(res, err); }
});

// POST /api/principal/leave/submit — student leave request.
// Authenticated PRINCIPAL/TEACHER/PARENT may submit; PARENT must be linked to
// the student via parent_student_links (ownership enforced server-side, RLS-bypass
// via adminDb).
principalRouter.post('/leave/submit', requireAuth, async (req, res) => {
  try {
    const body = requireBody<{
      studentId: string; studentName: string; title: string;
      fromDate: string; toDate: string; reason: string;
    }>(req, ['studentId', 'studentName', 'title', 'fromDate', 'toDate', 'reason']);

    // Ownership check for PARENT/STUDENT roles. PRINCIPAL/TEACHER skip this.
    if (req.user.role === 'PARENT' || req.user.role === 'STUDENT') {
      const { data: link } = await adminDb
        .from('parent_student_links')
        .select('id')
        .eq('parent_user_id', req.user.id)
        .eq('student_id', body.studentId)
        .maybeSingle();
      if (!link) throw new ApiError(403, 'Not linked to this student');

      // Anti-spam: max 3 leave applications per student per IST day. The DB
      // trigger (migration 0052) enforces the same rule, but it bypasses
      // service-role inserts — so we explicitly check here for parent traffic.
      // 'en-CA' formatter emits YYYY-MM-DD; midnight IST is 18:30 UTC the
      // previous day, hence the +05:30 offset.
      const istToday = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      const dayStartIST = new Date(`${istToday}T00:00:00+05:30`).toISOString();
      const { count: todayCount } = await adminDb
        .from('approvals')
        .select('id', { count: 'exact', head: true })
        .eq('request_type', 'LEAVE')
        .eq('entity_type', 'student')
        .eq('entity_id', body.studentId)
        .gte('created_at', dayStartIST);
      if ((todayCount ?? 0) >= 3) {
        throw new ApiError(429,
          'Daily limit reached — only 3 leave applications allowed per student per day. Please contact the school office for another submission.');
      }
    }

    const newValue = {
      fromName: body.studentName, fromRole: 'STUDENT', subject: body.title,
      description: `From: ${body.fromDate}  To: ${body.toDate}\nReason: ${body.reason}`,
      fromDate: body.fromDate, toDate: body.toDate, reason: body.reason,
    };

    const { data, error } = await adminDb.from('approvals').insert({
      school_id:    req.user.school_id,
      request_type: 'LEAVE',
      requested_by: req.user.id,
      entity_type:  'student',
      entity_id:    body.studentId,
      new_value:    newValue,
      status:       'PENDING',
    }).select(APPROVAL_FIELDS).single();
    if (error) throw new ApiError(500, error.message);
    ok(res, data, 201);
  } catch (err) { fail(res, err); }
});

// GET /api/principal/leave/list?studentId=... — list leaves for one student.
// Same ownership rules as submit. Bypasses RLS so PARENT can read their own
// approvals row (RLS only allows PRINCIPAL/TEACHER selects on `approvals`).
principalRouter.get('/leave/list', requireAuth, async (req, res) => {
  try {
    const studentId = String(req.query.studentId ?? '');
    if (!studentId) throw new ApiError(400, 'studentId required');

    if (req.user.role === 'PARENT' || req.user.role === 'STUDENT') {
      const { data: link } = await adminDb
        .from('parent_student_links')
        .select('id')
        .eq('parent_user_id', req.user.id)
        .eq('student_id', studentId)
        .maybeSingle();
      if (!link) throw new ApiError(403, 'Not linked to this student');
    }

    const { data, error } = await adminDb
      .from('approvals')
      .select(APPROVAL_FIELDS)
      .eq('school_id', req.user.school_id!)
      .eq('request_type', 'LEAVE')
      .eq('entity_type', 'student')
      .eq('entity_id', studentId)
      .order('created_at', { ascending: false });
    if (error) throw new ApiError(500, error.message);
    ok(res, data ?? []);
  } catch (err) { fail(res, err); }
});

// ─── Library — Books ──────────────────────────────────────────────────────────

// ─── Unified Inventory ─────────────────────────────────────────────────────
//
// New flat-inventory model for assets. The earlier UI bound principals to a
// strict Library/Lab split with student-loan tracking; this endpoint is just
// "school owns these things, in these counts". No assignments, no loans.
//
// Rate-limited per principal so a stuck "add then delete" loop can't flood
// the assets table. 30 add operations per 5-minute window comfortably covers
// real onboarding (initial inventory bulk add) without enabling spam.

const inventoryAddLimiter = rateLimit({
  windowMs: 5 * 60_000,
  limit: 30,
  // The express-rate-limit validator string-greps for `req.ip` and warns
  // about IPv6 even when our keyGenerator falls back through `req.user.id`
  // first. Suppress the false positive — auth users (req.user.id) are the
  // primary identity here; the IP fallback is only for unauthenticated
  // edge cases (which shouldn't happen on this route at all).
  keyGenerator: (req: any) => `inv-add:${req.user?.id ?? req.ip}`,
  validate: { keyGeneratorIpFallback: false },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { ok: false, error: 'Too many inventory additions — slow down for a few minutes.' },
});

// GET /api/principal/inventory/list
// Returns every asset row for the school as a flat list with the bits the
// new UI consumes (id, category, title, description, note, quantity,
// addedOn, createdAt). category is BOOK/LAB_EQUIPMENT/OTHER per the
// existing CHECK constraint; description/note live in the `details` jsonb.
principalRouter.get('/inventory/list', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const { data, error } = await adminDb.from('assets')
      .select('id, category, name, details, total_count, available_count, created_at, updated_at')
      .eq('school_id', req.user.school_id!)
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    if (error) throw new ApiError(500, error.message);

    const rows = (data ?? []) as Array<{
      id: string; category: string; name: string;
      details: { description?: string; note?: string; addedOn?: string;
                 author?: string; subject?: string; isbn?: string;
                 labType?: string; lastServiced?: string } | null;
      total_count: number; available_count: number;
      created_at: string; updated_at: string;
    }>;
    ok(res, rows.map(r => ({
      id: r.id,
      category: r.category,
      title: r.name,
      // Description seeded from the new `description` field; for legacy book
      // rows the principal added under the old UI we synthesise a friendly
      // description from author/subject so the timeline stays readable.
      description: r.details?.description
        ?? [r.details?.author, r.details?.subject].filter(Boolean).join(' · ')
        ?? '',
      note:        r.details?.note ?? '',
      quantity:    r.total_count,
      addedOn:     r.details?.addedOn ?? r.created_at.slice(0, 10),
      createdAt:   r.created_at,
    })));
  } catch (err) { fail(res, err); }
});

// POST /api/principal/inventory/add
// title + category + quantity required; description, note, addedOn optional.
// Falls back to today for addedOn so the timeline always has a stable bucket.
principalRouter.post('/inventory/add', requireAuth, PRINCIPAL, inventoryAddLimiter, async (req, res) => {
  try {
    const body = requireBody<{
      title: string; category: 'BOOK' | 'LAB_EQUIPMENT' | 'OTHER';
      quantity: number; description?: string; note?: string; addedOn?: string;
    }>(req, ['title', 'category', 'quantity']);

    if (!['BOOK', 'LAB_EQUIPMENT', 'OTHER'].includes(body.category)) {
      throw new ApiError(400, 'Invalid category');
    }
    if (!Number.isFinite(body.quantity) || body.quantity < 1) {
      throw new ApiError(400, 'Quantity must be at least 1');
    }
    const title = body.title.trim();
    if (!title) throw new ApiError(400, 'Title required');

    const today = new Date().toISOString().slice(0, 10);

    const { data, error } = await adminDb.from('assets').insert({
      school_id:       req.user.school_id,
      category:        body.category,
      name:            title,
      details: {
        description: body.description?.trim() || '',
        note:        body.note?.trim() || '',
        addedOn:     body.addedOn || today,
      },
      total_count:     Math.round(body.quantity),
      // Mirror available = total. Loan tracking is gone in the new model —
      // available_count exists only because the column is NOT NULL.
      available_count: Math.round(body.quantity),
    }).select('id').single();
    if (error) throw new ApiError(500, error.message);

    const newId = (data as { id: string }).id;
    // Audit log entry (7-day TTL, 1000-row cap enforced by trigger). Failure
    // here is non-fatal — the asset row is already in. The trigger handles
    // pruning, so we don't need any further bookkeeping here.
    await adminDb.from('inventory_history').insert({
      school_id:    req.user.school_id,
      asset_id:     newId,
      action:       'ADD',
      title,
      category:     body.category,
      quantity:     Math.round(body.quantity),
      description:  body.description?.trim() || null,
      note:         body.note?.trim() || null,
      done_by:      req.user.id,
      done_by_name: req.user.name ?? null,
    });

    ok(res, { id: newId }, 201);
  } catch (err) { fail(res, err); }
});

// POST /api/principal/inventory/delete
principalRouter.post('/inventory/delete', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const { id } = requireBody<{ id: string }>(req, ['id']);

    // Snapshot the row BEFORE deleting so the audit entry has the title /
    // category / qty even after the asset row is gone. If the row already
    // doesn't exist we still bail with 404.
    const { data: snap } = await adminDb.from('assets')
      .select('id, name, category, total_count, details')
      .eq('id', id).eq('school_id', req.user.school_id!).maybeSingle();
    if (!snap) throw new ApiError(404, 'Item not found');

    const { error } = await adminDb.from('assets').delete()
      .eq('id', id).eq('school_id', req.user.school_id!);
    if (error) throw new ApiError(500, error.message);

    const s = snap as { id: string; name: string; category: string; total_count: number;
      details: { description?: string; note?: string } | null };
    await adminDb.from('inventory_history').insert({
      school_id:    req.user.school_id,
      asset_id:     s.id,
      action:       'DELETE',
      title:        s.name,
      category:     s.category,
      quantity:     s.total_count,
      description:  s.details?.description ?? null,
      note:         s.details?.note ?? null,
      done_by:      req.user.id,
      done_by_name: req.user.name ?? null,
    });

    ok(res, { id });
  } catch (err) { fail(res, err); }
});

// GET /api/principal/inventory/history
// Read the audit log. Trigger keeps it pruned to 7 days / 1000 rows so the
// principal sees only the recent activity window.
principalRouter.get('/inventory/history', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const { data, error } = await adminDb.from('inventory_history')
      .select('id, action, title, category, quantity, description, note, done_by_name, done_at')
      .eq('school_id', req.user.school_id!)
      .order('done_at', { ascending: false })
      .limit(1000);
    if (error) throw new ApiError(500, error.message);
    ok(res, data ?? []);
  } catch (err) { fail(res, err); }
});

// POST /api/principal/inventory/update
// Lets the principal change quantity / title / description / note without
// rebuilding the row. Useful when stock changes (broken units removed,
// donations received). addedOn intentionally NOT editable — it's the
// "purchased on" anchor and editing it would shuffle timeline groups.
principalRouter.post('/inventory/update', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const body = requireBody<{
      id: string; title?: string; quantity?: number;
      description?: string; note?: string;
    }>(req, ['id']);

    const { data: existing, error: gErr } = await adminDb.from('assets')
      .select('details').eq('id', body.id).eq('school_id', req.user.school_id!).maybeSingle();
    if (gErr) throw new ApiError(500, gErr.message);
    if (!existing) throw new ApiError(404, 'Item not found');
    const prevDetails = (existing as { details: Record<string, unknown> | null }).details ?? {};

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.title !== undefined) patch.name = body.title.trim();
    if (body.quantity !== undefined) {
      if (!Number.isFinite(body.quantity) || body.quantity < 0) {
        throw new ApiError(400, 'Quantity must be non-negative');
      }
      patch.total_count = Math.round(body.quantity);
      patch.available_count = Math.round(body.quantity);
    }
    if (body.description !== undefined || body.note !== undefined) {
      patch.details = {
        ...prevDetails,
        ...(body.description !== undefined ? { description: body.description.trim() } : {}),
        ...(body.note !== undefined ? { note: body.note.trim() } : {}),
      };
    }

    const { error } = await adminDb.from('assets').update(patch)
      .eq('id', body.id).eq('school_id', req.user.school_id!);
    if (error) throw new ApiError(500, error.message);
    ok(res, { id: body.id });
  } catch (err) { fail(res, err); }
});

// POST /api/principal/library/book/add
principalRouter.post('/library/book/add', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const body = requireBody<{
      title: string; author?: string; isbn?: string; subject?: string; totalCopies: number;
    }>(req, ['title', 'totalCopies']);

    const { data, error } = await adminDb.from('assets').insert({
      school_id:       req.user.school_id,
      category:        'BOOK',
      name:            body.title,
      details:         { author: body.author ?? '', isbn: body.isbn ?? '', subject: body.subject ?? '' },
      total_count:     body.totalCopies,
      available_count: body.totalCopies,
    }).select('id, name, details, total_count, available_count').single();
    if (error) throw new ApiError(500, error.message);
    ok(res, data, 201);
  } catch (err) { fail(res, err); }
});

// POST /api/principal/library/book/delete
principalRouter.post('/library/book/delete', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const { bookId } = requireBody<{ bookId: string }>(req, ['bookId']);
    const { error } = await adminDb.from('assets').delete()
      .eq('id', bookId).eq('school_id', req.user.school_id!);
    if (error) throw new ApiError(500, error.message);
    ok(res, { bookId });
  } catch (err) { fail(res, err); }
});

// POST /api/principal/library/book/issue — REMOVED. The new flat-inventory
// model has no per-student loans; the issue_asset / return_asset RPCs were
// dropped in migration 0062. Endpoints below return 410 Gone so any stale
// client still calling them gets a clear signal instead of a 500 from a
// missing RPC. Safe to delete entirely after the next deploy cycle.
principalRouter.post('/library/book/issue', requireAuth, PRINCIPAL, async (_req, res) => {
  res.status(410).json({ ok: false, error: 'Loan tracking removed — use the unified inventory list.' });
});
principalRouter.post('/library/book/return', requireAuth, PRINCIPAL, async (_req, res) => {
  res.status(410).json({ ok: false, error: 'Loan tracking removed — use the unified inventory list.' });
});

// ─── Library — Lab Equipment ──────────────────────────────────────────────────

// POST /api/principal/library/equipment/add
principalRouter.post('/library/equipment/add', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const body = requireBody<{
      name: string; labType?: string; quantity: number;
      workingCount: number; lastServiced?: string;
    }>(req, ['name', 'quantity', 'workingCount']);

    const { data, error } = await adminDb.from('assets').insert({
      school_id:       req.user.school_id,
      category:        'LAB_EQUIPMENT',
      name:            body.name,
      details:         { labType: body.labType ?? 'SCIENCE', lastServiced: body.lastServiced ?? new Date().toISOString().slice(0, 10) },
      total_count:     body.quantity,
      available_count: body.workingCount,
    }).select('id, name, details, total_count, available_count').single();
    if (error) throw new ApiError(500, error.message);
    ok(res, data, 201);
  } catch (err) { fail(res, err); }
});

// POST /api/principal/library/equipment/delete
principalRouter.post('/library/equipment/delete', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const { equipmentId } = requireBody<{ equipmentId: string }>(req, ['equipmentId']);
    const { error } = await adminDb.from('assets').delete()
      .eq('id', equipmentId).eq('school_id', req.user.school_id!);
    if (error) throw new ApiError(500, error.message);
    ok(res, { equipmentId });
  } catch (err) { fail(res, err); }
});

// POST /api/principal/library/equipment/update
principalRouter.post('/library/equipment/update', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const body = requireBody<{
      equipmentId: string;
      name?: string; quantity?: number; workingCount?: number;
      labType?: string; lastServiced?: string;
    }>(req, ['equipmentId']);

    const patch: Record<string, unknown> = {};
    if (body.name         !== undefined) patch.name            = body.name;
    if (body.quantity     !== undefined) patch.total_count     = body.quantity;
    if (body.workingCount !== undefined) patch.available_count = body.workingCount;

    if (body.labType !== undefined || body.lastServiced !== undefined) {
      const { data: cur } = await adminDb.from('assets').select('details')
        .eq('id', body.equipmentId).eq('school_id', req.user.school_id!).single();
      const curDet = ((cur as any)?.details ?? {}) as Record<string, unknown>;
      patch.details = {
        ...curDet,
        ...(body.labType      !== undefined ? { labType:      body.labType }      : {}),
        ...(body.lastServiced !== undefined ? { lastServiced: body.lastServiced } : {}),
      };
    }

    const { data, error } = await adminDb.from('assets').update(patch)
      .eq('id', body.equipmentId).eq('school_id', req.user.school_id!)
      .select('id, name, details, total_count, available_count, updated_at').single();
    if (error) throw new ApiError(500, error.message);
    ok(res, data);
  } catch (err) { fail(res, err); }
});

// ─── Academic Year Config — Sections ─────────────────────────────────────────

// POST /api/principal/ay-config/sections
principalRouter.post('/ay-config/sections', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const body = requireBody<{
      yearId: string;
      toInsert: { class_name: string; section: string }[];
      toDelete: string[];
    }>(req, ['yearId', 'toInsert', 'toDelete']);

    // Verify year belongs to school
    const { data: yr } = await adminDb.from('academic_years').select('id')
      .eq('id', body.yearId).eq('school_id', req.user.school_id!).maybeSingle();
    if (!yr) throw new ApiError(404, 'Academic year not found');

    if (body.toInsert.length) {
      const rows = body.toInsert.map(s => ({
        school_id:        req.user.school_id,
        academic_year_id: body.yearId,
        class_name:       s.class_name,
        section:          s.section,
      }));
      const { error } = await adminDb.from('sections').insert(rows);
      if (error) throw new ApiError(500, error.message);
    }
    if (body.toDelete.length) {
      const { error } = await adminDb.from('sections').delete()
        .eq('school_id', req.user.school_id!)
        .eq('academic_year_id', body.yearId)
        .in('id', body.toDelete);
      if (error) throw new ApiError(500, error.message);
    }

    ok(res, { added: body.toInsert.length, removed: body.toDelete.length });
  } catch (err) { fail(res, err); }
});

// ─── Staff Attendance ─────────────────────────────────────────────────────────

// POST /api/principal/staff-attendance/save
principalRouter.post('/staff-attendance/save', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const body = requireBody<{
      date: string;
      rows: { staffId: string; status: string }[];
      clearedStaffIds?: string[];
      editorMode?: boolean;
    }>(req, ['date', 'rows']);

    const clearedStaffIds: string[] = body.clearedStaffIds ?? [];
    if (!body.rows.length && !clearedStaffIds.length) throw new ApiError(400, 'No staff to record');

    // Date guard — server-side defence-in-depth. The client's date
    // picker has max=today and a year-window check, but a forged
    // payload could still try to write a future / out-of-year date.
    const todayIso = new Date().toISOString().slice(0, 10);
    if (body.date > todayIso) {
      throw new ApiError(400, 'Future-dated staff attendance is not allowed');
    }
    // Year-bounds check: pull the AY whose window covers body.date.
    // If no AY for the school covers the date (e.g. a date before
    // the very first year was created), reject the write.
    const { data: ayMatch } = await adminDb
      .from('academic_years')
      .select('id, start_date, end_date')
      .eq('school_id', req.user.school_id!)
      .lte('start_date', body.date)
      .gte('end_date', body.date)
      .maybeSingle();
    if (!ayMatch) {
      throw new ApiError(400, `Date ${body.date} is outside every academic year configured for this school`);
    }

    // Hard-lock guard: salary-generated records cannot be modified by anyone.
    const { data: hardLocked } = await adminDb
      .from('staff_attendance')
      .select('id')
      .eq('school_id', req.user.school_id!)
      .eq('date', body.date)
      .eq('is_locked', true)
      .limit(1)
      .maybeSingle();
    if (hardLocked) throw new ApiError(403, 'Attendance is hard-locked (salary generated) — cannot modify');

    const nowIso = new Date().toISOString();

    if (clearedStaffIds.length) {
      const { error } = await adminDb.from('staff_attendance').delete()
        .eq('school_id', req.user.school_id!).eq('date', body.date)
        .in('staff_id', clearedStaffIds);
      if (error) throw new ApiError(500, error.message);
    }

    if (body.rows.length) {
      const payload = body.rows.map(r => ({
        school_id:   req.user.school_id,
        staff_id:    r.staffId,
        date:        body.date,
        status:      r.status,
        marked_by:   req.user.id,
        modified_by: req.user.id,
        created_at:  nowIso,
        // updated_at is intentionally omitted on INSERT so it matches
        // created_at (first-save signal). The trigger bumps it on UPDATE.
      }));
      const { error } = await adminDb.from('staff_attendance')
        .upsert(payload, { onConflict: 'staff_id,date', ignoreDuplicates: false });
      if (error) throw new ApiError(500, error.message);
    }

    // Re-query to get accurate timestamps after upsert (trigger may have fired).
    const { data: ts } = await adminDb
      .from('staff_attendance')
      .select('created_at, updated_at')
      .eq('school_id', req.user.school_id!)
      .eq('date', body.date)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const row = ts as { created_at: string; updated_at: string | null } | null;
    const savedAt    = row?.created_at ?? nowIso;
    const modifiedAt = (row?.updated_at && row.updated_at !== row.created_at)
      ? row.updated_at : null;

    // Audit log — uses existing audit_logs table (migration 0001).
    await adminDb.from('audit_logs').insert({
      user_id:     req.user.id,
      school_id:   req.user.school_id,
      action:      modifiedAt ? 'staff_attendance_modified' : 'staff_attendance_saved',
      entity_type: 'staff_attendance',
      details: {
        date:          body.date,
        editor_mode:   !!body.editorMode,
        row_count:     body.rows?.length ?? 0,
        cleared_count: clearedStaffIds.length,
      },
    }).throwOnError();

    ok(res, { savedAt, modifiedAt });
  } catch (err) { fail(res, err); }
});

// ─── Staff Permissions ────────────────────────────────────────────────────────

// POST /api/principal/permissions/set
principalRouter.post('/permissions/set', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const body = requireBody<{
      teacherId: string; className: string; section: string;
      canMarkAttendance: boolean; canUploadResults: boolean; canScheduleExam: boolean;
    }>(req, ['teacherId', 'className', 'section']);

    const { data: ay } = await adminDb.from('academic_years').select('id')
      .eq('school_id', req.user.school_id!).eq('is_active', true).maybeSingle();
    if (!ay) throw new ApiError(400, 'No active academic year');
    const ayId = (ay as any).id as string;

    const { data: sec } = await adminDb.from('sections').select('id')
      .eq('school_id', req.user.school_id!).eq('academic_year_id', ayId)
      .eq('class_name', body.className).eq('section', body.section).maybeSingle();
    if (!sec) throw new ApiError(404, `Section ${body.className}-${body.section} not found`);
    const sectionId = (sec as any).id as string;

    await adminDb.from('staff_permissions').delete()
      .eq('school_id', req.user.school_id!).eq('academic_year_id', ayId)
      .eq('staff_id', body.teacherId).eq('section_id', sectionId);

    const rows: any[] = [];
    if (body.canMarkAttendance) rows.push({ school_id: req.user.school_id, staff_id: body.teacherId, academic_year_id: ayId, section_id: sectionId, permission: 'MARK_ATTENDANCE' });
    if (body.canUploadResults)  rows.push({ school_id: req.user.school_id, staff_id: body.teacherId, academic_year_id: ayId, section_id: sectionId, permission: 'UPLOAD_RESULTS' });
    if (body.canScheduleExam)   rows.push({ school_id: req.user.school_id, staff_id: body.teacherId, academic_year_id: ayId, section_id: sectionId, permission: 'SCHEDULE_EXAM' });

    if (rows.length) {
      const { error } = await adminDb.from('staff_permissions').insert(rows);
      if (error) throw new ApiError(500, error.message);
    }

    ok(res, { teacherId: body.teacherId, sectionId, permissions: rows.length });
  } catch (err) { fail(res, err); }
});

// POST /api/principal/permissions/remove
principalRouter.post('/permissions/remove', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const body = requireBody<{ teacherId: string; className: string; section: string }>(
      req, ['teacherId', 'className', 'section'],
    );

    const { data: ay } = await adminDb.from('academic_years').select('id')
      .eq('school_id', req.user.school_id!).eq('is_active', true).maybeSingle();
    if (!ay) { ok(res, { removed: 0 }); return; }
    const ayId = (ay as any).id as string;

    const { data: sec } = await adminDb.from('sections').select('id')
      .eq('school_id', req.user.school_id!).eq('academic_year_id', ayId)
      .eq('class_name', body.className).eq('section', body.section).maybeSingle();
    if (!sec) { ok(res, { removed: 0 }); return; }

    const { error } = await adminDb.from('staff_permissions').delete()
      .eq('school_id', req.user.school_id!).eq('academic_year_id', ayId)
      .eq('staff_id', body.teacherId).eq('section_id', (sec as any).id);
    if (error) throw new ApiError(500, error.message);

    ok(res, { removed: 1 });
  } catch (err) { fail(res, err); }
});

// ─── Fee Structures ───────────────────────────────────────────────────────────

// POST /api/principal/fee-structure/save
principalRouter.post('/fee-structure/save', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const body = requireBody<{
      id: string; name: string; className: string;
      structureType?: string; billingCycle: string;
      feeHeads: any[]; monthlyDueDates: any[]; lateFee?: any;
    }>(req, ['id', 'name', 'className', 'billingCycle', 'feeHeads', 'monthlyDueDates']);

    const { data: ay } = await adminDb.from('academic_years').select('id')
      .eq('school_id', req.user.school_id!).eq('is_active', true).maybeSingle();
    if (!ay) throw new ApiError(400, 'Koi active academic year nahi hai. Fee structure save karne ke liye pehle Academic Year section me naya year start karein.');
    const ayId = (ay as any).id as string;

    const payload: Record<string, unknown> = {
      school_id:        req.user.school_id,
      academic_year_id: ayId,
      name:             body.name,
      class_name:       body.className,
      structure_type:   body.structureType ?? 'CLASS',
      billing_cycle:    body.billingCycle,
      fee_heads:        body.feeHeads,
      monthly_due_dates: body.monthlyDueDates,
      late_fee:         body.lateFee,
      updated_at:       new Date().toISOString(),
    };

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id);
    let returnedId = body.id;
    let prev: Record<string, unknown> | null = null;

    if (isUuid) {
      const { data: existing } = await adminDb.from('fee_structures')
        .select('name, class_name, structure_type, billing_cycle, fee_heads, monthly_due_dates, late_fee')
        .eq('id', body.id).eq('school_id', req.user.school_id!).maybeSingle();
      prev = (existing ?? null) as Record<string, unknown> | null;

      const { error } = await adminDb.from('fee_structures').update(payload)
        .eq('id', body.id).eq('school_id', req.user.school_id!);
      if (error) throw new ApiError(500, error.message);
    } else {
      const { data, error } = await adminDb.from('fee_structures').insert(payload)
        .select('id').single();
      if (error) throw new ApiError(500, error.message);
      returnedId = (data as any).id;
    }

    ok(res, { id: returnedId, prev, mode: isUuid ? 'update' : 'create' });
  } catch (err) { fail(res, err); }
});

// POST /api/principal/fee-structure/save-for-year
principalRouter.post('/fee-structure/save-for-year', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const body = requireBody<{
      yearId: string; name: string; className: string;
      structureType?: string; billingCycle: string;
      feeHeads: any[]; monthlyDueDates: any[]; lateFee?: any;
    }>(req, ['yearId', 'name', 'className', 'billingCycle', 'feeHeads', 'monthlyDueDates']);

    const { data: yr } = await adminDb.from('academic_years').select('id')
      .eq('id', body.yearId).eq('school_id', req.user.school_id!).maybeSingle();
    if (!yr) throw new ApiError(404, 'Academic year not found');

    const { data, error } = await adminDb.from('fee_structures').insert({
      school_id:        req.user.school_id,
      academic_year_id: body.yearId,
      name:             body.name,
      class_name:       body.className,
      structure_type:   body.structureType ?? 'CLASS',
      billing_cycle:    body.billingCycle,
      fee_heads:        body.feeHeads,
      monthly_due_dates: body.monthlyDueDates,
      late_fee:         body.lateFee,
      updated_at:       new Date().toISOString(),
    }).select('id').single();
    if (error) throw new ApiError(500, error.message);

    ok(res, { id: (data as any).id }, 201);
  } catch (err) { fail(res, err); }
});

// POST /api/principal/fee-structure/apply-to-class
//
// Bulk-generate fee schedules for every active student in a class for the
// active academic year, using a saved fee_structures row. Skips students who
// already have installments in this year (any payer_type, any fee_type) to
// avoid clobbering an in-progress schedule. Returns counts so the UI can
// surface "X generated, Y already had a schedule".
//
// Why this exists: principals reasonably expect that "assign Class 1 to a
// fee structure" should fan out to the students in Class 1. Previously the
// only way to populate a student's installments was the Regenerate modal,
// one student at a time, which made fresh-class onboarding a tedious loop.
principalRouter.post('/fee-structure/apply-to-class', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const body = requireBody<{
      structureId: string; isRte?: boolean;
      discountAmount?: number; discountPct?: number;
    }>(req, ['structureId']);

    const schoolId = req.user.school_id!;

    // 1. Resolve the structure + active AY in a single round trip.
    const { data: structRow, error: sErr } = await adminDb
      .from('fee_structures')
      .select('id, school_id, class_name, academic_year_id, fee_heads, monthly_due_dates')
      .eq('id', body.structureId).eq('school_id', schoolId).maybeSingle();
    if (sErr) throw new ApiError(500, sErr.message);
    if (!structRow) throw new ApiError(404, 'Fee structure not found');
    const struct = structRow as {
      class_name: string; academic_year_id: string;
      fee_heads: unknown; monthly_due_dates: unknown;
    };
    if (!struct.academic_year_id) throw new ApiError(400, 'Fee structure has no academic year');

    // 2. Pull the cohort: every active student whose academic record sits in
    // this AY + class. We use student_academic_records as the source of truth
    // because students.class_name is denormalized and can lag.
    const { data: arRows, error: arErr } = await adminDb
      .from('student_academic_records')
      .select('student_id, students!inner(id, is_active, school_id)')
      .eq('academic_year_id', struct.academic_year_id)
      .eq('class_name', struct.class_name)
      .eq('students.school_id', schoolId)
      .eq('students.is_active', true);
    if (arErr) throw new ApiError(500, arErr.message);

    type Row = { student_id: string };
    const studentIds = ((arRows ?? []) as unknown as Row[]).map(r => r.student_id);
    if (studentIds.length === 0) {
      ok(res, { generated: 0, skipped: 0, total: 0 });
      return;
    }

    // 3. Find which students already have installments in this AY — skip
    // those so we don't clobber existing schedules. The Regenerate modal
    // remains the explicit destructive path for individual rebuilds.
    const { data: existing } = await adminDb
      .from('fee_installments').select('student_id')
      .eq('academic_year_id', struct.academic_year_id)
      .in('student_id', studentIds);
    const haveSchedule = new Set(((existing ?? []) as { student_id: string }[]).map(r => r.student_id));
    const targets = studentIds.filter(id => !haveSchedule.has(id));

    // 4. Fan out to the existing SECURITY DEFINER RPC — it handles RTE flip,
    // installment computation, and tenant/perm checks. Use the user JWT so
    // auth.uid() is set inside the RPC.
    const db = userDb(req.jwt);
    let generated = 0;
    const errors: string[] = [];
    for (const sid of targets) {
      const { error } = await db.rpc('generate_student_fee_schedule', {
        p_student_id:      sid,
        p_year_id:         struct.academic_year_id,
        p_heads:           struct.fee_heads,
        p_due_dates:       struct.monthly_due_dates,
        p_is_rte:          body.isRte ?? false,
        p_discount_amount: body.discountAmount ?? 0,
        p_discount_pct:    body.discountPct ?? 0,
      });
      if (error) errors.push(`${sid}: ${error.message}`);
      else generated++;
    }

    ok(res, {
      generated,
      skipped: studentIds.length - targets.length,
      total: studentIds.length,
      errors: errors.slice(0, 5),
    });
  } catch (err) { fail(res, err); }
});

// POST /api/principal/fee-structure/delete
principalRouter.post('/fee-structure/delete', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const { structureId } = requireBody<{ structureId: string }>(req, ['structureId']);
    const { error } = await adminDb.from('fee_structures').delete()
      .eq('id', structureId).eq('school_id', req.user.school_id!);
    if (error) throw new ApiError(500, error.message);
    ok(res, { structureId });
  } catch (err) { fail(res, err); }
});

// POST /api/principal/fee-structure/seed — seed defaults for active year
principalRouter.post('/fee-structure/seed', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const { ayId } = requireBody<{ ayId: string }>(req, ['ayId']);

    const { count } = await adminDb.from('fee_structures')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', req.user.school_id!).eq('academic_year_id', ayId);
    if ((count ?? 0) > 0) { ok(res, { seeded: false }); return; }

    const schoolId = req.user.school_id!;
    const defaults = [
      {
        school_id: schoolId, academic_year_id: ayId,
        name: 'Standard Fees - Class 1', class_name: 'Class 1',
        fee_heads: [
          { id: 'h1', name: 'Tuition Fee', amount: 1500, frequency: 'MONTHLY', description: 'Monthly tuition charges' },
          { id: 'h2', name: 'Admission Fee', amount: 2000, frequency: 'ONE_TIME', description: '' },
          { id: 'h3', name: 'Exam Fee', amount: 1200, frequency: 'ANNUAL', description: '' },
          { id: 'h4', name: 'Smart Class Fee', amount: 200, frequency: 'MONTHLY', description: '' },
        ],
        monthly_due_dates: [],
        late_fee: { enabled: false, gracePeriodDays: 5, type: 'FIXED', amount: 100, maxCap: 1000 },
      },
      {
        school_id: schoolId, academic_year_id: ayId,
        name: 'Standard Fees - Class 9', class_name: 'Class 9',
        fee_heads: [
          { id: 'h1', name: 'Tuition Fee', amount: 2800, frequency: 'MONTHLY', description: '' },
          { id: 'h2', name: 'Admission Fee', amount: 3000, frequency: 'ONE_TIME', description: '' },
          { id: 'h3', name: 'Exam Fee', amount: 2000, frequency: 'ANNUAL', description: '' },
          { id: 'h4', name: 'Lab Fee', amount: 300, frequency: 'MONTHLY', description: '' },
        ],
        monthly_due_dates: [],
        late_fee: { enabled: true, gracePeriodDays: 5, type: 'FIXED', amount: 100, maxCap: 1000 },
      },
    ];

    const { error } = await adminDb.from('fee_structures').insert(defaults);
    if (error) {
      // Seed failure is non-fatal — return seeded:false so caller can handle gracefully
      console.warn('[principal] fee-structure seed failed:', error.message);
      ok(res, { seeded: false });
      return;
    }

    ok(res, { seeded: true, count: defaults.length });
  } catch (err) { fail(res, err); }
});

// ─── Fee Payment Upload Review ────────────────────────────────────────────────

// POST /api/principal/fee-upload/review
principalRouter.post('/fee-upload/review', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const body = requireBody<{ uploadId: string; decision: 'APPROVED' | 'REJECTED'; note?: string }>(
      req, ['uploadId', 'decision'],
    );
    // review_fee_payment_upload internally calls record_fee_payment() which needs auth.uid()
    const db = userDb(req.jwt);
    const { data, error } = await db.rpc('review_fee_payment_upload', {
      p_upload_id: body.uploadId,
      p_decision:  body.decision,
      p_note:      body.note?.trim() || null,
    });
    if (error) throw new ApiError(500, error.message);
    ok(res, { paymentId: (data as string | null) ?? null });
  } catch (err) { fail(res, err); }
});

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

// GET /api/principal/dashboard-stats?yearId=
principalRouter.get('/dashboard-stats', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const { yearId } = req.query as { yearId: string };
    if (!yearId) throw new ApiError(400, 'yearId is required');

    // Students with outstanding fees
    const { data: feesData } = await adminDb
      .from('fee_installments')
      .select('student_id', { count: 'exact' })
      .eq('school_id', req.user.school_id!)
      .eq('academic_year_id', yearId)
      .gt('balance', 0)
      .is('cancelled_on', null);
    const studentsWithDues = feesData?.length ?? 0;

    // Pending leaves
    const { data: leavesData } = await adminDb
      .from('approvals')
      .select('id', { count: 'exact' })
      .eq('school_id', req.user.school_id!)
      .eq('academic_year_id', yearId)
      .eq('type', 'LEAVE')
      .eq('status', 'PENDING');
    const pendingLeaves = leavesData?.length ?? 0;

    // Low attendance students
    const { data: attendData } = await adminDb
      .from('student_academic_records')
      .select('id', { count: 'exact' })
      .eq('school_id', req.user.school_id!)
      .eq('academic_year_id', yearId)
      .lt('attendance_percentage', 75);
    const lowAttendanceStudents = attendData?.length ?? 0;

    // Unsubmitted attendance (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
    const { data: draftData } = await adminDb
      .from('attendance_records')
      .select('id', { count: 'exact' })
      .eq('school_id', req.user.school_id!)
      .eq('academic_year_id', yearId)
      .eq('status', 'DRAFT')
      .gte('date', sevenDaysAgo);
    const unsubmittedAttendanceDays = draftData?.length ?? 0;

    ok(res, {
      studentsWithDues,
      pendingLeaves,
      lowAttendanceStudents,
      unsubmittedAttendanceDays,
    });
  } catch (err) { fail(res, err); }
});


// GET /api/principal/subject-suggestions — distinct subject names already in
// use across this school (timetable_entries + staff). Powers the autocomplete
// <datalist> in the timetable allot dialog and the staff create/edit form,
// so principals don't need to maintain a separate "subjects list" — the
// system learns from what's already typed.
principalRouter.get('/subject-suggestions', requireAuth, async (req, res) => {
  try {
    const schoolId = req.user.school_id!;

    const [tt, staff] = await Promise.all([
      adminDb.from('timetable_entries')
        .select('subject')
        .eq('school_id', schoolId)
        .not('subject', 'is', null),
      adminDb.from('staff')
        .select('subject')
        .eq('school_id', schoolId)
        .not('subject', 'is', null),
    ]);

    const set = new Set<string>();
    for (const r of (tt.data ?? []) as { subject: string | null }[]) {
      const s = (r.subject ?? '').trim();
      if (s) set.add(s);
    }
    for (const r of (staff.data ?? []) as { subject: string | null }[]) {
      const s = (r.subject ?? '').trim();
      if (s) set.add(s);
    }
    const list = Array.from(set).sort((a, b) => a.localeCompare(b));
    ok(res, list);
  } catch (err) { fail(res, err); }
});

// ─── School holidays ────────────────────────────────────────────────────────
//
// Centralised holiday calendar. Sundays (or other weekly offs) live on
// schools.weekly_off_days; specific dated holidays (Diwali, 15 Aug,
// founder's day, etc.) live in school_holidays.

// GET /api/principal/holidays?yearId=…
principalRouter.get('/holidays', requireAuth, async (req, res) => {
  try {
    const yearId = req.query.yearId as string | undefined;
    let q = adminDb.from('school_holidays')
      .select('id, academic_year_id, date, name, notes, created_at, created_by')
      .eq('school_id', req.user.school_id!)
      .order('date', { ascending: true });
    if (yearId) q = q.eq('academic_year_id', yearId);
    const { data, error } = await q;
    if (error) throw new ApiError(500, error.message);
    ok(res, data);
  } catch (err) { fail(res, err); }
});

// POST /api/principal/holidays/add
principalRouter.post('/holidays/add', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const body = requireBody<{ academicYearId: string; date: string; name: string; notes?: string }>(
      req, ['academicYearId', 'date', 'name'],
    );
    const name = (body.name ?? '').trim();
    if (!name) throw new ApiError(400, 'Holiday name is required');
    if (name.length > 80) throw new ApiError(400, 'Holiday name too long (80 max)');

    // Validate year + bounds.
    const { data: ay } = await adminDb.from('academic_years')
      .select('id, start_date, end_date')
      .eq('id', body.academicYearId).eq('school_id', req.user.school_id!)
      .maybeSingle();
    const ayRow = ay as { id: string; start_date: string; end_date: string } | null;
    if (!ayRow) throw new ApiError(404, 'Academic year not found');
    if (body.date < ayRow.start_date || body.date > ayRow.end_date) {
      throw new ApiError(400, `Date must fall inside ${ayRow.start_date} to ${ayRow.end_date}`);
    }

    const { data, error } = await adminDb.from('school_holidays').insert({
      school_id: req.user.school_id,
      academic_year_id: body.academicYearId,
      date: body.date,
      name,
      notes: body.notes ?? null,
      created_by: req.user.id,
    }).select('id, academic_year_id, date, name, notes, created_at, created_by').single();
    if (error) {
      if (error.code === '23505') throw new ApiError(409, 'Holiday for this date already exists');
      throw new ApiError(500, error.message);
    }
    ok(res, data, 201);
  } catch (err) { fail(res, err); }
});

// POST /api/principal/holidays/delete
principalRouter.post('/holidays/delete', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const { id } = requireBody<{ id: string }>(req, ['id']);
    const { error } = await adminDb.from('school_holidays').delete()
      .eq('id', id).eq('school_id', req.user.school_id!);
    if (error) throw new ApiError(500, error.message);
    ok(res, { id });
  } catch (err) { fail(res, err); }
});

// GET /api/principal/holidays/weekly-off — current weekly off days
principalRouter.get('/holidays/weekly-off', requireAuth, async (req, res) => {
  try {
    const { data, error } = await adminDb.from('schools')
      .select('weekly_off_days').eq('id', req.user.school_id!).maybeSingle();
    if (error) throw new ApiError(500, error.message);
    const days = (data as { weekly_off_days: number[] } | null)?.weekly_off_days ?? [0];
    ok(res, { days });
  } catch (err) { fail(res, err); }
});

// POST /api/principal/holidays/weekly-off — set weekly off days (0–6)
principalRouter.post('/holidays/weekly-off', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const { days } = requireBody<{ days: number[] }>(req, ['days']);
    if (!Array.isArray(days)) throw new ApiError(400, 'days must be an array of 0–6');
    const clean = Array.from(new Set(days.filter(d => Number.isInteger(d) && d >= 0 && d <= 6))).sort();
    const { error } = await adminDb.from('schools')
      .update({ weekly_off_days: clean }).eq('id', req.user.school_id!);
    if (error) throw new ApiError(500, error.message);
    ok(res, { days: clean });
  } catch (err) { fail(res, err); }
});
