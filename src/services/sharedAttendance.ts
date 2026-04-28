export type AttendanceApprovalStatus = 'PENDING' | 'APPROVED';
export type DateAttendanceStatus = 'NOT_MARKED' | 'PENDING' | 'APPROVED';

export interface AttendanceStudentRecord {
  id: string;
  name: string;
  rollNo: string;
  isPresent: boolean;
}

export interface SharedAttendanceRecord {
  id: string;
  classId: string;
  className: string;
  section: string;
  subject: string;
  date: string;
  totalPresent: number;
  totalAbsent: number;
  totalStudents: number;
  markedBy: string;
  status: AttendanceApprovalStatus;
  students: AttendanceStudentRecord[];
}

/* ── Seed data: realistic attendance for last ~14 days ──────────── */

const CLASS_10A_STUDENTS: AttendanceStudentRecord[] = [
  { id: 'stu1', name: 'Aakash Sharma', rollNo: '01', isPresent: true },
  { id: 'stu2', name: 'Priya Gupta',   rollNo: '02', isPresent: true },
  { id: 'stu3', name: 'Rohit Mishra',  rollNo: '03', isPresent: true },
  { id: 'stu4', name: 'Sneha Patel',   rollNo: '04', isPresent: true },
  { id: 'stu5', name: 'Arjun Nair',    rollNo: '05', isPresent: true },
  { id: 'stu6', name: 'Pooja Sharma',  rollNo: '06', isPresent: true },
  { id: 'stu7', name: 'Kunal Verma',   rollNo: '07', isPresent: true },
  { id: 'stu8', name: 'Neha Gupta',    rollNo: '08', isPresent: true },
];

const CLASS_10B_STUDENTS: AttendanceStudentRecord[] = [
  { id: 'stu9',  name: 'Mohammed Raza', rollNo: '01', isPresent: true },
  { id: 'stu10', name: 'Ananya Verma',  rollNo: '02', isPresent: true },
  { id: 'stu11', name: 'Vikram Singh',  rollNo: '03', isPresent: true },
  { id: 'stu12', name: 'Riya Joshi',    rollNo: '04', isPresent: true },
];

const CLASS_9A_STUDENTS: AttendanceStudentRecord[] = [
  { id: 'stu13', name: 'Deepak Kumar',   rollNo: '01', isPresent: true },
  { id: 'stu14', name: 'Anjali Mehta',   rollNo: '02', isPresent: true },
  { id: 'stu15', name: 'Siddharth Roy',  rollNo: '03', isPresent: true },
];

const formatDate = (d: Date) => d.toISOString().split('T')[0];
const todayStr   = () => formatDate(new Date());

/** Pseudo-random but stable per (classId, date). */
const stableHash = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

const buildRecord = (
  classId: string, className: string, section: string, subject: string,
  date: string, students: AttendanceStudentRecord[], status: AttendanceApprovalStatus,
): SharedAttendanceRecord => {
  // Mark ~85% present using stable per-student-date hash
  const stuRecs = students.map(s => {
    const isPresent = (stableHash(s.id + date) % 100) < 88;
    return { ...s, isPresent };
  });
  const present = stuRecs.filter(s => s.isPresent).length;
  return {
    id:           `seed_${classId}_${date}`,
    classId, className, section, subject, date,
    totalPresent: present,
    totalAbsent:  stuRecs.length - present,
    totalStudents: stuRecs.length,
    markedBy:     'Aarti Desai',
    status,
    students:     stuRecs,
  };
};

const generateSeed = (): SharedAttendanceRecord[] => {
  const records: SharedAttendanceRecord[] = [];
  const today = new Date();
  const classes: [string, string, string, string, AttendanceStudentRecord[]][] = [
    ['tc1', 'Class 10', 'A', 'Mathematics', CLASS_10A_STUDENTS],
    ['tc2', 'Class 10', 'B', 'Mathematics', CLASS_10B_STUDENTS],
    ['tc3', 'Class 9',  'A', 'Mathematics', CLASS_9A_STUDENTS],
  ];

  for (let daysAgo = 14; daysAgo >= 1; daysAgo--) {
    const d = new Date(today);
    d.setDate(today.getDate() - daysAgo);
    if (d.getDay() === 0) continue; // Skip Sunday

    const dateStr = formatDate(d);
    // Old records approved, recent (≤2 days) some pending
    const status: AttendanceApprovalStatus = daysAgo <= 2 ? 'PENDING' : 'APPROVED';

    for (const [classId, className, section, subject, students] of classes) {
      // Skip some random days for variety
      if (stableHash(classId + dateStr) % 100 < 15) continue;
      records.push(buildRecord(classId, className, section, subject, dateStr, students, status));
    }
  }
  return records;
};

