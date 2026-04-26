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

  return (
    <div className="w-full h-full">
      <SADashboard onNavigate={(v) => setView(v as ActiveView)} />

      {view === 'schools' && <SchoolsManager onBack={() => setView('dashboard')} />}
      {view === 'billing' && <BillingManager onBack={() => setView('dashboard')} />}
      {view === 'admins' && <AdminsManager onBack={() => setView('dashboard')} />}
      {view === 'broadcast' && <BroadcastManager onBack={() => setView('dashboard')} />}
      {view === 'reports' && <ReportsView onBack={() => setView('dashboard')} />}
      {view === 'logs' && <LogsViewer onBack={() => setView('dashboard')} />}

      <ToastContainer />
    </div>
  );
};
