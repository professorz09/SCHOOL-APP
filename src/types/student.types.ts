export type PeriodType = 'CLASS' | 'EXAM' | 'FREE' | 'LUNCH' | 'ASSEMBLY';

export interface TimetablePeriod {
  id: string;
  period: number;
  subject: string;
  teacher: string;
  startTime: string;
  endTime: string;
  room: string;
  type: PeriodType;
}

export interface TimetableDay {
  day: string;
  date: string;
  periods: TimetablePeriod[];
}

export interface StudentExamResult {
  id: string;
  examName: string;
  testType: string;
  subject: string;
  teacherName: string;
  maxMarks: number;
  obtainedMarks: number;
  grade: string;
  date: string;
  rank: number | null;
  totalStudents: number;
  teacherNote?: string;
}

export interface StudentFeeQR {
  amount: number;
  description: string;
  upiId: string;
  qrData: string;
}

export interface FeePaymentUpload {
  id: string;
  amount: number;
  description: string;
  screenshotName: string;
  /**
   * Path of the uploaded screenshot in the `fee-screenshots` storage
   * bucket (`<schoolId>/<studentId>/<filename>`). Null for legacy rows
   * created before screenshots were actually persisted. Resolve to a
   * viewable URL with `studentDashboardService.getFeeScreenshotSignedUrl`.
   */
  screenshotPath: string | null;
  submittedAt: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
}

export interface TransportStop {
  name: string;
  lat: number;
  lng: number;
  estimatedTime: string;
  status: 'COMPLETED' | 'CURRENT' | 'UPCOMING';
}

export interface StudentNotice {
  id: string;
  title: string;
  body: string;
  sentAt: string;
  category: 'EXAM' | 'FEE' | 'EVENT' | 'GENERAL';
  pinned: boolean;
}

export interface StudentComplaint {
  id: string;
  subject: string;
  description: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  createdAt: string;
  response: string | null;
}
