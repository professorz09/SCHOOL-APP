import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, Upload, CheckCircle2, QrCode, Zap, AlertTriangle, Wallet, Loader,
  Image as ImageIcon, X, ChevronDown, Calendar, BookOpen, Bus, Receipt as ReceiptIcon,
} from 'lucide-react';
import {
  studentDashboardService,
  FEE_SCREENSHOT_MAX_BYTES,
  FEE_SCREENSHOT_MIME_TYPES,
} from '@/modules/students/studentDashboard.service';
import { FeePaymentUpload } from '@/shared/types/student.types';
import { useUIStore } from '@/store/uiStore';
import { feeService, FeeInstallment, FeeType, PaymentRecord } from '@/modules/fees/fee.service';
import { studentService } from '@/modules/students/student.service';
import { schoolInfoService } from '@/shared/services/schoolInfo.service';

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
  s === 'PAID'        ? 'bg-emerald-100 text-emerald-700' :
  s === 'PARTIAL'     ? 'bg-amber-100 text-amber-700' :
  s === 'WAIVED'      ? 'bg-slate-100 text-slate-500' :
  s === 'WRITTEN_OFF' ? 'bg-slate-100 text-slate-500' :
  // CANCELLED rows are frozen historical transport entries — render as
  // neutral/settled, not as an outstanding due item.
  s === 'CANCELLED'   ? 'bg-slate-100 text-slate-500 line-through' :
                        'bg-rose-100 text-rose-600';

