// Supabase-backed sharedAttendance — reads attendance_records +
// attendance_student_details directly. All operations are async, scoped to the
// caller's school + active academic year (RLS enforces tenant isolation).
//
// Phase 6: cells now carry a 4-way status (present/absent/holiday/half)
// instead of just is_present boolean.

import { supabase } from '@/lib/supabase';
import { apiAttendance, apiPrincipal } from '@/lib/apiClient';
import type { AttendanceCellStatus } from '@/lib/apiClient';
import { useAuthStore } from '@/store/authStore';
import { useEditingYearStore } from '@/store/editingYearStore';
import { logAudit } from '@/lib/audit';

export type AttendanceApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type DateAttendanceStatus = 'NOT_MARKED' | 'PENDING' | 'APPROVED';
export type { AttendanceCellStatus };

export interface AttendanceStudentRecord {
  id: string;
  name: string;
  rollNo: string;
  isPresent: boolean;
  status: AttendanceCellStatus;
}

export interface SharedAttendanceRecord {
  id: string;
  classId: string;       // section_id
  className: string;
  section: string;
  subject: string;
  date: string;
  totalPresent: number;
  totalAbsent: number;
  totalStudents: number;
  totalHoliday: number;
  totalHalf: number;
  markedBy: string;
  // Timestamp of when the record was last touched. Surfaced in the Mark
  // flow's "Already marked" banner so the principal sees both who locked
  // it and when. Falls back to created_at when nothing has been updated
  // since the original write.
  markedAt: string | null;
  status: AttendanceApprovalStatus;
  isLocked: boolean;
  students: AttendanceStudentRecord[];
}

export interface GridDateRecord {
  id: string;
  date: string;
  approvalStatus: AttendanceApprovalStatus;
  isLocked: boolean;
  totalPresent: number;
  totalAbsent: number;
  totalHoliday: number;
  totalHalf: number;
  totalStudents: number;
  // Who marked + locked this date. Surfaced as a tooltip in the grid so
  // the principal can audit "kisne kiya" at a glance without leaving the
  // page or opening a separate records list.
  markedByName: string | null;
}

// Map: date → { studentId → AttendanceCellStatus }
export type GridStudentDetails = Record<string, Record<string, AttendanceCellStatus>>;

// ─── Auth / year helpers ────────────────────────────────────────────────────

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

async function getActiveYearId(): Promise<string> {
  const override = useEditingYearStore.getState().getEditingYearId();
  if (override) return override;
  const schoolId = getSchoolId();
  const { data, error } = await supabase
    .from('academic_years').select('id')
    .eq('school_id', schoolId).eq('is_active', true).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('No active academic year');
  return (data as { id: string }).id;
}

// ─── Row shape + mapper ─────────────────────────────────────────────────────

interface AttendanceRow {
  id: string;
  section_id: string | null;
  class_name: string | null;
  section: string | null;
  date: string;
  total_present: number;
  total_absent: number;
  total_students: number;
  total_holiday?: number;
  total_half?: number;
  approval_status: string;
  is_locked: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  users: { name: string } | { name: string }[] | null;
}

const ATT_FIELDS =
  'id, section_id, class_name, section, date, total_present, total_absent, ' +
  'total_students, total_holiday, total_half, approval_status, is_locked, ' +
  'created_at, updated_at, users:marked_by(name)';

