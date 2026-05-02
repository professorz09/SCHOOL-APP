// Supabase-backed student service. Admission flow:
//   1. Duplicate check (Aadhaar / father+mother phone)
//   2. Insert permanent students row
//   3. Insert per-year student_academic_records row
//   4. Provision parent Auth user (admin-api) using father phone
//   5. Link parent ↔ student via parent_student_links
//
// Critical-field edits (name / dob / aadhaar) go through submit_change_request
// RPC and are NOT applied directly. Mid-year class/section change goes through
// record_class_movement RPC.

import { supabase } from '@/shared/lib/supabase';
import { useAuthStore } from '@/shared/store/authStore';
import { useEditingYearStore } from '@/shared/store/editingYearStore';
import { adminApi } from '@/shared/lib/adminApi';
import { logAudit } from '@/shared/lib/audit';
import { PaymentStatus } from '@/shared/config/constants';
import type {
  Student, StudentAcademicRecord, FeeRecord, CreateStudentInput,
  StudentDoc, ExamResult, AttendanceMonth,
} from '@/shared/types/principal.types';

function getSchoolId(): string {
  const id = useAuthStore.getState().session?.schoolId;
  if (!id) throw new Error('No school in session');
  return id;
}

// Back-compat export: yearClosing.service.ts still imports MOCK_STUDENTS
// from this module. Empty array — yearClosing has its own load path.
export const MOCK_STUDENTS: Student[] = [];

const STU_FIELDS =
  'id, school_id, user_id, name, admission_no, roll_no, dob, gender, blood_group, ' +
  'aadhaar_no, phone, email, address, photo, ' +
  'father_name, father_phone, father_email, father_occupation, father_income, ' +
  'mother_name, mother_phone, mother_occupation, ' +
  'guardian_name, guardian_phone, guardian_relation, ' +
  'religion, caste, pen_number, birth_cert_no, tc_number, ' +
  'is_rte, is_active, status, admission_date, created_at';

interface StudentRow {
  id: string; school_id: string; user_id: string | null;
  name: string; admission_no: string; roll_no: string | null;
  dob: string | null; gender: string | null; blood_group: string | null;
  aadhaar_no: string | null; phone: string | null; email: string | null;
  address: string | null; photo: string | null;
  father_name: string | null; father_phone: string | null; father_email: string | null;
  father_occupation: string | null; father_income: string | null;
  mother_name: string | null; mother_phone: string | null; mother_occupation: string | null;
  guardian_name: string | null; guardian_phone: string | null; guardian_relation: string | null;
  religion: string | null; caste: string | null; pen_number: string | null;
  birth_cert_no: string | null; tc_number: string | null;
  is_rte: boolean; is_active: boolean; status: string;
  admission_date: string | null;
}

interface AcademicRecordRow {
  id: string; student_id: string; academic_year_id: string;
  class_name: string | null; section: string | null; roll_no: string | null;
  fee_status: string; total_fee: number; paid_fee: number; attendance_percent: number;
  status: string;
}

function recordToStudent(s: StudentRow, ar?: AcademicRecordRow | null): Student {
  return {
    id: s.id,
    // Coalesce defensively — `students.name` is non-null at the schema level,
    // but historical rows or mid-edit fixtures have surfaced as null in the
    // wild and crash the principal Fees list when split() is called.
    name: s.name ?? '',
    rollNo: ar?.roll_no ?? s.roll_no ?? '',
    admissionNo: s.admission_no ?? '',
    className: ar?.class_name ?? '',
    section: ar?.section ?? '',
    dob: s.dob ?? '',
    gender: (s.gender as Student['gender']) ?? 'OTHER',
    bloodGroup: (s.blood_group as Student['bloodGroup']) ?? 'O+',
    aadhaarNo: s.aadhaar_no ?? '',
    phone: s.phone ?? '',
    email: s.email ?? '',
    address: s.address ?? '',
    photo: s.photo ?? '',
    religion: s.religion ?? '',
    caste: s.caste ?? '',
    penNumber: s.pen_number ?? '',
    birthCertNo: s.birth_cert_no ?? '',
    tcNumber: s.tc_number ?? '',
    rte: s.is_rte,
    fatherName: s.father_name ?? '',
    fatherPhone: s.father_phone ?? '',
    fatherOccupation: s.father_occupation ?? '',
    fatherIncome: s.father_income ?? '',
    fatherEmail: s.father_email ?? '',
    motherName: s.mother_name ?? '',
    motherPhone: s.mother_phone ?? '',
    motherOccupation: s.mother_occupation ?? '',
    guardianName: s.guardian_name ?? '',
    guardianPhone: s.guardian_phone ?? '',
    guardianRelation: s.guardian_relation ?? '',
    academicYearId: ar?.academic_year_id ?? '',
    admissionDate: s.admission_date ?? '',
    feeStatus: (ar?.fee_status as PaymentStatus) ?? PaymentStatus.PENDING,
    totalFee: Number(ar?.total_fee ?? 0),
    paidFee: Number(ar?.paid_fee ?? 0),
    attendancePercent: Number(ar?.attendance_percent ?? 0),
    docs: [],
  };
}

