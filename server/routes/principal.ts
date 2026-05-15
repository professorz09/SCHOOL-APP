import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { adminDb, userDb } from '../lib/db';
import { ok, fail, ApiError, requireBody, requireText } from '../lib/helpers';
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
      // Escape both ILIKE wildcards (% / _) AND PostgREST or-filter
      // delimiters (comma, paren, dot, double-quote). Without the
      // second layer, a search value containing a literal `,` would
      // break out of the value slot and extend the OR clause with
      // attacker-controlled conditions — still bounded by RLS, but
      // strictly more rows than intended.
      const safe = search
        .replace(/[%_]/g, ch => `\\${ch}`)
        // Drop characters that have meaning to PostgREST or() syntax.
        // No legitimate name / phone search needs these.
        .replace(/[,()."]/g, '')
        .slice(0, 60); // bound the LIKE pattern length too
      if (safe) {
        q = q.or(`name.ilike.%${safe}%,mobile_number.ilike.%${safe}%`);
      }
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
    const title      = requireText(body.title, 'Title', { max: 200 });
    const noticeBody = requireText(body.body, 'Body',  { max: 8000 });

    // Audience whitelist — must match NoticeAudience enum on the
    // client. Anything outside this set is rejected; without this an
    // attacker (or a typo'd client) could insert e.g. audience='ADMIN'
    // and surface notices in places that read by != filter.
    const VALID_AUDIENCES = new Set([
      'ALL', 'STUDENTS', 'TEACHERS', 'STAFF', 'PARENTS', 'SPECIFIC_STUDENT',
    ]);
    if (!VALID_AUDIENCES.has(body.audience)) {
      throw new ApiError(400, `Invalid audience: ${body.audience}`);
    }

    // SPECIFIC_STUDENT audience must include a target id; other audiences must NOT
    // (we store NULL so per-row filters stay clean).
    if (body.audience === 'SPECIFIC_STUDENT' && !body.targetStudentId) {
      throw new ApiError(400, 'targetStudentId required for SPECIFIC_STUDENT notices');
    }
    const targetId = body.audience === 'SPECIFIC_STUDENT' ? body.targetStudentId : null;

    // For SPECIFIC_STUDENT, verify the target belongs to this school.
    // Without this guard a principal could (in principle) target a
    // student in a different school whose UUID they happen to know.
    if (targetId) {
      const { data: stu } = await adminDb.from('students')
        .select('id').eq('id', targetId).eq('school_id', req.user.school_id!)
        .maybeSingle();
      if (!stu) throw new ApiError(404, 'Target student not found in your school');
    }

    const { data, error } = await adminDb.from('notices').insert({
      school_id:         req.user.school_id,
      title,
      body:              noticeBody,
      audience:          body.audience,
      pinned:            body.pinned ?? false,
      sent_by:           req.user.id,
      // Author display name is derived server-side from the JWT
      // user. body.sentBy is ignored — earlier we honoured it which
      // let a principal forge "From: District Office" attribution.
      sent_by_name:      req.user.name || '',
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

// Open complaint statuses — only PENDING / IN_REVIEW rows can be
// resolved or rejected. Re-running on RESOLVED / REJECTED would
// silently overwrite the original `resolved_at` and `response`,
// destroying the audit trail of when the principal first acted.
const OPEN_COMPLAINT_STATUSES = ['PENDING', 'IN_REVIEW'];

// POST /api/principal/complaint/resolve
principalRouter.post('/complaint/resolve', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const body = requireBody<{ complaintId: string; response: string }>(req, ['complaintId', 'response']);
    const response = requireText(body.response, 'Response', { max: 4000 });

    const COMPLAINT_FIELDS = 'id, from_role, from_name, from_class, subject, description, status, response, created_at, resolved_at, is_anonymous, students(roll_no, admission_no)';
    const { data, error } = await adminDb.from('complaints')
      .update({ status: 'RESOLVED', response, resolved_at: new Date().toISOString() })
      .eq('id', body.complaintId).eq('school_id', req.user.school_id!)
      .in('status', OPEN_COMPLAINT_STATUSES)
      .select(COMPLAINT_FIELDS).maybeSingle();
    if (error) throw new ApiError(500, error.message);
    if (!data) throw new ApiError(409, 'Complaint already resolved or rejected — refresh the list');
    ok(res, data);
  } catch (err) { fail(res, err); }
});

// POST /api/principal/complaint/reject
principalRouter.post('/complaint/reject', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const body = requireBody<{ complaintId: string; reason: string }>(req, ['complaintId', 'reason']);
    const reason = requireText(body.reason, 'Reason', { max: 4000 });

    const COMPLAINT_FIELDS = 'id, from_role, from_name, from_class, subject, description, status, response, created_at, resolved_at, is_anonymous, students(roll_no, admission_no)';
    const { data, error } = await adminDb.from('complaints')
      .update({ status: 'REJECTED', response: reason, resolved_at: new Date().toISOString() })
      .eq('id', body.complaintId).eq('school_id', req.user.school_id!)
      .in('status', OPEN_COMPLAINT_STATUSES)
      .select(COMPLAINT_FIELDS).maybeSingle();
    if (error) throw new ApiError(500, error.message);
    if (!data) throw new ApiError(409, 'Complaint already resolved or rejected — refresh the list');
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

    // Validate amount: positive, integer, within sane bound. Without
    // these the row would happily accept negatives (which break the
    // expense category totals) or 12-digit garbage from a malicious
    // client bypassing the form.
    if (!Number.isFinite(body.amount) || body.amount <= 0) {
      throw new ApiError(400, 'Amount must be positive');
    }
    if (body.amount > 100_000_000) {
      throw new ApiError(400, 'Expense amount exceeds the per-transaction cap.');
    }

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

    // Same amount validation as /expense/add — reject negatives and
    // 12-digit-large values regardless of which write path the client
    // used.
    if (body.amount !== undefined) {
      if (!Number.isFinite(body.amount) || body.amount <= 0) {
        throw new ApiError(400, 'Amount must be positive');
      }
      if (body.amount > 100_000_000) {
        throw new ApiError(400, 'Expense amount exceeds the per-transaction cap.');
      }
    }

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

    // Cross-school guard — applies to EVERY caller. PRINCIPAL and
    // TEACHER were earlier skipped from this check, which meant a
    // teacher who knew another school's student_id could submit a
    // leave entry into that school's approval queue. The parent-link
    // check below adds a tighter parent-only rule on top.
    const { data: targetStudent } = await adminDb
      .from('students').select('school_id')
      .eq('id', body.studentId).maybeSingle();
    const targetSchool = (targetStudent as { school_id: string } | null)?.school_id;
    if (!targetSchool) throw new ApiError(404, 'Student not found');
    if (targetSchool !== req.user.school_id) {
      throw new ApiError(403, 'Student belongs to another school');
    }

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

    // Pack roll + admission + class into new_value so the principal's
    // approvals queue can disambiguate two students with the same name.
    // Source from the students row + the active student_academic_records
    // for the current year.
    let fromClass = '';
    let fromRollNo = '';
    let fromAdmissionNo = '';
    {
      const { data: stuData } = await adminDb.from('students')
        .select('roll_no, admission_no, student_academic_records(class_name, section, academic_year_id)')
        .eq('id', body.studentId).maybeSingle();
      type Row = {
        roll_no: string | null; admission_no: string | null;
        student_academic_records: Array<{
          class_name: string | null; section: string | null;
          academic_year_id: string;
        }> | null;
      };
      const stu = stuData as Row | null;
      fromRollNo = stu?.roll_no ?? '';
      fromAdmissionNo = stu?.admission_no ?? '';
      const ar = (stu?.student_academic_records ?? [])[0];
      if (ar?.class_name && ar?.section) {
        fromClass = `${ar.class_name}-${ar.section}`;
      }
    }

    const newValue = {
      fromName: body.studentName, fromRole: 'STUDENT', subject: body.title,
      fromClass, fromRollNo, fromAdmissionNo,
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
    if (error) {
      // Surface the actual Postgres error verbatim along with a
      // diagnostic prefix so we can spot RLS hits vs other failures
      // in the toast itself while debugging.
      console.error('[leave/submit] insert error:', error);
      throw new ApiError(500, error.message);
    }
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

// ─── Admission drafts (TEACHER → PRINCIPAL approval flow) ─────────────────
//
// Schools where the principal delegates admission paperwork to a trusted
// teacher (typically the office in-charge). The teacher fills the standard
// admission form, but instead of inserting into `students` directly we drop
// the full payload into `approvals` as request_type='ADMISSION'. The principal
// reviews, optionally edits, and on approve the client re-runs the regular
// /students/create with the (possibly edited) payload — keeping all the side
// effects of the existing admission code path (auth provisioning, fee schedule
// generation, audit logs) instead of duplicating them here.
//
// Permission to submit drafts is gated by a school-wide row in
// staff_permissions (permission='CREATE_ADMISSION', section_id IS NULL). The
// principal toggles this from the staff profile page. PRINCIPAL itself can
// always submit (and would normally use the direct flow anyway).

async function teacherHasCreateAdmission(userId: string, schoolId: string): Promise<boolean> {
  const { data: staff } = await adminDb
    .from('staff').select('id').eq('user_id', userId).eq('school_id', schoolId).maybeSingle();
  if (!staff) return false;
  const { data: perm } = await adminDb
    .from('staff_permissions')
    .select('id')
    .eq('staff_id', (staff as { id: string }).id)
    .eq('school_id', schoolId)
    .eq('permission', 'CREATE_ADMISSION')
    .is('section_id', null)
    .maybeSingle();
  return !!perm;
}

// Rate limits — guards against a teacher's compromised account or buggy
// retry loop spamming the approvals queue. 10 drafts / 10 min is well above
// any real onboarding (one teacher rarely admits more than a handful of
// students per session) but tight enough that runaway behaviour gets
// caught before the queue is unusable. Keyed per user so two teachers
// don't share a budget.
const admissionDraftSubmitLimiter = rateLimit({
  windowMs: 10 * 60_000,
  limit: 10,
  keyGenerator: (req: any) => `adm-draft:${req.user?.id ?? req.ip}`,
  validate: { keyGeneratorIpFallback: false },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { ok: false, error: 'Too many admission drafts in a short window. Please wait 10 minutes.' },
});

// Reject endpoint can also be abused (mass-reject every PENDING row would
// silently lose teacher work). 60/hr per principal is generous for normal
// review pace and well below "scripted attack" rates.
const admissionDraftMutateLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 60,
  keyGenerator: (req: any) => `adm-mutate:${req.user?.id ?? req.ip}`,
  validate: { keyGeneratorIpFallback: false },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { ok: false, error: 'Too many approve/reject actions in an hour — slow down.' },
});

// Permission toggling spam = silent privilege escalation/revocation noise
// in the audit log. 30/hr is plenty for real principal usage.
const permToggleLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 30,
  keyGenerator: (req: any) => `perm-toggle:${req.user?.id ?? req.ip}`,
  validate: { keyGeneratorIpFallback: false },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { ok: false, error: 'Too many permission changes in an hour — slow down.' },
});

