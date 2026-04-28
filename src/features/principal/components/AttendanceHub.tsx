import React, { useState } from 'react';
import { ArrowLeft, GraduationCap, Users } from 'lucide-react';
import { StudentAttendanceManager } from './StudentAttendanceManager';
import { StaffAttendanceManager } from './StaffAttendanceManager';

interface Props { onBack: () => void; }

type View = 'MENU' | 'STUDENT' | 'STAFF';

export const AttendanceHub: React.FC<Props> = ({ onBack }) => {
  const [view, setView] = useState<View>('MENU');

  if (view === 'STUDENT') return <StudentAttendanceManager onBack={() => setView('MENU')} />;
  if (view === 'STAFF')   return <StaffAttendanceManager   onBack={() => setView('MENU')} />;

  return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 sticky top-0 z-10 shadow-sm flex items-center gap-3">
        <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Attendance</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4  space-y-3">
        {[
          {
            icon: GraduationCap,
            label: 'Student Attendance',
            desc: 'Class-wise attendance with graphs & reports',
            color: 'bg-indigo-50 text-indigo-600',
            border: 'border-indigo-100',
            action: () => setView('STUDENT'),
          },
          {
            icon: Users,
            label: 'Staff Attendance',
            desc: 'Mark & manage daily staff attendance',
            color: 'bg-cyan-50 text-cyan-600',
            border: 'border-cyan-100',
            action: () => setView('STAFF'),
          },
        ].map(({ icon: Icon, label, desc, color, border, action }) => (
          <button key={label} onClick={action}
            className={`w-full flex items-center gap-4 bg-white rounded-2xl border ${border} shadow-sm p-5 text-left active:scale-95 transition-transform`}>
            <div className={`w-14 h-14 rounded-2xl ${color} flex items-center justify-center shrink-0`}>
              <Icon size={28} />
            </div>
            <div className="flex-1">
              <div className="font-extrabold text-slate-900 text-base">{label}</div>
              <div className="text-[10px] font-bold text-slate-400 mt-1">{desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