async function activeYearId(schoolId: string): Promise<string | null> {
  // If Correction Mode binds editing surfaces to a specific (closed) year,
  // honor that year so roster / academic-record reads align with the edit
  // surface (Student Attendance etc.). Verify the year actually belongs to
  // this school to prevent accidental cross-school binding.
  const overrideId = useEditingYearStore.getState().getEditingYearId();
  if (overrideId) {
    const { data: ov } = await supabase
      .from('academic_years').select('id').eq('id', overrideId).eq('school_id', schoolId).maybeSingle();
    if ((ov as { id: string } | null)?.id) return overrideId;
  }
  const { data } = await supabase
    .from('academic_years').select('id').eq('school_id', schoolId).eq('is_active', true).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

const CRITICAL_FIELDS = new Set(['name', 'dob', 'aadhaarNo']);
const FIELD_TO_DB: Record<string, string> = {
  name: 'name', dob: 'dob', aadhaarNo: 'aadhaar_no',
  rollNo: 'roll_no', gender: 'gender', bloodGroup: 'blood_group',
  phone: 'phone', email: 'email', address: 'address', photo: 'photo',
  religion: 'religion', caste: 'caste', penNumber: 'pen_number',
  birthCertNo: 'birth_cert_no', tcNumber: 'tc_number', rte: 'is_rte',
  fatherName: 'father_name', fatherPhone: 'father_phone', fatherEmail: 'father_email',
  fatherOccupation: 'father_occupation', fatherIncome: 'father_income',
  motherName: 'mother_name', motherPhone: 'mother_phone', motherOccupation: 'mother_occupation',
  guardianName: 'guardian_name', guardianPhone: 'guardian_phone', guardianRelation: 'guardian_relation',
  admissionDate: 'admission_date',
};

/** Input shape for assignStudentToClass / bulkAssignStudents. */
export interface AssignStudentInput {
  studentId: string;
  className: string;
  section: string;
  rollNo: string;
  totalFee?: number;
  feeStructure?: {
    heads: Array<{ name: string; amount: number; frequency: string; description?: string }>;
    monthlyDueDates: Array<{ month: string; date: string }>;
    isRte?: boolean;
    discountAmount?: number;
    discountPct?: number;
  };
  transport?: {
    vehicleId: string;
    stopId: string;
    monthlyAmount: number;
    /**
     * VEHICLE-type fee structure id that drives transport bill generation.
     * REQUIRED for the single-student assignment path (Task #29) — the
     * service throws if missing. The id is stored on the assignment row
     * and the SQL RPC authoritatively reads heads + due-dates from
     * fee_structures server-side so client tampering can't bill the
     * wrong amounts.
     */
    feeStructureId?: string;
  };
}

export const studentService = {
  async getAll(): Promise<Student[]> {
    const schoolId = getSchoolId();
    const ayId = await activeYearId(schoolId);
    const { data: stuData, error } = await supabase
      .from('students').select(STU_FIELDS)
      .eq('school_id', schoolId).eq('is_active', true)
      .order('admission_no');
    if (error) throw new Error(error.message);
    const stu = (stuData ?? []) as unknown as StudentRow[];
    if (!stu.length || !ayId) return stu.map(s => recordToStudent(s));

    const { data: arData } = await supabase
      .from('student_academic_records')
      .select('id, student_id, academic_year_id, class_name, section, roll_no, fee_status, total_fee, paid_fee, attendance_percent, status')
      .eq('academic_year_id', ayId)
      .in('student_id', stu.map(s => s.id));
    const arMap = new Map<string, AcademicRecordRow>();
    ((arData ?? []) as AcademicRecordRow[]).forEach(r => arMap.set(r.student_id, r));
    return stu.map(s => recordToStudent(s, arMap.get(s.id)));
  },

  async getById(id: string): Promise<Student | null> {
    const schoolId = getSchoolId();
    const { data, error } = await supabase
      .from('students').select(STU_FIELDS)
      .eq('id', id).eq('school_id', schoolId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const ayId = await activeYearId(schoolId);
    let ar: AcademicRecordRow | null = null;
    if (ayId) {
      const { data: arData } = await supabase
        .from('student_academic_records')
        .select('id, student_id, academic_year_id, class_name, section, roll_no, fee_status, total_fee, paid_fee, attendance_percent, status')
        .eq('student_id', id).eq('academic_year_id', ayId).maybeSingle();
      ar = (arData as AcademicRecordRow | null) ?? null;
    }
    return recordToStudent(data as unknown as StudentRow, ar);
  },

  async create(input: CreateStudentInput): Promise<{ student: Student; parent: { mobile: string; reused: boolean } | null }> {
    const schoolId = getSchoolId();

    // Step 1: duplicate check. Use .limit(1) array probe (NOT .maybeSingle())
    // because PostgREST returns an error when multiple rows match a maybeSingle()
    // query — that would silently bypass the duplicate guard. We also surface
    // any select-error explicitly so a transient query failure does not let an
    // accidental dupe through.
    const aadhaar = (input.aadhaarNo ?? '').replace(/\s+/g, '');
    if (aadhaar) {
      const { data: dups, error: dupErr } = await supabase
        .from('students').select('id, name, admission_no')
        .eq('school_id', schoolId).eq('aadhaar_no', aadhaar).limit(1);
      if (dupErr) throw new Error(`Aadhaar duplicate-check failed: ${dupErr.message}`);
      const dup = (dups ?? [])[0] as { name: string } | undefined;
      if (dup) throw new Error(`Aadhaar already registered: ${dup.name}`);
    }
    const fatherPhone = (input.fatherPhone ?? '').replace(/\D/g, '').slice(-10);
    if (fatherPhone) {
      const { data: dups, error: dupErr } = await supabase
        .from('students').select('id, name')
        .eq('school_id', schoolId).eq('father_phone', fatherPhone).limit(1);
      if (dupErr) throw new Error(`Father-phone duplicate-check failed: ${dupErr.message}`);
      const dup = (dups ?? [])[0] as { name: string } | undefined;
      if (dup) throw new Error(`Father phone already registered: ${dup.name}`);
    }

    // Step 2: provision parent auth account. Track whether the account is new
    // or pre-existing so the UI can surface accurate credentials (default
    // password = mobile only on first creation).
    let parentUserId: string | null = null;
    let parentReused: boolean | null = null;
    if (fatherPhone) {
      try {
        const res = await adminApi.createSchoolUser({
          mobile: fatherPhone, name: input.fatherName || 'Parent', role: 'PARENT',
        });
        parentUserId = res.userId;
        parentReused = !!res.reused;
      } catch (e) {
        const msg = (e instanceof Error ? e.message : '') || '';
        if (!/already exists/i.test(msg)) throw e;
        parentReused = true;
        // Fallback: if the admin endpoint threw "already exists" without
        // returning a reused-user payload, look up the parent row by mobile
        // so step 4 can still link parent ↔ student. RLS scopes this to the
        // principal's own school.
        const { data: existingParent } = await supabase
          .from('users')
          .select('id')
          .eq('mobile_number', fatherPhone)
          .eq('role', 'PARENT')
          .maybeSingle();
        if (existingParent && (existingParent as { id: string }).id) {
          parentUserId = (existingParent as { id: string }).id;
        }
      }
    }

    // Step 3: insert permanent students row.
    const stuPayload = {
      school_id: schoolId,
      user_id: null,
      name: input.name,
      admission_no: input.admissionNo,
      roll_no: input.rollNo || null,
      dob: input.dob || null,
      gender: input.gender,
      blood_group: input.bloodGroup,
      aadhaar_no: aadhaar || null,
      phone: input.phone || null,
      email: input.email || null,
      address: input.address || null,
      photo: input.photo || null,
      father_name: input.fatherName || null,
      // Use the already-normalized father phone (digits-only, last 10) so the
      // value persisted to DB matches the value used for duplicate detection
      // and parent auth provisioning above. Inserting raw input.fatherPhone
      // would let "+91 98765 43210" and "9876543210" coexist as distinct
      // father numbers and bypass the duplicate check on subsequent admissions.
      father_phone: fatherPhone || null,
      father_email: input.fatherEmail || null,
      father_occupation: input.fatherOccupation || null,
      father_income: input.fatherIncome || null,
      mother_name: input.motherName || null,
      mother_phone: input.motherPhone || null,
      mother_occupation: input.motherOccupation || null,
      guardian_name: input.guardianName || null,
      guardian_phone: input.guardianPhone || null,
      guardian_relation: input.guardianRelation || null,
      religion: input.religion || null,
      caste: input.caste || null,
      pen_number: input.penNumber || null,
      birth_cert_no: input.birthCertNo || null,
      tc_number: input.tcNumber || null,
      is_rte: !!input.rte,
      is_active: true,
      status: 'ACTIVE',
      admission_date: input.admissionDate || new Date().toISOString().slice(0, 10),
    };
    const { data: stuRow, error: stuErr } = await supabase
      .from('students').insert(stuPayload).select(STU_FIELDS).single();
    if (stuErr) throw new Error(stuErr.message);
    const stu = stuRow as unknown as StudentRow;

    // Step 4: link parent → student.
    if (parentUserId) {
      try {
        await adminApi.linkParentStudent({
          parentUserId, studentId: stu.id, relation: 'FATHER',
        });
      } catch { /* best-effort — parent may already be linked */ }
    }

    // Step 5: insert per-year academic record (active year), but ONLY if a
    // class+section was supplied. The new admission flow leaves the
    // academic record blank — the principal explicitly assigns the
    // student to a class/section/roll afterwards via the
    // "Assign to Class" modal (which also generates the fee schedule
    // and optionally a transport assignment in one transaction). New
    // admissions without a class therefore land in the UNASSIGNED
    // archive bucket until they are placed.
    const ayId = input.academicYearId || await activeYearId(schoolId);
    let ar: AcademicRecordRow | null = null;
    if (ayId && input.className && input.section) {
      // Resolve section_id (best-effort).
      let sectionId: string | null = null;
      const { data: sec } = await supabase
        .from('sections').select('id')
        .eq('school_id', schoolId).eq('academic_year_id', ayId)
        .eq('class_name', input.className).eq('section', input.section).maybeSingle();
      sectionId = (sec as { id: string } | null)?.id ?? null;

      const { data: arRow, error: arErr } = await supabase
        .from('student_academic_records').insert({
          student_id: stu.id,
          academic_year_id: ayId,
          section_id: sectionId,
          class_name: input.className,
          section: input.section,
          roll_no: input.rollNo || null,
          fee_status: 'PENDING',
          total_fee: input.totalFee || 0,
          paid_fee: 0,
          attendance_percent: 0,
          status: 'STUDYING',
        })
        .select('id, student_id, academic_year_id, class_name, section, roll_no, fee_status, total_fee, paid_fee, attendance_percent, status')
        .single();
      if (arErr) throw new Error(arErr.message);
      ar = arRow as AcademicRecordRow;
    }

    await logAudit('student_admitted', 'student', stu.id, {
      admissionNo: stu.admission_no,
      className: input.className || null,
      section: input.section || null,
      assigned: !!ar,
    });

    return {
      student: recordToStudent(stu, ar),
      parent: fatherPhone && parentReused !== null
        ? { mobile: fatherPhone, reused: parentReused }
        : null,
    };
  },

  /**
   * Update a student. Critical fields (name/dob/aadhaarNo) MUST go through the
   * approval flow → submit_change_request RPC. All other fields update directly.
   * Class/section changes go through recordClassMovement.
   */
  async update(id: string, input: Partial<Student>): Promise<Student> {
    const schoolId = getSchoolId();

    // Reject critical-field direct edits (use requestCriticalChange instead).
    for (const f of Object.keys(input)) {
      if (CRITICAL_FIELDS.has(f)) {
        throw new Error(`Field "${f}" requires approval — use requestCriticalChange()`);
      }
    }

    // Class/section movements need recordClassMovement.
    if (input.className !== undefined || input.section !== undefined) {
      throw new Error('Class/section changes require recordClassMovement()');
    }

    // Snapshot old values for the changed fields *before* the UPDATE so
    // the audit log can show "old → new". We only need columns that the
    // patch actually touches, so the projection stays tight.
    const dbCols = Object.entries(input)
      .map(([k]) => FIELD_TO_DB[k])
      .filter((c): c is string => !!c);
    let oldValues: Record<string, unknown> = {};
    if (dbCols.length > 0) {
      const { data: prevRow } = await supabase
        .from('students').select(dbCols.join(', '))
        .eq('id', id).eq('school_id', schoolId).maybeSingle();
      if (prevRow && typeof prevRow === 'object') {
        oldValues = prevRow as Record<string, unknown>;
      }
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const [k, v] of Object.entries(input)) {
      const dbCol = FIELD_TO_DB[k];
      if (dbCol) patch[dbCol] = v;
    }
    if (Object.keys(patch).length > 1) {
      const { error } = await supabase.from('students').update(patch).eq('id', id).eq('school_id', schoolId);
      if (error) throw new Error(error.message);
    }

    // Per-year fields (rollNo, totalFee) on academic record.
    if (input.totalFee !== undefined || input.rollNo !== undefined) {
      const ayId = await activeYearId(schoolId);
      if (ayId) {
        const arPatch: Record<string, unknown> = {};
        if (input.totalFee !== undefined) arPatch.total_fee = input.totalFee;
        if (input.rollNo !== undefined) arPatch.roll_no = input.rollNo;
        await supabase.from('student_academic_records').update(arPatch)
          .eq('student_id', id).eq('academic_year_id', ayId);
      }
    }

    // Build a structured changes[] so the Activity Logs viewer can render
    // a real before/after diff instead of just listing field names.
    const changes: Array<{ field: string; oldValue: unknown; newValue: unknown }> = [];
    for (const [k, v] of Object.entries(input)) {
      const dbCol = FIELD_TO_DB[k];
      if (!dbCol) continue;
      const oldV = oldValues[dbCol];
      if (oldV === v) continue;
      changes.push({ field: k, oldValue: oldV ?? null, newValue: (v as unknown) ?? null });
    }

    await logAudit('student_updated', 'student', id, {
      fields: Object.keys(input),
      changes,
    });
    const fresh = await this.getById(id);
    if (!fresh) throw new Error('Student not found after update');
    return fresh;
  },

  /**
   * Submit a critical-field change request. Goes through approvals queue;
   * once approved, apply_change_request RPC writes to students table.
   */
  async requestCriticalChange(
    studentId: string, field: string, _oldValue: string, newValue: string,
    reason: string, proofUrl?: string,
  ): Promise<void> {
    const dbField = FIELD_TO_DB[field] ?? field;
    // RPC signature: (p_student_id, p_field, p_new_value, p_reason, p_proof).
    // Old value is captured by the RPC itself from the live students row.
    const { error } = await supabase.rpc('submit_change_request', {
      p_student_id: studentId,
      p_field: dbField,
      p_new_value: newValue,
      p_reason: reason,
      p_proof: proofUrl ?? null,
    });
    if (error) throw new Error(error.message);
    await logAudit('student_change_requested', 'student', studentId, { field });
  },

  /**
   * Mid-year class/section change. Records class movement; updates current
   * year's academic record class+section.
   */
  async recordClassMovement(
    studentId: string, newClass: string, newSection: string,
    effectiveDate: string, reason: string,
  ): Promise<void> {
    const schoolId = getSchoolId();
    const ayId = await activeYearId(schoolId);
    if (!ayId) throw new Error('No active academic year');
    // Snapshot old class/section so the audit shows "10-A → 10-B".
    const { data: prev } = await supabase
      .from('student_academic_records').select('class_name, section')
      .eq('student_id', studentId).eq('academic_year_id', ayId).maybeSingle();
    const oldClass = (prev as { class_name: string | null } | null)?.class_name ?? null;
    const oldSection = (prev as { section: string | null } | null)?.section ?? null;

    const { error } = await supabase.rpc('record_class_movement', {
      p_student_id: studentId,
      p_year_id: ayId,
      p_new_class: newClass,
      p_new_section: newSection,
      p_effective_date: effectiveDate,
      p_reason: reason,
    });
    if (error) throw new Error(error.message);
    await logAudit('student_class_changed', 'student', studentId, {
      newClass, newSection, effectiveDate, reason,
      changes: [
        { field: 'class', oldValue: oldClass, newValue: newClass },
        { field: 'section', oldValue: oldSection, newValue: newSection },
      ],
    });
  },

  /**
   * Soft-delete (deactivate) — never hard-delete (DB trigger blocks it).
   * Issues TC and freezes the user account.
   */
  async delete(id: string): Promise<void> {
    const schoolId = getSchoolId();
    const { data: row } = await supabase
      .from('students').select('user_id').eq('id', id).eq('school_id', schoolId).maybeSingle();
    const userId = (row as { user_id: string | null } | null)?.user_id ?? null;

    const { error } = await supabase.from('students').update({
      is_active: false, status: 'TC_ISSUED', updated_at: new Date().toISOString(),
    }).eq('id', id).eq('school_id', schoolId);
    if (error) throw new Error(error.message);

    if (userId) {
      try { await adminApi.setSchoolUserActive(userId, false); } catch { /* best-effort */ }
    }
    await logAudit('student_deactivated', 'student', id);
  },

  // ── Documents ───────────────────────────────────────────────────────────
  async listDocuments(studentId: string): Promise<StudentDoc[]> {
    const { data, error } = await supabase
      .from('student_documents').select('id, doc_type, doc_url, uploaded_at')
      .eq('student_id', studentId).order('uploaded_at', { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as { id: string; doc_type: string; doc_url: string; uploaded_at: string }[])
      .map(d => ({
        id: d.id,
        name: d.doc_url.split('/').pop() || d.doc_type,
        storagePath: d.doc_url,
        type: d.doc_type as StudentDoc['type'],
        uploadedAt: d.uploaded_at,
      }));
  },

  async addDocument(studentId: string, type: StudentDoc['type'], docUrl: string): Promise<void> {
    const { error } = await supabase.from('student_documents').insert({
      student_id: studentId, doc_type: type, doc_url: docUrl,
    });
    if (error) throw new Error(error.message);
  },

  // ── Per-year academic record (used by profile/results/attendance views) ──
  async getAcademicRecord(studentId: string, academicYearId: string): Promise<StudentAcademicRecord | null> {
    const { data: ar, error } = await supabase
      .from('student_academic_records')
      .select('id')
      .eq('student_id', studentId).eq('academic_year_id', academicYearId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!ar) return null;

    // Exam results.
    const { data: exams } = await supabase
      .from('exam_results')
      .select('id, exam_name, subject, max_marks, obtained_marks, grade, exam_date')
      .eq('student_id', studentId).eq('academic_year_id', academicYearId);
    const examList: ExamResult[] = ((exams ?? []) as {
      id: string; exam_name: string; subject: string; max_marks: number;
      obtained_marks: number; grade: string; exam_date: string;
    }[]).map(e => ({
      id: e.id,
      examName: e.exam_name,
      subject: e.subject,
      maxMarks: Number(e.max_marks),
      obtainedMarks: Number(e.obtained_marks),
      grade: e.grade,
      date: e.exam_date,
    }));

    // Fee records (from fee_installments).
    const fees = await this.getFeeRecords(studentId);

    // Attendance per month — group APPROVED attendance_records the student
    // appears in via attendance_student_details, bucketed by YYYY-MM.
    const { data: attRowsRaw } = await supabase
      .from('attendance_student_details')
      .select('is_present, attendance_records!inner(date, approval_status, academic_year_id)')
      .eq('student_id', studentId);
    const attRows = (attRowsRaw ?? []) as unknown as Array<{
      is_present: boolean;
      attendance_records:
        | { date: string; approval_status: string; academic_year_id: string }
        | { date: string; approval_status: string; academic_year_id: string }[]
        | null;
    }>;
    const buckets = new Map<string, { present: number; absent: number; total: number }>();
    for (const r of attRows) {
      const rec = Array.isArray(r.attendance_records) ? r.attendance_records[0] : r.attendance_records;
      if (!rec || rec.academic_year_id !== academicYearId || rec.approval_status !== 'APPROVED') continue;
      const key = rec.date.slice(0, 7);
      const b = buckets.get(key) ?? { present: 0, absent: 0, total: 0 };
      b.total += 1;
      if (r.is_present) b.present += 1; else b.absent += 1;
      buckets.set(key, b);
    }
    const attendance: AttendanceMonth[] = Array.from(buckets.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, v]) => ({
        month: new Date(key + '-01').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }),
        present: v.present, absent: v.absent, total: v.total,
      }));

    // Complaints filed by/about this student in this year.
    const { data: comps } = await supabase
      .from('complaints')
      .select('id, subject, description, status, created_at, resolved_at, response, from_role, from_name')
      .eq('from_user_id', studentId)
      .order('created_at', { ascending: false });
    const complaints = ((comps ?? []) as Array<{
      id: string; subject: string; description: string | null; status: string;
      created_at: string; resolved_at: string | null; response: string | null;
      from_role: string; from_name: string | null;
    }>).map(c => {
      // Defensive mapping: legacy OPEN/IN_PROGRESS rows still exist on
      // pre-0033 environments. Migration 0033 backfills them.
      const raw = (c.status ?? '').toUpperCase();
      let status: import('../types/principal.types').ComplaintStatus;
      if (raw === 'OPEN') status = 'PENDING';
      else if (raw === 'IN_PROGRESS') status = 'IN_REVIEW';
      else if (raw === 'PENDING' || raw === 'IN_REVIEW' ||
               raw === 'RESOLVED' || raw === 'REJECTED') {
        status = raw as import('../types/principal.types').ComplaintStatus;
      } else status = 'PENDING';

      return {
        id: c.id,
        from: (c.from_role === 'TEACHER' || c.from_role === 'PARENT' ? c.from_role : 'STUDENT') as 'STUDENT' | 'TEACHER' | 'PARENT',
        fromName: c.from_name ?? '',
        subject: c.subject,
        description: c.description ?? '',
        status,
        createdAt: c.created_at,
        resolvedAt: c.resolved_at,
        response: c.response,
      };
    });

    return {
      studentId, academicYearId,
      exams: examList,
      feeRecords: fees,
      attendanceRecords: attendance,
      complaints,
    };
  },

  // ── Fee records (legacy view; FeeLedger uses fee.service.ts directly) ───
  async getFeeRecords(studentId: string): Promise<FeeRecord[]> {
    const { data, error } = await supabase
      .from('fee_installments')
      .select('id, student_id, due_date, amount, paid_amount, status, fee_type, month')
      .eq('student_id', studentId).order('due_date');
    if (error) throw new Error(error.message);
    const stuName = (await this.getById(studentId))?.name ?? '';
    return ((data ?? []) as {
      id: string; student_id: string; due_date: string;
      amount: number; paid_amount: number; status: string;
      fee_type: string; month: string;
    }[]).map(f => ({
      id: f.id,
      studentId: f.student_id,
      studentName: stuName,
      amount: Number(f.amount),
      dueDate: f.due_date,
      paidAt: f.status === 'PAID' ? f.due_date : null,
      status: (f.status === 'PAID' ? PaymentStatus.PAID :
               f.status === 'PARTIAL' ? PaymentStatus.PENDING :
               PaymentStatus.OVERDUE) as PaymentStatus,
      transactionId: null,
      screenshotUrl: null,
      description: `${f.fee_type} ${f.month}`,
    }));
  },

  async markFeePaid(_feeId: string, _transactionId: string): Promise<FeeRecord> {
    throw new Error('Use feeService.recordPayment() instead');
  },

  async sendFeeReminder(_studentId: string): Promise<void> {
    // No-op: in production this would fire an SMS/notification job.
  },

  // ── Document storage helpers ─────────────────────────────────────────────

  /**
   * Persist a freshly-uploaded document. `storagePath` is the
   * bucket-relative path returned by storageService.uploadStudentDocument.
   */
  async addDocumentRecord(
    studentId: string,
    type: StudentDoc['type'],
    storagePath: string,
  ): Promise<StudentDoc> {
    const { data, error } = await supabase.from('student_documents').insert({
      student_id: studentId,
      doc_type: type,
      doc_url: storagePath,
    }).select('id, doc_type, doc_url, uploaded_at').single();
    if (error) throw new Error(error.message);
    const row = data as { id: string; doc_type: string; doc_url: string; uploaded_at: string };
    await logAudit('student_document_uploaded', 'student_document', row.id,
      { studentId, docType: type });
    return {
      id: row.id,
      name: row.doc_url.split('/').pop() || row.doc_type,
      storagePath: row.doc_url,
      type: row.doc_type as StudentDoc['type'],
      uploadedAt: row.uploaded_at,
    };
  },

  /** Remove a document row + its bytes (best-effort on storage). */
  async removeDocument(documentId: string): Promise<void> {
    const { data: row } = await supabase
      .from('student_documents')
      .select('id, doc_url, student_id')
      .eq('id', documentId).maybeSingle();
    const { error } = await supabase
      .from('student_documents').delete().eq('id', documentId);
    if (error) throw new Error(error.message);
    const r = row as { doc_url: string; student_id: string } | null;
    if (r?.doc_url) {
      // Storage delete is best-effort: an orphaned object is harmless
      // (the row that referenced it is gone) but row-level RLS may block
      // delete for non-principal callers — we swallow errors.
      try {
        await supabase.storage.from('student-documents').remove([r.doc_url]);
      } catch { /* ignore */ }
    }
    await logAudit('student_document_removed', 'student_document', documentId,
      { studentId: r?.student_id ?? null });
  },

  // ── Archive / lifecycle ──────────────────────────────────────────────────

  /**
   * Returns students filtered by archive bucket for the active year:
   *   ACTIVE      — is_active=true & current-year AR with status STUDYING/PROMOTED/null
   *   INACTIVE    — is_active=true & current-year AR with status FAILED/REPEATING/SUSPENDED
   *   TC_ISSUED   — students.status='TC_ISSUED' (always inactive)
   *   ALUMNI      — students.status IN ('GRADUATED','ALUMNI')
   *   UNASSIGNED  — is_active=true & no AR row for the active year
   */
  async getStudentsByArchiveStatus(
    bucket: 'ACTIVE' | 'INACTIVE' | 'TC_ISSUED' | 'ALUMNI' | 'UNASSIGNED',
  ): Promise<Student[]> {
    const schoolId = getSchoolId();
    const ayId = await activeYearId(schoolId);

    // Pull every student (active+inactive) so we can bucket them
    // client-side.  The set is small (school-scoped) and avoids
    // building a separate query per bucket.
    const { data: stuData, error } = await supabase
      .from('students').select(STU_FIELDS)
      .eq('school_id', schoolId).order('admission_no');
    if (error) throw new Error(error.message);
    const stu = (stuData ?? []) as unknown as StudentRow[];
    if (!stu.length) return [];

    let arMap = new Map<string, AcademicRecordRow>();
    if (ayId) {
      const { data: arData } = await supabase
        .from('student_academic_records')
        .select('id, student_id, academic_year_id, class_name, section, roll_no, fee_status, total_fee, paid_fee, attendance_percent, status')
        .eq('academic_year_id', ayId)
        .in('student_id', stu.map(s => s.id));
      ((arData ?? []) as AcademicRecordRow[]).forEach(r => arMap.set(r.student_id, r));
    }

    const inactiveStatuses = new Set(['FAILED', 'REPEATING', 'SUSPENDED']);
    const studyingStatuses = new Set(['STUDYING', 'PROMOTED', '']);

    const filtered = stu.filter(s => {
      const ar = arMap.get(s.id);
      switch (bucket) {
        case 'TC_ISSUED':
          return s.status === 'TC_ISSUED';
        case 'ALUMNI':
          return s.status === 'GRADUATED' || s.status === 'ALUMNI';
        case 'UNASSIGNED':
          return s.is_active && !ar;
        case 'INACTIVE':
          return s.is_active
            && !!ar
            && inactiveStatuses.has(ar.status ?? '');
        case 'ACTIVE':
        default:
          return s.is_active
            && s.status === 'ACTIVE'
            && !!ar
            && studyingStatuses.has(ar.status ?? '');
      }
    });

    return filtered.map(s => recordToStudent(s, arMap.get(s.id)));
  },

  /** Real-time roll-uniqueness check used by the assignment modal. */
  async isRollAvailable(
    className: string, section: string, roll: string,
    excludeStudentId?: string,
  ): Promise<boolean> {
    if (!roll || !roll.trim()) return false;
    const schoolId = getSchoolId();
    const ayId = await activeYearId(schoolId);
    if (!ayId) return false;
    const { data, error } = await supabase.rpc('roll_available', {
      p_school_id: schoolId,
      p_year_id: ayId,
      p_class: className,
      p_section: section,
      p_roll: roll,
      p_exclude_student_id: excludeStudentId ?? null,
    });
    if (error) {
      console.warn('[roll_available]', error.message);
      return false;
    }
    return !!data;
  },

  /** Auto-suggest the smallest unused roll number in a section. */
  async getNextAvailableRoll(className: string, section: string): Promise<string> {
    const schoolId = getSchoolId();
    const ayId = await activeYearId(schoolId);
    if (!ayId) return '01';
    const { data, error } = await supabase.rpc('next_available_roll', {
      p_school_id: schoolId,
      p_year_id: ayId,
      p_class: className,
      p_section: section,
    });
    if (error) {
      console.warn('[next_available_roll]', error.message);
      return '01';
    }
    return (data as string) || '01';
  },

  /**
   * Atomic class assignment for a single student. Steps (in order):
   *
   *   1. Re-activate the student row if needed (status→ACTIVE, is_active=true).
   *   2. Upsert the student_academic_records row for the active year, including
   *      class/section/roll/total_fee/section_id/status='STUDYING'.
   *   3. If a fee structure is supplied, fetch its heads + monthly_due_dates
   *      and call generate_student_fee_schedule() (RTE + discount aware).
   *   4. If a transport assignment is supplied, hand off to
   *      transportService.assignStudent (which owns the transport tables).
   *   5. Audit log every successful assignment.
   *
   * Errors thrown by any step are surfaced to the caller verbatim;
   * partial-progress is acceptable here because each step is itself
   * idempotent (upsert / RPC / transportService assignment all
   * deactivate-then-insert).
   */
  async assignStudentToClass(
    input: AssignStudentInput,
  ): Promise<{ installmentCount: number; totalAmount: number } | null> {
    const schoolId = getSchoolId();
    const ayId = await activeYearId(schoolId);
    if (!ayId) throw new Error('No active academic year — create one first');

    // Roll uniqueness pre-check (defensive — UI also enforces).
    const free = await this.isRollAvailable(
      input.className, input.section, input.rollNo, input.studentId,
    );
    if (!free) {
      throw new Error(`Roll ${input.rollNo} is already taken in ${input.className}-${input.section}`);
    }

    // Step 1: re-activate student row if it was inactive (e.g. readmit
    // after TC). Stays a no-op for already-active students.
    await supabase.from('students').update({
      is_active: true,
      status: 'ACTIVE',
      updated_at: new Date().toISOString(),
    }).eq('id', input.studentId).eq('school_id', schoolId);

    // Resolve section_id (best-effort).
    let sectionId: string | null = null;
    const { data: sec } = await supabase
      .from('sections').select('id')
      .eq('school_id', schoolId).eq('academic_year_id', ayId)
      .eq('class_name', input.className).eq('section', input.section).maybeSingle();
    sectionId = (sec as { id: string } | null)?.id ?? null;

    // Step 2: upsert the academic record for the active year.
    const { data: existing } = await supabase
      .from('student_academic_records')
      .select('id')
      .eq('student_id', input.studentId)
      .eq('academic_year_id', ayId)
      .maybeSingle();

    const arPayload: Record<string, unknown> = {
      student_id: input.studentId,
      academic_year_id: ayId,
      section_id: sectionId,
      class_name: input.className,
      section: input.section,
      roll_no: input.rollNo,
      status: 'STUDYING',
    };
    if (input.totalFee !== undefined) arPayload.total_fee = input.totalFee;

    if (existing) {
      const { error } = await supabase
        .from('student_academic_records')
        .update(arPayload)
        .eq('id', (existing as { id: string }).id);
      if (error) throw new Error(`Update academic record failed: ${error.message}`);
    } else {
      const { error } = await supabase
        .from('student_academic_records')
        .insert({
          ...arPayload,
          fee_status: 'PENDING',
          total_fee: input.totalFee ?? 0,
          paid_fee: 0,
          attendance_percent: 0,
        });
      if (error) throw new Error(`Insert academic record failed: ${error.message}`);
    }

    // Step 3: generate fee schedule. Capture the inserted installment
    // count + total amount so the caller can show a meaningful success
    // toast ("12 installments totalling ₹61,000").
    let scheduleSummary: { installmentCount: number; totalAmount: number } | null = null;
    if (input.feeStructure) {
      const { error: feeErr } = await supabase.rpc('generate_student_fee_schedule', {
        p_student_id: input.studentId,
        p_year_id: ayId,
        p_heads: input.feeStructure.heads,
        p_due_dates: input.feeStructure.monthlyDueDates,
        p_is_rte: !!input.feeStructure.isRte,
        p_discount_amount: input.feeStructure.discountAmount ?? 0,
        p_discount_pct: input.feeStructure.discountPct ?? 0,
      });
      if (feeErr) throw new Error(`Fee schedule failed: ${feeErr.message}`);
      // Read back the rows the RPC just (re)inserted for this (student,
      // year) so we can report the actual count + amount, not an estimate.
      // No payer_type filter: an RTE student's schedule may legitimately
      // route part of the load to GOVT, and the toast should still reflect
      // the full installment count + total written.
      const { data: installments } = await supabase
        .from('fee_installments')
        .select('amount')
        .eq('student_id', input.studentId)
        .eq('academic_year_id', ayId);
      const rows = (installments ?? []) as { amount: number }[];
      scheduleSummary = {
        installmentCount: rows.length,
        totalAmount: rows.reduce((s, r) => s + Number(r.amount ?? 0), 0),
      };
    }

    // Step 4: transport assignment (handled by transport service).
    // Hard-require a VEHICLE-type fee structure on the single-student
    // path (Task #29). Bulk reassignment paths still call
    // transportService.assignStudent without a structure and remain
    // intentionally unaffected per task spec.
    if (input.transport) {
      if (!input.transport.feeStructureId) {
        throw new Error('Transport assign karne ke liye Vehicle fee structure chunna zaroori hai.');
      }
      // Lazy import to avoid a circular dep between student↔transport
      // services (transportService imports from supabase + auth only,
      // but keeping this lazy is the safer pattern).
      const { transportService } = await import('@/modules/transport/transport.service');
      await transportService.assignStudent(
        input.studentId, '', '',
        input.transport.vehicleId,
        input.transport.stopId, '',
        input.transport.monthlyAmount,
        undefined, ayId,
        null, null,
        input.transport.feeStructureId,
      );
    }

    await logAudit('student_assigned_to_class', 'student', input.studentId, {
      className: input.className,
      section: input.section,
      rollNo: input.rollNo,
      hasFeeStructure: !!input.feeStructure,
      hasTransport: !!input.transport,
      installmentCount: scheduleSummary?.installmentCount ?? 0,
      scheduleTotal:    scheduleSummary?.totalAmount     ?? 0,
    });
    return scheduleSummary;
  },

  /**
   * Best-effort bulk version of assignStudentToClass. Each row is tried
   * in turn; failures are collected and returned so the caller can show
   * a per-row error report instead of aborting the whole batch.
   */
  async bulkAssignStudents(
    inputs: AssignStudentInput[],
  ): Promise<{ succeeded: number; failed: Array<{ studentId: string; error: string }> }> {
    let succeeded = 0;
    const failed: Array<{ studentId: string; error: string }> = [];
    for (const input of inputs) {
      try {
        await studentService.assignStudentToClass(input);
        succeeded += 1;
      } catch (e) {
        failed.push({
          studentId: input.studentId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    return { succeeded, failed };
  },

  /** Mark a student as failed for the active year. */
  async markStudentFailed(studentId: string, reason?: string): Promise<void> {
    const schoolId = getSchoolId();
    const ayId = await activeYearId(schoolId);
    if (!ayId) throw new Error('No active academic year');
    const { error } = await supabase
      .from('student_academic_records')
      .update({ status: 'FAILED' })
      .eq('student_id', studentId)
      .eq('academic_year_id', ayId);
    if (error) throw new Error(error.message);
    await logAudit('student_marked_failed', 'student', studentId,
      { reason: reason ?? null, academicYearId: ayId });
  },

  /**
   * Issue a Transfer Certificate.  Sets students.status='TC_ISSUED',
   * is_active=false, persists tc_number, and disables the parent's
   * portal access.  Active-year academic record is preserved (read-only).
   */
  async issueTC(studentId: string, tcNumber: string, reason?: string): Promise<void> {
    const schoolId = getSchoolId();
    const cleanTc = tcNumber.trim();
    if (!cleanTc) throw new Error('TC number required');

    const { data: row } = await supabase
      .from('students').select('user_id, name')
      .eq('id', studentId).eq('school_id', schoolId).maybeSingle();
    const userId = (row as { user_id: string | null } | null)?.user_id ?? null;

    const { error } = await supabase.from('students').update({
      is_active: false,
      status: 'TC_ISSUED',
      tc_number: cleanTc,
      updated_at: new Date().toISOString(),
    }).eq('id', studentId).eq('school_id', schoolId);
    if (error) throw new Error(error.message);

    if (userId) {
      try { await adminApi.setSchoolUserActive(userId, false); }
      catch { /* best-effort */ }
    }
    await logAudit('student_tc_issued', 'student', studentId,
      { tcNumber: cleanTc, reason: reason ?? null });
  },

  /**
   * Re-admit a previously-deactivated student. Flips status back to ACTIVE
   * + is_active=true; the caller is expected to follow up with
   * assignStudentToClass() to put them back into a section.
   */
  async readmitStudent(studentId: string): Promise<void> {
    const schoolId = getSchoolId();
    const { data: row } = await supabase
      .from('students').select('user_id')
      .eq('id', studentId).eq('school_id', schoolId).maybeSingle();
    const userId = (row as { user_id: string | null } | null)?.user_id ?? null;

    const { error } = await supabase.from('students').update({
      is_active: true,
      status: 'ACTIVE',
      updated_at: new Date().toISOString(),
    }).eq('id', studentId).eq('school_id', schoolId);
    if (error) throw new Error(error.message);

    if (userId) {
      try { await adminApi.setSchoolUserActive(userId, true); }
      catch { /* best-effort */ }
    }
    await logAudit('student_readmitted', 'student', studentId);
  },
};
