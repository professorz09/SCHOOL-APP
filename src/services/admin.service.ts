import { AdminUser, CreateAdminInput } from '../types/admin.types';

const MOCK_ADMINS: AdminUser[] = [
  {
    id: 'a1', adminId: 'SA-001', name: 'Aryan Kapoor', email: 'admin@edugrow.in', phone: '+91 98000 00001',
    role: 'SUPER_ADMIN', status: 'ACTIVE', schoolId: null, schoolName: null,
    createdAt: '2022-01-01', lastLogin: '2025-04-26 09:42 AM',
    createdAccounts: [],
  },
  {
    id: 'a2', adminId: 'PRN-DPS01', name: 'Dr. Rajesh Kumar', email: 'principal@dps.edu.in', phone: '+91 91234 56780',
    role: 'PRINCIPAL', status: 'ACTIVE', schoolId: 's1', schoolName: 'Delhi Public School',
    createdAt: '2023-04-01', lastLogin: '2025-04-26 08:15 AM',
    createdAccounts: [
      { id: 'TCH-841', name: 'Aarti Desai', role: 'Teacher', email: 'aarti@dps.edu.in' },
      { id: 'STF-102', name: 'Sanjay Gupta', role: 'Accountant', email: 'sanjay@dps.edu.in' },
      { id: 'TCH-842', name: 'Priya Singh', role: 'Teacher', email: 'priya@dps.edu.in' },
    ],
  },
  {
    id: 'a3', adminId: 'PRN-GWH02', name: 'Vikram Singh', email: 'principal@greenwood.edu.in', phone: '+91 98765 11223',
    role: 'PRINCIPAL', status: 'ACTIVE', schoolId: 's2', schoolName: 'Greenwood High School',
    createdAt: '2023-06-15', lastLogin: '2025-04-25 06:30 PM',
    createdAccounts: [
      { id: 'TCH-722', name: 'Meera Reddy', role: 'Teacher', email: 'meera@greenwood.edu.in' },
    ],
  },
  {
    id: 'a4', adminId: 'PRN-SVA03', name: 'Anjali Sharma', email: 'principal@sunrisevalley.edu.in', phone: '+91 94567 89012',
    role: 'PRINCIPAL', status: 'ACTIVE', schoolId: 's3', schoolName: 'Sunrise Valley Academy',
    createdAt: '2023-08-01', lastLogin: '2025-04-24 11:00 AM',
    createdAccounts: [],
  },
  {
    id: 'a5', adminId: 'PRN-SMC04', name: "Sr. Catherine D'Souza", email: 'principal@stmarys.edu.in', phone: '+91 99876 54321',
    role: 'PRINCIPAL', status: 'ACTIVE', schoolId: 's4', schoolName: "St. Mary's Convent",
    createdAt: '2022-11-10', lastLogin: '2025-04-26 07:50 AM',
    createdAccounts: [
      { id: 'TCH-501', name: 'Fr. Joseph', role: 'Teacher', email: 'joseph@stmarys.edu.in' },
    ],
  },
  {
    id: 'a6', adminId: 'PRN-HIS05', name: 'Ravi Teja Naidu', email: 'principal@heritage.edu.in', phone: '+91 98765 22334',
    role: 'PRINCIPAL', status: 'INACTIVE', schoolId: 's5', schoolName: 'Heritage International School',
    createdAt: '2023-03-20', lastLogin: '2025-04-10 02:15 PM',
    createdAccounts: [],
  },
];

let _db: AdminUser[] = [...MOCK_ADMINS];

export const adminService = {
  async getAll(): Promise<AdminUser[]> {
    return [..._db];
  },

  async getById(id: string): Promise<AdminUser | null> {
    return _db.find(a => a.id === id) ?? null;
  },

  async create(input: CreateAdminInput): Promise<AdminUser> {
    const rolePrefix = input.role === 'SUPER_ADMIN' ? 'SA' : 'PRN';
    const admin: AdminUser = {
      id: `a${Date.now()}`,
      adminId: `${rolePrefix}-${String(Date.now()).slice(-4)}`,
      name: input.name,
      email: input.email,
      phone: input.phone,
      role: input.role,
      status: 'ACTIVE',
      schoolId: input.schoolId ?? null,
      schoolName: null,
      createdAt: new Date().toISOString().split('T')[0],
      lastLogin: 'Never',
      createdAccounts: [],
    };
    _db = [..._db, admin];
    return admin;
  },

  async updateStatus(id: string, status: AdminUser['status']): Promise<void> {
    _db = _db.map(a => a.id === id ? { ...a, status } : a);
  },

  async delete(id: string): Promise<void> {
    _db = _db.filter(a => a.id !== id);
  },
};
