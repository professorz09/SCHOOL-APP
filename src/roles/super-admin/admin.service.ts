// Supabase-backed admin service. Manages SUPER_ADMIN + PRINCIPAL accounts.
// Mutations that need a fresh auth.users row go through /api/admin/*.

import { supabase } from '@/lib/supabase';
import { adminApi } from '@/lib/adminApi';
import { AdminUser, CreateAdminInput, AdminRole, AdminStatus } from '@/shared/types/admin.types';

interface UserRow {
  id: string;
  mobile_number: string;
  role: string;
  name: string;
  email: string | null;
  school_id: string | null;
  is_active: boolean;
  last_login: string | null;
  created_at: string;
  school: { name: string | null } | null;
}

interface ConnectedRow {
  id: string;
  name: string;
  role: string;
  email: string | null;
  mobile_number: string;
}

const ADMIN_ROLES = ['SUPER_ADMIN', 'PRINCIPAL'] as const;

function shortAdminId(id: string, role: string, schoolCode?: string | null): string {
  // SA-XXXX or PRN-CODE / PRN-XXXX (last 4 of UUID hex).
  const tail = id.replace(/-/g, '').slice(-4).toUpperCase();
  if (role === 'SUPER_ADMIN') return `SA-${tail}`;
  if (schoolCode) return `PRN-${schoolCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)}`;
  return `PRN-${tail}`;
}

function fmtTimestamp(ts: string | null): string {
  if (!ts) return 'Never';
  return new Date(ts).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

async function buildAdmin(row: UserRow, schoolCode?: string | null): Promise<AdminUser> {
  let createdAccounts: AdminUser['createdAccounts'] = [];
  if (row.role === 'PRINCIPAL' && row.school_id) {
    const { data: members } = await supabase
      .from('users')
      .select('id, name, role, email, mobile_number')
      .eq('school_id', row.school_id)
      .neq('role', 'SUPER_ADMIN')
      .neq('id', row.id)
      .eq('is_active', true)
      .limit(50);
    createdAccounts = ((members ?? []) as ConnectedRow[]).map((m) => ({
      id: m.mobile_number,
      name: m.name,
      role: m.role,
      email: m.email ?? '',
    }));
  }
  return {
    id: row.id,
    adminId: shortAdminId(row.id, row.role, schoolCode),
    name: row.name,
    email: row.email ?? '',
    phone: row.mobile_number,
    role: row.role as AdminRole,
    status: (row.is_active ? 'ACTIVE' : 'INACTIVE') as AdminStatus,
    schoolId: row.school_id,
    schoolName: row.school?.name ?? null,
    createdAt: (row.created_at ?? '').slice(0, 10),
    lastLogin: fmtTimestamp(row.last_login),
    createdAccounts,
  };
}

export const adminService = {
  async getAll(): Promise<AdminUser[]> {
    const { data, error } = await supabase
      .from('users')
      .select('id, mobile_number, role, name, email, school_id, is_active, last_login, created_at, school:schools(name, code)')
      .in('role', [...ADMIN_ROLES])
      .order('role', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as unknown as Array<UserRow & { school: { name: string | null; code: string | null } | null }>;
    const result: AdminUser[] = [];
    for (const r of rows) {
      result.push(await buildAdmin(r, r.school?.code ?? null));
    }
    return result;
  },

  async getById(id: string): Promise<AdminUser | null> {
    const { data, error } = await supabase
      .from('users')
      .select('id, mobile_number, role, name, email, school_id, is_active, last_login, created_at, school:schools(name, code)')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const row = data as unknown as UserRow & { school: { name: string | null; code: string | null } | null };
    return buildAdmin(row, row.school?.code ?? null);
  },

  async create(input: CreateAdminInput): Promise<AdminUser> {
    if (input.role !== 'SUPER_ADMIN') {
      throw new Error(
        'Principal accounts are created automatically from the Schools onboarding flow.',
      );
    }
    const cleanedMobile = (input.phone || '').replace(/\D/g, '').slice(-10);
    if (!/^\d{10}$/.test(cleanedMobile)) {
      throw new Error('Phone must contain a valid 10-digit mobile number');
    }
    if (!input.password || input.password.length < 6) {
      throw new Error('Password must be at least 6 characters');
    }

    const { user } = await adminApi.createSuperAdmin({
      name: input.name,
      mobileNumber: cleanedMobile,
      password: input.password,
      email: input.email,
    });

    return buildAdmin(user as UserRow, null);
  },

  async updateStatus(id: string, status: AdminStatus): Promise<void> {
    const isActive = status === 'ACTIVE';
    await adminApi.setUserActive(id, isActive);
  },

  async resetPassword(id: string, newPassword: string): Promise<void> {
    await adminApi.resetPassword(id, newPassword);
  },

  async delete(id: string): Promise<void> {
    // Hard delete on users is blocked at the DB layer; we deactivate instead.
    await adminApi.setUserActive(id, false);
  },
};
