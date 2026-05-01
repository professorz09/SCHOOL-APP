import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft, IndianRupee, CheckCircle2, AlertTriangle, Clock, X,
  ShieldCheck, Search, Printer, Banknote, Smartphone, CreditCard,
  Building2, FileCheck, ChevronRight, Receipt, TrendingDown, Users, Filter,
  RefreshCw, Download, ChevronDown,
} from 'lucide-react';
import { feeService, FeeInstallment, FeeStatus, FeeType, PaymentRecord, GovernmentPaymentRecord } from '../../../services/fee.service';
import { studentService } from '../../../services/student.service';
import { principalService, FeeStructureRecord } from '../../../services/principal.service';
import { useUIStore } from '../../../store/uiStore';
import { FeePaymentSubmissionsQueue } from './FeePaymentSubmissionsQueue';

type YearGroup = { academicYearId: string; yearLabel: string; isActive: boolean; installments: FeeInstallment[] };

type PaymentMethod = 'CASH' | 'UPI' | 'NET_BANKING' | 'CHEQUE' | 'ONLINE';
type ListTab = 'ALL' | 'DUE' | 'CLEARED';

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
const STATUS_COLOR: Record<FeeStatus, string> = {
  PAID:        'bg-emerald-50 text-emerald-700 border-emerald-200',
  PARTIAL:     'bg-amber-50 text-amber-700 border-amber-200',
  UNPAID:      'bg-rose-50 text-rose-700 border-rose-200',
  OVERDUE:     'bg-red-100 text-red-700 border-red-300',
  WAIVED:      'bg-slate-100 text-slate-500 border-slate-200',
  WRITTEN_OFF: 'bg-slate-100 text-slate-500 border-slate-200',
  CANCELLED:   'bg-slate-100 text-slate-500 border-slate-200 line-through',
};
const STATUS_BAR: Record<FeeStatus, string> = {
  PAID: 'bg-emerald-500', PARTIAL: 'bg-amber-400', UNPAID: 'bg-rose-400',
  OVERDUE: 'bg-red-500',
  WAIVED: 'bg-slate-300', WRITTEN_OFF: 'bg-slate-300',
  CANCELLED: 'bg-slate-300',
};
const STATUS_ICON = (s: FeeStatus) => {
  if (s === 'PAID')    return <CheckCircle2 size={11} className="text-emerald-500" />;
  if (s === 'PARTIAL') return <AlertTriangle size={11} className="text-amber-500" />;
  if (s === 'UNPAID')  return <Clock size={11} className="text-rose-500" />;
  if (s === 'OVERDUE') return <AlertTriangle size={11} className="text-red-600" />;
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
  const [students, setStudents]       = useState<StudentFeeProfile[]>([]);
  const [loading, setLoading]         = useState(true);
  const [selected, setSelected]       = useState<StudentFeeProfile | null>(null);
  const [listTab, setListTab]         = useState<ListTab>('ALL');
  const [search, setSearch]           = useState('');
  const [detailTab, setDetailTab]     = useState<'SCHEDULE' | 'HISTORY'>('SCHEDULE');
  const [showCount, setShowCount]     = useState(PAGE_SIZE);

  // Modal states
  const [payModal, setPayModal]             = useState(false);
  const [writeOffModal, setWriteOffModal]   = useState<FeeInstallment | null>(null);
  const [govtPayModal, setGovtPayModal]     = useState(false);
  const [receiptModal, setReceiptModal]     = useState<PaymentRecord | null>(null);
  const [regenModal, setRegenModal]         = useState(false);

  // Form states
  const [payAmount, setPayAmount]           = useState('');
  const [paymentMethod, setPaymentMethod]   = useState<PaymentMethod>('CASH');
  const [paymentNote, setPaymentNote]       = useState('');
  const [writeOffAmount, setWriteOffAmount] = useState('');
  const [writeOffReason, setWriteOffReason] = useState('');
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
        const rows = await principalService.getFeeStructures();
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
      ?? '';
    if (!yearId) {
      showToast('No active academic year for this student', 'error');
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

  const handleDownloadPdf = async (r: PaymentRecord) => {
    const node = receiptCardRef.current;
    if (!node) { showToast('Receipt not ready', 'error'); return; }
    try {
      const [{ default: html2canvas }, jspdfMod] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);
      const jsPDF = (jspdfMod as { jsPDF: new (o: object) => { addImage: (d: string, t: string, x: number, y: number, w: number, h: number) => void; save: (n: string) => void; internal: { pageSize: { getWidth: () => number; getHeight: () => number } } } }).jsPDF;
      const canvas = await html2canvas(node, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
      const img = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      // Fit into a 60-pt margin while preserving aspect ratio.
      const ratio  = canvas.width / canvas.height;
      const maxW   = pageW - 80;
      const maxH   = pageH - 80;
      const drawW  = ratio >= maxW / maxH ? maxW : maxH * ratio;
      const drawH  = ratio >= maxW / maxH ? maxW / ratio : maxH;
      pdf.addImage(img, 'PNG', (pageW - drawW) / 2, 40, drawW, drawH);
      pdf.save(`receipt-${r.receiptNo}.pdf`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'PDF export failed', 'error');
    }
  };

  const handlePayment = async () => {
    if (!selected || !payAmount) return;
    const amount = Number(payAmount);
    if (isNaN(amount) || amount <= 0) return;
    try {
      const result = await feeService.recordPayment(
        selected.studentId, amount, METHOD_LABEL[paymentMethod],
        undefined, paymentNote || undefined, false, applyLateFee,
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
      const canonical = feeService.getPaymentRecordById(result.paymentId);
      setPaymentTransactions(feeService.getPaymentHistory());
      if (canonical) setReceiptModal(canonical);
      // Refresh per-year accordion totals so the schedule tab reflects the
      // freshly-allocated payment without requiring the principal to reselect
      // the student.
      await reloadYearGroups(selected.studentId);
      setPayAmount('');
      setPaymentNote('');
      setPayModal(false);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Payment failed', 'error');
    }
  };

  const handleWriteOff = async () => {
    if (!writeOffModal || !writeOffReason.trim()) return;
    const amount = Number(writeOffAmount) || writeOffModal.amount - writeOffModal.paidAmount;
    if (await feeService.writeOffFee(writeOffModal.id, amount, writeOffReason)) {
      const updated = feeService.getStudentFeeProfile(selected!.studentId, selected!.name, selected!.className, selected!.admissionNo, selected!.isRte);
      updateStudent(updated);
      setWriteOffModal(null);
      setWriteOffAmount('');
      setWriteOffReason('');
      showToast('Fee write-off recorded');
    }
  };

  const handlePrintReceipt = (r: PaymentRecord) => {
    const breakdown = r.installmentDetails.length > 0
      ? `<table style="width:100%;border-collapse:collapse;margin:12px 0;">
          <thead><tr><th style="text-align:left;font-size:10px;color:#64748b;padding:4px 0;border-bottom:1px solid #e2e8f0;">Month / Type</th><th style="text-align:right;font-size:10px;color:#64748b;padding:4px 0;border-bottom:1px solid #e2e8f0;">Amount</th></tr></thead>
          <tbody>
            ${r.installmentDetails.map(d => `<tr><td style="font-size:12px;padding:5px 0;border-bottom:1px solid #f1f5f9;">${d.month} · ${FEE_TYPE_LABEL[d.feeType]}</td><td style="text-align:right;font-size:12px;font-weight:700;padding:5px 0;border-bottom:1px solid #f1f5f9;">₹${d.amount.toLocaleString('en-IN')}</td></tr>`).join('')}
            ${r.advanceAmount > 0 ? `<tr><td style="font-size:12px;color:#7c3aed;padding:5px 0;">Advance Credit</td><td style="text-align:right;font-size:12px;color:#7c3aed;font-weight:700;padding:5px 0;">₹${r.advanceAmount.toLocaleString('en-IN')}</td></tr>` : ''}
          </tbody>
        </table>`
      : '';
    const note = r.note ? `<div style="margin-top:12px;padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;"><p style="font-size:10px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin:0 0 4px;">Note</p><p style="font-size:13px;color:#475569;margin:0;">${r.note}</p></div>` : '';
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Fee Receipt – ${r.receiptNo}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; }
    body { background: #fff; padding: 32px; max-width: 420px; margin: auto; color: #1e293b; }
    .school { text-align: center; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 2px dashed #e2e8f0; }
    .school h1 { font-size: 18px; font-weight: 900; letter-spacing: .04em; text-transform: uppercase; }
    .school p { font-size: 10px; color: #94a3b8; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; margin-top: 4px; }
    .badge { display: inline-block; margin-top: 8px; background: #d1fae5; color: #065f46; font-size: 11px; font-weight: 900; padding: 3px 14px; border-radius: 999px; }
    .row { display: flex; justify-content: space-between; align-items: center; padding: 5px 0; border-bottom: 1px solid #f1f5f9; }
    .row span:first-child { font-size: 11px; color: #64748b; font-weight: 600; }
    .row span:last-child { font-size: 12px; font-weight: 800; color: #1e293b; }
    .total { display: flex; justify-content: space-between; align-items: center; background: #1e293b; color: #fff; padding: 12px 16px; border-radius: 10px; margin-top: 14px; }
    .total span:first-child { font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: .06em; }
    .total span:last-child { font-size: 20px; font-weight: 900; }
    .footer { margin-top: 24px; text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px dashed #e2e8f0; padding-top: 12px; }
  </style>
</head>
<body>
  <div class="school">
    <h1>EduGrow School</h1>
    <p>Fee Receipt</p>
    <div class="badge">PAID ✓</div>
  </div>
  <div class="row"><span>Receipt No.</span><span>${r.receiptNo}</span></div>
  <div class="row"><span>Date</span><span>${r.date}</span></div>
  <div class="row"><span>Student</span><span>${r.studentName}</span></div>
  <div class="row"><span>Class</span><span>${r.className}</span></div>
  <div class="row"><span>Adm. No.</span><span>${r.admissionNo}</span></div>
  <div class="row"><span>Method</span><span>${r.method}</span></div>
  ${breakdown}
  <div class="total"><span>Total Paid</span><span>₹${r.amount.toLocaleString('en-IN')}</span></div>
  ${note}
  <div class="footer">EduGrow School Management System · Thank you</div>
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

  // ─── Loading ─────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="w-full bg-slate-50 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
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

  const dueStudents     = students.filter(s => hasDue(s));
  const clearedStudents = students.filter(s => !hasDue(s));
  const totalParentDue  = dueStudents.reduce((a, s) => a + getParentDue(s.studentId).total, 0);
  const totalGovtDue    = dueStudents.filter(s => s.isRte).reduce((a, s) => a + getGovtDue(s.studentId).total, 0);
  const totalCollected  = students.reduce((a, s) => {
    return a + s.installments.reduce((b, i) => b + i.paidAmount, 0);
  }, 0);

  const visibleStudents = students.filter(s => {
    if (!searchMatch(s)) return false;
    if (listTab === 'DUE')     return hasDue(s);
    if (listTab === 'CLEARED') return !hasDue(s);
    return true;
  });

  // Reset page when filter/search changes
  useEffect(() => { setShowCount(PAGE_SIZE); }, [search, listTab]);
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
      <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        {/* Header */}
        <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 shadow-sm sticky top-0 z-10">
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => setSelected(null)} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
              <ArrowLeft size={20} />
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-black text-slate-900 text-lg truncate">{selected.name}</span>
                {selected.isRte && <span className="flex items-center gap-0.5 text-[9px] font-black bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full"><ShieldCheck size={9} /> RTE</span>}
              </div>
              <p className="text-[10px] font-bold text-slate-400">{selected.className} · {selected.admissionNo}</p>
            </div>
          </div>

          {/* Summary tiles */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="bg-slate-50 rounded-xl p-2.5 text-center">
              <div className="text-base font-black text-slate-900">₹{totalPaid.toLocaleString('en-IN')}</div>
              <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Collected</div>
            </div>
            <div className="bg-rose-50 rounded-xl p-2.5 text-center">
              <div className="text-base font-black text-rose-600">₹{parentSummary.total.toLocaleString('en-IN')}</div>
              <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Parent Due</div>
            </div>
            {selected.isRte ? (
              <div className="bg-emerald-50 rounded-xl p-2.5 text-center">
                <div className="text-base font-black text-emerald-600">₹{govtSummary.total.toLocaleString('en-IN')}</div>
                <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Govt Due</div>
              </div>
            ) : (
              <div className="bg-indigo-50 rounded-xl p-2.5 text-center">
                <div className="text-base font-black text-indigo-600">{pct}%</div>
                <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Paid</div>
              </div>
            )}
          </div>

          {/* Progress bar */}
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
          </div>

          {/* Advance credit */}
          {advance > 0 && (
            <div className="mt-2 flex items-center justify-between bg-violet-50 border border-violet-200 rounded-xl px-3 py-2">
              <span className="text-[10px] font-black text-violet-600">Advance Credit</span>
              <span className="text-sm font-black text-violet-700">₹{advance.toLocaleString('en-IN')}</span>
            </div>
          )}
        </div>

        {/* Tab bar */}
        <div className="bg-white border-b border-slate-100 px-4 flex gap-5">
          {(['SCHEDULE', 'HISTORY'] as const).map(t => (
            <button key={t} onClick={() => setDetailTab(t)}
              className={`py-3 text-[10px] font-black uppercase tracking-widest border-b-2 transition-colors ${detailTab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400'}`}>
              {t === 'SCHEDULE' ? 'Fee Schedule' : 'Payment History'}
            </button>
          ))}
          <button onClick={openRegenModal}
            className={`${selected.isRte ? '' : 'ml-auto'} my-2 flex items-center gap-1 bg-amber-50 text-amber-700 text-[10px] font-black px-3 py-1.5 rounded-xl border border-amber-200 active:scale-95 transition-transform`}>
            <RefreshCw size={11} /> Regenerate
          </button>
          {selected.isRte && (
            <button onClick={() => setGovtPayModal(true)}
              className="ml-auto my-2 flex items-center gap-1 bg-blue-50 text-blue-700 text-[10px] font-black px-3 py-1.5 rounded-xl border border-blue-200 active:scale-95 transition-transform">
              <ShieldCheck size={11} /> Govt Pay
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4  space-y-3">

          {/* ── COLLECT BUTTON (inside schedule tab) ──────────────────────── */}
          {detailTab === 'SCHEDULE' && (
            <button onClick={() => setPayModal(true)}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white font-black text-sm py-3.5 rounded-2xl shadow-md active:scale-[0.98] transition-transform">
              <IndianRupee size={16} /> Collect Payment
            </button>
          )}

          {/* ── FEE SCHEDULE — grouped by academic year ───────────────────── */}
          {detailTab === 'SCHEDULE' && (yearGroups.length > 0
            ? yearGroups
            : [{
                academicYearId: '__legacy__',
                yearLabel: 'Current Year',
                isActive: true,
                installments: selected.installments,
              }]
          ).map(group => {
            const collapsed = !!collapsedYears[group.academicYearId];
            const yearTotal = group.installments.reduce((a, i) => a + i.amount, 0);
            const yearPaid  = group.installments.reduce((a, i) => a + i.paidAmount, 0);
            const yearDue   = group.installments.reduce((a, i) => a + Math.max(0, i.amount - i.paidAmount - i.writeOffAmount), 0);
            return (
              <div key={group.academicYearId} className="space-y-3">
                <button
                  onClick={() => setCollapsedYears(prev => ({ ...prev, [group.academicYearId]: !prev[group.academicYearId] }))}
                  className="w-full flex items-center justify-between bg-white border border-slate-200 rounded-2xl px-4 py-3 active:scale-[0.99] transition-transform">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-black text-slate-900 text-sm truncate">{group.yearLabel}</span>
                    {group.isActive && <span className="text-[8px] font-black bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">ACTIVE</span>}
                    <span className="text-[10px] font-bold text-slate-400">· {group.installments.length} items</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <div className="text-[10px] font-black text-emerald-600">Paid ₹{yearPaid.toLocaleString('en-IN')}</div>
                      {yearDue > 0 && <div className="text-[10px] font-black text-rose-500">Due ₹{yearDue.toLocaleString('en-IN')}</div>}
                      {yearDue === 0 && <div className="text-[10px] font-black text-slate-400">of ₹{yearTotal.toLocaleString('en-IN')}</div>}
                    </div>
                    <ChevronDown size={16} className={`text-slate-400 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
                  </div>
                </button>

                {!collapsed && group.installments
                  .slice()
                  .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
                  .map(inst => {
              const due = inst.amount - inst.paidAmount - inst.writeOffAmount;
              const receipt = feeService.getPaymentRecordByInstallmentId(inst.id);
              return (
                <div key={inst.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  {/* Status left strip */}
                  <div className="flex">
                    <div className={`w-1 shrink-0 ${STATUS_BAR[inst.status] ?? STATUS_BAR_FALLBACK}`} />
                    <div className="flex-1 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-extrabold text-slate-900 text-sm">{inst.month}</span>
                            <span className={`text-[8px] font-black px-2 py-0.5 rounded-full ${FEE_TYPE_COLOR[inst.feeType]}`}>
                              {FEE_TYPE_LABEL[inst.feeType]}
                            </span>
                            {inst.payerType === 'GOVERNMENT' && (
                              <span className="text-[8px] font-black px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                                RTE
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] font-bold text-slate-400">Due: {inst.dueDate}</div>
                          {inst.writeOffReason && (
                            <div className="text-[9px] font-bold text-slate-400 mt-0.5 italic">Waived: {inst.writeOffReason}</div>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-black text-slate-900">₹{inst.amount.toLocaleString('en-IN')}</div>
                          {inst.paidAmount > 0 && <div className="text-[10px] font-bold text-emerald-600">Paid ₹{inst.paidAmount.toLocaleString('en-IN')}</div>}
                          {inst.writeOffAmount > 0 && <div className="text-[10px] font-bold text-slate-400">Waived ₹{inst.writeOffAmount.toLocaleString('en-IN')}</div>}
                          {due > 0 && <div className="text-[10px] font-bold text-rose-500">Due ₹{due.toLocaleString('en-IN')}</div>}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span className={`flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-full border ${STATUS_COLOR[inst.status] ?? STATUS_COLOR_FALLBACK}`}>
                          {STATUS_ICON(inst.status)} {inst.status}
                        </span>
                        {receipt && (
                          <button onClick={() => setReceiptModal(receipt)}
                            className="flex items-center gap-1 text-[9px] font-black text-indigo-600 px-2 py-0.5 rounded-full border border-indigo-200 bg-indigo-50">
                            <Printer size={9} /> Receipt
                          </button>
                        )}
                        {(inst.status === 'UNPAID' || inst.status === 'PARTIAL' || inst.status === 'OVERDUE') && due > 0 && (
                          <button onClick={() => setWriteOffModal(inst)}
                            className="flex items-center gap-1 text-[9px] font-black text-slate-400 px-2 py-0.5 rounded-full border border-slate-200">
                            <TrendingDown size={9} /> Write-off
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
                  })}
              </div>
            );
          })}

          {/* ── PAYMENT HISTORY ───────────────────────────────────────────── */}
          {detailTab === 'HISTORY' && (() => {
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
              <>
                {txns.map(txn => (
                  <button key={txn.id} onClick={() => setReceiptModal(txn)}
                    className="w-full text-left bg-white rounded-2xl border border-slate-100 shadow-sm p-4 active:scale-[0.98] transition-transform">
                    <div className="flex items-center justify-between mb-1">
                      <div>
                        <div className="font-extrabold text-slate-900 text-sm">{txn.date}</div>
                        <div className="text-[10px] font-bold text-slate-400">{txn.method} · #{txn.receiptNo}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-black text-emerald-600 text-base">₹{txn.amount.toLocaleString('en-IN')}</div>
                        {txn.note && <div className="text-[9px] font-bold text-slate-400 truncate max-w-[120px]">{txn.note}</div>}
                      </div>
                    </div>
                    {txn.installmentDetails.length > 0 && (
                      <div className="text-[9px] font-bold text-slate-400 mt-1.5">
                        → {txn.installmentDetails.map(d => d.month).join(', ')}
                      </div>
                    )}
                  </button>
                ))}

                {govtTxns.map(g => (
                  <div key={g.id}
                    className="bg-white rounded-2xl border border-emerald-100 shadow-sm p-4">
                    <div className="flex items-center justify-between mb-1">
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-extrabold text-slate-900 text-sm">{g.date}</span>
                          <span className="flex items-center gap-0.5 text-[8px] font-black bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                            <ShieldCheck size={8} /> Govt Transfer
                          </span>
                        </div>
                        <div className="text-[10px] font-bold text-slate-400">Ref: {g.referenceNo}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-black text-emerald-600 text-base">₹{g.amount.toLocaleString('en-IN')}</div>
                        <div className="text-[9px] font-bold text-slate-400">RTE / Total batch</div>
                      </div>
                    </div>
                    {g.note && (
                      <div className="text-[9px] font-bold text-slate-400 mt-1.5 italic">{g.note}</div>
                    )}
                  </div>
                ))}
              </>
            );
          })()}
        </div>

        {/* ── PAY MODAL ────────────────────────────────────────────────────── */}
        {payModal && (
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end">
            <div className="w-full bg-white rounded-t-3xl p-6 pb-8 animate-in slide-in-from-bottom-8">
              <div className="flex justify-between items-center mb-5">
                <div>
                  <h3 className="text-lg font-black text-slate-900">Collect Payment</h3>
                  <p className="text-[10px] font-bold text-slate-400">{selected.name} · {selected.className}</p>
                </div>
                <button onClick={() => { setPayModal(false); setPayAmount(''); }}
                  className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500">
                  <X size={16} />
                </button>
              </div>

              {/* Method pills */}
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Method</p>
              <div className="flex gap-2 flex-wrap mb-4">
                {(Object.keys(METHOD_LABEL) as PaymentMethod[]).map(m => (
                  <button key={m} onClick={() => setPaymentMethod(m)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black border transition-colors ${paymentMethod === m ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                    {METHOD_ICON[m]} {METHOD_LABEL[m]}
                  </button>
                ))}
              </div>

              {/* Amount */}
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Amount Received</p>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center gap-2 mb-1">
                <IndianRupee size={20} className="text-slate-400 shrink-0" />
                <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)}
                  placeholder="0" className="flex-1 bg-transparent font-black text-slate-900 text-2xl outline-none" />
              </div>
              {advance > 0 && (
                <div className="flex items-center justify-between bg-violet-50 border border-violet-200 rounded-xl px-3 py-2 mb-3">
                  <span className="text-[10px] font-black text-violet-600">Advance Credit</span>
                  <span className="text-sm font-black text-violet-700">₹{advance.toLocaleString('en-IN')}</span>
                </div>
              )}

              {/* Late-fee preview — recomputed every time the modal opens.
                  Per-installment breakdown helps the principal explain to the
                  parent exactly which dues triggered the late fee and by how
                  many days they are overdue. */}
              {lateFeeTotal > 0 && (
                <div className={`rounded-xl px-3 py-2.5 mb-3 border ${applyLateFee ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-[10px] font-black ${applyLateFee ? 'text-amber-700' : 'text-slate-500 line-through'}`}>Late Fee (overdue dues)</span>
                    <span className={`text-sm font-black ${applyLateFee ? 'text-amber-700' : 'text-slate-400 line-through'}`}>+₹{lateFeeTotal.toLocaleString('en-IN')}</span>
                  </div>
                  {lateFeeBreakdown.filter(b => b.lateFee > 0).length > 0 && (
                    <ul className={`mb-2 divide-y ${applyLateFee ? 'divide-amber-200' : 'divide-slate-200'} max-h-32 overflow-y-auto`}>
                      {lateFeeBreakdown.filter(b => b.lateFee > 0).map(b => {
                        const inst = selected?.installments.find(i => i.id === b.installmentId);
                        const label = inst ? `${inst.month} · ${FEE_TYPE_LABEL[inst.feeType]}` : `Due ${new Date(b.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
                        return (
                          <li key={b.installmentId} className="flex items-center justify-between py-1">
                            <div className="flex flex-col">
                              <span className={`text-[11px] font-bold ${applyLateFee ? 'text-amber-800' : 'text-slate-500 line-through'}`}>{label}</span>
                              <span className={`text-[9px] font-semibold ${applyLateFee ? 'text-amber-600' : 'text-slate-400'}`}>{b.daysLate} {b.daysLate === 1 ? 'day' : 'days'} late · {/PERCENT/i.test(b.source) ? '% of due' : 'flat'}</span>
                            </div>
                            <span className={`text-[11px] font-black ${applyLateFee ? 'text-amber-700' : 'text-slate-400 line-through'}`}>+₹{b.lateFee.toLocaleString('en-IN')}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <label className="flex items-center gap-2 text-[10px] font-bold text-slate-500 cursor-pointer">
                    <input type="checkbox" checked={!applyLateFee}
                      onChange={e => setApplyLateFee(!e.target.checked)}
                      className="accent-amber-600" />
                    Skip late fee for this collection
                  </label>
                </div>
              )}

              <p className="text-[10px] font-bold text-slate-400 mb-3">Auto-allocated to oldest dues first. Excess stored as advance credit.</p>

              <textarea value={paymentNote} onChange={e => setPaymentNote(e.target.value)}
                rows={2} placeholder="Note (optional)…"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-blue-500 resize-none mb-4" />
              <button onClick={handlePayment} disabled={!payAmount}
                className="w-full py-3.5 bg-emerald-600 text-white font-black rounded-xl disabled:opacity-40 flex items-center justify-center gap-2">
                <CheckCircle2 size={16} /> Collect & Generate Receipt
              </button>
            </div>
          </div>
        )}

        {/* ── WRITE-OFF MODAL ───────────────────────────────────────────────── */}
        {writeOffModal && (
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end">
            <div className="w-full bg-white rounded-t-3xl p-6 pb-8 animate-in slide-in-from-bottom-8">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-black text-slate-900">Fee Write-Off</h3>
                <button onClick={() => setWriteOffModal(null)} className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center">
                  <X size={16} className="text-slate-500" />
                </button>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
                <p className="text-xs font-bold text-amber-700">
                  {FEE_TYPE_LABEL[writeOffModal.feeType]} · {writeOffModal.month} · Remaining: ₹{(writeOffModal.amount - writeOffModal.paidAmount).toLocaleString('en-IN')}
                </p>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center gap-2 mb-4">
                <IndianRupee size={16} className="text-slate-400" />
                <input type="number" value={writeOffAmount} onChange={e => setWriteOffAmount(e.target.value)}
                  placeholder="Amount to waive (leave blank for full)"
                  className="flex-1 bg-transparent font-black text-slate-900 text-lg outline-none" />
              </div>
              <textarea value={writeOffReason} onChange={e => setWriteOffReason(e.target.value)}
                rows={3} placeholder="Reason for write-off (required)…"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-500 resize-none mb-4" />
              <button onClick={handleWriteOff} disabled={!writeOffReason.trim()}
                className="w-full py-3.5 bg-rose-600 text-white font-black rounded-xl disabled:opacity-40">
                Confirm Write-Off
              </button>
            </div>
          </div>
        )}

        {/* ── GOVT PAY MODAL ─────────────────────────────────────────────────── */}
        {govtPayModal && (
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end">
            <div className="w-full bg-white rounded-t-3xl p-6 pb-8 animate-in slide-in-from-bottom-8">
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
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end">
            <div className="w-full bg-white rounded-t-3xl p-6 pb-8 animate-in slide-in-from-bottom-8 max-h-[85vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-5">
                <h3 className="text-lg font-black text-slate-900">Fee Receipt</h3>
                <button onClick={() => setReceiptModal(null)} className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center">
                  <X size={16} className="text-slate-500" />
                </button>
              </div>

              <div ref={receiptCardRef} className="border-2 border-dashed border-slate-200 rounded-2xl p-5 mb-4 bg-white">
                <div className="text-center mb-4 pb-4 border-b border-slate-100">
                  <div className="font-black text-slate-900 text-lg uppercase tracking-wide">EduGrow School</div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fee Receipt</div>
                  <div className="mt-2 inline-block bg-emerald-100 text-emerald-700 text-[10px] font-black px-3 py-1 rounded-full">PAID ✓</div>
                </div>

                <div className="space-y-2 mb-4">
                  {[
                    { label: 'Receipt No.', val: receiptModal.receiptNo },
                    { label: 'Date',        val: receiptModal.date },
                    { label: 'Student',     val: receiptModal.studentName },
                    { label: 'Class',       val: receiptModal.className },
                    { label: 'Adm. No.',    val: receiptModal.admissionNo },
                    { label: 'Method',      val: receiptModal.method },
                  ].map(({ label, val }) => (
                    <div key={label} className="flex justify-between gap-2">
                      <span className="text-[10px] font-bold text-slate-400">{label}</span>
                      <span className="text-[11px] font-black text-slate-800">{val}</span>
                    </div>
                  ))}
                </div>

                {receiptModal.installmentDetails.length > 0 && (
                  <div className="border-t border-slate-100 pt-3 mb-3">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Breakdown</p>
                    {receiptModal.installmentDetails.map((d, i) => (
                      <div key={i} className="flex justify-between py-1.5 border-b border-slate-50 last:border-0">
                        <span className="text-[11px] font-bold text-slate-600">{d.month} · {FEE_TYPE_LABEL[d.feeType]}</span>
                        <span className="text-[11px] font-black text-slate-900">₹{d.amount.toLocaleString('en-IN')}</span>
                      </div>
                    ))}
                    {receiptModal.advanceAmount > 0 && (
                      <div className="flex justify-between py-1.5 mt-1 bg-violet-50 rounded-lg px-2">
                        <span className="text-[11px] font-bold text-violet-600">Advance Credit Added</span>
                        <span className="text-[11px] font-black text-violet-700">₹{receiptModal.advanceAmount.toLocaleString('en-IN')}</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex justify-between items-center bg-slate-900 rounded-xl px-4 py-3 mb-3">
                  <span className="text-xs font-black text-white uppercase">Total Paid</span>
                  <span className="text-lg font-black text-white">₹{receiptModal.amount.toLocaleString('en-IN')}</span>
                </div>
                {receiptModal.note && (
                  <div className="bg-slate-50 rounded-xl px-4 py-3 border border-slate-200">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Note</p>
                    <p className="text-sm font-bold text-slate-700">{receiptModal.note}</p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => handleDownloadPdf(receiptModal)} className="py-3 bg-emerald-600 text-white font-black rounded-xl flex items-center justify-center gap-1.5 text-sm"><Download size={14} /> PDF</button>
                <button onClick={() => handlePrintReceipt(receiptModal)} className="py-3 bg-slate-100 text-slate-900 font-black rounded-xl flex items-center justify-center gap-1.5 text-sm"><Printer size={14} /> Print</button>
                <button onClick={() => setReceiptModal(null)} className="py-3 bg-indigo-600 text-white font-black rounded-xl text-sm">Close</button>
              </div>
            </div>
          </div>
        )}

        {/* ── REGENERATE SCHEDULE MODAL ─────────────────────────────────────── */}
        {regenModal && (
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end">
            <div className="w-full bg-white rounded-t-3xl p-6 pb-8 animate-in slide-in-from-bottom-8 max-h-[85vh] overflow-y-auto">
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
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">

      {/* Header */}
      <div className="bg-white border-b border-slate-100 shadow-sm">
        <div className="px-4 pt-4 pb-3 flex items-center gap-3">
          <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Fee Collection</h2>
            <p className="text-[10px] font-bold text-slate-400">{students.length} students · {dueStudents.length} with dues</p>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex border-t border-slate-100">
          <div className="flex-1 px-4 py-3 text-center">
            <div className="text-lg font-black text-emerald-600">₹{totalCollected.toLocaleString('en-IN')}</div>
            <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Collected</div>
          </div>
          <div className="w-px bg-slate-100" />
          <div className="flex-1 px-4 py-3 text-center">
            <div className="text-lg font-black text-rose-600">₹{totalParentDue.toLocaleString('en-IN')}</div>
            <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Parent Due</div>
          </div>
          {totalGovtDue > 0 && (
            <>
              <div className="w-px bg-slate-100" />
              <div className="flex-1 px-4 py-3 text-center">
                <div className="text-lg font-black text-blue-600">₹{totalGovtDue.toLocaleString('en-IN')}</div>
                <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Govt Due</div>
              </div>
            </>
          )}
        </div>

        {/* Search + tabs */}
        <div className="px-4 pb-3 space-y-2">
          <div className="relative">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, class, admission no…"
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-2.5 text-sm font-bold outline-none focus:border-blue-500 transition-colors" />
          </div>
          <div className="flex gap-2">
            {(['ALL', 'DUE', 'CLEARED'] as ListTab[]).map(t => (
              <button key={t} onClick={() => setListTab(t)}
                className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors ${listTab === t
                  ? t === 'DUE' ? 'bg-rose-600 text-white' : t === 'CLEARED' ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-500'}`}>
                {t === 'ALL' ? `All (${students.length})` : t === 'DUE' ? `Due (${dueStudents.length})` : `Cleared (${clearedStudents.length})`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4  space-y-2.5">
        {/* Parent/student-submitted payment screenshots awaiting principal review. */}
        <FeePaymentSubmissionsQueue />

        {visibleStudents.length === 0 && (
          <div className="flex flex-col items-center py-16 text-slate-400">
            <Users size={32} className="mb-3 opacity-30" />
            <p className="font-bold text-sm">No students</p>
          </div>
        )}

        {pagedStudents.map(student => {
          const pd = getParentDue(student.studentId);
          const gd = student.isRte ? getGovtDue(student.studentId) : { tuition: 0, total: 0 };
          const isDue = pd.total > 0 || gd.total > 0;
          const totalD = student.installments.reduce((a, i) => a + i.amount, 0);
          const totalP = student.installments.reduce((a, i) => a + i.paidAmount, 0);
          const pct = totalD > 0 ? Math.round((totalP / totalD) * 100) : 100;

          return (
            <button key={student.studentId}
              onClick={() => { setSelected(student); setDetailTab('SCHEDULE'); }}
              className={`w-full text-left bg-white rounded-2xl shadow-sm border p-4 active:scale-[0.99] transition-transform ${isDue ? 'border-rose-200' : 'border-slate-100'}`}>
              <div className="flex items-center gap-3">
                {/* Avatar */}
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm shrink-0 ${isDue ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                  {getInitials(student.name)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="font-extrabold text-slate-900 text-sm truncate">{student.name}</span>
                    {student.isRte && <ShieldCheck size={11} className="text-emerald-600 shrink-0" />}
                  </div>
                  <div className="text-[10px] font-bold text-slate-400">{student.className} · {student.admissionNo}</div>

                  {/* Mini progress bar */}
                  <div className="mt-2 h-1 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${pct === 100 ? 'bg-emerald-500' : 'bg-blue-400'}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-[9px] font-bold text-slate-400 mt-0.5">{pct}% collected</div>
                </div>

                {/* Right: due amount or cleared badge */}
                <div className="shrink-0 text-right">
                  {isDue ? (
                    <>
                      {pd.total > 0 && <div className="font-black text-rose-600 text-sm">₹{pd.total.toLocaleString('en-IN')}</div>}
                      {gd.total > 0 && <div className="font-black text-blue-600 text-sm">₹{gd.total.toLocaleString('en-IN')}</div>}
                      <div className="flex gap-1 mt-1 justify-end flex-wrap">
                        {pd.tuition > 0 && <span className="text-[8px] font-black bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded-full">Tuition</span>}
                        {pd.transport > 0 && <span className="text-[8px] font-black bg-orange-50 text-orange-700 px-1.5 py-0.5 rounded-full">Transport</span>}
                      </div>
                    </>
                  ) : (
                    <span className="flex items-center gap-0.5 text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                      <CheckCircle2 size={10} /> Cleared
                    </span>
                  )}
                </div>
                <ChevronRight size={15} className="text-slate-300 shrink-0" />
              </div>
            </button>
          );
        })}

        {hasMore && (
          <button
            onClick={() => setShowCount(c => c + PAGE_SIZE)}
            className="w-full py-3 mt-2 bg-white border border-slate-200 rounded-2xl text-xs font-black text-slate-500 uppercase tracking-widest active:scale-95 transition-transform">
            Load More ({visibleStudents.length - showCount} remaining)
          </button>
        )}

        {!hasMore && visibleStudents.length > PAGE_SIZE && (
          <p className="text-center text-[9px] font-bold text-slate-300 py-3">
            All {visibleStudents.length} students shown
          </p>
        )}
      </div>
    </div>
  );
};
