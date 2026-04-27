import React, { useState, useMemo } from 'react';
import { ToastContainer } from '../../../components/ui/Toast';
import { TimetableView } from '../components/TimetableView';
import { ResultsView } from '../components/ResultsView';
import { FeesView } from '../components/FeesView';
import { TransportView } from '../components/TransportView';
import { StudentNoticesView } from '../components/StudentNoticesView';
import { StudentComplaintsView } from '../components/StudentComplaintsView';
import {
  Calendar, Trophy, CreditCard, Bus, Bell, CircleAlert,
  ChevronRight, AlertTriangle, BookOpen, Clock, MapPin,
} from 'lucide-react';
import { timetableService, PERIOD_SLOTS } from '../../../services/timetable.service';
import { feeService } from '../../../services/fee.service';
import { useAuthStore } from '../../../store/authStore';

const MY_CLASS = '10-A';
const SCHOOL_NAME = 'EduGrow School';

const getCurrentPeriod = () => {
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const todayName = days[now.getDay()];
  const dayToUse = todayName === 'Sunday' ? 'Monday' : todayName;
  const weeklyMap = timetableService.getClassWeeklyMap(MY_CLASS);
  const todayEntries = (weeklyMap as Record<string, typeof weeklyMap[keyof typeof weeklyMap]>)[dayToUse] ?? [];
  for (const entry of todayEntries) {
    const slot = PERIOD_SLOTS.find(s => s.slotId === entry.slotId);
    if (!slot) continue;
    const [sh, sm] = slot.startTime.split(':').map(Number);
    const [eh, em] = slot.endTime.split(':').map(Number);
    if (nowMins >= sh * 60 + sm && nowMins < eh * 60 + em) return { entry, slot };
  }
  return null;
};

const getDaysUntilDue = () => {
  const today = new Date();
  const dueDate = new Date('2026-07-10');
  const diff = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
};

type StudentView = 'DASHBOARD' | 'TIMETABLE' | 'RESULTS' | 'FEES' | 'TRANSPORT' | 'NOTICES' | 'COMPLAINTS';

