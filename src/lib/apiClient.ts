// Typed client for all /api/* endpoints.
// Always attaches the current Supabase session token.
// Reads still go direct via Supabase (RLS protects them).
// ALL writes go through this client → Express API server.

import { supabase } from '@/lib/supabase';

// ─── Core fetch wrapper ───────────────────────────────────────────────────────

async function getToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');
  return session.access_token;
}

export async function apiFetch<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const token = await getToken();
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${token}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let json: any;
  try { json = await res.json(); }
  catch { throw new Error(res.statusText); }

  if (!res.ok) {
    throw new Error(json?.error ?? `API error ${res.status}`);
  }
  return json.data as T;
}

const get  = <T>(path: string)                   => apiFetch<T>('GET',    path);
const post = <T>(path: string, body?: unknown)   => apiFetch<T>('POST',   path, body);
const put  = <T>(path: string, body?: unknown)   => apiFetch<T>('PUT',    path, body);

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface LoginResponse {
  accessToken: string; refreshToken: string; expiresAt: number;
  user: { id: string; name: string; role: string; school_id: string | null; mustChangePassword: boolean };
}

export const apiAuth = {
  login:          (mobile: string, password: string) =>
    post<LoginResponse>('/auth/login', { mobile, password }),
  logout:         () => post<void>('/auth/logout'),
  me:             () => get<any>('/auth/me'),
  changePassword: (currentPassword: string, newPassword: string) =>
    post<void>('/auth/change-password', { currentPassword, newPassword }),
  enableEditorMode:  () => post<{ until: string }>('/auth/editor-mode/enable'),
  disableEditorMode: () => post<{ until: null }>('/auth/editor-mode/disable'),
};

// ─── Academic Year ───────────────────────────────────────────────────────────

export const apiAcademicYear = {
  list:       () => get<any[]>('/academic-year'),
  active:     () => get<any>('/academic-year/active'),
  create:     (body: { label: string; startDate: string; endDate: string; board?: string; medium?: string }) =>
    post<any>('/academic-year/create', body),
  setActive:  (yearId: string) => post<any>('/academic-year/set-active', { yearId }),
  close:      (yearId: string) => post<any>('/academic-year/close', { yearId }),
  getSections: (yearId: string) => get<any[]>(`/academic-year/${yearId}/sections`),
  createSections: (yearId: string, sections: { className: string; section: string; classTeacher?: string }[]) =>
    post<any[]>('/academic-year/sections', { yearId, sections }),
  createWithSections: (body: {
    label: string; startDate: string; endDate: string;
    board: string; medium: string; streams: string[];
    sections: { className: string; section: string; stream?: string | null; capacity: number }[];
  }) => post<{ yearId: string }>('/academic-year/create-with-sections', body),
  commitClosing: (body: {
    oldYearId: string; newLabel: string; newStart: string; newEnd: string;
    newBoard: string; newMedium: string;
    decisions: { student_id: string; action: string; new_class_name?: string; new_section?: string }[];
    duesHandling: 'WRITEOFF' | 'ARREARS' | 'NONE';
  }) => post<{ newYearId: string; promoted: number; writtenOffRows: number; writtenOffAmt: number }>(
    '/academic-year/commit-closing', body,
  ),
  delete: (yearId: string) => post<{ yearId: string; label: string }>('/academic-year/delete', { yearId }),
};

// ─── Students ────────────────────────────────────────────────────────────────