// POST /api/principal/admission/draft-submit — write a teacher-filled
// admission as a PENDING approval. Body is the full admission form payload;
// we don't validate field-by-field here (the principal will see exactly
// what was submitted in the review panel and can fix anything before
// approve).
principalRouter.post('/admission/draft-submit', requireAuth, admissionDraftSubmitLimiter, async (req, res) => {
  try {
    if (req.user.role !== 'TEACHER' && req.user.role !== 'PRINCIPAL') {
      throw new ApiError(403, 'Only teachers / principals can submit admission drafts');
    }
    if (req.user.role === 'TEACHER') {
      const allowed = await teacherHasCreateAdmission(req.user.id, req.user.school_id!);
      if (!allowed) {
        throw new ApiError(403, 'You don\'t have permission to submit admission drafts. Ask the principal to enable it on your profile.');
      }
    }

    const body = requireBody<{
      payload: Record<string, unknown>;
      studentName: string;
      admissionNo: string;
    }>(req, ['payload', 'studentName', 'admissionNo']);

    if (!body.studentName.trim()) throw new ApiError(400, 'Student name is required');
    if (!body.admissionNo.trim()) throw new ApiError(400, 'Admission no is required');

    // Reject if the admission no is already in use within this school —
    // saves the principal a wasted review cycle on a duplicate.
    const { data: dupe } = await adminDb
      .from('students').select('id')
      .eq('school_id', req.user.school_id!)
      .eq('admission_no', body.admissionNo.trim())
      .maybeSingle();
    if (dupe) throw new ApiError(409, `Admission no "${body.admissionNo.trim()}" already exists in this school`);

    const newValue = {
      // Summary fields surface in the approvals queue list (same fields
      // the LEAVE flow uses).
      fromName:        body.studentName.trim(),
      fromRole:        'TEACHER',
      fromAdmissionNo: body.admissionNo.trim(),
      subject:         `Admission: ${body.studentName.trim()}`,
      description:     `New admission draft submitted by ${req.user.name}.`,
      // Full form payload for the principal review panel.
      draftPayload:    body.payload,
    };

    const { data, error } = await adminDb.from('approvals').insert({
      school_id:    req.user.school_id,
      request_type: 'ADMISSION',
      requested_by: req.user.id,
      entity_type:  'admission',
      entity_id:    null,
      new_value:    newValue,
      status:       'PENDING',
    }).select(APPROVAL_FIELDS).single();
    if (error) {
      // eslint-disable-next-line no-console
      console.error('[admission/draft-submit] insert error:', error);
      throw new ApiError(500, error.message);
    }
    ok(res, data, 201);
  } catch (err) { fail(res, err); }
});

