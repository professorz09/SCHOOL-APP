import type { ReactNode } from 'react';

export type AppRole = 'SUPER_ADMIN' | 'PRINCIPAL' | 'TEACHER' | 'STUDENT' | 'DRIVER';

export type NavTab =
  | 'HOME'        | 'PROFILE'     // shared by all roles
  | 'FEES'        | 'NOTICES'     // student
  | 'STUDENTS'    | 'FEE_LEDGER'  // principal
  | 'SCHOOLS'     | 'BILLING'     // super admin
  | 'ATTENDANCE'                  // teacher
  | 'ROUTE';                      // driver

export interface ActionItem {
  title: string;
  icon: ReactNode;
  onClick?: () => void;
  color?: string;
}
