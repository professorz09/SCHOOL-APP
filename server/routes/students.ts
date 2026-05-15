import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { adminDb, userDb } from '../lib/db';
import { ok, fail, ApiError, requireBody } from '../lib/helpers';
import { requireAuth, requireRole, requireEditorMode } from '../middleware/auth';

export const studentsRouter = Router();

// TC issuance is destructive (sets is_active=false, generates a TC
// number, writes student_change_history). 30 per principal per day
// is well above any realistic real-world cadence (a typical school
// issues a handful of TCs per academic year). The cap exists so a
// compromised account or an automated mistake can't wipe the roster.
const issueTcLimiter = rateLimit({
  windowMs: 24 * 60 * 60_000,
  limit: 30,
  keyGenerator: (req: any) => `tc:${req.user?.id ?? req.ip}`,
  validate: { keyGeneratorIpFallback: false },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { ok: false, error: 'TC issuance limit reached (30/day). Contact support if more are needed.' },
});

// Each /create call provisions a real Supabase auth.users row + a
// public.users parent row + a students row. Without a cap, a
// compromised principal account could exhaust the project's auth
// quota or pollute the school directory. 100/hour comfortably
// covers a busy admission day (typical max ~30/day) but blocks
// any automated abuse. Cap is per-principal, not per-IP, since
// admins typically work from a single device.
const studentCreateLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 100,
  keyGenerator: (req: any) => `stu-create:${req.user?.id ?? req.ip}`,
  validate: { keyGeneratorIpFallback: false },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { ok: false, error: 'Admission rate limit reached (100/hour). If genuinely admitting many students, contact support.' },
});

// Pre-check called by the admission form on mobile blur. Returns a
// boolean only — no school name, no student name, no count. The
// throttle blocks bulk enumeration attempts (a principal trying to
// harvest competitor-school parent mobiles by spraying numbers).
const eligibilityLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  keyGenerator: (req: any) => `elig:${req.user?.id ?? req.ip}`,
  validate: { keyGeneratorIpFallback: false },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { ok: false, error: 'Too many eligibility checks. Try again in a minute.' },
});

// GET /api/students?yearId=&search=&status=
studentsRouter.get('/', requireAuth, requireRole('PRINCIPAL', 'TEACHER'), async (req, res) => {
  try {
    const { yearId, search, status } = req.query as Record<string, string>;

    let q = adminDb
      .from('student_academic_records')
      .select(`
        id, roll_no, class_name, section, status, fee_status, total_fee, paid_fee,
        student_id,
        students!inner(id, name, father_name, phone, dob, admission_no, gender, photo, school_id)
      `)
      .eq('students.school_id', req.user.school_id!);

    if (yearId) q = q.eq('academic_year_id', yearId);
    if (status) q = q.eq('status', status);

    // Server-side payload cap. Mirrors studentService.getAll's 5000
    // client-side cap as defence in depth — without this, a runaway
    // import or missing soft-delete could dump 50k rows in a single
    // response. Real schools fit comfortably; consumers needing
    // larger sets should use the paginated /list shape.
    const { data, error } = await q.order('class_name').order('roll_no').limit(5000);
    if (error) throw new ApiError(500, error.message);

    let result = (data ?? []) as any[];
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(r =>
        (r.students?.name ?? '').toLowerCase().includes(s) ||
        (r.students?.admission_no ?? '').toLowerCase().includes(s) ||
        String(r.roll_no ?? '').includes(s)
      );
    }
    ok(res, result);
  } catch (err) { fail(res, err); }
});

// GET /api/students/:id/timeline — chronological lifecycle events for a student
studentsRouter.get('/:id/timeline', requireAuth, requireRole('PRINCIPAL', 'TEACHER'), async (req, res) => {
  try {
    const studentId = req.params.id;
    const schoolId = req.user.school_id!;

    const [stuRes, recRes, trRes] = await Promise.all([
      adminDb.from('students')
        .select('id, name, admission_date, created_at, status, updated_at, tc_number')
        .eq('id', studentId).eq('school_id', schoolId).maybeSingle(),
      adminDb.from('student_academic_records')
        // academic_years.name doesn't exist — the column is `label`. Aliasing
        // it to `name` keeps the downstream rec.academic_years.name access
        // working without rewriting the loop below.
        .select('id, class_name, section, roll_no, total_fee, status, created_at, academic_year_id, academic_years!inner(name:label, start_date, school_id)')
        .eq('student_id', studentId)
        .eq('academic_years.school_id', schoolId)
        .order('created_at', { ascending: true }),
      adminDb.from('student_transport_assignments')
        .select('id, start_date, end_date, is_active, end_reason, transport_vehicles(vehicle_no)')
        .eq('student_id', studentId)
        .order('start_date', { ascending: true }),
    ]);

    if (!stuRes.data) throw new ApiError(404, 'Student not found');
    const stu = stuRes.data as any;
    const records = (recRes.data ?? []) as any[];
    const transport = (trRes.data ?? []) as any[];

    type Event = { type: string; date: string; label: string; sub?: string };
    const events: Event[] = [];

    // Admission
    events.push({
      type: 'ADMISSION',
      date: stu.admission_date || stu.created_at,
      label: 'Student Admitted',
      sub: stu.name,
    });

    // Class assignments + fee structure
    for (const rec of records) {
      const yearName = rec.academic_years?.name ?? '';
      events.push({
        type: 'CLASS_ASSIGNED',
        date: rec.created_at,
        label: `Assigned to ${rec.class_name}${rec.section ? `-${rec.section}` : ''}`,
        sub: yearName,
      });
      if ((rec.total_fee ?? 0) > 0) {
        events.push({
          type: 'FEE_STRUCTURE',
          date: rec.created_at,
          label: 'Fee Structure Assigned',
          sub: `₹${Math.round((rec.total_fee ?? 0) / 100) / 10}K / year · ${yearName}`,
        });
      }
      if (rec.status === 'PASSED') {
        events.push({
          type: 'PROMOTED',
          date: rec.created_at,
          label: `Promoted from ${rec.class_name}`,
          sub: yearName,
        });
      }
    }

    // Transport history
    for (const t of transport) {
      if (t.start_date) {
        events.push({
          type: 'TRANSPORT_ADDED',
          date: t.start_date,
          label: 'Transport Assigned',
          sub: t.transport_vehicles?.vehicle_no ? `Vehicle ${t.transport_vehicles.vehicle_no}` : undefined,
        });
      }
      if (t.end_date) {
        events.push({
          type: 'TRANSPORT_REMOVED',
          date: t.end_date,
          label: 'Transport Removed',
          sub: t.end_reason || undefined,
        });
      }
    }

    // TC and re-admit (best-effort from current status + updated_at)
    if (stu.status === 'TC_ISSUED' && stu.updated_at) {
      events.push({
        type: 'TC_ISSUED',
        date: stu.updated_at,
        label: 'TC Issued',
        sub: stu.tc_number ? `TC No: ${stu.tc_number}` : undefined,
      });
    }

    events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    ok(res, events);
  } catch (err) { fail(res, err); }
});

