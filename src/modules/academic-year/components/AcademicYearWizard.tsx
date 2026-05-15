import React, { useEffect, useMemo, useState } from 'react';
import {
  X, ChevronRight, ChevronLeft, Plus, Trash2, CheckCircle2,
  AlertTriangle, Sparkles, RefreshCw, DollarSign, Users,
  Edit2, FileText,
} from 'lucide-react';
import { useUIStore } from '@/store/uiStore';
import { academicYearService, type WizardSection } from '@/modules/academic-year/academicYear.service';
import { feeService } from '@/modules/fees/fee.service';
import { apiPromotion } from '@/lib/apiClient';

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

// ─── Fee Structure types ───────────────────────────────────────────────────────
// Simplified taxonomy — only two frequencies and one billing cycle.
// Legacy values kept on the types so older saved structures still type-check.
type BillingCycle = 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'ANNUALLY' | 'CUSTOM';
type FeeHeadFrequency = 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'ANNUAL' | 'ONE_TIME';

interface WizardFeeHead {
  id: string;
  name: string;
  amount: number;
  frequency: FeeHeadFrequency;
  // For MONTHLY heads, the months this head bills in. Defaults to all
  // 12 academic months if omitted; UI lets principal toggle months
  // per head (e.g. Library only Apr+Oct).
  months?: string[];
  description: string;
}

interface WizardFeeStructure {
  id: string;
  name: string;
  structureType: 'CLASS' | 'VEHICLE';
  className: string;
  billingCycle: BillingCycle;
  feeHeads: WizardFeeHead[];
  monthlyDueDates: { month: string; date: string }[];
}

const ACADEMIC_MONTHS = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar'];
const MONTH_INDEX: Record<string, number> = {
  Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12,Jan:1,Feb:2,Mar:3,
};
// Frequency label — only Monthly / One-time surface in the UI; legacy
// values map to One-time for back-compat with old saves.
const FREQ_LABEL: Record<FeeHeadFrequency, string> = {
  MONTHLY:'Monthly', QUARTERLY:'One-time', HALF_YEARLY:'One-time',
  ANNUAL:'One-time', ONE_TIME:'One-time',
};
// ONE_TIME merges what used to be "Annual" — semantically same row in
// the schedule (single installment, no recurrence). Picker shows just
// Monthly / One-time so principals don't second-guess which to pick.
const COMMON_HEADS: { name: string; frequency: FeeHeadFrequency }[] = [
  { name: 'Tuition Fee',      frequency: 'MONTHLY'  },
  { name: 'Admission Fee',    frequency: 'ONE_TIME' },
  { name: 'Exam Fee',         frequency: 'ONE_TIME' },
  { name: 'Lab Fee',          frequency: 'MONTHLY'  },
  { name: 'Smart Class Fee',  frequency: 'MONTHLY'  },
  { name: 'Sports Fee',       frequency: 'ONE_TIME' },
  { name: 'Library Fee',      frequency: 'ONE_TIME' },
  { name: 'Computer Lab Fee', frequency: 'MONTHLY'  },
  { name: 'Transport Fee',    frequency: 'MONTHLY'  },
];

function pad(n: number) { return n < 10 ? `0${n}` : `${n}`; }

function buildDueDates(startDate: string, months: string[]): { month: string; date: string }[] {
  const yr = startDate ? parseInt(startDate.slice(0, 4)) : new Date().getFullYear();
  return months.map(m => {
    const mi = MONTH_INDEX[m];
    const year = mi >= 4 ? yr : yr + 1;
    return { month: m, date: `${year}-${pad(mi)}-10` };
  });
}

function monthsForWizardHead(h: WizardFeeHead): string[] {
  if (h.frequency !== 'MONTHLY') return [];
  return h.months && h.months.length ? h.months : ACADEMIC_MONTHS;
}

function calcAnnualTotal(heads: WizardFeeHead[]): number {
  // Per-head: Monthly heads bill in their selected months (default
  // = all 12); One-time / legacy non-monthly = once.
  return heads.reduce((sum, h) => {
    const times = h.frequency === 'MONTHLY' ? monthsForWizardHead(h).length : 1;
    return sum + h.amount * times;
  }, 0);
}

// ─── Local types ──────────────────────────────────────────────────────────────
interface SectionDraft { name: string; capacity: number }
interface ClassPlan { meta: ClassMeta; enabled: boolean; sections: SectionDraft[]; expanded: boolean }

function defaultPlan(): ClassPlan[] {
  return CLASS_CATALOGUE.map(meta => ({
    meta, enabled: false, expanded: false,
    sections: [{ name: 'A', capacity: 45 }],
  }));
}

