// Supabase-backed sharedAttendance — reads attendance_records +
// attendance_student_details directly. All operations are async, scoped to the
// caller's school + active academic year (RLS enforces tenant isolation).
//
// Phase 6: cells now carry a 4-way status (present/absent/holiday/half)
// instead of just is_present boolean.

import { supabase } from '@/lib/supabase';
import { apiAttendance } from '@/lib/apiClient';
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
  users: { name: string } | { name: string }[] | null;
}

const ATT_FIELDS =
  'id, section_id, class_name, section, date, total_present, total_absent, ' +
  'total_students, total_holiday, total_half, approval_status, is_locked, users:marked_by(name)';

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
    status: (r.approval_status as AttendanceApprovalStatus) ?? 'PENDING',
    isLocked: r.is_locked,
    students: [],
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────

export const sharedAttendance = {
  /** All attendance records for the current school + active year (newest first). */
  async getAll(): Promise<SharedAttendanceRecord[]> {
    const schoolId = getSchoolId();
    const yearId = await getActiveYearId();
    const { data, error } = await supabase
      .from('attendance_records')
      .select(ATT_FIELDS)
      .eq('school_id', schoolId).eq('academic_year_id', yearId)
      .order('date', { ascending: false })
      .limit(500);
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
  ): Promise<void> {
    const res = await apiAttendance.submit({
      sectionId,
      date,
      records: students.map(s => ({ studentId: s.id, status: s.status })),
    });
    await logAudit('attendance_submitted', 'attendance_records', res.attendanceId, {
      sectionId, date,
      present: res.present, absent: res.absent,
      holiday: res.holiday ?? 0, half: res.half ?? 0, total: res.total,
    });
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

  /** Approve a teacher-submitted record. */
  async approve(id: string): Promise<void> {
    await apiAttendance.approve(id);
    await logAudit('attendance_approved', 'attendance_records', id);
  },

  /** Reject a teacher-submitted record (teacher may re-submit). */
  async reject(id: string, reason?: string): Promise<void> {
    await apiAttendance.reject(id, reason);
    await logAudit('attendance_rejected', 'attendance_records', id, { reason: reason ?? null });
  },

  /** Replace per-student rows + recompute totals for a record.
   *  `reason` is required by the server when the record is already approved/locked. */
  async updateStudents(id: string, students: AttendanceStudentRecord[], reason?: string): Promise<void> {
    await apiAttendance.updateStudents({
      attendanceId: id,
      reason,
      students: students.map(s => ({ studentId: s.id, status: s.status })),
    });
    const present = students.filter(s => s.status === 'present' || s.status === 'half').length;
    const absent = students.filter(s => s.status === 'absent').length;
    await logAudit('attendance_edited', 'attendance_records', id, {
      present, absent, total: students.length, ...(reason ? { reason } : {}),
    });
  },
}