// GET /api/principal/admission/my-drafts — teacher's own pending drafts so
// they can see what's still in the queue. PRINCIPAL gets all PENDING +
// REJECTED admission rows from the regular approvals queue, this is the
// teacher-only view.
principalRouter.get('/admission/my-drafts', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'TEACHER') throw new ApiError(403, 'Teachers only');
    const { data, error } = await adminDb
      .from('approvals').select(APPROVAL_FIELDS)
      .eq('school_id', req.user.school_id!)
      .eq('request_type', 'ADMISSION')
      .eq('requested_by', req.user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw new ApiError(500, error.message);
    ok(res, data ?? []);
  } catch (err) { fail(res, err); }
});

// POST /api/principal/admission/draft-approve — mark approval APPROVED. The
// client is expected to have already created the student row via the regular
// /students/create endpoint (re-using all the admission-day side effects).
// This route just closes the loop on the approval row so it stops showing in
// the queue.
principalRouter.post('/admission/draft-approve', requireAuth, PRINCIPAL, admissionDraftMutateLimiter, async (req, res) => {
  try {
    const body = requireBody<{ approvalId: string; createdStudentId?: string }>(req, ['approvalId']);
    const { data: existing } = await adminDb
      .from('approvals').select('id, school_id, status, request_type')
      .eq('id', body.approvalId).maybeSingle();
    type Row = { id: string; school_id: string; status: string; request_type: string };
    const row = existing as Row | null;
    if (!row) throw new ApiError(404, 'Approval not found');
    if (row.school_id !== req.user.school_id) throw new ApiError(403, 'Different school');
    if (row.request_type !== 'ADMISSION') throw new ApiError(400, 'Not an admission approval');
    if (row.status !== 'PENDING') throw new ApiError(409, `Already ${row.status.toLowerCase()}`);

    const { data, error } = await adminDb.from('approvals')
      .update({
        status: 'APPROVED',
        entity_id: body.createdStudentId ?? null,
        approved_by: req.user.id,
        approved_at: new Date().toISOString(),
      })
      .eq('id', body.approvalId)
      .select(APPROVAL_FIELDS)
      .single();
    if (error) throw new ApiError(500, error.message);
    ok(res, data);
  } catch (err) { fail(res, err); }
});

