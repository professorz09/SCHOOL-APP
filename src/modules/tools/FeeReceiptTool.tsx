// Fee Receipt Tool — print-ready single-payment receipt with INR amount
// in words. Designed for the cash-counter / parent-walk-in flow: a row
// per payment, school header + amount + UTR + signature line.
//
// Bulk-capable for issuing back-dated receipts in a batch, but the
// typical use is one row at a time.

import React, { useState, useEffect } from 'react';
import { DataInputSection } from './components/DataInputSection';
import { ToolShell, ToolCard, ToolField } from './components/ToolShell';
import type { Student } from '@/modules/students/student.types';
import type { SchoolInfo } from '@/shared/utils/schoolInfo.service';
import { schoolInfoService } from '@/shared/utils/schoolInfo.service';

interface Props {
  onBack: () => void;
  students: Student[];
  schoolInfo: SchoolInfo | null;
}

interface Row {
  receiptNo: string;
  date: string;
  name: string;
  class: string;
  fatherName: string;
  amount: string;
  purpose: string;
  mode: string;
  reference: string;
}

// Indian number-to-words. Handles 0 — 99,99,99,999 (10-crore range).
// Standard place-value groups: crore, lakh, thousand, hundred, tens/units.
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
const TEENS = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigit(n: number): string {
  if (n === 0) return '';
  if (n < 10) return ONES[n];
  if (n < 20) return TEENS[n - 10];
  return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
}

function threeDigit(n: number): string {
  if (n === 0) return '';
  if (n < 100) return twoDigit(n);
  const h = Math.floor(n / 100);
  const r = n % 100;
  return ONES[h] + ' Hundred' + (r ? ' ' + twoDigit(r) : '');
}

export function inrInWords(rupees: number): string {
  if (!Number.isFinite(rupees) || rupees < 0) return '';
  const n = Math.floor(rupees);
  if (n === 0) return 'Zero Rupees Only';
  if (n > 9999999999) return 'Amount too large';
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const hundred = n % 1000;
  const parts: string[] = [];
  if (crore) parts.push(twoDigit(crore) + ' Crore');
  if (lakh) parts.push(twoDigit(lakh) + ' Lakh');
  if (thousand) parts.push(twoDigit(thousand) + ' Thousand');
  if (hundred) parts.push(threeDigit(hundred));
  return parts.join(' ') + ' Rupees Only';
}

export const FeeReceiptTool: React.FC<Props> = ({ onBack, students, schoolInfo }) => {
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [schoolName, setSchoolName] = useState(schoolInfo?.name || 'School Name');
  const [schoolAddress, setSchoolAddress] = useState(() => {
    if (!schoolInfo) return '';
    return [schoolInfo.address, schoolInfo.city, schoolInfo.state, schoolInfo.pin]
      .filter(Boolean).join(', ');
  });
  const logoUrl = schoolInfo?.logoPath ? schoolInfoService.getAssetUrl(schoolInfo.logoPath) : '';

  useEffect(() => {
    if (schoolInfo?.name) setSchoolName(schoolInfo.name);
    if (schoolInfo) {
      const addr = [schoolInfo.address, schoolInfo.city, schoolInfo.state, schoolInfo.pin]
        .filter(Boolean).join(', ');
      if (addr) setSchoolAddress(addr);
    }
  }, [schoolInfo]);

  const fields = [
    { key: 'receiptNo', label: 'Receipt No.', placeholder: 'R/2026/001' },
    { key: 'date',      label: 'Date', placeholder: 'YYYY-MM-DD' },
    { key: 'name',      label: 'Student Name' },
    { key: 'class',     label: 'Class/Section' },
    { key: 'fatherName',label: "Father's Name" },
    { key: 'amount',    label: 'Amount (₹)', placeholder: '5000' },
    { key: 'purpose',   label: 'Payment For', placeholder: 'Tuition Fee April' },
    { key: 'mode',      label: 'Mode', placeholder: 'Cash / UPI / Cheque' },
    { key: 'reference', label: 'Reference / UTR (optional)' },
  ];

  const mapStudent = (s: Student): Record<string, unknown> => ({
    receiptNo: '',
    date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
    name: s.name,
    class: `${s.className}-${s.section}`,
    fatherName: s.fatherName ?? '',
    amount: '',
    purpose: '',
    mode: 'Cash',
    reference: '',
  });

  return (
    <ToolShell
      title="Fee Receipts"
      subtitle="Printable payment receipts with amount in words"
      onBack={onBack}
      hasData={data.length > 0}
      previewLabel={data.length > 0 ? <span className="ml-1 text-[10px] font-bold opacity-70">({data.length})</span> : null}
      filename="fee_receipts.pdf"
      printTargetId="print-area-receipts"
      edit={(
        <>
          <ToolCard title="School Header">
            <ToolField label="School Name" value={schoolName} onChange={setSchoolName} />
            <ToolField label="School Address" value={schoolAddress} onChange={setSchoolAddress} />
          </ToolCard>
          <DataInputSection data={data} setData={setData} fields={fields}
            title="Receipt" students={students} mapStudent={mapStudent} />
        </>
      )}
      preview={(
        <div className="overflow-x-auto bg-white border border-slate-200 shadow-sm p-2 md:p-3 rounded-xl">
          <div className="min-w-[8in]">
            <Receipt row={data[0] ?? {}} schoolName={schoolName} schoolAddress={schoolAddress} logoUrl={logoUrl} />
          </div>
          {data.length > 1 && (
            <p className="text-center text-slate-500 mt-3 text-xs font-medium">
              Showing first of {data.length} receipts · download to get all.
            </p>
          )}
        </div>
      )}
      printNode={(
        <div id="print-area-receipts" className="flex flex-col bg-white w-full max-w-[794px] mx-auto">
          {data.map((row, i) => (
            <Receipt key={i} row={row} schoolName={schoolName} schoolAddress={schoolAddress} logoUrl={logoUrl} />
          ))}
        </div>
      )}
    />
  );
};

