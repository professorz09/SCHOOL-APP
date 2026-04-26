import { SchoolStatus, BillingPlan, PaymentStatus } from '../config/constants';

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
  createdAt: string;
  academicYears: SchoolAcademicYear[];
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
