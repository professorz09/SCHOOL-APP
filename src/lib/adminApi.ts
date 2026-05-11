// Client wrapper for /api/admin/* endpoints exposed by vite-plugins/admin-api.ts.
// Always attaches the current Supabase access token.

import { supabase } from '@/lib/supabase';

async function authedPost<T>(path: string, body: unknown): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg: string;
    try { msg = (await res.json()).error ?? res.statusText; }
    catch { msg = res.statusText; }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export interface OnboardSchoolPayload {
  school: {
    name: string; code: string; location: string; address: string; phone: string;
    principalName: string; principalEmail: string; principalPhone: string;
    status: string; plan: string;
    paymentStartDate: string; annualAmount: number;
  };
  principalMobile: string;
  principalPassword: string;
}

// Mirror of the columns returned by the schools table.
export interface SchoolRowDto {
  id: string;
  name: string;
  code: string;
  location: string | null;
  address: string | null;
  phone: string | null;
  principal_name: string | null;
  principal_email: string | null;
  principal_phone: string | null;
  status: string;
  plan: string;
  payment_status: string;
  payment_start_date: string | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuthUserDto {
  id: string;
  email: string | null;
}

export interface OnboardSchoolResponse {
  school: SchoolRowDto;
  principalUserId: string;
}

export interface CreateSuperAdminResponse {
  user: AuthUserDto;
}

export interface OkResponse {
  ok: true;
}

export const adminApi = {
  onboardSchool(payload: OnboardSchoolPayload) {
    return authedPost<OnboardSchoolResponse>('/api/admin/onboard-school', payload);
  },
  createSuperAdmin(payload: { name: string; mobileNumber: string; password: string; email?: string }) {
    return authedPost<CreateSuperAdminResponse>('/api/admin/create-super-admin', payload);
  },
  setUserActive(userId: string, isActive: boolean) {
    return authedPost<OkResponse>('/api/admin/set-user-active', { userId, isActive });
  },
  resetPassword(userId: string, newPassword: string) {
    return authedPost<OkResponse>('/api/admin/reset-password', { userId, newPassword });
  },
  deleteSchool(schoolId: string) {
    return authedPost<OkResponse>('/api/admin/delete-school', { schoolId });
  },
  // Principal-side calls. Default password = mobile (forced change on first login).
  createSchoolUser(payload: {
    mobile: string; name: string;
    role: 'TEACHER' | 'DRIVER' | 'PARENT';
    password?: string; email?: string;
  }) {
    return authedPost<{ userId: string; reused: boolean }>(
      '/api/admin/create-school-user', payload,
    );
  },
  linkParentStudent(payload: { parentUserId: string; studentId: string; relation: string }) {
    return authedPost<OkResponse>('/api/admin/link-parent-student', payload);
  },
  resetSchoolUserPassword(userId: string, newPassword: string) {
    return authedPost<OkResponse>('/api/admin/reset-school-user-password', { userId, newPassword });
  },
  setSchoolUserActive(userId: string, isActive: boolean) {
    return authedPost<OkResponse>('/api/admin/set-school-user-active', { userId, isActive });
  },

  /** Generate a one-time temp password for the active principal of a
   *  given school. The temp password is returned in the response and
   *  never stored anywhere — surface it to the super-admin once and
   *  hand it over personally. Subject to a 24-hour cooldown per school.
   *
   *  This endpoint goes through the Express server (server/routes/
   *  admin-schools.ts), which wraps responses as { ok, data } via the
   *  shared `ok()` helper. The other adminApi calls hit the legacy Vite
   *  plugin (vite-plugins/admin-api.ts) which returns flat shapes — so
   *  we unwrap `.data` here instead of changing the server contract. */
  async resetPrincipalPassword(schoolId: string) {
    const wrapped = await authedPost<{
      ok: true;
      data: { ok: true; name: string; mobile: string; tempPassword: string };
    }>(`/api/admin/schools/${schoolId}/reset-principal-password`, {});
    return wrapped.data;
  },

  // ─── New simple billing (per-AY installments) ────────────────────────────
  async listBillingInstallments(schoolId: string) {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error('Not authenticated');
    const res = await fetch(`/api/admin/schools/${schoolId}/billing-installments`, {
      headers: { 'authorization': `Bearer ${token}` },
    });
    if (!res.ok) {
      let msg: string;
      try { msg = (await res.json()).error ?? res.statusText; }
      catch { msg = res.statusText; }
      throw new Error(msg);
    }
    const wrapped = await res.json() as {
      ok: true;
      data: {
        academicYears: { id: string; label: string; start_date: string; end_date: string; is_active: boolean; is_closed: boolean }[];
        installments:  { id: string; academic_year_id: string; name: string; description: string | null; amount: number; due_date: string; paid_amount: number; paid_at: string | null; paid_method: string | null; paid_note: string | null; created_at: string }[];
      };
    };
    return wrapped.data;
  },

  async createBillingInstallment(
    schoolId: string,
    body: { academicYearId: string; name: string; amount: number; dueDate: string; description?: string },
  ) {
    const wrapped = await authedPost<{ ok: true; data: { id: string; academic_year_id: string; name: string; description: string | null; amount: number; due_date: string; paid_amount: number; paid_at: string | null; paid_method: string | null; paid_note: string | null; created_at: string } }>(
      `/api/admin/schools/${schoolId}/billing-installments`, body,
    );
    return wrapped.data;
  },

  async payBillingInstallment(
    schoolId: string, installmentId: string,
    body: { amount: number; method?: string; note?: string },
  ) {
    const wrapped = await authedPost<{ ok: true; data: { id: string; academic_year_id: string; name: string; description: string | null; amount: number; due_date: string; paid_amount: number; paid_at: string | null; paid_method: string | null; paid_note: string | null; created_at: string } }>(
      `/api/admin/schools/${schoolId}/billing-installments/${installmentId}/pay`, body,
    );
    return wrapped.data;
  },

  async deleteBillingInstallment(schoolId: string, installmentId: string) {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error('Not authenticated');
    const res = await fetch(`/api/admin/schools/${schoolId}/billing-installments/${installmentId}`, {
      method: 'DELETE',
      headers: { 'authorization': `Bearer ${token}` },
    });
    if (!res.ok) {
      let msg: string;
      try { msg = (await res.json()).error ?? res.statusText; }
      catch { msg = res.statusText; }
      throw new Error(msg);
    }
  },
};
