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

  const loadComplaints = useCallback(() => {
    studentDashboardService.getComplaints().then(setComplaints);
  }, []);

  useEffect(() => { loadComplaints(); }, [loadComplaints]);
  useRealtimeTable('complaints', loadComplaints);

  // Anti-spam cap: max 3 complaints PER CHILD per IST day (per migration 0056).
  // DB trigger enforces it server-side; UI mirrors the budget so the user
  // sees it before submitting. `complaints` here is already scoped to the
  // active selected student via studentDashboardService.getComplaints, so
  // counting them all is correct.
  const istToday = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const todayCount = complaints.filter(c => (c.createdAt ?? '').slice(0, 10) === istToday).length;
  const DAILY_CAP = 3;
  const reachedCap = todayCount >= DAILY_CAP;

  // Anonymous complaints get a separate, stricter cap of 1 per rolling 7
  // days. The DB trigger (migration 0070) is the source of truth; this is
  // a UX mirror so the option grays out before the user types a paragraph.
  const sevenDaysAgo = Date.now() - 7 * 86_400_000;
  const recentAnonCount = complaints.filter(c =>
    c.isAnonymous && new Date(c.createdAt).getTime() >= sevenDaysAgo,
  ).length;
  const anonCapReached = recentAnonCount >= 1;

  const handleSubmit = async () => {
    if (!form.subject || !form.description) { showToast('Subject and description required', 'error'); return; }
    if (reachedCap) {
      showToast('Daily limit reached — only 3 complaints per day. Contact the school office.', 'error');
      return;
    }
    if (form.isAnonymous && anonCapReached) {
      showToast('Anonymous limit: only 1 anonymous complaint per 7 days', 'error');
      return;
    }
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
        {reachedCap ? (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3 flex gap-2">
            <AlertTriangle size={14} className="text-rose-500 mt-0.5 shrink-0"/>
            <p className="text-[11px] font-bold text-rose-700 leading-relaxed">
              Daily limit reached — only 3 complaints per day. Misuse rokne ke liye limit hai.
              Please contact the school office for another submission.
            </p>
          </div>
        ) : (
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-3 flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-blue-700">Your complaint will be reviewed by the principal.</p>
            <span className="text-[10px] font-black bg-white border border-blue-200 text-blue-700 px-2 py-0.5 rounded-full shrink-0">
              {todayCount}/{DAILY_CAP} today
            </span>
          </div>
        )}
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
              onClick={() => !anonCapReached && setForm(f => ({ ...f, isAnonymous: !f.isAnonymous }))}
              disabled={anonCapReached}
              className="w-full flex items-center justify-between gap-3 disabled:opacity-60">
              <div className="flex items-center gap-2 min-w-0">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${form.isAnonymous ? 'bg-violet-500 text-white' : 'bg-white text-slate-500 border border-slate-200'}`}>
                  {form.isAnonymous ? <EyeOff size={14}/> : <Eye size={14}/>}
                </div>
                <div className="text-left min-w-0">
                  <p className="text-xs font-black text-slate-900">File Anonymously</p>
                  <p className="text-[10px] font-bold text-slate-500 leading-tight">
                    Principal won't see your name. Limit: 1 per 7 days.
                  </p>
                </div>
              </div>
              <div className={`w-10 h-6 rounded-full p-0.5 transition-colors shrink-0 ${form.isAnonymous ? 'bg-violet-500' : 'bg-slate-300'}`}>
                <div className={`w-5 h-5 rounded-full bg-white shadow-md transition-transform ${form.isAnonymous ? 'translate-x-4' : ''}`}/>
              </div>
            </button>
            {anonCapReached && (
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-rose-700 mt-2 pt-2 border-t border-violet-200">
                <ShieldAlert size={11}/> Already used your weekly anonymous slot
              </div>
            )}
          </div>
        </div>
        <button onClick={handleSubmit} disabled={isSubmitting || reachedCap}
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
          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
            reachedCap
              ? 'bg-rose-50 text-rose-600 border-rose-200'
              : todayCount > 0
                ? 'bg-amber-50 text-amber-700 border-amber-200'
                : 'bg-slate-50 text-slate-500 border-slate-200'
          }`}>
            {todayCount}/{DAILY_CAP} today
          </span>
          <button
            onClick={() => setView('CREATE')}
            disabled={reachedCap}
            title={reachedCap ? 'Daily limit reached — contact school office' : 'New complaint'}
            className="p-2 bg-rose-500 text-white rounded-full shadow-md disabled:opacity-50 disabled:cursor-not-allowed">
            <Plus size={18} />
          </button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-4  space-y-3">
        {complaints.slice(0, shown).map(c => (
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
    </div>
  );
};
