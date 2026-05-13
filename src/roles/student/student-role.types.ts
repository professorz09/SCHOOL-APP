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
  /** UPI/Bank reference number entered by parent — required, NOT NULL. */
  transactionId: string;
  submittedAt: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  /**
   * Principal's note attached on review — usually empty for APPROVED rows,
   * but for REJECTED ones it carries the reason (e.g. "Wrong UTR" /
   * "Amount mismatch") + a contact phone the parent should reach out to.
   * Surface this to the parent so they know *why* the payment was rejected
   * instead of just seeing a red badge with no recourse.
   */
  reviewerNote: string | null;
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
  // PERSONAL = sent directly to this student (audience=SPECIFIC_STUDENT).
  category: 'EXAM' | 'FEE' | 'EVENT' | 'GENERAL' | 'PERSONAL';
  pinned: boolean;
  /** Display name of the user who sent the notice (principal / teacher).
   *  Empty string when the row is missing sent_by_name (legacy). */
  sentBy: string;
  /** Sender's role — used to surface "Principal" vs "Teacher" badge
   *  next to the name so the student/parent knows who authored it.
   *  Empty when sent_by row no longer exists. */
  sentByRole: string;
}

export interface StudentComplaint {
  id: string;
  subject: string;
  description: string;
  status: 'PENDING' | 'IN_REVIEW' | 'RESOLVED' | 'REJECTED';
  createdAt: string;
  response: string | null;
  isAnonymous: boolean;
  /** Submitter flipped this on so the row doesn't show up in their own
   *  list anymore. The server still returns hidden rows so the client can
   *  count them toward the rolling 30-day anonymous cap (otherwise hide
   *  would silently free up a slot to refile). UI filters them out at
   *  render time. */
  hiddenFromSubmitter?: boolean;
}
