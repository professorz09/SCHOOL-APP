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
// changes. Also cleared explicitly via invalidateContext() after lifecycle
// events (re-admit, class change) where the underlying student row moved.
let _ctxCache: { key: string; ctx: StudentContext } | null = null;

// Drop the cache when the auth session flips (logout / login as different
// user / parent picks a different child). Without this, stale class+year
// context from a previous session could leak into a fresh one.
useAuthStore.subscribe((s, prev) => {
  if (
    s.session?.userId !== prev.session?.userId ||
    s.session?.role !== prev.session?.role ||
    s.selectedStudentId !== prev.selectedStudentId
  ) {
    _ctxCache = null;
  }
});

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

  // We intentionally do NOT throw if the school has no active academic
  // year yet — the student should still be able to load their dashboard,
  // just with empty fee/timetable/attendance sections. Throwing here was
  // the root cause of "No active academic year" errors blocking the
  // entire student/parent app whenever a school was between years.
  const { data: yr, error: yErr } = await supabase
    .from('academic_years').select('id')
    .eq('school_id', schoolId).eq('is_active', true).maybeSingle();
  if (yErr) throw new Error(yErr.message);
  const yearId = (yr as { id: string } | null)?.id ?? '';

  const { data: ar } = yearId
    ? await supabase
      .from('student_academic_records')
      .select('class_name, section')
      .eq('student_id', studentRow.id).eq('academic_year_id', yearId).maybeSingle()
    : { data: null };
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

// ─── Public API ─────────────────────────────────────────────────────────────

