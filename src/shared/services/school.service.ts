// Supabase-backed school service.
// Writes (create / soft-delete) flow through /api/admin/* because they need
// the service-role key to mint principal Auth accounts.

import { supabase } from '@/shared/lib/supabase';
import { adminApi } from '@/shared/lib/adminApi';
import { logAudit } from '@/shared/lib/audit';
import {
  School,
  CreateSchoolInput,
  UpdateSchoolInput,
} from '@/shared/types/school.types';
import { SchoolStatus, BillingPlan, PaymentStatus, PLAN_PRICES } from '@/shared/config/constants';

const SCHOOL_FIELDS = [
  'id', 'name', 'code', 'location', 'address', 'phone',
  'principal_name', 'principal_email', 'principal_phone',
  'status', 'plan', 'student_count', 'teacher_count',
  'payment_status', 'payment_start_date', 'created_at',
].join(', ');

interface SchoolRow {
  id: string; name: string; code: string;
  location: string | null; address: string | null; phone: string | null;
  principal_name: string | null; principal_email: string | null; principal_phone: string | null;
  status: string; plan: string;
  student_count: number; teacher_count: number;
  payment_status: string; payment_start_date: string | null;
  created_at: string;
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
  };
}

export const schoolService = {
  async getAll(): Promise<School[]> {
    const { data, error } = await supabase
      .from('schools')
      .select(SCHOOL_FIELDS)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => rowToSchool(r as unknown as SchoolRow));
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
