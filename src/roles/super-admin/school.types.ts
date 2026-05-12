import { SchoolStatus, BillingPlan, PaymentStatus } from '@/shared/config/constants';

export interface School {
  id: string;
  name: string;
  code: string;
  location: string;
  address: string;
  phone: string;
  principalName: string;
  principalEmail: string;
  principalPhone: string;
  status: SchoolStatus;
  plan: BillingPlan;
  studentCount: number;
  teacherCount: number;
  paymentStatus: PaymentStatus;
  paymentStartDate: string;
  createdAt: string;
  academicYears: SchoolAcademicYear[];
  /** SUPER_ADMIN-controlled toggle. When FALSE, the principal cannot
   *  create a new academic year — the wizard's button is disabled and
   *  the server RPC rejects with a friendly error. Default FALSE so
   *  schools opt-in explicitly when ready for year-end planning. */
  newYearCreationEnabled: boolean;
  /** SUPER_ADMIN-controlled one-shot toggle that gates the principal's
   *  Close Academic Year action. Flag auto-resets to FALSE after a
   *  successful close so a second close requires another approval. */
  yearCloseEnabled: boolean;
  /** Hard cap on active students. NULL = unlimited. SUPER_ADMIN only.
   *  Cannot be lowered below the school's current active count. */
  maxStudents: number | null;
  /** Same as maxStudents but for staff. */
  maxStaff: number | null;
  /** Hard cap on active transport vehicles. SUPER_ADMIN only.
   *    NULL → unlimited (legacy default for older schools)
   *    0    → transport service DISABLED — principal can't add the
   *           first vehicle, and the Transport tile hides on the
   *           dashboard so the school looks clean.
   *    N    → up to N active vehicles. */
  maxVehicles: number | null;
}

export interface SchoolAcademicYear {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  totalStudents: number;
  totalRevenue: number;
  totalExpense: number;
  sections: ClassSection[];
}

export interface ClassSection {
  id: string;
  className: string;
  section: string;
  studentCount: number;
  classTeacher: string;
  students: StudentBrief[];
}

export interface StudentBrief {
  id: string;
  name: string;
  rollNo: string;
  phone: string;
  feeStatus: PaymentStatus;
}

export interface StaffBrief {
  id: string;
  name: string;
  role: string;
  subject: string;
  phone: string;
  status: 'ACTIVE' | 'ON_LEAVE';
}

export type CreateSchoolInput = Omit<School, 'id' | 'createdAt' | 'academicYears' | 'studentCount' | 'teacherCount' | 'paymentStatus'> & {
  password: string;
};

export type UpdateSchoolInput = Partial<Omit<School, 'id' | 'createdAt' | 'academicYears'>>;