export const apiStudents = {
  list:       (params?: { yearId?: string; search?: string; status?: string }) => {
    const q = new URLSearchParams(params as any).toString();
    return get<any[]>(`/students${q ? '?' + q : ''}`);
  },
  getById:    (id: string) => get<any>(`/students/${id}`),
  create:     (body: Record<string, unknown>) => post<any>('/students/create', body),
  assign:     (body: {
    studentId: string; className: string; section: string; academicYearId: string;
    rollNo?: string; totalFee?: number; sectionId?: string;
    feeHeads?: any[]; dueDates?: any[]; isRte?: boolean;
    discountAmount?: number; discountPct?: number;
  }) => post<{ record: any; installmentCount: number; totalAmount: number }>('/students/assign', body),
  deactivate: (studentId: string, reason?: string) =>
    post<any>('/students/deactivate', { studentId, reason }),
  update: (body: {
    studentId: string; patch: Record<string, unknown>;
    academicYearPatch?: Record<string, unknown>; academicYearId?: string;
  }) => post<any>('/students/update', body),
  changeRequest: (body: {
    studentId: string; field: string; newValue: string; reason: string; proofUrl?: string;
  }) => post<any>('/students/change-request', body),
  classMovement: (body: {
    studentId: string; academicYearId: string; newClass: string; newSection: string;
    effectiveDate: string; reason: string;
  }) => post<any>('/students/class-movement', body),
  fail: (body: { studentId: string; academicYearId: string; reason?: string }) =>
    post<any>('/students/fail', body),
  issueTC: (body: { studentId: string; tcNumber: string; reason?: string }) =>
    post<any>('/students/issue-tc', body),
  readmit: (studentId: string) =>
    post<any>('/students/readmit', { studentId }),
  addDocument: (body: { studentId: string; docType: string; docUrl: string }) =>
    post<any>('/students/document/add', body),
  removeDocument: (documentId: string) =>
    post<{ documentId: string; docUrl: string }>('/students/document/remove', { documentId }),
  getAcademicHistory: (studentId: string) =>
    get<any[]>(`/students/${studentId}/academic-history`),
  getTimeline: (studentId: string) =>
    get<Array<{ type: string; date: string; label: string; sub?: string }>>(`/students/${studentId}/timeline`),
};

// ─── Fees ────────────────────────────────────────────────────────────────────

export const apiFees = {
  getStructures: (yearId?: string) => {
    const q = yearId ? `?yearId=${yearId}` : '';
    return get<any[]>(`/fees/structures${q}`);
  },
  createStructure: (body: {
    name: string; className: string; academicYearId: string;
    feeHeads: any[]; monthlyDueDates: any[]; lateFee?: any;
  }) => post<any>('/fees/structure/create', body),
  generateSchedule: (body: {
    studentId: string; yearId: string; heads: any[]; dueDates: any[];
    isRte?: boolean; discountAmount?: number; discountPct?: number;
  }) => post<any>('/fees/schedule/generate', body),
  pay: (body: {
    studentId: string; amount: number; method: string;
    date?: string; note?: string; useAdvance?: boolean; applyLateFee?: boolean; discountAmount?: number;
  }) => post<any>('/fees/pay', body),
  payInstallment: (body: {
    installmentId: string; amount: number; discount?: number;
    method?: string; date?: string; note?: string; useAdvance?: boolean;
  }) => post<{ paymentId: string; payment: any }>('/fees/pay-installment', body),
  getStudentFees: (studentId: string, yearId?: string) => {
    const q = yearId ? `?yearId=${yearId}` : '';
    return get<any>(`/fees/student/${studentId}${q}`);
  },
  govtPay: (body: { studentIds: string[]; totalAmount: number; referenceNo: string; note: string }) =>
    post<any>('/fees/govt-pay', body),
  writeoff: (body: { installmentId: string; amount: number; reason: string }) =>
    post<any>('/fees/writeoff', body),
  reversePayment: (body: { paymentId: string; reason: string }) =>
    post<{ reversalId: string; originalId: string }>('/fees/payment/reverse', body),
};

// ─── Staff ───────────────────────────────────────────────────────────────────

export const apiStaff = {
  deactivate: (staffId: string) =>
    post<any>('/staff/deactivate', { staffId }),
  paySalary: (body: {
    staffId: string; month: string; amount: number;
    note?: string; method?: string; transactionId?: string;
    paidAt?: string;
  }) => post<any>('/staff/salary/pay', body),
  reverseSalary: (body: { paymentId: string; reason: string }) =>
    post<{ paymentId: string }>('/staff/salary/reverse', body),
  updateSalary: (body: {
    staffId: string; newAmount: number; effectiveFrom: string; reason: string;
  }) => post<any>('/staff/salary/update', body),
  relieve: (body: { staffId: string; date: string; reason: string }) =>
    post<any>('/staff/relieve', body),
  rejoin: (staffId: string) =>
    post<{ staffId: string }>('/staff/rejoin', { staffId }),
  create: (body: {
    userId: string | null; name: string; role: string; salary: number;
    subject?: string; phone?: string; email?: string; aadhaarNo?: string;
    joiningDate?: string; status?: string; address?: string; photo?: string;
    assignedClasses?: string[];
  }) => post<any>('/staff/create', body),
  update: (body: {
    id: string; patch: Record<string, unknown>; assignedClasses?: string[];
  }) => post<any>('/staff/update', body),
  deleteDocument: (documentId: string) =>
    post<{ documentId: string; docUrl: string }>('/staff/document/delete', { documentId }),
};

