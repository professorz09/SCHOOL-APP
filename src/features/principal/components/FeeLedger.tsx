import React, { useState } from 'react';
import { ArrowLeft, IndianRupee, CheckCircle2, AlertTriangle, Clock, Pencil, X } from 'lucide-react';

type FeeStatus = 'PAID' | 'PARTIAL' | 'UNPAID' | 'WAIVED';

interface FeeScheduleRow {
  id: string;
  month: string;
  dueDate: string;
  amount: number;
  paid: number;
  status: FeeStatus;
  writeOff: number;
  writeOffReason: string;
}

interface StudentFeeProfile {
  id: string;
  name: string;
  className: string;
  admissionNo: string;
  prevYearDue: number;
  schedule: FeeScheduleRow[];
}

const MOCK_STUDENTS: StudentFeeProfile[] = [
  {
    id: 's1', name: 'Aakash Sharma', className: '10-A', admissionNo: 'ADM-001', prevYearDue: 2000,
    schedule: [
      { id: 'f1', month: 'April 2026', dueDate: '2026-04-10', amount: 3500, paid: 3500, status: 'PAID', writeOff: 0, writeOffReason: '' },
      { id: 'f2', month: 'May 2026',   dueDate: '2026-05-10', amount: 3500, paid: 2000, status: 'PARTIAL', writeOff: 0, writeOffReason: '' },
      { id: 'f3', month: 'June 2026',  dueDate: '2026-06-10', amount: 3500, paid: 0,    status: 'UNPAID', writeOff: 0, writeOffReason: '' },
      { id: 'f4', month: 'July 2026',  dueDate: '2026-07-10', amount: 3500, paid: 0,    status: 'UNPAID', writeOff: 0, writeOffReason: '' },
    ],
  },
  {
    id: 's2', name: 'Priya Mehta', className: '10-A', admissionNo: 'ADM-002', prevYearDue: 0,
    schedule: [
      { id: 'f5', month: 'April 2026', dueDate: '2026-04-10', amount: 3500, paid: 3500, status: 'PAID', writeOff: 0, writeOffReason: '' },
      { id: 'f6', month: 'May 2026',   dueDate: '2026-05-10', amount: 3500, paid: 3500, status: 'PAID', writeOff: 0, writeOffReason: '' },
      { id: 'f7', month: 'June 2026',  dueDate: '2026-06-10', amount: 3500, paid: 0,    status: 'UNPAID', writeOff: 0, writeOffReason: '' },
    ],
  },
  {
    id: 's3', name: 'Rahul Verma', className: '9-A', admissionNo: 'ADM-003', prevYearDue: 4000,
    schedule: [
      { id: 'f8', month: 'April 2026', dueDate: '2026-04-10', amount: 3000, paid: 1000, status: 'PARTIAL', writeOff: 0, writeOffReason: '' },
      { id: 'f9', month: 'May 2026',   dueDate: '2026-05-10', amount: 3000, paid: 0,    status: 'UNPAID', writeOff: 0, writeOffReason: '' },
    ],
  },
];

const statusColor: Record<FeeStatus, string> = {
  PAID:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  PARTIAL: 'bg-amber-50 text-amber-700 border-amber-200',
  UNPAID:  'bg-rose-50 text-rose-700 border-rose-200',
  WAIVED:  'bg-slate-50 text-slate-500 border-slate-200',
};

const statusIcon = (s: FeeStatus) => {
  if (s === 'PAID')    return <CheckCircle2 size={12} className="text-emerald-500" />;
  if (s === 'PARTIAL') return <AlertTriangle size={12} className="text-amber-500" />;
  if (s === 'UNPAID')  return <Clock size={12} className="text-rose-500" />;
  return <X size={12} className="text-slate-400" />;
};

interface Props { onBack: () => void; }

