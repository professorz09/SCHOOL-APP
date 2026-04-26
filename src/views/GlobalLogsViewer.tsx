import React from 'react';
import { ArrowLeft, History, ShieldCheck, Building2, IndianRupee, Users } from 'lucide-react';
import { AppCard } from '../components/SharedUI';

interface GlobalLogsViewerProps {
  onClose: () => void;
}

export const GlobalLogsViewer: React.FC<GlobalLogsViewerProps> = ({ onClose }) => {
  // Mock data for the last 10 global changes
  const logs = [
    { id: 1, action: 'Updated Billing Schedule', entity: 'Delhi Public School', user: 'admin@basiks.in', time: '10 mins ago', icon: <IndianRupee size={16} />, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { id: 2, action: 'Added New Global Admin', entity: 'rahul.s@basiks.in', user: 'admin@basiks.in', time: '1 hour ago', icon: <ShieldCheck size={16} />, color: 'text-rose-600', bg: 'bg-rose-50' },
    { id: 3, action: 'Onboarded New School', entity: 'Greenwood High', user: 'system', time: '2 hours ago', icon: <Building2 size={16} />, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { id: 4, action: 'Modified Subscription Plan', entity: 'St. Mary\'s Convent', user: 'admin@basiks.in', time: '3 hours ago', icon: <IndianRupee size={16} />, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { id: 5, action: 'Updated Student Capacity', entity: 'Delhi Public School', user: 'rahul.s@basiks.in', time: 'Yesterday', icon: <Users size={16} />, color: 'text-blue-600', bg: 'bg-blue-50' },
    { id: 6, action: 'Generated Monthly Report', entity: 'System Reports', user: 'system', time: 'Yesterday', icon: <History size={16} />, color: 'text-slate-600', bg: 'bg-slate-50' },
    { id: 7, action: 'Removed Scheduled Payment', entity: 'Heritage School', user: 'admin@basiks.in', time: '2 days ago', icon: <IndianRupee size={16} />, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { id: 8, action: 'Disabled Admin Access', entity: 'temp.user@basiks.in', user: 'admin@basiks.in', time: '2 days ago', icon: <ShieldCheck size={16} />, color: 'text-rose-600', bg: 'bg-rose-50' },
    { id: 9, action: 'Updated Global Settings', entity: 'Maintenance Mode', user: 'admin@basiks.in', time: '3 days ago', icon: <History size={16} />, color: 'text-slate-600', bg: 'bg-slate-50' },
    { id: 10, action: 'Onboarded New School', entity: 'Oakridge International', user: 'system', time: '4 days ago', icon: <Building2 size={16} />, color: 'text-indigo-600', bg: 'bg-indigo-50' },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-slate-50 overflow-y-auto animate-in slide-in-from-bottom-4 duration-300">
      <div className="p-4 bg-white border-b border-slate-100 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-2 hover:bg-slate-50 rounded-full transition-colors active:scale-95">
            <ArrowLeft size={20} className="text-slate-600" />
          </button>
          <h2 className="font-black text-slate-800 text-lg uppercase tracking-tight">System Logs</h2>
        </div>
        <div className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
          Last 10 Changes
        </div>
      </div>

      <div className="p-4 max-w-3xl mx-auto space-y-4">
        {logs.map((log) => (
          <AppCard key={log.id} className="border border-slate-100 shadow-sm" noPadding>
            <div className="p-4 flex gap-4 items-start">
              <div className={`mt-0.5 w-10 h-10 rounded-xl flex items-center justify-center font-bold shrink-0 ${log.bg} ${log.color}`}>
                {log.icon}
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-start mb-1">
                  <h4 className="font-extrabold text-slate-900 text-sm uppercase tracking-tight">{log.action}</h4>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 whitespace-nowrap ml-2">{log.time}</span>
                </div>
                <div className="flex flex-col gap-1 mt-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 w-12 shrink-0">Entity:</span>
                    <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">{log.entity}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 w-12 shrink-0">User:</span>
                    <span className="text-[10px] font-bold text-slate-600">{log.user}</span>
                  </div>
                </div>
              </div>
            </div>
          </AppCard>
        ))}
      </div>
    </div>
  );
};
