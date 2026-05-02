// Typed client for all /api/* endpoints.
// Always attaches the current Supabase session token.
// Reads still go direct via Supabase (RLS protects them).
// ALL writes go through this client → Express API server.

import { supabase } from '@/shared/lib/supabase';

// ─── Core fetch wrapper ───────────────────────────────────────────────────────

async function getToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');
  return session.access_token;
}

async function apiFetch<T>(
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
  changePassword: (password: string) =>
    post<void>('/auth/change-password', { password }),
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
  }) => post<any>('/students/assign', body),
  deactivate: (studentId: string, reason?: string) =>
    post<any>('/students/deactivate', { studentId, reason }),
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
    date?: string; note?: string; useAdvance?: boolean; applyLateFee?: boolean;
  }) => post<any>('/fees/pay', body),
  getStudentFees: (studentId: string, yearId?: string) => {
    const q = yearId ? `?yearId=${yearId}` : '';
    return get<any>(`/fees/student/${studentId}${q}`);
  },
  govtPay: (body: { studentIds: string[]; totalAmount: number; referenceNo: string; note: string }) =>
    post<any>('/fees/govt-pay', body),
  writeoff: (body: { installmentId: string; amount: number; reason: string }) =>
    post<any>('/fees/writeoff', body),
};

// ─── Transport ───────────────────────────────────────────────────────────────

export const apiTransport = {
  getVehicles: () => get<any[]>('/transport/vehicles'),
  getStudentAssignments: (studentId: string) => get<any[]>(`/transport/student/${studentId}`),
  assign: (body: {
    studentId: string; vehicleId: string; stopId: string;
    monthlyAmount: number; startDate: string; academicYearId: string; endDate?: string;
  }) => post<any>('/transport/assign', body),
  remove: (body: { studentId: string; academicYearId: string; endDate: string; reason?: string }) =>
    post<any>('/transport/remove', body),
};

// ─── Attendance ───────────────────────────────────────────────────────────────

export const apiAttendance = {
  get: (sectionId: string, date: string) =>
    get<any>(`/attendance?sectionId=${sectionId}&date=${date}`),
  submit: (body: {
    sectionId: string; date: string;
    records: { studentId: string; isPresent: boolean }[];
  }) => post<any>('/attendance/submit', body),
  approve: (attendanceId: string) =>
    post<any>('/attendance/approve', { attendanceId }),
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
    sectionId?: string; duration?: number; syllabus?: string;
  }) => post<any>('/exam/create', body),
  uploadResults: (body: {
    testId: string; academicYearId: string;
    results: { studentId: string; marks: number; grade?: string; remarks?: string }[];
  }) => post<any>('/exam/result/upload', body),
  getResults: (testId: string) => get<any[]>(`/exam/${testId}/results`),
};

// ─── Promotion ───────────────────────────────────────────────────────────────

export const apiPromotion = {
  preview: (fromYearId: string, toYearId: string) =>
    get<any>(`/promotion/preview?fromYearId=${fromYearId}&toYearId=${toYearId}`),
  execute: (body: {
    fromYearId: string; toYearId: string;
    promotions: { studentId: string; toClassName: string; toSection: string; rollNo?: string; toSectionId?: string }[];
  }) => post<any>('/promotion/execute', body),
};

// ─── Teacher check-in ─────────────────────────────────────────────────────────

export const apiTeacher = {
  checkIn:    () => post<any>('/teacher/check-in'),
  checkOut:   () => post<any>('/teacher/check-out'),
  attendance: (params?: { date?: string; staffId?: string }) => {
    const q = new URLSearchParams(params as any).toString();
    return get<any[]>(`/teacher/attendance${q ? '?' + q : ''}`);
  },
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

// ─── Health check ─────────────────────────────────────────────────────────────

export const apiHealth = () =>
  fetch('/api/health').then(r => r.json()) as Promise<{ ok: boolean; version: string; ts: string }>;
