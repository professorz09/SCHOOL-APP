// Supabase-backed school service.
// Writes (create / soft-delete) flow through /api/admin/* because they need
// the service-role key to mint principal Auth accounts.

import { supabase } from '../lib/supabase';
import { adminApi } from '../lib/adminApi';
import { logAudit } from '../lib/audit';
import {
  School,
  CreateSchoolInput,
  UpdateSchoolInput,
} from '../types/school.types';
import { SchoolStatus, BillingPlan, PaymentStatus, PLAN_PRICES } from '../config/constants';

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
    if (input.code !== undefined) updates.code = input.code;
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
};