// ─── Transport ───────────────────────────────────────────────────────────────

export const apiTransport = {
  getVehicles: () => get<any[]>('/transport/vehicles'),
  getStudentAssignments: (studentId: string) => get<any[]>(`/transport/student/${studentId}`),
  assign: (body: {
    studentId: string; vehicleId: string; stopId: string;
    monthlyAmount: number; startDate: string; academicYearId: string;
    endDate?: string; reason?: string; feeStructureId?: string;
  }) => post<any>('/transport/assign', body),
  remove: (body: { studentId: string; endDate: string; reason?: string }) =>
    post<any>('/transport/remove', body),
  addVehicle: (body: { vehicleNo: string; type: string; capacity: number; routeName: string }) =>
    post<any>('/transport/vehicles/add', body),
  updateVehicle: (id: string, patch: Record<string, unknown>) =>
    post<any>('/transport/vehicles/update', { id, patch }),
  deactivateVehicle: (id: string) =>
    post<any>('/transport/vehicles/deactivate', { id }),
  addStop: (body: { vehicleId: string; name: string; estimatedTime: string; lat?: number; lng?: number; sortOrder?: number }) =>
    post<any>('/transport/stops/add', body),
  updateStop: (stopId: string, patch: Record<string, unknown>) =>
    post<any>('/transport/stops/update', { stopId, patch }),
  removeStop: (stopId: string) =>
    post<any>('/transport/stops/remove', { stopId }),
};

// ─── Timetable ────────────────────────────────────────────────────────────────

export const apiTimetable = {
  save: (body: {
    id?: string; academicYearId: string;
    className: string; section: string; classId: string;
    day: string; slotId: string; subject: string;
    teacherId?: string | null; teacherName: string; room: string;
  }) => post<any>('/timetable/save', body),
  deleteEntry: (id: string) => post<any>('/timetable/delete', { id }),
};

// ─── Attendance ───────────────────────────────────────────────────────────────

export type AttendanceCellStatus = 'present' | 'absent' | 'holiday' | 'half';

export const apiAttendance = {
  get: (sectionId: string, date: string) =>
    get<any>(`/attendance?sectionId=${sectionId}&date=${date}`),
  grid: (sectionId: string, startDate: string, endDate: string) =>
    get<any>(`/attendance/grid?sectionId=${encodeURIComponent(sectionId)}&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`),
  exportExcelUrl: (sectionId: string, startDate: string, endDate: string, className: string, section: string) =>
    `/api/attendance/export-excel?sectionId=${encodeURIComponent(sectionId)}&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&className=${encodeURIComponent(className)}&section=${encodeURIComponent(section)}`,
  submit: (body: {
    sectionId: string; date: string;
    records: { studentId: string; isPresent?: boolean; status?: AttendanceCellStatus }[];
  }) => post<any>('/attendance/submit', body),
  approve: (attendanceId: string) =>
    post<any>('/attendance/approve', { attendanceId }),
  reject: (attendanceId: string, reason?: string) =>
    post<any>('/attendance/reject', { attendanceId, reason }),
  updateStudents: (body: {
    attendanceId: string;
    reason?: string;
    /** 'patch' (default) preserves rows not in `students`; 'full' deletes them. */
    mode?: 'patch' | 'full';
    students: { studentId: string; isPresent?: boolean; status?: AttendanceCellStatus }[];
  }) => post<any>('/attendance/update-students', body),
  markByPrincipal: (body: {
    className: string; section: string; date: string;
    records: { studentId: string; isPresent?: boolean; status?: AttendanceCellStatus }[];
  }) => post<any>('/attendance/mark-by-principal', body),
};

