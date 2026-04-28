import React, { useState, useMemo, useEffect } from 'react';
import { ToastContainer } from '../../../components/ui/Toast';
import { TimetableView } from '../components/TimetableView';
import { ResultsView } from '../components/ResultsView';
import { FeesView } from '../components/FeesView';
import { TransportView } from '../components/TransportView';
import { StudentNoticesView } from '../components/StudentNoticesView';
import { StudentComplaintsView } from '../components/StudentComplaintsView';
import { AttendanceView } from '../components/AttendanceView';
import {
  Calendar, Trophy, CreditCard, Bus, Bell,
  UserCheck, HeadphonesIcon, Clock, FileText, Plus, X, ChevronDown, ChevronUp,
} from 'lucide-react';
import { timetableService, PERIOD_SLOTS } from '../../../services/timetable.service';
import { useAuthStore } from '../../../store/authStore';
import { principalService } from '../../../services/principal.service';
import { Approval } from '../../../types/principal.types';
import { useUIStore } from '../../../store/uiStore';

const MY_CLASS = '10-A';
const SCHOOL_NAME = 'EduGrow School';
const STUDENT_ID = 'stu1';

type StudentView = 'DASHBOARD' | 'TIMETABLE' | 'RESULTS' | 'FEES' | 'TRANSPORT' | 'NOTICES' | 'COMPLAINTS' | 'ATTENDANCE';

