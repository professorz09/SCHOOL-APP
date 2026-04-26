import React, { useState, useMemo, useEffect } from 'react';
import {
  Users, FileCheck2, ClipboardList, ScrollText, CircleAlert,
  TrendingUp, BookOpen, Calendar, IndianRupee, Bell, CalendarDays,
  Clock, MapPin,
} from 'lucide-react';
import { timetableService } from '../../../services/timetable.service';
import { teacherService } from '../../../services/teacher.service';
import { AttendanceManager } from '../components/AttendanceManager';
import { TestsManager } from '../components/TestsManager';
import { HomeworkManager } from '../components/HomeworkManager';
import { ExamPaperGeneratorView } from '../components/ExamPaperGenerator';
import { TeacherComplaintsView } from '../components/TeacherComplaints';
import { TeacherNoticesView } from '../components/TeacherNoticesView';
import { TeacherTimetableView } from '../components/TeacherTimetableView';
import { useAuthStore } from '../../../store/authStore';
import { TeacherClass } from '../../../types/teacher.types';

type TeacherView = 'DASHBOARD' | 'ATTENDANCE' | 'TESTS' | 'HOMEWORK' | 'EXAM_GEN' | 'COMPLAINTS' | 'NOTICES' | 'TIMETABLE';

const MY_TEACHER_ID = 'st1';

const isCurrentPeriod = (startTime: string, endTime: string): boolean => {
  const now = new Date();
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const nowMins = now.getHours() * 60 + now.getMinutes();
  return nowMins >= sh * 60 + sm && nowMins < eh * 60 + em;
};

