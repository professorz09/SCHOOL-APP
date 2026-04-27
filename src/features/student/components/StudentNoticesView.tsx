import React, { useEffect, useState } from 'react';
import { ArrowLeft, Bell, Pin } from 'lucide-react';
import { studentDashboardService } from '../../../services/studentDashboard.service';
import { StudentNotice } from '../../../types/student.types';

interface Props { onBack: () => void; }

const catColor = (c: string) => {
  const map: Record<string, string> = {
    EXAM: 'bg-rose-50 text-rose-700',
    FEE: 'bg-emerald-50 text-emerald-700',
    EVENT: 'bg-violet-50 text-violet-700',
    GENERAL: 'bg-slate-100 text-slate-600',
  };
  return map[c] ?? 'bg-slate-100 text-slate-600';
};

export const StudentNoticesView: React.FC<Props> = ({ onBack }) => {
  const [notices, setNotices] = useState<StudentNotice[]>([]);
  const [filter, setFilter] = useState<string>('ALL');

  useEffect(() => { studentDashboardService.getNotices().then(setNotices); }, []);

  const categories = ['ALL', 'EXAM', 'FEE', 'EVENT', 'GENERAL'];
  const filtered = filter === 'ALL' ? notices : notices.filter(n => n.category === filter);
  const sorted = [...filtered].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime();
  });

  return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-4 pt-12 pb-4 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
        <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600"><ArrowLeft size={20} /></button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Notices</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-3">
        <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
          {categories.map(c => (
            <button key={c} onClick={() => setFilter(c)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors ${filter === c ? 'bg-slate-900 text-white' : 'bg-white text-slate-400 border border-slate-200'}`}>
              {c}
            </button>
          ))}
        </div>

        {sorted.map(notice => (
          <div key={notice.id}
            className={`bg-white rounded-2xl border shadow-sm p-4 ${notice.pinned ? 'border-violet-200' : 'border-slate-100'}`}>
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                {notice.pinned && <Pin size={11} className="text-violet-500 shrink-0" />}
                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${catColor(notice.category)}`}>{notice.category}</span>
              </div>
              <span className="text-[10px] font-bold text-slate-400 shrink-0">{notice.sentAt}</span>
            </div>
            <h3 className="font-extrabold text-slate-900 text-sm">{notice.title}</h3>
            <p className="text-[11px] font-bold text-slate-500 mt-1 leading-relaxed">{notice.body}</p>
          </div>
        ))}

        {sorted.length === 0 && (
          <div className="flex flex-col items-center py-16 text-slate-400">
            <Bell size={32} className="mb-3 opacity-40" />
            <p className="font-bold text-sm">No notices</p>
          </div>
        )}
      </div>
    </div>
  );
};
