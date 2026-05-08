import React, { useEffect, useState } from 'react';
import {
  ArrowLeft, User, Phone, Mail,
  IndianRupee, BookOpen, Calendar, CheckCircle2,
  FileText, BarChart2, FolderOpen, FileCheck,
  Bus, Briefcase, Droplets, GraduationCap, Shield,
  CreditCard, TrendingUp, Home as HomeIcon,
  UserCheck, AlertTriangle, Trash2,
  Lock, Edit2, History, Download,
  UserPlus, BookmarkCheck, Banknote, Truck, TruckIcon, FileX, RotateCcw, ArrowUpCircle, Eye,
} from 'lucide-react';
import { studentService } from '@/modules/students/student.service';
import { apiStudents, apiFees } from '@/lib/apiClient';
import { Student, StudentAcademicRecord, StudentDoc } from '@/modules/students/student.types';
import { useUIStore } from '@/store/uiStore';
import { schoolInfoService, SchoolInfo } from '@/shared/utils/schoolInfo.service';
import { AdmissionFormPrint } from '@/shared/components/AdmissionFormPrint';
import {
  transportService, TransportVehicle, StudentTransportAssignment,
  TRANSPORT_CHANGE_REASONS,
} from '@/modules/transport/transport.service';
import { storageService } from '@/shared/utils/storage.service';
import { StudentClassAssignmentModal } from '@/modules/students/components/StudentClassAssignmentModal';
import { useAcademicYear } from '@/shared/context/AcademicYearContext';
import { useEditorModeStore } from '@/store/editorModeStore';
import { stripClassPrefix } from '@/shared/utils/className';
import { logAudit } from '@/lib/audit';
import { feeService, FeeInstallment } from '@/modules/fees/fee.service';
import type { FeeStructureRecord } from '@/modules/fees/fees.types';
import { StudentAttendanceTab } from '@/modules/attendance/components/StudentAttendanceTab';

interface DocumentUpload {
  type: 'BIRTH_CERT' | 'TRANSFER_CERT' | 'AADHAAR' | 'PHOTO' | 'OTHER';
  name: string;
  uploaded: boolean;
}

// Trimmed to the truly essential documents only. "Other" was removed to keep
// the checklist focused; if a school needs an extra doc, the staff can use
// the catch-all upload in the admission form.
const BLANK_PROFILE_DOCS: DocumentUpload[] = [
  { type: 'PHOTO',         name: 'Student Photo',        uploaded: false },
  { type: 'AADHAAR',       name: 'Aadhaar Card',         uploaded: false },
  { type: 'BIRTH_CERT',    name: 'Birth Certificate',    uploaded: false },
  { type: 'TRANSFER_CERT', name: 'Transfer Certificate', uploaded: false },
];

interface AcademicHistoryEntry {
  id: string; class_name: string; section: string | null; roll_no: string | null;
  status: string; fee_status: string; total_fee: number; paid_fee: number;
  academic_year_id: string;
  academic_years: { id: string; name: string; start_date: string; end_date: string };
}

interface Props {
  student: Student;
  onBack: () => void;
  /** Called after any mutation that changes the student's data. Pass updated student when available. */
  onStudentChanged: (updated?: Student) => void;
}

