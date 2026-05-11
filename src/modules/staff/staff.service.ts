// Supabase-backed staff service. Add-staff creates a Supabase Auth user via
// admin-api (default password = mobile, must change on first login). Suspend
// only flips status — never hard-delete (DB triggers enforce permanent ID).

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { adminApi } from '@/lib/adminApi';
import { logAudit } from '@/lib/audit';
import { todayIST } from '@/shared/utils/date';
import { staffStorageService } from '@/modules/staff/staffStorage.service';
import { apiStaff } from '@/lib/apiClient';
import type {
  StaffMember, SalaryPayment, StaffRole, StaffStatus,
  StaffSalaryHistoryEntry, StaffStatusHistoryEntry, StaffDocument,
  SalaryReminderRow, SalaryPaymentMethod,
} from '@/modules/staff/staff.types';

function getSchoolId(): string {
  const id = useAuthStore.getState().session?.schoolId;
  if (!id) throw new Error('No school in session');
  return id;
}

// IST today — the UTC version produced wrong dates between
// 12:00 and 05:30 AM IST (still yesterday in UTC). For salary
// records this would mean a "today's salary" entry actually
// dated yesterday → broken month-aggregations and audit drift.
const todayIso = (): string => todayIST();

/** Resolve a staff salary effective on a given month (first-of-month date)
 *  from a sorted history slice. Falls back to `currentSalary`. */
function effectiveSalaryAt(
  monthStart: Date,
  history: { amount: number; effective_from: string }[],
  currentSalary: number,
): number {
  let amount = 0;
  for (const h of history) {
    if (new Date(h.effective_from) <= monthStart) amount = Number(h.amount);
    else break;
  }
  return amount || currentSalary;
}

interface StaffRow {
  id: string;
  user_id: string | null;
  name: string;
  role: string;
  subject: string | null;
  phone: string | null;
  email: string | null;
  aadhaar_no: string | null;
  salary: number;
  joining_date: string | null;
  salary_start_date: string | null;
  status: string;
  address: string | null;
  photo: string | null;
  is_active: boolean;
  relieving_date?: string | null;
  relieving_reason?: string | null;
}

const STAFF_FIELDS = 'id, user_id, name, role, subject, phone, email, aadhaar_no, salary, joining_date, salary_start_date, status, address, photo, is_active, relieving_date, relieving_reason';

interface SalaryRow {
  id: string;
  staff_id: string;
  month: string;
  amount: number;
  paid_at: string;
  created_at?: string;
  transaction_id: string | null;
  note: string | null;
  method?: string | null;
  reversed_at?: string | null;
  reversal_reason?: string | null;
  // When the select projects the related users(name) embed, Supabase types
  // it as either a single object or an array depending on the relation.
  users?: { name: string } | { name: string }[] | null;
}

function rowToSalary(r: SalaryRow): SalaryPayment {
  const reverser = Array.isArray(r.users) ? r.users[0] : r.users;
  return {
    id: r.id,
    month: r.month,
    amount: Number(r.amount),
    paidAt: r.paid_at,
    createdAt: r.created_at ?? r.paid_at,
    transactionId: r.transaction_id ?? '',
    note: r.note ?? '',
    method: (r.method as SalaryPaymentMethod | null) ?? null,
    reversedAt: r.reversed_at ?? null,
    reversedByName: reverser?.name ?? null,
    reversalReason: r.reversal_reason ?? null,
  };
}

function rowToStaff(r: StaffRow, assignedClasses: string[] = [], salaryHistory?: SalaryPayment[]): StaffMember {
  return {
    id: r.id,
    name: r.name,
    role: (r.role as StaffRole) ?? 'TEACHER',
    subject: r.subject ?? '',
    phone: r.phone ?? '',
    email: r.email ?? '',
    aadhaarNo: r.aadhaar_no ?? '',
    salary: Number(r.salary),
    joiningDate: r.joining_date ?? '',
    salaryStartDate: r.salary_start_date ?? '',
    status: (r.status as StaffStatus) ?? 'ACTIVE',
    assignedClasses,
    address: r.address ?? '',
    photo: r.photo ?? '',
    salaryHistory,
    relievingDate: r.relieving_date ?? null,
    relievingReason: r.relieving_reason ?? null,
  };
}

