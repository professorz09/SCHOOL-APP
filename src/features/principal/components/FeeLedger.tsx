import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, IndianRupee, CheckCircle2, AlertTriangle, Clock, X,
  ShieldCheck, Search, Printer, Banknote, Smartphone, CreditCard,
  Building2, FileCheck, ChevronRight, Receipt, TrendingDown, Users, Filter,
} from 'lucide-react';
import { feeService, FeeInstallment, FeeStatus, FeeType, PaymentRecord } from '../../../services/fee.service';
import { studentService } from '../../../services/student.service';
import { useUIStore } from '../../../store/uiStore';

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

const STATUS_COLOR: Record<FeeStatus, string> = {
  PAID:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  PARTIAL: 'bg-amber-50 text-amber-700 border-amber-200',
  UNPAID:  'bg-rose-50 text-rose-700 border-rose-200',
  WAIVED:  'bg-slate-100 text-slate-500 border-slate-200',
};
const STATUS_BAR: Record<FeeStatus, string> = {
  PAID: 'bg-emerald-500', PARTIAL: 'bg-amber-400', UNPAID: 'bg-rose-400', WAIVED: 'bg-slate-300',
};
const STATUS_ICON = (s: FeeStatus) => {
  if (s === 'PAID')    return <CheckCircle2 size={11} className="text-emerald-500" />;
  if (s === 'PARTIAL') return <AlertTriangle size={11} className="text-amber-500" />;
  if (s === 'UNPAID')  return <Clock size={11} className="text-rose-500" />;
  return <X size={11} className="text-slate-400" />;
};
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

