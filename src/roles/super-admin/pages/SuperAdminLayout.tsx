import React, { useState, useEffect } from 'react';
import { SADashboard } from '@/roles/super-admin/components/SADashboard';
import { SchoolsManager } from '@/roles/super-admin/components/SchoolsManager';
import { BillingManager } from '@/roles/super-admin/components/BillingManager';
import { AdminsManager } from '@/roles/super-admin/components/AdminsManager';
import { BroadcastManager } from '@/roles/super-admin/components/BroadcastManager';
import { ReportsView } from '@/roles/super-admin/components/ReportsView';
import { LogsViewer } from '@/roles/super-admin/components/LogsViewer';
import { ToastContainer } from '@/shared/components/ui/Toast';
import { useUIStore } from '@/shared/store/uiStore';

type ActiveView = 'dashboard' | 'schools' | 'billing' | 'admins' | 'broadcast' | 'reports' | 'logs';

export const SuperAdminLayout: React.FC = () => {
  const [view, setView] = useState<ActiveView>('dashboard');
  const setSubView = useUIStore(s => s.setSubView);

  const onNavigate = (v: string) => { setView(v as ActiveView); setSubView(true); };
  const onBack = () => { setView('dashboard'); setSubView(false); };

  useEffect(() => { setSubView(false); }, []);

  if (view === 'schools')   return <><SchoolsManager  onBack={onBack} /><ToastContainer /></>;
  if (view === 'billing')   return <><BillingManager  onBack={onBack} /><ToastContainer /></>;
  if (view === 'admins')    return <><AdminsManager   onBack={onBack} /><ToastContainer /></>;
  if (view === 'broadcast') return <><BroadcastManager onBack={onBack} /><ToastContainer /></>;
  if (view === 'reports')   return <><ReportsView     onBack={onBack} /><ToastContainer /></>;
  if (view === 'logs')      return <><LogsViewer      onBack={onBack} /><ToastContainer /></>;

  return (
    <>
      <SADashboard onNavigate={onNavigate} />
      <ToastContainer />
    </>
  );
};