export const FeeLedger: React.FC<Props> = ({ onBack }) => {
  const [students, setStudents] = useState<StudentFeeProfile[]>(MOCK_STUDENTS);
  const [selected, setSelected] = useState<StudentFeeProfile | null>(null);
  const [payModal, setPayModal] = useState<FeeScheduleRow | null>(null);
  const [writeOffModal, setWriteOffModal] = useState<FeeScheduleRow | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [writeOffReason, setWriteOffReason] = useState('');
  const [search, setSearch] = useState('');

  const filtered = students.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.admissionNo.toLowerCase().includes(search.toLowerCase())
  );

  const updateStudent = (updated: StudentFeeProfile) => {
    setStudents(prev => prev.map(s => s.id === updated.id ? updated : s));
    setSelected(updated);
  };

  // Oldest-due-first allocation
  const handlePayment = () => {
    if (!selected || !payAmount) return;
    let remaining = Number(payAmount);
    if (isNaN(remaining) || remaining <= 0) return;

    const newSchedule = [...selected.schedule];
    for (const row of newSchedule) {
      if (remaining <= 0) break;
      if (row.status === 'PAID' || row.status === 'WAIVED') continue;
      const due = row.amount - row.paid - row.writeOff;
      if (due <= 0) continue;
      const applying = Math.min(remaining, due);
      row.paid += applying;
      remaining -= applying;
      row.status = row.paid >= row.amount - row.writeOff ? 'PAID' : 'PARTIAL';
    }
    const updated = { ...selected, schedule: newSchedule };
    updateStudent(updated);
    setPayModal(null);
    setPayAmount('');
  };

  const handleWriteOff = () => {
    if (!selected || !writeOffModal || !writeOffReason.trim()) return;
    const newSchedule = selected.schedule.map(r => {
      if (r.id !== writeOffModal.id) return r;
      const newWriteOff = r.amount - r.paid;
      return { ...r, writeOff: newWriteOff, writeOffReason, status: 'WAIVED' as FeeStatus };
    });
    updateStudent({ ...selected, schedule: newSchedule });
    setWriteOffModal(null);
    setWriteOffReason('');
  };

  const getTotals = (s: StudentFeeProfile) => {
    const totalDue = s.schedule.reduce((a, r) => a + r.amount, 0) + s.prevYearDue;
    const totalPaid = s.schedule.reduce((a, r) => a + r.paid, 0);
    const totalWaived = s.schedule.reduce((a, r) => a + r.writeOff, 0);
    const outstanding = totalDue - totalPaid - totalWaived;
    return { totalDue, totalPaid, totalWaived, outstanding };
  };

  if (selected) {
    const totals = getTotals(selected);
    return (
      <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        <div className="bg-white border-b border-slate-100 px-4 pt-12 pb-4 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <button onClick={() => setSelected(null)} className="p-2 -ml-2 bg-slate-100 rounded-full">
              <ArrowLeft size={20} className="text-slate-600" />
            </button>
            <div>
              <h2 className="text-xl font-black text-slate-900">{selected.name}</h2>
              <p className="text-[10px] font-bold text-slate-400">{selected.className} · {selected.admissionNo}</p>
            </div>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Total Due', val: `₹${totals.totalDue.toLocaleString()}`, color: 'text-slate-900' },
              { label: 'Paid', val: `₹${totals.totalPaid.toLocaleString()}`, color: 'text-emerald-600' },
              { label: 'Outstanding', val: `₹${totals.outstanding.toLocaleString()}`, color: totals.outstanding > 0 ? 'text-rose-600' : 'text-emerald-600' },
            ].map(({ label, val, color }) => (
              <div key={label} className="bg-slate-50 rounded-xl p-3 text-center">
                <div className={`text-base font-black ${color}`}>{val}</div>
                <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-3">
          {selected.prevYearDue > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 flex items-center gap-3">
              <AlertTriangle size={16} className="text-amber-500 shrink-0" />
              <div>
                <div className="text-xs font-black text-amber-800">Previous Year Pending</div>
                <div className="text-sm font-black text-amber-700">₹{selected.prevYearDue.toLocaleString()}</div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Fee Schedule</p>
            <button onClick={() => setPayModal({} as FeeScheduleRow)}
              className="flex items-center gap-1.5 bg-emerald-600 text-white text-[10px] font-black px-3 py-1.5 rounded-full">
              <IndianRupee size={11} /> Record Payment
            </button>
          </div>

          {selected.schedule.map(row => (
            <div key={row.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="flex items-center gap-3 p-3.5">
                <div className="flex-1">
                  <div className="font-extrabold text-slate-900 text-sm">{row.month}</div>
                  <div className="text-[10px] font-bold text-slate-400 mt-0.5">Due: {row.dueDate}</div>
                </div>
                <div className="text-right">
                  <div className="font-black text-slate-900">₹{row.amount.toLocaleString()}</div>
                  {row.paid > 0 && <div className="text-[10px] font-bold text-emerald-600">Paid: ₹{row.paid.toLocaleString()}</div>}
                  {row.writeOff > 0 && <div className="text-[10px] font-bold text-slate-400">Waived: ₹{row.writeOff.toLocaleString()}</div>}
                </div>
              </div>
              <div className="flex items-center gap-2 px-3.5 pb-3">
                <div className={`flex items-center gap-1.5 text-[10px] font-black px-2.5 py-1 rounded-full border ${statusColor[row.status]}`}>
                  {statusIcon(row.status)} {row.status}
                </div>
                {row.status !== 'PAID' && row.status !== 'WAIVED' && (
                  <button onClick={() => setWriteOffModal(row)}
                    className="flex items-center gap-1 text-[9px] font-black text-slate-400 px-2.5 py-1 rounded-full border border-slate-200 hover:border-slate-300">
                    <Pencil size={9} /> Write-off
                  </button>
                )}
                {row.writeOffReason && (
                  <span className="text-[9px] font-bold text-slate-400 truncate max-w-[100px]">
                    Reason: {row.writeOffReason}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Pay Modal */}
        {payModal !== null && (
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-end">
            <div className="w-full bg-white rounded-t-3xl p-6 pb-8 animate-in slide-in-from-bottom-8">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-black text-slate-900">Record Payment</h3>
                <button onClick={() => setPayModal(null)} className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500">✕</button>
              </div>
              <p className="text-[11px] font-bold text-slate-400 mb-4">
                Amount will be allocated to oldest dues first (oldest-due-first rule).
              </p>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center gap-2 mb-4">
                <IndianRupee size={16} className="text-slate-400" />
                <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)}
                  placeholder="Enter amount received"
                  className="flex-1 bg-transparent font-black text-slate-900 text-lg outline-none" />
              </div>
              <button onClick={handlePayment}
                disabled={!payAmount}
                className="w-full py-3 bg-emerald-600 text-white font-black rounded-xl disabled:opacity-40">
                Allocate Payment
              </button>
            </div>
          </div>
        )}

        {/* Write-off Modal */}
        {writeOffModal && (
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-end">
            <div className="w-full bg-white rounded-t-3xl p-6 pb-8 animate-in slide-in-from-bottom-8">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-black text-slate-900">Fee Write-Off</h3>
                <button onClick={() => setWriteOffModal(null)} className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500">✕</button>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
                <p className="text-xs font-bold text-amber-700">
                  Waiving remaining balance of ₹{(writeOffModal.amount - writeOffModal.paid).toLocaleString()} for {writeOffModal.month}.
                  This action is permanent and requires a reason.
                </p>
              </div>
              <textarea value={writeOffReason} onChange={e => setWriteOffReason(e.target.value)}
                rows={3} placeholder="Reason for write-off (required)..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-500 resize-none mb-4" />
              <button onClick={handleWriteOff}
                disabled={!writeOffReason.trim()}
                className="w-full py-3 bg-rose-600 text-white font-black rounded-xl disabled:opacity-40">
                Confirm Write-Off
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-4 pt-12 pb-4 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full">
            <ArrowLeft size={20} className="text-slate-600" />
          </button>
          <div>
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Fee Ledger</h2>
            <p className="text-[10px] font-bold text-slate-400">Schedule · Payments · Allocation</p>
          </div>
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search student name or admission no..."
          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-blue-500" />
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-3">
        {filtered.map(s => {
          const totals = getTotals(s);
          return (
            <button key={s.id} onClick={() => setSelected(s)}
              className="w-full bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-left active:scale-[0.98] transition-transform">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-extrabold text-slate-900">{s.name}</div>
                  <div className="text-[10px] font-bold text-slate-400 mt-0.5">{s.className} · {s.admissionNo}</div>
                  {s.prevYearDue > 0 && (
                    <div className="text-[10px] font-black text-amber-600 mt-1">
                      + ₹{s.prevYearDue.toLocaleString()} prev year pending
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className={`font-black text-sm ${totals.outstanding > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    ₹{totals.outstanding.toLocaleString()} due
                  </div>
                  <div className="text-[10px] font-bold text-slate-400 mt-0.5">
                    ₹{totals.totalPaid.toLocaleString()} paid
                  </div>
                </div>
              </div>
              {/* Mini bar */}
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
