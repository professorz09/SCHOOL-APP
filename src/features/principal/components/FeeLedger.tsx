import React, { useState } from 'react';
import { ArrowLeft, IndianRupee, CheckCircle2, AlertTriangle, Clock, X, Layers } from 'lucide-react';
import { feeService, FeeInstallment, FeeStatus, FeeType } from '../../../services/fee.service';

interface StudentFeeProfile {
  studentId: string;
  name: string;
  className: string;
  admissionNo: string;
  installments: FeeInstallment[];
}

const MOCK_STUDENTS: StudentFeeProfile[] = [
  feeService.getStudentFeeProfile('student1', 'Aakash Sharma', '10-A', 'ADM-001'),
  feeService.getStudentFeeProfile('student2', 'Priya Mehta', '10-A', 'ADM-002'),
  feeService.getStudentFeeProfile('student3', 'Rahul Verma', '9-A', 'ADM-003'),
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

const feeTypeLabel = (type: FeeType) => {
  if (type === 'TUITION') return 'Tuition Fee';
  if (type === 'TRANSPORT') return 'Transport Fee';
  if (type === 'EXAM') return 'Exam Fee';
  return 'Other Fee';
};

const feeTypeBadge = (type: FeeType) => {
  if (type === 'TUITION') return 'bg-indigo-50 text-indigo-700';
  if (type === 'TRANSPORT') return 'bg-orange-50 text-orange-700';
  if (type === 'EXAM') return 'bg-violet-50 text-violet-700';
  return 'bg-slate-50 text-slate-700';
};

interface Props { onBack: () => void; }

export const FeeLedger: React.FC<Props> = ({ onBack }) => {
  const [students, setStudents] = useState<StudentFeeProfile[]>(MOCK_STUDENTS);
  const [selected, setSelected] = useState<StudentFeeProfile | null>(null);
  const [payModal, setPayModal] = useState<boolean>(false);
  const [writeOffModal, setWriteOffModal] = useState<FeeInstallment | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [writeOffAmount, setWriteOffAmount] = useState('');
  const [writeOffReason, setWriteOffReason] = useState('');
  const [search, setSearch] = useState('');

  const filtered = students.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.admissionNo.toLowerCase().includes(search.toLowerCase())
  );

  const updateStudent = (updated: StudentFeeProfile) => {
    setStudents(prev => prev.map(s => s.studentId === updated.studentId ? updated : s));
    setSelected(updated);
  };

  const handlePayment = () => {
    if (!selected || !payAmount) return;
    const amount = Number(payAmount);
    if (isNaN(amount) || amount <= 0) return;

    if (feeService.recordPayment(selected.studentId, amount)) {
      const updated = feeService.getStudentFeeProfile(selected.studentId, selected.name, selected.className, selected.admissionNo);
      updateStudent(updated);
      setPayAmount('');
      setPayModal(false);
    }
  };

  const handleWriteOff = () => {
    if (!writeOffModal || !writeOffReason.trim()) return;
    const amount = Number(writeOffAmount) || writeOffModal.amount - writeOffModal.paidAmount;
    if (feeService.writeOffFee(writeOffModal.id, amount, writeOffReason)) {
      const updated = feeService.getStudentFeeProfile(selected!.studentId, selected!.name, selected!.className, selected!.admissionNo);
      updateStudent(updated);
      setWriteOffModal(null);
      setWriteOffAmount('');
      setWriteOffReason('');
    }
  };

  if (selected) {
    const summary = feeService.getFeeTypeSummary(selected.studentId);

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

          {/* Summary by fee type */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Tuition Due', val: `₹${summary.tuition.toLocaleString()}`, color: 'text-indigo-600' },
              { label: 'Transport Due', val: `₹${summary.transport.toLocaleString()}`, color: 'text-orange-600' },
              { label: 'Total Due', val: `₹${summary.total.toLocaleString()}`, color: summary.total > 0 ? 'text-rose-600' : 'text-emerald-600' },
            ].map(({ label, val, color }) => (
              <div key={label} className="bg-slate-50 rounded-xl p-3 text-center">
                <div className={`text-base font-black ${color}`}>{val}</div>
                <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Fee Schedule</p>
            <button onClick={() => setPayModal(true)}
              className="flex items-center gap-1.5 bg-emerald-600 text-white text-[10px] font-black px-3 py-1.5 rounded-full">
              <IndianRupee size={11} /> Record Payment
            </button>
          </div>

          {selected.installments
            .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
            .map(inst => {
              const due = inst.amount - inst.paidAmount - inst.writeOffAmount;
              return (
                <div key={inst.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="flex items-center gap-3 p-3.5">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="font-extrabold text-slate-900 text-sm">{inst.month}</div>
                        <div className={`text-[8px] font-black px-2 py-0.5 rounded-full ${feeTypeBadge(inst.feeType)}`}>
                          {feeTypeLabel(inst.feeType).split(' ')[0]}
                        </div>
                      </div>
                      <div className="text-[10px] font-bold text-slate-400">Due: {inst.dueDate}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-slate-900">₹{inst.amount.toLocaleString()}</div>
                      {inst.paidAmount > 0 && <div className="text-[10px] font-bold text-emerald-600">Paid: ₹{inst.paidAmount.toLocaleString()}</div>}
                      {inst.writeOffAmount > 0 && <div className="text-[10px] font-bold text-slate-400">Waived: ₹{inst.writeOffAmount.toLocaleString()}</div>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 px-3.5 pb-3">
                    <div className={`flex items-center gap-1.5 text-[10px] font-black px-2.5 py-1 rounded-full border ${statusColor[inst.status]}`}>
                      {statusIcon(inst.status)} {inst.status}
                    </div>
                    {inst.status !== 'PAID' && inst.status !== 'WAIVED' && due > 0 && (
                      <button onClick={() => setWriteOffModal(inst)}
                        className="flex items-center gap-1 text-[9px] font-black text-slate-400 px-2.5 py-1 rounded-full border border-slate-200 hover:border-slate-300">
                        Write-off
                      </button>
                    )}
                    {inst.writeOffReason && (
                      <span className="text-[9px] font-bold text-slate-400 truncate max-w-[150px]">
                        {inst.writeOffReason}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
        </div>

        {/* Pay Modal */}
        {payModal && (
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-end">
            <div className="w-full bg-white rounded-t-3xl p-6 pb-8 animate-in slide-in-from-bottom-8">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-black text-slate-900">Record Payment</h3>
                <button onClick={() => { setPayModal(false); setPayAmount(''); }} className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500">✕</button>
              </div>
              <p className="text-[11px] font-bold text-slate-400 mb-4">
                Payment will be allocated to oldest dues first across both Tuition and Transport fees.
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
                  {feeTypeLabel(writeOffModal.feeType)} for {writeOffModal.month}. Remaining due: ₹{(writeOffModal.amount - writeOffModal.paidAmount).toLocaleString()}.
                </p>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center gap-2 mb-4">
                <IndianRupee size={16} className="text-slate-400" />
                <input type="number" value={writeOffAmount} onChange={e => setWriteOffAmount(e.target.value)}
                  placeholder="Amount to write off"
                  className="flex-1 bg-transparent font-black text-slate-900 text-lg outline-none" />
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
            <p className="text-[10px] font-bold text-slate-400">Tuition · Transport · Allocation</p>
          </div>
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or admission no..."
          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold outline-none focus:border-blue-500" />
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-2">
        {filtered.map(student => {
          const summary = feeService.getFeeTypeSummary(student.studentId);
          return (
            <button key={student.studentId} onClick={() => setSelected(student)}
              className="w-full text-left bg-white rounded-2xl border border-slate-100 shadow-sm p-4 active:scale-95 transition-transform">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="font-extrabold text-slate-900">{student.name}</div>
                  <div className="text-[10px] font-bold text-slate-400 mt-0.5">{student.className} · {student.admissionNo}</div>
                </div>
                <div className="text-right">
                  <div className="font-black text-slate-900">₹{summary.total.toLocaleString()}</div>
                  <div className="text-[9px] font-bold text-rose-600">Outstanding</div>
                </div>
              </div>
              <div className="flex gap-3 text-[10px]">
                {summary.tuition > 0 && (
                  <div className="flex items-center gap-1 text-indigo-600 font-bold">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
                    Tuition: ₹{summary.tuition}
                  </div>
                )}
                {summary.transport > 0 && (
                  <div className="flex items-center gap-1 text-orange-600 font-bold">
                    <div className="w-1.5 h-1.5 rounded-full bg-orange-600" />
                    Transport: ₹{summary.transport}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
