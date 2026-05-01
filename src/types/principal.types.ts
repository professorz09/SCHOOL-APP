import { PaymentStatus } from '../config/constants';

export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'O+' | 'O-' | 'AB+' | 'AB-';
export type Gender = 'MALE' | 'FEMALE' | 'OTHER';
export type StaffRole = 'TEACHER' | 'VICE_PRINCIPAL' | 'ACCOUNTANT' | 'LIBRARIAN' | 'LAB_INCHARGE' | 'DRIVER' | 'PEON' | 'SECURITY';
export type StaffStatus = 'ACTIVE' | 'ON_LEAVE' | 'SUSPENDED' | 'RELIEVED';
export type SalaryPaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'UPI' | 'CHEQUE' | 'OTHER';
export type ComplaintStatus = 'PENDING' | 'IN_REVIEW' | 'RESOLVED' | 'REJECTED';
export type ComplaintFrom = 'STUDENT' | 'TEACHER' | 'PARENT';
export type ApprovalType = 'LEAVE' | 'FEE_PAYMENT' | 'ATTENDANCE_CORRECTION';
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type AssetCategory = 'BOOK' | 'LAB_EQUIPMENT' | 'VEHICLE';
export type NoticeAudience = 'ALL' | 'STUDENTS' | 'TEACHERS' | 'STAFF' | 'PARENTS';

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
  // Extended profile fields
  religion: string;
  caste: string;
  penNumber: string;
  birthCertNo: string;
  tcNumber: string;
  rte: boolean;
  // Parent / Guardian details
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
  /** Bucket-relative storage path (e.g. `<schoolId>/<studentId>/AADHAAR/foo.jpg`).
   *  Used to mint a signed URL for preview and to delete the bytes. */
  storagePath: string;
  type: 'BIRTH_CERT' | 'TRANSFER_CERT' | 'AADHAAR' | 'PHOTO' | 'OTHER';
  uploadedAt: string;
}

export interface StudentAcademicRecord {
  studentId: string;
  academicYearId: string;
  exams: ExamResult[];
  feeRecords: FeeRecord[];
  attendanceRecords: AttendanceMonth[];
  complaints: Complaint[];
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

export interface SalaryPayment {
  id: string;
  month: string;
  amount: number;
  paidAt: string;
  transactionId: string;
  note: string;
  method?: SalaryPaymentMethod | null;
}

export interface StaffSalaryHistoryEntry {
  id: string;
  amount: number;
  effectiveFrom: string;
  reason: string | null;
  createdAt: string;
}

export interface StaffStatusHistoryEntry {
  id: string;
  oldStatus: StaffStatus | null;
  newStatus: StaffStatus;
  reason: string | null;
  changedAt: string;
}

export interface StaffDocument {
  id: string;
  staffId: string;
  docType: string;
  docName: string;
  storagePath: string;
  uploadedAt: string;
}

export interface SalaryReminderRow {
  staffId: string;
  name: string;
  role: StaffRole;
  salary: number;
  paid: number;
  pending: number;
}

export interface StaffMember {
  id: string;
  name: string;
  role: StaffRole;
  subject: string;
  phone: string;
  email: string;
  aadhaarNo: string;
  salary: number;
  joiningDate: string;
  status: StaffStatus;
  assignedClasses: string[];
  address: string;
  photo: string;
  salaryHistory?: SalaryPayment[];
  relievingDate?: string | null;
  relievingReason?: string | null;
}

export interface Complaint {
  id: string;
  from: ComplaintFrom;
  fromName: string;
  fromClass?: string;
  subject: string;
  description: string;
  status: ComplaintStatus;
  createdAt: string;
  resolvedAt: string | null;
  response: string | null;
}

export interface Expense {
  id: string;
  category: 'SALARY' | 'MAINTENANCE' | 'UTILITIES' | 'EVENTS' | 'SUPPLIES' | 'OTHER';
  description: string;
  amount: number;
  date: string;
  approvedBy: string;
}

export interface Notice {
  id: string;
  title: string;
  body: string;
  audience: NoticeAudience;
  sentAt: string;
  sentBy: string;
  pinned: boolean;
}

export interface Approval {
  id: string;
  type: ApprovalType;
  fromName: string;
  fromRole: string;
  subject: string;
  description: string;
  status: ApprovalStatus;
  createdAt: string;
  attachmentUrl: string | null;
  studentId?: string;
  rejectionReason?: string | null;
}

export interface LibraryBook {
  id: string;
  title: string;
  author: string;
  isbn: string;
  subject: string;
  totalCopies: number;
  availableCopies: number;
  issuedTo: BookIssue[];
}

export interface BookIssue {
  studentId: string;
  studentName: string;
  issuedAt: string;
  dueDate: string;
  returnedAt: string | null;
}

export interface LabEquipment {
  id: string;
  name: string;
  labType: 'SCIENCE' | 'COMPUTER' | 'LANGUAGE';
  quantity: number;
  workingCount: number;
  lastServiced: string;
}

export interface Vehicle {
  id: string;
  vehicleNo: string;
  type: 'BUS' | 'VAN';
  capacity: number;
  driverName: string;
  driverPhone: string;
  route: string;
  routeStops: string[];
  studentsAssigned: number;
}

export interface AcademicYearConfig {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  board: string;
  classes: ClassConfig[];
}

export interface ClassConfig {
  name: string;
  sections: string[];
}

export type CreateStudentInput = Omit<Student, 'id' | 'docs' | 'attendancePercent' | 'feeStatus' | 'paidFee'>;

export interface ClassPermission {
  className: string;
  section: string;
  teacherId: string;
  teacherName: string;
  canMarkAttendance: boolean;
  canUploadResults: boolean;
  canScheduleExam?: boolean;
}
