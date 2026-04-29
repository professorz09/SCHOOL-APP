// Admin role/status types — aligned with the DB schema:
//   public.users.role  CHECK ∈ {SUPER_ADMIN,PRINCIPAL,TEACHER,DRIVER,PARENT,STUDENT}
//   public.users.is_active boolean (no SUSPENDED state)
//
// For the Super-Admin module we only surface SUPER_ADMIN + PRINCIPAL rows.

export type AdminRole = 'SUPER_ADMIN' | 'PRINCIPAL';
export type AdminStatus = 'ACTIVE' | 'INACTIVE';

export interface ConnectedAccount {
  id: string;        // mobile number (acts as a stable display id)
  name: string;
  role: string;
  email: string;
}

export interface AdminUser {
  id: string;
  adminId: string;          // human-friendly short code, eg SA-XXXX, PRN-DPS01
  name: string;
  email: string;
  phone: string;            // mobile_number (10 digits)
  role: AdminRole;
  status: AdminStatus;
  schoolId: string | null;
  schoolName: string | null;
  createdAt: string;
  lastLogin: string;
  createdAccounts: ConnectedAccount[];
}

export type CreateAdminInput = {
  name: string;
  email: string;
  phone: string;            // accepts formatted; service trims to 10 digits
  role: AdminRole;
  schoolId?: string;
  password: string;
};
