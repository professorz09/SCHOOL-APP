import React, { useEffect, useState } from 'react';
import {
  ArrowLeft, CheckCircle2, QrCode, Zap, AlertTriangle, Wallet, Loader,
  ChevronDown, Calendar, BookOpen, Bus, Receipt as ReceiptIcon, Hash,
} from 'lucide-react';
import { studentDashboardService } from '@/modules/students/studentDashboard.service';
import { FeePaymentUpload } from '@/roles/student/student-role.types';
import { useUIStore } from '@/store/uiStore';
import { feeService, FeeInstallment, FeeType, PaymentRecord } from '@/modules/fees/fee.service';
import { studentService } from '@/modules/students/student.service';
import { schoolInfoService } from '@/shared/utils/schoolInfo.service';

type View = 'MAIN' | 'QR_PAY' | 'HISTORY';
type YearGroup = { academicYearId: string; yearLabel: string; isActive: boolean; installments: FeeInstallment[] };

const FEE_TYPE_LABEL: Record<FeeType, string> = {
  TUITION: 'Tuition Fee', TRANSPORT: 'Transport Fee', EXAM: 'Exam Fee', OTHER: 'Other Fees',
};
const FEE_TYPE_ICON: Record<FeeType, React.ReactNode> = {
  TUITION:   <BookOpen size={14} />,
  TRANSPORT: <Bus size={14} />,
  EXAM:      <ReceiptIcon size={14} />,
  OTHER:     <Wallet size={14} />,
};
const FEE_TYPE_COLOR: Record<FeeType, string> = {
  TUITION:   'bg-indigo-100 text-indigo-700',
  TRANSPORT: 'bg-orange-100 text-orange-700',
  EXAM:      'bg-violet-100 text-violet-700',
  OTHER:     'bg-slate-100 text-slate-600',
};

interface Props { onBack: () => void; }


const statusBadge = (s: string) =>
  s === 'PENDING'  ? 'bg-amber-100 text-amber-700' :
  s === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700';

const instStatusColor = (s: string) =>
  s === 'PAID'                          ? 'bg-emerald-100 text-emerald-700' :
  s === 'PARTIAL'                       ? 'bg-amber-100 text-amber-700' :
  s === 'UPCOMING' || s === 'UNPAID'    ? 'bg-slate-100 text-slate-500' :
  s === 'WAIVED' || s === 'WRITTEN_OFF' ? 'bg-slate-100 text-slate-500' :
  // CANCELLED rows are frozen historical transport entries — render as
  // neutral/settled, not as an outstanding due item.
  s === 'CANCELLED'                     ? 'bg-slate-100 text-slate-500 line-through' :
  // DUE / OVERDUE / PARTIAL_DUE → call-to-action rose
                                          'bg-rose-100 text-rose-600';

