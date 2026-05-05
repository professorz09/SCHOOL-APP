import React, { useState, useMemo, useEffect } from 'react';
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
  Calendar, GraduationCap, CreditCard, Bus, Bell, BookOpen,
  UserCheck, HeadphonesIcon, Clock, FileText,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import {
  studentDashboardService, type ActiveStudentContext, type UpcomingExam,
} from '@/modules/students/studentDashboard.service';
import type { TimetablePeriod } from '@/roles/student/student-role.types';

type StudentView = 'DASHBOARD' | 'TIMETABLE' | 'RESULTS' | 'FEES' | 'TRANSPORT' | 'NOTICES' | 'COMPLAINTS' | 'ATTENDANCE' | 'LEAVE' | 'PROFILE';

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
  // Today's schedule for the dashboard preview. Loaded via the same RLS-safe
  // student endpoint as the full Timetable view, so a student/parent always
  // sees real data here even though the principal/teacher cache is empty.
  const [todaySchedule, setTodaySchedule] = useState<(TimetablePeriod & { isLive: boolean })[]>([]);
  // Hero-card stats: overall attendance % + next upcoming exam.
  const [attendancePct, setAttendancePct] = useState<number | null>(null);
  const [nextExam, setNextExam] = useState<UpcomingExam | null>(null);
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

  // Pull today's periods so the dashboard schedule preview is non-empty
  // when there's actually a schedule. Filters out FREE / non-class slots
  // for the preview — student wants to see "what's next", not breaks.
  useEffect(() => {
    if (!ctx?.studentId) { setTodaySchedule([]); return; }
    let cancelled = false;
    const todayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()];
    studentDashboardService.getTimetable()
      .then(days => {
        if (cancelled) return;
        const today = days.find(d => d.day === todayName);
        const periods = (today?.periods ?? [])
          .filter(p => p.type !== 'FREE' && p.subject)
          .sort((a, b) => a.startTime.localeCompare(b.startTime))
          .map(p => ({ ...p, isLive: isLive(p.startTime, p.endTime) }));
        setTodaySchedule(periods);
      })
      .catch(() => { if (!cancelled) setTodaySchedule([]); });
    return () => { cancelled = true; };
  }, [ctx?.studentId]);

  // Hero-card stats — attendance % and next exam.
  useEffect(() => {
    if (!ctx?.studentId) { setAttendancePct(null); setNextExam(null); return; }
    let cancelled = false;
    studentDashboardService.getMyAttendance()
      .then(d => {
        if (cancelled) return;
        const totalPresent  = d.months.reduce((a, m) => a + m.present, 0);
        const totalWorkDays = d.months.reduce((a, m) => a + m.present + m.absent, 0);
        setAttendancePct(totalWorkDays > 0 ? Math.round((totalPresent / totalWorkDays) * 100) : null);
      })
      .catch(() => { if (!cancelled) setAttendancePct(null); });
    studentDashboardService.getScheduledExams()
      .then(list => { if (!cancelled) setNextExam(list[0] ?? null); })
      .catch(() => { if (!cancelled) setNextExam(null); });
    return () => { cancelled = true; };
  }, [ctx?.studentId]);

  useEffect(() => { setSubView(false); }, []);
  useEffect(() => { if (!isSubView) setView('DASHBOARD'); }, [isSubView]);

  const displayName = ctx?.studentName ?? STUDENT_FULL;
  const STUDENT_NAME = displayName.split(' ')[0];
  const initials = displayName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
  const classLabel = ctx?.classLabel ?? null;

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

  // 8 tiles in a 4×2 grid. Profile lives in the bottom-nav YOU tab so it
  // doesn't take a slot here.
  const MODULES: Array<{
    icon: React.ComponentType<{ size?: number; className?: string }>;
    label: string;
    view: StudentView;
    color: string;
  }> = [
    { icon: Calendar,       label: 'Timetable',  view: 'TIMETABLE',  color: 'text-blue-600' },
    { icon: BookOpen,       label: 'Notices',    view: 'NOTICES',    color: 'text-indigo-600' },
    { icon: CreditCard,     label: 'Fees',       view: 'FEES',       color: 'text-blue-500' },
    // 'view' stays RESULTS so routing/component identity is unchanged; we
     // just relabel the tile to "Exam" since that's the user's mental model.
    { icon: GraduationCap,  label: 'Exam',       view: 'RESULTS',    color: 'text-amber-500' },
    { icon: Bus,            label: 'Transport',  view: 'TRANSPORT',  color: 'text-orange-500' },
    { icon: UserCheck,      label: 'Attendance', view: 'ATTENDANCE', color: 'text-emerald-600' },
    { icon: FileText,       label: 'Leave',      view: 'LEAVE',      color: 'text-violet-600' },
    { icon: HeadphonesIcon, label: 'Helpdesk',   view: 'COMPLAINTS', color: 'text-rose-500' },
  ];

  return (
    <div className="flex flex-col gap-6 lg:gap-8 animate-in fade-in duration-300 px-5 lg:px-10 xl:px-16 max-w-7xl mx-auto w-full pt-4 lg:pt-8 pb-8 lg:pb-12">

      {/* ── Hero card — name + class + quick stats ─────────────────────── */}
      <div className="bg-slate-900 text-white rounded-2xl p-5 lg:p-6 shadow-lg">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-full bg-white/15 border-2 border-white/25 flex items-center justify-center font-black text-base shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <h2 className="text-xl lg:text-2xl font-black uppercase tracking-tight leading-none truncate">
                Hi, {STUDENT_NAME}
              </h2>
              <p className="text-[10px] lg:text-xs font-black uppercase tracking-widest text-white/60 mt-1.5">
                {classLabel ? `Class ${classLabel}` : 'Welcome to EduGrow'}
              </p>
            </div>
          </div>
          <button onClick={() => goTo('NOTICES')}
            className="w-10 h-10 bg-white/10 rounded-full border border-white/20 flex items-center justify-center shrink-0 hover:bg-white/20 transition-colors">
            <Bell size={16} className="text-white" />
          </button>
        </div>

        {/* Stats row — Attendance + Next Exam (when there is one) */}
        <div className="grid grid-cols-2 gap-3 mt-5">
          <button onClick={() => goTo('ATTENDANCE')}
            className="bg-white/10 rounded-xl px-4 py-3 text-left hover:bg-white/15 transition-colors">
            <div className="text-[9px] font-black uppercase tracking-widest text-white/60">Attendance</div>
            <div className="text-2xl font-black mt-1">
              {attendancePct === null ? '—' : `${attendancePct}%`}
            </div>
          </button>
          <button onClick={() => goTo('RESULTS')}
            className="bg-white/10 rounded-xl px-4 py-3 text-left hover:bg-white/15 transition-colors">
            <div className="text-[9px] font-black uppercase tracking-widest text-white/60">Next Exam</div>
            <div className="text-sm font-black mt-1 truncate">
              {nextExam
                ? new Date(nextExam.scheduledDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                : 'None'}
            </div>
          </button>
        </div>
      </div>

      {/* ── Module grid ────────────────────────────────────────────────── */}
      {/* 4 tiles per row on mobile, 8 per row on desktop. Tiles are slightly
          taller than square so longer labels like "Attendance" / "Helpdesk"
          fit on a single line at the small font size. */}
      <div className="grid grid-cols-4 lg:grid-cols-8 gap-2.5 lg:gap-3">
        {MODULES.map(({ icon: Icon, label, view: v, color }) => (
          <button key={label} onClick={() => goTo(v)}
            className="flex flex-col items-center justify-center gap-2 py-4 px-1 bg-white border border-slate-100 rounded-2xl shadow-sm active:scale-95 hover:shadow-md hover:border-slate-200 hover:-translate-y-0.5 transition-all">
            <Icon size={26} className={color} strokeWidth={2} />
            <span className="text-[10px] font-black uppercase tracking-wide text-slate-700 text-center leading-none whitespace-nowrap">
              {label}
            </span>
          </button>
        ))}
      </div>

      {/* ── Today's schedule (compact preview, top 3 classes) ───────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg lg:text-xl font-black text-slate-900 uppercase tracking-tight">
            Today's Schedule
          </h3>
          <button onClick={() => goTo('TIMETABLE')}
            className="text-[10px] lg:text-xs font-black text-blue-600 uppercase tracking-widest hover:text-blue-700 transition-colors">
            View All →
          </button>
        </div>

        {todaySchedule.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center">
            <Calendar size={28} className="mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-black text-slate-500">No classes today</p>
            <p className="text-[11px] font-bold text-slate-400 mt-1">Enjoy your day off!</p>
          </div>
        ) : (
          // Cap at 3 — dashboard is a glance preview, not the full timetable.
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm divide-y divide-slate-50 overflow-hidden">
            {todaySchedule.slice(0, 3).map((entry, idx) => {
              const live = entry.isLive;
              return (
                <div key={`${entry.id}-${idx}`}
                  className="flex items-center gap-3 lg:gap-4 px-4 py-4">
                  {/* Period badge — violet tint when live, slate otherwise */}
                  <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0 ${
                    live ? 'bg-violet-50 text-violet-700 border border-violet-200' : 'bg-slate-50 text-slate-400 border border-slate-100'
                  }`}>
                    <span className="text-[8px] font-black uppercase tracking-widest opacity-70 leading-none">Per</span>
                    <span className="text-base font-black leading-none mt-0.5">{idx + 1}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`font-black text-sm lg:text-base uppercase tracking-tight truncate ${live ? 'text-slate-900' : 'text-slate-400'}`}>
                      {entry.subject || 'Free'}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Clock size={11} className="text-slate-400" />
                      <span className="text-[11px] lg:text-xs font-bold text-slate-500">
                        {entry.startTime} – {entry.endTime}
                      </span>
                    </div>
                  </div>
                  {live && (
                    <span className="text-[9px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full shrink-0 uppercase tracking-widest">
                      Live
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Next exam preview — only shown when there is one ───────────── */}
      {nextExam && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg lg:text-xl font-black text-slate-900 uppercase tracking-tight">
              Next Exam
            </h3>
            <button onClick={() => goTo('RESULTS')}
              className="text-[10px] lg:text-xs font-black text-blue-600 uppercase tracking-widest hover:text-blue-700 transition-colors">
              View All →
            </button>
          </div>
          <button onClick={() => goTo('RESULTS')}
            className="w-full bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-3 lg:gap-4 hover:shadow-md transition-all text-left">
            <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center shrink-0">
              <GraduationCap size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-black text-sm lg:text-base uppercase tracking-tight truncate text-slate-900">
                {nextExam.subject || nextExam.title}
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <Calendar size={11} className="text-slate-400" />
                <span className="text-[11px] lg:text-xs font-bold text-slate-500">
                  {new Date(nextExam.scheduledDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', weekday: 'short' })}
                  <span className="text-slate-300 mx-1">·</span>
                  {nextExam.maxMarks} marks
                </span>
              </div>
            </div>
            <span className="text-[9px] font-black text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full shrink-0 uppercase tracking-widest">
              {nextExam.testType}
            </span>
          </button>
        </section>
      )}

    </div>
  );
};
