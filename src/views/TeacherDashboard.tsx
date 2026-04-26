import React, { useState } from 'react';
import { Users, FileCheck2, CalendarOff, MessageSquare, Play, ClipboardList, PenTool, MessageSquareWarning, CalendarRange, ScrollText } from 'lucide-react';
import { ActionGrid, AppCard, SectionTitle } from '../components/SharedUI';
import { ActionItem } from '../types';
import { ExamPaperGenerator } from './ExamPaperGenerator';

export const TeacherDashboard: React.FC = () => {
  const [showExamGen, setShowExamGen] = useState(false);

  const actions: ActionItem[] = [
    { title: 'Attendance', icon: <FileCheck2 size={28} />, color: 'text-blue-600' },
    { title: 'Add Marks', icon: <PenTool size={28} />, color: 'text-indigo-600' },
    { title: 'Assignments', icon: <ClipboardList size={28} />, color: 'text-purple-600' },
    { title: 'Exam Gen.', icon: <ScrollText size={28} />, color: 'text-emerald-600', onClick: () => setShowExamGen(true) },
    { title: 'Leaves', icon: <CalendarOff size={28} />, color: 'text-rose-500' },
    { title: 'Messages', icon: <MessageSquare size={28} />, color: 'text-amber-500' },
    { title: 'Timetable', icon: <CalendarRange size={28} />, color: 'text-emerald-500' },
    { title: 'Helpdesk', icon: <MessageSquareWarning size={28} />, color: 'text-red-500' },
  ];

  return (
    <div className="flex flex-col gap-6 animate-in slide-in-from-bottom-4 duration-500 fade-in">
      <div className="pt-4">
        <p className="text-slate-500 font-bold text-xs uppercase tracking-widest mb-2">Today's Classes</p>
        <div className="flex items-end gap-3">
          <h2 className="text-4xl font-black text-blue-600">4</h2>
          <span className="text-slate-400 font-bold text-sm mb-1 uppercase tracking-widest">/ 6 periods</span>
        </div>
      </div>

      <ActionGrid actions={actions} />

      <div>
        <SectionTitle title="Upcoming Classes" action="View Timetable" />
        <AppCard noPadding>
          <div className="p-4 flex items-center justify-between border-b border-slate-100">
             <div className="flex items-center gap-3">
               <div className="w-2 h-10 bg-emerald-500 rounded-full"></div>
               <div>
                 <h4 className="font-extrabold text-slate-900 text-sm uppercase tracking-tight">Class 10-A (Maths)</h4>
                 <p className="text-xs text-slate-500 font-bold mt-1">09:15 AM - 10:00 AM</p>
               </div>
             </div>
             <button className="w-10 h-10 bg-blue-50 text-blue-600 rounded-full flex justify-center items-center">
               <Play size={20} fill="currentColor" />
             </button>
          </div>
          <div className="p-4 flex items-center justify-between">
             <div className="flex items-center gap-3">
               <div className="w-2 h-10 bg-slate-200 rounded-full"></div>
               <div>
                 <h4 className="font-extrabold text-slate-900 text-sm uppercase tracking-tight">Class 9-B (Physics)</h4>
                 <p className="text-xs text-slate-500 font-bold mt-1">11:00 AM - 11:45 AM</p>
               </div>
             </div>
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
                 <h4 className="font-extrabold text-slate-900 text-sm uppercase tracking-tight">Sick Leave • 2 Days</h4>
                 <p className="text-xs font-bold text-slate-500 mt-1">15 Apr - 16 Apr</p>
               </div>
             </div>
             <div className="px-3 py-1 bg-emerald-50 text-emerald-600 text-[10px] font-black uppercase tracking-widest rounded-full">
                Approved
             </div>
          </div>
          <div className="p-4 flex items-center justify-between">
             <div className="flex items-center gap-3">
               <div className="w-10 h-10 bg-slate-100 text-slate-500 rounded-xl flex items-center justify-center font-bold">
                 <CalendarOff size={20} />
               </div>
               <div>
                 <h4 className="font-extrabold text-slate-900 text-sm uppercase tracking-tight">Family Function</h4>
                 <p className="text-xs font-bold text-slate-500 mt-1">28 Apr</p>
               </div>
             </div>
             <div className="px-3 py-1 bg-amber-50 text-amber-600 text-[10px] font-black uppercase tracking-widest rounded-full">
                Pending
             </div>
          </div>
        </AppCard>
      </div>

      <div>
         <SectionTitle title="Pending Actions" />
         <AppCard className="bg-indigo-600 border-none !p-6 shadow-sm">
            <div className="flex gap-4 text-white">
               <div className="mt-1 text-indigo-200">
                 <FileCheck2 size={24} />
               </div>
               <div className="flex-1">
                  <h4 className="font-extrabold text-white text-sm uppercase tracking-tight">Mark Attendance</h4>
                  <p className="text-xs text-indigo-200 font-medium mt-2 leading-relaxed">You haven't marked attendance for Class 10-A yet.</p>
                  <button className="mt-4 w-full bg-white/20 hover:bg-white/30 py-3 rounded-2xl font-bold text-xs transition-colors uppercase tracking-widest text-white">
                    Mark Now
                  </button>
               </div>
            </div>
         </AppCard>
      </div>

      <div className="h-8"></div>

      {showExamGen && <ExamPaperGenerator onClose={() => setShowExamGen(false)} />}
    </div>
  );
};
