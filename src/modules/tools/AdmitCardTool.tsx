// Admit Card Tool — Toolsedu style, school-data aware.
// Bulk admit card generation. Inputs: school name + exam session +
// timing at top, students table below (Excel/manual/load-from-class).
// Renders A4-sized admit cards into a `.print-only` flex column.

import React, { useState } from 'react';
import { DataInputSection } from './components/DataInputSection';
import { ToolShell, ToolCard, ToolField } from './components/ToolShell';
import type { Student } from '@/modules/students/student.types';
import type { SchoolInfo } from '@/shared/utils/schoolInfo.service';

interface Props {
  onBack: () => void;
  students: Student[];
  schoolInfo: SchoolInfo | null;
}

interface Row {
  name: string;
  class: string;
  roll: string;
  subjects: string;
  dates: string;
}

export const AdmitCardTool: React.FC<Props> = ({ onBack, students, schoolInfo }) => {
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [schoolName, setSchoolName] = useState(schoolInfo?.name || 'School Name');
  const [schoolAddress, setSchoolAddress] = useState(() => {
    if (!schoolInfo) return '';
    return [schoolInfo.address, schoolInfo.city, schoolInfo.state, schoolInfo.pin]
      .filter(Boolean).join(', ');
  });
  const [examSession, setExamSession] = useState('Final Examination 2026-2027');
  const [examTime, setExamTime] = useState('09:00 AM - 12:00 PM');

  React.useEffect(() => {
    if (schoolInfo?.name) setSchoolName(schoolInfo.name);
    if (schoolInfo) {
      const addr = [schoolInfo.address, schoolInfo.city, schoolInfo.state, schoolInfo.pin]
        .filter(Boolean).join(', ');
      if (addr) setSchoolAddress(addr);
    }
  }, [schoolInfo]);

  const fields = [
    { key: 'name', label: 'Student Name' },
    { key: 'class', label: 'Class/Grade' },
    { key: 'roll', label: 'Roll Number' },
    { key: 'subjects', label: 'Subjects (comma separated)', placeholder: 'Math, Science, English' },
    { key: 'dates', label: 'Dates (comma separated)', placeholder: '12-May, 14-May, 16-May' },
  ];

  const mapStudent = (s: Student): Record<string, unknown> => ({
    name: s.name,
    class: `${s.className}-${s.section}`,
    roll: s.rollNo || '',
    subjects: '',
    dates: '',
  });

  return (
    <ToolShell
      title="Admit Cards"
      subtitle="Generate examination admit cards"
      onBack={onBack}
      hasData={data.length > 0}
      previewLabel={data.length > 0 ? <span className="ml-1 text-[10px] font-bold opacity-70">({data.length})</span> : null}
      filename="admit_cards.pdf"
      printTargetId="print-area-admitcards"
      edit={(
        <>
          <ToolCard title="Exam Details">
            <ToolField label="School Name" value={schoolName} onChange={setSchoolName} />
            <ToolField label="School Address" value={schoolAddress} onChange={setSchoolAddress} />
            <ToolField label="Exam Name & Session" value={examSession} onChange={setExamSession} />
            <ToolField label="Standard Timing" value={examTime} onChange={setExamTime} />
          </ToolCard>
          <DataInputSection data={data} setData={setData} fields={fields}
            title="Candidate" students={students} mapStudent={mapStudent} />
        </>
      )}
      preview={(
        <div className="overflow-x-auto bg-white border border-slate-200 shadow-sm p-2 md:p-3 rounded-xl">
          <div className="min-w-[8in]">
            <AdmitCard row={(data[0] ?? {}) as Partial<Row>} schoolName={schoolName}
              schoolAddress={schoolAddress} examSession={examSession} examTime={examTime} />
          </div>
          {data.length > 1 && (
            <p className="text-center text-slate-500 mt-3 text-xs font-medium">
              Showing first of {data.length} cards · download to get all.
            </p>
          )}
        </div>
      )}
      printNode={(
        <div id="print-area-admitcards"
          className="bg-white"
          style={{ width: '794px' }}>
          {data.map((row, i) => (
            <AdmitCard key={i} row={row as Partial<Row>} schoolName={schoolName}
              schoolAddress={schoolAddress} examSession={examSession} examTime={examTime} />
          ))}
        </div>
      )}
    />
  );
};

