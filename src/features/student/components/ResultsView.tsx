import React, { useEffect, useState } from 'react';
import { ArrowLeft, Trophy, Star, User, MessageSquare, Medal } from 'lucide-react';
import { studentDashboardService } from '../../../services/studentDashboard.service';
import { StudentExamResult } from '../../../types/student.types';

interface Props { onBack: () => void; }

const gradeStyle = (g: string) => {
  if (g.startsWith('A+')) return { text: 'text-emerald-700', bg: 'bg-emerald-100', border: 'border-emerald-200' };
  if (g.startsWith('A'))  return { text: 'text-emerald-600', bg: 'bg-emerald-50',  border: 'border-emerald-100' };
  if (g.startsWith('B+')) return { text: 'text-blue-700',    bg: 'bg-blue-100',    border: 'border-blue-200' };
  if (g.startsWith('B'))  return { text: 'text-blue-600',    bg: 'bg-blue-50',     border: 'border-blue-100' };
  if (g.startsWith('C'))  return { text: 'text-amber-600',   bg: 'bg-amber-50',    border: 'border-amber-100' };
  return                          { text: 'text-rose-600',   bg: 'bg-rose-50',     border: 'border-rose-100' };
};

const barColor = (pct: number) =>
  pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-blue-500' : pct >= 40 ? 'bg-amber-400' : 'bg-rose-400';

const subjectIcon: Record<string, string> = {
  Mathematics: '📐', Science: '🔬', English: '📖',
  Hindi: '✍️', 'Social Studies': '🌍', 'Computer Science': '💻',
  'Physical Education': '⚽', default: '📝',
};

const rankSuffix = (n: number) =>
  n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th';