// GET /api/students/:id/academic-history — all yearly records for a student across all years
studentsRouter.get('/:id/academic-history', requireAuth, requireRole('PRINCIPAL', 'TEACHER'), async (req, res) => {
  try {
    // Explicit school ownership check first — the academic_years join filter
    // below is insufficient on its own: it would silently return 0 rows for
    // a cross-school student ID instead of a proper 404, and a future schema
    // change could break the indirect guard without notice.
    const { data: stuOwn } = await adminDb
      .from('students').select('id')
      .eq('id', req.params.id).eq('school_id', req.user.school_id!).maybeSingle();
    if (!stuOwn) throw new ApiError(404, 'Student not found');

    const { data, error } = await adminDb
      .from('student_academic_records')
      .select(`
        id, class_name, section, roll_no, status, fee_status,
        total_fee, paid_fee, academic_year_id,
        academic_years!inner(id, name:label, start_date, end_date, school_id)
      `)
      .eq('student_id', req.params.id)
      .eq('academic_years.school_id', req.user.school_id!);
    if (error) throw new ApiError(500, error.message);
    const sorted = (data ?? []).sort((a: any, b: any) => {
      const ad = (a.academic_years as any)?.start_date ?? '';
      const bd = (b.academic_years as any)?.start_date ?? '';
      return bd.localeCompare(ad);
    });
    ok(res, sorted);
  } catch (err) { fail(res, err); }
});

// GET /api/students/:id
studentsRouter.get('/:id', requireAuth, requireRole('PRINCIPAL', 'TEACHER', 'PARENT', 'STUDENT'), async (req, res) => {
  try {
    const { data, error } = await adminDb
      .from('students')
      .select(`
        *,
        student_academic_records(
          id, roll_no, class_name, section, status, fee_status, total_fee, paid_fee,
          academic_year_id,
          sections(id, class_name, section)
        )
      `)
      .eq('id', req.params.id)
      .eq('school_id', req.user.school_id!)
      .single();
    if (error || !data) throw new ApiError(404, 'Student not found');
    ok(res, data);
  } catch (err) { fail(res, err); }
});

// POST /api/students/assign — full class assignment with optional fee schedule
studentsRouter.post('/assign', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const body = requireBody<{
      studentId: string; sectionId?: string; className: string; section: string;
      rollNo?: string; academicYearId: string; totalFee?: number;
      feeHeads?: any[]; dueDates?: any[]; isRte?: boolean;
      discountAmount?: number; discountPct?: number;
    }>(req, ['studentId', 'className', 'section', 'academicYearId']);

    // Explicit ownership guard before any mutation. The update below uses
    // .eq('school_id') but silently does 0 rows when the student is from
    // another school — subsequent upserts would then create cross-school
    // academic records under a foreign student_id.
    const { data: stuOwn } = await adminDb.from('students').select('id')
      .eq('id', body.studentId).eq('school_id', req.user.school_id!).maybeSingle();
    if (!stuOwn) throw new ApiError(404, 'Student not found');

    // Reactivate student row if it was inactive (readmit after TC, etc.)
    await adminDb.from('students')
      .update({ is_active: true, status: 'ACTIVE', updated_at: new Date().toISOString() })
      .eq('id', body.studentId)
      .eq('school_id', req.user.school_id!);

    // Resolve section_id
    let sectionId = body.sectionId ?? null;
    if (!sectionId) {
      const { data: sec } = await adminDb
        .from('sections')
        .select('id')
        .eq('school_id', req.user.school_id!)
        .eq('academic_year_id', body.academicYearId)
        .eq('class_name', body.className)
        .eq('section', body.section)
        .maybeSingle();
      sectionId = (sec as any)?.id ?? null;
    }

    // Upsert academic record
    const { data: existing } = await adminDb
      .from('student_academic_records')
      .select('id')
      .eq('student_id', body.studentId)
      .eq('academic_year_id', body.academicYearId)
      .maybeSingle();

    const recordPayload: Record<string, unknown> = {
      student_id:       body.studentId,
      academic_year_id: body.academicYearId,
      section_id:       sectionId,
      class_name:       body.className,
      section:          body.section,
      roll_no:          body.rollNo ?? null,
      status:           'STUDYING',
    };
    if (body.totalFee !== undefined) recordPayload.total_fee = body.totalFee;

    let record: any;
    if (existing) {
      const { data, error } = await adminDb
        .from('student_academic_records')
        .update(recordPayload)
        .eq('id', (existing as any).id)
        .select()
        .single();
      if (error) throw new ApiError(500, error.message);
      record = data;
    } else {
      const { data, error } = await adminDb
        .from('student_academic_records')
        .insert({ ...recordPayload, fee_status: 'PENDING', total_fee: body.totalFee ?? 0, paid_fee: 0, attendance_percent: 0 })
        .select()
        .single();
      if (error) throw new ApiError(500, error.message);
      record = data;
    }

    // Fee schedule generation (requires auth.uid() in the RPC)
    let installmentCount = 0;
    let totalAmount = 0;
    if (body.feeHeads?.length && body.dueDates?.length) {
      const db = userDb(req.jwt);
      const { error: feeErr } = await db.rpc('generate_student_fee_schedule', {
        p_student_id:      body.studentId,
        p_year_id:         body.academicYearId,
        p_heads:           body.feeHeads,
        p_due_dates:       body.dueDates,
        p_is_rte:          body.isRte ?? false,
        p_discount_amount: body.discountAmount ?? 0,
        p_discount_pct:    body.discountPct ?? 0,
      });
      if (feeErr) throw new ApiError(500, `Fee schedule failed: ${feeErr.message}`);

      // Read back for count + total
      const { data: installments } = await adminDb
        .from('fee_installments')
        .select('amount')
        .eq('student_id', body.studentId)
        .eq('academic_year_id', body.academicYearId);
      const rows = (installments ?? []) as { amount: number }[];
      installmentCount = rows.length;
      totalAmount = rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);
    }

    ok(res, { record, installmentCount, totalAmount });
  } catch (err) { fail(res, err); }
});

