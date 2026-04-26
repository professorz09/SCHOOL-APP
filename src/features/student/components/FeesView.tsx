import React, { useEffect, useState } from 'react';
import { ArrowLeft, CreditCard, Upload, CheckCircle2, Clock, QrCode, X } from 'lucide-react';
import { studentDashboardService } from '../../../services/student.service2';
import { FeePaymentUpload } from '../../../types/student.types';
import { useUIStore } from '../../../store/uiStore';

type View = 'MAIN' | 'QR_PAY';

interface Props { onBack: () => void; }

const UPI_ID = 'school@upi';
const FEE_AMOUNT = 15000;
const FEE_DESC = 'Q3 Annual Fee — Class 10-A';

export const FeesView: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();
  const [view, setView] = useState<View>('MAIN');
  const [uploads, setUploads] = useState<FeePaymentUpload[]>([]);
  const [screenshotName, setScreenshotName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => { studentDashboardService.getFeeUploads().then(setUploads); }, []);

  const handleUpload = async () => {
    if (!screenshotName.trim()) { showToast('Enter screenshot file name / UTR number', 'error'); return; }
    setIsSubmitting(true);
    try {
      const upload = await studentDashboardService.submitFeeScreenshot(FEE_AMOUNT, FEE_DESC, screenshotName);
      setUploads(prev => [upload, ...prev]);
      showToast('Screenshot submitted for principal approval');
      setScreenshotName('');
      setView('MAIN');
    } finally { setIsSubmitting(false); }
  };

  const statusColor = (s: string) =>
    s === 'PENDING' ? 'bg-amber-50 text-amber-700' :
    s === 'APPROVED' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700';

  if (view === 'QR_PAY') return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-4 pt-12 pb-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => setView('MAIN')} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600"><ArrowLeft size={20} /></button>
          <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Pay via UPI</h2>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-4">
        {/* QR code mock */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex flex-col items-center">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Scan QR to Pay</p>
          {/* QR grid mock */}
          <div className="w-48 h-48 bg-slate-900 rounded-2xl p-3 mb-4">
            <div className="w-full h-full grid grid-cols-7 gap-px">
              {Array.from({ length: 49 }, (_, i) => (
                <div key={i} className={`rounded-sm ${Math.random() > 0.5 ? 'bg-white' : 'bg-slate-900'}`} />
              ))}
            </div>
          </div>
          <div className="text-center">
            <div className="font-black text-slate-900 text-2xl">₹{FEE_AMOUNT.toLocaleString('en-IN')}</div>
            <div className="text-xs font-bold text-slate-400 mt-1">{FEE_DESC}</div>
            <div className="flex items-center justify-center gap-2 mt-3">
              <QrCode size={14} className="text-slate-400" />
              <span className="text-[11px] font-black text-slate-500">{UPI_ID}</span>
            </div>
          </div>
        </div>

        {/* After payment */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">After Payment</p>
          <p className="text-xs font-bold text-slate-500">Enter the UTR number or screenshot filename from your payment app to submit for principal approval.</p>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">UTR No. / Screenshot Name *</label>
            <input value={screenshotName} onChange={e => setScreenshotName(e.target.value)}
              placeholder="e.g. UTR123456789 or payment_screenshot"
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-emerald-500" />
          </div>
          <button onClick={handleUpload} disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg disabled:opacity-60">
            {isSubmitting ? 'Submitting…' : <><Upload size={16} /> Submit for Approval</>}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-4 pt-12 pb-4 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
        <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600"><ArrowLeft size={20} /></button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Fee Payments</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-4">
        {/* Summary */}
        <div className="bg-slate-900 rounded-2xl p-4 text-white">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Annual Fee Summary</p>
          <div className="flex gap-4">
            <div>
              <div className="text-2xl font-black text-emerald-400">₹45K</div>
              <div className="text-[9px] font-black text-slate-400 uppercase mt-0.5">Total Fee</div>
            </div>
            <div>
              <div className="text-2xl font-black text-white">₹45K</div>
              <div className="text-[9px] font-black text-slate-400 uppercase mt-0.5">Paid</div>
            </div>
            <div>
              <div className="text-2xl font-black text-rose-400">₹0</div>
              <div className="text-[9px] font-black text-slate-400 uppercase mt-0.5">Due</div>
            </div>
          </div>
          <div className="mt-3 w-full bg-white/10 rounded-full h-1.5">
            <div className="bg-emerald-400 h-1.5 rounded-full w-full" />
          </div>
        </div>

        {/* Pay Now */}
        <button onClick={() => setView('QR_PAY')}
          className="w-full flex items-center justify-center gap-3 bg-emerald-600 text-white font-black text-sm uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg">
          <QrCode size={18} /> Pay via UPI QR Code
        </button>

        {/* Payment submissions */}
        {uploads.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Submitted Payments</p>
            {uploads.map(u => (
              <div key={u.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-extrabold text-slate-900 text-sm">{u.description}</div>
                    <div className="text-[10px] font-bold text-slate-400 mt-0.5">Screenshot: {u.screenshotName}</div>
                    <div className="text-[10px] font-bold text-slate-400">Submitted: {u.submittedAt}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${statusColor(u.status)}`}>{u.status}</span>
                    <span className="font-black text-slate-900 text-sm">₹{u.amount.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Fee history */}
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Payment History</p>
          {[
            { desc: 'Q1 Fee — April 2024', amount: 15000, paidAt: '2024-04-02', txn: 'TXN-APR-2024-001' },
            { desc: 'Q2 Fee — July 2024', amount: 15000, paidAt: '2024-07-03', txn: 'TXN-JUL-2024-001' },
            { desc: 'Q3 Fee — October 2024', amount: 15000, paidAt: '2024-10-05', txn: 'TXN-OCT-2024-001' },
          ].map(({ desc, amount, paidAt, txn }) => (
            <div key={txn} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-extrabold text-slate-900 text-sm">{desc}</div>
                  <div className="text-[10px] font-bold text-slate-400 mt-0.5">Paid {paidAt} · {txn}</div>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-emerald-500" />
                  <span className="font-black text-slate-900 text-sm">₹{amount.toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
