import React, { useEffect, useMemo, useState } from 'react';
import { X, ChevronRight, ChevronLeft, Plus, Trash2, CheckCircle2, AlertTriangle, Sparkles, IndianRupee } from 'lucide-react';
import { useUIStore } from '@/shared/store/uiStore';
import { academicYearService, type WizardSection } from '@/modules/academic-year/academicYear.service';
import { principalService } from '@/shared/services/principal.service';

interface Props {
  onClose: () => void;
  onCreated: (yearId: string) => void;
  defaultLabel?: string;
  defaultStart?: string;
  defaultEnd?: string;
  defaultBoard?: string;
}

const ALL_CLASSES = [
  'Nursery', 'LKG', 'UKG',
  'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5',
  'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10',
  'Class 11', 'Class 12',
];

const STREAM_REQUIRED = (cls: string) => cls === 'Class 11' || cls === 'Class 12';
const ALL_STREAMS = ['Science', 'Commerce', 'Arts'];
const SECTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

interface ClassPlan {
  className: string;
  enabled: boolean;
  sections: Array<{ letter: string; capacity: number; stream?: string }>;
}

function defaultPlan(): ClassPlan[] {
  return ALL_CLASSES.map(name => ({
    className: name,
    enabled: false,
    sections: [{ letter: 'A', capacity: 45, stream: STREAM_REQUIRED(name) ? 'Science' : undefined }],
  }));
}

