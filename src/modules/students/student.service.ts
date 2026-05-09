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

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useEditingYearStore } from '@/store/editingYearStore';
import { adminApi } from '@/lib/adminApi';
import { logAudit } from '@/lib/audit';
import { PaymentStatus } from '@/shared/config/constants';
import { apiStudents, apiTransport } from '@/lib/apiClient';
// FIELD_TO_DB: maps camelCase Student fields → DB column names for patch payloads
import type {
  Student, StudentAcademicRecord, FeeRecord, CreateStudentInput,
  StudentDoc, ExamResult, AttendanceMonth,
} from '@/modules/students/student.types';

function getSchoolId(): string {
  const id = useAuthStore.getState().session?.schoolId;
  if (!id) throw new Error('No school in session');
  return id;
}

// Back-compat export: yearClosing.service.ts still imports MOCK_STUDENTS
// from this module. Empty array — yearClosing has its own load path.
export const MOCK_STUDENTS: Student[] = [];

/**
 * Slim shape used by list/search views (FeeLedger left rail,
 * Students search bar). Has only the columns actually rendered in a
 * row, so a 5,000-student school doesn't ship 30+ fields × N to the
 * client. Open the full Student via getById() when the user taps.
 */
export interface StudentListItem {
  id: string;
  name: string;
  admissionNo: string;
  rollNo: string;
  className: string;
  section: string;
  isRte: boolean;
  photo: string;
  attendancePercent: number;
  feeStatus: string;
  totalFee: number;
  paidFee: number;
}

