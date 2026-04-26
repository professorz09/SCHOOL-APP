import React from 'react';
import { BookOpen, Calendar, CreditCard, FileText, TrendingUp, Clock, FileBarChart, Trophy, MessageSquareWarning, Library, Bus, CalendarOff } from 'lucide-react';
import { ActionGrid, AppCard, SectionTitle } from '../components/SharedUI';
import { ActionItem } from '../types';

export const StudentDashboard: React.FC = () => {
  const actions: ActionItem[] = [
    { title: 'Timetable', icon: <Calendar size={28} /> },
    { title: 'Homework', icon: <BookOpen size={28} /> },
    { title: 'Fees', icon: <CreditCard size={28} /> },
    { title: 'Results', icon: <Trophy size={28} /> },
    { title: 'Transport', icon: <Bus size={28} />, color: 'text-amber-500' },
    { title: 'Notices', icon: <FileText size={28} /> },
    { title: 'Library', icon: <Library size={28} />, color: 'text-indigo-500' },
    { title: 'Helpdesk', icon: <MessageSquareWarning size={28} />, color: 'text-rose-500' },
  ];

  return (
    <div className="flex flex-col gap-6 animate-in slide-in-from-bottom-4 duration-500 fade-in">
      {/* Top Header */}
      <div className="pt-4">
        <p className="text-slate-500 font-bold text-xs uppercase tracking-widest mb-2">Overall Attendance</p>
        <div className="flex items-end gap-3">
          <h2 className="text-4xl font-black text-blue-600">86%</h2>
          <div className="flex items-center gap-1 text-emerald-500 font-bold text-sm mb-1">
            <TrendingUp size={16} />
            +2% this month
          </div>
        </div>
      </div>

      <ActionGrid actions={actions} />

      {/* Today's Schedule wrapper */}
      <div>
        <SectionTitle title="Today's Schedule" action="View All" />
        <AppCard className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex flex-col items-center justify-center font-bold">
              <span className="text-xs font-medium">Per</span>
              <span>1</span>
            </div>
            <div className="flex-1">
              <h4 className="font-extrabold text-slate-900 text-lg uppercase tracking-tight">Mathematics</h4>
              <p className="text-xs font-bold text-slate-500 flex items-center gap-1 mt-1">
                <Clock size={12} /> 08:30 AM - 09:15 AM
              </p>
            </div>
            <div className="text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
              Live
            </div>
          </div>
          
          <div className="h-px bg-slate-100 w-full" />
          
          <div className="flex items-center gap-4 opacity-50">
            <div className="w-12 h-12 rounded-xl bg-slate-50 text-slate-500 flex flex-col items-center justify-center font-bold">
              <span className="text-xs font-medium">Per</span>
              <span>2</span>
            </div>
            <div className="flex-1">
              <h4 className="font-extrabold text-slate-900 text-lg uppercase tracking-tight">Physics</h4>
              <p className="text-xs font-bold text-slate-500 flex items-center gap-1 mt-1">
                <Clock size={12} /> 09:15 AM - 10:00 AM
              </p>
            </div>
          </div>
        </AppCard>
      </div>

      {/* Pending Homework */}
      <div>
        <SectionTitle title="Pending Tasks" />
        <AppCard>
          <div className="flex justify-between items-start">
             <div>
               <h4 className="font-extrabold text-slate-900 text-sm uppercase tracking-tight">Algebra Worksheet</h4>
               <p className="text-xs font-bold text-red-500 mt-1 flex items-center gap-1">
                  <Clock size={14} /> Due Tomorrow
               </p>
             </div>
             <button className="bg-slate-900 text-white text-xs font-bold px-4 py-2 rounded-full uppercase tracking-widest">
               Upload
             </button>
          </div>
        </AppCard>
      </div>

      <div>
        <SectionTitle title="My Leave Applications" action="Apply Leave" />
        <AppCard noPadding>
          <div className="p-4 flex items-center justify-between border-b border-slate-100">
             <div className="flex items-center gap-3">
               <div className="w-10 h-10 bg-slate-100 text-slate-500 rounded-xl flex items-center justify-center font-bold">
                 <CalendarOff size={20} />
               </div>
               <div>
                 <h4 className="font-extrabold text-slate-900 text-sm uppercase tracking-tight">Family Visit</h4>
                 <p className="text-xs font-bold text-slate-500 mt-1">26 Apr</p>
               </div>
             </div>
             <div className="px-3 py-1 bg-amber-50 text-amber-600 text-[10px] font-black uppercase tracking-widest rounded-full">
                Pending
             </div>
          </div>
        </AppCard>
      </div>
      
      {/* Spacing for bottom nav */}
      <div className="h-8"></div>
    </div>
  );
};
