import React, { useState } from 'react';
import { Database, Building2, IndianRupee, BarChart3, Settings, ShieldCheck, MailPlus, History } from 'lucide-react';
import { ActionGrid, AppCard, SectionTitle } from '../components/SharedUI';
import { ActionItem } from '../types';
import { SchoolManager } from './SchoolManager';
import { BillingManager } from './BillingManager';
import { GlobalAdminsManager } from './GlobalAdminsManager';
import { BroadcastManager } from './BroadcastManager';
import { SuperAdminReports } from './SuperAdminReports';
import { GlobalLogsViewer } from './GlobalLogsViewer';

export const SuperAdminDashboard: React.FC = () => {
  const [showSchools, setShowSchools] = useState(false);
  const [showBilling, setShowBilling] = useState(false);
  const [showAdmins, setShowAdmins] = useState(false);
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [showReports, setShowReports] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  const actions: ActionItem[] = [
    { title: 'Schools', icon: <Building2 size={28} />, color: 'text-emerald-600', onClick: () => setShowBilling(true) },
    { title: 'Admins', icon: <ShieldCheck size={28} />, color: 'text-rose-500', onClick: () => setShowAdmins(true) },
    { title: 'Data', icon: <Database size={28} />, color: 'text-indigo-600', onClick: () => setShowSchools(true) },
    { title: 'Reports', icon: <BarChart3 size={28} />, color: 'text-blue-600', onClick: () => setShowReports(true) },
    { title: 'Broadcast', icon: <MailPlus size={28} />, color: 'text-amber-500', onClick: () => setShowBroadcast(true) },
    { title: 'Logs', icon: <History size={28} />, color: 'text-slate-600', onClick: () => setShowLogs(true) },
  ];

  return (
    <div className="flex flex-col gap-6 animate-in slide-in-from-bottom-4 duration-500 fade-in">
      <div className="pt-4">
        <p className="text-slate-500 font-bold text-xs uppercase tracking-widest mb-2">Monthly MRR</p>
        <div className="flex items-end gap-3">
          <h2 className="text-4xl font-black text-emerald-600">₹4.2L</h2>
          <span className="text-emerald-700 text-[10px] font-black uppercase tracking-widest bg-emerald-50 px-2 py-1 rounded-full mb-1">
            +15%
          </span>
        </div>
      </div>

      <ActionGrid actions={actions} />

      <div className="grid grid-cols-2 gap-4">
         <AppCard className="!p-6">
            <h4 className="text-slate-500 font-bold text-[10px] uppercase tracking-widest mb-2">Total Schools</h4>
            <div className="text-3xl font-black text-blue-600">14</div>
            <div className="mt-4 text-[10px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-50 max-w-fit px-2 py-1 rounded-full">
              Active clients
            </div>
         </AppCard>
         <AppCard className="!p-6">
            <h4 className="text-slate-500 font-bold text-[10px] uppercase tracking-widest mb-2">Total End Users</h4>
            <div className="text-3xl font-black text-slate-900">18.5k</div>
            <div className="mt-4 text-[10px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-50 max-w-fit px-2 py-1 rounded-full">
              Students & Staff
            </div>
         </AppCard>
      </div>

      <div>
        <SectionTitle title="Recent Onboardings" action="View All" />
        <AppCard noPadding>
          <div className="p-4 flex items-center justify-between border-b border-slate-100">
             <div className="flex items-center gap-3">
               <div className="w-10 h-10 bg-blue-100 text-blue-700 rounded-xl flex items-center justify-center font-bold">
                 DP
               </div>
               <div>
                 <h4 className="font-extrabold text-slate-900 text-sm uppercase tracking-tight">Delhi Public School</h4>
                 <p className="text-xs font-bold text-slate-500 mt-1">Premium Plan • 2,400 students</p>
               </div>
             </div>
          </div>
          <div className="p-4 flex items-center justify-between">
             <div className="flex items-center gap-3">
               <div className="w-10 h-10 bg-emerald-100 text-emerald-700 rounded-xl flex items-center justify-center font-bold">
                 GH
               </div>
               <div>
                 <h4 className="font-extrabold text-slate-900 text-sm uppercase tracking-tight">Greenwood High</h4>
                 <p className="text-xs font-bold text-slate-500 mt-1">Basic Plan • 800 students</p>
               </div>
             </div>
          </div>
        </AppCard>
      </div>

      <div className="h-8"></div>
      {showSchools && <SchoolManager onClose={() => setShowSchools(false)} />}
      {showBilling && <BillingManager onClose={() => setShowBilling(false)} />}
      {showAdmins && <GlobalAdminsManager onClose={() => setShowAdmins(false)} />}
      {showBroadcast && <BroadcastManager onClose={() => setShowBroadcast(false)} />}
      {showReports && <SuperAdminReports onClose={() => setShowReports(false)} />}
      {showLogs && <GlobalLogsViewer onClose={() => setShowLogs(false)} />}
    </div>
  );
};
