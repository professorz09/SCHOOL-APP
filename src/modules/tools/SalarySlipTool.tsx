// Salary Slip Tool — print-ready monthly salary slip per staff member.
// Loads staff from school roster, lets principal pick month + earnings /
// deductions, generates a clean slip with INR amount in words.

import React, { useState, useEffect } from 'react';
import { DataInputSection } from './components/DataInputSection';
import { ToolShell, ToolCard, ToolField } from './components/ToolShell';
import type { Student } from '@/modules/students/student.types';
import type { SchoolInfo } from '@/shared/utils/schoolInfo.service';
import { schoolInfoService } from '@/shared/utils/schoolInfo.service';
import { staffService } from '@/modules/staff/staff.service';
import { inrInWords } from '@/modules/tools/FeeReceiptTool';

interface Props {
  onBack: () => void;
  // students prop kept for ToolsManager parity, but the slip uses staff.
  students: Student[];
  schoolInfo: SchoolInfo | null;
}

interface Row {
  slipNo: string;
  month: string;
  name: string;
  role: string;
  joining: string;
  basic: string;
  hra: string;
  other: string;
  pf: string;
  tax: string;
  deductOther: string;
}

export const SalarySlipTool: React.FC<Props> = ({ onBack, schoolInfo }) => {
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [schoolName, setSchoolName] = useState(schoolInfo?.name || 'School Name');
  const [schoolAddress, setSchoolAddress] = useState(() => {
    if (!schoolInfo) return '';
    return [schoolInfo.address, schoolInfo.city, schoolInfo.state, schoolInfo.pin]
      .filter(Boolean).join(', ');
  });
  const logoUrl = schoolInfo?.logoPath ? schoolInfoService.getAssetUrl(schoolInfo.logoPath) : '';

  // The Tools section doesn't pre-load staff (school roster is students-
  // first), so fetch here. Map staff into Student-shape so we can reuse
  // DataInputSection's "Load from Class" affordance — the shape contract
  // it needs is just `{ id, name, className, section, rollNo, fatherName }`.
  // Roll No → staff role, fatherName → joining date so the form
  // populates sensibly.
  const [staffList, setStaffList] = useState<Student[]>([]);
  useEffect(() => {
    staffService.getAll().then(staff => {
      const asStudents: Student[] = staff
        .filter(s => s.status === 'ACTIVE')
        .map(s => ({
          id: s.id,
          admissionNo: '',
          name: s.name,
          className: s.role,
          section: '',
          rollNo: '',
          fatherName: s.joiningDate ?? '',
          motherName: '',
          fatherPhone: s.phone ?? '',
          totalFee: s.salary ?? 0,
          paidFee: 0,
          dueFee: 0,
          attendancePercentage: 0,
          isActive: true,
        }) as unknown as Student);
      setStaffList(asStudents);
    }).catch(() => setStaffList([]));
  }, []);

  useEffect(() => {
    if (schoolInfo?.name) setSchoolName(schoolInfo.name);
    if (schoolInfo) {
      const addr = [schoolInfo.address, schoolInfo.city, schoolInfo.state, schoolInfo.pin]
        .filter(Boolean).join(', ');
      if (addr) setSchoolAddress(addr);
    }
  }, [schoolInfo]);

  const fields = [
    { key: 'slipNo',     label: 'Slip No.', placeholder: 'SL/2026/001' },
    { key: 'month',      label: 'Month / Year', placeholder: 'May 2026' },
    { key: 'name',       label: 'Staff Name' },
    { key: 'role',       label: 'Designation' },
    { key: 'joining',    label: 'Joining Date', placeholder: 'YYYY-MM-DD' },
    { key: 'basic',      label: 'Basic Salary (₹)', placeholder: '20000' },
    { key: 'hra',        label: 'HRA / Allowance (₹)', placeholder: '0' },
    { key: 'other',      label: 'Other Earnings (₹)', placeholder: '0' },
    { key: 'pf',         label: 'PF Deduction (₹)', placeholder: '0' },
    { key: 'tax',        label: 'Tax / TDS (₹)', placeholder: '0' },
    { key: 'deductOther',label: 'Other Deductions (₹)', placeholder: '0' },
  ];

  const mapStaff = (s: Student): Record<string, unknown> => ({
    slipNo: '',
    month: new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }),
    name: s.name,
    role: s.className, // we stuffed role into className above
    joining: s.fatherName, // ditto for joining date
    basic: String(s.totalFee || ''), // ditto for salary
    hra: '',
    other: '',
    pf: '',
    tax: '',
    deductOther: '',
  });

  return (
    <ToolShell
      title="Salary Slips"
      subtitle="Monthly salary slips per staff member"
      onBack={onBack}
      hasData={data.length > 0}
      previewLabel={data.length > 0 ? <span className="ml-1 text-[10px] font-bold opacity-70">({data.length})</span> : null}
      filename="salary_slips.pdf"
      printTargetId="print-area-slips"
      edit={(
        <>
          <ToolCard title="School Header">
            <ToolField label="School Name" value={schoolName} onChange={setSchoolName} />
            <ToolField label="School Address" value={schoolAddress} onChange={setSchoolAddress} />
          </ToolCard>
          <DataInputSection data={data} setData={setData} fields={fields}
            title="Slip" students={staffList} mapStudent={mapStaff} />
        </>
      )}
      preview={(
        <div className="overflow-x-auto bg-white border border-slate-200 shadow-sm p-2 md:p-3 rounded-xl">
          <div className="min-w-[8in]">
            <SalarySlip row={data[0] ?? {}} schoolName={schoolName} schoolAddress={schoolAddress} logoUrl={logoUrl} />
          </div>
          {data.length > 1 && (
            <p className="text-center text-slate-500 mt-3 text-xs font-medium">
              Showing first of {data.length} slips · download to get all.
            </p>
          )}
        </div>
      )}
      printNode={(
        <div id="print-area-slips" className="flex flex-col bg-white w-full max-w-[794px] mx-auto">
          {data.map((row, i) => (
            <SalarySlip key={i} row={row} schoolName={schoolName} schoolAddress={schoolAddress} logoUrl={logoUrl} />
          ))}
        </div>
      )}
    />
  );
};

