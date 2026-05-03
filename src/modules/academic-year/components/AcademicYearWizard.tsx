import React, { useEffect, useMemo, useState } from 'react';
import { X, ChevronRight, ChevronLeft, Plus, Trash2, CheckCircle2, AlertTriangle, Sparkles, RefreshCw } from 'lucide-react';
import { useUIStore } from '@/shared/store/uiStore';
import { academicYearService, type WizardSection } from '@/modules/academic-year/academicYear.service';
import { principalService } from '@/shared/services/principal.service';
import { apiPromotion } from '@/shared/lib/apiClient';

interface Props {
  onClose: () => void;
  onCreated: (yearId: string) => void;
  defaultLabel?: string;
  defaultStart?: string;
  defaultEnd?: string;
  defaultBoard?: string;
  previousYearId?: string;
}

// ─── Class catalogue ──────────────────────────────────────────────────────────
interface ClassMeta { label: string; className: string; stream: string | null; group: string }

const CLASS_CATALOGUE: ClassMeta[] = [
  { label: 'Nursery',       className: 'Nursery',          stream: null,       group: 'Pre-Primary' },
  { label: 'LKG',           className: 'LKG',              stream: null,       group: 'Pre-Primary' },
  { label: 'UKG',           className: 'UKG',              stream: null,       group: 'Pre-Primary' },
  { label: 'Class 1',       className: 'Class 1',          stream: null,       group: 'Primary' },
  { label: 'Class 2',       className: 'Class 2',          stream: null,       group: 'Primary' },
  { label: 'Class 3',       className: 'Class 3',          stream: null,       group: 'Primary' },
  { label: 'Class 4',       className: 'Class 4',          stream: null,       group: 'Primary' },
  { label: 'Class 5',       className: 'Class 5',          stream: null,       group: 'Primary' },
  { label: 'Class 6',       className: 'Class 6',          stream: null,       group: 'Middle' },
  { label: 'Class 7',       className: 'Class 7',          stream: null,       group: 'Middle' },
  { label: 'Class 8',       className: 'Class 8',          stream: null,       group: 'Middle' },
  { label: 'Class 9',       className: 'Class 9',          stream: null,       group: 'Secondary' },
  { label: 'Class 10',      className: 'Class 10',         stream: null,       group: 'Secondary' },
  { label: '11th Science',  className: '11th Science',     stream: 'Science',  group: 'Sr Secondary' },
  { label: '11th Commerce', className: '11th Commerce',    stream: 'Commerce', group: 'Sr Secondary' },
  { label: '11th Arts',     className: '11th Arts',        stream: 'Arts',     group: 'Sr Secondary' },
  { label: '11th Maths',    className: '11th Maths',       stream: 'Maths',    group: 'Sr Secondary' },
  { label: '12th Science',  className: '12th Science',     stream: 'Science',  group: 'Sr Secondary' },
  { label: '12th Commerce', className: '12th Commerce',    stream: 'Commerce', group: 'Sr Secondary' },
  { label: '12th Arts',     className: '12th Arts',        stream: 'Arts',     group: 'Sr Secondary' },
  { label: '12th Maths',    className: '12th Maths',       stream: 'Maths',    group: 'Sr Secondary' },
];

const CLASS_GROUPS = ['Pre-Primary', 'Primary', 'Middle', 'Secondary', 'Sr Secondary'];

// ─── Local types ──────────────────────────────────────────────────────────────
interface SectionDraft { name: string; capacity: number }
interface ClassPlan { meta: ClassMeta; enabled: boolean; sections: SectionDraft[] }

function defaultPlan(): ClassPlan[] {
  return CLASS_CATALOGUE.map(meta => ({
    meta,
    enabled: false,
    sections: [{ name: 'A', capacity: 45 }],
  }));
}

function planFromPrevious(
  sections: { class_name: string; section: string; stream?: string | null; capacity?: number }[],
): ClassPlan[] {
  // Build a map: class_name → sections[]
  const secMap = new Map<string, SectionDraft[]>();
  for (const s of sections) {
    const cls = s.class_name;
    if (!secMap.has(cls)) secMap.set(cls, []);
    secMap.get(cls)!.push({ name: s.section, capacity: s.capacity ?? 45 });
  }

  return CLASS_CATALOGUE.map(meta => {
    const prevSections = secMap.get(meta.className);
    if (prevSections && prevSections.length > 0) {
      return { meta, enabled: true, sections: prevSections };
    }
    return { meta, enabled: false, sections: [{ name: 'A', capacity: 45 }] };
  });
}