// POST /api/students/deactivate
studentsRouter.post('/deactivate', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const { studentId, reason } = requireBody<{ studentId: string; reason?: string }>(req, ['studentId']);

    const { error } = await adminDb
      .from('students')
      .update({ is_active: false, status: 'INACTIVE', updated_at: new Date().toISOString() })
      .eq('id', studentId)
      .eq('school_id', req.user.school_id!);
    if (error) throw new ApiError(500, error.message);

    ok(res, { studentId, deactivated: true, reason: reason ?? null });
  } catch (err) { fail(res, err); }
});

// POST /api/students/update-login-phone — change the parent's login mobile.
// Editor-mode + principal-only because the new number becomes the
// parent's auth identity. Updates the linked parent user's
// mobile_number AND the auth_users email so the parent can keep
// logging in. If the new number already belongs to another user
// (parent, principal, teacher), the call fails with 409.
studentsRouter.post('/update-login-phone', requireAuth, requireRole('PRINCIPAL'), requireEditorMode, async (req, res) => {
  try {
    const body = requireBody<{ studentId: string; newPhone: string }>(req, ['studentId', 'newPhone']);
    const newPhone = body.newPhone.replace(/\D/g, '').slice(-10);
    if (newPhone.length !== 10) {
      throw new ApiError(400, 'Login mobile must be a 10-digit number');
    }

    // Resolve the parent currently linked to this student in the
    // caller's school. If multiple links exist (siblings sharing a
    // parent), they all share the same parent_user_id so updating
    // once propagates everywhere — that's the intended behaviour.
    const { data: links } = await adminDb.from('parent_student_links')
      .select('parent_user_id, students!inner(school_id)')
      .eq('student_id', body.studentId);
    type Link = { parent_user_id: string; students: { school_id: string } | { school_id: string }[] };
    const linkRows = ((links ?? []) as unknown as Link[]).filter(l => {
      const s = Array.isArray(l.students) ? l.students[0] : l.students;
      return s?.school_id === req.user.school_id;
    });
    if (linkRows.length === 0) throw new ApiError(404, 'No parent account linked to this student');
    const parentUserId = linkRows[0].parent_user_id;

    // Reject if another user (parent / principal / teacher / etc) already
    // has the new number. The auth flow keys on mobile_number — collisions
    // would silently lock one of the two accounts out.
    const { data: clash } = await adminDb.from('users')
      .select('id, role').eq('mobile_number', newPhone).maybeSingle();
    if (clash && (clash as { id: string }).id !== parentUserId) {
      throw new ApiError(409, `Mobile ${newPhone} pehle se kisi aur user (${(clash as { role: string }).role}) ke saath linked hai.`);
    }

    // Update users + the auth row's email (which mirrors the mobile).
    // Order is auth → users (auth is the credential gate; if auth fails
    // we don't want users to point at a phone the parent can't log in
    // with). On users-update failure, revert the auth email so the
    // system stays consistent — otherwise auth would point at the new
    // mobile while users still says the old one, and the app profile
    // would display a stale mobile while the new mobile silently became
    // the login.
    const MOBILE_EMAIL_DOMAIN = '@edugrow.local';
    const newEmail = `${newPhone}${MOBILE_EMAIL_DOMAIN}`;

    const { data: priorUser } = await adminDb.from('users')
      .select('mobile_number').eq('id', parentUserId).single();
    const priorPhone = (priorUser as { mobile_number: string } | null)?.mobile_number;
    const priorEmail = priorPhone ? `${priorPhone}${MOBILE_EMAIL_DOMAIN}` : null;

    const { error: authErr } = await adminDb.auth.admin.updateUserById(parentUserId, {
      email: newEmail,
      user_metadata: { mobile_number: newPhone },
    });
    if (authErr) throw new ApiError(500, `Auth update failed: ${authErr.message}`);

    const { error: usrErr } = await adminDb.from('users')
      .update({ mobile_number: newPhone, updated_at: new Date().toISOString() })
      .eq('id', parentUserId);
    if (usrErr) {
      if (priorEmail && priorPhone) {
        try {
          await adminDb.auth.admin.updateUserById(parentUserId, {
            email: priorEmail,
            user_metadata: { mobile_number: priorPhone },
          });
        } catch (revertErr) {
          console.error('[update-login-phone] auth revert failed', revertErr);
        }
      }
      throw new ApiError(500, `User row update failed: ${usrErr.message}`);
    }

    // Audit log so the change is traceable later.
    await adminDb.from('audit_logs').insert({
      user_id: req.user.id, school_id: req.user.school_id,
      action: 'parent_login_phone_changed', entity_type: 'user', entity_id: parentUserId,
      details: { studentId: body.studentId, newPhone },
    });

    ok(res, { parentUserId, newPhone });
  } catch (err) { fail(res, err); }
});

