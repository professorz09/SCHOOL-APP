// Supabase-backed services for the student-facing dashboard.
//
//   • Resolves the active student from the session for both STUDENT and
//     PARENT roles. STUDENT users hit `students.user_id`; PARENT users
//     resolve via authStore.selectedStudentId (the picker in App.tsx) and
//     fall back to their single linked student.
//   • Reads timetable_entries, exam_results + test_schedules,
//     homework_assignments, notices, complaints, route_stops, and
//     attendance_student_details + attendance_records directly.
//   • Persists complaints (`complaints` table) and fee-payment screenshot
//     submissions (`fee_payment_uploads` table — see migration 0011).
//   • All operations are scoped to the active student's school + active
//     academic year — RLS enforces tenant isolation.

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import {
  TimetableDay, TimetablePeriod, PeriodType,
  StudentExamResult, FeePaymentUpload, TransportStop,
  StudentNotice, StudentComplaint,
} from '@/roles/student/student-role.types';

export interface HomeworkItem {
  id: string;
  subject: string;
  title: string;
  description: string;
  assignedDate: string;
  dueDate: string;
  status: 'PENDING' | 'SUBMITTED' | 'OVERDUE';
  teacher: string;
}

export interface UpcomingExam {
  id: string;
  title: string;
  subject: string;
  testType: string;
  scheduledDate: string;
  maxMarks: number;
  duration: number;
  isFinal: boolean;
}

export interface AttendanceWeekDay {
  date: string;
  day: string;
  status: 'PRESENT' | 'ABSENT' | 'HOLIDAY' | 'HALF_DAY';
}

export interface AttendanceMonth {
  month: string;
  present: number;
  absent: number;
  holiday: number;
  total: number;
}

// ─── Session / context helpers ──────────────────────────────────────────────

function getUserId(): string {
  const id = useAuthStore.getState().session?.userId;
  if (!id) throw new Error('Not signed in');
  return id;
}

function getRole(): string {
  const r = useAuthStore.getState().session?.role;
  if (!r) throw new Error('Not signed in');
  return r;
}

function getSelectedStudentId(): string | null {
  return useAuthStore.getState().selectedStudentId;
}

function getLinkedStudentIds(): string[] {
  return useAuthStore.getState().session?.linkedStudentIds ?? [];
}

interface StudentContext {
  studentId: string;
  schoolId: string;
  schoolName: string;
  yearId: string;
  sectionId: string | null;
  className: string | null;
  section: string | null;
  studentName: string;
}

export interface ActiveStudentContext {
  studentId: string;
  studentName: string;
  schoolId: string;
  schoolName: string;
  className: string | null;
  section: string | null;
  /** "10-A" if both class+section known, otherwise null. */
  classLabel: string | null;
}

// Cache keyed by (userId, studentId) so a parent switching children gets a
// fresh context. Cleared on sign-out automatically because session.userId
// changes.
let _ctxCache: { key: string; ctx: StudentContext } | null = null;

/**
 * Resolve the *active* student for the signed-in user.
 *   - STUDENT: the row in `students` whose `user_id` matches.
 *   - PARENT:  the student id from `authStore.selectedStudentId` (set by the
 *              picker in App.tsx). Falls back to the only linked student if
 *              the parent has just one child. Throws otherwise.
 *
 * The returned `schoolId` always comes from the resolved student row, never
 * from the session — this is what lets a parent whose children attend
 * different schools see each child's data correctly.
 */
