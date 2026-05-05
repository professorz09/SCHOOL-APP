import React, { useEffect, useState } from 'react';
import {
  ArrowLeft, BookOpen, CheckCircle, Clock, ChevronRight,
  Users, Filter, Trophy, AlertCircle, Lock, Unlock, FileText,
  Pencil, Save, ShieldAlert,
} from 'lucide-react';
import { examService } from '@/modules/exams/exam.service';
import { useAcademicYear } from '@/shared/context/AcademicYearContext';
import { useUIStore } from '@/store/uiStore';
import { useEditorModeStore } from '@/store/editorModeStore';
import { apiExams } from '@/lib/apiClient';
import { logAudit } from '@/lib/audit';
import { Marksheet } from '@/modules/exams/components/Marksheet';

interface Props { onBack: () => void; }

type View = 'LIST' | 'RESULTS' | 'MARKSHEET';

const TYPE_COLOR: Record<string, string> = {
  UNIT_TEST: 'bg-blue-50 text-blue-700 border-blue-100',
  MID_TERM:  'bg-violet-50 text-violet-700 border-violet-100',
  FINAL:     'bg-rose-50 text-rose-700 border-rose-100',
  QUIZ:      'bg-emerald-50 text-emerald-700 border-emerald-100',
  PRACTICAL: 'bg-amber-50 text-amber-700 border-amber-100',
};
const TYPE_LABEL: Record<string, string> = {
  UNIT_TEST: 'Unit Test', MID_TERM: 'Mid Term', FINAL: 'Final',
  QUIZ: 'Quiz', PRACTICAL: 'Practical',
};

function parseSubjectsDisplay(exam: any): string {
  if (!exam.subject?.includes(',')) return exam.subject ?? '';
  try {
    const parsed = JSON.parse(exam.syllabus ?? '');
    if (Array.isArray(parsed?.subjects)) {
      return (parsed.subjects as { subject: string }[]).map(s => s.subject).join(' · ');
    }
  } catch { /* not JSON */ }
  return exam.subject;
}

