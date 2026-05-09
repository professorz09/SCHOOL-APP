import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, CircleAlert, XCircle, EyeOff } from 'lucide-react';
import { principalService } from '@/roles/principal/principal.service';
import { Complaint, ComplaintStatus } from '@/roles/principal/principal.types';
import { useUIStore } from '@/store/uiStore';
import { useRealtimeTable } from '@/shared/hooks/useRealtimeTable';

type Filter = 'ALL' | ComplaintStatus;

interface Props { onBack: () => void; }

const STATUS_LABEL: Record<ComplaintStatus, string> = {
  PENDING:   'Pending',
  IN_REVIEW: 'In Review',
  RESOLVED:  'Resolved',
  REJECTED:  'Rejected',
};

const statusColor = (s: ComplaintStatus) => {
  if (s === 'PENDING')   return 'bg-rose-50 text-rose-700';
  if (s === 'IN_REVIEW') return 'bg-amber-50 text-amber-700';
  if (s === 'RESOLVED')  return 'bg-emerald-50 text-emerald-700';
  return 'bg-slate-200 text-slate-700';
};

const fromColor = (f: string) =>
  f === 'STUDENT' ? 'bg-indigo-50 text-indigo-700' :
  f === 'TEACHER' ? 'bg-blue-50 text-blue-700' : 'bg-violet-50 text-violet-700';

