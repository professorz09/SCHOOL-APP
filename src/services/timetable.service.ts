// Supabase-backed timetable service.
//   timetable_periods  — class period slot definitions (per school + year)
//   timetable_entries  — actual subject/teacher/room cell per (section, day, slot)
//
// Conflict detection runs in JS over the cache:
//   - same teacher booked in same day+slot
//   - inactive teacher
//   - timetable for closed academic year (write blocked)

import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { useCorrectionStore } from '../store/correctionStore';
import { useEditingYearStore } from '../store/editingYearStore';
import { logAudit } from '../lib/audit';

export type TDay = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
export type SlotType = 'CLASS' | 'BREAK' | 'LUNCH' | 'ASSEMBLY' | 'FREE';

export interface PeriodSlot {
  slotId: string;
  label: string;
  startTime: string;
  endTime: string;
  type: SlotType;
  isFixed: boolean;
}

export interface TimetableEntry {
  id: string;
  classId: string;
  className: string;
  section: string;
  day: TDay;
  slotId: string;
  subject: string;
  teacherId: string;
  teacherName: string;
  room: string;
  academicYearId: string;
}

export interface TimetableTeacher {
  id: string;
  name: string;
  subject: string;
}

export const DAYS: TDay[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Default slots — used until the school configures their own row in timetable_periods.
const DEFAULT_SLOTS: PeriodSlot[] = [
  { slotId: 'assembly', label: 'Assembly', startTime: '08:00', endTime: '08:20', type: 'ASSEMBLY', isFixed: true },
  { slotId: 'p1', label: 'Period 1', startTime: '08:20', endTime: '09:05', type: 'CLASS', isFixed: false },
  { slotId: 'p2', label: 'Period 2', startTime: '09:05', endTime: '09:50', type: 'CLASS', isFixed: false },
  { slotId: 'break', label: 'Short Break', startTime: '09:50', endTime: '10:05', type: 'BREAK', isFixed: true },
  { slotId: 'p3', label: 'Period 3', startTime: '10:05', endTime: '10:50', type: 'CLASS', isFixed: false },
  { slotId: 'p4', label: 'Period 4', startTime: '10:50', endTime: '11:35', type: 'CLASS', isFixed: false },
  { slotId: 'lunch', label: 'Lunch Break', startTime: '11:35', endTime: '12:15', type: 'LUNCH', isFixed: true },
  { slotId: 'p5', label: 'Period 5', startTime: '12:15', endTime: '13:00', type: 'CLASS', isFixed: false },
  { slotId: 'p6', label: 'Period 6', startTime: '13:00', endTime: '13:45', type: 'CLASS', isFixed: false },
];

export let PERIOD_SLOTS: PeriodSlot[] = [...DEFAULT_SLOTS];

function getSchoolId(): string {
  const id = useAuthStore.getState().session?.schoolId;
  if (!id) throw new Error('No school in session');
  return id;
}

let _entriesCache: TimetableEntry[] = [];
let _teachersCache: TimetableTeacher[] = [];
let _activeYearId: string | null = null;
let _yearIsClosed = false;

interface EntryRow {
  id: string; section_id: string; class_id: string;
  day: string; slot_id: string;
  subject: string | null; teacher_id: string | null;
  teacher_name: string | null; room: string | null;
  academic_year_id: string;
  sections: { class_name: string; section: string } | null;
}

async function _loadActiveYear(schoolId: string): Promise<void> {
  // Honor Correction Mode override when set — load the closed year being
  // corrected instead of the school's currently-active year.
  const override = useEditingYearStore.getState().getEditingYearId();
  if (override) {
    const { data } = await supabase
      .from('academic_years').select('id, is_closed')
      .eq('school_id', schoolId).eq('id', override).maybeSingle();
    const ay = data as { id: string; is_closed: boolean } | null;
    _activeYearId = ay?.id ?? null;
    _yearIsClosed = !!ay?.is_closed;
    return;
  }
  const { data } = await supabase
    .from('academic_years').select('id, is_closed')
    .eq('school_id', schoolId).eq('is_active', true).maybeSingle();
  const ay = data as { id: string; is_closed: boolean } | null;
  _activeYearId = ay?.id ?? null;
  _yearIsClosed = !!ay?.is_closed;
}

async function _loadPeriods(schoolId: string): Promise<void> {
  if (!_activeYearId) return;
  const { data, error } = await supabase
    .from('timetable_periods')
    .select('id, name, start_time, end_time, period_type, sort_order')
    .eq('school_id', schoolId).eq('academic_year_id', _activeYearId)
    .order('sort_order');
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{
    id: string; name: string; start_time: string; end_time: string;
    period_type: string; sort_order: number;
  }>;
  if (rows.length) {
    PERIOD_SLOTS = rows.map(r => ({
      slotId: r.id, label: r.name, startTime: r.start_time, endTime: r.end_time,
      type: (r.period_type as SlotType) ?? 'CLASS',
      isFixed: r.period_type === 'BREAK' || r.period_type === 'LUNCH' || r.period_type === 'ASSEMBLY',
    }));
  } else {
    PERIOD_SLOTS = [...DEFAULT_SLOTS];
  }
}

async function _loadEntries(schoolId: string): Promise<void> {
  if (!_activeYearId) { _entriesCache = []; return; }
  const { data, error } = await supabase
    .from('timetable_entries')
    .select('id, section_id, class_id, day, slot_id, subject, teacher_id, teacher_name, room, academic_year_id, sections(class_name, section)')
    .eq('school_id', schoolId).eq('academic_year_id', _activeYearId);
  if (error) throw new Error(error.message);
  _entriesCache = ((data ?? []) as unknown as EntryRow[]).map(r => ({
    id: r.id,
    classId: r.class_id,
    className: r.sections?.class_name ?? '',
    section: r.sections?.section ?? '',
    day: r.day as TDay,
    slotId: r.slot_id,
    subject: r.subject ?? '',
    teacherId: r.teacher_id ?? '',
    teacherName: r.teacher_name ?? '',
    room: r.room ?? '',
    academicYearId: r.academic_year_id,
  }));
}

async function _loadTeachers(schoolId: string): Promise<void> {
  const { data, error } = await supabase
    .from('staff').select('id, name, subject')
    .eq('school_id', schoolId).eq('is_active', true).eq('role', 'TEACHER')
    .order('name');
  if (error) throw new Error(error.message);
  _teachersCache = ((data ?? []) as { id: string; name: string; subject: string | null }[])
    .map(t => ({ id: t.id, name: t.name, subject: t.subject ?? '' }));
}

export const timetableService = {
  async refreshAll(): Promise<void> {
    const schoolId = getSchoolId();
    await _loadActiveYear(schoolId);
    await Promise.all([_loadPeriods(schoolId), _loadEntries(schoolId), _loadTeachers(schoolId)]);
  },

  getTeachers(): TimetableTeacher[] {
    return [..._teachersCache];
  },

  getSubjectsForClass(_classId: string): string[] {
    // Pull a default list — components can extend per school later.
    return ['Mathematics', 'Science', 'English', 'Hindi', 'Social Studies', 'Computer', 'Physics', 'Chemistry', 'Biology'];
  },

  getClassTimetable(classId: string, _academicYearId?: string): TimetableEntry[] {
    return _entriesCache.filter(e => e.classId === classId);
  },

  getTeacherSchedule(teacherId: string, _academicYearId?: string): TimetableEntry[] {
    return _entriesCache.filter(e => e.teacherId === teacherId);
  },

  hasConflict(teacherId: string, day: TDay, slotId: string, excludeId?: string): TimetableEntry | null {
    return _entriesCache.find(e =>
      e.teacherId === teacherId && e.day === day && e.slotId === slotId && e.id !== excludeId
    ) ?? null;
  },

  /** Same-class slot overlap (only one entry per class+day+slot allowed). */
  hasClassConflict(classId: string, day: TDay, slotId: string, excludeId?: string): TimetableEntry | null {
    return _entriesCache.find(e =>
      e.classId === classId && e.day === day && e.slotId === slotId && e.id !== excludeId
    ) ?? null;
  },

  /** Validate then save (insert or update). Returns conflict reason on rejection. */
  async saveEntry(entry: Omit<TimetableEntry, 'id'> & { id?: string }): Promise<{ ok: boolean; conflict?: TimetableEntry; entry?: TimetableEntry; reason?: string }> {
    // Closed years are read-only unless the principal has explicitly
    // turned Correction Mode ON for this year (per-year, in-memory).
    // The UI useEditGuard prompts for a reason and writes the
    // YEAR_CORRECTION audit row before this point.
    if (_yearIsClosed && !(_activeYearId && useCorrectionStore.getState().isOn(_activeYearId))) {
      return { ok: false, reason: 'Academic year is closed' };
    }
    const teacher = _teachersCache.find(t => t.id === entry.teacherId);
    if (entry.teacherId && !teacher) return { ok: false, reason: 'Teacher is inactive or not found' };

    // Conflict 1: same teacher booked in another class for the same day+slot.
    const teacherConflict = entry.teacherId
      ? this.hasConflict(entry.teacherId, entry.day, entry.slotId, entry.id)
      : null;
    if (teacherConflict) return { ok: false, conflict: teacherConflict, reason: 'Teacher already booked in another class' };

    // Conflict 2: this class already has a different subject/teacher in this slot.
    const classConflict = this.hasClassConflict(entry.classId, entry.day, entry.slotId, entry.id);
    if (classConflict) return { ok: false, conflict: classConflict, reason: 'Class already has an entry in this slot' };

    const schoolId = getSchoolId();
    if (!_activeYearId) throw new Error('No active academic year');

    // Resolve section_id from class_name + section.
    const { data: sec } = await supabase
      .from('sections').select('id')
      .eq('school_id', schoolId).eq('academic_year_id', _activeYearId)
      .eq('class_name', entry.className).eq('section', entry.section).maybeSingle();
    const sectionId = (sec as { id: string } | null)?.id;
    if (!sectionId) throw new Error(`Section ${entry.className}-${entry.section} not found`);

    const payload = {
      school_id: schoolId,
      academic_year_id: _activeYearId,
      section_id: sectionId,
      class_id: entry.classId,
      day: entry.day,
      slot_id: entry.slotId,
      subject: entry.subject,
      teacher_id: entry.teacherId || null,
      teacher_name: entry.teacherName,
      room: entry.room,
    };

    if (entry.id) {
      const { error } = await supabase.from('timetable_entries').update(payload).eq('id', entry.id);
      if (error) return { ok: false, reason: error.message };
    } else {
      const { error } = await supabase.from('timetable_entries').insert(payload);
      if (error) return { ok: false, reason: error.message };
    }
    await logAudit('timetable_saved', 'timetable_entry', entry.id ?? 'new', {
      classId: entry.classId, day: entry.day, slot: entry.slotId,
    });
    await this.refreshAll();
    const saved = _entriesCache.find(e =>
      e.classId === entry.classId && e.day === entry.day && e.slotId === entry.slotId
    );
    return { ok: true, entry: saved };
  },

  async deleteEntry(id: string): Promise<void> {
    // Same closed-year + correction-mode guard as saveEntry — the service
    // layer is the final enforcement boundary, even though the UI wraps
    // this in useEditGuard.gate().
    if (_yearIsClosed && !(_activeYearId && useCorrectionStore.getState().isOn(_activeYearId))) {
      throw new Error('Academic year is closed');
    }
    const { error } = await supabase.from('timetable_entries').delete().eq('id', id);
    if (error) throw new Error(error.message);
    await this.refreshAll();
  },

  /** Local-only edit of a slot's time (in-memory). For DB persistence, add a periods CRUD. */
  updateSlotTime(slotId: string, startTime: string, endTime: string): void {
    PERIOD_SLOTS = PERIOD_SLOTS.map(s => s.slotId === slotId ? { ...s, startTime, endTime } : s);
  },

  getClassWeeklyMap(classId: string, _academicYearId?: string): Record<TDay, TimetableEntry[]> {
    const entries = this.getClassTimetable(classId);
    const map = {} as Record<TDay, TimetableEntry[]>;
    for (const day of DAYS) {
      map[day] = entries.filter(e => e.day === day).sort((a, b) => {
        const ai = PERIOD_SLOTS.findIndex(s => s.slotId === a.slotId);
        const bi = PERIOD_SLOTS.findIndex(s => s.slotId === b.slotId);
        return ai - bi;
      });
    }
    return map;
  },

  getTodayForTeacher(teacherId: string, _academicYearId?: string): (TimetableEntry & { slot: PeriodSlot })[] {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
    const today = days[new Date().getDay()] as TDay;
    return _entriesCache
      .filter(e => e.teacherId === teacherId && e.day === today)
      .map(e => ({ ...e, slot: PERIOD_SLOTS.find(s => s.slotId === e.slotId)! }))
      .filter(e => e.slot)
      .sort((a, b) => a.slot.startTime.localeCompare(b.slot.startTime));
  },
};