const num = (v: unknown): number => {
  const n = parseFloat(String(v ?? '0'));
  return Number.isFinite(n) ? n : 0;
};

const SalarySlip: React.FC<{
  row: Record<string, unknown>;
  schoolName: string;
  schoolAddress: string;
  logoUrl: string;
}> = ({ row, schoolName, schoolAddress, logoUrl }) => {
  const basic = num(row.basic);
  const hra = num(row.hra);
  const other = num(row.other);
  const pf = num(row.pf);
  const tax = num(row.tax);
  const deductOther = num(row.deductOther);
  const grossEarnings = basic + hra + other;
  const grossDeductions = pf + tax + deductOther;
  const net = grossEarnings - grossDeductions;
  const netWords = inrInWords(net);

  return (
    <div className="bg-white avoid-break flex flex-col" style={{ width: '794px', minHeight: 700, padding: '36px 44px', boxSizing: 'border-box' }}>
      {/* Header */}
      <div className="flex items-center gap-4 border-b-2 border-slate-900 pb-4 mb-5">
        {logoUrl && (
          <img src={logoUrl} alt="School logo" crossOrigin="anonymous" className="w-16 h-16 object-contain shrink-0" />
        )}
        <div className="flex-1 text-center">
          <h2 className="text-2xl font-extrabold text-slate-900 uppercase tracking-widest" style={{ fontFamily: 'Georgia, serif' }}>{schoolName}</h2>
          {schoolAddress && <p className="text-[11px] text-slate-600 italic mt-0.5">{schoolAddress}</p>}
          <div className="inline-block bg-slate-900 text-white px-5 py-1 text-xs font-bold uppercase tracking-[0.3em] mt-2">
            Salary Slip · {String(row.month || '')}
          </div>
        </div>
      </div>

      {/* Slip meta */}
      <div className="flex justify-between text-xs font-semibold text-slate-700 mb-4">
        <div>Slip No.: <span className="border-b border-dotted border-slate-400 inline-block min-w-[110px] px-2 font-bold text-slate-900">{String(row.slipNo || '')}</span></div>
        <div>Generated: <span className="font-bold text-slate-900">{new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span></div>
      </div>

      {/* Employee details */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm mb-5 border border-slate-200 rounded-md p-3 bg-slate-50">
        <Field label="Name" val={String(row.name || '')} bold />
        <Field label="Designation" val={String(row.role || '')} />
        <Field label="Joining Date" val={String(row.joining || '')} />
        <Field label="Month / Period" val={String(row.month || '')} />
      </div>

      {/* Earnings + Deductions */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <table className="w-full text-xs border-collapse border border-emerald-700">
          <thead>
            <tr className="bg-emerald-100 text-emerald-900">
              <th colSpan={2} className="border border-emerald-700 px-2 py-1.5 text-center font-black uppercase tracking-wider">Earnings</th>
            </tr>
          </thead>
          <tbody>
            <SlipRow label="Basic Salary" value={basic} />
            <SlipRow label="HRA / Allowance" value={hra} />
            <SlipRow label="Other Earnings" value={other} />
            <tr className="bg-emerald-50">
              <td className="border border-emerald-700 px-2 py-1.5 font-black text-emerald-900">Gross Earnings</td>
              <td className="border border-emerald-700 px-2 py-1.5 text-right font-black text-emerald-900 tabular-nums">₹{grossEarnings.toLocaleString('en-IN')}</td>
            </tr>
          </tbody>
        </table>
        <table className="w-full text-xs border-collapse border border-rose-700">
          <thead>
            <tr className="bg-rose-100 text-rose-900">
              <th colSpan={2} className="border border-rose-700 px-2 py-1.5 text-center font-black uppercase tracking-wider">Deductions</th>
            </tr>
          </thead>
          <tbody>
            <SlipRow label="PF" value={pf} />
            <SlipRow label="Tax / TDS" value={tax} />
            <SlipRow label="Other" value={deductOther} />
            <tr className="bg-rose-50">
              <td className="border border-rose-700 px-2 py-1.5 font-black text-rose-900">Gross Deductions</td>
              <td className="border border-rose-700 px-2 py-1.5 text-right font-black text-rose-900 tabular-nums">₹{grossDeductions.toLocaleString('en-IN')}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Net pay */}
      <div className="border-2 border-slate-900 px-4 py-3 bg-amber-50 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-600">Net Salary Payable</div>
            <div className="text-[11px] font-bold text-slate-700 mt-1 leading-tight">{netWords}</div>
          </div>
          <div className="text-3xl font-black text-slate-900 tabular-nums">₹{net.toLocaleString('en-IN')}</div>
        </div>
      </div>

      {/* Signature */}
      <div className="flex justify-between items-end mt-auto pt-12 text-xs">
        <div className="text-slate-500 italic">
          (This is a computer-generated salary slip.)
        </div>
        <div className="text-center">
          <div className="border-t-2 border-slate-800 w-44 pt-1.5 font-bold text-slate-900">Authorised Signatory</div>
        </div>
      </div>
    </div>
  );
};

const Field: React.FC<{ label: string; val: string; bold?: boolean }> = ({ label, val, bold }) => (
  <div className="flex items-baseline gap-2">
    <span className="font-bold text-slate-600 w-28 shrink-0">{label}</span>
    <span className={`flex-1 border-b border-slate-300 px-2 ${bold ? 'font-bold' : 'font-semibold'} text-slate-900`}>{val || ''}</span>
  </div>
);

const SlipRow: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <tr>
    <td className="border border-slate-300 px-2 py-1.5 font-semibold text-slate-700">{label}</td>
    <td className="border border-slate-300 px-2 py-1.5 text-right tabular-nums text-slate-900">{value > 0 ? `₹${value.toLocaleString('en-IN')}` : '—'}</td>
  </tr>
);
