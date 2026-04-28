import React, { useEffect, useState } from 'react';
import {
  ArrowLeft, Trophy, Star, Medal, Calendar, Clock,
  CheckCircle2, Hourglass, BookOpen, ChevronDown, ChevronUp,
} from 'lucide-react';
import { studentDashboardService, UpcomingExam } from '../../../services/studentDashboard.service';
import { StudentExamResult } from '../../../types/student.types';

interface Props { onBack: () => void; }

/* ─── helpers ─────────────────────────────────────── */
const barColor = (pct: number) =>
  pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-blue-500' : pct >= 40 ? 'bg-amber-400' : 'bg-rose-400';

const pctColor = (pct: number) =>
  pct >= 75 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-rose-500';

const rankSuffix = (n: number) => n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th';

const SUBJ_ICON: Record<string, string> = {
  Mathematics: '📐', Science: '🔬', English: '📖',
  Hindi: '✍️', 'Social Studies': '🌍', 'Computer Science': '💻',
  'Physical Education': '⚽',
};

const TYPE_CFG: Record<string, { label: string; color: string; bg: string; border: string; dot: string }> = {
  UNIT_TEST: { label: 'Unit Test',  color: 'text-blue-700',    bg: 'bg-blue-50',    border: 'border-blue-200',   dot: 'bg-blue-500' },
  MID_TERM:  { label: 'Mid Term',   color: 'text-violet-700',  bg: 'bg-violet-50',  border: 'border-violet-200', dot: 'bg-violet-500' },
  FINAL:     { label: 'Final Exam', color: 'text-rose-700',    bg: 'bg-rose-50',    border: 'border-rose-200',   dot: 'bg-rose-500' },
  QUIZ:      { label: 'Quiz',       color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200',dot: 'bg-emerald-500' },
  PRACTICAL: { label: 'Practical',  color: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200',  dot: 'bg-amber-500' },
};

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });

const monthLabel = (d: string) =>
  new Date(d).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

/* ─── Timeline item types ─────────────────────────── */
type TimelineItem =
  | { kind: 'upcoming'; exam: UpcomingExam; date: string }
  | { kind: 'result-group'; examName: string; testType: string; date: string; results: StudentExamResult[] };

/* ─── Build unified chronological timeline ────────── */
function buildTimeline(results: StudentExamResult[], upcoming: UpcomingExam[]): TimelineItem[] {
  const items: TimelineItem[] = [];

  // Group results by examName
  const groups: Record<string, StudentExamResult[]> = {};
  for (const r of results) {
    if (!groups[r.examName]) groups[r.examName] = [];
    groups[r.examName].push(r);
  }
  for (const [examName, list] of Object.entries(groups)) {
    items.push({
      kind: 'result-group',
      examName,
      testType: list[0].testType,
      date: list[0].date,
      results: list,
    });
  }

  // Upcoming exams
  for (const ex of upcoming) {
    items.push({ kind: 'upcoming', exam: ex, date: ex.scheduledDate });
  }

  // Sort descending (most recent first), upcoming at top
  return items.sort((a, b) => {
    if (a.date > b.date) return -1;
    if (a.date < b.date) return 1;
    return 0;
  });
}

/* ─── Group timeline by month ─────────────────────── */
function groupByMonth(items: TimelineItem[]): { month: string; items: TimelineItem[] }[] {
  const map: Record<string, TimelineItem[]> = {};
  for (const item of items) {
    const key = item.date.slice(0, 7); // YYYY-MM
    if (!map[key]) map[key] = [];
    map[key].push(item);
  }
  return Object.entries(map)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([, its]) => ({ month: monthLabel(its[0].date), items: its }));
}

