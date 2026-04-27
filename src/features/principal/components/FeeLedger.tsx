import React, { useState, useEffect } from 'react';
import { ArrowLeft, IndianRupee, CheckCircle2, AlertTriangle, Clock, X, ShieldCheck, Search, Filter, Printer, Banknote, Smartphone, CreditCard, Building2, FileCheck } from 'lucide-react';
import { feeService, FeeInstallment, FeeStatus, FeeType, PaymentRecord } from '../../../services/fee.service';
import { studentService } from '../../../services/student.service';
import { useUIStore } from '../../../store/uiStore';

type PaymentMethod = 'CASH' | 'UPI' | 'NET_BANKING' | 'CHEQUE' | 'ONLINE';


const METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  UPI: 'UPI',
  NET_BANKING: 'Net Banking',
  CHEQUE: 'Cheque',
  ONLINE: 'Online',
};

const METHOD_ICON: Record<PaymentMethod, React.ReactNode> = {
  CASH: <Banknote size={16} />,
  UPI: <Smartphone size={16} />,
  NET_BANKING: <Building2 size={16} />,
  CHEQUE: <FileCheck size={16} />,
  ONLINE: <CreditCard size={16} />,
};

interface StudentFeeProfile {
  studentId: string;
  name: string;
  className: string;
  admissionNo: string;
  installments: FeeInstallment[];
  isRte: boolean;
}

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

const payerBadge = (payer: 'PARENT' | 'GOVERNMENT') => {
  if (payer === 'GOVERNMENT') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  return 'bg-blue-50 text-blue-700 border-blue-200';
};

const payerLabel = (payer: 'PARENT' | 'GOVERNMENT') => {
  return payer === 'GOVERNMENT' ? 'RTE (Govt)' : 'Parent';
};

interface Props { onBack: () => void; }

