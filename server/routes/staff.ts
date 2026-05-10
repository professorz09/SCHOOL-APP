import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { adminDb, userDb } from '../lib/db';
import { ok, fail, ApiError, requireBody } from '../lib/helpers';
import { requireAuth, requireRole } from '../middleware/auth';

export const staffRouter = Router();

// Each /staff/create call provisions a Supabase auth.users + public.users +
// staff row. Schools typically add staff a handful of times a year — 20/hour
// is generous for legitimate bulk-onboarding while still blocking automated
// abuse of a compromised principal account. Cap is per-principal.
const staffCreateLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 20,
  keyGenerator: (req: any) => `staff-create:${req.user?.id ?? req.ip}`,
  validate: { keyGeneratorIpFallback: false },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { ok: false, error: 'Staff onboarding rate limit reached (20/hour). Try again later.' },
});

// POST /api/staff/deactivate
// Suspends a staff member AND clears their dangling references in
// timetable_entries (teacher_id, teacher_name) so the principal's existing
// timetable doesn't keep displaying the suspended teacher's name on slots
// that need re-assignment. staff_class_assignments and staff_permissions
// are also cleared for the same reason.
staffRouter.post('/deactivate', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const { staffId } = requireBody<{ staffId: string }>(req, ['staffId']);
    const schoolId = req.user.school_id!;

    const { error } = await adminDb.from('staff').update({
      is_active: false,
      status: 'SUSPENDED',
      updated_at: new Date().toISOString(),
    }).eq('id', staffId).eq('school_id', schoolId);
    if (error) throw new ApiError(500, error.message);

    // Best-effort cleanup of references — failures don't block deactivation,
    // since the staff row is already inactive and `_active` filters in the
    // UI will hide their identity. Logged for triage.
    const cleanups = await Promise.allSettled([
      adminDb.from('timetable_entries')
        .update({ teacher_id: null, teacher_name: 'Suspended — re-assign' })
        .eq('school_id', schoolId).eq('teacher_id', staffId),
      adminDb.from('staff_class_assignments').delete()
        .eq('school_id', schoolId).eq('staff_id', staffId),
      adminDb.from('staff_permissions').delete()
        .eq('school_id', schoolId).eq('staff_id', staffId),
    ]);
    for (const r of cleanups) {
      if (r.status === 'rejected') console.warn('[staff/deactivate] cleanup failure', r.reason);
    }

    ok(res, { staffId });
  } catch (err) { fail(res, err); }
});

// POST /api/staff/salary/pay — record_salary_payment RPC (auth.uid() required)
staffRouter.post('/salary/pay', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const body = requireBody<{
      staffId: string; month: string; amount: number;
      note?: string; method?: string; transactionId?: string;
      paidAt?: string;
    }>(req, ['staffId', 'month', 'amount']);

    if (!Number.isFinite(body.amount) || body.amount <= 0)
      throw new ApiError(400, 'Amount must be positive');
    // Defense-in-depth upper bound — a single salary > 1 crore is
    // wildly outside any realistic Indian school's range; the cap
    // catches accidental UI misclicks and malicious bypass attempts.
    if (body.amount > 100_000_000)
      throw new ApiError(400, 'Salary amount exceeds the per-transaction cap.');

    // paid_at defaults to today server-side. Reject anything that doesn't
    // look like an ISO date so a typo can't sneak past the RPC's future-
    // date guard with garbage that pg coerces unexpectedly.
    let paidAt: string | null = null;
    if (body.paidAt) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(body.paidAt)) {
        throw new ApiError(400, 'paidAt must be ISO yyyy-mm-dd');
      }
      paidAt = body.paidAt;
    }

    const db = userDb(req.jwt);
    const { error } = await db.rpc('record_salary_payment', {
      p_staff_id: body.staffId,
      p_month:    body.month,
      p_amount:   Math.round(body.amount),
      p_note:     body.note ?? null,
      p_method:   body.method ?? null,
      p_txn_id:   body.transactionId ?? null,
      p_paid_at:  paidAt,
    });
    if (error) throw new ApiError(500, error.message);

    ok(res, { staffId: body.staffId, month: body.month, amount: body.amount });
  } catch (err) { fail(res, err); }
});

// POST /api/staff/salary/reverse — undo a recently-recorded payment
staffRouter.post('/salary/reverse', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const body = requireBody<{ paymentId: string; reason: string }>(req, ['paymentId', 'reason']);
    if (!body.reason?.trim()) throw new ApiError(400, 'reason is required');

    const db = userDb(req.jwt);
    const { error } = await db.rpc('reverse_salary_payment', {
      p_payment_id: body.paymentId,
      p_reason:     body.reason.trim(),
    });
    if (error) throw new ApiError(400, error.message);
    ok(res, { paymentId: body.paymentId });
  } catch (err) { fail(res, err); }
});

