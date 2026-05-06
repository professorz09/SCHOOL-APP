import { Router } from 'express';
import { adminDb, userDb } from '../lib/db';
import { ok, fail, ApiError, requireBody } from '../lib/helpers';
import { requireAuth, requireRole, requireEditorMode } from '../middleware/auth';

export const studentsRouter = Router();

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

    const { data, error } = await q.order('class_name').order('roll_no');
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
        .select('id, class_name, section, roll_no, total_fee, status, created_at, academic_year_id, academic_years!inner(name, start_date, school_id)')
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
    const { data, error } = await adminDb
      .from('student_academic_records')
      .select(`
        id, class_name, section, roll_no, status, fee_status,
        total_fee, paid_fee, academic_year_id,
        academic_years!inner(id, name, start_date, end_date, school_id)
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

// POST /api/students/update — patch non-critical fields on students + academic record
studentsRouter.post('/update', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const body = requireBody<{
      studentId: string;
      patch: Record<string, unknown>;
      academicYearPatch?: Record<string, unknown>;
      academicYearId?: string;
    }>(req, ['studentId', 'patch']);

    if (Object.keys(body.patch).length > 0) {
      const { error } = await adminDb.from('students')
        .update({ ...body.patch, updated_at: new Date().toISOString() })
        .eq('id', body.studentId)
        .eq('school_id', req.user.school_id!);
      if (error) throw new ApiError(500, error.message);
    }

    if (body.academicYearPatch && body.academicYearId && Object.keys(body.academicYearPatch).length > 0) {
      await adminDb.from('student_academic_records')
        .update(body.academicYearPatch)
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
studentsRouter.post('/issue-tc', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const body = requireBody<{ studentId: string; tcNumber: string; reason?: string }>(
      req, ['studentId', 'tcNumber'],
    );
    if (!body.tcNumber.trim()) throw new ApiError(400, 'TC number required');
    const schoolId = req.user.school_id!;

    const { error } = await adminDb.from('students').update({
      is_active: false,
      status:    'TC_ISSUED',
      tc_number: body.tcNumber.trim(),
      updated_at: new Date().toISOString(),
    }).eq('id', body.studentId).eq('school_id', schoolId);
    if (error) throw new ApiError(500, error.message);

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

    ok(res, { studentId: body.studentId, tcNumber: body.tcNumber.trim() });
  } catch (err) { fail(res, err); }
});

// POST /api/students/readmit — re-activate a previously deactivated student
studentsRouter.post('/readmit', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const { studentId } = requireBody<{ studentId: string }>(req, ['studentId']);

    const { error } = await adminDb.from('students').update({
      is_active: true,
      status:    'ACTIVE',
      updated_at: new Date().toISOString(),
    }).eq('id', studentId).eq('school_id', req.user.school_id!);
    if (error) throw new ApiError(500, error.message);

    ok(res, { studentId });
  } catch (err) { fail(res, err); }
});

// POST /api/students/document/add — insert student_documents row
studentsRouter.post('/document/add', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const body = requireBody<{
      studentId: string; docType: string; docUrl: string;
    }>(req, ['studentId', 'docType', 'docUrl']);

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

// POST /api/students/create — full admission flow
// Replicates upsertSchoolUser + linkParentStudent logic (from vite-plugins/admin-api.ts)
// entirely server-side so no business logic stays in the browser.
studentsRouter.post('/create', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
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
    if (fatherPhone) {
      const { data: dups, error: dupErr } = await adminDb
        .from('students').select('id, name').eq('school_id', schoolId).eq('father_phone', fatherPhone).limit(1);
      if (dupErr) throw new ApiError(500, `Father-phone duplicate-check failed: ${dupErr.message}`);
      const dup = (dups ?? [])[0] as { name: string } | undefined;
      if (dup) throw new ApiError(409, `Father phone already registered: ${dup.name}`);
    }

    // ── Provision parent auth account (upsertSchoolUser pattern) ─────────────
    const MOBILE_EMAIL_DOMAIN = '@edugrow.local';
    let parentUserId: string | null = null;
    let parentReused: boolean | null = null;
    if (fatherPhone) {
      // Check if user already exists in public.users — even inactive ones,
      // because a TC-deactivated parent should be reactivated on transfer.
      const { data: existing } = await adminDb
        .from('users').select('id, school_id, role, is_active')
        .eq('mobile_number', fatherPhone).maybeSingle();
      if (existing) {
        const ex = existing as { id: string; school_id: string | null; role: string; is_active: boolean };
        if (ex.role !== 'PARENT') {
          throw new ApiError(409, `mobile ${fatherPhone} already registered as ${ex.role}`);
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
            throw new ApiError(409,
              `Parent ${fatherPhone} has ${activeElsewhere} active student${activeElsewhere === 1 ? '' : 's'} in another school. ` +
              `Issue TC for those students first; the account will then transfer here.`,
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
        const parentEmail = `${fatherPhone}${MOBILE_EMAIL_DOMAIN}`;
        const parentName = body.fatherName || 'Parent';
        const created = await adminDb.auth.admin.createUser({
          email: parentEmail, password: fatherPhone, email_confirm: true,
          user_metadata: { mobile_number: fatherPhone, name: parentName, role: 'PARENT' },
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
          id: authUserId, mobile_number: fatherPhone, role: 'PARENT',
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
    if (stuErr) throw new ApiError(500, stuErr.message);
    const stu = stuRow as any;

    // ── Link parent → student (linkParentStudent pattern) ─────────────────────
    if (parentUserId) {
      try {
        await adminDb.from('parent_student_links').upsert({
          parent_user_id: parentUserId, student_id: stu.id, relation: 'FATHER',
        }, { onConflict: 'parent_user_id,student_id' });
      } catch { /* best-effort */ }
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
      parent: fatherPhone && parentReused !== null ? { mobile: fatherPhone, reused: parentReused } : null,
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
