import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, ArrowRight, CheckCircle2,
  ChevronDown, ChevronUp, GraduationCap,
} from 'lucide-react';
import { useAcademicYear } from '@/shared/context/AcademicYearContext';
import { useUIStore } from '@/shared/store/uiStore';
import { apiPromotion } from '@/shared/lib/apiClient';

interface StudentPromotion {
  studentId: string;
  studentName: string;
  admissionNo: string;
  fromClass: string;
  fromSection: string;
  rollNo: string;
  toClass: string;
  toSection: string;
  decision: 'PROMOTE' | 'RETAIN' | 'TC';
  status: 'PENDING' | 'ALREADY_ASSIGNED';
}

interface Props {
  onBack: () => void;
}

const CLASS_OPTIONS = [
  'Nursery', 'LKG', 'UKG',
  'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5',
  'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10',
  '11th Science', '11th Commerce', '11th Arts', '11th Maths',
  '12th Science', '12th Commerce', '12th Arts', '12th Maths',
];

const bumpClass = (cls: string): string => {
  if (cls === 'Nursery') return 'LKG';
  if (cls === 'LKG') return 'UKG';
  if (cls === 'UKG') return 'Class 1';
  const m = cls.match(/Class\s*(\d+)/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n === 10) return '11th Science';
    return `Class ${n + 1}`;
  }
  if (cls.startsWith('11th')) return cls.replace('11th', '12th');
  return cls;
};

type Step = 'SELECT_YEARS' | 'PREVIEW' | 'DECIDE' | 'CONFIRM' | 'DONE';

