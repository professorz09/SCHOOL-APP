import type { ReactNode } from 'react';

export type AppRole = 'SUPER_ADMIN' | 'PRINCIPAL' | 'TEACHER' | 'STUDENT' | 'DRIVER';

export type NavTab =
  | 'HOME'        | 'PROFILE'     // shared by all roles
  | 'FEES'        | 'NOTICES'     // student
  | 'STUDENTS'    | 'FEE_LEDGER'  // principal
  | 'SCHOOLS'     | 'BILLING'     // super admin (in BottomNav)
  | 'ADMINS'      | 'BROADCAST'   // super admin (desktop sidebar only)
  | 'REPORTS'     | 'LOGS'
  | 'PLATFORM_SETTINGS'
  | 'ATTENDANCE'                  // teacher
  | 'ROUTE';                      // driver

export interface ActionItem {
  title: string;
  icon: ReactNode;
  onClick?: () => void;
  color?: string;
}
