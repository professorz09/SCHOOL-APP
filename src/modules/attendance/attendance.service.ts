// Supabase-backed sharedAttendance — reads attendance_records +
// attendance_student_details directly. All operations are async, scoped to the
// caller's school + active academic year (RLS enforces tenant isolation).
//
// Used by the principal StudentAttendanceManager to list, edit, mark, and
// approve daily class attendance. Teacher submissions land in the same tables
// via teacher.service.submitAttendance — this module reads what teachers wrote
// and lets the principal manage it.

import { supabase } from '@/shared/lib/supabase';
import { apiAttendance } from '@/shared/lib/apiClient';
import { useAuthStore } from '@/shared/store/authStore';
import { useEditingYearStore } from '@/shared/store/editingYearStore';
import { logAudit } from '@/shared/lib/audit';

export type AttendanceApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type DateAttendanceStatus = 'NOT_MARKED' | 'PENDING' | 'APPROVED';

export interface AttendanceStudentRecord {
  id: string;
  name: string;
  rollNo: string;
  isPresent: boolean;
}

export interface SharedAttendanceRecord {
  id: string;
  classId: string;       // section_id
  className: string;
  section: string;
  subject: string;       // attendance is class-wide, not subject-bound
  date: string;
  totalPresent: number;
  totalAbsent: number;
  totalStudents: number;
  markedBy: string;
  status: AttendanceApprovalStatus;
  isLocked: boolean;
  students: AttendanceStudentRecord[];   // empty in list views; populated by getStudents()
}

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
  // Honor Correction Mode override when set — lets the principal edit a
  // closed year's attendance through the same UI surface. See
  // src/store/editingYearStore.ts for the override lifecycle.
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
  approval_status: string;
  is_locked: boolean;
  users: { name: string } | { name: string }[] | null;
}

