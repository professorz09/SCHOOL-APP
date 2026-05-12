// Transfer Certificate Tool — Toolsedu style.
// Generates School Leaving / TC certificates in bulk. Each cert is a
// full-page A4 with serif typography and dotted-line fill-ins.

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

export const TransferCertificateTool: React.FC<Props> = ({ onBack, students, schoolInfo }) => {
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [schoolName, setSchoolName] = useState(schoolInfo?.name || 'School Name');
  const [schoolAddress, setSchoolAddress] = useState(schoolInfo?.address || '');
  const [affiliationNo, setAffiliationNo] = useState(schoolInfo?.affiliationBoard || 'Affiliation No: ');

  React.useEffect(() => {
    if (schoolInfo?.name) setSchoolName(schoolInfo.name);
    if (schoolInfo?.address) setSchoolAddress(schoolInfo.address);
  }, [schoolInfo]);

  const fields = [
    { key: 'name', label: 'Student Name' },
    { key: 'fatherName', label: "Father's Name" },
    { key: 'motherName', label: "Mother's Name" },
    { key: 'dob', label: 'Date of Birth' },
    { key: 'admissionDate', label: 'Date of Admission' },
    { key: 'classAdmitted', label: 'Class Admitted' },
    { key: 'classLeft', label: 'Class Left' },
    { key: 'leavingDate', label: 'Date of Leaving' },
    { key: 'tcReason', label: 'Reason for Leaving' },
    { key: 'result', label: 'Last Exam Result' },
    { key: 'character', label: 'Conduct/Character' },
  ];

  // Supabase returns either "YYYY-MM-DD" or full ISO timestamp.
  // Slice first 10 chars first so the dash-split doesn't pick up the
  // time portion's separators.
  const fmtDate = (iso: string): string => {
    if (!iso || iso.length < 10) return '';
    const [y, m, d] = iso.slice(0, 10).split('-');
    if (!y || !m || !d) return '';
    return `${d}-${m}-${y}`;
  };

  const mapStudent = (s: Student): Record<string, unknown> => ({
    name: s.name,
    fatherName: s.fatherName || '',
    motherName: s.motherName || '',
    dob: fmtDate(s.dob),
    admissionDate: fmtDate(s.admissionDate),
    classAdmitted: '',
    classLeft: `${s.className}-${s.section}`,
    leavingDate: '',
    tcReason: '',
    result: 'Pass',
    character: 'Good',
  });

  return (
    <ToolShell
      title="Transfer Certificate"
      subtitle="School Leaving / TC certificates in bulk"
      onBack={onBack}
      hasData={data.length > 0}
      previewLabel={data.length > 0 ? <span className="ml-1 text-[10px] font-bold opacity-70">({data.length})</span> : null}
      filename="transfer_certificates.pdf"
      printTargetId="print-area-tc"
      edit={(
        <>
          <ToolCard title="School Details">
            <ToolField label="School Name" value={schoolName} onChange={setSchoolName} />
            <ToolField label="School Address" value={schoolAddress} onChange={setSchoolAddress} />
            <ToolField label="Affiliation / Recognization" value={affiliationNo} onChange={setAffiliationNo} />
          </ToolCard>
          <DataInputSection data={data} setData={setData} fields={fields}
            title="Student Data" students={students} mapStudent={mapStudent} />
        </>
      )}
      preview={(
        <div className="overflow-x-auto bg-white border border-slate-200 shadow-sm p-2 md:p-3 rounded-xl">
          <div className="min-w-[8in]">
            <TC row={data[0] ?? {}} schoolName={schoolName} schoolAddress={schoolAddress} affiliationNo={affiliationNo} counter={1} />
          </div>
          {data.length > 1 && (
            <p className="text-center text-slate-500 mt-3 text-xs font-medium">
              Showing first of {data.length} certificates · download to get all.
            </p>
          )}
        </div>
      )}
      printNode={(
        <div id="print-area-tc" className="flex flex-col pb-10 bg-white w-full max-w-[794px] mx-auto min-h-[1122px]">
          {data.map((row, i) => (
            <TC key={i} row={row} schoolName={schoolName} schoolAddress={schoolAddress} affiliationNo={affiliationNo} counter={i + 1} />
          ))}
        </div>
      )}
    />
  );
};

