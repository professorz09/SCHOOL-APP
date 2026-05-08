// Supabase-backed school service.
// Writes (create / soft-delete) flow through /api/admin/* because they need
// the service-role key to mint principal Auth accounts.

import { supabase } from '@/lib/supabase';
import { adminApi } from '@/lib/adminApi';
import { logAudit } from '@/lib/audit';
import {
  School,
  CreateSchoolInput,
  UpdateSchoolInput,
} from '@/roles/super-admin/school.types';
import { SchoolStatus, BillingPlan, PaymentStatus, PLAN_PRICES } from '@/shared/config/constants';

const SCHOOL_FIELDS = [
  'id', 'name', 'code', 'location', 'address', 'phone',
  'principal_name', 'principal_email', 'principal_phone',
  'status', 'plan', 'student_count', 'teacher_count',
  'payment_status', 'payment_start_date', 'created_at',
  'new_year_creation_enabled',
  'max_students', 'max_staff',
].join(', ');

interface SchoolRow {
  id: string; name: string; code: string;
  location: string | null; address: string | null; phone: string | null;
  principal_name: string | null; principal_email: string | null; principal_phone: string | null;
  status: string; plan: string;
  student_count: number; teacher_count: number;
  payment_status: string; payment_start_date: string | null;
  created_at: string;
  new_year_creation_enabled: boolean | null;
  max_students: number | null;
  max_staff:    number | null;
}

function rowToSchool(r: SchoolRow): School {
  return {
    id: r.id,
    name: r.name,
    code: r.code,
    location: r.location ?? '',
    address: r.address ?? '',
    phone: r.phone ?? '',
    principalName: r.principal_name ?? '',
    principalEmail: r.principal_email ?? '',
    principalPhone: r.principal_phone ?? '',
    status: (r.status as SchoolStatus) ?? SchoolStatus.ACTIVE,
    plan: (r.plan as BillingPlan) ?? BillingPlan.BASIC,
    studentCount: r.student_count ?? 0,
    teacherCount: r.teacher_count ?? 0,
    paymentStatus: (r.payment_status as PaymentStatus) ?? PaymentStatus.PENDING,
    paymentStartDate: r.payment_start_date ?? '',
    createdAt: (r.created_at ?? '').slice(0, 10),
    academicYears: [],
    newYearCreationEnabled: !!r.new_year_creation_enabled,
    maxStudents: r.max_students,
    maxStaff:    r.max_staff,
  };
}

