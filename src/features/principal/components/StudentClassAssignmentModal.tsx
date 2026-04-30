import React, { useEffect, useMemo, useState } from 'react';
import { X, Loader2, CheckCircle2, AlertTriangle, Bus, IndianRupee } from 'lucide-react';
import { studentService } from '../../../services/student.service';
import { principalService, FeeStructureRecord } from '../../../services/principal.service';
import { transportService, TransportVehicle } from '../../../services/transport.service';
import { Student } from '../../../types/principal.types';
import { useUIStore } from '../../../store/uiStore';

interface Props {
  student: Student;
  onClose: () => void;
  /** Called after a successful assignment so the parent list can refresh. */
  onSuccess: () => void;
}

const CLASS_OPTIONS = [
  'Pre-KG','LKG','UKG',
  'Class 1','Class 2','Class 3','Class 4','Class 5','Class 6','Class 7',
  'Class 8','Class 9','Class 10','Class 11','Class 12',
];
const SECTION_OPTIONS = ['A','B','C','D','E','F'];

/**
 * Modal launched from the Unassigned / Inactive / TC bucket to put a
 * student into a class, generate their fee schedule, and optionally
 * assign them to a transport route — all in one transaction.
 *
 * The roll number is auto-suggested via the SECURITY DEFINER RPC
 * `next_available_roll` and re-checked with `roll_available` on every
 * keystroke so two clerks can't double-book a roll.
 */