const getTodaySchedule = () => {
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const todayName = days[new Date().getDay()];
  const weeklyMap = timetableService.getClassWeeklyMap(MY_CLASS);
  const entries = (weeklyMap as Record<string, typeof weeklyMap[keyof typeof weeklyMap]>)[todayName] ?? [];
  return entries
    .map(e => {
      const slot = PERIOD_SLOTS.find(s => s.slotId === e.slotId);
      return slot ? { ...e, slot } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a!.slot.startTime.localeCompare(b!.slot.startTime));
};

const isLive = (startTime: string, endTime: string) => {
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  return nowMins >= sh * 60 + sm && nowMins < eh * 60 + em;
};

const LEAVE_COLOR: Record<string, string> = {
  PENDING:  'text-amber-600 bg-amber-50 border-amber-200',
  APPROVED: 'text-emerald-600 bg-emerald-50 border-emerald-200',
  REJECTED: 'text-rose-600 bg-rose-50 border-rose-200',
};

export const StudentLayout: React.FC = () => {
  const session = useAuthStore(state => state.session);
  const { showToast } = useUIStore();
  const STUDENT_FULL = session?.name ?? 'Student';
  const STUDENT_NAME = STUDENT_FULL.split(' ')[0];

  const [view, setView] = useState<StudentView>('DASHBOARD');
  const [leaveApps, setLeaveApps] = useState<Approval[]>([]);
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveTitle, setLeaveTitle] = useState('');
  const [leaveFrom, setLeaveFrom] = useState('');
  const [leaveTo, setLeaveTo] = useState('');
  const [leaveReason, setLeaveReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const todaySchedule = useMemo(() => getTodaySchedule(), []);
  const initials = STUDENT_FULL.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();

  useEffect(() => {
    setLeaveApps(principalService.getStudentLeaves(STUDENT_ID));
  }, []);

  const handleSubmitLeave = async () => {
    if (!leaveTitle.trim() || !leaveFrom || !leaveTo || !leaveReason.trim()) return;
    setSubmitting(true);
    try {
      await principalService.submitStudentLeave(STUDENT_ID, STUDENT_FULL, leaveTitle.trim(), leaveFrom, leaveTo, leaveReason.trim());
      setLeaveApps(principalService.getStudentLeaves(STUDENT_ID));
      setLeaveTitle(''); setLeaveFrom(''); setLeaveTo(''); setLeaveReason('');
      setShowLeaveForm(false);
      showToast('Leave application submitted');
    } finally { setSubmitting(false); }
  };

  if (view === 'TIMETABLE')   return <TimetableView         onBack={() => setView('DASHBOARD')} />;
  if (view === 'RESULTS')     return <ResultsView           onBack={() => setView('DASHBOARD')} />;
  if (view === 'FEES')        return <FeesView              onBack={() => setView('DASHBOARD')} />;
  if (view === 'TRANSPORT')   return <TransportView         onBack={() => setView('DASHBOARD')} />;
  if (view === 'NOTICES')     return <StudentNoticesView    onBack={() => setView('DASHBOARD')} />;
  if (view === 'COMPLAINTS')  return <StudentComplaintsView onBack={() => setView('DASHBOARD')} />;
  if (view === 'ATTENDANCE')  return <AttendanceView        onBack={() => setView('DASHBOARD')} />;

  const MODULES: { icon: React.ReactNode; label: string; view: StudentView; iconColor: string }[] = [
    { icon: <Calendar       size={22} />, label: 'Timetable',  view: 'TIMETABLE',  iconColor: 'text-blue-600' },
    { icon: <Trophy         size={22} />, label: 'Results',    view: 'RESULTS',    iconColor: 'text-amber-500' },
    { icon: <CreditCard     size={22} />, label: 'Fees',       view: 'FEES',       iconColor: 'text-blue-500' },
    { icon: <Bus            size={22} />, label: 'Transport',  view: 'TRANSPORT',  iconColor: 'text-orange-500' },
    { icon: <Bell           size={22} />, label: 'Notices',    view: 'NOTICES',    iconColor: 'text-blue-500' },
    { icon: <UserCheck      size={22} />, label: 'Attendance', view: 'ATTENDANCE', iconColor: 'text-emerald-600' },
    { icon: <HeadphonesIcon size={22} />, label: 'Helpdesk',   view: 'COMPLAINTS', iconColor: 'text-rose-500' },
  ];

  return (
    <>
    <div className="flex flex-col gap-5 pb-6 pt-3 animate-in fade-in duration-300">

      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-blue-600 text-white flex items-center justify-center font-black text-base shadow-md shrink-0">
            {initials}
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Welcome to {SCHOOL_NAME}
            </p>
            <h2 className="text-2xl font-black text-slate-900 leading-tight">
              Hi, {STUDENT_NAME}
            </h2>
          </div>
        </div>
        <div className="relative">
          <div className="w-10 h-10 bg-white rounded-full border border-slate-200 shadow-sm flex items-center justify-center">
            <Bell size={18} className="text-slate-600" />
          </div>
          <div className="absolute -top-1 -right-1 w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center">
            <span className="text-[9px] font-black text-white">3</span>
          </div>
        </div>
      </div>

      {/* ── Module Grid ──────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3">
        {MODULES.map(({ icon, label, view: v, iconColor }) => (
          <button key={label} onClick={() => setView(v)}
            className="flex flex-col items-center gap-2 bg-white border border-slate-200 rounded-2xl py-4 px-1 shadow-sm active:scale-95 transition-transform">
            <div className={`${iconColor}`}>{icon}</div>
            <span className="text-[9px] font-black uppercase tracking-wide text-slate-500 text-center leading-tight">{label}</span>
          </button>
        ))}
      </div>

      {/* ── Today's Schedule ─────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">Today's Schedule</h3>
          <button onClick={() => setView('TIMETABLE')}
            className="text-xs font-black text-blue-600 uppercase tracking-wide">
            View All
          </button>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {todaySchedule.length === 0 ? (
            <div className="p-6 text-center text-slate-400">
              <Calendar size={28} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm font-bold">No classes today</p>
            </div>
          ) : (
            todaySchedule.slice(0, 4).map((entry, idx) => {
              const live = isLive(entry!.slot.startTime, entry!.slot.endTime);
              return (
                <div key={idx}
                  className={`flex items-center gap-3 px-4 py-3.5 ${idx < Math.min(todaySchedule.length, 4) - 1 ? 'border-b border-slate-50' : ''}`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-black text-sm ${live ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`font-extrabold text-sm ${live ? 'text-slate-900' : 'text-slate-400'}`}>
                      {entry!.subject}
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Clock size={10} className="text-slate-400" />
                      <span className="text-[10px] font-bold text-slate-400">
                        {entry!.slot.startTime} – {entry!.slot.endTime}
                      </span>
                    </div>
                  </div>
                  {live && (
                    <span className="text-[9px] font-black text-emerald-600 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full shrink-0">
                      LIVE
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── My Leave Applications ─────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">My Leave Applications</h3>
          <button
            onClick={() => setShowLeaveForm(f => !f)}
            className="flex items-center gap-1 text-xs font-black text-blue-600 uppercase tracking-wide"
          >
            {showLeaveForm ? <X size={14}/> : <Plus size={14}/>}
            {showLeaveForm ? 'Cancel' : 'Apply Leave'}
          </button>
        </div>

        {/* Apply Leave Form */}
        {showLeaveForm && (
          <div className="bg-white rounded-2xl border border-blue-100 shadow-sm p-4 mb-3 space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-500">New Leave Application</p>
            <input
              type="text"
              placeholder="Leave Title (e.g. Medical Leave)"
              value={leaveTitle}
              onChange={e => setLeaveTitle(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-400"
            />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1 block">From Date</label>
                <input
                  type="date"
                  value={leaveFrom}
                  onChange={e => setLeaveFrom(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-800 focus:outline-none focus:border-blue-400"
                />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1 block">To Date</label>
                <input
                  type="date"
                  value={leaveTo}
                  onChange={e => setLeaveTo(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-800 focus:outline-none focus:border-blue-400"
                />
              </div>
            </div>
            <textarea
              placeholder="Reason for leave..."
              value={leaveReason}
              onChange={e => setLeaveReason(e.target.value)}
              rows={3}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-400 resize-none"
            />
            <button
              onClick={handleSubmitLeave}
              disabled={submitting || !leaveTitle.trim() || !leaveFrom || !leaveTo || !leaveReason.trim()}
              className="w-full py-3 bg-blue-600 text-white font-black rounded-xl active:scale-95 transition-transform disabled:opacity-50 text-sm uppercase tracking-wide"
            >
              {submitting ? 'Submitting...' : 'Submit Application'}
            </button>
          </div>
        )}

        {/* Leave list */}
        <div className="space-y-2">
          {leaveApps.length === 0 && !showLeaveForm && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-6 text-center">
              <FileText size={24} className="mx-auto mb-2 text-slate-300" />
              <p className="text-sm font-bold text-slate-400">No leave applications yet</p>
            </div>
          )}
          {leaveApps.map(app => (
            <LeaveCard key={app.id} app={app} />
          ))}
        </div>
      </div>

    </div>
    <ToastContainer />
    </>
  );
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
          <button onClick={() => setExpanded(e => !e)} className="text-slate-400">
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