export interface StudentListPage {
  items: StudentListItem[];
  total: number;
  hasMore: boolean;
  nextOffset: number;
}

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
    isActive: !!s.is_active,
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
      .order('admission_no')
      // Safety cap. Above 5000 active students per school the in-memory
      // pattern stops being practical; consumers should switch to the
      // paginated `getList()` accessor below + on-demand profile fetch.
      .limit(5000);
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

  /**
   * Server-paginated student list — slim columns only. Use for the
   * FeeLedger left rail, principal "Students" list, and any view that
   * shows ≥50 students at a time. Server-side search across name +
   * admission_no avoids pulling all students just to filter client-side.
   *
   *   offset      — start row index (0 for first page)
   *   limit       — page size (default 50, max 200)
   *   search      — case-insensitive ILIKE match on name OR admission_no
   *   classFilter — exact "{class}-{section}" filter (active year)
   */
  async getList(opts: {
    offset?: number; limit?: number;
    search?: string; classFilter?: string;
  } = {}): Promise<StudentListPage> {
    const schoolId = getSchoolId();
    const ayId = await activeYearId(schoolId);
    const offset = Math.max(0, opts.offset ?? 0);
    const limit  = Math.max(1, Math.min(200, opts.limit ?? 50));
    const search = (opts.search ?? '').trim();

    // Two-step query — first apply student-table filters and the count,
    // then enrich with the active year's academic record. Keeping the
    // search on `students` (not the AR table) means a class-switched
    // student is still findable by their admission_no even if the AR
    // row hasn't been generated for the new year yet.
    let q = supabase
      .from('students')
      .select(
        'id, name, admission_no, roll_no, photo, is_rte',
        { count: 'exact' },
      )
      .eq('school_id', schoolId).eq('is_active', true);

    if (search) {
      // Escape % and _ so a literal phone number / admission code with
      // those chars doesn't accidentally widen the match.
      const safe = search.replace(/[%_]/g, ch => `\\${ch}`);
      q = q.or(`name.ilike.%${safe}%,admission_no.ilike.%${safe}%`);
    }

    const { data, count, error } = await q
      .order('admission_no')
      .range(offset, offset + limit - 1);
    if (error) throw new Error(error.message);

    type StuRow = {
      id: string; name: string; admission_no: string;
      roll_no: string | null; photo: string | null; is_rte: boolean;
    };
    let items = (data ?? []) as unknown as StuRow[];

    // Class filter happens AFTER the page is fetched (acceptable here —
    // class is on the AR table, joining server-side would force every
    // page to also fetch all of student_academic_records). Most schools
    // don't filter by class on the global list; when they do, results
    // are post-filtered in-page.
    let arMap = new Map<string, AcademicRecordRow>();
    // Lifetime fee totals — summed across ALL academic years (active +
    // closed). Without this, a student who paid in 2025-26 (now closed)
    // but has no 2026-27 row yet shows totalFee=0 → mis-flagged as
    // "Pending / No schedule" in the FeeLedger list. The active-year
    // AR row above still drives class/section/attendance display.
    const lifetimeMap = new Map<string, { totalFee: number; paidFee: number; feeStatus: string }>();
    if (items.length > 0) {
      const { data: arAll } = await supabase
        .from('student_academic_records')
        .select('student_id, academic_year_id, fee_status, total_fee, paid_fee')
        .in('student_id', items.map(s => s.id));
      type LifetimeRow = { student_id: string; academic_year_id: string; fee_status: string; total_fee: number; paid_fee: number };
      for (const r of ((arAll ?? []) as LifetimeRow[])) {
        const cur = lifetimeMap.get(r.student_id) ?? { totalFee: 0, paidFee: 0, feeStatus: 'PENDING' };
        cur.totalFee += Number(r.total_fee ?? 0);
        cur.paidFee  += Number(r.paid_fee  ?? 0);
        // Active-year status takes precedence; fall back to any other.
        if (r.academic_year_id === ayId || cur.feeStatus === 'PENDING') {
          cur.feeStatus = r.fee_status ?? cur.feeStatus;
        }
        lifetimeMap.set(r.student_id, cur);
      }
    }
    if (ayId && items.length > 0) {
      const { data: arData } = await supabase
        .from('student_academic_records')
        .select('id, student_id, academic_year_id, class_name, section, roll_no, fee_status, total_fee, paid_fee, attendance_percent, status')
        .eq('academic_year_id', ayId)
        .in('student_id', items.map(s => s.id));
      ((arData ?? []) as AcademicRecordRow[]).forEach(r => arMap.set(r.student_id, r));
    }

    if (opts.classFilter) {
      const [cls, sec] = opts.classFilter.split('-');
      items = items.filter(s => {
        const ar = arMap.get(s.id);
        return ar?.class_name === cls && (sec ? ar?.section === sec : true);
      });
    }

    const listItems: StudentListItem[] = items.map(s => {
      const ar = arMap.get(s.id);
      const life = lifetimeMap.get(s.id);
      return {
        id: s.id,
        name: s.name ?? '',
        admissionNo: s.admission_no ?? '',
        rollNo: ar?.roll_no ?? s.roll_no ?? '',
        className: ar?.class_name ?? '',
        section: ar?.section ?? '',
        isRte: !!s.is_rte,
        photo: s.photo ?? '',
        attendancePercent: Number(ar?.attendance_percent ?? 0),
        // Lifetime totals — sum across all academic years so a student
        // with closed-year-only fees still gets a correct due/cleared
        // badge in the list view. Active-year AR row drives class info.
        feeStatus: life?.feeStatus ?? ar?.fee_status ?? 'PENDING',
        totalFee:  life?.totalFee  ?? Number(ar?.total_fee ?? 0),
        paidFee:   life?.paidFee   ?? Number(ar?.paid_fee  ?? 0),
      };
    });

    const total = count ?? items.length;
    return {
      items: listItems,
      total,
      hasMore: offset + listItems.length < total,
      nextOffset: offset + listItems.length,
    };
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
    const ayId = input.academicYearId || await activeYearId(schoolId);

    const result = await apiStudents.create({
      name: input.name,
      admissionNo: input.admissionNo, rollNo: input.rollNo,
      dob: input.dob, gender: input.gender, bloodGroup: input.bloodGroup,
      aadhaarNo: input.aadhaarNo, phone: input.phone, email: input.email,
      address: input.address, photo: input.photo, rte: input.rte,
      fatherName: input.fatherName, fatherPhone: input.fatherPhone,
      fatherEmail: input.fatherEmail, fatherOccupation: input.fatherOccupation,
      fatherIncome: input.fatherIncome,
      motherName: input.motherName, motherPhone: input.motherPhone,
      motherOccupation: input.motherOccupation,
      guardianName: input.guardianName, guardianPhone: input.guardianPhone,
      guardianRelation: input.guardianRelation,
      religion: input.religion, caste: input.caste,
      penNumber: input.penNumber, birthCertNo: input.birthCertNo,
      tcNumber: input.tcNumber, admissionDate: input.admissionDate,
      className: input.className, section: input.section,
      academicYearId: ayId ?? undefined,
      totalFee: input.totalFee,
    });

    const stu = (result as any).studentRow as StudentRow;
    const ar = (result as any).academicRecordRow as AcademicRecordRow | null;
    const parent = (result as any).parent as { mobile: string; reused: boolean } | null;

    await logAudit('student_admitted', 'student', stu.id, {
      admissionNo: stu.admission_no,
      className: input.className || null,
      section: input.section || null,
      assigned: !!ar,
    });

    return { student: recordToStudent(stu, ar), parent };
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

    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) {
      const dbCol = FIELD_TO_DB[k];
      if (dbCol) patch[dbCol] = v;
    }

    let academicYearPatch: Record<string, unknown> | undefined;
    let ayId: string | undefined;
    if (input.totalFee !== undefined || input.rollNo !== undefined) {
      ayId = await activeYearId(schoolId) ?? undefined;
      if (ayId) {
        academicYearPatch = {};
        if (input.totalFee !== undefined) academicYearPatch.total_fee = input.totalFee;
        if (input.rollNo !== undefined) academicYearPatch.roll_no = input.rollNo;
      }
    }

    await apiStudents.update({ studentId: id, patch, academicYearPatch, academicYearId: ayId });

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
    await apiStudents.changeRequest({ studentId, field: dbField, newValue, reason, proofUrl });
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

    await apiStudents.classMovement({ studentId, academicYearId: ayId, newClass, newSection, effectiveDate, reason });
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

    await apiStudents.deactivate(id);

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
    await apiStudents.addDocument({ studentId, docType: type, docUrl });
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
      .select('id, subject, description, status, created_at, resolved_at, response, from_role, from_name, is_anonymous')
      .eq('from_user_id', studentId)
      .order('created_at', { ascending: false });
    const complaints = ((comps ?? []) as Array<{
      id: string; subject: string; description: string | null; status: string;
      created_at: string; resolved_at: string | null; response: string | null;
      from_role: string; from_name: string | null; is_anonymous: boolean | null;
    }>).map(c => {
      // Defensive mapping: legacy OPEN/IN_PROGRESS rows still exist on
      // pre-0033 environments. Migration 0033 backfills them.
      const raw = (c.status ?? '').toUpperCase();
      let status: import('@/roles/principal/principal.types').ComplaintStatus;
      if (raw === 'OPEN') status = 'PENDING';
      else if (raw === 'IN_PROGRESS') status = 'IN_REVIEW';
      else if (raw === 'PENDING' || raw === 'IN_REVIEW' ||
               raw === 'RESOLVED' || raw === 'REJECTED') {
        status = raw as import('@/roles/principal/principal.types').ComplaintStatus;
      } else status = 'PENDING';

      const anon = c.is_anonymous === true;
      return {
        id: c.id,
        from: (c.from_role === 'TEACHER' || c.from_role === 'PARENT' ? c.from_role : 'STUDENT') as 'STUDENT' | 'TEACHER' | 'PARENT',
        fromName: anon ? 'Anonymous' : (c.from_name ?? ''),
        subject: c.subject,
        description: c.description ?? '',
        status,
        createdAt: c.created_at,
        resolvedAt: c.resolved_at,
        response: c.response,
        isAnonymous: anon,
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
    const row = await apiStudents.addDocument({ studentId, docType: type, docUrl: storagePath });
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
    const { docUrl } = await apiStudents.removeDocument(documentId);
    if (docUrl) {
      try {
        await supabase.storage.from('student-documents').remove([docUrl]);
      } catch { /* ignore */ }
    }
    await logAudit('student_document_removed', 'student_document', documentId, {});
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

    // Transport hard-require fee structure on single-student path.
    if (input.transport && !input.transport.feeStructureId) {
      throw new Error('Transport assign karne ke liye Vehicle fee structure chunna zaroori hai.');
    }

    // Steps 1–3: reactivate student, upsert academic record, generate fee
    // schedule — all handled server-side via /api/students/assign.
    const { installmentCount, totalAmount } = await apiStudents.assign({
      studentId:      input.studentId,
      className:      input.className,
      section:        input.section,
      rollNo:         input.rollNo,
      academicYearId: ayId,
      totalFee:       input.totalFee,
      feeHeads:       input.feeStructure?.heads,
      dueDates:       input.feeStructure?.monthlyDueDates,
      isRte:          input.feeStructure?.isRte,
      discountAmount: input.feeStructure?.discountAmount,
      discountPct:    input.feeStructure?.discountPct,
    });

    const scheduleSummary = input.feeStructure
      ? { installmentCount, totalAmount }
      : null;

    // Step 4: transport assignment via API (apiTransport.assign handles
    // closing prior assignment, cancelling installments, generating schedule).
    if (input.transport) {
      const startIso = new Date().toISOString().slice(0, 10);
      await apiTransport.assign({
        studentId:      input.studentId,
        vehicleId:      input.transport.vehicleId,
        stopId:         input.transport.stopId,
        monthlyAmount:  input.transport.monthlyAmount,
        startDate:      startIso,
        academicYearId: ayId,
        feeStructureId: input.transport.feeStructureId,
      });
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
    await apiStudents.fail({ studentId, academicYearId: ayId, reason });
    await logAudit('student_marked_failed', 'student', studentId,
      { reason: reason ?? null, academicYearId: ayId });
  },

  /**
   * Issue a Transfer Certificate. The TC number is auto-generated by
   * the issue_tc_and_leave RPC (TC-{year}-{NNN}). When `tcNumber` is
   * supplied, it overrides the auto-generated value (legacy / school
   * uses an off-app numbering system). Server-side enforces Editor
   * Mode + active-year + principal-only.
   */
  async issueTC(studentId: string, reason?: string, tcNumberOverride?: string): Promise<{ tcNumber: string }> {
    const schoolId = getSchoolId();
    const { data: row } = await supabase
      .from('students').select('user_id, name')
      .eq('id', studentId).eq('school_id', schoolId).maybeSingle();
    const userId = (row as { user_id: string | null } | null)?.user_id ?? null;

    const result = await apiStudents.issueTC({
      studentId,
      tcNumber: tcNumberOverride?.trim() || undefined,
      reason,
    });

    if (userId) {
      try { await adminApi.setSchoolUserActive(userId, false); }
      catch { /* best-effort */ }
    }
    await logAudit('student_tc_issued', 'student', studentId,
      { tcNumber: result.tcNumber, reason: reason ?? null });
    return { tcNumber: result.tcNumber };
  },

  /**
   * Re-admit a previously-deactivated student into the active year.
   * Reactivates the student row + creates / updates their AR row for
   * the active year with the supplied class/section. Server-side
   * enforces Editor Mode + active-year + principal-only.
   */
  async readmitStudent(
    studentId: string, className: string, section?: string, rollNo?: string,
  ): Promise<void> {
    const schoolId = getSchoolId();
    const { data: row } = await supabase
      .from('students').select('user_id')
      .eq('id', studentId).eq('school_id', schoolId).maybeSingle();
    const userId = (row as { user_id: string | null } | null)?.user_id ?? null;

    await apiStudents.readmit({ studentId, className, section, rollNo });

    if (userId) {
      try { await adminApi.setSchoolUserActive(userId, true); }
      catch { /* best-effort */ }
    }
    await logAudit('student_readmitted', 'student', studentId,
      { className, section: section ?? '', rollNo: rollNo ?? '' });
  },
};
