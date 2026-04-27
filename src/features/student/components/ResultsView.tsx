import React, { useEffect, useState } from 'react';
import { ArrowLeft, Trophy, Star, User, MessageSquare, Medal, Calendar, Clock } from 'lucide-react';
import { studentDashboardService, UpcomingExam } from '../../../services/studentDashboard.service';
import { StudentExamResult } from '../../../types/student.types';

interface Props { onBack: () => void; }

const barColor = (pct: number) =>
  pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-blue-500' : pct >= 40 ? 'bg-amber-400' : 'bg-rose-400';

const pctColor = (pct: number) =>
  pct >= 75 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-rose-500';

const PassFail = ({ pct }: { pct: number }) =>
  pct >= 33
    ? <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">Pass</span>
    : <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200">Fail</span>;

const rankSuffix = (n: number) => n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th';

const SUBJ_ICON: Record<string, string> = {
  Mathematics: '📐', Science: '🔬', English: '📖',
  Hindi: '✍️', 'Social Studies': '🌍', 'Computer Science': '💻', 'Physical Education': '⚽',
};

const TYPE_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  UNIT_TEST:  { label: 'Unit Test',  color: 'text-blue-700',    bg: 'bg-blue-50',    border: 'border-blue-100' },
  MID_TERM:   { label: 'Mid Term',   color: 'text-violet-700',  bg: 'bg-violet-50',  border: 'border-violet-100' },
  FINAL:      { label: 'Final Exam', color: 'text-rose-700',    bg: 'bg-rose-50',    border: 'border-rose-100' },
  QUIZ:       { label: 'Quiz',       color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-100' },
  PRACTICAL:  { label: 'Practical',  color: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-100' },
};

export const ResultsView: React.FC<Props> = ({ onBack }) => {
  const [results, setResults]     = useState<StudentExamResult[]>([]);
  const [upcoming, setUpcoming]   = useState<UpcomingExam[]>([]);

  useEffect(() => {
    studentDashboardService.getResults().then(setResults);
    studentDashboardService.getScheduledExams().then(setUpcoming);
  }, []);

  const finalResults = results.filter(r => r.testType === 'FINAL');
  const otherResults = results.filter(r => r.testType !== 'FINAL');

  const avgPercent = results.length > 0
    ? Math.round(results.reduce((a, r) => a + (r.obtainedMarks / r.maxMarks) * 100, 0) / results.length)
    : 0;

  const bestResult = results.reduce<StudentExamResult | null>((best, r) =>
    !best || (r.obtainedMarks / r.maxMarks) > (best.obtainedMarks / best.maxMarks) ? r : best, null);

  const otherGroups = otherResults.reduce<Record<string, StudentExamResult[]>>((acc, r) => {
    if (!acc[r.examName]) acc[r.examName] = [];
    acc[r.examName].push(r);
    return acc;
  }, {});

  const finalGroup = finalResults.reduce<Record<string, StudentExamResult[]>>((acc, r) => {
    if (!acc[r.examName]) acc[r.examName] = [];
    acc[r.examName].push(r);
    return acc;
  }, {});

  const performanceLabel =
    avgPercent >= 85 ? 'Outstanding' : avgPercent >= 75 ? 'Excellent' :
    avgPercent >= 60 ? 'Good'        : avgPercent >= 45 ? 'Average'    : 'Needs Work';

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
        <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600"><ArrowLeft size={20}/></button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">My Results</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-5">

        {/* ── Overall Performance ── */}
        <div className="bg-[#0d1b3e] rounded-3xl p-5 text-white">
          <p className="text-[10px] font-black uppercase tracking-widest text-blue-300 mb-3">Overall Performance</p>
          <div className="flex items-end gap-4 mb-4">
            <div className="text-6xl font-black leading-none tabular-nums">
              {avgPercent}<span className="text-3xl text-blue-300">%</span>
            </div>
            <div className="pb-1">
              <div className="text-sm font-black text-blue-100">{performanceLabel}</div>
              <div className="text-[10px] font-bold text-blue-300 mt-0.5">{results.length} exams · All subjects</div>
            </div>
          </div>
          <div className="bg-white/10 rounded-full h-2 mb-4">
            <div className="h-2 rounded-full bg-gradient-to-r from-blue-400 to-emerald-400" style={{ width: `${avgPercent}%` }}/>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Total Exams', val: String(results.length) },
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

        {/* ── Best Score ── */}
        {bestResult && (
          <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 flex items-center gap-3">
            <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center shrink-0"><Star size={17} className="text-amber-500"/></div>
            <div className="flex-1 min-w-0">
              <div className="text-[9px] font-black uppercase tracking-widest text-amber-500 mb-0.5">Best Performance</div>
              <div className="font-extrabold text-slate-900 text-sm">{SUBJ_ICON[bestResult.subject] ?? '📝'} {bestResult.subject}</div>
              <div className="text-[10px] font-bold text-slate-400">{bestResult.examName}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="font-black text-amber-600 text-xl">{Math.round((bestResult.obtainedMarks / bestResult.maxMarks) * 100)}%</div>
              <div className="text-[10px] font-bold text-amber-400">{bestResult.obtainedMarks}/{bestResult.maxMarks}</div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════
            SCHEDULED EXAMS (upcoming / pending)
        ════════════════════════════════════════ */}
        {upcoming.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-5 bg-indigo-500 rounded-full"/>
              <h3 className="font-black text-slate-800 text-sm uppercase tracking-widest">Scheduled Exams</h3>
            </div>
            <div className="space-y-2.5">
              {upcoming.map(ex => {
                const cfg = TYPE_CONFIG[ex.testType] ?? TYPE_CONFIG['UNIT_TEST'];
                const isPast = ex.scheduledDate < today;
                return (
                  <div key={ex.id} className={`rounded-2xl border shadow-sm p-4 ${ex.isFinal ? 'bg-gradient-to-r from-rose-50 to-orange-50 border-rose-100' : 'bg-white border-slate-100'}`}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase border ${ex.isFinal ? 'bg-rose-100 text-rose-700 border-rose-200' : `${cfg.bg} ${cfg.color} ${cfg.border}`}`}>
                            {ex.isFinal ? 'Final Exam' : cfg.label}
                          </span>
                          {isPast && (
                            <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100">Results Awaited</span>
                          )}
                        </div>
                        <div className="font-extrabold text-slate-900 text-sm leading-tight">{ex.title}</div>
                        {ex.isFinal && <div className="text-[10px] font-bold text-slate-400 mt-0.5 leading-relaxed">{ex.subject}</div>}
                        {!ex.isFinal && <div className="text-[10px] font-bold text-slate-500 mt-0.5">{ex.subject}</div>}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-black text-slate-800 text-sm">{ex.maxMarks}</div>
                        <div className="text-[9px] font-bold text-slate-400">marks</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] font-bold text-slate-500">
                      <span className="flex items-center gap-1"><Calendar size={10} className="text-slate-400"/>{ex.scheduledDate}</span>
                      <span className="flex items-center gap-1"><Clock size={10} className="text-slate-400"/>{ex.duration} min</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════
            FINAL EXAM RESULTS — own section
        ════════════════════════════════════════ */}
        {Object.keys(finalGroup).length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-5 bg-rose-500 rounded-full"/>
              <h3 className="font-black text-slate-800 text-sm uppercase tracking-widest">Final Exam</h3>
            </div>
            {Object.entries(finalGroup).map(([examName, examResults]) => {
              const total    = examResults.reduce((a, r) => a + r.obtainedMarks, 0);
              const maxTotal = examResults.reduce((a, r) => a + r.maxMarks, 0);
              const overall  = maxTotal > 0 ? Math.round((total / maxTotal) * 100) : 0;
              return (
                <div key={examName} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-rose-50 to-orange-50 px-4 pt-4 pb-3 border-b border-rose-100/60">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full border bg-rose-100 text-rose-700 border-rose-200 inline-block mb-1">Final Exam</span>
                        <div className="font-black text-slate-900 text-base leading-tight">{examName}</div>
                        <div className="text-[10px] font-bold text-slate-400 mt-0.5">{examResults.length} subjects · {examResults[0].date}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`text-3xl font-black tabular-nums leading-none ${pctColor(overall)}`}>{overall}<span className="text-lg">%</span></div>
                        <div className="text-[10px] font-bold text-slate-400 mt-0.5">{total}/{maxTotal} marks</div>
                        <div className="mt-1"><PassFail pct={overall}/></div>
                      </div>
                    </div>
                    <div className="bg-white/60 rounded-full h-1.5">
                      <div className={`h-1.5 rounded-full ${barColor(overall)}`} style={{ width: `${overall}%` }}/>
                    </div>
                  </div>
                  <div className="p-3 space-y-2">
                    {examResults.map(r => {
                      const pct = r.maxMarks > 0 ? Math.round((r.obtainedMarks / r.maxMarks) * 100) : 0;
                      return (
                        <div key={r.id} className="bg-slate-50 rounded-xl p-3">
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-base shrink-0">{SUBJ_ICON[r.subject] ?? '📝'}</span>
                              <div className="min-w-0">
                                <div className="font-extrabold text-slate-800 text-xs">{r.subject}</div>
                                <div className="flex items-center gap-1"><User size={8} className="text-slate-400"/><span className="text-[9px] font-bold text-slate-400 truncate">{r.teacherName}</span></div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                              {r.rank && (
                                <div className="flex items-center gap-1 bg-amber-50 border border-amber-100 rounded-lg px-1.5 py-0.5">
                                  <Medal size={9} className="text-amber-500"/>
                                  <span className="font-black text-amber-700 text-[10px]">{r.rank}<sup className="text-[8px]">{rankSuffix(r.rank)}</sup></span>
                                </div>
                              )}
                              <PassFail pct={pct}/>
                              <span className={`font-black text-sm tabular-nums ${pctColor(pct)}`}>{pct}%</span>
                              <span className="text-[10px] font-bold text-slate-500 tabular-nums">{r.obtainedMarks}/{r.maxMarks}</span>
                            </div>
                          </div>
                          <div className="bg-slate-200 rounded-full h-1">
                            <div className={`h-1 rounded-full ${barColor(pct)}`} style={{ width: `${pct}%` }}/>
                          </div>
                          {r.teacherNote && (
                            <div className="mt-2 flex gap-1.5">
                              <MessageSquare size={10} className="text-slate-400 shrink-0 mt-0.5"/>
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
        )}

        {/* ════════════════════════════════════════
            OTHER EXAMS (Unit Tests, Mid Term, etc.)
        ════════════════════════════════════════ */}
        {Object.keys(otherGroups).length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-5 bg-blue-500 rounded-full"/>
              <h3 className="font-black text-slate-800 text-sm uppercase tracking-widest">Other Exams</h3>
            </div>
            {Object.entries(otherGroups).map(([examName, examResults]) => {
              const isSingle = examResults.length === 1;
              const total    = examResults.reduce((a, r) => a + r.obtainedMarks, 0);
              const maxTotal = examResults.reduce((a, r) => a + r.maxMarks, 0);
              const overall  = maxTotal > 0 ? Math.round((total / maxTotal) * 100) : 0;
              const cfg = TYPE_CONFIG[examResults[0].testType] ?? TYPE_CONFIG['UNIT_TEST'];

              return (
                <div key={examName} className="mb-3">
                  {/* If single subject → simple card, if multiple → grouped card */}
                  {isSingle ? (
                    <SingleResultCard r={examResults[0]} examName={examName} cfg={cfg}/>
                  ) : (
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                      <div className="bg-slate-50 px-4 pt-3 pb-2.5 border-b border-slate-100">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div>
                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase border ${cfg.bg} ${cfg.color} ${cfg.border}`}>{cfg.label}</span>
                            <div className="font-black text-slate-900 text-sm mt-1">{examName}</div>
                            <div className="text-[10px] font-bold text-slate-400">{examResults[0].date} · {examResults.length} subjects</div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className={`text-2xl font-black tabular-nums ${pctColor(overall)}`}>{overall}%</div>
                            <div className="text-[10px] font-bold text-slate-400">{total}/{maxTotal}</div>
                          </div>
                        </div>
                        <div className="bg-slate-200 rounded-full h-1.5">
                          <div className={`h-1.5 rounded-full ${barColor(overall)}`} style={{ width: `${overall}%` }}/>
                        </div>
                      </div>
                      <div className="p-3 space-y-2">
                        {examResults.map(r => {
                          const pct = r.maxMarks > 0 ? Math.round((r.obtainedMarks / r.maxMarks) * 100) : 0;
                          return (
                            <div key={r.id} className="bg-slate-50 rounded-xl p-3">
                              <div className="flex items-center justify-between gap-2 mb-1.5">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-base shrink-0">{SUBJ_ICON[r.subject] ?? '📝'}</span>
                                  <div className="min-w-0">
                                    <div className="font-extrabold text-slate-800 text-xs">{r.subject}</div>
                                    <div className="flex items-center gap-1"><User size={8} className="text-slate-400"/><span className="text-[9px] font-bold text-slate-400 truncate">{r.teacherName}</span></div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                                  {r.rank && <div className="flex items-center gap-1 bg-amber-50 border border-amber-100 rounded-lg px-1.5 py-0.5"><Medal size={9} className="text-amber-500"/><span className="font-black text-amber-700 text-[10px]">{r.rank}<sup className="text-[8px]">{rankSuffix(r.rank)}</sup></span></div>}
                                  <PassFail pct={pct}/>
                                  <span className={`font-black text-sm tabular-nums ${pctColor(pct)}`}>{pct}%</span>
                                  <span className="text-[10px] font-bold text-slate-500 tabular-nums">{r.obtainedMarks}/{r.maxMarks}</span>
                                </div>
                              </div>
                              <div className="bg-slate-200 rounded-full h-1"><div className={`h-1 rounded-full ${barColor(pct)}`} style={{ width: `${pct}%` }}/></div>
                              {r.teacherNote && <div className="mt-2 flex gap-1.5"><MessageSquare size={10} className="text-slate-400 shrink-0 mt-0.5"/><p className="text-[10px] font-medium text-slate-500 leading-relaxed">{r.teacherNote}</p></div>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

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

/* ── Single subject result card ──────────────────────── */
const SingleResultCard: React.FC<{
  r: StudentExamResult;
  examName: string;
  cfg: { label: string; color: string; bg: string; border: string };
}> = ({ r, examName, cfg }) => {
  const pct = r.maxMarks > 0 ? Math.round((r.obtainedMarks / r.maxMarks) * 100) : 0;
  const rankSuff = (n: number) => n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th';
  const bc = (p: number) => p >= 80 ? 'bg-emerald-500' : p >= 60 ? 'bg-blue-500' : p >= 40 ? 'bg-amber-400' : 'bg-rose-400';
  const pc = (p: number) => p >= 75 ? 'text-emerald-600' : p >= 50 ? 'text-amber-600' : 'text-rose-500';
  const pf = pct >= 33;
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-4 pt-3.5 pb-0 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="text-xl shrink-0">{SUBJ_ICON[r.subject] ?? '📝'}</span>
          <div>
            <div className="font-black text-slate-900 text-sm">{r.subject}</div>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase border ${cfg.bg} ${cfg.color} ${cfg.border}`}>{cfg.label}</span>
              <span className="text-[9px] font-bold text-slate-400">{examName}</span>
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <User size={9} className="text-slate-400"/>
              <span className="text-[10px] font-bold text-slate-400">{r.teacherName}</span>
              <span className="text-slate-300 mx-0.5">·</span>
              <span className="text-[10px] font-bold text-slate-400">{r.date}</span>
            </div>
          </div>
        </div>
        <div className={`text-2xl font-black tabular-nums shrink-0 ${pc(pct)}`}>{pct}%</div>
      </div>
      <div className="px-4 pt-2.5 pb-3">
        <div className="bg-slate-100 rounded-full h-1.5"><div className={`h-1.5 rounded-full ${bc(pct)}`} style={{ width: `${pct}%` }}/></div>
      </div>
      <div className="px-4 pb-3 flex items-center gap-2 flex-wrap">
        <div className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-1.5 flex items-baseline gap-1">
          <span className="font-black text-slate-900 text-sm tabular-nums">{r.obtainedMarks}</span>
          <span className="text-slate-400 font-bold text-xs">/ {r.maxMarks}</span>
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">marks</span>
        </div>
        {r.rank && (
          <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-1.5 flex items-center gap-1.5">
            <Medal size={12} className="text-amber-500"/>
            <span className="font-black text-amber-700 text-sm tabular-nums">{r.rank}<sup className="text-[9px]">{rankSuff(r.rank)}</sup></span>
            <span className="text-[9px] font-bold text-amber-400">/{r.totalStudents}</span>
          </div>
        )}
        {pf
          ? <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">Pass</span>
          : <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200">Fail</span>}
      </div>
      {r.teacherNote && (
        <div className="mx-4 mb-3 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 flex gap-2">
          <MessageSquare size={11} className="text-slate-400 shrink-0 mt-0.5"/>
          <p className="text-[11px] font-medium text-slate-600 leading-relaxed">{r.teacherNote}</p>
        </div>
      )}
    </div>
  );
};