// POST /api/principal/admission/draft-reject — hard delete. A draft is just
// a holding row for the teacher's submission; rejecting it should leave no
// trace on the principal's queue or the teacher's "my drafts" view (per
// product call: "wo bs ek draft hi to hai"). The audit_logs entry written
// by principalService.rejectAdmissionDraft preserves who rejected and the
// reason for compliance, separate from the approvals table.
principalRouter.post('/admission/draft-reject', requireAuth, PRINCIPAL, admissionDraftMutateLimiter, async (req, res) => {
  try {
    const body = requireBody<{ approvalId: string; reason: string }>(req, ['approvalId', 'reason']);
    if (!body.reason.trim()) throw new ApiError(400, 'Reason required');

    const { data: existing } = await adminDb
      .from('approvals').select('id, school_id, status, request_type')
      .eq('id', body.approvalId).maybeSingle();
    type Row = { id: string; school_id: string; status: string; request_type: string };
    const row = existing as Row | null;
    if (!row) throw new ApiError(404, 'Approval not found');
    if (row.school_id !== req.user.school_id) throw new ApiError(403, 'Different school');
    if (row.request_type !== 'ADMISSION') throw new ApiError(400, 'Not an admission approval');
    if (row.status !== 'PENDING') throw new ApiError(409, `Already ${row.status.toLowerCase()}`);

    const { error } = await adminDb.from('approvals')
      .delete()
      .eq('id', body.approvalId);
    if (error) throw new ApiError(500, error.message);
    // Echo back the deleted id + reason so the client can update its
    // optimistic state and audit log without another fetch.
    ok(res, { id: body.approvalId, deleted: true, reason: body.reason.trim() });
  } catch (err) { fail(res, err); }
});

