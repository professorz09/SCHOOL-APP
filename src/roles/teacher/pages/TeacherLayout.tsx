import React, { useState, useEffect } from 'react';
import { useUIStore } from '@/store/uiStore';
import {
  FileCheck2, ClipboardList, ScrollText, CircleAlert,
  Bell, CalendarDays, Clock, Users, Sparkles, Play, BookOpen,
} from 'lucide-react';
import { teacherService } from '@/roles/teacher/teacher.service';
import { AttendanceManager } from '@/modules/attendance/components/TeacherAttendanceManager';
import { TestsManager } from '@/modules/exams/components/TestsManager';
import { ExamPaperGeneratorView } from '@/modules/exams/components/ExamPaperGenerator';
import { TeacherComplaintsView } from '@/roles/teacher/components/TeacherComplaints';
import { TeacherNoticesView } from '@/modules/notices/components/TeacherNoticesView';
import { TeacherTimetableView } from '@/modules/timetable/components/TeacherTimetableView';
import { TeacherStudentList } from '@/roles/teacher/components/TeacherStudentList';
import { useAuthStore } from '@/store/authStore';

type TeacherView = 'DASHBOARD' | 'ATTENDANCE' | 'TESTS' | 'EXAM_GEN' | 'COMPLAINTS' | 'NOTICES' | 'TIMETABLE' | 'STUDENTS';

interface TodayEntry {
  id: string;
  classId: string;
  className: string;
  section: string;
  subject: string;
  room: string;
  slot: { startTime: string; endTime: string; label: string };
}

const isCurrentPeriod = (startTime: string, endTime: string): boolean => {
  const now = new Date();
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const nowMins = now.getHours() * 60 + now.getMinutes();
  return nowMins >= sh * 60 + sm && nowMins < eh * 60 + em;
};

const isPast = (endTime: string): boolean => {
  const now = new Date();
  const [eh, em] = endTime.split(':').map(Number);
  return now.getHours() * 60 + now.getMinutes() > eh * 60 + em;
};

