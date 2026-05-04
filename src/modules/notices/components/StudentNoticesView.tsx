import React, { useEffect, useState, useCallback } from 'react';
import {
  ArrowLeft, Pin, ChevronDown, ChevronUp, BookOpen,
} from 'lucide-react';
import { studentDashboardService } from '@/modules/students/studentDashboard.service';
import { StudentNotice } from '@/roles/student/student-role.types';
import { useRealtimeTable } from '@/shared/hooks/useRealtimeTable';

interface Props { onBack: () => void; }

/* ── Category config for notices ─────────────────────── */
const NOTICE_CAT: Record<string, { label: string; cls: string }> = {
  HOMEWORK: { label: 'Homework', cls: 'text-amber-700 bg-amber-50 border-amber-200' },
  EXAM:     { label: 'Exam',     cls: 'text-rose-700 bg-rose-50 border-rose-200' },
  FEE:      { label: 'Fee',      cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  EVENT:    { label: 'Event',    cls: 'text-violet-700 bg-violet-50 border-violet-200' },
  PERSONAL: { label: 'For You',  cls: 'text-rose-800 bg-gradient-to-r from-rose-100 to-pink-100 border-rose-300' },
  GENERAL:  { label: 'General',  cls: 'text-slate-600 bg-slate-100 border-slate-200' },
};

type FilterKey = 'ALL' | 'HOMEWORK' | 'EXAM' | 'GENERAL';

/* ── Notice Card ────────────────────────────────────── */
const NoticeCard: React.FC<{ notice: StudentNotice }> = ({ notice }) => {
  const [open, setOpen] = useState(false);
  const cat = NOTICE_CAT[notice.category] ?? NOTICE_CAT['GENERAL'];

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${notice.pinned ? 'border-violet-100' : 'border-slate-100'}`}>
      <div className="px-4 pt-3.5 pb-3">
        <div className="flex items-center gap-2 mb-1.5">
          {notice.pinned && <Pin size={10} className="text-violet-500 shrink-0"/>}
          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border uppercase ${cat.cls}`}>
            {cat.label}
          </span>
          <span className="ml-auto text-[10px] font-bold text-slate-400 shrink-0">{notice.sentAt}</span>
        </div>

        <div className="font-black text-slate-900 text-sm leading-tight mb-2">{notice.title}</div>

        <button onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1 text-[10px] font-black text-blue-600 uppercase tracking-wide">
          {open ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
          {open ? 'Hide' : 'Read More'}
        </button>

        {open && (
          <div className="mt-2 bg-slate-50 rounded-xl p-3 border border-slate-100">
            <p className="text-xs font-medium text-slate-700 leading-relaxed">{notice.body}</p>
          </div>
        )}
      </div>
    </div>
  );
};

/* ── Main Component ─────────────────────────────────── */
export const StudentNoticesView: React.FC<Props> = ({ onBack }) => {
  const [notices, setNotices] = useState<StudentNotice[]>([]);
  const [filter, setFilter]   = useState<FilterKey>('ALL');

  const loadAll = useCallback(() => {
    studentDashboardService.getNotices().then(setNotices);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  useRealtimeTable('notices', loadAll);

  const filtered = filter === 'ALL'
    ? notices
    : notices.filter(n => (n.category ?? 'GENERAL').toUpperCase() === filter);

  const counts = {
    ALL:      notices.length,
    HOMEWORK: notices.filter(n => n.category === 'HOMEWORK').length,
    EXAM:     notices.filter(n => n.category === 'EXAM').length,
    GENERAL:  notices.filter(n => !['HOMEWORK', 'EXAM'].includes(n.category ?? '')).length,
  };

  const FILTER_TABS: { key: FilterKey; label: string }[] = [
    { key: 'ALL',      label: 'All' },
    { key: 'HOMEWORK', label: 'Homework' },
    { key: 'EXAM',     label: 'Exam' },
    { key: 'GENERAL',  label: 'Other' },
  ];

  return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-4 lg:px-8 pt-4 lg:pt-6 pb-4 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3 mb-4 lg:max-w-5xl lg:mx-auto lg:w-full">
          <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600 hover:bg-slate-200 transition-colors">
            <ArrowLeft size={20}/>
          </button>
          <div>
            <h2 className="text-xl lg:text-2xl font-black text-slate-900 uppercase tracking-tight">Notices</h2>
            <p className="text-[10px] lg:text-xs font-bold text-slate-400">{notices.length} total · {notices.filter(n => n.pinned).length} pinned</p>
          </div>
        </div>

        <div className="flex gap-2 lg:gap-3 lg:max-w-5xl lg:mx-auto lg:w-full">
          {FILTER_TABS.map(t => (
            <button key={t.key} onClick={() => setFilter(t.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 lg:py-2.5 rounded-xl text-[10px] lg:text-xs font-black uppercase tracking-widest transition-colors ${
                filter === t.key ? 'bg-slate-900 text-white' : 'bg-white text-slate-400 border border-slate-200 hover:border-slate-300'
              }`}>
              {t.label}
              <span className={`text-[9px] lg:text-[10px] font-black px-1.5 py-0.5 rounded-full ${filter === t.key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                {counts[t.key]}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 lg:p-8 lg:max-w-5xl lg:mx-auto lg:w-full">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-slate-400">
            <BookOpen size={32} className="mb-3 opacity-40"/>
            <p className="font-bold text-sm">Nothing here</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">
            {filtered.map((n, idx) => <NoticeCard key={`n-${n.id ?? idx}`} notice={n}/>)}
          </div>
        )}
      </div>
    </div>
  );
};