let _records: SharedAttendanceRecord[] = generateSeed();

/* ── Service API ─────────────────────────────────────────────────── */

export const sharedAttendance = {
  submit(record: Omit<SharedAttendanceRecord, 'id' | 'status'>): SharedAttendanceRecord {
    const newRecord: SharedAttendanceRecord = {
      ...record,
      id:     `att_${Date.now()}`,
      status: 'PENDING',
    };
    _records = [newRecord, ..._records];
    return newRecord;
  },

  getAll(): SharedAttendanceRecord[] {
    return [..._records].sort((a, b) => b.date.localeCompare(a.date));
  },

  getPending(): SharedAttendanceRecord[] {
    return _records.filter(r => r.status === 'PENDING')
      .sort((a, b) => b.date.localeCompare(a.date));
  },

  getByClassAndDate(classId: string, date: string): SharedAttendanceRecord | null {
    return _records.find(r => r.classId === classId && r.date === date) ?? null;
  },

  getByDate(date: string): SharedAttendanceRecord[] {
    return _records.filter(r => r.date === date);
  },

  /** Returns a date-keyed status map for quick UI lookups. */
  getStatusForClass(classId: string, dates: string[]): Record<string, DateAttendanceStatus> {
    const map: Record<string, DateAttendanceStatus> = {};
    for (const d of dates) {
      const rec = this.getByClassAndDate(classId, d);
      map[d] = rec ? rec.status : 'NOT_MARKED';
    }
    return map;
  },

  isAlreadyMarkedToday(classId: string): boolean {
    return !!this.getByClassAndDate(classId, todayStr());
  },

  updateStudents(id: string, students: AttendanceStudentRecord[]): SharedAttendanceRecord | null {
    const present = students.filter(s => s.isPresent).length;
    const absent  = students.filter(s => !s.isPresent).length;
    _records = _records.map(r =>
      r.id === id ? { ...r, students, totalPresent: present, totalAbsent: absent } : r,
    );
    return _records.find(r => r.id === id) ?? null;
  },

  approve(id: string): SharedAttendanceRecord | null {
    _records = _records.map(r => r.id === id ? { ...r, status: 'APPROVED' } : r);
    return _records.find(r => r.id === id) ?? null;
  },

  getByClassNameSectionDate(className: string, section: string, date: string): SharedAttendanceRecord | null {
    return _records.find(r => r.className === className && r.section === section && r.date === date) ?? null;
  },

  submitPrincipal(
    className: string, section: string, date: string,
    students: AttendanceStudentRecord[],
  ): SharedAttendanceRecord {
    const present = students.filter(s => s.isPresent).length;
    const absent  = students.filter(s => !s.isPresent).length;
    const newRecord: SharedAttendanceRecord = {
      id:           `att_${Date.now()}`,
      classId:      `${className.replace('Class ', '').toLowerCase()}-${section.toLowerCase()}`,
      className, section,
      subject:      'General',
      date,
      totalPresent: present,
      totalAbsent:  absent,
      totalStudents: students.length,
      markedBy:     'Principal',
      status:       'APPROVED',
      students,
    };
    _records = [newRecord, ..._records];
    return newRecord;
  },

  /* ── Student-facing queries ──────────────────────────────────── */

  getForStudent(studentId: string): { date: string; isPresent: boolean; status: AttendanceApprovalStatus; subject: string }[] {
    return _records
      .map(r => {
        const stu = r.students.find(s => s.id === studentId);
        if (!stu) return null;
        return { date: r.date, isPresent: stu.isPresent, status: r.status, subject: r.subject };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.date.localeCompare(a.date));
  },

  /** Aggregated month stats for a student. */
  getStudentMonthSummary(studentId: string): { month: string; present: number; absent: number; total: number }[] {
    const records = this.getForStudent(studentId).filter(r => r.status === 'APPROVED');
    const buckets: Record<string, { present: number; absent: number; total: number }> = {};
    for (const r of records) {
      const key = r.date.slice(0, 7); // YYYY-MM
      if (!buckets[key]) buckets[key] = { present: 0, absent: 0, total: 0 };
      buckets[key].total++;
      if (r.isPresent) buckets[key].present++; else buckets[key].absent++;
    }
    return Object.entries(buckets)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, v]) => {
        const d = new Date(key + '-01');
        const monthLabel = d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
        return { month: monthLabel, ...v };
      });
  },
};
