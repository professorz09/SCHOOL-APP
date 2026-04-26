import React, { useEffect, useState } from 'react';
import { ArrowLeft, IndianRupee, CheckCircle2, Clock, AlertCircle, Plus, X, CreditCard, History, ChevronRight } from 'lucide-react';
import { useBillingStore } from '../../../store/billingStore';
import { useUIStore } from '../../../store/uiStore';
import { BillingRecord } from '../../../types/billing.types';
import { PaymentStatus, BillingPlan, PLAN_PRICES, PAYMENT_COLORS, PLAN_COLORS } from '../../../config/constants';

type View = 'LIST' | 'HISTORY' | 'MARK_PAID' | 'ADD';

interface Props {
  onBack: () => void;
}

export const BillingManager: React.FC<Props> = ({ onBack }) => {
  const { records, history, fetchAll, markPaid, addRecord } = useBillingStore();
  const { showToast } = useUIStore();

  const [view, setView] = useState<View>('LIST');
  const [selected, setSelected] = useState<BillingRecord | null>(null);
  const [txnId, setTxnId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [filterStatus, setFilterStatus] = useState<PaymentStatus | 'ALL'>('ALL');

  useEffect(() => { fetchAll(); }, []);

  const filtered = records.filter(r => filterStatus === 'ALL' || r.status === filterStatus);

  const totalDue = records.filter(r => r.status !== PaymentStatus.PAID).reduce((a, r) => a + r.amount, 0);
  const totalCollected = records.filter(r => r.status === PaymentStatus.PAID).reduce((a, r) => a + r.amount, 0);
  const overdueCount = records.filter(r => r.status === PaymentStatus.OVERDUE).length;

  const handleMarkPaid = async () => {
    if (!selected || !txnId.trim()) { showToast('Enter transaction ID', 'error'); return; }
    setIsSubmitting(true);
    try {
      await markPaid(selected.id, txnId.trim());
      showToast(`Payment recorded for ${selected.schoolName}`);
      setTxnId('');
      setView('LIST');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderHeader = (title: string, back: () => void, badge?: React.ReactNode) => (
    <div className="bg-white border-b border-slate-100 px-4 pt-12 pb-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
      <div className="flex items-center gap-3">
        <button onClick={back} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600 hover:bg-slate-200 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">{title}</h2>
      </div>
      {badge}
    </div>
  );

  const statusIcon = (status: PaymentStatus) => {
    if (status === PaymentStatus.PAID) return <CheckCircle2 size={16} className="text-emerald-500" />;
    if (status === PaymentStatus.OVERDUE) return <AlertCircle size={16} className="text-rose-500" />;
    return <Clock size={16} className="text-amber-500" />;
  };

  if (view === 'LIST') return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader('Billing',  onBack,
        <button onClick={() => setView('HISTORY')} className="flex items-center gap-1.5 text-[10px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 px-3 py-1.5 rounded-full">
          <History size={12} /> History
        </button>
      )}
      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-emerald-50 rounded-2xl p-3 text-center">
            <div className="text-lg font-black text-emerald-700">₹{(totalCollected / 1000).toFixed(0)}k</div>
            <div className="text-[9px] font-black uppercase tracking-widest text-emerald-600 mt-0.5">Collected</div>
          </div>
          <div className="bg-amber-50 rounded-2xl p-3 text-center">
            <div className="text-lg font-black text-amber-700">₹{(totalDue / 1000).toFixed(0)}k</div>
            <div className="text-[9px] font-black uppercase tracking-widest text-amber-600 mt-0.5">Pending</div>
          </div>
          <div className="bg-rose-50 rounded-2xl p-3 text-center">
            <div className="text-lg font-black text-rose-700">{overdueCount}</div>
            <div className="text-[9px] font-black uppercase tracking-widest text-rose-600 mt-0.5">Overdue</div>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
          {(['ALL', PaymentStatus.PAID, PaymentStatus.PENDING, PaymentStatus.OVERDUE] as const).map(f => (
            <button key={f} onClick={() => setFilterStatus(f)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors ${filterStatus === f ? 'bg-slate-900 text-white' : 'bg-white text-slate-500 border border-slate-200'}`}>
              {f}
            </button>
          ))}
        </div>

        {/* Records */}
        <div className="space-y-3">
          {filtered.map(rec => (
            <div key={rec.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-100 text-blue-700 flex items-center justify-center font-black text-xs shrink-0">
                      {rec.schoolName.split(' ').map(w => w[0]).join('').slice(0, 2)}
                    </div>
                    <div>
                      <div className="font-extrabold text-slate-900 text-sm">{rec.schoolName}</div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${PLAN_COLORS[rec.plan]}`}>{rec.plan}</span>
                        <span className="text-[10px] font-bold text-slate-400">· {rec.cycleType}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <div className="flex items-center gap-1">
                      {statusIcon(rec.status)}
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${PAYMENT_COLORS[rec.status]}`}>{rec.status}</span>
                    </div>
                    <div className="text-base font-black text-slate-900">₹{rec.amount.toLocaleString('en-IN')}</div>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-slate-50 flex justify-between items-center">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400">Due: </span>
                    <span className="text-[10px] font-black text-slate-700">{rec.dueDate}</span>
                    {rec.paidAt && (
                      <><span className="text-[10px] font-bold text-slate-400 ml-3">Paid: </span>
                        <span className="text-[10px] font-black text-emerald-600">{rec.paidAt}</span></>
                    )}
                  </div>
                  {rec.status !== PaymentStatus.PAID && (
                    <button onClick={() => { setSelected(rec); setView('MARK_PAID'); }}
                      className="flex items-center gap-1.5 text-[10px] font-black text-white bg-slate-900 px-3 py-1.5 rounded-xl active:scale-95 transition-transform">
                      <CreditCard size={12} /> Mark Paid
                    </button>
                  )}
                </div>
                {rec.notes && (
                  <div className="mt-2 text-[10px] font-bold text-slate-400 italic">📝 {rec.notes}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  if (view === 'MARK_PAID' && selected) return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader('Record Payment', () => setView('LIST'))}
      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
            <IndianRupee size={20} className="text-emerald-600" />
            <div>
              <div className="font-extrabold text-slate-900">{selected.schoolName}</div>
              <div className="text-xs font-bold text-slate-500">{selected.plan} Plan · ₹{selected.amount.toLocaleString('en-IN')}</div>
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Transaction ID *</label>
            <input value={txnId} onChange={e => setTxnId(e.target.value)} placeholder="e.g. TXN-2504-XXX-001"
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-emerald-500 focus:bg-white transition-colors" />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Amount</label>
            <div className="border border-slate-200 bg-slate-100 rounded-xl px-4 py-3 font-black text-sm text-slate-700">
              ₹{selected.amount.toLocaleString('en-IN')}
            </div>
          </div>
        </div>
        <button onClick={handleMarkPaid} disabled={isSubmitting}
          className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg disabled:opacity-60">
          {isSubmitting ? 'Saving…' : <><CheckCircle2 size={16} /> Confirm Payment</>}
        </button>
        <button onClick={() => setView('LIST')} className="w-full text-center text-[11px] font-black text-slate-500 py-2">
          Cancel
        </button>
      </div>
    </div>
  );

  if (view === 'HISTORY') return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader('Payment History', () => setView('LIST'))}
      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-3">
        {history.length === 0 && (
          <div className="flex flex-col items-center py-16 text-slate-400">
            <History size={32} className="mb-3 opacity-40" />
            <p className="font-bold text-sm">No payments yet</p>
          </div>
        )}
        {history.map(h => (
          <div key={h.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <CheckCircle2 size={18} />
            </div>
            <div className="flex-1">
              <div className="font-extrabold text-slate-900 text-sm">{h.schoolName}</div>
              <div className="text-[10px] font-bold text-slate-400 mt-0.5">{h.transactionId} · {h.method}</div>
              <div className="text-[10px] font-bold text-slate-400">{h.paidAt}</div>
            </div>
            <div className="font-black text-emerald-700 text-sm">
              +₹{h.amount.toLocaleString('en-IN')}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return null;
};