export const schoolService = {
  async getAll(): Promise<School[]> {
    const { data, error } = await supabase
      .from('schools')
      .select(SCHOOL_FIELDS)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      // Safety cap so a runaway tenant base doesn't blow up the SuperAdmin
      // Schools view in one shot. Above 500 schools the consumer should
      // switch to getList() with offset/limit pagination.
      .limit(500);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => rowToSchool(r as unknown as SchoolRow));
  },

  /** Server-paginated schools list — slim columns, optional search +
   *  status filter. Use this when the SuperAdmin tenant base grows past
   *  ~100 schools. Returns total/hasMore so the caller can render a
   *  "Load more · N remaining" CTA without a separate count query. */
  async getList(opts: {
    offset?: number; limit?: number;
    search?: string; status?: string;
  } = {}): Promise<{
    items: School[]; total: number; hasMore: boolean; nextOffset: number;
  }> {
    const offset = Math.max(0, opts.offset ?? 0);
    const limit  = Math.max(1, Math.min(200, opts.limit ?? 50));
    let q = supabase
      .from('schools')
      .select(SCHOOL_FIELDS, { count: 'exact' })
      .eq('is_deleted', false);
    if (opts.status) q = q.eq('status', opts.status);
    if (opts.search?.trim()) {
      const s = opts.search.trim().replace(/[%_]/g, ch => `\\${ch}`);
      // Match against the most-search-friendly columns. PostgREST `or`
      // handles each clause as ILIKE-against-pattern.
      q = q.or(`name.ilike.%${s}%,code.ilike.%${s}%,location.ilike.%${s}%,principal_name.ilike.%${s}%`);
    }
    const { data, count, error } = await q
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw new Error(error.message);
    const items = (data ?? []).map(r => rowToSchool(r as unknown as SchoolRow));
    const total = count ?? items.length;
    return {
      items,
      total,
      hasMore:    offset + items.length < total,
      nextOffset: offset + items.length,
    };
  },

  async getById(id: string): Promise<School | null> {
    const { data, error } = await supabase
      .from('schools')
      .select(SCHOOL_FIELDS)
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? rowToSchool(data as unknown as SchoolRow) : null;
  },

  async create(input: CreateSchoolInput): Promise<School> {
    const cleanPhone = (input.principalPhone || '').replace(/\D/g, '').slice(-10);
    if (!/^\d{10}$/.test(cleanPhone)) {
      throw new Error('Principal phone must contain a valid 10-digit number');
    }
    if (!input.password || input.password.length < 6) {
      throw new Error('Password must be at least 6 characters');
    }
    const annual = PLAN_PRICES[input.plan as BillingPlan] ?? 0;
    if (annual <= 0) throw new Error('Invalid plan / annual amount');

    const result = await adminApi.onboardSchool({
      school: {
        name: input.name,
        code: input.code,
        location: input.location,
        address: input.address,
        phone: input.phone,
        principalName: input.principalName,
        principalEmail: input.principalEmail,
        principalPhone: input.principalPhone,
        status: input.status,
        plan: input.plan,
        paymentStartDate: input.paymentStartDate,
        annualAmount: annual,
      },
      principalMobile: cleanPhone,
      principalPassword: input.password,
    });
    return rowToSchool(result.school as unknown as SchoolRow);
  },

  async update(id: string, input: UpdateSchoolInput): Promise<School> {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.name !== undefined) updates.name = input.name;
    // School code is immutable once a school is onboarded — see spec
    // gap audit item 1.1. We deliberately drop `input.code` here even if
    // the caller passes it, so a stale form value can never overwrite it.
    if (input.location !== undefined) updates.location = input.location;
    if (input.address !== undefined) updates.address = input.address;
    if (input.phone !== undefined) updates.phone = input.phone;
    if (input.principalName !== undefined) updates.principal_name = input.principalName;
    if (input.principalEmail !== undefined) updates.principal_email = input.principalEmail;
    if (input.principalPhone !== undefined) updates.principal_phone = input.principalPhone;
    if (input.status !== undefined) updates.status = input.status;
    if (input.plan !== undefined) updates.plan = input.plan;
    if (input.paymentStartDate !== undefined) updates.payment_start_date = input.paymentStartDate;
    if (input.newYearCreationEnabled !== undefined) updates.new_year_creation_enabled = input.newYearCreationEnabled;
    if (input.maxStudents !== undefined) updates.max_students = input.maxStudents;
    if (input.maxStaff    !== undefined) updates.max_staff    = input.maxStaff;

    const { data, error } = await supabase
      .from('schools')
      .update(updates)
      .eq('id', id)
      .select(SCHOOL_FIELDS)
      .single();
    if (error) throw new Error(error.message);

    const row = data as unknown as SchoolRow;
    await logAudit('update_school', 'school', id, {
      changes: Object.keys(updates),
      name: row.name,
    });
    return rowToSchool(row);
  },

  async delete(id: string): Promise<void> {
    // Soft-delete: status flip + is_deleted=true. The cascade trigger on
    // schools deactivates dependent users / students / staff rows.
    await adminApi.deleteSchool(id);
  },

  // Super-admin views — query any school directly, bypassing the per-session
  // school_id restriction used by principal-facing services.
  async getSchoolStaff(schoolId: string): Promise<Array<{
    id: string; name: string; role: string; subject: string | null;
    phone: string; email: string | null; status: string; salary: number;
  }>> {
    const { data, error } = await supabase
      .from('staff')
      .select('id, name, role, subject, phone, email, status, salary')
      .eq('school_id', schoolId)
      .eq('is_active', true)
      .order('name');
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      id: string; name: string; role: string; subject: string | null;
      phone: string; email: string | null; status: string; salary: number;
    }>;
  },

  // Aggregated, real-time overview for the super-admin school detail page.
  // Replaces the static `studentCount` / `teacherCount` columns and the
  // empty `academicYears[]` placeholder with live counts pulled from each
  // domain table. Uses `head: true` count queries where possible to avoid
  // pulling rows.
  async getSchoolOverview(schoolId: string): Promise<{
    totalStudents: number;
    rteStudents: number;
    totalStaff: number;
    totalTeachers: number;
    monthlySalaryCost: number;
    feeCollectedThisMonth: number;
    feeCollectedThisYear: number;
    expensesThisMonth: number;
    expensesThisYear: number;
    salaryPaidThisMonth: number;
    classBreakdown: Array<{ className: string; section: string; count: number }>;
    activeAYLabel: string | null;
  }> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);

    // Resolve the active academic year FIRST so the year-scoped totals use
    // the AY start date, not the calendar Jan-1. School operators think in
    // academic years (Apr→Mar in India); the old calendar-year cutoff
    // showed an incomplete number until April every year and double-counted
    // April–Dec from the previous AY.
    const { data: ayDataRaw } = await supabase
      .from('academic_years')
      .select('id, label, start_date')
      .eq('school_id', schoolId).eq('is_active', true).maybeSingle();
    const ay = ayDataRaw as { id: string; label: string; start_date: string | null } | null;
    const startOfYear = ay?.start_date
      ?? new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);

    const [stuCount, staffRows, payMonth, payYear, expMonth, expYear, salMonth] = await Promise.all([
      supabase.from('students').select('id', { count: 'exact', head: true })
        .eq('school_id', schoolId).eq('is_active', true),
      supabase.from('staff').select('role, salary, status')
        .eq('school_id', schoolId).eq('is_active', true),
      supabase.from('payment_records').select('amount')
        .eq('school_id', schoolId).is('reversed_at', null).gte('date', startOfMonth),
      supabase.from('payment_records').select('amount')
        .eq('school_id', schoolId).is('reversed_at', null).gte('date', startOfYear),
      supabase.from('expenses').select('amount')
        .eq('school_id', schoolId).gte('date', startOfMonth),
      supabase.from('expenses').select('amount')
        .eq('school_id', schoolId).gte('date', startOfYear),
      supabase.from('salary_payments').select('amount')
        .eq('school_id', schoolId).gte('paid_at', startOfMonth),
    ]);

    const totalStudents = stuCount.count ?? 0;

    let rteStudents = 0;
    let classBreakdown: Array<{ className: string; section: string; count: number }> = [];
    if (ay?.id) {
      const { data: arData } = await supabase
        .from('student_academic_records')
        .select('class_name, section, is_rte')
        .eq('academic_year_id', ay.id);
      const arr = (arData ?? []) as Array<{ class_name: string; section: string; is_rte: boolean }>;
      rteStudents = arr.filter(r => r.is_rte).length;
      const map = new Map<string, { className: string; section: string; count: number }>();
      for (const r of arr) {
        const key = `${r.class_name}|${r.section}`;
        const ex = map.get(key);
        if (ex) ex.count++;
        else map.set(key, { className: r.class_name, section: r.section, count: 1 });
      }
      classBreakdown = [...map.values()].sort((a, b) =>
        (a.className || '').localeCompare(b.className || '', undefined, { numeric: true })
        || (a.section || '').localeCompare(b.section || ''),
      );
    }

    const staff = (staffRows.data ?? []) as Array<{ role: string; salary: number; status: string }>;
    const totalStaff = staff.length;
    const totalTeachers = staff.filter(s => s.role === 'TEACHER').length;
    const monthlySalaryCost = staff
      .filter(s => s.status !== 'TERMINATED' && s.status !== 'RELIEVED')
      .reduce((sum, s) => sum + (Number(s.salary) || 0), 0);

    const sumAmount = (rows: { data: unknown }) =>
      ((rows.data ?? []) as Array<{ amount: number }>).reduce((s, r) => s + (Number(r.amount) || 0), 0);

    return {
      totalStudents,
      rteStudents,
      totalStaff,
      totalTeachers,
      monthlySalaryCost,
      feeCollectedThisMonth: sumAmount(payMonth),
      feeCollectedThisYear:  sumAmount(payYear),
      expensesThisMonth: sumAmount(expMonth),
      expensesThisYear:  sumAmount(expYear),
      salaryPaidThisMonth: sumAmount(salMonth),
      classBreakdown,
      activeAYLabel: ay?.label ?? null,
    };
  },

  async getSchoolStudents(schoolId: string): Promise<Array<{
    id: string; name: string; admission_no: string;
    father_name: string | null; mother_name: string | null;
    phone: string | null; class_name: string | null; section: string | null;
    roll_no: number | null; is_rte: boolean;
  }>> {
    // Join students with their latest academic record to show class/section.
    const { data: stuData, error: stuErr } = await supabase
      .from('students')
      .select('id, name, admission_no, father_name, mother_name, father_phone')
      .eq('school_id', schoolId)
      .eq('is_active', true)
      .order('name');
    if (stuErr) throw new Error(stuErr.message);
    const stu = (stuData ?? []) as Array<{
      id: string; name: string; admission_no: string;
      father_name: string | null; mother_name: string | null; father_phone: string | null;
    }>;
    if (!stu.length) return [];

    // Get active academic year for this school.
    const { data: ay } = await supabase
      .from('academic_years')
      .select('id')
      .eq('school_id', schoolId)
      .eq('is_active', true)
      .maybeSingle();
    const ayId = (ay as { id: string } | null)?.id ?? null;

    const arMap = new Map<string, { class_name: string; section: string; roll_no: number; is_rte: boolean }>();
    if (ayId && stu.length) {
      const { data: arData } = await supabase
        .from('student_academic_records')
        .select('student_id, class_name, section, roll_no, is_rte')
        .eq('academic_year_id', ayId)
        .in('student_id', stu.map(s => s.id));
      for (const r of ((arData ?? []) as Array<{
        student_id: string; class_name: string; section: string; roll_no: number; is_rte: boolean;
      }>)) {
        arMap.set(r.student_id, r);
      }
    }

    return stu.map(s => {
      const ar = arMap.get(s.id);
      return {
        id: s.id,
        name: s.name,
        admission_no: s.admission_no,
        father_name: s.father_name,
        mother_name: s.mother_name,
        phone: s.father_phone,
        class_name: ar?.class_name ?? null,
        section: ar?.section ?? null,
        roll_no: ar?.roll_no ?? null,
        is_rte: ar?.is_rte ?? false,
      };
    });
  },
};
