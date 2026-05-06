import React, { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { feeService, type FeeInstallment } from '@/modules/fees/fee.service';

interface Props {
  studentId: string;
  currentAcademicYearId: string;
  onPayClick: (installment: FeeInstallment) => void;
}

export const PreviousYearDues: React.FC<Props> = ({ studentId, currentAcademicYearId, onPayClick }) => {
  const [expanded, setExpanded] = useState(false);

  const previousDues = feeService.getPreviousYearDues(studentId, currentAcademicYearId);

  if (previousDues.length === 0) return null;

  const totalPreviousOutstanding = previousDues.reduce((s, y) => s + y.outstanding, 0);

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-amber-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle size={18} className="text-amber-600 shrink-0" />
          <div className="text-left">
            <p className="font-black text-sm text-amber-900">Previous Year Outstanding</p>
            <p className="text-xs font-bold text-amber-700">₹{totalPreviousOutstanding.toLocaleString()}</p>
          </div>
        </div>
        {expanded ? <ChevronUp size={18} className="text-amber-600" /> : <ChevronDown size={18} className="text-amber-600" />}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-amber-200 px-4 py-3 space-y-3 bg-white">
          {previousDues.map(year => (
            <div key={year.academicYearId} className="rounded-lg bg-amber-50 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="font-bold text-xs text-slate-600 uppercase tracking-widest">{year.yearLabel}</p>
                <p className="font-black text-sm text-amber-900">₹{year.outstanding.toLocaleString()}</p>
              </div>

              {/* Installments list */}
              <div className="space-y-1.5">
                {year.installments.map(inst => {
                  const due = Math.max(0, inst.amount - inst.paidAmount - inst.writeOffAmount);
                  if (due <= 0) return null;
                  return (
                    <div key={inst.id} className="flex items-center justify-between text-xs px-2 py-1 bg-white rounded border border-amber-100">
                      <div className="flex-1">
                        <p className="font-bold text-slate-700">{inst.month}</p>
                        <p className="text-slate-500">{inst.feeType}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-black text-amber-700">₹{due.toLocaleString()}</p>
                        <button
                          onClick={() => onPayClick(inst)}
                          className="text-[10px] font-black text-indigo-600 hover:text-indigo-800"
                        >
                          Pay →
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
