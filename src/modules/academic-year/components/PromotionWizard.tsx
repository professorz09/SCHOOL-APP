import React, { useMemo, useState, useEffect } from 'react';
import {
  ArrowLeft, ArrowRight, CheckCircle2,
  ChevronDown, ChevronUp, GraduationCap, AlertTriangle,
  Users, FileText, IndianRupee,
} from 'lucide-react';
import { useAcademicYear } from '@/shared/context/AcademicYearContext';
import { useUIStore } from '@/store/uiStore';
import { apiPromotion } from '@/lib/apiClient';
import { feeService } from '@/modules/fees/fee.service';
import type { FeeStructureRecord } from '@/modules/fees/fees.types';

interface StudentPromotion {
  studentId: string;
  recordId: string;
  studentName: string;
  admissionNo: string;
  fromClass: string;
  fromSection: string;
  rollNo: string;
  toClass: string;
  toSection: string;
  decision: 'PROMOTE' | 'RETAIN' | 'TC';
  status: 'PENDING' | 'ALREADY_ASSIGNED';
  examPassed: boolean | null;
  hasExamData: boolean;
  tcDate: string;
  tcRemarks: string;
  feeStructureId: string;
}

interface Props {
  onBack: () => void;
}

const STREAMS = ['Science', 'Commerce', 'Arts', 'Maths'] as const;

const CLASS_OPTIONS = [
  'Nursery', 'LKG', 'UKG',
  'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5',
  'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10',
  '11th Science', '11th Commerce', '11th Arts', '11th Maths',
  '12th Science', '12th Commerce', '12th Arts', '12th Maths',
];

const isClass10 = (cls: string) => /^Class\s*10$/i.test(cls.trim());
const isClass11 = (cls: string) => /^11th/i.test(cls.trim());
const isClass12 = (cls: string) => /^12th/i.test(cls.trim());

const bumpClass = (cls: string): string => {
  if (cls === 'Nursery') return 'LKG';
  if (cls === 'LKG')     return 'UKG';
  if (cls === 'UKG')     return 'Class 1';
  const m = cls.match(/Class\s*(\d+)/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n === 10) return '11th Science';
    return `Class ${n + 1}`;
  }
  if (cls.startsWith('11th')) return cls.replace('11th', '12th');
  return cls;
};

type Step = 'SELECT_YEARS' | 'DECIDE' | 'DONE';