async function fetchAssignedClasses(schoolId: string, staffIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (!staffIds.length) return map;
  const { data, error } = await supabase
    .from('staff_class_assignments')
    .select('staff_id, class_name')
    .eq('school_id', schoolId)
    .in('staff_id', staffIds);
  if (error) throw new Error(error.message);
  ((data ?? []) as { staff_id: string; class_name: string }[]).forEach(r => {
    const arr = map.get(r.staff_id) ?? [];
    arr.push(r.class_name);
    map.set(r.staff_id, arr);
  });
  return map;
}

export const staffService = {
  async getAll(): Promise<StaffMember[]> {
    const schoolId = getSchoolId();
    const { data, error } = await supabase
      .from('staff').select(STAFF_FIELDS)
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false })
      // Safety cap. A normal school has 20-200 staff. The cap exists
      // to bound the client-side payload if the table is ever
      // accidentally bloated (bad import, missing soft-delete) so
      // the principal's app doesn't lock up trying to render 10k
      // rows. Mirrors studentService.getAll's 5000 cap.
      .limit(2000);
    if (error) throw new Error(error.message);
    const rows = ((data ?? []) as StaffRow[]).filter(r => r.is_active);
    const classesMap = await fetchAssignedClasses(schoolId, rows.map(r => r.id));
    return rows.map(r => rowToStaff(r, classesMap.get(r.id) ?? []));
  },

  async getById(id: string): Promise<StaffMember | null> {
    const schoolId = getSchoolId();
    const { data, error } = await supabase
      .from('staff').select(STAFF_FIELDS)
      .eq('id', id).eq('school_id', schoolId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const row = data as StaffRow;
    const classesMap = await fetchAssignedClasses(schoolId, [row.id]);

    // Pull salary history.
    const { data: payments } = await supabase
      .from('salary_payments')
      .select('id, staff_id, month, amount, paid_at, transaction_id, note')
      .eq('staff_id', id).order('paid_at', { ascending: false });
    const history = ((payments ?? []) as SalaryRow[]).map(rowToSalary);
    return rowToStaff(row, classesMap.get(row.id) ?? [], history);
  },

  /**
   * Create a staff member. Also provisions a Supabase Auth account via the
   * admin-api endpoint (default password = mobile number; user must change
   * on first login). Optional class assignments are inserted in the same call.
   */
  async create(input: Omit<StaffMember, 'id'>): Promise<StaffMember> {
    const schoolId = getSchoolId();

    // Step 1: provision auth account (returns userId). The admin-api endpoint
    // is upsert-style — if a user with this mobile already exists in *this*
    // school it returns the existing userId (reused=true). If the user
    // already exists in *another* school the endpoint hard-fails with 409,
    // which we let propagate so the caller sees an actionable error. Either
    // way userId is GUARANTEED to be non-null on success — we never insert
    // a staff row with user_id=null when phone was provided.
    let userId: string | null = null;
    if (input.phone) {
      const apiRole = input.role === 'DRIVER' ? 'DRIVER' : 'TEACHER';
      const res = await adminApi.createSchoolUser({
        mobile: input.phone.replace(/\D/g, '').slice(-10),
        name: input.name,
        role: apiRole,
      });
      userId = res.userId;
      if (!userId) throw new Error('Failed to provision auth account for staff');
    }

    // Steps 2-4: insert staff row, seed salary history, and class assignments
    // all handled atomically on the server (userId already provisioned above).
    const row = await apiStaff.create({
      userId,
      name:           input.name,
      role:           input.role,
      salary:         input.salary,
      subject:        input.subject || undefined,
      phone:          input.phone   || undefined,
      email:          input.email   || undefined,
      aadhaarNo:      input.aadhaarNo || undefined,
      joiningDate:    input.joiningDate || undefined,
      salaryStartDate: input.salaryStartDate || undefined,
      status:         input.status,
      address:        input.address || undefined,
      photo:          input.photo   || undefined,
      assignedClasses: input.assignedClasses ?? [],
    });

    await logAudit('staff_created', 'staff', row.id, { role: input.role, name: input.name });
    return rowToStaff(row as StaffRow, input.assignedClasses ?? []);
  },

  async update(id: string, input: Partial<StaffMember>): Promise<StaffMember> {
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined)      patch.name         = input.name;
    if (input.role !== undefined)      patch.role         = input.role;
    if (input.subject !== undefined)   patch.subject      = input.subject;
    if (input.phone !== undefined)     patch.phone        = input.phone;
    if (input.email !== undefined)     patch.email        = input.email;
    if (input.aadhaarNo !== undefined) patch.aadhaar_no   = input.aadhaarNo;
    if (input.salary !== undefined)    patch.salary       = input.salary;
    if (input.joiningDate !== undefined) patch.joining_date = input.joiningDate;
    if (input.salaryStartDate !== undefined) patch.salary_start_date = input.salaryStartDate;
    if (input.status !== undefined)    patch.status       = input.status;
    if (input.address !== undefined)   patch.address      = input.address;
    if (input.photo !== undefined)     patch.photo        = input.photo;

    await apiStaff.update({
      id,
      patch,
      assignedClasses: input.assignedClasses,
    });

    await logAudit('staff_updated', 'staff', id, { fields: Object.keys(patch) });
    const fresh = await this.getById(id);
    if (!fresh) throw new Error('Staff not found after update');
    return fresh;
  },

  async suspend(id: string): Promise<StaffMember> {
    const schoolId = getSchoolId();
    const { data: row } = await supabase
      .from('staff').select('user_id')
      .eq('id', id).eq('school_id', schoolId).maybeSingle();

    const updated = await this.update(id, { status: 'SUSPENDED' });

    const { data: ay } = await supabase
      .from('academic_years').select('id')
      .eq('school_id', schoolId).eq('is_active', true).maybeSingle();
    const ayId = (ay as { id: string } | null)?.id ?? null;

    if (ayId) {
      await supabase.from('staff_permissions')
        .delete().eq('school_id', schoolId).eq('academic_year_id', ayId).eq('staff_id', id);
      await supabase.from('staff_class_assignments')
        .delete().eq('school_id', schoolId).eq('academic_year_id', ayId).eq('staff_id', id);
      // Clear suspended teacher from timetable entries — keep the slots but
      // null-out the teacher so the principal can see "Teacher Suspended ·
      // reassign" in the UI instead of an orphan name. Hard-deleting would
      // erase the subject + room metadata the principal still needs.
      await supabase.from('timetable_entries')
        .update({ teacher_id: null, teacher_name: null })
        .eq('school_id', schoolId).eq('academic_year_id', ayId).eq('teacher_id', id);
    }

    const userId = (row as { user_id: string | null } | null)?.user_id ?? null;
    if (userId) {
      try { await adminApi.setSchoolUserActive(userId, false); } catch { /* best-effort */ }
    }

    await logAudit('staff_suspended', 'staff', id, { detachedFromClasses: !!ayId });
    return updated;
  },

  async reinstate(id: string): Promise<StaffMember> {
    const schoolId = getSchoolId();
    const { data: row } = await supabase
      .from('staff').select('user_id')
      .eq('id', id).eq('school_id', schoolId).maybeSingle();
    const updated = await this.update(id, { status: 'ACTIVE' });
    const userId = (row as { user_id: string | null } | null)?.user_id ?? null;
    if (userId) {
      try { await adminApi.setSchoolUserActive(userId, true); } catch { /* best-effort */ }
    }
    await logAudit('staff_reinstated', 'staff', id);
    return updated;
  },

  /**
   * "Delete" → soft delete via is_active=false + deactivate auth user.
   * Hard delete is blocked by DB trigger on permanent identity tables.
   */
  async delete(id: string): Promise<void> {
    const schoolId = getSchoolId();
    const { data: row } = await supabase
      .from('staff').select('user_id').eq('id', id).eq('school_id', schoolId).maybeSingle();
    const userId = (row as { user_id: string | null } | null)?.user_id ?? null;

    await apiStaff.deactivate(id);

    if (userId) {
      try { await adminApi.setSchoolUserActive(userId, false); } catch { /* best-effort */ }
    }
    await logAudit('staff_deactivated', 'staff', id);
  },

  async paySalary(id: string, month: string, note: string): Promise<StaffMember> {
    const { data: staffRow, error: rErr } = await supabase
      .from('staff').select('salary').eq('id', id).eq('school_id', getSchoolId()).maybeSingle();
    if (rErr) throw new Error(rErr.message);
    if (!staffRow) throw new Error('Staff not found');
    const salary = Number((staffRow as { salary: number }).salary);
    return this.recordSalaryPayment(id, month, salary, note);
  },

  /**
   * Record a salary payment (full or partial). Atomic via the
   * record_salary_payment RPC, which writes both salary_payments and a
   * matching expenses row (category='SALARY') so the cashflow report
   * stays consistent. Method + transaction id are optional (auto-generated
   * when omitted) so the legacy 4-arg call site still works.
   */
  async recordSalaryPayment(
    staffId: string,
    month: string,
    amount: number,
    note: string,
    method?: SalaryPaymentMethod | null,
    transactionId?: string | null,
    paidAt?: string,
  ): Promise<StaffMember> {
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Amount must be positive');
    await apiStaff.paySalary({
      staffId, month, amount,
      note:          note || undefined,
      method:        method ?? undefined,
      transactionId: transactionId ?? undefined,
      paidAt:        paidAt || undefined,
    });
    const fresh = await this.getById(staffId);
    if (!fresh) throw new Error('Staff not found after pay');
    return fresh;
  },

  async reverseSalaryPayment(paymentId: string, reason: string): Promise<void> {
    if (!reason.trim()) throw new Error('Reason is required');
    await apiStaff.reverseSalary({ paymentId, reason: reason.trim() });
    await logAudit('salary_payment_reversed', 'staff', paymentId, { reason });
  },

  // ─── Salary history (effective-from changes) ─────────────────────────────
  async getSalaryHistory(staffId: string): Promise<StaffSalaryHistoryEntry[]> {
    const { data, error } = await supabase
      .from('staff_salary_history')
      .select('id, salary_amount, effective_from, reason, created_at')
      .eq('staff_id', staffId)
      .order('effective_from', { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<{
      id: string; salary_amount: number; effective_from: string;
      reason: string | null; created_at: string;
    }>).map(r => ({
      id: r.id,
      amount: Number(r.salary_amount),
      effectiveFrom: r.effective_from,
      reason: r.reason,
      createdAt: r.created_at,
    }));
  },

  /**
   * Edit the staff salary effective from a given date. Calls update_staff_salary
   * RPC which atomically bumps staff.salary AND inserts a history row.
   */
  async updateSalary(
    staffId: string,
    newAmount: number,
    effectiveFrom: string,
    reason: string,
  ): Promise<void> {
    if (!Number.isFinite(newAmount) || newAmount < 0) {
      throw new Error('Salary must be non-negative');
    }
    await apiStaff.updateSalary({
      staffId,
      newAmount,
      effectiveFrom: effectiveFrom || new Date().toISOString().slice(0, 10),
      reason,
    });
  },

  // ─── Payment history (per staff) ─────────────────────────────────────────
  // The optional academicYearId param is reserved for future use — salary_payments
  // currently stores `month` as a free-form text label without an AY foreign key,
  // so any year filtering happens client-side via the AY's date window.
  async getPaymentHistory(
    staffId: string,
    _academicYearId?: string,
  ): Promise<SalaryPayment[]> {
    const { data, error } = await supabase
      .from('salary_payments')
      .select(
        'id, staff_id, month, amount, paid_at, created_at, transaction_id, note, method, ' +
        'reversed_at, reversal_reason, users:reversed_by(name)'
      )
      .eq('staff_id', staffId)
      .order('paid_at', { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as SalaryRow[]).map(rowToSalary);
  },

  // ─── Salary reminders for the dashboard widget ───────────────────────────
  async getSalaryReminders(yearMonth: string): Promise<SalaryReminderRow[]> {
    const schoolId = getSchoolId();
    const { data, error } = await supabase.rpc('salary_reminders', {
      p_school_id:  schoolId,
      p_year_month: yearMonth,
    });
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<{
      staff_id: string; name: string; role: string;
      salary: number; paid_amount: number;
    }>).map(r => ({
      staffId: r.staff_id,
      name:    r.name,
      role:    (r.role as StaffRole) ?? 'TEACHER',
      salary:  Number(r.salary),
      paid:    Number(r.paid_amount),
      pending: Math.max(0, Number(r.salary) - Number(r.paid_amount)),
    }));
  },

  // ─── Relieving date / status history ─────────────────────────────────────
  async setRelievingDate(staffId: string, date: string, reason: string): Promise<void> {
    if (!date) throw new Error('Relieving date required');
    await apiStaff.relieve({ staffId, date, reason });
  },

  async getStatusHistory(staffId: string): Promise<StaffStatusHistoryEntry[]> {
    const { data, error } = await supabase
      .from('staff_status_history')
      .select('id, old_status, new_status, reason, changed_at')
      .eq('staff_id', staffId)
      .order('changed_at', { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<{
      id: string; old_status: string | null; new_status: string;
      reason: string | null; changed_at: string;
    }>).map(r => ({
      id: r.id,
      oldStatus: (r.old_status as StaffStatus | null) ?? null,
      newStatus: (r.new_status as StaffStatus) ?? 'ACTIVE',
      reason: r.reason,
      changedAt: r.changed_at,
    }));
  },

  // ─── Documents ────────────────────────────────────────────────────────────
  async getDocuments(staffId: string): Promise<StaffDocument[]> {
    const { data, error } = await supabase
      .from('staff_documents')
      .select('id, staff_id, doc_type, doc_name, doc_url, uploaded_at')
      .eq('staff_id', staffId)
      .order('uploaded_at', { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<{
      id: string; staff_id: string; doc_type: string;
      doc_name: string; doc_url: string; uploaded_at: string;
    }>).map(r => ({
      id: r.id,
      staffId: r.staff_id,
      docType: r.doc_type,
      docName: r.doc_name,
      storagePath: r.doc_url,
      uploadedAt: r.uploaded_at,
    }));
  },

  async uploadDocument(
    staffId: string,
    docType: string,
    file: File,
  ): Promise<StaffDocument> {
    const { path } = await staffStorageService.uploadStaffDocument(staffId, docType, file);
    const schoolId = getSchoolId();
    const { data, error } = await supabase
      .from('staff_documents')
      .insert({
        staff_id: staffId,
        school_id: schoolId,
        doc_type: docType,
        doc_name: file.name,
        doc_url: path,
      })
      .select('id, staff_id, doc_type, doc_name, doc_url, uploaded_at')
      .single();
    if (error) {
      // Best-effort cleanup of orphaned object so the bucket doesn't grow.
      await staffStorageService.removeStaffDocument(path).catch(() => {});
      throw new Error(error.message);
    }
    await logAudit('staff_doc_uploaded', 'staff', staffId, { docType, docName: file.name });
    const row = data as { id: string; staff_id: string; doc_type: string;
      doc_name: string; doc_url: string; uploaded_at: string };
    return {
      id: row.id,
      staffId: row.staff_id,
      docType: row.doc_type,
      docName: row.doc_name,
      storagePath: row.doc_url,
      uploadedAt: row.uploaded_at,
    };
  },

  async removeDocument(documentId: string): Promise<void> {
    const { docUrl } = await apiStaff.deleteDocument(documentId);
    if (docUrl) await staffStorageService.removeStaffDocument(docUrl).catch(() => {});
    await logAudit('staff_doc_deleted', 'staff', 'unknown', { documentId });
  },

  async getDocumentSignedUrl(storagePath: string): Promise<string | null> {
    return staffStorageService.getStaffDocumentSignedUrl(storagePath);
  },

  /**
   * Build a salary ledger across all active staff for the active academic
   * year. Each staff has one row per AY month (Apr→Mar of that year), with
   * paid amount aggregated from salary_payments.
   */
  async getSalaryLedger(): Promise<Array<{
    staff: StaffMember;
    months: Array<{ month: string; due: number; paid: number; lastPaidAt: string | null; note: string }>;
  }>> {
    const schoolId = getSchoolId();
    const staff = await this.getAll();
    if (!staff.length) return [];

    // Active academic year window
    const { data: ay } = await supabase
      .from('academic_years').select('start_date, end_date')
      .eq('school_id', schoolId).eq('is_active', true).maybeSingle();
    const today = new Date();
    const start = ay ? new Date((ay as { start_date: string }).start_date)
                      : new Date(today.getFullYear(), 3, 1); // Apr 1
    const end = ay ? new Date((ay as { end_date: string }).end_date)
                   : new Date(today.getFullYear() + 1, 2, 31); // Mar 31

    // Build month list from max(joiningDate, AY-start) → min(today, AY-end,
    // relievingDate). Clamping at relievingDate keeps ledger totals
    // semantically clean for relieved staff (no phantom months after exit).
    const fmt = (d: Date) => d.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
    // Lower bound is salary_start_date (when configured) — this is when
    // the school *starts paying*, separate from joining_date. If the
    // salary_start_date column is missing for legacy rows, we fall back
    // to joining_date so behaviour matches the pre-0102 ledger.
    const buildMonths = (salaryStartIso: string, joinIso: string, relieveIso: string | null): string[] => {
      const lower = (salaryStartIso || joinIso) ? new Date(salaryStartIso || joinIso) : start;
      const from = lower > start ? lower : start;
      const ceiling = today < end ? today : end;
      const relieve = relieveIso ? new Date(relieveIso) : null;
      const to = relieve && relieve < ceiling ? relieve : ceiling;
      if (from > to) return [];
      const months: string[] = [];
      const cur = new Date(from.getFullYear(), from.getMonth(), 1);
      const stop = new Date(to.getFullYear(), to.getMonth(), 1);
      while (cur <= stop) {
        months.push(fmt(cur));
        cur.setMonth(cur.getMonth() + 1);
      }
      return months;
    };

    const ids = staff.map(s => s.id);
    const { data: pays } = await supabase
      .from('salary_payments')
      .select('staff_id, month, amount, paid_at, note')
      .in('staff_id', ids);
    const payRows = ((pays ?? []) as Array<{ staff_id: string; month: string; amount: number; paid_at: string; note: string | null }>);

    // Pull all salary-history rows in one shot so each month's `due` reflects
    // the amount that was effective at that month, not the latest amount on
    // staff.salary (which is incorrect once a future raise is recorded).
    const { data: hist } = await supabase
      .from('staff_salary_history')
      .select('staff_id, salary_amount, effective_from')
      .in('staff_id', ids)
      .order('effective_from', { ascending: true });
    const histByStaff = new Map<string, Array<{ amount: number; effective_from: string }>>();
    for (const row of (hist ?? []) as Array<{ staff_id: string; salary_amount: number; effective_from: string }>) {
      const arr = histByStaff.get(row.staff_id) ?? [];
      arr.push({ amount: Number(row.salary_amount), effective_from: row.effective_from });
      histByStaff.set(row.staff_id, arr);
    }

    // Map "October 2025" → first-of-month Date. We pre-compute a parser so
    // each row doesn't pay the locale-parse cost.
    const monthLabelToDate = (label: string): Date => {
      const [m, y] = label.split(' ');
      const idx = ['January','February','March','April','May','June','July','August','September','October','November','December'].indexOf(m);
      return new Date(Number(y), idx >= 0 ? idx : 0, 1);
    };

    return staff.map(s => {
      const months = buildMonths(s.salaryStartDate ?? '', s.joiningDate ?? '', s.relievingDate ?? null);
      const sHist = histByStaff.get(s.id) ?? [];
      return {
        staff: s,
        months: months.map(m => {
          const matches = payRows.filter(r => r.staff_id === s.id && r.month === m);
          const paid = matches.reduce((a, r) => a + Number(r.amount), 0);
          const last = matches.sort((a, b) => b.paid_at.localeCompare(a.paid_at))[0];
          const due = effectiveSalaryAt(monthLabelToDate(m), sHist, s.salary);
          return {
            month: m,
            due,
            paid,
            lastPaidAt: last?.paid_at ?? null,
            note: last?.note ?? '',
          };
        }),
      };
    });
  },
};