// POST /api/staff/salary/update — update_staff_salary RPC (auth.uid() required)
staffRouter.post('/salary/update', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const body = requireBody<{
      staffId: string; newAmount: number; effectiveFrom: string; reason: string;
    }>(req, ['staffId', 'newAmount', 'effectiveFrom', 'reason']);

    if (!Number.isFinite(body.newAmount) || body.newAmount < 0)
      throw new ApiError(400, 'Salary must be non-negative');

    const db = userDb(req.jwt);
    const { error } = await db.rpc('update_staff_salary', {
      p_staff_id:       body.staffId,
      p_new_amount:     Math.round(body.newAmount),
      p_effective_from: body.effectiveFrom,
      p_reason:         body.reason || null,
    });
    if (error) throw new ApiError(500, error.message);

    ok(res, { staffId: body.staffId, newAmount: body.newAmount });
  } catch (err) { fail(res, err); }
});

// POST /api/staff/relieve — set_staff_relieving_date RPC (auth.uid() required)
//
// Relieving a staff member is the terminal-by-default lifecycle transition
// (versus suspend, which is recoverable). Beyond stamping relieving_date /
// status='RELIEVED', we also tear down the same downstream references the
// suspend flow clears, so the staff member stops appearing in active rosters
// and can no longer authenticate. Without these the relieved teacher's name
// would keep showing on timetable slots and they could still log in.
staffRouter.post('/relieve', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const body = requireBody<{
      staffId: string; date: string; reason: string;
    }>(req, ['staffId', 'date', 'reason']);
    if (!body.date) throw new ApiError(400, 'Relieving date required');

    const schoolId = req.user.school_id!;

    const db = userDb(req.jwt);
    const { error } = await db.rpc('set_staff_relieving_date', {
      p_staff_id: body.staffId,
      p_date:     body.date,
      p_reason:   body.reason || null,
    });
    if (error) throw new ApiError(500, error.message);

    // Best-effort downstream cleanup. Same shape as /deactivate. Failures
    // are logged but don't block the response — relieving_date is already
    // stamped, so the principal can re-trigger any individual cleanup if
    // needed.
    const { data: staffRow } = await adminDb.from('staff')
      .select('user_id').eq('id', body.staffId).eq('school_id', schoolId).maybeSingle();
    const userId = (staffRow as { user_id: string | null } | null)?.user_id ?? null;

    const cleanups = await Promise.allSettled([
      adminDb.from('timetable_entries')
        .update({ teacher_id: null, teacher_name: 'Relieved — re-assign' })
        .eq('school_id', schoolId).eq('teacher_id', body.staffId),
      adminDb.from('staff_class_assignments').delete()
        .eq('school_id', schoolId).eq('staff_id', body.staffId),
      adminDb.from('staff_permissions').delete()
        .eq('school_id', schoolId).eq('staff_id', body.staffId),
      // Lock the auth account so the relieved teacher can't log in. We do
      // this directly on the users row (matches what super-admin's
      // setUserActive does for non-staff roles).
      userId
        ? adminDb.from('users').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', userId)
        : Promise.resolve({ error: null }),
    ]);
    for (const r of cleanups) {
      if (r.status === 'rejected') console.warn('[staff/relieve] cleanup failure', r.reason);
    }

    ok(res, { staffId: body.staffId, date: body.date });
  } catch (err) { fail(res, err); }
});

// POST /api/staff/rejoin — undo a RELIEVED transition.
// Real-world rationale: a teacher who has been relieved sometimes returns
// (re-hired for the next session, mistake, etc). Without this endpoint, the
// only recovery was direct DB editing because the UI guards everything on
// status === 'RELIEVED'. Clearing relieving_date / relieving_reason and
// flipping status back to ACTIVE puts the row back into normal rosters; the
// teacher then needs class/permission re-assignment via the existing UI.
staffRouter.post('/rejoin', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const { staffId } = requireBody<{ staffId: string }>(req, ['staffId']);
    const schoolId = req.user.school_id!;

    const { data: row, error: rErr } = await adminDb.from('staff')
      .select('user_id, status').eq('id', staffId).eq('school_id', schoolId).maybeSingle();
    if (rErr) throw new ApiError(500, rErr.message);
    if (!row) throw new ApiError(404, 'Staff not found');

    const { error } = await adminDb.from('staff').update({
      status:           'ACTIVE',
      relieving_date:   null,
      relieving_reason: null,
      is_active:        true,
      updated_at:       new Date().toISOString(),
    }).eq('id', staffId).eq('school_id', schoolId);
    if (error) throw new ApiError(500, error.message);

    const userId = (row as { user_id: string | null }).user_id;
    if (userId) {
      await adminDb.from('users')
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq('id', userId);
    }

    ok(res, { staffId });
  } catch (err) { fail(res, err); }
});

