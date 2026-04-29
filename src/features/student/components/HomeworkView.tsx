import React, { useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, Clock, CheckCircle2, AlertCircle, Calendar, User, ChevronDown, ChevronUp, Loader } from 'lucide-react';
import { studentDashboardService, HomeworkItem } from '../../../services/studentDashboard.service';
import { useUIStore } from '../../../store/uiStore';

const SUBJ_ICON: Record<string, string> = {
  Mathematics: '📐', Science: '🔬', English: '📖',
  Hindi: '✍️', 'Social Studies': '🌍', 'Computer Science': '💻',
  'Physical Education': '⚽',
};

const SUBJ_COLOR: Record<string, { bg: string; border: string; dot: string }> = {
  Mathematics:       { bg: 'bg-blue-50',    border: 'border-blue-100',   dot: 'bg-blue-500' },
  Science:           { bg: 'bg-emerald-50', border: 'border-emerald-100',dot: 'bg-emerald-500' },
  English:           { bg: 'bg-violet-50',  border: 'border-violet-100', dot: 'bg-violet-500' },
  Hindi:             { bg: 'bg-rose-50',    border: 'border-rose-100',   dot: 'bg-rose-500' },
  'Social Studies':  { bg: 'bg-amber-50',   border: 'border-amber-100',  dot: 'bg-amber-500' },
  'Computer Science':{ bg: 'bg-sky-50',     border: 'border-sky-100',    dot: 'bg-sky-500' },
};

const STATUS_CFG = {
  PENDING:   { label: 'Pending',   icon: <Clock size={10}/>,         cls: 'text-amber-700 bg-amber-50 border-amber-200' },
  SUBMITTED: { label: 'Submitted', icon: <CheckCircle2 size={10}/>,  cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  OVERDUE:   { label: 'Overdue',   icon: <AlertCircle size={10}/>,   cls: 'text-rose-700 bg-rose-50 border-rose-200' },
};

const daysLeft = (due: string) => {
  const diff = Math.ceil((new Date(due).getTime() - Date.now()) / 86400000);
  return diff;
};

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

interface Props { onBack: () => void; }

export const HomeworkView: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'SUBMITTED' | 'OVERDUE'>('ALL');
  const [homework, setHomework] = useState<HomeworkItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    studentDashboardService.getHomework()
      .then(rows => { if (!cancelled) setHomework(rows); })
      .catch(err => {
        console.error('[homework] load failed', err);
        if (!cancelled) showToast(err.message ?? 'Failed to load homework', 'error');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [showToast]);

  const pending   = homework.filter(h => h.status === 'PENDING').length;
  const overdue   = homework.filter(h => h.status === 'OVERDUE').length;
  const submitted = homework.filter(h => h.status === 'SUBMITTED').length;

  const filtered = filter === 'ALL' ? homework : homework.filter(h => h.status === filter);

  const tabs: { key: typeof filter; label: string; count: number }[] = [
    { key: 'ALL',       label: 'All',       count: homework.length },
    { key: 'PENDING',   label: 'Pending',   count: pending },
    { key: 'OVERDUE',   label: 'Overdue',   count: overdue },
    { key: 'SUBMITTED', label: 'Submitted', count: submitted },
  ];

  return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
            <ArrowLeft size={20}/>
          </button>
          <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Homework</h2>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[
            { label: 'Pending', val: pending, color: 'text-amber-600 bg-amber-50 border-amber-100' },
            { label: 'Overdue', val: overdue, color: 'text-rose-600 bg-rose-50 border-rose-100' },
            { label: 'Submitted', val: submitted, color: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
          ].map(s => (
            <div key={s.label} className={`rounded-xl border px-2 py-2 text-center ${s.color}`}>
              <div className="text-xl font-black leading-none">{s.val}</div>
              <div className="text-[9px] font-black uppercase tracking-widest mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wide transition-colors ${
                filter === t.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-500'
              }`}
            >
              {t.label}
              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${filter === t.key ? 'bg-white/20 text-white' : 'bg-white text-slate-500'}`}>
                {t.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4  space-y-3">
        {loading && (
          <div className="flex flex-col items-center py-16 text-slate-400">
            <Loader size={28} className="mb-3 animate-spin"/>
            <p className="font-bold text-sm">Loading homework…</p>
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center py-16 text-slate-400">
            <BookOpen size={36} className="mb-3 opacity-30"/>
            <p className="font-bold text-sm">No homework in this category</p>
          </div>
        )}

        {filtered.map(hw => {
          const scfg = STATUS_CFG[hw.status];
          const col  = SUBJ_COLOR[hw.subject] ?? { bg: 'bg-slate-50', border: 'border-slate-100', dot: 'bg-slate-400' };
          const days = daysLeft(hw.dueDate);
          const isOpen = expanded === hw.id;

          return (
            <div
              key={hw.id}
              className={`rounded-2xl border shadow-sm overflow-hidden ${hw.status === 'OVERDUE' ? 'border-rose-100' : 'border-slate-100'} bg-white`}
            >
              {/* Top accent bar */}
              <div className={`h-1 w-full ${col.dot}`}/>

              <div className="px-4 pt-3 pb-3">
                {/* Subject + status row */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xl shrink-0">{SUBJ_ICON[hw.subject] ?? '📝'}</span>
                    <div className="min-w-0">
                      <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{hw.subject}</div>
                      <div className="font-black text-slate-900 text-sm leading-tight">{hw.title}</div>
                    </div>
                  </div>
                  <span className={`flex items-center gap-1 text-[9px] font-black px-2 py-1 rounded-full border shrink-0 ${scfg.cls}`}>
                    {scfg.icon}{scfg.label}
                  </span>
                </div>

                {/* Meta row */}
                <div className="flex items-center gap-3 text-[10px] font-bold text-slate-400 mb-2">
                  <span className="flex items-center gap-1">
                    <User size={10} className="text-slate-400"/>{hw.teacher}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar size={10} className="text-slate-400"/>Due: {formatDate(hw.dueDate)}
                  </span>
                  {hw.status === 'PENDING' && days >= 0 && (
                    <span className={`font-black ${days <= 1 ? 'text-rose-500' : 'text-amber-500'}`}>
                      {days === 0 ? 'Due Today!' : `${days}d left`}
                    </span>
                  )}
                  {hw.status === 'OVERDUE' && (
                    <span className="font-black text-rose-500">
                      {Math.abs(days)}d overdue
                    </span>
                  )}
                </div>

                {/* Expand button */}
                <button
                  onClick={() => setExpanded(isOpen ? null : hw.id)}
                  className="flex items-center gap-1 text-[10px] font-black text-blue-600 uppercase tracking-wide"
                >
                  {isOpen ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
                  {isOpen ? 'Hide Details' : 'View Details'}
                </button>

                {/* Description (expanded) */}
                {isOpen && (
                  <div className="mt-3 bg-slate-50 rounded-xl p-3 border border-slate-100">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Instructions</div>
                    <p className="text-xs font-medium text-slate-700 leading-relaxed">{hw.description}</p>
                    <div className="mt-2.5 flex items-center gap-3 text-[10px] font-bold text-slate-400 pt-2 border-t border-slate-100">
                      <span>Assigned: {formatDate(hw.assignedDate)}</span>
                      <span>·</span>
                      <span>Due: {formatDate(hw.dueDate)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
