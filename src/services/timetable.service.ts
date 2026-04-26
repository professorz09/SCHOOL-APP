export type TDay = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday';
export type SlotType = 'CLASS' | 'BREAK' | 'LUNCH' | 'ASSEMBLY' | 'FREE';

export interface PeriodSlot {
  slotId: string;
  label: string;
  startTime: string;
  endTime: string;
  type: SlotType;
  isFixed: boolean; // break/lunch/assembly are fixed
}

export interface TimetableEntry {
  id: string;
  classId: string;      // e.g. "10-A"
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

export let PERIOD_SLOTS: PeriodSlot[] = [
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

export const DAYS: TDay[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const CLASS_SUBJECTS: Record<string, string[]> = {
  '8-A': ['Mathematics', 'Science', 'English', 'Hindi', 'Social Studies', 'Computer'],
  '8-B': ['Mathematics', 'Science', 'English', 'Hindi', 'Social Studies', 'Computer'],
  '9-A': ['Mathematics', 'Physics', 'Chemistry', 'English', 'Hindi', 'Biology'],
  '9-B': ['Mathematics', 'Physics', 'Chemistry', 'English', 'Hindi', 'Biology'],
  '10-A': ['Mathematics', 'Physics', 'Chemistry', 'English', 'Hindi', 'Biology'],
  '10-B': ['Mathematics', 'Physics', 'Chemistry', 'English', 'Hindi', 'Biology'],
};

// Shared in-memory store – simulates DB
let _entries: TimetableEntry[] = [
  // 10-A Monday seed data
  { id: 't1', classId: '10-A', className: '10', section: 'A', day: 'Monday', slotId: 'p1', subject: 'Mathematics', teacherId: 'st1', teacherName: 'Aarti Desai', room: 'Room 12', academicYearId: 'ay1' },
  { id: 't2', classId: '10-A', className: '10', section: 'A', day: 'Monday', slotId: 'p2', subject: 'Science', teacherId: 'st2', teacherName: 'Sanjay Mehta', room: 'Room 8', academicYearId: 'ay1' },
  { id: 't3', classId: '10-A', className: '10', section: 'A', day: 'Monday', slotId: 'p3', subject: 'English', teacherId: 'st3', teacherName: 'Priya Singh', room: 'Room 15', academicYearId: 'ay1' },
  { id: 't4', classId: '10-A', className: '10', section: 'A', day: 'Monday', slotId: 'p4', subject: 'Hindi', teacherId: 'st4', teacherName: 'Meera Jha', room: 'Room 6', academicYearId: 'ay1' },
  { id: 't5', classId: '10-A', className: '10', section: 'A', day: 'Monday', slotId: 'p5', subject: 'Social Studies', teacherId: 'st5', teacherName: 'Rao Kumar', room: 'Room 9', academicYearId: 'ay1' },
  { id: 't6', classId: '10-A', className: '10', section: 'A', day: 'Monday', slotId: 'p6', subject: 'Computer', teacherId: 'st6', teacherName: 'Ajay Tiwari', room: 'Lab', academicYearId: 'ay1' },
  // 10-A Tuesday
  { id: 't7', classId: '10-A', className: '10', section: 'A', day: 'Tuesday', slotId: 'p1', subject: 'Hindi', teacherId: 'st4', teacherName: 'Meera Jha', room: 'Room 6', academicYearId: 'ay1' },
  { id: 't8', classId: '10-A', className: '10', section: 'A', day: 'Tuesday', slotId: 'p2', subject: 'Mathematics', teacherId: 'st1', teacherName: 'Aarti Desai', room: 'Room 12', academicYearId: 'ay1' },
  { id: 't9', classId: '10-A', className: '10', section: 'A', day: 'Tuesday', slotId: 'p3', subject: 'Computer', teacherId: 'st6', teacherName: 'Ajay Tiwari', room: 'Lab', academicYearId: 'ay1' },
  { id: 't10', classId: '10-A', className: '10', section: 'A', day: 'Tuesday', slotId: 'p4', subject: 'Science', teacherId: 'st2', teacherName: 'Sanjay Mehta', room: 'Room 8', academicYearId: 'ay1' },
  { id: 't11', classId: '10-A', className: '10', section: 'A', day: 'Tuesday', slotId: 'p5', subject: 'English', teacherId: 'st3', teacherName: 'Priya Singh', room: 'Room 15', academicYearId: 'ay1' },
  { id: 't12', classId: '10-A', className: '10', section: 'A', day: 'Tuesday', slotId: 'p6', subject: 'Social Studies', teacherId: 'st5', teacherName: 'Rao Kumar', room: 'Room 9', academicYearId: 'ay1' },
  // 10-B Monday
  { id: 't13', classId: '10-B', className: '10', section: 'B', day: 'Monday', slotId: 'p1', subject: 'English', teacherId: 'st3', teacherName: 'Priya Singh', room: 'Room 3', academicYearId: 'ay1' },
  { id: 't14', classId: '10-B', className: '10', section: 'B', day: 'Monday', slotId: 'p2', subject: 'Mathematics', teacherId: 'st1', teacherName: 'Aarti Desai', room: 'Room 5', academicYearId: 'ay1' },
  { id: 't15', classId: '10-B', className: '10', section: 'B', day: 'Monday', slotId: 'p3', subject: 'Hindi', teacherId: 'st4', teacherName: 'Meera Jha', room: 'Room 7', academicYearId: 'ay1' },
  { id: 't16', classId: '10-B', className: '10', section: 'B', day: 'Monday', slotId: 'p4', subject: 'Science', teacherId: 'st2', teacherName: 'Sanjay Mehta', room: 'Lab', academicYearId: 'ay1' },
  // 9-A entries
  { id: 't17', classId: '9-A', className: '9', section: 'A', day: 'Monday', slotId: 'p1', subject: 'Mathematics', teacherId: 'st1', teacherName: 'Aarti Desai', room: 'Room 11', academicYearId: 'ay1' },
  { id: 't18', classId: '9-A', className: '9', section: 'A', day: 'Monday', slotId: 'p2', subject: 'Physics', teacherId: 'st2', teacherName: 'Sanjay Mehta', room: 'Room 14', academicYearId: 'ay1' },
  { id: 't19', classId: '9-A', className: '9', section: 'A', day: 'Monday', slotId: 'p3', subject: 'English', teacherId: 'st3', teacherName: 'Priya Singh', room: 'Room 2', academicYearId: 'ay1' },
  { id: 't20', classId: '9-A', className: '9', section: 'A', day: 'Monday', slotId: 'p4', subject: 'Hindi', teacherId: 'st4', teacherName: 'Meera Jha', room: 'Room 6', academicYearId: 'ay1' },
];

export interface TimetableTeacher {
  id: string;
  name: string;
  subject: string;
}

const TEACHERS: TimetableTeacher[] = [
  { id: 'st1', name: 'Aarti Desai', subject: 'Mathematics' },
  { id: 'st2', name: 'Sanjay Mehta', subject: 'Science/Physics' },
  { id: 'st3', name: 'Priya Singh', subject: 'English' },
  { id: 'st4', name: 'Meera Jha', subject: 'Hindi' },
  { id: 'st5', name: 'Rao Kumar', subject: 'Social Studies' },
  { id: 'st6', name: 'Ajay Tiwari', subject: 'Computer Science' },
  { id: 'st7', name: 'Coach Sunil', subject: 'Physical Education' },
];

export const timetableService = {
  getTeachers(): TimetableTeacher[] {
    return [...TEACHERS];
  },

  getSubjectsForClass(classId: string): string[] {
    return CLASS_SUBJECTS[classId] ?? ['Mathematics', 'Science', 'English', 'Hindi', 'Social Studies'];
  },

  // Get full timetable for a class (used by student & principal)
  getClassTimetable(classId: string, academicYearId = 'ay1'): TimetableEntry[] {
    return _entries.filter(e => e.classId === classId && e.academicYearId === academicYearId);
  },

  // Get teacher's weekly schedule across all classes
  getTeacherSchedule(teacherId: string, academicYearId = 'ay1'): TimetableEntry[] {
    return _entries.filter(e => e.teacherId === teacherId && e.academicYearId === academicYearId);
  },

  // Conflict check: same teacher same day same slot?
  hasConflict(teacherId: string, day: TDay, slotId: string, excludeId?: string): TimetableEntry | null {
    return _entries.find(e =>
      e.teacherId === teacherId &&
      e.day === day &&
      e.slotId === slotId &&
      e.id !== excludeId
    ) ?? null;
  },

  // Add or update a timetable entry
  saveEntry(entry: Omit<TimetableEntry, 'id'> & { id?: string }): { ok: boolean; conflict?: TimetableEntry; entry?: TimetableEntry } {
    const conflict = this.hasConflict(entry.teacherId, entry.day, entry.slotId, entry.id);
    if (conflict) return { ok: false, conflict };

    if (entry.id) {
      _entries = _entries.map(e => e.id === entry.id ? { ...e, ...entry } as TimetableEntry : e);
      const updated = _entries.find(e => e.id === entry.id)!;
      return { ok: true, entry: updated };
    }
    const newEntry: TimetableEntry = { ...entry, id: `t${Date.now()}` };
    _entries = [..._entries, newEntry];
    return { ok: true, entry: newEntry };
  },

  deleteEntry(id: string): void {
    _entries = _entries.filter(e => e.id !== id);
  },

  updateSlotTime(slotId: string, startTime: string, endTime: string): void {
    PERIOD_SLOTS = PERIOD_SLOTS.map(s => s.slotId === slotId ? { ...s, startTime, endTime } : s);
  },

  // Build a day-keyed map for a class (for student weekly view)
  getClassWeeklyMap(classId: string, academicYearId = 'ay1'): Record<TDay, TimetableEntry[]> {
    const entries = this.getClassTimetable(classId, academicYearId);
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

  // Get today's entries for a teacher
  getTodayForTeacher(teacherId: string, academicYearId = 'ay1'): (TimetableEntry & { slot: PeriodSlot })[] {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayName = days[new Date().getDay()] as TDay;
    const dayToUse: TDay = todayName === 'Sunday' ? 'Monday' : todayName;
    return _entries
      .filter(e => e.teacherId === teacherId && e.day === dayToUse && e.academicYearId === academicYearId)
      .map(e => ({ ...e, slot: PERIOD_SLOTS.find(s => s.slotId === e.slotId)! }))
      .filter(e => e.slot)
      .sort((a, b) => a.slot.startTime.localeCompare(b.slot.startTime));
  },
};
