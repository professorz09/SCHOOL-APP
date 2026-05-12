// AdmissionFormSheet — fresh, Tailwind-only admission form layout.
// Replaces the bespoke CSS-string version. One A4 sheet per student;
// the parent print-only container wraps multiple via .avoid-break so
// the shared downloadPDF pipeline can slice them into multi-page PDFs.

import React from 'react';
import type { SchoolInfo } from '@/shared/utils/schoolInfo.service';

export interface AdmissionFormRow {
  name: string;
  fatherName: string;
  motherName: string;
  dob: string;
  gender: string;
  bloodGroup: string;
  admissionNo: string;
  admissionDate: string;
  classSection: string;
  stream: string;
  rollNo: string;
  address: string;
  fatherPhone: string;
  fatherOccupation: string;
  motherPhone: string;
  motherOccupation: string;
  religion: string;
  category: string;
  aadhaarNo: string;
  penNumber: string;
  birthCertNo: string;
  nationality: string;
  rte: boolean;
}

const REQUIRED_DOCS = [
  'Birth Certificate',
  'Aadhaar Card (Student)',
  'Aadhaar Card (Parent)',
  'Previous TC',
  'Previous Marksheet',
  'Caste Certificate',
  'Income Certificate',
  'Photographs (4 copies)',
  'Address Proof',
  'Vaccination Record',
];

interface Props {
  row: AdmissionFormRow;
  schoolName: string;
  schoolAddress: string;
  schoolPhone: string;
  schoolEmail: string;
  affiliation: string;
  logoUrl?: string;
}

const Field: React.FC<{ label: string; value: string; wide?: boolean }> = ({ label, value, wide }) => (
  <div className={wide ? 'col-span-2' : ''}>
    <div className="text-[8px] font-bold uppercase tracking-[0.1em] text-slate-500 leading-tight">{label}</div>
    <div className="text-[11px] font-semibold text-slate-900 border-b border-slate-300 min-h-[15px] leading-snug">
      {value || ' '}
    </div>
  </div>
);

const SectionHead: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex items-center gap-2 mt-2 mb-1">
    <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-700 bg-slate-100 border border-slate-300 px-2 py-0 leading-tight">
      {children}
    </span>
    <span className="flex-1 h-px bg-slate-300"></span>
  </div>
);

