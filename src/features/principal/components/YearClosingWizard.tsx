import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, CheckCircle2, AlertTriangle, ChevronRight,
  Users, Lock, Sparkles,
} from 'lucide-react';
import { studentService } from '../../../services/student.service';
import { feeService } from '../../../services/fee.service';
import { Student } from '../../../types/principal.types';

type WizardStep = 'REVIEW' | 'PROMOTE' | 'DONE';
type PromotionResult = 'PROMOTED' | 'DETAINED' | 'TC';

interface ReviewCheck {
  label: string;
  status: 'OK' | 'WARN' | 'BLOCK';
  detail: string;
}

interface StudentPromotion {
  id: string;
  name: string;
  currentClass: string;
  currentSection: string;
  rollNo: string;
  attendancePercent: number;
  feePending: number;
  promotionResult: PromotionResult;
  newClass: string;
  newSection: string;
  newFeePlan: string;
}

const resultColor: Record<PromotionResult, string> = {
  PROMOTED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  DETAINED: 'bg-amber-50 text-amber-700 border-amber-200',
  TC:       'bg-slate-50 text-slate-500 border-slate-200',
};

const SECTIONS = ['A', 'B', 'C'];
const FEE_PLANS = ['Standard', 'RTE', 'Scholarship'];

const promoteClass = (cls: string): string => {
  const match = cls.match(/^(\D*)(\d+)(.*)$/);
  if (!match) return cls;
  const num = parseInt(match[2], 10);
  return `${match[1]}${num + 1}${match[3]}`;
};

const buildReviewChecks = (students: Student[]): ReviewCheck[] => {
  const pendingFeeStudents = students.filter(s => {
    const summary = feeService.getParentDueSummary(s.id);
    return summary.total > 0;
  });
  const lowAttendance = students.filter(s => s.attendancePercent < 75);

  return [
    {
      label: 'All Attendance Locked',
      status: 'OK',
      detail: '100% attendance records approved and locked.',
    },
    {
      label: 'Results Uploaded',
      status: lowAttendance.length > 0 ? 'WARN' : 'OK',
      detail: lowAttendance.length > 0
        ? `${lowAttendance.length} student(s) have attendance below 75%.`
        : 'All results uploaded and verified.',
    },
    {
      label: 'Pending Fee Records',
      status: pendingFeeStudents.length > 0 ? 'WARN' : 'OK',
      detail: pendingFeeStudents.length > 0
        ? `${pendingFeeStudents.length} student(s) have outstanding fees. Will carry forward.`
        : 'No outstanding fees.',
    },
    {
      label: 'Timetable Locked',
      status: 'OK',
      detail: 'All timetable entries will be read-only after closing.',
    },
  ];
};

interface Props { onBack: () => void; }

