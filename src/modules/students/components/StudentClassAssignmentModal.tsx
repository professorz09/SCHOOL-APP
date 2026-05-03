import React, { useEffect, useMemo, useState } from 'react';
import { X, Loader2, CheckCircle2, AlertTriangle, Bus, IndianRupee, Calendar } from 'lucide-react';
import { studentService } from '@/modules/students/student.service';
import { feeService } from '@/modules/fees/fee.service';
import type { FeeStructureRecord } from '@/modules/fees/fees.types';
import { transportService, TransportVehicle } from '@/modules/transport/transport.service';
import { Student } from '@/modules/students/student.types';
import { useUIStore } from '@/store/uiStore';
import { useAcademicYear } from '@/shared/context/AcademicYearContext';
import { apiAcademicYear } from '@/lib/apiClient';

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
  const [allotmentDate, setAllotmentDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
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
  const [stopId, setStopId] = useState<string>('');
  const [transportAmount, setTransportAmount] = useState<number>(500);
  const [transportStructureId, setTransportStructureId] = useState<string>('');

  // ── async state ──
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [rollChecking, setRollChecking] = useState(false);
  const [rollAvailable, setRollAvailable] = useState<boolean | null>(null);

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

  // Debounced uniqueness check on roll change
  useEffect(() => {
    if (!rollNo || !className || !sectionName) {
      setRollAvailable(null);
      return;
    }
    setRollChecking(true);
    const t = setTimeout(async () => {
      try {
        const ok = await studentService.isRollAvailable(className, sectionName, rollNo, student.id);
        setRollAvailable(ok);
      } catch {
        setRollAvailable(null);
      } finally {
        setRollChecking(false);
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
    const discount = Math.max(
      discountAmount * months,
      Math.floor(grossYear * (discountPct / 100)),
    );
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
    if (transportEnabled && (!vehicleId || !stopId)) {
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
          vehicleId, stopId, monthlyAmount: transportAmount,
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
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[92vh] flex flex-col">
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* Active year badge */}
          {activeYear && (
            <div className="flex items-center gap-2 bg-indigo-50 rounded-xl px-3 py-2">
              <Calendar size={12} className="text-indigo-600" />
              <span className="text-[10px] font-black text-indigo-700">
                Academic Year: {activeYear.name}
              </span>
            </div>
          )}

          {/* Class */}
          <div>
            <label className="text-[10px] font-black uppercase text-slate-500">Class *</label>
            <select
              value={className}
              onChange={e => setClassName(e.target.value)}
              className="w-full mt-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold"
            >
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
                    }`}
                  >
                    {sec.section}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Roll + Allotment Date */}
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

          {/* Fee structure picker — filtered by class */}
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
                className="w-full mt-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold"
              >
                <option value="">— Fee schedule choose karein (zaroori hai) —</option>
                {matchingStructures.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.className} · ₹{
                      s.feeHeads.reduce((sum, h) => {
                        const times = h.frequency === 'MONTHLY' ? (s.monthlyDueDates.length || 12)
                          : h.frequency === 'QUARTERLY' ? 4
                          : h.frequency === 'HALF_YEARLY' ? 2 : 1;
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

          {/* RTE + discount */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 px-3 py-2.5 bg-emerald-50 rounded-xl cursor-pointer">
              <input
                type="checkbox"
                checked={isRte}
                onChange={e => setIsRte(e.target.checked)}
                className="w-4 h-4 accent-emerald-600"
              />
              <span className="text-xs font-black text-emerald-700">RTE student (free admission)</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[9px] font-black uppercase text-slate-500">Discount Amount (₹)</label>
                <input
                  type="number"
                  min={0}
                  value={discountAmount}
                  onChange={e => setDiscountAmount(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full mt-0.5 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold"
                />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-slate-500">Discount (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={discountPct}
                  onChange={e => setDiscountPct(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                  className="w-full mt-0.5 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold"
                />
              </div>
            </div>
          </div>

          {/* Computed annual total */}
          <div className="flex items-center justify-between px-3 py-2.5 bg-indigo-50 rounded-xl">
            <span className="text-xs font-black uppercase text-indigo-600 flex items-center gap-1">
              <IndianRupee size={12} /> Annual Fee (discount ke baad)
            </span>
            <span className="text-base font-black text-indigo-900">
              ₹{totalFee.toLocaleString('en-IN')}
            </span>
          </div>

          {/* Transport (optional) */}
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
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={vehicleId}
                    onChange={e => { setVehicleId(e.target.value); setStopId(''); }}
                    className="w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold"
                  >
                    <option value="">— Vehicle —</option>
                    {vehicles.map(v => (
                      <option key={v.id} value={v.id}>{v.vehicleNo} ({v.routeName || 'Route'})</option>
                    ))}
                  </select>
                  <select
                    value={stopId}
                    onChange={e => setStopId(e.target.value)}
                    disabled={!selectedVehicle}
                    className="w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold disabled:opacity-50"
                  >
                    <option value="">— Stop —</option>
                    {selectedVehicle?.stops.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
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

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-100 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-slate-100 text-slate-700 font-black text-xs rounded-xl active:scale-95"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={
              submitting
              || rollAvailable === false
              || !rollNo.trim()
              || !sectionId
              || !selectedStructure
              || (transportEnabled && (!vehicleId || !stopId || !selectedTransportStructure))
            }
            className="flex-1 px-4 py-3 bg-indigo-600 text-white font-black text-xs rounded-xl active:scale-95 disabled:opacity-60 flex items-center justify-center gap-1.5"
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            {submitting ? 'Allot ho raha hai…' : 'Class Allot Karein'}
          </button>
        </div>
      </div>
    </div>
  );
};
