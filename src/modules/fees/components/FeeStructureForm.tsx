// FeeStructureForm — simplified.
//
// User's spec: only 2 frequency choices per head (Monthly | OneTime).
// Earlier the form exposed 5 frequencies (Monthly / Quarterly /
// Half-Yearly / Annual / OneTime) + 5 billing cycles + per-month due
// date pickers + transaction fees + descriptions — which mapped to
// real-world variation but overwhelmed the 95% of schools that just
// want "Tuition Monthly + Admission OneTime".
//
// New model:
//   • Top: Structure Name
//   • Below: Type (Class / Vehicle) + Class picker with "All Classes"
//   • Below: Headers — Name + Amount + Monthly|OneTime toggle
//   • Monthly heads → 12 installments, each due on the 1st of the
//     respective academic-year month (Apr 1, May 1, …, Mar 1)
//   • OneTime heads → 1 installment, due on the AY start date
//
// Quarterly / Half-Yearly / Annual rows from older records are
// rendered as OneTime in the UI; on save they're persisted as
// ONE_TIME so the schema converges to the new taxonomy.

import React, { useState } from 'react';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { useUIStore } from '@/store/uiStore';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type BillingCycle = 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'ANNUALLY' | 'CUSTOM';
export type FeeHeadFrequency = 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'ANNUAL' | 'ONE_TIME';

// Frequency the UI actually supports going forward. Legacy values are
// folded into ONE_TIME on display.
type SimpleFreq = 'MONTHLY' | 'ONE_TIME';
const toSimple = (f: FeeHeadFrequency): SimpleFreq => (f === 'MONTHLY' ? 'MONTHLY' : 'ONE_TIME');

export interface FeeHead {
  id: string;
  name: string;
  amount: number;
  frequency: FeeHeadFrequency;
  // For MONTHLY heads, the academic-year months this head bills in
  // (e.g. ['Apr','May','Jun'] or ['Jan','Mar'] for a custom-schedule
  // head). Defaults to all 12 months when omitted. Ignored for
  // ONE_TIME heads.
  months?: string[];
  // Kept for back-compat with stored rows — UI no longer surfaces them.
  description: string;
  transactionFee: number;
}

export interface MonthlyDueDate { month: string; date: string }

export interface LateFeeConfig {
  enabled: boolean;
  gracePeriodDays: number;
  type: 'FIXED' | 'PERCENTAGE';
  amount: number;
  maxCap: number;
}

