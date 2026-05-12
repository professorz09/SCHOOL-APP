// Admission Form Tool — follows the same Toolsedu-style pattern as
// every other tool in this folder: ToolHeader, DataInputSection
// (class roster + manual edits), ActionButtons (print + downloadPDF),
// then a print-only render of one AdmissionFormSheet per row.

import React, { useState } from 'react';
import { DataInputSection } from './components/DataInputSection';
import { ToolShell, ToolCard, ToolField } from './components/ToolShell';
import type { Student } from '@/modules/students/student.types';
import { schoolInfoService, type SchoolInfo } from '@/shared/utils/schoolInfo.service';
import {
  AdmissionFormSheet, studentToAdmissionRow, schoolInfoToHeader,
  type AdmissionFormRow,
} from '@/shared/components/documents/AdmissionFormSheet';

interface Props {
  onBack: () => void;
  students: Student[];
  schoolInfo: SchoolInfo | null;
}

const FIELDS = [
  { key: 'name', label: 'Student Name' },
  { key: 'fatherName', label: "Father's Name" },
  { key: 'motherName', label: "Mother's Name" },
  { key: 'dob', label: 'Date of Birth' },
  { key: 'gender', label: 'Gender' },
  { key: 'bloodGroup', label: 'Blood Group' },
  { key: 'admissionNo', label: 'Admission No' },
  { key: 'admissionDate', label: 'Admission Date' },
  { key: 'classSection', label: 'Class & Section' },
  { key: 'rollNo', label: 'Roll No' },
  { key: 'fatherPhone', label: "Father's Phone" },
  { key: 'fatherOccupation', label: "Father's Occupation" },
  { key: 'motherPhone', label: "Mother's Phone" },
  { key: 'motherOccupation', label: "Mother's Occupation" },
  { key: 'address', label: 'Address' },
  { key: 'religion', label: 'Religion' },
  { key: 'category', label: 'Category' },
  { key: 'aadhaarNo', label: 'Aadhaar No' },
];

export const AdmissionFormTool: React.FC<Props> = ({ onBack, students, schoolInfo }) => {
  const header = schoolInfoToHeader(schoolInfo);
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [schoolName, setSchoolName] = useState(header.schoolName);
  const [schoolAddress, setSchoolAddress] = useState(header.schoolAddress);
  const [schoolPhone, setSchoolPhone] = useState(header.schoolPhone);
  const [schoolEmail, setSchoolEmail] = useState(header.schoolEmail);
  const [affiliation, setAffiliation] = useState(header.affiliation);

  React.useEffect(() => {
    const h = schoolInfoToHeader(schoolInfo);
    setSchoolName(h.schoolName);
    setSchoolAddress(h.schoolAddress);
    setSchoolPhone(h.schoolPhone);
    setSchoolEmail(h.schoolEmail);
    setAffiliation(h.affiliation);
  }, [schoolInfo]);

  const logoUrl = schoolInfo?.logoPath ? schoolInfoService.getAssetUrl(schoolInfo.logoPath) : '';

  const mapStudent = (s: Student): Record<string, unknown> => {
    const r = studentToAdmissionRow(s);
    return r as unknown as Record<string, unknown>;
  };

  const rowFromData = (raw: Record<string, unknown>): AdmissionFormRow => ({
    name: String(raw.name ?? ''),
    fatherName: String(raw.fatherName ?? ''),
    motherName: String(raw.motherName ?? ''),
    dob: String(raw.dob ?? ''),
    gender: String(raw.gender ?? ''),
    bloodGroup: String(raw.bloodGroup ?? ''),
    admissionNo: String(raw.admissionNo ?? ''),
    admissionDate: String(raw.admissionDate ?? ''),
    classSection: String(raw.classSection ?? ''),
    stream: String(raw.stream ?? ''),
    rollNo: String(raw.rollNo ?? ''),
    address: String(raw.address ?? ''),
    fatherPhone: String(raw.fatherPhone ?? ''),
    fatherOccupation: String(raw.fatherOccupation ?? ''),
    motherPhone: String(raw.motherPhone ?? ''),
    motherOccupation: String(raw.motherOccupation ?? ''),
    religion: String(raw.religion ?? ''),
    category: String(raw.category ?? ''),
    aadhaarNo: String(raw.aadhaarNo ?? ''),
    penNumber: String(raw.penNumber ?? ''),
    birthCertNo: String(raw.birthCertNo ?? ''),
    nationality: String(raw.nationality ?? 'Indian'),
    rte: !!raw.rte,
  });

  return (
    <ToolShell
      title="Admission Form"
      subtitle="Printable admission forms in bulk"
      onBack={onBack}
      hasData={data.length > 0}
      previewLabel={data.length > 0 ? <span className="ml-1 text-[10px] font-bold opacity-70">({data.length})</span> : null}
      filename="admission_forms.pdf"
      printTargetId="print-area-admission"
      edit={(
        <>
          <ToolCard title="School Details">
            <ToolField label="School Name" value={schoolName} onChange={setSchoolName} />
            <ToolField label="Affiliation / Board" value={affiliation} onChange={setAffiliation} />
            <ToolField label="School Address" value={schoolAddress} onChange={setSchoolAddress} />
            <div className="grid grid-cols-2 gap-3">
              <ToolField label="Phone" value={schoolPhone} onChange={setSchoolPhone} />
              <ToolField label="Email" value={schoolEmail} onChange={setSchoolEmail} />
            </div>
          </ToolCard>
          <DataInputSection data={data} setData={setData} fields={FIELDS}
            title="Student Data" students={students} mapStudent={mapStudent} />
        </>
      )}
      preview={(
        <div className="overflow-x-auto bg-white border border-slate-200 shadow-sm p-2 md:p-3 rounded-xl">
          <div className="min-w-[8in]">
            <AdmissionFormSheet row={rowFromData(data[0] ?? {})}
              schoolName={schoolName} schoolAddress={schoolAddress}
              schoolPhone={schoolPhone} schoolEmail={schoolEmail}
              affiliation={affiliation} logoUrl={logoUrl} />
          </div>
          {data.length > 1 && (
            <p className="text-center text-slate-500 mt-3 text-xs font-medium">
              Showing first of {data.length} forms · download to get all.
            </p>
          )}
        </div>
      )}
      printNode={(
        <div id="print-area-admission" className="flex flex-col pb-10 bg-white w-full max-w-[794px] mx-auto">
          {data.map((raw, i) => (
            <AdmissionFormSheet key={i} row={rowFromData(raw)}
              schoolName={schoolName} schoolAddress={schoolAddress}
              schoolPhone={schoolPhone} schoolEmail={schoolEmail}
              affiliation={affiliation} logoUrl={logoUrl} />
          ))}
        </div>
      )}
    />
  );
};