export const studentDashboardService = {
  /**
   * Drop the cached context. Call after lifecycle events that move the
   * student between classes / sections / years (re-admit, year rollover,
   * principal-side class promotion) so the next read pulls fresh rows.
   */
  invalidateContext(): void { _ctxCache = null; },

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
    if (!ctx.sectionId || !ctx.yearId) return [];

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
    if (!ctx.sectionId || !ctx.yearId) return [];
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
    if (!ctx.yearId) return [];

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
    if (!ctx.yearId) return [];
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
    // Two queries fan-out:
    //   • Broadcast notices for this school where audience matches.
    //   • Personal notices targeting THIS student (audience=SPECIFIC_STUDENT).
    // Run in parallel and merge — RLS already filters cross-school rows.
    const [broadcastRes, personalRes] = await Promise.all([
      supabase
        .from('notices')
        .select('id, title, body, audience, sent_at, pinned, target_student_id')
        .eq('school_id', ctx.schoolId).eq('is_active', true)
        .in('audience', ['ALL', 'STUDENTS', 'STUDENTS_PARENTS', 'PARENTS_STUDENTS', 'PARENTS'])
        .order('pinned', { ascending: false })
        .order('sent_at', { ascending: false }),
      supabase
        .from('notices')
        .select('id, title, body, audience, sent_at, pinned, target_student_id')
        .eq('school_id', ctx.schoolId).eq('is_active', true)
        .eq('target_student_id', ctx.studentId)
        .order('pinned', { ascending: false })
        .order('sent_at', { ascending: false }),
    ]);
    if (broadcastRes.error) throw new Error(broadcastRes.error.message);
    if (personalRes.error)  throw new Error(personalRes.error.message);

    type NRow = { id: string; title: string; body: string; audience: string;
      sent_at: string; pinned: boolean; target_student_id: string | null };
    // De-dupe by id (broadcast + personal can theoretically overlap on edge cases)
    const merged = new Map<string, NRow>();
    for (const r of [...(broadcastRes.data ?? []), ...(personalRes.data ?? [])] as NRow[]) {
      merged.set(r.id, r);
    }
    return [...merged.values()]
      .sort((a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime(),
      )
      .map(n => ({
        id: n.id,
        title: n.title,
        body: n.body,
        sentAt: n.sent_at.slice(0, 10),
        category: n.target_student_id ? 'PERSONAL' : inferNoticeCategory(n.title, n.body),
        pinned: n.pinned,
      }));
  },

  async getComplaints(): Promise<StudentComplaint[]> {
    const userId = getUserId();
    const { data, error } = await supabase
      .from('complaints')
      .select('id, subject, description, status, created_at, response, is_anonymous')
      .eq('from_user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);

    return ((data ?? []) as Array<{
      id: string; subject: string; description: string | null;
      status: string; created_at: string; response: string | null;
      is_anonymous: boolean | null;
    }>).map(c => ({
      id: c.id,
      subject: c.subject,
      description: c.description ?? '',
      status: mapComplaintStatus(c.status),
      createdAt: c.created_at.slice(0, 10),
      response: c.response,
      isAnonymous: c.is_anonymous === true,
    }));
  },

  async submitComplaint(subject: string, description: string, isAnonymous = false): Promise<StudentComplaint> {
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
        // Per-child cap: trigger 0056 reads student_id so a parent of two
        // kids gets 3 complaints PER CHILD, not 3 across both.
        student_id: ctx.studentId,
        subject,
        description,
        status: 'PENDING',
        is_anonymous: isAnonymous,
      })
      .select('id, subject, description, status, created_at, response, is_anonymous').single();
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
      is_anonymous: boolean | null;
    };
    return {
      id: r.id,
      subject: r.subject,
      description: r.description ?? '',
      status: mapComplaintStatus(r.status),
      createdAt: r.created_at.slice(0, 10),
      response: r.response,
      isAnonymous: r.is_anonymous === true,
    };
  },

  async getMyAttendance(): Promise<{ weekDays: AttendanceWeekDay[]; months: AttendanceMonth[] }> {
    const ctx = await getStudentContext();
    if (!ctx.yearId) return { weekDays: [], months: [] };

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
      // Half-day was removed from the student attendance flow; any legacy
      // 'half' rows count as PRESENT here so percentages don't penalise
      // students for a status they can no longer be marked with. Staff
      // attendance handles half-day separately and is unaffected.
      const dayS: DayStatus =
        st === 'absent'  ? 'ABSENT'  :
        st === 'holiday' ? 'HOLIDAY' :
        /* present, half */ 'PRESENT';
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
      if (st === 'PRESENT') b.present += 1;
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
      .select('id, amount, description, transaction_id, status, created_at')
      .eq('student_id', ctx.studentId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<{
      id: string; amount: number; description: string | null;
      transaction_id: string;
      status: string; created_at: string;
    }>).map(r => ({
      id: r.id,
      amount: Number(r.amount),
      description: r.description ?? '',
      transactionId: r.transaction_id,
      submittedAt: r.created_at.slice(0, 10),
      status: (r.status as FeePaymentUpload['status']) ?? 'PENDING',
    }));
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
  async submitFeePayment(
    amount: number,
    transactionId: string,
    description: string,
  ): Promise<FeePaymentUpload> {
    const txn = transactionId.trim();
    if (!txn) throw new Error('Transaction ID is required');
    if (txn.length < 4) throw new Error('Transaction ID looks too short');
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter a valid amount');

    const ctx = await getStudentContext();
    const userId = getUserId();
    const role = getRole();

    // Friendly client-side pre-check — same 3/day rule the DB trigger
    // (migration 0051) enforces. Without this the parent only sees a raw
    // Postgres error; with it they get a clean message before the round-trip.
    const istToday = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const dayStartIST = new Date(`${istToday}T00:00:00+05:30`).toISOString();
    const { count: todayCount } = await supabase
      .from('fee_payment_uploads')
      .select('id', { count: 'exact', head: true })
      .eq('submitted_by', userId)
      .gte('created_at', dayStartIST);
    if ((todayCount ?? 0) >= 3) {
      throw new Error('Aaj ke 3 submissions ho chuke hain. Misuse rokne ke liye limit hai — please contact the school office for another submission.');
    }

    const { data, error } = await supabase
      .from('fee_payment_uploads')
      .insert({
        school_id: ctx.schoolId,
        student_id: ctx.studentId,
        submitted_by: userId,
        amount,
        description,
        transaction_id: txn,
        status: 'PENDING',
      })
      .select('id, amount, description, transaction_id, status, created_at')
      .single();
    if (error) {
      // The DB trigger raises 'check_violation' (errcode P0001 in plpgsql
      // RAISE EXCEPTION). Surface its message verbatim — it already says
      // "contact the school office".
      const msg = error.message.includes('Daily limit reached')
        ? 'Daily limit reached — only 3 fee submissions allowed per day. Please contact the school office.'
        : error.message;
      throw new Error(msg);
    }

    await logAudit(
      role === 'PARENT' ? 'fee_payment_submitted_by_parent' : 'fee_payment_submitted_by_student',
      'fee_payment_upload',
      (data as { id: string }).id,
      { student_id: ctx.studentId, amount, transaction_id: txn },
    );

    const r = data as {
      id: string; amount: number; description: string | null;
      transaction_id: string;
      status: string; created_at: string;
    };
    return {
      id: r.id,
      amount: Number(r.amount),
      description: r.description ?? '',
      transactionId: r.transaction_id,
      submittedAt: r.created_at.slice(0, 10),
      status: (r.status as FeePaymentUpload['status']) ?? 'PENDING',
    };
  },
};

// ─── Fee-screenshot storage constants ───────────────────────────────────────
// Screenshot uploads were dropped (migration 0050) — fee submissions now
// carry a structured transaction_id only, no file upload, no bucket. The
// fee-screenshots Storage bucket and its policies can be safely deleted
// in a follow-up cleanup migration.