// ─── Exams ───────────────────────────────────────────────────────────────────

export const apiExams = {
  list: (params?: { yearId?: string; sectionId?: string; className?: string }) => {
    const q = new URLSearchParams(params as any).toString();
    return get<any[]>(`/exam${q ? '?' + q : ''}`);
  },
  create: (body: {
    title: string; testType: string; className: string; subject: string;
    scheduledDate: string; maxMarks: number; academicYearId: string;
    examType?: string; passMarks?: number; passMarksConfig?: Record<string, number>;
    sectionId?: string; duration?: number; syllabus?: string;
  }) => post<any>('/exam/create', body),
  uploadResults: (body: {
    testId: string; academicYearId: string;
    results: { studentId: string; marks: number; grade?: string; remarks?: string }[];
  }) => post<any>('/exam/result/upload', body),
  getResults: (testId: string) => get<any[]>(`/exam/${testId}/results`),
  lockResults: (testId: string) => post<any>(`/exam/${testId}/lock-results`, {}),
  unlockResults: (testId: string) => post<any>(`/exam/${testId}/unlock-results`, {}),
  editResults: (testId: string, body: {
    academicYearId: string;
    results: { studentId: string; marks: number; remarks?: string | null }[];
  }) => post<{ testId: string; count: number; status: string }>(`/exam/${testId}/edit-results`, body),
  configurePassMarks: (testId: string, body: {
    passMarks?: number;
    passMarksConfig?: Record<string, number>;
  }) => post<any>(`/exam/${testId}/configure-pass-marks`, body),
  getMarksheet: (className: string, yearId: string) =>
    get<{ exams: any[]; students: any[] }>(`/exam/marksheet?className=${encodeURIComponent(className)}&yearId=${encodeURIComponent(yearId)}`),
};

// ─── Promotion ───────────────────────────────────────────────────────────────

export const apiPromotion = {
  preview: (fromYearId: string, toYearId: string) =>
    get<any>(`/promotion/preview?fromYearId=${fromYearId}&toYearId=${toYearId}`),
  execute: (body: {
    fromYearId: string; toYearId: string;
    promotions: {
      studentId: string; recordId?: string;
      decision: 'PROMOTE' | 'RETAIN' | 'TC';
      toClassName?: string; toSection?: string;
      rollNo?: string; toSectionId?: string;
      tcDate?: string; tcRemarks?: string;
    }[];
  }) => post<any>('/promotion/execute', body),
  previousYearData: (yearId: string) =>
    get<any>(`/promotion/previous-year-data?yearId=${yearId}`),
};

// ─── Teacher check-in ─────────────────────────────────────────────────────────

export const apiTeacher = {
  checkIn:    () => post<any>('/teacher/check-in'),
  checkOut:   () => post<any>('/teacher/check-out'),
  attendance: (params?: { date?: string; staffId?: string }) => {
    const q = new URLSearchParams(params as any).toString();
    return get<any[]>(`/teacher/attendance${q ? '?' + q : ''}`);
  },
  createNotice: (body: {
    title: string; body: string; audience: string; sentByName: string;
  }) => post<{ id: string }>('/teacher/notice/create', body),
  createTest: (body: {
    academicYearId: string; sectionId: string | null; teacherId: string;
    className: string; section: string; subject: string; testType: string;
    title: string; scheduledDate: string | null; duration: number;
    maxMarks: number; syllabus: string;
  }) => post<any>('/teacher/test/create', body),
  publishResults: (body: {
    testId: string; academicYearId: string;
    results: { studentId: string; obtainedMarks: number; remarks?: string | null }[];
  }) => post<{ testId: string; count: number }>('/teacher/test/publish-results', body),
  submitComplaint: (body: { subject: string; description: string; fromName: string }) =>
    post<any>('/teacher/complaint/create', body),
};

// ─── Settings ────────────────────────────────────────────────────────────────

export const apiSettings = {
  get: () => get<any>('/settings'),
  update: (body: Partial<{
    enable_teacher_checkin: boolean;
    attendance_start_time: string;
    attendance_end_time: string;
    late_after_time: string;
    school_name_display: string;
    currency_symbol: string;
    academic_year_auto_close: boolean;
  }>) => put<any>('/settings', body),
};