const AdmitCard: React.FC<{ row: Partial<Row>; schoolName: string; schoolAddress: string; examSession: string; examTime: string }> = ({ row, schoolName, schoolAddress, examSession, examTime }) => {
  const subjects = (row.subjects || '').split(',').map(s => s.trim()).filter(Boolean);
  const dates = (row.dates || '').split(',').map(d => d.trim()).filter(Boolean);
  const length = Math.max(subjects.length, dates.length, 3);
  const rows = Array.from({ length }).map((_, i) => ({
    subject: subjects[i] || '-',
    date: dates[i] || '-',
  }));

  return (
    <div className="bg-white avoid-break flex flex-col"
      style={{ width: '794px', height: '1122px', padding: '40px 48px', overflow: 'hidden', boxSizing: 'border-box' }}>
      {/* Header */}
      <div className="text-center border-b-2 border-slate-900 pb-4 mb-6">
        <h2 className="text-3xl font-extrabold text-slate-900 uppercase tracking-widest">{schoolName}</h2>
        {schoolAddress && (
          <p className="text-xs text-slate-600 italic mt-1.5">{schoolAddress}</p>
        )}
        <h3 className="text-base font-semibold text-slate-700 mt-2">{examSession}</h3>
        <div className="mt-3 inline-block bg-slate-900 text-white px-6 py-1 text-sm font-bold uppercase tracking-[0.3em]">
          Admit Card
        </div>
      </div>

      {/* Candidate info */}
      <div className="flex gap-6 mb-6">
        <div className="flex-1 grid grid-cols-1 gap-2.5 text-sm">
          <Field label="Candidate Name" val={row.name || '-'} bold />
          <Field label="Class / Section" val={row.class || '-'} />
          <Field label="Roll Number" val={row.roll || '-'} bold />
          <Field label="Reporting Time" val={examTime} />
        </div>
        <div className="w-32 h-40 border-2 border-dashed border-slate-400 shrink-0 flex items-center justify-center text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 text-center p-2 leading-tight">
          Paste<br />Recent<br />Photograph
        </div>
      </div>

      {/* Schedule table */}
      <div className="mb-6">
        <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">Examination Schedule</h4>
        <table className="w-full text-sm text-left border-collapse border-2 border-slate-800">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-800 px-3 py-2 font-bold text-slate-900 uppercase tracking-wider text-xs">Date</th>
              <th className="border border-slate-800 px-3 py-2 font-bold text-slate-900 uppercase tracking-wider text-xs">Subject</th>
              <th className="border border-slate-800 px-3 py-2 font-bold text-slate-900 uppercase tracking-wider text-xs w-44">Invigilator Sign</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="even:bg-slate-50">
                <td className="border border-slate-800 px-3 py-2.5 font-medium">{r.date}</td>
                <td className="border border-slate-800 px-3 py-2.5 font-medium">{r.subject}</td>
                <td className="border border-slate-800 px-3 py-2.5"></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Instructions */}
      <div className="mb-4">
        <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1.5">Instructions</h4>
        <ul className="text-xs text-slate-700 space-y-1 list-decimal pl-4">
          <li>Report 30 minutes before the scheduled time.</li>
          <li>Bring this admit card and a valid ID proof to every exam.</li>
          <li>Mobile phones, smartwatches and other electronic devices are not allowed.</li>
          <li>Use only blue / black pen for the answer sheet.</li>
          <li>Loss of admit card must be reported to the school office immediately.</li>
        </ul>
      </div>

      {/* Spacer + signatures */}
      <div className="flex-1 min-h-[24px]"></div>
      <div className="flex justify-between items-end pt-4 text-xs font-bold text-slate-700 uppercase tracking-[0.15em]">
        <div className="border-t-2 border-slate-800 w-48 text-center pt-1.5">Student Signature</div>
        <div className="border-t-2 border-slate-800 w-48 text-center pt-1.5">Principal Signature</div>
      </div>
    </div>
  );
};

const Field: React.FC<{ label: string; val: string; bold?: boolean }> = ({ label, val, bold }) => (
  <div className="grid grid-cols-[140px_1fr] border-b border-slate-200 pb-1.5">
    <span className="font-bold text-slate-500 uppercase text-[10px] tracking-[0.1em] self-end pb-0.5">{label}</span>
    <span className={`text-slate-900 ${bold ? 'font-bold uppercase text-base' : 'font-semibold text-sm'}`}>{val}</span>
  </div>
);
