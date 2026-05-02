// Supabase-backed services for principal-side managers:
//   notices, complaints, expenses, approvals (incl. student leaves),
//   library + lab assets (assets + asset_issues tables), and
//   academic-year-config derived view.

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { apiPrincipal } from '@/lib/apiClient';
import type {
  Complaint, Expense, Notice, Approval, NoticeAudience,
  LibraryBook, BookIssue, LabEquipment, Vehicle, AcademicYearConfig,
  ClassPermission,
} from '@/shared/types/principal.types';

export type StaffAttendanceStatus = 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'LEAVE' | 'LATE' | 'HOLIDAY';

export interface StaffAttendanceRow {
  staffId: string;
  name: string;
  role: string;
  status: StaffAttendanceStatus;
}

function getSchoolId(): string {
  const id = useAuthStore.getState().session?.schoolId;
  if (!id) throw new Error('No school in session');
  return id;
}

// Library and lab assets are now persisted in the public.assets +
// public.asset_issues tables (category='BOOK' / 'LAB_EQUIPMENT'). All reads
// hit Supabase directly — no client-side cache.

function getActor(): { id: string; name: string; role: string } | null {
  const s = useAuthStore.getState().session;
  if (!s) return null;
  return { id: s.userId, name: s.name, role: s.role };
}

// ─── Notices ────────────────────────────────────────────────────────────────

interface NoticeRow {
  id: string;
  title: string;
  body: string;
  audience: string;
  sent_at: string;
  sent_by_name: string | null;
  pinned: boolean;
}

const NOTICE_FIELDS = 'id, title, body, audience, sent_at, sent_by_name, pinned';

function rowToNotice(r: NoticeRow): Notice {
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    audience: (r.audience as NoticeAudience) ?? 'ALL',
    sentAt: r.sent_at.slice(0, 10),
    sentBy: r.sent_by_name ?? '',
    pinned: r.pinned,
  };
}

// ─── Complaints ─────────────────────────────────────────────────────────────

interface ComplaintRow {
  id: string;
  from_role: string;
  from_name: string | null;
  from_class: string | null;
  subject: string;
  description: string | null;
  status: string;
  response: string | null;
  created_at: string;
  resolved_at: string | null;
}

const COMPLAINT_FIELDS = 'id, from_role, from_name, from_class, subject, description, status, response, created_at, resolved_at';

function rowToComplaint(r: ComplaintRow): Complaint {
  // Map legacy DB values onto the canonical status set used by the UI.
  // Migration 0033 backfills existing rows, but we keep this defensive
  // mapping so that any stragglers (or rows inserted by older clients)
  // still render correctly.
  const rawStatus = (r.status ?? '').toUpperCase();
  let status: Complaint['status'];
  if (rawStatus === 'OPEN') status = 'PENDING';
  else if (rawStatus === 'IN_PROGRESS') status = 'IN_REVIEW';
  else if (rawStatus === 'PENDING' || rawStatus === 'IN_REVIEW' ||
           rawStatus === 'RESOLVED' || rawStatus === 'REJECTED') {
    status = rawStatus as Complaint['status'];
  } else status = 'PENDING';

  return {
    id: r.id,
    from: (r.from_role as Complaint['from']) ?? 'STUDENT',
    fromName: r.from_name ?? '',
    fromClass: r.from_class ?? undefined,
    subject: r.subject,
    description: r.description ?? '',
    status,
    createdAt: r.created_at.slice(0, 10),
    resolvedAt: r.resolved_at ? r.resolved_at.slice(0, 10) : null,
    response: r.response,
  };
}

// ─── Expenses ───────────────────────────────────────────────────────────────

interface ExpenseRow {
  id: string;
  category: string;
  description: string | null;
  amount: number;
  date: string;
  bill_url: string | null;
  created_by: string | null;
  created_at: string;
}

const EXPENSE_FIELDS = 'id, category, description, amount, date, bill_url, created_by, created_at';

function rowToExpense(r: ExpenseRow, approvedByName?: string): Expense {
  return {
    id: r.id,
    category: (r.category as Expense['category']) ?? 'OTHER',
    description: r.description ?? '',
    amount: Number(r.amount),
    date: r.date,
    approvedBy: approvedByName ?? '',
  };
}

// ─── Approvals ──────────────────────────────────────────────────────────────
//
// The DB approvals table stores entity_type/entity_id/old_value/new_value as
// JSONB. We pack rich UI fields (fromName, subject, description, etc.) into
// new_value JSONB so the manager can render them without a join.

interface ApprovalRow {
  id: string;
  request_type: string;
  requested_by: string | null;
  entity_type: string | null;
  entity_id: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  proof_url: string | null;
  status: string;
  created_at: string;
}

const APPROVAL_FIELDS = 'id, request_type, requested_by, entity_type, entity_id, old_value, new_value, proof_url, status, created_at';