// POST /api/students/update — patch non-critical fields on students + academic record
studentsRouter.post('/update', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const body = requireBody<{
      studentId: string;
      patch: Record<string, unknown>;
      academicYearPatch?: Record<string, unknown>;
      academicYearId?: string;
    }>(req, ['studentId', 'patch']);

    // Whitelist of columns a principal may update. Security-sensitive fields
    // (school_id, is_active, status, user_id, id) are intentionally excluded
    // — they have dedicated endpoints with stronger guards.
    const ALLOWED_STUDENT_FIELDS = new Set([
      'name', 'admission_no', 'roll_no', 'dob', 'gender', 'blood_group',
      'aadhaar_no', 'phone', 'email', 'address', 'photo',
      'father_name', 'father_phone', 'father_email', 'father_occupation', 'father_income',
      'mother_name', 'mother_phone', 'mother_occupation',
      'guardian_name', 'guardian_phone', 'guardian_relation',
      'religion', 'caste', 'pen_number', 'birth_cert_no', 'tc_number',
      'is_rte', 'admission_date',
    ]);
    const ALLOWED_AR_FIELDS = new Set([
      'roll_no', 'class_name', 'section', 'fee_status', 'total_fee', 'paid_fee',
      'attendance_percent', 'remarks',
    ]);

    const safePatch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body.patch)) {
      if (ALLOWED_STUDENT_FIELDS.has(k)) safePatch[k] = v;
    }
    const safeArPatch: Record<string, unknown> = {};
    if (body.academicYearPatch) {
      for (const [k, v] of Object.entries(body.academicYearPatch)) {
        if (ALLOWED_AR_FIELDS.has(k)) safeArPatch[k] = v;
      }
    }

    if (Object.keys(safePatch).length > 0) {
      const { error } = await adminDb.from('students')
        .update({ ...safePatch, updated_at: new Date().toISOString() })
        .eq('id', body.studentId)
        .eq('school_id', req.user.school_id!);
      if (error) throw new ApiError(500, error.message);
    }

    if (body.academicYearId && Object.keys(safeArPatch).length > 0) {
      await adminDb.from('student_academic_records')
        .update(safeArPatch)
        .eq('student_id', body.studentId)
        .eq('academic_year_id', body.academicYearId);
    }

    ok(res, { studentId: body.studentId });
  } catch (err) { fail(res, err); }
});

// POST /api/students/change-request — submit_change_request RPC
studentsRouter.post('/change-request', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const body = requireBody<{
      studentId: string; field: string; newValue: string; reason: string; proofUrl?: string;
    }>(req, ['studentId', 'field', 'newValue', 'reason']);

    const db = userDb(req.jwt);
    const { error } = await db.rpc('submit_change_request', {
      p_student_id: body.studentId,
      p_field:      body.field,
      p_new_value:  body.newValue,
      p_reason:     body.reason,
      p_proof:      body.proofUrl ?? null,
    });
    if (error) throw new ApiError(500, error.message);

    ok(res, { studentId: body.studentId, field: body.field });
  } catch (err) { fail(res, err); }
});

// POST /api/students/class-movement — record_class_movement RPC
studentsRouter.post('/class-movement', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const body = requireBody<{
      studentId: string; academicYearId: string;
      newClass: string; newSection: string;
      effectiveDate: string; reason: string;
    }>(req, ['studentId', 'academicYearId', 'newClass', 'newSection', 'effectiveDate', 'reason']);

    const db = userDb(req.jwt);
    const { error } = await db.rpc('record_class_movement', {
      p_student_id:     body.studentId,
      p_year_id:        body.academicYearId,
      p_new_class:      body.newClass,
      p_new_section:    body.newSection,
      p_effective_date: body.effectiveDate,
      p_reason:         body.reason,
    });
    if (error) throw new ApiError(500, error.message);

    ok(res, { studentId: body.studentId });
  } catch (err) { fail(res, err); }
});

// POST /api/students/fail — mark student failed in active year
studentsRouter.post('/fail', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const body = requireBody<{ studentId: string; academicYearId: string; reason?: string }>(
      req, ['studentId', 'academicYearId'],
    );

    // Verify student belongs to caller's school before mutating AR.
    const { data: stu } = await adminDb
      .from('students').select('id')
      .eq('id', body.studentId).eq('school_id', req.user.school_id!).maybeSingle();
    if (!stu) throw new ApiError(404, 'Student not found');

    const { error } = await adminDb.from('student_academic_records')
      .update({ status: 'FAILED' })
      .eq('student_id', body.studentId)
      .eq('academic_year_id', body.academicYearId);
    if (error) throw new ApiError(500, error.message);

    ok(res, { studentId: body.studentId });
  } catch (err) { fail(res, err); }
});

// POST /api/students/issue-tc — issue Transfer Certificate
// When TC marks the parent's LAST active kid in this school as inactive, the
// parent's user account is also deactivated so they can no longer log in
// here. The next school's admission flow will auto-reactivate the account
// when transferring it. (See `/create` parent-handling block.)
studentsRouter.post('/issue-tc', issueTcLimiter, requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    // tcNumber now optional — when omitted the SQL RPC generates a
    // school-scoped sequential TC-{year}-{NNN}. Caller can still pass
    // a custom number if the school keeps an off-app numbering system.
    const body = requireBody<{ studentId: string; tcNumber?: string; reason?: string }>(
      req, ['studentId'],
    );
    const schoolId = req.user.school_id!;

    // Delegate to issue_tc_and_leave RPC — it enforces Editor Mode,
    // generates the TC number, deactivates the student, and writes a
    // student_change_history row in one transaction.
    const db = userDb(req.jwt);
    const { data: tcNumber, error } = await db.rpc('issue_tc_and_leave', {
      p_student_id: body.studentId,
      p_reason:     body.reason ?? null,
    });
    if (error) throw new ApiError(400, error.message);

    // If caller passed an explicit override (legacy path), patch the
    // student row with the supplied number after the RPC's auto-gen.
    if (body.tcNumber?.trim()) {
      await adminDb.from('students').update({ tc_number: body.tcNumber.trim() })
        .eq('id', body.studentId).eq('school_id', schoolId);
    }

    // Parent deactivation cascade. We find the parent linked to this student
    // (if any) and check whether they have any OTHER active kids in this
    // same school. If not, we deactivate their user row — this severs login
    // access to this school cleanly. Best-effort: failures here don't block
    // the TC issue (the student row is already marked inactive).
    try {
      const { data: links } = await adminDb
        .from('parent_student_links')
        .select('parent_user_id')
        .eq('student_id', body.studentId);
      const parentIds = Array.from(new Set(((links ?? []) as { parent_user_id: string }[]).map(r => r.parent_user_id)));

      for (const pid of parentIds) {
        // All students this parent is linked to in this school.
        const { data: theirLinks } = await adminDb
          .from('parent_student_links')
          .select('student_id')
          .eq('parent_user_id', pid);
        const theirStudentIds = ((theirLinks ?? []) as { student_id: string }[]).map(r => r.student_id);
        if (!theirStudentIds.length) continue;

        const { count: activeHere } = await adminDb
          .from('students')
          .select('id', { count: 'exact', head: true })
          .in('id', theirStudentIds)
          .eq('school_id', schoolId)
          .eq('is_active', true);

        if ((activeHere ?? 0) === 0) {
          // Parent has no more active kids in this school — block their login.
          await adminDb.from('users')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('id', pid)
            .eq('school_id', schoolId)
            .eq('role', 'PARENT');
        }
      }
    } catch (e) {
      console.warn('[issue-tc] parent deactivation cascade failed:', (e as Error).message);
    }

    const finalTc = body.tcNumber?.trim() || (tcNumber as string);
    ok(res, { studentId: body.studentId, tcNumber: finalTc });
  } catch (err) { fail(res, err); }
});