async function getStudentContext(): Promise<StudentContext> {
  const userId = getUserId();
  const role = getRole();

  let studentId: string | null = null;

  if (role === 'STUDENT') {
    const cached = _ctxCache?.key === `s:${userId}` ? _ctxCache.ctx : null;
    if (cached) return cached;
    const { data: stu, error } = await supabase
      .from('students').select('id')
      .eq('user_id', userId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!stu) throw new Error('Student record not found for current user');
    studentId = (stu as { id: string }).id;
  } else if (role === 'PARENT') {
    const sel = getSelectedStudentId();
    const linked = getLinkedStudentIds();
    if (sel && linked.includes(sel)) {
      studentId = sel;
    } else if (linked.length === 1) {
      studentId = linked[0];
    } else {
      throw new Error('No student selected. Pick a child from the parent menu first.');
    }
  } else {
    throw new Error(`Role ${role} cannot use the student dashboard`);
  }

  const cacheKey = `${role}:${userId}:${studentId}`;
  if (_ctxCache?.key === cacheKey) return _ctxCache.ctx;

  // Pull the student row to discover their actual school. RLS guarantees the
  // row is only visible if the caller is the student themselves OR a parent
  // linked to it OR same-school staff/admin.
  const { data: stu, error: sErr } = await supabase
    .from('students').select('id, name, school_id')
    .eq('id', studentId).maybeSingle();
  if (sErr) throw new Error(sErr.message);
  if (!stu) throw new Error('Student record not accessible');
  const studentRow = stu as { id: string; name: string; school_id: string };
  const schoolId = studentRow.school_id;

  const { data: sch } = await supabase
    .from('schools').select('name').eq('id', schoolId).maybeSingle();
  const schoolName = (sch as { name: string } | null)?.name ?? '';

  const { data: yr, error: yErr } = await supabase
    .from('academic_years').select('id')
    .eq('school_id', schoolId).eq('is_active', true).maybeSingle();
  if (yErr) throw new Error(yErr.message);
  if (!yr) throw new Error('No active academic year');
  const yearId = (yr as { id: string }).id;

  const { data: ar } = await supabase
    .from('student_academic_records')
    .select('class_name, section')
    .eq('student_id', studentRow.id).eq('academic_year_id', yearId).maybeSingle();
  const academic = (ar as { class_name: string | null; section: string | null } | null) ?? null;

  let sectionId: string | null = null;
  if (academic?.class_name && academic?.section) {
    const { data: sec } = await supabase
      .from('sections').select('id')
      .eq('school_id', schoolId).eq('academic_year_id', yearId)
      .eq('class_name', academic.class_name).eq('section', academic.section)
      .maybeSingle();
    sectionId = (sec as { id: string } | null)?.id ?? null;
  }

  const ctx: StudentContext = {
    studentId: studentRow.id,
    schoolId,
    schoolName,
    yearId,
    sectionId,
    className: academic?.class_name ?? null,
    section: academic?.section ?? null,
    studentName: studentRow.name,
  };
  _ctxCache = { key: cacheKey, ctx };
  return ctx;
}

// ─── Period-slot resolution (timetable) ─────────────────────────────────────

interface PeriodSlot {
  slotId: string;
  label: string;
  startTime: string;
  endTime: string;
  type: PeriodType;
  sortOrder: number;
}

const DEFAULT_SLOTS: PeriodSlot[] = [
  { slotId: 'assembly', label: 'Assembly',     startTime: '08:00', endTime: '08:20', type: 'ASSEMBLY', sortOrder: 0 },
  { slotId: 'p1',       label: 'Period 1',     startTime: '08:20', endTime: '09:05', type: 'CLASS',    sortOrder: 1 },
  { slotId: 'p2',       label: 'Period 2',     startTime: '09:05', endTime: '09:50', type: 'CLASS',    sortOrder: 2 },
  { slotId: 'break',    label: 'Short Break',  startTime: '09:50', endTime: '10:05', type: 'CLASS',    sortOrder: 3 },
  { slotId: 'p3',       label: 'Period 3',     startTime: '10:05', endTime: '10:50', type: 'CLASS',    sortOrder: 4 },
  { slotId: 'p4',       label: 'Period 4',     startTime: '10:50', endTime: '11:35', type: 'CLASS',    sortOrder: 5 },
  { slotId: 'lunch',    label: 'Lunch Break',  startTime: '11:35', endTime: '12:15', type: 'LUNCH',    sortOrder: 6 },
  { slotId: 'p5',       label: 'Period 5',     startTime: '12:15', endTime: '13:00', type: 'CLASS',    sortOrder: 7 },
  { slotId: 'p6',       label: 'Period 6',     startTime: '13:00', endTime: '13:45', type: 'CLASS',    sortOrder: 8 },
];

function slotTypeFromName(name: string): PeriodType {
  const n = name.toLowerCase();
  if (n.includes('assembly')) return 'ASSEMBLY';
  if (n.includes('lunch')) return 'LUNCH';
  if (n.includes('break')) return 'CLASS';
  return 'CLASS';
}

