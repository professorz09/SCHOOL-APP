import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft, IndianRupee, CheckCircle2, AlertTriangle, Clock, X,
  ShieldCheck, Search, Printer, Banknote, Smartphone, CreditCard,
  Building2, FileCheck, ChevronRight, Receipt, TrendingDown, Users, Filter,
  RefreshCw, Download, ChevronDown, Calendar, RotateCcw, AlertCircle,
} from 'lucide-react';
import { feeService, FeeInstallment, FeeStatus, FeeType, PaymentRecord } from '@/modules/fees/fee.service';
import { exportCsv } from '@/shared/utils/csv';
import { studentService } from '@/modules/students/student.service';
import { useStudentList } from '@/modules/students/useStudentList';
import { SkeletonRow } from '@/shared/components/ui/Skeleton';
import { EmptyState } from '@/shared/components/ui/EmptyState';
import type { FeeStructureRecord } from '@/modules/fees/fees.types';
import { useUIStore } from '@/store/uiStore';
import { useEditorModeStore } from '@/store/editorModeStore';
import { useAcademicYear } from '@/shared/context/AcademicYearContext';
import { todayIST } from '@/shared/utils/date';
import { AppLoader } from '@/shared/components/AppLoader';
import { FeePaymentSubmissionsQueue } from '@/modules/fees/components/FeePaymentSubmissionsQueue';

type YearGroup = { academicYearId: string; yearLabel: string; isActive: boolean; installments: FeeInstallment[] };