// POST /api/students/readmit — re-activate a previously deactivated student
// and create their student_academic_records row for the active year.
// Editor Mode enforced server-side via the rejoin_student RPC.
studentsRouter.post('/readmit', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const { studentId, className, section, rollNo } = requireBody<{
      studentId: string; className: string; section?: string; rollNo?: string;
    }>(req, ['studentId', 'className']);

    // Cross-school safety: if THIS student's parent has any OTHER
    // student currently active anywhere else, reactivation here would
    // re-create the "same parent active in two schools" state we
    // explicitly forbid at admission time. Block with generic message.
    // The student's own student_id can't be flagged twice (we're about
    // to flip it ourselves), so we exclude it from the count.
    const { data: stuRow } = await adminDb
      .from('students').select('id, school_id, is_active, user_id')
      .eq('id', studentId).maybeSingle();
    if (!stuRow) throw new ApiError(404, 'Student not found');
    const stu = stuRow as { id: string; school_id: string; is_active: boolean; user_id: string | null };
    if (stu.school_id !== req.user.school_id) {
      throw new ApiError(403, 'Cross-school readmit not allowed');
    }
    if (stu.user_id) {
      // Find the parent user(s) linked to this student and check whether
      // they're tied to any OTHER active student in another school.
      const { data: links } = await adminDb
        .from('parent_student_links')
        .select('parent_user_id')
        .eq('student_id', studentId);
      const parentIds = ((links ?? []) as { parent_user_id: string }[]).map(l => l.parent_user_id);
      if (parentIds.length) {
        const { data: siblings } = await adminDb
          .from('parent_student_links')
          .select('student_id')
          .in('parent_user_id', parentIds);
        const siblingIds = ((siblings ?? []) as { student_id: string }[])
          .map(s => s.student_id).filter(id => id !== studentId);
        if (siblingIds.length) {
          const { count } = await adminDb
            .from('students')
            .select('id', { count: 'exact', head: true })
            .in('id', siblingIds)
            .neq('school_id', req.user.school_id!)
            .eq('is_active', true);
          if ((count ?? 0) > 0) {
            throw new ApiError(409,
              'Yeh student rejoin nahi ho sakta — same parent ke saath koi aur ' +
              'student abhi bhi kisi aur school me active hai. Pehle un sabka ' +
              'TC karwana hoga, ya alag mobile number use karein.',
            );
          }
        }
      }
    }

    const db = userDb(req.jwt);
    const { error } = await db.rpc('rejoin_student', {
      p_student_id: studentId,
      p_class_name: className,
      p_section:    section ?? '',
      p_roll_no:    rollNo ?? null,
    });
    if (error) throw new ApiError(400, error.message);

    // Parent reactivation — mirror of the /issue-tc deactivation cascade.
    // When the last active kid got a TC, that flow set users.is_active=false
    // on the parent so they couldn't log in any more. Re-admitting the kid
    // without flipping the parent back on leaves the parent locked out.
    // Best-effort: failures here don't roll back the student rejoin (the
    // student's record is already restored).
    try {
      const { data: links } = await adminDb
        .from('parent_student_links')
        .select('parent_user_id')
        .eq('student_id', studentId);
      const parentIds = Array.from(new Set(
        ((links ?? []) as { parent_user_id: string }[]).map(r => r.parent_user_id),
      ));
      if (parentIds.length) {
        await adminDb.from('users')
          .update({ is_active: true, updated_at: new Date().toISOString() })
          .in('id', parentIds)
          .eq('school_id', req.user.school_id!)
          .eq('role', 'PARENT');
      }
    } catch (e) {
      console.warn('[readmit] parent reactivation failed:', (e as Error).message);
    }

    ok(res, { studentId });
  } catch (err) { fail(res, err); }
});

// POST /api/students/document/add — insert student_documents row
studentsRouter.post('/document/add', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const body = requireBody<{
      studentId: string; docType: string; docUrl: string;
    }>(req, ['studentId', 'docType', 'docUrl']);

    // Reject non-HTTPS URLs and anything not pointing at our own Supabase
    // storage bucket. The earlier check only validated the scheme, so a
    // principal (or compromised token) could register
    // `https://attacker.tld/100GB.bin` as a student document — readers
    // would download it; or cross-tenant reference another school's
    // private file by URL. Pin the host to the configured SUPABASE_URL.
    let parsedUrl: URL;
    try { parsedUrl = new URL(body.docUrl); } catch {
      throw new ApiError(400, 'docUrl must be a valid URL');
    }
    if (parsedUrl.protocol !== 'https:') {
      throw new ApiError(400, 'docUrl must use the https:// protocol');
    }
    const supabaseHost = (() => {
      try { return new URL(process.env.SUPABASE_URL ?? '').host; }
      catch { return ''; }
    })();
    if (!supabaseHost || parsedUrl.host !== supabaseHost) {
      throw new ApiError(400, 'docUrl must point to this project\'s storage bucket');
    }
    if (!parsedUrl.pathname.startsWith('/storage/v1/object/')) {
      throw new ApiError(400, 'docUrl must be a storage object URL');
    }

    // Verify student belongs to this school
    const { data: st } = await adminDb
      .from('students').select('id')
      .eq('id', body.studentId).eq('school_id', req.user.school_id!).maybeSingle();
    if (!st) throw new ApiError(404, 'Student not found');

    const { data, error } = await adminDb.from('student_documents').insert({
      student_id: body.studentId,
      doc_type:   body.docType,
      doc_url:    body.docUrl,
    }).select('id, doc_type, doc_url, uploaded_at').single();
    if (error) throw new ApiError(500, error.message);

    ok(res, data, 201);
  } catch (err) { fail(res, err); }
});