const ATT_FIELDS =
  'id, section_id, class_name, section, date, total_present, total_absent, ' +
  'total_students, approval_status, is_locked, users:marked_by(name)';

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

  /** Lazy-load the per-student rows for a single attendance record. */
  async getStudents(recordId: string): Promise<AttendanceStudentRecord[]> {
    const schoolId = getSchoolId();
    const yearId = await getActiveYearId();

    // Verify the parent record belongs to this tenant/year first.
    const { data: own, error: oErr } = await supabase
      .from('attendance_records').select('id')
      .eq('id', recordId).eq('school_id', schoolId).eq('academic_year_id', yearId)
      .maybeSingle();
    if (oErr) throw new Error(oErr.message);
    if (!own) return [];

    const { data, error } = await supabase
      .from('attendance_student_details')
      .select('student_id, is_present, students!inner(id, name, school_id)')
      .eq('attendance_id', recordId)
      .eq('students.school_id', schoolId);
    if (error) throw new Error(error.message);

    type J = { student_id: string; is_present: boolean; students: { id: string; name: string; school_id: string } | null };
    const rows = ((data ?? []) as unknown as J[]).filter(r => r.students);

    // Pull roll numbers from the year-scoped student_academic_records.
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
      .map(r => ({
        id: r.student_id,
        name: r.students!.name,
        rollNo: rolls.get(r.student_id) ?? '',
        isPresent: r.is_present,
      }))
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

  /** Principal marks attendance directly (auto-approved). */
  async submitPrincipal(
    className: string, section: string, date: string,
    students: AttendanceStudentRecord[],
  ): Promise<SharedAttendanceRecord> {
    const res = await apiAttendance.markByPrincipal({
      className,
      section,
      date,
      records: students.map(s => ({ studentId: s.id, isPresent: s.isPresent })),
    });
    await logAudit('attendance_marked_by_principal', 'attendance_records', res.attendanceId, {
      className, section, date, present: res.present, absent: res.absent, total: res.total,
    });
    // Re-fetch fully populated row (with marker name) so the UI shows it correctly.
    const schoolId = getSchoolId();
    const yearId = await getActiveYearId();
    const { data: full } = await supabase
      .from('attendance_records').select(ATT_FIELDS)
      .eq('id', res.attendanceId).single();
    return mapRow(full as unknown as AttendanceRow);
  },

  /** Approve a teacher-submitted record. */
  async approve(id: string): Promise<void> {
    const schoolId = getSchoolId();
    const yearId = await getActiveYearId();
    const userId = getUserId();
    const { data, error } = await supabase
      .from('attendance_records')
      .update({ approval_status: 'APPROVED', approved_by: userId })
      .eq('id', id).eq('school_id', schoolId).eq('academic_year_id', yearId)
      .select('id');
    if (error) throw new Error(error.message);
    if (!data || (data as unknown[]).length === 0) {
      throw new Error('Attendance record not found in current school/year');
    }
    await logAudit('attendance_approved', 'attendance_records', id);
  },

  /** Reject a teacher-submitted record (teacher may re-submit). */
  async reject(id: string, reason?: string): Promise<void> {
    const schoolId = getSchoolId();
    const yearId = await getActiveYearId();
    const userId = getUserId();
    const { data, error } = await supabase
      .from('attendance_records')
      .update({ approval_status: 'REJECTED', approved_by: userId })
      .eq('id', id).eq('school_id', schoolId).eq('academic_year_id', yearId)
      .select('id');
    if (error) throw new Error(error.message);
    if (!data || (data as unknown[]).length === 0) {
      throw new Error('Attendance record not found in current school/year');
    }
    await logAudit('attendance_rejected', 'attendance_records', id, { reason: reason ?? null });
  },

  /** Replace per-student rows + recompute totals for a record. */
  async updateStudents(id: string, students: AttendanceStudentRecord[]): Promise<void> {
    const schoolId = getSchoolId();
    const yearId = await getActiveYearId();

    // Verify the record belongs to this tenant/year before mutating.
    const { data: own, error: oErr } = await supabase
      .from('attendance_records').select('id')
      .eq('id', id).eq('school_id', schoolId).eq('academic_year_id', yearId)
      .maybeSingle();
    if (oErr) throw new Error(oErr.message);
    if (!own) throw new Error('Attendance record not found in current school/year');

    // Upsert avoids the delete→insert window; UNIQUE(attendance_id, student_id)
    // makes onConflict deterministic.
    if (students.length) {
      const rows = students.map(s => ({
        attendance_id: id, student_id: s.id, is_present: s.isPresent,
      }));
      const { error: uErr } = await supabase
        .from('attendance_student_details')
        .upsert(rows, { onConflict: 'attendance_id,student_id' });
      if (uErr) throw new Error(uErr.message);
    }

    // Drop any rows for students no longer in the input set (e.g. removed
    // roster). We fetch the existing IDs and delete by an explicit list to
    // avoid PostgREST tuple-string escaping.
    const keepIds = new Set(students.map(s => s.id));
    const { data: existing, error: eErr } = await supabase
      .from('attendance_student_details').select('student_id')
      .eq('attendance_id', id);
    if (eErr) throw new Error(eErr.message);
    const toDelete = ((existing ?? []) as { student_id: string }[])
      .map(r => r.student_id).filter(sid => !keepIds.has(sid));
    if (toDelete.length) {
      const { error: dErr } = await supabase
        .from('attendance_student_details').delete()
        .eq('attendance_id', id).in('student_id', toDelete);
      if (dErr) throw new Error(dErr.message);
    }

    const present = students.filter(s => s.isPresent).length;
    const absent = students.length - present;
    const { error: rErr } = await supabase
      .from('attendance_records')
      .update({
        total_present: present, total_absent: absent, total_students: students.length,
      })
      .eq('id', id).eq('school_id', schoolId).eq('academic_year_id', yearId);
    if (rErr) throw new Error(rErr.message);

    await logAudit('attendance_edited', 'attendance_records', id, {
      present, absent, total: students.length,
    });
  },
};