async function loadSlots(schoolId: string, yearId: string): Promise<PeriodSlot[]> {
  const { data } = await supabase
    .from('timetable_periods')
    .select('id, name, start_time, end_time, period_type, sort_order')
    .eq('school_id', schoolId).eq('academic_year_id', yearId)
    .order('sort_order', { ascending: true });
  const rows = (data ?? []) as Array<{
    id: string; name: string; start_time: string; end_time: string;
    period_type: string; sort_order: number;
  }>;
  if (rows.length === 0) return [...DEFAULT_SLOTS];
  // IMPORTANT: slotId must equal `timetable_periods.id` so it joins on
  // `timetable_entries.slot_id`, which the teacher write-path persists as
  // the period UUID (see timetable.service._loadPeriods + saveEntry).
  return rows.map(r => ({
    slotId: r.id,
    label: r.name,
    startTime: r.start_time,
    endTime: r.end_time,
    type: (r.period_type as PeriodType) ?? slotTypeFromName(r.name),
    sortOrder: r.sort_order,
  }));
}

// ─── Notice category inference ──────────────────────────────────────────────
function inferNoticeCategory(title: string, body: string): StudentNotice['category'] {
  const t = `${title} ${body}`.toLowerCase();
  if (/exam|test|result/.test(t)) return 'EXAM';
  if (/fee|payment|due/.test(t))  return 'FEE';
  if (/event|sport|day|festival|celebration/.test(t)) return 'EVENT';
  return 'GENERAL';
}

// ─── Complaint status normalisation ─────────────────────────────────────────
// Migration 0033 backfills legacy values, but we keep this defensive mapping
// so older rows still render correctly on environments yet to be migrated.
function mapComplaintStatus(raw: string | null): StudentComplaint['status'] {
  const v = (raw ?? '').toUpperCase();
  if (v === 'OPEN') return 'PENDING';
  if (v === 'IN_PROGRESS') return 'IN_REVIEW';
  if (v === 'PENDING' || v === 'IN_REVIEW' ||
      v === 'RESOLVED' || v === 'REJECTED') {
    return v as StudentComplaint['status'];
  }
  return 'PENDING';
}

// ─── Homework status derivation ─────────────────────────────────────────────
function deriveHwStatus(dueDate: string | null): HomeworkItem['status'] {
  if (!dueDate) return 'PENDING';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate); due.setHours(0, 0, 0, 0);
  return due < today ? 'OVERDUE' : 'PENDING';
}

// ─── Public API ─────────────────────────────────────────────────────────────