export const AcademicYearWizard: React.FC<Props> = ({
  onClose, onCreated, defaultLabel = '', defaultStart = '', defaultEnd = '', defaultBoard = 'CBSE',
}) => {
  const { showToast } = useUIStore();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1
  const [label, setLabel] = useState(defaultLabel);
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [board, setBoard] = useState(defaultBoard);
  const [medium, setMedium] = useState('English');
  const [streams, setStreams] = useState<string[]>(ALL_STREAMS);

  // Step 2/3
  const [plan, setPlan] = useState<ClassPlan[]>(defaultPlan);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Step 4 — fee quick-setup (after year is created)
  const [createdYearId, setCreatedYearId] = useState<string | null>(null);
  const [tuitionFee, setTuitionFee] = useState('');
  const [feesSaving, setFeesSaving] = useState(false);

  // Prevents touch-through: when the wizard transitions from step 3 → 4,
  // the "Create Year" button tap can register on the "Skip" button that
  // appears at the same position after re-render. Wait 450ms before
  // enabling step 4 buttons so the original touch event drains away.
  const [step4Ready, setStep4Ready] = useState(false);
  useEffect(() => {
    if (step !== 4) { setStep4Ready(false); return; }
    const t = setTimeout(() => setStep4Ready(true), 450);
    return () => clearTimeout(t);
  }, [step]);

  const enabledClasses = useMemo(() => plan.filter(c => c.enabled), [plan]);

  // ─── Step 1 validation ─────────────────────────────────────────────────
  const step1Valid = useMemo(() => {
    if (!label.trim()) return false;
    if (!startDate || !endDate) return false;
    if (endDate <= startDate) return false;
    if (streams.length === 0) return false;
    return true;
  }, [label, startDate, endDate, streams]);

  // ─── Step 2 validation ─────────────────────────────────────────────────
  const step2Valid = enabledClasses.length > 0;

  // ─── Step 3 validation ─────────────────────────────────────────────────
  // Note: we deliberately do NOT enforce "every selected stream must have at
  // least one Class 11/12 section". A school may enable Arts as a future
  // possibility but not actually staff it this year, and the wizard should
  // not block that. The DB-side RPC mirrors this — it only checks each
  // section's stream is a member of the year's selected streams.
  const step3Issues = useMemo(() => {
    const issues: string[] = [];
    enabledClasses.forEach(c => {
      if (c.sections.length === 0) {
        issues.push(`${c.className}: at least one section needed`);
      }
      const seen = new Set<string>();
      c.sections.forEach(s => {
        if (!s.letter.trim()) {
          issues.push(`${c.className}: section letter blank`);
        } else if (seen.has(s.letter.toUpperCase())) {
          issues.push(`${c.className}: section ${s.letter} repeated`);
        }
        seen.add(s.letter.toUpperCase());
        if (s.capacity < 1) {
          issues.push(`${c.className}-${s.letter}: capacity must be > 0`);
        }
        if (STREAM_REQUIRED(c.className) && (!s.stream || !streams.includes(s.stream))) {
          issues.push(`${c.className}-${s.letter}: pick a stream`);
        }
      });
    });
    return issues;
  }, [enabledClasses, streams]);

  // ─── Class toggle ──────────────────────────────────────────────────────
  const toggleClass = (className: string) => {
    setPlan(prev => prev.map(c =>
      c.className === className ? { ...c, enabled: !c.enabled } : c
    ));
  };

  // ─── Section ops (Step 3) ──────────────────────────────────────────────
  const updateSection = (
    className: string,
    idx: number,
    patch: Partial<{ letter: string; capacity: number; stream: string }>,
  ) => {
    setPlan(prev => prev.map(c => {
      if (c.className !== className) return c;
      const newSecs = [...c.sections];
      newSecs[idx] = { ...newSecs[idx], ...patch };
      return { ...c, sections: newSecs };
    }));
  };

  const addSection = (className: string) => {
    setPlan(prev => prev.map(c => {
      if (c.className !== className) return c;
      const used = new Set(c.sections.map(s => s.letter.toUpperCase()));
      const next = SECTION_LETTERS.find(l => !used.has(l)) ?? 'A';
      return {
        ...c,
        sections: [
          ...c.sections,
          {
            letter: next,
            capacity: 45,
            stream: STREAM_REQUIRED(className) ? streams[0] : undefined,
          },
        ],
      };
    }));
  };

  const removeSection = (className: string, idx: number) => {
    setPlan(prev => prev.map(c => {
      if (c.className !== className) return c;
      return { ...c, sections: c.sections.filter((_, i) => i !== idx) };
    }));
  };

  // ─── Submit ────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (step3Issues.length > 0) {
      setError(step3Issues[0]);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const sectionsPayload: WizardSection[] = enabledClasses.flatMap(c =>
        c.sections.map(s => ({
          className: c.className,
          section: s.letter.toUpperCase(),
          stream: STREAM_REQUIRED(c.className) ? (s.stream ?? null) : null,
          capacity: s.capacity,
        })),
      );
      const id = await academicYearService.createWithSections({
        label: label.trim(),
        startDate, endDate, board, medium, streams,
        sections: sectionsPayload,
      });
      showToast(`${label.trim()} created with ${sectionsPayload.length} sections`);
      setCreatedYearId(id);
      setStep(4);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to create academic year';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ─── Step 4: finish wizard (save optional fees then call onCreated) ──────
  const handleFinishWizard = async (saveFees: boolean) => {
    if (saveFees && createdYearId && Number(tuitionFee) > 0) {
      setFeesSaving(true);
      try {
        await Promise.all(
          enabledClasses.map((c, i) =>
            principalService.saveFeeStructureForYear(createdYearId, {
              name: `Tuition - ${c.className}`,
              className: c.className,
              billingCycle: 'MONTHLY',
              feeHeads: [{
                id: `h${Date.now()}-${i}`,
                name: 'Tuition Fee',
                amount: Number(tuitionFee),
                frequency: 'MONTHLY',
                description: 'Monthly tuition charges',
              }],
              monthlyDueDates: [],
              structureType: 'CLASS' as const,
              lateFee: { enabled: false, gracePeriodDays: 5, type: 'FIXED', amount: 100, maxCap: 1000 },
            }),
          ),
        );
        showToast(`${enabledClasses.length} fee structures saved`);
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Fee save failed', 'error');
      } finally {
        setFeesSaving(false);
      }
    }
    onCreated(createdYearId ?? '');
  };

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
      onClick={() => !saving && !feesSaving && step < 4 && onClose()}
    >
      <div
        className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-lg max-h-[92vh] flex flex-col animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-indigo-600" />
              <h3 className="font-black text-slate-900 text-base">New Academic Year</h3>
            </div>
            <button
              onClick={onClose}
              disabled={saving}
              className="p-1.5 -mr-1.5 text-slate-400 hover:text-slate-600 disabled:opacity-50"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
          {/* Step pills */}
          <div className="flex items-center gap-1.5">
            {[1, 2, 3, 4].map(s => (
              <div
                key={s}
                className={`flex-1 h-1.5 rounded-full transition-colors ${
                  s === step ? 'bg-indigo-600'
                  : s < step ? 'bg-indigo-300'
                  : 'bg-slate-200'
                }`}
              />
            ))}
          </div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-2">
            Step {step} of 4 ·{' '}
            {step === 1 ? 'Year basics' : step === 2 ? 'Pick classes' : step === 3 ? 'Sections & capacity' : 'Fee setup'}
          </p>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {/* ─── STEP 1: BASICS ─────────────────────────────────────── */}
          {step === 1 && (
            <div key="step-1" className="space-y-3 animate-in fade-in slide-in-from-right-4 duration-200">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Label</label>
                <input
                  value={label}
                  onChange={e => setLabel(e.target.value)}
                  placeholder="e.g. 2026-27"
                  className="w-full mt-1 border border-slate-200 bg-slate-50 rounded-xl px-3 py-2.5 font-bold text-sm outline-none focus:border-slate-900"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Start Date</label>
                  <input
                    type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                    className="w-full mt-1 border border-slate-200 bg-slate-50 rounded-xl px-3 py-2.5 font-bold text-sm outline-none focus:border-slate-900"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">End Date</label>
                  <input
                    type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                    className="w-full mt-1 border border-slate-200 bg-slate-50 rounded-xl px-3 py-2.5 font-bold text-sm outline-none focus:border-slate-900"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Board</label>
                  <select value={board} onChange={e => setBoard(e.target.value)}
                    className="w-full mt-1 border border-slate-200 bg-slate-50 rounded-xl px-3 py-2.5 font-bold text-sm outline-none focus:border-slate-900">
                    <option value="CBSE">CBSE</option>
                    <option value="ICSE">ICSE</option>
                    <option value="State">State Board</option>
                    <option value="IB">IB</option>
                    <option value="IGCSE">IGCSE</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Medium</label>
                  <select value={medium} onChange={e => setMedium(e.target.value)}
                    className="w-full mt-1 border border-slate-200 bg-slate-50 rounded-xl px-3 py-2.5 font-bold text-sm outline-none focus:border-slate-900">
                    <option value="English">English</option>
                    <option value="Hindi">Hindi</option>
                    <option value="Hinglish">Hinglish</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                  Streams (Class 11 / 12)
                </p>
                <p className="text-[11px] font-bold text-slate-500 mb-2 leading-relaxed">
                  Yeh streams Class 11 & 12 sections ke liye available honge.
                </p>
                <div className="flex flex-wrap gap-2">
                  {ALL_STREAMS.map(s => {
                    const on = streams.includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setStreams(prev => on ? prev.filter(x => x !== s) : [...prev, s])}
                        className={`px-3 py-1.5 rounded-full text-xs font-black border transition-colors ${
                          on
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-slate-600 border-slate-200'
                        }`}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ─── STEP 2: PICK CLASSES ────────────────────────────────── */}
          {step === 2 && (
            <div key="step-2" className="space-y-3 animate-in fade-in slide-in-from-right-4 duration-200">
              <p className="text-[11px] font-bold text-slate-500 leading-relaxed">
                Kaunsi classes is year ke liye chalu karni hain? Aap baad me wapas wizard chala kar nahi badal sakte —
                section list ko alag se manage karne ke liye baad me feature aayega.
              </p>
              <div className="grid grid-cols-3 gap-2">
                {plan.map(c => (
                  <button
                    key={c.className}
                    type="button"
                    onClick={() => toggleClass(c.className)}
                    className={`px-2 py-3 rounded-xl text-xs font-black border-2 transition-colors ${
                      c.enabled
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                        : 'bg-slate-50 text-slate-500 border-slate-200'
                    }`}
                  >
                    {c.enabled && <CheckCircle2 size={12} className="inline mr-1 text-emerald-600" />}
                    {c.className.replace('Class ', '')}
                  </button>
                ))}
              </div>
              {enabledClasses.length > 0 && (
                <p className="text-[10px] font-bold text-emerald-600 text-center pt-2">
                  {enabledClasses.length} {enabledClasses.length === 1 ? 'class' : 'classes'} enabled
                </p>
              )}
            </div>
          )}

          {/* ─── STEP 3: SECTIONS PER CLASS ──────────────────────────── */}
          {/* Section letters are unique per (academic_year, class), enforced
              by the existing UNIQUE(academic_year_id, class_name, section)
              index. So Class 11 cannot have two "A" sections (e.g. one
              Science, one Commerce); use distinct letters (A, B, …) and
              assign streams individually. This matches the legacy DB
              contract from migration 0001. */}
          {step === 3 && (
            <div key="step-3" className="space-y-3 animate-in fade-in slide-in-from-right-4 duration-200">
              <p className="text-[11px] font-bold text-slate-500 leading-relaxed">
                Har class ke sections add karein, capacity set karein. Class 11/12 me stream chuna zaroori hai.
              </p>
              <div className="space-y-3">
                {enabledClasses.map(c => (
                  <div key={c.className} className="border border-slate-200 rounded-2xl p-3 bg-slate-50">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-black text-slate-900 text-sm">{c.className}</p>
                      <button
                        type="button"
                        onClick={() => addSection(c.className)}
                        className="px-2.5 py-1 rounded-full bg-indigo-600 text-white text-[10px] font-black flex items-center gap-1"
                      >
                        <Plus size={10} /> Section
                      </button>
                    </div>
                    <div className="space-y-2">
                      {c.sections.map((s, idx) => (
                        <div key={idx} className="bg-white rounded-xl p-2 border border-slate-200">
                          <div className="flex items-center gap-2">
                            <input
                              value={s.letter}
                              onChange={e => updateSection(c.className, idx, { letter: e.target.value.toUpperCase().slice(0, 2) })}
                              placeholder="A"
                              className="w-12 border border-slate-200 bg-slate-50 rounded-lg px-2 py-1.5 font-black text-sm outline-none text-center"
                            />
                            <input
                              type="number"
                              min={1}
                              value={s.capacity}
                              onChange={e => updateSection(c.className, idx, { capacity: parseInt(e.target.value) || 0 })}
                              className="w-20 border border-slate-200 bg-slate-50 rounded-lg px-2 py-1.5 font-bold text-sm outline-none"
                              placeholder="Cap"
                            />
                            <span className="text-[10px] font-bold text-slate-400 flex-shrink-0">seats</span>
                            {STREAM_REQUIRED(c.className) && (
                              <select
                                value={s.stream ?? ''}
                                onChange={e => updateSection(c.className, idx, { stream: e.target.value })}
                                className="flex-1 min-w-0 border border-slate-200 bg-slate-50 rounded-lg px-2 py-1.5 font-bold text-xs outline-none"
                              >
                                {streams.map(st => <option key={st} value={st}>{st}</option>)}
                              </select>
                            )}
                            {c.sections.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeSection(c.className, idx)}
                                className="p-1.5 text-slate-300 hover:text-rose-500"
                                aria-label="Remove section"
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {step3Issues.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2">
                  <AlertTriangle size={14} className="text-amber-600 mt-0.5 shrink-0" />
                  <div className="text-[11px] font-bold text-amber-700 leading-relaxed">
                    {step3Issues.slice(0, 3).map((i, idx) => <p key={idx}>· {i}</p>)}
                    {step3Issues.length > 3 && <p>· +{step3Issues.length - 3} more</p>}
                  </div>
                </div>
              )}
              {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2">
                  <AlertTriangle size={14} className="text-rose-600 mt-0.5 shrink-0" />
                  <p className="text-[11px] font-black text-rose-700 leading-relaxed">{error}</p>
                </div>
              )}
            </div>
          )}

          {/* ─── STEP 4: OPTIONAL FEE SETUP ─────────────────────────── */}
          {step === 4 && (
            <div key="step-4" className="space-y-3 animate-in fade-in slide-in-from-right-4 duration-200">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2">
                <CheckCircle2 size={14} className="text-emerald-600 mt-0.5 shrink-0" />
                <p className="text-[11px] font-bold text-emerald-800 leading-relaxed">
                  {label.trim()} ban gaya — {enabledClasses.length} classes ke saath!
                </p>
              </div>
              <p className="text-[11px] font-bold text-slate-500 leading-relaxed">
                Optional: Abhi sabhi {enabledClasses.length} classes ke liye ek common monthly tuition fee set kar sakte hain. Detailed configuration baad mein Settings → Fee Structure mein ho sakti hai.
              </p>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
                  Monthly Tuition Fee — sabhi classes (₹)
                </label>
                <input
                  type="number"
                  min={0}
                  value={tuitionFee}
                  onChange={e => setTuitionFee(e.target.value)}
                  placeholder="e.g. 1500 — khali chhod sakte hain"
                  className="w-full mt-1 border border-slate-200 bg-slate-50 rounded-xl px-3 py-2.5 font-bold text-sm outline-none focus:border-slate-900"
                />
                {Number(tuitionFee) > 0 && (
                  <p className="text-[10px] font-bold text-indigo-600 mt-1">
                    {enabledClasses.length} fee structures create hongi — ek har class ke liye
                  </p>
                )}
              </div>
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 space-y-1">
                <p className="text-[10px] font-bold text-blue-700">
                  Classes: {enabledClasses.map(c => c.className).join(', ')}
                </p>
                <p className="text-[10px] font-bold text-blue-500">
                  Alag-alag amounts ya exam/lab fees ke liye Settings → Fee Structure use karein.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 flex items-center gap-2">
          {step > 1 && step < 4 && (
            <button
              onClick={() => { setError(''); setStep(prev => (prev - 1) as 1 | 2 | 3); }}
              disabled={saving}
              className="px-4 py-2.5 border border-slate-200 text-slate-600 font-black rounded-xl text-sm flex items-center gap-1 disabled:opacity-50"
            >
              <ChevronLeft size={14} /> Back
            </button>
          )}
          <div className="flex-1" />
          {step < 3 ? (
            <button
              onClick={() => {
                setError('');
                if (step === 1 && !step1Valid) {
                  setError('Sab fields fill karein, end date start ke baad ho aur kam se kam 1 stream chunein');
                  return;
                }
                if (step === 2 && !step2Valid) {
                  setError('Kam se kam 1 class enable karein');
                  return;
                }
                setStep(prev => (prev + 1) as 1 | 2 | 3 | 4);
              }}
              className="px-4 py-2.5 bg-indigo-600 text-white font-black rounded-xl text-sm flex items-center gap-1"
            >
              Next <ChevronRight size={14} />
            </button>
          ) : step === 3 ? (
            <button
              onClick={() => { void handleSubmit(); }}
              disabled={saving || step3Issues.length > 0}
              className="px-4 py-2.5 bg-emerald-600 text-white font-black rounded-xl text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {saving ? 'Creating…' : 'Create Year'}
            </button>
          ) : (
            <>
              <button
                onClick={() => { void handleFinishWizard(false); }}
                disabled={!step4Ready || feesSaving}
                className="px-4 py-2.5 border border-slate-200 text-slate-600 font-black rounded-xl text-sm disabled:opacity-50"
              >
                Skip
              </button>
              <button
                onClick={() => { void handleFinishWizard(true); }}
                disabled={!step4Ready || feesSaving}
                className="px-4 py-2.5 bg-emerald-600 text-white font-black rounded-xl text-sm flex items-center gap-2 disabled:opacity-50"
              >
                {feesSaving && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {feesSaving ? 'Saving…' : Number(tuitionFee) > 0 ? 'Save & Done' : 'Done'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