export const AdmissionFormSheet: React.FC<Props> = ({
  row, schoolName, schoolAddress, schoolPhone, schoolEmail, affiliation, logoUrl,
}) => {
  return (
    <div className="w-[794px] mx-auto bg-white avoid-break flex flex-col font-sans text-slate-900"
      style={{ height: '1122px', padding: '20px 28px', overflow: 'hidden' }}>

      {/* Header */}
      <div className="border-2 border-slate-900 px-3 py-2 flex items-center gap-3">
        {logoUrl && (
          <img src={logoUrl} alt="" crossOrigin="anonymous"
            className="w-12 h-12 object-contain shrink-0" />
        )}
        <div className="flex-1 text-center">
          <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">{affiliation}</div>
          <div className="text-[18px] font-black uppercase tracking-wider leading-tight">{schoolName}</div>
          <div className="text-[9px] font-medium text-slate-600 italic">{schoolAddress}</div>
          <div className="text-[9px] font-medium text-slate-600">
            {schoolPhone && <>Phone: {schoolPhone}</>}
            {schoolPhone && schoolEmail && ' · '}
            {schoolEmail && <>Email: {schoolEmail}</>}
          </div>
        </div>
      </div>

      {/* Title strip */}
      <div className="mt-2 bg-slate-900 text-white text-center py-1">
        <div className="text-[11px] font-bold uppercase tracking-[0.3em]">Student Admission Form</div>
      </div>

      {/* Student Info */}
      <SectionHead>Student Information</SectionHead>
      <div className="flex gap-3">
        <div className="flex-1 grid grid-cols-3 gap-x-3 gap-y-1.5">
          <Field label="Student Name" value={row.name} wide />
          <Field label="Admission No" value={row.admissionNo} />
          <Field label="Date of Birth" value={row.dob} />
          <Field label="Gender" value={row.gender} />
          <Field label="Blood Group" value={row.bloodGroup} />
          <Field label="Class & Section" value={row.classSection} />
          <Field label="Stream" value={row.stream} />
          <Field label="Roll No" value={row.rollNo} />
          <Field label="Religion" value={row.religion} />
          <Field label="Category" value={row.category} />
          <Field label="Nationality" value={row.nationality} />
        </div>
        <div className="w-[95px] shrink-0">
          <div className="w-full h-[110px] border-2 border-dashed border-slate-400 flex items-center justify-center text-[8px] font-bold uppercase tracking-[0.15em] text-slate-400 text-center px-1 leading-tight">
            Affix<br/>Student<br/>Photo
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="w-3 h-3 border border-slate-700 inline-flex items-center justify-center text-[9px] font-black">
              {row.rte ? '✓' : ''}
            </span>
            <span className="text-[8px] font-bold uppercase tracking-wider">RTE</span>
          </div>
        </div>
      </div>

      {/* IDs */}
      <SectionHead>Identification</SectionHead>
      <div className="grid grid-cols-3 gap-x-3 gap-y-1.5">
        <Field label="Aadhaar Number" value={row.aadhaarNo ? `XXXX-XXXX-${row.aadhaarNo.slice(-4)}` : ''} />
        <Field label="PEN Number" value={row.penNumber} />
        <Field label="Birth Cert. No" value={row.birthCertNo} />
        <Field label="Admission Date" value={row.admissionDate} />
      </div>

      {/* Father */}
      <SectionHead>Father's Information</SectionHead>
      <div className="grid grid-cols-3 gap-x-3 gap-y-1.5">
        <Field label="Father's Name" value={row.fatherName} wide />
        <Field label="Occupation" value={row.fatherOccupation} />
        <Field label="Phone" value={row.fatherPhone} />
        <Field label="Aadhaar" value="" />
        <Field label="Email" value="" />
      </div>

      {/* Mother */}
      <SectionHead>Mother's Information</SectionHead>
      <div className="grid grid-cols-3 gap-x-3 gap-y-1.5">
        <Field label="Mother's Name" value={row.motherName} wide />
        <Field label="Occupation" value={row.motherOccupation} />
        <Field label="Phone" value={row.motherPhone} />
        <Field label="Aadhaar" value="" />
        <Field label="Email" value="" />
      </div>

      {/* Address */}
      <SectionHead>Address</SectionHead>
      <div className="grid grid-cols-1 gap-y-3">
        <Field label="Permanent Address" value={row.address} />
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          <Field label="City / District" value="" />
          <Field label="State / PIN" value="" />
        </div>
      </div>

      {/* Documents */}
      <SectionHead>Documents Submitted (Office Use)</SectionHead>
      <div className="grid grid-cols-3 gap-x-4 gap-y-0.5">
        {REQUIRED_DOCS.map(d => (
          <div key={d} className="flex items-center gap-1.5 text-[9px] font-medium text-slate-800">
            <span className="w-2.5 h-2.5 border border-slate-700 inline-block shrink-0"></span>
            <span className="truncate">{d}</span>
          </div>
        ))}
      </div>

      {/* Spacer pushes signatures + footer to the bottom of the page */}
      <div className="flex-1 min-h-[8px]"></div>

      {/* Signatures */}
      <div className="grid grid-cols-3 gap-6 pt-2">
        {['Parent / Guardian', 'Principal', 'Date'].map(label => (
          <div key={label} className="text-center">
            <div className="h-8"></div>
            <div className="border-t border-slate-700 pt-1 text-[9px] font-bold uppercase tracking-[0.15em] text-slate-700">
              {label}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-2 pt-1 border-t border-slate-200 text-center text-[8px] font-medium text-slate-400 uppercase tracking-widest">
        Computer-generated · Signatures required for validity
      </div>
    </div>
  );
};

// Helper: convert a Student row + school info into AdmissionFormRow.
// Lives next to the sheet so callers don't re-implement the mapping.
import type { Student } from '@/modules/students/student.types';
import { STREAM_CLASSES } from '@/modules/students/student.types';

const fmtDob = (iso: string): string => {
  if (!iso || iso.length < 10) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  if (!y || !m || !d) return '';
  return `${d}/${m}/${y}`;
};

export const studentToAdmissionRow = (s: Student): AdmissionFormRow => ({
  name: s.name,
  fatherName: s.fatherName || '',
  motherName: s.motherName || '',
  dob: fmtDob(s.dob),
  gender: s.gender ? s.gender.charAt(0) + s.gender.slice(1).toLowerCase() : '',
  bloodGroup: s.bloodGroup || '',
  admissionNo: s.admissionNo,
  admissionDate: fmtDob(s.admissionDate),
  classSection: `${s.className}${s.section ? `-${s.section}` : ''}`,
  stream: STREAM_CLASSES.has(s.className) ? (s.stream || '') : '',
  rollNo: s.rollNo || '',
  address: s.address || '',
  fatherPhone: s.fatherPhone || '',
  fatherOccupation: s.fatherOccupation || '',
  motherPhone: s.motherPhone || '',
  motherOccupation: s.motherOccupation || '',
  religion: s.religion || '',
  category: s.caste || '',
  aadhaarNo: s.aadhaarNo || '',
  penNumber: s.penNumber || '',
  birthCertNo: s.birthCertNo || '',
  nationality: 'Indian',
  rte: !!s.rte,
});

export const schoolInfoToHeader = (info: SchoolInfo | null) => {
  if (!info) return { schoolName: 'School Name', schoolAddress: '', schoolPhone: '', schoolEmail: '', affiliation: '' };
  const parts = [info.address, info.city, info.state, info.pin].filter(Boolean);
  return {
    schoolName: info.name || 'School Name',
    schoolAddress: parts.join(', '),
    schoolPhone: info.phone || '',
    schoolEmail: info.email || '',
    affiliation: info.affiliationBoard || '',
  };
};
