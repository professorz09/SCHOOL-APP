import { Router } from 'express';
import { adminDb, userDb } from '../lib/db';
import { ok, fail, ApiError, requireBody } from '../lib/helpers';
import { requireAuth, requireRole } from '../middleware/auth';

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

// POST /api/students/create
studentsRouter.post('/create', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const body = requireBody<{
      name: string; admissionNo: string; dob?: string;
      fatherName?: string; phone?: string; motherName?: string;
      address?: string; gender?: string; isRte?: boolean;
      admissionDate?: string; rollNo?: string; bloodGroup?: string;
      aadhaarNo?: string; fatherPhone?: string; religion?: string;
      caste?: string;
    }>(req, ['name', 'admissionNo']);

    // Duplicate admission_no check
    const { data: dup } = await adminDb
      .from('students')
      .select('id, name')
      .eq('admission_no', body.admissionNo)
      .maybeSingle();
    if (dup) throw new ApiError(409, `Admission no already exists: ${(dup as any).name}`);

    const { data: student, error: se } = await adminDb
      .from('students')
      .insert({
        school_id:    req.user.school_id,
        name:         body.name,
        admission_no: body.admissionNo,
        dob:          body.dob ?? null,
        father_name:  body.fatherName ?? null,
        phone:        body.phone ?? null,
        mother_name:  body.motherName ?? null,
        address:      body.address ?? null,
        gender:       body.gender ?? null,
        is_rte:       body.isRte ?? false,
        admission_date: body.admissionDate ?? new Date().toISOString().slice(0, 10),
        roll_no:      body.rollNo ?? null,
        blood_group:  body.bloodGroup ?? null,
        aadhaar_no:   body.aadhaarNo ?? null,
        father_phone: body.fatherPhone ?? null,
        religion:     body.religion ?? null,
        caste:        body.caste ?? null,
        is_active:    true,
        status:       'ACTIVE',
      })
      .select()
      .single();
    if (se) throw new ApiError(500, se.message);

    ok(res, student, 201);
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