export const TeacherLayout: React.FC = () => {
  const [view, setView] = useState<TeacherView>('DASHBOARD');
  const { isSubView, setSubView } = useUIStore();
  const goTo = (v: TeacherView) => { setView(v); setSubView(true); };
  const goBack = () => { setView('DASHBOARD'); setSubView(false); };

  useEffect(() => { setSubView(false); }, []);
  useEffect(() => { if (!isSubView) setView('DASHBOARD'); }, [isSubView]);

  const session = useAuthStore(state => state.session);
  const teacherName = session?.name ?? 'Teacher';
  const initials = teacherName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const firstName = teacherName.split(' ')[0];

  const [todayClasses, setTodayClasses] = useState<TodayEntry[]>([]);
  // Hero stats — derived from the same in-memory data as the modules so the
  // dashboard stays one round-trip per page-load.
  const [assignedClassCount, setAssignedClassCount] = useState<number | null>(null);
  const [studentCount, setStudentCount] = useState<number | null>(null);
  const [pendingTestCount, setPendingTestCount] = useState<number | null>(null);

  useEffect(() => {
    teacherService.getTodayClasses().then(setTodayClasses).catch(() => setTodayClasses([]));
    teacherService.getClasses().then(list => {
      setAssignedClassCount(list.length);
      // Sum unique student count across classes — same student in two
      // subjects shouldn't be double-counted.
      const ids = new Set<string>();
      for (const c of list) for (const s of c.students) ids.add(s.id);
      setStudentCount(ids.size);
    }).catch(() => { setAssignedClassCount(0); setStudentCount(0); });
    teacherService.getTests().then(list => {
      // "Pending" = results not yet uploaded. Best signal for "what needs
      // my attention" without an extra schema.
      setPendingTestCount(list.filter(t => !t.resultsUploaded).length);
    }).catch(() => setPendingTestCount(0));
  }, []);

  if (view === 'ATTENDANCE')  return <AttendanceManager      onBack={goBack} />;
  if (view === 'TESTS')       return <TestsManager           onBack={goBack} />;
  if (view === 'EXAM_GEN')    return <ExamPaperGeneratorView onBack={goBack} />;
  if (view === 'COMPLAINTS')  return <TeacherComplaintsView  onBack={goBack} />;
  if (view === 'NOTICES')     return <TeacherNoticesView     onBack={goBack} />;
  if (view === 'TIMETABLE')   return <TeacherTimetableView   onBack={goBack} />;
  if (view === 'STUDENTS')    return <TeacherStudentList     onBack={goBack} />;

  // Module grid — 7 daily-use teacher actions. 4-cols on mobile means tile
  // 8 sits on row 2 by itself; that's fine since "Helpdesk" is rare. Desktop
  // expands to 7-cols so all tiles fit on a single row.
  const MODULES: Array<{
    icon: React.ComponentType<{ size?: number; className?: string }>;
    label: string;
    view: TeacherView;
    color: string;
  }> = [
    { icon: FileCheck2,    label: 'Attendance', view: 'ATTENDANCE', color: 'text-blue-600'    },
    { icon: ClipboardList, label: 'Tests',      view: 'TESTS',      color: 'text-violet-600'  },
    { icon: ScrollText,    label: 'Notices',    view: 'NOTICES',    color: 'text-orange-500'  },
    { icon: Sparkles,      label: 'Exam Gen.',  view: 'EXAM_GEN',   color: 'text-emerald-600' },
    { icon: CalendarDays,  label: 'Timetable',  view: 'TIMETABLE',  color: 'text-sky-600'     },
    { icon: Users,         label: 'Students',   view: 'STUDENTS',   color: 'text-indigo-600'  },
    { icon: CircleAlert,   label: 'Helpdesk',   view: 'COMPLAINTS', color: 'text-rose-500'    },
  ];

  return (
    <div className="flex flex-col gap-6 lg:gap-8 animate-in fade-in duration-300 px-5 lg:px-10 xl:px-16 max-w-7xl mx-auto w-full pt-4 lg:pt-8 pb-8 lg:pb-12">

      {/* ── Hero card — matches Student/Principal layout pattern.
          Dark slate, avatar + greeting, bell, then a 3-stat row that
          gives the teacher a one-glance summary of their day. ───────── */}
      <div className="bg-slate-900 text-white rounded-2xl p-5 lg:p-6 shadow-lg">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-full bg-white/15 border-2 border-white/25 flex items-center justify-center font-black text-base shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <h2 className="text-xl lg:text-2xl font-black uppercase tracking-tight leading-none truncate">
                Hi, {firstName}
              </h2>
              <p className="text-[10px] lg:text-xs font-black uppercase tracking-widest text-white/60 mt-1.5">
                Teacher · EduGrow
              </p>
            </div>
          </div>
          <button onClick={() => goTo('NOTICES')}
            className="w-10 h-10 bg-white/10 rounded-full border border-white/20 flex items-center justify-center shrink-0 hover:bg-white/20 transition-colors">
            <Bell size={16} className="text-white" />
          </button>
        </div>

        {/* 3-stat row. Tapping each stat opens the matching module so the
            hero acts as both summary and shortcut. */}
        <div className="grid grid-cols-3 gap-2.5 lg:gap-3 mt-5">
          <button onClick={() => goTo('TIMETABLE')}
            className="bg-white/10 rounded-xl px-3 py-3 text-left hover:bg-white/15 transition-colors">
            <div className="text-[9px] font-black uppercase tracking-widest text-white/60">Today</div>
            <div className="text-2xl font-black mt-1 tabular-nums">
              {todayClasses.length}
            </div>
            <div className="text-[9px] font-bold text-white/50 mt-0.5">classes</div>
          </button>
          <button onClick={() => goTo('STUDENTS')}
            className="bg-white/10 rounded-xl px-3 py-3 text-left hover:bg-white/15 transition-colors">
            <div className="text-[9px] font-black uppercase tracking-widest text-white/60">My Classes</div>
            <div className="text-2xl font-black mt-1 tabular-nums">
              {assignedClassCount ?? '—'}
            </div>
            <div className="text-[9px] font-bold text-white/50 mt-0.5">
              {studentCount !== null ? `${studentCount} students` : ' '}
            </div>
          </button>
          <button onClick={() => goTo('TESTS')}
            className="bg-white/10 rounded-xl px-3 py-3 text-left hover:bg-white/15 transition-colors">
            <div className="text-[9px] font-black uppercase tracking-widest text-white/60">Tests</div>
            <div className="text-2xl font-black mt-1 tabular-nums">
              {pendingTestCount ?? '—'}
            </div>
            <div className="text-[9px] font-bold text-white/50 mt-0.5">pending</div>
          </button>
        </div>
      </div>

      {/* ── Module grid ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 lg:grid-cols-7 gap-2.5 lg:gap-3">
        {MODULES.map(({ icon: Icon, label, view: v, color }) => (
          <button key={label} onClick={() => goTo(v)}
            className="flex flex-col items-center justify-center gap-2 py-4 px-1 bg-white border border-slate-100 rounded-2xl shadow-sm active:scale-95 hover:shadow-md hover:border-slate-200 hover:-translate-y-0.5 transition-all">
            <Icon size={24} className={color} strokeWidth={2} />
            <span className="text-[10px] font-black uppercase tracking-wide text-slate-700 text-center leading-none whitespace-nowrap">
              {label}
            </span>
          </button>
        ))}
      </div>

      {/* ── Today's Classes ────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg lg:text-xl font-black text-slate-900 uppercase tracking-tight">
            Today's Classes
          </h3>
          <button onClick={() => goTo('TIMETABLE')}
            className="text-[10px] lg:text-xs font-black text-blue-600 uppercase tracking-widest hover:text-blue-700 transition-colors">
            View Timetable →
          </button>
        </div>

        {todayClasses.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center">
            <CalendarDays size={28} className="mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-black text-slate-500">No classes today</p>
            <p className="text-[11px] font-bold text-slate-400 mt-1">Enjoy the day!</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm divide-y divide-slate-50 overflow-hidden">
            {todayClasses.slice(0, 4).map((entry, idx) => {
              const live = isCurrentPeriod(entry.slot.startTime, entry.slot.endTime);
              const done = isPast(entry.slot.endTime);
              return (
                <div key={entry.id}
                  className={`flex items-center gap-3 lg:gap-4 px-4 py-4 ${live ? 'bg-emerald-50/40' : ''}`}>
                  {/* Period badge — same vocabulary as Student dashboard so
                      the visual language stays consistent across roles. */}
                  <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0 border ${
                    live   ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                    done   ? 'bg-slate-50 text-slate-400 border-slate-100'      :
                            'bg-blue-50 text-blue-700 border-blue-200'
                  }`}>
                    <span className="text-[8px] font-black uppercase tracking-widest opacity-70 leading-none">Per</span>
                    <span className="text-base font-black leading-none mt-0.5">{idx + 1}</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className={`font-black text-sm lg:text-base uppercase tracking-tight truncate ${done ? 'text-slate-400' : 'text-slate-900'}`}>
                      {entry.subject}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className="text-[11px] lg:text-xs font-bold text-slate-500">
                        Class {entry.className}-{entry.section}
                      </span>
                      <span className="text-slate-300">·</span>
                      <Clock size={11} className="text-slate-400" />
                      <span className="text-[11px] lg:text-xs font-bold text-slate-500 tabular-nums">
                        {entry.slot.startTime}–{entry.slot.endTime}
                      </span>
                      {entry.room && (
                        <>
                          <span className="text-slate-300">·</span>
                          <span className="text-[11px] lg:text-xs font-bold text-slate-500">{entry.room}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center shrink-0">
                    {live ? (
                      <button
                        onClick={() => goTo('ATTENDANCE')}
                        title="Mark attendance for this class"
                        className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-lg active:scale-95 transition-transform">
                        <Play size={11} className="fill-current" /> Mark
                      </button>
                    ) : done ? (
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Done</span>
                    ) : (
                      <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Up next</span>
                    )}
                  </div>
                </div>
              );
            })}
            {todayClasses.length > 4 && (
              <button onClick={() => goTo('TIMETABLE')}
                className="w-full py-2.5 text-[11px] font-black text-slate-500 hover:bg-slate-50 transition-colors uppercase tracking-widest">
                + {todayClasses.length - 4} more
              </button>
            )}
          </div>
        )}
      </section>

      {/* ── My Classes — quick reference roster of assigned class+sections.
          Skips on first paint (loading) so the empty state doesn't flash.
          Hidden entirely if the teacher has no class assignments yet. ─── */}
      {assignedClassCount !== null && assignedClassCount > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg lg:text-xl font-black text-slate-900 uppercase tracking-tight">
              My Classes
            </h3>
            <button onClick={() => goTo('STUDENTS')}
              className="text-[10px] lg:text-xs font-black text-blue-600 uppercase tracking-widest hover:text-blue-700 transition-colors">
              View Students →
            </button>
          </div>
          <button onClick={() => goTo('STUDENTS')}
            className="w-full bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-3 lg:gap-4 hover:shadow-md hover:border-slate-200 transition-all text-left">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200 flex items-center justify-center shrink-0">
              <BookOpen size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-black text-sm lg:text-base uppercase tracking-tight text-slate-900">
                {assignedClassCount} class{assignedClassCount === 1 ? '' : 'es'} assigned
              </div>
              <div className="text-[11px] lg:text-xs font-bold text-slate-500 mt-1">
                {studentCount} student{studentCount === 1 ? '' : 's'} across all sections
              </div>
            </div>
            <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest shrink-0">
              Open →
            </span>
          </button>
        </section>
      )}
    </div>
  );
};
