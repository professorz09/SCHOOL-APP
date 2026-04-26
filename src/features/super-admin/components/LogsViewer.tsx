import React, { useEffect } from 'react';
import { ArrowLeft, History, ShieldCheck, Building2, IndianRupee, MailPlus, Server, Shield } from 'lucide-react';
import { useLogsStore } from '../../../store/logsStore';
import { LogType } from '../../../config/constants';

interface Props {
  onBack: () => void;
}

const LOG_META: Record<LogType | 'ALL', { label: string; icon: React.ReactNode; color: string }> = {
  ALL: { label: 'All', icon: <History size={14} />, color: 'text-slate-600 bg-slate-100' },
  [LogType.SCHOOL]: { label: 'School', icon: <Building2 size={14} />, color: 'text-indigo-600 bg-indigo-50' },
  [LogType.BILLING]: { label: 'Billing', icon: <IndianRupee size={14} />, color: 'text-emerald-600 bg-emerald-50' },
  [LogType.ADMIN]: { label: 'Admin', icon: <ShieldCheck size={14} />, color: 'text-rose-600 bg-rose-50' },
  [LogType.BROADCAST]: { label: 'Broadcast', icon: <MailPlus size={14} />, color: 'text-amber-600 bg-amber-50' },
  [LogType.SYSTEM]: { label: 'System', icon: <Server size={14} />, color: 'text-slate-600 bg-slate-100' },
  [LogType.SECURITY]: { label: 'Security', icon: <Shield size={14} />, color: 'text-red-600 bg-red-50' },
};

export const LogsViewer: React.FC<Props> = ({ onBack }) => {
  const { logs, isLoading, activeFilter, fetchLogs, setFilter } = useLogsStore();

  useEffect(() => { fetchLogs(); }, []);

  const visible = activeFilter === 'ALL' ? logs : logs.filter(l => l.entityType === activeFilter);

  return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-4 pt-12 pb-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600 hover:bg-slate-200 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">System Logs</h2>
        </div>
        <div className="text-[10px] font-black text-slate-500 bg-slate-100 px-3 py-1 rounded-full uppercase tracking-widest">
          {visible.length} entries
        </div>
      </div>

      {/* Filter chips */}
      <div className="bg-white border-b border-slate-100 px-4 py-3">
        <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
          {(['ALL', ...Object.values(LogType)] as const).map(type => {
            const meta = LOG_META[type];
            return (
              <button key={type} onClick={() => setFilter(type)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors ${activeFilter === type ? 'bg-slate-900 text-white' : `${meta.color} border border-transparent`}`}>
                {meta.icon}
                {meta.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-3">
        {isLoading && (
          <div className="flex flex-col items-center py-16 text-slate-400">
            <div className="w-8 h-8 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin mb-3" />
            <p className="font-bold text-sm">Loading…</p>
          </div>
        )}
        {!isLoading && visible.length === 0 && (
          <div className="flex flex-col items-center py-16 text-slate-400">
            <History size={32} className="mb-3 opacity-40" />
            <p className="font-bold text-sm">No logs for this filter</p>
          </div>
        )}
        {visible.map(log => {
          const meta = LOG_META[log.entityType];
          return (
            <div key={log.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex gap-3 items-start">
              <div className={`mt-0.5 w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${meta.color}`}>
                {meta.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start gap-2">
                  <div className="font-extrabold text-slate-900 text-sm leading-tight">{log.action}</div>
                  <span className="text-[9px] font-black text-slate-400 whitespace-nowrap shrink-0">{log.timestamp}</span>
                </div>
                <div className="mt-1.5 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-slate-400 w-10 shrink-0">Entity</span>
                    <span className="text-[10px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md truncate">{log.entity}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-slate-400 w-10 shrink-0">By</span>
                    <span className="text-[10px] font-bold text-slate-500">{log.performedBy}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
