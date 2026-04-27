import React, { useEffect, useState } from 'react';
import {
  ArrowLeft, Upload, CheckCircle2, QrCode, Zap, AlertTriangle, Wallet,
} from 'lucide-react';
import { studentDashboardService } from '../../../services/studentDashboard.service';
import { FeePaymentUpload } from '../../../types/student.types';
import { useUIStore } from '../../../store/uiStore';
import { feeService, FeeInstallment } from '../../../services/fee.service';
import { studentService } from '../../../services/student.service';

type View = 'MAIN' | 'QR_PAY' | 'HISTORY';

interface Props { onBack: () => void; }

const MY_STUDENT_ID = 'student1';
const UPI_ID = 'school@upi';

const getDaysUntilDue = () => {
  const today = new Date();
  const dueDate = new Date('2026-07-10');
  const diff = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
};

const statusBadge = (s: string) =>
  s === 'PENDING'  ? 'bg-amber-100 text-amber-700' :
  s === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700';

const instStatusColor = (s: string) =>
  s === 'PAID'    ? 'bg-emerald-100 text-emerald-700' :
  s === 'PARTIAL' ? 'bg-amber-100 text-amber-700' :
  s === 'WAIVED'  ? 'bg-slate-100 text-slate-500' :
                    'bg-rose-100 text-rose-600';

