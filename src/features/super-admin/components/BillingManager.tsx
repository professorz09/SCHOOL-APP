import React, { useEffect, useState } from 'react';
import { ArrowLeft, IndianRupee, CheckCircle2, AlertCircle, Plus, CreditCard, Clock } from 'lucide-react';
import { useBillingStore } from '../../../store/billingStore';
import { useUIStore } from '../../../store/uiStore';
import { SchoolBilling, BillingYear, Payment } from '../../../types/billing.types';
import { PLAN_COLORS } from '../../../config/constants';

type View = 'LIST' | 'SCHOOL_DETAIL' | 'RECORD_PAYMENT';
type PayMethod = Payment['method'];

interface Props { onBack: () => void; }

const fmt = (n: number) =>
  n >= 1_00_000 ? `₹${(n / 1_00_000).toFixed(1)}L`
  : n >= 1000   ? `₹${(n / 1000).toFixed(0)}K`
  : `₹${n}`;

const fmtFull = (n: number) => `₹${n.toLocaleString('en-IN')}`;

const fmtDate = (d: string) => {
  const dt = new Date(d);
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const METHOD_COLORS: Record<PayMethod, string> = {
  UPI:    'bg-violet-50 text-violet-700',
  NEFT:   'bg-blue-50 text-blue-700',
  CHEQUE: 'bg-amber-50 text-amber-700',
  CASH:   'bg-emerald-50 text-emerald-700',
};

export const BillingManager: React.FC<Props> = ({ onBack }) => {
  const { schoolBillings, billingYears, fetchAll, recordPayment, getSchoolPayments } = useBillingStore();
  const { showToast } = useUIStore();

  const [view, setView]           = useState<View>('LIST');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [schoolPayments, setSchoolPayments] = useState<Payment[]>([]);
  const [amount, setAmount]       = useState('');
  const [txnId, setTxnId]         = useState('');
  const [method, setMethod]       = useState<PayMethod>('NEFT');
  const [notes, setNotes]         = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { fetchAll(); }, []);

  // ── Derived data ──────────────────────────────────────────────────────────

  // Latest billing year per school
  const latestYearMap = billingYears.reduce<Record<string, BillingYear>>((acc, y) => {
    const prev = acc[y.schoolId];
    if (!prev || y.startDate > prev.startDate) acc[y.schoolId] = y;
    return acc;
  }, {});

  const schoolList = schoolBillings.map(sb => ({
    billing: sb,
    year: latestYearMap[sb.schoolId] ?? null,
  }));

  const totalCollected = billingYears.reduce((s, y) => s + y.totalPaid, 0);
  const totalOutstanding = billingYears.reduce((s, y) => s + y.outstanding, 0);
  const overdueCount = schoolList.filter(s => (s.year?.outstanding ?? 0) > 0).length;

  // ── Selected school ────────────────────────────────────────────────────────

  const selected = selectedId ? schoolList.find(s => s.billing.schoolId === selectedId) : null;

  const openSchool = async (schoolId: string) => {
    setSelectedId(schoolId);
    const payments = await getSchoolPayments(schoolId);
    setSchoolPayments(payments);
    setView('SCHOOL_DETAIL');
  };

  // ── Record payment ─────────────────────────────────────────────────────────

  const handlePay = async () => {
    const num = parseInt(amount.replace(/,/g, ''), 10);
    if (!num || num <= 0) { showToast('Enter a valid amount', 'error'); return; }
    if (!txnId.trim())    { showToast('Enter transaction ID', 'error'); return; }
    if (!selected?.year)  { showToast('No billing year found', 'error'); return; }

    setSubmitting(true);
    try {
      await recordPayment(selected.billing.schoolId, selected.year.id, num, txnId.trim(), method, notes.trim());
      // Refresh payments
      const updated = await getSchoolPayments(selected.billing.schoolId);
      setSchoolPayments(updated);
      showToast(`₹${num.toLocaleString('en-IN')} recorded for ${selected.billing.schoolName}`);
      setAmount(''); setTxnId(''); setNotes('');
      setView('SCHOOL_DETAIL');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Shared header ──────────────────────────────────────────────────────────

  const Header = ({ title, back, right }: { title: string; back: () => void; right?: React.ReactNode }) => (
    <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
      <div className="flex items-center gap-3">
        <button onClick={back} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">{title}</h2>
      </div>
      {right}
    </div>
  );

  // ── LIST view ──────────────────────────────────────────────────────────────

  if (view === 'LIST') return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <Header title="Billing" back={onBack} />
      <div className="flex-1 overflow-y-auto pb-28">

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 px-4 pt-3 pb-2">
          {[
            { label: 'Collected', value: fmt(totalCollected),   color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Outstanding', value: fmt(totalOutstanding), color: 'text-rose-600',    bg: 'bg-rose-50'    },
            { label: 'Schools',    value: String(schoolList.length), color: 'text-blue-600', bg: 'bg-blue-50'    },
          ].map(({ label, value, color, bg }) => (
            <div key={label} className={`rounded-2xl px-2 py-3 text-center shadow-sm ${bg}`}>
              <div className={`text-lg font-black leading-none ${color}`}>{value}</div>
              <div className="text-[9px] font-black text-slate-400 uppercase tracking-wide mt-1">{label}</div>
            </div>
          ))}
        </div>

        {/* Overdue alert */}
        {overdueCount > 0 && (
          <div className="mx-4 mb-2 flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-2xl px-4 py-3">
            <AlertCircle size={16} className="text-rose-500 shrink-0" />
            <p className="text-xs font-black text-rose-700">{overdueCount} school{overdueCount > 1 ? 's' : ''} with outstanding balance</p>
          </div>
        )}

        {/* Schools list */}
        <div className="px-4 space-y-2 pt-1">
          {schoolList.map(({ billing, year }) => {
            const paid = year?.totalPaid ?? 0;
            const due = year?.totalDue ?? billing.annualAmount;
            const out = year?.outstanding ?? billing.annualAmount;
            const settled = out === 0;
            const pct = due > 0 ? Math.min(100, Math.round((paid / due) * 100)) : 0;

            return (
              <button key={billing.schoolId}
                onClick={() => openSchool(billing.schoolId)}
                className="w-full bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-4 text-left active:scale-[0.98] transition-transform">
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div className="w-11 h-11 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center font-black text-sm shrink-0">
                    {billing.schoolName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-extrabold text-slate-900 text-sm truncate">{billing.schoolName}</span>
                      {settled
                        ? <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full shrink-0">PAID</span>
                        : <span className="text-sm font-black text-rose-600 shrink-0">{fmt(out)}</span>
                      }
                    </div>

                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${PLAN_COLORS[billing.plan]}`}>{billing.plan}</span>
                      <span className="text-[10px] font-bold text-slate-400">{year?.yearLabel ?? '—'}</span>
                    </div>

                    {/* Progress bar */}
                    <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${settled ? 'bg-emerald-500' : 'bg-blue-500'}`}
                        style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-[9px] font-bold text-slate-400">Paid {fmtFull(paid)}</span>
                      <span className="text-[9px] font-bold text-slate-400">{pct}%</span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}

          {schoolList.length === 0 && (
            <div className="flex flex-col items-center py-16 text-slate-400">
              <IndianRupee size={32} className="mb-3 opacity-40" />
              <p className="font-bold text-sm">No schools with billing</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // ── SCHOOL DETAIL view ─────────────────────────────────────────────────────

  if (view === 'SCHOOL_DETAIL' && selected) {
    const { billing, year } = selected;
    const paid = year?.totalPaid ?? 0;
    const due  = year?.totalDue  ?? billing.annualAmount;
    const out  = year?.outstanding ?? billing.annualAmount;
    const pct  = due > 0 ? Math.min(100, Math.round((paid / due) * 100)) : 0;

    return (
      <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        <Header title={billing.schoolName}
          back={() => { setView('LIST'); setSelectedId(null); }}
          right={
            <button onClick={() => setView('RECORD_PAYMENT')}
              className="flex items-center gap-1.5 bg-blue-600 text-white text-[11px] font-black px-3 py-2 rounded-full active:scale-90 transition-transform">
              <Plus size={13} /> Add Payment
            </button>
          }
        />

        <div className="flex-1 overflow-y-auto pb-28 space-y-3 px-4 pt-3">

          {/* Plan info card */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Plan Details</span>
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${PLAN_COLORS[billing.plan]}`}>{billing.plan}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[9px] font-black uppercase text-slate-400 mb-0.5">Annual Amount</div>
                <div className="font-black text-slate-900">{fmtFull(billing.annualAmount)}</div>
              </div>
              <div>
                <div className="text-[9px] font-black uppercase text-slate-400 mb-0.5">Billing Since</div>
                <div className="font-black text-slate-900">{fmtDate(billing.billingStartDate)}</div>
              </div>
              {(year?.carriedForward ?? 0) > 0 && (
                <div className="col-span-2">
                  <div className="text-[9px] font-black uppercase text-slate-400 mb-0.5">Carried Forward</div>
                  <div className="font-black text-amber-600">+{fmtFull(year!.carriedForward)} (prev year)</div>
                </div>
              )}
            </div>
          </div>

          {/* Year summary */}
          {year && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Year {year.yearLabel}</span>
                {out === 0
                  ? <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full flex items-center gap-1"><CheckCircle2 size={10} /> Settled</span>
                  : <span className="text-[10px] font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full flex items-center gap-1"><Clock size={10} /> Outstanding</span>
                }
              </div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="bg-slate-50 rounded-xl p-2 text-center">
                  <div className="font-black text-slate-900 text-sm">{fmt(due)}</div>
                  <div className="text-[9px] font-black text-slate-400 uppercase mt-0.5">Total Due</div>
                </div>
                <div className="bg-emerald-50 rounded-xl p-2 text-center">
                  <div className="font-black text-emerald-700 text-sm">{fmt(paid)}</div>
                  <div className="text-[9px] font-black text-emerald-600 uppercase mt-0.5">Paid</div>
                </div>
                <div className={`rounded-xl p-2 text-center ${out > 0 ? 'bg-rose-50' : 'bg-slate-50'}`}>
                  <div className={`font-black text-sm ${out > 0 ? 'text-rose-600' : 'text-slate-400'}`}>{out > 0 ? fmt(out) : '—'}</div>
                  <div className={`text-[9px] font-black uppercase mt-0.5 ${out > 0 ? 'text-rose-500' : 'text-slate-400'}`}>Balance</div>
                </div>
              </div>

              {/* Progress */}
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${out === 0 ? 'bg-emerald-500' : 'bg-blue-500'}`}
                  style={{ width: `${pct}%` }} />
              </div>
              <div className="flex justify-between mt-1.5">
                <span className="text-[9px] font-bold text-slate-400">{pct}% paid</span>
                <span className="text-[9px] font-bold text-slate-400">{year.startDate} → {year.endDate}</span>
              </div>
            </div>
          )}

          {/* Payment history */}
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 px-1">
              Payment History ({schoolPayments.length})
            </p>
            {schoolPayments.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center text-slate-400">
                <IndianRupee size={28} className="mx-auto mb-2 opacity-30" />
                <p className="text-xs font-bold">No payments yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {schoolPayments.map(p => (
                  <div key={p.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                      <CheckCircle2 size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-extrabold text-slate-900 text-sm">{fmtFull(p.amount)}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${METHOD_COLORS[p.method]}`}>{p.method}</span>
                        <span className="text-[9px] font-bold text-slate-400">{p.txnId}</span>
                      </div>
                      {p.notes && <div className="text-[9px] text-slate-400 mt-0.5">{p.notes}</div>}
                    </div>
                    <div className="text-[10px] font-bold text-slate-400 shrink-0">{fmtDate(p.paidAt)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── RECORD PAYMENT view ────────────────────────────────────────────────────

  if (view === 'RECORD_PAYMENT' && selected) {
    const { billing, year } = selected;
    const out = year?.outstanding ?? billing.annualAmount;

    return (
      <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        <Header title="Add Payment" back={() => setView('SCHOOL_DETAIL')} />
        <div className="flex-1 overflow-y-auto pb-28 px-4 pt-4 space-y-4">

          {/* School summary */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-slate-100 flex items-center justify-center font-black text-sm text-slate-700">
              {billing.schoolName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="font-extrabold text-slate-900">{billing.schoolName}</div>
              <div className="text-xs font-bold text-rose-600 mt-0.5">Outstanding: {fmtFull(out)}</div>
            </div>
          </div>

          {/* Form */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">

            {/* Amount */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                Amount (₹) *
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-slate-400">₹</span>
                <input
                  type="number" value={amount} onChange={e => setAmount(e.target.value)}
                  placeholder="Enter amount"
                  className="w-full border border-slate-200 bg-slate-50 rounded-xl pl-8 pr-4 py-3 font-black text-sm outline-none focus:border-blue-500 focus:bg-white transition-colors"
                />
              </div>
              {out > 0 && (
                <button onClick={() => setAmount(String(out))}
                  className="mt-1.5 text-[10px] font-black text-blue-600 underline">
                  Pay full balance ({fmtFull(out)})
                </button>
              )}
            </div>

            {/* Transaction ID */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                Transaction ID *
              </label>
              <input value={txnId} onChange={e => setTxnId(e.target.value)}
                placeholder="e.g. TXN-2504-XXX-001"
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-blue-500 focus:bg-white transition-colors"
              />
            </div>

            {/* Method */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
                Payment Method
              </label>
              <div className="grid grid-cols-4 gap-2">
                {(['UPI', 'NEFT', 'CHEQUE', 'CASH'] as PayMethod[]).map(m => (
                  <button key={m} onClick={() => setMethod(m)}
                    className={`py-2 rounded-xl text-[11px] font-black uppercase transition-all ${
                      method === m ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                    }`}>
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                Notes (optional)
              </label>
              <input value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="e.g. Q1 installment"
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-blue-500 focus:bg-white transition-colors"
              />
            </div>
          </div>

          <button onClick={handlePay} disabled={submitting}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg disabled:opacity-60">
            <CreditCard size={16} />
            {submitting ? 'Saving…' : 'Confirm Payment'}
          </button>
        </div>
      </div>
    );
  }

  return null;
};