export interface FeeStructureItem {
  id: string;
  name: string;
  className: string;
  structureType: 'CLASS' | 'VEHICLE';
  billingCycle: BillingCycle;
  feeHeads: FeeHead[];
  monthlyDueDates: MonthlyDueDate[];
  lateFee: LateFeeConfig;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ACADEMIC_MONTHS = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar'];
const MONTH_INDEX: Record<string, number> = {
  Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12,Jan:1,Feb:2,Mar:3,
};
const CLASS_OPTIONS = [
  'Nursery','LKG','UKG',
  'Class 1','Class 2','Class 3','Class 4','Class 5',
  'Class 6','Class 7','Class 8','Class 9','Class 10',
  '11th Science','11th Commerce','11th Arts','11th Maths',
  '12th Science','12th Commerce','12th Arts','12th Maths',
];

const BLANK_LATE_FEE: LateFeeConfig = {
  enabled: false, gracePeriodDays: 5, type: 'FIXED', amount: 100, maxCap: 1000,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

// Build "1st of every picked month" due dates for the academic year.
// Apr-Dec use start year, Jan-Mar use start year + 1 (Indian academic
// year wraps). months[] order is preserved.
function buildDueDatesForMonths(activeYearStartDate: string, months: string[]): MonthlyDueDate[] {
  const startYear = activeYearStartDate
    ? parseInt(activeYearStartDate.slice(0, 4))
    : new Date().getFullYear();
  return months.map(month => {
    const mIdx = MONTH_INDEX[month];
    const year = mIdx >= 4 ? startYear : startYear + 1;
    return { month, date: `${year}-${pad(mIdx)}-01` };
  });
}

// Default = every academic month (Apr → Mar). Used as the initial set
// for a new Monthly head; principal can drop months they don't bill.
const DEFAULT_MONTHLY_MONTHS = [...ACADEMIC_MONTHS];

// Resolve the months a head actually bills in. MONTHLY heads use
// head.months (defaulting to all 12 if missing). Anything else → empty
// (those are one-time, billed once on AY-start).
function monthsForHead(h: FeeHead): string[] {
  if (toSimple(h.frequency) !== 'MONTHLY') return [];
  return h.months && h.months.length ? h.months : DEFAULT_MONTHLY_MONTHS;
}

// Annual total — Monthly head × (months.length) + OneTime head × 1.
function calcAnnual(heads: FeeHead[]): number {
  return heads.reduce((sum, h) => {
    const times = toSimple(h.frequency) === 'MONTHLY' ? monthsForHead(h).length : 1;
    return sum + h.amount * times;
  }, 0);
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  initialData?: FeeStructureItem;
  activeYearLabel: string;
  activeYearStartDate: string;
  onSave: (data: FeeStructureItem) => void | Promise<void>;
  onBack: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const FeeStructureForm: React.FC<Props> = ({
  initialData, activeYearLabel, activeYearStartDate, onSave, onBack,
}) => {
  const isEditing = !!initialData;
  const { showToast } = useUIStore();
  // Guards rapid taps. Without this the Save button — which fires an
  // async parent handler — would queue up 5-6 duplicate structures
  // when a user double-taps before the next render disables it.
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState(initialData?.name ?? '');
  const [structureType, setStructureType] = useState<'CLASS' | 'VEHICLE'>(initialData?.structureType ?? 'CLASS');
  const [className, setClassName] = useState(
    initialData?.className && initialData.className !== 'ALL_CLASSES' ? initialData.className : 'Class 1'
  );
  const [allClasses, setAllClasses] = useState((initialData?.className ?? '') === 'ALL_CLASSES');

  // Default heads: single Tuition Monthly head for a new structure.
  // Legacy heads loaded without `months` will get the default 12
  // months when rendered (see monthsForHead).
  const [feeHeads, setFeeHeads] = useState<FeeHead[]>(
    initialData?.feeHeads?.length
      ? initialData.feeHeads
      : [{ id: 'h1', name: 'Tuition Fee', amount: 0, frequency: 'MONTHLY', months: DEFAULT_MONTHLY_MONTHS, description: '', transactionFee: 0 }]
  );

  const [lateFee, setLateFee] = useState<LateFeeConfig>(initialData?.lateFee ?? BLANK_LATE_FEE);

  // Mutate one head by id.
  const patchHead = (id: string, patch: Partial<FeeHead>) =>
    setFeeHeads(prev => prev.map(h => (h.id === id ? { ...h, ...patch } : h)));
  const removeHead = (id: string) =>
    setFeeHeads(prev => prev.filter(h => h.id !== id));
  const addHead = () =>
    setFeeHeads(prev => [
      ...prev,
      { id: `h${Date.now()}`, name: '', amount: 0, frequency: 'MONTHLY', months: DEFAULT_MONTHLY_MONTHS, description: '', transactionFee: 0 },
    ]);

  // Toggle one academic month for a head. Auto-adds the months[]
  // field on legacy heads that didn't have it.
  const toggleHeadMonth = (id: string, month: string) =>
    setFeeHeads(prev => prev.map(h => {
      if (h.id !== id) return h;
      const cur = monthsForHead(h);
      const next = cur.includes(month) ? cur.filter(m => m !== month) : [...cur, month];
      // Sort back into academic-year order so save / display stays canonical.
      next.sort((a, b) => ACADEMIC_MONTHS.indexOf(a) - ACADEMIC_MONTHS.indexOf(b));
      return { ...h, months: next };
    }));

  const annualTotal = calcAnnual(feeHeads);
  const hasMonthly = feeHeads.some(h => toSimple(h.frequency) === 'MONTHLY');

  const handleSave = async () => {
    if (saving) return;
    if (!name.trim()) { showToast('Fee structure name zaroori hai', 'error'); return; }
    if (structureType === 'CLASS' && !allClasses && !className) {
      showToast('Class chunein', 'error'); return;
    }
    const cleanedHeads = feeHeads
      .filter(h => h.name.trim() && h.amount > 0)
      .map(h => {
        const simple = toSimple(h.frequency);
        const months = simple === 'MONTHLY' ? monthsForHead(h) : undefined;
        if (simple === 'MONTHLY' && (!months || months.length === 0)) {
          // Caller-side guard: blocked below before reaching server.
          return null as unknown as FeeHead;
        }
        return {
          ...h,
          name: h.name.trim(),
          frequency: (simple === 'MONTHLY' ? 'MONTHLY' : 'ONE_TIME') as FeeHeadFrequency,
          months,
          description: '',
          transactionFee: 0,
        };
      })
      .filter(Boolean) as FeeHead[];
    if (cleanedHeads.length === 0) {
      showToast('Kam se kam ek fee head zaroori hai (naam + amount > 0)', 'error');
      return;
    }
    // Surface "Monthly head with zero months" explicitly — silent drop
    // would let a saved structure produce no installments.
    if (feeHeads.some(h => toSimple(h.frequency) === 'MONTHLY' && h.name.trim() && h.amount > 0 && monthsForHead(h).length === 0)) {
      showToast('Monthly head ke liye kam se kam ek month select karein', 'error');
      return;
    }
    // monthlyDueDates passed to the RPC is the UNION of every Monthly
    // head's months — used as the fallback p_due_dates when a head
    // doesn't carry its own months[] (legacy schedules). Once every
    // head has months[], the RPC reads them per-head and this fallback
    // becomes redundant but harmless.
    const allMonthsUnion = Array.from(new Set(
      cleanedHeads.flatMap(h => h.months ?? [])
    )).sort((a, b) => ACADEMIC_MONTHS.indexOf(a) - ACADEMIC_MONTHS.indexOf(b));
    setSaving(true);
    try {
      await onSave({
        id: initialData?.id ?? `fs${Date.now()}`,
        name: name.trim(),
        className: structureType === 'VEHICLE' ? 'TRANSPORT' : allClasses ? 'ALL_CLASSES' : className,
        structureType,
        billingCycle: 'MONTHLY',
        feeHeads: cleanedHeads,
        monthlyDueDates: buildDueDatesForMonths(activeYearStartDate, allMonthsUnion.length ? allMonthsUnion : DEFAULT_MONTHLY_MONTHS),
        lateFee,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 sticky top-0 z-10 shadow-sm flex items-center gap-3">
        <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">
            {isEditing ? 'Edit Fee Structure' : 'New Fee Structure'}
          </h2>
          {activeYearLabel && (
            <p className="text-[10px] font-bold text-slate-400 mt-0.5">{activeYearLabel}</p>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Name */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">
            Structure name *
          </label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Class 5 Standard Fees"
            className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500 focus:bg-white"
          />
        </div>

        {/* Class / Section */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Type</label>
            <div className="grid grid-cols-2 gap-2">
              {(['CLASS', 'VEHICLE'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setStructureType(t)}
                  className={`py-2.5 rounded-xl text-xs font-black uppercase tracking-widest border-2 transition-colors ${
                    structureType === t
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-slate-50 text-slate-600 border-slate-200'
                  }`}>
                  {t === 'CLASS' ? 'Class fee' : 'Vehicle fee'}
                </button>
              ))}
            </div>
          </div>

          {structureType === 'CLASS' && (
            <>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allClasses}
                  onChange={e => setAllClasses(e.target.checked)}
                  className="w-4 h-4 accent-indigo-600"
                />
                <span className="text-[11px] font-black uppercase tracking-widest text-slate-700">All classes</span>
              </label>

              {!allClasses && (
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Class</label>
                  <select
                    value={className}
                    onChange={e => setClassName(e.target.value)}
                    className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none focus:border-indigo-500 focus:bg-white">
                    {CLASS_OPTIONS.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              )}
            </>
          )}
        </div>

        {/* Fee Heads */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Fee Heads</p>
            <button
              onClick={addHead}
              className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-black text-[10px] uppercase tracking-widest rounded-lg active:scale-95 transition-all">
              <Plus size={11} /> Add
            </button>
          </div>

          {feeHeads.map(head => {
            const simple = toSimple(head.frequency);
            return (
              <div key={head.id} className="border border-slate-100 rounded-2xl p-3 bg-slate-50/40 space-y-2">
                {/* Row 1: name + delete */}
                <div className="flex items-center gap-2">
                  <input
                    value={head.name}
                    onChange={e => patchHead(head.id, { name: e.target.value })}
                    placeholder="e.g. Tuition Fee / Admission / Library"
                    className="flex-1 border border-slate-200 bg-white rounded-xl px-3 py-2.5 font-bold text-sm outline-none focus:border-indigo-500"
                  />
                  <button
                    onClick={() => removeHead(head.id)}
                    className="p-2 rounded-lg text-rose-500 hover:bg-rose-50 active:scale-95 transition-all"
                    aria-label="Remove head">
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* Row 2: amount + Monthly|OneTime toggle */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Amount (₹)</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={head.amount || ''}
                      onChange={e => patchHead(head.id, { amount: Number(e.target.value) || 0 })}
                      placeholder="0"
                      className="w-full border border-slate-200 bg-white rounded-xl px-3 py-2.5 font-bold text-sm outline-none focus:border-indigo-500 tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Frequency</label>
                    <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl">
                      <button
                        type="button"
                        onClick={() => patchHead(head.id, { frequency: 'MONTHLY' })}
                        className={`py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors ${
                          simple === 'MONTHLY' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500'
                        }`}>
                        Monthly
                      </button>
                      <button
                        type="button"
                        onClick={() => patchHead(head.id, { frequency: 'ONE_TIME' })}
                        className={`py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors ${
                          simple === 'ONE_TIME' ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-500'
                        }`}>
                        OneTime
                      </button>
                    </div>
                  </div>
                </div>

                {/* Month picker — visible only for Monthly heads.
                    Principal taps chips to include/exclude months.
                    Different heads can have different month sets
                    (e.g. Tuition all 12, Library only Apr+Oct, etc.).
                    1st of selected month is the auto-due date. */}
                {simple === 'MONTHLY' && (() => {
                  const picked = monthsForHead(head);
                  return (
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1 block">
                        Months ({picked.length})
                      </label>
                      <div className="grid grid-cols-6 gap-1">
                        {ACADEMIC_MONTHS.map(m => {
                          const on = picked.includes(m);
                          return (
                            <button
                              key={m}
                              type="button"
                              onClick={() => toggleHeadMonth(head.id, m)}
                              className={`py-1.5 rounded-lg text-[10px] font-black border transition-colors ${
                                on
                                  ? 'bg-blue-600 text-white border-blue-600'
                                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                              }`}>
                              {m}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Sub-line: what this head bills */}
                <p className="text-[10px] font-bold text-slate-500">
                  {simple === 'MONTHLY'
                    ? `${monthsForHead(head).length} installments · ₹${head.amount.toLocaleString('en-IN')} on 1st`
                    : `One-time · ₹${head.amount.toLocaleString('en-IN')} on AY start`}
                </p>
              </div>
            );
          })}

          {feeHeads.length === 0 && (
            <p className="text-[11px] font-bold text-slate-400 text-center py-3">
              Koi fee head nahi. <strong>Add</strong> dabakar pehla head banayein.
            </p>
          )}
        </div>

        {/* Late Fee — kept lightweight; toggle + 1 amount field */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Late Fee</p>
              <p className="text-[10px] font-bold text-slate-400 mt-0.5">Due date ke baad late charge auto-apply</p>
            </div>
            <button
              type="button"
              onClick={() => setLateFee(prev => ({ ...prev, enabled: !prev.enabled }))}
              className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
                lateFee.enabled ? 'bg-indigo-600' : 'bg-slate-200'
              }`}>
              <div
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  lateFee.enabled ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
          {lateFee.enabled && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Grace days</label>
                <input
                  type="number"
                  value={lateFee.gracePeriodDays}
                  onChange={e => setLateFee(prev => ({ ...prev, gracePeriodDays: Number(e.target.value) || 0 }))}
                  className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-2.5 font-bold text-sm outline-none focus:border-indigo-500 tabular-nums"
                />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Fixed late ₹</label>
                <input
                  type="number"
                  value={lateFee.amount}
                  onChange={e => setLateFee(prev => ({ ...prev, amount: Number(e.target.value) || 0, type: 'FIXED' }))}
                  className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-2.5 font-bold text-sm outline-none focus:border-indigo-500 tabular-nums"
                />
              </div>
            </div>
          )}
        </div>

        {/* Annual total */}
        <div className="bg-slate-900 rounded-2xl p-4 text-white flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Annual total</p>
            <p className="text-[10px] font-bold text-slate-400 mt-0.5">
              {hasMonthly ? 'Sum of (amount × months) for each head' : 'One-time fees only'}
            </p>
          </div>
          <span className="text-2xl font-black tabular-nums">₹{annualTotal.toLocaleString('en-IN')}</span>
        </div>

        {/* Save */}
        <div className="flex gap-2 pt-1 pb-6">
          <button
            onClick={onBack}
            className="px-4 py-3.5 bg-white border border-slate-200 text-slate-600 font-black text-xs uppercase tracking-widest rounded-2xl active:scale-95 transition-transform">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-widest py-3.5 rounded-2xl active:scale-95 transition-transform shadow-md disabled:opacity-60 disabled:cursor-not-allowed">
            {saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Create Structure'}
          </button>
        </div>
      </div>
    </div>
  );
};
