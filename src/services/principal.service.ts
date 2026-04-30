// Supabase-backed services for principal-side managers:
//   notices, complaints, expenses, approvals (incl. student leaves),
//   library + lab assets (assets + asset_issues tables), and
//   academic-year-config derived view.

import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { logAudit } from '../lib/audit';
import type {
  Complaint, Expense, Notice, Approval, NoticeAudience,
  LibraryBook, BookIssue, LabEquipment, Vehicle, AcademicYearConfig,
  ClassPermission,
} from '../types/principal.types';

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
  return {
    id: r.id,
    from: (r.from_role as Complaint['from']) ?? 'STUDENT',
    fromName: r.from_name ?? '',
    fromClass: r.from_class ?? undefined,
    subject: r.subject,
    description: r.description ?? '',
    status: (r.status as Complaint['status']) ?? 'OPEN',
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
    const schoolId = getSchoolId();
    const actor = getActor();
    const payload = {
      school_id: schoolId,
      title: input.title,
      body: input.body,
      audience: input.audience,
      pinned: input.pinned,
      sent_by: actor?.id ?? null,
      sent_by_name: input.sentBy || actor?.name || '',
    };
    const { data, error } = await supabase
      .from('notices').insert(payload).select(NOTICE_FIELDS).single();
    if (error) throw new Error(error.message);
    await logAudit('notice_sent', 'notice', data.id, { audience: input.audience, title: input.title });
    return rowToNotice(data as NoticeRow);
  },

  async deleteNotice(id: string): Promise<void> {
    const schoolId = getSchoolId();
    // Soft-delete to preserve history.
    const { error } = await supabase
      .from('notices').update({ is_active: false }).eq('id', id).eq('school_id', schoolId);
    if (error) throw new Error(error.message);
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
    const schoolId = getSchoolId();
    const { data, error } = await supabase
      .from('complaints')
      .update({
        status: 'RESOLVED',
        response,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', id).eq('school_id', schoolId)
      .select(COMPLAINT_FIELDS).single();
    if (error) throw new Error(error.message);
    await logAudit('complaint_resolved', 'complaint', id, { response_length: response.length });
    return rowToComplaint(data as ComplaintRow);
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
    const schoolId = getSchoolId();
    const actor = getActor();
    const payload = {
      school_id: schoolId,
      category: input.category,
      description: input.description,
      amount: input.amount,
      date: input.date,
      created_by: actor?.id ?? null,
    };
    const { data, error } = await supabase
      .from('expenses').insert(payload).select(EXPENSE_FIELDS).single();
    if (error) throw new Error(error.message);
    await logAudit('expense_added', 'expense', data.id, { category: input.category, amount: input.amount });
    return rowToExpense(data as ExpenseRow, input.approvedBy || actor?.name || '');
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
    const schoolId = getSchoolId();
    // Read first so we know what kind of request it is.
    const { data: row, error: readErr } = await supabase
      .from('approvals').select(APPROVAL_FIELDS)
      .eq('id', id).eq('school_id', schoolId).single();
    if (readErr) throw new Error(readErr.message);
    const a = row as ApprovalRow;

    // For change requests: persist the change via apply_change_request RPC.
    // The RPC also flips the approvals row to APPROVED inside the same tx.
    if (a.request_type === 'PROFILE_CHANGE' || a.request_type === 'STUDENT_FIELD_CHANGE') {
      const { error: rpcErr } = await supabase.rpc('apply_change_request', {
        p_approval_id: id, p_approve: true, p_reason: null,
      });
      if (rpcErr) throw new Error(rpcErr.message);
    } else {
      const actor = getActor();
      const { error } = await supabase
        .from('approvals')
        .update({
          status: 'APPROVED',
          approved_by: actor?.id ?? null,
          approved_at: new Date().toISOString(),
        })
        .eq('id', id).eq('school_id', schoolId);
      if (error) throw new Error(error.message);
    }

    const { data: updated, error: refErr } = await supabase
      .from('approvals').select(APPROVAL_FIELDS)
      .eq('id', id).eq('school_id', schoolId).single();
    if (refErr) throw new Error(refErr.message);
    await logAudit('approval_approved', 'approval', id, { type: a.request_type });
    return rowToApproval(updated as ApprovalRow);
  },

  async rejectRequest(id: string, reason?: string): Promise<Approval> {
    const schoolId = getSchoolId();
    const actor = getActor();
    // Fetch current new_value to merge rejection reason.
    const { data: cur, error: readErr } = await supabase
      .from('approvals').select('new_value').eq('id', id).eq('school_id', schoolId).single();
    if (readErr) throw new Error(readErr.message);
    const nv = (cur?.new_value as Record<string, unknown>) ?? {};
    nv['rejectionReason'] = reason ?? null;

    const { data, error } = await supabase
      .from('approvals')
      .update({
        status: 'REJECTED',
        new_value: nv,
        approved_by: actor?.id ?? null,
        approved_at: new Date().toISOString(),
      })
      .eq('id', id).eq('school_id', schoolId)
      .select(APPROVAL_FIELDS).single();
    if (error) throw new Error(error.message);
    await logAudit('approval_rejected', 'approval', id, { reason: reason ?? null });
    return rowToApproval(data as ApprovalRow);
  },

  async submitStudentLeave(
    studentId: string,
    studentName: string,
    title: string,
    fromDate: string,
    toDate: string,
    reason: string,
  ): Promise<Approval> {
    const schoolId = getSchoolId();
    const actor = getActor();
    const newValue = {
      fromName: studentName,
      fromRole: 'STUDENT',
      subject: title,
      description: `From: ${fromDate}  To: ${toDate}\nReason: ${reason}`,
      fromDate, toDate, reason,
    };
    const { data, error } = await supabase
      .from('approvals')
      .insert({
        school_id: schoolId,
        request_type: 'LEAVE',
        requested_by: actor?.id ?? null,
        entity_type: 'student',
        entity_id: studentId,
        new_value: newValue,
        status: 'PENDING',
      })
      .select(APPROVAL_FIELDS).single();
    if (error) throw new Error(error.message);
    await logAudit('leave_submitted', 'approval', data.id, { studentId, fromDate, toDate });
    return rowToApproval(data as ApprovalRow);
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
    const schoolId = getSchoolId();
    const { data, error } = await supabase.from('assets').insert({
      school_id: schoolId, category: 'BOOK', name: input.title,
      details: { author: input.author, isbn: input.isbn, subject: input.subject },
      total_count: input.totalCopies, available_count: input.totalCopies,
    }).select('id').single();
    if (error) throw new Error(error.message);
    return {
      id: (data as { id: string }).id,
      title: input.title, author: input.author, isbn: input.isbn, subject: input.subject,
      totalCopies: input.totalCopies, availableCopies: input.totalCopies,
      issuedTo: [],
    };
  },

  async deleteBook(id: string): Promise<void> {
    const schoolId = getSchoolId();
    const { error } = await supabase.from('assets').delete()
      .eq('id', id).eq('school_id', schoolId);
    if (error) throw new Error(error.message);
  },

  // Atomic — wraps INSERT into asset_issues + UPDATE assets.available_count
  // in a single SECURITY DEFINER RPC so partial-failure can't desync inventory.
  async issueBook(
    bookId: string, studentId: string, studentName: string, note?: string,
  ): Promise<LibraryBook> {
    const { error } = await supabase.rpc('issue_asset', {
      p_asset_id: bookId,
      p_student_id: studentId || null,
      p_borrower_name: studentName,
      p_loan_days: 14,
      p_note: note?.trim() || null,
    });
    if (error) throw new Error(error.message);
    return (await this.getBooks()).find(b => b.id === bookId)!;
  },

  async returnBook(
    bookId: string, studentId: string, note?: string,
  ): Promise<LibraryBook> {
    const { error } = await supabase.rpc('return_asset', {
      p_asset_id: bookId,
      p_student_id: studentId || null,
      p_note: note?.trim() || null,
    });
    if (error) throw new Error(error.message);
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
    const schoolId = getSchoolId();
    const { data, error } = await supabase.from('assets').insert({
      school_id: schoolId, category: 'LAB_EQUIPMENT', name: input.name,
      details: { labType: input.labType, lastServiced: input.lastServiced },
      total_count: input.quantity, available_count: input.workingCount,
    }).select('id').single();
    if (error) throw new Error(error.message);
    return { ...input, id: (data as { id: string }).id };
  },

  async deleteEquipment(id: string): Promise<void> {
    const schoolId = getSchoolId();
    const { error } = await supabase.from('assets').delete()
      .eq('id', id).eq('school_id', schoolId);
    if (error) throw new Error(error.message);
  },

  async updateEquipment(id: string, input: Partial<LabEquipment>): Promise<LabEquipment> {
    const schoolId = getSchoolId();
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.quantity !== undefined) patch.total_count = input.quantity;
    if (input.workingCount !== undefined) patch.available_count = input.workingCount;
    if (input.labType !== undefined || input.lastServiced !== undefined) {
      const { data: cur } = await supabase.from('assets').select('details')
        .eq('id', id).eq('school_id', schoolId).single();
      const curDet = ((cur as { details?: Record<string, unknown> } | null)?.details) ?? {};
      patch.details = {
        ...curDet,
        ...(input.labType !== undefined ? { labType: input.labType } : {}),
        ...(input.lastServiced !== undefined ? { lastServiced: input.lastServiced } : {}),
      };
    }
    const { error } = await supabase.from('assets').update(patch)
      .eq('id', id).eq('school_id', schoolId);
    if (error) throw new Error(error.message);
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
    const schoolId = getSchoolId();
    if (input.classes) {
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

      const toInsert: Array<{ school_id: string; academic_year_id: string; class_name: string; section: string }> = [];
      requested.forEach(key => {
        if (!existingSet.has(key)) {
          const [class_name, section] = key.split('|');
          toInsert.push({ school_id: schoolId, academic_year_id: id, class_name, section });
        }
      });
      const toDelete: string[] = [];
      existingSet.forEach((sid, key) => { if (!requested.has(key)) toDelete.push(sid); });

      if (toInsert.length) {
        const { error: insErr } = await supabase.from('sections').insert(toInsert);
        if (insErr) throw new Error(insErr.message);
      }
      if (toDelete.length) {
        const { error: delErr } = await supabase.from('sections').delete().in('id', toDelete);
        if (delErr) throw new Error(delErr.message);
      }
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

  async saveStaffAttendance(date: string, rows: StaffAttendanceRow[]): Promise<string | null> {
    const schoolId = getSchoolId();
    const actor = getActor();
    if (!rows.length) throw new Error('No staff to record');

    // Upsert per (staff_id, date). The DB UNIQUE constraint on
    // (staff_id, date) handles deduplication. We also bump created_at on
    // every save so the "last saved" timestamp advances on re-save.
    const nowIso = new Date().toISOString();
    const payload = rows.map(r => ({
      school_id: schoolId,
      staff_id: r.staffId,
      date,
      status: r.status,
      marked_by: actor?.id ?? null,
      created_at: nowIso,
    }));
    const { error } = await supabase
      .from('staff_attendance')
      .upsert(payload, { onConflict: 'staff_id,date' });
    if (error) throw new Error(error.message);

    await logAudit('staff_attendance_saved', 'staff_attendance', date, {
      date, count: rows.length,
    });

    // Re-derive the "last saved" timestamp from the DB so callers see the
    // canonical value (not the client clock).
    const { data: ts } = await supabase
      .from('staff_attendance').select('created_at')
      .eq('school_id', schoolId).eq('date', date)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    return (ts as { created_at: string } | null)?.created_at ?? nowIso;
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
    const schoolId = getSchoolId();
    const { data: ay, error: ayErr } = await supabase
      .from('academic_years').select('id')
      .eq('school_id', schoolId).eq('is_active', true).maybeSingle();
    if (ayErr) throw new Error(ayErr.message);
    if (!ay) throw new Error('No active academic year');
    const ayId = (ay as { id: string }).id;

    const { data: sec, error: sErr } = await supabase
      .from('sections').select('id')
      .eq('school_id', schoolId).eq('academic_year_id', ayId)
      .eq('class_name', className).eq('section', section).maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!sec) throw new Error(`Section ${className}-${section} not found in active year`);
    const sectionId = (sec as { id: string }).id;

    // Wipe stale rows for this (staff, section) inside the active AY.
    const { error: dErr } = await supabase
      .from('staff_permissions').delete()
      .eq('school_id', schoolId).eq('academic_year_id', ayId)
      .eq('staff_id', teacherId).eq('section_id', sectionId);
    if (dErr) throw new Error(dErr.message);

    const rows: Array<{ school_id: string; staff_id: string; academic_year_id: string; section_id: string; permission: string }> = [];
    if (perms.canMarkAttendance) rows.push({ school_id: schoolId, staff_id: teacherId, academic_year_id: ayId, section_id: sectionId, permission: 'MARK_ATTENDANCE' });
    if (perms.canUploadResults)  rows.push({ school_id: schoolId, staff_id: teacherId, academic_year_id: ayId, section_id: sectionId, permission: 'UPLOAD_RESULTS' });
    if (perms.canScheduleExam)   rows.push({ school_id: schoolId, staff_id: teacherId, academic_year_id: ayId, section_id: sectionId, permission: 'SCHEDULE_EXAM' });
    if (rows.length) {
      const { error: iErr } = await supabase.from('staff_permissions').insert(rows);
      if (iErr) throw new Error(iErr.message);
    }
    await logAudit('staff_permission_set', 'staff_permissions', `${teacherId}:${sectionId}`, perms);
  },

  async removeStaffPermissions(className: string, section: string, teacherId: string): Promise<void> {
    const schoolId = getSchoolId();
    const { data: ay } = await supabase
      .from('academic_years').select('id')
      .eq('school_id', schoolId).eq('is_active', true).maybeSingle();
    if (!ay) return;
    const ayId = (ay as { id: string }).id;
    const { data: sec } = await supabase
      .from('sections').select('id')
      .eq('school_id', schoolId).eq('academic_year_id', ayId)
      .eq('class_name', className).eq('section', section).maybeSingle();
    if (!sec) return;
    const { error } = await supabase
      .from('staff_permissions').delete()
      .eq('school_id', schoolId).eq('academic_year_id', ayId)
      .eq('staff_id', teacherId).eq('section_id', (sec as { id: string }).id);
    if (error) throw new Error(error.message);
    await logAudit('staff_permission_removed', 'staff_permissions', `${teacherId}:${(sec as { id: string }).id}`);
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
        .select('id, name, class_name, billing_cycle, fee_heads, monthly_due_dates, late_fee')
        .eq('school_id', schoolId).eq('academic_year_id', ayId)
        .order('class_name');
      if (error) throw new Error(error.message);
      return ((data ?? []) as Array<{
        id: string; name: string; class_name: string;
        billing_cycle: BillingCycle | null;
        fee_heads: FeeStructureRecord['feeHeads'];
        monthly_due_dates: FeeStructureRecord['monthlyDueDates'];
        late_fee: FeeStructureRecord['lateFee'];
      }>).map(r => ({
        id: r.id,
        name: r.name,
        className: r.class_name,
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
  // (caller only invokes when the table is empty) and additionally
  // safe-guarded by re-checking row count inside a defensive try/catch.
  async _seedDefaultFeeStructures(schoolId: string, ayId: string): Promise<void> {
    const { count } = await supabase
      .from('fee_structures')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId).eq('academic_year_id', ayId);
    if ((count ?? 0) > 0) return;

    const defaults = [
      {
        school_id: schoolId, academic_year_id: ayId,
        name: 'Standard Fees - Class 1', class_name: 'Class 1',
        fee_heads: [
          { id: 'h1', name: 'Tuition Fee', amount: 1500, frequency: 'MONTHLY', description: 'Monthly tuition charges' },
          { id: 'h2', name: 'Admission Fee', amount: 2000, frequency: 'ONE_TIME', description: '' },
          { id: 'h3', name: 'Exam Fee', amount: 1200, frequency: 'ANNUAL', description: '' },
          { id: 'h4', name: 'Smart Class Fee', amount: 200, frequency: 'MONTHLY', description: '' },
        ],
        monthly_due_dates: [],
        late_fee: { enabled: false, gracePeriodDays: 5, type: 'FIXED', amount: 100, maxCap: 1000 },
      },
      {
        school_id: schoolId, academic_year_id: ayId,
        name: 'Standard Fees - Class 9', class_name: 'Class 9',
        fee_heads: [
          { id: 'h1', name: 'Tuition Fee', amount: 2800, frequency: 'MONTHLY', description: '' },
          { id: 'h2', name: 'Admission Fee', amount: 3000, frequency: 'ONE_TIME', description: '' },
          { id: 'h3', name: 'Exam Fee', amount: 2000, frequency: 'ANNUAL', description: '' },
          { id: 'h4', name: 'Lab Fee', amount: 300, frequency: 'MONTHLY', description: '' },
        ],
        monthly_due_dates: [],
        late_fee: { enabled: true, gracePeriodDays: 5, type: 'FIXED', amount: 100, maxCap: 1000 },
      },
    ];

    const { error } = await supabase.from('fee_structures').insert(defaults);
    if (error) {
      // Don't throw — a seed failure (e.g. RLS, race) shouldn't break the
      // principal's view. Surface as no-op; the caller will return [].
      // eslint-disable-next-line no-console
      console.warn('[principal.service] seed defaults failed:', error.message);
    } else {
      await logAudit('fee_structures_seeded', 'fee_structures', ayId, { count: defaults.length });
    }
  },

  async saveFeeStructure(input: FeeStructureRecord): Promise<FeeStructureRecord> {
    const schoolId = getSchoolId();
    const { data: ay, error: ayErr } = await supabase
      .from('academic_years').select('id')
      .eq('school_id', schoolId).eq('is_active', true).maybeSingle();
    if (ayErr) throw new Error(ayErr.message);
    // Surface a clear, actionable message: this branch is hit when the
    // principal closed the previous year and tried to save a fee structure
    // before opening a new one. The vague "No active academic year" string
    // was being swallowed by the toast and looked like a generic failure.
    if (!ay) throw new Error('Koi active academic year nahi hai. Fee structure save karne ke liye pehle Academic Year section me naya year start karein.');
    const ayId = (ay as { id: string }).id;

    const payload = {
      school_id: schoolId,
      academic_year_id: ayId,
      name: input.name,
      class_name: input.className,
      billing_cycle: input.billingCycle,
      fee_heads: input.feeHeads,
      monthly_due_dates: input.monthlyDueDates,
      late_fee: input.lateFee,
      updated_at: new Date().toISOString(),
    };

    // Treat client-side ids (e.g. "fs1") as new rows. Only persisted UUIDs
    // round-trip as updates.
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.id);
    let id = input.id;
    let prevSnap: Record<string, unknown> | null = null;
    if (isUuid) {
      // Capture the previous structure so the audit log can show a real diff.
      const { data: prev } = await supabase
        .from('fee_structures')
        .select('name, class_name, billing_cycle, fee_heads, monthly_due_dates, late_fee')
        .eq('id', input.id).eq('school_id', schoolId).maybeSingle();
      prevSnap = (prev ?? null) as Record<string, unknown> | null;
      const { error } = await supabase
        .from('fee_structures').update(payload).eq('id', input.id).eq('school_id', schoolId);
      if (error) throw new Error(error.message);
    } else {
      const { data, error } = await supabase
        .from('fee_structures').insert(payload).select('id').single();
      if (error) throw new Error(error.message);
      id = (data as { id: string }).id;
    }
    // Build a compact changes[] only for the fields that actually moved,
    // so the Activity Logs viewer can render before/after.
    const newSnap: Record<string, unknown> = {
      name: input.name,
      class_name: input.className,
      billing_cycle: input.billingCycle,
      fee_heads: input.feeHeads,
      monthly_due_dates: input.monthlyDueDates,
      late_fee: input.lateFee,
    };
    const changes = prevSnap
      ? Object.keys(newSnap)
          .filter(k => JSON.stringify(prevSnap![k]) !== JSON.stringify(newSnap[k]))
          .map(k => ({ field: k, oldValue: prevSnap![k] ?? null, newValue: newSnap[k] }))
      : [];
    await logAudit('fee_structure_saved', 'fee_structures', id, {
      name: input.name,
      mode: prevSnap ? 'update' : 'create',
      changes,
    });
    return { ...input, id };
  },

  async saveFeeStructureForYear(
    yearId: string,
    input: Omit<FeeStructureRecord, 'id'>,
  ): Promise<FeeStructureRecord> {
    const schoolId = getSchoolId();
    const payload = {
      school_id: schoolId,
      academic_year_id: yearId,
      name: input.name,
      class_name: input.className,
      billing_cycle: input.billingCycle,
      fee_heads: input.feeHeads,
      monthly_due_dates: input.monthlyDueDates,
      late_fee: input.lateFee,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('fee_structures').insert(payload).select('id').single();
    if (error) throw new Error(error.message);
    const id = (data as { id: string }).id;
    await logAudit('fee_structure_saved', 'fee_structures', id, { name: input.name, mode: 'create' });
    return { ...input, id };
  },

  async deleteFeeStructure(id: string): Promise<void> {
    const schoolId = getSchoolId();
    const { error } = await supabase
      .from('fee_structures').delete().eq('id', id).eq('school_id', schoolId);
    if (error) throw new Error(error.message);
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
    const { data, error } = await supabase.rpc('review_fee_payment_upload', {
      p_upload_id: id,
      p_decision: decision,
      p_note: note?.trim() || null,
    });
    if (error) throw new Error(error.message);
    return { paymentId: (data as string | null) ?? null };
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

export interface FeeStructureRecord {
  id: string;
  name: string;
  className: string;
  billingCycle: BillingCycle;
  feeHeads: Array<{ id: string; name: string; amount: number; frequency: 'MONTHLY' | 'ANNUAL' | 'ONE_TIME'; description: string }>;
  monthlyDueDates: Array<{ month: string; date: string }>;
  lateFee: { enabled: boolean; gracePeriodDays: number; type: 'FIXED' | 'PERCENTAGE'; amount: number; maxCap: number };
}
