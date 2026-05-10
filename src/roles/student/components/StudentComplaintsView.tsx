import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Plus, CircleAlert, AlertTriangle, EyeOff, Eye, ShieldAlert } from 'lucide-react';
import { studentDashboardService } from '@/modules/students/studentDashboard.service';
import { StudentComplaint } from '@/roles/student/student-role.types';
import { useUIStore } from '@/store/uiStore';
import { useRealtimeTable } from '@/shared/hooks/useRealtimeTable';

type View = 'LIST' | 'CREATE';

interface Props { onBack: () => void; }

const STATUS_LABEL: Record<string, string> = {
  PENDING:   'Pending',
  IN_REVIEW: 'In Review',
  RESOLVED:  'Resolved',
  REJECTED:  'Rejected',
};

const statusColor = (s: string) => {
  if (s === 'PENDING')   return 'bg-rose-50 text-rose-700';
  if (s === 'IN_REVIEW') return 'bg-amber-50 text-amber-700';
  if (s === 'RESOLVED')  return 'bg-emerald-50 text-emerald-700';
  if (s === 'REJECTED')  return 'bg-slate-200 text-slate-700';
  return 'bg-slate-100 text-slate-500';
};

export const StudentComplaintsView: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();
  const [view, setView] = useState<View>('LIST');
  const [complaints, setComplaints] = useState<StudentComplaint[]>([]);
  const [shown, setShown] = useState(50);
  const [form, setForm] = useState({ subject: '', description: '', isAnonymous: false });
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Modal state for the hide-from-dashboard confirmation. Replaces a
  // window.confirm() that exposed the dev URL ("foo-5000.app.github.dev
  // says...") which looked broken to a non-technical parent.
  const [hideTarget, setHideTarget] = useState<StudentComplaint | null>(null);
  const [isHiding, setIsHiding] = useState(false);

  const loadComplaints = useCallback(() => {
    studentDashboardService.getComplaints().then(setComplaints);
  }, []);

  useEffect(() => { loadComplaints(); }, [loadComplaints]);
  useRealtimeTable('complaints', loadComplaints);

  // Caps live entirely on the DB triggers now (3/day + 7/week for normal,
  // 1/30 days for anonymous — see migration 0094). UI used to mirror the
  // counters as visible badges + pre-block submit, but that confused
  // students into thinking the school had assigned them a quota and also
  // broke when hidden rows were excluded from the count. Cleaner: just
  // try to insert; surface whatever the trigger says verbatim if it
  // refuses.

  const handleSubmit = async () => {
    if (!form.subject || !form.description) { showToast('Subject and description required', 'error'); return; }
    setIsSubmitting(true);
    try {
      const c = await studentDashboardService.submitComplaint(form.subject, form.description, form.isAnonymous);
      setComplaints(prev => [c, ...prev]);
      showToast(form.isAnonymous
        ? 'Anonymous complaint sent — your name will not be shown'
        : 'Complaint submitted to principal');
      setForm({ subject: '', description: '', isAnonymous: false });
      setView('LIST');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Submit failed — try again', 'error');
    } finally { setIsSubmitting(false); }
  };

  const renderHeader = (title: string, back: () => void, action?: React.ReactNode) => (
    <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
      <div className="flex items-center gap-3">
        <button onClick={back} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600"><ArrowLeft size={20} /></button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">{title}</h2>
      </div>
      {action}
    </div>
  );

  if (view === 'CREATE') return (
    <div className="w-full lg:max-w-5xl lg:mx-auto bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader('File Complaint', () => setView('LIST'))}
      <div className="flex-1 overflow-y-auto p-4  space-y-4">
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-3">
          <p className="text-xs font-bold text-blue-700">Your complaint will be reviewed by the principal.</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Subject *</label>
            <input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
              placeholder="Brief summary of the issue"
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-rose-500" />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Description *</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={5}
              placeholder="Describe your issue in detail…"
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-rose-500 resize-none" />
          </div>

          {/* Anonymous toggle — for sensitive issues like bullying. The
              principal won't see who filed; the school still keeps an
              internal audit record so misuse can be traced if needed. */}
          <div className={`rounded-xl border p-3 ${form.isAnonymous ? 'border-violet-200 bg-violet-50' : 'border-slate-200 bg-slate-50'}`}>
            <button type="button"
              onClick={() => setForm(f => ({ ...f, isAnonymous: !f.isAnonymous }))}
              className="w-full flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${form.isAnonymous ? 'bg-violet-500 text-white' : 'bg-white text-slate-500 border border-slate-200'}`}>
                  {form.isAnonymous ? <EyeOff size={14}/> : <Eye size={14}/>}
                </div>
                <div className="text-left min-w-0">
                  <p className="text-xs font-black text-slate-900">File Anonymously</p>
                  <p className="text-[10px] font-bold text-slate-500 leading-tight">
                    Principal won't see your name. For sensitive issues only.
                  </p>
                </div>
              </div>
              <div className={`w-10 h-6 rounded-full p-0.5 transition-colors shrink-0 ${form.isAnonymous ? 'bg-violet-500' : 'bg-slate-300'}`}>
                <div className={`w-5 h-5 rounded-full bg-white shadow-md transition-transform ${form.isAnonymous ? 'translate-x-4' : ''}`}/>
              </div>
            </button>
          </div>
        </div>
        <button onClick={handleSubmit} disabled={isSubmitting}
          className="w-full flex items-center justify-center gap-2 bg-rose-600 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg disabled:opacity-60 disabled:cursor-not-allowed">
          {isSubmitting ? 'Submitting…' : <><Plus size={16} /> Submit Complaint</>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="w-full lg:max-w-5xl lg:mx-auto bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader('My Complaints', onBack,
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView('CREATE')}
            title="New complaint"
            className="p-2 bg-rose-500 text-white rounded-full shadow-md disabled:opacity-50 disabled:cursor-not-allowed">
            <Plus size={18} />
          </button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-4  space-y-3">
        {/* Hidden rows stay in `complaints` so the rolling cap math
            counts them (otherwise hide() would silently free up another
            anonymous slot). They're filtered out only at render time. */}
        {complaints.filter(c => !c.hiddenFromSubmitter).slice(0, shown).map(c => (
          <div key={c.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${statusColor(c.status)}`}>{STATUS_LABEL[c.status] ?? c.status}</span>
                {c.isAnonymous && (
                  <span className="text-[9px] font-black px-2 py-0.5 rounded-full uppercase bg-violet-50 text-violet-700 flex items-center gap-1">
                    <EyeOff size={9}/> Anonymous
                  </span>
                )}
              </div>
              <span className="text-[10px] font-bold text-slate-400">{c.createdAt}</span>
            </div>
            <div className="font-extrabold text-slate-900 text-sm">{c.subject}</div>
            <div className="text-[11px] font-bold text-slate-400 mt-1 line-clamp-2">{c.description}</div>
            {c.response && (
              <div className="mt-3 pt-3 border-t border-slate-50">
                <p className={`text-[10px] font-black mb-1 ${c.status === 'REJECTED' ? 'text-slate-600' : 'text-emerald-600'}`}>
                  {c.status === 'REJECTED' ? 'Reason for rejection' : 'Response'}
                </p>
                <p className="text-[11px] font-bold text-slate-600">{c.response}</p>
              </div>
            )}
            {/* Hide-from-my-dashboard — gated to anonymous rows only.
                Normal complaints aren't sensitive in the same way (filer's
                identity is already on the row), so adding a Hide button
                there just lets students bury legitimate paper-trail.
                Anonymous is the actual privacy-on-shared-device case the
                feature was built for. */}
            {c.isAnonymous && (
              <div className="mt-3 pt-3 border-t border-slate-50 flex justify-end">
                <button
                  onClick={() => setHideTarget(c)}
                  className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-rose-600 inline-flex items-center gap-1.5 transition-colors"
                  title="Removes this row from your view; principal still sees it">
                  <EyeOff size={11}/> Hide from my dashboard
                </button>
              </div>
            )}
          </div>
        ))}
        {complaints.length === 0 && (
          <div className="flex flex-col items-center py-16 text-slate-400">
            <CircleAlert size={32} className="mb-3 opacity-40" />
            <p className="font-bold text-sm">No complaints filed</p>
          </div>
        )}
        {complaints.length > shown && (
          <button onClick={() => setShown(s => s + 50)}
            className="w-full py-3 bg-white border border-slate-200 rounded-2xl font-black text-xs text-rose-700 hover:bg-rose-50 transition-colors">
            Load More ({complaints.length - shown} remaining)
          </button>
        )}
      </div>

      {/* Hide-from-dashboard confirmation. Custom modal because
          window.confirm renders the dev URL as the dialog title on
          mobile Chromium ("foo-5000.app.github.dev says…"), which
          alarmed parents into thinking the app was hijacked. */}
      {hideTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end lg:items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => !isHiding && setHideTarget(null)}>
          <div onClick={e => e.stopPropagation()}
            className="bg-white rounded-3xl w-full lg:max-w-md p-5 lg:p-6 shadow-2xl animate-in slide-in-from-bottom-4 lg:zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-11 h-11 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <EyeOff size={20}/>
              </div>
              <div className="min-w-0">
                <p className="text-base font-black text-slate-900">Hide from your dashboard?</p>
                <p className="text-[11px] font-bold text-slate-400 mt-0.5 truncate">{hideTarget.subject}</p>
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 mb-4">
              <p className="text-[12px] font-bold text-slate-600 leading-relaxed">
                Sirf aapke dashboard se hat jayegi. Principal aur audit log ke liye record waise hi rahega.
                {hideTarget.isAnonymous && ' Anonymous complaint — identity already hidden from principal.'}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setHideTarget(null)}
                disabled={isHiding}
                className="flex-1 py-3 bg-slate-100 text-slate-700 font-black rounded-2xl text-sm uppercase tracking-widest active:scale-95 transition-transform disabled:opacity-50">
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!hideTarget) return;
                  setIsHiding(true);
                  try {
                    await studentDashboardService.hideMyComplaint(hideTarget.id);
                    // Mark hidden in place — DON'T remove. The cap math
                    // still needs to see the row; render filter hides
                    // it from the visible list.
                    setComplaints((prev: StudentComplaint[]) => prev.map(x =>
                      x.id === hideTarget.id ? { ...x, hiddenFromSubmitter: true } : x,
                    ));
                    showToast('Hidden from your dashboard');
                    setHideTarget(null);
                  } catch (e) {
                    showToast(e instanceof Error ? e.message : 'Could not hide', 'error');
                  } finally { setIsHiding(false); }
                }}
                disabled={isHiding}
                className="flex-1 flex items-center justify-center gap-1.5 py-3 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-2xl text-sm uppercase tracking-widest active:scale-95 transition-transform disabled:opacity-60">
                {isHiding ? 'Hiding…' : <><EyeOff size={14}/> Hide</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