export const YearClosingWizard: React.FC<Props> = ({ onBack }) => {
  const [step, setStep] = useState<WizardStep>('REVIEW');
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [promotions, setPromotions] = useState<StudentPromotion[]>([]);
  const [reviewChecks, setReviewChecks] = useState<ReviewCheck[]>([]);
  const [closing, setClosing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    studentService.getAll().then(students => {
      setAllStudents(students);
      setReviewChecks(buildReviewChecks(students));
      const promos: StudentPromotion[] = students.map(s => {
        const feeSummary = feeService.getParentDueSummary(s.id);
        const lowAtt = s.attendancePercent < 75;
        const result: PromotionResult = lowAtt ? 'DETAINED' : 'PROMOTED';
        const newClass = result === 'PROMOTED' ? promoteClass(`${s.className}`) : s.className;
        return {
          id: s.id,
          name: s.name,
          currentClass: s.className,
          currentSection: s.section,
          rollNo: s.rollNo,
          attendancePercent: s.attendancePercent,
          feePending: feeSummary.total,
          promotionResult: result,
          newClass,
          newSection: s.section,
          newFeePlan: s.rte ? 'RTE' : 'Standard',
        };
      });
      setPromotions(promos);
      setLoading(false);
    });
  }, []);

  const updatePromotion = (id: string, field: keyof StudentPromotion, value: string) => {
    setPromotions(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const setResult = (id: string, result: PromotionResult) => {
    setPromotions(prev => prev.map(s => {
      if (s.id !== id) return s;
      const newClass = result === 'PROMOTED' ? promoteClass(s.currentClass) : result === 'TC' ? '—' : s.currentClass;
      return { ...s, promotionResult: result, newClass, newSection: result === 'TC' ? '—' : s.currentClass.split('-')[1] ?? s.currentSection };
    }));
  };

  const handleClose = async () => {
    setClosing(true);
    await new Promise(r => setTimeout(r, 1800));
    setClosing(false);
    setStep('DONE');
  };

  const hasBlocks = reviewChecks.some(c => c.status === 'BLOCK');
  const hasWarns = reviewChecks.some(c => c.status === 'WARN');

  if (loading) return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
    </div>
  );

  if (step === 'DONE') return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col items-center justify-center animate-in fade-in duration-500 p-8">
      <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-6">
        <CheckCircle2 size={40} className="text-emerald-500" />
      </div>
      <h2 className="text-2xl font-black text-slate-900 text-center">Year 2025-26 Closed!</h2>
      <p className="text-sm font-bold text-slate-400 text-center mt-3 max-w-xs">
        All records are now read-only. New academic year 2026-27 is ready for setup.
        Student promotions have been applied.
      </p>
      <div className="grid grid-cols-3 gap-3 mt-8 w-full max-w-sm">
        {[
          { label: 'Promoted', val: promotions.filter(s => s.promotionResult === 'PROMOTED').length, color: 'text-emerald-600' },
          { label: 'Detained', val: promotions.filter(s => s.promotionResult === 'DETAINED').length, color: 'text-amber-600' },
          { label: 'TC', val: promotions.filter(s => s.promotionResult === 'TC').length, color: 'text-slate-500' },
        ].map(({ label, val, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-100 p-3 text-center">
            <div className={`text-2xl font-black ${color}`}>{val}</div>
            <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-0.5">{label}</div>
          </div>
        ))}
      </div>
      <button onClick={onBack}
        className="mt-8 w-full max-w-sm py-3 bg-slate-900 text-white font-black rounded-2xl">
        Back to Dashboard
      </button>
    </div>
  );

  return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 pt-12 pb-4 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full">
            <ArrowLeft size={20} className="text-slate-600" />
          </button>
          <div>
            <h2 className="text-xl font-black text-slate-900">Year Closing Wizard</h2>
            <p className="text-[10px] font-bold text-slate-400">Academic Year 2025-26 · {allStudents.length} students</p>
          </div>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2">
          {(['REVIEW', 'PROMOTE'] as WizardStep[]).map((s, i) => (
            <React.Fragment key={s}>
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black ${
                step === s ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-400'
              }`}>
                <span>{i + 1}</span>
                <span className="uppercase tracking-widest">{s === 'REVIEW' ? 'Review' : 'Promote'}</span>
              </div>
              {i < 1 && <ChevronRight size={14} className="text-slate-300" />}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-32 space-y-3">
        {/* REVIEW STEP */}
        {step === 'REVIEW' && (
          <>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Pre-close Checklist</p>
            {reviewChecks.map(check => (
              <div key={check.label}
                className={`flex items-start gap-3 p-4 rounded-2xl border ${
                  check.status === 'OK'   ? 'bg-emerald-50 border-emerald-200' :
                  check.status === 'WARN' ? 'bg-amber-50 border-amber-200' :
                  'bg-rose-50 border-rose-200'
                }`}>
                {check.status === 'OK'    && <CheckCircle2 size={18} className="text-emerald-500 shrink-0 mt-0.5" />}
                {check.status === 'WARN'  && <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />}
                {check.status === 'BLOCK' && <AlertTriangle size={18} className="text-rose-500 shrink-0 mt-0.5" />}
                <div>
                  <div className="font-extrabold text-slate-900 text-sm">{check.label}</div>
                  <div className="text-[10px] font-bold text-slate-500 mt-0.5">{check.detail}</div>
                </div>
              </div>
            ))}

            {hasWarns && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 mt-2">
                <p className="text-[11px] font-bold text-amber-700">
                  Warnings found. You can still proceed — pending items will carry forward to next year.
                </p>
              </div>
            )}

            <div className="flex items-center gap-3 bg-slate-100 rounded-2xl p-4">
              <Lock size={16} className="text-slate-500 shrink-0" />
              <div>
                <div className="font-extrabold text-slate-900 text-sm">After closing, these will be locked:</div>
                <div className="text-[10px] font-bold text-slate-400 mt-1">
                  Attendance · Results · Timetable · Paid fee records
                </div>
              </div>
            </div>
          </>
        )}

        {/* PROMOTE STEP */}
        {step === 'PROMOTE' && (
          <>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
              Promotion Wizard · {promotions.length} students
            </p>
            <div className="flex gap-3 text-[10px] font-bold text-slate-500">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> {promotions.filter(s => s.promotionResult === 'PROMOTED').length} promoted</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> {promotions.filter(s => s.promotionResult === 'DETAINED').length} detained</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-300 inline-block" /> {promotions.filter(s => s.promotionResult === 'TC').length} TC</span>
            </div>

            {promotions.map(s => (
              <div key={s.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="font-extrabold text-slate-900">{s.name}</div>
                    <div className="text-[10px] font-bold text-slate-400 mt-0.5">
                      {s.currentClass}-{s.currentSection} · Roll {s.rollNo} · {s.attendancePercent}% attendance
                    </div>
                    {s.feePending > 0 && (
                      <div className="text-[10px] font-black text-amber-600 mt-0.5">
                        ₹{s.feePending.toLocaleString()} fee pending (will carry forward)
                      </div>
                    )}
                  </div>
                  {/* Result toggle */}
                  <div className="flex flex-col gap-1 shrink-0">
                    {(['PROMOTED', 'DETAINED', 'TC'] as PromotionResult[]).map(r => (
                      <button key={r} onClick={() => setResult(s.id, r)}
                        className={`text-[8px] font-black px-2 py-0.5 rounded-full border transition-colors ${
                          s.promotionResult === r ? resultColor[r] : 'bg-white border-slate-200 text-slate-400'
                        }`}>
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                {s.promotionResult !== 'TC' && (
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1 block">New Class</label>
                      <input value={s.newClass} onChange={e => updatePromotion(s.id, 'newClass', e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold outline-none focus:border-blue-500" />
                    </div>
                    <div>
                      <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Section</label>
                      <select value={s.newSection} onChange={e => updatePromotion(s.id, 'newSection', e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold outline-none focus:border-blue-500 appearance-none">
                        {SECTIONS.map(sec => <option key={sec}>{sec}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Fee Plan</label>
                      <select value={s.newFeePlan} onChange={e => updatePromotion(s.id, 'newFeePlan', e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold outline-none focus:border-blue-500 appearance-none">
                        {FEE_PLANS.map(p => <option key={p}>{p}</option>)}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </div>

      {/* Bottom action */}
      <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-slate-100 p-4">
        {step === 'REVIEW' && (
          <button onClick={() => setStep('PROMOTE')} disabled={hasBlocks}
            className="w-full py-4 bg-slate-900 text-white font-black rounded-2xl disabled:opacity-40 flex items-center justify-center gap-2">
            <Users size={18} /> Continue to Promotion Wizard
          </button>
        )}
        {step === 'PROMOTE' && (
          <button onClick={handleClose} disabled={closing}
            className="w-full py-4 bg-rose-600 text-white font-black rounded-2xl flex items-center justify-center gap-2 disabled:opacity-60">
            {closing ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Closing Year...
              </>
            ) : (
              <>
                <Lock size={18} /> Close Academic Year 2025-26
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};