function planFromPrevious(
  sections: { class_name: string; section: string; stream?: string | null; capacity?: number }[],
): ClassPlan[] {
  const secMap = new Map<string, SectionDraft[]>();
  for (const s of sections) {
    const cls = s.class_name;
    if (!secMap.has(cls)) secMap.set(cls, []);
    secMap.get(cls)!.push({ name: s.section, capacity: s.capacity ?? 45 });
  }
  return CLASS_CATALOGUE.map(meta => {
    const prevSections = secMap.get(meta.className);
    if (prevSections && prevSections.length > 0) {
      return { meta, enabled: true, expanded: false, sections: prevSections };
    }
    return { meta, enabled: false, expanded: false, sections: [{ name: 'A', capacity: 45 }] };
  });
}

// ─── Compact Fee Structure Form (wizard-embedded) ─────────────────────────────
interface FeeFormProps {
  enabledClassNames: string[];
  startDate: string;
  yearLabel: string;
  initial?: WizardFeeStructure | null;
  onSave: (fs: WizardFeeStructure) => void;
  onCancel: () => void;
}

const WizardFeeForm: React.FC<FeeFormProps> = ({
  enabledClassNames, startDate, initial, onSave, onCancel,
}) => {
  const [fsName, setFsName]         = useState(initial?.name ?? '');
  const [fsType, setFsType]         = useState<'CLASS' | 'VEHICLE'>(initial?.structureType ?? 'CLASS');
  const [fsClass, setFsClass]       = useState(initial?.className ?? (enabledClassNames[0] ?? 'Class 1'));
  const [allClasses, setAllClasses] = useState(initial?.className === 'ALL_CLASSES');
  // Cycle + due-date pickers removed — every monthly head bills on the
  // 1st of all 12 academic months. Legacy saves are loaded back as the
  // same shape so editing still works.
  const cycle: BillingCycle = 'MONTHLY';
  const [feeHeads, setFeeHeads]     = useState<WizardFeeHead[]>(
    initial?.feeHeads ?? [{
      id: 'h1', name: 'Tuition Fee', amount: 0, frequency: 'MONTHLY',
      months: ACADEMIC_MONTHS, description: '',
    }],
  );

  // Toggle one academic month for a head — same as the standalone form.
  const toggleHeadMonth = (id: string, month: string) =>
    setFeeHeads(prev => prev.map(h => {
      if (h.id !== id) return h;
      const cur = monthsForWizardHead(h);
      const next = cur.includes(month) ? cur.filter(m => m !== month) : [...cur, month];
      next.sort((a, b) => ACADEMIC_MONTHS.indexOf(a) - ACADEMIC_MONTHS.indexOf(b));
      return { ...h, months: next };
    }));
  const dueDates = useMemo(
    () => initial?.monthlyDueDates?.length
      ? initial.monthlyDueDates
      : buildDueDates(startDate, ACADEMIC_MONTHS),
    [initial?.monthlyDueDates, startDate],
  );
  const [newName, setNewName]       = useState('');
  const [newAmt, setNewAmt]         = useState('');
  const [newFreq, setNewFreq]       = useState<FeeHeadFrequency>('MONTHLY');
  const [formError, setFormError]   = useState('');

  const addHead = () => {
    if (!newName.trim()) return;
    setFeeHeads(prev => [...prev, {
      id: `h${Date.now()}`, name: newName.trim(),
      amount: Number(newAmt) || 0, frequency: newFreq,
      months: newFreq === 'MONTHLY' ? ACADEMIC_MONTHS : undefined,
      description: '',
    }]);
    setNewName(''); setNewAmt('');
  };

  const handleSave = () => {
    if (!fsName.trim()) { setFormError('Fee structure ka naam zaroori hai'); return; }
    if (feeHeads.length === 0) { setFormError('Kam se kam ek fee head add karein'); return; }
    if (feeHeads.some(h => h.amount <= 0)) {
      setFormError('Sabhi fee heads ka amount > 0 hona chahiye'); return;
    }
    if (feeHeads.some(h => h.frequency === 'MONTHLY' && monthsForWizardHead(h).length === 0)) {
      setFormError('Monthly head ke liye kam se kam ek month select karein'); return;
    }
    setFormError('');
    // Normalize months[] on each head + recompute monthlyDueDates as
    // the union of all Monthly heads' months (fallback p_due_dates).
    const normalizedHeads = feeHeads.map(h => ({
      ...h,
      months: h.frequency === 'MONTHLY' ? monthsForWizardHead(h) : undefined,
    }));
    const allMonthsUnion: string[] = Array.from(new Set<string>(
      normalizedHeads.flatMap(h => (h.months ?? []) as string[])
    )).sort((a, b) => ACADEMIC_MONTHS.indexOf(a) - ACADEMIC_MONTHS.indexOf(b));
    onSave({
      id: initial?.id ?? `wfs${Date.now()}`,
      name: fsName.trim(),
      structureType: fsType,
      className: fsType === 'VEHICLE' ? 'TRANSPORT' : (allClasses ? 'ALL_CLASSES' : fsClass),
      billingCycle: cycle,
      feeHeads: normalizedHeads,
      monthlyDueDates: buildDueDates(startDate, allMonthsUnion.length ? allMonthsUnion : ACADEMIC_MONTHS),
    });
  };

  const annual = calcAnnualTotal(feeHeads);

  return (
    <div className="space-y-3 animate-in fade-in slide-in-from-right-4 duration-200">
      <div>
        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Fee Structure Name *</label>
        <input
          value={fsName} onChange={e => setFsName(e.target.value)}
          placeholder="e.g. Standard Fees – Class 5"
          className="w-full mt-1 border border-slate-200 bg-slate-50 rounded-xl px-3 py-2.5 font-bold text-sm outline-none focus:border-indigo-400"
        />
      </div>

      <div>
        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Type</label>
        <div className="mt-1 grid grid-cols-2 gap-2">
          {(['CLASS','VEHICLE'] as const).map(t => (
            <button key={t} type="button" onClick={() => setFsType(t)}
              className={`py-2 rounded-xl text-[11px] font-black border-2 transition-colors ${
                fsType === t ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 text-slate-600 border-slate-200'
              }`}>
              {t === 'CLASS' ? 'Class Fee' : 'Transport Fee'}
            </button>
          ))}
        </div>
      </div>

      {fsType === 'CLASS' && (
        <div>
          <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600 mb-1.5">
            <input type="checkbox" checked={allClasses} onChange={e => setAllClasses(e.target.checked)} />
            Sabhi classes ke liye apply karein
          </label>
          {!allClasses && (
            <select
              value={fsClass} onChange={e => setFsClass(e.target.value)}
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-2.5 font-bold text-sm outline-none focus:border-indigo-400"
            >
              {enabledClassNames.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </div>
      )}

      {/* Billing-cycle picker removed — every Monthly head auto-bills
          on the 1st of all 12 academic months. Quarterly / Half-Yearly
          / Annual collapsed into One-time (single dated installment). */}

      {/* Quick-add common heads */}
      <div>
        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Common Heads se Add Karein</label>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {COMMON_HEADS.map(h => (
            <button key={h.name} type="button"
              onClick={() => setFeeHeads(prev => [...prev, {
                id: `h${Date.now()}`, name: h.name, amount: 0, frequency: h.frequency,
                months: h.frequency === 'MONTHLY' ? ACADEMIC_MONTHS : undefined,
                description: '',
              }])}
              className="px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-black">
              + {h.name}
            </button>
          ))}
        </div>
      </div>

      {/* Fee Heads list */}
      {feeHeads.length > 0 && (
        <div className="border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-100">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Fee Heads</span>
          </div>
          {feeHeads.map((h, idx) => {
            const isMonthly = h.frequency === 'MONTHLY';
            const picked = monthsForWizardHead(h);
            return (
            <div key={h.id} className="px-3 py-2 border-b border-slate-50 last:border-0 bg-white space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded shrink-0 ${
                    isMonthly ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}>
                    {isMonthly ? `Monthly · ${picked.length}` : 'One-time'}
                  </span>
                  <p className="font-bold text-slate-800 text-sm truncate">{h.name}</p>
                </div>
                <input
                  type="number" min={0}
                  value={h.amount || ''}
                  onChange={e => setFeeHeads(prev => prev.map((x, i) => i === idx ? { ...x, amount: Number(e.target.value) } : x))}
                  placeholder="₹"
                  className="w-20 border border-slate-200 bg-slate-50 rounded-lg px-2 py-1.5 font-bold text-sm outline-none text-right focus:border-indigo-400"
                />
                <button type="button" onClick={() => setFeeHeads(prev => prev.filter((_, i) => i !== idx))}
                  className="p-1 text-slate-300 hover:text-rose-500">
                  <Trash2 size={12} />
                </button>
              </div>
              {/* Per-head month picker — Monthly only. Principal can
                  tick the exact months this head bills (e.g. Library
                  only Apr+Oct). 1st of each picked month = due date. */}
              {isMonthly && (
                <div className="grid grid-cols-6 gap-1">
                  {ACADEMIC_MONTHS.map(m => {
                    const on = picked.includes(m);
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => toggleHeadMonth(h.id, m)}
                        className={`py-1 rounded text-[9px] font-black border transition-colors ${
                          on
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-slate-50 text-slate-500 border-slate-200'
                        }`}>
                        {m}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
          })}
        </div>
      )}

      {/* Add custom head */}
      <div className="bg-slate-50 rounded-2xl p-3 space-y-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">+ Custom Fee Head</p>
        <div className="flex gap-2">
          <input
            value={newName} onChange={e => setNewName(e.target.value)}
            placeholder="Fee Name"
            className="flex-1 min-w-0 border border-slate-200 bg-white rounded-xl px-3 py-2 font-bold text-sm outline-none focus:border-indigo-400"
          />
          <input
            type="number" min={0}
            value={newAmt} onChange={e => setNewAmt(e.target.value)}
            placeholder="₹"
            className="w-20 border border-slate-200 bg-white rounded-xl px-2 py-2 font-bold text-sm outline-none text-right focus:border-indigo-400"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={newFreq} onChange={e => setNewFreq(e.target.value as FeeHeadFrequency)}
            className="flex-1 border border-slate-200 bg-white rounded-xl px-2 py-2 font-bold text-xs outline-none focus:border-indigo-400"
          >
            <option value="MONTHLY">Monthly · har month</option>
            <option value="ONE_TIME">One-time · ek baar</option>
          </select>
          <button type="button" onClick={addHead} disabled={!newName.trim()}
            className="px-3 py-2 rounded-xl bg-indigo-600 text-white text-[11px] font-black disabled:opacity-40 flex items-center gap-1">
            <Plus size={12} /> Add
          </button>
        </div>
      </div>

      {feeHeads.length > 0 && (
        <div className="bg-indigo-600 rounded-2xl px-4 py-3 flex items-center justify-between">
          <span className="font-bold text-indigo-100 text-sm">Annual Total</span>
          <span className="font-black text-white text-lg">₹{annual.toLocaleString('en-IN')}</span>
        </div>
      )}

      {formError && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2">
          <AlertTriangle size={13} className="text-rose-600 shrink-0" />
          <p className="text-[11px] font-black text-rose-700">{formError}</p>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel}
          className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-black text-slate-600 hover:bg-slate-50">
          Cancel
        </button>
        <button type="button" onClick={handleSave}
          className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-black">
          <CheckCircle2 size={14} /> {initial ? 'Update' : 'Add Fee Structure'}
        </button>
      </div>
    </div>
  );
};

// ─── Main Wizard ──────────────────────────────────────────────────────────────
type WizardStep = 1 | 2 | 3 | 4;

export const AcademicYearWizard: React.FC<Props> = ({
  onClose, onCreated,
  defaultLabel = '', defaultStart = '', defaultEnd = '', defaultBoard = 'CBSE',
  previousYearId,
}) => {
  const { showToast } = useUIStore();
  const [step, setStep] = useState<WizardStep>(1);

  // Step 1 fields
  const [label, setLabel]           = useState(defaultLabel);
  const [startDate, setStartDate]   = useState(defaultStart);
  const [endDate, setEndDate]       = useState(defaultEnd);
  const [board, setBoard]           = useState(defaultBoard);
  const [medium, setMedium]         = useState('English');

  // Step 2 — classes + sections
  const [plan, setPlan]             = useState<ClassPlan[]>(defaultPlan);
  const [prefillLoading, setPrefillLoading] = useState(false);
  const [prefillApplied, setPrefillApplied] = useState(false);
  const [prevYearLabel, setPrevYearLabel]   = useState('');

  // Step 3 — fee structures
  const [feeStructures, setFeeStructures] = useState<WizardFeeStructure[]>([]);
  const [feeSubView, setFeeSubView]       = useState<'list' | 'form'>('list');
  const [editingFee, setEditingFee]       = useState<WizardFeeStructure | null>(null);

  // Submit state
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  // Auto-load previous year data
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
      // Non-fatal
    } finally {
      setPrefillLoading(false);
    }
  };

  const enabledClasses     = useMemo(() => plan.filter(c => c.enabled), [plan]);
  const totalSections      = useMemo(() => enabledClasses.reduce((t, c) => t + c.sections.length, 0), [enabledClasses]);
  const enabledClassNames  = useMemo(() => enabledClasses.map(c => c.meta.className), [enabledClasses]);

  // ─── Validation ────────────────────────────────────────────────────────────
  const step1Valid = useMemo(() =>
    !!label.trim() && !!startDate && !!endDate && endDate > startDate,
  [label, startDate, endDate]);

  const step2Issues = useMemo(() => {
    if (enabledClasses.length === 0) return ['Kam se kam ek class select karein'];
    const issues: string[] = [];
    enabledClasses.forEach(c => {
      if (c.sections.length === 0) {
        issues.push(`${c.meta.label}: at least one section needed`);
        return;
      }
      const seen = new Set<string>();
      c.sections.forEach(s => {
        const key = s.name.trim().toLowerCase();
        if (!key)              issues.push(`${c.meta.label}: section name blank hai`);
        else if (seen.has(key)) issues.push(`${c.meta.label}: "${s.name}" section repeat ho raha hai`);
        seen.add(key);
        if (s.capacity < 1)    issues.push(`${c.meta.label} - ${s.name}: capacity > 0 honi chahiye`);
      });
    });
    return issues;
  }, [enabledClasses]);

  // ─── Plan mutations ─────────────────────────────────────────────────────────
  const toggleClass = (className: string) => {
    setPlan(prev => prev.map(c => {
      if (c.meta.className !== className) return c;
      const newEnabled = !c.enabled;
      return { ...c, enabled: newEnabled, expanded: newEnabled };
    }));
  };

  const toggleExpand = (className: string) =>
    setPlan(prev => prev.map(c =>
      c.meta.className === className ? { ...c, expanded: !c.expanded } : c,
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

  // ─── Fee structure handlers ─────────────────────────────────────────────────
  const handleFeeStructureSave = (fs: WizardFeeStructure) => {
    setFeeStructures(prev => {
      const idx = prev.findIndex(x => x.id === fs.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = fs;
        return next;
      }
      return [...prev, fs];
    });
    setFeeSubView('list');
    setEditingFee(null);
  };

  // ─── Step 5: create year + fee structures ───────────────────────────────────
  const handleCreateYear = async () => {
    setSaving(true); setError('');
    try {
      if (enabledClasses.length === 0) {
        throw new Error('Enable at least one class.');
      }

      // Build the payload first, then validate the actual payload (not
      // the source state). This way ANY path that produces a bad row —
      // blank section name, missing className on the meta, whitespace,
      // duplicated entries — gets caught here instead of bubbling up
      // from the DB as the cryptic "each section needs class_name and
      // section" error.
      const sectionsPayload: WizardSection[] = enabledClasses.flatMap(c =>
        c.sections.map(s => ({
          className: (c.meta.className ?? '').trim(),
          section:   (s.name ?? '').trim(),
          stream:    c.meta.stream,
          capacity:  s.capacity,
        })),
      );

      const bad = sectionsPayload.filter(s => !s.className || !s.section);
      if (bad.length > 0) {
        // Helpful debug breadcrumb — the principal can screenshot the
        // console when reporting this. Not user-facing.
        // eslint-disable-next-line no-console
        console.error('[AcademicYearWizard] invalid section payload', { bad, sectionsPayload });
        const labels = bad.map(b => b.className || '?').slice(0, 3).join(', ');
        throw new Error(
          `${bad.length} section${bad.length === 1 ? '' : 's'} have a blank class or section name (${labels}). Go to Step 2 and give each section a name (e.g. "A").`,
        );
      }
      if (sectionsPayload.length === 0) {
        throw new Error('Create at least one section in each class. Go to Step 2 and press "Add Section".');
      }
      const streamsUsed = [...new Set(
        enabledClasses.map(c => c.meta.stream).filter(Boolean) as string[],
      )];

      const yearId = await academicYearService.createWithSections({
        label: label.trim(), startDate, endDate, board, medium,
        streams: streamsUsed,
        sections: sectionsPayload,
      });

      // Year created — now call onCreated so the app can proceed even if fee saves fail
      onCreated(yearId);

      // Save fee structures (non-blocking — failures shown as toast, don't undo year creation)
      if (feeStructures.length > 0) {
        const results = await Promise.allSettled(
          feeStructures.map(fs =>
            feeService.saveFeeStructureForYear(yearId, {
              name:            fs.name,
              className:       fs.className,
              structureType:   fs.structureType,
              billingCycle:    fs.billingCycle,
              feeHeads:        fs.feeHeads.map(h => ({
                id:             h.id,
                name:           h.name,
                amount:         h.amount,
                frequency:      h.frequency,
                description:    h.description,
                transactionFee: 0,
              })),
              monthlyDueDates: fs.monthlyDueDates,
              lateFee: {
                enabled: false, gracePeriodDays: 5,
                type: 'FIXED', amount: 100, maxCap: 1000,
              },
            }),
          ),
        );
        const failed = results.filter(r => r.status === 'rejected');
        if (failed.length === 0) {
          showToast(`${label.trim()} ban gaya — ${feeStructures.length} fee structures ke saath!`);
        } else {
          showToast(
            `Year ban gaya! ${feeStructures.length - failed.length}/${feeStructures.length} fee structures save hue — baaki Settings mein retry karein`,
            'error',
          );
        }
      } else {
        showToast(`${label.trim()} ban gaya — ${sectionsPayload.length} sections ke saath!`);
      }
    } catch (e) {
      // Coerce empty Error messages — an empty string would render as a
      // blank rose toast/error box with no clue what failed.
      const raw = e instanceof Error ? e.message : '';
      const msg = (raw && raw.trim()) || 'Academic year create karne mein error';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ─── Step labels ────────────────────────────────────────────────────────────
  const STEP_LABELS: Record<WizardStep, string> = {
    1: 'Year details',
    2: 'Classes & sections',
    3: 'Fee structures',
    4: 'Review & create',
  };

  const isInFeeForm = step === 3 && feeSubView === 'form';

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
      onClick={() => !saving && step < 4 && !isInFeeForm && onClose()}
    >
      <div
        className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-lg max-h-[92vh] flex flex-col animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-indigo-600" />
              <h3 className="font-black text-slate-900 text-base">Naya Academic Year</h3>
            </div>
            {isInFeeForm ? (
              <button
                onClick={() => { setFeeSubView('list'); setEditingFee(null); }}
                className="p-1.5 -mr-1.5 text-slate-400 hover:text-slate-600"
                aria-label="Back to fee list"
              >
                <ChevronLeft size={18} />
              </button>
            ) : (
              <button
                onClick={onClose} disabled={saving}
                className="p-1.5 -mr-1.5 text-slate-400 hover:text-slate-600 disabled:opacity-50"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {([1, 2, 3, 4] as WizardStep[]).map(s => (
              <div key={s} className={`flex-1 h-1.5 rounded-full transition-colors ${
                s === step ? 'bg-indigo-600' : s < step ? 'bg-indigo-300' : 'bg-slate-200'
              }`} />
            ))}
          </div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-2">
            Step {step} of 4 ·{' '}
            {isInFeeForm
              ? (editingFee ? 'Edit Fee Structure' : 'New Fee Structure')
              : STEP_LABELS[step]}
          </p>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">

          {/* ── STEP 1: YEAR DETAILS ── */}
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

          {/* ── STEP 2: CLASSES & SECTIONS ── */}
          {step === 2 && (
            <div key="step-2" className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-200">
              <p className="text-[11px] font-bold text-slate-500 leading-relaxed">
                Classes select karein aur har class ke sections configure karein.
              </p>

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
                    {prefillLoading
                      ? 'Previous year ki classes load ho rahi hain…'
                      : prefillApplied
                        ? `${prevYearLabel} ki classes pre-filled — aap edit kar sakte hain`
                        : 'Previous year data load nahi hua — manually select karein'}
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
                    <div className="space-y-2">
                      {groupClasses.map(c => (
                        <div key={c.meta.className}
                          className={`border-2 rounded-2xl overflow-hidden transition-colors ${
                            c.enabled ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-200 bg-white'
                          }`}
                        >
                          {/* Class row */}
                          <div className="flex items-center gap-2 px-3 py-2.5">
                            <button
                              type="button"
                              onClick={() => toggleClass(c.meta.className)}
                              className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-colors ${
                                c.enabled ? 'bg-emerald-600 border-emerald-600' : 'border-slate-300 bg-white'
                              }`}
                            >
                              {c.enabled && <CheckCircle2 size={12} className="text-white" />}
                            </button>
                            <span className={`flex-1 font-black text-sm ${c.enabled ? 'text-emerald-800' : 'text-slate-600'}`}>
                              {c.meta.label}
                              {c.meta.stream && (
                                <span className="ml-1 text-[9px] font-black uppercase tracking-widest text-indigo-500">
                                  {c.meta.stream}
                                </span>
                              )}
                            </span>
                            {c.enabled && (
                              <>
                                <span className="text-[10px] font-bold text-emerald-600">
                                  {c.sections.length} sec
                                </span>
                                <button
                                  type="button"
                                  onClick={() => toggleExpand(c.meta.className)}
                                  className="p-1 text-slate-400 hover:text-slate-600"
                                >
                                  <ChevronRight size={14} className={`transition-transform ${c.expanded ? 'rotate-90' : ''}`} />
                                </button>
                              </>
                            )}
                          </div>

                          {/* Sections editor (expanded) */}
                          {c.enabled && c.expanded && (
                            <div className="border-t border-emerald-100 bg-white px-3 py-2 space-y-2">
                              {c.sections.map((s, idx) => (
                                <div key={idx} className="flex items-center gap-2">
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
                                      className="p-1 text-slate-300 hover:text-rose-500"
                                    >
                                      <Trash2 size={11} />
                                    </button>
                                  )}
                                </div>
                              ))}
                              <button
                                type="button"
                                onClick={() => addSection(c.meta.className)}
                                className="flex items-center gap-1 text-[10px] font-black text-indigo-600 hover:text-indigo-800"
                              >
                                <Plus size={11} /> Section Add Karein
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              {step2Issues.length > 0 && enabledClasses.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2">
                  <AlertTriangle size={14} className="text-amber-600 mt-0.5 shrink-0" />
                  <div className="text-[11px] font-bold text-amber-700 leading-relaxed">
                    {step2Issues.slice(0, 3).map((iss, i) => <p key={i}>· {iss}</p>)}
                    {step2Issues.length > 3 && <p>· +{step2Issues.length - 3} aur</p>}
                  </div>
                </div>
              )}

              {enabledClasses.length > 0 && step2Issues.length === 0 && (
                <p className="text-[10px] font-bold text-emerald-600 text-center pt-1">
                  <CheckCircle2 size={12} className="inline mr-1" />
                  {enabledClasses.length} classes · {totalSections} sections configured
                </p>
              )}
            </div>
          )}

          {/* ── STEP 3: FEE STRUCTURES (list view) ── */}
          {step === 3 && feeSubView === 'list' && (
            <div key="step-3-list" className="space-y-3 animate-in fade-in slide-in-from-right-4 duration-200">
              <p className="text-[11px] font-bold text-slate-500 leading-relaxed">
                Is academic year ke liye fee structures define karein — multiple structures
                alag-alag classes ke liye. Baad mein bhi add/edit kar sakte hain.
              </p>

              {feeStructures.length === 0 ? (
                <div className="border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center space-y-2">
                  <DollarSign size={28} className="mx-auto text-slate-300" />
                  <p className="font-black text-slate-400 text-sm">Koi fee structure nahi</p>
                  <p className="text-[10px] font-bold text-slate-400">
                    Abhi skip kar sakte hain ya neeche button se add karein
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {feeStructures.map(fs => {
                    const annual = calcAnnualTotal(fs.feeHeads);
                    return (
                      <div key={fs.id} className="border border-slate-200 rounded-2xl p-3 bg-white">
                        <div className="flex items-start gap-2">
                          <div className={`mt-0.5 p-1.5 rounded-lg ${fs.structureType === 'VEHICLE' ? 'bg-amber-50' : 'bg-indigo-50'}`}>
                            <DollarSign size={13} className={fs.structureType === 'VEHICLE' ? 'text-amber-600' : 'text-indigo-600'} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-black text-slate-900 text-sm">{fs.name}</p>
                            <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                              {fs.structureType === 'VEHICLE' ? 'Transport'
                                : fs.className === 'ALL_CLASSES' ? 'All Classes' : fs.className}
                              {' · '}Monthly
                              {' · '}{fs.feeHeads.length} heads
                              {' · '}₹{annual.toLocaleString('en-IN')}/yr
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button type="button"
                              onClick={() => { setEditingFee(fs); setFeeSubView('form'); }}
                              className="p-1.5 text-slate-400 hover:text-indigo-600">
                              <Edit2 size={12} />
                            </button>
                            <button type="button"
                              onClick={() => setFeeStructures(prev => prev.filter(x => x.id !== fs.id))}
                              className="p-1.5 text-slate-400 hover:text-rose-500">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <button
                type="button"
                onClick={() => { setEditingFee(null); setFeeSubView('form'); }}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border-2 border-dashed border-indigo-300 text-indigo-600 font-black text-sm hover:bg-indigo-50 transition-colors"
              >
                <Plus size={16} /> Add Fee Structure
              </button>
            </div>
          )}

          {/* ── STEP 3: FEE FORM SUB-VIEW ── */}
          {step === 3 && feeSubView === 'form' && (
            <WizardFeeForm
              key={editingFee?.id ?? 'new'}
              enabledClassNames={enabledClassNames}
              startDate={startDate}
              yearLabel={label}
              initial={editingFee}
              onSave={handleFeeStructureSave}
              onCancel={() => { setFeeSubView('list'); setEditingFee(null); }}
            />
          )}

          {/* ── STEP 4: REVIEW & CREATE ── */}
          {/* Detailed review so the principal can spot typos in class
              names, missed sections, or wrong fee amounts BEFORE the
              year hits the DB. Replaces the old "Staff" step (staff is
              managed from its own module after the year exists). */}
          {step === 4 && (
            <div key="step-4" className="space-y-3 animate-in fade-in slide-in-from-right-4 duration-200">
              {/* Year header */}
              <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-3">
                <div className="flex items-center gap-2 mb-1">
                  <FileText size={14} className="text-indigo-600" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-indigo-500">Academic Year</span>
                </div>
                <p className="font-black text-indigo-900 text-base">{label.trim()}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
                  <span className="text-[10px] font-bold text-indigo-600">{board} · {medium}</span>
                  <span className="text-[10px] font-bold text-indigo-500">{startDate} → {endDate}</span>
                </div>
              </div>

              {/* Counts strip */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-2.5 text-center">
                  <p className="font-black text-emerald-900 text-xl leading-none">{enabledClasses.length}</p>
                  <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest mt-1">Classes</p>
                </div>
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-2.5 text-center">
                  <p className="font-black text-emerald-900 text-xl leading-none">{totalSections}</p>
                  <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest mt-1">Sections</p>
                </div>
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-2.5 text-center">
                  <p className="font-black text-amber-900 text-xl leading-none">{feeStructures.length}</p>
                  <p className="text-[9px] font-bold text-amber-600 uppercase tracking-widest mt-1">Fees</p>
                </div>
              </div>

              {/* Classes & sections breakdown — every single one listed
                  so a typo in a section name is impossible to miss. */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Classes & Sections</span>
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="text-[10px] font-black text-indigo-600 hover:text-indigo-800 active:scale-95 transition-transform">
                    Edit
                  </button>
                </div>
                {enabledClasses.length === 0 ? (
                  <p className="px-3 py-3 text-[11px] font-bold text-rose-600">Koi class enable nahi hai — Step 2 me jaake select karein.</p>
                ) : (
                  <ul className="divide-y divide-slate-50">
                    {enabledClasses.map(c => (
                      <li key={c.meta.className} className="px-3 py-2 flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-black text-slate-800 text-sm truncate">
                            {c.meta.label}
                            {c.meta.stream && (
                              <span className="ml-1.5 text-[9px] font-black uppercase tracking-widest text-indigo-600 bg-indigo-50 border border-indigo-100 rounded px-1 py-0.5">
                                {c.meta.stream}
                              </span>
                            )}
                          </p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {c.sections.map((s, idx) => (
                              <span key={idx} className={`text-[10px] font-black px-2 py-0.5 rounded-lg border ${
                                !s.name.trim()
                                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                                  : 'bg-slate-50 text-slate-700 border-slate-200'
                              }`}>
                                {s.name.trim() || '⚠ blank'} · {s.capacity}
                              </span>
                            ))}
                          </div>
                        </div>
                        <span className="text-[10px] font-bold text-slate-400 tabular-nums shrink-0 mt-0.5">
                          {c.sections.length} sec
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Fee structures breakdown */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Fee Structures</span>
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="text-[10px] font-black text-indigo-600 hover:text-indigo-800 active:scale-95 transition-transform">
                    Edit
                  </button>
                </div>
                {feeStructures.length === 0 ? (
                  <p className="px-3 py-3 text-[11px] font-bold text-slate-500">
                    Koi fee structure define nahi kiya. Year create hone ke baad Settings → Fees se add kar sakte hain.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-50">
                    {feeStructures.map(fs => {
                      const total = fs.feeHeads.reduce((t, h) => t + (h.amount || 0), 0);
                      return (
                        <li key={fs.id} className="px-3 py-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-black text-slate-800 text-sm truncate">{fs.name}</p>
                              <p className="text-[10px] font-bold text-slate-500 mt-0.5">
                                {fs.className === 'ALL_CLASSES' ? 'All classes' : fs.className} · {fs.billingCycle}
                                {' · '}{fs.feeHeads.length} head{fs.feeHeads.length === 1 ? '' : 's'}
                              </p>
                            </div>
                            <span className="text-xs font-black text-amber-700 tabular-nums shrink-0">
                              ₹{total.toLocaleString('en-IN')}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-start gap-2">
                <Users size={13} className="text-slate-400 mt-0.5 shrink-0" />
                <p className="text-[10px] font-bold text-slate-500 leading-relaxed">
                  Staff aur teachers year create hone ke baad <strong className="text-slate-700">Staff</strong> section se add karein.
                </p>
              </div>

              {error.trim() && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2">
                  <AlertTriangle size={14} className="text-rose-600 mt-0.5 shrink-0" />
                  <p className="text-[11px] font-black text-rose-700">{error}</p>
                </div>
              )}

              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3">
                <p className="text-[10px] font-bold text-indigo-700 leading-relaxed">
                  Sab sahi hai? <strong>"Year Banao"</strong> dabane ke baad year, sections
                  {feeStructures.length > 0 ? ', aur fee structures' : ''} DB me save ho jayenge. Naam ya amount me galti dikhe to upar "Edit" se Step 2/3 me jaayein.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 flex gap-2 shrink-0">

          {/* Back button */}
          {step > 1 && !isInFeeForm && (
            <button
              onClick={() => {
                setError('');
                setStep(s => (s - 1) as WizardStep);
              }}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-black text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              <ChevronLeft size={16} /> Back
            </button>
          )}

          {/* Step 1 → 2 */}
          {step === 1 && (
            <button
              onClick={() => setStep(2)}
              disabled={!step1Valid}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-black disabled:opacity-40"
            >
              Aage <ChevronRight size={16} />
            </button>
          )}

          {/* Step 2 → 3 */}
          {step === 2 && (
            <button
              onClick={() => {
                if (step2Issues.length > 0) { setError(step2Issues[0]); return; }
                setError('');
                setStep(3);
              }}
              disabled={enabledClasses.length === 0 || step2Issues.length > 0}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-black disabled:opacity-40"
            >
              Fee Setup <ChevronRight size={16} />
            </button>
          )}

          {/* Step 3 list → 4 (review) */}
          {step === 3 && feeSubView === 'list' && (
            <button
              onClick={() => { setError(''); setStep(4); }}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-black"
            >
              Review karein <ChevronRight size={16} />
            </button>
          )}

          {/* Step 4: Create */}
          {step === 4 && (
            <button
              onClick={handleCreateYear}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-black disabled:opacity-40"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Ban raha hai…
                </>
              ) : (
                <><Sparkles size={14} /> Year Banao</>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
