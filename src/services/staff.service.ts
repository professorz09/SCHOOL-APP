// Supabase-backed staff service. Add-staff creates a Supabase Auth user via
// admin-api (default password = mobile, must change on first login). Suspend
// only flips status — never hard-delete (DB triggers enforce permanent ID).

import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { adminApi } from '../lib/adminApi';
import { logAudit } from '../lib/audit';
import type { StaffMember, SalaryPayment, StaffRole, StaffStatus } from '../types/principal.types';

function getSchoolId(): string {
  const id = useAuthStore.getState().session?.schoolId;
  if (!id) throw new Error('No school in session');
  return id;
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
  status: string;
  address: string | null;
  photo: string | null;
  is_active: boolean;
}

const STAFF_FIELDS = 'id, user_id, name, role, subject, phone, email, aadhaar_no, salary, joining_date, status, address, photo, is_active';

interface SalaryRow {
  id: string;
  staff_id: string;
  month: string;
  amount: number;
  paid_at: string;
  transaction_id: string | null;
  note: string | null;
}

function rowToSalary(r: SalaryRow): SalaryPayment {
  return {
    id: r.id,
    month: r.month,
    amount: Number(r.amount),
    paidAt: r.paid_at,
    transactionId: r.transaction_id ?? '',
    note: r.note ?? '',
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
    status: (r.status as StaffStatus) ?? 'ACTIVE',
    assignedClasses,
    address: r.address ?? '',
    photo: r.photo ?? '',
    salaryHistory,
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
      .order('created_at', { ascending: false });
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

    // Step 2: insert staff row.
    const payload = {
      school_id: schoolId,
      user_id: userId,
      name: input.name,
      role: input.role,
      subject: input.subject || null,
      phone: input.phone || null,
      email: input.email || null,
      aadhaar_no: input.aadhaarNo || null,
      salary: input.salary,
      joining_date: input.joiningDate || null,
      status: input.status,
      address: input.address || null,
      photo: input.photo || null,
      is_active: true,
    };
    const { data, error } = await supabase
      .from('staff').insert(payload).select(STAFF_FIELDS).single();
    if (error) throw new Error(error.message);
    const row = data as StaffRow;

    // Step 3: insert class assignments (active year only).
    if (input.assignedClasses?.length) {
      const { data: ay } = await supabase
        .from('academic_years').select('id')
        .eq('school_id', schoolId).eq('is_active', true).maybeSingle();
      const ayId = (ay as { id: string } | null)?.id;
      const rows = input.assignedClasses.map(cls => ({
        school_id: schoolId, staff_id: row.id, academic_year_id: ayId ?? null, class_name: cls,
      }));
      const { error: assignErr } = await supabase.from('staff_class_assignments').insert(rows);
      if (assignErr) throw new Error(assignErr.message);
    }

    await logAudit('staff_created', 'staff', row.id, { role: input.role, name: input.name });
    return rowToStaff(row, input.assignedClasses ?? []);
  },

  async update(id: string, input: Partial<StaffMember>): Promise<StaffMember> {
    const schoolId = getSchoolId();
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.name !== undefined) patch.name = input.name;
    if (input.role !== undefined) patch.role = input.role;
    if (input.subject !== undefined) patch.subject = input.subject;
    if (input.phone !== undefined) patch.phone = input.phone;
    if (input.email !== undefined) patch.email = input.email;
    if (input.aadhaarNo !== undefined) patch.aadhaar_no = input.aadhaarNo;
    if (input.salary !== undefined) patch.salary = input.salary;
    if (input.joiningDate !== undefined) patch.joining_date = input.joiningDate;
    if (input.status !== undefined) patch.status = input.status;
    if (input.address !== undefined) patch.address = input.address;
    if (input.photo !== undefined) patch.photo = input.photo;

    const { error } = await supabase.from('staff').update(patch).eq('id', id).eq('school_id', schoolId);
    if (error) throw new Error(error.message);

    if (input.assignedClasses) {
      // Require an active academic year. Without one, we cannot deterministically
      // scope the delete-and-replace (the previous dummy-UUID guard left stale
      // NULL-year rows, causing duplicate/drifted assignments).
      const { data: ay, error: ayErr } = await supabase
        .from('academic_years').select('id')
        .eq('school_id', schoolId).eq('is_active', true).limit(1);
      if (ayErr) throw new Error(`Active-year lookup failed: ${ayErr.message}`);
      const ayId = ((ay ?? [])[0] as { id: string } | undefined)?.id;
      if (!ayId) throw new Error('No active academic year — open Settings → Academic Year and activate one before assigning classes.');

      // Atomic-style replace within the active year: clear then insert.
      const { error: delErr } = await supabase.from('staff_class_assignments')
        .delete().eq('school_id', schoolId).eq('staff_id', id).eq('academic_year_id', ayId);
      if (delErr) throw new Error(`Clearing old assignments failed: ${delErr.message}`);
      if (input.assignedClasses.length) {
        const rows = input.assignedClasses.map(cls => ({
          school_id: schoolId, staff_id: id, academic_year_id: ayId, class_name: cls,
        }));
        const { error: insErr } = await supabase.from('staff_class_assignments').insert(rows);
        if (insErr) throw new Error(`Assigning classes failed: ${insErr.message}`);
      }
    }

    await logAudit('staff_updated', 'staff', id, { fields: Object.keys(patch) });
    const fresh = await this.getById(id);
    if (!fresh) throw new Error('Staff not found after update');
    return fresh;
  },

  async suspend(id: string): Promise<StaffMember> {
    return this.update(id, { status: 'SUSPENDED' });
  },

  async reinstate(id: string): Promise<StaffMember> {
    return this.update(id, { status: 'ACTIVE' });
  },

  /**
   * "Delete" → soft delete via is_active=false + deactivate auth user.
   * Hard delete is blocked by DB trigger on permanent identity tables.
   */
  async delete(id: string): Promise<void> {
    const schoolId = getSchoolId();
    const { data: row, error: rErr } = await supabase
      .from('staff').select('user_id').eq('id', id).eq('school_id', schoolId).maybeSingle();
    if (rErr) throw new Error(rErr.message);
    const userId = (row as { user_id: string | null } | null)?.user_id ?? null;

    const { error } = await supabase.from('staff').update({
      is_active: false,
      status: 'SUSPENDED',
      updated_at: new Date().toISOString(),
    }).eq('id', id).eq('school_id', schoolId);
    if (error) throw new Error(error.message);

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
   * stays consistent.
   */
  async recordSalaryPayment(
    staffId: string, month: string, amount: number, note: string,
  ): Promise<StaffMember> {
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Amount must be positive');
    const { error } = await supabase.rpc('record_salary_payment', {
      p_staff_id: staffId, p_month: month, p_amount: amount, p_note: note || null,
    });
    if (error) throw new Error(error.message);
    const fresh = await this.getById(staffId);
    if (!fresh) throw new Error('Staff not found after pay');
    return fresh;
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

    // Build month list from max(joiningDate, AY-start) → min(today, AY-end).
    const fmt = (d: Date) => d.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
    const buildMonths = (joinIso: string): string[] => {
      const join = joinIso ? new Date(joinIso) : start;
      const from = join > start ? join : start;
      const to = today < end ? today : end;
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

    return staff.map(s => {
      const months = buildMonths(s.joiningDate ?? '');
      return {
        staff: s,
        months: months.map(m => {
          const matches = payRows.filter(r => r.staff_id === s.id && r.month === m);
          const paid = matches.reduce((a, r) => a + Number(r.amount), 0);
          const last = matches.sort((a, b) => b.paid_at.localeCompare(a.paid_at))[0];
          return {
            month: m,
            due: s.salary,
            paid,
            lastPaidAt: last?.paid_at ?? null,
            note: last?.note ?? '',
          };
        }),
      };
    });
  },
};