export const PromotionWizard: React.FC<Props> = ({ onBack }) => {
  const { academicYears } = useAcademicYear();
  const { showToast } = useUIStore();

  const [step, setStep] = useState<Step>('SELECT_YEARS');
  const [fromYearId, setFromYearId] = useState('');
  const [toYearId, setToYearId] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [students, setStudents] = useState<StudentPromotion[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [result, setResult] = useState<{ promoted: number; skipped: number } | null>(null);

  const closedYears = useMemo(() => academicYears.filter(y => y.status === 'LOCKED'), [academicYears]);
  const allYears = academicYears;

  const fromYear = academicYears.find(y => y.id === fromYearId);
  const toYear   = academicYears.find(y => y.id === toYearId);

  const loadPreview = async () => {
    if (!fromYearId || !toYearId) return;
    setLoading(true);
    setStudents([]);
    try {
      const data = await apiPromotion.preview(fromYearId, toYearId);
      const list: StudentPromotion[] = (data.preview ?? []).map((p: any) => ({
        studentId:   p.studentId,
        studentName: p.studentName ?? 'Unknown',
        admissionNo: p.admissionNo ?? '',
        fromClass:   p.fromClass ?? '',
        fromSection: p.fromSection ?? '',
        rollNo:      p.rollNo ?? '',
        toClass:     bumpClass(p.fromClass ?? ''),
        toSection:   p.fromSection ?? '',
        decision:    (p.fromClass ?? '').includes('12') ? 'TC' : 'PROMOTE',
        status:      p.status,
      }));
      setStudents(list);
      setStep('DECIDE');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Preview failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const executePromotion = async () => {
    const toPromote = students.filter(s => s.decision === 'PROMOTE' && s.status === 'PENDING');
    if (toPromote.length === 0) { showToast('No students to promote', 'error'); return; }
    setBusy(true);
    try {
      const res = await apiPromotion.execute({
        fromYearId,
        toYearId,
        promotions: toPromote.map(s => ({
          studentId:   s.studentId,
          toClassName: s.toClass,
          toSection:   s.toSection,
          rollNo:      s.rollNo || undefined,
        })),
      });
      setResult({ promoted: res.promoted ?? 0, skipped: res.skipped ?? 0 });
      setStep('DONE');
      showToast(`${res.promoted ?? 0} students promoted successfully`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Promotion failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const counts = useMemo(() => ({
    promote: students.filter(s => s.decision === 'PROMOTE' && s.status === 'PENDING').length,
    retain:  students.filter(s => s.decision === 'RETAIN').length,
    tc:      students.filter(s => s.decision === 'TC').length,
    done:    students.filter(s => s.status === 'ALREADY_ASSIGNED').length,
  }), [students]);

  const decisionColor = (d: string) =>
    d === 'PROMOTE' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
    d === 'RETAIN'  ? 'bg-amber-100 text-amber-700 border-amber-200' :
    'bg-blue-100 text-blue-700 border-blue-200';

  return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300 min-h-screen">
      {/* Header */}
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
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Step 1 · Select Years</p>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1.5">
                  From Year (Source — closed year)
                </label>
                <select value={fromYearId} onChange={e => setFromYearId(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 font-bold text-sm text-slate-800 focus:outline-none focus:border-indigo-400 bg-white">
                  <option value="">Select source year…</option>
                  {allYears.map(y => (
                    <option key={y.id} value={y.id}>
                      {y.name} {y.status === 'LOCKED' ? '🔒' : y.isActive ? '✅' : ''}
                    </option>
                  ))}
                </select>
                {fromYearId && !closedYears.find(y => y.id === fromYearId) && (
                  <p className="text-[9px] font-bold text-amber-600 mt-1">
                    ⚠️ Selected year is not closed — ideally promote from a closed year
                  </p>
                )}
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1.5">
                  To Year (Destination — new year)
                </label>
                <select value={toYearId} onChange={e => setToYearId(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 font-bold text-sm text-slate-800 focus:outline-none focus:border-indigo-400 bg-white">
                  <option value="">Select destination year…</option>
                  {allYears.filter(y => y.id !== fromYearId).map(y => (
                    <option key={y.id} value={y.id}>{y.name}</option>
                  ))}
                </select>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-[10px] font-bold text-blue-800">
                <p className="font-black mb-1">Kaise kaam karta hai:</p>
                <ul className="space-y-0.5 list-disc list-inside">
                  <li>PROMOTE: Student next class mein move hoga (e.g. Class 5 → Class 6)</li>
                  <li>RETAIN: Student same class mein rahega</li>
                  <li>TC: Transfer Certificate — student school se graduate/exit hoga</li>
                </ul>
              </div>
            </div>

            <button
              onClick={loadPreview}
              disabled={!fromYearId || !toYearId || loading}
              className="w-full py-4 bg-indigo-600 text-white font-black text-sm uppercase rounded-2xl active:scale-95 transition-transform disabled:opacity-50 flex items-center justify-center gap-2">
              {loading
                ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Loading Preview…</>
                : <><ArrowRight size={16} /> Preview Students</>
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

            {/* Quick select buttons */}
            <div className="flex gap-2">
              <button onClick={() => setStudents(s => s.map(x => x.status === 'PENDING' ? { ...x, decision: 'PROMOTE' } : x))}
                className="flex-1 py-2 bg-emerald-50 border border-emerald-200 text-emerald-700 font-black text-[10px] uppercase rounded-xl active:scale-95">
                All → Promote
              </button>
              <button onClick={() => setStudents(s => s.map(x => x.status === 'PENDING' ? { ...x, decision: 'RETAIN' } : x))}
                className="flex-1 py-2 bg-amber-50 border border-amber-200 text-amber-700 font-black text-[10px] uppercase rounded-xl active:scale-95">
                All → Retain
              </button>
            </div>

            {/* Per-student list */}
            <div className="space-y-2">
              {students.map(s => {
                const open = expandedId === s.studentId;
                const isDone = s.status === 'ALREADY_ASSIGNED';
                return (
                  <div key={s.studentId} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${isDone ? 'border-slate-100 opacity-60' : 'border-slate-100'}`}>
                    <button
                      onClick={() => setExpandedId(open ? null : s.studentId)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-slate-50">
                      <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-xs shrink-0">
                        {s.studentName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-black text-slate-900 text-sm truncate">{s.studentName}</div>
                        <div className="text-[10px] font-bold text-slate-400">{s.fromClass}-{s.fromSection} → {s.toClass}</div>
                      </div>
                      {isDone
                        ? <span className="text-[9px] font-black text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full uppercase shrink-0">Already Done</span>
                        : <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase border shrink-0 ${decisionColor(s.decision)}`}>{s.decision}</span>
                      }
                      {!isDone && (open ? <ChevronUp size={14} className="text-slate-400 shrink-0" /> : <ChevronDown size={14} className="text-slate-400 shrink-0" />)}
                    </button>

                    {open && !isDone && (
                      <div className="px-4 pb-4 pt-1 space-y-3 border-t border-slate-50">
                        <div className="flex gap-2">
                          {(['PROMOTE', 'RETAIN', 'TC'] as const).map(d => (
                            <button key={d} onClick={() => setStudents(prev => prev.map(x => x.studentId === s.studentId ? { ...x, decision: d } : x))}
                              className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase border transition-colors ${s.decision === d ? decisionColor(d) : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                              {d === 'PROMOTE' ? '⬆️ Promote' : d === 'RETAIN' ? '↩️ Retain' : '📋 TC'}
                            </button>
                          ))}
                        </div>
                        {s.decision === 'PROMOTE' && (
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">To Class</label>
                              <select value={s.toClass}
                                onChange={e => setStudents(prev => prev.map(x => x.studentId === s.studentId ? { ...x, toClass: e.target.value } : x))}
                                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-400 bg-white">
                                {CLASS_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">Section</label>
                              <input value={s.toSection}
                                onChange={e => setStudents(prev => prev.map(x => x.studentId === s.studentId ? { ...x, toSection: e.target.value } : x))}
                                placeholder="A"
                                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-400" />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ── DONE ── */}
        {step === 'DONE' && result && (
          <div className="space-y-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center">
              <CheckCircle2 size={40} className="text-emerald-500 mx-auto mb-3" />
              <div className="font-black text-slate-900 text-lg">{result.promoted} Students Promoted!</div>
              {result.skipped > 0 && (
                <div className="text-[11px] font-bold text-slate-500 mt-1">{result.skipped} skipped (already assigned)</div>
              )}
            </div>
            <button onClick={onBack}
              className="w-full py-4 bg-slate-900 text-white font-black text-sm uppercase rounded-2xl active:scale-95">
              Done — Wapas Jao
            </button>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      {step === 'DECIDE' && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-100 flex gap-2">
          <button onClick={() => setStep('SELECT_YEARS')}
            className="flex-shrink-0 px-4 py-3 bg-slate-100 text-slate-700 font-black text-xs uppercase rounded-xl active:scale-95">
            Back
          </button>
          <button
            onClick={executePromotion}
            disabled={busy || counts.promote === 0}
            className="flex-1 py-3 bg-emerald-600 text-white font-black text-sm uppercase rounded-xl active:scale-95 transition-transform disabled:opacity-50 flex items-center justify-center gap-2">
            {busy
              ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Promoting…</>
              : <><GraduationCap size={16} /> Promote {counts.promote} Students</>
            }
          </button>
        </div>
      )}
    </div>
  );
};
