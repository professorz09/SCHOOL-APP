import React, { useEffect, useState } from 'react';
import { ArrowLeft, Trophy, TrendingUp } from 'lucide-react';
import { studentDashboardService } from '../../../services/student.service2';
import { StudentExamResult } from '../../../types/student.types';

interface Props { onBack: () => void; }

const testTypeColor = (t: string) => {
  const map: Record<string, string> = {
    UNIT_TEST: 'bg-blue-50 text-blue-700',
    MID_TERM: 'bg-violet-50 text-violet-700',
    FINAL: 'bg-rose-50 text-rose-700',
    QUIZ: 'bg-emerald-50 text-emerald-700',
    PRACTICAL: 'bg-amber-50 text-amber-700',
  };
  return map[t] ?? 'bg-slate-100 text-slate-600';
};

const gradeColor = (g: string) =>
  g.startsWith('A') ? 'text-emerald-600' : g.startsWith('B') ? 'text-blue-600' : g.startsWith('C') ? 'text-amber-600' : 'text-rose-500';

export const ResultsView: React.FC<Props> = ({ onBack }) => {
  const [results, setResults] = useState<StudentExamResult[]>([]);
  const [filter, setFilter] = useState<string>('ALL');

  useEffect(() => { studentDashboardService.getResults().then(setResults); }, []);

  const examTypes = ['ALL', ...Array.from(new Set(results.map(r => r.testType)))];
  const filtered = filter === 'ALL' ? results : results.filter(r => r.testType === filter);

  const avgPercent = results.length > 0
    ? Math.round(results.reduce((a, r) => a + (r.obtainedMarks / r.maxMarks) * 100, 0) / results.length)
    : 0;

  const groupedByExam = filtered.reduce<Record<string, StudentExamResult[]>>((acc, r) => {
    const key = `${r.examName}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

  return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-4 pt-12 pb-4 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
        <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600"><ArrowLeft size={20} /></button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Exam Results</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-4">
        {/* Overall */}
        <div className="bg-slate-900 rounded-2xl p-4 text-white">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Overall Performance</p>
          <div className="flex items-center gap-4">
            <div className="text-4xl font-black text-amber-400">{avgPercent}%</div>
            <div>
              <div className="text-sm font-black text-white">Avg Score</div>
              <div className="text-[10px] font-bold text-slate-400">{results.length} exams taken</div>
            </div>
          </div>
        </div>

        {/* Filter */}
        <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
          {examTypes.map(t => (
            <button key={t} onClick={() => setFilter(t)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors ${filter === t ? 'bg-slate-900 text-white' : 'bg-white text-slate-500 border border-slate-200'}`}>
              {t.replace('_', ' ')}
            </button>
          ))}
        </div>

        {/* Grouped results */}
        {Object.entries(groupedByExam).map(([examName, examResults]) => {
          const total = examResults.reduce((a, r) => a + r.obtainedMarks, 0);
          const max = examResults.reduce((a, r) => a + r.maxMarks, 0);
          const pct = max > 0 ? Math.round((total / max) * 100) : 0;
          return (
            <div key={examName} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="bg-slate-50 px-4 py-3 flex items-center justify-between border-b border-slate-100">
                <div>
                  <div className="font-black text-slate-900 text-sm">{examName}</div>
                  <div className="flex gap-2 mt-1">
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${testTypeColor(examResults[0].testType)}`}>
                      {examResults[0].testType.replace('_', ' ')}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">{examResults[0].date}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-2xl font-black ${pct >= 75 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-rose-500'}`}>{pct}%</div>
                  <div className="text-[10px] font-bold text-slate-400">{total}/{max}</div>
                </div>
              </div>
              <div className="p-4 space-y-2">
                {examResults.map(r => {
                  const subPct = r.maxMarks > 0 ? Math.round((r.obtainedMarks / r.maxMarks) * 100) : 0;
                  return (
                    <div key={r.id} className="flex items-center gap-3">
                      <div className="w-24 text-[11px] font-bold text-slate-600 truncate">{r.subject}</div>
                      <div className="flex-1 bg-slate-100 rounded-full h-2">
                        <div className={`h-2 rounded-full ${subPct >= 75 ? 'bg-emerald-500' : subPct >= 50 ? 'bg-amber-400' : 'bg-rose-400'}`} style={{ width: `${subPct}%` }} />
                      </div>
                      <div className="text-[11px] font-black text-slate-700 w-12 text-right">{r.obtainedMarks}/{r.maxMarks}</div>
                      <div className={`text-[11px] font-black w-8 ${gradeColor(r.grade)}`}>{r.grade}</div>
                      {r.rank && <div className="text-[9px] font-black bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-lg">#{r.rank}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="flex flex-col items-center py-16 text-slate-400">
            <Trophy size={32} className="mb-3 opacity-40" />
            <p className="font-bold text-sm">No results available</p>
          </div>
        )}
      </div>
    </div>
  );
};
