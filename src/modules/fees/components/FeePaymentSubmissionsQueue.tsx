import React, { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Clock, IndianRupee, ChevronDown, ChevronUp, Hash, Copy } from 'lucide-react';
import { feeService } from '@/modules/fees/fee.service';
import type { FeePaymentUploadRecord, FeeUploadStatus } from '@/modules/fees/fees.types';
import { useUIStore } from '@/store/uiStore';

const STATUS_BADGE: Record<FeeUploadStatus, string> = {
  PENDING:  'bg-amber-50 text-amber-700 border-amber-200',
  APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  REJECTED: 'bg-rose-50 text-rose-700 border-rose-200',
};

const STATUS_ICON = (s: FeeUploadStatus) => {
  if (s === 'APPROVED') return <CheckCircle2 size={11} className="text-emerald-600" />;
  if (s === 'REJECTED') return <XCircle size={11} className="text-rose-600" />;
  return <Clock size={11} className="text-amber-600" />;
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

interface QueueProps {
  /** When true, opens with the full review history (approved +
   *  rejected) shown — used inside the History tab. */
  defaultExpanded?: boolean;
  /** When true, the component renders NOTHING when there are 0
   *  pending submissions (no "View history" pill, no empty state).
   *  Used inline on the main fee list where a dedicated History tab
   *  already owns the audit trail. */
  pendingOnly?: boolean;
}

export const FeePaymentSubmissionsQueue: React.FC<QueueProps> = ({
  defaultExpanded = false,
  pendingOnly = false,
}) => {
  const [items, setItems] = useState<FeePaymentUploadRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const showToast = useUIStore(s => s.showToast);

  const reload = async () => {
    try {
      const rows = await feeService.getFeePaymentUploads('ALL');
      setItems(rows);
    } catch (err) {
      console.error('[fee-uploads] load failed', err);
      showToast(err instanceof Error ? err.message : 'Failed to load submissions', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  const review = async (id: string, decision: 'APPROVED' | 'REJECTED') => {
    setBusyId(id);
    try {
      const note = decision === 'REJECTED'
        ? (window.prompt('Reason for rejection (optional):') ?? undefined)
        : undefined;
      await feeService.reviewFeePaymentUpload(id, decision, note);
      showToast(`Submission ${decision.toLowerCase()}`, 'success');
      await reload();
    } catch (err) {
      console.error('[fee-uploads] review failed', err);
      showToast(err instanceof Error ? err.message : 'Action failed', 'error');
    } finally {
      setBusyId(null);
    }
  };

  // Copy txn_id to clipboard so the principal can paste into bank/UPI
  // statement search to verify before approving.
  const copyTxn = async (txn: string) => {
    try {
      await navigator.clipboard.writeText(txn);
      showToast('Transaction ID copied', 'success');
    } catch {
      showToast('Could not copy', 'error');
    }
  };

  // pendingOnly mode: the inline banner on the main fee list. Skip
  // EVERYTHING (loader, empty state, history pill) — only renders
  // when there's actually a pending item to review.
  if (pendingOnly && (loading || items.length === 0 || items.every(i => i.status !== 'PENDING'))) {
    return null;
  }

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-xs font-bold text-slate-400">
        Loading parent payment submissions…
      </div>
    );
  }

  if (items.length === 0) {
    // In History tab (defaultExpanded) we surface an empty state so
    // the principal sees confirmation that nothing has been submitted
    // yet, instead of a blank pane.
    if (defaultExpanded) {
      return (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center">
          <div className="text-sm font-black text-slate-500">No submissions yet</div>
          <p className="text-[11px] font-bold text-slate-400 mt-1">
            Parent / student fee-payment screenshots will appear here once submitted.
          </p>
        </div>
      );
    }
    return null;
  }

  const pendingCount = items.filter(i => i.status === 'PENDING').length;
  const visible = expanded ? items : items.filter(i => i.status === 'PENDING');

  if (visible.length === 0 && !expanded) return (
    <button
      onClick={() => setExpanded(true)}
      className="w-full bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3 flex items-center justify-between text-xs font-bold text-slate-500 hover:bg-slate-50 transition-colors"
    >
      <span>No pending submissions</span>
      <span className="flex items-center gap-1 text-blue-600">
        View history ({items.length}) <ChevronDown size={14} />
      </span>
    </button>
  );

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div>
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">
            Parent Submissions
          </h3>
          <p className="text-[10px] font-bold text-slate-400 mt-0.5">
            {expanded
              ? `${pendingCount} pending · ${items.length - pendingCount} reviewed`
              : `${pendingCount} pending`}
          </p>
        </div>
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex items-center gap-1 text-[10px] font-black text-blue-600 uppercase tracking-widest hover:text-blue-700"
        >
          {expanded ? 'Pending only' : `View history (${items.length - pendingCount})`}
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>

      <ul className="divide-y divide-slate-50">
        {visible.map(item => (
          <li key={item.id} className="px-4 py-3 flex flex-col gap-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-extrabold text-slate-900 truncate">
                  {item.studentName}
                  {item.admissionNo && (
                    <span className="ml-2 text-[10px] font-bold text-slate-400">#{item.admissionNo}</span>
                  )}
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <IndianRupee size={11} className="text-slate-400" />
                  <span className="text-xs font-extrabold text-slate-700">
                    {item.amount.toLocaleString('en-IN')}
                  </span>
                  <span className="text-[10px] font-bold text-slate-400 ml-2">
                    {formatDate(item.submittedAt)}
                  </span>
                </div>
                {item.description && (
                  <p className="text-[11px] font-medium text-slate-500 mt-1 line-clamp-2">{item.description}</p>
                )}
                {/* Transaction ID — the canonical proof. Click to copy so the
                    principal can paste it into bank/UPI statement search. */}
                <button
                  type="button"
                  onClick={() => copyTxn(item.transactionId)}
                  className="inline-flex items-center gap-1.5 mt-1.5 px-2 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-colors max-w-full"
                  title="Copy transaction ID"
                >
                  <Hash size={11} className="text-blue-600 shrink-0" />
                  <span className="font-mono text-[11px] font-bold text-blue-700 tracking-wide truncate">
                    {item.transactionId}
                  </span>
                  <Copy size={10} className="text-blue-400 shrink-0" />
                </button>
                {item.reviewerNote && (
                  <p className="text-[10px] font-medium text-slate-400 italic mt-1">
                    Note: {item.reviewerNote}
                  </p>
                )}
              </div>
              <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-widest ${STATUS_BADGE[item.status]}`}>
                {STATUS_ICON(item.status)} {item.status}
              </span>
            </div>

            {item.status === 'PENDING' && (
              <div className="flex gap-2">
                <button
                  disabled={busyId === item.id}
                  onClick={() => review(item.id, 'APPROVED')}
                  className="flex-1 bg-emerald-600 disabled:bg-emerald-300 text-white text-[10px] font-black uppercase tracking-widest py-1.5 rounded-xl"
                >
                  Approve
                </button>
                <button
                  disabled={busyId === item.id}
                  onClick={() => review(item.id, 'REJECTED')}
                  className="flex-1 bg-rose-600 disabled:bg-rose-300 text-white text-[10px] font-black uppercase tracking-widest py-1.5 rounded-xl"
                >
                  Reject
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};