const Receipt: React.FC<{
  row: Record<string, unknown>;
  schoolName: string;
  schoolAddress: string;
  logoUrl: string;
}> = ({ row, schoolName, schoolAddress, logoUrl }) => {
  const amount = parseFloat(String(row.amount ?? '0')) || 0;
  const words = inrInWords(amount);

  return (
    <div className="bg-white avoid-break flex flex-col" style={{ width: '794px', minHeight: 520, padding: '36px 44px', boxSizing: 'border-box' }}>
      {/* Header */}
      <div className="flex items-center gap-4 border-b-2 border-slate-900 pb-4 mb-5">
        {logoUrl && (
          <img src={logoUrl} alt="School logo" crossOrigin="anonymous" className="w-16 h-16 object-contain shrink-0" />
        )}
        <div className="flex-1 text-center">
          <h2 className="text-2xl font-extrabold text-slate-900 uppercase tracking-widest" style={{ fontFamily: 'Georgia, serif' }}>{schoolName}</h2>
          {schoolAddress && <p className="text-[11px] text-slate-600 italic mt-0.5">{schoolAddress}</p>}
          <div className="inline-block bg-slate-900 text-white px-5 py-1 text-xs font-bold uppercase tracking-[0.3em] mt-2">
            Fee Receipt
          </div>
        </div>
      </div>

      {/* Receipt meta */}
      <div className="flex justify-between text-xs font-semibold text-slate-700 mb-4">
        <div>Receipt No.: <span className="border-b border-dotted border-slate-400 inline-block min-w-[110px] px-2 font-bold text-slate-900">{String(row.receiptNo || '')}</span></div>
        <div>Date: <span className="border-b border-dotted border-slate-400 inline-block min-w-[110px] px-2 font-bold text-slate-900">{String(row.date || '')}</span></div>
      </div>

      {/* Body */}
      <div className="space-y-3 text-sm">
        <div className="flex items-baseline gap-2">
          <span className="font-bold text-slate-700 w-32 shrink-0">Received From</span>
          <span className="flex-1 border-b border-slate-300 px-2 font-bold text-slate-900">
            {String(row.name || '')}{row.fatherName ? ` S/o D/o ${row.fatherName}` : ''}
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="font-bold text-slate-700 w-32 shrink-0">Class / Section</span>
          <span className="flex-1 border-b border-slate-300 px-2 font-semibold text-slate-900">{String(row.class || '')}</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="font-bold text-slate-700 w-32 shrink-0">Payment For</span>
          <span className="flex-1 border-b border-slate-300 px-2 font-semibold text-slate-900">{String(row.purpose || '')}</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="font-bold text-slate-700 w-32 shrink-0">Mode</span>
          <span className="flex-1 border-b border-slate-300 px-2 font-semibold text-slate-900">
            {String(row.mode || '')}{row.reference ? ` · Ref: ${row.reference}` : ''}
          </span>
        </div>
      </div>

      {/* Amount box */}
      <div className="grid grid-cols-2 gap-4 mt-6 mb-4">
        <div className="border-2 border-slate-900 px-4 py-3 bg-emerald-50">
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-600">Amount in figures</div>
          <div className="text-3xl font-black text-slate-900 mt-1 tabular-nums">₹{amount.toLocaleString('en-IN')}</div>
        </div>
        <div className="border-2 border-slate-900 px-4 py-3 bg-emerald-50">
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-600">Amount in words</div>
          <div className="text-sm font-bold text-slate-900 mt-1 leading-tight">{words}</div>
        </div>
      </div>

      {/* Signature */}
      <div className="flex justify-between items-end mt-auto pt-12 text-xs">
        <div className="text-slate-500 italic">
          (This is a computer-generated receipt and does not require a stamp.)
        </div>
        <div className="text-center">
          <div className="border-t-2 border-slate-800 w-44 pt-1.5 font-bold text-slate-900">Authorised Signatory</div>
        </div>
      </div>
    </div>
  );
};