export const StudentClassAssignmentModal: React.FC<Props> = ({ student, onClose, onSuccess }) => {
  const { showToast } = useUIStore();

  // ── form state ──
  const [className, setClassName] = useState<string>(student.className || 'Class 1');
  const [section, setSection] = useState<string>(student.section || 'A');
  const [rollNo, setRollNo] = useState<string>(student.rollNo || '');
  const [totalFee, setTotalFee] = useState<number>(student.totalFee || 0);
  const [structures, setStructures] = useState<FeeStructureRecord[]>([]);
  const [structureId, setStructureId] = useState<string>('');
  const [isRte, setIsRte] = useState<boolean>(student.rte || false);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [discountPct, setDiscountPct] = useState<number>(0);

  // Transport (optional)
  const [transportEnabled, setTransportEnabled] = useState<boolean>(false);
  const [vehicles, setVehicles] = useState<TransportVehicle[]>([]);
  const [vehicleId, setVehicleId] = useState<string>('');
  const [stopId, setStopId] = useState<string>('');
  const [transportAmount, setTransportAmount] = useState<number>(500);

  // ── async state ──
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [rollChecking, setRollChecking] = useState(false);
  const [rollAvailable, setRollAvailable] = useState<boolean | null>(null);

  // Initial load of fee structures + transport vehicles + auto-suggest roll.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [feeRows] = await Promise.all([
          principalService.getFeeStructures().catch(() => []),
          transportService.refreshAll().catch(() => undefined),
        ]);
        if (cancelled) return;
        setStructures(feeRows);
        setVehicles(transportService.getVehicles());
      } finally {
        if (!cancelled) setLoadingMeta(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Auto-suggest the next available roll whenever class/section changes
  // (only when the user hasn't typed something custom yet).
  useEffect(() => {
    if (!className || !section) return;
    let cancelled = false;
    (async () => {
      try {
        const next = await studentService.getNextAvailableRoll(className, section);
        if (!cancelled && (!rollNo || /^0?\d{1,2}$/.test(rollNo))) {
          setRollNo(next);
        }
      } catch { /* keep manual entry */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [className, section]);

  // Debounced uniqueness check on roll change.
  useEffect(() => {
    if (!rollNo || !className || !section) {
      setRollAvailable(null);
      return;
    }
    setRollChecking(true);
    const t = setTimeout(async () => {
      try {
        const ok = await studentService.isRollAvailable(className, section, rollNo, student.id);
        setRollAvailable(ok);
      } catch {
        setRollAvailable(null);
      } finally {
        setRollChecking(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [rollNo, className, section, student.id]);

  // Auto-populate default total fee from chosen structure (sum of head amounts).
  const selectedStructure = useMemo(
    () => structures.find(s => s.id === structureId) || null,
    [structures, structureId],
  );
  useEffect(() => {
    if (!selectedStructure) return;
    const monthlyTotal = selectedStructure.feeHeads
      .filter(h => h.frequency === 'MONTHLY')
      .reduce((sum, h) => sum + h.amount, 0);
    const annualTotal = selectedStructure.feeHeads
      .filter(h => h.frequency === 'ANNUAL' || h.frequency === 'ONE_TIME')
      .reduce((sum, h) => sum + h.amount, 0);
    const grossPerInst = monthlyTotal;
    const months = selectedStructure.monthlyDueDates.length || 12;
    const grossYear = grossPerInst * months + annualTotal;
    const discount = Math.max(
      discountAmount * months,
      Math.floor(grossYear * (discountPct / 100)),
    );
    setTotalFee(Math.max(0, grossYear - discount));
  }, [selectedStructure, discountAmount, discountPct]);

  // Filter fee structures to those matching the current class first
  // (clerks usually want a class-specific structure), with a fallback
  // to "any" when none match.
  const matchingStructures = useMemo(() => {
    const classStructures = structures.filter(s => (s as any).structureType !== 'VEHICLE');
    return classStructures;
  }, [structures]);

  const selectedVehicle = useMemo(
    () => vehicles.find(v => v.id === vehicleId) || null,
    [vehicles, vehicleId],
  );

  const submit = async () => {
    if (!rollNo.trim()) {
      showToast('Roll number required', 'error');
      return;
    }
    if (rollAvailable === false) {
      showToast(`Roll ${rollNo} is taken in ${className}-${section}`, 'error');
      return;
    }
    if (!selectedStructure) {
      showToast('Pick a fee structure — every assigned student needs a fee schedule', 'error');
      return;
    }
    if (transportEnabled && (!vehicleId || !stopId)) {
      showToast('Choose a vehicle and stop or disable transport', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const summary = await studentService.assignStudentToClass({
        studentId: student.id,
        className,
        section,
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
        transport: transportEnabled ? {
          vehicleId, stopId, monthlyAmount: transportAmount,
        } : undefined,
      });
      // Surface the freshly-generated schedule details in the success toast
      // ("12 installments totalling ₹61,000") so the principal immediately
      // knows what was created.
      const scheduleLine = summary && summary.installmentCount > 0
        ? ` · ${summary.installmentCount} installment${summary.installmentCount === 1 ? '' : 's'} totalling ₹${summary.totalAmount.toLocaleString('en-IN')}`
        : '';
      showToast(`${student.name} assigned to ${className}-${section} (Roll ${rollNo})${scheduleLine}`);
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
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
          <div>
            <h3 className="text-base font-black text-slate-900">Assign to Class</h3>
            <p className="text-[11px] font-bold text-slate-500 mt-0.5">
              {student.name} · {student.admissionNo}
            </p>
          </div>
          <button onClick={onClose} className="p-2 bg-slate-100 rounded-xl active:scale-95">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Class / Section */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-black uppercase text-slate-500">Class</label>
              <select value={className} onChange={e => setClassName(e.target.value)}
                className="w-full mt-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold">
                {CLASS_OPTIONS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-slate-500">Section</label>
              <select value={section} onChange={e => setSection(e.target.value)}
                className="w-full mt-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold">
                {SECTION_OPTIONS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Roll number with realtime check */}
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
                Roll {rollNo} already assigned in {className}-{section}.
              </p>
            )}
          </div>

          {/* Fee structure picker */}
          <div>
            <label className="text-[10px] font-black uppercase text-slate-500">Fee Structure</label>
            <select
              value={structureId}
              onChange={e => setStructureId(e.target.value)}
              disabled={loadingMeta}
              className="w-full mt-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold">
              <option value="">— Choose a fee schedule (required) —</option>
              {matchingStructures.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.className})</option>
              ))}
            </select>
            {selectedStructure && (
              <p className="text-[10px] font-bold text-slate-500 mt-1">
                {selectedStructure.feeHeads.length} heads · {selectedStructure.monthlyDueDates.length} monthly installments
              </p>
            )}
          </div>

          {/* RTE + discount */}
          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 px-3 py-2.5 bg-emerald-50 rounded-xl cursor-pointer">
              <input type="checkbox" checked={isRte} onChange={e => setIsRte(e.target.checked)}
                className="w-4 h-4 accent-emerald-600" />
              <span className="text-xs font-black text-emerald-700">RTE student</span>
            </label>
            <div className="grid grid-cols-2 gap-1">
              <div>
                <label className="text-[9px] font-black uppercase text-slate-500">Disc ₹</label>
                <input type="number" min={0} value={discountAmount}
                  onChange={e => setDiscountAmount(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full mt-0.5 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold" />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-slate-500">Disc %</label>
                <input type="number" min={0} max={100} value={discountPct}
                  onChange={e => setDiscountPct(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                  className="w-full mt-0.5 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold" />
              </div>
            </div>
          </div>

          {/* Computed total */}
          <div className="flex items-center justify-between px-3 py-2.5 bg-indigo-50 rounded-xl">
            <span className="text-xs font-black uppercase text-indigo-600 flex items-center gap-1">
              <IndianRupee size={12} /> Annual fee (after discount)
            </span>
            <span className="text-base font-black text-indigo-900">
              ₹{totalFee.toLocaleString('en-IN')}
            </span>
          </div>

          {/* Transport (optional) */}
          <div className="border border-slate-200 rounded-xl p-3 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={transportEnabled}
                onChange={e => setTransportEnabled(e.target.checked)}
                className="w-4 h-4 accent-indigo-600" />
              <Bus size={14} className="text-slate-600" />
              <span className="text-xs font-black text-slate-700">Add transport</span>
            </label>
            {transportEnabled && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <select value={vehicleId} onChange={e => { setVehicleId(e.target.value); setStopId(''); }}
                    className="w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold">
                    <option value="">— Vehicle —</option>
                    {vehicles.map(v => (
                      <option key={v.id} value={v.id}>{v.vehicleNo} ({v.routeName || 'Route'})</option>
                    ))}
                  </select>
                  <select value={stopId} onChange={e => setStopId(e.target.value)}
                    disabled={!selectedVehicle}
                    className="w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold disabled:opacity-50">
                    <option value="">— Stop —</option>
                    {selectedVehicle?.stops.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500">Monthly amount (₹)</label>
                  <input type="number" min={0} value={transportAmount}
                    onChange={e => setTransportAmount(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold" />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-100 flex gap-2">
          <button onClick={onClose}
            className="flex-1 px-4 py-3 bg-slate-100 text-slate-700 font-black text-xs rounded-xl active:scale-95">
            Cancel
          </button>
          <button onClick={submit}
            disabled={submitting || rollAvailable === false}
            className="flex-1 px-4 py-3 bg-indigo-600 text-white font-black text-xs rounded-xl active:scale-95 disabled:opacity-60 flex items-center justify-center gap-1.5">
            {submitting && <Loader2 size={14} className="animate-spin" />}
            {submitting ? 'Assigning…' : 'Assign'}
          </button>
        </div>
      </div>
    </div>
  );
};
