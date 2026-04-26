export type AppRole = 'SUPER_ADMIN' | 'PRINCIPAL' | 'TEACHER' | 'STUDENT' | 'DRIVER';
export type NavTab = 'HOME' | 'DISCOVER' | 'PAYMENTS' | 'PROFILE';

export interface ActionItem {
  title: string;
  icon: React.ReactNode;
  onClick?: () => void;
  color?: string;
}
