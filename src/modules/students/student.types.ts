import { PaymentStatus } from '@/shared/config/constants';
import type { Complaint } from '@/roles/principal/principal.types';

export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'O+' | 'O-' | 'AB+' | 'AB-';
export type Gender = 'MALE' | 'FEMALE' | 'OTHER';
export type StudentStream = 'Science' | 'Commerce' | 'Arts';
export const STREAMS: StudentStream[] = ['Science', 'Commerce', 'Arts'];
export const STREAM_CLASSES = new Set(['Class 11', 'Class 12']);

export interface Student {
  id: string;
  name: string;
  rollNo: string;
  admissionNo: string;
  className: string;
  section: string;
  stream?: StudentStream;
  dob: string;
  gender: Gender;
  bloodGroup: BloodGroup;
  aadhaarNo: string;
  phone: string;
  email: string;
  address: string;
  photo: string;
  religion: string;
  caste: string;
  penNumber: string;
  birthCertNo: string;
  tcNumber: string;
  /** Lifecycle flag — false when TC has been issued or student dropped
   *  out. Drives the StudentProfilePanel action button (Issue TC vs
   *  Re-admit) and hides inactive rows from default list views. */
  isActive: boolean;
  rte: boolean;
  fatherName: string;
  fatherPhone: string;
  fatherOccupation: string;
  fatherIncome: string;
  fatherEmail: string;
  motherName: string;
  motherPhone: string;
  motherOccupation: string;
  guardianName: string;
  guardianPhone: string;
  guardianRelation: string;
  /** Mobile the parent will use to LOG IN. Independent of father /
   *  mother / guardian phones (those stay as plain contact info on
   *  the record). On admission this drives users.mobile_number; on
   *  the /students/update-login-phone path the principal can change
   *  it later (editor-mode gated). Optional in the type because
   *  Student rows fetched from the DB don't carry it directly — it
   *  lives on the linked users row, surfaced separately when needed. */
  loginPhone?: string;
  academicYearId: string;
  admissionDate: string;
  feeStatus: PaymentStatus;
  totalFee: number;
  paidFee: number;
  attendancePercent: number;
  docs: StudentDoc[];
}

export interface StudentDoc {
  id: string;
  name: string;
  storagePath: string;
  type: 'BIRTH_CERT' | 'TRANSFER_CERT' | 'AADHAAR' | 'PHOTO' | 'OTHER';
  uploadedAt: string;
}

export interface ExamResult {
  id: string;
  examName: string;
  subject: string;
  maxMarks: number;
  obtainedMarks: number;
  grade: string;
  date: string;
}

export interface FeeRecord {
  id: string;
  studentId: string;
  studentName: string;
  amount: number;
  dueDate: string;
  paidAt: string | null;
  status: PaymentStatus;
  transactionId: string | null;
  screenshotUrl: string | null;
  description: string;
}

export interface AttendanceMonth {
  month: string;
  present: number;
  absent: number;
  total: number;
}

export interface StudentAcademicRecord {
  studentId: string;
  academicYearId: string;
  exams: ExamResult[];
  feeRecords: FeeRecord[];
  attendanceRecords: AttendanceMonth[];
  complaints: Complaint[];
}

export type CreateStudentInput = Omit<Student, 'id' | 'docs' | 'attendancePercent' | 'feeStatus' | 'paidFee' | 'isActive'>;
