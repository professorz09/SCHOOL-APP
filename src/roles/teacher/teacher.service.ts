// Supabase-backed teacher service.
//
// Tables touched:
//   staff_permissions            – which sections this teacher can act on
//   staff_class_assignments      – fallback when no per-section permission rows
//   sections, students, student_academic_records – class roster
//   attendance_records, attendance_student_details
//   test_schedules, exam_results
//   homework_assignments
//   notices
//   complaints
//   timetable_entries
//
// Everything is scoped to (school_id, active academic_year_id). The class id
// returned to the UI IS the section_id (uuid) — keeping the convention that
// 1 class card = 1 section. Subject is derived from the teacher's own staff
// row (`staff.subject`) since a teacher in this product owns one specialism
// across all assigned sections.
//
// AI exam paper generation calls Google Gemini directly via `lib/gemini`.

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useEditingYearStore } from '@/store/editingYearStore';
import { logAudit } from '@/lib/audit';
import { generateText, generatePaper, generateFromImages, stripJsonFence, GeminiUnavailableError } from '@/lib/gemini';
import type { PublishResultsInput, FinalExamPublishInput } from '@/roles/teacher/teacher.types';
import type {
  TeacherClass,
  AttendanceStudent,
  AttendanceRecord,
  TestSchedule,
  TestType,
  TeacherComplaint,
  ExamPaperRequest,
  GeneratedExamPaper,
  ExamSection,
  ExamQuestion,
  FinalExamSchedule,
} from '@/roles/teacher/teacher.types';
import type { DateAttendanceStatus } from '@/modules/attendance/attendance.service';

// ─── Session helpers ────────────────────────────────────────────────────────

function getSchoolId(): string {
  const id = useAuthStore.getState().session?.schoolId;
  if (!id) throw new Error('No school in session');
  return id;
}

function getUserId(): string {
  const id = useAuthStore.getState().session?.userId;
  if (!id) throw new Error('Not signed in');
  return id;
}

function getUserName(): string {
  return useAuthStore.getState().session?.name ?? 'Teacher';
}

let _staffIdCache: { userId: string; staffId: string; subject: string } | null = null;
async function getMyStaff(): Promise<{ staffId: string; subject: string }> {
  const userId = getUserId();
  if (_staffIdCache && _staffIdCache.userId === userId) {
    return { staffId: _staffIdCache.staffId, subject: _staffIdCache.subject };
  }
  const schoolId = getSchoolId();
  const { data, error } = await supabase
    .from('staff').select('id, subject')
    .eq('school_id', schoolId).eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Teacher profile not found for current user');
  const row = data as { id: string; subject: string | null };
  _staffIdCache = { userId, staffId: row.id, subject: row.subject ?? '' };
  return { staffId: row.id, subject: row.subject ?? '' };
}