// POST /api/staff/document/delete — delete staff_documents row
staffRouter.post('/document/delete', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const { documentId } = requireBody<{ documentId: string }>(req, ['documentId']);

    // Verify document belongs to this school via staff join
    const { data: row } = await adminDb
      .from('staff_documents')
      .select('id, doc_url, staff_id, staff!inner(school_id)')
      .eq('id', documentId)
      .maybeSingle();
    if (!row) throw new ApiError(404, 'Document not found');
    if ((row as any).staff?.school_id !== req.user.school_id) throw new ApiError(403, 'Access denied');

    const { error } = await adminDb.from('staff_documents').delete().eq('id', documentId);
    if (error) throw new ApiError(500, error.message);

    ok(res, { documentId, docUrl: (row as any).doc_url });
  } catch (err) { fail(res, err); }
});

// POST /api/staff/create — insert staff row + seed salary + class assignments
staffRouter.post('/create', requireAuth, requireRole('PRINCIPAL'), staffCreateLimiter, async (req, res) => {
  try {
    const body = requireBody<{
      userId: string | null;
      name: string; role: string; salary: number;
      subject?: string; phone?: string; email?: string; aadhaarNo?: string;
      joiningDate?: string; status?: string; address?: string; photo?: string;
      assignedClasses?: string[];
    }>(req, ['name', 'role', 'salary']);

    const schoolId = req.user.school_id!;

    // Insert staff row
    const { data, error } = await adminDb.from('staff').insert({
      school_id:    schoolId,
      user_id:      body.userId ?? null,
      name:         body.name,
      role:         body.role,
      subject:      body.subject ?? null,
      phone:        body.phone ?? null,
      email:        body.email ?? null,
      aadhaar_no:   body.aadhaarNo ?? null,
      salary:       body.salary,
      joining_date: body.joiningDate ?? null,
      status:       body.status ?? 'ACTIVE',
      address:      body.address ?? null,
      photo:        body.photo ?? null,
      is_active:    true,
    }).select().single();
    if (error) throw new ApiError(500, error.message);
    const row = data as any;

    // Seed initial salary history
    if (body.salary > 0) {
      const db = userDb(req.jwt);
      const { error: seedErr } = await db.rpc('update_staff_salary', {
        p_staff_id:       row.id,
        p_new_amount:     body.salary,
        p_effective_from: body.joiningDate ?? new Date().toISOString().slice(0, 10),
        p_reason:         'Initial',
      });
      if (seedErr) {
        await adminDb.from('staff').delete().eq('id', row.id);
        throw new ApiError(500, `Failed to seed initial salary: ${seedErr.message}`);
      }
    }

    // Insert class assignments
    if (body.assignedClasses?.length) {
      const { data: ay } = await adminDb
        .from('academic_years').select('id')
        .eq('school_id', schoolId).eq('is_active', true).maybeSingle();
      const ayId = (ay as any)?.id ?? null;
      const rows = (body.assignedClasses).map((cls: string) => ({
        school_id: schoolId, staff_id: row.id, academic_year_id: ayId, class_name: cls,
      }));
      const { error: assignErr } = await adminDb.from('staff_class_assignments').insert(rows);
      if (assignErr) throw new ApiError(500, assignErr.message);
    }

    ok(res, row, 201);
  } catch (err) { fail(res, err); }
});

// POST /api/staff/update — profile patch + class assignment replace
staffRouter.post('/update', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const body = requireBody<{
      id: string; patch: Record<string, unknown>; assignedClasses?: string[];
    }>(req, ['id', 'patch']);

    const schoolId = req.user.school_id!;

    const safe: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const allowed = ['name','role','subject','phone','email','aadhaar_no','salary',
                     'joining_date','status','address','photo'];
    for (const k of allowed) if (body.patch[k] !== undefined) safe[k] = body.patch[k];

    const { error } = await adminDb.from('staff').update(safe)
      .eq('id', body.id).eq('school_id', schoolId);
    if (error) throw new ApiError(500, error.message);

    if (body.assignedClasses !== undefined) {
      const { data: ay, error: ayErr } = await adminDb
        .from('academic_years').select('id')
        .eq('school_id', schoolId).eq('is_active', true).limit(1);
      if (ayErr) throw new ApiError(500, `Active-year lookup failed: ${ayErr.message}`);
      const ayId = ((ay ?? [])[0] as any)?.id;
      if (!ayId) throw new ApiError(400, 'No active academic year — activate one before changing class assignments.');

      const { error: delErr } = await adminDb.from('staff_class_assignments')
        .delete().eq('school_id', schoolId).eq('staff_id', body.id).eq('academic_year_id', ayId);
      if (delErr) throw new ApiError(500, `Clearing old assignments: ${delErr.message}`);

      if (body.assignedClasses.length) {
        const rows = body.assignedClasses.map((cls: string) => ({
          school_id: schoolId, staff_id: body.id, academic_year_id: ayId, class_name: cls,
        }));
        const { error: insErr } = await adminDb.from('staff_class_assignments').insert(rows);
        if (insErr) throw new ApiError(500, `Class assignments: ${insErr.message}`);
      }
    }

    ok(res, { id: body.id });
  } catch (err) { fail(res, err); }
});
