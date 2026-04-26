import React, { useState } from 'react';
import { TimetableView } from '../components/TimetableView';
import { ResultsView } from '../components/ResultsView';
import { FeesView } from '../components/FeesView';
import { TransportView } from '../components/TransportView';
import { StudentNoticesView } from '../components/StudentNoticesView';
import { StudentComplaintsView } from '../components/StudentComplaintsView';
import {
  Calendar, Trophy, CreditCard, Bus, Bell, CircleAlert,
  TrendingUp, BookOpen, CheckCircle2,
} from 'lucide-react';

type StudentView = 'DASHBOARD' | 'TIMETABLE' | 'RESULTS' | 'FEES' | 'TRANSPORT' | 'NOTICES' | 'COMPLAINTS';

export const StudentLayout: React.FC = () => {
  const [view, setView] = useState<StudentView>('DASHBOARD');
  const goBack = () => setView('DASHBOARD');

  if (view === 'TIMETABLE')   return <TimetableView        onBack={goBack} />;
  if (view === 'RESULTS')     return <ResultsView          onBack={goBack} />;
  if (view === 'FEES')        return <FeesView             onBack={goBack} />;
  if (view === 'TRANSPORT')   return <TransportView        onBack={goBack} />;
  if (view === 'NOTICES')     return <StudentNoticesView   onBack={goBack} />;
  if (view === 'COMPLAINTS')  return <StudentComplaintsView onBack={goBack} />;

  const modules = [
    { icon: Calendar, label: 'Timetable', view: 'TIMETABLE' as StudentView, color: 'bg-blue-50 text-blue-600' },
    { icon: Trophy, label: 'Results', view: 'RESULTS' as StudentView, color: 'bg-amber-50 text-amber-600' },
    { icon: CreditCard, label: 'Fees', view: 'FEES' as StudentView, color: 'bg-emerald-50 text-emerald-600' },
    { icon: Bus, label: 'Transport', view: 'TRANSPORT' as StudentView, color: 'bg-orange-50 text-orange-600' },
    { icon: Bell, label: 'Notices', view: 'NOTICES' as StudentView, color: 'bg-violet-50 text-violet-600' },
    { icon: CircleAlert, label: 'Complaints', view: 'COMPLAINTS' as StudentView, color: 'bg-rose-50 text-rose-600' },
  ];

  return (
    <div className="flex flex-col gap-4 animate-in slide-in-from-bottom-4 duration-300 fade-in pt-2">
      {/* Greeting */}
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Student Portal</p>
        <h2 className="text-2xl font-black text-slate-900 mt-0.5">Hello, Aakash!</h2>
        <p className="text-xs font-bold text-slate-400 mt-0.5">Class 10-A · Roll No. 01 · ADM-2024-001</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Attendance', val: '94.2%', color: 'text-emerald-600' },
          { label: 'Fee Paid', val: '100%', color: 'text-blue-600' },
          { label: 'Last Rank', val: '#2', color: 'text-amber-600' },
        ].map(({ label, val, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 text-center">
            <div className={`text-lg font-black ${color}`}>{val}</div>
            <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Today's first period highlight */}
      <div className="bg-slate-900 rounded-2xl p-4 text-white">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Now in Progress</p>
        <div className="flex items-center justify-between">
          <div>
            <div className="font-black text-xl">Mathematics</div>
            <div className="text-[11px] font-bold text-slate-400 mt-0.5">Aarti Desai · Room 12</div>
          </div>
          <div className="text-right">
            <div className="text-sm font-black text-blue-400">10:15 – 11:00</div>
            <div className="text-[9px] font-black text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded-full mt-1 uppercase">Live</div>
          </div>
        </div>
      </div>

      {/* Module grid */}
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 -mb-1">My Modules</p>
      <div className="grid grid-cols-3 gap-2">
        {modules.map(({ icon: Icon, label, view: v, color }) => (
          <button key={label} onClick={() => setView(v)}
            className="flex flex-col items-center gap-2 bg-white rounded-2xl border border-slate-100 shadow-sm py-4 px-2 active:scale-95 transition-transform">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${color}`}>
              <Icon size={22} />
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 text-center">{label}</span>
          </button>
        ))}
      </div>

      {/* Quick notice */}
      <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <Bell size={16} className="text-violet-500 shrink-0 mt-0.5" />
          <div>
            <div className="font-extrabold text-violet-900 text-sm">Mid-Term Exam Schedule</div>
            <div className="text-[11px] font-bold text-violet-600 mt-0.5">Exams from 15–25 November 2024. Carry admit card.</div>
          </div>
        </div>
      </div>
    </div>
  );
};