function rowToApproval(r: ApprovalRow): Approval {
  const nv = r.new_value ?? {};
  const fromName = (nv['fromName'] as string) ?? '';
  const fromRole = (nv['fromRole'] as string) ?? '';
  const subject = (nv['subject'] as string) ?? '';
  const description = (nv['description'] as string) ?? '';
  const rejectionReason = (nv['rejectionReason'] as string) ?? null;

  let type: Approval['type'] = 'LEAVE';
  if (r.request_type === 'FEE_PAYMENT' || r.request_type === 'ATTENDANCE_CORRECTION' || r.request_type === 'LEAVE') {
    type = r.request_type;
  }

  return {
    id: r.id,
    type,
    fromName,
    fromRole,
    subject,
    description,
    status: (r.status as Approval['status']) ?? 'PENDING',
    createdAt: r.created_at.slice(0, 10),
    attachmentUrl: r.proof_url,
    studentId: r.entity_type === 'student' && r.entity_id ? r.entity_id : undefined,
    rejectionReason,
  };
}

export const principalService = {
  // ─── Notices ──────────────────────────────────────────────────────────────
  async getNotices(): Promise<Notice[]> {
    const schoolId = getSchoolId();
    const { data, error } = await supabase
      .from('notices')
      .select(NOTICE_FIELDS)
      .eq('school_id', schoolId)
      .eq('is_active', true)
      .order('pinned', { ascending: false })
      .order('sent_at', { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as NoticeRow[]).map(rowToNotice);
  },

  async sendNotice(input: Omit<Notice, 'id' | 'sentAt'>): Promise<Notice> {
    const actor = getActor();
    const raw = await apiPrincipal.noticeCreate({
      title: input.title, body: input.body, audience: input.audience,
      pinned: input.pinned, sentBy: input.sentBy || actor?.name || '',
    });
    await logAudit('notice_sent', 'notice', raw.id, { audience: input.audience, title: input.title });
    return rowToNotice(raw as NoticeRow);
  },

  async deleteNotice(id: string): Promise<void> {
    await apiPrincipal.noticeDelete(id);
    await logAudit('notice_deleted', 'notice', id);
  },

  // ─── Complaints ───────────────────────────────────────────────────────────
  async getComplaints(): Promise<Complaint[]> {
    const schoolId = getSchoolId();
    const { data, error } = await supabase
      .from('complaints')
      .select(COMPLAINT_FIELDS)
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as ComplaintRow[]).map(rowToComplaint);
  },

  async resolveComplaint(id: string, response: string): Promise<Complaint> {
    const raw = await apiPrincipal.complaintResolve(id, response);
    await logAudit('complaint_resolved', 'complaint', id, { response_length: response.length });
    return rowToComplaint(raw as ComplaintRow);
  },

  async rejectComplaint(id: string, reason: string): Promise<Complaint> {
    const raw = await apiPrincipal.complaintReject(id, reason);
    await logAudit('complaint_rejected', 'complaint', id, { reason_length: reason.length });
    return rowToComplaint(raw as ComplaintRow);
  },

  // ─── Expenses ─────────────────────────────────────────────────────────────
  async getExpenses(): Promise<Expense[]> {
    const schoolId = getSchoolId();
    const { data, error } = await supabase
      .from('expenses')
      .select(EXPENSE_FIELDS)
      .eq('school_id', schoolId)
      .order('date', { ascending: false });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as ExpenseRow[];

    // Resolve approver names in one pass.
    const ids = Array.from(new Set(rows.map(r => r.created_by).filter(Boolean))) as string[];
    const nameMap = new Map<string, string>();
    if (ids.length) {
      const { data: users } = await supabase.from('users').select('id, name').in('id', ids);
      ((users ?? []) as { id: string; name: string }[]).forEach(u => nameMap.set(u.id, u.name));
    }
    return rows.map(r => rowToExpense(r, r.created_by ? nameMap.get(r.created_by) ?? '' : ''));
  },

  async addExpense(input: Omit<Expense, 'id'>): Promise<Expense> {
    const actor = getActor();
    const raw = await apiPrincipal.expenseAdd({
      category: input.category, description: input.description,
      amount: input.amount, date: input.date,
    });
    await logAudit('expense_added', 'expense', raw.id, { category: input.category, amount: input.amount });
    return rowToExpense(raw as ExpenseRow, input.approvedBy || actor?.name || '');
  },

  // ─── Approvals ────────────────────────────────────────────────────────────
  async getApprovals(): Promise<Approval[]> {
    const schoolId = getSchoolId();
    const { data, error } = await supabase
      .from('approvals')
      .select(APPROVAL_FIELDS)
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as ApprovalRow[]).map(rowToApproval);
  },

  async approveRequest(id: string): Promise<Approval> {
    const raw = await apiPrincipal.approvalApprove(id);
    await logAudit('approval_approved', 'approval', id, { type: (raw as any)?.request_type ?? '' });
    return rowToApproval(raw as ApprovalRow);
  },

  async rejectRequest(id: string, reason?: string): Promise<Approval> {
    const raw = await apiPrincipal.approvalReject(id, reason);
    await logAudit('approval_rejected', 'approval', id, { reason: reason ?? null });
    return rowToApproval(raw as ApprovalRow);
  },

  async submitStudentLeave(
    studentId: string,
    studentName: string,
    title: string,
    fromDate: string,
    toDate: string,
    reason: string,
  ): Promise<Approval> {
    const raw = await apiPrincipal.leaveSubmit({
      studentId, studentName, title, fromDate, toDate, reason,
    });
    await logAudit('leave_submitted', 'approval', raw.id, { studentId, fromDate, toDate });
    return rowToApproval(raw as ApprovalRow);
  },

  async getStudentLeaves(studentId: string): Promise<Approval[]> {
    const schoolId = getSchoolId();
    const { data, error } = await supabase
      .from('approvals').select(APPROVAL_FIELDS)
      .eq('school_id', schoolId)
      .eq('request_type', 'LEAVE')
      .eq('entity_type', 'student')
      .eq('entity_id', studentId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as ApprovalRow[]).map(rowToApproval);
  },

  // ─── Library (assets+asset_issues, category='BOOK') ─────────────────────
  async getBooks(): Promise<LibraryBook[]> {
    const schoolId = getSchoolId();
    const { data: assets, error } = await supabase
      .from('assets')
      .select('id, name, details, total_count, available_count')
      .eq('school_id', schoolId).eq('category', 'BOOK')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    if (!assets || assets.length === 0) return [];

    const ids = (assets as Array<{ id: string }>).map(a => a.id);
    const { data: issues } = await supabase
      .from('asset_issues')
      .select('asset_id, student_id, borrower_name, issued_at, due_date, returned_at')
      .in('asset_id', ids).is('returned_at', null);
    const issuesByAsset = new Map<string, BookIssue[]>();
    for (const r of (issues ?? []) as Array<{ asset_id: string; student_id: string | null; borrower_name: string | null; issued_at: string; due_date: string | null; returned_at: string | null }>) {
      const list = issuesByAsset.get(r.asset_id) ?? [];
      list.push({
        studentId: r.student_id ?? '',
        studentName: r.borrower_name ?? '',
        issuedAt: r.issued_at,
        dueDate: r.due_date ?? r.issued_at,
        returnedAt: r.returned_at,
      });
      issuesByAsset.set(r.asset_id, list);
    }

    return (assets as Array<{ id: string; name: string; details: { author?: string; isbn?: string; subject?: string }; total_count: number; available_count: number }>).map(a => ({
      id: a.id,
      title: a.name,
      author: a.details?.author ?? '',
      isbn: a.details?.isbn ?? '',
      subject: a.details?.subject ?? '',
      totalCopies: a.total_count,
      availableCopies: a.available_count,
      issuedTo: issuesByAsset.get(a.id) ?? [],
    }));
  },

  async addBook(input: Omit<LibraryBook, 'id' | 'issuedTo' | 'availableCopies'>): Promise<LibraryBook> {
    const raw = await apiPrincipal.bookAdd({
      title: input.title, author: input.author, isbn: input.isbn,
      subject: input.subject, totalCopies: input.totalCopies,
    });
    return {
      id: raw.id,
      title: input.title, author: input.author, isbn: input.isbn, subject: input.subject,
      totalCopies: input.totalCopies, availableCopies: input.totalCopies,
      issuedTo: [],
    };
  },

  async deleteBook(id: string): Promise<void> {
    await apiPrincipal.bookDelete(id);
  },

  // Atomic — wraps INSERT into asset_issues + UPDATE assets.available_count
  // in a single SECURITY DEFINER RPC so partial-failure can't desync inventory.
  async issueBook(
    bookId: string, studentId: string, studentName: string, note?: string,
  ): Promise<LibraryBook> {
    await apiPrincipal.bookIssue({ bookId, studentId, studentName, note });
    return (await this.getBooks()).find(b => b.id === bookId)!;
  },

  async returnBook(
    bookId: string, studentId: string, note?: string,
  ): Promise<LibraryBook> {
    await apiPrincipal.bookReturn({ bookId, studentId, note });
    return (await this.getBooks()).find(b => b.id === bookId)!;
  },

  // ─── Lab equipment (assets, category='LAB_EQUIPMENT') ───────────────────
  async getEquipment(): Promise<LabEquipment[]> {
    const schoolId = getSchoolId();
    const { data, error } = await supabase
      .from('assets')
      .select('id, name, details, total_count, available_count, updated_at')
      .eq('school_id', schoolId).eq('category', 'LAB_EQUIPMENT')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<{ id: string; name: string; details: { labType?: 'SCIENCE' | 'COMPUTER' | 'LANGUAGE'; lastServiced?: string }; total_count: number; available_count: number; updated_at: string }>).map(e => ({
      id: e.id,
      name: e.name,
      labType: e.details?.labType ?? 'SCIENCE',
      quantity: e.total_count,
      workingCount: e.available_count,
      lastServiced: e.details?.lastServiced ?? e.updated_at.slice(0, 10),
    }));
  },

  async addEquipment(input: Omit<LabEquipment, 'id'>): Promise<LabEquipment> {
    const raw = await apiPrincipal.equipmentAdd({
      name: input.name, labType: input.labType,
      quantity: input.quantity, workingCount: input.workingCount,
      lastServiced: input.lastServiced,
    });
    return { ...input, id: raw.id };
  },

  async deleteEquipment(id: string): Promise<void> {
    await apiPrincipal.equipmentDelete(id);
  },

  async updateEquipment(id: string, input: Partial<LabEquipment>): Promise<LabEquipment> {
    await apiPrincipal.equipmentUpdate({
      equipmentId: id, name: input.name, quantity: input.quantity,
      workingCount: input.workingCount, labType: input.labType,
      lastServiced: input.lastServiced,
    });
    const list = await this.getEquipment();
    const found = list.find(e => e.id === id);
    if (!found) throw new Error('Equipment not found');
    return found;
  },

  // Vehicles are owned by transport.service.ts (transport_vehicles table).
  // This getter is preserved for backward compatibility only and intentionally
  // returns []; callers should use transportService.getVehicles() instead.
  async getVehicles(): Promise<Vehicle[]> { return []; },

  // Academic year config — sections are now first-class, so this stub returns
  // a derived view from the academic_years + sections tables.
  async getAYConfig(): Promise<AcademicYearConfig[]> {
    const schoolId = getSchoolId();
    const { data: years, error: yErr } = await supabase
      .from('academic_years')
      .select('id, label, start_date, end_date, is_active, board')
      .eq('school_id', schoolId)
      .order('start_date', { ascending: false });
    if (yErr) throw new Error(yErr.message);
    if (!years?.length) return [];

    const yearIds = years.map((y: { id: string }) => y.id);
    const { data: sections, error: sErr } = await supabase
      .from('sections')
      .select('id, academic_year_id, class_name, section')
      .eq('school_id', schoolId)
      .in('academic_year_id', yearIds);
    if (sErr) throw new Error(sErr.message);

    return (years as Array<{ id: string; label: string; start_date: string; end_date: string; is_active: boolean; board: string | null }>).map(y => {
      const my = (sections ?? []).filter((s: { academic_year_id: string }) => s.academic_year_id === y.id) as Array<{ class_name: string; section: string }>;
      const grouped = new Map<string, string[]>();
      my.forEach(s => {
        const arr = grouped.get(s.class_name) ?? [];
        if (!arr.includes(s.section)) arr.push(s.section);
        grouped.set(s.class_name, arr);
      });
      return {
        id: y.id,
        label: y.label,
        startDate: y.start_date,
        endDate: y.end_date,
        isActive: y.is_active,
        board: y.board ?? 'CBSE',
        classes: Array.from(grouped.entries())
          .map(([name, secs]) => ({ name, sections: secs.sort() }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      };
    });
  },

  async getSectionsForYear(yearId: string): Promise<Array<{
    id: string;
    className: string;
    section: string;
    studentCount: number;
    capacity: number;
    classTeacher: string | null;
    stream: string | null;
  }>> {
    const schoolId = getSchoolId();
    const { data, error } = await supabase
      .from('sections')
      .select('id, class_name, section, student_count, capacity, class_teacher, stream')
      .eq('school_id', schoolId)
      .eq('academic_year_id', yearId)
      .order('class_name')
      .order('section');
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<{
      id: string;
      class_name: string;
      section: string;
      student_count: number;
      capacity: number;
      class_teacher: string | null;
      stream: string | null;
    }>).map(r => ({
      id: r.id,
      className: r.class_name,
      section: r.section,
      studentCount: r.student_count,
      capacity: r.capacity,
      classTeacher: r.class_teacher,
      stream: r.stream,
    }));
  },

  async updateAYConfig(id: string, input: Partial<AcademicYearConfig>): Promise<AcademicYearConfig> {
    if (input.classes) {
      const schoolId = getSchoolId();
      // Diff existing sections vs requested set.
      const { data: existing, error } = await supabase
        .from('sections').select('id, class_name, section')
        .eq('school_id', schoolId).eq('academic_year_id', id);
      if (error) throw new Error(error.message);
      const existingSet = new Map<string, string>();
      (existing ?? []).forEach((s: { id: string; class_name: string; section: string }) => {
        existingSet.set(`${s.class_name}|${s.section}`, s.id);
      });
      const requested = new Set<string>();
      input.classes.forEach(cls => cls.sections.forEach(sec => requested.add(`${cls.name}|${sec}`)));

      const toInsert: Array<{ class_name: string; section: string }> = [];
      requested.forEach(key => {
        if (!existingSet.has(key)) {
          const [class_name, section] = key.split('|');
          toInsert.push({ class_name, section });
        }
      });
      const toDelete: string[] = [];
      existingSet.forEach((sid, key) => { if (!requested.has(key)) toDelete.push(sid); });

      await apiPrincipal.ayConfigSections({ yearId: id, toInsert, toDelete });
      await logAudit('ay_config_updated', 'academic_year', id, { added: toInsert.length, removed: toDelete.length });
    }
    const fresh = await this.getAYConfig();
    return fresh.find(y => y.id === id) ?? fresh[0];
  },

  // ─── Staff attendance ─────────────────────────────────────────────────────
  // Returns one row per active staff member for the given date. Existing
  // staff_attendance rows are joined in; missing days default to PRESENT
  // (in-memory — only persisted when the principal saves).
  async getStaffAttendance(date: string): Promise<{
    rows: StaffAttendanceRow[];
    isLocked: boolean;
    savedAt: string | null;
  }> {
    const schoolId = getSchoolId();
    const { data: staff, error: sErr } = await supabase
      .from('staff')
      .select('id, name, role, status, is_active')
      .eq('school_id', schoolId);
    if (sErr) throw new Error(sErr.message);

    const activeStaff = ((staff ?? []) as Array<{
      id: string; name: string; role: string; status: string; is_active: boolean;
    }>).filter(s => s.is_active && s.status !== 'SUSPENDED');

    const { data: existing, error: aErr } = await supabase
      .from('staff_attendance')
      .select('staff_id, status, is_locked, created_at')
      .eq('school_id', schoolId).eq('date', date);
    if (aErr) throw new Error(aErr.message);

    const existingMap = new Map<string, { status: string; is_locked: boolean; created_at: string }>();
    for (const r of ((existing ?? []) as Array<{
      staff_id: string; status: string; is_locked: boolean; created_at: string;
    }>)) {
      existingMap.set(r.staff_id, r);
    }

    const isLocked = Array.from(existingMap.values()).some(r => r.is_locked);
    const savedAtTs = Array.from(existingMap.values())
      .map(r => r.created_at).sort().pop() ?? null;

    const rows: StaffAttendanceRow[] = activeStaff
      .map(s => ({
        staffId: s.id,
        name: s.name,
        role: s.role,
        status: (existingMap.get(s.id)?.status as StaffAttendanceStatus) ?? 'PRESENT',
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return { rows, isLocked, savedAt: savedAtTs };
  },

  async saveStaffAttendance(
    date: string,
    rows: StaffAttendanceRow[],
    clearedStaffIds: string[] = [],
  ): Promise<string | null> {
    const result = await apiPrincipal.staffAttendanceSave({
      date,
      rows: rows.map(r => ({ staffId: r.staffId, status: r.status })),
      clearedStaffIds,
    });
    await logAudit('staff_attendance_saved', 'staff_attendance', date, {
      date, count: rows.length, cleared: clearedStaffIds.length,
    });
    return result.savedAt ?? null;
  },

  // Returns per-staff attendance summary for a given month (YYYY-MM).
  async getStaffAttendanceMonth(yearMonth: string): Promise<Array<{
    staffId: string; name: string; role: string;
    days: Array<{ date: string; status: StaffAttendanceStatus }>;
    counts: Record<StaffAttendanceStatus, number>;
  }>> {
    const schoolId = getSchoolId();
    const [year, month] = yearMonth.split('-').map(Number);
    const firstDay = `${yearMonth}-01`;
    const lastDay  = new Date(year, month, 0).toISOString().split('T')[0]; // last day of month

    const { data: staff, error: sErr } = await supabase
      .from('staff').select('id, name, role')
      .eq('school_id', schoolId).eq('is_active', true);
    if (sErr) throw new Error(sErr.message);
    const activeStaff = ((staff ?? []) as Array<{ id: string; name: string; role: string }>)
      .sort((a, b) => a.name.localeCompare(b.name));

    const { data: rows, error: aErr } = await supabase
      .from('staff_attendance').select('staff_id, date, status')
      .eq('school_id', schoolId).gte('date', firstDay).lte('date', lastDay);
    if (aErr) throw new Error(aErr.message);

    const byStaff = new Map<string, Array<{ date: string; status: StaffAttendanceStatus }>>();
    for (const r of ((rows ?? []) as Array<{ staff_id: string; date: string; status: StaffAttendanceStatus }>)) {
      const arr = byStaff.get(r.staff_id) ?? [];
      arr.push({ date: r.date, status: r.status });
      byStaff.set(r.staff_id, arr);
    }

    const ZERO: Record<StaffAttendanceStatus, number> = {
      PRESENT: 0, ABSENT: 0, HALF_DAY: 0, LEAVE: 0, LATE: 0, HOLIDAY: 0,
    };
    return activeStaff.map(s => {
      const days = (byStaff.get(s.id) ?? []).sort((a, b) => a.date.localeCompare(b.date));
      const counts = { ...ZERO };
      for (const d of days) counts[d.status]++;
      return { staffId: s.id, name: s.name, role: s.role, days, counts };
    });
  },

  // ─── Asset issue history (BOOK / LAB_EQUIPMENT) ──────────────────────────
  // Returns every loan ever recorded for the given category, including
  // returns. Each row is one issue → optional return event.
  async getAssetHistory(category: 'BOOK' | 'LAB_EQUIPMENT'): Promise<Array<{
    id: string;
    assetId: string;
    assetName: string;
    borrowerName: string;
    issuedAt: string;
    dueDate: string | null;
    returnedAt: string | null;
    issuedByName: string | null;
    returnedByName: string | null;
    issueNote: string | null;
    returnNote: string | null;
  }>> {
    const schoolId = getSchoolId();
    const { data: assets, error: aErr } = await supabase
      .from('assets').select('id, name')
      .eq('school_id', schoolId).eq('category', category);
    if (aErr) throw new Error(aErr.message);
    if (!assets || assets.length === 0) return [];
    const nameById = new Map<string, string>(
      (assets as Array<{ id: string; name: string }>).map(a => [a.id, a.name])
    );
    const ids = Array.from(nameById.keys());
    const { data, error } = await supabase
      .from('asset_issues')
      .select('id, asset_id, borrower_name, issued_at, due_date, returned_at, issued_by_user_id, returned_by_user_id, issue_note, return_note')
      .eq('school_id', schoolId).in('asset_id', ids)
      .order('issued_at', { ascending: false });
    if (error) throw new Error(error.message);

    type Row = {
      id: string; asset_id: string; borrower_name: string | null;
      issued_at: string; due_date: string | null; returned_at: string | null;
      issued_by_user_id: string | null; returned_by_user_id: string | null;
      issue_note: string | null; return_note: string | null;
    };
    const rows = (data ?? []) as Row[];

    // Resolve actor names in a single round-trip.
    const userIds = new Set<string>();
    for (const r of rows) {
      if (r.issued_by_user_id) userIds.add(r.issued_by_user_id);
      if (r.returned_by_user_id) userIds.add(r.returned_by_user_id);
    }
    let actorById = new Map<string, string>();
    if (userIds.size > 0) {
      const { data: users } = await supabase
        .from('users').select('id, name')
        .in('id', Array.from(userIds));
      actorById = new Map(
        ((users ?? []) as Array<{ id: string; name: string | null }>)
          .map(u => [u.id, u.name ?? '—']),
      );
    }

    return rows.map(r => ({
      id: r.id,
      assetId: r.asset_id,
      assetName: nameById.get(r.asset_id) ?? '—',
      borrowerName: r.borrower_name ?? '—',
      issuedAt: r.issued_at,
      dueDate: r.due_date,
      returnedAt: r.returned_at,
      issuedByName: r.issued_by_user_id ? actorById.get(r.issued_by_user_id) ?? null : null,
      returnedByName: r.returned_by_user_id ? actorById.get(r.returned_by_user_id) ?? null : null,
      issueNote: r.issue_note,
      returnNote: r.return_note,
    }));
  },

  // ─── Staff permissions (per active AY × section) ─────────────────────────
  // The DB stores ONE row per (staff, section, permission). The UI groups
  // them into ClassPermission cards (one per teacher × section).
  async getStaffPermissions(): Promise<ClassPermission[]> {
    const schoolId = getSchoolId();
    const { data: ay } = await supabase
      .from('academic_years').select('id')
      .eq('school_id', schoolId).eq('is_active', true).maybeSingle();
    if (!ay) return [];
    const ayId = (ay as { id: string }).id;

    const { data, error } = await supabase
      .from('staff_permissions')
      .select('staff_id, section_id, permission, sections(class_name, section), staff(name)')
      .eq('school_id', schoolId).eq('academic_year_id', ayId);
    if (error) throw new Error(error.message);

    const grouped = new Map<string, ClassPermission>();
    type Row = {
      staff_id: string; section_id: string | null; permission: string;
      sections: { class_name: string; section: string } | { class_name: string; section: string }[] | null;
      staff: { name: string } | { name: string }[] | null;
    };
    const pickOne = <T,>(v: T | T[] | null | undefined): T | null =>
      Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
    for (const r of ((data ?? []) as unknown as Row[])) {
      const sec = pickOne(r.sections);
      const stf = pickOne(r.staff);
      if (!r.section_id || !sec) continue;
      const key = `${sec.class_name}|${sec.section}|${r.staff_id}`;
      const cur = grouped.get(key) ?? {
        className: sec.class_name,
        section: sec.section,
        teacherId: r.staff_id,
        teacherName: stf?.name ?? 'Unknown',
        canMarkAttendance: false,
        canUploadResults: false,
        canScheduleExam: false,
      };
      if (r.permission === 'MARK_ATTENDANCE') cur.canMarkAttendance = true;
      else if (r.permission === 'UPLOAD_RESULTS') cur.canUploadResults = true;
      else if (r.permission === 'SCHEDULE_EXAM') cur.canScheduleExam = true;
      grouped.set(key, cur);
    }
    return Array.from(grouped.values());
  },

  /**
   * Replace the full permission set for one (teacher × className × section)
   * tuple within the active AY. We delete all existing rows for that triple,
   * then insert one row per granted permission. This keeps the (staff,
   * section, permission) UNIQUE INDEX from getting confused by stale rows.
   */
  async setStaffPermission(
    className: string, section: string, teacherId: string,
    perms: { canMarkAttendance: boolean; canUploadResults: boolean; canScheduleExam: boolean },
  ): Promise<void> {
    await apiPrincipal.permissionsSet({
      teacherId, className, section,
      canMarkAttendance: perms.canMarkAttendance,
      canUploadResults: perms.canUploadResults,
      canScheduleExam: perms.canScheduleExam,
    });
    await logAudit('staff_permission_set', 'staff_permissions', `${teacherId}:${className}:${section}`, perms);
  },

  async removeStaffPermissions(className: string, section: string, teacherId: string): Promise<void> {
    await apiPrincipal.permissionsRemove({ teacherId, className, section });
    await logAudit('staff_permission_removed', 'staff_permissions', `${teacherId}:${className}:${section}`);
  },

  // ─── Fee structures (per active AY) ──────────────────────────────────────
  async getFeeStructures(): Promise<FeeStructureRecord[]> {
    const schoolId = getSchoolId();
    const { data: ay } = await supabase
      .from('academic_years').select('id')
      .eq('school_id', schoolId).eq('is_active', true).maybeSingle();
    if (!ay) return [];
    const ayId = (ay as { id: string }).id;

    const read = async () => {
      const { data, error } = await supabase
        .from('fee_structures')
        .select('id, name, class_name, structure_type, billing_cycle, fee_heads, monthly_due_dates, late_fee')
        .eq('school_id', schoolId).eq('academic_year_id', ayId)
        .order('class_name');
      if (error) throw new Error(error.message);
      return ((data ?? []) as Array<{
        id: string; name: string; class_name: string;
        structure_type: FeeStructureType | null;
        billing_cycle: BillingCycle | null;
        fee_heads: FeeStructureRecord['feeHeads'];
        monthly_due_dates: FeeStructureRecord['monthlyDueDates'];
        late_fee: FeeStructureRecord['lateFee'];
      }>).map(r => ({
        id: r.id,
        name: r.name,
        className: r.class_name,
        structureType: (r.structure_type ?? 'CLASS') as FeeStructureType,
        billingCycle: (r.billing_cycle ?? 'MONTHLY') as BillingCycle,
        feeHeads: r.fee_heads ?? [],
        monthlyDueDates: r.monthly_due_dates ?? [],
        lateFee: r.late_fee ?? { enabled: false, gracePeriodDays: 0, type: 'FIXED', amount: 0, maxCap: 0 },
      }));
    };

    let rows = await read();
    if (rows.length === 0) {
      // First time the principal opens fee setup for this AY → seed
      // sensible defaults so they land on a non-empty starting point
      // instead of a blank screen. Defaults are inserted ONLY when no row
      // exists yet; from then on the principal owns the data.
      await this._seedDefaultFeeStructures(schoolId, ayId);
      rows = await read();
    }
    return rows;
  },

  // Internal — see getFeeStructures(). Inserts canonical Indian-school
  // defaults for the active academic year. Idempotent at the call site
  // (caller only invokes when the table is empty).
  async _seedDefaultFeeStructures(_schoolId: string, ayId: string): Promise<void> {
    try {
      const result = await apiPrincipal.feeStructureSeed(ayId);
      if (result.seeded && result.count) {
        await logAudit('fee_structures_seeded', 'fee_structures', ayId, { count: result.count });
      }
    } catch (e) {
      // Don't throw — a seed failure shouldn't break the principal's view.
      // eslint-disable-next-line no-console
      console.warn('[principal.service] seed defaults failed:', (e as Error).message);
    }
  },

  async saveFeeStructure(input: FeeStructureRecord): Promise<FeeStructureRecord> {
    const result = await apiPrincipal.feeStructureSave({
      id: input.id, name: input.name, className: input.className,
      structureType: input.structureType ?? 'CLASS', billingCycle: input.billingCycle,
      feeHeads: input.feeHeads, monthlyDueDates: input.monthlyDueDates, lateFee: input.lateFee,
    });
    const { id, prev: prevSnap, mode } = result;
    // Build audit diff
    const newSnap: Record<string, unknown> = {
      name: input.name, class_name: input.className,
      structure_type: input.structureType ?? 'CLASS', billing_cycle: input.billingCycle,
      fee_heads: input.feeHeads, monthly_due_dates: input.monthlyDueDates, late_fee: input.lateFee,
    };
    const changes = prevSnap
      ? Object.keys(newSnap)
          .filter(k => JSON.stringify(prevSnap![k]) !== JSON.stringify(newSnap[k]))
          .map(k => ({ field: k, oldValue: prevSnap![k] ?? null, newValue: newSnap[k] }))
      : [];
    await logAudit('fee_structure_saved', 'fee_structures', id, {
      name: input.name, mode, changes,
    });
    return { ...input, structureType: input.structureType ?? 'CLASS', id };
  },

  async saveFeeStructureForYear(
    yearId: string,
    input: Omit<FeeStructureRecord, 'id'>,
  ): Promise<FeeStructureRecord> {
    const result = await apiPrincipal.feeStructureSaveForYear({
      yearId, name: input.name, className: input.className,
      structureType: input.structureType ?? 'CLASS', billingCycle: input.billingCycle,
      feeHeads: input.feeHeads, monthlyDueDates: input.monthlyDueDates, lateFee: input.lateFee,
    });
    const id = result.id;
    await logAudit('fee_structure_saved', 'fee_structures', id, { name: input.name, mode: 'create' });
    return { ...input, structureType: input.structureType ?? 'CLASS', id };
  },

  async deleteFeeStructure(id: string): Promise<void> {
    await apiPrincipal.feeStructureDelete(id);
    await logAudit('fee_structure_deleted', 'fee_structures', id);
  },

  // ─── Fee payment uploads (parent/student-submitted screenshots) ───────────
  // These rows are written by parents/students from FeesView. The principal
  // sees them here and approves or rejects them. RLS allows same-school
  // PRINCIPAL/TEACHER to SELECT and the PRINCIPAL to UPDATE (migration 0011).
  async getFeePaymentUploads(
    status: FeeUploadStatus | 'ALL' = 'ALL',
  ): Promise<FeePaymentUploadRecord[]> {
    const schoolId = getSchoolId();
    let query = supabase
      .from('fee_payment_uploads')
      .select('id, student_id, submitted_by, amount, description, screenshot_name, screenshot_url, status, reviewed_at, reviewer_note, recorded_payment_id, created_at')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false });
    if (status !== 'ALL') query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Array<{
      id: string; student_id: string; submitted_by: string;
      amount: number; description: string | null;
      screenshot_name: string | null; screenshot_url: string | null;
      status: FeeUploadStatus; reviewed_at: string | null;
      reviewer_note: string | null; recorded_payment_id: string | null;
      created_at: string;
    }>;

    // Resolve student names in one batch.
    const ids = Array.from(new Set(rows.map(r => r.student_id)));
    const nameMap = new Map<string, { name: string; admissionNo: string | null }>();
    if (ids.length) {
      const { data: stu } = await supabase
        .from('students').select('id, name, admission_no').in('id', ids);
      for (const s of (stu ?? []) as Array<{ id: string; name: string; admission_no: string | null }>) {
        nameMap.set(s.id, { name: s.name, admissionNo: s.admission_no });
      }
    }

    return rows.map(r => ({
      id: r.id,
      studentId: r.student_id,
      studentName: nameMap.get(r.student_id)?.name ?? 'Unknown',
      admissionNo: nameMap.get(r.student_id)?.admissionNo ?? null,
      submittedBy: r.submitted_by,
      amount: r.amount,
      description: r.description ?? '',
      screenshotName: r.screenshot_name ?? '',
      screenshotUrl: r.screenshot_url,
      status: r.status,
      submittedAt: r.created_at,
      reviewedAt: r.reviewed_at,
      reviewerNote: r.reviewer_note,
      recordedPaymentId: r.recorded_payment_id,
    }));
  },

  // Approving an upload runs `review_fee_payment_upload` (migration 0013),
  // which atomically (in a single SECURITY DEFINER txn):
  //   1. flips the upload to APPROVED/REJECTED with reviewer metadata,
  //   2. on APPROVED, records the corresponding parent payment via
  //      record_fee_payment(), allocating it across the student's
  //      installments oldest-due-first, and
  //   3. stores the resulting payment_records.id back on the upload row
  //      (recorded_payment_id) so the audit trail links the two.
  // Re-approving the same row is idempotent: the RPC returns the existing
  // payment id and does not insert a duplicate.
  async reviewFeePaymentUpload(
    id: string,
    decision: 'APPROVED' | 'REJECTED',
    note?: string,
  ): Promise<{ paymentId: string | null }> {
    return apiPrincipal.feeUploadReview({ uploadId: id, decision, note });
  },

  /**
   * Mint a short-lived signed URL for a fee-payment screenshot stored in
   * the private `fee-screenshots` bucket. RLS on storage.objects (see
   * migration 0012) restricts access to same-school principals/teachers
   * and the parent/student linked to that student folder.
   */
  async getFeePaymentScreenshotUrl(
    storagePath: string | null,
    ttlSeconds = 300,
  ): Promise<string | null> {
    if (!storagePath) return null;
    const { data, error } = await supabase.storage
      .from('fee-screenshots')
      .createSignedUrl(storagePath, ttlSeconds);
    if (error) {
      console.warn('[fee-uploads] signed URL failed', error.message);
      return null;
    }
    return data?.signedUrl ?? null;
  },
};

export type FeeUploadStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface FeePaymentUploadRecord {
  id: string;
  studentId: string;
  studentName: string;
  admissionNo: string | null;
  submittedBy: string;
  amount: number;
  description: string;
  screenshotName: string;
  screenshotUrl: string | null;
  status: FeeUploadStatus;
  submittedAt: string;
  reviewedAt: string | null;
  reviewerNote: string | null;
  recordedPaymentId: string | null;
}

export type BillingCycle = 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'ANNUALLY' | 'CUSTOM';

export type FeeStructureType = 'CLASS' | 'VEHICLE';

export interface FeeStructureRecord {
  id: string;
  name: string;
  className: string;
  structureType: FeeStructureType;
  billingCycle: BillingCycle;
  feeHeads: Array<{ id: string; name: string; amount: number; frequency: 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'ANNUAL' | 'ONE_TIME'; description: string; transactionFee?: number }>;
  monthlyDueDates: Array<{ month: string; date: string }>;
  lateFee: { enabled: boolean; gracePeriodDays: number; type: 'FIXED' | 'PERCENTAGE'; amount: number; maxCap: number };
}