export const StudentProfilePanel: React.FC<Props> = ({ student, onBack, onStudentChanged }) => {
  const { showToast } = useUIStore();
  const { activeYear, academicYears } = useAcademicYear();
  const editorModeActive = useEditorModeStore(s => s.isActive());

  // Keep a local mutable copy so post-mutation UI updates are instant
  const [currentStudent, setCurrentStudent] = useState<Student>(student);
  useEffect(() => { setCurrentStudent(student); }, [student]);

  const [activeProfileTab, setActiveProfileTab] = useState<
    'INFO' | 'ALLOTMENT' | 'FAMILY' | 'RESULTS' | 'FEES' | 'ATTENDANCE' | 'CLASS_HISTORY' | 'TRANSPORT' | 'DOCS'
  >('INFO');

  // Profile data
  const [feeInstallments, setFeeInstallments] = useState<FeeInstallment[]>([]);
  const [studentFeeStructure, setStudentFeeStructure] = useState<FeeStructureRecord | null>(null);
  const [feePaymentHistory, setFeePaymentHistory] = useState<import('@/modules/fees/fee.service').PaymentRecord[]>([]);
  const [academicRecord, setAcademicRecord] = useState<StudentAcademicRecord | null>(null);
  const [studentTransport, setStudentTransport] = useState<{ vehicle: TransportVehicle; assignment: StudentTransportAssignment } | null>(null);
  const [studentTransportHistory, setStudentTransportHistory] = useState<StudentTransportAssignment[]>([]);
  const [transportHistoryError, setTransportHistoryError] = useState<string | null>(null);
  const [classHistory, setClassHistory] = useState<AcademicHistoryEntry[]>([]);
  const [classHistoryLoading, setClassHistoryLoading] = useState(false);
  const [timeline, setTimeline] = useState<Array<{ type: string; date: string; label: string; sub?: string }>>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [profileDocs, setProfileDocs] = useState<DocumentUpload[]>(BLANK_PROFILE_DOCS);
  const [profileDocsLive, setProfileDocsLive] = useState<StudentDoc[]>([]);
  const [profileDocUploading, setProfileDocUploading] = useState<DocumentUpload['type'] | null>(null);
  const [docsLoading, setDocsLoading] = useState(false);
  // Track which tabs have already fetched their data to avoid redundant requests
  const loadedTabsRef = React.useRef<Set<string>>(new Set());

  // Fee payment modal
  const [feePayModal, setFeePayModal] = useState<FeeInstallment | null>(null);
  const [feePayAmount, setFeePayAmount] = useState('');
  const [feePayMethod, setFeePayMethod] = useState<'CASH' | 'ONLINE' | 'CHEQUE' | 'DD' | 'UPI'>('CASH');
  const [feePayDate, setFeePayDate] = useState('');
  const [feePayNote, setFeePayNote] = useState('');
  const [feePayBusy, setFeePayBusy] = useState(false);

  // Change transport modal
  const [changeModalOpen, setChangeModalOpen] = useState(false);
  const [changeVehicleId, setChangeVehicleId] = useState('');
  const [changeStopId, setChangeStopId] = useState('');
  const [changeMonthly, setChangeMonthly] = useState('500');
  const [changeEffectiveDate, setChangeEffectiveDate] = useState('');
  const [changeReason, setChangeReason] = useState('STOP_CHANGE');
  const [changeReasonNote, setChangeReasonNote] = useState('');
  const [changeBusy, setChangeBusy] = useState(false);
  const [changeError, setChangeError] = useState<string | null>(null);

  // Cancel transport modal
  const [cancelTransportOpen, setCancelTransportOpen] = useState(false);
  const [cancelTransportReason, setCancelTransportReason] = useState('');
  const [cancelTransportBusy, setCancelTransportBusy] = useState(false);

  // Class assignment modal
  const [assignTarget, setAssignTarget] = useState<Student | null>(null);

  // Admission form print
  const [showAdmissionForm, setShowAdmissionForm] = useState(false);
  const [schoolInfo, setSchoolInfo] = useState<SchoolInfo | null>(null);

  // ── Core load: only what the hero card needs (runs on student open) ─────────
  const loadCore = async (s: Student) => {
    const hasYear = !!s.academicYearId;
    const [feesRes, recordRes] = await Promise.allSettled([
      feeService.getStudentInstallmentsDirect(s.id, hasYear ? s.academicYearId : undefined),
      hasYear ? studentService.getAcademicRecord(s.id, s.academicYearId) : Promise.resolve(null),
    ]);
    setFeeInstallments(feesRes.status === 'fulfilled' ? feesRes.value : []);
    setAcademicRecord(recordRes.status === 'fulfilled' ? recordRes.value : null);

    // Current transport assignment. Force-refresh the in-memory cache first
    // so a freshly-assigned vehicle (e.g. principal hit "Assign Transport"
    // a second ago) shows up immediately. Earlier this read straight from
    // _assignmentsCache, which was empty whenever the principal jumped into
    // the profile without first visiting Dashboard / Transport — the row
    // existed in the DB but the panel kept saying "No Transport Assigned".
    try {
      await transportService.refreshAll();
      const assignment = transportService.getAssignmentForStudent(s.id);
      if (assignment) {
        const vehicle = transportService.getVehicleById(assignment.vehicleId);
        setStudentTransport(vehicle ? { vehicle, assignment } : null);
      } else {
        setStudentTransport(null);
      }
    } catch { setStudentTransport(null); }
  };

  // ── Lazy tab loader: called when a tab is first opened ────────────────────
  const loadTabData = async (tab: string, s: Student) => {
    if (loadedTabsRef.current.has(`${s.id}:${tab}`)) return;
    loadedTabsRef.current.add(`${s.id}:${tab}`);

    if (tab === 'FEES') {
      const [structRes, payRes] = await Promise.allSettled([
        feeService.getFeeStructures(),
        (async () => {
          await feeService.refreshAll();
          return feeService.getPaymentHistory().filter(p => p.studentId === s.id);
        })(),
      ]);
      if (structRes.status === 'fulfilled') {
        setStudentFeeStructure(structRes.value.find(st => st.className === s.className) ?? null);
      }
      if (payRes.status === 'fulfilled') setFeePaymentHistory(payRes.value);
    }

    if (tab === 'DOCS') {
      setDocsLoading(true);
      try {
        const docs = await studentService.listDocuments(s.id);
        setProfileDocsLive(docs);
        setProfileDocs(prev => prev.map(d => ({ ...d, uploaded: docs.some(x => x.type === d.type) })));
      } finally {
        setDocsLoading(false);
      }
    }

    if (tab === 'TRANSPORT') {
      try {
        const hist = await transportService.getTransportHistory(s.id);
        setStudentTransportHistory(hist);
        setTransportHistoryError(null);
      } catch (e) {
        setTransportHistoryError(e instanceof Error ? e.message : 'Could not load transport history');
      }
    }

    if (tab === 'CLASS_HISTORY') {
      setClassHistoryLoading(true);
      setTimelineLoading(true);
      try {
        const [hist, tl] = await Promise.allSettled([
          apiStudents.getAcademicHistory(s.id),
          apiStudents.getTimeline(s.id),
        ]);
        setClassHistory(hist.status === 'fulfilled' ? hist.value as AcademicHistoryEntry[] : []);
        setTimeline(tl.status === 'fulfilled' ? tl.value : []);
      } finally {
        setClassHistoryLoading(false);
        setTimelineLoading(false);
      }
    }
  };

  useEffect(() => {
    loadedTabsRef.current = new Set(); // reset loaded tabs for new student
    setActiveProfileTab('INFO');
    setFeeInstallments([]);
    setAcademicRecord(null);
    setStudentTransport(null);
    setStudentTransportHistory([]);
    setProfileDocsLive([]);
    setProfileDocs(BLANK_PROFILE_DOCS);
    setClassHistory([]);
    setTimeline([]);
    setFeePaymentHistory([]);
    setStudentFeeStructure(null);
    void loadCore(currentStudent);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStudent.id]);

  useEffect(() => {
    void loadTabData(activeProfileTab, currentStudent);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfileTab, currentStudent.id]);

  // ── Fee payment ───────────────────────────────────────────────────────────
  const openFeePayModal = (installment: FeeInstallment) => {
    const due = installment.amount - installment.paidAmount - installment.writeOffAmount;
    if (due <= 0) return;
    setFeePayModal(installment);
    setFeePayAmount(String(due));
    setFeePayMethod('CASH');
    setFeePayDate(new Date().toISOString().split('T')[0]);
    setFeePayNote('');
    setFeePayBusy(false);
  };

  const handleFeePaySubmit = async () => {
    if (!feePayModal) return;
    const amount = parseFloat(feePayAmount);
    if (!amount || amount <= 0) { showToast('Valid amount required', 'error'); return; }
    setFeePayBusy(true);
    try {
      await apiFees.pay({
        studentId: feePayModal.studentId,
        amount,
        method: feePayMethod,
        date: feePayDate || undefined,
        note: feePayNote || undefined,
      });
      const updated = await feeService.getStudentInstallmentsDirect(
        feePayModal.studentId,
        currentStudent.academicYearId || undefined,
      );
      setFeeInstallments(updated);
      await feeService.refreshAll();
      setFeePaymentHistory(feeService.getPaymentHistory().filter(p => p.studentId === currentStudent.id));
      setFeePayModal(null);
      showToast(`₹${amount.toLocaleString('en-IN')} collected successfully`);
      const refreshed = await studentService.getById(currentStudent.id);
      if (refreshed) { setCurrentStudent(refreshed); onStudentChanged(refreshed); }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Payment failed', 'error');
    } finally {
      setFeePayBusy(false);
    }
  };

  // ── Document upload ───────────────────────────────────────────────────────
  // Per-type ceilings (mirror storage.service.ts):
  //   PHOTO 1 MB · TRANSFER_CERT 3 MB · others 2 MB · absolute 5 MB.
  const docCapBytes = (docType: DocumentUpload['type']): number => {
    if (docType === 'PHOTO')         return 1 * 1024 * 1024;
    if (docType === 'TRANSFER_CERT') return 3 * 1024 * 1024;
    return 2 * 1024 * 1024;
  };
  const fmtSize = (b: number) =>
    b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`;
  const handleProfileDocUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    docType: DocumentUpload['type'],
    isReplace = false,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Replace requires Editor Mode. Upload (first time) is always allowed.
    if (isReplace && !editorModeActive) {
      showToast('Replace requires Editor Mode (Settings → Security)', 'error');
      e.target.value = '';
      return;
    }
    const cap = docCapBytes(docType);
    if (file.size > cap) {
      showToast(`File too large — max ${fmtSize(cap)} (got ${fmtSize(file.size)})`, 'error');
      e.target.value = '';
      return;
    }
    setProfileDocUploading(docType);
    try {
      const { path } = await storageService.uploadStudentDocument(currentStudent.id, docType, file);
      const newDoc = await studentService.addDocumentRecord(currentStudent.id, docType, path);
      setProfileDocsLive(prev => [
        newDoc,
        ...prev.filter(d => d.id !== newDoc.id && !(d.type === docType && d.storagePath === newDoc.storagePath)),
      ]);
      setProfileDocs(prev => prev.map(d => d.type === docType ? { ...d, uploaded: true } : d));
      await logAudit(isReplace ? 'student_document_replaced' : 'student_document_uploaded',
        'student_document', newDoc.id, { studentId: currentStudent.id, docType, size: file.size });
      showToast(`${file.name} ${isReplace ? 'replaced' : 'uploaded'}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Upload failed', 'error');
    } finally {
      setProfileDocUploading(null);
      e.target.value = '';
    }
  };

  const openProfileDoc = async (doc: StudentDoc) => {
    try {
      const url = await storageService.getStudentDocumentSignedUrl(doc.storagePath);
      if (!url) { showToast('Document not found in storage', 'error'); return; }
      // window.open can be blocked by popup-blockers on desktop. Fall back
      // to navigating a hidden anchor with target=_blank, which Safari /
      // Chrome treat as a user-initiated open and don't block.
      const opened = window.open(url, '_blank', 'noopener,noreferrer');
      if (!opened) {
        const a = document.createElement('a');
        a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not open document', 'error');
    }
  };

  const downloadProfileDoc = async (doc: StudentDoc) => {
    try {
      const url = await storageService.getStudentDocumentSignedUrl(doc.storagePath, 60);
      if (!url) { showToast('Document not found in storage', 'error'); return; }
      // Fetch the bytes ourselves and stream as a Blob so the browser
      // honours the .download attribute (Supabase signed URLs serve a
      // Content-Disposition: inline by default, which Chrome/Safari
      // sometimes ignored when opening the page directly).
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} fetching document`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = doc.name || 'document';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Revoke after a tick so the browser has finished kicking the
      // download. 1s is the convention used elsewhere in the app.
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not download document', 'error');
    }
  };

  const handleProfileDocRemove = async (docId: string) => {
    if (!editorModeActive) {
      showToast('Delete requires Editor Mode (Settings → Security)', 'error');
      return;
    }
    if (!confirm('Permanently remove this document? This action is logged.')) return;
    try {
      const removed = profileDocsLive.find(d => d.id === docId);
      await studentService.removeDocument(docId);
      const next = profileDocsLive.filter(d => d.id !== docId);
      setProfileDocsLive(next);
      if (removed && !next.some(d => d.type === removed.type)) {
        setProfileDocs(prev => prev.map(d =>
          d.type === removed.type ? { ...d, uploaded: false } : d,
        ));
      }
      await logAudit('student_document_deleted', 'student_document', docId, {
        studentId: currentStudent.id, docType: removed?.type ?? null,
      });
      showToast('Document removed');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Remove failed', 'error');
    }
  };

  // ── Transport change / cancel ─────────────────────────────────────────────
  const openChangeTransportModal = () => {
    const todayIso = new Date().toISOString().slice(0, 10);
    setChangeVehicleId(studentTransport?.vehicle.id ?? '');
    setChangeStopId(studentTransport?.assignment.boardingStopId ?? '');
    setChangeMonthly(String(studentTransport?.assignment.monthlyAmount ?? 500));
    setChangeEffectiveDate(todayIso);
    setChangeReason(studentTransport ? 'STOP_CHANGE' : 'OTHER');
    setChangeReasonNote('');
    setChangeError(null);
    setChangeModalOpen(true);
  };

  const handleChangeTransport = async () => {
    if (!changeVehicleId || !changeStopId) { setChangeError('Pick a vehicle and stop.'); return; }
    if (!changeEffectiveDate) { setChangeError('Pick an effective date.'); return; }
    const monthly = Number(changeMonthly);
    if (!Number.isFinite(monthly) || monthly < 0) { setChangeError('Monthly amount must be a positive number.'); return; }
    const reasonLabel = TRANSPORT_CHANGE_REASONS.find(r => r.value === changeReason)?.label ?? changeReason;
    const finalReason = changeReasonNote.trim() ? `${reasonLabel}: ${changeReasonNote.trim()}` : reasonLabel;
    setChangeBusy(true); setChangeError(null);
    try {
      await transportService.changeStudentTransport({
        studentId: currentStudent.id,
        effectiveDate: changeEffectiveDate,
        newVehicleId: changeVehicleId,
        newStopId: changeStopId,
        newMonthlyAmount: monthly,
        reason: finalReason,
      });
      await loadCore(currentStudent);
      setChangeModalOpen(false);
      showToast('Transport updated');
    } catch (e) {
      setChangeError(e instanceof Error ? e.message : 'Could not update transport');
    } finally {
      setChangeBusy(false);
    }
  };

  const openCancelTransportModal = () => {
    setCancelTransportReason(''); setCancelTransportOpen(true);
  };

  const handleCancelTransport = async () => {
    if (!cancelTransportReason.trim()) { showToast('Please enter a reason', 'error'); return; }
    setCancelTransportBusy(true);
    try {
      await transportService.removeStudentAssignment(currentStudent.id, cancelTransportReason.trim());
      await loadCore(currentStudent);
      setCancelTransportOpen(false);
      showToast('Transport cancelled');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not cancel transport', 'error');
    } finally {
      setCancelTransportBusy(false);
    }
  };

  // ── Admission form print overlay ──────────────────────────────────────────
  if (showAdmissionForm) {
    if (!schoolInfo) {
      return (
        <div className="w-full p-6 text-center">
          <div className="inline-block w-8 h-8 border-4 border-slate-300 border-t-emerald-600 rounded-full animate-spin" />
          <p className="text-sm font-bold text-slate-600 mt-3">Loading school info…</p>
        </div>
      );
    }
    return (
      <AdmissionFormPrint
        student={currentStudent}
        schoolInfo={schoolInfo}
        onClose={() => setShowAdmissionForm(false)}
      />
    );
  }

  // ── Sub-components ────────────────────────────────────────────────────────
  const initials = currentStudent.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const fmtDob = currentStudent.dob
    ? new Date(currentStudent.dob).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';
  const fmtAdm = currentStudent.admissionDate
    ? new Date(currentStudent.admissionDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';
  const attGood = currentStudent.attendancePercent >= 75;

  const ProfileField = ({ label, value, icon: Icon }: { label: string; value: string | React.ReactNode; icon?: React.ElementType }) => (
    <div className="flex items-start justify-between gap-3 py-2.5 border-b border-slate-50 last:border-0 last:pb-0">
      <div className="flex items-center gap-1.5 shrink-0">
        {Icon && <Icon size={10} className="text-slate-400" />}
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
      </div>
      <span className="text-[11px] font-bold text-slate-800 text-right leading-snug">{value || '—'}</span>
    </div>
  );

  const SectionTitle = ({ icon: Icon, title }: { icon: React.ElementType; title: string }) => (
    <div className="flex items-center gap-2 mb-3">
      <div className="w-6 h-6 rounded-lg bg-indigo-50 flex items-center justify-center">
        <Icon size={12} className="text-indigo-600" />
      </div>
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{title}</p>
    </div>
  );

  const tabList = [
    { key: 'INFO' as const,          label: 'Info' },
    { key: 'ALLOTMENT' as const,     label: 'Allotment' },
    { key: 'FAMILY' as const,        label: 'Family' },
    { key: 'RESULTS' as const,       label: 'Results' },
    { key: 'FEES' as const,          label: 'Fees' },
    { key: 'ATTENDANCE' as const,    label: 'Attendance' },
    { key: 'CLASS_HISTORY' as const, label: 'History' },
    { key: 'TRANSPORT' as const,     label: 'Transport' },
    { key: 'DOCS' as const,          label: 'Docs' },
  ];

  return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">

      {/* ── Sticky Header ── */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-100 shadow-sm">

        {/* Top bar */}
        <div className="px-4 pt-4 pb-3 flex items-center justify-between">
          <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
            <ArrowLeft size={20} />
          </button>
          {/* Admission Form download lives inside the Docs tab now — it's
              a doc-shaped action and clutters the top bar otherwise. */}
        </div>

        {/* Hero card */}
        <div className="px-4 pb-4">
          <div className="bg-gradient-to-r from-indigo-600 to-violet-700 rounded-2xl p-4 text-white">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center font-black text-xl text-white shrink-0 border-2 border-white/30 overflow-hidden">
                {currentStudent.photo
                  ? <img src={currentStudent.photo} alt={currentStudent.name} className="w-full h-full object-cover" />
                  : <span>{initials}</span>
                }
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-black text-base text-white leading-tight">{currentStudent.name}</h2>
                <p className="text-[10px] font-bold text-white/60 mt-0.5">{currentStudent.admissionNo}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span className="text-[9px] font-black bg-white/20 text-white px-2 py-0.5 rounded-full">
                    {currentStudent.className ? `${currentStudent.className}-${currentStudent.section}` : 'Unassigned'}
                  </span>
                  {currentStudent.rollNo && (
                    <span className="text-[9px] font-black bg-white/20 text-white px-2 py-0.5 rounded-full">
                      Roll #{currentStudent.rollNo}
                    </span>
                  )}
                  {currentStudent.stream && (
                    <span className="text-[9px] font-black bg-white/20 text-white px-2 py-0.5 rounded-full">
                      {currentStudent.stream}
                    </span>
                  )}
                  {currentStudent.rte && (
                    <span className="text-[9px] font-black bg-amber-400/80 text-white px-2 py-0.5 rounded-full">RTE</span>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-white/20">
              <div className="text-center">
                <div className={`text-lg font-black ${attGood ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {currentStudent.attendancePercent}%
                </div>
                <div className="text-[8px] font-bold text-white/50 uppercase">Attend.</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-black text-white">
                  ₹{(currentStudent.paidFee / 1000).toFixed(0)}K
                </div>
                <div className="text-[8px] font-bold text-white/50 uppercase">Paid</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-black text-rose-300">
                  ₹{((currentStudent.totalFee - currentStudent.paidFee) / 1000).toFixed(0)}K
                </div>
                <div className="text-[8px] font-bold text-white/50 uppercase">Due</div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto hide-scrollbar px-4 pb-3">
          {tabList.map(({ key, label }) => {
            const isAllotment = key === 'ALLOTMENT';
            const locked = isAllotment && !!currentStudent.className && !editorModeActive;
            return (
              <button key={key} onClick={() => setActiveProfileTab(key)}
                className={`flex-shrink-0 flex items-center gap-1 px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-widest transition-all ${
                  activeProfileTab === key
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'bg-slate-100 text-slate-500 border border-slate-200'
                }`}>
                {locked && <Lock size={8} className={activeProfileTab === key ? 'text-white/70' : 'text-slate-400'} />}
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Tab Content ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-3">

          {/* ── INFO TAB ─────────────────────────────── */}
          {activeProfileTab === 'INFO' && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 flex flex-col items-center gap-1">
                  <Droplets size={16} className="text-rose-500" />
                  <span className="text-sm font-black text-slate-900">{currentStudent.bloodGroup}</span>
                  <span className="text-[9px] font-bold text-slate-400">Blood</span>
                </div>
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 flex flex-col items-center gap-1">
                  <User size={16} className="text-blue-500" />
                  <span className="text-sm font-black text-slate-900">
                    {currentStudent.gender === 'MALE' ? 'Male' : currentStudent.gender === 'FEMALE' ? 'Female' : 'Other'}
                  </span>
                  <span className="text-[9px] font-bold text-slate-400">Gender</span>
                </div>
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 flex flex-col items-center gap-1">
                  <Calendar size={16} className="text-violet-500" />
                  <span className="text-[11px] font-black text-slate-900 text-center leading-tight">{fmtDob}</span>
                  <span className="text-[9px] font-bold text-slate-400">DOB</span>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                <SectionTitle icon={GraduationCap} title="Academic Details" />
                <div className="space-y-0">
                  <ProfileField label="Admission No." value={currentStudent.admissionNo} />
                  <ProfileField label="Roll Number" value={currentStudent.rollNo || '—'} />
                  <ProfileField label="Class & Section"
                    value={currentStudent.className ? `${currentStudent.className} – ${currentStudent.section}` : 'Unassigned'} />
                  {currentStudent.stream && <ProfileField label="Stream" value={currentStudent.stream} />}
                  <ProfileField label="Academic Year"
                    value={academicYears.find(y => y.id === currentStudent.academicYearId)?.name
                      ?? (currentStudent.academicYearId ? 'Unknown Year' : 'Not assigned')} />
                  <ProfileField label="Admission Date" value={fmtAdm} />
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                <SectionTitle icon={Shield} title="Identity & Documents" />
                <div className="space-y-0">
                  <ProfileField label="Aadhaar No."
                    value={currentStudent.aadhaarNo ? `XXXX-XXXX-${currentStudent.aadhaarNo.slice(-4)}` : '—'} />
                  <ProfileField label="Birth Cert No." value={currentStudent.birthCertNo} />
                  <ProfileField label="PEN Number" value={currentStudent.penNumber} />
                  <ProfileField label="TC Number" value={currentStudent.tcNumber} />
                  <ProfileField label="Religion" value={currentStudent.religion} />
                  <ProfileField label="Category / Caste" value={currentStudent.caste} />
                  <ProfileField label="RTE Status"
                    value={
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${currentStudent.rte ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                        {currentStudent.rte ? 'RTE Admitted' : 'No'}
                      </span>
                    } />
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                <SectionTitle icon={HomeIcon} title="Contact & Address" />
                <div className="space-y-0">
                  {currentStudent.phone && <ProfileField label="Phone" value={currentStudent.phone} icon={Phone} />}
                  {currentStudent.email && <ProfileField label="Email" value={currentStudent.email} icon={Mail} />}
                  {currentStudent.address && <ProfileField label="Address" value={currentStudent.address} />}
                </div>
              </div>
            </>
          )}

          {/* ── ALLOTMENT TAB ─────────────────────────── */}
          {activeProfileTab === 'ALLOTMENT' && (
            <>
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                <SectionTitle icon={GraduationCap} title="Class Allotment" />
                {currentStudent.className ? (
                  <>
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      <div className="bg-indigo-50 rounded-xl p-3 text-center">
                        <div className="text-base font-black text-indigo-700">{stripClassPrefix(currentStudent.className)}</div>
                        <div className="text-[9px] font-bold text-indigo-400 mt-0.5">Class</div>
                      </div>
                      <div className="bg-violet-50 rounded-xl p-3 text-center">
                        <div className="text-base font-black text-violet-700">{currentStudent.section || '—'}</div>
                        <div className="text-[9px] font-bold text-violet-400 mt-0.5">Section</div>
                      </div>
                      <div className="bg-emerald-50 rounded-xl p-3 text-center">
                        <div className="text-base font-black text-emerald-700">{currentStudent.rollNo || '—'}</div>
                        <div className="text-[9px] font-bold text-emerald-400 mt-0.5">Roll No</div>
                      </div>
                    </div>
                    {editorModeActive ? (
                      <button
                        onClick={() => setAssignTarget(currentStudent)}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 text-white text-[11px] font-black rounded-xl active:scale-95 transition-transform">
                        <Edit2 size={13} /> Re-assign Class (Editor Mode)
                      </button>
                    ) : (
                      <div className="flex items-center gap-3 px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl">
                        <Lock size={14} className="text-slate-400 shrink-0" />
                        <p className="text-[10px] font-bold text-slate-500 leading-snug">
                          Assignment locked. Go to <span className="text-indigo-600">Settings → Editor Mode</span> to re-assign.
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2 px-3 py-3 bg-amber-50 border border-amber-200 rounded-xl mb-3">
                      <AlertTriangle size={14} className="text-amber-500 shrink-0" />
                      <p className="text-[10px] font-bold text-amber-700">Student not assigned to any class yet.</p>
                    </div>
                    <button
                      onClick={() => setAssignTarget(currentStudent)}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-[11px] font-black rounded-xl active:scale-95 transition-transform">
                      <UserCheck size={13} /> Assign to Class
                    </button>
                  </>
                )}
              </div>

              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                <SectionTitle icon={IndianRupee} title="Fee Allotment" />
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-slate-50 rounded-xl p-3 text-center">
                    <div className="text-sm font-black text-slate-700">₹{(currentStudent.totalFee / 1000).toFixed(0)}K</div>
                    <div className="text-[9px] font-bold text-slate-400 mt-0.5">Total</div>
                  </div>
                  <div className="bg-emerald-50 rounded-xl p-3 text-center">
                    <div className="text-sm font-black text-emerald-700">₹{(currentStudent.paidFee / 1000).toFixed(0)}K</div>
                    <div className="text-[9px] font-bold text-emerald-400 mt-0.5">Paid</div>
                  </div>
                  <div className="bg-rose-50 rounded-xl p-3 text-center">
                    <div className="text-sm font-black text-rose-600">₹{((currentStudent.totalFee - currentStudent.paidFee) / 1000).toFixed(0)}K</div>
                    <div className="text-[9px] font-bold text-rose-400 mt-0.5">Due</div>
                  </div>
                </div>
                {currentStudent.totalFee === 0 && (
                  <p className="text-[10px] font-bold text-slate-400 mt-3 text-center">
                    Fee schedule is generated when class is assigned.
                  </p>
                )}
              </div>

              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                <SectionTitle icon={Bus} title="Vehicle Allotment" />
                {studentTransport ? (
                  <>
                    <div className="space-y-0 mb-3">
                      <ProfileField label="Vehicle No." value={studentTransport.vehicle.vehicleNo} />
                      <ProfileField label="Route" value={studentTransport.vehicle.routeName || '—'} />
                      {studentTransport.assignment.boardingStopName && (
                        <ProfileField label="Stop" value={studentTransport.assignment.boardingStopName} />
                      )}
                      <ProfileField label="Monthly" value={`₹${studentTransport.assignment.monthlyAmount}`} />
                    </div>
                    {editorModeActive ? (
                      <button onClick={openChangeTransportModal}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-amber-500 text-white text-[11px] font-black rounded-xl active:scale-95">
                        <Edit2 size={13} /> Change Transport (Editor Mode)
                      </button>
                    ) : (
                      <div className="flex items-center gap-3 px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl">
                        <Lock size={14} className="text-slate-400 shrink-0" />
                        <p className="text-[10px] font-bold text-slate-500">Enable Editor Mode to change transport.</p>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-[10px] font-bold text-slate-400 mb-3">No transport assigned.</p>
                    <button onClick={openChangeTransportModal}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-[11px] font-black rounded-xl active:scale-95">
                      <Bus size={13} /> Assign Transport
                    </button>
                  </>
                )}
              </div>
            </>
          )}

          {/* ── FAMILY TAB ───────────────────────────── */}
          {activeProfileTab === 'FAMILY' && (
            <>
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-black text-sm">F</div>
                  <div>
                    <p className="text-sm font-black text-slate-900">{currentStudent.fatherName || 'Father'}</p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Father</p>
                  </div>
                </div>
                <div className="space-y-0">
                  <ProfileField label="Occupation" value={currentStudent.fatherOccupation} icon={Briefcase} />
                  <ProfileField label="Annual Income" value={currentStudent.fatherIncome} icon={TrendingUp} />
                  <ProfileField label="Phone" value={currentStudent.fatherPhone} icon={Phone} />
                  <ProfileField label="Email" value={currentStudent.fatherEmail} icon={Mail} />
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center font-black text-sm">M</div>
                  <div>
                    <p className="text-sm font-black text-slate-900">{currentStudent.motherName || 'Mother'}</p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Mother</p>
                  </div>
                </div>
                <div className="space-y-0">
                  <ProfileField label="Occupation" value={currentStudent.motherOccupation} icon={Briefcase} />
                  <ProfileField label="Phone" value={currentStudent.motherPhone} icon={Phone} />
                </div>
              </div>

              {currentStudent.guardianName && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-black text-sm">G</div>
                    <div>
                      <p className="text-sm font-black text-slate-900">{currentStudent.guardianName}</p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Guardian</p>
                    </div>
                  </div>
                  <div className="space-y-0">
                    <ProfileField label="Relation" value={currentStudent.guardianRelation} />
                    <ProfileField label="Phone" value={currentStudent.guardianPhone} icon={Phone} />
                  </div>
                </div>
              )}

              {!currentStudent.fatherName && !currentStudent.motherName && (
                <div className="flex flex-col items-center py-12 text-slate-400">
                  <User size={32} className="mb-3 opacity-40" />
                  <p className="font-bold text-sm">No family info added</p>
                  <p className="text-xs font-bold mt-1 opacity-60">Fill parent details during admission</p>
                </div>
              )}
            </>
          )}

          {/* ── RESULTS TAB ──────────────────────────── */}
          {/* The Attendance summary block that used to live here was removed —
              the dedicated ATTENDANCE tab uses StudentAttendanceTab which
              reads the full daily grid (and works even when records aren't
              yet APPROVED, unlike the old academicRecord query that only
              counted approved months and silently looked empty). Keeping
              two attendance widgets in two tabs created the "I see 0% but
              the calendar tab is full" confusion. */}
          {activeProfileTab === 'RESULTS' && (
            <>
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                <SectionTitle icon={BarChart2} title="Exam Results" />
                {(academicRecord?.exams.length ?? 0) === 0 ? (
                  <div className="flex flex-col items-center py-8 text-slate-400">
                    <BarChart2 size={28} className="mb-2 opacity-40" />
                    <p className="font-bold text-sm">No results yet</p>
                    <p className="text-xs font-bold mt-1 opacity-60">Results will appear once uploaded by teacher</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {academicRecord?.exams.map(exam => {
                      const pct = Math.round((exam.obtainedMarks / exam.maxMarks) * 100);
                      return (
                        <div key={exam.id} className="bg-slate-50 rounded-xl p-3">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <div className="font-black text-slate-900 text-sm">{exam.examName}</div>
                              <div className="text-[10px] font-bold text-slate-400 mt-0.5">{exam.subject} · {exam.date}</div>
                            </div>
                            <div className="text-right">
                              <div className={`text-lg font-black ${pct >= 75 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-rose-500'}`}>
                                {exam.grade}
                              </div>
                              <div className="text-[10px] font-bold text-slate-400">{exam.obtainedMarks}/{exam.maxMarks}</div>
                            </div>
                          </div>
                          <div className="bg-white rounded-full h-1.5">
                            <div className={`h-1.5 rounded-full ${pct >= 75 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-400' : 'bg-rose-400'}`}
                              style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── FEES TAB ─────────────────────────────── */}
          {activeProfileTab === 'FEES' && (() => {
            const instByMonth = feeInstallments.reduce<Record<string, FeeInstallment[]>>(
              (acc, inst) => {
                const key = inst.month;
                if (!acc[key]) acc[key] = [];
                acc[key].push(inst);
                return acc;
              }, {},
            );
            const monthEntries = (Object.entries(instByMonth) as [string, FeeInstallment[]][]).sort(
              ([, a], [, b]) => new Date(a[0].dueDate).getTime() - new Date(b[0].dueDate).getTime(),
            );
            const totalFee  = feeInstallments.reduce((s, i) => s + i.amount, 0);
            const totalPaid = feeInstallments.reduce((s, i) => s + i.paidAmount + i.writeOffAmount, 0);
            const totalDue  = Math.max(0, totalFee - totalPaid);
            const pct       = totalFee > 0 ? Math.round((totalPaid / totalFee) * 100) : 0;

            const statusBadge = (status: string) => {
              if (status === 'PAID')     return 'bg-emerald-100 text-emerald-700';
              if (status === 'PARTIAL')  return 'bg-amber-100 text-amber-700';
              if (status === 'WAIVED' || status === 'WRITTEN_OFF') return 'bg-slate-100 text-slate-500';
              if (status === 'CANCELLED') return 'bg-slate-100 text-slate-500 line-through';
              if (status === 'OVERDUE')  return 'bg-rose-200 text-rose-700';
              return 'bg-rose-100 text-rose-600';
            };

            return (
              <>
                {studentFeeStructure && (
                  <div className="bg-indigo-50 border border-indigo-100 rounded-2xl px-4 py-3 flex items-center gap-3">
                    <IndianRupee size={16} className="text-indigo-500 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[10px] font-black uppercase tracking-widest text-indigo-500">Fee Structure</div>
                      <div className="font-extrabold text-slate-800 text-sm truncate">{studentFeeStructure.name}</div>
                      <div className="text-[10px] font-bold text-slate-400">{studentFeeStructure.className} · {studentFeeStructure.billingCycle}</div>
                    </div>
                  </div>
                )}

                <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-5 text-white">
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/50 mb-3">
                    Fee Overview · {currentStudent.className || 'Unassigned'}
                  </p>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <div className="text-xl font-black text-white">₹{(totalFee / 1000).toFixed(1)}K</div>
                      <div className="text-[8px] font-bold text-white/40 uppercase mt-0.5">Total</div>
                    </div>
                    <div>
                      <div className="text-xl font-black text-emerald-400">₹{(totalPaid / 1000).toFixed(1)}K</div>
                      <div className="text-[8px] font-bold text-white/40 uppercase mt-0.5">Paid</div>
                    </div>
                    <div>
                      <div className="text-xl font-black text-rose-400">₹{(totalDue / 1000).toFixed(1)}K</div>
                      <div className="text-[8px] font-bold text-white/40 uppercase mt-0.5">Due</div>
                    </div>
                  </div>
                  <div className="mt-4 bg-white/10 rounded-full h-2">
                    <div className="h-2 rounded-full bg-emerald-400 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-[9px] font-bold text-white/40">0%</span>
                    <span className="text-[9px] font-black text-emerald-400">{pct}% paid</span>
                    <span className="text-[9px] font-bold text-white/40">100%</span>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                  <SectionTitle icon={History} title="Fee Payment History" />
                  {feePaymentHistory.length === 0 ? (
                    <p className="text-xs font-bold text-slate-400">No payment entries yet</p>
                  ) : (
                    <div className="space-y-2">
                      {feePaymentHistory.slice(0, 20).map(p => (
                        <div key={p.id} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="text-xs font-black text-slate-800">₹{p.amount.toLocaleString('en-IN')} · {p.method}</p>
                              <p className="text-[10px] font-bold text-slate-500">{p.date} · Receipt {p.receiptNo}</p>
                            </div>
                            {p.advanceAmount > 0 && (
                              <span className="text-[9px] font-black bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                                Advance ₹{p.advanceAmount.toLocaleString('en-IN')}
                              </span>
                            )}
                          </div>
                          {p.installmentDetails.length > 0 && (
                            <p className="text-[10px] font-bold text-slate-500 mt-1">
                              {p.installmentDetails.map(d => `${d.month} ${d.feeType}`).join(' · ')}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {feeInstallments.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center py-10 text-slate-400">
                    <IndianRupee size={28} className="mb-2 opacity-40" />
                    <p className="font-bold text-sm">No fee schedule for this year</p>
                    {!currentStudent.className && (
                      <p className="text-xs font-bold mt-1 text-slate-400 opacity-60">Assign student to a class first</p>
                    )}
                    {currentStudent.className && !studentFeeStructure && (
                      <p className="text-xs font-bold mt-1 text-slate-400 opacity-60">
                        No fee structure configured for {currentStudent.className}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {monthEntries.map(([month, insts]) => {
                      const monthTotal = insts.reduce((s, i) => s + i.amount, 0);
                      const monthPaid  = insts.reduce((s, i) => s + i.paidAmount + i.writeOffAmount, 0);
                      const monthDue   = Math.max(0, monthTotal - monthPaid);
                      const allPaid    = insts.every(i => i.status === 'PAID' || i.status === 'WAIVED' || i.status === 'WRITTEN_OFF');
                      return (
                        <div key={month} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${allPaid ? 'border-emerald-100' : 'border-slate-100'}`}>
                          <div className={`flex items-center justify-between px-4 py-2.5 ${allPaid ? 'bg-emerald-50' : 'bg-slate-50'}`}>
                            <div className="flex items-center gap-2">
                              <Calendar size={13} className={allPaid ? 'text-emerald-600' : 'text-slate-500'} />
                              <span className="font-black text-slate-800 text-sm">{month}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {allPaid
                                ? <span className="text-[9px] font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">PAID</span>
                                : monthDue > 0 && (
                                  <span className="text-[10px] font-black text-rose-600">₹{monthDue.toLocaleString('en-IN')} due</span>
                                )
                              }
                            </div>
                          </div>
                          <div className="divide-y divide-slate-50 px-4">
                            {insts.map(inst => {
                              const instDue = Math.max(0, inst.amount - inst.paidAmount - inst.writeOffAmount);
                              return (
                                <div key={inst.id} className="flex items-center justify-between py-2.5 gap-3">
                                  <div className="flex-1 min-w-0">
                                    <div className="font-bold text-slate-700 text-sm capitalize">
                                      {inst.feeType.replace('_', ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}
                                    </div>
                                    <div className="text-[10px] font-bold text-slate-400">Due: {inst.dueDate}</div>
                                  </div>
                                  <div className="flex flex-col items-end gap-1 shrink-0">
                                    <span className="font-black text-slate-900 text-sm">₹{inst.amount.toLocaleString('en-IN')}</span>
                                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${statusBadge(inst.status)}`}>
                                      {inst.status}
                                    </span>
                                    {instDue > 0 && (
                                      <button onClick={() => openFeePayModal(inst)}
                                        className="text-[9px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-xl active:scale-95 transition-transform">
                                        Collect ₹{instDue.toLocaleString('en-IN')}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <div className="flex items-center justify-between px-4 py-2 border-t border-slate-100 bg-slate-50/60">
                            <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">Month Total</span>
                            <span className="font-black text-slate-700 text-sm">₹{monthTotal.toLocaleString('en-IN')}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            );
          })()}

          {/* ── ATTENDANCE TAB ────────────────────────── */}
          {activeProfileTab === 'ATTENDANCE' && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <StudentAttendanceTab studentId={currentStudent.id} />
            </div>
          )}

          {/* ── CLASS HISTORY / TIMELINE TAB ─────────── */}
          {activeProfileTab === 'CLASS_HISTORY' && (() => {
            const tlConfig: Record<string, { icon: React.ComponentType<{ size?: number; className?: string }>; dot: string; card: string; label: string }> = {
              ADMISSION:        { icon: UserPlus,       dot: 'bg-indigo-600',  card: 'bg-indigo-50 border-indigo-200',  label: 'Admission' },
              CLASS_ASSIGNED:   { icon: BookmarkCheck,  dot: 'bg-emerald-500', card: 'bg-emerald-50 border-emerald-200', label: 'Class Assign' },
              FEE_STRUCTURE:    { icon: Banknote,        dot: 'bg-violet-500',  card: 'bg-violet-50 border-violet-200',  label: 'Fee' },
              TRANSPORT_ADDED:  { icon: Truck,           dot: 'bg-sky-500',     card: 'bg-sky-50 border-sky-200',        label: 'Transport' },
              TRANSPORT_REMOVED:{ icon: TruckIcon,       dot: 'bg-orange-400',  card: 'bg-orange-50 border-orange-200',  label: 'Transport' },
              PROMOTED:         { icon: ArrowUpCircle,   dot: 'bg-teal-500',    card: 'bg-teal-50 border-teal-200',      label: 'Promotion' },
              TC_ISSUED:        { icon: FileX,           dot: 'bg-rose-500',    card: 'bg-rose-50 border-rose-200',      label: 'TC' },
              READMITTED:       { icon: RotateCcw,       dot: 'bg-amber-500',   card: 'bg-amber-50 border-amber-200',    label: 'Rejoin' },
            };
            const fmtDate = (d: string) => {
              try {
                return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
              } catch { return d; }
            };
            return (
              <>
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                  <SectionTitle icon={History} title="Student Timeline" />
                  {timelineLoading ? (
                    <div className="flex flex-col items-center py-10 text-slate-400">
                      <div className="w-6 h-6 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
                      <p className="font-bold text-xs mt-3">Loading timeline…</p>
                    </div>
                  ) : timeline.length === 0 ? (
                    <div className="flex flex-col items-center py-10 text-slate-400">
                      <History size={28} className="mb-2 opacity-40" />
                      <p className="font-bold text-sm">No history yet</p>
                      <p className="text-xs font-bold mt-1 opacity-60">Events will appear as the student progresses</p>
                    </div>
                  ) : (
                    <div className="relative mt-2">
                      {/* vertical line */}
                      <div className="absolute left-5 top-3 bottom-3 w-0.5 bg-slate-100" />
                      <div className="space-y-3">
                        {[...timeline].reverse().map((ev, idx) => {
                          const cfg = tlConfig[ev.type] ?? tlConfig['ADMISSION'];
                          const Icon = cfg.icon;
                          const isFirst = idx === 0;
                          return (
                            <div key={idx} className="relative flex gap-3 pl-12">
                              {/* dot */}
                              <div className={`absolute left-3 top-3 w-5 h-5 rounded-full flex items-center justify-center border-2 border-white shadow-sm ${cfg.dot} ${isFirst ? 'ring-2 ring-offset-1 ring-indigo-300' : ''}`}>
                                <Icon size={10} className="text-white" />
                              </div>
                              {/* card */}
                              <div className={`flex-1 rounded-2xl border px-4 py-3 ${cfg.card}`}>
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-black text-slate-800 leading-tight">{ev.label}</p>
                                    {ev.sub && (
                                      <p className="text-[11px] font-bold text-slate-500 mt-0.5 truncate">{ev.sub}</p>
                                    )}
                                  </div>
                                  <div className="shrink-0 text-right">
                                    <p className="text-[10px] font-black text-slate-500 whitespace-nowrap">{fmtDate(ev.date)}</p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Academic year cards (kept below timeline) */}
                {classHistory.length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                    <SectionTitle icon={BookOpen} title="Academic Year Records" />
                    <div className="space-y-3 mt-2">
                      {classHistory.map((entry) => {
                        const isCurrentYear = entry.academic_year_id === activeYear?.id;
                        const due = Math.max(0, (entry.total_fee ?? 0) - (entry.paid_fee ?? 0));
                        const histPct = (entry.total_fee ?? 0) > 0
                          ? Math.round(((entry.paid_fee ?? 0) / (entry.total_fee ?? 0)) * 100) : 0;
                        return (
                          <div key={entry.id} className={`rounded-2xl border p-4 ${isCurrentYear ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-100'}`}>
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${isCurrentYear ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                                  {(entry.academic_years as any)?.name ?? 'Unknown Year'}
                                </span>
                                {isCurrentYear && <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">Current</span>}
                              </div>
                              <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${
                                entry.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' :
                                entry.status === 'PASSED' ? 'bg-indigo-100 text-indigo-700' :
                                entry.status === 'FAILED' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-500'
                              }`}>{entry.status}</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2 mb-3">
                              {[
                                { v: stripClassPrefix(entry.class_name) || '—', l: 'Class' },
                                { v: entry.section ?? '—', l: 'Section' },
                                { v: entry.roll_no ?? '—', l: 'Roll' },
                              ].map(({ v, l }) => (
                                <div key={l} className="bg-white rounded-xl p-2 text-center border border-white/80">
                                  <div className="text-sm font-black text-slate-800">{v}</div>
                                  <div className="text-[9px] font-bold text-slate-400 mt-0.5">{l}</div>
                                </div>
                              ))}
                            </div>
                            {(entry.total_fee ?? 0) > 0 && (
                              <div className="bg-white rounded-xl border border-slate-100 px-3 py-2">
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Fee</span>
                                  <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                                    entry.fee_status === 'PAID' ? 'bg-emerald-100 text-emerald-700' :
                                    entry.fee_status === 'PARTIAL' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-600'
                                  }`}>{entry.fee_status}</span>
                                </div>
                                <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 mb-1.5">
                                  <span>₹{((entry.paid_fee ?? 0) / 1000).toFixed(1)}K paid</span>
                                  {due > 0 && <span className="text-rose-600">₹{(due / 1000).toFixed(1)}K due</span>}
                                </div>
                                <div className="bg-slate-100 rounded-full h-1.5">
                                  <div className={`h-1.5 rounded-full transition-all ${histPct === 100 ? 'bg-emerald-500' : histPct > 50 ? 'bg-amber-400' : 'bg-rose-400'}`} style={{ width: `${histPct}%` }} />
                                </div>
                                <div className="text-right text-[9px] font-black mt-0.5">
                                  <span className={entry.fee_status === 'PAID' ? 'text-emerald-600' : entry.fee_status === 'PARTIAL' ? 'text-amber-600' : 'text-rose-600'}>{histPct}%</span>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            );
          })()}

          {/* ── TRANSPORT TAB ─────────────────────────── */}
          {activeProfileTab === 'TRANSPORT' && (
            <>
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                <div className="flex items-center justify-between mb-2">
                  <SectionTitle icon={Bus} title="Transport Assignment" />
                  <button onClick={openChangeTransportModal}
                    className="text-[9px] font-black text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-full">
                    {studentTransport ? 'CHANGE' : 'ASSIGN'}
                  </button>
                </div>
                {studentTransport ? (
                  <div className="space-y-0">
                    <ProfileField label="Vehicle No." value={studentTransport.vehicle.vehicleNo} />
                    <ProfileField label="Type" value={studentTransport.vehicle.type} />
                    <ProfileField label="Route" value={studentTransport.vehicle.routeName} />
                    <ProfileField label="Boarding Stop" value={studentTransport.assignment.boardingStopName} />
                    <ProfileField label="Driver" value={studentTransport.vehicle.driverName} />
                    <ProfileField label="Driver Phone" value={studentTransport.vehicle.driverPhone} />
                    <ProfileField label="Monthly Fee"
                      value={`₹${studentTransport.assignment.monthlyAmount.toLocaleString('en-IN')}/mo`} />
                    <ProfileField label="Started"
                      value={studentTransport.assignment.startDate
                        ? new Date(studentTransport.assignment.startDate).toLocaleDateString()
                        : '—'} />
                    <div className="pt-3">
                      <button onClick={openCancelTransportModal}
                        className="w-full text-[10px] font-black text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-xl py-2 uppercase tracking-widest">
                        Cancel transport service
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center py-6 text-slate-400">
                    <Bus size={28} className="mb-2 opacity-40" />
                    <p className="font-bold text-sm">No active transport</p>
                    <p className="text-xs font-bold mt-1 opacity-60">Tap ASSIGN above to add</p>
                  </div>
                )}

                {transportHistoryError && (
                  <div className="mt-3 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 text-[10px] font-bold text-rose-700">
                    {transportHistoryError}
                  </div>
                )}
                {studentTransportHistory.length > 1 && (
                  <div className="mt-4 pt-3 border-t border-slate-100">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">
                      Assignment History
                    </p>
                    <div className="space-y-2">
                      {studentTransportHistory.map(h => {
                        const isActive = h.isActive;
                        return (
                          <div key={h.id}
                            className={`rounded-xl p-2.5 border ${isActive ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <Bus size={12} className={isActive ? 'text-emerald-600' : 'text-slate-400'} />
                                <span className={`text-xs font-black truncate ${isActive ? 'text-emerald-800' : 'text-slate-700'}`}>
                                  {h.vehicleNo ?? '—'} · {h.boardingStopName}
                                </span>
                              </div>
                              <span className={`text-[9px] font-black px-2 py-0.5 rounded-full shrink-0 ${
                                isActive ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
                              }`}>
                                {isActive ? 'ACTIVE' : 'CLOSED'}
                              </span>
                            </div>
                            <div className="mt-1 flex items-center justify-between text-[10px] font-bold text-slate-500">
                              <span>
                                {h.startDate ? new Date(h.startDate).toLocaleDateString() : '—'}
                                {' → '}
                                {h.endDate ? new Date(h.endDate).toLocaleDateString() : 'present'}
                              </span>
                              <span>₹{h.monthlyAmount.toLocaleString('en-IN')}/mo</span>
                            </div>
                            {(h.reason || h.endReason) && (
                              <div className="mt-1 text-[9px] font-bold text-slate-500 italic">
                                {h.reason && <>Started: {h.reason}</>}
                                {h.reason && h.endReason && ' · '}
                                {h.endReason && <>Ended: {h.endReason}</>}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── DOCS TAB ─────────────────────────────── */}
          {activeProfileTab === 'DOCS' && (
            <>
              {docsLoading && (
                <div className="flex flex-col items-center py-10 text-slate-400">
                  <div className="w-6 h-6 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
                  <p className="font-bold text-xs mt-3">Loading documents…</p>
                </div>
              )}
              {!docsLoading && (<>
              {/* Admission Form download — surfaced inside Docs (the natural
                  home for paperwork) instead of cluttering the profile header. */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                <SectionTitle icon={FileCheck} title="Admission Form" />
                <div className="flex items-center justify-between gap-3 mt-1">
                  <p className="text-[11px] font-bold text-slate-500 leading-relaxed">
                    Generate and download {currentStudent.name.split(' ')[0]}'s admission form for printing or filing.
                  </p>
                  <button
                    onClick={async () => {
                      if (!schoolInfo) {
                        try { const info = await schoolInfoService.get(); setSchoolInfo(info); } catch { /* ignore */ }
                      }
                      setShowAdmissionForm(true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[10px] uppercase tracking-widest rounded-xl active:scale-95 transition-all shrink-0">
                    <Download size={12} /> Form
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                <SectionTitle icon={FileText} title="Submitted Documents" />
                {profileDocsLive.length > 0 ? (
                  <div className="space-y-2">
                    {profileDocsLive.map(doc => (
                      <div key={doc.id} className="flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2.5">
                        <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-bold text-emerald-800 truncate block">
                            {doc.type.replace('_', ' ')}
                          </span>
                          <span className="text-[9px] font-bold text-emerald-600 truncate block">
                            {doc.name}
                            {doc.uploadedAt && ` · ${new Date(doc.uploadedAt).toLocaleDateString()}`}
                          </span>
                        </div>
                        <button onClick={() => openProfileDoc(doc)}
                          className="flex items-center gap-1 text-[9px] font-black text-emerald-700 bg-emerald-100 hover:bg-emerald-200 px-2 py-1 rounded-full shrink-0">
                          <Eye size={10}/> VIEW
                        </button>
                        <button onClick={() => downloadProfileDoc(doc)} title="Download"
                          className="flex items-center gap-0.5 text-[9px] font-black text-indigo-700 bg-indigo-100 hover:bg-indigo-200 px-2 py-1 rounded-full shrink-0">
                          <Download size={10} /> DL
                        </button>
                        {/* Delete only available in Editor Mode (server-side
                            audit log + same gate as Replace). */}
                        {editorModeActive && (
                          <button onClick={() => handleProfileDocRemove(doc.id)}
                            className="p-1 text-rose-500 hover:bg-rose-50 rounded shrink-0" title="Remove (Editor Mode)">
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center py-5 text-slate-400">
                    <FolderOpen size={24} className="mb-2 opacity-40" />
                    <p className="font-bold text-sm">No documents submitted</p>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                <SectionTitle icon={CreditCard} title="Document Checklist" />
                <p className="text-[10px] font-bold text-slate-400 mb-3">
                  Photo 1 MB · TC 3 MB · other documents 2 MB · JPG / PNG / WEBP / PDF
                </p>
                <div className="space-y-2">
                  {profileDocs.map(doc => {
                    const busy = profileDocUploading === doc.type;
                    // Replace = uploading on a slot that already has a doc.
                    // Replace requires Editor Mode; Upload (first time) is open.
                    const isReplace = doc.uploaded;
                    const replaceBlocked = isReplace && !editorModeActive;
                    return (
                      <div key={doc.type} className="flex items-center justify-between bg-slate-50 rounded-xl p-3 border border-slate-200">
                        <div className="flex items-center gap-3 flex-1">
                          {doc.uploaded
                            ? <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                            : <div className="w-4 h-4 rounded border-2 border-slate-300 shrink-0" />}
                          <span className={`text-sm font-bold ${doc.uploaded ? 'text-emerald-800' : 'text-slate-700'}`}>
                            {doc.name}
                          </span>
                        </div>
                        {replaceBlocked ? (
                          <span title="Replace requires Editor Mode (Settings → Security)"
                            className="text-[10px] font-black px-3 py-1.5 rounded-full bg-slate-100 text-slate-400 shrink-0">
                            Replace · Editor only
                          </span>
                        ) : (
                          <label className={`cursor-pointer shrink-0 ${busy ? 'pointer-events-none opacity-60' : ''}`}>
                            <input type="file" onChange={e => handleProfileDocUpload(e, doc.type, isReplace)}
                              className="hidden" disabled={busy}
                              accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf" />
                            <span className={`text-[10px] font-black px-3 py-1.5 rounded-full transition-colors ${
                              busy ? 'bg-slate-200 text-slate-500'
                              : doc.uploaded
                                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                            }`}>
                              {busy ? 'Uploading…' : doc.uploaded ? 'Replace' : 'Upload'}
                            </span>
                          </label>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              </>)}
            </>
          )}

        </div>
      </div>

      {/* ── Fee Payment Modal ─────────────────────────────────────── */}
      {feePayModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
             onClick={() => !feePayBusy && setFeePayModal(null)}>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md"
               onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
              <IndianRupee size={18} className="text-emerald-600" />
              <div className="flex-1">
                <h3 className="font-black text-slate-900 text-sm uppercase tracking-tight">Collect Fee</h3>
                <p className="text-[10px] font-bold text-slate-400">
                  {currentStudent.name} · {feePayModal.feeType.replace('_', ' ')} — {feePayModal.month}
                </p>
              </div>
              <button onClick={() => setFeePayModal(null)} disabled={feePayBusy}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 disabled:opacity-50 text-base leading-none">✕</button>
            </div>
            <div className="p-4 space-y-4">
              <div className="bg-rose-50 border border-rose-100 rounded-xl px-4 py-3 flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-rose-500">Outstanding Due</span>
                <span className="text-lg font-black text-rose-600">
                  ₹{(feePayModal.amount - feePayModal.paidAmount - feePayModal.writeOffAmount).toLocaleString('en-IN')}
                </span>
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 block mb-1.5">
                  Amount to Collect (₹)
                </label>
                <input type="number" min="1" value={feePayAmount}
                  onChange={e => setFeePayAmount(e.target.value)}
                  disabled={feePayBusy}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-black text-slate-900 text-base outline-none focus:border-emerald-500 focus:bg-white transition-colors disabled:opacity-50"
                  placeholder="Enter amount" />
                <p className="text-[9px] font-bold text-slate-400 mt-1">Partial payment allowed — will adjust against oldest dues</p>
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 block mb-1.5">Payment Method</label>
                <div className="grid grid-cols-5 gap-1.5">
                  {(['CASH', 'UPI', 'ONLINE', 'CHEQUE', 'DD'] as const).map(m => (
                    <button key={m} onClick={() => setFeePayMethod(m)} disabled={feePayBusy}
                      className={`py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                        feePayMethod === m
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 block mb-1.5">Payment Date</label>
                <input type="date" value={feePayDate}
                  onChange={e => setFeePayDate(e.target.value)}
                  disabled={feePayBusy}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-bold text-slate-800 text-sm outline-none focus:border-emerald-500 focus:bg-white transition-colors disabled:opacity-50" />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 block mb-1.5">Remark (Optional)</label>
                <input type="text" value={feePayNote}
                  onChange={e => setFeePayNote(e.target.value)}
                  disabled={feePayBusy}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-bold text-slate-800 text-sm outline-none focus:border-emerald-500 focus:bg-white transition-colors disabled:opacity-50"
                  placeholder="e.g. Cheque no. 123456" />
              </div>
              <button onClick={handleFeePaySubmit} disabled={feePayBusy || !feePayAmount}
                className="w-full py-3 bg-emerald-600 text-white font-black text-sm rounded-xl active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2">
                {feePayBusy
                  ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Processing…</>
                  : <><IndianRupee size={15} /> Confirm Collection · ₹{parseFloat(feePayAmount || '0').toLocaleString('en-IN')}</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Change Transport Modal ─────────────────────────────────── */}
      {changeModalOpen && (() => {
        const allVehicles = transportService.getVehicles();
        const pickedVehicle = allVehicles.find(v => v.id === changeVehicleId);
        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
               onClick={() => !changeBusy && setChangeModalOpen(false)}>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
                 onClick={e => e.stopPropagation()}>
              <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2 sticky top-0 bg-white">
                <Bus size={18} className="text-blue-600" />
                <div className="flex-1">
                  <h3 className="font-black text-slate-900 text-sm uppercase tracking-tight">
                    {studentTransport ? 'Change Transport' : 'Assign Transport'}
                  </h3>
                  <p className="text-[10px] font-bold text-slate-400">{currentStudent.name}</p>
                </div>
                <button onClick={() => setChangeModalOpen(false)} disabled={changeBusy}
                  className="p-1 hover:bg-slate-100 rounded-lg disabled:opacity-50">✕</button>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Vehicle</label>
                  <select value={changeVehicleId}
                    onChange={e => { setChangeVehicleId(e.target.value); setChangeStopId(''); }}
                    className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-500">
                    <option value="">— Select —</option>
                    {allVehicles.map(v => (
                      <option key={v.id} value={v.id}>{v.vehicleNo} ({v.type})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Boarding Stop</label>
                  <select value={changeStopId} onChange={e => setChangeStopId(e.target.value)}
                    disabled={!pickedVehicle}
                    className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-500 disabled:opacity-50">
                    <option value="">— Select —</option>
                    {(pickedVehicle?.stops ?? []).map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Monthly Fee (₹)</label>
                  <input type="number" min="0" value={changeMonthly}
                    onChange={e => setChangeMonthly(e.target.value)}
                    className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Effective From</label>
                  <input type="date" value={changeEffectiveDate}
                    onChange={e => setChangeEffectiveDate(e.target.value)}
                    className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Reason *</label>
                  <select value={changeReason} onChange={e => setChangeReason(e.target.value)}
                    className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-500">
                    {TRANSPORT_CHANGE_REASONS.filter(r => r.value !== 'CANCEL_SERVICE').map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                  <input type="text" value={changeReasonNote}
                    onChange={e => setChangeReasonNote(e.target.value)}
                    placeholder="Add a note (optional)"
                    className="w-full mt-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-blue-500" />
                </div>
                {studentTransport && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[10px] font-bold text-amber-800">
                    The current assignment will be closed on {changeEffectiveDate
                      ? new Date(new Date(changeEffectiveDate).getTime() - 86400000).toLocaleDateString()
                      : '—'}. Future-dated transport installments will be cancelled and a fresh schedule generated.
                  </div>
                )}
                {changeError && (
                  <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs font-bold text-rose-700">
                    {changeError}
                  </div>
                )}
              </div>
              <div className="px-4 py-3 border-t border-slate-100 flex gap-2 sticky bottom-0 bg-white">
                <button onClick={() => setChangeModalOpen(false)} disabled={changeBusy}
                  className="flex-1 bg-slate-100 text-slate-700 font-black text-xs uppercase tracking-widest rounded-xl py-2.5 disabled:opacity-50">
                  Cancel
                </button>
                <button onClick={handleChangeTransport} disabled={changeBusy}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-widest rounded-xl py-2.5 disabled:opacity-50">
                  {changeBusy ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Cancel Transport Modal ─────────────────────────────────── */}
      {cancelTransportOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
             onClick={() => !cancelTransportBusy && setCancelTransportOpen(false)}>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-sm"
               onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-100">
              <h3 className="font-black text-slate-900 text-sm uppercase tracking-tight">Cancel transport?</h3>
              <p className="text-[10px] font-bold text-slate-400 mt-1">{currentStudent.name} · ends today</p>
            </div>
            <div className="p-4 space-y-2">
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Reason *</label>
              <textarea value={cancelTransportReason}
                onChange={e => setCancelTransportReason(e.target.value)}
                rows={3}
                placeholder="e.g. Family is moving out of city"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-rose-500 resize-none" />
              <p className="text-[9px] font-bold text-slate-400">
                Future-dated transport installments will be cancelled. Paid receipts stay intact.
              </p>
            </div>
            <div className="px-4 py-3 border-t border-slate-100 flex gap-2">
              <button onClick={() => setCancelTransportOpen(false)} disabled={cancelTransportBusy}
                className="flex-1 bg-slate-100 text-slate-700 font-black text-xs uppercase tracking-widest rounded-xl py-2.5 disabled:opacity-50">
                Keep
              </button>
              <button onClick={handleCancelTransport} disabled={cancelTransportBusy}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs uppercase tracking-widest rounded-xl py-2.5 disabled:opacity-50">
                {cancelTransportBusy ? 'Cancelling…' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Class Assignment Modal ─────────────────────────────────── */}
      {assignTarget && (
        <StudentClassAssignmentModal
          student={assignTarget}
          onClose={() => setAssignTarget(null)}
          onSuccess={async () => {
            setAssignTarget(null);
            const refreshed = await studentService.getById(currentStudent.id);
            if (refreshed) {
              setCurrentStudent(refreshed);
              void loadCore(refreshed);
              onStudentChanged(refreshed);
            }
          }}
        />
      )}
    </div>
  );
};