export const TeacherLayout: React.FC = () => {
  const [view, setView] = useState<TeacherView>('DASHBOARD');
  const goBack = () => setView('DASHBOARD');
  const session = useAuthStore(state => state.session);
  const teacherName = session?.name ?? 'Teacher';
  const todayClasses = useMemo(() => timetableService.getTodayForTeacher(MY_TEACHER_ID), []);
  const [teacherClasses, setTeacherClasses] = useState<TeacherClass[]>([]);

  useEffect(() => {
    teacherService.getClasses().then(setTeacherClasses);
  }, []);

  const totalStudents = teacherClasses.reduce((sum, c) => sum + c.studentCount, 0);
  const primarySubject = teacherClasses[0]?.subject ?? '—';
  const classLabels = teacherClasses.map(c => `${c.className}-${c.section}`).join(', ');

  if (view === 'ATTENDANCE')  return <AttendanceManager      onBack={goBack} />;
  if (view === 'TESTS')       return <TestsManager           onBack={goBack} />;
  if (view === 'HOMEWORK')    return <HomeworkManager        onBack={goBack} />;
  if (view === 'EXAM_GEN')    return <ExamPaperGeneratorView onBack={goBack} />;
  if (view === 'COMPLAINTS')  return <TeacherComplaintsView  onBack={goBack} />;
  if (view === 'NOTICES')     return <TeacherNoticesView     onBack={goBack} />;
  if (view === 'TIMETABLE')   return <TeacherTimetableView   onBack={goBack} />;

  const modules = [
    { icon: CalendarDays,   label: 'My Timetable', view: 'TIMETABLE'   as TeacherView, color: 'bg-sky-50 text-sky-600',        desc: 'Weekly schedule & periods' },
    { icon: FileCheck2,     label: 'Attendance',   view: 'ATTENDANCE'  as TeacherView, color: 'bg-blue-50 text-blue-600',      desc: 'Mark class attendance' },
    { icon: ClipboardList,  label: 'Tests',        view: 'TESTS'       as TeacherView, color: 'bg-indigo-50 text-indigo-600',  desc: 'Schedule & manage tests' },
    { icon: BookOpen,       label: 'Homework',     view: 'HOMEWORK'    as TeacherView, color: 'bg-purple-50 text-purple-600',  desc: 'Assign & track homework' },
    { icon: Bell,           label: 'Notices',      view: 'NOTICES'     as TeacherView, color: 'bg-violet-50 text-violet-600',  desc: 'Send notices to your classes' },
    { icon: ScrollText,     label: 'AI Exam Gen',  view: 'EXAM_GEN'    as TeacherView, color: 'bg-amber-50 text-amber-600',    desc: 'Generate with Gemini AI' },
    { icon: CircleAlert,    label: 'Complaints',   view: 'COMPLAINTS'  as TeacherView, color: 'bg-rose-50 text-rose-600',      desc: 'Report to principal' },
  ];

  return (
    <div className="flex flex-col gap-4 animate-in slide-in-from-bottom-4 duration-300 fade-in pt-2">
      {/* Greeting */}
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">TEACHER DASHBOARD</p>
        <h2 className="text-2xl font-black text-slate-900 mt-0.5">Hello, {teacherName}</h2>
        <p className="text-xs font-bold text-slate-400 mt-0.5">{primarySubject}{classLabels ? ` · ${classLabels}` : ''}</p>
      </div>

      {/* Today's summary */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Today's Classes", val: String(todayClasses.length), color: 'text-blue-600' },
          { label: 'Total Students', val: totalStudents > 0 ? String(totalStudents) : '—', color: 'text-slate-900' },
          { label: 'Classes', val: teacherClasses.length > 0 ? String(teacherClasses.length) : '—', color: 'text-emerald-600' },
        ].map(({ label, val, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 text-center">
            <div className={`text-xl font-black ${color}`}>{val}</div>
            <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-0.5 leading-tight">{label}</div>
          </div>
        ))}
      </div>

      {/* Today's timetable – live from timetable service */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Today's Schedule</p>
          <button onClick={() => setView('TIMETABLE')}
            className="text-[9px] font-black text-blue-500 uppercase tracking-widest">
            Full Week →
          </button>
        </div>
        {todayClasses.length === 0 ? (
          <p className="text-xs font-bold text-slate-400 text-center py-4">No classes today</p>
        ) : (
          <div className="space-y-2.5">
            {todayClasses.map(entry => {
              const live = isCurrentPeriod(entry.slot.startTime, entry.slot.endTime);
              const now = new Date();
              const [eh, em] = entry.slot.endTime.split(':').map(Number);
              const done = now.getHours() * 60 + now.getMinutes() > eh * 60 + em;
              return (
                <div key={entry.id}
                  className={`flex items-center gap-3 p-3 rounded-xl ${live ? 'bg-blue-50 border border-blue-200' : 'bg-slate-50'}`}>
                  <div className={`w-2 h-10 rounded-full shrink-0 ${done ? 'bg-slate-200' : live ? 'bg-blue-500' : 'bg-slate-300'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="font-extrabold text-slate-900 text-xs">Class {entry.classId} · {entry.subject}</div>
                    <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 mt-0.5">
                      <Clock size={9} /> {entry.slot.startTime}–{entry.slot.endTime}
                      {entry.room && <><MapPin size={9} /> {entry.room}</>}
                    </div>
                  </div>
                  {live && <span className="text-[9px] font-black bg-blue-500 text-white px-2 py-0.5 rounded-full uppercase animate-pulse">Live</span>}
                  {done && <span className="text-[9px] font-black text-slate-400 uppercase">Done</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Module grid */}
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 -mb-1">Quick Actions</p>
      <div className="space-y-2">
        {modules.map(({ icon: Icon, label, view: v, color, desc }) => (
          <button key={label} onClick={() => setView(v)}
            className="w-full flex items-center gap-4 bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-left active:scale-95 transition-transform">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
              <Icon size={22} />
            </div>
            <div className="flex-1">
              <div className="font-extrabold text-slate-900 text-sm">{label}</div>
              <div className="text-[10px] font-bold text-slate-400 mt-0.5">{desc}</div>
            </div>
            <div className="text-slate-300">›</div>
          </button>
        ))}
      </div>
    </div>
  );
};
