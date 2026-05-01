import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Calendar, Lock, CheckCircle2, AlertTriangle,
  Sparkles, Plus, Power, Edit3, FileWarning, History,
} from 'lucide-react';
import { useAcademicYear } from '../../../context/AcademicYearContext';
import { useUIStore } from '../../../store/uiStore';
import { yearClosingService } from '../../../services/yearClosing.service';
import { useCorrectionStore } from '../../../store/correctionStore';
import { useEditingYearStore } from '../../../store/editingYearStore';
import type { PreClosingChecklist } from '../../../types/yearClosing.types';
import { AcademicYearWizard } from './AcademicYearWizard';

interface Props { onBack: () => void; }

export const AcademicYearManager: React.FC<Props> = ({ onBack }) => {
  const {
    academicYears, activeYear, isYearLocked, refresh: refreshAY, setActiveYear,
    setCurrentEditingYear,
  } = useAcademicYear();
  const { showToast } = useUIStore();

  // ─── Wizard state ───────────────────────────────────────────────────────
  const [showWizard, setShowWizard] = useState(false);
  const [wizardKey, setWizardKey] = useState(0);
  const wizardDefaults = useMemo(() => {
    // Default to the year AFTER the latest existing year so the auto-filled
    // label cannot collide with the UNIQUE(school_id, label) constraint on
    // academic_years (migration 0001). Without this, after the principal
    // closes "2026-27" today, the wizard would re-suggest "2026-27" and
    // the create RPC would fail with a duplicate-label error — exactly the
    // "step 1 breaks after closing year" bug we're fixing.
    const today = new Date();
    let startYr = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
    if (academicYears.length > 0) {
      // academicYears are ordered by start_date DESC by the context, so
      // the first entry is the most recent year. Bump start to the year
      // AFTER its end_date.
      const latestEnd = new Date(academicYears[0].endDate);
      if (!Number.isNaN(latestEnd.getTime())) {
        const nextStart = latestEnd.getFullYear() +
          (latestEnd.getMonth() >= 3 ? 1 : 0);
        if (nextStart > startYr) startYr = nextStart;
      }
    }
    const fallbackBoard = academicYears[0]?.board ?? 'CBSE';
    return {
      label: `${startYr}-${String(startYr + 1).slice(-2)}`,
      start: `${startYr}-04-01`,
      end:   `${startYr + 1}-03-31`,
      board: activeYear?.board ?? fallbackBoard,
    };
  }, [activeYear?.board, academicYears]);

  // True when the school has historical years but ALL of them are closed —
  // i.e. the principal closed the last year and hasn't opened a new one.
  // In this state the rest of the app (sections, fees, staff, students)
  // cannot make progress until a fresh AY is created, so we render a
  // prominent CTA above the year list (the small "Add Academic Year" link
  // alone is too easy to miss right after a year-close).
  const noActiveYear = academicYears.length > 0 && !activeYear;

  // ─── "Make active" confirmation state ──────────────────────────────────
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);
  const yearToActivate = useMemo(
    () => academicYears.find(y => y.id === activatingId) ?? null,
    [academicYears, activatingId],
  );

  // ─── Close-year flow ────────────────────────────────────────────────────
  const [closingYearId, setClosingYearId] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [checklist, setChecklist] = useState<PreClosingChecklist | null>(null);
  const [checklistLoading, setChecklistLoading] = useState(false);
  const [acknowledgedSalary, setAcknowledgedSalary] = useState(false);
  const yearToClose = useMemo(
    () => academicYears.find(y => y.id === closingYearId) ?? null,
    [academicYears, closingYearId],
  );

  useEffect(() => {
    if (!closingYearId) { setChecklist(null); setAcknowledgedSalary(false); return; }
    setChecklistLoading(true);
    yearClosingService.getPreClosingChecklist(closingYearId)
      .then(setChecklist)
      .catch(err => showToast(err instanceof Error ? err.message : 'Checklist load failed', 'error'))
      .finally(() => setChecklistLoading(false));
  }, [closingYearId, showToast]);

  // ─── Correction-mode store + audit counts ───────────────────────────────
  const enabledByYear = useCorrectionStore(s => s.enabledByYear);
  const countsByYear = useCorrectionStore(s => s.countsByYear);
  const enableCorrection = useCorrectionStore(s => s.enable);
  const disableCorrection = useCorrectionStore(s => s.disable);
  const setCorrectionCount = useCorrectionStore(s => s.setCount);

  // Exclusive correction toggle — turning correction ON for year X also
  // turns OFF correction for any other year, and binds editing surfaces
  // (attendance, tests, timetable, staff attendance) to year X via
  // setCurrentEditingYear. Turning correction OFF clears the binding.
  const handleToggleCorrection = useCallback((yearId: string) => {
    const wasOn = !!useCorrectionStore.getState().enabledByYear[yearId];
    if (wasOn) {
      disableCorrection(yearId);
      if (useEditingYearStore.getState().getEditingYearId() === yearId) {
        setCurrentEditingYear(null);
      }
      return;
    }
    // Turn off any other correction year first (exclusive selection).
    const others = Object.entries(useCorrectionStore.getState().enabledByYear)
      .filter(([id, on]) => on && id !== yearId)
      .map(([id]) => id);
    others.forEach(id => disableCorrection(id));
    enableCorrection(yearId);
    setCurrentEditingYear(yearId);
  }, [disableCorrection, enableCorrection, setCurrentEditingYear]);

  // Hydrate audit counts for every closed year. Re-runs whenever the set
  // of closed-year ids changes (e.g. a year is closed, deleted, reopened),
  // not just when the total list length changes — list length stays the
  // same when an existing year transitions from open → closed.
  const closedYearKey = useMemo(
    () => academicYears.filter(y => isYearLocked(y.id)).map(y => y.id).sort().join('|'),
    [academicYears, isYearLocked],
  );
  useEffect(() => {
    if (!closedYearKey) return;
    const closedIds = closedYearKey.split('|');
    let cancelled = false;
    (async () => {
      for (const id of closedIds) {
        try {
          const n = await yearClosingService.getCorrectionCount(id);
          if (!cancelled) setCorrectionCount(id, n);
        } catch {/* swallow */}
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closedYearKey]);

  // Increment wizardKey on every open so the wizard fully remounts (fresh
  // state) instead of reusing a stale component instance.
  const openWizard = () => { setWizardKey((k: number) => k + 1); setShowWizard(true); };

  // ─── Wizard finished → refresh + close ──────────────────────────────────
  // Use try/finally so the wizard ALWAYS closes even if refreshAY() fails.
  // If no year is currently active (first-time setup or all previous years
  // were closed), auto-activate the just-created year so the setup checklist
  // step 1 marks as done immediately — without this the principal would have
  // to manually hit "Make Active" before the checklist advances.
  const handleWizardCreated = async (yearId: string) => {
    try {
      if (!activeYear && yearId) {
        try { await setActiveYear(yearId); } catch { /* non-fatal — year still created */ }
      }
      await refreshAY();
    } finally {
      setShowWizard(false);
    }
  };

  // Close wizard and refresh in background (used by the X button so that
  // academicYears is up-to-date next time the wizard opens, regardless of
  // whether the user completed creation or closed mid-flow).
  const closeWizard = () => {
    setShowWizard(false);
    void refreshAY();
  };

  // ─── Make-active confirmation ───────────────────────────────────────────
  const handleConfirmActivate = async () => {
    if (!yearToActivate) return;
    setActivating(true);
    try {
      await setActiveYear(yearToActivate.id);
      showToast(`${yearToActivate.name} is now active`);
      setActivatingId(null);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Year activate karne mein error', 'error');
    } finally {
      setActivating(false);
    }
  };

  // ─── Close confirmation ─────────────────────────────────────────────────
  const handleConfirmClose = async () => {
    if (!yearToClose) return;
    if (!checklist) { showToast('Checklist abhi load nahi hua', 'error'); return; }
    if (checklist.salaryPending.total > 0 && !acknowledgedSalary) {
      showToast('Salary pending hai — acknowledge karein ya pehle clear karein', 'error');
      return;
    }
    setClosing(true);
    try {
      await yearClosingService.closeAcademicYear(yearToClose.id);
      await refreshAY();
      showToast(`${yearToClose.name} closed (read-only). Naya year wizard se open karein.`);
      setClosingYearId(null);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Year close mein error', 'error');
    } finally {
      setClosing(false);
    }
  };

  // ─── Yearly summary rendering ───────────────────────────────────────────
  const yearList = useMemo(() => (
    <div className="space-y-3">
      {academicYears.map(year => {
        const locked = isYearLocked(year.id);
        const isActive = year.isActive;
        const correctionOn = !!enabledByYear[year.id];
        const correctionCount = countsByYear[year.id] ?? 0;
        return (
          <div
            key={year.id}
            className={`bg-white rounded-2xl border shadow-sm p-4 ${
              isActive ? 'border-emerald-300' : locked ? 'border-slate-200' : 'border-slate-100'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-black text-slate-900">{year.name}</span>
                  {isActive && (
                    <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                      Active
                    </span>
                  )}
                  {locked && (
                    <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 flex items-center gap-1">
                      <Lock size={9} /> Locked
                    </span>
                  )}
                  {locked && correctionOn && (
                    <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 flex items-center gap-1">
                      <Edit3 size={9} /> Correction Mode
                    </span>
                  )}
                </div>
                <div className="text-[10px] font-bold text-slate-400 mt-1">
                  {year.startDate} → {year.endDate} · {year.board}
                </div>
                {locked && correctionCount > 0 && (
                  <div className="text-[10px] font-bold text-amber-700 mt-1 flex items-center gap-1">
                    <History size={10} /> {correctionCount} correction{correctionCount === 1 ? '' : 's'} logged
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!isActive && !locked && (
                  <button
                    type="button"
                    onClick={() => setActivatingId(year.id)}
                    className="px-2.5 py-1.5 rounded-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-black flex items-center gap-1"
                  >
                    <Power size={10} /> Make Active
                  </button>
                )}
                {!isActive && locked && (
                  <span
                    title="Locked years cannot be made active. Unlock or open a new year."
                    className="px-2.5 py-1.5 rounded-full bg-slate-100 text-slate-400 text-[10px] font-black flex items-center gap-1 cursor-not-allowed"
                  >
                    <Power size={10} /> Make Active
                  </span>
                )}
                {!locked && (
                  <button
                    type="button"
                    onClick={() => setClosingYearId(year.id)}
                    className="px-2.5 py-1.5 rounded-full bg-rose-50 hover:bg-rose-100 text-rose-700 text-[10px] font-black flex items-center gap-1"
                  >
                    <Lock size={10} /> Close Year
                  </button>
                )}
                {locked && (
                  <button
                    type="button"
                    onClick={() => handleToggleCorrection(year.id)}
                    className={`px-2.5 py-1.5 rounded-full text-[10px] font-black flex items-center gap-1 ${
                      correctionOn
                        ? 'bg-amber-500 text-white hover:bg-amber-600'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <Edit3 size={10} /> {correctionOn ? 'Correction ON' : 'Correction OFF'}
                  </button>
                )}
              </div>
            </div>

            {/* Sticky correction-mode banner */}
            {locked && correctionOn && (
              <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 flex items-start gap-2">
                <FileWarning size={14} className="text-amber-600 mt-0.5 shrink-0" />
                <p className="text-[10px] font-bold text-amber-800 leading-relaxed">
                  Correction Mode ON — har edit pe reason poocha jayega aur audit log me
                  permanently store hoga. Sirf real corrections ke liye use karein.
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  ), [academicYears, isYearLocked, enabledByYear, countsByYear, handleToggleCorrection]);

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
              : 'Years manage karein · close karein · correction mode toggle karein'}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-24">
        {/* ─── ZERO YEARS: friendly empty state, wizard is the entry point ─ */}
        {academicYears.length === 0 ? (
          <div className="bg-white rounded-2xl border-2 border-rose-200 shadow-sm p-6 text-center space-y-4">
            <div className="w-14 h-14 mx-auto bg-rose-100 rounded-2xl flex items-center justify-center">
              <Calendar size={26} className="text-rose-600" />
            </div>
            <div>
              <p className="text-base font-black text-slate-900">Pehla Academic Year setup karein</p>
              <p className="text-[11px] font-bold text-slate-500 leading-relaxed mt-1">
                Yeh compulsory pehla step hai — wizard me ek hi baar me classes, sections, capacity aur
                streams sab set ho jayenge.
              </p>
            </div>
            <button
              onClick={() => openWizard()}
              className="w-full text-white font-black text-sm rounded-xl py-3 bg-rose-600 hover:bg-rose-700 flex items-center justify-center gap-2"
            >
              <Sparkles size={16} /> Start Setup Wizard
            </button>
          </div>
        ) : (
          <>
            {/* ─── No active year warning ──────────────────────────────────
               Shown right after a year-close when every year on file is
               locked. Without this prompt the principal lands on a page
               full of locked years and the *only* affordance to move
               forward is the small dashed "Add Academic Year" link below
               — which several principals reported missing entirely. */}
            {noActiveYear && (
              <div className="bg-white rounded-2xl border-2 border-rose-300 shadow-sm p-5 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-rose-100 rounded-2xl flex items-center justify-center shrink-0">
                    <AlertTriangle size={20} className="text-rose-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-slate-900">Koi active academic year nahi hai</p>
                    <p className="text-[11px] font-bold text-slate-500 leading-relaxed mt-1">
                      Pichla year close ho chuka hai. Sections, fees, staff aur students
                      add karne ke liye pehle naya academic year start karein.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => openWizard()}
                  className="w-full text-white font-black text-sm rounded-xl py-3 bg-rose-600 hover:bg-rose-700 flex items-center justify-center gap-2"
                >
                  <Sparkles size={16} /> Naya Academic Year Start Karein
                </button>
              </div>
            )}

            {/* ─── Add new year button ──────────────────────────────────── */}
            <button
              onClick={() => openWizard()}
              className="w-full bg-white border-2 border-dashed border-indigo-300 hover:border-indigo-500 text-indigo-600 font-black text-sm rounded-2xl py-3 flex items-center justify-center gap-2"
            >
              <Plus size={16} /> Add Academic Year
            </button>

            {/* ─── Year list ───────────────────────────────────────────── */}
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">All Years</p>
              {yearList}
            </div>

            {/* ─── Info banner about close-only flow ────────────────────── */}
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-[11px] font-bold text-blue-800 leading-relaxed flex items-start gap-2">
              <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-blue-600" />
              <div>
                <p className="font-black text-blue-900 mb-1">Close vs. Open</p>
                <p>
                  "Close Year" sirf year ko lock karta hai (read-only). Students automatically promote
                  nahi honge — Student Archive (Failed / Unassigned / TC) ka manual flow chalu rehta
                  hai. Naya year banane ke liye upar "Add Academic Year" use karein.
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ─── Close-year confirmation modal ──────────────────────────────── */}
      {yearToClose && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
          onClick={() => !closing && setClosingYearId(null)}
        >
          <div
            className="bg-white rounded-3xl w-full max-w-sm p-5 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-rose-100 rounded-full flex items-center justify-center">
                <Lock size={20} className="text-rose-600" />
              </div>
              <div>
                <h3 className="font-black text-slate-900 text-base">Close {yearToClose.name}</h3>
                <p className="text-[10px] font-bold text-slate-400">Year permanently lock ho jayega</p>
              </div>
            </div>

            {checklistLoading && (
              <div className="text-[11px] font-bold text-slate-400">Checklist load ho raha hai…</div>
            )}

            {checklist && (
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Pre-Close Checklist</p>

                {/* Always-show items */}
                <div className="space-y-1.5">
                  <ChecklistRow
                    ok={checklist.attendanceCompletion.percentage >= 90}
                    label={`Attendance: ${Math.round(checklist.attendanceCompletion.percentage)}% recorded`}
                    detail={`${checklist.attendanceCompletion.completed}/${checklist.attendanceCompletion.total} students`}
                  />
                  <ChecklistRow
                    ok={checklist.resultsCompletion.percentage >= 95}
                    label={`Results: ${Math.round(checklist.resultsCompletion.percentage)}% entered`}
                    detail={`${checklist.resultsCompletion.completed}/${checklist.resultsCompletion.total} students`}
                  />
                  <ChecklistRow
                    ok={checklist.salaryPending.total === 0}
                    label="Salary paid"
                    detail={
                      checklist.salaryPending.total === 0
                        ? 'All clear'
                        : `₹${checklist.salaryPending.total.toLocaleString()} pending · ${checklist.salaryPending.count} staff`
                    }
                  />
                  <ChecklistRow
                    ok={checklist.feesPending.total === 0}
                    label="Fees collected"
                    detail={
                      checklist.feesPending.total === 0
                        ? 'All clear'
                        : `₹${checklist.feesPending.total.toLocaleString()} outstanding · ${checklist.feesPending.count} students`
                    }
                  />
                </div>

                {checklist.warnings.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mt-2">
                    <div className="flex items-start gap-2">
                      <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                      <div className="text-[11px] font-bold text-amber-800 leading-relaxed space-y-1">
                        {checklist.warnings.map((w, i) => <p key={i}>• {w}</p>)}
                      </div>
                    </div>
                  </div>
                )}

                {checklist.salaryPending.total > 0 && (
                  <label className="flex items-start gap-2 cursor-pointer bg-rose-50 border border-rose-200 rounded-xl p-3">
                    <input
                      type="checkbox"
                      checked={acknowledgedSalary}
                      onChange={e => setAcknowledgedSalary(e.target.checked)}
                      className="w-4 h-4 mt-0.5"
                    />
                    <span className="text-[11px] font-bold text-rose-800 leading-relaxed">
                      Mujhe pata hai ki salary pending hai aur main phir bhi year close karna chahta hoon.
                    </span>
                  </label>
                )}

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] font-bold text-slate-600 leading-relaxed">
                  Close ke baad attendance / results / timetable read-only ho jayenge. Student
                  promotion alag se Student Archive flow se hota hai. Naya year banane ke liye
                  wizard use karein.
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setClosingYearId(null)}
                disabled={closing}
                className="flex-1 py-2.5 border border-slate-200 text-slate-600 font-black rounded-xl text-sm disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => { void handleConfirmClose(); }}
                disabled={
                  closing
                  || !checklist
                  || (checklist.salaryPending.total > 0 && !acknowledgedSalary)
                }
                className="flex-1 py-2.5 bg-rose-600 text-white font-black rounded-xl text-sm disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {closing && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {closing ? 'Closing…' : 'Close Year'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── New Academic Year Wizard ─────────────────────────────────────── */}
      {showWizard && (
        <AcademicYearWizard
          key={wizardKey}
          onClose={closeWizard}
          onCreated={(yearId) => { void handleWizardCreated(yearId); }}
          defaultLabel={wizardDefaults.label}
          defaultStart={wizardDefaults.start}
          defaultEnd={wizardDefaults.end}
          defaultBoard={wizardDefaults.board}
        />
      )}

      {/* ─── Make-active confirmation modal ───────────────────────────────── */}
      {yearToActivate && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
          onClick={() => !activating && setActivatingId(null)}
        >
          <div
            className="bg-white rounded-3xl w-full max-w-sm p-5 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                <Power size={20} className="text-indigo-600" />
              </div>
              <div>
                <h3 className="font-black text-slate-900 text-base">Make Active Year?</h3>
                <p className="text-[10px] font-bold text-slate-400">Active year switch ho jayega</p>
              </div>
            </div>
            <div className="text-[12px] font-bold text-slate-700 leading-relaxed space-y-2">
              <p>
                <span className="font-black text-indigo-700">{yearToActivate.name}</span> ko active year banaya jayega.
              </p>
              {activeYear && activeYear.id !== yearToActivate.id && (
                <p className="text-[11px] text-slate-500">
                  Current active year <span className="font-black">{activeYear.name}</span> deactivate ho jayega
                  (locked nahi hoga). Aap wapas switch kar sakte hain.
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setActivatingId(null)}
                disabled={activating}
                className="flex-1 py-2.5 border border-slate-200 text-slate-600 font-black rounded-xl text-sm disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => { void handleConfirmActivate(); }}
                disabled={activating}
                className="flex-1 py-2.5 bg-indigo-600 text-white font-black rounded-xl text-sm disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {activating && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {activating ? 'Switching…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Helper: single checklist row ────────────────────────────────────────────
const ChecklistRow: React.FC<{ ok: boolean; label: string; detail: string }> = ({ ok, label, detail }) => (
  <div className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-[11px] ${
    ok ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'
  }`}>
    <div className="flex items-center gap-2 min-w-0">
      {ok ? (
        <CheckCircle2 size={12} className="text-emerald-600 shrink-0" />
      ) : (
        <AlertTriangle size={12} className="text-amber-600 shrink-0" />
      )}
      <span className={`font-bold truncate ${ok ? 'text-emerald-800' : 'text-amber-800'}`}>
        {label}
      </span>
    </div>
    <span className={`font-black tabular-nums shrink-0 ${ok ? 'text-emerald-600' : 'text-amber-600'}`}>
      {detail}
    </span>
  </div>
);