// POST /api/principal/admission/draft-update — principal edits the draft
// payload before approving. Stores the updated payload into new_value and
// keeps status PENDING. The approve route then reads the latest version.
principalRouter.post('/admission/draft-update', requireAuth, PRINCIPAL, admissionDraftMutateLimiter, async (req, res) => {
  try {
    const body = requireBody<{
      approvalId: string;
      payload: Record<string, unknown>;
      studentName: string;
      admissionNo: string;
    }>(req, ['approvalId', 'payload', 'studentName', 'admissionNo']);

    const { data: existing } = await adminDb
      .from('approvals').select('id, school_id, status, request_type, new_value')
      .eq('id', body.approvalId).maybeSingle();
    type Row = {
      id: string; school_id: string; status: string;
      request_type: string; new_value: Record<string, unknown> | null;
    };
    const row = existing as Row | null;
    if (!row) throw new ApiError(404, 'Approval not found');
    if (row.school_id !== req.user.school_id) throw new ApiError(403, 'Different school');
    if (row.request_type !== 'ADMISSION') throw new ApiError(400, 'Not an admission approval');
    if (row.status !== 'PENDING') throw new ApiError(409, 'Cannot edit a closed draft');

    const newValue = {
      ...(row.new_value ?? {}),
      fromName:        body.studentName.trim(),
      fromAdmissionNo: body.admissionNo.trim(),
      subject:         `Admission: ${body.studentName.trim()}`,
      draftPayload:    body.payload,
    };

    const { data, error } = await adminDb.from('approvals')
      .update({ new_value: newValue })
      .eq('id', body.approvalId)
      .select(APPROVAL_FIELDS)
      .single();
    if (error) throw new ApiError(500, error.message);
    ok(res, data);
  } catch (err) { fail(res, err); }
});

// ─── School-wide staff permissions (CREATE_ADMISSION etc.) ────────────────
//
// The existing /permissions/set endpoint is per-section. School-wide
// permissions (no section context, just "this teacher can do X across the
// whole school") need their own surface so the per-class UI doesn't
// confuse the two namespaces.