export const FeeLedger: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();
  const [students, setStudents] = useState<StudentFeeProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<StudentFeeProfile | null>(null);
  const [mainView, setMainView] = useState<'LIST' | 'DETAIL' | 'GOVT'>('LIST');
  const [payModal, setPayModal] = useState<boolean>(false);
  const [writeOffModal, setWriteOffModal] = useState<FeeInstallment | null>(null);
  const [govtPayModal, setGovtPayModal] = useState<boolean>(false);
  const [payAmount, setPayAmount] = useState('');
  const [writeOffAmount, setWriteOffAmount] = useState('');
  const [writeOffReason, setWriteOffReason] = useState('');
  const [govtPayAmount, setGovtPayAmount] = useState('');
  const [govtRefNo, setGovtRefNo] = useState('');
  const [govtNote, setGovtNote] = useState('');
  const [search, setSearch] = useState('');
  const [showOnlyDue, setShowOnlyDue] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [paymentTransactions, setPaymentTransactions] = useState<PaymentRecord[]>(() => feeService.getPaymentHistory());
  const [receiptModal, setReceiptModal] = useState<PaymentRecord | null>(null);

  useEffect(() => {
    studentService.getAll().then(all => {
      const profiles = all.map(s =>
        feeService.getStudentFeeProfile(s.id, s.name, `${s.className}-${s.section}`, s.admissionNo, s.rte)
      );
      setStudents(profiles);
      setLoading(false);
    });
  }, []);

  const filtered = students.filter(s => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.admissionNo.toLowerCase().includes(search.toLowerCase()) ||
      s.className.toLowerCase().includes(search.toLowerCase());
    if (showOnlyDue) {
      const parentDue = feeService.getParentDueSummary(s.studentId).total;
      const govtDue = s.isRte ? feeService.getGovernmentDueSummary(s.studentId).total : 0;
      return matchSearch && (parentDue > 0 || govtDue > 0);
    }
    return matchSearch;
  });

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

      // Determine which installments changed to PAID/PARTIAL
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
      };
      feeService.addPaymentRecord(record);
      setPaymentTransactions(feeService.getPaymentHistory());
      setReceiptModal(record);
      setPayAmount('');
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
    if (!govtPayAmount || !govtRefNo.trim()) {
      showToast('Amount and reference number required', 'error');
      return;
    }
    const amount = Number(govtPayAmount);
    if (isNaN(amount) || amount <= 0) {
      showToast('Invalid amount', 'error');
      return;
    }
    const rteStudents = students.filter(s => s.isRte).map(s => s.studentId);
    if (rteStudents.length === 0) {
      showToast('No RTE students found', 'error');
      return;
    }
    if (feeService.recordGovernmentPayment(rteStudents, amount, govtRefNo, govtNote)) {
      const updated = students.map(s =>
        feeService.getStudentFeeProfile(s.studentId, s.name, s.className, s.admissionNo, s.isRte)
      );
      setStudents(updated);
      setGovtPayModal(false);
      setGovtPayAmount('');
      setGovtRefNo('');
      setGovtNote('');
      showToast('Government payment recorded successfully');
    }
  };

  const getInstallmentReceipt = (installmentId: string) =>
    feeService.getPaymentRecordByInstallmentId(installmentId);

  if (selected && mainView === 'DETAIL') {
    const parentSummary = feeService.getParentDueSummary(selected.studentId);
    const govtSummary = selected.isRte ? feeService.getGovernmentDueSummary(selected.studentId) : { tuition: 0, total: 0 };

    return (
      <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        <div className="bg-white border-b border-slate-100 px-4 pt-12 pb-4 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <button onClick={() => { setSelected(null); setMainView('LIST'); }} className="p-2 -ml-2 bg-slate-100 rounded-full">
              <ArrowLeft size={20} className="text-slate-600" />
            </button>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-slate-900">{selected.name}</h2>
                {selected.isRte && <ShieldCheck size={14} className="text-emerald-600" />}
              </div>
              <p className="text-[10px] font-bold text-slate-400">{selected.className} · {selected.admissionNo}</p>
            </div>
          </div>

          {/* Summary split: Parent vs Government */}
          <div className="space-y-2">
            {/* Parent Due */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Tuition (Parent)', val: `₹${parentSummary.tuition.toLocaleString()}`, color: 'text-blue-600' },
                { label: 'Transport', val: `₹${parentSummary.transport.toLocaleString()}`, color: 'text-orange-600' },
                { label: 'Parent Total', val: `₹${parentSummary.total.toLocaleString()}`, color: parentSummary.total > 0 ? 'text-rose-600' : 'text-emerald-600' },
              ].map(({ label, val, color }) => (
                <div key={label} className="bg-slate-50 rounded-xl p-3 text-center">
                  <div className={`text-base font-black ${color}`}>{val}</div>
                  <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-0.5">{label}</div>
                </div>
              ))}
            </div>
            {/* Advance Balance */}
            {feeService.getAdvanceBalance(selected.studentId) > 0 && (
              <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <div className="text-[9px] font-black uppercase tracking-widest text-violet-500">Advance Credit</div>
                  <div className="text-[10px] font-bold text-violet-700 mt-0.5">Will auto-adjust to next due</div>
                </div>
                <div className="text-base font-black text-violet-700">
                  ₹{feeService.getAdvanceBalance(selected.studentId).toLocaleString()}
                </div>
              </div>
            )}
            {/* Government Due (RTE only) */}
            {selected.isRte && (
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Tuition (Govt)', val: `₹${govtSummary.tuition.toLocaleString()}`, color: 'text-emerald-600' },
                  { label: 'Govt Total', val: `₹${govtSummary.total.toLocaleString()}`, color: govtSummary.total > 0 ? 'text-amber-600' : 'text-slate-600' },
                ].map(({ label, val, color }) => (
                  <div key={label} className="bg-emerald-50 rounded-xl p-3 text-center border border-emerald-100">
                    <div className={`text-base font-black ${color}`}>{val}</div>
                    <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-0.5">{label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Fee Schedule</p>
            <div className="flex gap-2">
              <button onClick={() => setPayModal(true)}
                className="flex items-center gap-1.5 bg-emerald-600 text-white text-[10px] font-black px-3 py-1.5 rounded-full">
                <IndianRupee size={11} /> Parent Pay
              </button>
              {selected.isRte && (
                <button onClick={() => setGovtPayModal(true)}
                  className="flex items-center gap-1.5 bg-blue-600 text-white text-[10px] font-black px-3 py-1.5 rounded-full">
                  <IndianRupee size={11} /> Govt Pay
                </button>
              )}
            </div>
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
                        <div className={`text-[8px] font-black px-2 py-0.5 rounded border ${payerBadge(inst.payerType)}`}>
                          {payerLabel(inst.payerType)}
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
                  <div className="flex items-center gap-2 px-3.5 pb-3 flex-wrap">
                    <div className={`flex items-center gap-1.5 text-[10px] font-black px-2.5 py-1 rounded-full border ${statusColor[inst.status]}`}>
                      {statusIcon(inst.status)} {inst.status}
                    </div>
                    {inst.status === 'PAID' && (() => {
                      const receipt = getInstallmentReceipt(inst.id);
                      return receipt ? (
                        <button onClick={() => setReceiptModal(receipt)}
                          className="flex items-center gap-1 text-[9px] font-black text-indigo-600 px-2.5 py-1 rounded-full border border-indigo-200 bg-indigo-50">
                          <Printer size={10} /> Receipt
                        </button>
                      ) : null;
                    })()}
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
                <h3 className="text-lg font-black text-slate-900">Collect Payment</h3>
                <button onClick={() => { setPayModal(false); setPayAmount(''); }} className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500">✕</button>
              </div>

              {/* Payment Method Selection */}
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Payment Method</p>
              <div className="flex gap-2 flex-wrap mb-4">
                {(Object.keys(METHOD_LABEL) as PaymentMethod[]).map(method => (
                  <button key={method} onClick={() => setPaymentMethod(method)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-colors ${
                      paymentMethod === method
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-slate-50 text-slate-600 border-slate-200'
                    }`}>
                    {METHOD_ICON[method]} {METHOD_LABEL[method]}
                  </button>
                ))}
              </div>

              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Amount Received</p>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center gap-2 mb-4">
                <IndianRupee size={16} className="text-slate-400" />
                <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)}
                  placeholder="Enter amount received"
                  className="flex-1 bg-transparent font-black text-slate-900 text-lg outline-none" />
              </div>
              {feeService.getAdvanceBalance(selected?.studentId ?? '') > 0 && (
                <div className="bg-violet-50 border border-violet-200 rounded-xl px-3 py-2 flex items-center justify-between mb-3">
                  <span className="text-[10px] font-black text-violet-600 uppercase tracking-wide">Existing Advance Credit</span>
                  <span className="text-sm font-black text-violet-700">₹{feeService.getAdvanceBalance(selected?.studentId ?? '').toLocaleString()}</span>
                </div>
              )}
              <p className="text-[11px] font-bold text-slate-400 mb-4">
                Allocated oldest dues first. Any excess is stored as advance credit for future months.
              </p>
              <button onClick={handlePayment}
                disabled={!payAmount}
                className="w-full py-3 bg-emerald-600 text-white font-black rounded-xl disabled:opacity-40">
                Collect & Generate Receipt
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

        {/* Receipt Modal */}
        {receiptModal && (
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-end">
            <div className="w-full bg-white rounded-t-3xl p-6 pb-8 animate-in slide-in-from-bottom-8 max-h-[80vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-black text-slate-900">Fee Receipt</h3>
                <button onClick={() => setReceiptModal(null)} className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500">✕</button>
              </div>

              {/* Receipt Card */}
              <div className="border-2 border-dashed border-slate-200 rounded-2xl p-5 mb-4">
                {/* Header */}
                <div className="text-center mb-4 pb-4 border-b border-slate-100">
                  <div className="font-black text-slate-900 text-lg uppercase tracking-wide">EduGrow School</div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Fee Receipt</div>
                  <div className="mt-2 inline-block bg-emerald-100 text-emerald-700 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">
                    PAID ✓
                  </div>
                </div>

                {/* Receipt Details */}
                <div className="space-y-2 mb-4">
                  {[
                    { label: 'Receipt No.', val: receiptModal.receiptNo },
                    { label: 'Date', val: receiptModal.date },
                    { label: 'Student', val: receiptModal.studentName },
                    { label: 'Class', val: receiptModal.className },
                    { label: 'Admission No.', val: receiptModal.admissionNo },
                    { label: 'Payment Method', val: receiptModal.method },
                  ].map(({ label, val }) => (
                    <div key={label} className="flex justify-between gap-2">
                      <span className="text-[10px] font-bold text-slate-400">{label}</span>
                      <span className="text-[11px] font-black text-slate-800 text-right">{val}</span>
                    </div>
                  ))}
                </div>

                {/* Installments */}
                {receiptModal.installmentDetails.length > 0 && (
                  <div className="border-t border-slate-100 pt-3 mb-3">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Fee Breakdown</p>
                    {receiptModal.installmentDetails.map((d, i) => (
                      <div key={i} className="flex justify-between gap-2 py-1.5 border-b border-slate-50 last:border-0">
                        <span className="text-[11px] font-bold text-slate-600">{d.month} · {d.feeType === 'TUITION' ? 'Tuition' : d.feeType === 'TRANSPORT' ? 'Transport' : d.feeType}</span>
                        <span className="text-[11px] font-black text-slate-900">₹{d.amount.toLocaleString('en-IN')}</span>
                      </div>
                    ))}
                    {receiptModal.advanceAmount > 0 && (
                      <div className="flex justify-between gap-2 py-1.5 mt-1 bg-violet-50 rounded-lg px-2">
                        <span className="text-[11px] font-bold text-violet-600">Advance Credit Added</span>
                        <span className="text-[11px] font-black text-violet-700">₹{receiptModal.advanceAmount.toLocaleString('en-IN')}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Total */}
                <div className="flex justify-between items-center bg-slate-900 rounded-xl px-4 py-3">
                  <span className="text-xs font-black text-white uppercase">Total Paid</span>
                  <span className="text-lg font-black text-white">₹{receiptModal.amount.toLocaleString('en-IN')}</span>
                </div>
              </div>

              <button onClick={() => setReceiptModal(null)}
                className="w-full py-3 bg-indigo-600 text-white font-black rounded-xl">
                Close
              </button>
            </div>
          </div>
        )}

        {/* Government Payment Modal */}
        {govtPayModal && (
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-end">
            <div className="w-full bg-white rounded-t-3xl p-6 pb-8 animate-in slide-in-from-bottom-8">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-black text-slate-900">Government Payment (RTE)</h3>
                <button onClick={() => setGovtPayModal(false)} className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500">✕</button>
              </div>
              <p className="text-[11px] font-bold text-slate-400 mb-4">
                Record government RTE reimbursement. Payment will be allocated to all RTE students' government-payer tuition fees (oldest due first).
              </p>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center gap-2 mb-4">
                <IndianRupee size={16} className="text-slate-400" />
                <input type="number" value={govtPayAmount} onChange={e => setGovtPayAmount(e.target.value)}
                  placeholder="Enter amount received"
                  className="flex-1 bg-transparent font-black text-slate-900 text-lg outline-none" />
              </div>
              <input type="text" value={govtRefNo} onChange={e => setGovtRefNo(e.target.value)}
                placeholder="Reference No. (e.g. RTE/2026/APR/001)"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-500 mb-4" />
              <textarea value={govtNote} onChange={e => setGovtNote(e.target.value)}
                rows={2} placeholder="Note / Description (optional)"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-500 resize-none mb-4" />
              <button onClick={handleGovtPayment}
                disabled={!govtPayAmount || !govtRefNo.trim()}
                className="w-full py-3 bg-blue-600 text-white font-black rounded-xl disabled:opacity-40">
                Record Government Payment
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (loading) return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  );

  const dueStudents = students.filter(s => {
    const p = feeService.getParentDueSummary(s.studentId).total;
    const g = s.isRte ? feeService.getGovernmentDueSummary(s.studentId).total : 0;
    return p > 0 || g > 0;
  });
  const totalParentDue = dueStudents.reduce((acc, s) => acc + feeService.getParentDueSummary(s.studentId).total, 0);
  const totalGovtDue = dueStudents.filter(s => s.isRte).reduce((acc, s) => acc + feeService.getGovernmentDueSummary(s.studentId).total, 0);

  return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-4 pt-12 pb-3 shadow-sm">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full">
            <ArrowLeft size={20} className="text-slate-600" />
          </button>
          <div className="flex-1">
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Fee Ledger</h2>
            <p className="text-[10px] font-bold text-slate-400">{students.length} students · {dueStudents.length} with dues</p>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, class, admission no..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-sm font-bold outline-none focus:border-blue-500" />
          </div>
          <button onClick={() => setShowOnlyDue(d => !d)}
            className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-[10px] font-black transition-colors border ${showOnlyDue ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-slate-500 border-slate-200'}`}>
            <Filter size={12} /> Due Only
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-3">
        {/* Summary banner — only when showing dues */}
        {dueStudents.length > 0 && (
          <div className="bg-[#0d1b3e] rounded-2xl p-4 text-white">
            <p className="text-[9px] font-black uppercase tracking-widest text-blue-300 mb-2">Total Outstanding</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xl font-black">₹{totalParentDue.toLocaleString('en-IN')}</div>
                <div className="text-[9px] font-bold text-blue-300 mt-0.5">{dueStudents.filter(s => feeService.getParentDueSummary(s.studentId).total > 0).length} students — Parent Due</div>
              </div>
              {totalGovtDue > 0 && (
                <div>
                  <div className="text-xl font-black text-emerald-400">₹{totalGovtDue.toLocaleString('en-IN')}</div>
                  <div className="text-[9px] font-bold text-emerald-300 mt-0.5">{dueStudents.filter(s => s.isRte).length} RTE — Govt Due</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Due students — prominent cards at top */}
        {!showOnlyDue && dueStudents.length > 0 && (
          <>
            <p className="text-[10px] font-black uppercase tracking-widest text-rose-500">Pending Dues ({dueStudents.length})</p>
            {dueStudents.filter(s =>
              s.name.toLowerCase().includes(search.toLowerCase()) ||
              s.admissionNo.toLowerCase().includes(search.toLowerCase()) ||
              s.className.toLowerCase().includes(search.toLowerCase())
            ).map(student => {
              const parentSummary = feeService.getParentDueSummary(student.studentId);
              const govtSummary = student.isRte ? feeService.getGovernmentDueSummary(student.studentId) : { tuition: 0, total: 0 };
              return (
                <button key={student.studentId} onClick={() => { setSelected(student); setMainView('DETAIL'); }}
                  className="w-full text-left bg-white rounded-2xl border border-rose-200 shadow-sm p-4 active:scale-[0.98] transition-transform">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center font-black text-xs shrink-0">
                          {student.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <div className="font-extrabold text-slate-900 text-sm truncate">{student.name}</div>
                            {student.isRte && <ShieldCheck size={11} className="text-emerald-600 shrink-0" />}
                          </div>
                          <div className="text-[10px] font-bold text-slate-400">{student.className} · {student.admissionNo}</div>
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {parentSummary.total > 0 && (
                        <div>
                          <div className="font-black text-rose-600 text-base">₹{parentSummary.total.toLocaleString('en-IN')}</div>
                          <div className="text-[9px] font-bold text-rose-400">Parent Due</div>
                        </div>
                      )}
                      {govtSummary.total > 0 && (
                        <div className="mt-1">
                          <div className="font-black text-emerald-600 text-sm">₹{govtSummary.total.toLocaleString('en-IN')}</div>
                          <div className="text-[9px] font-bold text-emerald-500">Govt Due</div>
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Due breakdown pills */}
                  <div className="flex gap-1.5 mt-2.5 flex-wrap">
                    {parentSummary.tuition > 0 && (
                      <span className="text-[9px] font-black bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">
                        Tuition ₹{parentSummary.tuition.toLocaleString()}
                      </span>
                    )}
                    {parentSummary.transport > 0 && (
                      <span className="text-[9px] font-black bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full">
                        Transport ₹{parentSummary.transport.toLocaleString()}
                      </span>
                    )}
                    {govtSummary.tuition > 0 && (
                      <span className="text-[9px] font-black bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">
                        RTE Tuition ₹{govtSummary.tuition.toLocaleString()}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
            {search === '' && students.filter(s => feeService.getParentDueSummary(s.studentId).total === 0 && (!s.isRte || feeService.getGovernmentDueSummary(s.studentId).total === 0)).length > 0 && (
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mt-2">All Cleared</p>
            )}
          </>
        )}

        {/* All students (or filtered) */}
        {filtered
          .filter(s => showOnlyDue || feeService.getParentDueSummary(s.studentId).total === 0 && (!s.isRte || feeService.getGovernmentDueSummary(s.studentId).total === 0))
          .map(student => {
            const parentSummary = feeService.getParentDueSummary(student.studentId);
            return (
              <button key={student.studentId} onClick={() => { setSelected(student); setMainView('DETAIL'); }}
                className="w-full text-left bg-white rounded-2xl border border-slate-100 shadow-sm p-3.5 active:scale-[0.98] transition-transform">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-black text-xs shrink-0">
                    {student.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-extrabold text-slate-900 text-sm truncate">{student.name}</span>
                      {student.isRte && <ShieldCheck size={10} className="text-emerald-600 shrink-0" />}
                    </div>
                    <div className="text-[10px] font-bold text-slate-400">{student.className} · {student.admissionNo}</div>
                  </div>
                  <div className="flex items-center gap-1.5 text-[9px] font-black text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full shrink-0">
                    <CheckCircle2 size={10} /> Cleared
                  </div>
                </div>
              </button>
            );
          })}

        {filtered.length === 0 && (
          <div className="flex flex-col items-center py-16 text-slate-400">
            <IndianRupee size={32} className="mb-3 opacity-40" />
            <p className="font-bold text-sm">No students found</p>
          </div>
        )}
      </div>
    </div>
  );
};
