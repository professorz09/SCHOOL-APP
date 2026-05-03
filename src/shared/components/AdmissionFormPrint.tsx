import React, { useRef, useState } from 'react';
import { X, Printer, Download } from 'lucide-react';
import { Student, STREAM_CLASSES } from '@/modules/students/student.types';
import { SchoolInfo } from '@/shared/utils/schoolInfo.service';

interface Props {
  student: Student;
  schoolInfo: SchoolInfo;
  onClose: () => void;
}

const PRINT_CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #222; background: white; }
  .adm-page { width: 190mm; margin: 0 auto; padding: 10mm 14mm; background: white; }
  @media print { .adm-page { margin: 0; padding: 10mm 14mm; } }

  .adm-school-box { border: 2px solid #333; padding: 10px 18px; text-align: center; margin-bottom: 8px; }
  .adm-school-name { font-size: 20px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; color: #111; }
  .adm-school-address { font-size: 10px; font-style: italic; color: #444; margin-top: 3px; }
  .adm-school-contact { font-size: 10px; color: #444; margin-top: 2px; }

  .adm-title-bar { background: #f5f5f5; border: 1px solid #bbb; text-align: center; padding: 7px 0; margin-bottom: 10px; }
  .adm-title { font-size: 13px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; color: #222; }

  .adm-section { font-size: 9px; font-weight: 900; letter-spacing: 2px; color: #999; text-transform: uppercase;
    margin: 10px 0 6px; border-bottom: 1px solid #ddd; padding-bottom: 3px; }

  .adm-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  .adm-photo { width: 88px; border: 2px dashed #aaa; text-align: center; vertical-align: middle; padding: 12px 6px;
    font-size: 8px; font-weight: 700; color: #aaa; text-transform: uppercase; letter-spacing: 0.5px; line-height: 1.7; }
  .adm-td { padding: 4px 8px; vertical-align: top; border-bottom: 1px solid #f0f0f0; }
  .adm-td-last { padding: 4px 8px; vertical-align: top; }

  .adm-lbl { font-size: 9px; font-weight: 700; color: #777; text-transform: uppercase; letter-spacing: 0.5px;
    display: block; margin-bottom: 2px; }
  .adm-val { font-size: 11px; font-weight: 600; color: #222; border-bottom: 1px solid #ccc;
    min-height: 17px; padding-bottom: 1px; display: block; }

  .adm-grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 8px; }
  .adm-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 8px; }
  .adm-grid1 { margin-bottom: 8px; }
  .adm-field { }

  .adm-rte { display: flex; align-items: center; gap: 7px; margin: 6px 0 2px; font-size: 11px; font-weight: 700; color: #333; }
  .adm-checkbox { width: 13px; height: 13px; border: 1.5px solid #555; display: inline-flex; align-items: center;
    justify-content: center; flex-shrink: 0; font-size: 9px; font-weight: 900; }

  .adm-sig-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 28px; }
  .adm-sig-box { text-align: center; }
  .adm-sig-line { border-top: 1px solid #555; margin-top: 32px; padding-top: 4px; font-size: 10px; font-weight: 700; color: #555; }

  .adm-footer { margin-top: 16px; padding-top: 8px; border-top: 1px solid #e0e0e0;
    font-size: 9px; color: #aaa; text-align: center; }
`;

export const AdmissionFormPrint: React.FC<Props> = ({ student, schoolInfo, onClose }) => {
  const printRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  // Lazy-load jspdf + html2canvas only when the user actually clicks
  // download. Keeps the initial bundle ~600 KB lighter for everyone who
  // is just printing.
  const handleDownloadPdf = async () => {
    if (!printRef.current) return;
    setDownloading(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);
      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgRatio = canvas.height / canvas.width;
      const imgWidth = pageWidth;
      const imgHeight = imgWidth * imgRatio;
      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
      heightLeft -= pageHeight;
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
        heightLeft -= pageHeight;
      }
      const safeName = student.name.replace(/[^a-zA-Z0-9]+/g, '_');
      pdf.save(`Admission_${safeName}_${student.admissionNo}.pdf`);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[AdmissionForm] PDF download failed', e);
      alert('PDF generation failed — please try Print instead.');
    } finally {
      setDownloading(false);
    }
  };

  const handlePrint = () => {
    const printWindow = window.open('', '', 'height=900,width=1100');
    if (!printWindow) return;
    const content = printRef.current?.innerHTML || '';
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Admission Form - ${student.name}</title>
          <style>${PRINT_CSS}</style>
        </head>
        <body>
          <div class="adm-page">${content}</div>
        </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 300);
  };

  const fmtDate = (d: string) => {
    if (!d) return '';
    try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
    catch { return d; }
  };

  const admCity = schoolInfo.city ? `, ${schoolInfo.city}` : '';
  const admState = schoolInfo.state ? `, ${schoolInfo.state}` : '';
  const admPin = schoolInfo.pin ? `, ${schoolInfo.pin}` : '';
  const fullAddress = schoolInfo.address ? `${schoolInfo.address}${admCity}${admState}${admPin}` : '';

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-end justify-center">
      <div className="bg-white w-full sm:max-w-2xl rounded-t-3xl sm:rounded-2xl h-screen sm:h-auto max-h-screen sm:max-h-[95vh] overflow-hidden flex flex-col shadow-2xl animate-in slide-in-from-bottom-8">

        {/* Modal Header */}
        <div className="bg-white border-b border-slate-100 px-4 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
          <div>
            <h2 className="text-lg font-black text-slate-900">Admission Form</h2>
            <p className="text-xs font-bold text-slate-400 mt-0.5">{student.name} · {student.admissionNo}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={handleDownloadPdf} disabled={downloading}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white font-black text-xs rounded-xl active:scale-90 transition-transform disabled:opacity-60"
              title="Download as PDF">
              <Download size={14} /> {downloading ? 'Saving…' : 'Download PDF'}
            </button>
            <button onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white font-black text-xs rounded-xl active:scale-90 transition-transform"
              title="Print">
              <Printer size={14} /> Print
            </button>
            <button onClick={onClose}
              className="p-2 bg-slate-100 text-slate-600 rounded-xl active:scale-90 transition-transform">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Preview Content */}
        <div className="flex-1 overflow-y-auto bg-slate-100 p-3">
          <style dangerouslySetInnerHTML={{ __html: `.adm-preview { ${PRINT_CSS.split('.adm-page')[0]} } ` + PRINT_CSS }} />
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div ref={printRef} style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '12px', color: '#222', padding: '16px 20px' }}>

              {/* School Box */}
              <div className="adm-school-box">
                <div className="adm-school-name">{schoolInfo.name || 'School Name'}</div>
                {fullAddress && <div className="adm-school-address">{schoolInfo.city ? `Residential (${schoolInfo.city}): ` : ''}{fullAddress}</div>}
                <div className="adm-school-contact">
                  {schoolInfo.phone && `Phone: ${schoolInfo.phone}`}
                  {schoolInfo.phone && schoolInfo.email && ' | '}
                  {schoolInfo.email && `Email: ${schoolInfo.email}`}
                </div>
              </div>

              {/* Form Title */}
              <div className="adm-title-bar">
                <div className="adm-title">Student Admission Form</div>
              </div>

              {/* ── STUDENT INFORMATION ── */}
              <div className="adm-section">Student Information</div>

              <table className="adm-table">
                <tbody>
                  <tr>
                    <td className="adm-photo" rowSpan={4}>
                      AFFIX<br />STUDENT<br />PHOTO<br />HERE
                    </td>
                    <td className="adm-td">
                      <span className="adm-lbl">Student Name</span>
                      <span className="adm-val">{student.name}</span>
                    </td>
                    <td className="adm-td">
                      <span className="adm-lbl">Student ID</span>
                      <span className="adm-val">{student.admissionNo}</span>
                    </td>
                    <td className="adm-td">
                      <span className="adm-lbl">Roll Number</span>
                      <span className="adm-val">{student.rollNo || ''}</span>
                    </td>
                  </tr>
                  <tr>
                    <td className="adm-td">
                      <span className="adm-lbl">Date of Birth</span>
                      <span className="adm-val">{fmtDate(student.dob)}</span>
                    </td>
                    <td className="adm-td">
                      <span className="adm-lbl">Admission Date</span>
                      <span className="adm-val">{fmtDate(student.admissionDate)}</span>
                    </td>
                    <td className="adm-td">
                      <span className="adm-lbl">Gender</span>
                      <span className="adm-val">{student.gender ? student.gender.charAt(0) + student.gender.slice(1).toLowerCase() : ''}</span>
                    </td>
                  </tr>
                  <tr>
                    <td className="adm-td">
                      <span className="adm-lbl">Blood Group</span>
                      <span className="adm-val">{student.bloodGroup || ''}</span>
                    </td>
                    <td className="adm-td">
                      <span className="adm-lbl">Nationality</span>
                      <span className="adm-val">Indian</span>
                    </td>
                    <td className="adm-td">
                      <span className="adm-lbl">Religion</span>
                      <span className="adm-val">{student.religion || ''}</span>
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={3} className="adm-td-last">
                      <span className="adm-lbl">Category</span>
                      <span className="adm-val">{student.caste || ''}</span>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Aadhaar / Birth Cert / PEN */}
              <div className="adm-grid3">
                <div className="adm-field">
                  <span className="adm-lbl">Aadhar Number</span>
                  <span className="adm-val">{student.aadhaarNo ? 'XXXX-XXXX-' + student.aadhaarNo.slice(-4) : ''}</span>
                </div>
                <div className="adm-field">
                  <span className="adm-lbl">Birth Certificate Number</span>
                  <span className="adm-val">{student.birthCertNo || ''}</span>
                </div>
                <div className="adm-field">
                  <span className="adm-lbl">PEN Number</span>
                  <span className="adm-val">{student.penNumber || ''}</span>
                </div>
              </div>

              {/* RTE */}
              <div className="adm-rte">
                <div className="adm-checkbox">{student.rte ? '✓' : ''}</div>
                <span>RTE (Right to Education) Student</span>
              </div>

              {/* ── ACADEMIC INFORMATION ── */}
              <div className="adm-section">Academic Information</div>

              <div className="adm-grid3">
                <div className="adm-field">
                  <span className="adm-lbl">Previous School</span>
                  <span className="adm-val">&nbsp;</span>
                </div>
                <div className="adm-field">
                  <span className="adm-lbl">Previous Class</span>
                  <span className="adm-val">&nbsp;</span>
                </div>
                <div className="adm-field">
                  <span className="adm-lbl">Previous Percentage</span>
                  <span className="adm-val">&nbsp;</span>
                </div>
              </div>
              <div className="adm-grid2">
                <div className="adm-field">
                  <span className="adm-lbl">Admission Class</span>
                  <span className="adm-val">{student.className}{student.section ? `-${student.section}` : ''}</span>
                </div>
                <div className="adm-field">
                  <span className="adm-lbl">Stream</span>
                  <span className="adm-val">{STREAM_CLASSES.has(student.className) ? (student.stream || '') : ''}</span>
                </div>
              </div>

              {/* ── FATHER'S INFORMATION ── */}
              <div className="adm-section">Father's Information</div>

              <div className="adm-grid2">
                <div className="adm-field">
                  <span className="adm-lbl">Father's Name</span>
                  <span className="adm-val">{student.fatherName || ''}</span>
                </div>
                <div className="adm-field">
                  <span className="adm-lbl">Father's Occupation</span>
                  <span className="adm-val">{student.fatherOccupation || ''}</span>
                </div>
              </div>
              <div className="adm-grid3">
                <div className="adm-field">
                  <span className="adm-lbl">Father's Phone</span>
                  <span className="adm-val">{student.fatherPhone || ''}</span>
                </div>
                <div className="adm-field">
                  <span className="adm-lbl">Father's Email</span>
                  <span className="adm-val">{student.fatherEmail || ''}</span>
                </div>
                <div className="adm-field">
                  <span className="adm-lbl">Father's Aadhar Number</span>
                  <span className="adm-val">&nbsp;</span>
                </div>
              </div>

              {/* ── MOTHER'S INFORMATION ── */}
              <div className="adm-section">Mother's Information</div>

              <div className="adm-grid2">
                <div className="adm-field">
                  <span className="adm-lbl">Mother's Name</span>
                  <span className="adm-val">{student.motherName || ''}</span>
                </div>
                <div className="adm-field">
                  <span className="adm-lbl">Mother's Occupation</span>
                  <span className="adm-val">{student.motherOccupation || ''}</span>
                </div>
              </div>
              <div className="adm-grid3">
                <div className="adm-field">
                  <span className="adm-lbl">Mother's Phone</span>
                  <span className="adm-val">{student.motherPhone || ''}</span>
                </div>
                <div className="adm-field">
                  <span className="adm-lbl">Mother's Email</span>
                  <span className="adm-val">&nbsp;</span>
                </div>
                <div className="adm-field">
                  <span className="adm-lbl">Mother's Aadhar Number</span>
                  <span className="adm-val">&nbsp;</span>
                </div>
              </div>

              {/* ── ADDRESS INFORMATION ── */}
              <div className="adm-section">Address Information</div>

              <div className="adm-grid1">
                <div className="adm-field">
                  <span className="adm-lbl">Permanent Address</span>
                  <span className="adm-val">{student.address || ''}</span>
                </div>
              </div>
              <div className="adm-grid2">
                <div className="adm-field">
                  <span className="adm-lbl">City / District</span>
                  <span className="adm-val">&nbsp;</span>
                </div>
                <div className="adm-field">
                  <span className="adm-lbl">State / Pin Code</span>
                  <span className="adm-val">&nbsp;</span>
                </div>
              </div>

              {/* Signature Row */}
              <div className="adm-sig-row">
                <div className="adm-sig-box">
                  <div className="adm-sig-line">Parent / Guardian Signature</div>
                </div>
                <div className="adm-sig-box">
                  <div className="adm-sig-line">Principal Signature</div>
                </div>
                <div className="adm-sig-box">
                  <div className="adm-sig-line">Date</div>
                </div>
              </div>

              {/* Footer */}
              <div className="adm-footer">
                This is a computer-generated document. Signatures required for validity.
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