// GET /api/principal/staff-permissions/school-wide?staffId=... — returns the
// list of school-wide permissions currently granted to one staff member.
principalRouter.get('/staff-permissions/school-wide', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const staffId = String(req.query.staffId ?? '');
    if (!staffId) throw new ApiError(400, 'staffId required');

    const { data: ay } = await adminDb
      .from('academic_years').select('id')
      .eq('school_id', req.user.school_id!).eq('is_active', true).maybeSingle();
    if (!ay) { ok(res, []); return; }

    const { data, error } = await adminDb
      .from('staff_permissions')
      .select('permission')
      .eq('school_id', req.user.school_id!)
      .eq('staff_id', staffId)
      .eq('academic_year_id', (ay as { id: string }).id)
      .is('section_id', null);
    if (error) throw new ApiError(500, error.message);
    ok(res, ((data ?? []) as Array<{ permission: string }>).map(r => r.permission));
  } catch (err) { fail(res, err); }
});

// POST /api/principal/staff-permissions/school-wide/set — toggle one school-
// wide permission. Body: { staffId, permission, enabled }.
principalRouter.post('/staff-permissions/school-wide/set', requireAuth, PRINCIPAL, permToggleLimiter, async (req, res) => {
  try {
    const body = requireBody<{ staffId: string; permission: string; enabled: boolean }>(
      req, ['staffId', 'permission', 'enabled']);
    if (!['CREATE_ADMISSION'].includes(body.permission)) {
      throw new ApiError(400, `Unknown school-wide permission: ${body.permission}`);
    }

    const { data: ay } = await adminDb
      .from('academic_years').select('id')
      .eq('school_id', req.user.school_id!).eq('is_active', true).maybeSingle();
    if (!ay) throw new ApiError(400, 'No active academic year');
    const ayId = (ay as { id: string }).id;

    if (body.enabled) {
      // Idempotent: insert ignoring duplicate (unique idx on
      // staff_id+section_id+permission).
      const { error } = await adminDb.from('staff_permissions').insert({
        school_id:        req.user.school_id,
        staff_id:         body.staffId,
        academic_year_id: ayId,
        section_id:       null,
        permission:       body.permission,
      });
      if (error && !error.message.includes('duplicate')) throw new ApiError(500, error.message);
    } else {
      const { error } = await adminDb.from('staff_permissions').delete()
        .eq('school_id', req.user.school_id!)
        .eq('staff_id', body.staffId)
        .eq('academic_year_id', ayId)
        .is('section_id', null)
        .eq('permission', body.permission);
      if (error) throw new ApiError(500, error.message);
    }
    ok(res, { ok: true });
  } catch (err) { fail(res, err); }
});

// GET /api/principal/staff-permissions/me — the calling user's own
// school-wide permissions, used by teacher UI to gate features.
principalRouter.get('/staff-permissions/me', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'TEACHER') { ok(res, []); return; }
    const { data: staff } = await adminDb
      .from('staff').select('id')
      .eq('user_id', req.user.id).eq('school_id', req.user.school_id!).maybeSingle();
    if (!staff) { ok(res, []); return; }
    const { data: ay } = await adminDb
      .from('academic_years').select('id')
      .eq('school_id', req.user.school_id!).eq('is_active', true).maybeSingle();
    if (!ay) { ok(res, []); return; }

    const { data, error } = await adminDb
      .from('staff_permissions').select('permission')
      .eq('school_id', req.user.school_id!)
      .eq('staff_id', (staff as { id: string }).id)
      .eq('academic_year_id', (ay as { id: string }).id)
      .is('section_id', null);
    if (error) throw new ApiError(500, error.message);
    ok(res, ((data ?? []) as Array<{ permission: string }>).map(r => r.permission));
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

// Daily safety net — covers ADD + DELETE + UPDATE combined. 300/day
// per school is generous (a busy day: 200 admissions worth of new
// items + edits) yet still stops a runaway script from churning the
// table thousands of times. Single shared bucket so the principal
// can't dodge it by alternating add → delete → add.
const inventoryDailyLimiter = rateLimit({
  windowMs: 24 * 60 * 60_000,
  limit: 300,
  keyGenerator: (req: any) => `inv-day:${req.user?.school_id ?? req.user?.id ?? req.ip}`,
  validate: { keyGeneratorIpFallback: false },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { ok: false, error: 'Daily inventory write limit reached for this school. Try again tomorrow.' },
});

