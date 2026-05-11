import { Router } from 'express';
import { adminDb } from '../lib/db';
import { ok, fail, ApiError, requireBody } from '../lib/helpers';
import { requireAuth, requireRole } from '../middleware/auth';
import {
  generateSchoolBackup, assertBackupAllowed, logBackupSuccess,
  type BackupKind,
} from '../lib/backup';

export const adminSchoolsRouter = Router();

const SA = requireRole('SUPER_ADMIN');

// ─── GET /api/admin/schools/:id/backup?kind=quick|full ───────────────────────
// Per-school ZIP backup. Streamed to the caller (not stored on Supabase).
// Rate-limited via audit_logs: QUICK = 1 / 24h, FULL = 1 / 7d.
adminSchoolsRouter.get('/:id/backup', requireAuth, SA, async (req, res) => {
  try {
    const schoolId = String(req.params.id ?? '');
    if (!schoolId) throw new ApiError(400, 'school id required');
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

// PUT /api/admin/schools/:id/ai-limit
// Super-admin sets the per-school monthly AI paper generation cap.
// 0 = unlimited (paid tier / boarding schools). Counts are taken
// from ai_paper_history for the current calendar month.
adminSchoolsRouter.put('/:id/ai-limit', requireAuth, SA, async (req, res) => {
  try {
    const schoolId = req.params.id;
    const body = requireBody<{ monthlyLimit: number }>(req, ['monthlyLimit']);
    const limit = Math.round(Number(body.monthlyLimit));
    if (!Number.isFinite(limit) || limit < 0 || limit > 10000) {
      throw new ApiError(400, 'monthlyLimit must be 0–10000 (0 = unlimited)');
    }
    const { data: school } = await adminDb.from('schools').select('id').eq('id', schoolId).maybeSingle();
    if (!school) throw new ApiError(404, 'School not found');
    const { error } = await adminDb.from('schools')
      .update({ ai_papers_monthly_limit: limit, updated_at: new Date().toISOString() })
      .eq('id', schoolId);
    if (error) throw new ApiError(500, error.message);
    ok(res, { schoolId, monthlyLimit: limit, unlimited: limit === 0 });
  } catch (err) { fail(res, err); }
});

// ─── POST /api/admin/schools/:id/reset-principal-password ───────────────────
// SUPER_ADMIN-only: generate a one-time temporary password for the named
// PRINCIPAL of any school. Mirrors the per-school principal reset flow but
// targets a role (PRINCIPAL) the principal-side route deliberately excludes.
//
// Guards:
//   1. Caller must be SUPER_ADMIN (decorator above).
//   2. Target user MUST be the principal of the URL-named school. Cross-
//      school targeting is impossible: lookup is scoped by school_id.
//   3. Rate limit — same target principal can only be reset once per 24h.
//   4. Force logout on the target so the old JWT can't keep working.
//   5. Audit log captures admin id + IP + target id (NOT the temp password).
//
// The temp password is returned in the response and never persisted.
adminSchoolsRouter.post('/:id/reset-principal-password', requireAuth, SA, async (req, res) => {
  try {
    const schoolId = req.params.id;

    // Find the principal of THIS school. There can only be one in our model;
    // if zero, fail loudly so the caller knows the school has no principal yet.
    const { data: target, error: te } = await adminDb
      .from('users')
      .select('id, name, mobile_number, email')
      .eq('school_id', schoolId)
      .eq('role', 'PRINCIPAL')
      .eq('is_active', true)
      .maybeSingle();
    if (te) throw new ApiError(500, te.message);
    const t = target as { id: string; name: string; mobile_number: string; email: string | null } | null;
    if (!t) throw new ApiError(404, 'No active principal found for this school');

    // Rate limit: 24h per target principal across all admins.
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recent } = await adminDb
      .from('audit_logs')
      .select('id, created_at')
      .eq('action', 'admin_reset_principal_password')
      .eq('entity_id', t.id)
      .gte('created_at', dayAgo)
      .limit(1);
    if ((recent ?? []).length > 0) {
      const last = (recent as { created_at: string }[])[0].created_at;
      const nextAvailable = new Date(new Date(last).getTime() + 24 * 60 * 60 * 1000)
        .toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
      throw new ApiError(429, `${t.name} ka principal password 24 ghante me ek baar hi reset ho sakta hai. Next available: ${nextAvailable}.`);
    }

    // Generate a fresh random temp password — same complexity rule as the
    // principal-side reset so the user can immediately replace it without
    // a "weaker than current" rejection.
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    const buf = new Uint8Array(10);
    (globalThis.crypto ?? require('node:crypto').webcrypto).getRandomValues(buf);
    let raw = '';
    for (let i = 0; i < buf.length; i++) raw += alphabet[buf[i] % alphabet.length];
    const tempPassword = raw.slice(0, 8) + '7Aa';

    const { error: pwErr } = await adminDb.auth.admin.updateUserById(t.id, {
      password: tempPassword,
    });
    if (pwErr) throw new ApiError(500, `Password reset failed: ${pwErr.message}`);

    const { error: flagErr } = await adminDb
      .from('users')
      .update({ first_login_changed: false, updated_at: new Date().toISOString() })
      .eq('id', t.id);
    if (flagErr) throw new ApiError(500, `Flag flip failed: ${flagErr.message}`);

    // Best-effort force logout. If sign-out fails the password is still reset.
    try { await adminDb.auth.admin.signOut(t.id); }
    catch (e) { console.warn('[admin-reset-principal] signOut failed', e); }

    const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0].trim()
            ?? req.socket.remoteAddress
            ?? null;
    await adminDb.from('audit_logs').insert({
      user_id:     req.user.id,
      school_id:   schoolId,
      action:      'admin_reset_principal_password',
      entity_type: 'user',
      entity_id:   t.id,
      details:     { targetName: t.name, targetMobile: t.mobile_number, ip },
    });

    ok(res, {
      ok: true,
      name:         t.name,
      mobile:       t.mobile_number,
      tempPassword,
    });
  } catch (err) { fail(res, err); }
});


// ─── POST /api/admin/schools/:id/update-principal-mobile ────────────────────
// Super-admin only. Atomically updates BOTH:
//   1. auth.users.email (the synthetic <mobile>@edugrow.local that
//      auth.signInWithPassword keys on)
//   2. public.users.mobile_number (display + lookups elsewhere)
//   3. schools.principal_phone (school-card metadata)
//
// Without this, super-admin editing schools.principal_phone alone
// would leave auth.users.email stale → the principal could no
// longer log in with the new number (and could STILL log in with
// the old one because that's what auth resolves against). See the
// /students/update-login-phone route for the parent equivalent.
//
// Rejects if the new mobile collides with another user (any role)
// in the system — the email-domain trick means two users sharing
// a mobile silently lock each other out at login.
const MOBILE_EMAIL_DOMAIN = '@edugrow.local';
adminSchoolsRouter.post('/:id/update-principal-mobile', requireAuth, SA, async (req, res) => {
  try {
    const schoolId = req.params.id;
    const body = requireBody<{ newPhone: string }>(req, ['newPhone']);
    const newPhone = body.newPhone.replace(/\D/g, '').slice(-10);
    if (newPhone.length !== 10) {
      throw new ApiError(400, 'Mobile number 10-digit hona chahiye');
    }

    // 1. Resolve the active principal of this school
    const { data: target, error: te } = await adminDb
      .from('users')
      .select('id, name, mobile_number, email')
      .eq('school_id', schoolId)
      .eq('role', 'PRINCIPAL')
      .eq('is_active', true)
      .maybeSingle();
    if (te) throw new ApiError(500, te.message);
    const t = target as { id: string; name: string; mobile_number: string; email: string | null } | null;
    if (!t) throw new ApiError(404, 'No active principal found for this school');

    // No-op short-circuit so an accidental re-submit doesn't churn audit logs
    if (t.mobile_number === newPhone) {
      ok(res, { ok: true, unchanged: true, mobile: newPhone });
      return;
    }

    // 2. Reject if the new number is already used by a DIFFERENT user
    const { data: clash } = await adminDb.from('users')
      .select('id, role').eq('mobile_number', newPhone).maybeSingle();
    if (clash && (clash as { id: string }).id !== t.id) {
      throw new ApiError(409,
        `Mobile ${newPhone} pehle se kisi aur user (${(clash as { role: string }).role}) ke saath linked hai. Pehle wahan se hatao.`);
    }

    // 3. Update auth.users.email FIRST. If this fails we haven't
    //    touched anything else, so no desync risk.
    const newEmail = `${newPhone}${MOBILE_EMAIL_DOMAIN}`;
    const { error: authErr } = await adminDb.auth.admin.updateUserById(t.id, {
      email: newEmail,
      user_metadata: { mobile_number: newPhone },
    });
    if (authErr) throw new ApiError(500, `Auth update failed: ${authErr.message}`);

    // 4. Update public.users.mobile_number (login-side identity)
    const { error: usrErr } = await adminDb.from('users')
      .update({ mobile_number: newPhone, updated_at: new Date().toISOString() })
      .eq('id', t.id);
    if (usrErr) throw new ApiError(500, `User row update failed: ${usrErr.message}`);

    // 5. Mirror to schools.principal_phone (display only). Best-effort —
    //    if this fails the auth + users update is the source of truth.
    const { error: schoolErr } = await adminDb.from('schools')
      .update({ principal_phone: newPhone, updated_at: new Date().toISOString() })
      .eq('id', schoolId);
    if (schoolErr) console.warn('[update-principal-mobile] schools row update failed', schoolErr.message);

    // 6. Force sign-out everywhere so the principal must re-login
    //    on the new number, ensuring no stale cached session lets
    //    them stay in with the (now-invalid) old credentials.
    try { await adminDb.auth.admin.signOut(t.id); }
    catch (e) { console.warn('[update-principal-mobile] signOut failed', e); }

    await adminDb.from('audit_logs').insert({
      user_id:     req.user.id,
      school_id:   schoolId,
      action:      'admin_update_principal_mobile',
      entity_type: 'user',
      entity_id:   t.id,
      details:     {
        targetName: t.name,
        oldMobile:  t.mobile_number,
        newMobile:  newPhone,
      },
    });

    ok(res, { ok: true, mobile: newPhone, principalName: t.name });
  } catch (err) { fail(res, err); }
});

// ─── NEW SIMPLE BILLING: per-AY installments ─────────────────────────────────
// Replaces the legacy school_billings / billing_years system. Super-admin
// adds installments (name + amount + due_date) under each academic year of
// a school. Each row gets its own Pay button on the UI; payment is recorded
// in-place (paid_amount, paid_at). All endpoints SUPER_ADMIN-only.

// GET /api/admin/schools/:id/billing-installments
//   Returns: AY list (active first) + installments grouped by AY.
adminSchoolsRouter.get('/:id/billing-installments', requireAuth, SA, async (req, res) => {
  try {
    const schoolId = req.params.id;
    const [ayRes, instRes] = await Promise.all([
      adminDb.from('academic_years')
        .select('id, label, start_date, end_date, is_active, is_closed')
        .eq('school_id', schoolId)
        .order('start_date', { ascending: false }),
      adminDb.from('school_billing_installments')
        .select('id, academic_year_id, name, description, amount, due_date, paid_amount, paid_at, paid_method, paid_note, created_at')
        .eq('school_id', schoolId)
        .order('due_date', { ascending: true }),
    ]);
    if (ayRes.error)   throw new ApiError(500, ayRes.error.message);
    if (instRes.error) throw new ApiError(500, instRes.error.message);
    ok(res, {
      academicYears: ayRes.data ?? [],
      installments: instRes.data ?? [],
    });
  } catch (err) { fail(res, err); }
});

// POST /api/admin/schools/:id/billing-installments
//   Body: { academicYearId, name, amount, dueDate }
adminSchoolsRouter.post('/:id/billing-installments', requireAuth, SA, async (req, res) => {
  try {
    const schoolId = req.params.id;
    const body = requireBody<{
      academicYearId: string; name: string; amount: number; dueDate: string;
      description?: string;
    }>(req, ['academicYearId', 'name', 'amount', 'dueDate']);

    if (typeof body.amount !== 'number' || body.amount < 0) {
      throw new ApiError(400, 'amount must be a non-negative number');
    }

    // Verify AY belongs to this school (cheap defence against cross-school
    // ID swap from a hijacked browser).
    const { data: ay } = await adminDb.from('academic_years')
      .select('id').eq('id', body.academicYearId).eq('school_id', schoolId).maybeSingle();
    if (!ay) throw new ApiError(404, 'Academic year not found for this school');

    const { data, error } = await adminDb.from('school_billing_installments')
      .insert({
        school_id:        schoolId,
        academic_year_id: body.academicYearId,
        name:             body.name.trim(),
        description:      body.description?.trim() || null,
        amount:           Math.round(body.amount),
        due_date:         body.dueDate,
        created_by:       req.user.id,
      })
      .select('id, academic_year_id, name, description, amount, due_date, paid_amount, paid_at, paid_method, paid_note, created_at')
      .single();
    if (error) throw new ApiError(500, error.message);
    ok(res, data, 201);
  } catch (err) { fail(res, err); }
});

// POST /api/admin/schools/:id/billing-installments/:instId/pay
//   Body: { amount, method?, note? }   (amount = how much was just received)
adminSchoolsRouter.post('/:id/billing-installments/:instId/pay', requireAuth, SA, async (req, res) => {
  try {
    const schoolId = req.params.id;
    const instId = req.params.instId;
    const body = requireBody<{ amount: number; method?: string; note?: string }>(req, ['amount']);
    if (typeof body.amount !== 'number' || body.amount <= 0) {
      throw new ApiError(400, 'amount must be > 0');
    }

    const { data: row, error: rowErr } = await adminDb.from('school_billing_installments')
      .select('id, amount, paid_amount').eq('id', instId).eq('school_id', schoolId).maybeSingle();
    if (rowErr) throw new ApiError(500, rowErr.message);
    if (!row) throw new ApiError(404, 'Installment not found');
    const r = row as { id: string; amount: number; paid_amount: number };
    const outstanding = r.amount - r.paid_amount;
    if (outstanding <= 0) throw new ApiError(409, 'Already paid in full');
    const cap = Math.round(body.amount);
    if (cap > outstanding) throw new ApiError(400, `Amount exceeds outstanding (₹${outstanding})`);

    const newPaid = r.paid_amount + cap;
    const fullyPaid = newPaid >= r.amount;

    const { data, error } = await adminDb.from('school_billing_installments')
      .update({
        paid_amount: newPaid,
        paid_at:     fullyPaid ? new Date().toISOString() : null,
        paid_method: body.method ?? null,
        paid_note:   body.note ?? null,
      })
      .eq('id', instId).eq('school_id', schoolId)
      .select('id, academic_year_id, name, description, amount, due_date, paid_amount, paid_at, paid_method, paid_note, created_at')
      .single();
    if (error) throw new ApiError(500, error.message);
    ok(res, data);
  } catch (err) { fail(res, err); }
});

// DELETE /api/admin/schools/:id/billing-installments/:instId
adminSchoolsRouter.delete('/:id/billing-installments/:instId', requireAuth, SA, async (req, res) => {
  try {
    const schoolId = req.params.id;
    const instId = req.params.instId;
    const { error } = await adminDb.from('school_billing_installments')
      .delete().eq('id', instId).eq('school_id', schoolId);
    if (error) throw new ApiError(500, error.message);
    ok(res, { ok: true });
  } catch (err) { fail(res, err); }
});