export const FeeLedger: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();
  const [students, setStudents]       = useState<StudentFeeProfile[]>([]);
  const [loading, setLoading]         = useState(true);
  const [selected, setSelected]       = useState<StudentFeeProfile | null>(null);
  const [listTab, setListTab]         = useState<ListTab>('ALL');
  const [search, setSearch]           = useState('');
  const [detailTab, setDetailTab]     = useState<'SCHEDULE' | 'HISTORY'>('SCHEDULE');

  // Modal states
  const [payModal, setPayModal]             = useState(false);
  const [writeOffModal, setWriteOffModal]   = useState<FeeInstallment | null>(null);
  const [govtPayModal, setGovtPayModal]     = useState(false);
  const [receiptModal, setReceiptModal]     = useState<PaymentRecord | null>(null);

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

  useEffect(() => {
    studentService.getAll().then(all => {
      const profiles = all.map(s =>
        feeService.getStudentFeeProfile(s.id, s.name, `${s.className}-${s.section}`, s.admissionNo, s.rte)
      );
      setStudents(profiles);
      setLoading(false);
    });
  }, []);

  const updateStudent = (updated: StudentFeeProfile) => {
    setStudents(prev => prev.map(s => s.studentId === updated.studentId ? updated : s));
    setSelected(updated);
  };

  const handlePayment = () => {
    if (!selected || !payAmount) return;
    const amount = Number(payAmount);
    if (isNaN(amount) || amount <= 0) return;
    const prevInstallments = feeService.getStudentInstallments(selected.studentId).map(i => ({ ...i }));
    const result = feeService.recordPayment(selected.studentId, amount);
    if (result.applied > 0 || result.advance > 0) {
      const updated = feeService.getStudentFeeProfile(selected.studentId, selected.name, selected.className, selected.admissionNo, selected.isRte);
      updateStudent(updated);
      const newInstallments = feeService.getStudentInstallments(selected.studentId);
      const changedIds: string[] = [];
      const changedDetails: { month: string; feeType: FeeType; amount: number }[] = [];
      for (const newInst of newInstallments) {
        const prev = prevInstallments.find(p => p.id === newInst.id);
        if (prev && newInst.paidAmount > prev.paidAmount) {
          changedIds.push(newInst.id);
          changedDetails.push({ month: newInst.month, feeType: newInst.feeType, amount: newInst.paidAmount - prev.paidAmount });
        }
      }
      const record: PaymentRecord = {
        id: `tx${Date.now()}`,
        studentId: selected.studentId,
        studentName: selected.name,
        className: selected.className,
        admissionNo: selected.admissionNo,
        amount,
        method: METHOD_LABEL[paymentMethod],
        date: new Date().toISOString().split('T')[0],
        receiptNo: feeService.nextReceiptNo(),
        installmentIds: changedIds,
        installmentDetails: changedDetails,
        advanceAmount: result.advance,
        note: paymentNote || undefined,
      };
      feeService.addPaymentRecord(record);
      setPaymentTransactions(feeService.getPaymentHistory());
      setReceiptModal(record);
      setPayAmount('');
      setPaymentNote('');
      setPayModal(false);
    }
  };

  const handleWriteOff = () => {
    if (!writeOffModal || !writeOffReason.trim()) return;
    const amount = Number(writeOffAmount) || writeOffModal.amount - writeOffModal.paidAmount;
    if (feeService.writeOffFee(writeOffModal.id, amount, writeOffReason)) {
      const updated = feeService.getStudentFeeProfile(selected!.studentId, selected!.name, selected!.className, selected!.admissionNo, selected!.isRte);
      updateStudent(updated);
      setWriteOffModal(null);
      setWriteOffAmount('');
      setWriteOffReason('');
      showToast('Fee write-off recorded');
    }
  };

  const handleGovtPayment = () => {
    if (!govtPayAmount || !govtRefNo.trim()) { showToast('Amount and reference number required', 'error'); return; }
    const amount = Number(govtPayAmount);
    if (isNaN(amount) || amount <= 0) { showToast('Invalid amount', 'error'); return; }
    const rteStudents = students.filter(s => s.isRte).map(s => s.studentId);
    if (rteStudents.length === 0) { showToast('No RTE students found', 'error'); return; }
    if (feeService.recordGovernmentPayment(rteStudents, amount, govtRefNo, govtNote)) {
      setStudents(students.map(s => feeService.getStudentFeeProfile(s.studentId, s.name, s.className, s.admissionNo, s.isRte)));
      setGovtPayModal(false);
      setGovtPayAmount('');
      setGovtRefNo('');
      setGovtNote('');
      showToast('Government payment recorded');
    }
  };

  // ─── Loading ─────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex items-center justify-center">
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
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.admissionNo.toLowerCase().includes(search.toLowerCase()) ||
    s.className.toLowerCase().includes(search.toLowerCase());

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

  // ─── DETAIL VIEW ─────────────────────────────────────────────────────────────
  if (selected) {
    const parentSummary = getParentDue(selected.studentId);
    const govtSummary   = selected.isRte ? getGovtDue(selected.studentId) : { tuition: 0, total: 0 };
    const advance       = feeService.getAdvanceBalance(selected.studentId);
    const totalDue      = selected.installments.reduce((a, i) => a + i.amount, 0);
    const totalPaid     = selected.installments.reduce((a, i) => a + i.paidAmount, 0);
    const pct           = totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 100;

    return (
      <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
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
            {/* Collect button */}
            <button onClick={() => setPayModal(true)}
              className="flex items-center gap-1.5 bg-emerald-600 text-white text-[10px] font-black px-3 py-2 rounded-xl shadow-sm active:scale-95 transition-transform">
              <IndianRupee size={12} /> Collect
            </button>
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
          {selected.isRte && (
            <button onClick={() => setGovtPayModal(true)}
              className="ml-auto my-2 flex items-center gap-1 bg-blue-50 text-blue-700 text-[10px] font-black px-3 py-1.5 rounded-xl border border-blue-200 active:scale-95 transition-transform">
              <ShieldCheck size={11} /> Govt Pay
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-3">

          {/* ── FEE SCHEDULE ─────────────────────────────────────────────── */}
          {detailTab === 'SCHEDULE' && selected.installments
            .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
            .map(inst => {
              const due = inst.amount - inst.paidAmount - inst.writeOffAmount;
              const receipt = feeService.getPaymentRecordByInstallmentId(inst.id);
              return (
                <div key={inst.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  {/* Status left strip */}
                  <div className="flex">
                    <div className={`w-1 shrink-0 ${STATUS_BAR[inst.status]}`} />
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
                        <span className={`flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-full border ${STATUS_COLOR[inst.status]}`}>
                          {STATUS_ICON(inst.status)} {inst.status}
                        </span>
                        {receipt && (
                          <button onClick={() => setReceiptModal(receipt)}
                            className="flex items-center gap-1 text-[9px] font-black text-indigo-600 px-2 py-0.5 rounded-full border border-indigo-200 bg-indigo-50">
                            <Printer size={9} /> Receipt
                          </button>
                        )}
                        {inst.status !== 'PAID' && inst.status !== 'WAIVED' && due > 0 && (
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
            })
          }

          {/* ── PAYMENT HISTORY ───────────────────────────────────────────── */}
          {detailTab === 'HISTORY' && (() => {
            const txns = paymentTransactions.filter(t => t.studentId === selected.studentId)
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            if (txns.length === 0) return (
              <div className="flex flex-col items-center py-16 text-slate-400">
                <Receipt size={32} className="mb-3 opacity-40" />
                <p className="font-bold text-sm">No payments yet</p>
              </div>
            );
            return txns.map(txn => (
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
            ));
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

              <div className="border-2 border-dashed border-slate-200 rounded-2xl p-5 mb-4">
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

              <div className="flex gap-3">
                <button onClick={() => window.print()} className="flex-1 py-3 bg-slate-100 text-slate-900 font-black rounded-xl">Print PDF</button>
                <button onClick={() => setReceiptModal(null)} className="flex-1 py-3 bg-indigo-600 text-white font-black rounded-xl">Close</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── LIST VIEW ────────────────────────────────────────────────────────────────
  return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">

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
      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-2.5">
        {visibleStudents.length === 0 && (
          <div className="flex flex-col items-center py-16 text-slate-400">
            <Users size={32} className="mb-3 opacity-30" />
            <p className="font-bold text-sm">No students</p>
          </div>
        )}

        {visibleStudents.map(student => {
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
                  {student.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
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
      </div>
    </div>
  );
};
