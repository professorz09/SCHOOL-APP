import { Router } from 'express';
import { adminDb, userDb } from '../lib/db';
import { ok, fail, ApiError, requireBody } from '../lib/helpers';
import { requireAuth, requireRole } from '../middleware/auth';

export const principalRouter = Router();

const PRINCIPAL = requireRole('PRINCIPAL');

// ─── Connected Users (students + staff) — for the Settings → Users screen ──

// GET /api/principal/users/list — every public.user that belongs to this school
// (PRINCIPAL itself excluded so the principal can't accidentally reset themselves).
principalRouter.get('/users/list', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const { data, error } = await adminDb
      .from('users')
      .select('id, name, mobile_number, role, email, is_active, first_login_changed, last_login')
      .eq('school_id', req.user.school_id!)
      .neq('id', req.user.id)
      .order('role').order('name');
    if (error) throw new ApiError(500, error.message);
    ok(res, data ?? []);
  } catch (err) { fail(res, err); }
});

// Roles a principal is allowed to reset. PRINCIPAL and SUPER_ADMIN are
// excluded so a same-school co-principal or platform admin can't be locked
// out by a single principal action — those roles must use Settings → Security
// (self) or contact platform support.
const RESETTABLE_ROLES = new Set(['STUDENT', 'PARENT', 'TEACHER', 'DRIVER', 'PEON', 'STAFF']);

// POST /api/principal/users/reset-password — forces password back to mobile
// number and flips first_login_changed=false so the user is required to set
// a new one on their next login. Multiple guards stack:
//   1. Same-school check (cross-school target → 403)
//   2. Self-reset blocked (would lock principal out)
//   3. Role allowlist (no resetting other principals or super-admins)
//   4. Rate limit: same target can only be reset once per 7 days
//   5. Force logout: invalidates all active sessions for the target user
//   6. Audit log includes target role + IP
principalRouter.post('/users/reset-password', requireAuth, PRINCIPAL, async (req, res) => {
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

    // Reset auth password to mobile (the default new-user pattern). Service
    // role bypasses the prevent_self_escalation trigger, so the subsequent
    // first_login_changed=false flip is allowed.
    const { error: pwErr } = await adminDb.auth.admin.updateUserById(t.id, {
      password: t.mobile_number,
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

    ok(res, { ok: true, name: t.name, mobile: t.mobile_number });
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

    const { data, error } = await adminDb.from('expenses').insert({
      school_id:   req.user.school_id,
      category:    body.category,
      description: body.description,
      amount:      body.amount,
      date:        body.date,
      created_by:  req.user.id,
    }).select('id, school_id, category, description, amount, date, created_by, created_at').single();
    if (error) throw new ApiError(500, error.message);
    ok(res, data, 201);
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
      .eq('id', approvalId).eq('school_id', req.user.school_id!).single();
    if (readErr) throw new ApiError(404, 'Approval not found');
    const a = row as any;

    if (a.request_type === 'PROFILE_CHANGE' || a.request_type === 'STUDENT_FIELD_CHANGE') {
      const db = userDb(req.jwt);
      const { error: rpcErr } = await db.rpc('apply_change_request', {
        p_approval_id: approvalId, p_approve: true, p_reason: null,
      });
      if (rpcErr) throw new ApiError(500, rpcErr.message);
    } else {
      const { error } = await adminDb.from('approvals').update({
        status: 'APPROVED',
        approved_by: req.user.id,
        approved_at: new Date().toISOString(),
      }).eq('id', approvalId).eq('school_id', req.user.school_id!);
      if (error) throw new ApiError(500, error.message);
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
      .select('new_value').eq('id', body.approvalId).eq('school_id', req.user.school_id!).single();
    if (readErr) throw new ApiError(404, 'Approval not found');
    const nv = ((cur as any)?.new_value as Record<string, unknown>) ?? {};
    nv['rejectionReason'] = body.reason ?? null;

    const { data, error } = await adminDb.from('approvals').update({
      status: 'REJECTED',
      new_value: nv,
      approved_by: req.user.id,
      approved_at: new Date().toISOString(),
    }).eq('id', body.approvalId).eq('school_id', req.user.school_id!)
      .select(APPROVAL_FIELDS).single();
    if (error) throw new ApiError(500, error.message);
    ok(res, data);
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

// POST /api/principal/library/book/issue — issue_asset RPC
principalRouter.post('/library/book/issue', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const body = requireBody<{
      bookId: string; studentId: string; studentName: string; note?: string;
    }>(req, ['bookId', 'studentId', 'studentName']);

    const { error } = await adminDb.rpc('issue_asset', {
      p_asset_id:      body.bookId,
      p_student_id:    body.studentId || null,
      p_borrower_name: body.studentName,
      p_loan_days:     14,
      p_note:          body.note?.trim() || null,
    });
    if (error) throw new ApiError(500, error.message);
    ok(res, { bookId: body.bookId, studentId: body.studentId });
  } catch (err) { fail(res, err); }
});

// POST /api/principal/library/book/return — return_asset RPC
principalRouter.post('/library/book/return', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const body = requireBody<{ bookId: string; studentId: string; note?: string }>(req, ['bookId', 'studentId']);

    const { error } = await adminDb.rpc('return_asset', {
      p_asset_id:   body.bookId,
      p_student_id: body.studentId || null,
      p_note:       body.note?.trim() || null,
    });
    if (error) throw new ApiError(500, error.message);
    ok(res, { bookId: body.bookId, studentId: body.studentId });
  } catch (err) { fail(res, err); }
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
      const { error } = await adminDb.from('sections').delete().in('id', body.toDelete);
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
