// ─── Types ────────────────────────────────────────────────────────────────────

export type UserRole = 'SUPER_ADMIN' | 'PRINCIPAL' | 'PARENT' | 'STUDENT' | 'TEACHER' | 'DRIVER';

export interface ParentUser {
  id: string;
  mobileNumber: string;
  password: string; // hashed in real app
  name: string;
  email: string;
  schoolId: string;
  linkedStudentIds: string[]; // Multiple children
  createdAt: string;
  lastLogin: string | null;
  firstLoginChanged: boolean; // For first login password change
}

export interface PrincipalUser {
  id: string;
  schoolId: string;
  mobileNumber: string;
  password: string;
  email: string;
  createdAt: string;
  lastLogin: string | null;
  firstLoginChanged: boolean;
}

export interface AuthSession {
  userId: string;
  mobileNumber: string;
  role: UserRole;
  schoolId?: string;
  linkedStudentIds?: string[]; // For parents
  name: string;
  email: string;
}

// ─── Seed Data ────────────────────────────────────────────────────────────────

let _parentUsers: ParentUser[] = [
  {
    id: 'parent1',
    mobileNumber: '9876543210',
    password: 'parent123', // demo password
    name: 'Rakesh Sharma',
    email: 'rakesh@example.com',
    schoolId: 'sch1',
    linkedStudentIds: ['student1'],
    createdAt: '2024-03-01',
    lastLogin: null,
    firstLoginChanged: true,
  },
  {
    id: 'parent2',
    mobileNumber: '9876543211',
    password: 'parent123',
    name: 'Vijay Gupta',
    email: 'vijay@example.com',
    schoolId: 'sch1',
    linkedStudentIds: ['student2'],
    createdAt: '2024-04-01',
    lastLogin: null,
    firstLoginChanged: true,
  },
];

let _principalUsers: PrincipalUser[] = [
  {
    id: 'principal1',
    schoolId: 'sch1',
    mobileNumber: '9000000001',
    password: 'principal123',
    email: 'principal@school.edu',
    createdAt: '2024-01-01',
    lastLogin: null,
    firstLoginChanged: true,
  },
];

// ─── Service API ──────────────────────────────────────────────────────────────

export const authService = {

  // ── Parent Login ────────────────────────────────────────────────────────
  parentLogin(mobileNumber: string, password: string): AuthSession | null {
    const parent = _parentUsers.find(p => p.mobileNumber === mobileNumber && p.password === password);
    if (!parent) return null;

    parent.lastLogin = new Date().toISOString();

    return {
      userId: parent.id,
      mobileNumber: parent.mobileNumber,
      role: 'PARENT',
      schoolId: parent.schoolId,
      linkedStudentIds: parent.linkedStudentIds,
      name: parent.name,
      email: parent.email,
    };
  },

  // ── Principal Login ─────────────────────────────────────────────────────
  principalLogin(mobileNumber: string, password: string): AuthSession | null {
    const principal = _principalUsers.find(p => p.mobileNumber === mobileNumber && p.password === password);
    if (!principal) return null;

    principal.lastLogin = new Date().toISOString();

    return {
      userId: principal.id,
      mobileNumber: principal.mobileNumber,
      role: 'PRINCIPAL',
      schoolId: principal.schoolId,
      name: 'Principal',
      email: principal.email,
    };
  },

  // ── Check if parent exists by mobile ────────────────────────────────────
  getParentByMobile(mobileNumber: string): ParentUser | null {
    return _parentUsers.find(p => p.mobileNumber === mobileNumber) || null;
  },

  // ── Create new parent account (during student admission) ────────────────
  createParentAccount(
    mobileNumber: string,
    name: string,
    email: string,
    schoolId: string,
    studentId: string,
  ): ParentUser {
    const newParent: ParentUser = {
      id: `parent${Date.now()}`,
      mobileNumber,
      password: `${studentId.slice(-4)}`, // Temporary password based on student ID
      name,
      email,
      schoolId,
      linkedStudentIds: [studentId],
      createdAt: new Date().toISOString(),
      lastLogin: null,
      firstLoginChanged: false,
    };

    _parentUsers.push(newParent);
    return newParent;
  },

  // ── Link student to existing parent account ──────────────────────────────
  linkStudentToParent(parentId: string, studentId: string): boolean {
    const parent = _parentUsers.find(p => p.id === parentId);
    if (!parent) return false;
    if (!parent.linkedStudentIds.includes(studentId)) {
      parent.linkedStudentIds.push(studentId);
    }
    return true;
  },

  // ── Change password (first login or later) ──────────────────────────────
  changeParentPassword(parentId: string, oldPassword: string, newPassword: string): boolean {
    const parent = _parentUsers.find(p => p.id === parentId);
    if (!parent || parent.password !== oldPassword) return false;
    parent.password = newPassword;
    parent.firstLoginChanged = true;
    return true;
  },

  // ── Change principal password ───────────────────────────────────────────
  changePrincipalPassword(principalId: string, oldPassword: string, newPassword: string): boolean {
    const principal = _principalUsers.find(p => p.id === principalId);
    if (!principal || principal.password !== oldPassword) return false;
    principal.password = newPassword;
    principal.firstLoginChanged = true;
    return true;
  },

  // ── Get parent by ID ────────────────────────────────────────────────────
  getParentById(parentId: string): ParentUser | null {
    return _parentUsers.find(p => p.id === parentId) || null;
  },

  // ── Get all parents in school ────────────────────────────────────────────
  getParentsBySchool(schoolId: string): ParentUser[] {
    return _parentUsers.filter(p => p.schoolId === schoolId);
  },

  // ── Get temporary password for first login ──────────────────────────────
  getTempPassword(studentId: string): string {
    return `${studentId.slice(-4)}`; // Demo: last 4 chars of student ID
  },
};