export const FeesView: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();
  const [view, setView] = useState<View>('MAIN');
  const [uploads, setUploads] = useState<FeePaymentUpload[]>([]);
  const [screenshotName, setScreenshotName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feeSummary, setFeeSummary] = useState({ tuition: 0, transport: 0, total: 0 });
  const [isRte, setIsRte] = useState(false);
  const [installments, setInstallments] = useState<FeeInstallment[]>([]);
  const [advanceBalance, setAdvanceBalance] = useState(0);
  const [paidTill, setPaidTill] = useState<{ lastClearedMonth: string | null; allCleared: boolean }>({ lastClearedMonth: null, allCleared: false });
  const daysUntilDue = getDaysUntilDue();

  useEffect(() => {
    studentDashboardService.getFeeUploads().then(setUploads);
    setFeeSummary(feeService.getParentDueSummary(MY_STUDENT_ID));
    setInstallments(
      feeService.getStudentInstallments(MY_STUDENT_ID).filter(i => i.payerType === 'PARENT')
    );
    setAdvanceBalance(feeService.getAdvanceBalance(MY_STUDENT_ID));
    setPaidTill(feeService.getPaidTillMonth(MY_STUDENT_ID));
    studentService.getAll().then(students => {
      const found = students.find(s => s.id === MY_STUDENT_ID);
      if (found) setIsRte(found.rte);
    });
  }, []);

  const handleUpload = async () => {
    if (!screenshotName.trim()) { showToast('Enter UTR number', 'error'); return; }
    setIsSubmitting(true);
    try {
      const upload = await studentDashboardService.submitFeeScreenshot(feeSummary.total, 'Fee Payment', screenshotName);
      setUploads(prev => [upload, ...prev]);
      showToast('Screenshot submitted for approval');
      setScreenshotName('');
      setView('MAIN');
    } finally { setIsSubmitting(false); }
  };

  // ── QR Pay View ──────────────────────────────────────────────────────────
  if (view === 'QR_PAY') return (
    <div className="absolute inset-0 z-50 bg-white flex flex-col animate-in slide-in-from-right-8 duration-300">
      {/* Header */}
      <div className="px-4 pt-4 pb-4 flex items-center gap-3 border-b border-slate-100">
        <button onClick={() => setView('MAIN')} className="p-2 -ml-2 bg-slate-100 rounded-full">
          <ArrowLeft size={20} className="text-slate-600" />
        </button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Pay via UPI</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-5 pb-28 space-y-5">
        {/* QR Card */}
        <div className="bg-[#0d1b3e] rounded-3xl p-6 flex flex-col items-center text-white">
          <p className="text-[10px] font-black uppercase tracking-widest text-blue-300 mb-4">Scan & Pay</p>
          <div className="w-44 h-44 bg-white rounded-2xl p-3 mb-5">
            <div className="w-full h-full grid grid-cols-7 gap-px">
              {Array.from({ length: 49 }, (_, i) => (
                <div key={i} className={`rounded-sm ${(i * 7 + i) % 3 === 0 ? 'bg-slate-900' : 'bg-white'}`} />
              ))}
            </div>
          </div>
          <div className="text-4xl font-black mb-1">₹{feeSummary.total.toLocaleString('en-IN')}</div>
          <div className="text-blue-200 text-xs font-bold mb-2">Total Outstanding</div>
          <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-full">
            <QrCode size={13} className="text-blue-300" />
            <span className="text-[11px] font-black text-blue-100">{UPI_ID}</span>
          </div>
        </div>

        {/* Upload after payment */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">After Payment — Upload Proof</p>
          <p className="text-xs font-bold text-slate-500">Enter UTR number or screenshot name from your payment app.</p>
          <input
            value={screenshotName}
            onChange={e => setScreenshotName(e.target.value)}
            placeholder="e.g. UTR123456789"
            className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-blue-500"
          />
          <button onClick={handleUpload} disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white font-black text-sm uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg disabled:opacity-60">
            {isSubmitting ? 'Submitting…' : <><Upload size={16} /> Submit for Approval</>}
          </button>
        </div>
      </div>
    </div>
  );

  // ── Main View ────────────────────────────────────────────────────────────
  return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 flex items-center gap-3 shadow-sm">
        <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full">
          <ArrowLeft size={20} className="text-slate-600" />
        </button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Fee Payments</h2>
      </div>

      <div className="flex-1 overflow-y-auto pb-28">
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
              TOTAL DUE • CURRENT TERM
            </p>
            <div className="text-5xl font-black mb-2">
              ₹{feeSummary.total.toLocaleString('en-IN')}
            </div>
            {feeSummary.total > 0 && daysUntilDue <= 30 && (
              <div className="flex items-center gap-1.5 mb-4">
                <AlertTriangle size={14} className="text-orange-400" />
                <span className="text-sm font-bold text-orange-400">
                  Due in {daysUntilDue} Day{daysUntilDue !== 1 ? 's' : ''}
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
                    <div className="text-xs font-bold text-slate-400 mt-0.5">July – September 2026</div>
                  </div>
                  <div className="font-black text-slate-900">₹{feeSummary.tuition.toLocaleString('en-IN')}</div>
                </div>
              )}
              {feeSummary.transport > 0 && (
                <div className="flex items-center justify-between p-4">
                  <div>
                    <div className="font-black text-slate-900 text-sm">TRANSPORT FEE</div>
                    <div className="text-xs font-bold text-slate-400 mt-0.5">Route #4</div>
                  </div>
                  <div className="font-black text-slate-900">₹{feeSummary.transport.toLocaleString('en-IN')}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Installment Schedule ───────────────────────────────────────── */}
        {installments.length > 0 && (
          <div className="mx-4 mt-5">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide mb-3">INSTALLMENT SCHEDULE</h3>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              {installments
                .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
                .map((inst, idx, arr) => {
                  const due = inst.amount - inst.paidAmount - inst.writeOffAmount;
                  return (
                    <div key={inst.id}
                      className={`flex items-center justify-between p-4 ${idx < arr.length - 1 ? 'border-b border-slate-100' : ''}`}>
                      <div>
                        <div className="font-bold text-slate-900 text-sm">{inst.month}</div>
                        <div className="text-[10px] font-bold text-slate-400 mt-0.5">
                          {inst.feeType === 'TUITION' ? 'Tuition' : 'Transport'} · Due {inst.dueDate}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-black text-slate-900 text-sm">₹{inst.amount.toLocaleString()}</div>
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${instStatusColor(inst.status)}`}>
                          {inst.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* ── Submitted Payments ─────────────────────────────────────────── */}
        {uploads.length > 0 && (
          <div className="mx-4 mt-5">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide mb-3">SUBMITTED PAYMENTS</h3>
            <div className="space-y-2">
              {uploads.map(u => (
                <div key={u.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center justify-between">
                  <div>
                    <div className="font-extrabold text-slate-900 text-sm">{u.description}</div>
                    <div className="text-[10px] font-bold text-slate-400 mt-0.5">UTR: {u.screenshotName} · {u.submittedAt}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${statusBadge(u.status)}`}>{u.status}</span>
                    <span className="font-black text-slate-900 text-sm">₹{u.amount.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Payment History ────────────────────────────────────────────── */}
        <div className="mx-4 mt-5">
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide mb-3">PAYMENT HISTORY</h3>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            {[
              { desc: 'Q1 Fee — April 2026', amount: 15000, paidAt: '2026-04-02', txn: 'TXN-APR-2026' },
              { desc: 'Q2 Fee — July 2026', amount: 15000, paidAt: '2026-07-03', txn: 'TXN-JUL-2026' },
            ].map(({ desc, amount, paidAt, txn }, idx, arr) => (
              <div key={txn}
                className={`flex items-center justify-between p-4 ${idx < arr.length - 1 ? 'border-b border-slate-100' : ''}`}>
                <div>
                  <div className="font-extrabold text-slate-900 text-sm">{desc}</div>
                  <div className="text-[10px] font-bold text-slate-400 mt-0.5">{paidAt} · {txn}</div>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-emerald-500" />
                  <span className="font-black text-slate-900 text-sm">₹{amount.toLocaleString('en-IN')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
