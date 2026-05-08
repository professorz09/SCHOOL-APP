import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft, IndianRupee, CheckCircle2, AlertTriangle, Clock, X,
  ShieldCheck, Search, Printer, Banknote, Smartphone, CreditCard,
  Building2, FileCheck, ChevronRight, Receipt, TrendingDown, Users, Filter,
  RefreshCw, Download, ChevronDown, Calendar, RotateCcw, AlertCircle,
} from 'lucide-react';
import { feeService, FeeInstallment, FeeStatus, FeeType, PaymentRecord, GovernmentPaymentRecord } from '@/modules/fees/fee.service';
import { exportCsv } from '@/shared/utils/csv';
import { studentService } from '@/modules/students/student.service';
import type { FeeStructureRecord } from '@/modules/fees/fees.types';
import { useUIStore } from '@/store/uiStore';
import { useEditorModeStore } from '@/store/editorModeStore';
import { useAcademicYear } from '@/shared/context/AcademicYearContext';
import { FeePaymentSubmissionsQueue } from '@/modules/fees/components/FeePaymentSubmissionsQueue';
import { PreviousYearDues } from '@/modules/fees/components/PreviousYearDues';

type YearGroup = { academicYearId: string; yearLabel: string; isActive: boolean; installments: FeeInstallment[] };

type PaymentMethod = 'CASH' | 'UPI' | 'NET_BANKING' | 'CHEQUE' | 'ONLINE';
type ListTab = 'ALL' | 'DUE' | 'CLEARED' | 'PENDING';

const METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: 'Cash', UPI: 'UPI', NET_BANKING: 'Net Banking', CHEQUE: 'Cheque', ONLINE: 'Online',
};
const METHOD_ICON: Record<PaymentMethod, React.ReactNode> = {
  CASH:        <Banknote size={14} />,
  UPI:         <Smartphone size={14} />,
  NET_BANKING: <Building2 size={14} />,
  CHEQUE:      <FileCheck size={14} />,
  ONLINE:      <CreditCard size={14} />,
};

interface StudentFeeProfile {
  studentId: string;
  name: string;
  className: string;
  admissionNo: string;
  installments: FeeInstallment[];
  isRte: boolean;
}

// Neutral fallback used when the DB returns a status the UI doesn't yet
// know about (defensive — prevents the whole list from crashing on an
// `undefined` lookup if a new status enum value lands before the UI ships).
const STATUS_COLOR_FALLBACK = 'bg-slate-100 text-slate-500 border-slate-200';
const STATUS_BAR_FALLBACK = 'bg-slate-300';
// Status palette:
//   UPCOMING → slate (info), DUE → rose (action), PAID → emerald,
//   PARTIAL  → amber (on-track partial), PARTIAL_DUE → rose (overdue partial)
// UNPAID / OVERDUE legacy values mirror UPCOMING / DUE.
const STATUS_COLOR: Record<FeeStatus, string> = {
  PAID:        'bg-emerald-50 text-emerald-700 border-emerald-200',
  PARTIAL:     'bg-amber-50 text-amber-700 border-amber-200',
  PARTIAL_DUE: 'bg-rose-50 text-rose-700 border-rose-200',
  UPCOMING:    'bg-slate-50 text-slate-600 border-slate-200',
  DUE:         'bg-rose-50 text-rose-700 border-rose-200',
  UNPAID:      'bg-slate-50 text-slate-600 border-slate-200',
  OVERDUE:     'bg-rose-50 text-rose-700 border-rose-200',
  WAIVED:      'bg-slate-100 text-slate-500 border-slate-200',
  WRITTEN_OFF: 'bg-slate-100 text-slate-500 border-slate-200',
  CANCELLED:   'bg-slate-100 text-slate-500 border-slate-200 line-through',
};
const STATUS_BAR: Record<FeeStatus, string> = {
  PAID: 'bg-emerald-500', PARTIAL: 'bg-amber-400', PARTIAL_DUE: 'bg-rose-500',
  UPCOMING: 'bg-slate-300', DUE: 'bg-rose-500',
  UNPAID: 'bg-slate-300', OVERDUE: 'bg-rose-500',
  WAIVED: 'bg-slate-300', WRITTEN_OFF: 'bg-slate-300',
  CANCELLED: 'bg-slate-300',
};
const STATUS_ICON = (s: FeeStatus) => {
  if (s === 'PAID')                              return <CheckCircle2 size={11} className="text-emerald-500" />;
  if (s === 'PARTIAL')                           return <AlertTriangle size={11} className="text-amber-500" />;
  if (s === 'PARTIAL_DUE')                       return <AlertTriangle size={11} className="text-rose-600" />;
  if (s === 'UPCOMING' || s === 'UNPAID')        return <Clock size={11} className="text-slate-500" />;
  if (s === 'DUE' || s === 'OVERDUE')            return <AlertTriangle size={11} className="text-rose-600" />;
  return <X size={11} className="text-slate-400" />;
};

// Safe initials from a possibly-empty/null name. Always returns 1–2 chars.
function getInitials(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/).filter(Boolean);
  const initials = parts.map(p => p[0]).join('').slice(0, 2).toUpperCase();
  return initials || '?';
}
const FEE_TYPE_COLOR: Record<FeeType, string> = {
  TUITION:   'bg-indigo-100 text-indigo-700',
  TRANSPORT: 'bg-orange-100 text-orange-700',
  EXAM:      'bg-violet-100 text-violet-700',
  OTHER:     'bg-slate-100 text-slate-600',
};
const FEE_TYPE_LABEL: Record<FeeType, string> = {
  TUITION: 'Tuition', TRANSPORT: 'Transport', EXAM: 'Exam', OTHER: 'Other',
};

interface Props { onBack: () => void; }

const PAGE_SIZE = 50;

