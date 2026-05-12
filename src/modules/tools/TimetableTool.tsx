// Timetable Tool — exam/class date-sheet generator. Toolsedu style.
// Simple inline schedule editor (no Excel needed). Renders a single
// A4 date-sheet page with serif typography and tabular schedule.

import React, { useState } from 'react';
import { ToolShell, ToolCard, ToolField } from './components/ToolShell';
import { Plus, Trash2 } from 'lucide-react';
import type { SchoolInfo } from '@/shared/utils/schoolInfo.service';

interface Props {
  onBack: () => void;
  schoolInfo: SchoolInfo | null;
}

interface Slot {
  id: string;
  date: string;
  day: string;
  subject: string;
}

export const TimetableTool: React.FC<Props> = ({ onBack, schoolInfo }) => {
  const [schoolName, setSchoolName] = useState(schoolInfo?.name || 'School Name');
  const [examName, setExamName] = useState('Half Yearly Examination 2024-25');
  const [classes, setClasses] = useState('Class IX - XII');
  const [timing, setTiming] = useState('09:00 AM to 12:15 PM');
  const [schedule, setSchedule] = useState<Slot[]>([
    { id: '1', date: '12-10-2024', day: 'Monday', subject: 'Mathematics' },
    { id: '2', date: '14-10-2024', day: 'Wednesday', subject: 'Science' },
    { id: '3', date: '16-10-2024', day: 'Friday', subject: 'English' },
  ]);

  React.useEffect(() => { if (schoolInfo?.name) setSchoolName(schoolInfo.name); }, [schoolInfo]);

  const addRow = () => setSchedule([...schedule, { id: Date.now().toString(), date: '', day: '', subject: '' }]);
  const removeRow = (id: string) => setSchedule(schedule.filter(s => s.id !== id));
  const update = (id: string, field: keyof Slot, value: string) =>
    setSchedule(schedule.map(s => s.id === id ? { ...s, [field]: value } : s));

  return (
    <ToolShell
      title="Timetable"
      subtitle="Examination or class timetables"
      onBack={onBack}
      hasData={schedule.length > 0}
      filename="timetable.pdf"
      printTargetId="print-area-timetable"
      edit={(
        <>
          <ToolCard title="Header Details">
            <ToolField label="School Name" value={schoolName} onChange={setSchoolName} />
            <ToolField label="Exam / Event Name" value={examName} onChange={setExamName} />
            <div className="grid grid-cols-2 gap-3">
              <ToolField label="Classes" value={classes} onChange={setClasses} />
              <ToolField label="Timing" value={timing} onChange={setTiming} />
            </div>
          </ToolCard>

          <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Schedule</h3>
              <button onClick={addRow}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-900 text-white rounded-lg text-[10px] font-bold uppercase tracking-widest active:scale-95 transition-all">
                <Plus size={12} /> Add
              </button>
            </div>
            {schedule.length === 0 && (
              <p className="text-center text-slate-400 font-medium text-sm py-4">No entries yet.</p>
            )}
            {schedule.map((item, i) => (
              <div key={item.id} className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">#{i + 1}</span>
                  <button onClick={() => removeRow(item.id)}
                    className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors">
                    <Trash2 size={13} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input type="text" placeholder="Date" value={item.date} onChange={e => update(item.id, 'date', e.target.value)}
                    className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  <input type="text" placeholder="Day" value={item.day} onChange={e => update(item.id, 'day', e.target.value)}
                    className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <input type="text" placeholder="Subject / details" value={item.subject} onChange={e => update(item.id, 'subject', e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            ))}
          </div>
        </>
      )}
      preview={(
        <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-3 md:p-4 overflow-x-auto">
          <div className="min-w-[700px]">
            <TimetableView schoolName={schoolName} examName={examName} classes={classes} timing={timing} schedule={schedule} />
          </div>
        </div>
      )}
      printNode={(
        <div id="print-area-timetable" className="bg-white mx-auto w-[794px] min-h-[1122px]">
          <TimetableView schoolName={schoolName} examName={examName} classes={classes} timing={timing} schedule={schedule} />
        </div>
      )}
    />
  );
};

const TimetableView: React.FC<{ schoolName: string; examName: string; classes: string; timing: string; schedule: Slot[] }> = ({ schoolName, examName, classes, timing, schedule }) => (
  <div className="w-full max-w-4xl mx-auto p-10 bg-white font-serif avoid-break text-slate-900 min-h-[11in] flex flex-col pt-16">
    <div className="text-center pb-6 mb-8 border-b-[3px] border-slate-900">
      <h1 className="text-4xl font-extrabold uppercase tracking-wider mb-3 leading-tight">{schoolName}</h1>
      <h2 className="text-2xl font-bold mb-1 tracking-wide">{examName}</h2>
      <h3 className="text-xl font-bold text-slate-700 italic">Date Sheet</h3>
    </div>
    <div className="flex justify-between items-end mb-8 font-bold uppercase tracking-wide text-sm border-b-[1.5px] border-slate-800 pb-3">
      <div><span className="text-slate-500 font-semibold underline underline-offset-4 mr-2">Classes:</span> {classes}</div>
      <div><span className="text-slate-500 font-semibold underline underline-offset-4 mr-2">Exam Timing:</span> {timing}</div>
    </div>
    <table className="w-full border-collapse border-[3px] border-slate-900">
      <thead>
        <tr className="bg-slate-100 border-b-[3px] border-slate-900 text-lg uppercase tracking-wider">
          <th className="border-[2px] border-slate-800 px-6 py-4 text-left w-1/4">Date</th>
          <th className="border-[2px] border-slate-800 px-6 py-4 text-left w-1/4">Day</th>
          <th className="border-[2px] border-slate-800 px-6 py-4 text-left w-1/2">Subject</th>
        </tr>
      </thead>
      <tbody>
        {schedule.map((item, i) => (
          <tr key={i} className="even:bg-slate-50 font-medium text-lg">
            <td className="border-[2px] border-slate-800 px-6 py-4">{item.date}</td>
            <td className="border-[2px] border-slate-800 px-6 py-4">{item.day}</td>
            <td className="border-[2px] border-slate-800 px-6 py-4">{item.subject}</td>
          </tr>
        ))}
      </tbody>
    </table>
    <div className="mt-20 pt-8 flex justify-between uppercase tracking-widest text-sm font-bold items-end opacity-80 border-t border-slate-400 mix-blend-multiply">
      <div className="text-center w-64 border-t-[1.5px] border-slate-900 pt-2 border-dashed">Examination Controller</div>
      <div className="text-center w-64 border-t-[1.5px] border-slate-900 pt-2 border-dashed">Principal</div>
    </div>
  </div>
);