// Hard cap on active asset rows per school. Tested at 5 000 — well
// past any realistic school's needs (typical school: 200–1 500 items)
// but low enough to stop accidental import loops dumping millions.
const MAX_ASSETS_PER_SCHOOL = 5000;

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
principalRouter.post('/inventory/add', requireAuth, PRINCIPAL, inventoryAddLimiter, inventoryDailyLimiter, async (req, res) => {
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

    // Per-school active-asset cap. A clean count() head-only query is
    // O(rows in index) — cheap, no row payload returned.
    const { count: activeCount } = await adminDb.from('assets')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', req.user.school_id!)
      .eq('is_active', true);
    if ((activeCount ?? 0) >= MAX_ASSETS_PER_SCHOOL) {
      throw new ApiError(409,
        `Inventory limit reached (${MAX_ASSETS_PER_SCHOOL} items). Delete unused entries first.`,
      );
    }

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
    // Mirror the event into the always-present audit_logs table.
    // Previously this lived only in a separate `inventory_history`
    // table that depended on migration 0063 being applied — when
    // that migration was missing on a deploy, the table didn't exist
    // and the silent insert failure left the history feed empty.
    // audit_logs ships with the base schema, so this path is always
    // available.
    const { error: histErr } = await adminDb.from('audit_logs').insert({
      user_id:     req.user.id,
      school_id:   req.user.school_id,
      action:      'inventory_add',
      entity_type: 'asset',
      entity_id:   newId,
      details: {
        title,
        category:    body.category,
        quantity:    Math.round(body.quantity),
        description: body.description?.trim() || '',
        note:        body.note?.trim() || '',
        done_by_name: req.user.name ?? null,
      },
    });
    if (histErr) console.warn('[inventory/add] audit insert failed:', histErr.message);

    ok(res, { id: newId }, 201);
  } catch (err) { fail(res, err); }
});

// POST /api/principal/inventory/delete
principalRouter.post('/inventory/delete', requireAuth, PRINCIPAL, inventoryDailyLimiter, async (req, res) => {
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
    const { error: histErr } = await adminDb.from('audit_logs').insert({
      user_id:     req.user.id,
      school_id:   req.user.school_id,
      action:      'inventory_delete',
      entity_type: 'asset',
      entity_id:   s.id,
      details: {
        title:       s.name,
        category:    s.category,
        quantity:    s.total_count,
        description: s.details?.description ?? '',
        note:        s.details?.note ?? '',
        done_by_name: req.user.name ?? null,
      },
    });
    if (histErr) console.warn('[inventory/delete] audit insert failed:', histErr.message);

    ok(res, { id });
  } catch (err) { fail(res, err); }
});

// GET /api/principal/inventory/history
// Reads inventory events from audit_logs. The frontend expects shape:
//   { id, action, title, category, quantity, description, note,
//     done_by_name, done_at }
// audit_logs stores action='inventory_add'/'inventory_delete'/'inventory_update'
// with the field payload inside `details`. We map both shapes back to
// the legacy contract so the frontend stays untouched.
principalRouter.get('/inventory/history', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const { data, error } = await adminDb.from('audit_logs')
      .select('id, action, entity_id, details, created_at')
      .eq('school_id', req.user.school_id!)
      .eq('entity_type', 'asset')
      .in('action', ['inventory_add', 'inventory_delete', 'inventory_update'])
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw new ApiError(500, error.message);

    type Row = { id: string; action: string; entity_id: string | null;
      details: Record<string, unknown> | null; created_at: string };
    const mapAction = (a: string) =>
      a === 'inventory_add' ? 'ADD'
      : a === 'inventory_delete' ? 'DELETE'
      : 'UPDATE';
    const mapped = ((data ?? []) as Row[]).map(r => {
      const d = r.details ?? {};
      return {
        id:           r.id,
        action:       mapAction(r.action),
        title:        (d.title as string) ?? '',
        category:     (d.category as string) ?? 'OTHER',
        quantity:     (d.quantity as number) ?? 0,
        description:  (d.description as string) || null,
        note:         (d.note as string) || null,
        done_by_name: (d.done_by_name as string) ?? null,
        done_at:      r.created_at,
      };
    });
    ok(res, mapped);
  } catch (err) { fail(res, err); }
});