const TC: React.FC<{ row: Record<string, unknown>; schoolName: string; schoolAddress: string; affiliationNo: string; counter: number }> = ({ row, schoolName, schoolAddress, affiliationNo, counter }) => {
  const tcNo = String(row.tcNo ?? `TC/${new Date().getFullYear()}/${1000 + counter}`);
  const r = (key: string): string => String(row[key] ?? '');

  return (
    <div className="w-[794px] mx-auto bg-white border-[12px] border-double border-slate-900 p-10 min-h-[1122px] avoid-break flex flex-col relative print:border-none print:shadow-none print:w-full print:p-8 print:mx-0">
      <div className="text-center font-serif border-b border-slate-800 pb-6 mb-8 mt-4">
        <h3 className="text-sm uppercase tracking-widest text-slate-500 font-semibold mb-2">{affiliationNo}</h3>
        <h1 className="text-4xl font-extrabold text-slate-900 uppercase tracking-wider mb-2">{schoolName}</h1>
        <p className="text-lg text-slate-700 italic">{schoolAddress}</p>
      </div>
      <div className="text-center mb-10 relative">
        <span className="bg-slate-900 text-white px-8 py-2 text-2xl font-bold uppercase tracking-[0.3em] font-serif inline-block">Transfer Certificate</span>
      </div>
      <div className="flex justify-between font-semibold text-slate-800 mb-10 text-sm">
        <div>TC No: {tcNo}</div>
        <div>Date of Issue: {new Date().toLocaleDateString('en-GB')}</div>
      </div>
      <div className="flex-1 font-serif text-lg leading-10 text-slate-900">
        <p>This is to certify that <strong>{r('name') || '_________________________'}</strong></p>
        <Row pre="Son/Daughter of">Mr. {r('fatherName') || '__________'} &amp; Mrs. {r('motherName') || '__________'}</Row>
        <Row pre="was admitted to this school on" post={['in Class', r('classAdmitted') || '_________']}>{r('admissionDate') || '__________________'}</Row>
        <Row pre="and left the school on" post={['from Class', r('classLeft') || '_________']}>{r('leavingDate') || '__________________'}</Row>
        <Row pre="According to the Admission Register, the Date of Birth is">{r('dob') || '__________________'}</Row>
        <Row pre="The reason for leaving the school:" extraTop>{r('tcReason') || '__________________'}</Row>
        <Row pre="Last Annual Examination Result:">{r('result') || '__________________'}</Row>
        <Row pre="Conduct and Character:">{r('character') || 'Good'}</Row>
        <p className="mt-8 italic opacity-80 text-base">We wish the student all the best for future endeavors.</p>
      </div>
      <div className="flex justify-between items-end pb-12 mt-20 px-8 text-base font-bold text-slate-800 uppercase tracking-widest font-serif">
        <div className="border-t-2 border-slate-800 w-48 text-center pt-2">Class Teacher</div>
        <div className="border-t-2 border-slate-800 w-48 text-center pt-2">Principal</div>
      </div>
    </div>
  );
};

const Row: React.FC<{ pre: string; post?: [string, string]; children: React.ReactNode; extraTop?: boolean }> = ({ pre, post, children, extraTop }) => (
  <div className={`flex w-full mb-2 ${extraTop ? 'mt-8' : ''}`}>
    <div className="whitespace-nowrap mr-2">{pre}</div>
    <div className="border-b border-dashed border-slate-500 flex-1 px-4 font-bold">{children}</div>
    {post && (
      <>
        <div className="whitespace-nowrap mx-2">{post[0]}</div>
        <div className="border-b border-dashed border-slate-500 min-w-[100px] px-4 font-bold text-center">{post[1]}</div>
      </>
    )}
  </div>
);