let _yearCache: { schoolId: string; yearId: string | null } | null = null;
async function getActiveYearId(): Promise<string> {
  const schoolId = getSchoolId();
  // Honor Correction Mode override — bypass cache so toggling correction
  // for different years immediately routes queries to the right year.
  const override = useEditingYearStore.getState().getEditingYearId();
  if (override) return override;
  if (_yearCache && _yearCache.schoolId === schoolId && _yearCache.yearId) {
    return _yearCache.yearId;
  }
  const { data, error } = await supabase
    .from('academic_years').select('id')
    .eq('school_id', schoolId).eq('is_active', true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const yearId = (data as { id: string } | null)?.id ?? null;
  _yearCache = { schoolId, yearId };
  if (!yearId) throw new Error('No active academic year configured');
  return yearId;
}

// Reset caches when the user signs out / switches.
useAuthStore.subscribe(state => {
  if (!state.session) {
    _staffIdCache = null;
    _yearCache = null;
  }
});

// ─── Permission-aware section discovery ─────────────────────────────────────

/**
 * Resolve the set of section_ids this teacher is allowed to operate on for the
 * active year. Primary source: `staff_permissions` rows (per-section grants
 * configured by the principal). Fallback: `staff_class_assignments` (legacy
 * class-name based assignments) — matched against the school's `sections`
 * table to get the corresponding section_ids. The fallback ensures the teacher
 * sees their classes even before the principal migrates to fine-grained
 * permission rows.
 */
async function resolveMySectionIds(): Promise<string[]> {
  const schoolId = getSchoolId();
  const { staffId } = await getMyStaff();
  const yearId = await getActiveYearId();

  // 1. Try staff_permissions
  const { data: perms, error: pErr } = await supabase
    .from('staff_permissions')
    .select('section_id')
    .eq('school_id', schoolId)
    .eq('staff_id', staffId)
    .eq('academic_year_id', yearId);
  if (pErr) throw new Error(pErr.message);
  const permSectionIds = Array.from(new Set(
    ((perms ?? []) as { section_id: string | null }[])
      .map(r => r.section_id).filter((x): x is string => !!x),
  ));
  if (permSectionIds.length) return permSectionIds;

  // 2. Fallback to staff_class_assignments → sections lookup by class_name
  const { data: assigns, error: aErr } = await supabase
    .from('staff_class_assignments')
    .select('class_name')
    .eq('school_id', schoolId)
    .eq('staff_id', staffId)
    .eq('academic_year_id', yearId);
  if (aErr) throw new Error(aErr.message);
  const classNames = Array.from(new Set(
    ((assigns ?? []) as { class_name: string }[])
      .map(r => r.class_name).filter(Boolean),
  ));
  if (!classNames.length) return [];

  // class_name in staff_class_assignments is "Class 10-A" or "Class 10" — try both.
  // Build {class_name, section} pairs to match against the sections table.
  const directMatches = await supabase
    .from('sections')
    .select('id, class_name, section')
    .eq('school_id', schoolId)
    .eq('academic_year_id', yearId);
  const sectionRows = ((directMatches.data ?? []) as { id: string; class_name: string; section: string }[]);

  return sectionRows
    .filter(s => classNames.some(cn =>
      cn === `${s.class_name}-${s.section}` ||
      cn === `${s.class_name} ${s.section}` ||
      cn === s.class_name,
    ))
    .map(s => s.id);
}

// ─── Class & student loaders ────────────────────────────────────────────────

interface SectionRow { id: string; class_name: string; section: string; }
interface StudentRow {
  id: string; name: string; section_id: string; roll_no: string | null;
}

async function loadSectionsByIds(sectionIds: string[]): Promise<SectionRow[]> {
  if (!sectionIds.length) return [];
  const schoolId = getSchoolId();
  const { data, error } = await supabase
    .from('sections').select('id, class_name, section')
    .eq('school_id', schoolId).in('id', sectionIds);
  if (error) throw new Error(error.message);
  return (data ?? []) as SectionRow[];
}

interface AcademicRecRow {
  student_id: string;
  section_id: string | null;
  roll_no: string | null;
  students: { id: string; name: string; is_active: boolean } | null;
}

async function loadStudentsForSections(sectionIds: string[]): Promise<Map<string, AttendanceStudent[]>> {
  const map = new Map<string, AttendanceStudent[]>();
  if (!sectionIds.length) return map;
  const yearId = await getActiveYearId();
  const { data, error } = await supabase
    .from('student_academic_records')
    .select('student_id, section_id, roll_no, students!inner(id, name, is_active)')
    .eq('academic_year_id', yearId)
    .in('section_id', sectionIds);
  if (error) throw new Error(error.message);
  for (const r of ((data ?? []) as unknown as AcademicRecRow[])) {
    if (!r.section_id || !r.students || !r.students.is_active) continue;
    const list = map.get(r.section_id) ?? [];
    list.push({
      id: r.student_id,
      name: r.students.name,
      rollNo: r.roll_no ?? '',
      isPresent: null,
    });
    map.set(r.section_id, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => {
      const ar = parseInt(a.rollNo, 10); const br = parseInt(b.rollNo, 10);
      if (Number.isFinite(ar) && Number.isFinite(br)) return ar - br;
      return a.name.localeCompare(b.name);
    });
  }
  return map;
}

// ─── Mappers ────────────────────────────────────────────────────────────────

interface AttendanceRecRow {
  id: string;
  section_id: string | null;
  class_name: string | null;
  section: string | null;
  date: string;
  total_present: number;
  total_absent: number;
  total_students: number;
  approval_status: string;
  is_locked: boolean;
}

interface TestRow {
  id: string;
  section_id: string | null;
  class_name: string | null;
  section: string | null;
  subject: string | null;
  test_type: string;
  title: string;
  scheduled_date: string | null;
  duration: number | null;
  max_marks: number | null;
  syllabus: string | null;
  results_uploaded: boolean;
  result_status?: string | null;
}

function rowToTest(r: TestRow): TestSchedule {
  const status = (r.result_status as TestSchedule['resultStatus']) ?? 'DRAFT';
  return {
    id: r.id,
    classId: r.section_id ?? '',
    className: r.class_name ?? '',
    section: r.section ?? '',
    subject: r.subject ?? '',
    testType: (r.test_type as TestType) ?? 'UNIT_TEST',
    title: r.title,
    scheduledDate: r.scheduled_date ?? '',
    duration: r.duration ?? 0,
    maxMarks: r.max_marks ?? 0,
    syllabus: r.syllabus ?? '',
    resultsUploaded: r.results_uploaded,
    resultStatus: status,
  };
}

interface ComplaintRow {
  id: string;
  subject: string;
  description: string | null;
  status: string;
  response: string | null;
  created_at: string;
  resolved_at: string | null;
}

function rowToComplaint(r: ComplaintRow): TeacherComplaint {
  // Defensive mapping: legacy 'OPEN'/'IN_PROGRESS' values still exist in
  // the wild before migration 0033 backfills them on this environment.
  const raw = (r.status ?? '').toUpperCase();
  let status: TeacherComplaint['status'];
  if (raw === 'OPEN') status = 'PENDING';
  else if (raw === 'IN_PROGRESS') status = 'IN_REVIEW';
  else if (raw === 'PENDING' || raw === 'IN_REVIEW' ||
           raw === 'RESOLVED' || raw === 'REJECTED') {
    status = raw as TeacherComplaint['status'];
  } else status = 'PENDING';

  return {
    id: r.id,
    subject: r.subject,
    description: r.description ?? '',
    status,
    createdAt: (r.resolved_at ?? r.created_at).slice(0, 10),
    response: r.response,
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────

// Salvage near-JSON output from Gemini exam-paper prompts. Tried in
// order:
//   1. stripJsonFence + raw JSON.parse (the happy path)
//   2. extract the largest balanced {...} substring (drops trailing
//      prose like "Here is your paper:" / "Hope this helps!" that
//      Gemini sometimes appends after the JSON)
//   3. light repairs: smart quotes → straight, trailing commas
//      removed, then parse again
// Returns null only when every strategy fails — caller toasts a
// retry hint instead of burning the user's quota silently.
type ParsedPaper = {
  sections: Array<{
    title: string;
    instructions?: string;
    questions: Array<{ no?: number; text: string; marks: number; type?: string; options?: unknown }>;
  }>;
};
function tryParsePaperJson(raw: string): ParsedPaper | null {
  const candidates: string[] = [];
  const cleaned = stripJsonFence(raw).trim();
  candidates.push(cleaned);

  // Largest balanced {…} block — handles "intro… { json } …closing".
  const firstBrace = cleaned.indexOf('{');
  const lastBrace  = cleaned.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(cleaned.slice(firstBrace, lastBrace + 1));
  }

  // Light repairs applied to the largest brace block.
  if (candidates[1]) {
    const repaired = candidates[1]
      .replace(/[“”]/g, '"')   // smart double quotes
      .replace(/[‘’]/g, "'")    // smart single quotes
      .replace(/,(\s*[}\]])/g, '$1');     // trailing commas
    candidates.push(repaired);
  }

  for (const c of candidates) {
    try {
      const obj = JSON.parse(c) as ParsedPaper;
      if (obj && Array.isArray(obj.sections)) return obj;
    } catch { /* try the next candidate */ }
  }
  return null;
}

const TODAY_DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Mirror of `DEFAULT_SLOTS` in modules/timetable/timetable.service.ts. When
// the school hasn't persisted custom periods we still need to resolve slot
// IDs ('p1', 'assembly', ...) to their default times. Keep this in sync if
// the principal-side defaults change.
const DEFAULT_SLOT_BY_ID: Record<string, { name: string; start_time: string; end_time: string; period_type: string; sort_order: number }> = {
  assembly: { name: 'Assembly',     start_time: '08:00', end_time: '08:20', period_type: 'ASSEMBLY', sort_order: 0 },
  p1:       { name: 'Period 1',     start_time: '08:20', end_time: '09:05', period_type: 'CLASS',    sort_order: 1 },
  p2:       { name: 'Period 2',     start_time: '09:05', end_time: '09:50', period_type: 'CLASS',    sort_order: 2 },
  break:    { name: 'Short Break',  start_time: '09:50', end_time: '10:05', period_type: 'BREAK',    sort_order: 3 },
  p3:       { name: 'Period 3',     start_time: '10:05', end_time: '10:50', period_type: 'CLASS',    sort_order: 4 },
  p4:       { name: 'Period 4',     start_time: '10:50', end_time: '11:35', period_type: 'CLASS',    sort_order: 5 },
  lunch:    { name: 'Lunch Break',  start_time: '11:35', end_time: '12:15', period_type: 'LUNCH',    sort_order: 6 },
  p5:       { name: 'Period 5',     start_time: '12:15', end_time: '13:00', period_type: 'CLASS',    sort_order: 7 },
  p6:       { name: 'Period 6',     start_time: '13:00', end_time: '13:45', period_type: 'CLASS',    sort_order: 8 },
};