// ─── Principal ────────────────────────────────────────────────────────────────

export interface DashboardStats {
  studentsWithDues: number;
  pendingLeaves: number;
  lowAttendanceStudents: number;
  unsubmittedAttendanceDays: number;
}

export const apiPrincipal = {
  // Distinct subject names across the school — drives autocomplete in
  // timetable allot + staff create/edit. No setup screen, no managed list:
  // it's just "what's already been typed before".
  subjectSuggestions: () => get<string[]>('/principal/subject-suggestions'),
  // Notices
  noticeList: () => get<any[]>('/principal/notice/list'),
  noticeCreate: (body: { title: string; body: string; audience: string; pinned?: boolean; sentBy?: string; targetStudentId?: string | null }) =>
    post<any>('/principal/notice/create', body),
  // Connected users (Settings → Users)
  usersList: () => get<Array<{
    id: string; name: string; mobile_number: string; role: string;
    email: string | null; is_active: boolean; first_login_changed: boolean;
    last_login: string | null;
  }>>('/principal/users/list'),
  resetUserPassword: (userId: string) =>
    post<{ ok: true; name: string; mobile: string; tempPassword: string }>('/principal/users/reset-password', { userId }),
  noticeDelete: (noticeId: string) =>
    post<any>('/principal/notice/delete', { noticeId }),

  // Complaints
  complaintResolve: (complaintId: string, response: string) =>
    post<any>('/principal/complaint/resolve', { complaintId, response }),
  complaintReject: (complaintId: string, reason: string) =>
    post<any>('/principal/complaint/reject', { complaintId, reason }),

  // Expenses
  expenseAdd: (body: { category: string; description: string; amount: number; date: string }) =>
    post<any>('/principal/expense/add', body),

  // Approvals
  approvalApprove: (approvalId: string) =>
    post<any>('/principal/approval/approve', { approvalId }),
  approvalReject: (approvalId: string, reason?: string) =>
    post<any>('/principal/approval/reject', { approvalId, reason }),
  leaveSubmit: (body: {
    studentId: string; studentName: string; title: string;
    fromDate: string; toDate: string; reason: string;
  }) => post<any>('/principal/leave/submit', body),
  leaveList: (studentId: string) =>
    get<any[]>(`/principal/leave/list?studentId=${encodeURIComponent(studentId)}`),

  // Unified Inventory — flat school-wide asset list (no per-student loans).
  inventoryList: () =>
    get<Array<{
      id: string; category: 'BOOK' | 'LAB_EQUIPMENT' | 'OTHER';
      title: string; description: string; note: string;
      quantity: number; addedOn: string; createdAt: string;
    }>>('/principal/inventory/list'),
  inventoryAdd: (body: {
    title: string; category: 'BOOK' | 'LAB_EQUIPMENT' | 'OTHER';
    quantity: number; description?: string; note?: string; addedOn?: string;
  }) => post<{ id: string }>('/principal/inventory/add', body),
  inventoryDelete: (id: string) =>
    post<{ id: string }>('/principal/inventory/delete', { id }),
  inventoryUpdate: (body: {
    id: string; title?: string; quantity?: number;
    description?: string; note?: string;
  }) => post<{ id: string }>('/principal/inventory/update', body),
  inventoryHistory: () =>
    get<Array<{
      id: string; action: 'ADD' | 'DELETE' | 'UPDATE';
      title: string; category: 'BOOK' | 'LAB_EQUIPMENT' | 'OTHER';
      quantity: number; description: string | null; note: string | null;
      done_by_name: string | null; done_at: string;
    }>>('/principal/inventory/history'),

  // Library — Books
  bookAdd: (body: { title: string; author?: string; isbn?: string; subject?: string; totalCopies: number }) =>
    post<any>('/principal/library/book/add', body),
  bookDelete: (bookId: string) =>
    post<any>('/principal/library/book/delete', { bookId }),
  bookIssue: (body: { bookId: string; studentId: string; studentName: string; note?: string }) =>
    post<any>('/principal/library/book/issue', body),
  bookReturn: (body: { bookId: string; studentId: string; note?: string }) =>
    post<any>('/principal/library/book/return', body),

  // Library — Equipment
  equipmentAdd: (body: { name: string; labType?: string; quantity: number; workingCount: number; lastServiced?: string }) =>
    post<any>('/principal/library/equipment/add', body),
  equipmentDelete: (equipmentId: string) =>
    post<any>('/principal/library/equipment/delete', { equipmentId }),
  equipmentUpdate: (body: {
    equipmentId: string; name?: string; quantity?: number;
    workingCount?: number; labType?: string; lastServiced?: string;
  }) => post<any>('/principal/library/equipment/update', body),

  // Academic Year Config — Sections
  ayConfigSections: (body: {
    yearId: string;
    toInsert: { class_name: string; section: string }[];
    toDelete: string[];
  }) => post<any>('/principal/ay-config/sections', body),

  // Staff Attendance
  staffAttendanceSave: (body: {
    date: string;
    rows: { staffId: string; status: string }[];
    clearedStaffIds?: string[];
    editorMode?: boolean;
  }) => post<{ savedAt: string; modifiedAt: string | null }>('/principal/staff-attendance/save', body),

  // Permissions
  permissionsSet: (body: {
    teacherId: string; className: string; section: string;
    canMarkAttendance: boolean; canUploadResults: boolean; canScheduleExam: boolean;
  }) => post<any>('/principal/permissions/set', body),
  permissionsRemove: (body: { teacherId: string; className: string; section: string }) =>
    post<any>('/principal/permissions/remove', body),

  // Fee Structures
  feeStructureSave: (body: {
    id: string; name: string; className: string;
    structureType?: string; billingCycle: string;
    feeHeads: any[]; monthlyDueDates: any[]; lateFee?: any;
  }) => post<{ id: string; prev: Record<string, unknown> | null; mode: 'create' | 'update' }>(
    '/principal/fee-structure/save', body,
  ),
  feeStructureSaveForYear: (body: {
    yearId: string; name: string; className: string;
    structureType?: string; billingCycle: string;
    feeHeads: any[]; monthlyDueDates: any[]; lateFee?: any;
  }) => post<{ id: string }>('/principal/fee-structure/save-for-year', body),
  feeStructureDelete: (structureId: string) =>
    post<any>('/principal/fee-structure/delete', { structureId }),
  feeStructureSeed: (ayId: string) =>
    post<{ seeded: boolean; count?: number }>('/principal/fee-structure/seed', { ayId }),
  feeStructureApplyToClass: (body: {
    structureId: string; isRte?: boolean;
    discountAmount?: number; discountPct?: number;
  }) => post<{ generated: number; skipped: number; total: number; errors: string[] }>(
    '/principal/fee-structure/apply-to-class', body,
  ),

  // Fee Upload Review
  feeUploadReview: (body: { uploadId: string; decision: 'APPROVED' | 'REJECTED'; note?: string }) =>
    post<{ paymentId: string | null }>('/principal/fee-upload/review', body),

  // Dashboard Stats
  getDashboardStats: (yearId: string) =>
    get<DashboardStats>(`/principal/dashboard-stats?yearId=${yearId}`),
};

// ─── Admin — School Billing ────────────────────────────────────────────────────

export interface SchoolFeePayment {
  id: string;
  school_id: string;
  amount: number;
  paid_on: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

export interface SchoolBillingInfo {
  fixedAmount: number;
  monthsElapsed: number;
  totalExpected: number;
  totalPaid: number;
  outstanding: number;
  payments: SchoolFeePayment[];
}

export const apiAdminSchools = {
  setBillingAmount: (schoolId: string, fixedAmount: number) =>
    put<{ schoolId: string; fixedAmount: number }>(`/admin/schools/${schoolId}/billing`, { fixedAmount }),
  addPayment: (schoolId: string, body: { amount: number; paidOn: string; note?: string }) =>
    post<SchoolFeePayment>(`/admin/schools/${schoolId}/payments`, body),
  getPayments: (schoolId: string) =>
    get<SchoolBillingInfo>(`/admin/schools/${schoolId}/payments`),
};


// ─── Health check ─────────────────────────────────────────────────────────────

export const apiHealth = () =>
  fetch('/api/health').then(r => r.json()) as Promise<{ ok: boolean; version: string; ts: string }>;
