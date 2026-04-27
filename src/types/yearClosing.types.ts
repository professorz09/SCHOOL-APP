// ─── Academic Year ────────────────────────────────────────────────────────────

export type AcademicYearStatus = 'ACTIVE' | 'LOCKED';

// ─── Student Year Status ──────────────────────────────────────────────────────

export type StudentStatusType =
  | 'ACTIVE'
  | 'DROPPED_OUT'
  | 'PASS_OUT'
  | 'GRADUATED'
  | 'TRANSFERRED';

export interface StudentYearStatus {
  id: string;
  studentId: string;
  academicYearId: string;
  status: StudentStatusType;
  statusChangeDate: string;
  reason?: string;
  notes?: string;
  leaveDate?: string;
  tCIssued: boolean;
  tCIssuedDate?: string;
  currentClass: string;
  currentSection: string;
}

// ─── Stream ───────────────────────────────────────────────────────────────────

export type StreamName = 'Science-PCM' | 'Science-PCB' | 'Commerce' | 'Arts';

export interface StreamDefinition {
  id: string;
  name: StreamName;
  capacity: number;
  currentCount: number;
}

export interface StreamAssignment {
  id: string;
  studentId: string;
  studentName: string;
  academicYearId: string;
  stream: StreamName;
  section: string;
  preference: number;
  assignmentDate: string;
  assignmentMethod: 'AUTO' | 'MANUAL';
  eligibilityMet: boolean;
  reasonIfNotEligible?: string;
}

// ─── Transfer Certificate ─────────────────────────────────────────────────────

export interface TransferCertificate {
  id: string;
  tcNumber: string;
  studentId: string;
  studentName: string;
  academicYearId: string;
  issuedDate: string;
  leaveDate: string;
  reason: string;
  snapshot: {
    className: string;
    section: string;
    rollNo: string;
    attendance: number;
    conduct: string;
    feesSettled: boolean;
    dueAmount: number;
    paidAmount: number;
  };
  issuerName: string;
}

// ─── Year Closing Config ──────────────────────────────────────────────────────

export type OutstandingDuesHandling = 'WRITEOFF' | 'ARREARS';

export interface YearClosingConfig {
  id: string;
  fromYearId: string;
  nextYearName: string;
  nextYearStartDate: string;
  nextYearEndDate: string;
  board: string;
  streams: StreamDefinition[];
  outstandingDuesHandling: OutstandingDuesHandling;
  carryForward: {
    staff: boolean;
    vehicles: boolean;
    feeStructure: boolean;
    timetable: boolean;
  };
  status: 'PENDING_COMMIT' | 'COMMITTED' | 'FAILED';
  createdDate: string;
  errorMessage?: string;
}

// ─── Pre-Closing Checklist ────────────────────────────────────────────────────

export interface PreClosingChecklist {
  feesPending: {
    total: number;
    count: number;
    students: { id: string; name: string; dueAmount: number }[];
  };
  salaryPending: {
    total: number;
    count: number;
    staff: { id: string; name: string; pendingMonths: number }[];
  };
  resultsCompletion: {
    completed: number;
    total: number;
    percentage: number;
  };
  attendanceCompletion: {
    completed: number;
    total: number;
    percentage: number;
  };
  status: 'READY' | 'NOT_READY';
  blockers: string[];
  warnings: string[];
}

// ─── Year Closing Preview ─────────────────────────────────────────────────────

export interface YearClosingPreview {
  summary: {
    fromYear: string;
    toYear: string;
    studentsTotal: number;
    studentsToPromote: number;
    studentsToDetain: number;
    studentsDroppedOut: number;
    studentsGraduating: number;
    streamsToAssign: number;
    staffToCarry: number;
  };
  errors: string[];
  warnings: string[];
}

// ─── Year Closing Result ──────────────────────────────────────────────────────

export interface YearClosingResult {
  success: boolean;
  newYearId: string;
  newYearName: string;
  summary: {
    oldYearLocked: string;
    newYearCreated: string;
    studentsPromoted: number;
    studentsDetained: number;
    studentsGraduated: number;
    streamsAssigned: number;
    feesAction: string;
  };
}

// ─── Audit Log ────────────────────────────────────────────────────────────────

export interface AuditLogEntry {
  id: string;
  academicYearId: string;
  action: string;
  entityType: string;
  entityId: string;
  details: string;
  performedAt: string;
}