export const PrincipalExamsManager: React.FC<Props> = ({ onBack }) => {
  const { activeYear } = useAcademicYear();
  const { showToast } = useUIStore();
  const [view, setView]           = useState<View>('LIST');
  const [exams, setExams]         = useState<any[]>([]);
  const [loading, setLoading]     = useState(false);
  const [filterClass, setFilterClass] = useState('');
  const [filterDone, setFilterDone]   = useState<'ALL' | 'PENDING' | 'DONE'>('ALL');
  const [picked, setPicked]       = useState<any | null>(null);
  const [results, setResults]     = useState<any[]>([]);
  const [loadingRes, setLoadingRes] = useState(false);
  const [lockingExam, setLockingExam] = useState<string | null>(null);
  const [passMarksModal, setPassMarksModal] = useState<any | null>(null);
  const [passMarksValue, setPassMarksValue] = useState('');
  const [passMarksConfig, setPassMarksConfig] = useState<Record<string, number>>({});
  // Editor-mode-gated inline marks editing for already-locked results
  const editorModeActive = useEditorModeStore(s => s.isActive());
  const [editing, setEditing]       = useState(false);
  const [editMarks, setEditMarks]   = useState<Record<string, string>>({}); // resultId -> marks input
  const [savingEdits, setSavingEdits] = useState(false);

  useEffect(() => {
    if (!activeYear) return;
    setLoading(true);
    examService.getExams(activeYear.id)
      .then((data: any[]) => setExams(data.sort((a, b) =>
        new Date(b.scheduled_date).getTime() - new Date(a.scheduled_date).getTime()
      )))
      .catch(() => setExams([]))
      .finally(() => setLoading(false));
  }, [activeYear?.id]);

  const openResults = (exam: any) => {
    setPicked(exam);
    setView('RESULTS');
    setLoadingRes(true);
    examService.getResults(exam.id)
      .then((data: any[]) => setResults(data.sort((a: any, b: any) => b.obtained_marks - a.obtained_marks)))
      .catch(() => setResults([]))
      .finally(() => setLoadingRes(false));
  };

  const handleLockResults = async (examId: string) => {
    setLockingExam(examId);
    try {
      await examService.lockResults(examId);
      setExams(exams.map(e => e.id === examId ? { ...e, result_status: 'LOCKED' } : e));
      if (picked?.id === examId) setPicked({ ...picked, result_status: 'LOCKED' });
      showToast('Exam results locked');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to lock results', 'error');
    } finally {
      setLockingExam(null);
    }
  };

  const beginEdit = () => {
    // Seed input values from current results so inputs aren't empty
    const seed: Record<string, string> = {};
    for (const r of results) seed[r.id ?? `${r.test_id}:${r.student_id}`] = String(r.obtained_marks ?? '');
    setEditMarks(seed);
    setEditing(true);
  };

  const cancelEdit = () => { setEditing(false); setEditMarks({}); };

  const saveEdits = async () => {
    if (!picked || !activeYear) return;
    const maxMarks = picked.max_marks ?? 100;
    const payload = results.map(r => {
      const key = r.id ?? `${r.test_id}:${r.student_id}`;
      const raw = editMarks[key] ?? String(r.obtained_marks ?? '');
      return { studentId: r.student_id, raw: String(raw).trim(), remarks: r.remarks ?? null };
    });
    // Empty-string was being silently coerced to 0 by Number('') — treat it
    // as "not edited" by reporting an explicit error so the principal sets a
    // value (or leaves the row alone). Also reject Infinity / negatives.
    if (payload.some(p => p.raw === '')) {
      showToast('Some students have no marks — set a value before saving', 'error');
      return;
    }
    const finalPayload = payload.map(p => ({
      studentId: p.studentId, marks: Number(p.raw), remarks: p.remarks,
    }));
    if (finalPayload.some(p =>
      !Number.isFinite(p.marks) || p.marks < 0 || p.marks > maxMarks
    )) {
      showToast(`Marks must be between 0 and ${maxMarks}`, 'error');
      return;
    }
    setSavingEdits(true);
    try {
      await apiExams.editResults(picked.id, {
        academicYearId: activeYear.id,
        results: finalPayload,
      });
      await logAudit('exam_results_edited', 'exam_results', picked.id, {
        count: payload.length, editorMode: editorModeActive,
      });
      // Refresh results
      const fresh = await examService.getResults(picked.id);
      setResults((fresh as any[]).sort((a, b) => b.obtained_marks - a.obtained_marks));
      setEditing(false);
      setEditMarks({});
      showToast('Results updated');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to save edits', 'error');
    } finally {
      setSavingEdits(false);
    }
  };

  const handleUnlockResults = async (examId: string) => {
    setLockingExam(examId);
    try {
      await examService.unlockResults(examId);
      setExams(exams.map(e => e.id === examId ? { ...e, result_status: 'SUBMITTED' } : e));
      if (picked?.id === examId) setPicked({ ...picked, result_status: 'SUBMITTED' });
      showToast('Exam results unlocked');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to unlock results', 'error');
    } finally {
      setLockingExam(null);
    }
  };

  const classes = [...new Set(exams.map(e => e.class_name))].sort();

  const filtered = exams.filter(e => {
    if (filterClass && e.class_name !== filterClass) return false;
    if (filterDone === 'PENDING' && e.results_uploaded) return false;
    if (filterDone === 'DONE' && !e.results_uploaded) return false;
    return true;
  });

  const totalExams   = exams.length;
  const doneExams    = exams.filter(e => e.results_uploaded).length;
  const pendingExams = totalExams - doneExams;

  /* ── MARKSHEET VIEW ───────────────────────────────────────────────────── */
  if (view === 'MARKSHEET') {
    return <Marksheet onBack={() => setView('LIST')} />;
  }

  /* ── RESULTS VIEW ─────────────────────────────────────────────────────── */
  if (view === 'RESULTS' && picked) {
    const avg = results.length > 0
      ? Math.round(results.reduce((s, r) => s + r.obtained_marks, 0) / results.length)
      : 0;
    const maxMarks = picked.max_marks ?? 100;
    const toppers = results.filter(r => r.obtained_marks >= maxMarks * 0.75);
    const failed  = results.filter(r => r.obtained_marks < maxMarks * 0.33);

    return (
      <div className="w-full bg-slate-50 flex flex-col min-h-screen">
        {/* Header */}
        <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
          <button onClick={() => setView('LIST')} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-black text-slate-900 truncate">{picked.title}</h2>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              {picked.class_name} · {picked.subject} · {picked.max_marks} marks
            </p>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 text-center">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Avg Score</p>
              <p className="text-2xl font-black text-slate-900 mt-1">{avg}</p>
              <p className="text-[9px] font-bold text-slate-400">/{maxMarks}</p>
            </div>
            <div className="bg-emerald-50 rounded-2xl border border-emerald-100 p-3 text-center">
              <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600">Toppers</p>
              <p className="text-2xl font-black text-emerald-700 mt-1">{toppers.length}</p>
              <p className="text-[9px] font-bold text-emerald-500">≥75%</p>
            </div>
            <div className="bg-rose-50 rounded-2xl border border-rose-100 p-3 text-center">
              <p className="text-[9px] font-black uppercase tracking-widest text-rose-600">Failed</p>
              <p className="text-2xl font-black text-rose-700 mt-1">{failed.length}</p>
              <p className="text-[9px] font-bold text-rose-400">&lt;33%</p>
            </div>
          </div>

          {loadingRes && (
            <div className="text-center py-10 text-sm font-bold text-slate-400">Results load ho rahe hain…</div>
          )}

          {!loadingRes && results.length === 0 && (
            <div className="flex flex-col items-center py-12 gap-3 text-slate-400">
              <AlertCircle size={32} className="opacity-40" />
              <p className="font-bold text-sm">Koi results nahi mile</p>
            </div>
          )}

          {/* Editor-mode banner for LOCKED tests */}
          {!loadingRes && results.length > 0 && picked.result_status === 'LOCKED' && (
            <div className={`rounded-2xl p-3 flex items-start gap-2 ${editorModeActive ? 'bg-amber-50 border border-amber-200' : 'bg-slate-50 border border-slate-200'}`}>
              <ShieldAlert size={16} className={`shrink-0 mt-0.5 ${editorModeActive ? 'text-amber-600' : 'text-slate-500'}`}/>
              <div className="flex-1 min-w-0">
                <div className={`text-xs font-black ${editorModeActive ? 'text-amber-800' : 'text-slate-700'}`}>
                  {editorModeActive ? 'Editor Mode is ON — published results editable' : 'Results are published & locked'}
                </div>
                <div className={`text-[10px] font-bold mt-0.5 ${editorModeActive ? 'text-amber-700' : 'text-slate-500'}`}>
                  {editorModeActive
                    ? 'Changes overwrite published marks. Every save is audit-logged.'
                    : 'Enable Editor Mode in Settings → Editor Mode to correct marks.'}
                </div>
              </div>
              {editorModeActive && !editing && (
                <button onClick={beginEdit}
                  className="shrink-0 flex items-center gap-1 bg-amber-600 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl active:scale-95 transition-transform">
                  <Pencil size={11}/> Edit
                </button>
              )}
            </div>
          )}

          {/* Results table */}
          {!loadingRes && results.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-50 flex items-center justify-between">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                  Result Board — {results.length} students
                </p>
                {editing
                  ? <div className="flex gap-2">
                      <button onClick={cancelEdit} className="text-[9px] font-black text-slate-500 uppercase">Cancel</button>
                      <button onClick={saveEdits} disabled={savingEdits} className="flex items-center gap-1 text-[9px] font-black text-emerald-600 uppercase disabled:opacity-50">
                        <Save size={10}/> {savingEdits ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  : <p className="text-[9px] font-black text-slate-500">Rank ↑ Marks</p>}
              </div>
              {results.map((r, i) => {
                const pct = maxMarks > 0 ? Math.round((r.obtained_marks / maxMarks) * 100) : 0;
                const grade = r.grade ?? (pct >= 90 ? 'A+' : pct >= 75 ? 'A' : pct >= 60 ? 'B+' : pct >= 45 ? 'B' : pct >= 33 ? 'C' : 'F');
                const isPassed = pct >= 33;
                return (
                  <div key={r.id ?? i} className="flex items-center gap-3 px-4 py-3 border-b border-slate-50 last:border-0">
                    <span className={`w-6 text-[10px] font-black shrink-0 ${i === 0 ? 'text-amber-500' : i === 1 ? 'text-slate-400' : i === 2 ? 'text-orange-400' : 'text-slate-300'}`}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-slate-900 truncate">
                        {r.students?.name ?? 'Unknown'}
                      </p>
                      <p className="text-[10px] font-bold text-slate-400">
                        Adm: {r.students?.admission_no ?? '—'}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      {editing ? (
                        <div className="flex items-center gap-1">
                          <input type="number" min={0} max={maxMarks}
                            value={editMarks[r.id ?? `${r.test_id}:${r.student_id}`] ?? ''}
                            onChange={e => setEditMarks(prev => ({ ...prev, [r.id ?? `${r.test_id}:${r.student_id}`]: e.target.value }))}
                            className="w-16 border-2 border-amber-300 bg-amber-50/40 rounded-lg px-2 py-1 text-center font-black text-sm outline-none focus:border-amber-500"/>
                          <span className="text-[10px] font-bold text-slate-400">/{maxMarks}</span>
                        </div>
                      ) : (
                        <>
                          <p className="text-sm font-black text-slate-900">{r.obtained_marks}<span className="text-[10px] text-slate-400">/{maxMarks}</span></p>
                          <p className={`text-[10px] font-black ${isPassed ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {grade} · {pct}%
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── LIST VIEW ────────────────────────────────────────────────────────── */
  return (
    <div className="w-full bg-slate-50 flex flex-col min-h-screen">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
            <ArrowLeft size={20} />
          </button>
          <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Exams</h2>
        </div>
        <button onClick={() => setView('MARKSHEET')}
          className="flex items-center gap-1.5 px-3 py-2 bg-violet-50 border border-violet-200 text-violet-700 font-black text-[10px] uppercase tracking-widest rounded-xl active:scale-95 transition-transform">
          <FileText size={13} /> Marksheet
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Summary strip */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total', value: totalExams, color: 'text-slate-900' },
            { label: 'Done', value: doneExams, color: 'text-emerald-600' },
            { label: 'Pending', value: pendingExams, color: 'text-amber-600' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 text-center">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
              <p className={`text-3xl font-black mt-1 ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Filter size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <select value={filterClass} onChange={e => setFilterClass(e.target.value)}
              className="w-full pl-8 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none appearance-none">
              <option value="">Sab Classes</option>
              {classes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex bg-white border border-slate-200 rounded-xl overflow-hidden">
            {(['ALL', 'PENDING', 'DONE'] as const).map(tab => (
              <button key={tab} onClick={() => setFilterDone(tab)}
                className={`px-3 py-2 text-[10px] font-black uppercase transition-colors ${
                  filterDone === tab ? 'bg-slate-900 text-white' : 'text-slate-500'
                }`}>
                {tab === 'ALL' ? 'All' : tab === 'PENDING' ? 'Pending' : 'Done'}
              </button>
            ))}
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="text-center py-10 text-sm font-bold text-slate-400">Exams load ho rahe hain…</div>
        )}

        {/* Empty */}
        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center py-16 gap-3 text-slate-400">
            <BookOpen size={32} className="opacity-40" />
            <p className="font-bold text-sm">Koi exam nahi mila</p>
          </div>
        )}

        {/* Exam list */}
        <div className="space-y-3">
          {filtered.map(exam => {
            const done = exam.results_uploaded;
            const subjDisplay = parseSubjectsDisplay(exam);
            return (
              <div key={exam.id} className={`bg-white rounded-2xl border shadow-sm p-4 ${done ? 'border-slate-100' : 'border-amber-100'}`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase border ${TYPE_COLOR[exam.test_type] ?? 'bg-slate-50 text-slate-600 border-slate-100'}`}>
                      {TYPE_LABEL[exam.test_type] ?? exam.test_type}
                    </span>
                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase border ${exam.exam_type === 'FINAL' ? 'bg-rose-100 text-rose-700 border-rose-200' : 'bg-blue-100 text-blue-700 border-blue-200'}`}>
                      {exam.exam_type === 'FINAL' ? 'Final' : 'Regular'}
                    </span>
                    {exam.result_status === 'LOCKED' && (
                      <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-0.5">
                        <Lock size={8} /> Locked
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 shrink-0">{exam.class_name}</span>
                </div>
                <p className="font-extrabold text-slate-900 text-sm">{exam.title}</p>
                <p className="text-[11px] font-bold text-slate-400 mt-0.5 line-clamp-1">{subjDisplay}</p>
                <div className="flex gap-4 mt-3 pt-3 border-t border-slate-50">
                  <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
                    <Clock size={10} className="text-slate-400" /> {exam.scheduled_date}
                  </span>
                  <span className="ml-auto text-[10px] font-black text-slate-700">{exam.max_marks} marks</span>
                </div>
                {done ? (
                  <div className="mt-2 space-y-2">
                    <button onClick={() => openResults(exam)}
                      className="w-full flex items-center justify-between bg-emerald-50 border border-emerald-100 text-emerald-700 font-black text-[11px] uppercase tracking-widest px-3 py-2 rounded-xl active:scale-95 transition-transform">
                      <span className="flex items-center gap-1.5"><Users size={12} /> View Results</span>
                      <span className="flex items-center gap-1"><CheckCircle size={12}/><ChevronRight size={12} /></span>
                    </button>
                    {exam.result_status !== 'LOCKED' && (
                      <button onClick={() => handleLockResults(exam.id)} disabled={lockingExam === exam.id}
                        className="w-full flex items-center justify-center gap-1.5 bg-slate-100 border border-slate-200 text-slate-700 font-black text-[10px] uppercase tracking-widest px-3 py-1.5 rounded-xl active:scale-95 transition-transform disabled:opacity-50">
                        <Lock size={10} /> Lock Results
                      </button>
                    )}
                    {exam.result_status === 'LOCKED' && (
                      <button onClick={() => handleUnlockResults(exam.id)} disabled={lockingExam === exam.id}
                        className="w-full flex items-center justify-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-700 font-black text-[10px] uppercase tracking-widest px-3 py-1.5 rounded-xl active:scale-95 transition-transform disabled:opacity-50">
                        <Unlock size={10} /> Unlock Results
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="mt-2 flex items-center gap-1.5 text-[10px] font-black text-amber-600 bg-amber-50 px-2 py-1.5 rounded-lg">
                    <Clock size={10} /> Results upload nahi hue — Teacher se upload karwayein
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
