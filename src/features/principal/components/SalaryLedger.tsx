import React, { useState } from 'react';
import { ArrowLeft, IndianRupee, CheckCircle2, Clock, AlertTriangle, ChevronDown } from 'lucide-react';

type SalaryStatus = 'PAID' | 'PARTIAL' | 'PENDING';

interface SalaryRow {
  id: string;
  month: string;
  amount: number;
  paid: number;
  status: SalaryStatus;
  paidAt: string | null;
  note: string;
}

interface StaffSalaryProfile {
  id: string;
  name: string;
  role: string;
  monthlySalary: number;
  status: 'ACTIVE' | 'ON_LEAVE' | 'SUSPENDED';
  schedule: SalaryRow[];
}

const MOCK_STAFF: StaffSalaryProfile[] = [
  {
    id: 'sf1', name: 'Aarti Desai', role: 'Teacher · Mathematics', monthlySalary: 45000, status: 'ACTIVE',
    schedule: [
      { id: 'sl1', month: 'April 2026',  amount: 45000, paid: 45000, status: 'PAID',    paidAt: '2026-04-30', note: 'Bank transfer' },
      { id: 'sl2', month: 'May 2026',    amount: 45000, paid: 45000, status: 'PAID',    paidAt: '2026-05-31', note: 'Bank transfer' },
      { id: 'sl3', month: 'June 2026',   amount: 45000, paid: 22000, status: 'PARTIAL', paidAt: '2026-06-15', note: 'Advance paid' },
      { id: 'sl4', month: 'July 2026',   amount: 45000, paid: 0,     status: 'PENDING', paidAt: null,         note: '' },
    ],
  },
  {
    id: 'sf2', name: 'Sanjay Mehta', role: 'Teacher · Science', monthlySalary: 42000, status: 'ACTIVE',
    schedule: [
      { id: 'sl5', month: 'April 2026',  amount: 42000, paid: 42000, status: 'PAID',   paidAt: '2026-04-30', note: '' },
      { id: 'sl6', month: 'May 2026',    amount: 42000, paid: 42000, status: 'PAID',   paidAt: '2026-05-31', note: '' },
      { id: 'sl7', month: 'June 2026',   amount: 42000, paid: 0,     status: 'PENDING', paidAt: null,        note: '' },
    ],
  },
  {
    id: 'sf3', name: 'Raju Mehta', role: 'Driver', monthlySalary: 18000, status: 'ON_LEAVE',
    schedule: [
      { id: 'sl8', month: 'April 2026',  amount: 18000, paid: 18000, status: 'PAID',   paidAt: '2026-04-30', note: '' },
      { id: 'sl9', month: 'May 2026',    amount: 18000, paid: 0,     status: 'PENDING', paidAt: null,        note: 'On leave – pending' },
    ],
  },
];

const statusColor: Record<SalaryStatus, string> = {
  PAID:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  PARTIAL: 'bg-amber-50 text-amber-700 border-amber-200',
  PENDING: 'bg-rose-50 text-rose-700 border-rose-200',
};

const statusIcon = (s: SalaryStatus) => {
  if (s === 'PAID')    return <CheckCircle2 size={12} className="text-emerald-500" />;
  if (s === 'PARTIAL') return <AlertTriangle size={12} className="text-amber-500" />;
  return <Clock size={12} className="text-rose-500" />;
};

const roleColor: Record<string, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700',
  ON_LEAVE: 'bg-amber-50 text-amber-700',
  SUSPENDED: 'bg-rose-50 text-rose-700',
};

interface Props { onBack: () => void; }