export const PromotionWizard: React.FC<Props> = ({ onBack }) => {
  const { academicYears } = useAcademicYear();
  const { showToast } = useUIStore();

  const [step, setStep]             = useState<Step>('SELECT_YEARS');
  const [fromYearId, setFromYearId] = useState('');
  const [toYearId,   setToYearId]   = useState('');
  const [loading, setLoading]       = useState(false);
  const [busy, setBusy]             = useState(false);
  const [students, setStudents]     = useState<StudentPromotion[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [hasAnyExamData, setHasAnyExamData] = useState(false);
  const [feeStructures, setFeeStructures] = useState<FeeStructureRecord[]>([]);

  useEffect(() => {
    feeService.getFeeStructures().then(setFeeStructures).catch(() => {});
  }, []);
  const [result, setResult]         = useState<{
    promoted: number; retained: number; tcIssued: number; skipped: number;
  } | null>(null);

  const today = new Date().toISOString().split('T')[0];

  const fromYear = academicYears.find(y => y.id === fromYearId);
  const toYear   = academicYears.find(y => y.id === toYearId);

  const loadPreview = async () => {
    if (!fromYearId || !toYearId) return;
    setLoading(true);
    setStudents([]);
    try {
      const data = await apiPromotion.preview(fromYearId, toYearId);
      setHasAnyExamData(!!(data as any).hasAnyExamData);
      const list: StudentPromotion[] = ((data as any).preview ?? []).map((p: any) => {
        const fc: string = p.fromClass ?? '';
        const is12 = isClass12(fc);
        const suggested: StudentPromotion['decision'] = p.suggestedDecision ?? (is12 ? 'TC' : 'PROMOTE');
        return {
          studentId:   p.studentId,
          recordId:    p.recordId ?? '',
          studentName: p.studentName ?? 'Unknown',
          admissionNo: p.admissionNo ?? '',
          fromClass:   fc,
          fromSection: p.fromSection ?? '',
          rollNo:      p.rollNo ?? '',
          toClass:     is12 ? '' : bumpClass(fc),
          toSection:   is12 ? '' : (p.fromSection ?? ''),
          decision:    p.status === 'ALREADY_ASSIGNED' ? 'PROMOTE' : suggested,
          status:      p.status,
          examPassed:  p.examPassed ?? null,
          hasExamData: p.hasExamData ?? false,
          tcDate:          today,
          tcRemarks:       '',
          feeStructureId:  '',
        };
      });
      setStudents(list);
      setStep('DECIDE');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Preview failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const patch = (id: string, changes: Partial<StudentPromotion>) =>
    setStudents(prev => prev.map(x => x.studentId === id ? { ...x, ...changes } : x));

  // "Promote All Passed" — only for students with exam data who passed
  const promoteAllPassed = () => {
    setStudents(prev => prev.map(x => {
      if (x.status !== 'PENDING' || isClass12(x.fromClass)) return x;
      if (x.hasExamData && x.examPassed === true)  return { ...x, decision: 'PROMOTE' };
      if (x.hasExamData && x.examPassed === false) return { ...x, decision: 'RETAIN' };
      return x;
    }));
    showToast('Exam results ke hisab se decisions set ho gaye');
  };

  const executePromotion = async () => {
    const pending = students.filter(s => s.status === 'PENDING');
    if (pending.length === 0) { showToast('Koi pending student nahi hai', 'error'); return; }

    // Validate: PROMOTE without toClass
    const missingClass = pending.filter(
      s => s.decision === 'PROMOTE' && !isClass12(s.fromClass) && !s.toClass.trim(),
    );
    if (missingClass.length > 0) {
      showToast(`${missingClass.length} students ka "To Class" missing hai`, 'error');
      return;
    }
    // Validate: TC without date
    const missingDate = pending.filter(s => s.decision === 'TC' && !s.tcDate);
    if (missingDate.length > 0) {
      showToast(`${missingDate.length} students ki TC date missing hai`, 'error');
      return;
    }

    setBusy(true);
    try {
      const res = await apiPromotion.execute({
        fromYearId,
        toYearId,
        promotions: pending.map(s => ({
          studentId:  s.studentId,
          recordId:   s.recordId,
          decision:   s.decision,
          toClassName:    s.decision === 'PROMOTE' ? s.toClass : undefined,
          toSection:      s.decision === 'PROMOTE' ? s.toSection : undefined,
          rollNo:         s.rollNo || undefined,
          tcDate:         s.decision === 'TC' ? s.tcDate : undefined,
          tcRemarks:      s.decision === 'TC' ? s.tcRemarks : undefined,
          feeStructureId: s.decision === 'PROMOTE' && s.feeStructureId ? s.feeStructureId : undefined,
        })),
      });
      setResult({
        promoted: (res as any).promoted ?? 0,
        retained: (res as any).retained ?? 0,
        tcIssued: (res as any).tcIssued ?? 0,
        skipped:  (res as any).skipped  ?? 0,
      });
      setStep('DONE');
      showToast(`Promotion complete — ${(res as any).promoted ?? 0} promoted, ${(res as any).retained ?? 0} retained, ${(res as any).tcIssued ?? 0} TC issued`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Promotion failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const counts = useMemo(() => ({
    promote: students.filter(s => s.decision === 'PROMOTE' && s.status === 'PENDING').length,
    retain:  students.filter(s => s.decision === 'RETAIN'  && s.status === 'PENDING').length,
    tc:      students.filter(s => s.decision === 'TC'      && s.status === 'PENDING').length,
    done:    students.filter(s => s.status === 'ALREADY_ASSIGNED').length,
  }), [students]);

  const decisionColor = (d: string) =>
    d === 'PROMOTE' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
    d === 'RETAIN'  ? 'bg-amber-100  text-amber-700  border-amber-200'  :
                      'bg-blue-100   text-blue-700   border-blue-200';

  // Group students by class for cleaner display
  const groupedStudents = useMemo(() => {
    const map = new Map<string, StudentPromotion[]>();
    for (const s of students) {
      const cls = s.fromClass || 'Unknown';
      if (!map.has(cls)) map.set(cls, []);
      map.get(cls)!.push(s);
    }
    return [...map.entries()].sort(([a], [b]) => {
      const order = CLASS_OPTIONS.indexOf(a) - CLASS_OPTIONS.indexOf(b);
      return order !== 0 ? order : a.localeCompare(b);
    });
  }, [students]);

  return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300 min-h-screen">

      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 sticky top-0 z-10 shadow-sm flex items-center gap-3">
        <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Promotion Wizard</h2>
          <p className="text-[10px] font-bold text-slate-400">Students ko next year mein promote karein</p>
        </div>
        {step === 'DECIDE' && (
          <div className="text-right">
            <div className="text-xs font-black text-slate-900">{students.length}</div>
            <div className="text-[9px] font-bold text-slate-400 uppercase">Students</div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-32">

        {/* ── STEP 1: Select Years ── */}
        {step === 'SELECT_YEARS' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Step 1 · Years chunein</p>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1.5">
                  From Year (Source)
                </label>
                <select value={fromYearId} onChange={e => setFromYearId(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 font-bold text-sm text-slate-800 focus:outline-none focus:border-indigo-400 bg-white">
                  <option value="">Source year chunein…</option>
                  {academicYears.map(y => (
                    <option key={y.id} value={y.id}>
                      {y.name} {y.status === 'LOCKED' ? '🔒' : y.isActive ? '✅' : ''}
                    </option>
                  ))}
                </select>
                {fromYearId && !academicYears.find(y => y.id === fromYearId && y.status === 'LOCKED') && (
                  <p className="text-[9px] font-bold text-amber-600 mt-1">
                    ⚠️ Yeh year close nahi hai — ideally closed year se promote karein
                  </p>
                )}
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1.5">
                  To Year (Destination)
                </label>
                <select value={toYearId} onChange={e => setToYearId(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 font-bold text-sm text-slate-800 focus:outline-none focus:border-indigo-400 bg-white">
                  <option value="">Destination year chunein…</option>
                  {academicYears.filter(y => y.id !== fromYearId).map(y => (
                    <option key={y.id} value={y.id}>{y.name}</option>
                  ))}
                </select>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-[10px] font-bold text-blue-800 space-y-1">
                <p className="font-black">Kaise kaam karta hai:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>PROMOTE — student next class mein move hoga</li>
                  <li>RETAIN — student same class mein rahega (fail/back)</li>
                  <li>TC — Transfer Certificate; school se exit (12th ke liye)</li>
                  <li>Class 10 → 11th ke liye stream chunna hoga</li>
                  <li>Agar final exam results hain, auto-suggest milegi</li>
                </ul>
              </div>
            </div>

            <button
              onClick={loadPreview}
              disabled={!fromYearId || !toYearId || loading}
              className="w-full py-4 bg-indigo-600 text-white font-black text-sm uppercase rounded-2xl active:scale-95 transition-transform disabled:opacity-50 flex items-center justify-center gap-2">
              {loading
                ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Loading…</>
                : <><ArrowRight size={16} /> Students ka Preview Dekho</>
              }
            </button>
          </div>
        )}

        {/* ── STEP 2: Per-student decisions ── */}
        {step === 'DECIDE' && (
          <>
            {/* Summary banner */}
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-4 text-white">
              <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-3">
                {fromYear?.name} → {toYear?.name}
              </p>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <div className="text-lg font-black text-emerald-400">{counts.promote}</div>
                  <div className="text-[8px] font-bold text-white/40 uppercase">Promote</div>
                </div>
                <div>
                  <div className="text-lg font-black text-amber-400">{counts.retain}</div>
                  <div className="text-[8px] font-bold text-white/40 uppercase">Retain</div>
                </div>
                <div>
                  <div className="text-lg font-black text-blue-400">{counts.tc}</div>
                  <div className="text-[8px] font-bold text-white/40 uppercase">TC</div>
                </div>
                <div>
                  <div className="text-lg font-black text-slate-400">{counts.done}</div>
                  <div className="text-[8px] font-bold text-white/40 uppercase">Done</div>
                </div>
              </div>
            </div>

            {/* Exam data notice */}
            {hasAnyExamData && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 flex items-start gap-2">
                <FileText size={14} className="text-indigo-600 mt-0.5 shrink-0" />
                <p className="text-[10px] font-bold text-indigo-800">
                  Final exam results mil gaye — green = pass, orange = fail. Ye suggestions hain, aap override kar sakte hain.
                </p>
              </div>
            )}

            {/* Quick-select buttons */}
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setStudents(prev => prev.map(x =>
                  x.status === 'PENDING' && !isClass12(x.fromClass)
                    ? { ...x, decision: 'PROMOTE' }
                    : x
                ))}
                className="flex-1 py-2 bg-emerald-50 border border-emerald-200 text-emerald-700 font-black text-[10px] uppercase rounded-xl active:scale-95">
                All → Promote
              </button>
              <button
                onClick={() => setStudents(prev => prev.map(x =>
                  x.status === 'PENDING' && !isClass12(x.fromClass) ? { ...x, decision: 'RETAIN' } : x
                ))}
                className="flex-1 py-2 bg-amber-50 border border-amber-200 text-amber-700 font-black text-[10px] uppercase rounded-xl active:scale-95">
                All → Retain
              </button>
              {hasAnyExamData && (
                <button
                  onClick={promoteAllPassed}
                  className="w-full py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 font-black text-[10px] uppercase rounded-xl active:scale-95 flex items-center justify-center gap-1.5">
                  <Users size={11} /> Promote All Passed (Exam Results)
                </button>
              )}
            </div>

            {/* Per-class grouped student list */}
            <div className="space-y-4">
              {groupedStudents.map(([className, classStudents]) => (
                <div key={className}>
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{className}</p>
                    <div className="h-px flex-1 bg-slate-200" />
                    <p className="text-[9px] font-black text-slate-400">{classStudents.length} students</p>
                  </div>

                  <div className="space-y-2">
                    {classStudents.map(s => {
                      const open   = expandedId === s.studentId;
                      const isDone = s.status === 'ALREADY_ASSIGNED';
                      const is10   = isClass10(s.fromClass);
                      const is11   = isClass11(s.fromClass);
                      const is12   = isClass12(s.fromClass);

                      return (
                        <div key={s.studentId}
                          className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${isDone ? 'border-slate-100 opacity-60' : 'border-slate-100'}`}>

                          {/* Row header */}
                          <button
                            onClick={() => !isDone && setExpandedId(open ? null : s.studentId)}
                            className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-slate-50">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs shrink-0 ${
                              s.hasExamData && s.examPassed === true  ? 'bg-emerald-100 text-emerald-700' :
                              s.hasExamData && s.examPassed === false ? 'bg-amber-100 text-amber-700' :
                              'bg-indigo-100 text-indigo-700'
                            }`}>
                              {s.studentName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-black text-slate-900 text-sm truncate">{s.studentName}</div>
                              <div className="text-[10px] font-bold text-slate-400 flex items-center gap-1 flex-wrap">
                                <span>{s.fromSection ? `${s.fromClass}-${s.fromSection}` : s.fromClass}</span>
                                {s.decision === 'PROMOTE' && s.toClass && (
                                  <> → <span className="text-emerald-600">{s.toClass}</span></>
                                )}
                                {is12 && <span className="ml-1 text-[8px] font-black bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full uppercase">12th Passout</span>}
                                {is10 && !isDone && <span className="ml-1 text-[8px] font-black bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded-full uppercase">Stream Chunein</span>}
                                {is11 && !isDone && <span className="ml-1 text-[8px] font-black bg-sky-100 text-sky-600 px-1.5 py-0.5 rounded-full uppercase">11th → 12th</span>}
                                {s.hasExamData && (
                                  <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase ${s.examPassed ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                                    {s.examPassed ? 'Pass' : 'Fail'}
                                  </span>
                                )}
                              </div>
                            </div>

                            {isDone
                              ? <span className="text-[9px] font-black text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full uppercase shrink-0">Done</span>
                              : <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase border shrink-0 ${decisionColor(s.decision)}`}>{s.decision}</span>
                            }
                            {!isDone && (open
                              ? <ChevronUp size={14} className="text-slate-400 shrink-0" />
                              : <ChevronDown size={14} className="text-slate-400 shrink-0" />
                            )}
                          </button>

                          {/* Expanded panel */}
                          {open && !isDone && (
                            <div className="px-4 pb-4 pt-2 space-y-3 border-t border-slate-50">

                              {/* Decision buttons */}
                              {is12 ? (
                                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-[10px] font-bold text-blue-800">
                                  12th class students ko TC milta hai — yeh school se graduate/exit ho jaate hain. TC date set karein neeche.
                                </div>
                              ) : (
                                <div className="flex gap-2">
                                  {(['PROMOTE', 'RETAIN', 'TC'] as const).map(d => (
                                    <button key={d}
                                      onClick={() => patch(s.studentId, { decision: d })}
                                      className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase border transition-colors ${
                                        s.decision === d ? decisionColor(d) : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                                      {d === 'PROMOTE' ? '⬆️ Promote' : d === 'RETAIN' ? '↩️ Retain' : '📋 TC'}
                                    </button>
                                  ))}
                                </div>
                              )}

                              {/* PROMOTE options */}
                              {s.decision === 'PROMOTE' && (
                                <>
                                  {/* Class 10 → Stream picker */}
                                  {is10 ? (
                                    <div className="space-y-2">
                                      <p className="text-[9px] font-black uppercase text-violet-600 tracking-widest">
                                        11th Stream chunein
                                      </p>
                                      <div className="grid grid-cols-2 gap-2">
                                        {STREAMS.map(stream => (
                                          <button key={stream}
                                            onClick={() => patch(s.studentId, { toClass: `11th ${stream}` })}
                                            className={`py-2.5 px-3 rounded-xl text-xs font-black uppercase border transition-colors ${
                                              s.toClass === `11th ${stream}`
                                                ? 'bg-violet-600 text-white border-violet-600'
                                                : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-violet-300'
                                            }`}>
                                            {stream}
                                          </button>
                                        ))}
                                      </div>
                                      <button
                                        onClick={() => patch(s.studentId, { toClass: '' })}
                                        className={`w-full py-2 rounded-xl text-[10px] font-black uppercase border transition-colors ${
                                          s.toClass === ''
                                            ? 'bg-slate-600 text-white border-slate-600'
                                            : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-400'
                                        }`}>
                                        🕐 Not Allotting Now (stream baad mein)
                                      </button>
                                      {!s.toClass && (
                                        <p className="text-[9px] font-bold text-amber-600">
                                          ⚠️ Stream baad mein allot hogi — student abhi promoted hoga bina class ke
                                        </p>
                                      )}
                                    </div>

                                  ) : is11 ? (
                                    /* 11th → 12th: same stream auto-pick + section */
                                    <div className="space-y-2">
                                      <p className="text-[9px] font-black uppercase text-sky-600 tracking-widest">
                                        To Class (12th)
                                      </p>
                                      <select value={s.toClass}
                                        onChange={e => patch(s.studentId, { toClass: e.target.value })}
                                        className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-400 bg-white">
                                        {CLASS_OPTIONS.filter(c => c.startsWith('12th')).map(c => (
                                          <option key={c} value={c}>{c}</option>
                                        ))}
                                      </select>
                                    </div>

                                  ) : (
                                    /* Normal class dropdown */
                                    <div>
                                      <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">To Class</label>
                                      <select value={s.toClass}
                                        onChange={e => patch(s.studentId, { toClass: e.target.value })}
                                        className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-400 bg-white">
                                        {CLASS_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                                      </select>
                                    </div>
                                  )}

                                  {/* Section (for non-"not allotting now") */}
                                  {(s.toClass || !is10) && (
                                    <div>
                                      <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">Section</label>
                                      <input value={s.toSection}
                                        onChange={e => patch(s.studentId, { toSection: e.target.value })}
                                        placeholder="A"
                                        className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-400" />
                                    </div>
                                  )}

                                  {/* Fee Structure */}
                                  {feeStructures.length > 0 && (
                                    <div>
                                      <label className="text-[9px] font-black uppercase text-slate-400 flex items-center gap-1 mb-1">
                                        <IndianRupee size={9} /> Fee Structure (optional)
                                      </label>
                                      <select value={s.feeStructureId}
                                        onChange={e => patch(s.studentId, { feeStructureId: e.target.value })}
                                        className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-400 bg-white">
                                        <option value="">— Auto-generate later —</option>
                                        {feeStructures
                                          .filter(fs => !s.toClass || fs.className === s.toClass.split('-')[0]?.trim() || fs.className === s.toClass)
                                          .map(fs => (
                                            <option key={fs.id} value={fs.id}>{fs.name} ({fs.className})</option>
                                          ))
                                        }
                                      </select>
                                      {s.feeStructureId && (
                                        <p className="text-[9px] font-bold text-emerald-600 mt-0.5">
                                          ✓ Fee schedule will be auto-generated on promote
                                        </p>
                                      )}
                                    </div>
                                  )}
                                </>
                              )}

                              {/* TC options — date picker + remarks */}
                              {(s.decision === 'TC' || is12) && (
                                <div className="space-y-2 bg-blue-50 border border-blue-200 rounded-xl p-3">
                                  <p className="text-[9px] font-black uppercase text-blue-700 tracking-widest">
                                    Transfer Certificate Details
                                  </p>
                                  <div>
                                    <label className="text-[9px] font-black uppercase text-slate-500 block mb-1">TC Date</label>
                                    <input
                                      type="date"
                                      value={s.tcDate}
                                      onChange={e => patch(s.studentId, { tcDate: e.target.value })}
                                      className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-400 bg-white" />
                                  </div>
                                  <div>
                                    <label className="text-[9px] font-black uppercase text-slate-500 block mb-1">Remarks (optional)</label>
                                    <input
                                      type="text"
                                      value={s.tcRemarks}
                                      onChange={e => patch(s.studentId, { tcRemarks: e.target.value })}
                                      placeholder="e.g. Passed out, migrated to city"
                                      className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-400 bg-white" />
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Validation warning */}
            {students.filter(s => s.status === 'PENDING' && s.decision === 'PROMOTE' && !isClass12(s.fromClass) && !s.toClass.trim() && !isClass10(s.fromClass)).length > 0 && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex items-start gap-2">
                <AlertTriangle size={14} className="text-rose-600 mt-0.5 shrink-0" />
                <p className="text-[10px] font-bold text-rose-700">
                  Kuch students ka "To Class" select nahi hai — expand karke set karein.
                </p>
              </div>
            )}
          </>
        )}

        {/* ── DONE ── */}
        {step === 'DONE' && result && (
          <div className="space-y-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center space-y-3">
              <CheckCircle2 size={44} className="text-emerald-500 mx-auto" />
              <div className="font-black text-slate-900 text-xl">Promotion Complete!</div>
              <div className="grid grid-cols-3 gap-3 mt-2">
                <div className="bg-white rounded-xl p-3 border border-emerald-200">
                  <div className="text-lg font-black text-emerald-600">{result.promoted}</div>
                  <div className="text-[9px] font-bold text-slate-400 uppercase">Promoted</div>
                </div>
                <div className="bg-white rounded-xl p-3 border border-amber-200">
                  <div className="text-lg font-black text-amber-600">{result.retained}</div>
                  <div className="text-[9px] font-bold text-slate-400 uppercase">Retained</div>
                </div>
                <div className="bg-white rounded-xl p-3 border border-blue-200">
                  <div className="text-lg font-black text-blue-600">{result.tcIssued}</div>
                  <div className="text-[9px] font-bold text-slate-400 uppercase">TC Issued</div>
                </div>
              </div>
              {result.skipped > 0 && (
                <div className="text-[11px] font-bold text-slate-400">{result.skipped} already assigned (skipped)</div>
              )}
            </div>
            <button onClick={onBack}
              className="w-full py-4 bg-slate-900 text-white font-black text-sm uppercase rounded-2xl active:scale-95">
              Done — Wapas Jao
            </button>
          </div>
        )}
      </div>

      {/* ── Bottom bar (DECIDE step) ── */}
      {step === 'DECIDE' && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-100 flex gap-2">
          <button onClick={() => setStep('SELECT_YEARS')}
            className="flex-shrink-0 px-4 py-3 bg-slate-100 text-slate-700 font-black text-xs uppercase rounded-xl active:scale-95">
            Back
          </button>
          <button
            onClick={executePromotion}
            disabled={busy || (counts.promote + counts.retain + counts.tc === 0)}
            className="flex-1 py-3 bg-emerald-600 text-white font-black text-sm uppercase rounded-xl active:scale-95 transition-transform disabled:opacity-50 flex items-center justify-center gap-2">
            {busy
              ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Processing…</>
              : <><GraduationCap size={16} /> Confirm ({counts.promote + counts.retain + counts.tc} students)</>
            }
          </button>
        </div>
      )}
    </div>
  );
};