export const teacherService = {
  // ── Classes ───────────────────────────────────────────────────────────────

  async getClasses(): Promise<TeacherClass[]> {
    const sectionIds = await resolveMySectionIds();
    if (!sectionIds.length) return [];
    const [{ subject }, sections, studentMap] = await Promise.all([
      getMyStaff(),
      loadSectionsByIds(sectionIds),
      loadStudentsForSections(sectionIds),
    ]);
    return sections.map<TeacherClass>(s => {
      const students = studentMap.get(s.id) ?? [];
      return {
        id: s.id,
        className: s.class_name,
        section: s.section,
        subject: subject || 'Multi-subject',
        studentCount: students.length,
        students,
      };
    }).sort((a, b) => a.className.localeCompare(b.className) || a.section.localeCompare(b.section));
  },

  // ── Birthdays ─────────────────────────────────────────────────────────────
  //
  // Same shape as the principal's old birthday widget (which was removed
  // because principals don't usually wish students personally), but scoped
  // to the sections this teacher actually teaches. Returns at most 8 rows
  // for the next 7 days.
  async getMyStudentBirthdays(): Promise<Array<{
    id: string; name: string; className: string; section: string;
    dob: string; daysAway: number; isToday: boolean;
  }>> {
    const sectionIds = await resolveMySectionIds();
    if (!sectionIds.length) return [];
    const yearId = await getActiveYearId();
    const { data, error } = await supabase
      .from('student_academic_records')
      .select('student_id, class_name, section, students!inner(id, name, dob, is_active)')
      .eq('academic_year_id', yearId)
      .in('section_id', sectionIds);
    if (error) throw new Error(error.message);

    type Row = {
      student_id: string; class_name: string | null; section: string | null;
      students: { id: string; name: string; dob: string | null; is_active: boolean }
              | { id: string; name: string; dob: string | null; is_active: boolean }[]
              | null;
    };
    const today = new Date(); today.setHours(0, 0, 0, 0);

    return ((data ?? []) as unknown as Row[])
      .map(r => {
        const stu = Array.isArray(r.students) ? r.students[0] : r.students;
        if (!stu || !stu.is_active || !stu.dob) return null;
        const dob = new Date(stu.dob);
        if (Number.isNaN(dob.getTime())) return null;
        const next = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
        if (next < today) next.setFullYear(today.getFullYear() + 1);
        const daysAway = Math.round((next.getTime() - today.getTime()) / 86400000);
        if (daysAway > 7) return null;
        return {
          id: stu.id, name: stu.name, className: r.class_name ?? '',
          section: r.section ?? '', dob: stu.dob,
          daysAway, isToday: daysAway === 0,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => a.daysAway - b.daysAway)
      .slice(0, 8);
  },

  // ── Attendance ────────────────────────────────────────────────────────────

  /** Past attendance records by this teacher (newest first). */
  async getAttendanceHistory(): Promise<AttendanceRecord[]> {
    const schoolId = getSchoolId();
    const yearId = await getActiveYearId();
    const userId = getUserId();
    const sectionIds = await resolveMySectionIds();
    if (!sectionIds.length) return [];

    const { data, error } = await supabase
      .from('attendance_records')
      .select('id, section_id, class_name, section, date, total_present, total_absent, total_students, approval_status, is_locked')
      .eq('school_id', schoolId).eq('academic_year_id', yearId)
      .eq('marked_by', userId)
      .in('section_id', sectionIds)
      .order('date', { ascending: false })
      .limit(60);
    if (error) throw new Error(error.message);

    const { subject } = await getMyStaff();
    const name = getUserName();
    return ((data ?? []) as AttendanceRecRow[]).map(r => ({
      id: r.id,
      classId: r.section_id ?? '',
      className: r.class_name ?? '',
      section: r.section ?? '',
      subject,
      date: r.date,
      totalPresent: r.total_present,
      totalAbsent: r.total_absent,
      totalStudents: r.total_students,
      markedBy: name,
    }));
  },

  /** Per-date status map for the date strip on a class detail screen. */
  async getStatusForClass(sectionId: string, dates: string[]): Promise<Record<string, DateAttendanceStatus>> {
    const out: Record<string, DateAttendanceStatus> = {};
    for (const d of dates) out[d] = 'NOT_MARKED';
    if (!dates.length) return out;
    const schoolId = getSchoolId();
    const yearId = await getActiveYearId();
    const { data, error } = await supabase
      .from('attendance_records')
      .select('date, approval_status')
      .eq('school_id', schoolId).eq('academic_year_id', yearId)
      .eq('section_id', sectionId).in('date', dates);
    if (error) throw new Error(error.message);
    for (const r of ((data ?? []) as { date: string; approval_status: string }[])) {
      if (r.approval_status === 'APPROVED') out[r.date] = 'APPROVED';
      else if (r.approval_status === 'PENDING') out[r.date] = 'PENDING';
      // REJECTED → leave as NOT_MARKED so teacher can re-mark
    }
    return out;
  },

  /** Full record (with per-student rows) for a single class+date. */
  async getRecordByClassAndDate(
    sectionId: string, date: string, classMeta: { className: string; section: string; subject: string },
  ): Promise<{
    id: string; status: 'PENDING' | 'APPROVED' | 'REJECTED'; isLocked: boolean;
    students: { id: string; name: string; rollNo: string; isPresent: boolean }[];
    totalPresent: number; totalAbsent: number; totalStudents: number;
    classId: string; className: string; section: string; subject: string; date: string;
    markedBy: string;
  } | null> {
    const schoolId = getSchoolId();
    const yearId = await getActiveYearId();
    const { data, error } = await supabase
      .from('attendance_records')
      .select('id, approval_status, is_locked, total_present, total_absent, total_students')
      .eq('school_id', schoolId).eq('academic_year_id', yearId)
      .eq('section_id', sectionId).eq('date', date)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const rec = data as { id: string; approval_status: string; is_locked: boolean; total_present: number; total_absent: number; total_students: number };

    const { data: details, error: dErr } = await supabase
      .from('attendance_student_details')
      .select('student_id, is_present, students!inner(id, name)')
      .eq('attendance_id', rec.id);
    if (dErr) throw new Error(dErr.message);

    // Roll numbers from student_academic_records (year-scoped)
    const stuIds = ((details ?? []) as unknown as { student_id: string }[]).map(d => d.student_id);
    const rollMap = new Map<string, string>();
    if (stuIds.length) {
      const { data: ar } = await supabase
        .from('student_academic_records')
        .select('student_id, roll_no')
        .eq('academic_year_id', yearId)
        .in('student_id', stuIds);
      for (const r of ((ar ?? []) as { student_id: string; roll_no: string | null }[])) {
        rollMap.set(r.student_id, r.roll_no ?? '');
      }
    }

    type DetailJoin = { student_id: string; is_present: boolean; students: { id: string; name: string } | null };
    const students = ((details ?? []) as unknown as DetailJoin[])
      .filter(d => d.students)
      .map(d => ({
        id: d.student_id,
        name: d.students!.name,
        rollNo: rollMap.get(d.student_id) ?? '',
        isPresent: d.is_present,
      }))
      .sort((a, b) => {
        const ar = parseInt(a.rollNo, 10); const br = parseInt(b.rollNo, 10);
        if (Number.isFinite(ar) && Number.isFinite(br)) return ar - br;
        return a.name.localeCompare(b.name);
      });

    return {
      id: rec.id,
      status: (rec.approval_status as 'PENDING' | 'APPROVED' | 'REJECTED'),
      isLocked: rec.is_locked,
      students,
      totalPresent: rec.total_present,
      totalAbsent: rec.total_absent,
      totalStudents: rec.total_students,
      classId: sectionId,
      className: classMeta.className,
      section: classMeta.section,
      subject: classMeta.subject,
      date,
      markedBy: getUserName(),
    };
  },

  /**
   * Submit attendance for a class on a date. Inserts the parent record (UNIQUE
   * on section_id+date — duplicates rejected by DB) and the per-student rows.
   * After submission the record is teacher-read-only — only the principal can
   * approve/reject/edit via the approval flow.
   */
  async submitAttendance(
    sectionId: string,
    date: string,
    students: { id: string; isPresent?: boolean; status?: import('@/lib/apiClient').AttendanceCellStatus }[],
  ): Promise<{ id: string }> {
    const sectionIds = await resolveMySectionIds();
    if (!sectionIds.includes(sectionId)) {
      throw new Error('You are not assigned to this class');
    }

    // Use the server-side API route so status is written correctly.
    const { apiAttendance } = await import('@/lib/apiClient');
    const res = await apiAttendance.submit({
      sectionId,
      date,
      records: students.map(s => ({
        studentId: s.id,
        status: s.status ?? (s.isPresent !== undefined ? (s.isPresent ? 'present' : 'absent') : 'absent'),
      })),
    });

    // attendance_submitted audit removed — high-volume, low-signal. See
    // attendance.service.ts for the same change rationale.
    return { id: res.attendanceId };
  },

  /** Grid data for a class/section within a date range (teacher view). */
  async getGridForClass(
    sectionId: string, startDate: string, endDate: string,
  ) {
    const { sharedAttendance } = await import('@/modules/attendance/attendance.service');
    return sharedAttendance.getGrid(sectionId, startDate, endDate);
  },

  // ── Tests / Exams ─────────────────────────────────────────────────────────

  async getTests(): Promise<TestSchedule[]> {
    const schoolId = getSchoolId();
    const yearId = await getActiveYearId();
    const { staffId } = await getMyStaff();
    const { data, error } = await supabase
      .from('test_schedules')
      .select('id, section_id, class_name, section, subject, test_type, title, scheduled_date, duration, max_marks, syllabus, results_uploaded, result_status')
      .eq('school_id', schoolId).eq('academic_year_id', yearId)
      .eq('teacher_id', staffId)
      .order('scheduled_date', { ascending: false });
    if (error) throw new Error(error.message);
    const tests = ((data ?? []) as TestRow[]).map(rowToTest);
    return tests;
  },

  async createTest(input: Omit<TestSchedule, 'id' | 'resultsUploaded' | 'resultStatus'>): Promise<TestSchedule> {
    const yearId = await getActiveYearId();
    const { staffId } = await getMyStaff();
    const sectionIds = await resolveMySectionIds();
    if (input.classId && !sectionIds.includes(input.classId)) {
      throw new Error('You are not assigned to this class');
    }
    const { apiTeacher } = await import('@/lib/apiClient');
    const data = await apiTeacher.createTest({
      academicYearId: yearId,
      sectionId: input.classId || null,
      teacherId: staffId,
      className: input.className,
      section: input.section,
      subject: input.subject,
      testType: input.testType,
      title: input.title,
      scheduledDate: input.scheduledDate || null,
      duration: input.duration,
      maxMarks: input.maxMarks,
      syllabus: input.syllabus,
    });
    const test = rowToTest(data as TestRow);
    await logAudit('test_created', 'test_schedules', test.id, { title: test.title });
    return test;
  },

  /** Fetch already-uploaded exam results for a test so the teacher can review
   *  what they submitted. RLS allows teachers SELECT on exam_results within
   *  their school. Returns a map of studentId -> { obtainedMarks, remarks }. */
  async getResultsByTest(testId: string): Promise<Record<string, { obtainedMarks: number; remarks: string | null }>> {
    const { data, error } = await supabase
      .from('exam_results')
      .select('student_id, obtained_marks, remarks')
      .eq('test_id', testId);
    if (error) throw new Error(error.message);
    const map: Record<string, { obtainedMarks: number; remarks: string | null }> = {};
    for (const r of (data ?? []) as { student_id: string; obtained_marks: number; remarks: string | null }[]) {
      map[r.student_id] = { obtainedMarks: r.obtained_marks, remarks: r.remarks };
    }
    return map;
  },

  async publishResults(payload: PublishResultsInput): Promise<void> {
    const yearId = await getActiveYearId();
    // Goes through the server because RLS blocks direct teacher writes to
    // exam_results / test_schedules. Server uses adminDb after verifying the
    // test belongs to the caller's school.
    const { apiTeacher } = await import('@/lib/apiClient');
    await apiTeacher.publishResults({
      testId: payload.testId,
      academicYearId: yearId,
      results: payload.studentResults.map(r => ({
        studentId: r.studentId,
        obtainedMarks: r.obtainedMarks,
        remarks: r.note || null,
      })),
    });
    await logAudit('test_results_published', 'test_schedules', payload.testId, { count: payload.studentResults.length });
  },

  // ── Final exams (delegated to shared bridge — no DB table yet) ───────────
  // These remain in-memory until a dedicated final-exam table lands. The
  // bridge keeps principal/student modules visible.

  async getFinalExams(): Promise<FinalExamSchedule[]> {
    return [];
  },

  async createFinalExam(input: Omit<FinalExamSchedule, 'id' | 'resultsUploaded'>): Promise<FinalExamSchedule> {
    const exam: FinalExamSchedule = { ...input, id: `fe_${Date.now()}`, resultsUploaded: false };
    return exam;
  },

  async publishFinalExamResults(_payload: FinalExamPublishInput): Promise<void> {
    // No-op: dedicated final-exam table not yet provisioned.
  },

  // ── Complaints (mine only) ────────────────────────────────────────────────

  async getComplaints(): Promise<TeacherComplaint[]> {
    const schoolId = getSchoolId();
    const userId = getUserId();
    const { data, error } = await supabase
      .from('complaints')
      .select('id, subject, description, status, response, created_at, resolved_at')
      .eq('school_id', schoolId)
      .eq('from_user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as ComplaintRow[]).map(rowToComplaint);
  },

  async submitComplaint(subject: string, description: string): Promise<TeacherComplaint> {
    const name = getUserName();
    const { apiTeacher } = await import('@/lib/apiClient');
    const data = await apiTeacher.submitComplaint({ subject, description, fromName: name });
    await logAudit('complaint_filed', 'complaints', (data as { id: string }).id, { subject });
    return rowToComplaint(data as ComplaintRow);
  },

  // ── Notices (sent by me) ──────────────────────────────────────────────────

  /**
   * Notices visible to the signed-in teacher:
   *   - school-wide broadcasts:   audience IN ('ALL', 'TEACHERS')
   *   - section-targeted notices: audience LIKE 'SECTION:<my-section-id>:%' for any of my sections
   *   - notices the teacher sent themselves (so they appear immediately after creation)
   * Sorted newest first.
   */
  async getMyNotices(): Promise<Array<{
    id: string; title: string; body: string;
    targetClass: string; targetSection: string;
    sentAt: string; type: 'HOMEWORK' | 'EXAM' | 'GENERAL';
    sentByName: string; isMine: boolean;
  }>> {
    const schoolId = getSchoolId();
    const userId = getUserId();
    const sectionIds = await resolveMySectionIds().catch(() => [] as string[]);

    // Build a single OR filter — section ids are UUIDs so safe to embed.
    // STAFF audience covers all non-student staff (teachers + others).
    const orParts = [
      'audience.eq.ALL',
      'audience.eq.TEACHERS',
      'audience.eq.STAFF',
      `sent_by.eq.${userId}`,
      ...sectionIds.map(sid => `audience.like.SECTION:${sid}:%`),
    ];

    const { data, error } = await supabase
      .from('notices')
      .select('id, title, body, audience, sent_at, sent_by, sent_by_name, is_active')
      .eq('school_id', schoolId)
      .eq('is_active', true)
      .or(orParts.join(','))
      .order('sent_at', { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);

    type Row = {
      id: string; title: string; body: string; audience: string;
      sent_at: string; sent_by: string | null; sent_by_name: string | null;
    };
    const rows = (data ?? []) as Row[];

    return rows.map(r => {
      // SECTION:<sectionId>:<className>:<section>:<type>
      let className = '';
      let section = '';
      let type: 'HOMEWORK' | 'EXAM' | 'GENERAL' = 'GENERAL';
      if (r.audience.startsWith('SECTION:')) {
        const parts = r.audience.split(':');
        className = parts[2] ?? '';
        section   = parts[3] ?? '';
        const t   = parts[4];
        if (t === 'HOMEWORK' || t === 'EXAM' || t === 'GENERAL') type = t;
      } else {
        // Audience-label rendering for non-section notices (ALL / TEACHERS / etc.)
        className = r.audience === 'ALL' ? 'School-wide' : r.audience;
        section   = '';
      }
      return {
        id: r.id, title: r.title, body: r.body,
        targetClass: className, targetSection: section,
        sentAt: r.sent_at.slice(0, 10),
        type,
        sentByName: r.sent_by_name ?? '',
        isMine: r.sent_by === userId,
      };
    });
  },

  async createNotice(input: {
    title: string; body: string;
    targetSectionId: string; targetClass: string; targetSection: string;
    type: 'HOMEWORK' | 'EXAM' | 'GENERAL';
  }): Promise<{ id: string }> {
    const name = getUserName();
    const sectionIds = await resolveMySectionIds();
    if (!sectionIds.includes(input.targetSectionId)) {
      throw new Error('You are not assigned to this class');
    }
    const audience = `SECTION:${input.targetSectionId}:${input.targetClass}:${input.targetSection}:${input.type}`;
    const { apiTeacher } = await import('@/lib/apiClient');
    const row = await apiTeacher.createNotice({
      title: input.title,
      body: input.body,
      audience,
      sentByName: name,
    });
    await logAudit('notice_sent', 'notices', row.id, { title: input.title, audience });
    return { id: row.id };
  },

  // ── Timetable ─────────────────────────────────────────────────────────────

  /** Full week of entries belonging to this teacher (joined with section meta). */
  async getMyTimetable(): Promise<Array<{
    id: string; classId: string; className: string; section: string;
    day: string; slotId: string; subject: string; room: string;
  }>> {
    const schoolId = getSchoolId();
    const yearId = await getActiveYearId();
    const { staffId } = await getMyStaff();
    const { data, error } = await supabase
      .from('timetable_entries')
      .select('id, class_id, day, slot_id, subject, room, sections(class_name, section)')
      .eq('school_id', schoolId)
      .eq('academic_year_id', yearId)
      .eq('teacher_id', staffId);
    if (error) throw new Error(error.message);
    type Row = {
      id: string; class_id: string; day: string; slot_id: string;
      subject: string | null; room: string | null;
      sections: { class_name: string; section: string } | null;
    };
    return ((data ?? []) as unknown as Row[]).map(r => ({
      id: r.id,
      classId: r.class_id,
      className: r.sections?.class_name ?? '',
      section: r.sections?.section ?? '',
      day: r.day,
      slotId: r.slot_id,
      subject: r.subject ?? '',
      room: r.room ?? '',
    }));
  },

  /** Today's entries with period times attached (sorted by start). When the
   *  school hasn't persisted custom periods to `timetable_periods`, we fall
   *  back to the same DEFAULT_SLOTS the principal-side TimetableManager
   *  uses so the dashboard isn't blank just because the periods table is
   *  empty (this was the actual cause of the empty teacher dashboard). */
  async getTodayClasses(): Promise<Array<{
    id: string; classId: string; className: string; section: string;
    subject: string; room: string;
    slot: { startTime: string; endTime: string; label: string };
  }>> {
    const today = TODAY_DAY_NAMES[new Date().getDay()];
    const entries = await this.getMyTimetable();
    const schoolId = getSchoolId();
    const yearId = await getActiveYearId();
    const { data: periodData } = await supabase
      .from('timetable_periods')
      .select('id, name, start_time, end_time')
      .eq('school_id', schoolId).eq('academic_year_id', yearId);
    const periodMap = new Map<string, { name: string; start_time: string; end_time: string }>();
    for (const p of ((periodData ?? []) as { id: string; name: string; start_time: string; end_time: string }[])) {
      periodMap.set(p.id, p);
    }

    return entries
      .filter(e => e.day === today)
      .map(e => {
        const p = periodMap.get(e.slotId) ?? DEFAULT_SLOT_BY_ID[e.slotId.toLowerCase()];
        return {
          id: e.id,
          classId: e.classId,
          className: e.className,
          section: e.section,
          subject: e.subject,
          room: e.room,
          slot: {
            startTime: p?.start_time ?? '00:00',
            endTime: p?.end_time ?? '00:00',
            label: p?.name ?? e.slotId,
          },
        };
      })
      .filter(e => e.slot.startTime !== '00:00')
      .sort((a, b) => a.slot.startTime.localeCompare(b.slot.startTime));
  },

  // ── AI Exam Paper Generator ───────────────────────────────────────────────

  async generateExamPaper(request: ExamPaperRequest): Promise<GeneratedExamPaper> {
    // Hydrate schoolName + board from the school row so the prompt can
    // include curriculum context AND the saved history row carries
    // them. UI doesn't need to ask the teacher every time.
    let enriched = request;
    if (!request.schoolName || !request.board) {
      try {
        const schoolId = getSchoolId();
        const { data } = await supabase.from('schools')
          .select('name, affiliation_board').eq('id', schoolId).maybeSingle();
        const row = data as { name: string | null; affiliation_board: string | null } | null;
        enriched = {
          ...request,
          schoolName: request.schoolName ?? row?.name ?? '',
          board:      request.board ?? row?.affiliation_board ?? '',
        };
      } catch { /* fallback to original request */ }
    }
    const prompt = buildExamPrompt(enriched);
    let raw: string;
    try {
      // generatePaper (vs generateText) enables the server-side
      // monthly-quota check and writes the result into the school's
      // last-50-papers history table.
      raw = await generatePaper(prompt, enriched as unknown as Record<string, unknown>);
    } catch (err) {
      if (err instanceof GeminiUnavailableError) throw err;
      throw new Error(err instanceof Error ? err.message : 'AI generation failed');
    }
    // Gemini occasionally returns near-JSON: trailing prose after the
    // payload, smart quotes, trailing commas, or a partial object on
    // long generations. Run a few cheap repairs before giving up so a
    // single sloppy response doesn't waste the user's quota.
    const parsed = tryParsePaperJson(raw);
    if (!parsed) {
      throw new Error('AI returned an unparseable response — please try again. Topic ko thoda chhota karke retry karein.');
    }

    type RawQ = { no?: number; text: string; marks: number; type?: string; options?: unknown };
    const sections: ExamSection[] = (parsed.sections ?? []).map(sec => {
      const qs: ExamQuestion[] = ((sec.questions ?? []) as RawQ[]).map((q, i) => {
        const type = ((['MCQ', 'SHORT', 'LONG', 'DIAGRAM']).includes(q.type ?? '')
          ? q.type
          : 'SHORT') as ExamQuestion['type'];
        // MCQ options come back as either an array of strings or
        // { A: '...', B: '...' } object — normalise both. Trim each
        // option and drop empties so the renderer doesn't show
        // ghost choices.
        let options: string[] | undefined;
        if (type === 'MCQ' && q.options) {
          if (Array.isArray(q.options)) {
            options = q.options.map(o => String(o).trim()).filter(Boolean);
          } else if (typeof q.options === 'object') {
            options = Object.values(q.options as Record<string, unknown>)
              .map(o => String(o).trim()).filter(Boolean);
          }
          if (options && options.length === 0) options = undefined;
        }
        return {
          no: q.no ?? i + 1,
          text: q.text,
          marks: q.marks,
          type,
          ...(options ? { options } : {}),
        };
      });
      return {
        title: sec.title,
        instructions: sec.instructions ?? '',
        marks: qs.reduce((a, q) => a + q.marks, 0),
        questions: qs,
      };
    });

    const schoolId = getSchoolId();
    const userId = getUserId();
    const { data: row, error: insErr } = await supabase
      .from('generated_question_papers')
      .insert({
        school_id: schoolId,
        created_by: userId,
        subject: request.subject,
        class_name: request.className,
        request: request as unknown as Record<string, unknown>,
        sections: sections as unknown as Record<string, unknown>[],
      })
      .select('id, created_at')
      .single();
    if (insErr) throw new Error(insErr.message);
    const persisted = row as { id: string; created_at: string };

    const paper: GeneratedExamPaper = {
      id: persisted.id,
      request,
      generatedAt: persisted.created_at,
      sections,
    };
    return paper;
  },

  /**
   * Extract structured exam paper from one-or-more uploaded image(s) of a
   * physical/printed paper (handwritten or typed). Sends the images to
   * Gemini Vision with a strict JSON schema prompt; persists the parsed
   * paper so it shows up alongside prompt-generated ones in Saved Papers.
   *
   * `meta` carries the same fields the request would have if the user had
   * generated via prompt — these aren't visible in the image, so the
   * teacher fills them once on the form.
   */
  async extractPaperFromImages(
    images: Array<{ mimeType: string; data: string }>,
    meta: {
      className: string; subject: string; totalMarks: number; duration: number;
      difficulty: ExamPaperRequest['difficulty']; testType?: ExamPaperRequest['testType'];
    },
  ): Promise<GeneratedExamPaper> {
    if (images.length === 0) throw new Error('At least one image required');

    const prompt = `You are an OCR + exam-paper parser.
Given the attached image(s) of a question paper, EXTRACT every question into structured JSON.

Return ONLY valid JSON with this shape (no prose, no markdown fence):
{
  "sections": [
    {
      "title": "Section A — Multiple Choice",
      "instructions": "Choose the correct option…",
      "questions": [
        { "no": 1, "text": "What is …?", "marks": 1, "type": "MCQ" }
      ]
    }
  ]
}

Rules:
- Preserve the original question wording verbatim. Don't summarise, don't translate.
- "type" must be one of MCQ | SHORT | LONG | DIAGRAM. Infer from context (multiple-choice → MCQ, 2-3 line questions → SHORT, essay-style → LONG, "draw/label" → DIAGRAM).
- If marks are not explicitly written, distribute the section's total marks evenly across its questions. If neither is shown, default to 1 mark per question.
- If sections aren't labelled in the paper, group questions by type into reasonable sections.
- If the image is blurry/unreadable in places, do your best — never invent questions that aren't on the page.

Subject: ${meta.subject}
Class: ${meta.className}
`;

    let raw: string;
    try {
      raw = await generateFromImages(prompt, images);
    } catch (err) {
      if (err instanceof GeminiUnavailableError) throw err;
      throw new Error(err instanceof Error ? err.message : 'AI extraction failed');
    }

    const cleaned = stripJsonFence(raw);
    let parsed: { sections: Array<{ title: string; instructions?: string; questions: Array<{ no?: number; text: string; marks: number; type?: string }> }> };
    try { parsed = JSON.parse(cleaned); }
    catch { throw new Error('AI returned an unparseable response — please retry with a clearer image'); }

    const sections: ExamSection[] = (parsed.sections ?? []).map(sec => {
      const qs: ExamQuestion[] = (sec.questions ?? []).map((q, i) => ({
        no: q.no ?? i + 1,
        text: q.text,
        marks: q.marks,
        type: ((['MCQ', 'SHORT', 'LONG', 'DIAGRAM']).includes(q.type ?? '') ? q.type : 'SHORT') as ExamQuestion['type'],
      }));
      return {
        title: sec.title,
        instructions: sec.instructions ?? '',
        marks: qs.reduce((a, q) => a + q.marks, 0),
        questions: qs,
      };
    });

    if (sections.length === 0 || sections.every(s => s.questions.length === 0)) {
      throw new Error('No questions detected in the image — try a clearer photo');
    }

    // Build a synthetic request so the persisted row matches the shape used
    // by prompt-generated papers; "topics" carries a marker so the UI/admin
    // can tell scanned papers apart from generated ones.
    const request: ExamPaperRequest = {
      className: meta.className,
      subject: meta.subject,
      testType: meta.testType ?? 'UNIT_TEST',
      totalMarks: meta.totalMarks,
      duration: meta.duration,
      difficulty: meta.difficulty,
      topics: '__scanned__',
    };

    const schoolId = getSchoolId();
    const userId = getUserId();
    const { data: row, error: insErr } = await supabase
      .from('generated_question_papers')
      .insert({
        school_id: schoolId,
        created_by: userId,
        subject: request.subject,
        class_name: request.className,
        request: request as unknown as Record<string, unknown>,
        sections: sections as unknown as Record<string, unknown>[],
      })
      .select('id, created_at')
      .single();
    if (insErr) throw new Error(insErr.message);
    const persisted = row as { id: string; created_at: string };

    return {
      id: persisted.id,
      request,
      generatedAt: persisted.created_at,
      sections,
    };
  },

  /**
   * Persist user edits to a previously-generated/scanned paper. Writes the
   * (edited) sections array back; `request` shape stays untouched so
   * downstream consumers (saved-papers list, print) keep rendering.
   */
  async updateGeneratedPaper(paperId: string, sections: ExamSection[]): Promise<void> {
    // Scope the update to rows this teacher owns. Earlier the .eq('id',
    // paperId) was the only filter — RLS on generated_question_papers
    // permitted any same-school teacher to UPDATE, so Teacher A could
    // silently rewrite Teacher B's saved paper. The created_by match
    // closes that gap at the query layer (defense in depth; tighten the
    // RLS write policy in a follow-up migration).
    const userId = getUserId();
    const { error, data } = await supabase
      .from('generated_question_papers')
      .update({ sections: sections as unknown as Record<string, unknown>[] })
      .eq('id', paperId)
      .eq('created_by', userId)
      .select('id');
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) {
      throw new Error('Paper not found or you are not its author');
    }
  },

  /** Rich student profiles for My Students view — includes admission no, phone, father name. */
  async getStudentProfiles(): Promise<Array<{
    id: string; name: string; rollNo: string; admissionNo: string;
    className: string; section: string; phone: string; fatherName: string;
  }>> {
    const sectionIds = await resolveMySectionIds();
    if (!sectionIds.length) return [];
    const yearId = await getActiveYearId();
    const sections = await loadSectionsByIds(sectionIds);
    const sectionMap = new Map(sections.map(s => [s.id, s]));

    type RichStudentRow = {
      student_id: string; section_id: string | null; roll_no: string | null;
      students: {
        id: string; name: string; is_active: boolean;
        phone: string | null; father_name: string | null; father_phone: string | null;
        admission_no: string;
      } | null;
    };

    const { data, error } = await supabase
      .from('student_academic_records')
      .select('student_id, section_id, roll_no, students!inner(id, name, is_active, phone, father_name, father_phone, admission_no)')
      .eq('academic_year_id', yearId)
      .in('section_id', sectionIds);
    if (error) throw new Error(error.message);

    const results: Array<{
      id: string; name: string; rollNo: string; admissionNo: string;
      className: string; section: string; phone: string; fatherName: string;
    }> = [];

    for (const r of ((data ?? []) as unknown as RichStudentRow[])) {
      if (!r.section_id || !r.students || !r.students.is_active) continue;
      const sec = sectionMap.get(r.section_id);
      results.push({
        id: r.student_id,
        name: r.students.name,
        rollNo: r.roll_no ?? '',
        admissionNo: r.students.admission_no ?? '',
        className: sec?.class_name ?? '',
        section: sec?.section ?? '',
        phone: r.students.father_phone || r.students.phone || '',
        fatherName: r.students.father_name ?? '',
      });
    }

    return results.sort((a, b) => {
      const cc = a.className.localeCompare(b.className) || a.section.localeCompare(b.section);
      if (cc !== 0) return cc;
      const ar = parseInt(a.rollNo, 10); const br = parseInt(b.rollNo, 10);
      if (Number.isFinite(ar) && Number.isFinite(br)) return ar - br;
      return a.name.localeCompare(b.name);
    });
  },

  /** Expose this teacher's staff row id + primary subject (cached). */
  async getMyStaffInfo(): Promise<{ staffId: string; subject: string }> {
    return getMyStaff();
  },

  /** Period slot definitions for this school's active year. Returns
   *  the school-default rows (class_name IS NULL) — per-class slots
   *  added by Customize mode are intentionally excluded here because
   *  the teacher day-view is a single chronological timeline; mixing
   *  Class 5's 9 AM slot with Class 11's 8 AM slot would render a
   *  confused two-track strip.
   *
   *  The teacher's actual scheduled periods (timetable_entries) still
   *  resolve correctly — they reference slot_id (UUID) directly, so
   *  even a class-specific slot's entry will display. The slot
   *  metadata for those entries gets joined in-memory via
   *  getMyTimetable's slots payload (separate code path). */
  async getPeriodSlots(): Promise<Array<{
    slotId: string; label: string; startTime: string; endTime: string;
    type: string; sortOrder: number;
  }>> {
    const schoolId = getSchoolId();
    const yearId = await getActiveYearId();
    const { data, error } = await supabase
      .from('timetable_periods')
      .select('id, name, start_time, end_time, period_type, sort_order, class_name')
      .eq('school_id', schoolId).eq('academic_year_id', yearId)
      .is('class_name', null)
      .order('sort_order');
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Array<{
      id: string; name: string; start_time: string; end_time: string;
      period_type: string; sort_order: number;
    }>;
    if (rows.length > 0) {
      return rows.map(r => ({
        slotId: r.id, label: r.name,
        startTime: r.start_time, endTime: r.end_time,
        type: r.period_type, sortOrder: r.sort_order,
      }));
    }
    return Object.entries(DEFAULT_SLOT_BY_ID).map(([slotId, p]) => ({
      slotId, label: p.name, startTime: p.start_time, endTime: p.end_time,
      type: p.period_type, sortOrder: p.sort_order,
    }));
  },

  /**
   * Subjects THIS teacher is responsible for in a given section, derived from real data:
   *   1. distinct `subject` values from `timetable_entries` where teacher_id = self
   *      and section_id = given (active year, school-scoped).
   *   2. plus this teacher's own primary subject from `staff` (so a newly-assigned
   *      teacher who has no timetable entries yet still has at least one subject).
   * Sorted, de-duplicated, never empty if the teacher has a subject.
   */
  async getSubjectsForSection(sectionId: string): Promise<string[]> {
    const schoolId = getSchoolId();
    const yearId = await getActiveYearId();
    const { staffId, subject } = await getMyStaff();
    const { data, error } = await supabase
      .from('timetable_entries')
      .select('subject')
      .eq('school_id', schoolId)
      .eq('academic_year_id', yearId)
      .eq('section_id', sectionId)
      .eq('teacher_id', staffId);
    if (error) throw new Error(error.message);
    const set = new Set<string>();
    for (const r of ((data ?? []) as { subject: string | null }[])) {
      const s = (r.subject ?? '').trim();
      if (s) set.add(s);
    }
    if (subject && subject.trim()) set.add(subject.trim());
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  },

  /** Papers the signed-in teacher generated themselves (true "My Papers"). */
  async getGeneratedPapers(): Promise<GeneratedExamPaper[]> {
    const schoolId = getSchoolId();
    const userId = getUserId();
    const { data, error } = await supabase
      .from('generated_question_papers')
      .select('id, request, sections, created_at')
      .eq('school_id', schoolId)
      .eq('created_by', userId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<{ id: string; request: ExamPaperRequest; sections: ExamSection[]; created_at: string }>)
      .map(r => ({ id: r.id, request: r.request, sections: r.sections, generatedAt: r.created_at }));
  },
};

function buildExamPrompt(req: ExamPaperRequest): string {
  const mcq   = Math.max(0, req.mcqCount   ?? 0);
  const short = Math.max(0, req.shortCount ?? 0);
  const long  = Math.max(0, req.longCount  ?? 0);
  const totalRequested = mcq + short + long;
  const paperType = req.paperType ?? 'MIX';
  const language  = req.language  ?? 'ENGLISH';

  // Exact counts override the paper-type breakdown.
  let breakdownLine: string;
  if (totalRequested > 0) {
    breakdownLine = `EXACT question counts (must match exactly):
- ${mcq} MCQ (1 mark each)
- ${short} short-answer (2-3 marks each)
- ${long} long-answer (5+ marks each)
Total questions: ${totalRequested}.`;
  } else if (paperType === 'MCQ_ONLY') {
    breakdownLine = `Paper type: MCQ ONLY. Every question must be a multiple-choice question carrying 1 mark, with 4 options labelled (a)-(d). Sum to exactly ${req.totalMarks} marks (so ${req.totalMarks} MCQs).`;
  } else if (paperType === 'SUBJECTIVE') {
    breakdownLine = `Paper type: SUBJECTIVE ONLY. No multiple-choice questions. Mix short-answer (2-3 marks) and long-answer (5-10 marks) — short questions FIRST in lower numbers, long questions after.`;
  } else {
    breakdownLine = `Paper type: MIX. Use this exact ORDER:
  1. Section A: Multiple-choice questions (MCQs, 1 mark each, 4 options)
  2. Section B: Short-answer questions (2-3 marks each)
  3. Section C: Long-answer questions (5+ marks each)
Pick a balanced count appropriate for ${req.totalMarks} total marks.`;
  }

  // Language directive. BILINGUAL = English first, Hindi (Devanagari)
  // translation in parentheses for each question.
  const languageLine =
    language === 'HINDI'     ? 'Write the entire paper in Hindi (Devanagari script).' :
    language === 'BILINGUAL' ? 'Write each question in English first, then add the Hindi (Devanagari) translation in parentheses on the next line.' :
                               'Write the paper in clear, exam-grade English.';

  // Board context — when present, Gemini picks board-aligned phrasing
  // (CBSE NCERT vocabulary, ICSE structure, state-board pattern, etc.).
  const boardLine = req.board ? `Board / curriculum: ${req.board}.` : '';

  // Optional school header for the printable PDF — appears at the top
  // of the rendered paper. AI doesn't need to render it, but we tell
  // it so it doesn't insert its own.
  const schoolHeaderNote = req.schoolName
    ? `The school name "${req.schoolName}" will be added to the header by the print template — do NOT include a school name in the JSON.`
    : '';

  return `You are an experienced Indian school teacher creating an examination paper.

Subject: ${req.subject}
Class: ${req.className}
${boardLine}
Test type: ${req.testType}
Total marks: ${req.totalMarks}
Duration: ${req.duration} minutes
Topics covered: ${req.topics}
Difficulty: ${req.difficulty}

${breakdownLine}

LANGUAGE: ${languageLine}

${schoolHeaderNote}

Generate the paper as a JSON object with this exact shape:
{
  "sections": [
    {
      "title": "Section A — Multiple Choice Questions",
      "instructions": "Choose the correct option. Each carries 1 mark.",
      "questions": [
        { "no": 1, "text": "…", "marks": 1, "type": "MCQ", "options": ["…","…","…","…"] }
      ]
    }
  ]
}

STRICT RULES (every one must be honoured):
- The sections array MUST appear in this order: MCQ section first, then Short, then Long. Skip any section that has zero questions.
- Question "type" must be one of: MCQ, SHORT, LONG, DIAGRAM.
- For MCQ entries, include an "options" array with exactly 4 strings; the question text must NOT pre-mark the right answer.
- Number questions sequentially (1,2,3…) within each section starting from 1.
- The sum of marks across every section MUST equal ${req.totalMarks}.
- Use authentic textbook-style language for ${req.className}-level ${req.subject}, aligned to the topics and the board's syllabus.
- Return ONLY the JSON object — no preamble, no commentary, no markdown code fences.`;
}