export const ComplaintsManager: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [selected, setSelected] = useState<Complaint | null>(null);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [response, setResponse] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [shown, setShown] = useState(50);

  const loadComplaints = useCallback(() => {
    principalService.getComplaints()
      .then(rows => {
        setComplaints(rows);
        // Keep an open detail view in sync — realtime refetches would otherwise
        // leave the detail showing the pre-resolution status while the list
        // shows the new one.
        setSelected(prev => prev ? rows.find(r => r.id === prev.id) ?? prev : prev);
      })
      .catch(e => showToast(e instanceof Error ? e.message : 'Failed to load complaints', 'error'));
  }, [showToast]);

  useEffect(() => { loadComplaints(); }, [loadComplaints]);
  useRealtimeTable('complaints', loadComplaints);

  // Sort so open complaints (PENDING / IN_REVIEW) bubble to the top — these
  // are the ones the principal still needs to act on. Within each group,
  // newest first. Resolved + rejected go below in the same date order.
  const isOpenStatus = (s: ComplaintStatus) => s === 'PENDING' || s === 'IN_REVIEW';
  const sortedComplaints = React.useMemo(() => [...complaints].sort((a, b) => {
    const ao = isOpenStatus(a.status) ? 0 : 1;
    const bo = isOpenStatus(b.status) ? 0 : 1;
    if (ao !== bo) return ao - bo;
    return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
  }), [complaints]);
  const filtered = filter === 'ALL' ? sortedComplaints : sortedComplaints.filter(c => c.status === filter);

  // Reset pager when filter changes; cap visible to last 20 by default.
  useEffect(() => { setShown(50); }, [filter]);
  const visible = filtered.slice(0, shown);
  const remaining = filtered.length - visible.length;
  const openCount = complaints.filter(c => isOpenStatus(c.status)).length;

  const handleResolve = async () => {
    if (!selected || !response.trim()) { showToast('Response required', 'error'); return; }
    setIsSubmitting(true);
    try {
      const updated = await principalService.resolveComplaint(selected.id, response);
      setComplaints(prev => prev.map(c => c.id === updated.id ? updated : c));
      setSelected(updated);
      showToast('Complaint resolved');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Resolve failed', 'error');
    } finally { setIsSubmitting(false); }
  };

  const handleReject = async () => {
    if (!selected || !rejectReason.trim()) { showToast('Reason required', 'error'); return; }
    setIsSubmitting(true);
    try {
      const updated = await principalService.rejectComplaint(selected.id, rejectReason);
      setComplaints(prev => prev.map(c => c.id === updated.id ? updated : c));
      setSelected(updated);
      setShowRejectModal(false);
      setRejectReason('');
      showToast('Complaint rejected');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Reject failed', 'error');
    } finally { setIsSubmitting(false); }
  };

  const isOpen = isOpenStatus;

  if (selected) return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
        <button onClick={() => { setSelected(null); setShowRejectModal(false); setRejectReason(''); }}
          className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600"><ArrowLeft size={20} /></button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Complaint Detail</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-4  space-y-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${fromColor(selected.from)}`}>{selected.from}</span>
              {selected.isAnonymous && (
                <span className="text-[9px] font-black px-2 py-0.5 rounded-full uppercase bg-violet-100 text-violet-700 flex items-center gap-1">
                  <EyeOff size={9}/> Anonymous
                </span>
              )}
            </div>
            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${statusColor(selected.status)}`}>{STATUS_LABEL[selected.status]}</span>
          </div>
          <h3 className="font-black text-slate-900 text-base">{selected.subject}</h3>
          <p className="text-sm font-bold text-slate-500">{selected.description}</p>
          {selected.isAnonymous ? (
            <div className="text-[10px] font-bold text-violet-700 bg-violet-50 border border-violet-100 rounded-lg px-3 py-2 flex items-center gap-1.5">
              <EyeOff size={11}/> Identity hidden — filed anonymously to flag a sensitive issue.
            </div>
          ) : (
            <div className="text-[10px] font-bold text-slate-400">
              From: <span className="text-slate-700">{selected.fromName}</span>
              {selected.fromClass && <> · <span className="text-slate-700">{selected.fromClass}</span></>}
              {selected.fromRollNo && <> · Roll <span className="text-slate-700">#{selected.fromRollNo}</span></>}
              {selected.fromAdmissionNo && <> · <span className="text-slate-700">{selected.fromAdmissionNo}</span></>}
            </div>
          )}
          <div className="text-[10px] font-bold text-slate-400">Filed: {selected.createdAt}</div>
        </div>

        {selected.response && (
          <div className={`rounded-2xl border p-4 ${
            selected.status === 'REJECTED'
              ? 'bg-slate-100 border-slate-200'
              : 'bg-emerald-50 border-emerald-100'
          }`}>
            <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${
              selected.status === 'REJECTED' ? 'text-slate-600' : 'text-emerald-600'
            }`}>{selected.status === 'REJECTED' ? 'Reason for rejection' : 'Response'}</p>
            <p className={`text-sm font-bold ${
              selected.status === 'REJECTED' ? 'text-slate-700' : 'text-emerald-800'
            }`}>{selected.response}</p>
            {selected.resolvedAt && (
              <p className={`text-[10px] font-bold mt-1 ${
                selected.status === 'REJECTED' ? 'text-slate-500' : 'text-emerald-500'
              }`}>
                {selected.status === 'REJECTED' ? 'Rejected on' : 'Resolved on'} {selected.resolvedAt}
              </p>
            )}
          </div>
        )}

        {isOpen(selected.status) && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Respond &amp; Resolve</p>
            <textarea value={response} onChange={e => setResponse(e.target.value)} rows={4}
              placeholder="Type your response…"
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-emerald-500 resize-none" />
            <div className="flex gap-2">
              <button onClick={() => setShowRejectModal(true)} disabled={isSubmitting}
                className="flex items-center justify-center gap-1.5 py-3 px-4 bg-white border border-slate-200 text-slate-700 font-black rounded-2xl active:scale-95 transition-transform disabled:opacity-60">
                <XCircle size={14} /> Reject
              </button>
              <button onClick={handleResolve} disabled={isSubmitting}
                className="flex-1 py-3 bg-emerald-600 text-white font-black rounded-2xl active:scale-95 transition-transform disabled:opacity-60">
                {isSubmitting ? 'Saving…' : 'Mark Resolved'}
              </button>
            </div>
          </div>
        )}
      </div>

      {showRejectModal && (
        <div className="absolute inset-0 z-60 bg-slate-900/60 flex items-end justify-center animate-in fade-in">
          <div className="bg-white w-full rounded-t-3xl p-6 pb-10 animate-in slide-in-from-bottom-4 space-y-4">
            <h3 className="font-black text-slate-900 text-lg">Reject this complaint?</h3>
            <p className="text-sm text-slate-500">
              The complainant will see this reason. Be specific so they understand the decision.
            </p>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={4}
              placeholder="Reason for rejection (e.g. duplicate, out of scope, insufficient detail)…"
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-rose-500 resize-none" />
            <div className="flex gap-3">
              <button onClick={() => { setShowRejectModal(false); setRejectReason(''); }}
                className="flex-1 py-3 rounded-2xl border border-slate-200 font-black text-slate-600 active:scale-95">Cancel</button>
              <button onClick={handleReject} disabled={isSubmitting || !rejectReason.trim()}
                className="flex-1 py-3 rounded-2xl bg-rose-600 text-white font-black active:scale-95 disabled:opacity-60">
                {isSubmitting ? 'Rejecting…' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const FILTERS: Filter[] = ['ALL', 'PENDING', 'IN_REVIEW', 'RESOLVED', 'REJECTED'];

  return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
        <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600"><ArrowLeft size={20} /></button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Complaints</h2>
        {openCount > 0 && (
          <span className="ml-auto text-[9px] font-black px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 uppercase tracking-widest">
            {openCount} open
          </span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-4  space-y-3">
        <div className="flex gap-1.5 overflow-x-auto hide-scrollbar -mx-1 px-1">
          {FILTERS.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`shrink-0 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-colors ${filter === f ? 'bg-slate-900 text-white' : 'bg-white text-slate-400 border border-slate-200'}`}>
              {f === 'ALL' ? 'All' : STATUS_LABEL[f as ComplaintStatus]}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          {visible.map(c => (
            <button key={c.id} onClick={() => { setSelected(c); setResponse(c.response ?? ''); setShowRejectModal(false); setRejectReason(''); }}
              className="w-full bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-left active:bg-slate-50">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex gap-1.5 flex-wrap">
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${fromColor(c.from)}`}>{c.from}</span>
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${statusColor(c.status)}`}>{STATUS_LABEL[c.status]}</span>
                  {c.isAnonymous && (
                    <span className="text-[9px] font-black px-2 py-0.5 rounded-full uppercase bg-violet-100 text-violet-700 flex items-center gap-1">
                      <EyeOff size={9}/> Anon
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-bold text-slate-400 shrink-0">{c.createdAt}</span>
              </div>
              <div className="font-extrabold text-slate-900 text-sm">{c.subject}</div>
              <div className="text-[11px] font-bold text-slate-400 mt-1 line-clamp-2">{c.description}</div>
              <div className={`text-[10px] font-black mt-1.5 ${c.isAnonymous ? 'text-violet-600 italic' : 'text-slate-500'}`}>
                {c.isAnonymous ? 'Anonymous' : (
                  <>
                    {c.fromName}
                    {c.fromClass && <> · {c.fromClass}</>}
                    {c.fromRollNo && <> · Roll #{c.fromRollNo}</>}
                  </>
                )}
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="flex flex-col items-center py-16 text-slate-400">
              <CircleAlert size={32} className="mb-3 opacity-40" />
              <p className="font-bold text-sm">No complaints</p>
            </div>
          )}
          {remaining > 0 && (
            <button onClick={() => setShown(s => s + 50)}
              className="w-full py-3 bg-white border border-slate-200 rounded-2xl font-black text-xs text-slate-700 hover:bg-slate-50 transition-colors">
              Load More ({remaining} remaining)
            </button>
          )}
          {filtered.length > 0 && (
            <p className="text-center text-[10px] font-bold text-slate-300 pt-1">
              Showing {visible.length} of {filtered.length}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
