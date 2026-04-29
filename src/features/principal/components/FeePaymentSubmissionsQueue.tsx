import React, { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Clock, IndianRupee, Image as ImageIcon, ChevronDown, ChevronUp, Eye, X } from 'lucide-react';
import {
  principalService,
  type FeePaymentUploadRecord,
  type FeeUploadStatus,
} from '../../../services/principal.service';
import { useUIStore } from '../../../store/uiStore';

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

export const FeePaymentSubmissionsQueue: React.FC = () => {
  const [items, setItems] = useState<FeePaymentUploadRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const showToast = useUIStore(s => s.showToast);

  const reload = async () => {
    try {
      const rows = await principalService.getFeePaymentUploads('ALL');
      setItems(rows);
    } catch (err) {
      console.error('[fee-uploads] load failed', err);
      showToast(err instanceof Error ? err.message : 'Failed to load submissions', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  const openScreenshot = async (item: FeePaymentUploadRecord) => {
    if (!item.screenshotUrl) {
      showToast('No image attached to this submission', 'error');
      return;
    }
    setPreviewLoadingId(item.id);
    try {
      const url = await principalService.getFeePaymentScreenshotUrl(item.screenshotUrl);
      if (!url) throw new Error('Could not load image');
      setPreviewUrl(url);
    } catch (err) {
      console.error('[fee-uploads] preview failed', err);
      showToast(err instanceof Error ? err.message : 'Could not load image', 'error');
    } finally {
      setPreviewLoadingId(null);
    }
  };

  const review = async (id: string, decision: 'APPROVED' | 'REJECTED') => {
    setBusyId(id);
    try {
      const note = decision === 'REJECTED'
        ? (window.prompt('Reason for rejection (optional):') ?? undefined)
        : undefined;
      await principalService.reviewFeePaymentUpload(id, decision, note);
      showToast(`Submission ${decision.toLowerCase()}`, 'success');
      await reload();
    } catch (err) {
      console.error('[fee-uploads] review failed', err);
      showToast(err instanceof Error ? err.message : 'Action failed', 'error');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-xs font-bold text-slate-400">
        Loading parent payment submissions…
      </div>
    );
  }

  if (items.length === 0) return null;

  const pendingCount = items.filter(i => i.status === 'PENDING').length;
  const visible = expanded ? items : items.filter(i => i.status === 'PENDING');

  if (visible.length === 0 && !expanded) return (
    <button
      onClick={() => setExpanded(true)}
      className="w-full bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3 flex items-center justify-between text-xs font-bold text-slate-500"
    >
      <span>No pending fee submissions · {items.length} reviewed</span>
      <ChevronDown size={14} />
    </button>
  );

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div>
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">
            Parent Payment Submissions
          </h3>
          <p className="text-[10px] font-bold text-slate-400 mt-0.5">
            {pendingCount} pending · {items.length} total
          </p>
        </div>
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex items-center gap-1 text-[10px] font-black text-blue-600 uppercase tracking-widest"
        >
          {expanded ? 'Pending only' : 'Show all'}
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
                <div className="flex items-center gap-2 mt-1">
                  {item.screenshotName && (
                    <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 min-w-0">
                      <ImageIcon size={10} className="shrink-0" />
                      <span className="truncate">{item.screenshotName}</span>
                    </div>
                  )}
                  {item.screenshotUrl ? (
                    <button
                      type="button"
                      onClick={() => openScreenshot(item)}
                      disabled={previewLoadingId === item.id}
                      className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-blue-600 disabled:opacity-60"
                    >
                      <Eye size={10} />
                      {previewLoadingId === item.id ? 'Loading…' : 'View image'}
                    </button>
                  ) : (
                    <span className="text-[10px] font-bold text-slate-300 italic">No image</span>
                  )}
                </div>
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

      {previewUrl && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setPreviewUrl(null)}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setPreviewUrl(null); }}
            className="absolute top-4 right-4 bg-white/10 text-white rounded-full p-2"
            aria-label="Close screenshot"
          >
            <X size={20} />
          </button>
          <img
            src={previewUrl}
            alt="Fee payment screenshot"
            className="max-w-full max-h-full rounded-2xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
};
