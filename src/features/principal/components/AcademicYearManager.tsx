import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Calendar, Lock, CheckCircle2, AlertTriangle,
  CreditCard, Users, Sparkles, Plus, X,
} from 'lucide-react';
import { useAcademicYear } from '../../../context/AcademicYearContext';
import { useAuthStore } from '../../../store/authStore';
import { useUIStore } from '../../../store/uiStore';
import { useBillingStore } from '../../../store/billingStore';
import { yearClosingService } from '../../../services/yearClosing.service';
import { billingService } from '../../../services/billing.service';
import type {
  PreClosingChecklist, YearClosingConfig, StreamDefinition, YearClosingResult,
} from '../../../types/yearClosing.types';

interface Props { onBack: () => void; }

type DuesHandling = 'WRITEOFF' | 'ARREARS';
interface CarryForwardFlags {
  staff: boolean; vehicles: boolean; feeStructure: boolean; timetable: boolean;
}

const DEFAULT_STREAMS: StreamDefinition[] = [
  { id: '1', name: 'Science-PCM', capacity: 40, currentCount: 0 },
  { id: '2', name: 'Science-PCB', capacity: 40, currentCount: 0 },
  { id: '3', name: 'Commerce',    capacity: 40, currentCount: 0 },
  { id: '4', name: 'Arts',        capacity: 40, currentCount: 0 },
];

