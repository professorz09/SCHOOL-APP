export type ComplaintStatus = 'PENDING' | 'IN_REVIEW' | 'RESOLVED' | 'REJECTED';
export type ComplaintFrom = 'STUDENT' | 'TEACHER' | 'PARENT';
export type ApprovalType = 'LEAVE' | 'FEE_PAYMENT' | 'ATTENDANCE_CORRECTION';
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type AssetCategory = 'BOOK' | 'LAB_EQUIPMENT' | 'VEHICLE';
export type NoticeAudience = 'ALL' | 'STUDENTS' | 'TEACHERS' | 'STAFF' | 'PARENTS';

export interface Complaint {
  id: string;
  from: ComplaintFrom;
  fromName: string;
  fromClass?: string;
  /** Student roll + admission no, when the complaint is tied to a
   *  student row (parent / student submissions). Helps the principal
   *  distinguish between two students with the same name. */
  fromRollNo?: string;
  fromAdmissionNo?: string;
  subject: string;
  description: string;
  status: ComplaintStatus;
  createdAt: string;
  resolvedAt: string | null;
  response: string | null;
  isAnonymous: boolean;
}

export interface Expense {
  id: string;
  category: 'SALARY' | 'MAINTENANCE' | 'UTILITIES' | 'EVENTS' | 'SUPPLIES' | 'OTHER';
  description: string;
  amount: number;
  date: string;
  approvedBy: string;
  /** When the row was created (server timestamp). Drives the same-day
   *  delete window and the 7-day void window. */
  createdAt?: string;
  /** Soft-cancel marker. NULL = active row. */
  voidedAt?: string | null;
  voidReason?: string | null;
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
  /** Class+section / roll / admission — packed into approvals.new_value
   *  on insert by /leave/submit. Helps the principal disambiguate two
   *  students with the same name in the queue. */
  fromClass?: string;
  fromRollNo?: string;
  fromAdmissionNo?: string;
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

export interface ClassPermission {
  className: string;
  section: string;
  teacherId: string;
  teacherName: string;
  canMarkAttendance: boolean;
  canUploadResults: boolean;
  canScheduleExam?: boolean;
}