// POST /api/students/admission-eligibility — pre-check for the
// admission form. Lets the UI show inline validation BEFORE the
// principal fills the full form. Returns only { eligible: boolean }
// — never the blocking school / student / count, to prevent
// cross-school information disclosure via mobile enumeration.
studentsRouter.post('/admission-eligibility', requireAuth, requireRole('PRINCIPAL'), eligibilityLimiter, async (req, res) => {
  try {
    const { mobile } = requireBody<{ mobile: string }>(req, ['mobile']);
    const phone = String(mobile ?? '').replace(/\D/g, '').slice(-10);
    if (phone.length !== 10) {
      ok(res, { eligible: true }); // can't check — let the form proceed
      return;
    }

    const schoolId = req.user.school_id!;
    const { data: existing } = await adminDb
      .from('users').select('id, school_id, role')
      .eq('mobile_number', phone).maybeSingle();

    if (!existing) { ok(res, { eligible: true }); return; }
    const ex = existing as { id: string; school_id: string | null; role: string };

    // Non-parent role with this mobile → not eligible (principal/teacher)
    if (ex.role !== 'PARENT') { ok(res, { eligible: false }); return; }

    // Same school → always fine (sibling case at the same campus)
    if (ex.school_id === schoolId) { ok(res, { eligible: true }); return; }

    // Different school → eligible iff none of the linked students
    // are active in that other school.
    const { data: links } = await adminDb
      .from('parent_student_links')
      .select('student_id')
      .eq('parent_user_id', ex.id);
    const linkedIds = ((links ?? []) as { student_id: string }[]).map(r => r.student_id);
    if (!linkedIds.length) { ok(res, { eligible: true }); return; }

    const { count } = await adminDb
      .from('students')
      .select('id', { count: 'exact', head: true })
      .in('id', linkedIds)
      .eq('is_active', true);
    ok(res, { eligible: (count ?? 0) === 0 });
  } catch (err) { fail(res, err); }
});

