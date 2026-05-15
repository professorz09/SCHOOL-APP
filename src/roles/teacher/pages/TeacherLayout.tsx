import React, { useState, useEffect } from 'react';
import { useUIStore } from '@/store/uiStore';
import {
  FileCheck2, ClipboardList, ScrollText, CircleAlert,
  Bell, CalendarDays, Clock, Users, Sparkles, Play, BookOpen, UserPlus, Cake, ChevronRight,
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
import { principalService } from '@/roles/principal/principal.service';
import { StudentsManager } from '@/modules/students/components/StudentsManager';
import { PolicyFooter } from '@/shared/components/PolicyFooter';

type TeacherView = 'DASHBOARD' | 'ATTENDANCE' | 'TESTS' | 'EXAM_GEN' | 'COMPLAINTS' | 'NOTICES' | 'TIMETABLE' | 'STUDENTS' | 'NEW_ADMISSION';

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
  const { isSubView, setSubView, showToast } = useUIStore();
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
  // Upcoming birthdays in the teacher's own classes only. Principal's
  // dashboard used to show this for every student in school; now it lives
  // here, scoped to assigned sections, so the teacher can wish them in
  // class without opening the full student list.
  const [birthdays, setBirthdays] = useState<Array<{
    id: string; name: string; className: string; section: string;
    dob: string; daysAway: number; isToday: boolean;
  }>>([]);
  // Today's freshest notice (relevant to this teacher — own classes,
  // school-wide, or for STAFF audience). Same shape as the student
  // dashboard card; rendered in a red "Needs Attention" panel so a
  // teacher doesn't miss a principal announcement.
  const [todayNotice, setTodayNotice] = useState<{
    id: string; title: string; body: string; sentAt: string; sentBy: string;
  } | null>(null);
  // School-wide permissions granted by the principal. Drives the
  // optional "New Admission" tile — only teachers with
  // CREATE_ADMISSION see it. `null` while loading; `[]` on failure
  // (fail closed — no extra tiles unless the API confirms).
  const [schoolPerms, setSchoolPerms] = useState<string[] | null>(null);

  // Re-fetch on every dashboard re-entry so a permission revoked
  // mid-session locks the tile within one navigation. Without this
  // the teacher could keep tapping the (cached-as-unlocked) tile and
  // hit a 403 toast on every submit.
  useEffect(() => {
    if (view !== 'DASHBOARD') return;
    let cancelled = false;
    principalService.getMySchoolWidePermissions()
      .then(p => { if (!cancelled) setSchoolPerms(p); })
      .catch(() => { if (!cancelled) setSchoolPerms([]); });
    return () => { cancelled = true; };
  }, [view]);

  useEffect(() => {
    teacherService.getTodayClasses().then(setTodayClasses).catch(() => setTodayClasses([]));
    // Classes are the essential data for the teacher dashboard — lift
    // the app-root splash once this resolves (success or failure) so
    // the user doesn't see an empty "0 / 0 / 0" stats card flash
    // between the auth loader and the populated dashboard.
    teacherService.getClasses().then(list => {
      setAssignedClassCount(list.length);
      const ids = new Set<string>();
      for (const c of list) for (const s of c.students) ids.add(s.id);
      setStudentCount(ids.size);
      useUIStore.getState().setAppReady(true);
    }).catch(() => {
      setAssignedClassCount(0); setStudentCount(0);
      useUIStore.getState().setAppReady(true);
    });
    teacherService.getTests().then(list => {
      // "Pending" = results not yet uploaded. Best signal for "what needs
      // my attention" without an extra schema.
      setPendingTestCount(list.filter(t => !t.resultsUploaded).length);
    }).catch(() => setPendingTestCount(0));
    teacherService.getMyStudentBirthdays()
      .then(setBirthdays)
      .catch(() => setBirthdays([]));
    // Latest notice landed today (IST). Cleared the next IST calendar day
    // — the dashboard banner is "what's new today", not a feed (Notices
    // tab handles the feed).
    const istToday = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    teacherService.getMyNotices()
      .then(list => {
        const latestToday = list.find(n => (n.sentAt ?? '').slice(0, 10) === istToday);
        if (latestToday) {
          setTodayNotice({
            id: latestToday.id,
            title: latestToday.title,
            body: latestToday.body,
            sentAt: latestToday.sentAt,
            sentBy: latestToday.sentByName ?? '',
          });
        } else {
          setTodayNotice(null);
        }
      })
      .catch(() => setTodayNotice(null));
  }, []);

  if (view === 'ATTENDANCE')  return <AttendanceManager      onBack={goBack} />;
  if (view === 'TESTS')       return <TestsManager           onBack={goBack} />;
  if (view === 'EXAM_GEN')    return <ExamPaperGeneratorView onBack={goBack} />;
  if (view === 'COMPLAINTS')  return <TeacherComplaintsView  onBack={goBack} />;
  if (view === 'NOTICES')     return <TeacherNoticesView     onBack={goBack} />;
  if (view === 'TIMETABLE')   return <TeacherTimetableView   onBack={goBack} />;
  if (view === 'STUDENTS')    return <TeacherStudentList     onBack={goBack} />;
  // Admission draft — gated by CREATE_ADMISSION (also enforced server-side
  // in /admission/draft-submit, so direct API call from a teacher without
  // permission still 403s).
  if (view === 'NEW_ADMISSION') return (
    // key forces a fresh mount each time the teacher reopens the
    // form so HMR-stale state from a prior session can't sneak in.
    <StudentsManager
      key="teacher-admission-draft"
      mode="TEACHER_DRAFT"
      onBack={goBack}
      onDraftDone={goBack}
    />
  );

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
    { icon: ClipboardList, label: 'Exam',       view: 'TESTS',      color: 'text-violet-600'  },
    { icon: ScrollText,    label: 'Notices',    view: 'NOTICES',    color: 'text-orange-500'  },
    { icon: Sparkles,      label: 'Paper',      view: 'EXAM_GEN',   color: 'text-emerald-600' },
    { icon: CalendarDays,  label: 'Timetable',  view: 'TIMETABLE',  color: 'text-sky-600'     },
    { icon: Users,         label: 'Students',   view: 'STUDENTS',   color: 'text-indigo-600'  },
    { icon: CircleAlert,   label: 'Helpdesk',   view: 'COMPLAINTS', color: 'text-rose-500'    },
    // Admission tile is permanent — visible to every teacher so they
    // know the feature exists. Tapping it without the CREATE_ADMISSION
    // permission shows a hint toast instead of opening the form.
    { icon: UserPlus, label: 'Admission', view: 'NEW_ADMISSION' as TeacherView, color: 'text-pink-600' },
  ];

  const canAdmit = (schoolPerms ?? []).includes('CREATE_ADMISSION');

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
            <div className="text-[9px] font-black uppercase tracking-widest text-white/60">Exam</div>
            <div className="text-2xl font-black mt-1 tabular-nums">
              {pendingTestCount ?? '—'}
            </div>
            <div className="text-[9px] font-bold text-white/50 mt-0.5">pending</div>
          </button>
        </div>
      </div>

      {/* ── Needs Attention — today's freshest notice (if any) ──────────
          Red-tinted so a principal announcement isn't quietly ignored.
          Clears itself the next IST calendar day. */}
      {todayNotice && (
        <button onClick={() => goTo('NOTICES')}
          className="w-full bg-rose-50 rounded-2xl border-2 border-rose-200 shadow-sm p-4 flex items-start gap-3 lg:gap-4 hover:shadow-md hover:bg-rose-100/60 transition-all text-left">
          <div className="w-12 h-12 rounded-xl bg-rose-500 text-white flex items-center justify-center shrink-0 shadow-md">
            <Bell size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[9px] font-black uppercase tracking-widest text-rose-600">Needs Attention</span>
            </div>
            <div className="font-black text-sm lg:text-base text-rose-900 truncate">{todayNotice.title}</div>
            <p className="text-[11px] lg:text-xs font-bold text-rose-800/80 line-clamp-2 mt-0.5">
              {todayNotice.body}
            </p>
            {todayNotice.sentBy && (
              <p className="text-[10px] font-bold text-rose-600 mt-1.5">By {todayNotice.sentBy}</p>
            )}
          </div>
          <span className="text-[9px] font-black text-white bg-rose-600 px-2.5 py-1 rounded-full shrink-0 uppercase tracking-widest shadow-sm">
            New
          </span>
        </button>
      )}

      {/* ── Module grid ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 lg:grid-cols-7 gap-2.5 lg:gap-3">
        {MODULES.map(({ icon: Icon, label, view: v, color }) => {
          // Admission tile is locked for teachers without the
          // CREATE_ADMISSION permission. Render it dimmed + show a
          // toast on tap instead of opening the form.
          const locked = v === 'NEW_ADMISSION' && !canAdmit;
          return (
            <button
              key={label}
              onClick={() => {
                if (locked) {
                  showToast('You don\'t have admission permission — ask the principal to enable it.', 'info');
                  return;
                }
                goTo(v);
              }}
              className={`flex flex-col items-center justify-center gap-2 py-4 px-1 bg-white border border-slate-100 rounded-2xl shadow-sm active:scale-95 hover:shadow-md hover:border-slate-200 hover:-translate-y-0.5 transition-all ${
                locked ? 'opacity-60' : ''
              }`}>
              <Icon size={24} className={color} strokeWidth={2} />
              <span className="text-[10px] font-black uppercase tracking-wide text-slate-700 text-center leading-none whitespace-nowrap">
                {label}
              </span>
              {locked && (
                <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 leading-none">Locked</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Today's Classes ──────────────────────────────────────────────
          Whole header is a tappable button → opens Timetable. The
          period rows below are individually action-routed (Mark live
          class) so the header is the only way to reach the full
          timetable view. Same pattern as the student dashboard. */}
      <section>
        <button onClick={() => goTo('TIMETABLE')}
          className="w-full flex items-center justify-between gap-2 mb-3 group">
          <h3 className="text-lg lg:text-xl font-black text-slate-900 uppercase tracking-tight">
            Today's Classes
          </h3>
          <span className="flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 group-hover:bg-blue-50 group-hover:text-blue-600 text-slate-500 transition-colors">
            <ChevronRight size={14}/>
          </span>
        </button>

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
                        {/* className already carries its own prefix
                            (e.g. "Class 1", "Nursery", "11th Science"),
                            so don't double-prepend "Class". */}
                        {entry.className}{entry.section ? `-${entry.section}` : ''}
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

      {/* ── Birthdays — only this teacher's students, next 7 days.
          Hidden when nothing is upcoming so the dashboard doesn't carry
          a perpetually empty card. */}
      {birthdays.length > 0 && (
        <section>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 lg:p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 lg:w-11 lg:h-11 rounded-xl bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center text-white shadow-md">
                  <Cake size={18}/>
                </div>
                <div>
                  <h2 className="text-sm lg:text-base font-black text-slate-900 uppercase tracking-tight">Birthdays</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Your classes · Next 7 days</p>
                </div>
              </div>
              <span className="text-[10px] font-black text-rose-700 bg-rose-50 px-2 py-1 rounded-full uppercase tracking-widest">
                {birthdays.filter(b => b.isToday).length > 0
                  ? `${birthdays.filter(b => b.isToday).length} today`
                  : `${birthdays.length} upcoming`}
              </span>
            </div>
            <div className="space-y-1.5">
              {birthdays.map(b => (
                <div key={b.id}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border ${b.isToday ? 'border-rose-200 bg-rose-50' : 'border-slate-100 bg-slate-50'}`}>
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${b.isToday ? 'bg-rose-500 text-white' : 'bg-white text-rose-500 border border-rose-100'}`}>
                    <Cake size={14}/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-slate-900 truncate">{b.name}</p>
                    <p className="text-[10px] font-bold text-slate-500">Class {b.className}{b.section ? `-${b.section}` : ''}</p>
                  </div>
                  <span className={`text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-widest shrink-0 ${b.isToday ? 'bg-rose-500 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>
                    {b.isToday ? '🎉 Today' : b.daysAway === 1 ? 'Tomorrow' : `In ${b.daysAway} days`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── My Classes — quick reference roster of assigned class+sections.
          Skips on first paint (loading) so the empty state doesn't flash.
          Hidden entirely if the teacher has no class assignments yet. ─── */}
      {assignedClassCount !== null && assignedClassCount > 0 && (
        <section>
          <h3 className="text-lg lg:text-xl font-black text-slate-900 uppercase tracking-tight mb-3">
            My Classes
          </h3>
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

      <PolicyFooter />
    </div>
  );
};
