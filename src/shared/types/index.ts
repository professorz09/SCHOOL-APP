import type { ReactNode } from 'react';

export type AppRole = 'SUPER_ADMIN' | 'PRINCIPAL' | 'TEACHER' | 'STUDENT' | 'DRIVER';

export type NavTab =
  | 'HOME'        | 'PROFILE'     // shared by all roles
  | 'FEES'        | 'NOTICES'     // student
  | 'STUDENTS'    | 'FEE_LEDGER'  // principal
  | 'STAFF'       | 'APPROVALS'   // principal (desktop sidebar only)
  | 'SETTINGS'                    // principal (desktop sidebar only)
  | 'SCHOOLS'     | 'BILLING'     // super admin (in BottomNav)
  | 'ADMINS'      | 'BROADCAST'   // super admin (desktop sidebar only)
  | 'REPORTS'     | 'LOGS'
  | 'PLATFORM_SETTINGS'
  | 'ATTENDANCE'                  // teacher + principal (desktop sidebar)
  | 'ROUTE';                      // driver

export interface ActionItem {
  title: string;
  icon: ReactNode;
  onClick?: () => void;
  color?: string;
}
