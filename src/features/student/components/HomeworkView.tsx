import React, { useState } from 'react';
import { ArrowLeft, BookOpen, Clock, CheckCircle2, AlertCircle, Calendar, User, ChevronDown, ChevronUp } from 'lucide-react';

interface HomeworkItem {
  id: string;
  subject: string;
  title: string;
  description: string;
  assignedDate: string;
  dueDate: string;
  status: 'PENDING' | 'SUBMITTED' | 'OVERDUE';
  teacher: string;
}

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

const MOCK_HOMEWORK: HomeworkItem[] = [
  {
    id: 'h1', subject: 'Mathematics', teacher: 'Aarti Desai',
    title: 'Chapter 7 – Coordinate Geometry Exercises',
    description: 'Complete Exercise 7.1 Q1–Q15 and Exercise 7.2 Q1–Q10 from NCERT textbook. Show all working steps clearly.',
    assignedDate: '2026-04-25', dueDate: '2026-04-29', status: 'PENDING',
  },
  {
    id: 'h2', subject: 'Science', teacher: 'Sanjay Mehta',
    title: 'Light – Reflection and Refraction Notes',
    description: 'Write short notes on laws of reflection and total internal reflection. Draw labeled ray diagrams for concave and convex mirrors.',
    assignedDate: '2026-04-24', dueDate: '2026-04-28', status: 'OVERDUE',
  },
  {
    id: 'h3', subject: 'English', teacher: 'Priya Singh',
    title: 'Essay – "My Aim in Life"',
    description: 'Write a 300–350 word essay on "My Aim in Life". Use formal language, clear paragraphs (intro, body, conclusion), and proper grammar.',
    assignedDate: '2026-04-23', dueDate: '2026-04-30', status: 'PENDING',
  },
  {
    id: 'h4', subject: 'Hindi', teacher: 'Meera Jha',
    title: 'पाठ 5 – प्रश्नोत्तर',
    description: 'पाठ्यपुस्तक के पाठ 5 के सभी प्रश्नों के उत्तर अपनी उत्तर पुस्तिका में लिखें। उत्तर कम से कम 4–5 वाक्यों में होने चाहिए।',
    assignedDate: '2026-04-22', dueDate: '2026-04-26', status: 'SUBMITTED',
  },
  {
    id: 'h5', subject: 'Social Studies', teacher: 'Rao Kumar',
    title: 'Map Work – Rivers of India',
    description: 'On an outline map of India, mark and label: Ganga, Yamuna, Brahmaputra, Godavari, Krishna, and Cauvery rivers. Also mark their origin points.',
    assignedDate: '2026-04-21', dueDate: '2026-04-27', status: 'SUBMITTED',
  },
  {
    id: 'h6', subject: 'Computer Science', teacher: 'Ajay Tiwari',
    title: 'Python – List & Dictionary Practice',
    description: 'Write Python programs for: (1) sorting a list without built-in sort, (2) counting word frequency in a string using dictionary, (3) nested list manipulation.',
    assignedDate: '2026-04-20', dueDate: '2026-04-25', status: 'SUBMITTED',
  },
];

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
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'SUBMITTED' | 'OVERDUE'>('ALL');

  const pending   = MOCK_HOMEWORK.filter(h => h.status === 'PENDING').length;
  const overdue   = MOCK_HOMEWORK.filter(h => h.status === 'OVERDUE').length;
  const submitted = MOCK_HOMEWORK.filter(h => h.status === 'SUBMITTED').length;

  const filtered = filter === 'ALL' ? MOCK_HOMEWORK : MOCK_HOMEWORK.filter(h => h.status === filter);

  const tabs: { key: typeof filter; label: string; count: number }[] = [
    { key: 'ALL',       label: 'All',       count: MOCK_HOMEWORK.length },
    { key: 'PENDING',   label: 'Pending',   count: pending },
    { key: 'OVERDUE',   label: 'Overdue',   count: overdue },
    { key: 'SUBMITTED', label: 'Submitted', count: submitted },
  ];

  return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
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
      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-3">
        {filtered.length === 0 && (
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