export const ResultsView: React.FC<Props> = ({ onBack }) => {
  const [results, setResults] = useState<StudentExamResult[]>([]);

  useEffect(() => { studentDashboardService.getResults().then(setResults); }, []);

  const unitTests = results.filter(r => r.testType === 'UNIT_TEST');
  const termExams = results.filter(r => r.testType === 'MID_TERM' || r.testType === 'FINAL');

  const avgPercent = results.length > 0
    ? Math.round(results.reduce((a, r) => a + (r.obtainedMarks / r.maxMarks) * 100, 0) / results.length)
    : 0;

  const bestResult = results.reduce<StudentExamResult | null>((best, r) =>
    !best || (r.obtainedMarks / r.maxMarks) > (best.obtainedMarks / best.maxMarks) ? r : best
  , null);

  // Group unit tests by exam name, then by subject (each subject = separate card)
  const unitTestGroups = unitTests.reduce<Record<string, StudentExamResult[]>>((acc, r) => {
    if (!acc[r.examName]) acc[r.examName] = [];
    acc[r.examName].push(r);
    return acc;
  }, {});

  // Group term exams by exam name (all subjects together in one card)
  const termExamGroups = termExams.reduce<Record<string, StudentExamResult[]>>((acc, r) => {
    if (!acc[r.examName]) acc[r.examName] = [];
    acc[r.examName].push(r);
    return acc;
  }, {});

  const performanceLabel = avgPercent >= 85 ? 'Outstanding' : avgPercent >= 75 ? 'Excellent' : avgPercent >= 60 ? 'Good' : avgPercent >= 45 ? 'Average' : 'Needs Work';

  return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">

      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
        <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">My Results</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-5">

        {/* ── Overall Performance ──────────────────────────────────── */}
        <div className="bg-[#0d1b3e] rounded-3xl p-5 text-white">
          <p className="text-[10px] font-black uppercase tracking-widest text-blue-300 mb-3">Overall Performance</p>
          <div className="flex items-end gap-4 mb-4">
            <div className="text-6xl font-black text-white leading-none tabular-nums">
              {avgPercent}<span className="text-3xl text-blue-300">%</span>
            </div>
            <div className="pb-1">
              <div className="text-sm font-black text-blue-100">{performanceLabel}</div>
              <div className="text-[10px] font-bold text-blue-300 mt-0.5">{results.length} exams · All subjects</div>
            </div>
          </div>
          <div className="bg-white/10 rounded-full h-2 mb-4">
            <div className="h-2 rounded-full bg-gradient-to-r from-blue-400 to-emerald-400"
              style={{ width: `${avgPercent}%` }} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Total Exams', val: results.length },
              { label: 'Avg Score',   val: `${avgPercent}%` },
              { label: 'Top Score',   val: bestResult ? `${Math.round((bestResult.obtainedMarks / bestResult.maxMarks) * 100)}%` : '—' },
            ].map(({ label, val }) => (
              <div key={label} className="bg-white/10 rounded-xl p-2.5 text-center">
                <div className="font-black text-white text-base">{val}</div>
                <div className="text-[9px] font-black uppercase tracking-widest text-blue-300 mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Best Score ───────────────────────────────────────────── */}
        {bestResult && (
          <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 flex items-center gap-3">
            <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
              <Star size={17} className="text-amber-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[9px] font-black uppercase tracking-widest text-amber-500 mb-0.5">Best Performance</div>
              <div className="font-extrabold text-slate-900 text-sm leading-tight truncate">
                {subjectIcon[bestResult.subject] ?? '📝'} {bestResult.subject}
              </div>
              <div className="text-[10px] font-bold text-slate-400">{bestResult.examName}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="font-black text-amber-600 text-xl">
                {Math.round((bestResult.obtainedMarks / bestResult.maxMarks) * 100)}%
              </div>
              <div className="text-[10px] font-bold text-amber-400">{bestResult.obtainedMarks}/{bestResult.maxMarks}</div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════
            SECTION 1 — CLASS TESTS (Unit Tests)
            Each subject = individual card
        ══════════════════════════════════════════════════════════ */}
        {Object.keys(unitTestGroups).length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-5 bg-blue-500 rounded-full" />
              <h3 className="font-black text-slate-800 text-sm uppercase tracking-widest">Class Tests</h3>
            </div>

            {Object.entries(unitTestGroups).map(([examName, examResults]) => (
              <div key={examName} className="mb-4">
                {/* Exam label */}
                <div className="text-[10px] font-black uppercase tracking-widest text-blue-600 bg-blue-50 border border-blue-100 rounded-xl px-3 py-1.5 inline-block mb-2">
                  {examName}
                </div>

                {/* One card per subject */}
                <div className="space-y-2.5">
                  {examResults.map(r => {
                    const pct = r.maxMarks > 0 ? Math.round((r.obtainedMarks / r.maxMarks) * 100) : 0;
                    const gs = gradeStyle(r.grade);
                    return (
                      <div key={r.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                        {/* Subject row */}
                        <div className="px-4 pt-3.5 pb-2 flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5 flex-1 min-w-0">
                            <span className="text-xl shrink-0">{subjectIcon[r.subject] ?? '📝'}</span>
                            <div className="min-w-0">
                              <div className="font-black text-slate-900 text-sm leading-tight">{r.subject}</div>
                              <div className="flex items-center gap-1 mt-0.5">
                                <User size={9} className="text-slate-400 shrink-0" />
                                <span className="text-[10px] font-bold text-slate-400 truncate">{r.teacherName}</span>
                                <span className="text-slate-300 mx-0.5">·</span>
                                <span className="text-[10px] font-bold text-slate-400">{r.date}</span>
                              </div>
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className={`text-xl font-black tabular-nums ${pct >= 75 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-rose-500'}`}>
                              {pct}%
                            </div>
                          </div>
                        </div>

                        {/* Progress bar */}
                        <div className="px-4 mb-3">
                          <div className="bg-slate-100 rounded-full h-1.5">
                            <div className={`h-1.5 rounded-full ${barColor(pct)}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>

                        {/* Stats row */}
                        <div className="px-4 pb-3 flex items-center gap-2 flex-wrap">
                          {/* Marks */}
                          <div className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-1.5 text-center">
                            <div className="font-black text-slate-900 text-sm tabular-nums">{r.obtainedMarks}<span className="text-slate-400 font-bold">/{r.maxMarks}</span></div>
                            <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Marks</div>
                          </div>
                          {/* Grade */}
                          <div className={`border rounded-xl px-3 py-1.5 text-center ${gs.bg} ${gs.border}`}>
                            <div className={`font-black text-sm ${gs.text}`}>{r.grade}</div>
                            <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Grade</div>
                          </div>
                          {/* Rank */}
                          {r.rank && (
                            <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-1.5 text-center flex items-center gap-1.5">
                              <Medal size={12} className="text-amber-500 shrink-0" />
                              <div>
                                <div className="font-black text-amber-700 text-sm tabular-nums">
                                  {r.rank}<sup className="font-black text-[9px]">{rankSuffix(r.rank)}</sup>
                                  <span className="text-[9px] font-bold text-amber-400">/{r.totalStudents}</span>
                                </div>
                                <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Rank</div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Teacher Note */}
                        {r.teacherNote && (
                          <div className="mx-4 mb-3 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 flex gap-2">
                            <MessageSquare size={12} className="text-slate-400 shrink-0 mt-0.5" />
                            <p className="text-[11px] font-medium text-slate-600 leading-relaxed">{r.teacherNote}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════
            SECTION 2 — TERM EXAMS (Mid Term + Final)
            All subjects grouped per exam
        ══════════════════════════════════════════════════════════ */}
        {Object.keys(termExamGroups).length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-5 bg-violet-500 rounded-full" />
              <h3 className="font-black text-slate-800 text-sm uppercase tracking-widest">Term Exams</h3>
            </div>

            <div className="space-y-4">
              {Object.entries(termExamGroups).map(([examName, examResults]) => {
                const total   = examResults.reduce((a, r) => a + r.obtainedMarks, 0);
                const maxTotal = examResults.reduce((a, r) => a + r.maxMarks, 0);
                const overallPct = maxTotal > 0 ? Math.round((total / maxTotal) * 100) : 0;
                const isFinal = examResults[0].testType === 'FINAL';

                return (
                  <div key={examName} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    {/* Card Header */}
                    <div className={`px-4 pt-4 pb-3 border-b border-slate-50 ${isFinal ? 'bg-gradient-to-r from-violet-50 to-indigo-50' : 'bg-slate-50'}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${isFinal ? 'bg-violet-100 text-violet-700 border-violet-200' : 'bg-blue-100 text-blue-700 border-blue-200'}`}>
                              {isFinal ? 'Final Exam' : 'Mid Term'}
                            </span>
                          </div>
                          <div className="font-black text-slate-900 text-base leading-tight">{examName}</div>
                          <div className="text-[10px] font-bold text-slate-400 mt-0.5">{examResults.length} subjects · {examResults[0].date}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className={`text-3xl font-black tabular-nums leading-none ${overallPct >= 75 ? 'text-emerald-600' : overallPct >= 50 ? 'text-amber-600' : 'text-rose-500'}`}>
                            {overallPct}<span className="text-lg">%</span>
                          </div>
                          <div className="text-[10px] font-bold text-slate-400 mt-1">{total}/{maxTotal} marks</div>
                        </div>
                      </div>
                      {/* Overall progress bar */}
                      <div className="bg-white/60 rounded-full h-1.5 mt-3">
                        <div className={`h-1.5 rounded-full ${barColor(overallPct)}`} style={{ width: `${overallPct}%` }} />
                      </div>
                    </div>

                    {/* Subject rows */}
                    <div className="p-3 space-y-2">
                      {examResults.map(r => {
                        const pct = r.maxMarks > 0 ? Math.round((r.obtainedMarks / r.maxMarks) * 100) : 0;
                        const gs  = gradeStyle(r.grade);
                        return (
                          <div key={r.id} className="bg-slate-50 rounded-xl p-3">
                            {/* Subject + teacher */}
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-base shrink-0">{subjectIcon[r.subject] ?? '📝'}</span>
                                <div className="min-w-0">
                                  <div className="font-extrabold text-slate-800 text-xs leading-tight">{r.subject}</div>
                                  <div className="flex items-center gap-1">
                                    <User size={8} className="text-slate-400 shrink-0" />
                                    <span className="text-[9px] font-bold text-slate-400 truncate">{r.teacherName}</span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {r.rank && (
                                  <div className="flex items-center gap-1 bg-amber-50 border border-amber-100 rounded-lg px-1.5 py-0.5">
                                    <Medal size={9} className="text-amber-500" />
                                    <span className="font-black text-amber-700 text-[10px] tabular-nums">
                                      {r.rank}<sup className="font-black text-[8px]">{rankSuffix(r.rank)}</sup>
                                    </span>
                                  </div>
                                )}
                                <div className={`border rounded-lg px-2 py-0.5 font-black text-xs ${gs.bg} ${gs.border} ${gs.text}`}>
                                  {r.grade}
                                </div>
                                <div className="font-black text-slate-800 text-xs tabular-nums w-14 text-right">
                                  {r.obtainedMarks}/{r.maxMarks}
                                </div>
                              </div>
                            </div>
                            {/* Progress bar */}
                            <div className="bg-slate-200 rounded-full h-1">
                              <div className={`h-1 rounded-full ${barColor(pct)}`} style={{ width: `${pct}%` }} />
                            </div>
                            {/* Teacher note */}
                            {r.teacherNote && (
                              <div className="mt-2 flex gap-1.5">
                                <MessageSquare size={10} className="text-slate-400 shrink-0 mt-0.5" />
                                <p className="text-[10px] font-medium text-slate-500 leading-relaxed">{r.teacherNote}</p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {results.length === 0 && (
          <div className="flex flex-col items-center py-16 text-slate-400">
            <Trophy size={36} className="mb-3 opacity-30" />
            <p className="font-bold text-sm">No results yet</p>
          </div>
        )}

      </div>
    </div>
  );
};