export const StudentLayout: React.FC = () => {
  const session = useAuthStore(state => state.session);
  const STUDENT_FULL = session?.name ?? 'Student';
  const STUDENT_NAME = STUDENT_FULL.split(' ')[0];
  const MY_STUDENT_ID = session?.linkedStudentIds?.[0] ?? session?.userId ?? 'student1';

  const [view, setView] = useState<StudentView>('DASHBOARD');
  const goBack = () => setView('DASHBOARD');
  const currentPeriod = useMemo(() => getCurrentPeriod(), []);
  const feeSummary = useMemo(() => feeService.getParentDueSummary(MY_STUDENT_ID), [MY_STUDENT_ID]);
  const daysUntilDue = getDaysUntilDue();

  if (view === 'TIMETABLE')   return <TimetableView        onBack={goBack} />;
  if (view === 'RESULTS')     return <ResultsView          onBack={goBack} />;
  if (view === 'FEES')        return <FeesView             onBack={goBack} />;
  if (view === 'TRANSPORT')   return <TransportView        onBack={goBack} />;
  if (view === 'NOTICES')     return <StudentNoticesView   onBack={goBack} />;
  if (view === 'COMPLAINTS')  return <StudentComplaintsView onBack={goBack} />;

  const modules = [
    { icon: Calendar,     label: 'Timetable',  view: 'TIMETABLE'   as StudentView, color: 'bg-blue-50 text-blue-600',    border: 'border-blue-100' },
    { icon: Trophy,       label: 'Results',    view: 'RESULTS'     as StudentView, color: 'bg-amber-50 text-amber-600',  border: 'border-amber-100' },
    { icon: CreditCard,   label: 'Fees',       view: 'FEES'        as StudentView, color: 'bg-violet-50 text-violet-600', border: 'border-violet-100' },
    { icon: Bus,          label: 'Transport',  view: 'TRANSPORT'   as StudentView, color: 'bg-orange-50 text-orange-600', border: 'border-orange-100' },
    { icon: Bell,         label: 'Notices',    view: 'NOTICES'     as StudentView, color: 'bg-emerald-50 text-emerald-600', border: 'border-emerald-100' },
    { icon: CircleAlert,  label: 'Complaints', view: 'COMPLAINTS'  as StudentView, color: 'bg-rose-50 text-rose-600',    border: 'border-rose-100' },
  ];

  const initials = STUDENT_FULL.split(' ').map(w => w[0]).join('').slice(0, 2);

  return (
    <div className="flex flex-col gap-5 animate-in slide-in-from-bottom-4 duration-300 fade-in pt-3 pb-6">

      {/* ── Top Greeting ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center font-black text-lg shadow-md">
            {initials}
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              WELCOME TO {SCHOOL_NAME.toUpperCase()}
            </p>
            <h2 className="text-2xl font-black text-slate-900 leading-tight">HI, {STUDENT_NAME.toUpperCase()}</h2>
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

      {/* ── Fee Due Card ──────────────────────────────────────────────── */}
      {feeSummary.total > 0 && (
        <div className="bg-[#0d1b3e] rounded-3xl p-5 text-white shadow-xl">
          <p className="text-[10px] font-black uppercase tracking-widest text-blue-300 mb-1">
            TOTAL DUE • Q2 TERM
          </p>
          <div className="text-5xl font-black mb-2">
            ₹{feeSummary.total.toLocaleString('en-IN')}
          </div>
          {daysUntilDue <= 30 && (
            <div className="flex items-center gap-1.5 mb-4">
              <AlertTriangle size={14} className="text-orange-400" />
              <span className="text-sm font-bold text-orange-400">
                Due in {daysUntilDue} Day{daysUntilDue !== 1 ? 's' : ''}
              </span>
            </div>
          )}
          <button
            onClick={() => setView('FEES')}
            className="w-full bg-blue-500 hover:bg-blue-400 text-white font-black text-sm uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-all shadow-lg"
          >
            PAY SECURELY VIA UPI
          </button>
        </div>
      )}

      {feeSummary.total === 0 && (
        <div className="bg-[#0d1b3e] rounded-3xl p-5 text-white shadow-xl">
          <p className="text-[10px] font-black uppercase tracking-widest text-blue-300 mb-2">FEE STATUS</p>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center">
              <Trophy size={20} />
            </div>
            <div>
              <div className="font-black text-xl">All Clear!</div>
              <div className="text-xs font-bold text-blue-200">No outstanding dues</div>
            </div>
          </div>
        </div>
      )}

      {/* ── Fee Breakdown ──────────────────────────────────────────────── */}
      {feeSummary.total > 0 && (
        <div>
          <h3 className="text-base font-black text-slate-900 mb-3">FEE BREAKDOWN</h3>
          <div className="space-y-2">
            {feeSummary.tuition > 0 && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center justify-between">
                <div>
                  <div className="font-black text-slate-900 text-sm">TUITION FEE</div>
                  <div className="text-xs font-bold text-slate-400 mt-0.5">July – September 2026</div>
                </div>
                <div className="font-black text-slate-900 text-base">₹{feeSummary.tuition.toLocaleString('en-IN')}</div>
              </div>
            )}
            {feeSummary.transport > 0 && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center justify-between">
                <div>
                  <div className="font-black text-slate-900 text-sm">TRANSPORT FEE</div>
                  <div className="text-xs font-bold text-slate-400 mt-0.5">Route #4</div>
                </div>
                <div className="font-black text-slate-900 text-base">₹{feeSummary.transport.toLocaleString('en-IN')}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Stats Row ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Attendance', val: '94.2%', color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Fee Paid',   val: feeSummary.total === 0 ? '100%' : '67%', color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Last Rank',  val: '#2',    color: 'text-amber-600',  bg: 'bg-amber-50' },
        ].map(({ label, val, color, bg }) => (
          <div key={label} className={`${bg} rounded-2xl p-3 text-center`}>
            <div className={`text-lg font-black ${color}`}>{val}</div>
            <div className="text-[9px] font-black uppercase tracking-widest text-slate-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* ── Current Period ─────────────────────────────────────────────── */}
      <button onClick={() => setView('TIMETABLE')} className="w-full text-left active:scale-[0.98] transition-transform">
        <div className="bg-slate-900 rounded-2xl p-4 text-white">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Now In Progress</p>
          {currentPeriod ? (
            <div className="flex items-center justify-between">
              <div>
                <div className="font-black text-xl">{currentPeriod.entry.subject}</div>
                <div className="flex items-center gap-2 text-[11px] font-bold text-slate-400 mt-0.5">
                  <span>{currentPeriod.entry.teacherName}</span>
                  {currentPeriod.entry.room && <span>· {currentPeriod.entry.room}</span>}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-black text-blue-400">
                  {currentPeriod.slot.startTime} – {currentPeriod.slot.endTime}
                </div>
                <div className="text-[9px] font-black text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded-full mt-1 uppercase">Live</div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <div className="font-black text-lg text-slate-400">No class right now</div>
                <div className="text-[11px] font-bold text-slate-500 mt-0.5">Tap to see full timetable</div>
              </div>
              <Calendar size={24} className="text-slate-600" />
            </div>
          )}
        </div>
      </button>

      {/* ── Module Grid ───────────────────────────────────────────────── */}
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">My Modules</p>
        <div className="grid grid-cols-3 gap-3">
          {modules.map(({ icon: Icon, label, view: v, color, border }) => (
            <button key={label} onClick={() => setView(v)}
              className={`flex flex-col items-center gap-2 bg-white rounded-2xl border ${border} shadow-sm py-4 px-2 active:scale-95 transition-transform`}>
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${color}`}>
                <Icon size={22} />
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 text-center leading-tight">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Quick Notice ──────────────────────────────────────────────── */}
      <button onClick={() => setView('NOTICES')}
        className="w-full text-left bg-violet-50 border border-violet-200 rounded-2xl p-4 flex items-center gap-3 active:scale-[0.98] transition-transform">
        <div className="w-8 h-8 bg-violet-100 rounded-xl flex items-center justify-center shrink-0">
          <Bell size={15} className="text-violet-600" />
        </div>
        <div className="flex-1">
          <div className="font-extrabold text-violet-900 text-sm">Mid-Term Exam Schedule</div>
          <div className="text-[11px] font-bold text-violet-600 mt-0.5">Exams from 15–25 Nov. Carry admit card.</div>
        </div>
        <ChevronRight size={16} className="text-violet-400" />
      </button>
    </div>
    <ToastContainer />
  );
};