function mapRow(r: AttendanceRow): SharedAttendanceRecord {
  const u = Array.isArray(r.users) ? r.users[0] : r.users;
  return {
    id: r.id,
    classId: r.section_id ?? '',
    className: r.class_name ?? '',
    section: r.section ?? '',
    subject: '',
    date: r.date,
    totalPresent: r.total_present,
    totalAbsent: r.total_absent,
    totalStudents: r.total_students,
    totalHoliday: r.total_holiday ?? 0,
    totalHalf: r.total_half ?? 0,
    markedBy: u?.name ?? 'Unknown',
    markedAt: r.updated_at ?? r.created_at ?? null,
    status: (r.approval_status as AttendanceApprovalStatus) ?? 'PENDING',
    isLocked: r.is_locked,
    students: [],
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────

export const sharedAttendance = {
  /** Recent attendance records for the current school + active year.
   *  Default window covers the last 90 days — enough for the records
   *  list; older corrections can be fetched explicitly via {limit/before}.
   *  Previously a flat `.limit(500)` silently truncated school-wide history
   *  for any school with > ~80 school days × multiple sections. */
  async getAll(opts?: { days?: number; before?: string; limit?: number }): Promise<SharedAttendanceRecord[]> {
    const schoolId = getSchoolId();
    const yearId = await getActiveYearId();
    const days = opts?.days ?? 90;
    const limit = Math.min(Math.max(opts?.limit ?? 1000, 1), 5000);
    const before = opts?.before ?? null;
    // Floor by school days window OR explicit before-cursor.
    let q = supabase
      .from('attendance_records')
      .select(ATT_FIELDS)
      .eq('school_id', schoolId).eq('academic_year_id', yearId)
      .order('date', { ascending: false })
      .limit(limit);
    if (before) {
      q = q.lt('date', before);
    } else {
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - days);
      // IST-anchored YYYY-MM-DD. toISOString() converts to UTC and the
      // resulting date can land 1 day earlier in late-evening-IST runs,
      // making the filter pull an extra day of rows (off-by-one).
      const since = sinceDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      q = q.gte('date', since);
    }
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as AttendanceRow[]).map(mapRow);
  },

  /** Grid data for a class/section within a date range. */
  async getGrid(sectionId: string, startDate: string, endDate: string): Promise<{
    records: GridDateRecord[];
    studentDetails: GridStudentDetails;
  }> {
    const result = await apiAttendance.grid(sectionId, startDate, endDate);
    interface RawGridRecord {
      id: string; date: string; approval_status: string; is_locked: boolean;
      total_present: number; total_absent: number; total_holiday: number;
      total_half: number; total_students: number;
      marked_by_name?: string | null;
    }
    const records: GridDateRecord[] = ((result.records ?? []) as RawGridRecord[]).map(r => ({
      id: r.id,
      date: r.date,
      approvalStatus: r.approval_status as AttendanceApprovalStatus,
      isLocked: r.is_locked,
      totalPresent: r.total_present ?? 0,
      totalAbsent: r.total_absent ?? 0,
      totalHoliday: r.total_holiday ?? 0,
      totalHalf: r.total_half ?? 0,
      totalStudents: r.total_students ?? 0,
      markedByName: r.marked_by_name ?? null,
    }));
    const studentDetails: GridStudentDetails = {};
    for (const [date, entries] of Object.entries(result.studentDetails ?? {})) {
      studentDetails[date] = {};
      for (const [stuId, val] of Object.entries(entries as Record<string, { status: AttendanceCellStatus }>)) {
        studentDetails[date][stuId] = val.status ?? 'absent';
      }
    }
    return { records, studentDetails };
  },

  /** Lazy-load the per-student rows for a single attendance record. */
  async getStudents(recordId: string): Promise<AttendanceStudentRecord[]> {
    const schoolId = getSchoolId();
    const yearId = await getActiveYearId();

    const { data: own, error: oErr } = await supabase
      .from('attendance_records').select('id')
      .eq('id', recordId).eq('school_id', schoolId).eq('academic_year_id', yearId)
      .maybeSingle();
    if (oErr) throw new Error(oErr.message);
    if (!own) return [];

    const { data, error } = await supabase
      .from('attendance_student_details')
      .select('student_id, is_present, status, students!inner(id, name, school_id)')
      .eq('attendance_id', recordId)
      .eq('students.school_id', schoolId);
    if (error) throw new Error(error.message);

    type J = { student_id: string; is_present: boolean; status: string | null; students: { id: string; name: string; school_id: string } | null };
    const rows = ((data ?? []) as unknown as J[]).filter(r => r.students);

    const stuIds = rows.map(r => r.student_id);
    const rolls = new Map<string, string>();
    if (stuIds.length) {
      const { data: ar } = await supabase
        .from('student_academic_records').select('student_id, roll_no')
        .eq('academic_year_id', yearId).in('student_id', stuIds);
      for (const r of ((ar ?? []) as { student_id: string; roll_no: string | null }[])) {
        rolls.set(r.student_id, r.roll_no ?? '');
      }
    }

    return rows
      .map(r => {
        const st = (r.status as AttendanceCellStatus | null) ?? (r.is_present ? 'present' : 'absent');
        return {
          id: r.student_id,
          name: r.students!.name,
          rollNo: rolls.get(r.student_id) ?? '',
          isPresent: r.is_present,
          status: st,
        };
      })
      .sort((a, b) => {
        const ar = parseInt(a.rollNo, 10);
        const br = parseInt(b.rollNo, 10);
        if (Number.isFinite(ar) && Number.isFinite(br)) return ar - br;
        return a.name.localeCompare(b.name);
      });
  },

  /** Conflict check used by the principal "Mark Attendance" flow. */
  async getByClassNameSectionDate(
    className: string, section: string, date: string,
  ): Promise<SharedAttendanceRecord | null> {
    const schoolId = getSchoolId();
    const yearId = await getActiveYearId();
    const { data, error } = await supabase
      .from('attendance_records')
      .select(ATT_FIELDS)
      .eq('school_id', schoolId).eq('academic_year_id', yearId)
      .eq('class_name', className).eq('section', section).eq('date', date)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return mapRow(data as unknown as AttendanceRow);
  },

  /** Save attendance for a section as PENDING (teacher-style submit, awaiting approval). */
  async submitSection(
    sectionId: string, date: string,
    students: AttendanceStudentRecord[],
  ): Promise<{ attendanceId: string }> {
    const res = await apiAttendance.submit({
      sectionId,
      date,
      records: students.map(s => ({ studentId: s.id, status: s.status })),
    });
    // attendance_submitted audit removed — fires per class per day (20+
    // rows/day per school). The attendance_records row itself + the
    // approval_status flow already capture who/when/what; an extra
    // audit_logs entry duplicated that data and dominated total storage.
    // Returning a value (instead of void) so callers' `if (result ===
    // undefined) return;` guards (used for editGuard.gate's "user
    // cancelled" sentinel) don't false-positive on a successful save.
    return { attendanceId: res.attendanceId };
  },

  /** Principal marks attendance directly (auto-approved). */
  async submitPrincipal(
    className: string, section: string, date: string,
    students: AttendanceStudentRecord[],
  ): Promise<SharedAttendanceRecord> {
    const res = await apiAttendance.markByPrincipal({
      className,
      section,
      date,
      records: students.map(s => ({ studentId: s.id, status: s.status })),
    });
    await logAudit('attendance_marked_by_principal', 'attendance_records', res.attendanceId, {
      className, section, date,
      present: res.present, absent: res.absent,
      holiday: res.holiday ?? 0, half: res.half ?? 0, total: res.total,
    });
    const { data: full } = await supabase
      .from('attendance_records').select(ATT_FIELDS)
      .eq('id', res.attendanceId).single();
    return mapRow(full as unknown as AttendanceRow);
  },

  // approve() / reject() removed — teacher's submit() now auto-locks.

  /** Replace per-student rows + recompute totals for a record.
   *  `reason` is required by the server when the record is already approved/locked. */
  async updateStudents(id: string, students: AttendanceStudentRecord[], reason?: string, mode: 'patch' | 'full' = 'full'): Promise<void> {
    // Default 'full' here preserves the existing component contract — the
    // student-attendance editor always submits the entire roster. Callers
    // doing partial edits should pass mode='patch' explicitly.
    await apiAttendance.updateStudents({
      attendanceId: id,
      reason,
      mode,
      students: students.map(s => ({ studentId: s.id, status: s.status })),
    });
    const present = students.filter(s => s.status === 'present' || s.status === 'half').length;
    const absent = students.filter(s => s.status === 'absent').length;
    await logAudit('attendance_edited', 'attendance_records', id, {
      present, absent, total: students.length, ...(reason ? { reason } : {}),
    });
  },
}