export const AcademicYearManager: React.FC<Props> = ({ onBack }) => {
  const { academicYears, activeYear, isYearLocked, refresh: refreshAY, addAcademicYear } = useAcademicYear();
  const { showToast } = useUIStore();
  const { session } = useAuthStore();
  const { createNextYear } = useBillingStore();

  // ─── Bootstrap (zero years) form state ──────────────────────────────────
  const [bootLabel, setBootLabel] = useState('');
  const [bootStart, setBootStart] = useState('');
  const [bootEnd, setBootEnd] = useState('');
  const [bootBoard, setBootBoard] = useState('CBSE');
  const [bootMedium, setBootMedium] = useState('English');
  const [bootSaving, setBootSaving] = useState(false);

  // ─── Closing form state (when at least one year exists) ─────────────────
  const [nextYearName, setNextYearName] = useState('');
  const [nextStartDate, setNextStartDate] = useState('');
  const [nextEndDate, setNextEndDate] = useState('');
  const [board, setBoard] = useState('CBSE');
  const [nextMedium, setNextMedium] = useState('English');
  const [streams, setStreams] = useState<StreamDefinition[]>(DEFAULT_STREAMS);
  const [outstandingHandling, setOutstandingHandling] = useState<DuesHandling>('WRITEOFF');
  const [carryForward, setCarryForward] = useState<CarryForwardFlags>({
    staff: true, vehicles: true, feeStructure: true, timetable: true,
  });

  const [checklist, setChecklist] = useState<PreClosingChecklist | null>(null);
  const [checklistLoading, setChecklistLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [doneResult, setDoneResult] = useState<YearClosingResult | null>(null);
  const [error, setError] = useState('');

  // ─── Auto-fill bootstrap defaults (zero-year case) ──────────────────────
  useEffect(() => {
    if (academicYears.length > 0) return;
    if (bootLabel || bootStart || bootEnd) return;
    const today = new Date();
    const startYr = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
    setBootLabel(`${startYr}-${String(startYr + 1).slice(-2)}`);
    setBootStart(`${startYr}-04-01`);
    setBootEnd(`${startYr + 1}-03-31`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [academicYears.length]);

  // ─── Auto-fill next-year defaults when active year present ──────────────
  useEffect(() => {
    if (!activeYear) return;
    if (nextYearName || nextStartDate || nextEndDate) return;
    if (activeYear.endDate) {
      const startD = new Date(activeYear.endDate);
      startD.setDate(startD.getDate() + 1);
      const endD = new Date(startD.getFullYear() + 1, startD.getMonth(), startD.getDate() - 1);
      const yr = startD.getFullYear();
      setNextYearName(`${yr}-${String(yr + 1).slice(-2)}`);
      setNextStartDate(startD.toISOString().slice(0, 10));
      setNextEndDate(endD.toISOString().slice(0, 10));
    }
    if (activeYear.board) setBoard(activeYear.board);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeYear?.id]);

  // ─── Load pre-closing checklist for the active year ─────────────────────
  useEffect(() => {
    if (!activeYear) { setChecklist(null); return; }
    setChecklistLoading(true);
    yearClosingService.getPreClosingChecklist(activeYear.id)
      .then(setChecklist)
      .catch(err => setError(err instanceof Error ? err.message : 'Checklist load failed'))
      .finally(() => setChecklistLoading(false));
  }, [activeYear?.id]);

  // Hard blocker: pending salary stops the close. We FAIL CLOSED — if the
  // checklist hasn't loaded yet (or failed to load), we treat it as
  // blocked so a transient checklist error can never bypass the rule.
  const salaryBlocking = !checklist || checklist.salaryPending.total > 0;

  // ─── Bootstrap submit ────────────────────────────────────────────────────
  const handleBootstrap = async () => {
    if (!bootLabel.trim() || !bootStart || !bootEnd) {
      showToast('Label, start date aur end date dene zaroori hain', 'error');
      return;
    }
    if (bootEnd <= bootStart) {
      showToast('End date start date ke baad honi chahiye', 'error');
      return;
    }
    setBootSaving(true);
    try {
      await addAcademicYear({
        name: bootLabel.trim(),
        startDate: bootStart,
        endDate: bootEnd,
        board: bootBoard,
      });
      // create_academic_year RPC ignores p_medium today, but we keep the
      // dropdown so the principal experience is consistent with the closing
      // form below (and to make the future plumbing trivial).
      void bootMedium;
      setBootLabel(''); setBootStart(''); setBootEnd('');
      showToast(`Academic year created`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Year create karne mein error', 'error');
    } finally {
      setBootSaving(false);
    }
  };

  // ─── Closing submit (single button: validate → save → simulate → commit) ─
  const handleCommit = async () => {
    if (!activeYear) return;
    if (!nextYearName.trim()) { setError('Naye year ka label zaroori hai'); return; }
    if (!nextStartDate || !nextEndDate) { setError('Start aur end date zaroori hain'); return; }
    if (nextEndDate <= nextStartDate) { setError('End date start date ke baad honi chahiye'); return; }
    if (!checklist) {
      setError('Pre-closing checklist abhi load nahi hua. Thodi der baad try karein.');
      return;
    }
    if (checklist.salaryPending.total > 0) {
      setError('Pending salary clear karein pehle — yeh hard blocker hai');
      return;
    }
    setCommitting(true);
    setError('');
    try {
      const cfg: YearClosingConfig = {
        id: `cfg_${Date.now()}`,
        fromYearId: activeYear.id,
        nextYearName: nextYearName.trim(),
        nextYearStartDate: nextStartDate,
        nextYearEndDate: nextEndDate,
        board,
        nextYearMedium: nextMedium,
        streams: streams.filter(s => s.capacity > 0),
        outstandingDuesHandling: outstandingHandling,
        carryForward,
        status: 'PENDING_COMMIT',
        createdDate: new Date().toISOString(),
      };
      const saved = yearClosingService.saveConfig(cfg);

      // Safety net: simulate first to surface hard errors before mutating
      // anything. Warnings (e.g. fees pending) are intentional and ignored
      // here because the dues-policy radio already captures the principal's
      // explicit choice.
      const sim = await yearClosingService.simulateYearClosing(saved.id);
      if (sim.errors.length > 0) {
        setError(sim.errors.join(' · '));
        setCommitting(false);
        setShowConfirm(false);
        return;
      }

      const result = await yearClosingService.commitYearClosing(saved.id);
      await refreshAY();

      showToast(
        `${activeYear.name} closed · ${result.newYearName} opened · ${result.summary.studentsPromoted} promoted`,
      );

      // Reset the close form fields so the auto-fill effect (keyed on
      // activeYear.id, which just changed) re-runs and pre-fills defaults
      // targeting the NEW active year.
      setNextYearName(''); setNextStartDate(''); setNextEndDate('');

      // Year close has SUCCEEDED at the DB level once we reach this point.
      // Billing rollover is a follow-up step — if it fails (network blip,
      // missing billing rows, etc.) we MUST NOT show the principal a
      // generic failure or they will retry the close and hit a confusing
      // "already locked" state. Surface it as a partial-success toast and
      // still advance to the DONE screen.
      if (session?.schoolId) {
        try {
          const currentBilling = await billingService.getCurrentYear(session.schoolId);
          const carriedForward = outstandingHandling === 'ARREARS'
            ? (currentBilling?.outstanding ?? 0) : 0;
          await createNextYear(session.schoolId, carriedForward);
        } catch (billingErr) {
          const msg = billingErr instanceof Error ? billingErr.message : 'unknown error';
          showToast(`Year closed, but billing rollover failed: ${msg}. Re-run from Fees section.`, 'error');
        }
      }

      setDoneResult(result);
      setShowConfirm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Year close karne mein error');
    } finally {
      setCommitting(false);
    }
  };

  // ─── Yearly summary rendering ───────────────────────────────────────────
  const yearList = useMemo(() => (
    <div className="space-y-3">
      {academicYears.map(year => {
        const locked = isYearLocked(year.id);
        const isActive = year.isActive;
        return (
          <div
            key={year.id}
            className={`bg-white rounded-2xl border shadow-sm p-4 ${
              isActive ? 'border-emerald-300' : locked ? 'border-slate-200' : 'border-slate-100'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-black text-slate-900">{year.name}</span>
                  {isActive && (
                    <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                      Active
                    </span>
                  )}
                  {locked && !isActive && (
                    <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 flex items-center gap-1">
                      <Lock size={9} /> Locked
                    </span>
                  )}
                </div>
                <div className="text-[10px] font-bold text-slate-400 mt-1">
                  {year.startDate} → {year.endDate} · {year.board}
                </div>
                {year.closedDate && (
                  <div className="text-[10px] font-bold text-slate-400">
                    Closed: {year.closedDate}
                  </div>
                )}
              </div>
              <div
                className={`w-10 h-6 rounded-full flex items-center transition-all duration-300 ${
                  isActive ? 'bg-emerald-500 justify-end' : 'bg-slate-200 justify-start'
                } px-1`}
              >
                <div className="w-4 h-4 bg-white rounded-full shadow-sm" />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  ), [academicYears, isYearLocked]);

  // ─── MAIN page ───────────────────────────────────────────────────────────
  return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300 min-h-screen">
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 sticky top-0 z-10 shadow-sm flex items-center gap-3">
        <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Academic Year</h2>
          <p className="text-[10px] font-bold text-slate-400 mt-0.5">
            {academicYears.length === 0
              ? 'Pehla academic year setup karein'
              : 'View years · close current · open next — sab ek jagah'}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-24">
        {/* ─── Inline success banner (after a successful close) ────────── */}
        {doneResult && (
          <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-4 flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-500">
            <div className="w-9 h-9 bg-emerald-100 rounded-full flex items-center justify-center shrink-0">
              <CheckCircle2 size={18} className="text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-black text-slate-900 text-sm">{doneResult.newYearName} is now active</p>
              <p className="text-[11px] font-bold text-slate-600 mt-0.5">
                Purana year locked · {doneResult.summary.studentsPromoted} promoted ·{' '}
                {doneResult.summary.studentsDetained} detained · {doneResult.summary.streamsAssigned} streams
              </p>
            </div>
            <button
              onClick={() => setDoneResult(null)}
              className="text-emerald-600 hover:text-emerald-800 shrink-0 p-1"
              aria-label="Dismiss"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* ─── ZERO YEARS: bootstrap form is the page's primary action ─── */}
        {academicYears.length === 0 ? (
          <div className="bg-white rounded-2xl border-2 border-rose-200 shadow-sm p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Calendar size={18} className="text-rose-600" />
              <p className="text-sm font-black text-slate-900">Pehla Academic Year create karein</p>
            </div>
            <p className="text-[11px] font-bold text-slate-500 leading-relaxed">
              Yeh sabse pehla aur compulsory step hai. Iske baad classes, fees, staff aur students set kar payenge.
            </p>
            <div className="space-y-2">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Label</label>
                <input
                  value={bootLabel}
                  onChange={e => setBootLabel(e.target.value)}
                  placeholder="e.g. 2026-27"
                  className="w-full mt-1 border border-slate-200 bg-slate-50 rounded-xl px-3 py-2.5 font-bold text-sm outline-none focus:border-slate-900"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Start Date</label>
                  <input
                    type="date"
                    value={bootStart}
                    onChange={e => setBootStart(e.target.value)}
                    className="w-full mt-1 border border-slate-200 bg-slate-50 rounded-xl px-3 py-2.5 font-bold text-sm outline-none focus:border-slate-900"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">End Date</label>
                  <input
                    type="date"
                    value={bootEnd}
                    onChange={e => setBootEnd(e.target.value)}
                    className="w-full mt-1 border border-slate-200 bg-slate-50 rounded-xl px-3 py-2.5 font-bold text-sm outline-none focus:border-slate-900"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Board</label>
                  <select
                    value={bootBoard}
                    onChange={e => setBootBoard(e.target.value)}
                    className="w-full mt-1 border border-slate-200 bg-slate-50 rounded-xl px-3 py-2.5 font-bold text-sm outline-none focus:border-slate-900"
                  >
                    <option value="CBSE">CBSE</option>
                    <option value="ICSE">ICSE</option>
                    <option value="State">State Board</option>
                    <option value="IB">IB</option>
                    <option value="IGCSE">IGCSE</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Medium</label>
                  <select
                    value={bootMedium}
                    onChange={e => setBootMedium(e.target.value)}
                    className="w-full mt-1 border border-slate-200 bg-slate-50 rounded-xl px-3 py-2.5 font-bold text-sm outline-none focus:border-slate-900"
                  >
                    <option value="English">English</option>
                    <option value="Hindi">Hindi</option>
                    <option value="Hinglish">Hinglish</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>
            </div>
            <button
              onClick={() => { void handleBootstrap(); }}
              disabled={bootSaving}
              className="w-full disabled:opacity-60 text-white font-black text-sm rounded-xl py-3 bg-rose-600 hover:bg-rose-700 flex items-center justify-center gap-2"
            >
              <Plus size={16} /> {bootSaving ? 'Saving…' : 'Create Academic Year'}
            </button>
          </div>
        ) : (
          <>
            {/* ─── Year list ───────────────────────────────────────────── */}
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">All Years</p>
              {yearList}
            </div>

            {/* ─── Closing form (only when an active year exists) ─────── */}
            {activeYear && !isYearLocked(activeYear.id) && (
              <div className="bg-white rounded-2xl border-2 border-blue-200 shadow-sm p-4 space-y-4">
                <div className="flex items-center gap-2">
                  <Sparkles size={18} className="text-blue-600" />
                  <p className="text-sm font-black text-slate-900">Naya Year + Promote Students</p>
                </div>
                <p className="text-[11px] font-bold text-slate-500 leading-relaxed">
                  Yeh ek action: <span className="font-black">{activeYear.name}</span> lock hoga (read-only),
                  naya year create hoga, students automatically promote honge.
                </p>

                {/* Pre-checks summary (inline, non-blocking unless salary) */}
                {checklistLoading && (
                  <div className="text-[11px] font-bold text-slate-400">Loading checklist…</div>
                )}
                {checklist && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className={`p-3 rounded-xl border ${
                      checklist.feesPending.total === 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'
                    }`}>
                      <div className="flex items-center gap-1.5">
                        <CreditCard size={12} className={checklist.feesPending.total === 0 ? 'text-emerald-600' : 'text-amber-600'} />
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Fees Pending</span>
                      </div>
                      <div className={`text-sm font-black mt-1 ${checklist.feesPending.total === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {checklist.feesPending.total === 0
                          ? 'All clear'
                          : `₹${checklist.feesPending.total.toLocaleString()} · ${checklist.feesPending.count} stu`}
                      </div>
                    </div>
                    <div className={`p-3 rounded-xl border ${
                      checklist.salaryPending.total === 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'
                    }`}>
                      <div className="flex items-center gap-1.5">
                        <Users size={12} className={checklist.salaryPending.total === 0 ? 'text-emerald-600' : 'text-rose-600'} />
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Salary Pending</span>
                      </div>
                      <div className={`text-sm font-black mt-1 ${checklist.salaryPending.total === 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {checklist.salaryPending.total === 0
                          ? 'All clear'
                          : `₹${checklist.salaryPending.total.toLocaleString()} · ${checklist.salaryPending.count} staff`}
                      </div>
                    </div>
                  </div>
                )}
                {salaryBlocking && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2">
                    <AlertTriangle size={14} className="text-rose-600 mt-0.5 shrink-0" />
                    <p className="text-[11px] font-black text-rose-700 leading-relaxed">
                      Pending salary hard blocker hai. Pehle Salary Ledger me clear karein.
                    </p>
                  </div>
                )}

                {/* New year details */}
                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Naye Year Ki Details</p>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Label</label>
                    <input
                      type="text"
                      placeholder="e.g. 2027-28"
                      value={nextYearName}
                      onChange={e => setNextYearName(e.target.value)}
                      className="w-full mt-1 border border-slate-200 bg-slate-50 rounded-xl px-3 py-2.5 font-bold text-sm outline-none focus:border-slate-900"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Start Date</label>
                      <input
                        type="date"
                        value={nextStartDate}
                        onChange={e => setNextStartDate(e.target.value)}
                        className="w-full mt-1 border border-slate-200 bg-slate-50 rounded-xl px-3 py-2.5 font-bold text-sm outline-none focus:border-slate-900"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">End Date</label>
                      <input
                        type="date"
                        value={nextEndDate}
                        onChange={e => setNextEndDate(e.target.value)}
                        className="w-full mt-1 border border-slate-200 bg-slate-50 rounded-xl px-3 py-2.5 font-bold text-sm outline-none focus:border-slate-900"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Board</label>
                      <select
                        value={board}
                        onChange={e => setBoard(e.target.value)}
                        className="w-full mt-1 border border-slate-200 bg-slate-50 rounded-xl px-3 py-2.5 font-bold text-sm outline-none focus:border-slate-900"
                      >
                        <option value="CBSE">CBSE</option>
                        <option value="ICSE">ICSE</option>
                        <option value="State">State Board</option>
                        <option value="IB">IB</option>
                        <option value="IGCSE">IGCSE</option>
                        {board === 'RBSE' && <option value="RBSE">RBSE (legacy)</option>}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Medium</label>
                      <select
                        value={nextMedium}
                        onChange={e => setNextMedium(e.target.value)}
                        className="w-full mt-1 border border-slate-200 bg-slate-50 rounded-xl px-3 py-2.5 font-bold text-sm outline-none focus:border-slate-900"
                      >
                        <option value="English">English</option>
                        <option value="Hindi">Hindi</option>
                        <option value="Hinglish">Hinglish</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Stream capacities */}
                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Class 11 Streams</p>
                  <p className="text-[11px] font-bold text-slate-500 leading-relaxed">
                    Class 10 ke promote hone wale students in streams me assign honge. Capacity 0 = stream skip.
                  </p>
                  {streams.map((stream, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <input
                        type="text"
                        value={stream.name}
                        disabled
                        className="flex-1 border border-slate-200 bg-slate-100 rounded-xl px-3 py-2 font-bold text-slate-700 text-sm"
                      />
                      <input
                        type="number"
                        min="0"
                        value={stream.capacity}
                        onChange={e => {
                          const updated = [...streams];
                          updated[idx] = { ...updated[idx], capacity: parseInt(e.target.value) || 0 };
                          setStreams(updated);
                        }}
                        className="w-20 border border-slate-200 bg-slate-50 rounded-xl px-3 py-2 font-bold text-sm outline-none focus:border-slate-900"
                        placeholder="Cap"
                      />
                    </div>
                  ))}
                </div>

                {/* Outstanding dues policy */}
                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Outstanding Dues</p>
                  {([
                    { value: 'WRITEOFF' as DuesHandling, label: 'Write off (bad debt)' },
                    { value: 'ARREARS'  as DuesHandling, label: 'Carry as arrears to new year' },
                  ]).map(opt => (
                    <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="outstanding"
                        value={opt.value}
                        checked={outstandingHandling === opt.value}
                        onChange={e => setOutstandingHandling(e.target.value as DuesHandling)}
                        className="w-4 h-4"
                      />
                      <span className="text-sm font-bold text-slate-700">{opt.label}</span>
                    </label>
                  ))}
                </div>

                {/* Carry forward */}
                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Carry Forward</p>
                  {([
                    { key: 'staff' as const,        label: 'Staff assignments' },
                    { key: 'vehicles' as const,     label: 'Vehicles & routes' },
                    { key: 'feeStructure' as const, label: 'Fee structure' },
                    { key: 'timetable' as const,    label: 'Timetable' },
                  ]).map(item => (
                    <label key={item.key} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={carryForward[item.key]}
                        onChange={e => setCarryForward({ ...carryForward, [item.key]: e.target.checked })}
                        className="w-4 h-4"
                      />
                      <span className="text-sm font-bold text-slate-700">{item.label}</span>
                    </label>
                  ))}
                </div>

                {error && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start justify-between gap-2">
                    <p className="text-[11px] font-bold text-rose-700 flex-1">{error}</p>
                    <button onClick={() => setError('')} className="text-rose-400 hover:text-rose-600 shrink-0">
                      <X size={14} />
                    </button>
                  </div>
                )}

                <button
                  onClick={() => setShowConfirm(true)}
                  disabled={committing || salaryBlocking}
                  className="w-full disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-sm rounded-xl py-3 bg-rose-600 hover:bg-rose-700 flex items-center justify-center gap-2"
                >
                  <Lock size={16} />
                  Close {activeYear.name} & Open {nextYearName || 'New Year'}
                </button>
              </div>
            )}

            {/* If active year is locked or absent, just inform */}
            {activeYear && isYearLocked(activeYear.id) && (
              <div className="bg-slate-100 border border-slate-200 rounded-2xl p-4 text-[11px] font-bold text-slate-500">
                Active year {activeYear.name} already locked hai. Naya year create karne ke liye DB admin se baat karein.
              </div>
            )}
            {!activeYear && academicYears.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-[11px] font-bold text-amber-700">
                Koi active year set nahi hai. Sabhi years locked dikh rahe hain — DB admin se baat karein.
              </div>
            )}
          </>
        )}
      </div>

      {/* ─── Confirmation modal ──────────────────────────────────────────── */}
      {showConfirm && activeYear && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
          onClick={() => !committing && setShowConfirm(false)}
        >
          <div
            className="bg-white rounded-3xl w-full max-w-sm p-5 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-rose-100 rounded-full flex items-center justify-center">
                <AlertTriangle size={20} className="text-rose-600" />
              </div>
              <div>
                <h3 className="font-black text-slate-900 text-base">Confirm Year Close</h3>
                <p className="text-[10px] font-bold text-slate-400">Yeh action irreversible hai</p>
              </div>
            </div>
            <div className="text-[12px] font-bold text-slate-700 leading-relaxed space-y-2">
              <p>
                <span className="font-black text-rose-700">{activeYear.name}</span> permanently lock ho jayega
                (read-only).
              </p>
              <p>
                <span className="font-black text-emerald-700">{nextYearName}</span> active ho jayega aur students
                automatically promote honge.
              </p>
              <p className="text-[11px] text-slate-500">
                Dues policy: <span className="font-black uppercase">{outstandingHandling}</span>
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={committing}
                className="flex-1 py-2.5 border border-slate-200 text-slate-600 font-black rounded-xl text-sm disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => { void handleCommit(); }}
                disabled={committing}
                className="flex-1 py-2.5 bg-rose-600 text-white font-black rounded-xl text-sm disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {committing && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {committing ? 'Closing…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