type PaymentMethod = 'CASH' | 'UPI' | 'NET_BANKING' | 'CHEQUE' | 'ONLINE';
type ListTab = 'ALL' | 'DUE' | 'UPCOMING' | 'CLEARED' | 'PENDING' | 'HISTORY';

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
// Border-color twin of STATUS_BAR — used on the installment card's
// 2px left edge accent (border classes need border-* not bg-* in
// Tailwind v4).
const STATUS_BORDER: Record<FeeStatus, string> = {
  PAID: 'border-emerald-500', PARTIAL: 'border-amber-400', PARTIAL_DUE: 'border-rose-500',
  UPCOMING: 'border-slate-200', DUE: 'border-rose-500',
  UNPAID: 'border-slate-200', OVERDUE: 'border-rose-500',
  WAIVED: 'border-slate-200', WRITTEN_OFF: 'border-slate-200',
  CANCELLED: 'border-slate-200',
};
const STATUS_BORDER_FALLBACK = 'border-slate-200';
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
  const [listTab, setListTab]         = useState<ListTab>('DUE');
  const [search, setSearch]           = useState('');
  const [detailTab, setDetailTab]     = useState<'SCHEDULE' | 'HISTORY'>('SCHEDULE');
  const [showCount, setShowCount]     = useState(PAGE_SIZE);

  // Modal states
  const [payModal, setPayModal]             = useState(false);
  // Standalone write-off modal removed — discounts now flow exclusively
  // through the Collect Payment modal's Discount field. Existing
  // fee_write_offs rows in the DB are still surfaced as historical
  // "Discount" entries in Payment History so audit trail isn't lost.
  // RTE / govt-pay modal removed in 0083 — government grants are now
  // recorded as regular payments with a "Govt grant" note in the
  // Collect Payment modal. Removes the parallel pay flow + the
  // govt-payments cache + the GOVT history stream.
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
  // useAdvanceCredit removed in 0084 — advance credit feature dropped.
  const [paymentTransactions, setPaymentTransactions] = useState<PaymentRecord[]>(() => feeService.getPaymentHistory());

  // Late-fee preview shown inside the pay modal. Refreshed every time the
  // modal opens; principal can opt out via the "Skip late fee" checkbox.
  const [lateFeeTotal, setLateFeeTotal]     = useState(0);
  const [lateFeeBreakdown, setLateFeeBreakdown] = useState<{ installmentId: string; dueDate: string; daysLate: number; lateFee: number; source: string }[]>([]);
  const [applyLateFee, setApplyLateFee]     = useState(true);

  // Per-year grouping for the schedule tab.
  const [yearGroups, setYearGroups]         = useState<YearGroup[]>([]);
  // Tracks whether reloadYearGroups has finished at least once for the
  // currently selected student. Without this, the "No fee schedule yet"
  // empty state flashes for ~200ms on every student tap because both
  // `yearGroups` and `selected.installments` are empty before the cache
  // primes — the empty-state check can't tell loading from genuinely empty.
  const [yearGroupsLoading, setYearGroupsLoading] = useState(false);
  const [collapsedYears, setCollapsedYears] = useState<Record<string, boolean>>({});

  // Fee structures for the regenerate modal — loaded lazily on open.
  const [feeStructures, setFeeStructures]   = useState<FeeStructureRecord[]>([]);
  const [regenStructureId, setRegenStructureId] = useState('');
  // regenIsRte removed in 0083 — RTE distinction dropped from fees.
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
  // rowPayUseAdvance removed in 0084 — advance credit feature dropped.
  // rowPayPaidBy removed in 0083 — see Compact summary chips section.

  // Schedule row's expand-on-tap history: which installment is expanded.
  // Only one open at a time so the timeline stays scannable.
  const [expandedInstId, setExpandedInstId] = useState<string | null>(null);

  // Server-side school aggregate placeholder — the rest of this comment
  // continues below. The block below introduces stuList + the aggregate. — replaces the client-side walk that
  // had to load every student's installments to compute summary tiles.
  // Refetched on mount + after every write. One round-trip regardless
  // of school size, so the summary tiles render at constant cost.
  const [aggregate, setAggregate] = useState<Awaited<ReturnType<typeof feeService.getSchoolAggregate>> | null>(null);
  const refreshAggregate = async () => {
    try { setAggregate(await feeService.getSchoolAggregate()); }
    catch (e) { console.warn('[FeeLedger] aggregate refresh failed', e); }
  };

  // Server-paginated student list. Replaces studentService.getAll() so the
  // initial page fetches only ~50 slim rows instead of the entire school.
  // The hook handles debounced server-side search + Load More automatically.
  const stuList = useStudentList({ pageSize: PAGE_SIZE });

  // Build StudentFeeProfile rows from the slim list + cached installments.
  // The installment cache is loaded by feeService.refreshAll() on mount; for
  // any student already in cache we get their full schedule, otherwise the
  // profile shows up empty-installments and the principal can still tap to
  // open the detail view (which lazy-fetches via getStudentInstallmentsDirect).
  useEffect(() => {
    if (stuList.items.length === 0 && stuList.loading) return;
    const profiles = stuList.items.map(s =>
      feeService.getStudentFeeProfile(
        s.id, s.name, `${s.className}-${s.section}`, s.admissionNo, s.isRte, s.rollNo,
      ),
    );
    setStudents(profiles);
  }, [stuList.items, stuList.loading]);

  // Slim-list fee snapshot keyed by studentId — derived from
  // student_academic_records aggregates (refreshed on every payment via
  // refresh_student_fee_aggregate trigger). Drives the list-card badges
  // BEFORE the per-student installment cache is primed. Without this,
  // every unopened student showed "No schedule / Pending" even when they
  // had installments + payments — confusing for a quick triage view.
  const slimFeeMap = React.useMemo(() => {
    const m = new Map<string, {
      totalFee: number; paidFee: number; feeStatus: string;
      currentDue: number; upcomingTotal: number; nextDueDate: string | null;
    }>();
    for (const s of stuList.items) {
      m.set(s.id, {
        totalFee: s.totalFee, paidFee: s.paidFee, feeStatus: s.feeStatus,
        // currentDue from server = only installments past due-date.
        // Use this for the card so it matches the "TOTAL DUE" hub KPI
        // (which is also overdue-only). totalFee - paidFee counted the
        // full year and made every fresh student look like a defaulter.
        currentDue:    s.currentDue ?? 0,
        // upcomingTotal + nextDueDate power the Upcoming filter tab:
        // students sorted by nearest-due-date ascending with a "due in
        // N days" label. Same single fee_installments query that
        // produced currentDue — no extra round-trip.
        upcomingTotal: s.upcomingTotal ?? 0,
        nextDueDate:   s.nextDueDate ?? null,
      });
    }
    return m;
  }, [stuList.items]);

  useEffect(() => {
    (async () => {
      try {
        // refreshLite skips the school-wide installment cache (the heaviest
        // blob, scales with school size). Installments for a specific
        // student are fetched lazily via feeService.refreshStudent on
        // selection — see the selection-handler effect below.
        await Promise.all([
          feeService.refreshLite().then(() => {
            setPaymentTransactions(feeService.getPaymentHistory());
          }),
          refreshAggregate(),
        ]);
      } catch (e) {
        // Surface to the user — earlier this only console.error'd and
        // the user saw an empty list with no idea network was down /
        // RLS denied / etc. They'd assume "no students enrolled".
        console.error('[FeeLedger] load error', e);
        showToast(
          e instanceof Error ? e.message : 'Failed to load fees — try again or check connection',
          'error',
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Lazy per-student installment fetch — fires whenever the user opens a
  // student's detail panel. The fee_installments cache will then have just
  // this student's rows (plus whoever else has been opened in this session).
  // Existing helpers (getStudentInstallments, getParentDueSummary, etc.)
  // continue to work because they read from the same cache.
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    // Flip to loading immediately so the empty state can't flash before
    // refreshStudent (cache prime) + reloadYearGroups both finish. Earlier
    // a sibling effect was setting this true/false on its own short timing
    // window, leaving a ~200ms gap during which yearGroups was [] AND
    // yearGroupsLoading was false → "Generate Schedule" empty state shown
    // for the user even though the student had a real schedule.
    setYearGroups([]);
    setYearGroupsLoading(true);
    (async () => {
      try {
        await feeService.refreshStudent(selected.studentId);
        if (cancelled) return;
        // Re-derive the selected profile from the now-populated cache.
        const fresh = feeService.getStudentFeeProfile(
          selected.studentId, selected.name, selected.className,
          selected.admissionNo, selected.isRte, selected.rollNo,
        );
        setSelected(fresh);
        setStudents(prev => prev.map(s => s.studentId === fresh.studentId ? fresh : s));
        setPaymentTransactions(feeService.getPaymentHistory());
        await reloadYearGroups(selected.studentId);
      } catch (e) {
        if (!cancelled) console.warn('[FeeLedger] prime selected failed', e);
        // Clear loading on failure so the user isn't stuck on the spinner.
        if (!cancelled) setYearGroupsLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.studentId]);

  const updateStudent = (updated: StudentFeeProfile) => {
    setStudents(prev => prev.map(s => s.studentId === updated.studentId ? updated : s));
    setSelected(updated);
  };

  // Reload the per-year grouping for the selected student's schedule tab.
  // Run on every selection change AND after every write, so the schedule
  // tab stays in sync with the cache that recordPayment / regenerate
  // already refreshed.
  const reloadYearGroups = async (studentId: string) => {
    setYearGroupsLoading(true);
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
    } finally {
      setYearGroupsLoading(false);
    }
  };

  useEffect(() => {
    // Reset year groups when nothing is selected. The selection-change
    // priming + loading flag now lives entirely in the refreshStudent
    // effect above so we don't double-fire reloadYearGroups (which used
    // to leave a ~200ms window where the empty state showed before the
    // refresh kicked in).
    if (!selected) { setYearGroups([]); setYearGroupsLoading(false); }
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
    // setRegenIsRte removed — RTE flag no longer drives schedule generation.
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
        false, // RTE flag dropped in 0083 — passed for back-compat
        Number(regenDiscountAmt) || 0,
        Number(regenDiscountPct) || 0,
      );
      const updated = feeService.getStudentFeeProfile(
        selected.studentId, selected.name, selected.className,
        selected.admissionNo, selected.isRte, selected.rollNo,
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
  };

  const handleRowPaySubmit = async () => {
    if (!rowPayModal || !selected) return;
    const amount   = Number(rowPayAmount) || 0;
    const discount = Number(rowPayDiscount) || 0;
    if (amount === 0 && discount === 0) {
      showToast('Enter an amount or discount', 'error');
      return;
    }
    if (amount + discount > rowPayModal.outstanding) {
      showToast(`Overpay blocked — max ₹${rowPayModal.outstanding.toLocaleString('en-IN')} on this row`, 'error');
      return;
    }
    setRowPaySubmitting(true);
    try {
      const effectiveMethod = METHOD_LABEL[rowPayMethod];
      await feeService.recordPaymentForInstallment(
        rowPayModal.installmentId,
        Math.round(amount),
        Math.round(discount),
        effectiveMethod,
        undefined,
        rowPayNote || undefined,
      );
      const updated = feeService.getStudentFeeProfile(
        selected.studentId, selected.name, selected.className,
        selected.admissionNo, selected.isRte, selected.rollNo,
      );
      updateStudent(updated);
      setPaymentTransactions(feeService.getPaymentHistory()); void refreshAggregate();
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
            false, 0,
          );
        } catch (e) {
          // Use error toast so the message stays visible until dismissed.
          showToast(
            `URGENT: full reversal succeeded but the ₹${keepAmount} kept portion was NOT recorded — please re-collect manually. Cause: ${e instanceof Error ? e.message : 'unknown error'}`,
            'error',
          );
        }
      }
      setPaymentTransactions(feeService.getPaymentHistory()); void refreshAggregate();
      if (selected) {
        const updated = feeService.getStudentFeeProfile(
          selected.studentId, selected.name, selected.className,
          selected.admissionNo, selected.isRte, selected.rollNo,
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
    // Hard-block overpay client-side. Server also rejects (0084) but
    // surfacing it here gives instant, friendly feedback instead of an
    // opaque 400 from the API.
    const totalDue = (selected.installments ?? [])
      .reduce((s, i) => s + Math.max(0, i.amount - i.paidAmount - i.writeOffAmount), 0)
      + (applyLateFee ? lateFeeTotal : 0);
    if ((amount + discount) > totalDue) {
      showToast(`Overpay blocked — max ₹${totalDue.toLocaleString('en-IN')} due. Reduce by ₹${(amount + discount - totalDue).toLocaleString('en-IN')}.`, 'error');
      return;
    }
    if (amount > 10_000_000 || discount > 10_000_000) {
      showToast('Amount looks too large — please re-check', 'error');
      return;
    }
    // IST date — earlier this used `.toISOString().split('T')[0]`
    // which is UTC. A principal recording payment at 2 AM IST would
    // see today's receipt dated yesterday. Money records should
    // never be backdated by a timezone bug.
    const today = todayIST();
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
        chosenDate, paymentNote || undefined, applyLateFee, discount,
      );
      if (!result.paymentId && result.applied <= 0) {
        showToast('Nothing applied', 'error');
        return;
      }
      // Refresh local profile from cache (already re-pulled by recordPayment).
      const updated = feeService.getStudentFeeProfile(
        selected.studentId, selected.name, selected.className,
        selected.admissionNo, selected.isRte, selected.rollNo,
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
      setPaymentTransactions(feeService.getPaymentHistory()); void refreshAggregate();
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

  // handleGovtPayment removed — bulk RTE payment dropped in 0083.
  // Government grants are now recorded as regular payments via the
  // Collect Payment modal, with a "Govt grant" note for accounting.

  // Reset page when filter/search changes — must be BEFORE any early return
  // to satisfy React's Rules of Hooks (hook count must be identical every render).
  useEffect(() => { setShowCount(PAGE_SIZE); }, [search, listTab]);

  // ─── Loading ─────────────────────────────────────────────────────────────────
  // Shared AppLoader so we don't fight the route-chunk Suspense fallback
  // with a different look — earlier the parent's blue-tinted ring spinner
  // and FeeLedger's own dotted spinner appeared together for ~200ms.
  if (loading) return <AppLoader variant="centered" />;

  // ─── Derived data ─────────────────────────────────────────────────────────────
  const getParentDue  = (id: string) => feeService.getParentDueSummary(id);
  // hasDue + hasSchedule use the slim aggregate when the per-student
  // installment cache hasn't been primed yet. Without this, the tabs
  // (Pending / Due / Cleared) and per-card badges all defaulted to
  // "Pending / No schedule" until each student was opened — defeating
  // the whole point of the list view.
  const hasDue = (s: StudentFeeProfile): boolean => {
    if (s.installments.length > 0) return getParentDue(s.studentId).total > 0;
    const slim = slimFeeMap.get(s.studentId);
    if (!slim) return false;
    // overdue-only — see slimFeeMap comment above.
    return slim.currentDue > 0;
  };

  // Whether a student has any UNPAID installments in the future. Cache
  // wins; slim aggregate is the fallback so the Upcoming tab works
  // before per-student installments load.
  const hasUpcoming = (s: StudentFeeProfile): boolean => {
    if (s.installments.length > 0) {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      return s.installments.some(i => i.dueDate > today && i.status !== 'PAID');
    }
    return (slimFeeMap.get(s.studentId)?.upcomingTotal ?? 0) > 0;
  };
  const hasSchedule = (s: StudentFeeProfile): boolean => {
    if (s.installments.length > 0) return true;
    const slim = slimFeeMap.get(s.studentId);
    return (slim?.totalFee ?? 0) > 0;
  };

  const searchMatch = (s: StudentFeeProfile) =>
    (s.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (s.admissionNo ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (s.className ?? '').toLowerCase().includes(search.toLowerCase());

  // Pending = no schedule at all (students without any installments).
  // Due / Cleared = have a schedule, with/without outstanding amount.
  const pendingStudents = students.filter(s => !hasSchedule(s));
  const dueStudents      = students.filter(s =>  hasSchedule(s) &&  hasDue(s));
  const upcomingStudents = students.filter(s =>  hasSchedule(s) &&  hasUpcoming(s));
  const clearedStudents  = students.filter(s =>  hasSchedule(s) && !hasDue(s) && !hasUpcoming(s));
  // Prefer the server aggregate when it has loaded — accurate even if
  // the in-memory cache is mid-refresh. Falls back to the client walk
  // for the brief window before the first aggregate fetch returns and
  // for anyone who lost the connection mid-session.
  const totalParentDue  = aggregate?.totalParentDue
                          ?? dueStudents.reduce((a, s) => a + getParentDue(s.studentId).total, 0);
  const totalCollected  = aggregate?.totalCollected
                          ?? students.reduce((a, s) => a + s.installments.reduce((b, i) => b + i.paidAmount, 0), 0);

  const visibleStudents = students.filter(s => {
    if (!searchMatch(s)) return false;
    if (listTab === 'DUE')      return hasSchedule(s) &&  hasDue(s);
    if (listTab === 'UPCOMING') return hasSchedule(s) &&  hasUpcoming(s);
    if (listTab === 'CLEARED')  return hasSchedule(s) && !hasDue(s) && !hasUpcoming(s);
    return true;
  });

  // UPCOMING tab: sort by nearest due_date ascending so the student
  // whose next installment is closest sits at the top. Cache-primed
  // students compute MIN(dueDate) inline; everyone else uses the
  // slim aggregate's nextDueDate.
  if (listTab === 'UPCOMING') {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const nextDateFor = (s: StudentFeeProfile): string => {
      if (s.installments.length > 0) {
        const future = s.installments
          .filter(i => i.dueDate > today && i.status !== 'PAID')
          .map(i => i.dueDate)
          .sort();
        if (future.length > 0) return future[0];
      }
      return slimFeeMap.get(s.studentId)?.nextDueDate ?? '9999-12-31';
    };
    visibleStudents.sort((a, b) => nextDateFor(a).localeCompare(nextDateFor(b)));
  }

  const pagedStudents = visibleStudents.slice(0, showCount);
  const hasMore = showCount < visibleStudents.length;

  // ─── DETAIL VIEW ─────────────────────────────────────────────────────────────
  if (selected) {
    const parentSummary = getParentDue(selected.studentId);
    // Advance credit removed in 0084 — keeping the variable as a 0
    // constant so the existing layout doesn't flicker / blank chunks
    // don't need touching beyond the conditional `advance > 0` blocks
    // (which now never render).
    const advance = 0;
    const totalDue      = selected.installments.reduce((a, i) => a + i.amount, 0);
    const totalPaid     = selected.installments.reduce((a, i) => a + i.paidAmount, 0);
    // Cleared = cash paid + discount (write-off). Both reduce the
    // outstanding, so a ₹2k row fully covered by ₹2k discount must read
    // as 100% paid in the header tile too — earlier it only counted
    // cash and showed 38% even when the student was Fully Paid.
    const totalCleared  = selected.installments.reduce((a, i) => a + i.paidAmount + i.writeOffAmount, 0);
    const pct           = totalDue > 0 ? Math.min(100, Math.round((totalCleared / totalDue) * 100)) : 100;

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
                {/* RTE chip removed — see commit. The RTE flag stays on
                    students.is_rte for admission records, but the FeeLedger
                    treats every student the same. If government pays, the
                    principal records it as a normal payment with a note. */}
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
              <div className="text-[9px] lg:text-[11px] font-black text-slate-400 uppercase tracking-widest mt-0.5 lg:mt-1">Total Due</div>
            </div>
            {/* RTE-specific Govt Due tile removed. Every student now sees
                the same Paid % tile — government grants (when they happen)
                go through as a normal payment with a "Govt grant" note. */}
            <div className="bg-indigo-50 rounded-xl p-2.5 lg:p-4 text-center">
              <div className="text-base lg:text-2xl font-black text-indigo-600 tabular-nums">{pct}%</div>
              <div className="text-[9px] lg:text-[11px] font-black text-slate-400 uppercase tracking-widest mt-0.5 lg:mt-1">Paid</div>
            </div>
          </div>

          {/* Progress bar — advance credit is shown inside the Collect
              Payment modal where it's actionable; an always-visible
              full-width "Advance Credit ₹X" banner here was the single
              biggest space-eater on desktop, and the same number appears
              again inside the modal anyway. */}
          <div className="h-2 lg:h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
          </div>
          {/* Advance credit on file banner removed in 0084. */}
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

          {/* Single Collect Payment button — RTE-specific Govt Pay flow
              removed in 0083. Government grants flow through this same
              button with a "Govt grant" note. */}
          {detailTab === 'SCHEDULE' && (
            <button onClick={() => setPayModal(true)}
              className="w-full lg:w-auto lg:px-8 lg:self-start flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm lg:text-base py-3.5 lg:py-4 rounded-2xl shadow-md active:scale-[0.98] transition-all">
              <IndianRupee size={16} /> Collect Payment
            </button>
          )}

          {/* "Previous Year Outstanding" banner removed — duplicated the
              per-year cards below it and could mislabel current-year dues
              as "previous" when the active-year detection fell through. */}

          {/* Skeleton placeholder while year-groups are still loading.
              Prevents the "No fee schedule yet" empty state from flashing
              before the cache primes for the newly-selected student. */}
          {detailTab === 'SCHEDULE' && yearGroupsLoading && selected.installments.length === 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 lg:p-8 text-center">
              <div className="w-10 h-10 mx-auto mb-3 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
              <p className="font-black text-slate-500 text-sm">Loading schedule…</p>
            </div>
          )}

          {/* Empty state — only after the load finishes and the student
              genuinely has no installments. The schedule tab used to render
              a header with "0 installments" and an empty body, leaving the
              principal with no obvious next step. We now surface a clear
              CTA pointing to Regenerate, and don't gate first-time
              generation behind editor mode. */}
          {detailTab === 'SCHEDULE' && !yearGroupsLoading && yearGroups.length === 0 && selected.installments.length === 0 && (() => {
            // Schedule generation is a no-op without a class — fee
            // structures are per-class, so an UNASSIGNED student has no
            // structure to copy from. Block the CTA and tell the
            // principal exactly what to do next.
            const noClass = !selected.className || selected.className.trim() === '' || selected.className === '-';
            return (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 lg:p-8 text-center">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-3">
                  <Calendar size={20} />
                </div>
                <p className="font-black text-slate-900 text-sm lg:text-base mb-1">No fee schedule yet</p>
                {noClass ? (
                  <>
                    <p className="text-xs lg:text-sm font-bold text-slate-500 mb-4 max-w-md mx-auto">
                      Student abhi kisi class me assigned nahi hai. Pehle Students → Assign to Class se class de, fir yahan se schedule generate hoga.
                    </p>
                    <button disabled
                      className="inline-flex items-center gap-2 bg-slate-200 text-slate-400 font-black text-xs uppercase tracking-widest px-5 py-3 rounded-xl cursor-not-allowed">
                      <RefreshCw size={14} /> Class assign karein pehle
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-xs lg:text-sm font-bold text-slate-500 mb-4 max-w-md mx-auto">
                      This student doesn't have any installments. Generate one from a saved fee structure for {selected.className.split('-')[0] || 'this class'}.
                    </p>
                    <button onClick={openRegenModal}
                      className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs uppercase tracking-widest px-5 py-3 rounded-xl shadow-md active:scale-95 transition-transform">
                      <RefreshCw size={14} /> Generate Schedule
                    </button>
                  </>
                )}
              </div>
            );
          })()}

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
            const yearDisc  = group.installments.reduce((a, i) => a + i.writeOffAmount, 0);
            const yearDue   = group.installments.reduce((a, i) => a + Math.max(0, i.amount - i.paidAmount - i.writeOffAmount), 0);
            const cleared   = yearPaid + yearDisc;
            const pctNum    = yearTotal > 0 ? Math.min(100, Math.round((cleared / yearTotal) * 100)) : 0;
            const isSettled = yearDue === 0 && yearTotal > 0;
            const fillColor = isSettled ? 'bg-emerald-500' : group.isActive ? 'bg-blue-500' : 'bg-slate-400';
            return (
              <div key={group.academicYearId}>
                {/* Year card — same white card for active + closed years.
                    No left side stripe, no blue-tinted background; the
                    only differentiator is a tiny "ACTIVE" chip next to
                    the year label. Settled years carry a quiet
                    "SETTLED" chip in emerald. Earlier the active card
                    had a blue side stripe + tinted background which
                    looked inconsistent next to the rest of the app. */}
                <div
                  onClick={() => setCollapsedYears(prev => ({ ...prev, [group.academicYearId]: !prev[group.academicYearId] }))}
                  role="button" tabIndex={0}
                  className="w-full text-left rounded-2xl cursor-pointer transition-all bg-white border border-slate-200 hover:border-slate-300 px-4 py-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex items-center gap-2 flex-wrap">
                      <span className="font-black text-slate-900 text-base leading-tight">
                        {group.yearLabel}
                      </span>
                      {group.isActive && (
                        <span className="text-[9px] font-black bg-slate-900 text-white px-1.5 py-0.5 rounded uppercase tracking-wider">
                          Active
                        </span>
                      )}
                      {!group.isActive && isSettled && (
                        <span className="text-[9px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded uppercase tracking-wider">
                          Settled
                        </span>
                      )}
                      <span className="text-[10px] lg:text-[11px] font-bold tabular-nums shrink-0 text-slate-400">
                        · {group.installments.length} inst.
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`font-black tabular-nums text-base ${isSettled ? 'text-emerald-700' : 'text-slate-900'}`}>
                        ₹{yearTotal.toLocaleString('en-IN')}
                      </span>
                      <ChevronDown size={16} className={`text-slate-400 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
                    </div>
                  </div>

                  {yearTotal > 0 && (
                    <div className="mt-2.5">
                      <div className="bg-slate-100 rounded-full overflow-hidden h-1.5">
                        <div className={`h-full rounded-full transition-all ${fillColor}`}
                             style={{ width: `${pctNum}%` }} />
                      </div>
                      <div className="flex items-center justify-between font-bold tabular-nums text-[11px] mt-2">
                        <span className="text-slate-500">
                          <span className="text-emerald-700">₹{yearPaid.toLocaleString('en-IN')} paid</span>
                          {yearDisc > 0 && <> · <span className="text-slate-500">₹{yearDisc.toLocaleString('en-IN')} disc.</span></>}
                        </span>
                        {yearDue > 0
                          ? <span className="text-rose-600">₹{yearDue.toLocaleString('en-IN')} due</span>
                          : <span className="text-emerald-600">✓ Settled</span>}
                      </div>
                    </div>
                  )}

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
                  // Split the list into two visually-separate sections:
                  //   • Monthly schedule  — recurring per-month rows,
                  //                         month name like "April".
                  //   • One-Time Fees     — admission/annual-day/exam
                  //                         (month === 'OneTime' or 'Annual').
                  // Earlier they were mixed together with "Annual" ₹X and
                  // "OneTime" ₹Y rows interleaved between Apr / May / Jun,
                  // which made it impossible to see the actual monthly cycle.
                  const oneTimeInsts = sorted.filter(i => i.month === 'OneTime' || i.month === 'Annual');
                  const realInsts = sorted.filter(i => i.month !== 'OneTime' && i.month !== 'Annual');
                  const renderInst = (inst: typeof sorted[0]) => {
                          const due = inst.amount - inst.paidAmount - inst.writeOffAmount;
                          const receipt = feeService.getPaymentRecordByInstallmentId(inst.id);
                          const stripe = STATUS_BAR[inst.status] ?? STATUS_BAR_FALLBACK;
                          const stripeBorder = STATUS_BORDER[inst.status] ?? STATUS_BORDER_FALLBACK;
                          void stripe; // eslint: kept for potential future inline use
                          void receipt;
                          const isActionable = due > 0
                            && inst.status !== 'PAID' && inst.status !== 'WAIVED'
                            && inst.status !== 'WRITTEN_OFF' && inst.status !== 'CANCELLED';

                          // Status pill content + colour, derived once.
                          // Important: distinguish UPCOMING (due_date in
                          // future) from OVERDUE (due_date in past) —
                          // earlier the UI labelled everything with
                          // due > 0 as "Due" regardless of date, so
                          // future months looked just as urgent as
                          // overdue ones. Now:
                          //   • PAID / WAIVED / etc.    → emerald "Paid"
                          //   • PARTIAL (not yet due)   → amber "Partial"
                          //   • PARTIAL (past due)      → rose  "Overdue"
                          //   • UNPAID, future due date → slate "Upcoming"
                          //   • UNPAID, past due date   → rose  "Overdue"
                          const isPaid = (inst.amount > 0 || inst.paidAmount > 0 || inst.writeOffAmount > 0)
                                          && due === 0;
                          const isUpcoming = inst.amount === 0 && inst.paidAmount === 0 && inst.writeOffAmount === 0;
                          // todayIso is local-day, not UTC — same convention
                          // as everywhere else in the app (see shared/utils/date.ts).
                          // We compare ISO date strings directly because they
                          // sort lexicographically.
                          const todayIso = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
                          const isPastDue = !!inst.dueDate && inst.dueDate < todayIso;
                          const hasPartial = inst.paidAmount + inst.writeOffAmount > 0;
                          const statusLabel = isPaid
                            ? (inst.status === 'WAIVED' ? 'Waived'
                              : inst.status === 'WRITTEN_OFF' ? 'Written off'
                              : inst.status === 'CANCELLED' ? 'Cancelled' : 'Paid')
                            : due > 0
                              ? (isPastDue
                                  ? (hasPartial ? 'Overdue' : 'Overdue')
                                  : (hasPartial ? 'Partial' : 'Upcoming'))
                              : 'Upcoming';
                          const statusPill = isPaid
                            ? 'bg-emerald-100 text-emerald-700'
                            : due > 0
                              ? (isPastDue
                                  ? 'bg-rose-100 text-rose-700'
                                  : (hasPartial ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'))
                              : 'bg-slate-100 text-slate-500';
                          return (
                            <div key={inst.id} className="relative">
                              <div className={`rounded-xl py-2.5 px-3.5 bg-white border border-slate-100 hover:border-slate-200 transition-colors border-l-2 ${stripeBorder}`}>
                                {/* Status accent kept as a subtle 2px
                                    left edge so the row's state still
                                    reads at a glance — without the
                                    full timeline dots+rail. */}
                                {/* Top row — month + amount + status pill in
                                    a single line. Pill on the right replaces
                                    the awkward inline "✓ Paid" text. */}
                                <div className="flex items-center justify-between gap-2">
                                  <div className="min-w-0 flex items-baseline gap-2 flex-wrap">
                                    <span className="font-black text-slate-900 text-[13px] leading-tight">{inst.month}</span>
                                    <span className="text-[10px] font-bold text-slate-400 tabular-nums">
                                      {inst.dueDate}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="font-black text-slate-900 text-[13px] tabular-nums">
                                      ₹{inst.amount.toLocaleString('en-IN')}
                                    </span>
                                    {!isUpcoming && (
                                      <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${statusPill}`}>
                                        {statusLabel}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Sub-line — fee-type + breakdown of paid
                                    / discount / due. Quiet by design;
                                    headline carries the meaning. */}
                                <div className="mt-1 text-[10px] font-bold tabular-nums text-slate-400">
                                  <span>{inst.headName?.trim() || FEE_TYPE_LABEL[inst.feeType] || inst.feeType}</span>
                                  {due > 0 && (
                                    <>
                                      {' · '}
                                      <span className="text-rose-600">₹{due.toLocaleString('en-IN')} due</span>
                                      {inst.paidAmount > 0 && <> · paid ₹{inst.paidAmount.toLocaleString('en-IN')}</>}
                                      {inst.writeOffAmount > 0 && <> · disc ₹{inst.writeOffAmount.toLocaleString('en-IN')}</>}
                                    </>
                                  )}
                                  {isPaid && inst.writeOffAmount > 0 && (
                                    <> · <span className="text-indigo-600">₹{inst.writeOffAmount.toLocaleString('en-IN')} disc.</span></>
                                  )}
                                </div>

                                {/* Compact action row — only renders when
                                    the row is actionable or has activity.
                                    Slim buttons that match the row height. */}
                                {(isActionable || inst.paidAmount > 0 || inst.writeOffAmount > 0) && (
                                  <div className="mt-2 flex items-center gap-1.5">
                                    {isActionable && (
                                      <button
                                        onClick={() => openRowPay(inst)}
                                        className={`flex-1 flex items-center justify-center gap-1 text-[11px] font-black active:scale-[0.98] py-1.5 rounded-md transition-all ${
                                          isPastDue
                                            ? 'text-white bg-emerald-600 hover:bg-emerald-700'
                                            : 'text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100'
                                        }`}>
                                        <IndianRupee size={11} />
                                        {isPastDue ? `Pay ₹${due.toLocaleString('en-IN')}` : `Pay early ₹${due.toLocaleString('en-IN')}`}
                                      </button>
                                    )}
                                    {(inst.paidAmount > 0 || inst.writeOffAmount > 0) && (() => {
                                      const isOpen = expandedInstId === inst.id;
                                      return (
                                        <button
                                          onClick={() => setExpandedInstId(isOpen ? null : inst.id)}
                                          className={`${isActionable ? '' : 'flex-1'} flex items-center justify-center gap-1 text-[11px] font-black text-slate-600 px-2.5 py-1.5 rounded-md border border-slate-200 hover:bg-slate-50 transition-colors`}>
                                          {isOpen ? 'Hide' : 'History'} <ChevronDown size={10} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
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
                                        // Historic 'GOVERNMENT' method rows (pre-0083) shown as
                                        // a regular Payment now — RTE distinction is gone.
                                        const methodLabel = (p.method || '').toUpperCase() === 'GOVERNMENT'
                                          ? 'Payment'
                                          : (p.method || 'Payment');
                                        return (
                                          <div key={p.id}
                                            className={`rounded-xl p-3 bg-slate-50/60 ${reversed ? 'opacity-50' : ''}`}>
                                            <div className="flex items-start justify-between gap-2">
                                              <div className="min-w-0">
                                                <div className={`text-[13px] font-black ${isReversal ? 'text-rose-600' : 'text-slate-900'} ${reversed ? 'line-through' : ''}`}>
                                                  {isReversal ? 'Reversed' : methodLabel}
                                                </div>
                                                <div className="text-[10px] font-bold text-slate-400 mt-0.5">{p.date}</div>
                                              </div>
                                              <div className={`text-[14px] font-black tabular-nums shrink-0 ${isReversal ? 'text-rose-600' : 'text-emerald-700'} ${reversed ? 'line-through' : ''}`}>
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
                        };
                  return (
                  <div className="space-y-4">
                    {realInsts.length > 0 && (
                      <div>
                        <div className="px-3 mb-1 flex items-center gap-2">
                          <span className="text-[10px] font-black uppercase tracking-widest text-indigo-700">Monthly Schedule</span>
                          <span className="text-[10px] font-bold text-slate-400">· {realInsts.length} months</span>
                        </div>
                        <div className="pl-3 space-y-1.5">
                          {realInsts.map(renderInst)}
                        </div>
                      </div>
                    )}
                    {oneTimeInsts.length > 0 && (
                      <div>
                        <div className="px-3 mb-1 flex items-center gap-2">
                          <span className="text-[10px] font-black uppercase tracking-widest text-amber-700">One-Time Fees</span>
                          <span className="text-[10px] font-bold text-slate-400">· {oneTimeInsts.length}</span>
                        </div>
                        <div className="pl-3 space-y-1.5">
                          {oneTimeInsts.map(renderInst)}
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
            // Single payment stream — RTE/govt cross-linked transfers
            // dropped in 0083. Government grants now appear as regular
            // payments with a "Govt grant" note in this same timeline.
            const items: Array<{ date: string; payload: PaymentRecord }> =
              paymentTransactions.filter(t => t.studentId === selected.studentId)
                .map(p => ({ date: p.date, payload: p }))
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            if (items.length === 0) return (
              <div className="flex flex-col items-center py-16 text-slate-400">
                <Receipt size={32} className="mb-3 opacity-40" />
                <p className="font-bold text-sm">No transactions yet</p>
              </div>
            );
            const txns = paymentTransactions.filter(t => t.studentId === selected.studentId);
            const totalCash     = txns.filter(t => !t.reversedAt && !t.reversesPaymentId).reduce((s, t) => s + t.amount, 0);
            const totalDiscount = txns.reduce((s, t) => s + (t.discountAmount ?? 0), 0);
            return (
              <>
              {/* Summary strip — two numbers, no chrome */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 text-center">
                  <div className="text-sm lg:text-base font-black text-emerald-700 tabular-nums">₹{totalCash.toLocaleString('en-IN')}</div>
                  <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Cash</div>
                </div>
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2 text-center">
                  <div className="text-sm lg:text-base font-black text-indigo-700 tabular-nums">₹{totalDiscount.toLocaleString('en-IN')}</div>
                  <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Discount</div>
                </div>
              </div>

              {/* Unified timeline — vertical rail with one dot per entry,
                  colour-coded by kind. Cash = emerald, discount = indigo.
                  Mirrors the schedule timeline so the two tabs read as
                  a coherent visual system. */}
              <div className="relative pl-5 lg:pl-6">
                <div className="absolute left-2 lg:left-2.5 top-1 bottom-1 w-px bg-slate-200" />
                <div className="space-y-3">
                {items.map(item => {
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
          // Allocation rule (mirrors record_fee_payment RPC since 0084):
          //   1) Apply discount up to outstanding (excess is overpay)
          //   2) Apply cash to remaining
          //   3) Cash + discount > outstanding ⇒ overpay (server rejects)
          // Advance credit feature removed in 0084.
          const discountUsed     = Math.min(disc, totalDueNow);
          const afterDisc        = Math.max(0, totalDueNow - discountUsed);
          const cashUsed         = Math.min(cash, afterDisc);
          const cleared          = discountUsed + cashUsed;
          const remainingAfter   = Math.max(0, totalDueNow - cleared);
          const overpay          = Math.max(0, (cash + disc) - totalDueNow);
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

              {/* Total due — anchor number, light surface for legibility.
                  The earlier dark slate-900 tile was hard on the eyes
                  inside an otherwise light modal. Now: rose tint when
                  there's outstanding (matches the principal's "this is
                  owed" mental model), emerald when fully cleared. */}
              <div className={`rounded-2xl p-4 mb-4 border ${
                totalDueNow > 0
                  ? 'bg-rose-50 border-rose-200'
                  : 'bg-emerald-50 border-emerald-200'
              }`}>
                <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${
                  totalDueNow > 0 ? 'text-rose-600' : 'text-emerald-700'
                }`}>
                  Total Due
                </p>
                <p className={`text-3xl font-black tabular-nums ${
                  totalDueNow > 0 ? 'text-rose-700' : 'text-emerald-700'
                }`}>
                  ₹{totalDueNow.toLocaleString('en-IN')}
                </p>
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

              {/* Cash field — full-width, primary input. Discount lives
                  behind More Options (rare action; cluttered the primary
                  flow when always-visible). */}
              <div className="mb-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700 mb-1.5">Cash Received</p>
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-2">
                  <IndianRupee size={18} className="text-emerald-600 shrink-0" />
                  <input type="number" min="0" value={payAmount}
                    onChange={e => setPayAmount(e.target.value)}
                    placeholder="0" className="flex-1 bg-transparent font-black text-emerald-900 text-2xl outline-none w-full" />
                </div>
              </div>
              <p className="text-[10px] font-bold text-slate-400 mb-4">
                Auto-allocates to oldest dues first.
              </p>

              {/* Live result — what'll actually happen on submit. With
                  advance credit removed (0084), the only states are:
                  partial pay, exact clear, or overpay (blocked). */}
              {(cash > 0 || disc > 0) && (
                <div className={`rounded-xl border px-3 py-3 mb-3 ${
                  overpay > 0 ? 'bg-rose-50 border-rose-200' :
                  remainingAfter > 0 ? 'bg-amber-50 border-amber-200' :
                                       'bg-emerald-50 border-emerald-200'
                }`}>
                  <div className="flex items-center justify-between text-[11px] font-black mb-1">
                    <span className="text-slate-700">Will clear</span>
                    <span className={`tabular-nums ${
                      remainingAfter > 0 ? 'text-amber-700' : 'text-emerald-700'
                    }`}>₹{cleared.toLocaleString('en-IN')}</span>
                  </div>
                  {remainingAfter > 0 && (
                    <div className="flex items-center justify-between text-[10px] font-bold text-amber-700">
                      <span>Still due after this</span>
                      <span className="tabular-nums">₹{remainingAfter.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  {overpay > 0 && (
                    <div className="flex items-center justify-between text-[10px] font-bold text-rose-700 mt-0.5">
                      <span>Overpay — reduce by</span>
                      <span className="tabular-nums">₹{overpay.toLocaleString('en-IN')}</span>
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

              {/* More Options — discount, note, backdate. Hidden by
                  default to keep the primary cash flow on one screen. */}
              <details className="mb-3 group">
                <summary className="cursor-pointer text-[11px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5 select-none py-2">
                  <ChevronDown size={12} className="group-open:rotate-180 transition-transform" />
                  More options
                </summary>
                <div className="mt-2 space-y-3">
                  {/* Use Advance Credit toggle removed in 0084 —
                      advance credit feature dropped. */}
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
                        placeholder="0" className="flex-1 bg-transparent font-black text-indigo-900 text-lg outline-none w-full" />
                    </div>
                    <p className="text-[10px] font-bold text-slate-400 mt-1.5">
                      Reduces installments directly — never goes to advance credit.
                    </p>
                  </div>
                  <textarea value={paymentNote} onChange={e => setPaymentNote(e.target.value)}
                    rows={2} placeholder="Note (e.g., scholarship reason, txn id)…"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-blue-500 resize-none" />
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" checked={useCustomDate} onChange={e => { setUseCustomDate(e.target.checked); if (!e.target.checked) setPaymentDate(''); }}
                      className="accent-slate-600 w-4 h-4" />
                    <span className="text-[11px] font-black text-slate-700">Backdate this payment</span>
                  </label>
                  {useCustomDate && (
                    <input type="date" value={paymentDate} max={todayIST()}
                      onChange={e => setPaymentDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 outline-none" />
                  )}
                </div>
              </details>

              <button onClick={handlePayment}
                disabled={paySubmitting || (!payAmount && !paymentDiscount) || overpay > 0}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-black rounded-xl disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all">
                {paySubmitting
                  ? <><RefreshCw size={16} className="animate-spin" /> Saving payment…</>
                  : overpay > 0
                    ? <>Overpay — reduce by ₹{overpay.toLocaleString('en-IN')}</>
                    : <><CheckCircle2 size={16} /> Collect & Generate Receipt</>
                }
              </button>
            </div>
          </div>
          );
        })()}

        {/* ── DISCOUNT MODAL ────────────────────────────────────────────────── */}

        {/* RTE Govt Pay modal removed in 0083 — government grants now
            flow through the standard Collect Payment modal with a
            "Govt grant" note for accounting clarity. */}

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
                  <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-600 flex items-center gap-1">
                    {METHOD_ICON[rowPayMethod]} {METHOD_LABEL[rowPayMethod]}
                  </span>
                  {Number(rowPayDiscount) > 0 && (
                    <span className="px-2 py-1 rounded-full bg-indigo-50 text-indigo-700">
                      Discount ₹{Number(rowPayDiscount).toLocaleString('en-IN')}
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
                      {/* Advance credit toggle removed in 0084 — feature
                          dropped to keep collection flow simple. Discount
                          + Method + Note remain. */}
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
                    || ((Number(rowPayAmount) || 0) + (Number(rowPayDiscount) || 0) === 0)
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
            <div className="text-[9px] lg:text-[11px] font-black text-slate-400 uppercase tracking-widest mt-0.5 lg:mt-1">Total Due</div>
          </div>
        </div>

        {/* Search + tabs — stacked mobile, single row desktop */}
        <div className="px-4 lg:px-6 pb-3 lg:pb-4 space-y-2 lg:space-y-0 lg:flex lg:items-center lg:gap-3 border-t border-slate-100 pt-3 lg:pt-4">
          <div className="relative lg:flex-1">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => { setSearch(e.target.value); stuList.setSearch(e.target.value); }}
              placeholder="Search by name or admission no…"
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-2.5 lg:py-3 text-sm font-bold outline-none focus:border-blue-500 transition-colors" />
          </div>
          {/* Filter tabs — All / Due / Cleared narrow the student list
              below. History opens the Parent Submissions log inline. */}
          {/* Order intentional: Due (act now) → Upcoming (forecast) →
              Cleared (done) → History (audit). ALL tab dropped — Due +
              Upcoming + Cleared partition the cohort and ALL was
              redundant for triage. Pending stays implicit (no schedule
              students are flagged separately on each card). */}
          <div className="flex gap-2 shrink-0 overflow-x-auto">
            {(['DUE', 'UPCOMING', 'CLEARED', 'HISTORY'] as const).map(t => (
              <button key={t} onClick={() => setListTab(t)}
                className={`shrink-0 px-3 lg:px-5 py-1.5 lg:py-2.5 rounded-xl text-[10px] lg:text-xs font-black uppercase tracking-widest transition-colors ${listTab === t
                  ? t === 'DUE'      ? 'bg-rose-600 text-white'
                    : t === 'UPCOMING' ? 'bg-amber-500 text-white'
                    : t === 'CLEARED'  ? 'bg-emerald-600 text-white'
                    :                    'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                {t === 'DUE'      ? `Due (${dueStudents.length})`
                  : t === 'UPCOMING' ? `Upcoming (${upcomingStudents.length})`
                  : t === 'CLEARED'  ? `Cleared (${clearedStudents.length})`
                  :                    'History'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto lg:overflow-visible p-4 lg:p-0 lg:pt-2">
        {/* HISTORY tab — full submissions log (approved + rejected +
            pending), newest first. On other tabs we surface the queue
            ONLY when there's something pending awaiting review;
            otherwise no inline banner — the History tab is the
            dedicated home for the audit trail. */}
        {listTab === 'HISTORY' ? (
          <FeePaymentSubmissionsQueue defaultExpanded />
        ) : (
          <>
            {/* Pending banner — auto-hides when there are 0 pending
                items (the queue component itself returns null in that
                case now). Keeps the surface clean unless action is
                actually needed. */}
            <div className="mb-3 lg:mb-4 empty:hidden">
              <FeePaymentSubmissionsQueue pendingOnly />
            </div>

            {/* Initial load: show skeleton rows so the page doesn't flash
                an empty state before the first batch lands. After the
                first page lands, "No students" only renders when the
                filter genuinely matches zero. */}
            {visibleStudents.length === 0 && stuList.loading && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <SkeletonRow count={6} />
              </div>
            )}
            {visibleStudents.length === 0 && !stuList.loading && (
              <EmptyState
                icon={Users}
                title="No students match"
                hint="Try changing the class or status filter — or admit a new student from the Students tab."
              />
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 lg:gap-3">
              {pagedStudents.map(student => {
            // Source-of-truth for badges:
            //  1) If installments are primed in cache → use them (richer:
            //     per-row outstanding, discount-aware Cleared).
            //  2) Else fall back to slim-list aggregates from
            //     student_academic_records (totalFee/paidFee/feeStatus).
            //     These are kept fresh by a DB trigger after every payment.
            //     Without (2), every unopened student showed "No schedule /
            //     Pending" even when they had a real, paid schedule.
            const pd = getParentDue(student.studentId);
            const slim = slimFeeMap.get(student.studentId);
            const hasCachedInstallments = student.installments.length > 0;

            // No schedule = the row genuinely has no totalFee anywhere
            // (slim aggregate AND cache both empty).
            const slimTotal = slim?.totalFee ?? 0;
            const noSchedule = !hasCachedInstallments && slimTotal === 0;

            // Totals: prefer cache when primed (live + discount-aware),
            // else use slim aggregates.
            const totalD = hasCachedInstallments
              ? student.installments.reduce((a, i) => a + i.amount, 0)
              : slimTotal;
            const totalC = hasCachedInstallments
              ? student.installments.reduce((a, i) => a + i.paidAmount + i.writeOffAmount, 0)
              : (slim?.paidFee ?? 0);
            const pct = totalD > 0 ? Math.min(100, Math.round((totalC / totalD) * 100)) : 0;

            // Outstanding: cache wins (it's the only source that knows
            // discount); slim falls back to `currentDue` from the server
            // (already filtered to due_date <= today). Earlier this used
            // totalFee - paidFee which included the entire schedule and
            // contradicted the hub's overdue-only TOTAL DUE.
            const dueAmount = hasCachedInstallments
              ? pd.total
              : (slim?.currentDue ?? 0);
            const isDue = dueAmount > 0;

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
                    </div>
                    <div className="text-[10px] lg:text-[11px] font-bold text-slate-400">
                      {student.className} · {student.admissionNo}
                      {student.rollNo && <> · Roll #{student.rollNo}</>}
                    </div>

                    {/* Mini progress bar */}
                    <div className="mt-2 h-1 lg:h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${noSchedule ? 'bg-amber-300' : pct === 100 ? 'bg-emerald-500' : 'bg-blue-400'}`} style={{ width: `${noSchedule ? 0 : pct}%` }} />
                    </div>
                    <div className="text-[9px] lg:text-[10px] font-bold text-slate-400 mt-0.5">
                      {noSchedule
                        ? 'No schedule'
                        : hasCachedInstallments
                          ? `${pct}% cleared · ${student.installments.length} installments`
                          : `${pct}% cleared`}
                    </div>
                  </div>

                  {/* Right: due amount, "due in N days" forecast, or cleared
                      badge depending on the active tab. */}
                  <div className="shrink-0 text-right">
                    {(() => {
                      if (noSchedule) {
                        return (
                          <span className="flex items-center gap-0.5 text-[9px] lg:text-[10px] font-black text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full">
                            <AlertCircle size={10} /> Pending
                          </span>
                        );
                      }
                      // UPCOMING tab: surface next-due forecast instead of
                      // overdue amount. "Due in N days" + the upcoming
                      // installment's amount so the principal can see
                      // who's about to need a nudge.
                      if (listTab === 'UPCOMING') {
                        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
                        const nextDate = hasCachedInstallments
                          ? (student.installments
                              .filter(i => i.dueDate > today && i.status !== 'PAID')
                              .map(i => i.dueDate)
                              .sort()[0] ?? null)
                          : (slim?.nextDueDate ?? null);
                        const daysLeft = nextDate
                          ? Math.max(0, Math.round((new Date(nextDate).getTime() - new Date(today).getTime()) / 86_400_000))
                          : null;
                        const upcomingAmount = hasCachedInstallments
                          ? student.installments
                              .filter(i => i.dueDate > today && i.status !== 'PAID')
                              .reduce((a, i) => a + Math.max(0, i.amount - i.paidAmount - i.writeOffAmount), 0)
                          : (slim?.upcomingTotal ?? 0);
                        return (
                          <>
                            <div className="font-black text-amber-600 text-sm lg:text-base">₹{upcomingAmount.toLocaleString('en-IN')}</div>
                            {daysLeft !== null && (
                              <div className="text-[9px] lg:text-[10px] font-black text-slate-500 mt-0.5">
                                {daysLeft === 0 ? 'Due today' :
                                 daysLeft === 1 ? 'Due tomorrow' :
                                 `Due in ${daysLeft} days`}
                              </div>
                            )}
                          </>
                        );
                      }
                      if (isDue) {
                        return (
                          <>
                            <div className="font-black text-rose-600 text-sm lg:text-base">₹{dueAmount.toLocaleString('en-IN')}</div>
                            {/* Tuition / Transport sub-chips need the cache —
                                shown only when installments primed. */}
                            {hasCachedInstallments && (
                              <div className="flex gap-1 mt-1 justify-end flex-wrap">
                                {pd.tuition > 0 && <span className="text-[8px] lg:text-[9px] font-black bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded-full">Tuition</span>}
                                {pd.transport > 0 && <span className="text-[8px] lg:text-[9px] font-black bg-orange-50 text-orange-700 px-1.5 py-0.5 rounded-full">Transport</span>}
                              </div>
                            )}
                          </>
                        );
                      }
                      return (
                        <span className="flex items-center gap-0.5 text-[9px] lg:text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                          <CheckCircle2 size={10} /> Cleared
                        </span>
                      );
                    })()}
                  </div>
                  <ChevronRight size={15} className="text-slate-300 shrink-0" />
                </div>
              </button>
            );
          })}
        </div>

        {/* Server-paginated Load More — pulls the next slim page from the
            DB. Local-tab filter still narrows the visible page client-side
            (Pending/Due/Cleared) but the underlying source list grows
            incrementally so we never download the whole school upfront. */}
        {stuList.hasMore && (
          <button
            onClick={() => { void stuList.loadMore(); }}
            disabled={stuList.loading}
            className="w-full py-3 lg:py-4 mt-3 lg:mt-4 bg-white border border-slate-200 rounded-2xl text-xs font-black text-slate-500 uppercase tracking-widest active:scale-95 hover:bg-slate-50 transition-all disabled:opacity-60">
            {stuList.loading
              ? 'Loading…'
              : `Load More (${stuList.total - stuList.items.length} remaining)`}
          </button>
        )}

        {!stuList.hasMore && stuList.items.length > PAGE_SIZE && (
          <p className="text-center text-[9px] font-bold text-slate-300 py-3 lg:py-4">
            All {stuList.total} students shown
          </p>
        )}
          </>
        )}
      </div>
    </div>
  );
};
