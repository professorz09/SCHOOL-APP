import React, { useState, useEffect } from 'react';
import { useUIStore } from '@/store/uiStore';
import {
  FileCheck2, ClipboardList, ScrollText, CircleAlert,
  Bell, CalendarDays, Clock, Users, Sparkles, Play,
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
import { TeacherClass } from '@/roles/teacher/teacher.types';

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
  // When footer HOME pressed, isSubView becomes false → reset to dashboard
  useEffect(() => { if (!isSubView) setView('DASHBOARD'); }, [isSubView]);

  const session = useAuthStore(state => state.session);
  const teacherName = session?.name ?? 'Teacher';
  const initials = teacherName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  const [todayClasses, setTodayClasses] = useState<TodayEntry[]>([]);
  const [, setTeacherClasses] = useState<TeacherClass[]>([]);

  useEffect(() => {
    teacherService.getClasses().then(setTeacherClasses).catch(() => setTeacherClasses([]));
    teacherService.getTodayClasses().then(setTodayClasses).catch(() => setTodayClasses([]));
  }, []);

  if (view === 'ATTENDANCE')  return <AttendanceManager      onBack={goBack} />;
  if (view === 'TESTS')       return <TestsManager           onBack={goBack} />;
  if (view === 'EXAM_GEN')    return <ExamPaperGeneratorView onBack={goBack} />;
  if (view === 'COMPLAINTS')  return <TeacherComplaintsView  onBack={goBack} />;
  if (view === 'NOTICES')     return <TeacherNoticesView     onBack={goBack} />;
  if (view === 'TIMETABLE')   return <TeacherTimetableView   onBack={goBack} />;
  if (view === 'STUDENTS')    return <TeacherStudentList     onBack={goBack} />;

  // 8 tiles in a 4×2 grid. Picked the most-used teacher actions; everything
  // else (e.g. profile/settings) lives in the bottom-nav YOU tab.
  const modules: Array<{
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

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-12 h-12 lg:w-14 lg:h-14 rounded-full bg-blue-100 text-blue-600 border-2 border-blue-200 flex items-center justify-center font-black text-lg shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <h2 className="text-2xl lg:text-3xl font-black text-slate-900 uppercase tracking-tight leading-none truncate">
              Hi, {teacherName.split(' ')[0]}
            </h2>
            <p className="text-[10px] lg:text-xs font-black uppercase tracking-widest text-slate-400 mt-1">
              Welcome to EduGrow
            </p>
          </div>
        </div>
        <button onClick={() => goTo('NOTICES')}
          className="relative w-11 h-11 bg-white rounded-full border border-slate-200 shadow-sm flex items-center justify-center shrink-0 hover:bg-slate-50 transition-colors">
          <Bell size={18} className="text-slate-600" />
          {todayClasses.length > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 bg-rose-500 rounded-full flex items-center justify-center">
              <span className="text-[9px] font-black text-white">{todayClasses.length}</span>
            </span>
          )}
        </button>
      </div>

      {/* ── Module grid ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3 lg:gap-4">
        {modules.map(({ icon: Icon, label, view: v, color }) => (
          <button key={label} onClick={() => goTo(v)}
            className="aspect-square flex flex-col items-center justify-center gap-2 lg:gap-3 bg-white border border-slate-200 rounded-2xl shadow-sm active:scale-95 hover:shadow-md hover:border-slate-300 hover:-translate-y-0.5 transition-all">
            <Icon size={26} className={color} />
            <span className="text-[9px] lg:text-[11px] font-black uppercase tracking-widest text-slate-600 text-center leading-tight px-1">
              {label}
            </span>
          </button>
        ))}
      </div>

      {/* ── Upcoming classes ───────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg lg:text-xl font-black text-slate-900 uppercase tracking-tight">
            Upcoming Classes
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
          // Dashboard preview — keep it short; full schedule lives in the
          // Timetable view linked above.
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm divide-y divide-slate-50 overflow-hidden">
            {todayClasses.slice(0, 3).map(entry => {
              const live = isCurrentPeriod(entry.slot.startTime, entry.slot.endTime);
              const done = isPast(entry.slot.endTime);
              const barColor = live
                ? 'bg-emerald-500'
                : done
                  ? 'bg-slate-200'
                  : 'bg-slate-300';
              return (
                <div key={entry.id} className={`flex items-stretch gap-3 px-4 py-4 ${live ? 'bg-emerald-50/30' : ''}`}>
                  <div className={`w-1.5 rounded-full shrink-0 ${barColor}`} />
                  <div className="flex-1 min-w-0">
                    <div className={`font-black text-sm lg:text-base uppercase tracking-tight ${done ? 'text-slate-400' : 'text-slate-900'}`}>
                      Class {entry.className}-{entry.section} ({entry.subject})
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Clock size={12} className="text-slate-400" />
                      <span className="text-[11px] lg:text-xs font-bold text-slate-500">
                        {entry.slot.startTime} – {entry.slot.endTime}
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
                      <button className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-100 transition-colors">
                        <Play size={16} className="ml-0.5 fill-current" />
                      </button>
                    ) : done ? (
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Done</span>
                    ) : (
                      <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Up next</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

    </div>
  );
};