export const FeeLedger: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();
  const editorMode = useEditorModeStore();
  // School-wide active AY — used as a fallback when the selected student
  // has no installments yet (so yearGroups is empty and we can't infer the
  // year from existing rows). Without this, "Generate Schedule" was hitting
  // the "No active academic year for this student" toast for every student
  // with a fresh ledger.
  const { activeYear } = useAcademicYear();
  const [students, setStudents]       = useState<StudentFeeProfile[]>([]);
  const [loading, setLoading]         = useState(true);
  const [selected, setSelected]       = useState<StudentFeeProfile | null>(null);
  const [listTab, setListTab]         = useState<ListTab>('ALL');
  const [search, setSearch]           = useState('');
  const [detailTab, setDetailTab]     = useState<'SCHEDULE' | 'HISTORY'>('SCHEDULE');
  const [showCount, setShowCount]     = useState(PAGE_SIZE);

  // Modal states
  const [payModal, setPayModal]             = useState(false);
  // Standalone write-off modal removed — discounts now flow exclusively
  // through the Collect Payment modal's Discount field. Existing
  // fee_write_offs rows in the DB are still surfaced as historical
  // "Discount" entries in Payment History so audit trail isn't lost.
  const [govtPayModal, setGovtPayModal]     = useState(false);
  const [receiptModal, setReceiptModal]     = useState<PaymentRecord | null>(null);
  // Payment reversal — only set while the confirm modal is open. The list
  // refresh + receipt close happen on success.
  const [reverseTarget, setReverseTarget]   = useState<PaymentRecord | null>(null);
  const [reverseReason, setReverseReason]   = useState('');
  // Reversal mode + the amount the principal wants to KEEP (not reverse).
  // 'FULL' wipes the whole payment. 'CUSTOM' fully reverses then re-records
  // the kept portion as a fresh payment so history reads correctly.
  const [reverseMode, setReverseMode]       = useState<'FULL' | 'CUSTOM'>('FULL');
  const [reverseKeepAmount, setReverseKeepAmount] = useState('');
  const [reversing, setReversing]           = useState(false);
  const [regenModal, setRegenModal]         = useState(false);

  // Form states
  const [payAmount, setPayAmount]           = useState('');
  // Drives the Collect button's loading state. Earlier the button gave no
  // feedback during the API round-trip, so the principal would tap once,
  // see nothing happen, and tap again — risking duplicate submissions.
  const [paySubmitting, setPaySubmitting]   = useState(false);
  const [ledgerMenuOpen, setLedgerMenuOpen] = useState(false);
  const [paymentMethod, setPaymentMethod]   = useState<PaymentMethod>('CASH');
  const [paymentNote, setPaymentNote]       = useState('');
  const [paymentDiscount, setPaymentDiscount] = useState('');
  const [applyDiscount, setApplyDiscount]   = useState(false);
  const [useCustomDate, setUseCustomDate]   = useState(false);
  const [paymentDate, setPaymentDate]       = useState('');
  const [govtPayAmount, setGovtPayAmount]   = useState('');
  const [govtRefNo, setGovtRefNo]           = useState('');
  const [govtNote, setGovtNote]             = useState('');
  const [paymentTransactions, setPaymentTransactions] = useState<PaymentRecord[]>(() => feeService.getPaymentHistory());
  const [govtTransactions, setGovtTransactions] = useState<GovernmentPaymentRecord[]>(() => feeService.getGovernmentPayments());

  // Late-fee preview shown inside the pay modal. Refreshed every time the
  // modal opens; principal can opt out via the "Skip late fee" checkbox.
  const [lateFeeTotal, setLateFeeTotal]     = useState(0);
  const [lateFeeBreakdown, setLateFeeBreakdown] = useState<{ installmentId: string; dueDate: string; daysLate: number; lateFee: number; source: string }[]>([]);
  const [applyLateFee, setApplyLateFee]     = useState(true);

  // Per-year grouping for the schedule tab.
  const [yearGroups, setYearGroups]         = useState<YearGroup[]>([]);
  const [collapsedYears, setCollapsedYears] = useState<Record<string, boolean>>({});

  // Fee structures for the regenerate modal — loaded lazily on open.
  const [feeStructures, setFeeStructures]   = useState<FeeStructureRecord[]>([]);
  const [regenStructureId, setRegenStructureId] = useState('');
  const [regenIsRte, setRegenIsRte]         = useState(false);
  const [regenDiscountAmt, setRegenDiscountAmt] = useState('');
  const [regenDiscountPct, setRegenDiscountPct] = useState('');
  const [regenSubmitting, setRegenSubmitting]   = useState(false);

  // Receipt PDF — reference the on-screen card and capture it via html2canvas
  // → jspdf when the user clicks "Download PDF". Both libs are lazy-imported.
  const receiptCardRef = useRef<HTMLDivElement | null>(null);

  // Per-installment pay modal: tapping the inline "Pay" button on a schedule
  // row opens a focused modal that applies cash + (optional) discount to ONLY
  // that installment via the strict pay_installment RPC. No oldest-first
  // allocation, no advance dump on overpay.
  const [rowPayModal, setRowPayModal] = useState<{
    installmentId: string; month: string; feeType: FeeType;
    outstanding: number; dueDate: string;
  } | null>(null);
  const [rowPayAmount, setRowPayAmount]       = useState('');
  const [rowPayDiscount, setRowPayDiscount]   = useState('');
  const [rowPayMethod, setRowPayMethod]       = useState<PaymentMethod>('CASH');
  const [rowPayNote, setRowPayNote]           = useState('');
  const [rowPaySubmitting, setRowPaySubmitting] = useState(false);
  // Mobile UX: keep the modal compact — only Cash + the live remaining
  // preview show by default. Discount, method, and note live behind a
  // "More Options" disclosure (mirrors the existing Collect Payment modal).
  const [rowPayMoreOpen, setRowPayMoreOpen]   = useState(false);
  const [rowPayUseAdvance, setRowPayUseAdvance] = useState(false);
  const [rowPayPaidBy, setRowPayPaidBy]       = useState<'PARENT' | 'GOVERNMENT'>('PARENT');

  // Schedule row's expand-on-tap history: which installment is expanded.
  // Only one open at a time so the timeline stays scannable.
  const [expandedInstId, setExpandedInstId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        await feeService.refreshAll();
        const all = await studentService.getAll();
        const profiles = all.map(s =>
          feeService.getStudentFeeProfile(s.id, s.name ?? '', `${s.className ?? ''}-${s.section ?? ''}`, s.admissionNo ?? '', s.rte)
        );
        setStudents(profiles);
        setPaymentTransactions(feeService.getPaymentHistory());
        setGovtTransactions(feeService.getGovernmentPayments());
      } catch (e) {
        console.error('[FeeLedger] load error', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const updateStudent = (updated: StudentFeeProfile) => {
    setStudents(prev => prev.map(s => s.studentId === updated.studentId ? updated : s));
    setSelected(updated);
  };

  // Reload the per-year grouping for the selected student's schedule tab.
  // Run on every selection change AND after every write, so the schedule
  // tab stays in sync with the cache that recordPayment / regenerate
  // already refreshed.
  const reloadYearGroups = async (studentId: string) => {
    try {
      const groups = await feeService.getStudentInstallmentsByYear(studentId);
      setYearGroups(groups);
      // Default: only the most recent (active or first) year is expanded.
      setCollapsedYears(prev => {
        const next: Record<string, boolean> = { ...prev };
        groups.forEach((g, idx) => {
          if (next[g.academicYearId] === undefined) next[g.academicYearId] = idx > 0;
        });
        return next;
      });
    } catch (e) {
      // Non-fatal — schedule tab will fall back to the legacy flat list.
      // eslint-disable-next-line no-console
      console.warn('Failed to load per-year fee groups', e);
    }
  };

  useEffect(() => {
    if (!selected) { setYearGroups([]); return; }
    void reloadYearGroups(selected.studentId);
  }, [selected?.studentId]);

  // Fetch a fresh late-fee preview every time the pay modal opens. We
  // intentionally skip the call when the modal is closed to avoid a
  // wasteful RPC on every keystroke.
  useEffect(() => {
    if (!payModal || !selected) { setLateFeeTotal(0); setLateFeeBreakdown([]); setApplyLateFee(true); return; }
    let cancelled = false;
    (async () => {
      try {
        const { total, perInstallment } = await feeService.computeLateFeePreview(selected.studentId);
        if (!cancelled) { setLateFeeTotal(total); setLateFeeBreakdown(perInstallment); setApplyLateFee(true); }
      } catch {
        if (!cancelled) { setLateFeeTotal(0); setLateFeeBreakdown([]); }
      }
    })();
    return () => { cancelled = true; };
  }, [payModal, selected?.studentId]);

  // Lazy-load fee structures the first time the regenerate modal opens.
  const openRegenModal = async () => {
    if (!selected) return;
    setRegenIsRte(selected.isRte);
    setRegenDiscountAmt('');
    setRegenDiscountPct('');
    setRegenStructureId('');
    setRegenModal(true);
    // selected.className is composed as `${class}-${section}` (see line ~127),
    // but fee_structures.className is just the class portion. Strip the
    // `-Section` suffix before comparing so the auto-suggest actually fires.
    const baseClass = selected.className.split('-')[0]?.trim() ?? selected.className;
    if (feeStructures.length === 0) {
      try {
        const rows = await feeService.getFeeStructures();
        setFeeStructures(rows);
        const match = rows.find(r => r.className === baseClass);
        if (match) setRegenStructureId(match.id);
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Could not load fee structures', 'error');
      }
    } else {
      const match = feeStructures.find(r => r.className === baseClass);
      if (match) setRegenStructureId(match.id);
    }
  };

  const handleRegenerate = async () => {
    if (!selected || !regenStructureId) {
      showToast('Pick a fee structure first', 'error');
      return;
    }
    const yearId = yearGroups.find(g => g.isActive)?.academicYearId
      ?? selected.installments.find(i => !!i.academicYearId)?.academicYearId
      ?? activeYear?.id
      ?? '';
    if (!yearId) {
      showToast('No active academic year — create one in Academic Year first', 'error');
      return;
    }
    setRegenSubmitting(true);
    try {
      const inserted = await feeService.regenerateScheduleFromStructure(
        selected.studentId, yearId, regenStructureId,
        regenIsRte,
        Number(regenDiscountAmt) || 0,
        Number(regenDiscountPct) || 0,
      );
      const updated = feeService.getStudentFeeProfile(
        selected.studentId, selected.name, selected.className,
        selected.admissionNo, selected.isRte,
      );
      updateStudent(updated);
      await reloadYearGroups(selected.studentId);
      setRegenModal(false);
      showToast(`Schedule regenerated · ${inserted} installments`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Regenerate failed', 'error');
    } finally {
      setRegenSubmitting(false);
    }
  };

  // Open the per-row pay modal for a specific installment. Pre-fills the
  // outstanding so a one-tap full payment is the common path, but the
  // principal can still type any amount up to the outstanding (overpay is
  // hard-rejected by the server's pay_installment RPC).
  const openRowPay = (inst: FeeInstallment) => {
    const outstanding = Math.max(0, inst.amount - inst.paidAmount - inst.writeOffAmount);
    if (outstanding <= 0) return;
    setRowPayModal({
      installmentId: inst.id,
      month: inst.month,
      feeType: inst.feeType,
      outstanding,
      dueDate: inst.dueDate,
    });
    setRowPayAmount(String(outstanding));
    setRowPayDiscount('');
    setRowPayMethod('CASH');
    setRowPayNote('');
    setRowPayMoreOpen(false);
    setRowPayUseAdvance(false);
    setRowPayPaidBy(inst.payerType === 'GOVERNMENT' ? 'GOVERNMENT' : 'PARENT');
  };

  const handleRowPaySubmit = async () => {
    if (!rowPayModal || !selected) return;
    const amount   = Number(rowPayAmount) || 0;
    const discount = Number(rowPayDiscount) || 0;
    if (amount === 0 && discount === 0 && !rowPayUseAdvance) {
      showToast('Enter an amount, discount, or use advance', 'error');
      return;
    }
    if (amount + discount > rowPayModal.outstanding) {
      showToast(`Overpay blocked — max ₹${rowPayModal.outstanding.toLocaleString('en-IN')} on this row`, 'error');
      return;
    }
    setRowPaySubmitting(true);
    try {
      // When the principal marks the source as Government, the method is
      // overridden to 'GOVERNMENT' so history can colour the entry blue
      // and the audit log distinguishes RTE/grant flows from cash receipts.
      const effectiveMethod = rowPayPaidBy === 'GOVERNMENT' ? 'GOVERNMENT' : METHOD_LABEL[rowPayMethod];
      await feeService.recordPaymentForInstallment(
        rowPayModal.installmentId,
        Math.round(amount),
        Math.round(discount),
        effectiveMethod,
        undefined,
        rowPayNote || undefined,
        rowPayUseAdvance,
      );
      const updated = feeService.getStudentFeeProfile(
        selected.studentId, selected.name, selected.className,
        selected.admissionNo, selected.isRte,
      );
      updateStudent(updated);
      setPaymentTransactions(feeService.getPaymentHistory());
      await reloadYearGroups(selected.studentId);
      setRowPayModal(null);
      showToast('Payment recorded');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Payment failed', 'error');
    } finally {
      setRowPaySubmitting(false);
    }
  };

  // Payment reversal — UI mirrors the server guards so the button only shows
  // when the action will actually succeed. createdAt drives same-day check
  // because `date` may be back-dated when the principal records a delayed
  // entry, but createdAt is when the row was actually inserted.
  const istToday = (): string =>
    new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const istDateOf = (iso?: string): string | null => {
    if (!iso) return null;
    return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  };
  const canReverse = (p: PaymentRecord): boolean => {
    if (!editorMode.isActive())          return false;
    if (p.amount <= 0)                   return false; // already a reversal
    if (p.reversedAt || p.reversesPaymentId) return false;
    return istDateOf(p.createdAt) === istToday();
  };
  const handleReverseConfirm = async () => {
    if (!reverseTarget) return;
    const reason = reverseReason.trim();
    if (reason.length < 3) { showToast('Reason required (min 3 chars)', 'error'); return; }

    // Custom mode: keep ₹X of the payment, reverse the rest. Implemented
    // as a 2-step flow — full reverse, then re-collect the kept portion —
    // because partial reversal at the RPC level would split per-installment
    // links and is risky to introduce. Keep amount must be > 0 and < the
    // original; otherwise it's effectively a full reversal or a no-op.
    let keepAmount = 0;
    if (reverseMode === 'CUSTOM') {
      keepAmount = Math.round(Number(reverseKeepAmount) || 0);
      if (keepAmount <= 0 || keepAmount >= reverseTarget.amount) {
        showToast(`Keep amount must be between ₹1 and ₹${reverseTarget.amount - 1}`, 'error');
        return;
      }
    }

    setReversing(true);
    try {
      await feeService.reversePayment(reverseTarget.id, reason);
      // Step 2 — re-collect the kept portion. KNOWN LIMITATION: this is not
      // atomic with the reversal above. If the re-record fails, the original
      // payment is already gone *and* the kept portion was never persisted.
      // Long-term fix: a SECURITY DEFINER RPC reverse_payment_partial that
      // wraps both ops. For now, make the failure mode loud + actionable by
      // surfacing the exact amount the principal must re-collect manually
      // and persisting it as a sticky toast (not a disappearing one).
      if (reverseMode === 'CUSTOM' && keepAmount > 0 && selected) {
        try {
          await feeService.recordPayment(
            reverseTarget.studentId, keepAmount, reverseTarget.method,
            undefined, `Re-recorded after partial reversal of #${reverseTarget.receiptNo}`,
            false, false, 0,
          );
        } catch (e) {
          // Use error toast so the message stays visible until dismissed.
          showToast(
            `URGENT: full reversal succeeded but the ₹${keepAmount} kept portion was NOT recorded — please re-collect manually. Cause: ${e instanceof Error ? e.message : 'unknown error'}`,
            'error',
          );
        }
      }
      setPaymentTransactions(feeService.getPaymentHistory());
      if (selected) {
        const updated = feeService.getStudentFeeProfile(
          selected.studentId, selected.name, selected.className,
          selected.admissionNo, selected.isRte,
        );
        updateStudent(updated);
        setSelected(updated);
        await reloadYearGroups(selected.studentId);
      }
      setReverseTarget(null);
      setReverseReason('');
      setReverseMode('FULL');
      setReverseKeepAmount('');
      setReceiptModal(null);
      showToast('Payment reversed');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Reversal failed', 'error');
    } finally {
      setReversing(false);
    }
  };

  // PDF export — Tailwind v4 emits CSS colors as oklch(), which
  // html2canvas can't parse ("Attempting to parse an unsupported color
  // function 'oklch'"). Going through html2canvas + jsPDF on the live
  // receipt DOM was therefore broken in production. handlePrintReceipt
  // already builds a self-contained HTML document with inline hex colors
  // and zero Tailwind, so we route the "PDF" action through it and let the
  // browser's "Save as PDF" destination produce the file. Output is
  // identical to what the user would print — and reliable across browsers.
  const handleDownloadPdf = async (r: PaymentRecord) => {
    handlePrintReceipt(r);
    showToast('In the print dialog, choose "Save as PDF" as destination.');
  };

  const handlePayment = async () => {
    if (!selected) return;
    if (paySubmitting) return; // guard against double-click
    const amount = Number(payAmount) || 0;
    const discount = Number(paymentDiscount) || 0;
    if (!Number.isFinite(amount) || !Number.isFinite(discount)) {
      showToast('Invalid amount', 'error');
      return;
    }
    if (amount <= 0 && discount <= 0) {
      showToast('Enter a cash amount or a discount', 'error');
      return;
    }
    if (amount < 0 || discount < 0) {
      showToast('Amounts must be positive', 'error');
      return;
    }
    // Money is integer rupees end-to-end — reject decimals at the form layer
    // so we don't silently shave the parent's ledger by Math.round.
    if (!Number.isInteger(amount) || !Number.isInteger(discount)) {
      showToast('Amount must be a whole rupee value (no decimals)', 'error');
      return;
    }
    if (amount > 10_000_000 || discount > 10_000_000) {
      showToast('Amount looks too large — please re-check', 'error');
      return;
    }
    const today = new Date().toISOString().split('T')[0];
    const chosenDate = useCustomDate && paymentDate ? paymentDate : today;
    if (useCustomDate && paymentDate && paymentDate > today) {
      showToast('Future date not allowed', 'error');
      return;
    }
    setPaySubmitting(true);
    try {
      const result = await feeService.recordPayment(
        selected.studentId,
        // RPC requires at least 1 to record a row when there's only a discount.
        // Cash component is faithful to what the user typed; discount goes via the
        // dedicated parameter and is allocated against installments separately.
        Math.max(amount, 0),
        METHOD_LABEL[paymentMethod],
        chosenDate, paymentNote || undefined, false, applyLateFee, discount,
      );
      // Treat the RPC's persisted paymentId as the source of truth: if the
      // RPC committed a payment row, the collection succeeded — even if the
      // cache-derived applied/advance counters end up at zero (e.g. when an
      // auto-inserted Late Fee absorbed the entire amount). Only short-circuit
      // when there is no paymentId AND nothing measurably moved.
      if (!result.paymentId && result.applied <= 0 && result.advance <= 0) {
        showToast('Nothing applied', 'error');
        return;
      }
      // Refresh local profile from cache (already re-pulled by recordPayment).
      const updated = feeService.getStudentFeeProfile(
        selected.studentId, selected.name, selected.className,
        selected.admissionNo, selected.isRte,
      );
      updateStudent(updated);
      // Read back the canonical payment row written by the RPC. Receipt
      // number, id, date and allocations all come from the persisted row;
      // we do NOT manufacture a local synthetic record any more.
      // Try to resolve the freshly-written payment from cache. If the
      // RPC returned a paymentId but the cache lookup misses (rare, e.g. a
      // brief refresh delay), fall back to the most recent payment for this
      // student so the receipt modal still opens reliably. Earlier the
      // receipt would simply not show in this race.
      let canonical = feeService.getPaymentRecordById(result.paymentId);
      if (!canonical) {
        const recent = feeService.getPaymentHistory(selected.studentId)[0];
        if (recent) canonical = recent;
      }
      setPaymentTransactions(feeService.getPaymentHistory());
      await reloadYearGroups(selected.studentId);
      setPayAmount('');
      setPaymentNote('');
      setPaymentDiscount('');
      setApplyDiscount(false);
      setUseCustomDate(false);
      setPaymentDate('');
      setPayModal(false);
      // Open receipt AFTER closing the pay modal so the receipt modal isn't
      // immediately overlaid by an animating-out pay modal.
      if (canonical) setReceiptModal(canonical);
      else showToast('Payment recorded');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Payment failed', 'error');
    } finally {
      setPaySubmitting(false);
    }
  };

  const handlePrintReceipt = (r: PaymentRecord) => {
    const breakdown = r.installmentDetails.length > 0
      ? `<div class="section-label">Particulars</div>
         <div class="items">
           ${r.installmentDetails.map(d => `<div class="item"><span>${d.month} · ${FEE_TYPE_LABEL[d.feeType] ?? d.feeType}</span><span>₹${d.amount.toLocaleString('en-IN')}</span></div>`).join('')}
           ${r.advanceAmount > 0 ? `<div class="item advance"><span>Advance Credit Added</span><span>₹${r.advanceAmount.toLocaleString('en-IN')}</span></div>` : ''}
         </div>`
      : '';
    // Note is internal-only — never rendered on the printed receipt.
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Fee Receipt – ${r.receiptNo}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; }
    body { background: #fff; padding: 28px; max-width: 460px; margin: auto; color: #1e293b; }
    .card { border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden; }
    .header { background: linear-gradient(90deg, #4f46e5, #2563eb); color: #fff; padding: 16px 20px; }
    .header-row { display: flex; justify-content: space-between; align-items: center; }
    .header h1 { font-size: 18px; font-weight: 900; letter-spacing: .04em; text-transform: uppercase; }
    .header .sub { font-size: 9px; opacity: .85; letter-spacing: .15em; text-transform: uppercase; margin-top: 2px; }
    .badge { background: rgba(255,255,255,.22); color: #fff; font-size: 10px; font-weight: 900; padding: 3px 10px; border-radius: 999px; border: 1px solid rgba(255,255,255,.3); }
    .ribbon { text-align: center; font-size: 10px; font-weight: 900; letter-spacing: .25em; text-transform: uppercase; margin-top: 10px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,.25); opacity: .95; }
    .body { padding: 18px 20px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; padding-bottom: 14px; margin-bottom: 14px; border-bottom: 1px dashed #e2e8f0; }
    .meta .label { font-size: 9px; color: #94a3b8; font-weight: 800; text-transform: uppercase; letter-spacing: .15em; }
    .meta .val { font-size: 12px; color: #1e293b; font-weight: 800; }
    .section-label { font-size: 9px; color: #94a3b8; font-weight: 800; text-transform: uppercase; letter-spacing: .15em; margin-bottom: 6px; }
    .items { background: #f8fafc; border: 1px solid #f1f5f9; border-radius: 10px; overflow: hidden; margin-bottom: 12px; }
    .item { display: flex; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid #f1f5f9; }
    .item:last-child { border-bottom: 0; }
    .item span:first-child { font-size: 11px; color: #475569; font-weight: 700; }
    .item span:last-child { font-size: 11px; color: #0f172a; font-weight: 900; }
    .item.advance { background: #f5f3ff; border-top: 1px solid #ddd6fe; }
    .item.advance span { color: #6d28d9 !important; }
    .total { display: flex; justify-content: space-between; align-items: center; background: #0f172a; color: #fff; padding: 14px 18px; border-radius: 12px; }
    .total span:first-child { font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: .15em; }
    .total span:last-child { font-size: 22px; font-weight: 900; }
    .footer { text-align: center; font-size: 9px; color: #94a3b8; font-style: italic; margin-top: 14px; padding-top: 10px; border-top: 1px dashed #e2e8f0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="header-row">
        <div>
          <h1>EduGrow School</h1>
          <div class="sub">School Management System</div>
        </div>
        <div class="badge">PAID ✓</div>
      </div>
      <div class="ribbon">Fee Receipt</div>
    </div>
    <div class="body">
      <div class="meta">
        <div><div class="label">Receipt No.</div><div class="val">${r.receiptNo}</div></div>
        <div><div class="label">Date</div><div class="val">${r.date}</div></div>
        <div><div class="label">Student</div><div class="val">${r.studentName}</div></div>
        <div><div class="label">Adm. No.</div><div class="val">${r.admissionNo}</div></div>
        <div><div class="label">Class</div><div class="val">${r.className}</div></div>
        <div><div class="label">Method</div><div class="val">${r.method}</div></div>
      </div>
      ${breakdown}
      <div class="total"><span>Total Paid</span><span>₹${r.amount.toLocaleString('en-IN')}</span></div>
      <div class="footer">This is a computer-generated receipt</div>
    </div>
  </div>
</body>
</html>`;
    const popup = window.open('', '_blank', 'width=500,height=700');
    if (!popup) { showToast('Allow popups to print receipt', 'error'); return; }
    popup.document.write(html);
    popup.document.close();
    popup.focus();
    setTimeout(() => { popup.print(); popup.close(); }, 400);
  };

  const handleGovtPayment = async () => {
    if (!govtPayAmount || !govtRefNo.trim()) { showToast('Amount and reference number required', 'error'); return; }
    const amount = Number(govtPayAmount);
    if (isNaN(amount) || amount <= 0) { showToast('Invalid amount', 'error'); return; }
    const rteStudents = students.filter(s => s.isRte).map(s => s.studentId);
    if (rteStudents.length === 0) { showToast('No RTE students found', 'error'); return; }
    if (await feeService.recordGovernmentPayment(rteStudents, amount, govtRefNo, govtNote)) {
      setStudents(students.map(s => feeService.getStudentFeeProfile(s.studentId, s.name, s.className, s.admissionNo, s.isRte)));
      setGovtTransactions(feeService.getGovernmentPayments());
      setGovtPayModal(false);
      setGovtPayAmount('');
      setGovtRefNo('');
      setGovtNote('');
      showToast('Government payment recorded');
    }
  };

  // Reset page when filter/search changes — must be BEFORE any early return
  // to satisfy React's Rules of Hooks (hook count must be identical every render).
  useEffect(() => { setShowCount(PAGE_SIZE); }, [search, listTab]);

  // ─── Loading ─────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="w-full min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-3">
      <div className="w-10 h-10 border-[3px] border-slate-200 border-t-blue-600 rounded-full animate-spin" />
      <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Loading…</p>
    </div>
  );

  // ─── Derived data ─────────────────────────────────────────────────────────────
  const getParentDue  = (id: string) => feeService.getParentDueSummary(id);
  const getGovtDue    = (id: string) => feeService.getGovernmentDueSummary(id);
  const hasDue = (s: StudentFeeProfile) => {
    const pd = getParentDue(s.studentId).total;
    const gd = s.isRte ? getGovtDue(s.studentId).total : 0;
    return pd > 0 || gd > 0;
  };

  const searchMatch = (s: StudentFeeProfile) =>
    (s.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (s.admissionNo ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (s.className ?? '').toLowerCase().includes(search.toLowerCase());

  const pendingStudents = students.filter(s => s.installments.length === 0);
  const dueStudents     = students.filter(s => s.installments.length > 0 && hasDue(s));
  const clearedStudents = students.filter(s => s.installments.length > 0 && !hasDue(s));
  const totalParentDue  = dueStudents.reduce((a, s) => a + getParentDue(s.studentId).total, 0);
  const totalGovtDue    = dueStudents.filter(s => s.isRte).reduce((a, s) => a + getGovtDue(s.studentId).total, 0);
  const totalCollected  = students.reduce((a, s) => {
    return a + s.installments.reduce((b, i) => b + i.paidAmount, 0);
  }, 0);

  const visibleStudents = students.filter(s => {
    if (!searchMatch(s)) return false;
    if (listTab === 'PENDING') return s.installments.length === 0;
    if (listTab === 'DUE')     return s.installments.length > 0 && hasDue(s);
    if (listTab === 'CLEARED') return s.installments.length > 0 && !hasDue(s);
    return true;
  });

  const pagedStudents = visibleStudents.slice(0, showCount);
  const hasMore = showCount < visibleStudents.length;

  // ─── DETAIL VIEW ─────────────────────────────────────────────────────────────
  if (selected) {
    const parentSummary = getParentDue(selected.studentId);
    const govtSummary   = selected.isRte ? getGovtDue(selected.studentId) : { tuition: 0, total: 0 };
    const advance       = feeService.getAdvanceBalance(selected.studentId);
    const totalDue      = selected.installments.reduce((a, i) => a + i.amount, 0);
    const totalPaid     = selected.installments.reduce((a, i) => a + i.paidAmount, 0);
    const pct           = totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 100;

    return (
      <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300 lg:max-w-6xl lg:mx-auto lg:px-4 lg:py-6">
        {/* Header */}
        <div className="bg-white border-b border-slate-100 px-4 lg:px-6 pt-4 lg:pt-5 pb-3 lg:pb-4 shadow-sm sticky top-0 lg:static z-10 lg:rounded-2xl lg:border lg:border-slate-100 lg:shadow-sm lg:mb-3">
          <div className="flex items-center gap-3 mb-4 lg:mb-5">
            <button onClick={() => setSelected(null)} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600 hover:bg-slate-200 transition-colors">
              <ArrowLeft size={20} />
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-black text-slate-900 text-lg lg:text-2xl truncate">{selected.name}</span>
                {selected.isRte && <span className="flex items-center gap-0.5 text-[9px] lg:text-[10px] font-black bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full"><ShieldCheck size={9} /> RTE</span>}
              </div>
              <p className="text-[10px] lg:text-xs font-bold text-slate-400">{selected.className} · {selected.admissionNo}</p>
            </div>
          </div>

          {/* Summary tiles — bigger on desktop */}
          <div className="grid grid-cols-3 gap-2 lg:gap-3 mb-3 lg:mb-4">
            <div className="bg-slate-50 rounded-xl p-2.5 lg:p-4 text-center">
              <div className="text-base lg:text-2xl font-black text-slate-900 tabular-nums">₹{totalPaid.toLocaleString('en-IN')}</div>
              <div className="text-[9px] lg:text-[11px] font-black text-slate-400 uppercase tracking-widest mt-0.5 lg:mt-1">Collected</div>
            </div>
            <div className="bg-rose-50 rounded-xl p-2.5 lg:p-4 text-center">
              <div className="text-base lg:text-2xl font-black text-rose-600 tabular-nums">₹{parentSummary.total.toLocaleString('en-IN')}</div>
              <div className="text-[9px] lg:text-[11px] font-black text-slate-400 uppercase tracking-widest mt-0.5 lg:mt-1">Parent Due</div>
            </div>
            {selected.isRte ? (
              <div className="bg-emerald-50 rounded-xl p-2.5 lg:p-4 text-center">
                <div className="text-base lg:text-2xl font-black text-emerald-600 tabular-nums">₹{govtSummary.total.toLocaleString('en-IN')}</div>
                <div className="text-[9px] lg:text-[11px] font-black text-slate-400 uppercase tracking-widest mt-0.5 lg:mt-1">Govt Due</div>
              </div>
            ) : (
              <div className="bg-indigo-50 rounded-xl p-2.5 lg:p-4 text-center">
                <div className="text-base lg:text-2xl font-black text-indigo-600 tabular-nums">{pct}%</div>
                <div className="text-[9px] lg:text-[11px] font-black text-slate-400 uppercase tracking-widest mt-0.5 lg:mt-1">Paid</div>
              </div>
            )}
          </div>

          {/* Progress bar — advance credit is shown inside the Collect
              Payment modal where it's actionable; an always-visible
              full-width "Advance Credit ₹X" banner here was the single
              biggest space-eater on desktop, and the same number appears
              again inside the modal anyway. */}
          <div className="h-2 lg:h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
          </div>
          {advance > 0 && (
            <p className="text-right text-[10px] lg:text-[11px] font-bold text-violet-600 mt-1.5">
              Advance credit on file: ₹{advance.toLocaleString('en-IN')}
            </p>
          )}
        </div>

        {/* Tab bar — segmented pill control. Active tab gets a white "card"
            on a slate-100 track with a subtle shadow, inactive tabs sit flat.
            Reads more like a finished product than the previous underline-
            on-borderless-tabs treatment. */}
        <div className="bg-white border-b border-slate-100 px-4 lg:px-6 py-3 flex items-center justify-between gap-3">
          <div className="bg-slate-100 rounded-xl p-1 flex flex-1 lg:flex-none">
            {(['SCHEDULE', 'HISTORY'] as const).map(t => (
              <button key={t} onClick={() => setDetailTab(t)}
                className={`flex-1 lg:flex-none lg:px-5 py-2 text-[11px] lg:text-xs font-black uppercase tracking-wider rounded-lg transition-all ${detailTab === t ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {t === 'SCHEDULE' ? 'Schedule' : 'History'}
              </button>
            ))}
          </div>
          {/* Download split — explicit Download icon trigger (replaces the
              cryptic ⋮ menu). Schedule + Regenerate + Govt Pay actions moved
              inline to the year card / Collect Payment row, so this menu is
              now exclusively about exporting data. */}
          <div className="relative">
            <button onClick={() => setLedgerMenuOpen(o => !o)}
              aria-label="Download data"
              className="flex items-center gap-1.5 px-3 h-9 rounded-xl text-slate-600 border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-colors">
              <Download size={14} />
              <span className="text-[11px] font-black uppercase tracking-wider hidden lg:inline">Download</span>
              <ChevronDown size={12} className={`text-slate-400 transition-transform ${ledgerMenuOpen ? 'rotate-180' : ''}`} />
            </button>
            {ledgerMenuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setLedgerMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1.5 z-40 w-60 bg-white rounded-xl shadow-lg border border-slate-200 py-1.5 animate-in fade-in slide-in-from-top-2">
                  <button
                    onClick={() => {
                      setLedgerMenuOpen(false);
                      const studentTxns = paymentTransactions.filter(t => t.studentId === selected.studentId);
                      const sorted = selected.installments.slice()
                        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
                      const rows = sorted.map(i => {
                        const linked = studentTxns
                          .filter(t => !t.reversedAt && !t.reversesPaymentId
                                       && t.installmentIds.includes(i.id))
                          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                        const paidOn = linked[0]?.date ?? '';
                        const remaining = Math.max(0, i.amount - i.paidAmount - i.writeOffAmount);
                        return {
                          Month:      i.month,
                          'Due Date': i.dueDate,
                          'Fee Type': FEE_TYPE_LABEL[i.feeType] ?? i.feeType,
                          Total:      i.amount,
                          Discount:   i.writeOffAmount,
                          Paid:       i.paidAmount,
                          'Paid On':  paidOn,
                          Remaining:  remaining,
                          Status:     i.status,
                          Payer:      i.payerType,
                        };
                      });
                      const safeName = selected.name.replace(/\s+/g, '_');
                      exportCsv(`fees_monthly_${safeName}_${selected.admissionNo}_${new Date().toISOString().slice(0, 10)}`,
                        rows);
                    }}
                    className="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-slate-50 transition-colors text-left">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                      <Calendar size={14} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[12px] font-black text-slate-900">Monthly Summary</div>
                      <div className="text-[10px] font-bold text-slate-400">One row per installment · paid date + remaining</div>
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      setLedgerMenuOpen(false);
                      const txnRows = paymentTransactions
                        .filter(t => t.studentId === selected.studentId)
                        .map(t => ({
                          Date:       t.date,
                          Receipt:    t.receiptNo,
                          Method:     t.method,
                          Cash:       t.amount,
                          Discount:   t.discountAmount ?? 0,
                          Advance:    t.advanceAmount,
                          Installments: t.installmentDetails.map(d => `${d.month}:${FEE_TYPE_LABEL[d.feeType] ?? d.feeType}=${d.amount}`).join(' | '),
                          Reversed:   t.reversedAt ? 'Yes' : '',
                          Note:       t.note ?? '',
                        }));
                      const safeName = selected.name.replace(/\s+/g, '_');
                      exportCsv(`fees_transactions_${safeName}_${selected.admissionNo}_${new Date().toISOString().slice(0, 10)}`,
                        txnRows);
                    }}
                    className="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-slate-50 transition-colors text-left">
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                      <Receipt size={14} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[12px] font-black text-slate-900">Transactions</div>
                      <div className="text-[10px] font-bold text-slate-400">Every payment, discount and reversal</div>
                    </div>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto lg:overflow-visible p-4 lg:p-0 lg:pt-2 space-y-3 lg:space-y-4">

          {/* ── COLLECT + Govt Pay (inline) ──────────────────────────────── */}
          {detailTab === 'SCHEDULE' && (
            <div className="flex gap-2">
              <button onClick={() => setPayModal(true)}
                className="flex-1 lg:flex-none lg:px-8 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm lg:text-base py-3.5 lg:py-4 rounded-2xl shadow-md active:scale-[0.98] transition-all">
                <IndianRupee size={16} /> Collect Payment
              </button>
              {selected.isRte && (
                <button onClick={() => setGovtPayModal(true)}
                  className="px-4 lg:px-5 flex items-center justify-center gap-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-black text-xs lg:text-sm py-3.5 lg:py-4 rounded-2xl border border-blue-200 active:scale-[0.98] transition-all">
                  <ShieldCheck size={14} /> <span className="hidden lg:inline">Govt Pay</span>
                </button>
              )}
            </div>
          )}

          {/* ── PREVIOUS YEAR DUES ────────────────────────────────────────── */}
          {detailTab === 'SCHEDULE' && selected && (
            <PreviousYearDues
              studentId={selected.studentId}
              currentAcademicYearId={yearGroups.find(g => g.isActive)?.academicYearId ?? ''}
              onPayClick={inst => {
                setPayModal(true);
                setPayAmount(String(Math.max(0, inst.amount - inst.paidAmount - inst.writeOffAmount)));
              }}
            />
          )}

          {/* Empty state — no installments anywhere for this student. The
              schedule tab used to render a header with "0 installments" and
              an empty body, leaving the principal with no obvious next
              step. We now surface a clear CTA pointing to Regenerate, and
              don't gate first-time generation behind editor mode. */}
          {detailTab === 'SCHEDULE' && yearGroups.length === 0 && selected.installments.length === 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 lg:p-8 text-center">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-3">
                <Calendar size={20} />
              </div>
              <p className="font-black text-slate-900 text-sm lg:text-base mb-1">No fee schedule yet</p>
              <p className="text-xs lg:text-sm font-bold text-slate-500 mb-4 max-w-md mx-auto">
                This student doesn't have any installments. Generate one from a saved fee structure for {selected.className.split('-')[0] || 'this class'}.
              </p>
              <button onClick={openRegenModal}
                className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs uppercase tracking-widest px-5 py-3 rounded-xl shadow-md active:scale-95 transition-transform">
                <RefreshCw size={14} /> Generate Schedule
              </button>
            </div>
          )}

          {/* ── FEE SCHEDULE — grouped by academic year ───────────────────── */}
          {detailTab === 'SCHEDULE' && (yearGroups.length > 0
            ? yearGroups
            : selected.installments.length > 0
              ? [{
                  academicYearId: '__legacy__',
                  yearLabel: 'Current Year',
                  isActive: true,
                  installments: selected.installments,
                }]
              : []
          ).map(group => {
            const collapsed = !!collapsedYears[group.academicYearId];
            const yearTotal = group.installments.reduce((a, i) => a + i.amount, 0);
            const yearPaid  = group.installments.reduce((a, i) => a + i.paidAmount, 0);
            const yearDue   = group.installments.reduce((a, i) => a + Math.max(0, i.amount - i.paidAmount - i.writeOffAmount), 0);
            return (
              <div key={group.academicYearId} className="space-y-3">
                <div
                  onClick={() => setCollapsedYears(prev => ({ ...prev, [group.academicYearId]: !prev[group.academicYearId] }))}
                  role="button" tabIndex={0}
                  className={`w-full text-left border rounded-2xl px-4 lg:px-5 py-4 cursor-pointer transition-all ${group.isActive ? 'bg-white border-slate-200 hover:border-blue-300 shadow-sm' : 'bg-white border-slate-200 hover:border-slate-300'}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 lg:w-11 lg:h-11 rounded-xl flex items-center justify-center shrink-0 ${group.isActive ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                        <Calendar size={16} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-slate-900 text-base lg:text-lg truncate leading-tight">{group.yearLabel}</span>
                          {group.isActive && <span className="text-[9px] font-black bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full uppercase tracking-wider">Active</span>}
                        </div>
                        <div className="text-[11px] font-bold text-slate-500 mt-0.5 tabular-nums">
                          {group.installments.length} installments · ₹{yearTotal.toLocaleString('en-IN')} total
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        {yearTotal > 0 && (
                          <div className="text-base lg:text-lg font-black tabular-nums leading-none text-slate-900">
                            {Math.round(((yearPaid + group.installments.reduce((a, i) => a + i.writeOffAmount, 0)) / yearTotal) * 100)}<span className="text-slate-400 text-sm">%</span>
                          </div>
                        )}
                        <div className={`text-[10px] font-black uppercase tracking-wider mt-1 ${yearDue === 0 && yearTotal > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                          {yearDue === 0 && yearTotal > 0 ? 'All clear' : 'Collected'}
                        </div>
                      </div>
                      <ChevronDown size={18} className={`text-slate-400 transition-transform ml-1 ${collapsed ? '-rotate-90' : ''}`} />
                    </div>
                  </div>

                  {/* Year-level progress bar — replaces the cramped 2-line
                      paid/due numbers stacked on the right with a proper
                      visual readout. */}
                  {yearTotal > 0 && (() => {
                    const cleared = yearPaid + group.installments.reduce((a, i) => a + i.writeOffAmount, 0);
                    const pctNum = Math.min(100, Math.round((cleared / yearTotal) * 100));
                    return (
                      <div className="mt-3 space-y-2">
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${pctNum >= 100 ? 'bg-emerald-500' : group.isActive ? 'bg-blue-500' : 'bg-slate-400'}`}
                               style={{ width: `${pctNum}%` }} />
                        </div>
                        <div className="flex items-center justify-between text-[11px] font-bold tabular-nums">
                          <span className="text-emerald-700">₹{yearPaid.toLocaleString('en-IN')} <span className="text-slate-400">paid</span></span>
                          {yearDue > 0
                            ? <span className="text-rose-600">₹{yearDue.toLocaleString('en-IN')} <span className="text-slate-400">remaining</span></span>
                            : <span className="text-slate-400">Settled</span>}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Regenerate / Generate Schedule action — moved here from
                      the overflow menu so the rare admin action lives next
                      to the year it operates on. Only visible to editor-mode
                      principals or when no installments exist yet. */}
                  {group.isActive && (editorMode.isActive() || group.installments.length === 0) && (
                    <div className="mt-3 pt-3 border-t border-slate-100 flex justify-end">
                      <button
                        onClick={(e) => { e.stopPropagation(); openRegenModal(); }}
                        className="flex items-center gap-1.5 text-[11px] font-black text-amber-700 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-lg border border-amber-200 transition-colors">
                        <RefreshCw size={11} /> {group.installments.length === 0 ? 'Generate Schedule' : 'Regenerate'}
                      </button>
                    </div>
                  )}
                </div>

                {!collapsed && (() => {
                  const sorted = group.installments.slice()
                    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
                  // Split payable items from govt-covered ₹0 placeholders so each
                  // section can render with its own header + uniform card heights.
                  const realInsts = sorted.filter(i => !(i.amount === 0 && i.payerType === 'GOVERNMENT'));
                  const govtZeros = sorted.filter(i => i.amount === 0 && i.payerType === 'GOVERNMENT');
                  return (
                  <div className="space-y-4">
                  {realInsts.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-3 px-1">
                      <div className="flex items-center gap-2">
                        <span className="w-1 h-3.5 bg-blue-500 rounded-full" />
                        <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider">Payable</span>
                        <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-md">{realInsts.length}</span>
                      </div>
                    </div>
                    {/* Timeline — vertical rail on the left, status dot per
                        installment, content flows inline. Replaces the heavy
                        boxed cards with a calendar-strip feel: each row is one
                        scan-line, the dot's colour is the status at a glance,
                        and only Total + (optionally) Paid / Discount / Balance
                        chips are shown below the headline. */}
                    <div className="relative pl-5 lg:pl-6">
                      {/* the rail */}
                      <div className="absolute left-2 lg:left-2.5 top-1 bottom-1 w-px bg-slate-200" />
                      <div className="space-y-3">
                        {realInsts.map(inst => {
                          const due = inst.amount - inst.paidAmount - inst.writeOffAmount;
                          const receipt = feeService.getPaymentRecordByInstallmentId(inst.id);
                          const dotColor = STATUS_BAR[inst.status] ?? STATUS_BAR_FALLBACK;
                          const isActionable = due > 0
                            && inst.status !== 'PAID' && inst.status !== 'WAIVED'
                            && inst.status !== 'WRITTEN_OFF' && inst.status !== 'CANCELLED';

                          return (
                            <div key={inst.id} className="relative">
                              {/* dot on the rail (slightly inset so it sits
                                  on top of the line, not next to it) */}
                              <div className={`absolute -left-[14px] lg:-left-[14px] top-1.5 w-3 h-3 rounded-full ring-2 ring-white ${dotColor}`} />

                              <div className={`rounded-2xl p-4 lg:p-5 transition-colors ${inst.payerType === 'GOVERNMENT' ? 'bg-blue-50/40 border-l-4 border border-blue-200 hover:border-blue-300' : 'bg-white border border-slate-100 hover:border-slate-200'}`}>
                                {/* Header — month name big, fee type subtle text below.
                                    RTE installments get a blue left-border + tint
                                    so the principal can spot government-paid
                                    rows at a glance even when scrolling fast. */}
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="font-black text-slate-900 text-base lg:text-lg leading-tight truncate">{inst.month}</div>
                                    <div className="text-[11px] font-bold text-slate-400 mt-0.5 truncate">
                                      {FEE_TYPE_LABEL[inst.feeType] ?? inst.feeType}
                                      {inst.payerType === 'GOVERNMENT' && (
                                        <span className="text-blue-700 font-black"> · RTE</span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <div className="font-black text-slate-900 text-base lg:text-lg tabular-nums leading-tight">₹{inst.amount.toLocaleString('en-IN')}</div>
                                    <div className="text-[10px] font-bold text-slate-400 mt-0.5">Due {inst.dueDate}</div>
                                  </div>
                                </div>

                                {/* Progress bar — replaces the chip-soup with a
                                    single visual cue. Width = (paid+discount)
                                    fraction of total. */}
                                {inst.amount > 0 && (() => {
                                  const cleared = Math.min(inst.amount, inst.paidAmount + inst.writeOffAmount);
                                  const pctNum = Math.round((cleared / inst.amount) * 100);
                                  const barColor =
                                    inst.status === 'PAID' || inst.status === 'WAIVED' || inst.status === 'WRITTEN_OFF' ? 'bg-emerald-500'
                                    : inst.status === 'CANCELLED' ? 'bg-slate-300'
                                    : inst.status === 'PARTIAL_DUE' || inst.status === 'DUE' || inst.status === 'OVERDUE' ? 'bg-rose-500'
                                    : inst.status === 'PARTIAL' ? 'bg-amber-400'
                                    : 'bg-slate-200';
                                  return (
                                    <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                      <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pctNum}%` }} />
                                    </div>
                                  );
                                })()}

                                {/* Status line — one quiet sentence instead of
                                    three colour-coded chips. */}
                                <div className="mt-2.5 text-[12px] font-bold text-slate-600 tabular-nums">
                                  {due > 0 ? (
                                    <>
                                      <span className="text-rose-600 font-black">₹{due.toLocaleString('en-IN')} pending</span>
                                      {(inst.paidAmount > 0 || inst.writeOffAmount > 0) && (
                                        <span className="text-slate-400">
                                          {' · '}
                                          {inst.paidAmount > 0 && <>Paid ₹{inst.paidAmount.toLocaleString('en-IN')}</>}
                                          {inst.paidAmount > 0 && inst.writeOffAmount > 0 && ' + '}
                                          {inst.writeOffAmount > 0 && <>Discount ₹{inst.writeOffAmount.toLocaleString('en-IN')}</>}
                                        </span>
                                      )}
                                    </>
                                  ) : (inst.amount > 0 || inst.paidAmount > 0 || inst.writeOffAmount > 0) ? (
                                    <span className="text-emerald-700 font-black">
                                      ✓ {inst.status === 'WAIVED' ? 'Waived' : inst.status === 'WRITTEN_OFF' ? 'Written off' : inst.status === 'CANCELLED' ? 'Cancelled' : 'Fully paid'}
                                      {inst.writeOffAmount > 0 && (
                                        <span className="text-slate-400 font-bold"> · ₹{inst.writeOffAmount.toLocaleString('en-IN')} discount</span>
                                      )}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">Upcoming</span>
                                  )}
                                </div>

                                {/* Action row — Pay (when due) and a single
                                    History toggle. Receipt + note now live
                                    INSIDE the history panel where each entry
                                    has its own receipt button, so the card
                                    surface stays uncluttered. */}
                                {(isActionable || inst.paidAmount > 0 || inst.writeOffAmount > 0) && (
                                  <div className="mt-3 flex items-center gap-2">
                                    {isActionable && inst.payerType === 'PARENT' ? (
                                      <button
                                        onClick={() => openRowPay(inst)}
                                        className="flex-1 flex items-center justify-center gap-1.5 text-[13px] font-black text-white bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] py-3 rounded-xl transition-all">
                                        <IndianRupee size={13} /> Pay ₹{due.toLocaleString('en-IN')}
                                      </button>
                                    ) : <div className="flex-1" />}
                                    {(inst.paidAmount > 0 || inst.writeOffAmount > 0) && (() => {
                                      const isOpen = expandedInstId === inst.id;
                                      return (
                                        <button
                                          onClick={() => setExpandedInstId(isOpen ? null : inst.id)}
                                          className="flex items-center gap-1.5 text-[12px] font-black text-slate-600 px-3 py-3 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors">
                                          History <ChevronDown size={12} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                                        </button>
                                      );
                                    })()}
                                  </div>
                                )}

                                {/* Expand-on-tap history — each entry is its
                                    own card-let with date, amount, method, note
                                    and a per-payment Receipt button. Discounts
                                    surface as a dedicated row with the reason. */}
                                {expandedInstId === inst.id && (() => {
                                  const linked = paymentTransactions
                                    .filter(p => p.studentId === selected.studentId
                                              && p.installmentIds.includes(inst.id))
                                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                                  return (
                                    <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                                      {linked.length === 0 && inst.writeOffAmount === 0 && (
                                        <div className="text-[11px] font-bold text-slate-400">No transactions on this installment yet.</div>
                                      )}
                                      {linked.map(p => {
                                        const cashApplied = p.installmentDetails
                                          .filter((_, idx) => p.installmentIds[idx] === inst.id)
                                          .reduce((s, d) => s + d.amount, 0);
                                        const reversed = !!p.reversedAt;
                                        const isReversal = !!p.reversesPaymentId;
                                        const isGovt = (p.method || '').toUpperCase() === 'GOVERNMENT';
                                        return (
                                          <div key={p.id}
                                            className={`rounded-xl p-3 ${reversed ? 'opacity-50' : ''} ${isGovt ? 'bg-blue-50/60 border border-blue-100' : 'bg-slate-50/60'}`}>
                                            <div className="flex items-start justify-between gap-2">
                                              <div className="min-w-0">
                                                <div className={`text-[13px] font-black flex items-center gap-1.5 ${isReversal ? 'text-rose-600' : isGovt ? 'text-blue-700' : 'text-slate-900'} ${reversed ? 'line-through' : ''}`}>
                                                  {isGovt && !isReversal && <ShieldCheck size={12} />}
                                                  {isReversal ? 'Reversed' : isGovt ? 'Government' : (p.method || 'Payment')}
                                                </div>
                                                <div className="text-[10px] font-bold text-slate-400 mt-0.5">{p.date}</div>
                                              </div>
                                              <div className={`text-[14px] font-black tabular-nums shrink-0 ${isReversal ? 'text-rose-600' : isGovt ? 'text-blue-700' : 'text-emerald-700'} ${reversed ? 'line-through' : ''}`}>
                                                {isReversal ? '−' : '+'}₹{Math.abs(cashApplied).toLocaleString('en-IN')}
                                              </div>
                                            </div>
                                            {p.note && (
                                              <div className="text-[11px] font-bold text-slate-500 mt-1.5 break-words">“{p.note}”</div>
                                            )}
                                            {!reversed && !isReversal && (
                                              <button onClick={() => setReceiptModal(p)}
                                                className="mt-2 flex items-center gap-1 text-[11px] font-black text-indigo-600 hover:text-indigo-700 transition-colors">
                                                <Printer size={11} /> View Receipt
                                              </button>
                                            )}
                                          </div>
                                        );
                                      })}
                                      {inst.writeOffAmount > 0 && (
                                        <div className="bg-indigo-50/40 rounded-xl p-3">
                                          <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                              <div className="text-[13px] font-black text-indigo-700">Discount</div>
                                              {inst.writeOffReason && (
                                                <div className="text-[11px] font-bold text-slate-500 mt-0.5 break-words">“{inst.writeOffReason}”</div>
                                              )}
                                            </div>
                                            <div className="text-[14px] font-black tabular-nums shrink-0 text-indigo-700">
                                              −₹{inst.writeOffAmount.toLocaleString('en-IN')}
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  )}
                  {govtZeros.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2 px-1">
                        <ShieldCheck size={12} className="text-emerald-600" />
                        <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Government Covered (RTE)</span>
                        <span className="text-[10px] font-bold text-slate-400">· {govtZeros.length}</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                        {govtZeros.map(inst => (
                          <div key={inst.id} className="bg-emerald-50/40 border border-emerald-100 rounded-xl p-3 flex items-center justify-between gap-2 hover:border-emerald-200 transition-colors">
                            <div className="min-w-0 flex items-center gap-2">
                              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                                <ShieldCheck size={14} className="text-emerald-600" />
                              </div>
                              <div className="min-w-0">
                                <div className="font-black text-slate-700 text-sm leading-tight truncate">{inst.month}</div>
                                <div className="text-[10px] font-bold text-slate-400 truncate">{FEE_TYPE_LABEL[inst.feeType] ?? inst.feeType}</div>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="text-[10px] font-black text-emerald-700">Govt Paid</div>
                              <div className="text-[10px] font-bold text-slate-400">₹0 due</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  </div>
                  );
                })()}
              </div>
            );
          })}

          {/* ── PAYMENT HISTORY ───────────────────────────────────────────── */}
          {detailTab === 'HISTORY' && (() => {
            // Two event streams merged into one chronological list:
            //   1. Cash payments (incl. reversals + payment-time discount)
            //   2. Govt RTE transfers
            // Standalone write-offs were removed per spec — discount is
            // only applied at payment time and surfaces as a sub-line on
            // the matching cash receipt below.
            type Item =
              | { kind: 'PAY'; date: string; payload: PaymentRecord }
              | { kind: 'GOVT'; date: string; payload: GovernmentPaymentRecord };
            const items: Item[] = [
              ...paymentTransactions.filter(t => t.studentId === selected.studentId)
                .map(p => ({ kind: 'PAY' as const, date: p.date, payload: p })),
              ...govtTransactions.filter(g => g.allocatedStudentIds.includes(selected.studentId))
                .map(g => ({ kind: 'GOVT' as const, date: g.date, payload: g })),
            ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            if (items.length === 0) return (
              <div className="flex flex-col items-center py-16 text-slate-400">
                <Receipt size={32} className="mb-3 opacity-40" />
                <p className="font-bold text-sm">No transactions yet</p>
              </div>
            );
            const txns = paymentTransactions.filter(t => t.studentId === selected.studentId);
            const govtTxns = govtTransactions.filter(g => g.allocatedStudentIds.includes(selected.studentId));
            const totalCash     = txns.filter(t => !t.reversedAt && !t.reversesPaymentId).reduce((s, t) => s + t.amount, 0);
            const totalDiscount = txns.reduce((s, t) => s + (t.discountAmount ?? 0), 0);
            const totalGovt     = govtTxns.reduce((s, g) => s + g.amount, 0);
            return (
              <>
              {/* Summary strip — three numbers, no chrome */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 text-center">
                  <div className="text-sm lg:text-base font-black text-emerald-700 tabular-nums">₹{totalCash.toLocaleString('en-IN')}</div>
                  <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Cash</div>
                </div>
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2 text-center">
                  <div className="text-sm lg:text-base font-black text-indigo-700 tabular-nums">₹{totalDiscount.toLocaleString('en-IN')}</div>
                  <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Discount</div>
                </div>
                <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 text-center">
                  <div className="text-sm lg:text-base font-black text-blue-700 tabular-nums">₹{totalGovt.toLocaleString('en-IN')}</div>
                  <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Govt</div>
                </div>
              </div>

              {/* Unified timeline — vertical rail with one dot per entry,
                  colour-coded by kind. Cash = emerald, discount = indigo,
                  govt = blue. Mirrors the schedule timeline so the two
                  tabs read as a coherent visual system. */}
              <div className="relative pl-5 lg:pl-6">
                <div className="absolute left-2 lg:left-2.5 top-1 bottom-1 w-px bg-slate-200" />
                <div className="space-y-3">
                {items.map(item => {
                  if (item.kind === 'GOVT') {
                    const g = item.payload;
                    return (
                      <div key={`g-${g.id}`} className="relative">
                        <div className="absolute -left-[14px] top-1.5 w-3 h-3 rounded-full ring-2 ring-white bg-blue-500" />
                        <div className="bg-white rounded-xl border border-blue-100 px-3.5 py-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0 flex items-center gap-2 flex-wrap">
                              <span className="font-black text-slate-900 text-sm">{g.date}</span>
                              <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 uppercase">Govt RTE</span>
                            </div>
                            <div className="font-black text-blue-700 text-sm tabular-nums shrink-0">₹{g.amount.toLocaleString('en-IN')}</div>
                          </div>
                          <div className="text-[10px] font-bold text-slate-400 mt-0.5">Ref: {g.referenceNo}</div>
                          {g.note && <div className="text-[10px] font-bold text-slate-400 italic mt-0.5">{g.note}</div>}
                        </div>
                      </div>
                    );
                  }
                  // PAY
                  const txn = item.payload;
                  const isReversal     = !!txn.reversesPaymentId;
                  const isReversedOrig = !!txn.reversedAt && !isReversal;
                  const dotColor = isReversal ? 'bg-rose-500' : isReversedOrig ? 'bg-slate-300' : 'bg-emerald-500';
                  const amountColor = isReversal ? 'text-rose-600' : isReversedOrig ? 'text-slate-400 line-through' : 'text-emerald-600';
                  return (
                    <div key={`p-${txn.id}`} className="relative">
                      <div className={`absolute -left-[14px] top-1.5 w-3 h-3 rounded-full ring-2 ring-white ${dotColor}`} />
                      <div className={`rounded-xl border px-3.5 py-2.5 ${
                        isReversal ? 'bg-amber-50/40 border-amber-200' :
                        isReversedOrig ? 'bg-white border-slate-200 opacity-70' :
                                         'bg-white border-emerald-100'
                      }`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex items-center gap-2 flex-wrap">
                            <span className={`font-black text-sm ${isReversedOrig ? 'text-slate-500' : 'text-slate-900'}`}>{txn.date}</span>
                            {isReversal && (
                              <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200 uppercase">Reversal</span>
                            )}
                            {isReversedOrig && (
                              <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 border border-rose-200 uppercase">Reversed</span>
                            )}
                            {!isReversal && !isReversedOrig && (
                              <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase">{txn.method}</span>
                            )}
                          </div>
                          <div className={`font-black text-sm tabular-nums shrink-0 ${amountColor}`}>
                            {txn.amount < 0 ? '-' : ''}₹{Math.abs(txn.amount).toLocaleString('en-IN')}
                          </div>
                        </div>
                        {!isReversal && !isReversedOrig && (txn.discountAmount ?? 0) > 0 && (
                          <div className="flex items-center justify-between mt-1.5 px-2 py-1 rounded-md bg-indigo-50 border border-indigo-100">
                            <span className="text-[10px] font-black text-indigo-700">+ Discount applied</span>
                            <span className="text-[11px] font-black text-indigo-700 tabular-nums">₹{(txn.discountAmount ?? 0).toLocaleString('en-IN')}</span>
                          </div>
                        )}
                        {txn.installmentDetails.length > 0 && (
                          <div className="text-[10px] font-bold text-slate-500 mt-1 truncate">
                            → {txn.installmentDetails.map(d => d.month).join(', ')}
                          </div>
                        )}
                        {isReversedOrig && txn.reversalReason && (
                          <div className="text-[10px] font-bold text-rose-600 italic mt-1 truncate">"{txn.reversalReason}"</div>
                        )}
                        <div className="text-[9px] font-bold text-slate-400 mt-0.5">#{txn.receiptNo}</div>
                        <button onClick={() => setReceiptModal(txn)}
                          className="mt-1.5 flex items-center gap-1 text-[10px] font-black text-indigo-600 px-2 py-0.5 rounded-full border border-indigo-100 bg-indigo-50 hover:bg-indigo-100 transition-colors">
                          <Receipt size={10} /> Receipt
                        </button>
                      </div>
                    </div>
                  );
                })}
                </div>
              </div>
              </>
            );
          })()}

          {/* OLD: legacy duplicate cash/govt blocks. Kept commented as a
              reference for the unified timeline above. */}
          {false && detailTab === 'HISTORY' && (() => {
            const txns = paymentTransactions.filter(t => t.studentId === selected.studentId)
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            const govtTxns = govtTransactions.filter(g => g.allocatedStudentIds.includes(selected.studentId))
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            const hasAny = txns.length > 0 || govtTxns.length > 0;
            if (!hasAny) return (
              <div className="flex flex-col items-center py-16 text-slate-400">
                <Receipt size={32} className="mb-3 opacity-40" />
                <p className="font-bold text-sm">No payments yet</p>
              </div>
            );
            return (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">
                {txns.map(txn => {
                  // Card style depends on row kind:
                  //   reversal entry  → amber tint (it's a correction)
                  //   reversed entry  → muted + line-through amount (cancelled)
                  //   normal payment  → default white
                  const isReversal       = !!txn.reversesPaymentId;
                  const isReversedOrig   = !!txn.reversedAt && !isReversal;
                  return (
                  <div key={txn.id}
                    className={`bg-white rounded-2xl border shadow-sm p-4 lg:p-5 transition-all ${
                      isReversal     ? 'border-amber-200 bg-amber-50/40' :
                      isReversedOrig ? 'border-slate-200 opacity-70' :
                                       'border-slate-100 hover:shadow-md hover:border-slate-200'
                    }`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`font-extrabold text-sm lg:text-base ${isReversedOrig ? 'text-slate-500' : 'text-slate-900'}`}>{txn.date}</span>
                          {isReversal && (
                            <span className="text-[8px] lg:text-[9px] font-black bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full uppercase">Reversal</span>
                          )}
                          {isReversedOrig && (
                            <span className="text-[8px] lg:text-[9px] font-black bg-rose-100 text-rose-700 border border-rose-200 px-1.5 py-0.5 rounded-full uppercase">Reversed 🔁</span>
                          )}
                        </div>
                        <div className="text-[10px] lg:text-[11px] font-bold text-slate-400">{txn.method} · #{txn.receiptNo}</div>
                      </div>
                      <div className={`font-black text-base lg:text-lg tabular-nums shrink-0 ${
                        isReversal ? 'text-rose-600' : isReversedOrig ? 'text-slate-400 line-through' : 'text-emerald-600'
                      }`}>{txn.amount < 0 ? '-' : ''}₹{Math.abs(txn.amount).toLocaleString('en-IN')}</div>
                    </div>
                    {/* Discount applied alongside this payment — surfaced as
                        its own row so the principal can audit the cleared
                        total at a glance: cash + discount = installments
                        cleared. Hidden when no discount or when this row is
                        a reversal entry. */}
                    {!isReversal && !isReversedOrig && (txn.discountAmount ?? 0) > 0 && (
                      <div className="flex items-center justify-between mb-2 px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-100">
                        <div className="flex items-center gap-1.5">
                          <TrendingDown size={11} className="text-indigo-600" />
                          <span className="text-[10px] lg:text-[11px] font-black text-indigo-700">Discount</span>
                        </div>
                        <span className="text-[11px] lg:text-xs font-black text-indigo-700 tabular-nums">
                          + ₹{(txn.discountAmount ?? 0).toLocaleString('en-IN')} cleared
                        </span>
                      </div>
                    )}
                    {txn.installmentDetails.length > 0 && (
                      <div className="text-[9px] lg:text-[10px] font-bold text-slate-400 mb-2.5 line-clamp-2">
                        → {txn.installmentDetails.map(d => d.month).join(', ')}
                      </div>
                    )}
                    {isReversedOrig && txn.reversalReason && (
                      <div className="text-[10px] font-bold text-rose-600 italic mb-2.5 line-clamp-2">"{txn.reversalReason}"</div>
                    )}
                    <button onClick={() => setReceiptModal(txn)}
                      className="w-full flex items-center justify-center gap-1.5 text-[11px] font-black px-3 py-2 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors active:scale-[0.98]">
                      <Receipt size={12} /> View Receipt
                    </button>
                  </div>
                  );
                })}

                {govtTxns.map(g => (
                  <div key={g.id}
                    className="bg-white rounded-2xl border border-emerald-100 shadow-sm p-4 lg:p-5">
                    <div className="flex items-center justify-between mb-1">
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-extrabold text-slate-900 text-sm lg:text-base">{g.date}</span>
                          <span className="flex items-center gap-0.5 text-[8px] lg:text-[9px] font-black bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                            <ShieldCheck size={8} /> Govt Transfer
                          </span>
                        </div>
                        <div className="text-[10px] lg:text-[11px] font-bold text-slate-400">Ref: {g.referenceNo}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-black text-emerald-600 text-base lg:text-lg tabular-nums">₹{g.amount.toLocaleString('en-IN')}</div>
                        <div className="text-[9px] lg:text-[10px] font-bold text-slate-400">RTE / Total batch</div>
                      </div>
                    </div>
                    {g.note && (
                      <div className="text-[9px] lg:text-[10px] font-bold text-slate-400 mt-1.5 italic">{g.note}</div>
                    )}
                  </div>
                ))}
              </div>
            );
          })()}
        </div>

        {/* ── PAY MODAL ────────────────────────────────────────────────────── */}
        {payModal && (() => {
          // Live computation strip — drives the bottom summary so the
          // principal can see exactly where the money lands BEFORE clicking
          // Collect. Earlier this was opaque ("auto-allocated to oldest
          // dues first, excess to advance credit") and the principal had
          // to mentally simulate it.
          const cash       = Number(payAmount) || 0;
          const disc       = Number(paymentDiscount) || 0;
          const totalDueNow = (selected?.installments ?? [])
            .reduce((s, i) => s + Math.max(0, i.amount - i.paidAmount - i.writeOffAmount), 0)
            + (applyLateFee ? lateFeeTotal : 0);
          const cleared = Math.min(cash + disc, totalDueNow);
          const goesToAdvance = Math.max(0, cash + disc - totalDueNow);
          const remainingAfter = Math.max(0, totalDueNow - cash - disc);
          return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end justify-center sm:items-center">
            <div className="w-full max-w-lg mx-auto bg-white rounded-t-3xl p-5 pb-7 animate-in slide-in-from-bottom-8 max-h-[92vh] overflow-y-auto">
              {/* Header */}
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-black text-slate-900">Collect Payment</h3>
                  <p className="text-[10px] font-bold text-slate-400">{selected.name} · {selected.className}</p>
                </div>
                <button onClick={() => { setPayModal(false); setPayAmount(''); setPaymentNote(''); setPaymentDiscount(''); setApplyDiscount(false); setUseCustomDate(false); setPaymentDate(''); }}
                  className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500">
                  <X size={16} />
                </button>
              </div>

              {/* Total due — anchor number so the principal always knows the
                  target. Replaces the earlier "Advance Credit ₹11,500" first
                  callout which confused users into thinking that was money
                  owed. */}
              <div className="bg-slate-900 text-white rounded-2xl p-4 mb-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-300 mb-1">Total Due</p>
                <p className="text-3xl font-black tabular-nums">₹{totalDueNow.toLocaleString('en-IN')}</p>
                {advance > 0 && (
                  <p className="text-[10px] font-bold text-violet-300 mt-1">+ ₹{advance.toLocaleString('en-IN')} advance credit on file</p>
                )}
              </div>

              {/* Method — uniform 5-column grid so the buttons line up cleanly
                  on phones (was previously a flex-wrap with mixed widths that
                  produced an ugly 3+2 break with "Net Banking" wrapping). */}
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Method</p>
              <div className="grid grid-cols-5 gap-1.5 mb-4">
                {(Object.keys(METHOD_LABEL) as PaymentMethod[]).map(m => (
                  <button key={m} onClick={() => setPaymentMethod(m)}
                    className={`flex flex-col items-center justify-center gap-1 py-2 rounded-xl border text-[9px] font-black transition-colors ${paymentMethod === m ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                    {METHOD_ICON[m]}
                    <span className="leading-none whitespace-nowrap">{METHOD_LABEL[m]}</span>
                  </button>
                ))}
              </div>

              {/* Amount + Discount paired — both inline, both labelled. The
                  Discount row is always present (no toggle) so the principal
                  doesn't have to hunt for it; it just reads "₹0" until they
                  type. Pairing them visually makes the relationship obvious:
                  Total Cleared = Cash + Discount. */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700 mb-1.5">Cash Received</p>
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 flex items-center gap-1.5">
                    <IndianRupee size={16} className="text-emerald-600 shrink-0" />
                    <input type="number" min="0" value={payAmount}
                      onChange={e => setPayAmount(e.target.value)}
                      placeholder="0" className="flex-1 bg-transparent font-black text-emerald-900 text-xl outline-none w-full" />
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-indigo-700 mb-1.5">Discount</p>
                  <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-2.5 flex items-center gap-1.5">
                    <IndianRupee size={16} className="text-indigo-500 shrink-0" />
                    <input type="number" min="0" value={paymentDiscount}
                      onChange={e => {
                        const v = e.target.value;
                        setPaymentDiscount(v);
                        setApplyDiscount(Number(v) > 0);
                      }}
                      placeholder="0" className="flex-1 bg-transparent font-black text-indigo-900 text-xl outline-none w-full" />
                  </div>
                </div>
              </div>
              <p className="text-[10px] font-bold text-slate-400 mb-4">
                Cash + Discount auto-allocate to oldest dues first.
                Discount only reduces installments — it never goes to advance credit.
              </p>

              {/* Live result — exactly tells the principal what's about to
                  happen. Three states: nothing entered, partial pay, or
                  excess (which surfaces "goes to advance"). */}
              {(cash > 0 || disc > 0) && (
                <div className={`rounded-xl border px-3 py-3 mb-3 ${
                  goesToAdvance > 0 ? 'bg-violet-50 border-violet-200' :
                  remainingAfter > 0 ? 'bg-amber-50 border-amber-200' :
                                       'bg-emerald-50 border-emerald-200'
                }`}>
                  <div className="flex items-center justify-between text-[11px] font-black mb-1">
                    <span className="text-slate-700">Will clear</span>
                    <span className={`tabular-nums ${
                      goesToAdvance > 0 ? 'text-violet-700' :
                      remainingAfter > 0 ? 'text-amber-700' :
                                           'text-emerald-700'
                    }`}>₹{cleared.toLocaleString('en-IN')}</span>
                  </div>
                  {remainingAfter > 0 && (
                    <div className="flex items-center justify-between text-[10px] font-bold text-amber-700">
                      <span>Still due after this</span>
                      <span className="tabular-nums">₹{remainingAfter.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  {goesToAdvance > 0 && (
                    <div className="flex items-center justify-between text-[10px] font-bold text-violet-700">
                      <span>Excess cash → advance credit</span>
                      <span className="tabular-nums">₹{goesToAdvance.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Late-fee preview — only shown when there's actually a late
                  fee to talk about. Same skip toggle as before. */}
              {lateFeeTotal > 0 && (
                <div className={`rounded-xl px-3 py-2.5 mb-3 border ${applyLateFee ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-[10px] font-black ${applyLateFee ? 'text-amber-700' : 'text-slate-500 line-through'}`}>Late Fee</span>
                    <span className={`text-sm font-black ${applyLateFee ? 'text-amber-700' : 'text-slate-400 line-through'}`}>+ ₹{lateFeeTotal.toLocaleString('en-IN')}</span>
                  </div>
                  <label className="flex items-center gap-2 text-[10px] font-bold text-slate-500 cursor-pointer mt-1">
                    <input type="checkbox" checked={!applyLateFee}
                      onChange={e => setApplyLateFee(!e.target.checked)}
                      className="accent-amber-600" />
                    Skip late fee for this collection
                  </label>
                </div>
              )}

              {/* More — note + custom date hidden by default to keep the
                  primary flow on one screen. Open only when needed. */}
              <details className="mb-3 group">
                <summary className="cursor-pointer text-[11px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5 select-none">
                  <ChevronDown size={12} className="group-open:rotate-180 transition-transform" />
                  More options
                </summary>
                <div className="mt-2 space-y-2">
                  <textarea value={paymentNote} onChange={e => setPaymentNote(e.target.value)}
                    rows={2} placeholder="Note (e.g., scholarship reason, txn id)…"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-blue-500 resize-none" />
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" checked={useCustomDate} onChange={e => { setUseCustomDate(e.target.checked); if (!e.target.checked) setPaymentDate(''); }}
                      className="accent-slate-600 w-4 h-4" />
                    <span className="text-[11px] font-black text-slate-700">Backdate this payment</span>
                  </label>
                  {useCustomDate && (
                    <input type="date" value={paymentDate} max={new Date().toISOString().split('T')[0]}
                      onChange={e => setPaymentDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 outline-none" />
                  )}
                </div>
              </details>

              <button onClick={handlePayment}
                disabled={paySubmitting || (!payAmount && !paymentDiscount)}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-black rounded-xl disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all">
                {paySubmitting
                  ? <><RefreshCw size={16} className="animate-spin" /> Saving payment…</>
                  : <><CheckCircle2 size={16} /> Collect & Generate Receipt</>
                }
              </button>
            </div>
          </div>
          );
        })()}

        {/* ── DISCOUNT MODAL ────────────────────────────────────────────────── */}

        {/* ── GOVT PAY MODAL ─────────────────────────────────────────────────── */}
        {govtPayModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end justify-center sm:items-center">
            <div className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl p-6 pb-8 animate-in slide-in-from-bottom-8 max-h-[85vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-3">
                <div>
                  <h3 className="text-lg font-black text-slate-900">RTE Government Payment</h3>
                  <p className="text-[10px] font-bold text-slate-400">Allocated to all RTE students' oldest dues first</p>
                </div>
                <button onClick={() => setGovtPayModal(false)} className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center">
                  <X size={16} className="text-slate-500" />
                </button>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center gap-2 mb-4 mt-4">
                <IndianRupee size={20} className="text-slate-400 shrink-0" />
                <input type="number" value={govtPayAmount} onChange={e => setGovtPayAmount(e.target.value)}
                  placeholder="0" className="flex-1 bg-transparent font-black text-slate-900 text-2xl outline-none" />
              </div>
              <input type="text" value={govtRefNo} onChange={e => setGovtRefNo(e.target.value)}
                placeholder="Reference No. (e.g. RTE/2026/APR/001)"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-500 mb-3" />
              <textarea value={govtNote} onChange={e => setGovtNote(e.target.value)}
                rows={2} placeholder="Note (optional)"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-blue-500 resize-none mb-4" />
              <button onClick={handleGovtPayment} disabled={!govtPayAmount || !govtRefNo.trim()}
                className="w-full py-3.5 bg-blue-600 text-white font-black rounded-xl disabled:opacity-40 flex items-center justify-center gap-2">
                <ShieldCheck size={16} /> Record Government Payment
              </button>
            </div>
          </div>
        )}

        {/* ── RECEIPT MODAL ────────────────────────────────────────────────── */}
        {receiptModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end justify-center sm:items-center">
            <div className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl p-6 pb-8 animate-in slide-in-from-bottom-8 max-h-[85vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-5">
                <h3 className="text-lg font-black text-slate-900">Fee Receipt</h3>
                <button onClick={() => setReceiptModal(null)} className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center">
                  <X size={16} className="text-slate-500" />
                </button>
              </div>

              <div ref={receiptCardRef} className="rounded-2xl mb-4 bg-white border border-slate-200 overflow-hidden shadow-sm">
                {/* Header with brand bar */}
                <div className="bg-gradient-to-r from-indigo-600 to-blue-600 px-5 py-4 text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-black text-base lg:text-lg uppercase tracking-wide">EduGrow School</div>
                      <div className="text-[9px] font-bold opacity-80 mt-0.5 uppercase tracking-widest">School Management System</div>
                    </div>
                    {receiptModal.reversedAt ? (
                      <div className="bg-rose-500/30 backdrop-blur-sm text-white text-[9px] font-black px-2.5 py-1 rounded-full border border-rose-300/60">
                        REVERSED 🔁
                      </div>
                    ) : receiptModal.reversesPaymentId ? (
                      <div className="bg-amber-500/30 backdrop-blur-sm text-white text-[9px] font-black px-2.5 py-1 rounded-full border border-amber-300/60">
                        REVERSAL
                      </div>
                    ) : (
                      <div className="bg-white/20 backdrop-blur-sm text-white text-[9px] font-black px-2.5 py-1 rounded-full border border-white/30">
                        PAID ✓
                      </div>
                    )}
                  </div>
                  <div className="text-center text-[10px] font-black uppercase tracking-[0.2em] opacity-90 mt-2 pt-2 border-t border-white/20">Fee Receipt</div>
                </div>

                <div className="p-5">
                  {/* Receipt meta — two columns */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 mb-4 pb-4 border-b border-dashed border-slate-200">
                    {[
                      { label: 'Receipt No.', val: receiptModal.receiptNo },
                      { label: 'Date',        val: receiptModal.date },
                      { label: 'Student',     val: receiptModal.studentName },
                      { label: 'Adm. No.',    val: receiptModal.admissionNo },
                      { label: 'Class',       val: receiptModal.className },
                      { label: 'Method',      val: receiptModal.method },
                    ].map(({ label, val }) => (
                      <div key={label}>
                        <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</div>
                        <div className="text-[12px] font-black text-slate-800 truncate">{val}</div>
                      </div>
                    ))}
                  </div>

                  {receiptModal.installmentDetails.length > 0 && (
                    <div className="mb-3">
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Particulars</p>
                      <div className="rounded-xl bg-slate-50 border border-slate-100 overflow-hidden">
                        {receiptModal.installmentDetails.map((d, i) => (
                          <div key={i} className="flex justify-between items-center px-3 py-2 border-b border-slate-100 last:border-0">
                            <span className="text-[11px] font-bold text-slate-700">{d.month} · {FEE_TYPE_LABEL[d.feeType]}</span>
                            <span className="text-[11px] font-black text-slate-900 tabular-nums">₹{d.amount.toLocaleString('en-IN')}</span>
                          </div>
                        ))}
                        {receiptModal.advanceAmount > 0 && (
                          <div className="flex justify-between items-center px-3 py-2 bg-violet-50 border-t border-violet-200">
                            <span className="text-[11px] font-bold text-violet-700">Advance Credit Added</span>
                            <span className="text-[11px] font-black text-violet-800 tabular-nums">₹{receiptModal.advanceAmount.toLocaleString('en-IN')}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {(receiptModal as any).discountAmount > 0 && (
                    <div className="flex justify-between items-center bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-2 mb-2">
                      <span className="text-[11px] font-black text-indigo-700 uppercase tracking-wide">Discount</span>
                      <span className="text-[12px] font-black text-indigo-700 tabular-nums">-₹{((receiptModal as any).discountAmount as number).toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center bg-slate-900 rounded-xl px-4 py-3.5">
                    <span className="text-xs font-black text-white uppercase tracking-widest">Total Paid</span>
                    <span className="text-xl font-black text-white tabular-nums">₹{receiptModal.amount.toLocaleString('en-IN')}</span>
                  </div>

                  <div className="text-center mt-4 pt-3 border-t border-dashed border-slate-200">
                    <p className="text-[9px] font-bold text-slate-400 italic">This is a computer-generated receipt</p>
                  </div>
                </div>
              </div>

              {/* Reversal context banner — shows on already-reversed rows so
                  the principal can see why it was reversed without scrolling. */}
              {receiptModal.reversedAt && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 mb-3 text-[11px] font-bold text-rose-700">
                  <div className="font-black uppercase tracking-widest text-[9px] mb-0.5">Reversed on {istDateOf(receiptModal.reversedAt)}</div>
                  {receiptModal.reversalReason && <div className="text-rose-600 italic">"{receiptModal.reversalReason}"</div>}
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => handleDownloadPdf(receiptModal)} className="py-3 bg-emerald-600 text-white font-black rounded-xl flex items-center justify-center gap-1.5 text-sm"><Download size={14} /> PDF</button>
                <button onClick={() => handlePrintReceipt(receiptModal)} className="py-3 bg-slate-100 text-slate-900 font-black rounded-xl flex items-center justify-center gap-1.5 text-sm"><Printer size={14} /> Print</button>
                <button onClick={() => setReceiptModal(null)} className="py-3 bg-indigo-600 text-white font-black rounded-xl text-sm">Close</button>
              </div>

              {/* Reverse button — gated by Editor Mode + same-day + not-reversed
                  + positive amount. UI guards mirror the server. */}
              {canReverse(receiptModal) && (
                <button
                  onClick={() => { setReverseTarget(receiptModal); setReverseReason(''); }}
                  className="w-full mt-2 py-3 bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 font-black rounded-xl flex items-center justify-center gap-1.5 text-sm active:scale-[0.98] transition-all">
                  <RotateCcw size={14} /> Reverse Payment
                </button>
              )}
              {!canReverse(receiptModal) && !receiptModal.reversedAt && !receiptModal.reversesPaymentId && receiptModal.amount > 0 && (
                <p className="text-[10px] font-bold text-slate-400 text-center mt-2">
                  {!editorMode.isActive()
                    ? 'Reversal needs Editor Mode (Settings → Security)'
                    : istDateOf(receiptModal.createdAt) !== istToday()
                      ? 'Reversal allowed only on the same day (IST)'
                      : ''}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── REVERSE CONFIRMATION MODAL ──────────────────────────────────── */}
        {reverseTarget && (
          <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white rounded-2xl p-5 shadow-2xl animate-in zoom-in-95 duration-200">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                  <RotateCcw size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-black text-slate-900">Reverse Payment</h3>
                  <p className="text-[11px] font-bold text-slate-500 mt-0.5">
                    {reverseTarget.studentName} · #{reverseTarget.receiptNo} · ₹{reverseTarget.amount.toLocaleString('en-IN')}
                  </p>
                </div>
                <button onClick={() => { setReverseTarget(null); setReverseReason(''); }}
                  className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 shrink-0">
                  <X size={14} />
                </button>
              </div>

              {/* Mode toggle — Full vs partial. The "Custom" path keeps a
                  portion of the payment and reverses the rest, implemented
                  as full-reverse-then-recollect on the server side. */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <button
                  onClick={() => setReverseMode('FULL')}
                  disabled={reversing}
                  className={`py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-colors ${reverseMode === 'FULL' ? 'bg-rose-600 text-white' : 'bg-slate-50 text-slate-500 border border-slate-200'}`}>
                  Reverse Full
                </button>
                <button
                  onClick={() => setReverseMode('CUSTOM')}
                  disabled={reversing}
                  className={`py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-colors ${reverseMode === 'CUSTOM' ? 'bg-rose-600 text-white' : 'bg-slate-50 text-slate-500 border border-slate-200'}`}>
                  Keep Partial
                </button>
              </div>

              {reverseMode === 'CUSTOM' ? (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-amber-700 mb-1.5">
                    Amount to keep <span className="text-rose-500">*</span>
                  </label>
                  <div className="bg-white border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-2 mb-2">
                    <IndianRupee size={14} className="text-amber-600" />
                    <input type="number" min="1" max={reverseTarget.amount - 1}
                      value={reverseKeepAmount}
                      onChange={e => setReverseKeepAmount(e.target.value)}
                      placeholder={`1 – ${reverseTarget.amount - 1}`}
                      disabled={reversing}
                      className="flex-1 bg-transparent font-black text-amber-900 text-base outline-none" />
                  </div>
                  <p className="text-[10px] font-bold text-amber-800 leading-relaxed">
                    Original ₹{reverseTarget.amount.toLocaleString('en-IN')} will be fully reversed,
                    then ₹{(Number(reverseKeepAmount) || 0).toLocaleString('en-IN')} re-recorded as a fresh payment.
                  </p>
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3">
                  <p className="text-[11px] font-bold text-amber-800 leading-relaxed">
                    A negative ledger entry of −₹{reverseTarget.amount.toLocaleString('en-IN')} will be created
                    and installment balances rolled back. Audit-logged.
                  </p>
                </div>
              )}

              {/* Window-of-validity hint — same-day only in IST. */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 mb-3 flex items-center gap-2">
                <Clock size={12} className="text-slate-500" />
                <p className="text-[10px] font-bold text-slate-600">
                  Reversible only until end of today (IST). After that this payment is locked into history.
                </p>
              </div>

              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                Reason <span className="text-rose-500">*</span>
              </label>
              <textarea value={reverseReason}
                onChange={e => setReverseReason(e.target.value)}
                placeholder="Why is this payment being reversed? (e.g. wrong amount, duplicate entry)"
                rows={3}
                disabled={reversing}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-rose-400 resize-none" />

              <div className="flex gap-2 mt-4">
                <button onClick={() => { setReverseTarget(null); setReverseReason(''); setReverseMode('FULL'); setReverseKeepAmount(''); }}
                  disabled={reversing}
                  className="flex-1 py-3 bg-slate-100 text-slate-700 font-black rounded-xl text-sm">
                  Cancel
                </button>
                <button onClick={handleReverseConfirm}
                  disabled={reversing || reverseReason.trim().length < 3 || (reverseMode === 'CUSTOM' && (!reverseKeepAmount || Number(reverseKeepAmount) <= 0 || Number(reverseKeepAmount) >= reverseTarget.amount))}
                  className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-xl text-sm disabled:opacity-50 active:scale-[0.98] transition-all">
                  {reversing ? 'Reversing…' : 'Confirm Reversal'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── PER-ROW PAY MODAL (strict pay_installment) ────────────────────── */}
        {rowPayModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end justify-center sm:items-center">
            <div className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl p-6 pb-8 animate-in slide-in-from-bottom-8 max-h-[85vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="text-lg font-black text-slate-900">Pay this installment</h3>
                  <p className="text-[10px] font-bold text-slate-400">
                    {rowPayModal.month} · {FEE_TYPE_LABEL[rowPayModal.feeType] ?? rowPayModal.feeType} · Due {rowPayModal.dueDate}
                  </p>
                </div>
                <button onClick={() => setRowPayModal(null)} className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center">
                  <X size={16} className="text-slate-500" />
                </button>
              </div>

              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-4">
                <div className="text-[10px] font-black text-emerald-700 uppercase tracking-wider">Outstanding on this row</div>
                <div className="text-2xl font-black text-emerald-700 tabular-nums mt-1">₹{rowPayModal.outstanding.toLocaleString('en-IN')}</div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Cash Amount</label>
                  <input
                    type="number" min={0} max={rowPayModal.outstanding}
                    value={rowPayAmount}
                    onChange={e => setRowPayAmount(e.target.value)}
                    className="mt-1 w-full px-3 py-2.5 border border-slate-200 rounded-xl font-black text-slate-900 text-base focus:outline-none focus:border-emerald-400"
                    placeholder="0"
                  />
                </div>

                {/* Compact summary chips — show selected method/payer + any
                    discount or advance toggled on, so the principal sees the
                    current state without having to expand More Options. */}
                <div className="flex items-center gap-2 flex-wrap text-[10px] font-black">
                  {rowPayPaidBy === 'GOVERNMENT' ? (
                    <span className="px-2 py-1 rounded-full bg-blue-50 text-blue-700 flex items-center gap-1 border border-blue-200">
                      <ShieldCheck size={11} /> Paid by Government
                    </span>
                  ) : (
                    <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-600 flex items-center gap-1">
                      {METHOD_ICON[rowPayMethod]} {METHOD_LABEL[rowPayMethod]}
                    </span>
                  )}
                  {Number(rowPayDiscount) > 0 && (
                    <span className="px-2 py-1 rounded-full bg-indigo-50 text-indigo-700">
                      Discount ₹{Number(rowPayDiscount).toLocaleString('en-IN')}
                    </span>
                  )}
                  {rowPayUseAdvance && (
                    <span className="px-2 py-1 rounded-full bg-violet-50 text-violet-700">
                      Use Advance
                    </span>
                  )}
                </div>

                {/* More Options disclosure — collapsed by default. */}
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setRowPayMoreOpen(o => !o)}
                    className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-slate-50 transition-colors">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">More Options</span>
                    <ChevronDown size={14} className={`text-slate-400 transition-transform ${rowPayMoreOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {rowPayMoreOpen && (
                    <div className="px-3 pb-3 space-y-3 border-t border-slate-100 pt-3">
                      {/* Paid by — Parent vs Government. When Government, the
                          method chip + history entry render in blue so RTE /
                          grant payments are distinguishable from cash receipts. */}
                      <div>
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Paid By</label>
                        <div className="mt-1 grid grid-cols-2 gap-2">
                          <button onClick={() => setRowPayPaidBy('PARENT')}
                            className={`flex items-center justify-center gap-1.5 py-2 rounded-xl border text-[11px] font-black transition-colors ${rowPayPaidBy === 'PARENT' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200'}`}>
                            Parent
                          </button>
                          <button onClick={() => setRowPayPaidBy('GOVERNMENT')}
                            className={`flex items-center justify-center gap-1.5 py-2 rounded-xl border text-[11px] font-black transition-colors ${rowPayPaidBy === 'GOVERNMENT' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-blue-600 border-blue-200'}`}>
                            <ShieldCheck size={12} /> Government
                          </button>
                        </div>
                      </div>

                      {/* Advance credit — shown only when this student has a
                          positive balance. Tapping the toggle marks the
                          payment to draw from advance_balances first; cash
                          field becomes optional in that flow. */}
                      {selected && feeService.getAdvanceBalance(selected.studentId) > 0 && (
                        <button
                          type="button"
                          onClick={() => setRowPayUseAdvance(v => !v)}
                          className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border transition-colors ${rowPayUseAdvance ? 'bg-violet-50 border-violet-300' : 'bg-white border-slate-200 hover:border-violet-300'}`}>
                          <div className="text-left">
                            <div className="text-[11px] font-black text-violet-700">Use advance credit</div>
                            <div className="text-[10px] font-bold text-slate-500 mt-0.5">
                              ₹{feeService.getAdvanceBalance(selected.studentId).toLocaleString('en-IN')} available
                            </div>
                          </div>
                          <div className={`w-9 h-5 rounded-full p-0.5 transition-colors ${rowPayUseAdvance ? 'bg-violet-600' : 'bg-slate-300'}`}>
                            <div className={`w-4 h-4 bg-white rounded-full transition-transform ${rowPayUseAdvance ? 'translate-x-4' : ''}`} />
                          </div>
                        </button>
                      )}

                      <div>
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Discount (optional)</label>
                        <input
                          type="number" min={0} max={rowPayModal.outstanding}
                          value={rowPayDiscount}
                          onChange={e => setRowPayDiscount(e.target.value)}
                          className="mt-1 w-full px-3 py-2.5 border border-slate-200 rounded-xl font-black text-slate-900 text-base focus:outline-none focus:border-indigo-400"
                          placeholder="0"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Method</label>
                        <div className="mt-1 grid grid-cols-5 gap-1.5">
                          {(['CASH','UPI','NET_BANKING','CHEQUE','ONLINE'] as PaymentMethod[]).map(m => (
                            <button key={m}
                              onClick={() => setRowPayMethod(m)}
                              className={`flex flex-col items-center justify-center gap-1 py-2 rounded-xl border text-[9px] font-black transition-colors ${rowPayMethod === m ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}>
                              {METHOD_ICON[m]}
                              <span className="leading-none whitespace-nowrap">{METHOD_LABEL[m]}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Note (optional)</label>
                        <input
                          type="text" value={rowPayNote}
                          onChange={e => setRowPayNote(e.target.value)}
                          className="mt-1 w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-slate-400"
                          placeholder="Discount reason / reference"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {(() => {
                  const a = Number(rowPayAmount) || 0;
                  const d = Number(rowPayDiscount) || 0;
                  const total = a + d;
                  const overpay = total > rowPayModal.outstanding;
                  const remaining = Math.max(0, rowPayModal.outstanding - total);
                  return (
                    <div className={`rounded-xl p-3 text-[11px] font-black flex items-center justify-between ${overpay ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-slate-50 text-slate-700'}`}>
                      <span>{overpay ? 'Overpay blocked' : 'After this entry'}</span>
                      <span className="tabular-nums">
                        {overpay
                          ? `₹${(total - rowPayModal.outstanding).toLocaleString('en-IN')} over`
                          : `₹${remaining.toLocaleString('en-IN')} remaining`}
                      </span>
                    </div>
                  );
                })()}
              </div>

              <div className="flex gap-2 mt-5">
                <button onClick={() => setRowPayModal(null)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black rounded-xl text-sm transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleRowPaySubmit}
                  disabled={rowPaySubmitting
                    || ((Number(rowPayAmount) || 0) + (Number(rowPayDiscount) || 0) === 0 && !rowPayUseAdvance)
                    || ((Number(rowPayAmount) || 0) + (Number(rowPayDiscount) || 0) > rowPayModal.outstanding)}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-sm disabled:opacity-50 active:scale-[0.98] transition-all">
                  {rowPaySubmitting ? 'Recording…' : 'Record Payment'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── REGENERATE SCHEDULE MODAL ─────────────────────────────────────── */}
        {regenModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end justify-center sm:items-center">
            <div className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl p-6 pb-8 animate-in slide-in-from-bottom-8 max-h-[85vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="text-lg font-black text-slate-900">Regenerate Schedule</h3>
                  <p className="text-[10px] font-bold text-slate-400">{selected.name} · {selected.className}</p>
                </div>
                <button onClick={() => setRegenModal(false)} className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center">
                  <X size={16} className="text-slate-500" />
                </button>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 flex gap-2">
                <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[11px] font-bold text-amber-800">
                  All <span className="font-black">unpaid</span> installments for the active year will be replaced.
                  Already-paid and written-off rows are kept untouched.
                </p>
              </div>

              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Fee Structure</p>
              {feeStructures.length === 0 ? (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center text-[11px] font-bold text-slate-400 mb-4">
                  Loading fee structures…
                </div>
              ) : (
                <select value={regenStructureId} onChange={e => setRegenStructureId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-500 mb-4">
                  <option value="">— Pick a structure —</option>
                  {feeStructures.map(s => {
                    // selected.className is `${class}-${section}`; structures
                    // are keyed by class only — strip the section suffix so
                    // the ★ indicator actually fires for the right structure.
                    const baseClass = selected.className.split('-')[0]?.trim() ?? selected.className;
                    return (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.className}){s.className === baseClass ? ' ★ matches class' : ''}
                      </option>
                    );
                  })}
                </select>
              )}

              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Discount (optional)</p>
              <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center gap-2">
                  <IndianRupee size={14} className="text-slate-400" />
                  <input type="number" min="0" value={regenDiscountAmt} onChange={e => setRegenDiscountAmt(e.target.value)}
                    placeholder="Flat ₹" className="flex-1 bg-transparent font-black text-slate-900 text-sm outline-none w-full" />
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center gap-2">
                  <span className="text-slate-400 text-sm font-black">%</span>
                  <input type="number" min="0" max="100" value={regenDiscountPct} onChange={e => setRegenDiscountPct(e.target.value)}
                    placeholder="Percent" className="flex-1 bg-transparent font-black text-slate-900 text-sm outline-none w-full" />
                </div>
              </div>
              <p className="text-[9px] font-bold text-slate-400 mb-3 -mt-2">Larger of flat / percent wins per installment.</p>

              <label className="flex items-center gap-2 mb-4 cursor-pointer">
                <input type="checkbox" checked={regenIsRte} onChange={e => setRegenIsRte(e.target.checked)}
                  className="accent-emerald-600" />
                <ShieldCheck size={14} className="text-emerald-600" />
                <span className="text-[11px] font-bold text-slate-700">Mark tuition as RTE (paid by Government)</span>
              </label>

              <button onClick={handleRegenerate} disabled={!regenStructureId || regenSubmitting}
                className="w-full py-3.5 bg-amber-600 text-white font-black rounded-xl disabled:opacity-40 flex items-center justify-center gap-2">
                <RefreshCw size={15} className={regenSubmitting ? 'animate-spin' : ''} />
                {regenSubmitting ? 'Regenerating…' : 'Regenerate Schedule'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── LIST VIEW ────────────────────────────────────────────────────────────────
  return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300 lg:max-w-6xl lg:mx-auto lg:px-4 lg:py-6">

      {/* Header */}
      <div className="bg-white border-b border-slate-100 shadow-sm lg:rounded-2xl lg:border lg:mb-3">
        <div className="px-4 lg:px-6 pt-4 lg:pt-6 pb-3 lg:pb-4 flex items-center gap-3">
          <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600 hover:bg-slate-200 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <h2 className="text-xl lg:text-2xl font-black text-slate-900 uppercase tracking-tight">Fee Collection</h2>
            <p className="text-[10px] lg:text-xs font-bold text-slate-400">{students.length} students · {dueStudents.length} with dues</p>
          </div>
        </div>

        {/* Stats row — bigger and bolder on desktop */}
        <div className="flex border-t border-slate-100">
          <div className="flex-1 px-4 lg:px-6 py-3 lg:py-5 text-center">
            <div className="text-lg lg:text-3xl font-black text-emerald-600 tabular-nums">₹{totalCollected.toLocaleString('en-IN')}</div>
            <div className="text-[9px] lg:text-[11px] font-black text-slate-400 uppercase tracking-widest mt-0.5 lg:mt-1">Collected</div>
          </div>
          <div className="w-px bg-slate-100" />
          <div className="flex-1 px-4 lg:px-6 py-3 lg:py-5 text-center">
            <div className="text-lg lg:text-3xl font-black text-rose-600 tabular-nums">₹{totalParentDue.toLocaleString('en-IN')}</div>
            <div className="text-[9px] lg:text-[11px] font-black text-slate-400 uppercase tracking-widest mt-0.5 lg:mt-1">Parent Due</div>
          </div>
          {totalGovtDue > 0 && (
            <>
              <div className="w-px bg-slate-100" />
              <div className="flex-1 px-4 lg:px-6 py-3 lg:py-5 text-center">
                <div className="text-lg lg:text-3xl font-black text-blue-600 tabular-nums">₹{totalGovtDue.toLocaleString('en-IN')}</div>
                <div className="text-[9px] lg:text-[11px] font-black text-slate-400 uppercase tracking-widest mt-0.5 lg:mt-1">Govt Due</div>
              </div>
            </>
          )}
        </div>

        {/* Search + tabs — stacked mobile, single row desktop */}
        <div className="px-4 lg:px-6 pb-3 lg:pb-4 space-y-2 lg:space-y-0 lg:flex lg:items-center lg:gap-3 border-t border-slate-100 pt-3 lg:pt-4">
          <div className="relative lg:flex-1">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, class, admission no…"
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-2.5 lg:py-3 text-sm font-bold outline-none focus:border-blue-500 transition-colors" />
          </div>
          <div className="flex gap-2 shrink-0 overflow-x-auto">
            {(['ALL', 'DUE', 'PENDING', 'CLEARED'] as ListTab[]).map(t => (
              <button key={t} onClick={() => setListTab(t)}
                className={`shrink-0 px-3 lg:px-5 py-1.5 lg:py-2.5 rounded-xl text-[10px] lg:text-xs font-black uppercase tracking-widest transition-colors ${listTab === t
                  ? t === 'DUE' ? 'bg-rose-600 text-white'
                    : t === 'CLEARED' ? 'bg-emerald-600 text-white'
                    : t === 'PENDING' ? 'bg-amber-600 text-white'
                    : 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                {t === 'ALL' ? `All (${students.length})`
                  : t === 'DUE' ? `Due (${dueStudents.length})`
                  : t === 'PENDING' ? `Pending (${pendingStudents.length})`
                  : `Cleared (${clearedStudents.length})`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto lg:overflow-visible p-4 lg:p-0 lg:pt-2">
        {/* Parent/student-submitted payment screenshots awaiting principal review. */}
        <div className="mb-3 lg:mb-4">
          <FeePaymentSubmissionsQueue />
        </div>

        {visibleStudents.length === 0 && (
          <div className="flex flex-col items-center py-16 lg:py-24 text-slate-400">
            <Users size={32} className="mb-3 opacity-30" />
            <p className="font-bold text-sm">No students</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 lg:gap-3">
          {pagedStudents.map(student => {
            const pd = getParentDue(student.studentId);
            const gd = student.isRte ? getGovtDue(student.studentId) : { tuition: 0, total: 0 };
            const isDue = pd.total > 0 || gd.total > 0;
            const noSchedule = student.installments.length === 0;
            const totalD = student.installments.reduce((a, i) => a + i.amount, 0);
            const totalP = student.installments.reduce((a, i) => a + i.paidAmount, 0);
            const pct = totalD > 0 ? Math.round((totalP / totalD) * 100) : 0;

            return (
              <button key={student.studentId}
                onClick={() => { setSelected(student); setDetailTab('SCHEDULE'); }}
                className={`w-full text-left bg-white rounded-2xl shadow-sm border p-4 lg:p-5 active:scale-[0.99] hover:shadow-md hover:border-slate-300 transition-all ${noSchedule ? 'border-amber-200' : isDue ? 'border-rose-200' : 'border-slate-100'}`}>
                <div className="flex items-center gap-3 lg:gap-4">
                  {/* Avatar */}
                  <div className={`w-10 h-10 lg:w-12 lg:h-12 rounded-xl flex items-center justify-center font-black text-sm lg:text-base shrink-0 ${noSchedule ? 'bg-amber-100 text-amber-700' : isDue ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {getInitials(student.name)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="font-extrabold text-slate-900 text-sm lg:text-base truncate">{student.name}</span>
                      {student.isRte && <ShieldCheck size={11} className="text-emerald-600 shrink-0" />}
                    </div>
                    <div className="text-[10px] lg:text-[11px] font-bold text-slate-400">{student.className} · {student.admissionNo}</div>

                    {/* Mini progress bar */}
                    <div className="mt-2 h-1 lg:h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${noSchedule ? 'bg-amber-300' : pct === 100 ? 'bg-emerald-500' : 'bg-blue-400'}`} style={{ width: `${noSchedule ? 0 : pct}%` }} />
                    </div>
                    <div className="text-[9px] lg:text-[10px] font-bold text-slate-400 mt-0.5">
                      {noSchedule ? 'No schedule' : `${pct}% collected · ${student.installments.length} installments`}
                    </div>
                  </div>

                  {/* Right: due amount or cleared badge */}
                  <div className="shrink-0 text-right">
                    {noSchedule ? (
                      <span className="flex items-center gap-0.5 text-[9px] lg:text-[10px] font-black text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full">
                        <AlertCircle size={10} /> Pending
                      </span>
                    ) : isDue ? (
                      <>
                        {pd.total > 0 && <div className="font-black text-rose-600 text-sm lg:text-base">₹{pd.total.toLocaleString('en-IN')}</div>}
                        {gd.total > 0 && <div className="font-black text-blue-600 text-sm lg:text-base">₹{gd.total.toLocaleString('en-IN')}</div>}
                        <div className="flex gap-1 mt-1 justify-end flex-wrap">
                          {pd.tuition > 0 && <span className="text-[8px] lg:text-[9px] font-black bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded-full">Tuition</span>}
                          {pd.transport > 0 && <span className="text-[8px] lg:text-[9px] font-black bg-orange-50 text-orange-700 px-1.5 py-0.5 rounded-full">Transport</span>}
                        </div>
                      </>
                    ) : (
                      <span className="flex items-center gap-0.5 text-[9px] lg:text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                        <CheckCircle2 size={10} /> Cleared
                      </span>
                    )}
                  </div>
                  <ChevronRight size={15} className="text-slate-300 shrink-0" />
                </div>
              </button>
            );
          })}
        </div>

        {hasMore && (
          <button
            onClick={() => setShowCount(c => c + PAGE_SIZE)}
            className="w-full py-3 lg:py-4 mt-3 lg:mt-4 bg-white border border-slate-200 rounded-2xl text-xs font-black text-slate-500 uppercase tracking-widest active:scale-95 hover:bg-slate-50 transition-all">
            Load More ({visibleStudents.length - showCount} remaining)
          </button>
        )}

        {!hasMore && visibleStudents.length > PAGE_SIZE && (
          <p className="text-center text-[9px] font-bold text-slate-300 py-3 lg:py-4">
            All {visibleStudents.length} students shown
          </p>
        )}
      </div>
    </div>
  );
};
