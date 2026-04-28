export type AttendanceApprovalStatus = 'PENDING' | 'APPROVED';

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

let _records: SharedAttendanceRecord[] = [];

export const sharedAttendance = {
  submit(record: Omit<SharedAttendanceRecord, 'id' | 'status'>): SharedAttendanceRecord {
    const newRecord: SharedAttendanceRecord = {
      ...record,
      id: `att_${Date.now()}`,
      status: 'PENDING',
    };
    _records = [newRecord, ..._records];
    return newRecord;
  },

  getAll(): SharedAttendanceRecord[] {
    return [..._records];
  },

  getPending(): SharedAttendanceRecord[] {
    return _records.filter(r => r.status === 'PENDING');
  },

  updateStudents(id: string, students: AttendanceStudentRecord[]): SharedAttendanceRecord | null {
    const present = students.filter(s => s.isPresent).length;
    const absent  = students.filter(s => !s.isPresent).length;
    _records = _records.map(r =>
      r.id === id
        ? { ...r, students, totalPresent: present, totalAbsent: absent }
        : r,
    );
    return _records.find(r => r.id === id) ?? null;
  },

  approve(id: string): SharedAttendanceRecord | null {
    _records = _records.map(r => r.id === id ? { ...r, status: 'APPROVED' } : r);
    return _records.find(r => r.id === id) ?? null;
  },
};
