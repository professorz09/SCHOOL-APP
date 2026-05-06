export const APP_NAME = 'EduGrow';
export const APP_VERSION = '1.0.0';

export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  PRINCIPAL = 'PRINCIPAL',
  TEACHER = 'TEACHER',
  STUDENT = 'STUDENT',
  DRIVER = 'DRIVER',
}

export enum SchoolStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  TRIAL = 'TRIAL',
  SUSPENDED = 'SUSPENDED',
}

export enum BillingPlan {
  BASIC = 'BASIC',
  STANDARD = 'STANDARD',
  PREMIUM = 'PREMIUM',
}

export enum PaymentStatus {
  PAID = 'PAID',
  PENDING = 'PENDING',
  OVERDUE = 'OVERDUE',
}

export enum BroadcastAudience {
  ALL = 'ALL',
  PRINCIPALS = 'PRINCIPALS',
  TEACHERS = 'TEACHERS',
  STUDENTS = 'STUDENTS',
}

export enum LogType {
  SCHOOL = 'SCHOOL',
  BILLING = 'BILLING',
  ADMIN = 'ADMIN',
  BROADCAST = 'BROADCAST',
  SYSTEM = 'SYSTEM',
  SECURITY = 'SECURITY',
}

export const PLAN_PRICES: Record<BillingPlan, number> = {
  [BillingPlan.BASIC]: 2999,
  [BillingPlan.STANDARD]: 5999,
  [BillingPlan.PREMIUM]: 9999,
};

export const PLAN_COLORS: Record<BillingPlan, string> = {
  [BillingPlan.BASIC]: 'text-slate-600 bg-slate-50',
  [BillingPlan.STANDARD]: 'text-blue-600 bg-blue-50',
  [BillingPlan.PREMIUM]: 'text-amber-600 bg-amber-50',
};

export const STATUS_COLORS: Record<SchoolStatus, string> = {
  [SchoolStatus.ACTIVE]: 'text-emerald-700 bg-emerald-50',
  [SchoolStatus.INACTIVE]: 'text-slate-500 bg-slate-100',
  [SchoolStatus.TRIAL]: 'text-violet-600 bg-violet-50',
  [SchoolStatus.SUSPENDED]: 'text-rose-600 bg-rose-50',
};

export const PAYMENT_COLORS: Record<PaymentStatus, string> = {
  [PaymentStatus.PAID]: 'text-emerald-700 bg-emerald-50',
  [PaymentStatus.PENDING]: 'text-amber-600 bg-amber-50',
  [PaymentStatus.OVERDUE]: 'text-rose-600 bg-rose-50',
};