export const SalaryLedger: React.FC<Props> = ({ onBack }) => {
  const [staff, setStaff] = useState<StaffSalaryProfile[]>(MOCK_STAFF);
  const [selected, setSelected] = useState<StaffSalaryProfile | null>(null);
  const [payModal, setPayModal] = useState<SalaryRow | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payNote, setPayNote] = useState('');
  const [search, setSearch] = useState('');

  const filtered = staff.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.role.toLowerCase().includes(search.toLowerCase())
  );

  const updateStaff = (updated: StaffSalaryProfile) => {
    setStaff(prev => prev.map(s => s.id === updated.id ? updated : s));
    setSelected(updated);
  };

  const handlePay = () => {
    if (!selected || !payModal || !payAmount) return;
    const amount = Number(payAmount);
    if (isNaN(amount) || amount <= 0) return;
    const newSchedule = selected.schedule.map(r => {
      if (r.id !== payModal.id) return r;
      const newPaid = Math.min(r.paid + amount, r.amount);
      return {
        ...r,
        paid: newPaid,
        status: newPaid >= r.amount ? 'PAID' as SalaryStatus : 'PARTIAL' as SalaryStatus,
        paidAt: new Date().toISOString().split('T')[0],
        note: payNote || r.note,
      };
    });
    updateStaff({ ...selected, schedule: newSchedule });
    setPayModal(null);
    setPayAmount('');
    setPayNote('');
  };

  const getTotals = (s: StaffSalaryProfile) => {
    const totalDue = s.schedule.reduce((a, r) => a + r.amount, 0);
    const totalPaid = s.schedule.reduce((a, r) => a + r.paid, 0);
    return { totalDue, totalPaid, pending: totalDue - totalPaid };
  };

  if (selected) {
    const totals = getTotals(selected);
    return (
      <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <button onClick={() => setSelected(null)} className="p-2 -ml-2 bg-slate-100 rounded-full">
              <ArrowLeft size={20} className="text-slate-600" />
            </button>
            <div className="flex-1">
              <h2 className="text-xl font-black text-slate-900">{selected.name}</h2>
              <p className="text-[10px] font-bold text-slate-400">{selected.role}</p>
            </div>
            <span className={`text-[9px] font-black px-2.5 py-1 rounded-full ${roleColor[selected.status]}`}>
              {selected.status.replace('_', ' ')}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Monthly', val: `₹${selected.monthlySalary.toLocaleString()}`, color: 'text-slate-900' },
              { label: 'Total Paid', val: `₹${totals.totalPaid.toLocaleString()}`, color: 'text-emerald-600' },
              { label: 'Pending', val: `₹${totals.pending.toLocaleString()}`, color: totals.pending > 0 ? 'text-rose-600' : 'text-emerald-600' },
            ].map(({ label, val, color }) => (
              <div key={label} className="bg-slate-50 rounded-xl p-3 text-center">
                <div className={`text-sm font-black ${color}`}>{val}</div>
                <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4  space-y-3">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Salary History</p>
          {[...selected.schedule].sort((a, b) => {
            const order = (s: string) => s === 'PAID' ? 1 : 0;
            return order(a.status) - order(b.status);
          }).map(row => (
            <div key={row.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-extrabold text-slate-900">{row.month}</div>
                  <div className={`inline-flex items-center gap-1.5 text-[10px] font-black px-2.5 py-1 rounded-full border mt-1.5 ${statusColor[row.status]}`}>
                    {statusIcon(row.status)} {row.status}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-black text-slate-900">₹{row.amount.toLocaleString()}</div>
                  {row.paid > 0 && <div className="text-[10px] font-bold text-emerald-600">Paid: ₹{row.paid.toLocaleString()}</div>}
                  {row.paidAt && <div className="text-[9px] font-bold text-slate-400 mt-0.5">{row.paidAt}</div>}
                  {row.note && <div className="text-[9px] font-bold text-slate-400 mt-0.5">{row.note}</div>}
                </div>
              </div>
              {row.status !== 'PAID' && selected.status !== 'SUSPENDED' && (
                <button onClick={() => { setPayModal(row); setPayAmount(String(row.amount - row.paid)); }}
                  className="mt-3 w-full py-2 bg-slate-900 text-white text-[10px] font-black rounded-xl">
                  Mark Payment
                </button>
              )}
            </div>
          ))}
        </div>

        {payModal && (
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-end">
            <div className="w-full bg-white rounded-t-3xl p-6 pb-8 animate-in slide-in-from-bottom-8">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-black text-slate-900">Record Salary Payment</h3>
                <button onClick={() => setPayModal(null)} className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500">✕</button>
              </div>
              <p className="text-[10px] font-bold text-slate-400 mb-4">{payModal.month} · {selected.name}</p>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center gap-2 mb-3">
                <IndianRupee size={16} className="text-slate-400" />
                <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)}
                  placeholder="Amount"
                  className="flex-1 bg-transparent font-black text-slate-900 text-lg outline-none" />
              </div>
              <input value={payNote} onChange={e => setPayNote(e.target.value)}
                placeholder="Note (e.g. Bank transfer, Cash)"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-blue-500 mb-4" />
              <button onClick={handlePay}
                disabled={!payAmount}
                className="w-full py-3 bg-emerald-600 text-white font-black rounded-xl disabled:opacity-40">
                Save Payment
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full">
            <ArrowLeft size={20} className="text-slate-600" />
          </button>
          <div>
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Salary Ledger</h2>
            <p className="text-[10px] font-bold text-slate-400">Schedule · Payments · History</p>
          </div>
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search staff name or role..."
          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:border-blue-500" />
      </div>

      <div className="flex-1 overflow-y-auto p-4  space-y-3">
        {filtered.map(s => {
          const totals = getTotals(s);
          return (
            <button key={s.id} onClick={() => setSelected(s)}
              className="w-full bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-left active:scale-[0.98] transition-transform">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-extrabold text-slate-900">{s.name}</div>
                  <div className="text-[10px] font-bold text-slate-400 mt-0.5">{s.role}</div>
                  <span className={`inline-block text-[9px] font-black px-2 py-0.5 rounded-full mt-1.5 ${roleColor[s.status]}`}>
                    {s.status.replace('_', ' ')}
                  </span>
                </div>
                <div className="text-right">
                  <div className="font-black text-slate-900">₹{s.monthlySalary.toLocaleString()}/mo</div>
                  {totals.pending > 0 && (
                    <div className="text-[10px] font-black text-rose-600 mt-0.5">₹{totals.pending.toLocaleString()} pending</div>
                  )}
                </div>
              </div>
              <div className="mt-3 w-full bg-slate-100 rounded-full h-1.5">
                <div className="bg-emerald-500 h-1.5 rounded-full transition-all"
                  style={{ width: `${totals.totalDue > 0 ? Math.min(100, (totals.totalPaid / totals.totalDue) * 100) : 0}%` }} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
