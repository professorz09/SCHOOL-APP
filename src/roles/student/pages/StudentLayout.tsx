import React, { useState, useMemo, useEffect } from 'react';
import { ToastContainer } from '@/shared/components/ui/Toast';
import { useUIStore } from '@/store/uiStore';
import { TimetableView } from '@/roles/student/components/TimetableView';
import { ResultsView } from '@/roles/student/components/ResultsView';
import { FeesView } from '@/roles/student/components/FeesView';
import { TransportView } from '@/roles/student/components/TransportView';
import { StudentNoticesView } from '@/modules/notices/components/StudentNoticesView';
import { StudentComplaintsView } from '@/roles/student/components/StudentComplaintsView';
import { AttendanceView } from '@/roles/student/components/AttendanceView';
import { StudentLeaveView } from '@/roles/student/components/StudentLeaveView';
import { StudentProfileView } from '@/roles/student/components/StudentProfileView';
import {
  Calendar, Trophy, CreditCard, Bus, Bell,
  UserCheck, HeadphonesIcon, Clock, FileText, User,
} from 'lucide-react';
import { timetableService, PERIOD_SLOTS } from '@/modules/timetable/timetable.service';
import { useAuthStore } from '@/store/authStore';
import { studentDashboardService, type ActiveStudentContext } from '@/modules/students/studentDashboard.service';

type StudentView = 'DASHBOARD' | 'TIMETABLE' | 'RESULTS' | 'FEES' | 'TRANSPORT' | 'NOTICES' | 'COMPLAINTS' | 'ATTENDANCE' | 'LEAVE' | 'PROFILE';

const getTodaySchedule = (classLabel: string | null) => {
  if (!classLabel) return [];
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const todayName = days[new Date().getDay()];
  const weeklyMap = timetableService.getClassWeeklyMap(classLabel);
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

export const StudentLayout: React.FC = () => {
  const session = useAuthStore(state => state.session);
  const selectedStudentId = useAuthStore(state => state.selectedStudentId);
  const STUDENT_FULL = session?.name ?? 'Student';

  const [view, setView] = useState<StudentView>('DASHBOARD');
  const [ctx, setCtx] = useState<ActiveStudentContext | null>(null);
  const { isSubView, setSubView } = useUIStore();
  const goTo = (v: StudentView) => { setView(v); setSubView(true); };
  const goBack = () => { setView('DASHBOARD'); setSubView(false); };

  // Resolve school/class for the active student. Re-runs when a parent
  // switches children via the picker in App.tsx.
  useEffect(() => {
    let cancelled = false;
    studentDashboardService.getActiveContext()
      .then(c => { if (!cancelled) setCtx(c); })
      .catch(err => { if (!cancelled) console.error('[student] context resolve failed', err); });
    return () => { cancelled = true; };
  }, [session?.userId, selectedStudentId]);

  useEffect(() => { setSubView(false); }, []);

  // When footer HOME pressed, isSubView becomes false → reset to dashboard
  useEffect(() => { if (!isSubView) setView('DASHBOARD'); }, [isSubView]);

  const displayName = ctx?.studentName ?? STUDENT_FULL;
  const STUDENT_NAME = displayName.split(' ')[0];
  const initials = displayName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
  const schoolName = ctx?.schoolName ?? '';
  const classLabel = ctx?.classLabel ?? null;
  const todaySchedule = useMemo(() => getTodaySchedule(classLabel), [classLabel]);

  if (view === 'TIMETABLE')   return <TimetableView         onBack={goBack} />;
  if (view === 'RESULTS')     return <ResultsView           onBack={goBack} />;
  if (view === 'FEES')        return <FeesView              onBack={goBack} />;
  if (view === 'TRANSPORT')   return <TransportView         onBack={goBack} />;
  if (view === 'NOTICES')     return <StudentNoticesView    onBack={goBack} />;
  if (view === 'COMPLAINTS')  return <StudentComplaintsView onBack={goBack} />;
  if (view === 'ATTENDANCE')  return <AttendanceView        onBack={goBack} />;
  if (view === 'LEAVE')       return ctx
    ? <StudentLeaveView onBack={goBack} studentId={ctx.studentId} />
    : <div className="p-6 text-sm text-slate-400">Loading…</div>;
  if (view === 'PROFILE')     return <StudentProfileView    onBack={goBack} />;

  // 9 tiles in a 4-column grid → 2 full rows + a 9th tile that anchors the
  // start of the third row. Profile is intentionally placed last because it
  // is a "settings" affordance rather than a daily-use module.
  const MODULES: { icon: React.ReactNode; label: string; view: StudentView; iconColor: string }[] = [
    { icon: <Calendar       size={22} />, label: 'Timetable',  view: 'TIMETABLE',  iconColor: 'text-blue-600' },
    { icon: <Trophy         size={22} />, label: 'Results',    view: 'RESULTS',    iconColor: 'text-amber-500' },
    { icon: <CreditCard     size={22} />, label: 'Fees',       view: 'FEES',       iconColor: 'text-blue-500' },
    { icon: <Bus            size={22} />, label: 'Transport',  view: 'TRANSPORT',  iconColor: 'text-orange-500' },
    { icon: <Bell           size={22} />, label: 'Notices',    view: 'NOTICES',    iconColor: 'text-blue-500' },
    { icon: <UserCheck      size={22} />, label: 'Attendance', view: 'ATTENDANCE', iconColor: 'text-emerald-600' },
    { icon: <FileText       size={22} />, label: 'Leave',      view: 'LEAVE',      iconColor: 'text-violet-500' },
    { icon: <HeadphonesIcon size={22} />, label: 'Helpdesk',   view: 'COMPLAINTS', iconColor: 'text-rose-500' },
    { icon: <User           size={22} />, label: 'Profile',    view: 'PROFILE',    iconColor: 'text-slate-700' },
  ];

  return (
    <>
    <div className="flex flex-col gap-5 pb-6 pt-3 px-5 animate-in fade-in duration-300">

      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-blue-600 text-white flex items-center justify-center font-black text-base shadow-md shrink-0">
            {initials}
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              {schoolName ? `Welcome to ${schoolName}` : 'Welcome'}
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

      {/* ── 4-column Module Grid (8 modules = 2 rows) ─────────────── */}
      <div className="grid grid-cols-4 gap-3">
        {MODULES.map(({ icon, label, view: v, iconColor }) => (
          <button key={label} onClick={() => goTo(v)}
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
          <button onClick={() => goTo('TIMETABLE')}
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

    </div>
    <ToastContainer />
    </>
  );
};