// POST /api/students/create — full admission flow
// Replicates upsertSchoolUser + linkParentStudent logic (from vite-plugins/admin-api.ts)
// entirely server-side so no business logic stays in the browser.
studentsRouter.post('/create', requireAuth, requireRole('PRINCIPAL'), studentCreateLimiter, async (req, res) => {
  try {
    const body = requireBody<{
      name: string;
      admissionNo?: string; rollNo?: string; dob?: string; gender?: string;
      bloodGroup?: string; aadhaarNo?: string; phone?: string; email?: string;
      address?: string; photo?: string; rte?: boolean;
      fatherName?: string; fatherPhone?: string; fatherEmail?: string;
      fatherOccupation?: string; fatherIncome?: number;
      motherName?: string; motherPhone?: string; motherOccupation?: string;
      guardianName?: string; guardianPhone?: string; guardianRelation?: string;
      // Mobile the parent will log in with. Independent of
      // fatherPhone / motherPhone (which are contact info on the
      // record). Defaults to fatherPhone when not supplied so older
      // clients keep working. Drives the users.mobile_number row
      // that the auth flow looks up.
      loginPhone?: string;
      religion?: string; caste?: string; penNumber?: string;
      birthCertNo?: string; tcNumber?: string; admissionDate?: string;
      className?: string; section?: string; academicYearId?: string; totalFee?: number;
    }>(req, ['name']);

    const schoolId = req.user.school_id!;

    // ── Duplicate checks ──────────────────────────────────────────────────────
    const aadhaar = (body.aadhaarNo ?? '').replace(/\s+/g, '');
    if (aadhaar) {
      const { data: dups, error: dupErr } = await adminDb
        .from('students').select('id, name').eq('school_id', schoolId).eq('aadhaar_no', aadhaar).limit(1);
      if (dupErr) throw new ApiError(500, `Aadhaar duplicate-check failed: ${dupErr.message}`);
      const dup = (dups ?? [])[0] as { name: string } | undefined;
      if (dup) throw new ApiError(409, `Aadhaar already registered: ${dup.name}`);
    }
    const fatherPhone = (body.fatherPhone ?? '').replace(/\D/g, '').slice(-10);
    // NOTE: We intentionally do NOT block siblings from sharing
    // father_phone here. Many real families have one mobile and
    // multiple kids in the same school — that's a legit use case.
    // Login-level uniqueness still holds: the parent-account block
    // below (~line 580) detects an existing users.mobile_number
    // and REUSES the parent user, then parent_student_links.upsert
    // links the new student to that same parent so the parent
    // picker on login shows both kids. The "one mobile = one
    // student" rule was the wrong invariant; the right invariant
    // is "one mobile = one parent user" which is enforced where
    // it matters (auth).

    // ── Provision parent auth account (upsertSchoolUser pattern) ─────────────
    const MOBILE_EMAIL_DOMAIN = '@edugrow.local';
    // The login phone — explicit body field with father's phone as
    // a sensible default (matches the historic behaviour). All the
    // user-row provisioning below keys on this number, NOT on
    // father/mother/guardian phones (those stay as contact info).
    const loginPhoneRaw = (body.loginPhone ?? body.fatherPhone ?? '').replace(/\D/g, '').slice(-10);
    const loginPhone = loginPhoneRaw;
    let parentUserId: string | null = null;
    let parentReused: boolean | null = null;
    if (loginPhone) {
      // Check if user already exists in public.users — even inactive ones,
      // because a TC-deactivated parent should be reactivated on transfer.
      const { data: existing } = await adminDb
        .from('users').select('id, school_id, role, is_active')
        .eq('mobile_number', loginPhone).maybeSingle();
      if (existing) {
        const ex = existing as { id: string; school_id: string | null; role: string; is_active: boolean };
        if (ex.role !== 'PARENT') {
          throw new ApiError(409, `mobile ${loginPhone} already registered as ${ex.role}`);
        }
        if (ex.school_id && ex.school_id !== schoolId) {
          // The parent has an account at a different school. Two cases:
          //   1. They still have ACTIVE kids in that school → reject.
          //      Principal must wait for the other school to issue TC first.
          //   2. All their kids in the old school are inactive (TC issued
          //      / left) → silently transfer the account to this school.
          //      Same mobile + same password keep working; the parent now
          //      sees this school's data via RLS (school_id is the only
          //      tenant scope they have).
          const { data: parentLinks } = await adminDb
            .from('parent_student_links')
            .select('student_id')
            .eq('parent_user_id', ex.id);
          const linkedIds = ((parentLinks ?? []) as { student_id: string }[]).map(r => r.student_id);

          let activeElsewhere = 0;
          if (linkedIds.length) {
            const { count } = await adminDb
              .from('students')
              .select('id', { count: 'exact', head: true })
              .in('id', linkedIds)
              .eq('school_id', ex.school_id)
              .eq('is_active', true);
            activeElsewhere = count ?? 0;
          }
          if (activeElsewhere > 0) {
            // Privacy-preserving generic message: do NOT reveal the
            // other school's name, student name, or count. Principal of
            // the new school doesn't need that info — the parent knows
            // where their child is studying and can resolve it. Hiding
            // it also prevents random-mobile harvesting (a malicious
            // principal could enumerate which mobiles belong to active
            // students at competitor schools).
            throw new ApiError(409,
              'Yeh mobile number kisi active student se linked hai. ' +
              'Parent ko pehle apni current school se TC karwana hoga, ' +
              'ya admission alag mobile number pe karein.',
            );
          }

          // Transfer the parent's user row to this school. is_active is
          // flipped back on too — TC at the previous school may have
          // deactivated the account; admission here restores login access.
          const { error: xferErr } = await adminDb.from('users')
            .update({
              school_id:  schoolId,
              name:       body.fatherName || ex.role, // keep latest contact name
              is_active:  true,
              updated_at: new Date().toISOString(),
            })
            .eq('id', ex.id);
          if (xferErr) throw new ApiError(500, `Account transfer failed: ${xferErr.message}`);

          // Drop dangling links to the old school's (now-inactive) kids.
          // RLS would have hidden them anyway, but a clean break is simpler
          // to reason about and avoids accidental cross-school references
          // in future audits.
          if (linkedIds.length) {
            await adminDb.from('parent_student_links').delete().eq('parent_user_id', ex.id);
          }

          parentUserId = ex.id;
          parentReused = true;
        } else {
          // Same school: regular reuse. If they were deactivated by a prior
          // TC (last kid had left, then re-admitted) bring them back online.
          if (!ex.is_active) {
            await adminDb.from('users')
              .update({ is_active: true, updated_at: new Date().toISOString() })
              .eq('id', ex.id);
          }
          parentUserId = ex.id;
          parentReused = true;
        }
      } else {
        const parentEmail = `${loginPhone}${MOBILE_EMAIL_DOMAIN}`;
        const parentName = body.fatherName || body.motherName || body.guardianName || 'Parent';
        const created = await adminDb.auth.admin.createUser({
          email: parentEmail, password: loginPhone, email_confirm: true,
          user_metadata: { mobile_number: loginPhone, name: parentName, role: 'PARENT' },
        });
        let authUserId: string;
        let createdNew = false;
        if (created.error) {
          // Auth user might already exist — look up directly via indexed query
          const { data: found } = await adminDb.rpc('get_auth_user_id_by_email', { p_email: parentEmail });
          if (!found) throw new ApiError(500, created.error.message);
          authUserId = found as string;
        } else {
          authUserId = created.data.user.id;
          createdNew = true;
        }
        const { error: insErr } = await adminDb.from('users').insert({
          id: authUserId, mobile_number: loginPhone, role: 'PARENT',
          name: parentName, email: body.fatherEmail ?? null,
          school_id: schoolId, first_login_changed: false, is_active: true,
        });
        if (insErr) {
          if (createdNew) {
            try { await adminDb.auth.admin.deleteUser(authUserId); } catch { /* ignore */ }
          }
          throw new ApiError(500, insErr.message);
        }
        parentUserId = authUserId;
        parentReused = false;
      }
    }

    // ── Insert student row ────────────────────────────────────────────────────
    const STU_FIELDS =
      'id, school_id, user_id, name, admission_no, roll_no, dob, gender, blood_group, ' +
      'aadhaar_no, phone, email, address, photo, ' +
      'father_name, father_phone, father_email, father_occupation, father_income, ' +
      'mother_name, mother_phone, mother_occupation, ' +
      'guardian_name, guardian_phone, guardian_relation, ' +
      'religion, caste, pen_number, birth_cert_no, tc_number, ' +
      'is_rte, is_active, status, admission_date, created_at';
    // Pre-check the admission_no UNIQUE constraint so we can surface a
    // friendly "Admission #XYZ already exists" error before any auth /
    // user / student rollback dance. The DB still has the UNIQUE backstop
    // — this just avoids the raw "duplicate key value violates unique
    // constraint students_admission_no_key" message bubbling to the toast.
    {
      const { data: dup } = await adminDb.from('students')
        .select('id, school_id').eq('admission_no', body.admissionNo).maybeSingle();
      if (dup) {
        const dupRow = dup as { id: string; school_id: string };
        const inThisSchool = dupRow.school_id === schoolId;
        // Same compensation as below: if we just created a new parent
        // purely for this student, roll it back.
        if (parentUserId && !parentReused) {
          try {
            await adminDb.from('users').delete().eq('id', parentUserId);
            await adminDb.auth.admin.deleteUser(parentUserId);
          } catch (cleanupErr) {
            console.error('[students.create] parent rollback after admission_no clash failed', cleanupErr);
          }
        }
        throw new ApiError(409,
          inThisSchool
            ? `Admission #${body.admissionNo} already exists in this school. Use a different admission number.`
            : `Admission #${body.admissionNo} is already in use. Use a different admission number.`,
        );
      }
    }

    const { data: stuRow, error: stuErr } = await adminDb.from('students').insert({
      school_id: schoolId, user_id: null,
      name: body.name, admission_no: body.admissionNo,
      roll_no: body.rollNo || null, dob: body.dob || null,
      gender: body.gender, blood_group: body.bloodGroup,
      aadhaar_no: aadhaar || null, phone: body.phone || null,
      email: body.email || null, address: body.address || null,
      photo: body.photo || null,
      father_name: body.fatherName || null, father_phone: fatherPhone || null,
      father_email: body.fatherEmail || null, father_occupation: body.fatherOccupation || null,
      father_income: body.fatherIncome || null,
      mother_name: body.motherName || null, mother_phone: body.motherPhone || null,
      mother_occupation: body.motherOccupation || null,
      guardian_name: body.guardianName || null, guardian_phone: body.guardianPhone || null,
      guardian_relation: body.guardianRelation || null,
      religion: body.religion || null, caste: body.caste || null,
      pen_number: body.penNumber || null, birth_cert_no: body.birthCertNo || null,
      tc_number: body.tcNumber || null,
      is_rte: !!body.rte, is_active: true, status: 'ACTIVE',
      admission_date: body.admissionDate || new Date().toISOString().slice(0, 10),
    }).select(STU_FIELDS).single();
    if (stuErr) {
      // Compensation: if we just created a new parent account purely
      // for this student, roll it back so a failed admission doesn't
      // leave an orphan parent login that nobody owns. Reused parents
      // (existing user we attached to a sibling) stay untouched.
      if (parentUserId && !parentReused) {
        try {
          await adminDb.from('users').delete().eq('id', parentUserId);
          await adminDb.auth.admin.deleteUser(parentUserId);
        } catch (cleanupErr) {
          console.error('[students.create] parent rollback after student insert failed', cleanupErr);
        }
      }
      // The pre-check above usually catches the duplicate before we get
      // here, but a race (two principals admitting in parallel) can still
      // hit the UNIQUE constraint. Translate the raw error so the toast
      // is readable.
      if (/duplicate key|unique constraint/i.test(stuErr.message) && /admission_no/i.test(stuErr.message)) {
        throw new ApiError(409, `Admission #${body.admissionNo} was just used by someone else. Try a different admission number.`);
      }
      throw new ApiError(500, stuErr.message);
    }
    const stu = stuRow as any;

    // ── Link parent → student (linkParentStudent pattern) ─────────────────────
    // No silent swallow here — earlier this was wrapped in `try { … } catch {}`
    // which produced orphans (parent + student rows exist but the link is
    // missing → parent never sees the kid in the picker). If the upsert fails
    // surface it so the principal can retry / contact support.
    let linkWarning: string | null = null;
    if (parentUserId) {
      const { error: linkErr } = await adminDb.from('parent_student_links').upsert({
        parent_user_id: parentUserId, student_id: stu.id, relation: 'FATHER',
      }, { onConflict: 'parent_user_id,student_id' });
      if (linkErr) {
        // The student / parent rows are already committed — rolling back here
        // would mean re-deleting them, which has its own failure modes. Stay
        // conservative: keep the rows, return a clear warning so the principal
        // knows to relink (the /students/:id page already exposes a manual
        // parent link control).
        linkWarning = `Parent link could not be created: ${linkErr.message}. Open the student page and link the parent manually.`;
        console.error('[students.create] parent_student_links upsert failed', linkErr);
      }
    }

    // ── Insert academic record (if class+section provided) ─────────────────────
    let ar: Record<string, unknown> | null = null;
    const ayId = body.academicYearId;
    if (ayId && body.className && body.section) {
      const { data: sec } = await adminDb.from('sections').select('id')
        .eq('school_id', schoolId).eq('academic_year_id', ayId)
        .eq('class_name', body.className).eq('section', body.section).maybeSingle();
      const sectionId = (sec as { id: string } | null)?.id ?? null;
      const { data: arRow, error: arErr } = await adminDb.from('student_academic_records').insert({
        student_id: stu.id, academic_year_id: ayId, section_id: sectionId,
        class_name: body.className, section: body.section,
        roll_no: body.rollNo || null, fee_status: 'PENDING',
        total_fee: body.totalFee || 0, paid_fee: 0,
        attendance_percent: 0, status: 'STUDYING',
      }).select('id, student_id, academic_year_id, class_name, section, roll_no, fee_status, total_fee, paid_fee, attendance_percent, status').single();
      if (arErr) throw new ApiError(500, arErr.message);
      ar = arRow as Record<string, unknown>;
    }

    ok(res, {
      studentRow: stu,
      academicRecordRow: ar,
      parent: loginPhone && parentReused !== null ? { mobile: loginPhone, reused: parentReused } : null,
      linkWarning,
    }, 201);
  } catch (err) { fail(res, err); }
});

// POST /api/students/document/remove — delete student_documents row.
// Editor Mode required: this is a destructive operation that wipes audit-relevant
// uploads (TC, Aadhaar, marksheet). Server checks the 30-min window via
// requireEditorMode rather than trusting any client flag.
studentsRouter.post('/document/remove', requireAuth, requireRole('PRINCIPAL'), requireEditorMode, async (req, res) => {
  try {
    const { documentId } = requireBody<{ documentId: string }>(req, ['documentId']);

    const { data: row } = await adminDb
      .from('student_documents')
      .select('id, doc_url, student_id, students!inner(school_id)')
      .eq('id', documentId).maybeSingle();
    if (!row) throw new ApiError(404, 'Document not found');
    if ((row as any).students?.school_id !== req.user.school_id) throw new ApiError(403, 'Access denied');

    const { error } = await adminDb.from('student_documents').delete().eq('id', documentId);
    if (error) throw new ApiError(500, error.message);

    ok(res, { documentId, docUrl: (row as any).doc_url });
  } catch (err) { fail(res, err); }
});
