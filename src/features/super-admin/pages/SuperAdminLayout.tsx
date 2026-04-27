import React, { useState } from 'react';
import { SADashboard } from '../components/SADashboard';
import { SchoolsManager } from '../components/SchoolsManager';
import { BillingManager } from '../components/BillingManager';
import { AdminsManager } from '../components/AdminsManager';
import { BroadcastManager } from '../components/BroadcastManager';
import { ReportsView } from '../components/ReportsView';
import { LogsViewer } from '../components/LogsViewer';
import { ToastContainer } from '../../../components/ui/Toast';

type ActiveView = 'dashboard' | 'schools' | 'billing' | 'admins' | 'broadcast' | 'reports' | 'logs';

export const SuperAdminLayout: React.FC = () => {
  const [view, setView] = useState<ActiveView>('dashboard');

  const onNavigate = (v: string) => setView(v as ActiveView);
  const onBack = () => setView('dashboard');

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