export const studentDashboardService = {
  /**
   * Resolve and return the active student id for the signed-in user. Used by
   * other services (FeesView -> feeService, TransportView -> transportService)
   * that need a studentId without re-implementing parent-vs-student routing.
   */
  async getActiveStudentId(): Promise<string> {
    const ctx = await getStudentContext();
    return ctx.studentId;
  },

  /** School the active student belongs to. */
  async getActiveSchoolId(): Promise<string> {
    const ctx = await getStudentContext();
    return ctx.schoolId;
  },

  /**
   * Snapshot of the active student/school used by the student layout header
   * and any other UI that needs the school name + class label without
   * issuing its own queries.
   */
  async getActiveContext(): Promise<ActiveStudentContext> {
    const ctx = await getStudentContext();
    return {
      studentId: ctx.studentId,
      studentName: ctx.studentName,
      schoolId: ctx.schoolId,
      schoolName: ctx.schoolName,
      className: ctx.className,
      section: ctx.section,
      classLabel: ctx.className && ctx.section
        ? `${ctx.className}-${ctx.section}`
        : null,
    };
  },

  async getTimetable(): Promise<TimetableDay[]> {
    const ctx = await getStudentContext();
    if (!ctx.sectionId) return [];

    const slots = await loadSlots(ctx.schoolId, ctx.yearId);
    const slotByLowerId = new Map(slots.map(s => [s.slotId.toLowerCase(), s]));

    const { data, error } = await supabase
      .from('timetable_entries')
      .select('id, day, slot_id, subject, teacher_name, room')
      .eq('school_id', ctx.schoolId)
      .eq('academic_year_id', ctx.yearId)
      .eq('section_id', ctx.sectionId);
    if (error) throw new Error(error.message);

    const entries = (data ?? []) as Array<{
      id: string; day: string; slot_id: string;
      subject: string | null; teacher_name: string | null; room: string | null;
    }>;

    const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 Sun … 6 Sat
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));

    return DAYS.map((dayName, dIdx) => {
      const dt = new Date(monday); dt.setDate(monday.getDate() + dIdx);
      const dateStr = dt.toISOString().split('T')[0];

      // For each slot in canonical order, attach this day's entry (if any).
      // Unassigned class slots are returned as FREE (with the slot label) so
      // the UI can clearly distinguish "no class scheduled" from a real
      // teacher-assigned class.
      const periods: TimetablePeriod[] = slots.map((slot, i) => {
        const matched = entries.find(
          e => e.day === dayName && e.slot_id.toLowerCase() === slot.slotId.toLowerCase(),
        );
        const isUnassignedClass = !matched && slot.type === 'CLASS';
        return {
          id: matched?.id ?? `${dayName}-${slot.slotId}`,
          period: i + 1,
          subject: matched?.subject ?? slot.label,
          teacher: matched?.teacher_name ?? '',
          startTime: slot.startTime,
          endTime: slot.endTime,
          room: matched?.room ?? '',
          type: isUnassignedClass ? 'FREE' : slot.type,
        };
      });

      return { day: dayName, date: dateStr, periods };
    });
  },

  async getScheduledExams(): Promise<UpcomingExam[]> {
    const ctx = await getStudentContext();
    if (!ctx.sectionId) return [];
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('test_schedules')
      .select('id, title, subject, test_type, scheduled_date, max_marks, duration, results_uploaded')
      .eq('school_id', ctx.schoolId).eq('academic_year_id', ctx.yearId)
      .eq('section_id', ctx.sectionId)
      .eq('results_uploaded', false)
      .gte('scheduled_date', today)
      .order('scheduled_date', { ascending: true });
    if (error) throw new Error(error.message);

    return ((data ?? []) as Array<{
      id: string; title: string; subject: string | null; test_type: string;
      scheduled_date: string | null; max_marks: number | null; duration: number | null;
      results_uploaded: boolean;
    }>).map(t => ({
      id: t.id,
      title: t.title,
      subject: t.subject ?? '',
      testType: t.test_type ?? 'UNIT_TEST',
      scheduledDate: t.scheduled_date ?? '',
      maxMarks: Number(t.max_marks ?? 0),
      duration: Number(t.duration ?? 0),
      isFinal: (t.test_type ?? '').toUpperCase() === 'FINAL',
    }));
  },

  async getResults(): Promise<StudentExamResult[]> {
    const ctx = await getStudentContext();

    // Pull this student's marks for the active year.
    const { data: myMarks, error: mErr } = await supabase
      .from('exam_results')
      .select('id, test_id, obtained_marks, grade, remarks, created_at')
      .eq('student_id', ctx.studentId).eq('academic_year_id', ctx.yearId);
    if (mErr) throw new Error(mErr.message);
    const marks = (myMarks ?? []) as Array<{
      id: string; test_id: string; obtained_marks: number | null;
      grade: string | null; remarks: string | null; created_at: string;
    }>;
    if (marks.length === 0) return [];

    // Pull the test definitions (tenant + year scoped).
    const testIds = Array.from(new Set(marks.map(m => m.test_id)));
    const { data: testRows } = await supabase
      .from('test_schedules')
      .select('id, title, subject, test_type, max_marks, scheduled_date, teacher_id')
      .eq('school_id', ctx.schoolId).eq('academic_year_id', ctx.yearId)
      .in('id', testIds);
    const tests = new Map<string, {
      id: string; title: string; subject: string | null; test_type: string;
      max_marks: number | null; scheduled_date: string | null; teacher_id: string | null;
    }>();
    for (const t of ((testRows ?? []) as Array<{
      id: string; title: string; subject: string | null; test_type: string;
      max_marks: number | null; scheduled_date: string | null; teacher_id: string | null;
    }>)) {
      tests.set(t.id, t);
    }

    // Resolve teacher names in one batch.
    const teacherIds = Array.from(new Set(
      Array.from(tests.values()).map(t => t.teacher_id).filter(Boolean) as string[],
    ));
    const teacherNames = new Map<string, string>();
    if (teacherIds.length) {
      const { data: staff } = await supabase
        .from('staff').select('id, name').in('id', teacherIds);
      for (const s of ((staff ?? []) as { id: string; name: string }[])) {
        teacherNames.set(s.id, s.name);
      }
    }

    // Compute rank per test by pulling all marks for those tests in this
    // year. Note: exam_results has no school_id column; tenant isolation is
    // enforced by RLS + the test_ids we just resolved (already school+year
    // scoped via test_schedules above).
    const { data: cohort, error: cErr } = await supabase
      .from('exam_results')
      .select('test_id, student_id, obtained_marks')
      .eq('academic_year_id', ctx.yearId)
      .in('test_id', testIds);
    if (cErr) throw new Error(cErr.message);
    const byTest = new Map<string, Array<{ student_id: string; obtained_marks: number }>>();
    for (const r of ((cohort ?? []) as Array<{
      test_id: string; student_id: string; obtained_marks: number | null;
    }>)) {
      const list = byTest.get(r.test_id) ?? [];
      list.push({ student_id: r.student_id, obtained_marks: Number(r.obtained_marks ?? 0) });
      byTest.set(r.test_id, list);
    }

    return marks.map(m => {
      const t = tests.get(m.test_id);
      const cohortList = (byTest.get(m.test_id) ?? [])
        .slice().sort((a, b) => b.obtained_marks - a.obtained_marks);
      const rank = cohortList.findIndex(c => c.student_id === ctx.studentId);
      return {
        id: m.id,
        examName: t?.title ?? 'Test',
        testType: t?.test_type ?? 'UNIT_TEST',
        subject: t?.subject ?? '',
        teacherName: t?.teacher_id ? (teacherNames.get(t.teacher_id) ?? '') : '',
        maxMarks: Number(t?.max_marks ?? 0),
        obtainedMarks: Number(m.obtained_marks ?? 0),
        grade: m.grade ?? '',
        date: t?.scheduled_date ?? m.created_at.slice(0, 10),
        rank: rank >= 0 ? rank + 1 : null,
        totalStudents: cohortList.length,
        teacherNote: m.remarks ?? undefined,
      };
    }).sort((a, b) => b.date.localeCompare(a.date));
  },

  async getTransportStops(): Promise<TransportStop[]> {
    const ctx = await getStudentContext();
    const { data: assign, error } = await supabase
      .from('student_transport_assignments')
      .select('vehicle_id, stop_id, is_active')
      .eq('student_id', ctx.studentId).eq('academic_year_id', ctx.yearId)
      .eq('is_active', true).maybeSingle();
    if (error) throw new Error(error.message);

    const a = assign as { vehicle_id: string | null; stop_id: string | null } | null;
    if (!a?.vehicle_id) return [];

    const { data: stops } = await supabase
      .from('route_stops')
      .select('id, name, estimated_time, lat, lng, sort_order')
      .eq('vehicle_id', a.vehicle_id)
      .order('sort_order', { ascending: true });

    const list = (stops ?? []) as Array<{
      id: string; name: string; estimated_time: string | null;
      lat: number | string | null; lng: number | string | null; sort_order: number;
    }>;

    // Mark up to and including the student's stop as completed/current.
    const studentIdx = a.stop_id ? list.findIndex(s => s.id === a.stop_id) : -1;
    return list.map((s, i) => ({
      name: s.name,
      lat: Number(s.lat ?? 0),
      lng: Number(s.lng ?? 0),
      estimatedTime: s.estimated_time ?? '',
      status:
        studentIdx >= 0 && i < studentIdx ? 'COMPLETED' :
        studentIdx >= 0 && i === studentIdx ? 'CURRENT' :
        'UPCOMING',
    }));
  },

  async getNotices(): Promise<StudentNotice[]> {
    const ctx = await getStudentContext();
    const { data, error } = await supabase
      .from('notices')
      .select('id, title, body, audience, sent_at, pinned')
      .eq('school_id', ctx.schoolId).eq('is_active', true)
      .in('audience', ['ALL', 'STUDENTS', 'STUDENTS_PARENTS', 'PARENTS_STUDENTS'])
      .order('pinned', { ascending: false })
      .order('sent_at', { ascending: false });
    if (error) throw new Error(error.message);

    return ((data ?? []) as Array<{
      id: string; title: string; body: string; audience: string;
      sent_at: string; pinned: boolean;
    }>).map(n => ({
      id: n.id,
      title: n.title,
      body: n.body,
      sentAt: n.sent_at.slice(0, 10),
      category: inferNoticeCategory(n.title, n.body),
      pinned: n.pinned,
    }));
  },

  async getComplaints(): Promise<StudentComplaint[]> {
    const userId = getUserId();
    const { data, error } = await supabase
      .from('complaints')
      .select('id, subject, description, status, created_at, response')
      .eq('from_user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);

    return ((data ?? []) as Array<{
      id: string; subject: string; description: string | null;
      status: string; created_at: string; response: string | null;
    }>).map(c => ({
      id: c.id,
      subject: c.subject,
      description: c.description ?? '',
      status: mapComplaintStatus(c.status),
      createdAt: c.created_at.slice(0, 10),
      response: c.response,
    }));
  },

  async submitComplaint(subject: string, description: string): Promise<StudentComplaint> {
    const ctx = await getStudentContext();
    const userId = getUserId();
    const role = getRole();
    const fromClass = ctx.className && ctx.section ? `${ctx.className}-${ctx.section}` : null;
    const { data, error } = await supabase
      .from('complaints')
      .insert({
        school_id: ctx.schoolId,
        from_role: role,                    // STUDENT or PARENT
        from_name: ctx.studentName,
        from_user_id: userId,
        from_class: fromClass,
        subject,
        description,
        status: 'PENDING',
      })
      .select('id, subject, description, status, created_at, response').single();
    if (error) throw new Error(error.message);

    await logAudit(
      role === 'PARENT' ? 'complaint_submitted_by_parent' : 'complaint_submitted_by_student',
      'complaint',
      (data as { id: string }).id,
      { subject_length: subject.length, student_id: ctx.studentId },
    );

    const r = data as {
      id: string; subject: string; description: string | null;
      status: string; created_at: string; response: string | null;
    };
    return {
      id: r.id,
      subject: r.subject,
      description: r.description ?? '',
      status: mapComplaintStatus(r.status),
      createdAt: r.created_at.slice(0, 10),
      response: r.response,
    };
  },

  async getHomework(): Promise<HomeworkItem[]> {
    const ctx = await getStudentContext();
    if (!ctx.sectionId) return [];
    const { data, error } = await supabase
      .from('homework_assignments')
      .select('id, subject, title, description, assigned_date, due_date, teacher_id')
      .eq('school_id', ctx.schoolId).eq('academic_year_id', ctx.yearId)
      .eq('section_id', ctx.sectionId)
      // Soonest-due homework first; rows with no due date sink to the bottom,
      // and ties break on assigned_date so the most recently posted appears first.
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('assigned_date', { ascending: false });
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as Array<{
      id: string; subject: string | null; title: string;
      description: string | null; assigned_date: string;
      due_date: string | null; teacher_id: string | null;
    }>;

    // Resolve teacher names in one batch.
    const teacherIds = Array.from(new Set(rows.map(r => r.teacher_id).filter(Boolean))) as string[];
    const teacherMap = new Map<string, string>();
    if (teacherIds.length) {
      const { data: staff } = await supabase
        .from('staff').select('id, name').in('id', teacherIds);
      for (const s of ((staff ?? []) as { id: string; name: string }[])) {
        teacherMap.set(s.id, s.name);
      }
    }

    return rows.map(r => ({
      id: r.id,
      subject: r.subject ?? '',
      title: r.title,
      description: r.description ?? '',
      assignedDate: r.assigned_date,
      dueDate: r.due_date ?? r.assigned_date,
      status: deriveHwStatus(r.due_date),
      teacher: r.teacher_id ? (teacherMap.get(r.teacher_id) ?? '') : '',
    }));
  },

  async getMyAttendance(): Promise<{ weekDays: AttendanceWeekDay[]; months: AttendanceMonth[] }> {
    const ctx = await getStudentContext();

    // Pull this student's APPROVED detail rows for the active year.
    // Phase 6: also read the 4-way status column (present/absent/holiday/half).
    const { data: rawRows, error } = await supabase
      .from('attendance_student_details')
      .select('is_present, status, attendance_records!inner(date)')
      .eq('student_id', ctx.studentId)
      .eq('attendance_records.school_id', ctx.schoolId)
      .eq('attendance_records.academic_year_id', ctx.yearId)
      .eq('attendance_records.approval_status', 'APPROVED');
    if (error) throw new Error(error.message);

    type CellSt = 'present' | 'absent' | 'holiday' | 'half';
    type DayStatus = AttendanceWeekDay['status'];
    type Row = {
      is_present: boolean;
      status: CellSt | null;
      attendance_records:
        | { date: string }
        | { date: string }[]
        | null;
    };
    const rows = (rawRows ?? []) as unknown as Row[];

    const dateStatus = new Map<string, DayStatus>();
    for (const r of rows) {
      const rec = Array.isArray(r.attendance_records) ? r.attendance_records[0] : r.attendance_records;
      if (!rec) continue;
      const st: CellSt = r.status ?? (r.is_present ? 'present' : 'absent');
      const dayS: DayStatus =
        st === 'present' ? 'PRESENT' :
        st === 'absent'  ? 'ABSENT'  :
        st === 'holiday' ? 'HOLIDAY' :
        /* half */         'HALF_DAY';
      dateStatus.set(rec.date, dayS);
    }

    // Build current week (Mon-Sun).
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const dow = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const weekDays: AttendanceWeekDay[] = dayLabels.map((label, i) => {
      const dt = new Date(monday); dt.setDate(monday.getDate() + i);
      const dateStr = dt.toISOString().split('T')[0];
      const isFuture = dt.getTime() > today.getTime();
      const status: DayStatus =
        i === 6 || isFuture ? 'HOLIDAY' : (dateStatus.get(dateStr) ?? 'HOLIDAY');
      return { date: dateStr, day: label, status };
    });

    // Build per-month buckets (newest first).
    const buckets = new Map<string, { present: number; absent: number; holiday: number; total: number }>();
    for (const [date, st] of dateStatus.entries()) {
      const key = date.slice(0, 7);
      const b = buckets.get(key) ?? { present: 0, absent: 0, holiday: 0, total: 0 };
      b.total += 1;
      if (st === 'PRESENT' || st === 'HALF_DAY') b.present += 1;
      else if (st === 'ABSENT') b.absent += 1;
      else if (st === 'HOLIDAY') b.holiday += 1;
      buckets.set(key, b);
    }
    const months: AttendanceMonth[] = Array.from(buckets.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, v]) => ({
        month: new Date(key + '-01').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }),
        present: v.present,
        absent: v.absent,
        holiday: v.holiday,
        total: v.total,
      }));

    return { weekDays, months };
  },

  // ── Fee uploads (persisted in fee_payment_uploads, see migration 0011) ──

  /**
   * List the active student's fee-payment screenshot submissions, newest
   * first. RLS scopes to either the student's own row or rows for any of
   * the parent's linked students.
   */
  async getFeeUploads(): Promise<FeePaymentUpload[]> {
    const ctx = await getStudentContext();
    const { data, error } = await supabase
      .from('fee_payment_uploads')
      .select('id, amount, description, screenshot_name, screenshot_url, status, created_at')
      .eq('student_id', ctx.studentId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<{
      id: string; amount: number; description: string | null;
      screenshot_name: string | null; screenshot_url: string | null;
      status: string; created_at: string;
    }>).map(r => ({
      id: r.id,
      amount: Number(r.amount),
      description: r.description ?? '',
      screenshotName: r.screenshot_name ?? '',
      screenshotPath: r.screenshot_url,
      submittedAt: r.created_at.slice(0, 10),
      status: (r.status as FeePaymentUpload['status']) ?? 'PENDING',
    }));
  },

  /**
   * Mint a short-lived signed URL for a screenshot stored under the
   * `fee-screenshots` bucket. Returns null when the path is missing or
   * the storage layer denies access (RLS, bucket misconfig, etc).
   */
  async getFeeScreenshotSignedUrl(
    storagePath: string | null,
    ttlSeconds = 300,
  ): Promise<string | null> {
    if (!storagePath) return null;
    const { data, error } = await supabase.storage
      .from(FEE_SCREENSHOTS_BUCKET)
      .createSignedUrl(storagePath, ttlSeconds);
    if (error) {
      console.warn('[fee-screenshots] signed URL failed', error.message);
      return null;
    }
    return data?.signedUrl ?? null;
  },

  /**
   * Persist a fee-payment screenshot submission. The image bytes are
   * pushed into the private `fee-screenshots` Supabase Storage bucket
   * first; the resulting object path is then written into
   * `fee_payment_uploads.screenshot_url` so principals can later open
   * the original image via a signed URL.
   *
   * Both writes are gated by RLS:
   *   - storage.objects insert policy: caller must be linked to the
   *     student folder and the school folder must own that student.
   *   - fee_payment_uploads insert policy: submitted_by = auth.uid()
   *     and student_id must be one of the caller's linked student ids.
   *
   * The `file` argument is required for new submissions; size and MIME
   * type are validated client-side as a fast-fail (the bucket itself
   * also enforces these limits server-side).
   */
  async submitFeeScreenshot(
    amount: number,
    description: string,
    screenshotName: string,
    file: File,
  ): Promise<FeePaymentUpload> {
    if (!file) throw new Error('Screenshot image is required');
    if (!(FEE_SCREENSHOT_MIME_TYPES as readonly string[]).includes(file.type)) {
      throw new Error('Unsupported image type. Use JPG, PNG, WebP, HEIC, or HEIF.');
    }
    if (file.size > FEE_SCREENSHOT_MAX_BYTES) {
      throw new Error(
        `Image is too large (max ${Math.round(FEE_SCREENSHOT_MAX_BYTES / 1024 / 1024)} MB)`,
      );
    }

    const ctx = await getStudentContext();
    const userId = getUserId();
    const role = getRole();

    // crypto.randomUUID() is available in all evergreen browsers and
    // worker contexts where Vite runs; we use it here so the same
    // student can upload many screenshots without filename collisions.
    const ext = inferImageExtension(file);
    const objectPath = `${ctx.schoolId}/${ctx.studentId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

    const upload = await supabase.storage
      .from(FEE_SCREENSHOTS_BUCKET)
      .upload(objectPath, file, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false,
      });
    if (upload.error) throw new Error(`Upload failed: ${upload.error.message}`);

    const { data, error } = await supabase
      .from('fee_payment_uploads')
      .insert({
        school_id: ctx.schoolId,
        student_id: ctx.studentId,
        submitted_by: userId,
        amount,
        description,
        screenshot_name: screenshotName,
        screenshot_url: objectPath,
        status: 'PENDING',
      })
      .select('id, amount, description, screenshot_name, screenshot_url, status, created_at')
      .single();
    if (error) {
      // Best-effort cleanup so we don't leave orphan objects behind.
      // Failure here is non-fatal — the row insert error is what the
      // caller actually needs to see.
      await supabase.storage
        .from(FEE_SCREENSHOTS_BUCKET)
        .remove([objectPath])
        .catch(() => {});
      throw new Error(error.message);
    }

    await logAudit(
      role === 'PARENT' ? 'fee_screenshot_submitted_by_parent' : 'fee_screenshot_submitted_by_student',
      'fee_payment_upload',
      (data as { id: string }).id,
      { student_id: ctx.studentId, amount, screenshot_path: objectPath },
    );

    const r = data as {
      id: string; amount: number; description: string | null;
      screenshot_name: string | null; screenshot_url: string | null;
      status: string; created_at: string;
    };
    return {
      id: r.id,
      amount: Number(r.amount),
      description: r.description ?? '',
      screenshotName: r.screenshot_name ?? '',
      screenshotPath: r.screenshot_url,
      submittedAt: r.created_at.slice(0, 10),
      status: (r.status as FeePaymentUpload['status']) ?? 'PENDING',
    };
  },
};

// ─── Fee-screenshot storage constants ───────────────────────────────────────
// Kept in sync with supabase/migrations/0012_fee_screenshots_storage.sql so
// the client-side fast-fails match the server-side bucket limits.

export const FEE_SCREENSHOTS_BUCKET = 'fee-screenshots';
export const FEE_SCREENSHOT_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
export const FEE_SCREENSHOT_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const;

function inferImageExtension(file: File): string {
  const fromName = file.name.split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  switch (file.type) {
    case 'image/jpeg': return 'jpg';
    case 'image/png':  return 'png';
    case 'image/webp': return 'webp';
    case 'image/heic': return 'heic';
    case 'image/heif': return 'heif';
    default:           return 'bin';
  }
}
