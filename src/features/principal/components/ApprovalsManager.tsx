import React, { useEffect, useState } from 'react';
import { ArrowLeft, CheckSquare, CheckCircle2, XCircle, Clock, FileText } from 'lucide-react';
import { principalService } from '../../../services/principal.service';
import { Approval, ApprovalStatus } from '../../../types/principal.types';
import { useUIStore } from '../../../store/uiStore';

type Filter = 'ALL' | ApprovalStatus;

interface Props { onBack: () => void; }

const statusColor = (s: ApprovalStatus) =>
  s === 'PENDING' ? 'bg-amber-50 text-amber-700' :
  s === 'APPROVED' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700';

const typeColor = (t: string) =>
  t === 'LEAVE' ? 'bg-blue-50 text-blue-700' :
  t === 'FEE_PAYMENT' ? 'bg-emerald-50 text-emerald-700' : 'bg-violet-50 text-violet-700';

export const ApprovalsManager: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [selected, setSelected] = useState<Approval | null>(null);
  const [filter, setFilter] = useState<Filter>('PENDING');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);

  useEffect(() => { principalService.getApprovals().then(setApprovals); }, []);

  const filtered = filter === 'ALL' ? approvals : approvals.filter(a => a.status === filter);
  const pendingCount = approvals.filter(a => a.status === 'PENDING').length;

  const handleApprove = async (id: string) => {
    setIsSubmitting(true);
    try {
      const updated = await principalService.approveRequest(id);
      setApprovals(prev => prev.map(a => a.id === updated.id ? updated : a));
      setSelected(updated);
      setShowRejectForm(false);
      showToast('Request approved');
    } finally { setIsSubmitting(false); }
  };

  const handleReject = async (id: string) => {
    if (!rejectReason.trim()) { setShowRejectForm(true); return; }
    setIsSubmitting(true);
    try {
      const updated = await principalService.rejectRequest(id, rejectReason.trim());
      setApprovals(prev => prev.map(a => a.id === updated.id ? updated : a));
      setSelected(updated);
      setRejectReason('');
      setShowRejectForm(false);
      showToast('Request rejected', 'info');
    } finally { setIsSubmitting(false); }
  };

  if (selected) return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
        <button onClick={() => { setSelected(null); setShowRejectForm(false); setRejectReason(''); }}
          className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600"><ArrowLeft size={20} /></button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Request Detail</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
          <div className="flex gap-2">
            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${typeColor(selected.type)}`}>{selected.type.replace('_', ' ')}</span>
            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${statusColor(selected.status)}`}>{selected.status}</span>
          </div>
          <h3 className="font-black text-slate-900 text-base">{selected.subject}</h3>
          <p className="text-sm font-bold text-slate-500 whitespace-pre-line">{selected.description}</p>
          <div className="text-[10px] font-bold text-slate-400">
            From: <span className="text-slate-700 font-black">{selected.fromName}</span> ({selected.fromRole})
          </div>
          <div className="text-[10px] font-bold text-slate-400">Filed: {selected.createdAt}</div>
          {selected.attachmentUrl && (
            <div className="flex items-center gap-2 bg-indigo-50 rounded-xl p-3">
              <FileText size={14} className="text-indigo-500" />
              <span className="text-xs font-bold text-indigo-700">Attachment: {selected.attachmentUrl}</span>
            </div>
          )}
          {selected.rejectionReason && (
            <div className="bg-rose-50 border border-rose-100 rounded-xl p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-rose-500 mb-1">Rejection Reason</p>
              <p className="text-sm font-bold text-rose-700">{selected.rejectionReason}</p>
            </div>
          )}
        </div>

        {selected.status === 'PENDING' && (
          <div className="space-y-3">
            {/* Rejection reason input */}
            {showRejectForm && (
              <div className="bg-white rounded-2xl border border-rose-100 shadow-sm p-4 space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-rose-500">Rejection Reason</p>
                <textarea
                  placeholder="Enter reason for rejection..."
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  rows={3}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-rose-400 resize-none"
                />
                <div className="flex gap-3">
                  <button onClick={() => { setShowRejectForm(false); setRejectReason(''); }}
                    className="flex-1 py-3 bg-slate-100 text-slate-600 font-black rounded-2xl text-sm">
                    Cancel
                  </button>
                  <button onClick={() => handleReject(selected.id)} disabled={isSubmitting || !rejectReason.trim()}
                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-rose-500 text-white font-black rounded-2xl active:scale-95 transition-transform disabled:opacity-60 text-sm">
                    <XCircle size={16} /> Confirm Reject
                  </button>
                </div>
              </div>
            )}

            {!showRejectForm && (
              <div className="flex gap-3">
                <button onClick={() => setShowRejectForm(true)} disabled={isSubmitting}
                  className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-rose-50 text-rose-700 border border-rose-200 font-black rounded-2xl active:scale-95 transition-transform disabled:opacity-60">
                  <XCircle size={16} /> Reject
                </button>
                <button onClick={() => handleApprove(selected.id)} disabled={isSubmitting}
                  className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-emerald-600 text-white font-black rounded-2xl active:scale-95 transition-transform disabled:opacity-60">
                  <CheckCircle2 size={16} /> Approve
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600"><ArrowLeft size={20} /></button>
          <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Approvals</h2>
        </div>
        {pendingCount > 0 && (
          <div className="w-6 h-6 bg-rose-500 text-white text-xs font-black rounded-full flex items-center justify-center">{pendingCount}</div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-3">
        <div className="flex gap-2">
          {(['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as Filter[]).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`flex-1 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-colors ${filter === f ? 'bg-slate-900 text-white' : 'bg-white text-slate-400 border border-slate-200'}`}>
              {f}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          {filtered.map(ap => (
            <button key={ap.id} onClick={() => { setSelected(ap); setShowRejectForm(false); setRejectReason(''); }}
              className="w-full bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-left active:bg-slate-50">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex gap-2 flex-wrap">
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${typeColor(ap.type)}`}>{ap.type.replace('_', ' ')}</span>
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${statusColor(ap.status)}`}>{ap.status}</span>
                </div>
                <span className="text-[10px] font-bold text-slate-400 shrink-0">{ap.createdAt}</span>
              </div>
              <div className="font-extrabold text-slate-900 text-sm">{ap.subject}</div>
              <div className="text-[10px] font-bold text-slate-500 mt-1">{ap.fromName} · {ap.fromRole}</div>
              {ap.rejectionReason && (
                <div className="mt-1.5 text-[10px] font-bold text-rose-600 truncate">
                  Reason: {ap.rejectionReason}
                </div>
              )}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="flex flex-col items-center py-16 text-slate-400">
              <CheckSquare size={32} className="mb-3 opacity-40" />
              <p className="font-bold text-sm">No approvals</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