const formatDateLong = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export const FeesView: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();
  const [view, setView] = useState<View>('MAIN');
  const [studentId, setStudentId] = useState<string | null>(null);
  const [uploads, setUploads] = useState<FeePaymentUpload[]>([]);
  const [transactionId, setTransactionId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feeSummary, setFeeSummary] = useState<{
    tuition: number; transport: number; exam: number; other: number; total: number;
  }>({ tuition: 0, transport: 0, exam: 0, other: 0, total: 0 });
  const [isRte, setIsRte] = useState(false);
  const [installments, setInstallments] = useState<FeeInstallment[]>([]);
  const [yearGroups, setYearGroups] = useState<YearGroup[]>([]);
  const [collapsedYears, setCollapsedYears] = useState<Record<string, boolean>>({});
  const [advanceBalance, setAdvanceBalance] = useState(0);
  const [paidTill, setPaidTill] = useState<{ lastClearedMonth: string | null; allCleared: boolean }>({ lastClearedMonth: null, allCleared: false });
  const [history, setHistory] = useState<PaymentRecord[]>([]);
  const [nextDueDate, setNextDueDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [upiId, setUpiId] = useState('');
  const [paymentQrUrl, setPaymentQrUrl] = useState<string | null>(null);

  // Compute days remaining until the next unpaid PARENT installment (NULL
  // when nothing is due — we hide the urgency badge in that case).
  const daysUntilDue = nextDueDate
    ? Math.max(0, Math.ceil((new Date(nextDueDate).getTime() - Date.now()) / 86400000))
    : null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sid = await studentDashboardService.getActiveStudentId();
        if (cancelled) return;
        setStudentId(sid);

        await feeService.refreshAll();
        if (cancelled) return;

        const insts = feeService.getStudentInstallments(sid).filter(i => i.payerType === 'PARENT');
        const nextUnpaid = insts
          .filter(i => Math.max(0, i.amount - i.paidAmount - i.writeOffAmount) > 0)
          .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0] ?? null;

        const [uploadsRows, studentRow, allGroupsRaw] = await Promise.all([
          studentDashboardService.getFeeUploads(),
          studentService.getById(sid).catch(() => null),
          feeService.getStudentInstallmentsByYear(sid).catch(() => []),
        ]);
        if (cancelled) return;

        // Parents only see their PARENT-payer rows; the GOVERNMENT-paid RTE
        // schedule is hidden from the family view.
        const parentGroups: YearGroup[] = allGroupsRaw
          .map(g => ({
            academicYearId: g.academicYearId,
            yearLabel: g.yearLabel,
            isActive: g.isActive,
            installments: g.installments.filter(i => i.payerType === 'PARENT'),
          }))
          .filter(g => g.installments.length > 0);

        setInstallments(insts);
        setYearGroups(parentGroups);
        // Auto-collapse every non-active year on first load.
        setCollapsedYears(prev => {
          const next: Record<string, boolean> = { ...prev };
          parentGroups.forEach(g => { if (next[g.academicYearId] === undefined) next[g.academicYearId] = !g.isActive; });
          return next;
        });
        setFeeSummary(feeService.getParentDueSummary(sid));
        setAdvanceBalance(feeService.getAdvanceBalance(sid));
        setPaidTill(feeService.getPaidTillMonth(sid));
        setHistory(feeService.getPaymentHistory(sid));
        setNextDueDate(nextUnpaid?.dueDate ?? null);
        setUploads(uploadsRows);
        setIsRte(studentRow?.rte ?? false);
        const sch = await schoolInfoService.get().catch(() => null);
        setUpiId(sch?.upiId ?? '');
        if (sch?.paymentQrPath) {
          setPaymentQrUrl(await schoolInfoService.getPaymentQrUrl(sch.paymentQrPath));
        } else {
          setPaymentQrUrl(null);
        }
      } catch (err) {
        if (!cancelled) setLoadError((err as Error).message ?? 'Failed to load fees');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const resetForm = () => {
    setTransactionId('');
  };

  const handleSubmit = async () => {
    const txn = transactionId.trim();
    if (!txn) { showToast('Enter transaction ID (UTR / UPI ref)', 'error'); return; }
    if (txn.length < 4) { showToast('Transaction ID looks too short', 'error'); return; }
    if (!studentId) return;
    setIsSubmitting(true);
    try {
      const upload = await studentDashboardService.submitFeePayment(
        feeSummary.total, txn, 'Fee Payment',
      );
      setUploads(prev => [upload, ...prev]);
      showToast('Submitted — waiting for principal approval');
      resetForm();
      setView('MAIN');
    } catch (err) {
      showToast((err as Error).message ?? 'Failed to submit', 'error');
    } finally { setIsSubmitting(false); }
  };

  if (loading) return (
    <div className="w-full lg:max-w-5xl lg:mx-auto bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300 min-h-[60vh] lg:min-h-[80vh]">
      <div className="sticky top-0 bg-white border-b border-slate-100 px-4 pt-4 pb-4 flex items-center gap-3 shadow-sm z-10">
        <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full">
          <ArrowLeft size={20} className="text-slate-600" />
        </button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Fee Payments</h2>
      </div>
      <div className="flex-1 flex items-center justify-center py-20">
        <div className="text-center">
          <Loader size={28} className="text-slate-400 animate-spin mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-500">Loading your fees…</p>
        </div>
      </div>
    </div>
  );

  if (loadError) return (
    <div className="w-full lg:max-w-5xl lg:mx-auto bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300 min-h-[60vh] lg:min-h-[80vh]">
      <div className="sticky top-0 bg-white border-b border-slate-100 px-4 pt-4 pb-4 flex items-center gap-3 shadow-sm z-10">
        <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full">
          <ArrowLeft size={20} className="text-slate-600" />
        </button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Fee Payments</h2>
      </div>
      <div className="flex-1 flex items-center justify-center py-20 p-6">
        <div className="text-center">
          <AlertTriangle size={32} className="text-rose-500 mx-auto mb-3" />
          <p className="text-sm font-black text-slate-700">{loadError}</p>
        </div>
      </div>
    </div>
  );

  // ── QR Pay View ──────────────────────────────────────────────────────────
  if (view === 'QR_PAY') return (
    <div className="w-full lg:max-w-5xl lg:mx-auto flex flex-col animate-in slide-in-from-right-8 duration-300">
      {/* Header */}
      <div className="sticky top-0 bg-white px-4 pt-4 pb-4 flex items-center gap-3 border-b border-slate-100 z-10">
        <button onClick={() => setView('MAIN')} className="p-2 -ml-2 bg-slate-100 rounded-full">
          <ArrowLeft size={20} className="text-slate-600" />
        </button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Pay via UPI</h2>
      </div>

      <div className="space-y-5 p-5">
        {/* QR Card */}
        <div className="bg-[#0d1b3e] rounded-3xl p-6 flex flex-col items-center text-white">
          <p className="text-[10px] font-black uppercase tracking-widest text-blue-300 mb-4">Scan & Pay</p>
          <div className="w-44 h-44 bg-white rounded-2xl p-3 mb-5 flex items-center justify-center">
            {paymentQrUrl ? <img src={paymentQrUrl} className="max-w-full max-h-full object-contain" /> : <QrCode size={52} className="text-slate-300" />}
          </div>
          <div className="text-4xl font-black mb-1">₹{feeSummary.total.toLocaleString('en-IN')}</div>
          <div className="text-blue-200 text-xs font-bold mb-2">Total Outstanding</div>
          <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-full">
            <QrCode size={13} className="text-blue-300" />
            <span className="text-[11px] font-black text-blue-100">{upiId || 'UPI not configured'}</span>
          </div>
        </div>

        {/* Confirm after payment — txn_id only, no file upload. */}
        {(() => {
          // Count today's submissions (IST). Anti-spam cap is 3/day, enforced
          // by DB trigger; we surface it here so the parent sees their budget.
          const istToday = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
          const todayCount = uploads.filter(u => u.submittedAt.slice(0, 10) === istToday).length;
          const dailyCap   = 3;
          const reachedCap = todayCount >= dailyCap;
          return (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">After Payment — Confirm</p>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                  reachedCap
                    ? 'bg-rose-50 text-rose-600 border-rose-200'
                    : todayCount > 0
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'bg-slate-50 text-slate-500 border-slate-200'
                }`}>
                  {todayCount}/{dailyCap} today
                </span>
              </div>
              {reachedCap ? (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex gap-2">
                  <AlertTriangle size={14} className="text-rose-500 mt-0.5 shrink-0"/>
                  <div className="text-[11px] font-bold text-rose-700 leading-relaxed">
                    Daily limit reached — only 3 submissions allowed per day. Misuse rokne ke liye limit hai.
                    Please contact the school office for another submission.
                  </div>
                </div>
              ) : (
                <p className="text-xs font-bold text-slate-500">
                  UPI / bank transaction ID dijiye. Principal verify karke approve karenge.
                </p>
              )}
              <div className="relative">
                <Hash size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={transactionId}
                  onChange={e => setTransactionId(e.target.value)}
                  placeholder="Transaction / UTR / UPI ref"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  disabled={reachedCap}
                  className="w-full border border-slate-200 bg-slate-50 rounded-xl pl-10 pr-4 py-3 font-bold text-sm tracking-wide outline-none focus:border-blue-500 focus:bg-white disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>
              <p className="text-[10px] font-bold text-slate-400">
                UPI app ke "Transaction details" me dikhta hai · 12+ digit reference
              </p>

              <button onClick={handleSubmit} disabled={isSubmitting || reachedCap || transactionId.trim().length < 4}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm uppercase tracking-widest py-4 rounded-2xl active:scale-[0.98] transition-all shadow-lg disabled:opacity-60 disabled:cursor-not-allowed">
                {isSubmitting ? 'Submitting…' : <><CheckCircle2 size={16} /> Submit for Approval</>}
              </button>
            </div>
          );
        })()}
      </div>
    </div>
  );

  // ── Main View ────────────────────────────────────────────────────────────
  return (
    <div className="w-full lg:max-w-5xl lg:mx-auto flex flex-col animate-in slide-in-from-right-8 duration-300">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-slate-100 px-4 pt-4 pb-4 flex items-center gap-3 shadow-sm z-10">
        <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full">
          <ArrowLeft size={20} className="text-slate-600" />
        </button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Fee Payments</h2>
      </div>

      <div>
        {/* RTE Banner */}
        {isRte && (
          <div className="mx-4 mt-4 bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center gap-3">
            <div className="bg-emerald-600 text-white rounded-full p-2 shrink-0">
              <Zap size={16} />
            </div>
            <div>
              <div className="font-black text-emerald-900 text-sm">Covered Under RTE</div>
              <div className="text-[11px] font-bold text-emerald-700">Tuition fee covered by government. Only transport due.</div>
            </div>
          </div>
        )}

        {/* ── Big Fee Card — centered hero, mirrors the reference design ──── */}
        <div className="mx-4 mt-4">
          <div className="relative bg-gradient-to-br from-[#0d1b3e] via-[#0e1f47] to-[#08122d] rounded-3xl p-6 lg:p-8 text-white shadow-xl overflow-hidden">
            {/* Soft inner glow — subtle depth without competing with the CTA. */}
            <div className="pointer-events-none absolute -top-20 -right-20 w-64 h-64 rounded-full bg-blue-500/15 blur-3xl" />

            <div className="relative text-center">
              <p className="text-[10px] lg:text-xs font-black uppercase tracking-[0.25em] text-slate-300 mb-2">
                Total Due {paidTill.lastClearedMonth ? `· Paid till ${paidTill.lastClearedMonth}` : ''}
              </p>
              <div className="text-5xl lg:text-6xl font-black mb-2 tabular-nums">
                ₹{feeSummary.total.toLocaleString('en-IN')}
              </div>

              {feeSummary.total === 0 && installments.length === 0 ? (
                // No schedule generated yet for this student. Earlier we showed
                // "All fees paid" here, which was misleading — it conflated a
                // settled ledger with one that simply hasn't been billed yet.
                <div className="inline-flex items-center gap-2 text-amber-200 font-black text-xs mb-5">
                  <AlertTriangle size={14} />
                  Fee schedule not published yet
                </div>
              ) : feeSummary.total === 0 ? (
                <div className="inline-flex items-center gap-2 text-emerald-300 font-black text-sm mb-5">
                  <CheckCircle2 size={16} />
                  {paidTill.allCleared ? `All fees paid till ${paidTill.lastClearedMonth}` : 'All fees paid'}
                </div>
              ) : daysUntilDue !== null && daysUntilDue <= 30 ? (
                <div className="inline-flex items-center gap-1.5 text-rose-400 font-bold text-sm mb-5">
                  <AlertTriangle size={14} />
                  {daysUntilDue === 0
                    ? 'Due today'
                    : `Due in ${daysUntilDue} Day${daysUntilDue !== 1 ? 's' : ''}`}
                </div>
              ) : (
                <div className="h-5 mb-5" /> // spacer so layout stays consistent
              )}
            </div>

            {feeSummary.total > 0 && (
              <button
                onClick={() => setView('QR_PAY')}
                className="relative w-full bg-blue-500 hover:bg-blue-400 text-white font-black text-sm lg:text-base uppercase tracking-widest py-4 lg:py-5 rounded-full active:scale-[0.98] transition-all shadow-lg shadow-blue-500/30">
                Pay Securely via UPI
              </button>
            )}
          </div>
        </div>

        {/* ── Advance Balance Card ───────────────────────────────────────── */}
        {advanceBalance > 0 && (
          <div className="mx-4 mt-3">
            <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4 flex items-center gap-3">
              <div className="bg-violet-600 text-white rounded-full p-2 shrink-0">
                <Wallet size={16} />
              </div>
              <div className="flex-1">
                <div className="font-black text-violet-900 text-sm">
                  ₹{advanceBalance.toLocaleString('en-IN')} Advance Credit
                </div>
                <div className="text-[11px] font-bold text-violet-600 mt-0.5">
                  Will be auto-applied to your next due
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Fee Breakdown ──────────────────────────────────────────────── */}
        {feeSummary.total > 0 && (
          <div className="mx-4 mt-6">
            <h3 className="text-xl lg:text-2xl font-black text-slate-900 uppercase tracking-tight mb-3">Fee Breakdown</h3>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              {feeSummary.tuition > 0 && (
                <div className="flex items-center justify-between p-4 lg:p-5 border-b border-slate-100">
                  <div>
                    <div className="font-black text-slate-900 text-sm lg:text-base uppercase tracking-wide">Tuition Fee</div>
                    {nextDueDate && (
                      <div className="text-[11px] lg:text-xs font-bold text-slate-400 mt-1">
                        Next due {formatDateLong(nextDueDate)}
                      </div>
                    )}
                  </div>
                  <div className="font-black text-slate-900 text-base lg:text-lg tabular-nums">₹{feeSummary.tuition.toLocaleString('en-IN')}</div>
                </div>
              )}
              {feeSummary.transport > 0 && (
                <div className="flex items-center justify-between p-4 lg:p-5 border-b border-slate-100 last:border-b-0">
                  <div>
                    <div className="font-black text-slate-900 text-sm lg:text-base uppercase tracking-wide">Transport Fee</div>
                  </div>
                  <div className="font-black text-slate-900 text-base lg:text-lg tabular-nums">₹{feeSummary.transport.toLocaleString('en-IN')}</div>
                </div>
              )}
              {feeSummary.exam > 0 && (
                <div className="flex items-center justify-between p-4 border-b border-slate-100 last:border-b-0">
                  <div>
                    <div className="font-black text-slate-900 text-sm">EXAM FEE</div>
                  </div>
                  <div className="font-black text-slate-900">₹{feeSummary.exam.toLocaleString('en-IN')}</div>
                </div>
              )}
              {feeSummary.other > 0 && (
                <div className="flex items-center justify-between p-4">
                  <div>
                    <div className="font-black text-slate-900 text-sm">OTHER CHARGES</div>
                    <div className="text-[10px] font-bold text-slate-400 mt-0.5">Includes any late fees</div>
                  </div>
                  <div className="font-black text-slate-900">₹{feeSummary.other.toLocaleString('en-IN')}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Per-Year Cards (grouped by fee type) ───────────────────────── */}
        {yearGroups.length > 0 && (
          <div className="mx-4 mt-5 space-y-3">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide">YEAR-WISE SCHEDULE</h3>

            {yearGroups.map(group => {
              const collapsed = !!collapsedYears[group.academicYearId];
              const yearTotal = group.installments.reduce((a, i) => a + i.amount, 0);
              const yearPaid  = group.installments.reduce((a, i) => a + i.paidAmount, 0);
              const yearDue   = group.installments.reduce((a, i) => a + Math.max(0, i.amount - i.paidAmount - i.writeOffAmount), 0);
              // Bucket the year's installments by fee type, then sort each
              // bucket by due date so months render chronologically.
              const buckets: Record<FeeType, FeeInstallment[]> = { TUITION: [], TRANSPORT: [], EXAM: [], OTHER: [] };
              group.installments.forEach(i => { buckets[i.feeType].push(i); });
              const orderedTypes: FeeType[] = (['TUITION', 'TRANSPORT', 'EXAM', 'OTHER'] as FeeType[])
                .filter(t => buckets[t] && buckets[t].length > 0);

              return (
                <div key={group.academicYearId}
                  className={`rounded-2xl border shadow-sm overflow-hidden ${group.isActive ? 'bg-white border-blue-200 ring-2 ring-blue-100' : 'bg-white border-slate-100'}`}>
                  <button
                    onClick={() => setCollapsedYears(prev => ({ ...prev, [group.academicYearId]: !prev[group.academicYearId] }))}
                    className="w-full flex items-center justify-between p-4 active:scale-[0.99] transition-transform">
                    <div className="flex items-center gap-2 min-w-0">
                      <Calendar size={16} className={group.isActive ? 'text-blue-600' : 'text-slate-400'} />
                      <span className="font-black text-slate-900 text-sm truncate">{group.yearLabel}</span>
                      {group.isActive && <span className="text-[8px] font-black bg-blue-600 text-white px-2 py-0.5 rounded-full">CURRENT</span>}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        {yearDue > 0
                          ? <div className="text-[11px] font-black text-rose-600">₹{yearDue.toLocaleString('en-IN')} due</div>
                          : <div className="text-[11px] font-black text-emerald-600">Cleared</div>}
                        <div className="text-[9px] font-bold text-slate-400">Paid ₹{yearPaid.toLocaleString('en-IN')} / ₹{yearTotal.toLocaleString('en-IN')}</div>
                      </div>
                      <ChevronDown size={16} className={`text-slate-400 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
                    </div>
                  </button>

                  {!collapsed && (
                    <div className="border-t border-slate-100">
                      {orderedTypes.map(t => {
                        const items = buckets[t]
                          .slice()
                          .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
                        return (
                          <div key={t} className="border-b border-slate-100 last:border-0">
                            <div className="px-4 pt-3 pb-1 flex items-center gap-1.5">
                              <span className={`flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-full ${FEE_TYPE_COLOR[t]}`}>
                                {FEE_TYPE_ICON[t]} {FEE_TYPE_LABEL[t]}
                              </span>
                              <span className="text-[9px] font-bold text-slate-400">· {items.length} installment{items.length !== 1 ? 's' : ''}</span>
                            </div>
                            {items.map((inst, idx) => {
                              // Surface paid/discount/balance to parents the
                              // same way the principal sees them. Earlier
                              // parents only got Total + status — they
                              // couldn't tell what portion was their cash
                              // vs a school-applied discount, which made
                              // PARTIAL rows confusing.
                              const balance = Math.max(0, inst.amount - inst.paidAmount - inst.writeOffAmount);
                              return (
                              <div key={inst.id}
                                className={`px-4 py-3 ${idx < items.length - 1 ? 'border-b border-slate-50' : ''}`}>
                                <div className="flex items-center justify-between">
                                  <div className="min-w-0">
                                    <div className="font-bold text-slate-900 text-sm">{inst.month}</div>
                                    <div className="text-[10px] font-bold text-slate-400 mt-0.5">Due {inst.dueDate}</div>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <div className="font-black text-slate-900 text-sm tabular-nums">₹{inst.amount.toLocaleString('en-IN')}</div>
                                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${instStatusColor(inst.status)}`}>
                                      {inst.status}
                                    </span>
                                  </div>
                                </div>
                                {(inst.paidAmount > 0 || inst.writeOffAmount > 0) && (
                                  <div className="flex items-center gap-1.5 flex-wrap mt-2 text-[10px] font-black tabular-nums">
                                    {inst.paidAmount > 0 && (
                                      <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                                        Paid ₹{inst.paidAmount.toLocaleString('en-IN')}
                                      </span>
                                    )}
                                    {inst.writeOffAmount > 0 && (
                                      <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                                        Discount ₹{inst.writeOffAmount.toLocaleString('en-IN')}
                                      </span>
                                    )}
                                    {balance > 0 && (
                                      <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-100">
                                        Balance ₹{balance.toLocaleString('en-IN')}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Submitted Payments ─────────────────────────────────────────── */}
        {uploads.length > 0 && (
          <div className="mx-4 mt-5">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide mb-3">SUBMITTED PAYMENTS</h3>
            <div className="space-y-2">
              {uploads.map(u => (
                <div key={u.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center justify-between">
                  <div className="min-w-0 pr-3">
                    <div className="font-extrabold text-slate-900 text-sm truncate">{u.description}</div>
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 mt-0.5 truncate">
                      <Hash size={10} className="shrink-0"/>
                      <span className="font-mono tracking-wide truncate">{u.transactionId}</span>
                      <span>·</span>
                      <span>{u.submittedAt}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${statusBadge(u.status)}`}>{u.status}</span>
                    <span className="font-black text-slate-900 text-sm">₹{u.amount.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Payment History ────────────────────────────────────────────── */}
        {history.length > 0 && (
          <div className="mx-4 mt-5 mb-6">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide mb-3">PAYMENT HISTORY</h3>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              {history.map((p, idx, arr) => {
                const desc = p.installmentDetails.length
                  ? p.installmentDetails.map(d => `${d.feeType === 'TUITION' ? 'Tuition' : 'Transport'} — ${d.month}`).join(', ')
                  : (p.note ?? 'Fee Payment');
                const discount = p.discountAmount ?? 0;
                return (
                  <div key={p.id}
                    className={`p-4 ${idx < arr.length - 1 ? 'border-b border-slate-100' : ''}`}>
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 pr-3">
                        <div className="font-extrabold text-slate-900 text-sm truncate">{desc}</div>
                        <div className="text-[10px] font-bold text-slate-400 mt-0.5">
                          {p.date} · {p.receiptNo} · {p.method}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <CheckCircle2 size={14} className="text-emerald-500" />
                        <span className="font-black text-slate-900 text-sm">₹{p.amount.toLocaleString('en-IN')}</span>
                      </div>
                    </div>
                    {discount > 0 && (
                      <div className="mt-2 flex items-center justify-between bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-1.5">
                        <span className="text-[10px] font-black text-indigo-700 uppercase tracking-wide">Discount Applied</span>
                        <span className="text-[11px] font-black text-indigo-700 tabular-nums">+ ₹{discount.toLocaleString('en-IN')} cleared</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
