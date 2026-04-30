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

import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { useEditingYearStore } from '../store/editingYearStore';
import { logAudit } from '../lib/audit';
import { generateText, stripJsonFence, GeminiUnavailableError } from '../lib/gemini';
import type { PublishResultsInput, FinalExamPublishInput } from '../types/teacher.types';
import type {
  TeacherClass,
  AttendanceStudent,
  AttendanceRecord,
  TestSchedule,
  TestType,
  HomeworkItem,
  TeacherComplaint,
  ExamPaperRequest,
  GeneratedExamPaper,
  ExamSection,
  ExamQuestion,
  FinalExamSchedule,
} from '../types/teacher.types';
import type { DateAttendanceStatus } from './sharedAttendance';

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
}

function rowToTest(r: TestRow): TestSchedule {
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
  };
}

interface HomeworkRow {
  id: string;
  section_id: string | null;
  class_name: string | null;
  section: string | null;
  subject: string | null;
  title: string;
  description: string | null;
  assigned_date: string;
  due_date: string | null;
  submitted_count: number;
  total_students: number;
}

function rowToHomework(r: HomeworkRow): HomeworkItem {
  return {
    id: r.id,
    classId: r.section_id ?? '',
    className: r.class_name ?? '',
    section: r.section ?? '',
    subject: r.subject ?? '',
    title: r.title,
    description: r.description ?? '',
    assignedDate: r.assigned_date,
    dueDate: r.due_date ?? '',
    submittedCount: r.submitted_count,
    totalStudents: r.total_students,
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

const TODAY_DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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
    students: { id: string; isPresent: boolean }[],
  ): Promise<{ id: string }> {
    const schoolId = getSchoolId();
    const yearId = await getActiveYearId();
    const userId = getUserId();
    const sectionIds = await resolveMySectionIds();
    if (!sectionIds.includes(sectionId)) {
      throw new Error('You are not assigned to this class');
    }

    // Lookup section meta for denorm columns.
    const { data: secData } = await supabase
      .from('sections').select('class_name, section')
      .eq('id', sectionId).maybeSingle();
    const sec = secData as { class_name: string; section: string } | null;

    const present = students.filter(s => s.isPresent).length;
    const absent = students.length - present;

    const { data: insRec, error: rErr } = await supabase
      .from('attendance_records')
      .insert({
        school_id: schoolId,
        academic_year_id: yearId,
        section_id: sectionId,
        class_name: sec?.class_name ?? null,
        section: sec?.section ?? null,
        date,
        total_present: present,
        total_absent: absent,
        total_students: students.length,
        marked_by: userId,
        approval_status: 'PENDING',
      })
      .select('id')
      .single();
    if (rErr) {
      if (/duplicate/i.test(rErr.message)) {
        throw new Error('Attendance already submitted for this date');
      }
      throw new Error(rErr.message);
    }
    const recId = (insRec as { id: string }).id;

    if (students.length) {
      const detailRows = students.map(s => ({
        attendance_id: recId,
        student_id: s.id,
        is_present: s.isPresent,
      }));
      const { error: dErr } = await supabase.from('attendance_student_details').insert(detailRows);
      if (dErr) {
        // Roll back parent on detail failure to avoid orphan summary rows.
        await supabase.from('attendance_records').delete().eq('id', recId);
        throw new Error(dErr.message);
      }
    }

    await logAudit('attendance_submitted', 'attendance_records', recId, {
      sectionId, date, present, absent, total: students.length,
    });
    return { id: recId };
  },

  // ── Tests / Exams ─────────────────────────────────────────────────────────

  async getTests(): Promise<TestSchedule[]> {
    const schoolId = getSchoolId();
    const yearId = await getActiveYearId();
    const { staffId } = await getMyStaff();
    const { data, error } = await supabase
      .from('test_schedules')
      .select('id, section_id, class_name, section, subject, test_type, title, scheduled_date, duration, max_marks, syllabus, results_uploaded')
      .eq('school_id', schoolId).eq('academic_year_id', yearId)
      .eq('teacher_id', staffId)
      .order('scheduled_date', { ascending: false });
    if (error) throw new Error(error.message);
    const tests = ((data ?? []) as TestRow[]).map(rowToTest);
    return tests;
  },

  async createTest(input: Omit<TestSchedule, 'id' | 'resultsUploaded'>): Promise<TestSchedule> {
    const schoolId = getSchoolId();
    const yearId = await getActiveYearId();
    const { staffId } = await getMyStaff();
    const sectionIds = await resolveMySectionIds();
    if (input.classId && !sectionIds.includes(input.classId)) {
      throw new Error('You are not assigned to this class');
    }
    const { data, error } = await supabase
      .from('test_schedules')
      .insert({
        school_id: schoolId,
        academic_year_id: yearId,
        section_id: input.classId || null,
        teacher_id: staffId,
        class_name: input.className,
        section: input.section,
        subject: input.subject,
        test_type: input.testType,
        title: input.title,
        scheduled_date: input.scheduledDate || null,
        duration: input.duration,
        max_marks: input.maxMarks,
        syllabus: input.syllabus,
        results_uploaded: false,
      })
      .select('id, section_id, class_name, section, subject, test_type, title, scheduled_date, duration, max_marks, syllabus, results_uploaded')
      .single();
    if (error) throw new Error(error.message);
    const test = rowToTest(data as TestRow);
    await logAudit('test_created', 'test_schedules', test.id, { title: test.title });
    return test;
  },

  async publishResults(payload: PublishResultsInput): Promise<void> {
    const yearId = await getActiveYearId();
    // Bulk upsert exam_results
    const rows = payload.studentResults.map(r => ({
      test_id: payload.testId,
      student_id: r.studentId,
      academic_year_id: yearId,
      obtained_marks: r.obtainedMarks,
      remarks: r.note || null,
    }));
    if (rows.length) {
      const { error } = await supabase
        .from('exam_results')
        .upsert(rows, { onConflict: 'test_id,student_id' });
      if (error) throw new Error(error.message);
    }
    // Flip results_uploaded flag
    const { error: uErr } = await supabase
      .from('test_schedules')
      .update({ results_uploaded: true })
      .eq('id', payload.testId);
    if (uErr) throw new Error(uErr.message);

    await logAudit('test_results_published', 'test_schedules', payload.testId, { count: rows.length });
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

  // ── Homework ──────────────────────────────────────────────────────────────

  async getHomework(): Promise<HomeworkItem[]> {
    const schoolId = getSchoolId();
    const yearId = await getActiveYearId();
    const { staffId } = await getMyStaff();
    const { data, error } = await supabase
      .from('homework_assignments')
      .select('id, section_id, class_name, section, subject, title, description, assigned_date, due_date, submitted_count, total_students')
      .eq('school_id', schoolId).eq('academic_year_id', yearId)
      .eq('teacher_id', staffId)
      .order('assigned_date', { ascending: false });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as HomeworkRow[];
    if (rows.length === 0) return [];

    // Reconcile total_students against the live section roster for the active year.
    // No submissions table exists yet, so submitted_count stays as persisted but is
    // clamped to roster size to prevent stale "10 / 5" displays.
    const sectionIds = Array.from(new Set(rows.map(r => r.section_id).filter((x): x is string => !!x)));
    const rosterBySection = new Map<string, number>();
    if (sectionIds.length > 0) {
      const { data: rosterRows, error: rErr } = await supabase
        .from('student_academic_records')
        .select('section_id')
        .eq('academic_year_id', yearId)
        .in('section_id', sectionIds);
      if (rErr) throw new Error(rErr.message);
      for (const r of (rosterRows ?? []) as { section_id: string | null }[]) {
        if (!r.section_id) continue;
        rosterBySection.set(r.section_id, (rosterBySection.get(r.section_id) ?? 0) + 1);
      }
    }
    return rows.map(r => {
      const liveTotal = r.section_id ? (rosterBySection.get(r.section_id) ?? r.total_students) : r.total_students;
      const item = rowToHomework({
        ...r,
        total_students: liveTotal,
        submitted_count: Math.min(r.submitted_count ?? 0, liveTotal),
      });
      return item;
    });
  },

  async createHomework(input: Omit<HomeworkItem, 'id' | 'submittedCount'>): Promise<HomeworkItem> {
    const schoolId = getSchoolId();
    const yearId = await getActiveYearId();
    const { staffId } = await getMyStaff();
    const sectionIds = await resolveMySectionIds();
    if (input.classId && !sectionIds.includes(input.classId)) {
      throw new Error('You are not assigned to this class');
    }
    const { data, error } = await supabase
      .from('homework_assignments')
      .insert({
        school_id: schoolId,
        academic_year_id: yearId,
        section_id: input.classId || null,
        teacher_id: staffId,
        class_name: input.className,
        section: input.section,
        subject: input.subject,
        title: input.title,
        description: input.description,
        assigned_date: input.assignedDate || new Date().toISOString().slice(0, 10),
        due_date: input.dueDate || null,
        total_students: input.totalStudents,
        submitted_count: 0,
      })
      .select('id, section_id, class_name, section, subject, title, description, assigned_date, due_date, submitted_count, total_students')
      .single();
    if (error) throw new Error(error.message);
    const hw = rowToHomework(data as HomeworkRow);
    await logAudit('homework_assigned', 'homework_assignments', hw.id, { title: hw.title });
    return hw;
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
    const schoolId = getSchoolId();
    const userId = getUserId();
    const name = getUserName();
    const { data, error } = await supabase
      .from('complaints')
      .insert({
        school_id: schoolId,
        from_role: 'TEACHER',
        from_name: name,
        from_user_id: userId,
        subject,
        description,
        status: 'PENDING',
      })
      .select('id, subject, description, status, response, created_at, resolved_at')
      .single();
    if (error) throw new Error(error.message);
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
    const schoolId = getSchoolId();
    const userId = getUserId();
    const name = getUserName();
    const sectionIds = await resolveMySectionIds();
    if (!sectionIds.includes(input.targetSectionId)) {
      throw new Error('You are not assigned to this class');
    }
    const audience = `SECTION:${input.targetSectionId}:${input.targetClass}:${input.targetSection}:${input.type}`;
    const { data, error } = await supabase
      .from('notices')
      .insert({
        school_id: schoolId,
        title: input.title,
        body: input.body,
        audience,
        sent_by: userId,
        sent_by_name: name,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    const id = (data as { id: string }).id;
    await logAudit('notice_sent', 'notices', id, { title: input.title, audience });
    return { id };
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

  /** Today's entries with PERIOD_SLOTS time info attached (sorted by start). */
  async getTodayClasses(): Promise<Array<{
    id: string; classId: string; className: string; section: string;
    subject: string; room: string;
    slot: { startTime: string; endTime: string; label: string };
  }>> {
    const today = TODAY_DAY_NAMES[new Date().getDay()];
    const entries = await this.getMyTimetable();
    // Pull period defs to get time strings
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
        const p = periodMap.get(e.slotId);
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
    const prompt = buildExamPrompt(request);
    let raw: string;
    try {
      raw = await generateText(prompt);
    } catch (err) {
      if (err instanceof GeminiUnavailableError) throw err;
      throw new Error(err instanceof Error ? err.message : 'AI generation failed');
    }
    const cleaned = stripJsonFence(raw);
    let parsed: { sections: Array<{ title: string; instructions?: string; questions: Array<{ no?: number; text: string; marks: number; type?: string }> }> };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error('AI returned an unparseable response — please try again');
    }

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

  /** Expose this teacher's staff row id + primary subject (cached). */
  async getMyStaffInfo(): Promise<{ staffId: string; subject: string }> {
    return getMyStaff();
  },

  /** All period slot definitions for this school's active year, sort_order asc. */
  async getPeriodSlots(): Promise<Array<{
    slotId: string; label: string; startTime: string; endTime: string;
    type: string; sortOrder: number;
  }>> {
    const schoolId = getSchoolId();
    const yearId = await getActiveYearId();
    const { data, error } = await supabase
      .from('timetable_periods')
      .select('id, name, start_time, end_time, period_type, sort_order')
      .eq('school_id', schoolId).eq('academic_year_id', yearId)
      .order('sort_order');
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<{
      id: string; name: string; start_time: string; end_time: string;
      period_type: string; sort_order: number;
    }>).map(r => ({
      slotId: r.id, label: r.name,
      startTime: r.start_time, endTime: r.end_time,
      type: r.period_type, sortOrder: r.sort_order,
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
  return `You are an experienced Indian school teacher creating an examination paper.
Subject: ${req.subject}
Class: ${req.className}
Test type: ${req.testType}
Total marks: ${req.totalMarks}
Duration: ${req.duration} minutes
Topics covered: ${req.topics}
Difficulty: ${req.difficulty}

Generate a complete exam paper as a JSON object with the following shape:
{
  "sections": [
    {
      "title": "Section A — Multiple Choice",
      "instructions": "Choose the correct option. Each carries 1 mark.",
      "questions": [
        { "no": 1, "text": "…", "marks": 1, "type": "MCQ" }
      ]
    }
  ]
}

Constraints:
- Type must be one of: MCQ, SHORT, LONG, DIAGRAM
- The sum of marks across all sections must equal ${req.totalMarks}
- Provide a balanced mix appropriate for the test type and difficulty
- Use authentic textbook-style language for ${req.className}-level ${req.subject}
- Return only the JSON, no preamble, no markdown fences`;
}
