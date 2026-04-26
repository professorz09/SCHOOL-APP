export type AdminRole = 'SUPER_ADMIN' | 'PRINCIPAL' | 'VICE_PRINCIPAL';
export type AdminStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

export interface ConnectedAccount {
  id: string;
  name: string;
  role: string;
  email: string;
}

export interface AdminUser {
  id: string;
  adminId: string;
  name: string;
  email: string;
  phone: string;
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
  phone: string;
  role: AdminRole;
  schoolId?: string;
  password: string;
};
