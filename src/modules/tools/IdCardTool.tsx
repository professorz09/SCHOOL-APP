// ID Card Tool — Toolsedu style, school-data aware.
// Lets the principal load students from a class roster (one tap) OR
// upload Excel / type manually. Renders 2-up vertical/horizontal cards
// into a `.print-only` A4 grid for browser print + PDF download.

import React, { useEffect, useState } from 'react';
import { DataInputSection } from './components/DataInputSection';
import { ToolShell, ToolCard, ToolLabel } from './components/ToolShell';
import type { Student } from '@/modules/students/student.types';
import type { SchoolInfo } from '@/shared/utils/schoolInfo.service';
import { schoolInfoService } from '@/shared/utils/schoolInfo.service';
import { studentService } from '@/modules/students/student.service';
import { storageService } from '@/shared/utils/storage.service';

interface Props {
  onBack: () => void;
  students: Student[];
  schoolInfo: SchoolInfo | null;
}

interface Row {
  name: string;
  fatherName: string;
  class: string;
  dob: string;
  bloodGroup: string;
  photoUrl: string;
}

export const IdCardTool: React.FC<Props> = ({ onBack, students, schoolInfo }) => {
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [design, setDesign] = useState<'vertical' | 'horizontal'>('vertical');
  const [schoolName, setSchoolName] = useState(schoolInfo?.name || 'School Name');
  // Resolved signed URLs for student photos. The students table column
  // `photo` is usually empty — actual photos live in the private
  // `student-documents` bucket with type='PHOTO'. We fetch each
  // student's photo path + sign it once here, then patch the URL into
  // the data rows so the ID card preview / PDF can render <img>.
  const [photoUrlMap, setPhotoUrlMap] = useState<Map<string, string>>(new Map());

  React.useEffect(() => { if (schoolInfo?.name) setSchoolName(schoolInfo.name); }, [schoolInfo]);

  const logoUrl = schoolInfo?.logoPath ? schoolInfoService.getAssetUrl(schoolInfo.logoPath) : '';

  // Pre-fetch photos for all students once (capped to active class
  // size). 1-hour signed URLs give plenty of time for both preview
  // and PDF generation without re-signing per row.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const map = new Map<string, string>();
      // Cap concurrency so a large school doesn't fire 500+ signed-URL
      // requests at once. Process in chunks of 8.
      const chunkSize = 8;
      for (let i = 0; i < students.length; i += chunkSize) {
        if (cancelled) return;
        const chunk = students.slice(i, i + chunkSize);
        await Promise.all(chunk.map(async (s) => {
          try {
            const docs = await studentService.listDocuments(s.id);
            const photo = docs.find(d => d.type === 'PHOTO');
            if (!photo) return;
            const url = await storageService.getStudentDocumentSignedUrl(photo.storagePath, 3600);
            if (url) map.set(s.id, url);
          } catch { /* skip silently — fallback to initials */ }
        }));
      }
      if (!cancelled) setPhotoUrlMap(map);
    })();
    return () => { cancelled = true; };
  }, [students]);

  const fields = [
    { key: 'name', label: 'Name' },
    { key: 'fatherName', label: "Father's Name" },
    { key: 'class', label: 'Class' },
    { key: 'dob', label: 'DOB' },
    { key: 'bloodGroup', label: 'Blood' },
    { key: 'photoUrl', label: 'Photo', placeholder: 'URL or path' },
  ];

  // Format DOB as DD-MM-YYYY for the printed card. Supabase returns
  // either "YYYY-MM-DD" or full ISO timestamp "YYYY-MM-DDTHH:mm:ss".
  // Slicing first 10 chars handles both. The earlier `split('-')`
  // version was producing garbage day part because the timestamp had
  // additional '-' / ':' separators after the date.
  const fmtDob = (iso: string): string => {
    if (!iso || iso.length < 10) return '';
    const [y, m, d] = iso.slice(0, 10).split('-');
    if (!y || !m || !d) return '';
    return `${d}-${m}-${y}`;
  };

  const mapStudent = (s: Student): Record<string, unknown> => ({
    name: s.name,
    fatherName: s.fatherName || '',
    class: `${s.className}-${s.section}`,
    dob: fmtDob(s.dob),
    bloodGroup: s.bloodGroup || '',
    // Photo resolution order: pre-fetched signed URL (from
    // student-documents bucket) > legacy `students.photo` column >
    // empty (falls through to initials avatar in IdCard render).
    photoUrl: photoUrlMap.get(s.id) || s.photo || '',
  });

  return (
    <ToolShell
      title="ID Cards"
      subtitle="Design and print student ID cards"
      onBack={onBack}
      hasData={data.length > 0}
      previewLabel={data.length > 0 ? <span className="ml-1 text-[10px] font-bold opacity-70">({data.length})</span> : null}
      filename="id_cards.pdf"
      printTargetId="print-area-idcards"
      edit={(
        <>
          <ToolCard title="Card Setup">
            <div>
              <ToolLabel>School Name</ToolLabel>
              <input type="text" value={schoolName} onChange={e => setSchoolName(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div className="flex items-center gap-3 py-1">
              <div className="w-12 h-12 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
                {logoUrl ? <img src={logoUrl} alt="School logo" crossOrigin="anonymous" className="w-full h-full object-contain" />
                  : <span className="text-[9px] font-bold text-slate-400 text-center px-1">No logo</span>}
              </div>
              <p className="text-[11px] font-medium text-slate-500 leading-snug">
                {logoUrl ? 'Logo loaded from school branding.' : 'Upload in Settings → School Info to use a logo.'}
              </p>
            </div>
            <div>
              <ToolLabel>Card Design</ToolLabel>
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
                {(['vertical', 'horizontal'] as const).map(d => (
                  <button key={d} type="button" onClick={() => setDesign(d)}
                    className={`py-2 rounded-md text-[11px] font-bold uppercase tracking-widest transition-all ${
                      design === d ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                    }`}>
                    {d === 'vertical' ? 'Vertical' : 'Horizontal'}
                  </button>
                ))}
              </div>
            </div>
          </ToolCard>
          <DataInputSection data={data} setData={setData} fields={fields}
            title="Students" students={students} mapStudent={mapStudent} />
        </>
      )}
      preview={(
        <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-3 md:p-4">
          <div className="flex flex-wrap gap-4 justify-center">
            {data.slice(0, 6).map((row, i) => (
              <IdCard key={i} row={row as Partial<Row>} design={design} schoolName={schoolName} logoUrl={logoUrl} />
            ))}
          </div>
          {data.length > 6 && (
            <p className="text-center text-slate-500 mt-4 text-xs font-medium">
              Showing 6 of {data.length} · download to get all.
            </p>
          )}
        </div>
      )}
      printNode={(
        <div id="print-area-idcards"
          className="flex flex-wrap justify-center content-start gap-4 p-6 bg-white w-full max-w-[794px] mx-auto min-h-[1122px]">
          {data.map((row, i) => (
            <IdCard key={i} row={row as Partial<Row>} design={design} schoolName={schoolName} logoUrl={logoUrl} />
          ))}
        </div>
      )}
    />
  );
};

const IdCard: React.FC<{ row: Partial<Row>; design: 'vertical' | 'horizontal'; schoolName: string; logoUrl: string }> = ({ row, design, schoolName, logoUrl }) => {
  const photo = row.photoUrl || '';
  const initials = (row.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  if (design === 'vertical') {
    return (
      <div className="w-[2.125in] h-[3.375in] bg-white border border-gray-300 shadow-sm rounded-lg overflow-hidden flex flex-col avoid-break print:shadow-none">
        <div className="bg-blue-600 text-white text-center py-3 px-2 flex flex-col items-center">
          {logoUrl && <img src={logoUrl} alt="Logo" crossOrigin="anonymous" className="w-8 h-8 object-contain bg-white rounded-full p-0.5 mb-1" />}
          <h3 className="text-[10px] font-bold leading-tight">{schoolName}</h3>
        </div>
        <div className="flex-1 flex flex-col items-center pt-4 px-3 pb-2 relative">
          <div className="w-20 h-20 bg-gray-200 rounded-full overflow-hidden border-2 border-white shadow-sm mb-2 z-10 flex items-center justify-center">
            {photo ? (
              <img src={photo} alt="Student" crossOrigin="anonymous" className="w-full h-full object-cover" />
            ) : (
              <span className="text-2xl font-black text-blue-600">{initials}</span>
            )}
          </div>
          <h4 className="text-sm font-bold text-gray-800 text-center mb-1">{row.name || 'Student Name'}</h4>
          <span className="text-[10px] uppercase font-semibold text-blue-600 mb-3 px-2 py-0.5 bg-blue-50 rounded-full">Student</span>
          <div className="w-full text-[9px] space-y-1.5 text-gray-700">
            <Detail label="Father" val={row.fatherName || '-'} />
            <Detail label="Class" val={row.class || '-'} />
            <Detail label="DOB" val={row.dob || '-'} />
            <Detail label="B.G" val={row.bloodGroup || '-'} red />
          </div>
        </div>
        <div className="h-6 bg-gray-900 text-white flex items-center justify-center text-[8px] tracking-wider">
          STUDENT IDENTITY CARD
        </div>
      </div>
    );
  }

  return (
    <div className="w-[3.375in] h-[2.125in] bg-white border border-gray-300 shadow-sm rounded-lg overflow-hidden flex flex-col avoid-break print:shadow-none">
      <div className="flex border-b border-gray-200">
        <div className="p-2 w-16 flex items-center justify-center border-r border-gray-200">
          {logoUrl && <img src={logoUrl} alt="Logo" crossOrigin="anonymous" className="w-10 h-10 object-contain rounded-md" />}
        </div>
        <div className="flex-1 flex flex-col justify-center px-4 bg-gray-50">
          <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wide">{schoolName}</h3>
          <p className="text-[9px] text-gray-500 uppercase tracking-widest font-semibold">Student Identity Card</p>
        </div>
      </div>
      <div className="flex-1 flex p-3 gap-4">
        <div className="w-20 pl-1 shrink-0">
          <div className="w-full aspect-[3/4] bg-gray-200 rounded border border-gray-200 shadow-sm flex items-center justify-center overflow-hidden">
            {photo ? <img src={photo} alt="Student" crossOrigin="anonymous" className="w-full h-full object-cover" />
                   : <span className="text-xl font-black text-blue-600">{initials}</span>}
          </div>
        </div>
        <div className="flex-1 flex flex-col justify-center">
          <h4 className="text-base font-bold text-gray-800 leading-none mb-3">{row.name || 'Student Name'}</h4>
          <div className="space-y-1.5 text-[10px] text-gray-600">
            <FlatRow label="Father" val={row.fatherName || '-'} />
            <FlatRow label="Class" val={row.class || '-'} />
            <FlatRow label="DOB" val={row.dob || '-'} />
            <FlatRow label="Blood" val={row.bloodGroup || '-'} />
          </div>
        </div>
      </div>
    </div>
  );
};

const Detail: React.FC<{ label: string; val: string; red?: boolean }> = ({ label, val, red }) => (
  <div className="grid grid-cols-[30px_1fr] border-b border-gray-100 pb-1">
    <span className="font-semibold text-gray-500">{label}:</span>
    <span className={`font-medium ${red ? 'text-red-600' : 'text-gray-900'}`}>{val}</span>
  </div>
);

const FlatRow: React.FC<{ label: string; val: string }> = ({ label, val }) => (
  <div className="flex"><span className="w-14 font-medium">{label}:</span><span className="font-semibold text-gray-900">{val}</span></div>
);
