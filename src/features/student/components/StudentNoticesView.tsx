import React, { useEffect, useState } from 'react';
import {
  ArrowLeft, Bell, Pin, ChevronDown, ChevronUp,
  Clock, CheckCircle2, AlertCircle, Calendar, User, BookOpen,
} from 'lucide-react';
import { studentDashboardService, HomeworkItem } from '../../../services/studentDashboard.service';
import { StudentNotice } from '../../../types/student.types';

interface Props { onBack: () => void; }

/* ── Category config for notices ─────────────────────── */
const NOTICE_CAT: Record<string, { label: string; cls: string }> = {
  EXAM:    { label: 'Exam',    cls: 'text-rose-700 bg-rose-50 border-rose-200' },
  FEE:     { label: 'Fee',     cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  EVENT:   { label: 'Event',   cls: 'text-violet-700 bg-violet-50 border-violet-200' },
  GENERAL: { label: 'General', cls: 'text-slate-600 bg-slate-100 border-slate-200' },
};

/* ── Homework status config ──────────────────────────── */
const HW_STATUS_CFG = {
  PENDING:   { label: 'Pending',   icon: <Clock size={10}/>,        cls: 'text-amber-700 bg-amber-50 border-amber-200' },
  SUBMITTED: { label: 'Submitted', icon: <CheckCircle2 size={10}/>, cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  OVERDUE:   { label: 'Overdue',   icon: <AlertCircle size={10}/>,  cls: 'text-rose-700 bg-rose-50 border-rose-200' },
};

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

const daysLeft = (due: string) =>
  Math.ceil((new Date(due).getTime() - Date.now()) / 86400000);

type FeedItem =
  | { kind: 'notice'; data: StudentNotice }
  | { kind: 'homework'; data: HomeworkItem };

type FilterKey = 'ALL' | 'NOTICES' | 'HOMEWORK';

/* ── Homework Card ──────────────────────────────────── */
const HomeworkCard: React.FC<{ hw: HomeworkItem }> = ({ hw }) => {
  const [open, setOpen] = useState(false);
  const scfg = HW_STATUS_CFG[hw.status];
  const days = daysLeft(hw.dueDate);

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${hw.status === 'OVERDUE' ? 'border-rose-100' : 'border-slate-100'}`}>
      <div className="px-4 pt-3.5 pb-3">
        {/* Subject label + status badge */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{hw.subject}</div>
            <div className="font-black text-slate-900 text-sm leading-tight mt-0.5">{hw.title}</div>
          </div>
          <span className={`flex items-center gap-1 text-[9px] font-black px-2 py-1 rounded-full border shrink-0 ${scfg.cls}`}>
            {scfg.icon}{scfg.label}
          </span>
        </div>

        {/* Meta */}
        <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 text-[10px] font-bold text-slate-400 mb-2">
          <span className="flex items-center gap-1"><User size={10}/>{hw.teacher}</span>
          <span className="flex items-center gap-1"><Calendar size={10}/>Due: {formatDate(hw.dueDate)}</span>
          {hw.status === 'PENDING' && days >= 0 && (
            <span className={`font-black ${days <= 1 ? 'text-rose-500' : 'text-amber-500'}`}>
              {days === 0 ? 'Due Today!' : `${days}d left`}
            </span>
          )}
          {hw.status === 'OVERDUE' && (
            <span className="font-black text-rose-500">{Math.abs(days)}d overdue</span>
          )}
        </div>

        <button onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1 text-[10px] font-black text-blue-600 uppercase tracking-wide">
          {open ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
          {open ? 'Hide Details' : 'View Details'}
        </button>

        {open && (
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
};

/* ── Notice Card ────────────────────────────────────── */
const NoticeCard: React.FC<{ notice: StudentNotice }> = ({ notice }) => {
  const [open, setOpen] = useState(false);
  const cat = NOTICE_CAT[notice.category] ?? NOTICE_CAT['GENERAL'];

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${notice.pinned ? 'border-violet-100' : 'border-slate-100'}`}>
      <div className="px-4 pt-3.5 pb-3">
        {/* Top row: pin + category badge + date */}
        <div className="flex items-center gap-2 mb-1.5">
          {notice.pinned && <Pin size={10} className="text-violet-500 shrink-0"/>}
          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border uppercase ${cat.cls}`}>
            {cat.label}
          </span>
          <span className="ml-auto text-[10px] font-bold text-slate-400 shrink-0">{notice.sentAt}</span>
        </div>

        {/* Title */}
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
  const [notices, setNotices]   = useState<StudentNotice[]>([]);
  const [homework, setHomework] = useState<HomeworkItem[]>([]);
  const [filter, setFilter]     = useState<FilterKey>('ALL');

  useEffect(() => {
    studentDashboardService.getNotices().then(setNotices);
    studentDashboardService.getHomework().then(setHomework);
  }, []);

  const feed: FeedItem[] = [
    ...notices.map(n => ({ kind: 'notice' as const, data: n })),
    ...homework.map(h => ({ kind: 'homework' as const, data: h })),
  ];

  const filtered: FeedItem[] =
    filter === 'ALL'      ? feed :
    filter === 'NOTICES'  ? feed.filter(f => f.kind === 'notice') :
    feed.filter(f => f.kind === 'homework');

  const noticeCount = feed.filter(f => f.kind === 'notice').length;
  const hwCount     = feed.filter(f => f.kind === 'homework').length;

  const FILTER_TABS: { key: FilterKey; label: string; count: number }[] = [
    { key: 'ALL',      label: 'All',      count: feed.length },
    { key: 'NOTICES',  label: 'Notices',  count: noticeCount },
    { key: 'HOMEWORK', label: 'Homework', count: hwCount },
  ];

  return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
            <ArrowLeft size={20}/>
          </button>
          <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Notices & Homework</h2>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <div className="rounded-xl border border-blue-100 px-3 py-2 text-center bg-blue-50">
            <div className="text-xl font-black text-blue-700 leading-none">{noticeCount}</div>
            <div className="text-[9px] font-black uppercase tracking-widest mt-0.5 text-blue-500">Notices</div>
          </div>
          <div className="rounded-xl border border-amber-100 px-3 py-2 text-center bg-amber-50">
            <div className="text-xl font-black text-amber-700 leading-none">{hwCount}</div>
            <div className="text-[9px] font-black uppercase tracking-widest mt-0.5 text-amber-500">Homework</div>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2">
          {FILTER_TABS.map(t => (
            <button key={t.key} onClick={() => setFilter(t.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors ${
                filter === t.key ? 'bg-slate-900 text-white' : 'bg-white text-slate-400 border border-slate-200'
              }`}>
              {t.label}
              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${filter === t.key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                {t.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto p-4  space-y-3">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center py-16 text-slate-400">
            <BookOpen size={32} className="mb-3 opacity-40"/>
            <p className="font-bold text-sm">Nothing here</p>
          </div>
        )}
        {filtered.map((item, idx) =>
          item.kind === 'notice'
            ? <NoticeCard key={`n-${item.data.id ?? idx}`} notice={item.data}/>
            : <HomeworkCard key={`h-${item.data.id}`} hw={item.data}/>
        )}
      </div>
    </div>
  );
};