// ─── Staff Attendance (moved from principalService) ───────────────────────────

export type StaffAttendanceStatus = 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'LEAVE' | 'LATE' | 'HOLIDAY';

export interface StaffAttendanceRow {
  staffId: string;
  name: string;
  role: string;
  status: StaffAttendanceStatus;
}

export const staffAttendanceService = {
  async getForDate(date: string): Promise<{
    rows: StaffAttendanceRow[];
    isLocked: boolean;
    savedAt: string | null;
    modifiedAt: string | null;
  }> {
    const schoolId = useAuthStore.getState().session?.schoolId;
    if (!schoolId) return { rows: [], isLocked: false, savedAt: null, modifiedAt: null };

    const { data: staff, error: sErr } = await supabase
      .from('staff')
      .select('id, name, role, status, is_active, joining_date, relieving_date')
      .eq('school_id', schoolId);
    if (sErr) throw new Error(sErr.message);

    // Lifecycle-aware filter so the attendance grid only lists staff
    // who were actually employed AND not suspended on this specific
    // date. Without these guards a freshly-joined teacher leaks into
    // every past date (back to year start) and a relieved teacher
    // continues to appear on dates after their last day.
    //
    // Rules (per user spec):
    //   • is_active must be true (basic activation flag)
    //   • status must NOT be SUSPENDED or RELIEVED — those are hidden
    //     from the grid entirely (you can't mark attendance on someone
    //     who isn't supposed to be there).
    //   • date >= joining_date  (don't show before they joined)
    //   • relieving_date IS NULL OR date <= relieving_date  (don't
    //     show after their last day if a relieving date is set)
    //
    // ON_LEAVE staff DO still appear so the marker can record
    // 'LEAVE' as that day's status — they're employed, just absent.
    const activeStaff = ((staff ?? []) as any[]).filter((s: any) => {
      if (!s.is_active) return false;
      if (s.status === 'SUSPENDED' || s.status === 'RELIEVED') return false;
      if (s.joining_date && date < s.joining_date) return false;
      if (s.relieving_date && date > s.relieving_date) return false;
      return true;
    });

    const { data: existing, error: aErr } = await supabase
      .from('staff_attendance')
      .select('staff_id, status, is_locked, created_at, updated_at')
      .eq('school_id', schoolId).eq('date', date);
    if (aErr) throw new Error(aErr.message);

    const existingMap = new Map<string, { status: string; is_locked: boolean; created_at: string; updated_at: string | null }>();
    for (const r of (existing ?? []) as any[]) {
      existingMap.set(r.staff_id, r);
    }

    const isLocked = Array.from(existingMap.values()).some(r => r.is_locked);
    const allRows = Array.from(existingMap.values());
    const savedAtTs = allRows.map(r => r.created_at).sort().pop() ?? null;
    // modifiedAt = latest updated_at where it genuinely differs from created_at
    const modifiedAtTs = allRows
      .filter(r => r.updated_at && r.updated_at !== r.created_at)
      .map(r => r.updated_at as string)
      .sort()
      .pop() ?? null;

    const rows: StaffAttendanceRow[] = activeStaff
      .map((s: any) => ({
        staffId: s.id,
        name: s.name,
        role: s.role,
        status: (existingMap.get(s.id)?.status as StaffAttendanceStatus) ?? 'PRESENT',
      }))
      .sort((a: StaffAttendanceRow, b: StaffAttendanceRow) => a.name.localeCompare(b.name));

    return { rows, isLocked, savedAt: savedAtTs, modifiedAt: modifiedAtTs };
  },

  async save(
    date: string,
    rows: StaffAttendanceRow[],
    clearedStaffIds: string[] = [],
    editorMode = false,
  ): Promise<{ savedAt: string | null; modifiedAt: string | null }> {
    const result = await apiPrincipal.staffAttendanceSave({
      date,
      rows: rows.map(r => ({ staffId: r.staffId, status: r.status })),
      clearedStaffIds,
      editorMode,
    });
    return { savedAt: result.savedAt ?? null, modifiedAt: result.modifiedAt ?? null };
  },

  async getMonth(yearMonth: string): Promise<Array<{
    staffId: string; name: string; role: string;
    days: Array<{ date: string; status: StaffAttendanceStatus }>;
    counts: Record<StaffAttendanceStatus, number>;
  }>> {
    const schoolId = useAuthStore.getState().session?.schoolId;
    if (!schoolId) return [];
    const [year, month] = yearMonth.split('-').map(Number);
    const firstDay = `${yearMonth}-01`;
    // Build YYYY-MM-DD manually rather than via toISOString() — the latter
    // converts the local Date to UTC and shifts the month boundary by hours.
    const dim = new Date(year, month, 0).getDate();
    const lastDay  = `${yearMonth}-${String(dim).padStart(2, '0')}`;

    const { data: staff, error: sErr } = await supabase
      .from('staff').select('id, name, role, status, joining_date, relieving_date')
      .eq('school_id', schoolId).eq('is_active', true);
    if (sErr) throw new Error(sErr.message);

    // Lifecycle filter — same rule as getForDate but evaluated against
    // the month window:
    //   • Hide SUSPENDED / RELIEVED entirely.
    //   • Hide staff who joined AFTER the month ended (not employed at all).
    //   • Hide staff whose relieving_date fell BEFORE the month started.
    // Staff who joined / were relieved MID-MONTH still appear, but their
    // day cells are clipped to only the dates they were actually
    // employed (further down in the .map).
    const activeStaff = ((staff ?? []) as any[])
      .filter((s: any) => {
        if (s.status === 'SUSPENDED' || s.status === 'RELIEVED') return false;
        if (s.joining_date && s.joining_date > lastDay) return false;
        if (s.relieving_date && s.relieving_date < firstDay) return false;
        return true;
      })
      .sort((a: any, b: any) => a.name.localeCompare(b.name));

    const { data: rows, error: aErr } = await supabase
      .from('staff_attendance').select('staff_id, date, status')
      .eq('school_id', schoolId).gte('date', firstDay).lte('date', lastDay);
    if (aErr) throw new Error(aErr.message);

    const byStaff = new Map<string, Array<{ date: string; status: StaffAttendanceStatus }>>();
    for (const r of (rows ?? []) as any[]) {
      const arr = byStaff.get(r.staff_id) ?? [];
      arr.push({ date: r.date, status: r.status as StaffAttendanceStatus });
      byStaff.set(r.staff_id, arr);
    }

    const ZERO: Record<StaffAttendanceStatus, number> = {
      PRESENT: 0, ABSENT: 0, HALF_DAY: 0, LEAVE: 0, LATE: 0, HOLIDAY: 0,
    };
    return activeStaff.map((s: any) => {
      // Per-staff cell-level clip — within the month, only include
      // dates that fall inside this staff's active employment window.
      // Earlier the grid would render PRESENT cells from January for
      // a teacher who actually joined on Jan 20.
      const inEmploymentWindow = (d: string) => {
        if (s.joining_date && d < s.joining_date) return false;
        if (s.relieving_date && d > s.relieving_date) return false;
        return true;
      };
      const days = (byStaff.get(s.id) ?? [])
        .filter(d => inEmploymentWindow(d.date))
        .sort((a, b) => a.date.localeCompare(b.date));
      const counts = { ...ZERO };
      for (const d of days) counts[d.status]++;
      return { staffId: s.id, name: s.name, role: s.role, days, counts };
    });
  },

  /**
   * Summary for a single staff member over a date range. Used by the staff
   * profile panel's Attendance tab. Returns the per-day rows plus per-status
   * counts so the UI can show both a quick number ("23 P · 2 A") and a day
   * strip without re-querying.
   */
  async getStaffAttendanceForRange(
    staffId: string, startDate: string, endDate: string,
  ): Promise<{
    days: Array<{ date: string; status: StaffAttendanceStatus }>;
    counts: Record<StaffAttendanceStatus, number>;
  }> {
    const schoolId = useAuthStore.getState().session?.schoolId;
    if (!schoolId) throw new Error('No school in session');
    // Pull the staff's lifecycle window so the day list only includes
    // dates inside their employment period — same rule as the monthly
    // grid. Otherwise a staff profile shows phantom days from before
    // they joined / after they left.
    const { data: staffRow } = await supabase
      .from('staff').select('joining_date, relieving_date')
      .eq('id', staffId).maybeSingle();
    const joining   = (staffRow as { joining_date: string | null } | null)?.joining_date ?? null;
    const relieving = (staffRow as { relieving_date: string | null } | null)?.relieving_date ?? null;

    const { data, error } = await supabase
      .from('staff_attendance').select('date, status')
      .eq('school_id', schoolId).eq('staff_id', staffId)
      .gte('date', startDate).lte('date', endDate)
      .order('date', { ascending: true });
    if (error) throw new Error(error.message);
    const inEmploymentWindow = (d: string) => {
      if (joining && d < joining) return false;
      if (relieving && d > relieving) return false;
      return true;
    };
    const days = ((data ?? []) as Array<{ date: string; status: StaffAttendanceStatus }>)
      .filter(d => inEmploymentWindow(d.date));
    const counts: Record<StaffAttendanceStatus, number> = {
      PRESENT: 0, ABSENT: 0, HALF_DAY: 0, LEAVE: 0, LATE: 0, HOLIDAY: 0,
    };
    for (const d of days) counts[d.status]++;
    return { days, counts };
  },
};
