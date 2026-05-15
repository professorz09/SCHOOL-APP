import React, { useEffect, useMemo, useState } from 'react';
import { X, Loader2, CheckCircle2, AlertTriangle, Bus, IndianRupee, Calendar, Lock } from 'lucide-react';
import { studentService } from '@/modules/students/student.service';
import { feeService } from '@/modules/fees/fee.service';
import type { FeeStructureRecord } from '@/modules/fees/fees.types';
import { transportService, TransportVehicle } from '@/modules/transport/transport.service';
import { Student } from '@/modules/students/student.types';
import { useUIStore } from '@/store/uiStore';
import { useAcademicYear } from '@/shared/context/AcademicYearContext';
import { apiAcademicYear } from '@/lib/apiClient';
import { todayIST } from '@/shared/utils/date';

const CLASS_OPTIONS = [
  'Nursery','LKG','UKG',
  'Class 1','Class 2','Class 3','Class 4','Class 5',
  'Class 6','Class 7','Class 8','Class 9','Class 10',
  '11th Science','11th Commerce','11th Arts','11th Maths',
  '12th Science','12th Commerce','12th Arts','12th Maths',
];

interface SectionRow {
  id: string;
  class_name: string;
  section: string;
  stream?: string | null;
  capacity?: number | null;
}

interface Props {
  student: Student;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * Modal to assign a student to a class in the active academic year.
 * Sections are loaded from DB (not hardcoded A/B/C) so custom section
 * names created in the wizard (e.g. "Biology-Chemistry-Physics") work.
 */
export const StudentClassAssignmentModal: React.FC<Props> = ({ student, onClose, onSuccess }) => {
  const { showToast } = useUIStore();
  const { activeYear } = useAcademicYear();

  // ── form state ──
  const [className, setClassName] = useState<string>(student.className || 'Class 1');
  const [sectionId, setSectionId] = useState<string>('');
  const [sectionName, setSectionName] = useState<string>('');
  const [rollNo, setRollNo] = useState<string>(student.rollNo || '');
  const [allotmentDate, setAllotmentDate] = useState<string>(todayIST());
  const [totalFee, setTotalFee] = useState<number>(student.totalFee || 0);
  const [structures, setStructures] = useState<FeeStructureRecord[]>([]);
  const [structureId, setStructureId] = useState<string>('');
  const [isRte, setIsRte] = useState<boolean>(student.rte || false);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [discountPct, setDiscountPct] = useState<number>(0);

  // DB sections for the active year
  const [allSections, setAllSections] = useState<SectionRow[]>([]);

  // Transport (optional)
  const [transportEnabled, setTransportEnabled] = useState<boolean>(false);
  const [vehicles, setVehicles] = useState<TransportVehicle[]>([]);
  const [vehicleId, setVehicleId] = useState<string>('');
  // stopId state removed in migration 0115 — student is linked to vehicle only.
  const [transportAmount, setTransportAmount] = useState<number>(500);
  const [transportStructureId, setTransportStructureId] = useState<string>('');

  // ── async state ──
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [rollChecking, setRollChecking] = useState(false);
  const [rollAvailable, setRollAvailable] = useState<boolean | null>(null);

  // Mid-session reassignment policy. `isChange` distinguishes a fresh
  // allotment (student has no class yet) from a class swap (student is
  // already in a class for the active year). Swaps are gated:
  //   • 7-day grace from admission_date → free swap (typo fixes)
  //   • After 7 days: locked once ANY payment exists. TC-only exit.
  // Initial allotments are always allowed.
  const isChange = Boolean(student.className && student.className.trim());
  const [lockState, setLockState] = useState<'checking' | 'allowed' | 'locked'>(
    isChange ? 'checking' : 'allowed'
  );
  const daysSinceAdmission = useMemo(() => {
    if (!student.admissionDate) return Infinity;
    const ms = Date.now() - new Date(student.admissionDate).getTime();
    return Math.floor(ms / (1000 * 60 * 60 * 24));
  }, [student.admissionDate]);

  useEffect(() => {
    if (!isChange) return;
    let cancelled = false;
    (async () => {
      // Within grace window → no need to check payments.
      if (daysSinceAdmission <= 7) {
        if (!cancelled) setLockState('allowed');
        return;
      }
      // Wait for activeYear to resolve — without an AY id the check
      // would fall back to all-years and break promotion (Class 5 paid
      // → can't move to Class 6). Treat missing AY as transient.
      if (!activeYear?.id) {
        if (!cancelled) setLockState('checking');
        return;
      }
      try {
        const paid = await studentService.hasAnyPayment(student.id, activeYear.id);
        if (cancelled) return;
        setLockState(paid ? 'locked' : 'allowed');
      } catch {
        // Fail closed — if we can't verify payment state, treat as locked
        // so a network glitch doesn't accidentally permit a reshuffle.
        if (!cancelled) setLockState('locked');
      }
    })();
    return () => { cancelled = true; };
  }, [isChange, daysSinceAdmission, student.id, activeYear?.id]);

  // Load fee structures + transport vehicles + sections for active year
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [feeRows, sectionRows] = await Promise.all([
          feeService.getFeeStructures().catch(() => [] as FeeStructureRecord[]),
          activeYear
            ? apiAcademicYear.getSections(activeYear.id).catch(() => [] as SectionRow[])
            : Promise.resolve([] as SectionRow[]),
          transportService.refreshAll().catch(() => undefined),
        ]);
        if (cancelled) return;
        setStructures(feeRows);
        setAllSections(sectionRows as SectionRow[]);
        setVehicles(transportService.getVehicles());
      } finally {
        if (!cancelled) setLoadingMeta(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeYear]);

