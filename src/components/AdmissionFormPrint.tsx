import React, { useRef } from 'react';
import { X, Printer } from 'lucide-react';
import { Student } from '../types/principal.types';
import { SchoolInfo } from '../services/schoolInfo.service';

interface Props {
  student: Student;
  schoolInfo: SchoolInfo;
  onClose: () => void;
}

export const AdmissionFormPrint: React.FC<Props> = ({ student, schoolInfo, onClose }) => {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const printWindow = window.open('', '', 'height=800,width=1000');
    if (!printWindow) return;

    const content = printRef.current?.innerHTML || '';
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Admission Form - ${student.name}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; line-height: 1.6; }
            @media print { body { margin: 0; padding: 0; } }
            .page { width: 210mm; height: 297mm; margin: 0 auto; padding: 20mm; background: white; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
            @media print { .page { margin: 0; padding: 20mm; box-shadow: none; page-break-after: always; } }
            .header { text-align: center; border-bottom: 3px solid #1e40af; padding-bottom: 15px; margin-bottom: 20px; }
            .school-name { font-size: 24px; font-weight: 900; color: #1e40af; }
            .school-tagline { font-size: 12px; color: #666; margin-top: 3px; }
            .contact-info { font-size: 11px; color: #666; margin-top: 5px; }
            .form-title { text-align: center; font-size: 16px; font-weight: 900; color: #1e40af; margin: 20px 0; text-transform: uppercase; }
            .section { margin-bottom: 20px; }
            .section-title { background: #f0f9ff; border-left: 4px solid #1e40af; padding: 8px 12px; font-weight: 900; font-size: 13px; color: #1e40af; text-transform: uppercase; margin-bottom: 12px; }
            .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 12px; }
            .form-row.full { grid-template-columns: 1fr; }
            .form-group { }
            .form-label { font-size: 11px; font-weight: 900; color: #666; text-transform: uppercase; margin-bottom: 4px; letter-spacing: 0.5px; }
            .form-value { font-size: 13px; font-weight: 600; color: #1e40af; padding: 6px; border-bottom: 1px solid #d1d5db; min-height: 24px; }
            .signature-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 40px; }
            .signature-box { text-align: center; }
            .signature-line { border-top: 1px solid #333; margin-top: 40px; padding-top: 5px; font-size: 11px; font-weight: 700; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 10px; }
            th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; }
            th { background: #f0f9ff; font-weight: 900; color: #1e40af; }
            .footer { margin-top: 30px; padding-top: 15px; border-top: 1px solid #d1d5db; font-size: 10px; color: #666; text-align: center; }
          </style>
        </head>
        <body>
          ${content}
        </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 250);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-end justify-center">
      <div className="bg-white w-full sm:max-w-2xl rounded-t-3xl sm:rounded-2xl h-screen sm:h-auto max-h-screen sm:max-h-[95vh] overflow-hidden flex flex-col shadow-2xl animate-in slide-in-from-bottom-8">
        {/* Header */}
        <div className="bg-white border-b border-slate-100 px-4 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
          <h2 className="text-lg font-black text-slate-900">Admission Form</h2>
          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              className="p-2 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center active:scale-90 transition-transform"
              title="Print to PDF"
            >
              <Printer size={18} />
            </button>
            <button
              onClick={onClose}
              className="p-2 bg-slate-100 text-slate-600 rounded-full flex items-center justify-center active:scale-90 transition-transform"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 bg-slate-50">
          <div ref={printRef} className="bg-white p-8 max-w-4xl mx-auto">
            {/* Header Section */}
            <div className="header">
              <div className="school-name">{schoolInfo.name || 'School Name'}</div>
              <div className="school-tagline">{schoolInfo.tagline || 'School Tagline'}</div>
              <div className="contact-info">
                {schoolInfo.address && <div>{schoolInfo.address}</div>}
                {schoolInfo.city && <div>{schoolInfo.city}, {schoolInfo.state} {schoolInfo.pin}</div>}
                {schoolInfo.phone && <div>Phone: {schoolInfo.phone}</div>}
                {schoolInfo.email && <div>Email: {schoolInfo.email}</div>}
              </div>
              <div className="contact-info" style={{ marginTop: '8px' }}>
                <strong>Affiliation:</strong> {schoolInfo.affiliationBoard || 'CBSE'} | <strong>Code:</strong> {schoolInfo.schoolCode || 'N/A'}
              </div>
            </div>

            {/* Form Title */}
            <div className="form-title">Student Admission Form</div>

            {/* Admission Details */}
            <div className="section">
              <div className="section-title">Admission Details</div>
              <div className="form-row">
                <div className="form-group">
                  <div className="form-label">Admission Number</div>
                  <div className="form-value">{student.admissionNo}</div>
                </div>
                <div className="form-group">
                  <div className="form-label">Admission Date</div>
                  <div className="form-value">{new Date(student.admissionDate).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <div className="form-label">Class</div>
                  <div className="form-value">{student.className}</div>
                </div>
                <div className="form-group">
                  <div className="form-label">Section</div>
                  <div className="form-value">{student.section}</div>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <div className="form-label">Roll Number</div>
                  <div className="form-value">{student.rollNo}</div>
                </div>
              </div>
            </div>

            {/* Personal Information */}
            <div className="section">
              <div className="section-title">Personal Information</div>
              <div className="form-row">
                <div className="form-group">
                  <div className="form-label">Student Name</div>
                  <div className="form-value">{student.name}</div>
                </div>
                <div className="form-group">
                  <div className="form-label">Date of Birth</div>
                  <div className="form-value">{new Date(student.dob).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <div className="form-label">Gender</div>
                  <div className="form-value">{student.gender}</div>
                </div>
                <div className="form-group">
                  <div className="form-label">Blood Group</div>
                  <div className="form-value">{student.bloodGroup}</div>
                </div>
              </div>
              <div className="form-row full">
                <div className="form-group">
                  <div className="form-label">Address</div>
                  <div className="form-value">{student.address}</div>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <div className="form-label">Phone Number</div>
                  <div className="form-value">{student.phone || '—'}</div>
                </div>
                <div className="form-group">
                  <div className="form-label">Email Address</div>
                  <div className="form-value">{student.email || '—'}</div>
                </div>
              </div>
            </div>

            {/* Guardian Information */}
            <div className="section">
              <div className="section-title">Guardian Information</div>
              <div className="form-row">
                <div className="form-group">
                  <div className="form-label">Father's Name</div>
                  <div className="form-value">{student.fatherName}</div>
                </div>
                <div className="form-group">
                  <div className="form-label">Father's Occupation</div>
                  <div className="form-value">{student.fatherOccupation || '—'}</div>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <div className="form-label">Father's Phone</div>
                  <div className="form-value">{student.fatherPhone}</div>
                </div>
                <div className="form-group">
                  <div className="form-label">Father's Email</div>
                  <div className="form-value">{student.fatherEmail || '—'}</div>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <div className="form-label">Mother's Name</div>
                  <div className="form-value">{student.motherName}</div>
                </div>
                <div className="form-group">
                  <div className="form-label">Mother's Occupation</div>
                  <div className="form-value">{student.motherOccupation || '—'}</div>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <div className="form-label">Mother's Phone</div>
                  <div className="form-value">{student.motherPhone}</div>
                </div>
              </div>
            </div>

            {/* Academic Information */}
            <div className="section">
              <div className="section-title">Academic Information</div>
              <div className="form-row">
                <div className="form-group">
                  <div className="form-label">Annual Fee</div>
                  <div className="form-value">₹{student.totalFee?.toLocaleString('en-IN')}</div>
                </div>
                <div className="form-group">
                  <div className="form-label">RTE Student</div>
                  <div className="form-value">{student.rte ? 'Yes' : 'No'}</div>
                </div>
              </div>
            </div>

            {/* Signature Section */}
            <div className="signature-row">
              <div className="signature-box">
                <div style={{ minHeight: '60px' }} />
                <div className="signature-line">Parent/Guardian Signature</div>
              </div>
              <div className="signature-box">
                <div style={{ minHeight: '60px' }} />
                <div className="signature-line">Principal Signature</div>
              </div>
              <div className="signature-box">
                <div style={{ minHeight: '60px' }} />
                <div className="signature-line">Date</div>
              </div>
            </div>

            {/* Footer */}
            <div className="footer">
              This is an automatically generated document. Signatures required for validity.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
