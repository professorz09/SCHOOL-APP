import React, { useEffect, useState } from 'react';
import { ArrowLeft, Trophy, Star, TrendingUp, BookOpen } from 'lucide-react';
import { studentDashboardService } from '../../../services/studentDashboard.service';
import { StudentExamResult } from '../../../types/student.types';

interface Props { onBack: () => void; }

const TYPE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  UNIT_TEST: { label: 'Unit Test',  color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-100' },
  MID_TERM:  { label: 'Mid Term',   color: 'text-violet-700', bg: 'bg-violet-50 border-violet-100' },
  FINAL:     { label: 'Final',      color: 'text-rose-700',   bg: 'bg-rose-50 border-rose-100' },
  QUIZ:      { label: 'Quiz',       color: 'text-emerald-700',bg: 'bg-emerald-50 border-emerald-100' },
  PRACTICAL: { label: 'Practical',  color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-100' },
};

const gradeInfo = (g: string) => {
  if (g.startsWith('A+')) return { color: 'text-emerald-600', bg: 'bg-emerald-100' };
  if (g.startsWith('A'))  return { color: 'text-emerald-600', bg: 'bg-emerald-50' };
  if (g.startsWith('B'))  return { color: 'text-blue-600',    bg: 'bg-blue-50' };
  if (g.startsWith('C'))  return { color: 'text-amber-600',   bg: 'bg-amber-50' };
  return                         { color: 'text-rose-600',    bg: 'bg-rose-50' };
};

const barColor = (pct: number) =>
  pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-blue-500' : pct >= 40 ? 'bg-amber-400' : 'bg-rose-400';

const ALL_TYPES = ['ALL', 'UNIT_TEST', 'MID_TERM', 'FINAL', 'QUIZ', 'PRACTICAL'];

export const ResultsView: React.FC<Props> = ({ onBack }) => {
  const [results, setResults] = useState<StudentExamResult[]>([]);
  const [filter, setFilter] = useState<string>('ALL');

  useEffect(() => { studentDashboardService.getResults().then(setResults); }, []);

  const availableTypes = ALL_TYPES.filter(t => t === 'ALL' || results.some(r => r.testType === t));
  const filtered = filter === 'ALL' ? results : results.filter(r => r.testType === filter);

  const avgPercent = results.length > 0
    ? Math.round(results.reduce((a, r) => a + (r.obtainedMarks / r.maxMarks) * 100, 0) / results.length)
    : 0;

  const bestResult = results.reduce<StudentExamResult | null>((best, r) => {
    if (!best) return r;
    return (r.obtainedMarks / r.maxMarks) > (best.obtainedMarks / best.maxMarks) ? r : best;
  }, null);

  const groupedByExam = filtered.reduce<Record<string, StudentExamResult[]>>((acc, r) => {
    if (!acc[r.examName]) acc[r.examName] = [];
    acc[r.examName].push(r);
    return acc;
  }, {});

  const performanceLabel = avgPercent >= 80 ? 'Excellent' : avgPercent >= 65 ? 'Good' : avgPercent >= 50 ? 'Average' : 'Needs Work';

  return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">

      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
        <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">My Results</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-4">

        {/* ── Overall Performance Card ─────────────────────────────── */}
        <div className="bg-[#0d1b3e] rounded-3xl p-5 text-white">
          <p className="text-[10px] font-black uppercase tracking-widest text-blue-300 mb-3">Overall Performance</p>
          <div className="flex items-end gap-4 mb-4">
            <div className="text-6xl font-black text-white leading-none tabular-nums">{avgPercent}<span className="text-3xl text-blue-300">%</span></div>
            <div className="pb-1">
              <div className="text-sm font-black text-blue-100">{performanceLabel}</div>
              <div className="text-[10px] font-bold text-blue-300 mt-0.5">{results.length} exams · All subjects</div>
            </div>
          </div>
          {/* Progress bar */}
          <div className="bg-white/10 rounded-full h-2 mb-4">
            <div className="h-2 rounded-full bg-gradient-to-r from-blue-400 to-emerald-400 transition-all duration-700"
              style={{ width: `${avgPercent}%` }} />
          </div>
          {/* Mini stats */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Exams', val: results.length },
              { label: 'Avg Score', val: `${avgPercent}%` },
              { label: 'Best', val: bestResult ? `${Math.round((bestResult.obtainedMarks / bestResult.maxMarks) * 100)}%` : '—' },
            ].map(({ label, val }) => (
              <div key={label} className="bg-white/10 rounded-xl p-2.5 text-center">
                <div className="font-black text-white text-base">{val}</div>
                <div className="text-[9px] font-black uppercase tracking-widest text-blue-300 mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Best Score highlight ─────────────────────────────────── */}
        {bestResult && (
          <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 flex items-center gap-3">
            <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
              <Star size={18} className="text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-black uppercase tracking-widest text-amber-600">Top Score</div>
              <div className="font-extrabold text-slate-900 text-sm truncate">{bestResult.subject} · {bestResult.examName}</div>
            </div>
            <div className="font-black text-amber-600 text-lg shrink-0">
              {Math.round((bestResult.obtainedMarks / bestResult.maxMarks) * 100)}%
            </div>
          </div>
        )}

        {/* ── Type Filter chips ────────────────────────────────────── */}
        <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
          {availableTypes.map(t => {
            const cfg = t === 'ALL' ? null : TYPE_CONFIG[t];
            const active = filter === t;
            return (
              <button key={t} onClick={() => setFilter(t)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${
                  active
                    ? 'bg-slate-900 text-white border-slate-900'
                    : cfg
                      ? `${cfg.bg} ${cfg.color} border-current`
                      : 'bg-white text-slate-500 border-slate-200'
                }`}>
                {t === 'ALL' ? 'All' : cfg?.label}
              </button>
            );
          })}
        </div>

        {/* ── Exam Cards ───────────────────────────────────────────── */}
        {Object.entries(groupedByExam).map(([examName, examResults]) => {
          const total = examResults.reduce((a, r) => a + r.obtainedMarks, 0);
          const max   = examResults.reduce((a, r) => a + r.maxMarks, 0);
          const pct   = max > 0 ? Math.round((total / max) * 100) : 0;
          const cfg   = TYPE_CONFIG[examResults[0].testType] ?? TYPE_CONFIG['UNIT_TEST'];
          const gi    = gradeInfo(examResults[0].grade);

          return (
            <div key={examName} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">

              {/* Card header */}
              <div className="px-4 pt-4 pb-3 border-b border-slate-50">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-black text-slate-900 text-sm leading-tight">{examName}</div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase border ${cfg.bg} ${cfg.color}`}>
                        {cfg.label}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400">{examResults[0].date}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`text-2xl font-black tabular-nums ${pct >= 75 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-rose-500'}`}>
                      {pct}<span className="text-base">%</span>
                    </div>
                    <div className="text-[10px] font-bold text-slate-400">{total}/{max} marks</div>
                  </div>
                </div>
                {/* Overall progress bar */}
                <div className="bg-slate-100 rounded-full h-1.5">
                  <div className={`h-1.5 rounded-full transition-all duration-500 ${barColor(pct)}`}
                    style={{ width: `${pct}%` }} />
                </div>
              </div>

              {/* Subject rows */}
              <div className="p-4 space-y-3">
                {examResults.map(r => {
                  const subPct = r.maxMarks > 0 ? Math.round((r.obtainedMarks / r.maxMarks) * 100) : 0;
                  const gradeI = gradeInfo(r.grade);
                  return (
                    <div key={r.id}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <BookOpen size={11} className="text-slate-400 shrink-0" />
                          <span className="text-xs font-extrabold text-slate-700">{r.subject}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {r.rank && (
                            <span className="text-[9px] font-black bg-amber-50 text-amber-700 border border-amber-100 px-1.5 py-0.5 rounded-lg">
                              #{r.rank}
                            </span>
                          )}
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg ${gradeI.bg} ${gradeI.color}`}>
                            {r.grade}
                          </span>
                          <span className="text-xs font-black text-slate-700 tabular-nums w-14 text-right">
                            {r.obtainedMarks}/{r.maxMarks}
                          </span>
                        </div>
                      </div>
                      <div className="bg-slate-100 rounded-full h-1.5">
                        <div className={`h-1.5 rounded-full transition-all duration-500 ${barColor(subPct)}`}
                          style={{ width: `${subPct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="flex flex-col items-center py-16 text-slate-400">
            <Trophy size={36} className="mb-3 opacity-30" />
            <p className="font-bold text-sm">No results yet</p>
          </div>
        )}

      </div>
    </div>
  );
};