  // Sections that match the currently selected class
  const sectionsForClass = useMemo(
    () => allSections.filter(s => s.class_name === className),
    [allSections, className],
  );

  // When class changes, reset section and auto-pick first available
  useEffect(() => {
    if (sectionsForClass.length > 0) {
      setSectionId(sectionsForClass[0].id);
      setSectionName(sectionsForClass[0].section);
    } else {
      setSectionId('');
      setSectionName('');
    }
  }, [className, sectionsForClass]);

  // Auto-suggest next available roll when class/section changes
  useEffect(() => {
    if (!className || !sectionName) return;
    let cancelled = false;
    (async () => {
      try {
        const next = await studentService.getNextAvailableRoll(className, sectionName);
        if (!cancelled && (!rollNo || /^0?\d{1,2}$/.test(rollNo))) {
          setRollNo(next);
        }
      } catch { /* keep manual entry */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [className, sectionName]);

  // Debounced uniqueness check on roll change. Token-tracked so a
  // slow check for the previous roll can't land its (now stale)
  // available/taken verdict on top of the user's newer roll — that
  // produced the "type 12 (slow) → type 13 → see green tick → half a
  // second later red" flicker the audit flagged.
  const rollCheckIdRef = React.useRef(0);
  useEffect(() => {
    if (!rollNo || !className || !sectionName) {
      setRollAvailable(null);
      return;
    }
    setRollChecking(true);
    const myId = ++rollCheckIdRef.current;
    const t = setTimeout(async () => {
      try {
        const ok = await studentService.isRollAvailable(className, sectionName, rollNo, student.id);
        if (myId !== rollCheckIdRef.current) return;
        setRollAvailable(ok);
      } catch {
        if (myId !== rollCheckIdRef.current) return;
        setRollAvailable(null);
      } finally {
        if (myId === rollCheckIdRef.current) setRollChecking(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [rollNo, className, sectionName, student.id]);

  // Filter CLASS-type fee structures; prefer those matching selected class
  const matchingStructures = useMemo(() => {
    const classStructures = structures.filter(s => s.structureType !== 'VEHICLE');
    const exact = classStructures.filter(
      s => s.className === className || s.className === 'ALL_CLASSES'
    );
    return exact.length > 0 ? exact : classStructures;
  }, [structures, className]);

  const vehicleStructures = useMemo(
    () => structures.filter(s => s.structureType === 'VEHICLE'),
    [structures],
  );

  const selectedStructure = useMemo(
    () => structures.find(s => s.id === structureId) || null,
    [structures, structureId],
  );
  const selectedTransportStructure = useMemo(
    () => vehicleStructures.find(s => s.id === transportStructureId) || null,
    [vehicleStructures, transportStructureId],
  );
  const selectedVehicle = useMemo(
    () => vehicles.find(v => v.id === vehicleId) || null,
    [vehicles, vehicleId],
  );

  // Auto-populate total fee from chosen structure
  useEffect(() => {
    if (!selectedStructure) return;
    const monthlyTotal = selectedStructure.feeHeads
      .filter(h => h.frequency === 'MONTHLY')
      .reduce((sum, h) => sum + h.amount, 0);
    const annualTotal = selectedStructure.feeHeads
      .filter(h => h.frequency === 'ANNUAL' || h.frequency === 'ONE_TIME')
      .reduce((sum, h) => sum + h.amount, 0);
    const months = selectedStructure.monthlyDueDates.length || 12;
    const grossYear = monthlyTotal * months + annualTotal;
    // Cap the effective discount at grossYear so a typo of 999999 doesn't
    // silently zero the fee. The clamp + grossYear floor of 0 made the bug
    // invisible — now we still floor at 0 but warn elsewhere on submit.
    const requestedDiscount = Math.max(
      discountAmount * months,
      Math.floor(grossYear * (discountPct / 100)),
    );
    const discount = Math.min(Math.max(0, requestedDiscount), grossYear);
    setTotalFee(Math.max(0, grossYear - discount));
  }, [selectedStructure, discountAmount, discountPct]);

  // Auto-fill transport amount from structure
  useEffect(() => {
    if (!selectedTransportStructure) return;
    const monthly = selectedTransportStructure.feeHeads
      .filter(h => h.frequency === 'MONTHLY')
      .reduce((sum, h) => sum + Number(h.amount || 0), 0);
    if (monthly > 0) setTransportAmount(monthly);
  }, [selectedTransportStructure]);

  // Reset structure when class changes so stale pick doesn't linger
  useEffect(() => {
    setStructureId('');
  }, [className]);

  const submit = async () => {
    if (lockState === 'locked') {
      showToast('Class change blocked — TC route use karein', 'error');
      return;
    }
    if (!rollNo.trim()) {
      showToast('Roll number required', 'error');
      return;
    }
    if (rollAvailable === false) {
      showToast(`Roll ${rollNo} is taken in ${className}-${sectionName}`, 'error');
      return;
    }
    if (!selectedStructure) {
      showToast('Fee structure choose karna zaroori hai', 'error');
      return;
    }
    if (transportEnabled && !vehicleId) {
      showToast('Vehicle aur stop choose karein ya transport disable karein', 'error');
      return;
    }
    if (transportEnabled && !selectedTransportStructure) {
      showToast('Transport fee structure bhi zaroori hai', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const summary = await studentService.assignStudentToClass({
        studentId: student.id,
        className,
        section: sectionName || sectionId,
        rollNo: rollNo.trim(),
        totalFee,
        feeStructure: {
          heads: selectedStructure.feeHeads.map(h => ({
            name: h.name, amount: h.amount, frequency: h.frequency, description: h.description,
          })),
          monthlyDueDates: selectedStructure.monthlyDueDates,
          isRte,
          discountAmount,
          discountPct,
        },
        transport: transportEnabled && selectedTransportStructure ? {
          vehicleId, monthlyAmount: transportAmount,
          feeStructureId: selectedTransportStructure.id,
        } : undefined,
      });
      const scheduleLine = summary && summary.installmentCount > 0
        ? ` · ${summary.installmentCount} installment${summary.installmentCount === 1 ? '' : 's'} totalling ₹${summary.totalAmount.toLocaleString('en-IN')}`
        : '';
      showToast(`${student.name} assigned to ${className}-${sectionName} (Roll ${rollNo})${scheduleLine}`);
      onSuccess();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Assignment failed';
      showToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg lg:max-w-3xl sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
          <div>
            <h3 className="text-base font-black text-slate-900">Class Allotment</h3>
            <p className="text-[11px] font-bold text-slate-500 mt-0.5">
              {student.name} · {student.admissionNo}
            </p>
          </div>
          <button onClick={onClose} className="p-2 bg-slate-100 rounded-xl active:scale-95">
            <X size={18} />
          </button>
        </div>

        {/* Mid-session reassignment guard. Shown only for class CHANGES
            (not initial allotments). Renders a full-pane lock state when
            the student has any paid installment and grace window passed. */}
        {isChange && lockState === 'checking' && (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="flex items-center gap-2 text-slate-500">
              <Loader2 size={18} className="animate-spin" />
              <span className="text-sm font-bold">Payment status check ho raha hai…</span>
            </div>
          </div>
        )}
        {isChange && lockState === 'locked' && (
          <div className="flex-1 overflow-y-auto p-5">
            <div className="bg-rose-50 border-2 border-rose-200 rounded-2xl p-5 flex flex-col items-center text-center gap-3">
              <div className="w-14 h-14 rounded-full bg-rose-100 flex items-center justify-center">
                <Lock size={26} className="text-rose-600" />
              </div>
              <h4 className="text-base font-black text-rose-700">Class change locked</h4>
              <p className="text-xs font-bold text-rose-600 leading-relaxed max-w-sm">
                Is student ke liye 7-din grace window khatam ho chuki hai aur
                fees bhi paid ho chuki hain. Class change ab block hai.
              </p>
              <div className="bg-white border border-rose-200 rounded-xl px-3 py-2 text-left w-full max-w-sm space-y-1">
                <p className="text-[11px] font-black text-slate-600">
                  Aage badhne ka tarika:
                </p>
                <p className="text-[11px] font-bold text-slate-600 leading-snug">
                  • TC issue karke student withdraw karein
                  <br />• Naye class me fresh admission karein
                  <br />• Paid history dono jagah linked rahegi
                </p>
              </div>
              <p className="text-[10px] font-bold text-slate-400">
                Admission se {Number.isFinite(daysSinceAdmission) ? daysSinceAdmission : '—'} din ho gaye hain
              </p>
            </div>
          </div>
        )}
        {(!isChange || lockState === 'allowed') &&
        /* Body — vertical stack of labelled cards (banners → Class&Roll
            → Fees → Transport). Earlier the 2-col grid scattered fee
            fields across 4 cells and the principal had to mentally
            stitch the money decision back together. */
        (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {isChange && daysSinceAdmission <= 7 && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[10px] font-black text-amber-700 leading-snug">
                Grace window — {7 - daysSinceAdmission} din baki. Iske baad fee paid
                hone par class change lock ho jayega; TC route hi rahega.
              </p>
            </div>
          )}

          {/* Active year badge */}
          {activeYear && (
            <div className="flex items-center gap-2 bg-indigo-50 rounded-xl px-3 py-2">
              <Calendar size={12} className="text-indigo-600" />
              <span className="text-[10px] font-black text-indigo-700">
                Academic Year: {activeYear.name}
              </span>
            </div>
          )}

          {/* ── CLASS & ROLL CARD ────────────────────────────────────
              Identity-related fields grouped under one labelled card to
              mirror the Fees card below — visually balanced. Inside,
              Class+Section live on row 1, Roll+Date on row 2. */}
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm">
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-700">
              Class & Roll
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {/* Class */}
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500">Class *</label>
                <select
                  value={className}
                  onChange={e => setClassName(e.target.value)}
                  className="w-full mt-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold">
                  {CLASS_OPTIONS.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>

              {/* Section — from DB */}
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500">Section *</label>
                {loadingMeta ? (
                  <div className="mt-1 flex items-center gap-2 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                    <Loader2 size={14} className="animate-spin text-slate-400" />
                    <span className="text-xs font-bold text-slate-400">Sections load ho rahe hain…</span>
                  </div>
                ) : sectionsForClass.length === 0 ? (
                  <div className="mt-1 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl">
                    <p className="text-[11px] font-bold text-amber-700">
                      Is class ke liye koi section nahi mila. Academic Year Wizard se sections add karein.
                    </p>
                  </div>
                ) : (
                  <div className="mt-1 grid grid-cols-3 gap-2">
                    {sectionsForClass.map(sec => (
                      <button
                        key={sec.id}
                        type="button"
                        onClick={() => { setSectionId(sec.id); setSectionName(sec.section); }}
                        className={`py-2.5 px-2 rounded-xl text-xs font-black border transition-all text-center leading-tight ${
                          sectionId === sec.id
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-slate-50 text-slate-600 border-slate-200'
                        }`}>
                        {sec.section}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500">Roll Number</label>
                <div className="relative mt-1">
                  <input
                    value={rollNo}
                    onChange={e => setRollNo(e.target.value.replace(/[^\d]/g, '').slice(0, 3))}
                    inputMode="numeric"
                    placeholder="01"
                    className={`w-full px-3 py-2.5 bg-slate-50 border rounded-xl text-sm font-bold pr-10
                      ${rollAvailable === false ? 'border-rose-400'
                      : rollAvailable === true ? 'border-emerald-400' : 'border-slate-200'}`}
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {rollChecking
                      ? <Loader2 size={16} className="animate-spin text-slate-400" />
                      : rollAvailable === true ? <CheckCircle2 size={16} className="text-emerald-500" />
                      : rollAvailable === false ? <AlertTriangle size={16} className="text-rose-500" />
                      : null}
                  </div>
                </div>
                {rollAvailable === false && (
                  <p className="text-[10px] font-bold text-rose-600 mt-1">
                    Roll {rollNo} already in use in {className}.
                  </p>
                )}
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500">Allotment Date</label>
                <input
                  type="date"
                  value={allotmentDate}
                  onChange={e => setAllotmentDate(e.target.value)}
                  className="w-full mt-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold"
                />
              </div>
            </div>
          </div>

          {/* ── FEES CARD ─────────────────────────────────────────────
              Earlier the fee-structure dropdown, RTE checkbox, discount
              inputs and annual total were 4 separate sibling blocks
              landing in a 2-col grid — visually chaotic and the most
              important field (fee structure) felt buried. Now one
              labelled card holds the entire money decision in flow:
              structure → exemption → discount → computed total. */}
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm">
            <div className="flex items-center gap-2">
              <IndianRupee size={14} className="text-indigo-600" />
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-700">Fees</p>
            </div>

            {/* 1. Fee structure dropdown — primary decision */}
            <div>
              <label className="text-[10px] font-black uppercase text-slate-500">Fee Structure *</label>
              {matchingStructures.length === 0 && !loadingMeta ? (
                <div className="mt-1 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl">
                  <p className="text-[11px] font-bold text-amber-700">
                    Koi fee structure nahi mila. Settings → Fees se banayein.
                  </p>
                </div>
              ) : (
                <select
                  value={structureId}
                  onChange={e => setStructureId(e.target.value)}
                  disabled={loadingMeta}
                  className={`w-full mt-1 px-3 py-2.5 border rounded-xl text-sm font-bold ${
                    !structureId
                      ? 'border-rose-300 bg-rose-50 focus:border-rose-500'
                      : 'border-slate-200 bg-slate-50'
                  }`}>
                  <option value="">— Fee schedule choose karein (zaroori hai) —</option>
                  {matchingStructures.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {s.className} · ₹{
                        s.feeHeads.reduce((sum, h) => {
                          const times = h.frequency === 'MONTHLY' ? (s.monthlyDueDates.length || 12) : 1;
                          return sum + h.amount * times;
                        }, 0).toLocaleString('en-IN')
                      }/yr
                    </option>
                  ))}
                </select>
              )}
              {selectedStructure && (
                <p className="text-[10px] font-bold text-slate-500 mt-1">
                  {selectedStructure.feeHeads.length} heads · {selectedStructure.billingCycle.toLowerCase()} · {selectedStructure.monthlyDueDates.length} installments
                </p>
              )}
            </div>

            {/* 2. RTE exemption — overrides discount/total entirely */}
            <label className="flex items-center gap-2 px-3 py-2.5 bg-emerald-50 border border-emerald-100 rounded-xl cursor-pointer">
              <input
                type="checkbox"
                checked={isRte}
                onChange={e => setIsRte(e.target.checked)}
                className="w-4 h-4 accent-emerald-600"
              />
              <span className="text-xs font-black text-emerald-700">RTE student (free admission)</span>
            </label>

            {/* 3. Discount — only when not RTE */}
            {!isRte && (
              <div>
                <p className="text-[9px] font-black uppercase text-slate-500 mb-1.5">Discount (optional)</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">₹</span>
                    <input
                      type="number"
                      min={0}
                      value={discountAmount || ''}
                      onChange={e => setDiscountAmount(Math.max(0, parseInt(e.target.value) || 0))}
                      placeholder="Amount"
                      className="w-full pl-7 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold"
                    />
                  </div>
                  <div className="relative">
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">%</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={discountPct || ''}
                      onChange={e => setDiscountPct(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                      placeholder="Percent"
                      className="w-full pl-3 pr-7 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold"
                    />
                  </div>
                </div>
                <p className="text-[9px] font-bold text-slate-400 mt-1">
                  Higher value applies (₹ vs %)
                </p>
              </div>
            )}

            {/* 4. Computed annual total — pinned at the bottom of the card */}
            <div className="flex items-center justify-between px-3 py-2.5 bg-indigo-50 border border-indigo-100 rounded-xl">
              <span className="text-[10px] font-black uppercase text-indigo-600">
                Annual fee {!isRte && (discountAmount || discountPct) ? '(discount ke baad)' : ''}
              </span>
              <span className="text-base font-black text-indigo-900 tabular-nums">
                {isRte ? 'FREE' : `₹${totalFee.toLocaleString('en-IN')}`}
              </span>
            </div>
          </div>

          {/* Transport (optional) — full-width since the inner grid is
              already 2-column at desktop sizes. */}
          <div className="border border-slate-200 rounded-xl p-3 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={transportEnabled}
                onChange={e => setTransportEnabled(e.target.checked)}
                className="w-4 h-4 accent-indigo-600"
              />
              <Bus size={14} className="text-slate-600" />
              <span className="text-xs font-black text-slate-700">Transport add karein</span>
            </label>
            {transportEnabled && (
              <>
                {/* Student is linked to a VEHICLE only. The driver manages
                    the route's stops independently (migration 0115 — there
                    is no longer a per-student boarding stop column). */}
                <select
                  value={vehicleId}
                  onChange={e => setVehicleId(e.target.value)}
                  className="w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold"
                >
                  <option value="">— Vehicle —</option>
                  {vehicles.map(v => (
                    <option key={v.id} value={v.id}>{v.vehicleNo} ({v.routeName || 'Route'})</option>
                  ))}
                </select>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500">Transport Fee Structure *</label>
                  <select
                    value={transportStructureId}
                    onChange={e => setTransportStructureId(e.target.value)}
                    disabled={loadingMeta}
                    className={`w-full mt-1 px-3 py-2 bg-slate-50 border rounded-lg text-xs font-bold
                      ${transportEnabled && !selectedTransportStructure ? 'border-rose-300' : 'border-slate-200'}`}
                  >
                    <option value="">— Transport bill schedule choose karein —</option>
                    {vehicleStructures.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  {vehicleStructures.length === 0 && !loadingMeta && (
                    <p className="text-[10px] font-bold text-amber-600 mt-1">
                      Koi vehicle fee structure nahi hai. Settings → Fees → Vehicle type se banayein.
                    </p>
                  )}
                  {selectedTransportStructure && (
                    <p className="text-[10px] font-bold text-slate-500 mt-1">
                      {selectedTransportStructure.feeHeads.length} heads · {selectedTransportStructure.monthlyDueDates.length} installments
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500">Monthly Amount (₹)</label>
                  <input
                    type="number"
                    min={0}
                    value={transportAmount}
                    onChange={e => setTransportAmount(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold"
                  />
                </div>
              </>
            )}
          </div>
        </div>
        )}

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-100 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-slate-100 text-slate-700 font-black text-xs rounded-xl active:scale-95"
          >
            {isChange && lockState === 'locked' ? 'Close' : 'Cancel'}
          </button>
          {!(isChange && lockState === 'locked') && (
            <button
              onClick={submit}
              disabled={
                submitting
                || lockState === 'checking'
                || rollAvailable === false
                || !rollNo.trim()
                || !sectionId
                || !selectedStructure
                || (transportEnabled && (!vehicleId || !selectedTransportStructure))
              }
              className="flex-1 px-4 py-3 bg-indigo-600 text-white font-black text-xs rounded-xl active:scale-95 disabled:opacity-60 flex items-center justify-center gap-1.5"
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              {submitting ? 'Allot ho raha hai…' : isChange ? 'Class Change Karein' : 'Class Allot Karein'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