// POST /api/principal/inventory/update
// Lets the principal change quantity / title / description / note without
// rebuilding the row. Useful when stock changes (broken units removed,
// donations received). addedOn intentionally NOT editable — it's the
// "purchased on" anchor and editing it would shuffle timeline groups.
principalRouter.post('/inventory/update', requireAuth, PRINCIPAL, inventoryDailyLimiter, async (req, res) => {
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

    // Log an UPDATE event so the History timeline reflects edits, not
    // just adds + deletes. Earlier this insert was missing → edits
    // appeared to "vanish" from the history feed (user-reported bug).
    // Read post-update values so the audit row carries the new state.
    const { data: post } = await adminDb.from('assets')
      .select('name, category, total_count, details')
      .eq('id', body.id).maybeSingle();
    const p = (post ?? {}) as { name?: string; category?: string; total_count?: number;
      details?: { description?: string; note?: string } | null };
    const { error: histErr } = await adminDb.from('audit_logs').insert({
      user_id:     req.user.id,
      school_id:   req.user.school_id,
      action:      'inventory_update',
      entity_type: 'asset',
      entity_id:   body.id,
      details: {
        title:       p.name ?? '',
        category:    p.category ?? 'OTHER',
        quantity:    p.total_count ?? 0,
        description: p.details?.description ?? '',
        note:        p.details?.note ?? '',
        done_by_name: req.user.name ?? null,
      },
    });
    if (histErr) console.warn('[inventory/update] audit insert failed:', histErr.message);
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

    // Cross-school write guard: confirm every staff_id in the payload
    // belongs to the caller's school before any DB write. Without this,
    // a forged staffId from another tenant could be upserted via the
    // (staff_id, date) unique index — overwriting another school's row
    // because adminDb bypasses RLS. Pre-validating staff ids closes the
    // gap server-side.
    const allStaffIds = Array.from(new Set([
      ...clearedStaffIds,
      ...body.rows.map(r => r.staffId),
    ]));
    if (allStaffIds.length > 0) {
      const { data: validStaff } = await adminDb
        .from('staff').select('id')
        .eq('school_id', req.user.school_id!)
        .in('id', allStaffIds);
      const validSet = new Set(((validStaff ?? []) as Array<{ id: string }>).map(s => s.id));
      const intruder = allStaffIds.find(id => !validSet.has(id));
      if (intruder) {
        throw new ApiError(403, `staff_id ${intruder} is not in your school`);
      }
    }

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
    // count: 'exact' + head: true returns the COUNT (not row data) so the
    // dashboard isn't silently capped at supabase-js's default 1000-row
    // response limit. Earlier `data?.length` could only ever read up to
    // 1000, under-reporting big schools on every counter.
    const { count: studentsWithDuesCount } = await adminDb
      .from('fee_installments')
      .select('student_id', { count: 'exact', head: true })
      .eq('school_id', req.user.school_id!)
      .eq('academic_year_id', yearId)
      .gt('balance', 0)
      .is('cancelled_on', null);
    const studentsWithDues = studentsWithDuesCount ?? 0;

    const { count: pendingLeavesCount } = await adminDb
      .from('approvals')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', req.user.school_id!)
      .eq('academic_year_id', yearId)
      .eq('type', 'LEAVE')
      .eq('status', 'PENDING');
    const pendingLeaves = pendingLeavesCount ?? 0;

    const { count: lowAttendanceCount } = await adminDb
      .from('student_academic_records')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', req.user.school_id!)
      .eq('academic_year_id', yearId)
      .lt('attendance_percentage', 75);
    const lowAttendanceStudents = lowAttendanceCount ?? 0;

    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
    const { count: draftCount } = await adminDb
      .from('attendance_records')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', req.user.school_id!)
      .eq('academic_year_id', yearId)
      .eq('status', 'DRAFT')
      .gte('date', sevenDaysAgo);
    const unsubmittedAttendanceDays = draftCount ?? 0;

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