const formatDateLong = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export const FeesView: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();
  const [view, setView] = useState<View>('MAIN');
  const [studentId, setStudentId] = useState<string | null>(null);
  const [uploads, setUploads] = useState<FeePaymentUpload[]>([]);
  const [screenshotName, setScreenshotName] = useState('');
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
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
    setScreenshotName('');
    setScreenshotFile(null);
    if (screenshotPreview) URL.revokeObjectURL(screenshotPreview);
    setScreenshotPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (!f) return;
    if (!(FEE_SCREENSHOT_MIME_TYPES as readonly string[]).includes(f.type)) {
      showToast('Use a JPG, PNG, WebP, HEIC, or HEIF image', 'error');
      e.target.value = '';
      return;
    }
    if (f.size > FEE_SCREENSHOT_MAX_BYTES) {
      showToast(`Image too large (max ${Math.round(FEE_SCREENSHOT_MAX_BYTES / 1024 / 1024)} MB)`, 'error');
      e.target.value = '';
      return;
    }
    if (screenshotPreview) URL.revokeObjectURL(screenshotPreview);
    setScreenshotFile(f);
    setScreenshotPreview(URL.createObjectURL(f));
  };

  const handleUpload = async () => {
    if (!screenshotName.trim()) { showToast('Enter UTR number', 'error'); return; }
    if (!screenshotFile) { showToast('Attach the payment screenshot', 'error'); return; }
    if (!studentId) return;
    setIsSubmitting(true);
    try {
      const upload = await studentDashboardService.submitFeeScreenshot(
        feeSummary.total, 'Fee Payment', screenshotName.trim(), screenshotFile,
      );
      setUploads(prev => [upload, ...prev]);
      showToast('Screenshot submitted for approval');
      resetForm();
      setView('MAIN');
    } catch (err) {
      showToast((err as Error).message ?? 'Failed to submit', 'error');
    } finally { setIsSubmitting(false); }
  };

  // Free any local object URL when it changes or the component unmounts so
  // we don't leak blob URLs over the lifetime of the screen.
  useEffect(() => {
    return () => {
      if (screenshotPreview) URL.revokeObjectURL(screenshotPreview);
    };
  }, [screenshotPreview]);

  const openScreenshot = async (u: FeePaymentUpload) => {
    if (!u.screenshotPath) {
      showToast('No image attached to this submission', 'error');
      return;
    }
    setPreviewLoading(true);
    try {
      const url = await studentDashboardService.getFeeScreenshotSignedUrl(u.screenshotPath);
      if (!url) throw new Error('Could not load image');
      setPreviewUrl(url);
    } catch (err) {
      showToast((err as Error).message ?? 'Could not load image', 'error');
    } finally {
      setPreviewLoading(false);
    }
  };

  if (loading) return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="sticky top-0 bg-white border-b border-slate-100 px-4 pt-4 pb-4 flex items-center gap-3 shadow-sm z-10">
        <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full">
          <ArrowLeft size={20} className="text-slate-600" />
        </button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Fee Payments</h2>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Loader size={28} className="text-slate-400 animate-spin mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-500">Loading your fees…</p>
        </div>
      </div>
    </div>
  );

  if (loadError) return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="sticky top-0 bg-white border-b border-slate-100 px-4 pt-4 pb-4 flex items-center gap-3 shadow-sm z-10">
        <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full">
          <ArrowLeft size={20} className="text-slate-600" />
        </button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Fee Payments</h2>
      </div>
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center">
          <AlertTriangle size={32} className="text-rose-500 mx-auto mb-3" />
          <p className="text-sm font-black text-slate-700">{loadError}</p>
        </div>
      </div>
    </div>
  );

  // ── QR Pay View ──────────────────────────────────────────────────────────
  if (view === 'QR_PAY') return (
    <div className="w-full flex flex-col animate-in slide-in-from-right-8 duration-300">
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

        {/* Upload after payment */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">After Payment — Upload Proof</p>
          <p className="text-xs font-bold text-slate-500">Enter the UTR number and attach a screenshot of the payment.</p>
          <input
            value={screenshotName}
            onChange={e => setScreenshotName(e.target.value)}
            placeholder="UTR / Reference number"
            className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-blue-500"
          />

          <input
            ref={fileInputRef}
            type="file"
            accept={FEE_SCREENSHOT_MIME_TYPES.join(',')}
            onChange={handleFilePick}
            className="hidden"
          />
          {!screenshotPreview ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 bg-slate-50 rounded-xl px-4 py-5 text-slate-500 font-bold text-sm active:scale-[0.99] transition-transform"
            >
              <ImageIcon size={16} />
              <span>Attach payment screenshot</span>
            </button>
          ) : (
            <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
              <img src={screenshotPreview} alt="Payment screenshot preview" className="w-full max-h-64 object-contain" />
              <button
                type="button"
                onClick={() => {
                  if (screenshotPreview) URL.revokeObjectURL(screenshotPreview);
                  setScreenshotPreview(null);
                  setScreenshotFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                aria-label="Remove screenshot"
                className="absolute top-2 right-2 bg-slate-900/70 text-white rounded-full p-1.5 active:scale-95"
              >
                <X size={14} />
              </button>
              {screenshotFile && (
                <div className="px-3 py-2 text-[10px] font-bold text-slate-500 bg-white border-t border-slate-100 truncate">
                  {screenshotFile.name} · {(screenshotFile.size / 1024).toFixed(0)} KB
                </div>
              )}
            </div>
          )}

          <button onClick={handleUpload} disabled={isSubmitting || !screenshotFile || !screenshotName.trim()}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white font-black text-sm uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg disabled:opacity-60">
            {isSubmitting ? 'Submitting…' : <><Upload size={16} /> Submit for Approval</>}
          </button>
        </div>
      </div>
    </div>
  );

  // ── Main View ────────────────────────────────────────────────────────────
  return (
    <div className="w-full flex flex-col animate-in slide-in-from-right-8 duration-300">
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

        {/* ── Big Fee Card ───────────────────────────────────────────────── */}
        <div className="mx-4 mt-4">
          <div className="bg-[#0d1b3e] rounded-3xl p-5 text-white shadow-xl">
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-300 mb-1">
              TOTAL OUTSTANDING • ALL YEARS
            </p>
            <div className="text-5xl font-black mb-2">
              ₹{feeSummary.total.toLocaleString('en-IN')}
            </div>
            {feeSummary.total > 0 && daysUntilDue !== null && daysUntilDue <= 30 && (
              <div className="flex items-center gap-1.5 mb-4">
                <AlertTriangle size={14} className="text-orange-400" />
                <span className="text-sm font-bold text-orange-400">
                  {daysUntilDue === 0
                    ? 'Due today'
                    : `Due in ${daysUntilDue} Day${daysUntilDue !== 1 ? 's' : ''}`}
                </span>
              </div>
            )}
            {/* Paid-till status */}
            {paidTill.lastClearedMonth && (
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                <span className="text-sm font-bold text-emerald-300">
                  {paidTill.allCleared ? 'All dues cleared' : `Paid till ${paidTill.lastClearedMonth}`}
                </span>
              </div>
            )}
            {feeSummary.total === 0 ? (
              <div className="flex items-center gap-3 mt-2">
                <CheckCircle2 size={20} className="text-emerald-400" />
                <span className="font-black text-emerald-300">
                  {paidTill.allCleared ? `All fees paid till ${paidTill.lastClearedMonth}` : 'All fees paid!'}
                </span>
              </div>
            ) : (
              <button
                onClick={() => setView('QR_PAY')}
                className="w-full bg-blue-500 text-white font-black text-sm uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-all shadow-lg mt-1"
              >
                PAY SECURELY VIA UPI
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
          <div className="mx-4 mt-5">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide mb-3">FEE BREAKDOWN</h3>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              {feeSummary.tuition > 0 && (
                <div className="flex items-center justify-between p-4 border-b border-slate-100">
                  <div>
                    <div className="font-black text-slate-900 text-sm">TUITION FEE</div>
                    {nextDueDate && (
                      <div className="text-xs font-bold text-slate-400 mt-0.5">
                        Next due {formatDateLong(nextDueDate)}
                      </div>
                    )}
                  </div>
                  <div className="font-black text-slate-900">₹{feeSummary.tuition.toLocaleString('en-IN')}</div>
                </div>
              )}
              {feeSummary.transport > 0 && (
                <div className="flex items-center justify-between p-4 border-b border-slate-100 last:border-b-0">
                  <div>
                    <div className="font-black text-slate-900 text-sm">TRANSPORT FEE</div>
                  </div>
                  <div className="font-black text-slate-900">₹{feeSummary.transport.toLocaleString('en-IN')}</div>
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
                            {items.map((inst, idx) => (
                              <div key={inst.id}
                                className={`flex items-center justify-between px-4 py-3 ${idx < items.length - 1 ? 'border-b border-slate-50' : ''}`}>
                                <div>
                                  <div className="font-bold text-slate-900 text-sm">{inst.month}</div>
                                  <div className="text-[10px] font-bold text-slate-400 mt-0.5">Due {inst.dueDate}</div>
                                </div>
                                <div className="text-right">
                                  <div className="font-black text-slate-900 text-sm">₹{inst.amount.toLocaleString('en-IN')}</div>
                                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${instStatusColor(inst.status)}`}>
                                    {inst.status}
                                  </span>
                                </div>
                              </div>
                            ))}
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
              {uploads.map(u => {
                const hasImage = !!u.screenshotPath;
                return (
                  <div key={u.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center justify-between">
                    <div className="min-w-0 pr-3">
                      <div className="font-extrabold text-slate-900 text-sm truncate">{u.description}</div>
                      <div className="text-[10px] font-bold text-slate-400 mt-0.5 truncate">UTR: {u.screenshotName} · {u.submittedAt}</div>
                      {hasImage ? (
                        <button
                          onClick={() => openScreenshot(u)}
                          disabled={previewLoading}
                          className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-blue-600 disabled:opacity-60"
                        >
                          <ImageIcon size={10} />
                          {previewLoading ? 'Loading…' : 'View screenshot'}
                        </button>
                      ) : (
                        <div className="mt-1.5 text-[10px] font-bold text-slate-300 italic">No image attached</div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${statusBadge(u.status)}`}>{u.status}</span>
                      <span className="font-black text-slate-900 text-sm">₹{u.amount.toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Screenshot lightbox ────────────────────────────────────────── */}
        {previewUrl && (
          <div
            className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
            onClick={() => setPreviewUrl(null)}
          >
            <button
              onClick={(e) => { e.stopPropagation(); setPreviewUrl(null); }}
              className="absolute top-4 right-4 bg-white/10 text-white rounded-full p-2"
              aria-label="Close screenshot"
            >
              <X size={20} />
            </button>
            <img
              src={previewUrl}
              alt="Payment screenshot"
              className="max-w-full max-h-full rounded-2xl object-contain"
              onClick={(e) => e.stopPropagation()}
            />
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
                return (
                  <div key={p.id}
                    className={`flex items-center justify-between p-4 ${idx < arr.length - 1 ? 'border-b border-slate-100' : ''}`}>
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
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
