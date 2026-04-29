import React, { useState, useMemo } from 'react';
import { ArrowLeft, Plus, Trash2, Save, ChevronDown, AlertCircle, RotateCcw, Zap } from 'lucide-react';
import { STREAMS, STREAM_CLASSES } from '../../../types/principal.types';

// ─── Data Types ────────────────────────────────────────────────────────────────

export interface FeeHead {
  id: string;
  name: string;
  amount: number;
  frequency: 'MONTHLY' | 'ANNUAL' | 'ONE_TIME';
  description: string;
}

export interface MonthlyDueDate {
  month: string;
  date: string;
}

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
  feeHeads: FeeHead[];
  monthlyDueDates: MonthlyDueDate[];
  lateFee: LateFeeConfig;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const ACADEMIC_MONTHS = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar'];
const MONTH_INDEX: Record<string, number> = {
  Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12,Jan:1,Feb:2,Mar:3,
};
const CLASS_OPTIONS = ['Class 1','Class 2','Class 3','Class 4','Class 5','Class 6','Class 7','Class 8','Class 9','Class 10','Class 11','Class 12'];

const COMMON_FEE_HEADS = [
  { name: 'Tuition Fee', frequency: 'MONTHLY' as const },
  { name: 'Admission Fee', frequency: 'ONE_TIME' as const },
  { name: 'Exam Fee', frequency: 'ANNUAL' as const },
  { name: 'Lab Fee', frequency: 'MONTHLY' as const },
  { name: 'Smart Class Fee', frequency: 'MONTHLY' as const },
  { name: 'Sports Fee', frequency: 'ANNUAL' as const },
  { name: 'Library Fee', frequency: 'ANNUAL' as const },
  { name: 'Computer Lab Fee', frequency: 'MONTHLY' as const },
  { name: 'Annual Day Fee', frequency: 'ONE_TIME' as const },
  { name: 'Transport Fee', frequency: 'MONTHLY' as const },
];

const FREQ_LABEL: Record<string, string> = {
  MONTHLY: 'Monthly', ANNUAL: 'Annual', ONE_TIME: 'One-time',
};

function pad(n: number) { return n < 10 ? `0${n}` : `${n}`; }

function buildDefaultDueDates(startDate: string): MonthlyDueDate[] {
  const startYear = startDate ? parseInt(startDate.slice(0, 4)) : new Date().getFullYear();
  return ACADEMIC_MONTHS.map(month => {
    const mIdx = MONTH_INDEX[month];
    const year = mIdx >= 4 ? startYear : startYear + 1;
    return { month, date: `${year}-${pad(mIdx)}-10` };
  });
}

function calcAnnual(heads: FeeHead[]): number {
  return heads.reduce((sum, h) => {
    if (h.frequency === 'MONTHLY') return sum + h.amount * 12;
    if (h.frequency === 'ANNUAL') return sum + h.amount;
    return sum + h.amount; // ONE_TIME counted once
  }, 0);
}

const BLANK_LATE_FEE: LateFeeConfig = {
  enabled: false, gracePeriodDays: 5, type: 'FIXED', amount: 100, maxCap: 1000,
};

