import React, { useEffect, useState } from 'react';
import {
  ArrowLeft, FileText, Plus, X, ChevronDown, ChevronUp, Calendar,
} from 'lucide-react';
import { principalService } from '@/roles/principal/principal.service';
import { Approval } from '@/roles/principal/principal.types';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';

interface Props { onBack: () => void; studentId: string; }

const LEAVE_COLOR: Record<string, string> = {
  PENDING:  'text-amber-600 bg-amber-50 border-amber-200',
  APPROVED: 'text-emerald-600 bg-emerald-50 border-emerald-200',
  REJECTED: 'text-rose-600 bg-rose-50 border-rose-200',
};

const LeaveCard: React.FC<{ app: Approval }> = ({ app }) => {
  const [expanded, setExpanded] = useState(false);
  const colorCls = LEAVE_COLOR[app.status] ?? LEAVE_COLOR['PENDING'];
  const lines = app.description.split('\n');

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3.5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center shrink-0">
          <FileText size={18} className="text-slate-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-extrabold text-slate-900 text-sm">{app.subject}</div>
          <div className="text-[10px] font-bold text-slate-400 mt-0.5">{app.createdAt}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[9px] font-black px-2.5 py-1 rounded-full border ${colorCls}`}>
            {app.status}
          </span>
          <button onClick={() => setExpanded(e => !e)} className="text-slate-400 p-1">
            {expanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="mt-3 bg-slate-50 rounded-xl p-3 space-y-1.5">
          {lines.map((line, i) => (
            <p key={i} className="text-xs font-medium text-slate-600">{line}</p>
          ))}
          {app.rejectionReason && (
            <div className="mt-2 pt-2 border-t border-slate-200">
              <p className="text-[10px] font-black uppercase tracking-widest text-rose-500 mb-0.5">Rejection Reason</p>
              <p className="text-xs font-medium text-rose-700">{app.rejectionReason}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const StudentLeaveView: React.FC<Props> = ({ onBack, studentId }) => {
  const session = useAuthStore(s => s.session);
  const { showToast } = useUIStore();
  const studentName = session?.name ?? 'Student';

  const [leaveApps, setLeaveApps] = useState<Approval[]>([]);
  const [showForm, setShowForm]   = useState(false);
  const [title, setTitle]         = useState('');
  const [fromDate, setFromDate]   = useState('');
  const [toDate, setToDate]       = useState('');
  const [reason, setReason]       = useState('');
  const [submitting, setSubmitting] = useState(false);

  const refresh = () => {
    principalService.getStudentLeaves(studentId)
      .then(setLeaveApps)
      .catch(e => showToast(e.message ?? 'Failed to load leaves', 'error'));
  };

  useEffect(() => { refresh(); }, []);

  const handleSubmit = async () => {
    if (!title.trim() || !fromDate || !toDate || !reason.trim()) return;
    setSubmitting(true);
    try {
      await principalService.submitStudentLeave(studentId, studentName, title.trim(), fromDate, toDate, reason.trim());
      refresh();
      setTitle(''); setFromDate(''); setToDate(''); setReason('');
      setShowForm(false);
      showToast('Leave application submitted');
    } finally { setSubmitting(false); }
  };

  const pending  = leaveApps.filter(l => l.status === 'PENDING').length;
  const approved = leaveApps.filter(l => l.status === 'APPROVED').length;
  const rejected = leaveApps.filter(l => l.status === 'REJECTED').length;

  return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
              <ArrowLeft size={20}/>
            </button>
            <div>
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight leading-none">Leave</h2>
              <p className="text-[10px] font-bold text-slate-400 mt-0.5">Applications & Status</p>
            </div>
          </div>
          <button
            onClick={() => setShowForm(f => !f)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black uppercase transition-colors ${
              showForm ? 'bg-slate-200 text-slate-700' : 'bg-blue-600 text-white'
            }`}>
            {showForm ? <X size={14}/> : <Plus size={14}/>}
            {showForm ? 'Cancel' : 'Apply'}
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Pending',  val: pending,  cls: 'text-amber-700 bg-amber-50 border-amber-100' },
            { label: 'Approved', val: approved, cls: 'text-emerald-700 bg-emerald-50 border-emerald-100' },
            { label: 'Rejected', val: rejected, cls: 'text-rose-700 bg-rose-50 border-rose-100' },
          ].map(s => (
            <div key={s.label} className={`rounded-xl border px-2 py-2 text-center ${s.cls}`}>
              <div className="text-xl font-black leading-none">{s.val}</div>
              <div className="text-[9px] font-black uppercase tracking-widest mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4  space-y-3">
        {/* Apply Form */}
        {showForm && (
          <div className="bg-white rounded-2xl border border-blue-100 shadow-sm p-4 space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-500">New Application</p>
            <input
              type="text"
              placeholder="Leave Title (e.g. Medical Leave)"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-400"
            />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1 block">From</label>
                <div className="relative">
                  <Calendar size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                  <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl pl-8 pr-3 py-2.5 text-sm font-bold text-slate-800 focus:outline-none focus:border-blue-400"/>
                </div>
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1 block">To</label>
                <div className="relative">
                  <Calendar size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                  <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl pl-8 pr-3 py-2.5 text-sm font-bold text-slate-800 focus:outline-none focus:border-blue-400"/>
                </div>
              </div>
            </div>
            <textarea
              placeholder="Reason for leave..."
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-400 resize-none"
            />
            <button
              onClick={handleSubmit}
              disabled={submitting || !title.trim() || !fromDate || !toDate || !reason.trim()}
              className="w-full py-3 bg-blue-600 text-white font-black rounded-xl text-sm uppercase tracking-wide active:scale-95 transition-transform disabled:opacity-50"
            >
              {submitting ? 'Submitting…' : 'Submit Application'}
            </button>
          </div>
        )}

        {/* Leave list */}
        {leaveApps.length === 0 && !showForm ? (
          <div className="flex flex-col items-center py-16 text-slate-400">
            <FileText size={32} className="mb-3 opacity-40"/>
            <p className="font-bold text-sm">No leave applications yet</p>
            <p className="text-xs font-medium mt-1">Tap Apply to submit a new request</p>
          </div>
        ) : (
          leaveApps.map(app => <LeaveCard key={app.id} app={app}/>)
        )}
      </div>
    </div>
  );
};