/* ═══════════════════════════════════════════════════ */
export const ResultsView: React.FC<Props> = ({ onBack }) => {
  const [results, setResults]   = useState<StudentExamResult[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingExam[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    studentDashboardService.getResults().then(setResults);
    studentDashboardService.getScheduledExams().then(setUpcoming);
  }, []);

  const toggle = (key: string) =>
    setExpanded(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s; });

  const avgPercent = results.length > 0
    ? Math.round(results.reduce((a, r) => a + (r.obtainedMarks / r.maxMarks) * 100, 0) / results.length)
    : 0;

  const bestResult = results.reduce<StudentExamResult | null>(
    (best, r) => !best || (r.obtainedMarks / r.maxMarks) > (best.obtainedMarks / best.maxMarks) ? r : best, null,
  );

  const performanceLabel =
    avgPercent >= 85 ? 'Outstanding' : avgPercent >= 75 ? 'Excellent' :
    avgPercent >= 60 ? 'Good'        : avgPercent >= 45 ? 'Average'   : 'Needs Work';

  const timeline = buildTimeline(results, upcoming);
  const groups   = groupByMonth(timeline);

  return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
        <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
          <ArrowLeft size={20}/>
        </button>
        <div>
          <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight leading-none">My Results</h2>
          <p className="text-[10px] font-bold text-slate-400 mt-0.5">Academic Timeline</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-28">

        {/* ── Overall Performance Card ── */}
        {results.length > 0 && (
          <div className="m-4 mb-0 bg-[#0d1b3e] rounded-3xl p-5 text-white">
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-300 mb-3">Overall Performance</p>
            <div className="flex items-end gap-4 mb-4">
              <div className="text-6xl font-black leading-none tabular-nums">
                {avgPercent}<span className="text-3xl text-blue-300">%</span>
              </div>
              <div className="pb-1">
                <div className="text-sm font-black text-blue-100">{performanceLabel}</div>
                <div className="text-[10px] font-bold text-blue-300 mt-0.5">
                  {results.length} exams completed · All subjects
                </div>
              </div>
            </div>
            <div className="bg-white/10 rounded-full h-2 mb-4">
              <div
                className="h-2 rounded-full bg-gradient-to-r from-blue-400 to-emerald-400 transition-all duration-700"
                style={{ width: `${avgPercent}%` }}
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Exams Done',    val: String(results.length) },
                { label: 'Avg Score',     val: `${avgPercent}%` },
                { label: 'Upcoming',      val: String(upcoming.length) },
              ].map(({ label, val }) => (
                <div key={label} className="bg-white/10 rounded-xl p-2.5 text-center">
                  <div className="font-black text-white text-base">{val}</div>
                  <div className="text-[9px] font-black uppercase tracking-widest text-blue-300 mt-0.5">{label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Best Score banner ── */}
        {bestResult && (
          <div className="mx-4 mt-3 bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 flex items-center gap-3">
            <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
              <Star size={17} className="text-amber-500"/>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[9px] font-black uppercase tracking-widest text-amber-500 mb-0.5">Best Performance</div>
              <div className="font-extrabold text-slate-900 text-sm">
                {SUBJ_ICON[bestResult.subject] ?? '📝'} {bestResult.subject}
              </div>
              <div className="text-[10px] font-bold text-slate-400">{bestResult.examName}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="font-black text-amber-600 text-xl">
                {Math.round((bestResult.obtainedMarks / bestResult.maxMarks) * 100)}%
              </div>
              <div className="text-[10px] font-bold text-amber-400">
                {bestResult.obtainedMarks}/{bestResult.maxMarks}
              </div>
            </div>
          </div>
        )}

        {/* ── Timeline heading ── */}
        {timeline.length > 0 && (
          <div className="mx-4 mt-5 flex items-center gap-2 mb-1">
            <div className="w-1 h-5 bg-slate-800 rounded-full"/>
            <h3 className="font-black text-slate-800 text-sm uppercase tracking-widest">Academic Timeline</h3>
          </div>
        )}

        {/* ── Month-grouped timeline ── */}
        {groups.map(group => (
          <div key={group.month} className="mt-4">
            {/* Month label */}
            <div className="mx-4 flex items-center gap-2 mb-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full">
                {group.month}
              </span>
              <div className="flex-1 h-px bg-slate-200"/>
            </div>

            {/* Timeline items */}
            <div className="relative mx-4">
              {/* Vertical line */}
              <div className="absolute left-3.5 top-4 bottom-4 w-px bg-slate-200"/>

              <div className="space-y-3">
                {group.items.map((item, idx) => {
                  if (item.kind === 'upcoming') {
                    return <UpcomingCard key={item.exam.id} item={item} idx={idx}/>;
                  }
                  return (
                    <ResultGroupCard
                      key={item.examName}
                      item={item}
                      idx={idx}
                      expanded={expanded.has(item.examName)}
                      onToggle={() => toggle(item.examName)}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        ))}

        {results.length === 0 && upcoming.length === 0 && (
          <div className="flex flex-col items-center py-16 text-slate-400">
            <Trophy size={36} className="mb-3 opacity-30"/>
            <p className="font-bold text-sm">No results yet</p>
          </div>
        )}
      </div>
    </div>
  );
};

/* ─── Upcoming Exam Timeline Card ─────────────────── */
const UpcomingCard: React.FC<{ item: Extract<TimelineItem, { kind: 'upcoming' }>; idx: number }> = ({ item }) => {
  const ex  = item.exam;
  const cfg = TYPE_CFG[ex.testType] ?? TYPE_CFG['UNIT_TEST'];
  const daysLeft = Math.ceil((new Date(ex.scheduledDate).getTime() - Date.now()) / 86400000);
  const isPast   = daysLeft < 0;

  return (
    <div className="flex gap-3">
      {/* Dot */}
      <div className="relative z-10 flex-shrink-0 mt-1">
        <div className={`w-7 h-7 rounded-full border-2 border-white shadow flex items-center justify-center ${isPast ? 'bg-slate-300' : cfg.dot}`}>
          <Hourglass size={12} className="text-white"/>
        </div>
      </div>

      {/* Card */}
      <div className={`flex-1 rounded-2xl border shadow-sm p-3.5 mb-0.5 ${
        ex.isFinal
          ? 'bg-gradient-to-r from-rose-50 to-orange-50 border-rose-100'
          : `${cfg.bg} ${cfg.border}`
      }`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-1">
              <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border uppercase ${
                ex.isFinal ? 'bg-rose-100 text-rose-700 border-rose-200' : `${cfg.bg} ${cfg.color} ${cfg.border}`
              }`}>
                {ex.isFinal ? 'Final Exam' : cfg.label}
              </span>
              <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${
                isPast
                  ? 'bg-amber-50 text-amber-700 border border-amber-100'
                  : 'bg-indigo-50 text-indigo-700 border border-indigo-100'
              }`}>
                {isPast ? 'Results Awaited' : daysLeft === 0 ? 'Today!' : `in ${daysLeft}d`}
              </span>
            </div>
            <div className="font-extrabold text-slate-900 text-sm leading-tight">{ex.title}</div>
            {ex.subject && (
              <div className="text-[10px] font-bold text-slate-500 mt-0.5 leading-relaxed">{ex.subject}</div>
            )}
          </div>
          <div className="text-right shrink-0">
            <div className="font-black text-slate-800 text-sm">{ex.maxMarks}</div>
            <div className="text-[9px] font-bold text-slate-400">marks</div>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-bold text-slate-500 mt-2">
          <span className="flex items-center gap-1">
            <Calendar size={10} className="text-slate-400"/>{formatDate(ex.scheduledDate)}
          </span>
          <span className="flex items-center gap-1">
            <Clock size={10} className="text-slate-400"/>{ex.duration} min
          </span>
        </div>
      </div>
    </div>
  );
};

/* ─── Result Group Timeline Card ──────────────────── */
const ResultGroupCard: React.FC<{
  item: Extract<TimelineItem, { kind: 'result-group' }>;
  idx: number;
  expanded: boolean;
  onToggle: () => void;
}> = ({ item, expanded, onToggle }) => {
  const cfg     = TYPE_CFG[item.testType] ?? TYPE_CFG['UNIT_TEST'];
  const total   = item.results.reduce((a, r) => a + r.obtainedMarks, 0);
  const maxTot  = item.results.reduce((a, r) => a + r.maxMarks, 0);
  const overall = maxTot > 0 ? Math.round((total / maxTot) * 100) : 0;
  const isFinal = item.testType === 'FINAL';

  return (
    <div className="flex gap-3">
      {/* Dot */}
      <div className="relative z-10 flex-shrink-0 mt-1">
        <div className={`w-7 h-7 rounded-full border-2 border-white shadow flex items-center justify-center ${isFinal ? 'bg-rose-500' : cfg.dot}`}>
          <CheckCircle2 size={12} className="text-white"/>
        </div>
      </div>

      {/* Card */}
      <div className={`flex-1 rounded-2xl border shadow-sm overflow-hidden mb-0.5 ${
        isFinal ? 'border-rose-100' : 'border-slate-100'
      } bg-white`}>
        {/* Card header */}
        <div className={`px-4 pt-3.5 pb-3 ${isFinal ? 'bg-gradient-to-r from-rose-50 to-orange-50' : 'bg-white'}`}>
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap mb-1">
                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border uppercase ${
                  isFinal ? 'bg-rose-100 text-rose-700 border-rose-200' : `${cfg.bg} ${cfg.color} ${cfg.border}`
                }`}>
                  {isFinal ? 'Final Exam' : cfg.label}
                </span>
                <span className="text-[9px] font-bold text-slate-400">{formatDate(item.date)}</span>
                <span className="text-[9px] font-bold text-slate-400">{item.results.length} subject{item.results.length > 1 ? 's' : ''}</span>
              </div>
              <div className="font-black text-slate-900 text-sm leading-tight">{item.examName}</div>
            </div>
            <div className="text-right shrink-0">
              <div className={`text-2xl font-black tabular-nums leading-none ${pctColor(overall)}`}>
                {overall}<span className="text-sm">%</span>
              </div>
              <div className="text-[10px] font-bold text-slate-400">{total}/{maxTot}</div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="bg-white/60 rounded-full h-1.5 mb-2">
            <div className={`h-1.5 rounded-full transition-all duration-500 ${barColor(overall)}`} style={{ width: `${overall}%` }}/>
          </div>

          {/* Expand toggle */}
          <button
            onClick={onToggle}
            className="flex items-center gap-1 text-[10px] font-black text-blue-600 uppercase tracking-wide"
          >
            {expanded ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
            {expanded ? 'Hide Subjects' : 'View Subjects'}
          </button>
        </div>

        {/* Subject rows (expanded) */}
        {expanded && (
          <div className="p-3 space-y-2 border-t border-slate-50">
            {item.results.map(r => {
              const pct = r.maxMarks > 0 ? Math.round((r.obtainedMarks / r.maxMarks) * 100) : 0;
              return (
                <div key={r.id} className="bg-slate-50 rounded-xl p-3">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-base shrink-0">{SUBJ_ICON[r.subject] ?? '📝'}</span>
                      <div className="min-w-0">
                        <div className="font-extrabold text-slate-800 text-xs">{r.subject}</div>
                        <div className="text-[9px] font-bold text-slate-400 truncate">{r.teacherName}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                      {r.rank && (
                        <div className="flex items-center gap-1 bg-amber-50 border border-amber-100 rounded-lg px-1.5 py-0.5">
                          <Medal size={9} className="text-amber-500"/>
                          <span className="font-black text-amber-700 text-[10px]">
                            {r.rank}<sup className="text-[8px]">{rankSuffix(r.rank)}</sup>
                          </span>
                        </div>
                      )}
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                        pct >= 33
                          ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                          : 'bg-rose-100 text-rose-700 border border-rose-200'
                      }`}>
                        {pct >= 33 ? 'Pass' : 'Fail'}
                      </span>
                      <span className={`font-black text-sm tabular-nums ${pctColor(pct)}`}>{pct}%</span>
                      <span className="text-[10px] font-bold text-slate-400 tabular-nums">
                        {r.obtainedMarks}/{r.maxMarks}
                      </span>
                    </div>
                  </div>
                  <div className="bg-slate-200 rounded-full h-1">
                    <div className={`h-1 rounded-full ${barColor(pct)}`} style={{ width: `${pct}%` }}/>
                  </div>
                  {r.teacherNote && (
                    <p className="mt-2 text-[10px] font-medium text-slate-500 leading-relaxed pl-1 border-l-2 border-slate-200">
                      {r.teacherNote}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Summary row when collapsed and single subject */}
        {!expanded && item.results.length === 1 && (
          <div className="px-4 pb-3 flex items-center gap-2 flex-wrap border-t border-slate-50 pt-2.5">
            <span className="text-base">{SUBJ_ICON[item.results[0].subject] ?? '📝'}</span>
            <span className="font-bold text-slate-700 text-xs">{item.results[0].subject}</span>
            {item.results[0].rank && (
              <div className="flex items-center gap-1 bg-amber-50 border border-amber-100 rounded-lg px-1.5 py-0.5">
                <Medal size={9} className="text-amber-500"/>
                <span className="font-black text-amber-700 text-[10px]">
                  {item.results[0].rank}<sup>{rankSuffix(item.results[0].rank)}</sup>
                </span>
              </div>
            )}
            <span className="text-[10px] font-bold text-slate-400">
              {item.results[0].obtainedMarks}/{item.results[0].maxMarks}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

/* ─── Placeholder when no data ────────────────────── */
const _BookOpen = BookOpen; void _BookOpen;