// ─── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  initialData?: FeeStructureItem;
  activeYearLabel: string;
  activeYearStartDate: string;
  onSave: (data: FeeStructureItem) => void;
  onBack: () => void;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export const FeeStructureForm: React.FC<Props> = ({
  initialData, activeYearLabel, activeYearStartDate, onSave, onBack,
}) => {
  const isEditing = !!initialData;

  const [name, setName] = useState(initialData?.name ?? '');
  const [className, setClassName] = useState(initialData?.className.split(' - ')[0] ?? 'Class 1');
  const [stream, setStream] = useState(
    initialData?.className.includes(' - ') ? initialData.className.split(' - ')[1] : ''
  );

  const [feeHeads, setFeeHeads] = useState<FeeHead[]>(
    initialData?.feeHeads ?? [{ id: 'h1', name: 'Tuition Fee', amount: 0, frequency: 'MONTHLY', description: 'Monthly tuition charges' }]
  );

  const defaultDates = useMemo(() => buildDefaultDueDates(activeYearStartDate), [activeYearStartDate]);
  const [dueDates, setDueDates] = useState<MonthlyDueDate[]>(
    initialData?.monthlyDueDates ?? defaultDates
  );

  const [lateFee, setLateFee] = useState<LateFeeConfig>(initialData?.lateFee ?? BLANK_LATE_FEE);

  // New fee head form
  const [newHeadName, setNewHeadName] = useState('');
  const [newHeadAmount, setNewHeadAmount] = useState('');
  const [newHeadFreq, setNewHeadFreq] = useState<FeeHead['frequency']>('MONTHLY');
  const [newHeadDesc, setNewHeadDesc] = useState('');

  const [selectedCommon, setSelectedCommon] = useState('');
  const [expandedHead, setExpandedHead] = useState<string | null>(null);

  const fullClassName = STREAM_CLASSES.has(className) && stream
    ? `${className} - ${stream}`
    : className;

  const annualTotal = calcAnnual(feeHeads);
  const hasMonthly = feeHeads.some(h => h.frequency === 'MONTHLY');

  const handleAddHead = () => {
    if (!newHeadName.trim()) return;
    setFeeHeads(prev => [...prev, {
      id: `h${Date.now()}`,
      name: newHeadName.trim(),
      amount: Number(newHeadAmount) || 0,
      frequency: newHeadFreq,
      description: newHeadDesc.trim(),
    }]);
    setNewHeadName(''); setNewHeadAmount(''); setNewHeadDesc('');
  };

  const handleAddCommon = (headName: string) => {
    const template = COMMON_FEE_HEADS.find(h => h.name === headName);
    if (!template) return;
    setFeeHeads(prev => [...prev, {
      id: `h${Date.now()}`,
      name: template.name,
      amount: 0,
      frequency: template.frequency,
      description: '',
    }]);
    setSelectedCommon('');
  };

  const handleResetDates = () => setDueDates(defaultDates);

  const handleSave = () => {
    if (!name.trim()) { alert('Fee structure name is required'); return; }
    if (!fullClassName) { alert('Class is required'); return; }
    if (STREAM_CLASSES.has(className) && !stream) { alert('Stream is required for Class 11 and 12'); return; }
    onSave({
      id: initialData?.id ?? `fs${Date.now()}`,
      name: name.trim(),
      className: fullClassName,
      feeHeads,
      monthlyDueDates: dueDates,
      lateFee,
    });
  };

  const lateFeePreview = () => {
    if (!lateFee.enabled) return null;
    const typeStr = lateFee.type === 'FIXED'
      ? `Fixed ₹${lateFee.amount}`
      : `${lateFee.amount}% of due`;
    return `${typeStr} after ${lateFee.gracePeriodDays} days grace period (Max: ₹${lateFee.maxCap})`;
  };

  return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 sticky top-0 z-10 shadow-sm flex items-center gap-3">
        <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">
          {isEditing ? 'Edit Fee Structure' : 'Create Fee Structure'}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4  space-y-4">

        {/* ── Name ── */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Fee Structure Name *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g., Standard Academic Fees - Class 5"
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500 focus:bg-white"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Class *</label>
            <select
              value={className}
              onChange={e => { setClassName(e.target.value); setStream(''); }}
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none focus:border-indigo-500"
            >
              {CLASS_OPTIONS.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>

          {STREAM_CLASSES.has(className) && (
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Stream *</label>
              <div className="grid grid-cols-3 gap-2">
                {STREAMS.map(s => (
                  <button key={s} type="button"
                    onClick={() => setStream(s)}
                    className={`py-2.5 rounded-xl text-xs font-black border transition-all ${stream === s ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeYearLabel && (
            <div className="flex items-center gap-2 bg-blue-50 rounded-xl px-3 py-2">
              <span className="text-[10px] font-black text-blue-700">📅 Showing classes for academic year: {activeYearLabel}</span>
            </div>
          )}
        </div>

        {/* ── Common Fee Heads Quick-add ── */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">📦 Copy From Common Fee Heads</span>
          </div>
          <select
            value={selectedCommon}
            onChange={e => { if (e.target.value) handleAddCommon(e.target.value); setSelectedCommon(''); }}
            className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none focus:border-indigo-500"
          >
            <option value="">Select an option…</option>
            {COMMON_FEE_HEADS.map(h => (
              <option key={h.name} value={h.name}>{h.name} ({FREQ_LABEL[h.frequency]})</option>
            ))}
          </select>
          <p className="text-[9px] font-bold text-slate-400">⚙️ Select a component from the dropdown to instantly add it to your fee structure</p>
        </div>

        {/* ── Fee Heads ── */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Fee Heads *</span>
          </div>

          {feeHeads.map((head, idx) => (
            <div key={head.id} className="border-b border-slate-50 last:border-0">
              <button
                onClick={() => setExpandedHead(expandedHead === head.id ? null : head.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left"
              >
                <div className="flex-1">
                  <div className="font-bold text-slate-800 text-sm">{head.name || 'Fee Name'}</div>
                  <div className="text-[10px] font-bold text-slate-400 mt-0.5">
                    ₹{head.amount.toLocaleString('en-IN')} · {FREQ_LABEL[head.frequency]}
                    {head.description && <span className="ml-1 opacity-70">· {head.description}</span>}
                  </div>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); setFeeHeads(prev => prev.filter(h => h.id !== head.id)); }}
                  className="p-1.5 text-rose-400 hover:bg-rose-50 rounded-lg transition-colors"
                >
                  <Trash2 size={13} />
                </button>
                <ChevronDown size={14} className={`text-slate-300 transition-transform ${expandedHead === head.id ? 'rotate-180' : ''}`} />
              </button>

              {expandedHead === head.id && (
                <div className="px-4 pb-4 space-y-3 bg-slate-50">
                  <div>
                    <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Fee Name</label>
                    <input
                      value={head.name}
                      onChange={e => setFeeHeads(prev => prev.map(h => h.id === head.id ? { ...h, name: e.target.value } : h))}
                      className="w-full border border-slate-200 bg-white rounded-xl px-3 py-2.5 font-bold text-sm outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Amount (₹)</label>
                      <input
                        type="number"
                        value={head.amount || ''}
                        onChange={e => setFeeHeads(prev => prev.map(h => h.id === head.id ? { ...h, amount: Number(e.target.value) } : h))}
                        className="w-full border border-slate-200 bg-white rounded-xl px-3 py-2.5 font-bold text-sm outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Frequency</label>
                      <select
                        value={head.frequency}
                        onChange={e => setFeeHeads(prev => prev.map(h => h.id === head.id ? { ...h, frequency: e.target.value as FeeHead['frequency'] } : h))}
                        className="w-full border border-slate-200 bg-white rounded-xl px-2 py-2.5 font-bold text-xs outline-none focus:border-indigo-500"
                      >
                        <option value="MONTHLY">Monthly</option>
                        <option value="ANNUAL">Annual</option>
                        <option value="ONE_TIME">One-time</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Description (optional)</label>
                    <input
                      value={head.description}
                      onChange={e => setFeeHeads(prev => prev.map(h => h.id === head.id ? { ...h, description: e.target.value } : h))}
                      placeholder="e.g. Monthly tuition charges"
                      className="w-full border border-slate-200 bg-white rounded-xl px-3 py-2.5 font-bold text-sm outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Add Fee Head */}
          <div className="p-4 bg-slate-50 border-t border-slate-100 space-y-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">+ Add Fee Head</p>
            <input
              value={newHeadName}
              onChange={e => setNewHeadName(e.target.value)}
              placeholder="Fee Name"
              className="w-full border border-slate-200 bg-white rounded-xl px-3 py-2.5 font-bold text-sm outline-none focus:border-indigo-500"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                value={newHeadAmount}
                onChange={e => setNewHeadAmount(e.target.value)}
                placeholder="Amount (₹)"
                className="w-full border border-slate-200 bg-white rounded-xl px-3 py-2.5 font-bold text-sm outline-none focus:border-indigo-500"
              />
              <select
                value={newHeadFreq}
                onChange={e => setNewHeadFreq(e.target.value as FeeHead['frequency'])}
                className="w-full border border-slate-200 bg-white rounded-xl px-2 py-2.5 font-bold text-xs outline-none focus:border-indigo-500"
              >
                <option value="MONTHLY">Monthly</option>
                <option value="ANNUAL">Annual</option>
                <option value="ONE_TIME">One-time</option>
              </select>
            </div>
            <input
              value={newHeadDesc}
              onChange={e => setNewHeadDesc(e.target.value)}
              placeholder="Description (optional)"
              className="w-full border border-slate-200 bg-white rounded-xl px-3 py-2.5 font-bold text-sm outline-none focus:border-indigo-500"
            />
            <button
              onClick={handleAddHead}
              disabled={!newHeadName.trim()}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white font-black text-xs uppercase tracking-widest py-2.5 rounded-xl active:scale-95 transition-transform disabled:opacity-40"
            >
              <Plus size={13} /> Add Fee Head
            </button>
          </div>
        </div>

        {/* ── Monthly Due Dates ── */}
        {hasMonthly && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Monthly Due Dates</span>
              <button onClick={handleResetDates} className="flex items-center gap-1 text-[10px] font-black text-indigo-600">
                <RotateCcw size={11} /> Reset All
              </button>
            </div>

            <div className="divide-y divide-slate-50">
              {dueDates.map(({ month, date }) => (
                <div key={month} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="w-10 text-xs font-black text-slate-500 shrink-0">{month}:</span>
                  <input
                    type="date"
                    value={date}
                    onChange={e => setDueDates(prev => prev.map(d => d.month === month ? { ...d, date: e.target.value } : d))}
                    className="flex-1 border border-slate-200 bg-slate-50 rounded-xl px-3 py-1.5 font-bold text-xs outline-none focus:border-indigo-500"
                  />
                  <span className="text-[9px] font-black text-slate-300">Custom</span>
                </div>
              ))}
            </div>

            <div className="p-4 bg-blue-50 border-t border-blue-100">
              <p className="text-[9px] font-bold text-blue-600">💡 <strong>Quick Tips:</strong></p>
              <ul className="text-[9px] font-bold text-blue-500 mt-1 space-y-0.5 list-none">
                <li>• All months are pre-filled with proper academic year dates</li>
                <li>• Jan–Mar use next year (e.g., {activeYearStartDate ? parseInt(activeYearStartDate.slice(0,4)) + 1 : '2027'} for {activeYearLabel || '2026-27'})</li>
                <li>• Apr–Dec use current year (e.g., {activeYearStartDate ? activeYearStartDate.slice(0,4) : '2026'} for {activeYearLabel || '2026-27'})</li>
                <li>• Change any date to customize that month</li>
              </ul>
            </div>
          </div>
        )}

        {/* ── Late Fee ── */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-4 border-b border-slate-100">
            <div>
              <p className="font-black text-slate-900 text-sm">Enable Late Fee for this Fee Structure</p>
              <p className="text-[9px] font-bold text-slate-400 mt-0.5">⚠️ Late fees will be automatically calculated when students pay after the due date</p>
            </div>
            <button
              onClick={() => setLateFee(prev => ({ ...prev, enabled: !prev.enabled }))}
              className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ${lateFee.enabled ? 'bg-indigo-600' : 'bg-slate-200'}`}
            >
              <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${lateFee.enabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
            </button>
          </div>

          {lateFee.enabled && (
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Grace Period (Days)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={lateFee.gracePeriodDays}
                    onChange={e => setLateFee(prev => ({ ...prev, gracePeriodDays: Number(e.target.value) }))}
                    className="w-24 border border-slate-200 bg-slate-50 rounded-xl px-3 py-2.5 font-bold text-sm outline-none focus:border-indigo-500"
                  />
                  <span className="text-xs font-bold text-slate-400">Days after due date before late fee applies</span>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Late Fee Calculation Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { val: 'FIXED', label: 'Fixed Amount' },
                    { val: 'PERCENTAGE', label: 'Percentage' },
                  ].map(({ val, label }) => (
                    <button key={val} type="button"
                      onClick={() => setLateFee(prev => ({ ...prev, type: val as LateFeeConfig['type'] }))}
                      className={`py-2.5 rounded-xl text-xs font-black border transition-all ${lateFee.type === val ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                    {lateFee.type === 'FIXED' ? 'Fixed Late Fee Amount (₹)' : 'Percentage (%)'}
                  </label>
                  <input
                    type="number"
                    value={lateFee.amount}
                    onChange={e => setLateFee(prev => ({ ...prev, amount: Number(e.target.value) }))}
                    className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-2.5 font-bold text-sm outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Maximum Late Fee Cap (₹)</label>
                  <input
                    type="number"
                    value={lateFee.maxCap}
                    onChange={e => setLateFee(prev => ({ ...prev, maxCap: Number(e.target.value) }))}
                    className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-2.5 font-bold text-sm outline-none focus:border-indigo-500"
                  />
                  <p className="text-[9px] font-bold text-slate-400 mt-1">Maximum late fee that can be charged</p>
                </div>
              </div>

              {lateFeePreview() && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <p className="text-[10px] font-black text-amber-700">Late Fee Preview:</p>
                  <p className="text-xs font-bold text-amber-600 mt-1">{lateFeePreview()}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Annual Total ── */}
        <div className="bg-indigo-600 rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <span className="font-black text-white text-sm">Total Annual Fee:</span>
            <span className="font-black text-white text-xl">₹{annualTotal.toLocaleString('en-IN')}</span>
          </div>
          {lateFee.enabled && (
            <div className="flex items-center gap-1.5 mt-2">
              <Zap size={12} className="text-yellow-300" />
              <span className="text-[10px] font-bold text-indigo-200">Late fees will be automatically calculated during payment</span>
            </div>
          )}
        </div>

        {/* ── Actions ── */}
        <div className="flex gap-3">
          <button
            onClick={onBack}
            className="flex-1 py-3.5 border-2 border-slate-200 text-slate-600 font-black text-xs uppercase tracking-widest rounded-2xl active:scale-95 transition-transform"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 text-white font-black text-xs uppercase tracking-widest py-3.5 rounded-2xl active:scale-95 transition-transform shadow-lg"
          >
            <Plus size={15} /> {isEditing ? 'Save Changes' : 'Create Fee'}
          </button>
        </div>
      </div>
    </div>
  );
};
