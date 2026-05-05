import React, { useState, useEffect } from 'react';
import { SADashboard } from '@/roles/super-admin/components/SADashboard';
import { SchoolsManager } from '@/roles/super-admin/components/SchoolsManager';
import { BillingManager } from '@/roles/super-admin/components/BillingManager';
import { AdminsManager } from '@/roles/super-admin/components/AdminsManager';
import { BroadcastManager } from '@/roles/super-admin/components/BroadcastManager';
import { ReportsView } from '@/roles/super-admin/components/ReportsView';
import { LogsViewer } from '@/roles/super-admin/components/LogsViewer';
import { PlatformSettingsManager } from '@/roles/super-admin/components/PlatformSettingsManager';
import { useUIStore } from '@/store/uiStore';

type ActiveView = 'dashboard' | 'schools' | 'billing' | 'admins' | 'broadcast' | 'reports' | 'logs' | 'settings';

// ToastContainer is mounted once at the App root, so individual views don't
// need to render their own — keeping the layout focused on routing only.
export const SuperAdminLayout: React.FC = () => {
  const [view, setView] = useState<ActiveView>('dashboard');
  const setSubView = useUIStore(s => s.setSubView);

  const onNavigate = (v: string) => { setView(v as ActiveView); setSubView(true); };
  const onBack = () => { setView('dashboard'); setSubView(false); };

  useEffect(() => { setSubView(false); }, []);

  if (view === 'schools')   return <SchoolsManager  onBack={onBack} />;
  if (view === 'billing')   return <BillingManager  onBack={onBack} />;
  if (view === 'admins')    return <AdminsManager   onBack={onBack} />;
  if (view === 'broadcast') return <BroadcastManager onBack={onBack} />;
  if (view === 'reports')   return <ReportsView     onBack={onBack} />;
  if (view === 'logs')      return <LogsViewer      onBack={onBack} />;
  if (view === 'settings')  return <PlatformSettingsManager onBack={onBack} />;

  return <SADashboard onNavigate={onNavigate} />;
};
