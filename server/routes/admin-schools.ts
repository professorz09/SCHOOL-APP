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

// ─── PUT /api/admin/schools/:id/billing ──────────────────────────────────────
// Set / update the fixed monthly billing amount for a school.
adminSchoolsRouter.put('/:id/billing', requireAuth, SA, async (req, res) => {
  try {
    const schoolId = req.params.id;
    const body = requireBody<{ fixedAmount: number }>(req, ['fixedAmount']);

    const amount = Math.round(Number(body.fixedAmount));
    if (!Number.isFinite(amount) || amount < 0) {
      throw new ApiError(400, 'fixedAmount must be a non-negative number');
    }

    // Verify school exists first
    const { data: school, error: se } = await adminDb
      .from('schools')
      .select('id')
      .eq('id', schoolId)
      .single();
    if (se || !school) throw new ApiError(404, 'School not found');

    const { error } = await adminDb
      .from('schools')
      .update({ billing_fixed_amount: amount, updated_at: new Date().toISOString() })
      .eq('id', schoolId);
    if (error) throw new ApiError(500, error.message);

    ok(res, { schoolId, fixedAmount: amount });
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

// ─── POST /api/admin/schools/:id/payments ────────────────────────────────────
// Record a payment for a school.
adminSchoolsRouter.post('/:id/payments', requireAuth, SA, async (req, res) => {
  try {
    const schoolId = req.params.id;
    const body = requireBody<{ amount: number; paidOn: string }>(req, ['amount', 'paidOn']);

    const amount = Math.round(Number(body.amount));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new ApiError(400, 'amount must be a positive number');
    }
    if (!body.paidOn) throw new ApiError(400, 'paidOn date is required');

    // Verify school exists before inserting payment
    const { data: schoolCheck, error: sce } = await adminDb
      .from('schools')
      .select('id')
      .eq('id', schoolId)
      .single();
    if (sce || !schoolCheck) throw new ApiError(404, 'School not found');

    const { data, error } = await adminDb
      .from('school_fee_payments')
      .insert({
        school_id:  schoolId,
        amount,
        paid_on:    body.paidOn,
        note:       (req.body.note as string | undefined) ?? null,
        created_by: req.user.id,
      })
      .select('id, school_id, amount, paid_on, note, created_by, created_at')
      .single();
    if (error) {
      // FK violation or check constraint → 400, anything else → 500
      const is4xx = error.code === '23503' || error.code === '23514';
      throw new ApiError(is4xx ? 400 : 500, error.message);
    }

    ok(res, data, 201);
  } catch (err) { fail(res, err); }
});

// ─── GET /api/admin/schools/:id/payments ─────────────────────────────────────
// List all payments for a school, newest first.
adminSchoolsRouter.get('/:id/payments', requireAuth, SA, async (req, res) => {
  try {
    const schoolId = req.params.id;

    const { data: school, error: se } = await adminDb
      .from('schools')
      .select('id, billing_fixed_amount, created_at')
      .eq('id', schoolId)
      .single();
    if (se || !school) throw new ApiError(404, 'School not found');

    const { data: payments, error: pe } = await adminDb
      .from('school_fee_payments')
      .select('id, school_id, amount, paid_on, note, created_by, created_at')
      .eq('school_id', schoolId)
      .order('paid_on', { ascending: false });
    if (pe) throw new ApiError(500, pe.message);

    // Calculate outstanding balance
    const fixedAmount: number = Number(school.billing_fixed_amount ?? 0);
    const schoolCreatedAt = new Date(school.created_at);
    const now = new Date();
    const monthsElapsed = Math.max(
      0,
      (now.getFullYear() - schoolCreatedAt.getFullYear()) * 12 +
      (now.getMonth() - schoolCreatedAt.getMonth()) + 1,
    );
    const totalExpected  = fixedAmount * monthsElapsed;
    const totalPaid      = (payments ?? []).reduce((s, p) => s + Number(p.amount), 0);
    const outstanding    = Math.max(0, totalExpected - totalPaid);

    ok(res, {
      fixedAmount,
      monthsElapsed,
      totalExpected,
      totalPaid,
      outstanding,
      payments: payments ?? [],
    });
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