// ─── Component ────────────────────────────────────────────────────────────────
export const AcademicYearWizard: React.FC<Props> = ({
  onClose, onCreated,
  defaultLabel = '', defaultStart = '', defaultEnd = '', defaultBoard = 'CBSE',
  previousYearId,
}) => {
  const { showToast } = useUIStore();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1
  const [label, setLabel]       = useState(defaultLabel);
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate]   = useState(defaultEnd);
  const [board, setBoard]       = useState(defaultBoard);
  const [medium, setMedium]     = useState('English');

  // Step 2/3
  const [plan, setPlan]         = useState<ClassPlan[]>(defaultPlan);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  // Previous year pre-fill
  const [prefillLoading, setPrefillLoading] = useState(false);
  const [prefillApplied, setPrefillApplied] = useState(false);
  const [prevYearLabel, setPrevYearLabel]   = useState<string>('');

  // Step 4 — fee quick-setup (after year is created)
  const [createdYearId, setCreatedYearId]   = useState<string | null>(null);
  const [tuitionFee, setTuitionFee]         = useState('');
  const [feesSaving, setFeesSaving]         = useState(false);

  // Prevent tap-through: disable step 4 buttons briefly after transition
  const [step4Ready, setStep4Ready] = useState(false);
  useEffect(() => {
    if (step !== 4) { setStep4Ready(false); return; }
    const t = setTimeout(() => setStep4Ready(true), 450);
    return () => clearTimeout(t);
  }, [step]);

  // Auto-load previous year data when wizard mounts with previousYearId
  useEffect(() => {
    if (!previousYearId || prefillApplied) return;
    loadPreviousYearData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previousYearId]);

  const loadPreviousYearData = async () => {
    if (!previousYearId) return;
    setPrefillLoading(true);
    try {
      const data = await apiPromotion.previousYearData(previousYearId);
      if (data && Array.isArray(data.sections) && data.sections.length > 0) {
        const newPlan = planFromPrevious(data.sections);
        setPlan(newPlan);
        setPrefillApplied(true);
        setPrevYearLabel(data.yearLabel ?? '');
        showToast(`Previous year (${data.yearLabel}) ki classes pre-filled ho gayi`);
      }
    } catch {
      // Non-fatal — user can still set up manually
    } finally {
      setPrefillLoading(false);
    }
  };

  const enabledClasses = useMemo(() => plan.filter(c => c.enabled), [plan]);

  // ─── Validation ─────────────────────────────────────────────────────────────
  const step1Valid = useMemo(() =>
    !!label.trim() && !!startDate && !!endDate && endDate > startDate,
  [label, startDate, endDate]);

  const step2Valid = enabledClasses.length > 0;

  const step3Issues = useMemo(() => {
    const issues: string[] = [];
    enabledClasses.forEach(c => {
      if (c.sections.length === 0) {
        issues.push(`${c.meta.label}: at least one section needed`);
        return;
      }
      const seen = new Set<string>();
      c.sections.forEach(s => {
        const key = s.name.trim().toLowerCase();
        if (!key) {
          issues.push(`${c.meta.label}: section name blank hai`);
        } else if (seen.has(key)) {
          issues.push(`${c.meta.label}: "${s.name}" section repeat ho raha hai`);
        }
        seen.add(key);
        if (s.capacity < 1) {
          issues.push(`${c.meta.label} - ${s.name}: capacity > 0 honi chahiye`);
        }
      });
    });
    return issues;
  }, [enabledClasses]);

  // ─── Mutations ──────────────────────────────────────────────────────────────
  const toggleClass = (className: string) =>
    setPlan(prev => prev.map(c =>
      c.meta.className === className ? { ...c, enabled: !c.enabled } : c,
    ));

  const updateSection = (className: string, idx: number, patch: Partial<SectionDraft>) =>
    setPlan(prev => prev.map(c => {
      if (c.meta.className !== className) return c;
      const secs = [...c.sections];
      secs[idx] = { ...secs[idx], ...patch };
      return { ...c, sections: secs };
    }));

  const addSection = (className: string) =>
    setPlan(prev => prev.map(c => {
      if (c.meta.className !== className) return c;
      return { ...c, sections: [...c.sections, { name: '', capacity: 45 }] };
    }));

  const removeSection = (className: string, idx: number) =>
    setPlan(prev => prev.map(c => {
      if (c.meta.className !== className) return c;
      return { ...c, sections: c.sections.filter((_, i) => i !== idx) };
    }));

  // ─── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (step3Issues.length > 0) { setError(step3Issues[0]); return; }
    setSaving(true); setError('');
    try {
      const sectionsPayload: WizardSection[] = enabledClasses.flatMap(c =>
        c.sections.map(s => ({
          className: c.meta.className,
          section:   s.name.trim(),
          stream:    c.meta.stream,
          capacity:  s.capacity,
        })),
      );
      const streamsUsed = [...new Set(
        enabledClasses.map(c => c.meta.stream).filter(Boolean) as string[],
      )];
      const id = await academicYearService.createWithSections({
        label: label.trim(), startDate, endDate, board, medium,
        streams: streamsUsed,
        sections: sectionsPayload,
      });
      showToast(`${label.trim()} ban gaya — ${sectionsPayload.length} sections ke saath!`);
      setCreatedYearId(id);
      setStep(4);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Academic year create karne mein error';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ─── Step 4: finish wizard ───────────────────────────────────────────────────
  const handleFinishWizard = async (saveFees: boolean) => {
    if (saveFees && createdYearId && Number(tuitionFee) > 0) {
      setFeesSaving(true);
      try {
        await Promise.all(
          enabledClasses.map((c, i) =>
            principalService.saveFeeStructureForYear(createdYearId, {
              name:         `Tuition - ${c.meta.label}`,
              className:    c.meta.className,
              billingCycle: 'MONTHLY',
              feeHeads: [{
                id:          `h${Date.now()}-${i}`,
                name:        'Tuition Fee',
                amount:      Number(tuitionFee),
                frequency:   'MONTHLY',
                description: 'Monthly tuition charges',
              }],
              monthlyDueDates: [],
              structureType:   'CLASS' as const,
              lateFee: { enabled: false, gracePeriodDays: 5, type: 'FIXED', amount: 100, maxCap: 1000 },
            }),
          ),
        );
        showToast(`${enabledClasses.length} fee structures save ho gaye`);
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Fee save failed', 'error');
      } finally {
        setFeesSaving(false);
      }
    }
    onCreated(createdYearId ?? '');
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
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
              <h3 className="font-black text-slate-900 text-base">Naya Academic Year</h3>
            </div>
            <button
              onClick={onClose} disabled={saving}
              className="p-1.5 -mr-1.5 text-slate-400 hover:text-slate-600 disabled:opacity-50"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            {[1, 2, 3, 4].map(s => (
              <div key={s} className={`flex-1 h-1.5 rounded-full transition-colors ${
                s === step ? 'bg-indigo-600' : s < step ? 'bg-indigo-300' : 'bg-slate-200'
              }`} />
            ))}
          </div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-2">
            Step {step} of 4 ·{' '}
            {step === 1 ? 'Year details' : step === 2 ? 'Classes chunein' : step === 3 ? 'Sections & seats' : 'Fee setup'}
          </p>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">

          {/* ── STEP 1: BASICS ── */}
          {step === 1 && (
            <div key="step-1" className="space-y-3 animate-in fade-in slide-in-from-right-4 duration-200">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Label</label>
                <input
                  value={label} onChange={e => setLabel(e.target.value)}
                  placeholder="e.g. 2026-27"
                  className="w-full mt-1 border border-slate-200 bg-slate-50 rounded-xl px-3 py-2.5 font-bold text-sm outline-none focus:border-slate-900"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Shuru</label>
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                    className="w-full mt-1 border border-slate-200 bg-slate-50 rounded-xl px-3 py-2.5 font-bold text-sm outline-none focus:border-slate-900" />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Khatam</label>
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                    className="w-full mt-1 border border-slate-200 bg-slate-50 rounded-xl px-3 py-2.5 font-bold text-sm outline-none focus:border-slate-900" />
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
            </div>
          )}

          {/* ── STEP 2: CLASSES ── */}
          {step === 2 && (
            <div key="step-2" className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-200">
              <p className="text-[11px] font-bold text-slate-500 leading-relaxed">
                Is saal kaunsi classes chalani hain? Class 11/12 ke liye stream alag-alag select kar sakte hain.
              </p>

              {/* Pre-fill banner */}
              {previousYearId && (
                <div className={`rounded-xl p-3 flex items-center gap-2 text-[10px] font-bold ${
                  prefillApplied
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                    : 'bg-indigo-50 border border-indigo-200 text-indigo-800'
                }`}>
                  {prefillLoading ? (
                    <div className="w-3.5 h-3.5 border-2 border-indigo-300 border-t-indigo-700 rounded-full animate-spin shrink-0" />
                  ) : prefillApplied ? (
                    <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                  ) : (
                    <RefreshCw size={13} className="text-indigo-600 shrink-0" />
                  )}
                  <span className="flex-1">
                    {prefillLoading ? 'Previous year ki classes load ho rahi hain…' :
                     prefillApplied ? `${prevYearLabel} ki classes pre-filled — aap edit kar sakte hain` :
                     'Previous year data load nahi hua — manually select karein'}
                  </span>
                  {!prefillApplied && !prefillLoading && previousYearId && (
                    <button
                      onClick={loadPreviousYearData}
                      className="px-2 py-1 bg-indigo-600 text-white rounded-lg text-[9px] font-black shrink-0">
                      Retry
                    </button>
                  )}
                </div>
              )}

              {CLASS_GROUPS.map(group => {
                const groupClasses = plan.filter(c => c.meta.group === group);
                if (!groupClasses.length) return null;
                return (
                  <div key={group}>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{group}</p>
                    <div className={`grid gap-2 ${group === 'Sr Secondary' ? 'grid-cols-2' : 'grid-cols-3'}`}>
                      {groupClasses.map(c => (
                        <button
                          key={c.meta.className}
                          type="button"
                          onClick={() => toggleClass(c.meta.className)}
                          className={`px-2 py-3 rounded-xl text-xs font-black border-2 transition-colors leading-tight text-center ${
                            c.enabled
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                              : 'bg-slate-50 text-slate-500 border-slate-200'
                          }`}
                        >
                          {c.enabled && <CheckCircle2 size={12} className="inline mr-1 text-emerald-600" />}
                          {c.meta.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
              {enabledClasses.length > 0 && (
                <p className="text-[10px] font-bold text-emerald-600 text-center pt-1">
                  {enabledClasses.length} {enabledClasses.length === 1 ? 'class' : 'classes'} selected
                </p>
              )}
            </div>
          )}

          {/* ── STEP 3: SECTIONS ── */}
          {step === 3 && (
            <div key="step-3" className="space-y-3 animate-in fade-in slide-in-from-right-4 duration-200">
              <p className="text-[11px] font-bold text-slate-500 leading-relaxed">
                Har class ke sections define karein. Section ka naam kuch bhi ho sakta hai — A, B, C ya{' '}
                <span className="text-slate-700">"Bio-Chem-Physics"</span>, <span className="text-slate-700">"History-Geo"</span>.
              </p>

              {prefillApplied && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-2.5 flex items-center gap-2">
                  <CheckCircle2 size={13} className="text-indigo-600 shrink-0" />
                  <p className="text-[10px] font-bold text-indigo-800">
                    Previous year ({prevYearLabel}) ke sections pre-filled hain — edit kar sakte hain
                  </p>
                </div>
              )}

              <div className="space-y-3">
                {enabledClasses.map(c => (
                  <div key={c.meta.className} className="border border-slate-200 rounded-2xl p-3 bg-slate-50">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="font-black text-slate-900 text-sm">{c.meta.label}</p>
                        {c.meta.stream && (
                          <span className="text-[9px] font-black uppercase tracking-widest text-indigo-500">
                            {c.meta.stream} Stream
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => addSection(c.meta.className)}
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
                              value={s.name}
                              onChange={e => updateSection(c.meta.className, idx, { name: e.target.value })}
                              placeholder={c.meta.stream ? 'Bio-Chem-Physics' : 'A'}
                              className="flex-1 min-w-0 border border-slate-200 bg-slate-50 rounded-lg px-2 py-1.5 font-bold text-sm outline-none focus:border-indigo-400"
                            />
                            <input
                              type="number" min={1}
                              value={s.capacity}
                              onChange={e => updateSection(c.meta.className, idx, { capacity: parseInt(e.target.value) || 0 })}
                              className="w-16 border border-slate-200 bg-slate-50 rounded-lg px-2 py-1.5 font-bold text-sm outline-none text-center"
                              placeholder="45"
                            />
                            <span className="text-[10px] font-bold text-slate-400 shrink-0">seats</span>
                            {c.sections.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeSection(c.meta.className, idx)}
                                className="p-1.5 text-slate-300 hover:text-rose-500"
                                aria-label="Remove"
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
                    {step3Issues.slice(0, 3).map((iss, i) => <p key={i}>· {iss}</p>)}
                    {step3Issues.length > 3 && <p>· +{step3Issues.length - 3} aur</p>}
                  </div>
                </div>
              )}
              {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2">
                  <AlertTriangle size={14} className="text-rose-600 mt-0.5 shrink-0" />
                  <p className="text-[11px] font-black text-rose-700">{error}</p>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 4: OPTIONAL FEE SETUP ── */}
          {step === 4 && (
            <div key="step-4" className="space-y-3 animate-in fade-in slide-in-from-right-4 duration-200">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2">
                <CheckCircle2 size={14} className="text-emerald-600 mt-0.5 shrink-0" />
                <p className="text-[11px] font-bold text-emerald-800 leading-relaxed">
                  <strong>{label.trim()}</strong> ban gaya!{' '}
                  {enabledClasses.length} classes, {enabledClasses.reduce((t, c) => t + c.sections.length, 0)} sections.
                </p>
              </div>
              <p className="text-[11px] font-bold text-slate-500 leading-relaxed">
                Chahein to abhi ek basic tuition fee set kar dein (baad mein bhi kar sakte hain).
              </p>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Monthly Tuition (₹) — sabhi classes ke liye
                </label>
                <input
                  type="number" min={0} value={tuitionFee}
                  onChange={e => setTuitionFee(e.target.value)}
                  placeholder="e.g. 1500"
                  className="w-full mt-1 border border-slate-200 bg-slate-50 rounded-xl px-3 py-2.5 font-bold text-sm outline-none focus:border-slate-900"
                />
              </div>
              {Number(tuitionFee) > 0 && (
                <p className="text-[10px] font-bold text-slate-500">
                  {enabledClasses.length} fee structures create honge — har class ke liye ₹{Number(tuitionFee).toLocaleString('en-IN')}/month.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 flex gap-2">
          {step > 1 && step < 4 && (
            <button
              onClick={() => setStep(s => (s - 1) as 1 | 2 | 3 | 4)}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-black text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              <ChevronLeft size={16} /> Back
            </button>
          )}

          {step === 1 && (
            <button
              onClick={() => setStep(2)}
              disabled={!step1Valid}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-black disabled:opacity-40"
            >
              Aage <ChevronRight size={16} />
            </button>
          )}

          {step === 2 && (
            <button
              onClick={() => setStep(3)}
              disabled={!step2Valid}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-black disabled:opacity-40"
            >
              Sections Setup <ChevronRight size={16} />
            </button>
          )}

          {step === 3 && (
            <button
              onClick={handleSubmit}
              disabled={saving || step3Issues.length > 0}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-black disabled:opacity-40"
            >
              {saving ? 'Ban raha hai…' : <><Sparkles size={14} /> Year Banao</>}
            </button>
          )}

          {step === 4 && (
            <>
              <button
                onClick={() => handleFinishWizard(false)}
                disabled={!step4Ready || feesSaving}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-black text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Skip
              </button>
              <button
                onClick={() => handleFinishWizard(true)}
                disabled={!step4Ready || feesSaving || Number(tuitionFee) <= 0}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-black disabled:opacity-40"
              >
                {feesSaving ? 'Save ho raha hai…' : 'Fee Save Karo & Finish'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
