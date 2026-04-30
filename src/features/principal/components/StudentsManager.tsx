import React, { useEffect, useState } from 'react';
import {
  ArrowLeft, Plus, Search, Users, ChevronRight, User, Phone, Mail,
  IndianRupee, BookOpen, Calendar, CheckCircle2,
  X, FileText, BarChart2, FolderOpen, Copy, MapPin, FileCheck,
  Bus, Briefcase, Droplets, GraduationCap, Shield, Heart,
  CreditCard, Building2, TrendingUp, Home as HomeIcon,
  Archive, UserCheck, UserX, Award, Trash2, AlertTriangle, RefreshCw,
  Lock, Edit2, History,
} from 'lucide-react';
import { studentService } from '../../../services/student.service';
import { Student, CreateStudentInput, StudentAcademicRecord, STREAMS, STREAM_CLASSES, StudentStream, StudentDoc } from '../../../types/principal.types';
import { PaymentStatus, PAYMENT_COLORS } from '../../../config/constants';
import { useUIStore } from '../../../store/uiStore';
type ParentCredsView = { mobileNumber: string; password: string };
import { schoolInfoService, SchoolInfo } from '../../../services/schoolInfo.service';
import { AdmissionFormPrint } from '../../../components/AdmissionFormPrint';
import {
  transportService, TransportVehicle, StudentTransportAssignment,
  TRANSPORT_CHANGE_REASONS,
} from '../../../services/transport.service';
import { storageService } from '../../../services/storage.service';
import { StudentClassAssignmentModal } from './StudentClassAssignmentModal';
import { useAcademicYear } from '../../../context/AcademicYearContext';
import { principalService, FeeStructureRecord } from '../../../services/principal.service';
import { useEditorModeStore } from '../../../store/editorModeStore';
import { feeService, FeeInstallment } from '../../../services/fee.service';

const PAGE_SIZE = 50;

type MainView = 'MENU' | 'ADMISSION' | 'FEES' | 'CLASSES' | 'ARCHIVE';
type SubView = 'LIST' | 'CREATE' | 'PROFILE' | 'CLASS_DETAIL' | 'SECTION_DETAIL';
type ArchiveTab = 'ACTIVE' | 'INACTIVE' | 'TC_ISSUED' | 'ALUMNI' | 'UNASSIGNED';

const ARCHIVE_TABS: Array<{ key: ArchiveTab; label: string; icon: React.ComponentType<{ size?: number; className?: string }>; tone: string }> = [
  { key: 'ACTIVE',     label: 'Active',     icon: UserCheck,    tone: 'emerald' },
  { key: 'UNASSIGNED', label: 'Unassigned', icon: AlertTriangle, tone: 'amber' },
  { key: 'INACTIVE',   label: 'Failed/Suspended', icon: UserX,   tone: 'slate' },
  { key: 'TC_ISSUED',  label: 'TC Issued',  icon: FileCheck,    tone: 'rose' },
  { key: 'ALUMNI',     label: 'Alumni',     icon: Award,        tone: 'indigo' },
];

interface Props { onBack: () => void; initialView?: MainView; }

const CLASS_OPTIONS = ['Class 1','Class 2','Class 3','Class 4','Class 5','Class 6','Class 7','Class 8','Class 9','Class 10','Class 11','Class 12'];
const BLOOD_GROUPS = ['A+','A-','B+','B-','O+','O-','AB+','AB-'];

// Class/section/stream/totalFee deliberately blank — the new admission
// flow creates the student in the UNASSIGNED bucket and a separate
// "Assign to Class" modal handles class placement, fee schedule and
// transport in one transaction.
const BLANK_FORM: CreateStudentInput = {
  name: '', rollNo: '', admissionNo: '', className: '', section: '',
  dob: '', gender: 'MALE', bloodGroup: 'O+', aadhaarNo: '', phone: '',
  email: '', address: '', photo: '', fatherName: '', fatherPhone: '',
  motherName: '', motherPhone: '', academicYearId: '',
  admissionDate: new Date().toISOString().split('T')[0], totalFee: 0,
  religion: '', caste: '', penNumber: '', birthCertNo: '', tcNumber: '', rte: false,
  fatherOccupation: '', fatherIncome: '', fatherEmail: '', motherOccupation: '',
  guardianName: '', guardianPhone: '', guardianRelation: '',
};

interface FormWithParent extends CreateStudentInput {
  parentMobileNumber: string;
  parentName: string;
  parentEmail: string;
}

interface DocumentUpload {
  type: 'BIRTH_CERT' | 'TRANSFER_CERT' | 'AADHAAR' | 'PHOTO' | 'OTHER';
  name: string;
  uploaded: boolean;
}

const BLANK_FORM_WITH_PARENT: FormWithParent = {
  ...BLANK_FORM,
  parentMobileNumber: '',
  parentName: '',
  parentEmail: '',
};

export const StudentsManager: React.FC<Props> = ({ onBack, initialView }) => {
  const { showToast } = useUIStore();
  const { activeYear, academicYears } = useAcademicYear();
  const editorModeActive = useEditorModeStore(s => s.isActive());
  const [mainView, setMainView] = useState<MainView>(initialView ?? 'CLASSES');
  const [subView, setSubView] = useState<SubView>('LIST');
  const [students, setStudents] = useState<Student[]>([]);
  const [selected, setSelected] = useState<Student | null>(null);
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState<string>('ALL');
  const [form, setForm] = useState<FormWithParent>(BLANK_FORM_WITH_PARENT);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feeInstallments, setFeeInstallments] = useState<FeeInstallment[]>([]);
  const [studentFeeStructure, setStudentFeeStructure] = useState<FeeStructureRecord | null>(null);
  const [feePaymentHistory, setFeePaymentHistory] = useState<import('../../../services/fee.service').PaymentRecord[]>([]);
  const [academicRecord, setAcademicRecord] = useState<StudentAcademicRecord | null>(null);
  const [activeProfileTab, setActiveProfileTab] = useState<'INFO' | 'ALLOTMENT' | 'FAMILY' | 'RESULTS' | 'FEES' | 'DOCS'>('INFO');
  const [studentTransport, setStudentTransport] = useState<{ vehicle: TransportVehicle; assignment: StudentTransportAssignment } | null>(null);
  const [studentTransportHistory, setStudentTransportHistory] = useState<StudentTransportAssignment[]>([]);
  const [transportHistoryError, setTransportHistoryError] = useState<string | null>(null);

  // Change-transport modal
  const [changeModalOpen, setChangeModalOpen] = useState(false);
  const [changeVehicleId, setChangeVehicleId] = useState('');
  const [changeStopId, setChangeStopId] = useState('');
  const [changeMonthly, setChangeMonthly] = useState('500');
  const [changeEffectiveDate, setChangeEffectiveDate] = useState('');
  const [changeReason, setChangeReason] = useState('STOP_CHANGE');
  const [changeReasonNote, setChangeReasonNote] = useState('');
  const [changeBusy, setChangeBusy] = useState(false);
  const [changeError, setChangeError] = useState<string | null>(null);

  const [showCountAdmission, setShowCountAdmission] = useState(PAGE_SIZE);
  const [showCountArchive, setShowCountArchive] = useState(PAGE_SIZE);
  const [showCountFees, setShowCountFees] = useState(PAGE_SIZE);

  // Cancel-transport modal
  const [cancelTransportOpen, setCancelTransportOpen] = useState(false);
  const [cancelTransportReason, setCancelTransportReason] = useState('');
  const [cancelTransportBusy, setCancelTransportBusy] = useState(false);
  const [profileDocs, setProfileDocs] = useState<DocumentUpload[]>([
    { type: 'BIRTH_CERT',     name: 'Birth Certificate',   uploaded: false },
    { type: 'TRANSFER_CERT',  name: 'Transfer Certificate', uploaded: false },
    { type: 'AADHAAR',        name: 'Aadhaar Card',         uploaded: false },
    { type: 'PHOTO',          name: 'Student Photo',        uploaded: false },
    { type: 'OTHER',          name: 'Other Documents',      uploaded: false },
  ]);
  const [createdParent, setCreatedParent] = useState<ParentCredsView | null>(null);
  const [showParentModal, setShowParentModal] = useState(false);
  const [schoolInfo, setSchoolInfo] = useState<SchoolInfo | null>(null);
  const [showAdmissionForm, setShowAdmissionForm] = useState(false);
  const [documents, setDocuments] = useState<DocumentUpload[]>([
    { type: 'BIRTH_CERT', name: 'Birth Certificate', uploaded: false },
    { type: 'TRANSFER_CERT', name: 'Transfer Certificate', uploaded: false },
    { type: 'AADHAAR', name: 'Aadhaar Card', uploaded: false },
    { type: 'PHOTO', name: 'Student Photo', uploaded: false },
    { type: 'OTHER', name: 'Other Documents', uploaded: false },
  ]);

  // Archive state ─────────────────────────────────────────────────────────
  const [archiveTab, setArchiveTab] = useState<ArchiveTab>('ACTIVE');
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveStudents, setArchiveStudents] = useState<Student[]>([]);
  const [archiveCounts, setArchiveCounts] = useState<Record<ArchiveTab, number>>({
    ACTIVE: 0, INACTIVE: 0, TC_ISSUED: 0, ALUMNI: 0, UNASSIGNED: 0,
  });

  // DB-backed sections for the active academic year (includes empty sections)
  type DbSection = {
    id: string; className: string; section: string;
    studentCount: number; capacity: number;
    classTeacher: string | null; stream: string | null;
  };
  const [dbSections, setDbSections] = useState<DbSection[]>([]);
  const [assignTarget, setAssignTarget] = useState<Student | null>(null);
  const [tcModal, setTcModal] = useState<{ student: Student; tcNumber: string; reason: string } | null>(null);
  const [profileDocsLive, setProfileDocsLive] = useState<StudentDoc[]>([]);
  const [profileDocUploading, setProfileDocUploading] = useState<DocumentUpload['type'] | null>(null);

  useEffect(() => { void studentService.getAll().then(setStudents); }, [activeYear?.id]);
  useEffect(() => {
    if (!activeYear?.id) { setDbSections([]); return; }
    void principalService.getSectionsForYear(activeYear.id)
      .then(setDbSections).catch(() => setDbSections([]));
  }, [activeYear?.id]);
  useEffect(() => { schoolInfoService.get().then(setSchoolInfo).catch(() => setSchoolInfo(null)); }, []);

  const refreshArchive = React.useCallback(async () => {
    setArchiveLoading(true);
    try {
      // Load every bucket in parallel so the sub-tabs can show live counts
      // and the active tab gets its rows from the same fetch — no extra
      // round-trip.
      const buckets: ArchiveTab[] = ['ACTIVE', 'INACTIVE', 'TC_ISSUED', 'ALUMNI', 'UNASSIGNED'];
      const results = await Promise.all(
        buckets.map(b => studentService.getStudentsByArchiveStatus(b).catch(() => [])),
      );
      const counts: Record<ArchiveTab, number> = {
        ACTIVE: 0, INACTIVE: 0, TC_ISSUED: 0, ALUMNI: 0, UNASSIGNED: 0,
      };
      buckets.forEach((b, i) => { counts[b] = results[i].length; });
      setArchiveCounts(counts);
      const activeIdx = buckets.indexOf(archiveTab);
      setArchiveStudents(activeIdx >= 0 ? results[activeIdx] : []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load archive';
      showToast(msg, 'error');
    } finally {
      setArchiveLoading(false);
    }
  }, [archiveTab, showToast]);

  useEffect(() => {
    if (mainView === 'ARCHIVE') void refreshArchive();
  }, [mainView, refreshArchive, activeYear?.id]);

  useEffect(() => { setShowCountAdmission(PAGE_SIZE); }, [search]);
  useEffect(() => { setShowCountArchive(PAGE_SIZE); }, [search, archiveTab]);
  useEffect(() => { setShowCountFees(PAGE_SIZE); }, [search, classFilter]);

  const loadStudentData = async (student: Student) => {
    // Fetch docs from `student_documents` directly — getAll/getById return
    // an empty docs[] for performance, so the profile DOCS tab needs its
    // own load to show real storage-backed rows after refresh/reopen.
    //
    // Each call is isolated with allSettled so one failure (e.g. an
    // unassigned student has no academic record / empty academicYearId,
    // which would otherwise reject on the UUID cast) cannot blank the
    // whole profile.
    const hasYear = !!student.academicYearId;
    const [feesRes, recordRes, docsRes, structuresRes, payRes] = await Promise.allSettled([
      feeService.getStudentInstallmentsDirect(student.id, hasYear ? student.academicYearId : undefined),
      hasYear
        ? studentService.getAcademicRecord(student.id, student.academicYearId)
        : Promise.resolve(null),
      studentService.listDocuments(student.id),
      principalService.getFeeStructures(),
      (async () => {
        await feeService.refreshAll();
        return feeService.getPaymentHistory().filter(p => p.studentId === student.id);
      })(),
    ]);
    const insts = feesRes.status === 'fulfilled' ? feesRes.value : [];
    const record = recordRes.status === 'fulfilled' ? recordRes.value : null;
    const docs = docsRes.status === 'fulfilled' ? docsRes.value : [];
    const structures = structuresRes.status === 'fulfilled' ? structuresRes.value : [];
    const payments = payRes.status === 'fulfilled' ? payRes.value : [];
    setFeeInstallments(insts);
    setStudentFeeStructure(structures.find(s => s.className === student.className) ?? null);
    setAcademicRecord(record);
    setFeePaymentHistory(payments);
    setProfileDocsLive(docs);
    try {
      const assignment = transportService.getAssignmentForStudent(student.id);
      if (assignment) {
        const vehicle = transportService.getVehicleById(assignment.vehicleId);
        setStudentTransport(vehicle ? { vehicle, assignment } : null);
      } else {
        setStudentTransport(null);
      }
    } catch { setStudentTransport(null); }
    // Pull the full assignment timeline so the DOCS tab can render history.
    setTransportHistoryError(null);
    try {
      const history = await transportService.getTransportHistory(student.id);
      setStudentTransportHistory(history);
    } catch (e) {
      setStudentTransportHistory([]);
      setTransportHistoryError(e instanceof Error ? e.message : 'Could not load transport history');
    }
    // Mark each upload-checklist row as already done if a matching live
    // doc exists, so the principal can see at a glance what's missing.
    setProfileDocs(prev => prev.map(d => ({
      ...d,
      uploaded: docs.some(x => x.type === d.type),
    })));
  };

  const handleCreate = async () => {
    if (!form.name || !form.admissionNo) {
      showToast('Name and admission no. required', 'error');
      return;
    }
    if (!form.parentMobileNumber.trim()) {
      showToast('Parent mobile number required', 'error');
      return;
    }
    // Class/section/stream are NOT collected at admission anymore — the
    // student lands in the UNASSIGNED bucket and the principal places
    // them via the "Assign to Class" modal. So no stream guard here.

    setIsSubmitting(true);
    try {
      // student.service.create() handles the parent Auth account, parent_student_links,
      // duplicate-check (Aadhaar/father-mobile), per-year academic record, and audit log
      // — all atomically against Supabase. Canonicalize the parent mobile here so a
      // single value drives both the duplicate check and the auth-account provisioning.
      const { parentMobileNumber: _pm, parentName: _pn, parentEmail: _pe, ...rest } = form;
      const canonicalParentMobile = ((form.fatherPhone || form.parentMobileNumber || '').replace(/\D/g, '')).slice(-10);
      const studentData: CreateStudentInput = {
        ...rest,
        // Force class/section blank so the AR insert in create() is skipped
        // (UNASSIGNED bucket). totalFee is taken in the assignment modal.
        className: '', section: '', stream: undefined, totalFee: 0,
        fatherPhone: canonicalParentMobile,
        fatherName: rest.fatherName || form.parentName || 'Parent',
      };
      const { student, parent } = await studentService.create(studentData);

      if (parent) {
        if (parent.reused) {
          // Existing parent in another student record was linked, no new account.
          showToast(`${student.name} admitted — linked to existing parent account (${parent.mobile})`);
        } else {
          // Brand-new auth account: surface the temp creds (default password = mobile).
          setCreatedParent({ mobileNumber: parent.mobile, password: parent.mobile });
          setShowParentModal(true);
        }
      } else {
        showToast(`${student.name} admitted successfully`);
      }

      setStudents(prev => [...prev, student]);
      setSelected(student);
      setForm(BLANK_FORM_WITH_PARENT);
      setShowAdmissionForm(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Admission failed';
      showToast(msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMarkFeePaid = async (installment: FeeInstallment) => {
    const due = installment.amount - installment.paidAmount - installment.writeOffAmount;
    if (due <= 0) return;
    try {
      await feeService.refreshAll();
      await feeService.recordPayment(installment.studentId, due, 'CASH');
      const updated = await feeService.getStudentInstallmentsDirect(
        installment.studentId,
        selected?.academicYearId || undefined,
      );
      setFeeInstallments(updated);
      showToast('Payment recorded');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Payment failed', 'error');
    }
  };

  const handleDocumentUpload = (e: React.ChangeEvent<HTMLInputElement>, docType: DocumentUpload['type']) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const maxSizeBytes = 2 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      showToast(`File must be less than 2MB. Current: ${(file.size / 1024 / 1024).toFixed(1)}MB`, 'error');
      return;
    }
    setDocuments(prev => prev.map(d => d.type === docType ? { ...d, uploaded: true } : d));
    showToast(`${file.name} uploaded (${(file.size / 1024).toFixed(0)}KB)`);
  };

  const handleProfileDocUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    docType: DocumentUpload['type'],
  ) => {
    const file = e.target.files?.[0];
    if (!file || !selected) return;
    setProfileDocUploading(docType);
    try {
      const { path } = await storageService.uploadStudentDocument(selected.id, docType, file);
      const newDoc = await studentService.addDocumentRecord(selected.id, docType, path);
      // Add (or replace) the doc in the live list — profile DOCS tab reads
      // exclusively from profileDocsLive, so this drives both the "Submitted
      // Documents" rows and the checklist tick.
      setProfileDocsLive(prev => [
        newDoc,
        ...prev.filter(d => d.id !== newDoc.id && !(d.type === docType && d.storagePath === newDoc.storagePath)),
      ]);
      setProfileDocs(prev => prev.map(d => d.type === docType ? { ...d, uploaded: true } : d));
      showToast(`${file.name} uploaded`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      showToast(msg, 'error');
    } finally {
      setProfileDocUploading(null);
      // reset input so the same filename can be re-picked
      e.target.value = '';
    }
  };

  const openProfileDoc = async (doc: StudentDoc) => {
    try {
      const url = await storageService.getStudentDocumentSignedUrl(doc.storagePath);
      if (url) window.open(url, '_blank', 'noopener');
      else showToast('Could not open document', 'error');
    } catch {
      showToast('Could not open document', 'error');
    }
  };

  const handleProfileDocRemove = async (docId: string) => {
    if (!selected) return;
    if (!confirm('Remove this document?')) return;
    try {
      const removed = profileDocsLive.find(d => d.id === docId);
      await studentService.removeDocument(docId);
      const next = profileDocsLive.filter(d => d.id !== docId);
      setProfileDocsLive(next);
      // If no other doc of the same type remains, untick the checklist row.
      if (removed && !next.some(d => d.type === removed.type)) {
        setProfileDocs(prev => prev.map(d =>
          d.type === removed.type ? { ...d, uploaded: false } : d
        ));
      }
      showToast('Document removed');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Remove failed';
      showToast(msg, 'error');
    }
  };

  // ── Transport change/cancel handlers ───────────────────────────────────
  const openChangeTransportModal = () => {
    if (!selected) return;
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
    if (!selected) return;
    if (!changeVehicleId || !changeStopId) {
      setChangeError('Pick a vehicle and stop.'); return;
    }
    if (!changeEffectiveDate) {
      setChangeError('Pick an effective date.'); return;
    }
    const monthly = Number(changeMonthly);
    if (!Number.isFinite(monthly) || monthly < 0) {
      setChangeError('Monthly amount must be a positive number.'); return;
    }
    const reasonLabel = TRANSPORT_CHANGE_REASONS.find(r => r.value === changeReason)?.label ?? changeReason;
    const finalReason = changeReasonNote.trim()
      ? `${reasonLabel}: ${changeReasonNote.trim()}`
      : reasonLabel;

    setChangeBusy(true); setChangeError(null);
    try {
      await transportService.changeStudentTransport({
        studentId: selected.id,
        effectiveDate: changeEffectiveDate,
        newVehicleId: changeVehicleId,
        newStopId: changeStopId,
        newMonthlyAmount: monthly,
        reason: finalReason,
      });
      await loadStudentData(selected);
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
    if (!selected) return;
    if (!cancelTransportReason.trim()) {
      showToast('Please enter a reason for cancelling', 'error'); return;
    }
    setCancelTransportBusy(true);
    try {
      await transportService.removeStudentAssignment(selected.id, cancelTransportReason.trim());
      await loadStudentData(selected);
      setCancelTransportOpen(false);
      showToast('Transport cancelled');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not cancel transport', 'error');
    } finally {
      setCancelTransportBusy(false);
    }
  };

  // ── Archive lifecycle handlers ──────────────────────────────────────────
  const handleMarkFailed = async (student: Student) => {
    if (!confirm(`Mark ${student.name} as FAILED for the active year?`)) return;
    try {
      await studentService.markStudentFailed(student.id);
      showToast(`${student.name} marked as failed`);
      await refreshArchive();
      const all = await studentService.getAll(); setStudents(all);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed', 'error');
    }
  };

  const handleReadmit = async (student: Student) => {
    if (!confirm(`Re-admit ${student.name}? You'll need to assign them to a class next.`)) return;
    try {
      await studentService.readmitStudent(student.id);
      showToast(`${student.name} re-admitted — assign them to a class`);
      await refreshArchive();
      const all = await studentService.getAll(); setStudents(all);
      // Open the assignment modal next.
      const refreshed = await studentService.getById(student.id);
      if (refreshed) setAssignTarget(refreshed);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed', 'error');
    }
  };

  const handleIssueTC = async () => {
    if (!tcModal) return;
    const tcNum = tcModal.tcNumber.trim();
    if (!tcNum) { showToast('TC number required', 'error'); return; }
    try {
      await studentService.issueTC(tcModal.student.id, tcNum, tcModal.reason);
      showToast(`TC issued to ${tcModal.student.name}`);
      setTcModal(null);
      await refreshArchive();
      const all = await studentService.getAll(); setStudents(all);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed', 'error');
    }
  };

  const renderHeader = (title: string, back: () => void, action?: React.ReactNode) => (
    <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
      <div className="flex items-center gap-3">
        <button onClick={back} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">{title}</h2>
      </div>
      {action}
    </div>
  );

  // ─── PROFILE short-circuit ─────────────────────────────────────────────
  // Profile rendering is independent of the active mainView. It must be
  // checked BEFORE the mainView blocks because clicking a student from any
  // tab (Admission / Fees / Classes) only flips subView, leaving mainView
  // pointing at the source list — without this guard the source list would
  // re-render instead of the profile.
  const renderProfile = subView === 'PROFILE' && selected;

  // ─── MENU (Main Folders) ────────────────────────────────────────────────

  if (!renderProfile && mainView === 'MENU') return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader('Students', onBack)}
      <div className="flex-1 overflow-y-auto p-4  space-y-4">
        <div className="grid grid-cols-1 gap-3">
          {[
            { icon: FileText, label: 'Admission', desc: 'Add new students & generate forms', tone: 'indigo', action: () => { setMainView('ADMISSION'); setSubView('LIST'); } },
            { icon: Archive,  label: 'Archive',   desc: 'Active, inactive, TC issued, alumni & unassigned', tone: 'amber', action: () => { setMainView('ARCHIVE'); setSubView('LIST'); setArchiveTab('ACTIVE'); } },
            { icon: BookOpen, label: 'Classes',   desc: 'Browse students by class & section', tone: 'emerald', action: () => { setMainView('CLASSES'); setSubView('LIST'); } },
          ].map(({ icon: Icon, label, desc, tone, action }) => (
            <button key={label} onClick={action}
              className="flex items-center gap-4 bg-white rounded-2xl border border-slate-100 shadow-sm p-5 active:scale-95 transition-transform text-left">
              <div className={`w-12 h-12 rounded-xl bg-${tone}-50 text-${tone}-600 flex items-center justify-center shrink-0`}>
                <Icon size={24} />
              </div>
              <div className="flex-1">
                <div className="font-extrabold text-slate-900 text-base">{label}</div>
                <div className="text-[10px] font-bold text-slate-400 mt-1">{desc}</div>
              </div>
              <ChevronRight size={20} className="text-slate-300" />
            </button>
          ))}
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-2 mt-6">
          {[
            { label: 'Total', val: students.length, color: 'bg-slate-900 text-white' },
            { label: 'Fees Paid', val: students.filter(s => s.feeStatus === PaymentStatus.PAID).length, color: 'bg-emerald-50 text-emerald-700' },
            { label: 'Pending', val: students.filter(s => s.feeStatus === PaymentStatus.PENDING).length, color: 'bg-amber-50 text-amber-700' },
          ].map(({ label, val, color }) => (
            <div key={label} className={`rounded-2xl p-3 text-center ${color}`}>
              <div className="font-black text-lg">{val}</div>
              <div className="text-[9px] font-black uppercase tracking-widest mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ─── ADMISSION (Add/Search) ────────────────────────────────────────────

  if (!renderProfile && mainView === 'ADMISSION') {
    const filteredStudents = students
      .filter(s =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.rollNo.includes(search) || s.admissionNo.toLowerCase().includes(search.toLowerCase())
      )
      .sort((a, b) => new Date(b.admissionDate ?? 0).getTime() - new Date(a.admissionDate ?? 0).getTime());

    if (subView === 'CREATE') return (
      <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        {renderHeader('New Admission', () => setSubView('LIST'))}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Student Info</p>
            {[
              { label: 'Full Name *', key: 'name', placeholder: 'Student full name' },
              { label: 'Admission No. *', key: 'admissionNo', placeholder: 'ADM-2024-XXX' },
              { label: 'Aadhaar No.', key: 'aadhaarNo', placeholder: 'XXXX XXXX XXXX' },
              { label: 'Religion', key: 'religion', placeholder: 'e.g. Hindu, Muslim, Christian' },
              { label: 'Caste', key: 'caste', placeholder: 'e.g. General, OBC, SC, ST' },
              { label: 'PEN Number', key: 'penNumber', placeholder: 'Optional' },
              { label: 'Birth Certificate No.', key: 'birthCertNo', placeholder: 'Optional' },
            ].map(({ label, key, placeholder }) => (
              <div key={key}>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">{label}</label>
                <input value={(form as any)[key] ?? ''} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500 focus:bg-white transition-colors" />
              </div>
            ))}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Class assignment</p>
              <p className="text-[10px] font-bold text-amber-700 mt-1 leading-relaxed">
                Class, section, roll number and fee schedule are set in the next step
                via <b>Archive → Unassigned → Assign to Class</b> after admission.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Date of Birth</label>
                <input type="date" value={form.dob} onChange={e => setForm(f => ({ ...f, dob: e.target.value }))}
                  className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Blood Group</label>
                <select value={form.bloodGroup} onChange={e => setForm(f => ({ ...f, bloodGroup: e.target.value as any }))}
                  className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none focus:border-indigo-500">
                  {BLOOD_GROUPS.map(bg => <option key={bg}>{bg}</option>)}
                </select>
              </div>
            </div>
            {[
              { label: 'Phone', key: 'phone', placeholder: '+91 XXXXX XXXXX' },
              { label: 'Email', key: 'email', placeholder: 'student@school.edu.in' },
              { label: 'Address', key: 'address', placeholder: 'Full residential address' },
            ].map(({ label, key, placeholder }) => (
              <div key={key}>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">{label}</label>
                <input value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500" />
              </div>
            ))}
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Parent Mobile & Login</p>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-3">
              <p className="text-[10px] font-bold text-blue-700">
                Parent mobile number is used for app login. A temporary password will be created.
              </p>
            </div>
            {[
              { label: 'Parent Mobile Number *', key: 'parentMobileNumber', placeholder: '10-digit mobile' },
              { label: 'Parent Name *', key: 'parentName', placeholder: 'Mother or Father name' },
              { label: 'Parent Email', key: 'parentEmail', placeholder: 'parent@email.com' },
            ].map(({ label, key, placeholder }) => (
              <div key={key}>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">{label}</label>
                <input value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500" />
              </div>
            ))}
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Parent Details</p>
            {[
              { label: "Father's Name", key: 'fatherName', placeholder: 'Full name' },
              { label: "Father's Occupation", key: 'fatherOccupation', placeholder: 'Business / Service / Farmer / etc.' },
              { label: "Father's Income", key: 'fatherIncome', placeholder: 'e.g. 5-10 LPA' },
              { label: "Father's Email", key: 'fatherEmail', placeholder: 'father@email.com' },
              { label: "Father's Phone", key: 'fatherPhone', placeholder: '+91 XXXXX XXXXX' },
              { label: "Mother's Name", key: 'motherName', placeholder: 'Full name' },
              { label: "Mother's Occupation", key: 'motherOccupation', placeholder: 'Occupation or Homemaker' },
              { label: "Mother's Phone", key: 'motherPhone', placeholder: '+91 XXXXX XXXXX' },
            ].map(({ label, key, placeholder }) => (
              <div key={key}>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">{label}</label>
                <input value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500" />
              </div>
            ))}
            <div className="flex items-center gap-2">
              <input type="checkbox" id="rte" checked={form.rte} onChange={e => setForm(f => ({ ...f, rte: e.target.checked }))}
                className="w-4 h-4 rounded" />
              <label htmlFor="rte" className="text-xs font-bold text-slate-600">RTE (Right to Free Education)</label>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Documents Checklist</p>
            <p className="text-[10px] font-bold text-slate-500 mb-3">Upload required documents. Max 2MB per file.</p>
            <div className="space-y-2">
              {documents.map(doc => (
                <div key={doc.type} className="flex items-center justify-between bg-slate-50 rounded-xl p-3 border border-slate-200">
                  <label className="flex items-center gap-3 flex-1 cursor-pointer">
                    <input type="checkbox" checked={doc.uploaded} readOnly className="w-4 h-4 rounded" />
                    <span className="text-sm font-bold text-slate-700">{doc.name}</span>
                  </label>
                  <label className="cursor-pointer">
                    <input type="file" onChange={(e) => handleDocumentUpload(e, doc.type)} className="hidden" accept="image/*,.pdf,.doc,.docx" />
                    <span className={`text-[10px] font-black px-3 py-1.5 rounded-full ${doc.uploaded ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'} transition-colors`}>
                      {doc.uploaded ? '✓ Done' : 'Upload'}
                    </span>
                  </label>
                </div>
              ))}
            </div>
          </div>

          <button onClick={handleCreate} disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg disabled:opacity-60">
            {isSubmitting ? 'Admitting…' : <><Plus size={16} /> Admit Student</>}
          </button>
        </div>
      </div>
    );

    return (
      <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        <div className="sticky top-0 z-10 bg-white border-b border-slate-100 shadow-sm">
          <div className="px-4 pt-4 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
                <ArrowLeft size={20} />
              </button>
              <div>
                <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Admission</h2>
                <p className="text-[10px] font-bold text-slate-400">{filteredStudents.length} of {students.length} students</p>
              </div>
            </div>
            <button onClick={() => setSubView('CREATE')}
              className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white font-black text-xs rounded-xl shadow-md active:scale-95 transition-transform">
              <Plus size={14} /> New
            </button>
          </div>
          <div className="px-4 pb-3">
            <div className="relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, roll no or admission no…"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 font-bold text-sm outline-none focus:border-indigo-500 focus:bg-white transition-colors" />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-2">
            {filteredStudents.slice(0, showCountAdmission).map(student => {
              const initials = student.name.split(' ').map(w => w[0]).join('').slice(0, 2);
              return (
                <button key={student.id}
                  onClick={() => { setSelected(student); loadStudentData(student); setActiveProfileTab('INFO'); setSubView('PROFILE'); }}
                  className="w-full bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-left active:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-400 to-violet-500 text-white flex items-center justify-center font-black text-sm shrink-0">
                      {initials.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-extrabold text-slate-900 text-sm truncate">{student.name}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] font-bold text-slate-400">
                          {student.className ? `${student.className}·${student.section}` : 'Unassigned'}
                        </span>
                        <span className="text-[9px] font-bold text-slate-300">·</span>
                        <span className="text-[10px] font-bold text-indigo-500">{student.admissionNo}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${
                        student.feeStatus === PaymentStatus.PAID ? 'bg-emerald-100 text-emerald-700' :
                        student.feeStatus === 'PARTIAL' ? 'bg-amber-100 text-amber-700' :
                        'bg-rose-100 text-rose-600'
                      }`}>
                        {student.feeStatus}
                      </span>
                      <ChevronRight size={14} className="text-slate-300" />
                    </div>
                  </div>
                </button>
              );
            })}
            {filteredStudents.length === 0 && (
              <div className="flex flex-col items-center py-16 text-slate-400">
                <Users size={32} className="mb-3 opacity-40" />
                <p className="font-bold text-sm">{search ? 'No students found' : 'No students admitted yet'}</p>
                {!search && <p className="text-xs font-bold mt-1 opacity-60">Tap New to admit the first student</p>}
              </div>
            )}
            {showCountAdmission < filteredStudents.length && (
              <button onClick={() => setShowCountAdmission(c => c + PAGE_SIZE)}
                className="w-full py-3 mt-2 bg-white border border-slate-200 rounded-2xl text-xs font-black text-slate-500 uppercase tracking-widest active:scale-95 transition-transform">
                Load More ({filteredStudents.length - showCountAdmission} remaining)
              </button>
            )}
            {showCountAdmission >= filteredStudents.length && filteredStudents.length > PAGE_SIZE && (
              <p className="text-center text-[9px] font-bold text-slate-300 py-3">
                All {filteredStudents.length} students shown
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── ARCHIVE (Lifecycle buckets) ────────────────────────────────────────

  if (!renderProfile && mainView === 'ARCHIVE') {
    const filtered = archiveStudents.filter(s =>
      !search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.admissionNo.toLowerCase().includes(search.toLowerCase()) ||
      s.rollNo.includes(search)
    );

    return (
      <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        <div className="sticky top-0 z-10 bg-white border-b border-slate-100 shadow-sm">
          <div className="px-4 pt-4 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => setMainView('MENU')} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
                <ArrowLeft size={20} />
              </button>
              <div>
                <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Archive</h2>
                <p className="text-[10px] font-bold text-slate-400">{filtered.length} students in this view</p>
              </div>
            </div>
            <button onClick={refreshArchive}
              className="p-2 bg-slate-100 rounded-xl text-slate-600 active:scale-90"
              title="Refresh">
              <RefreshCw size={16} className={archiveLoading ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* Sub-tabs with live counts */}
          <div className="px-2 pb-2 flex gap-1 overflow-x-auto no-scrollbar">
            {ARCHIVE_TABS.map(({ key, label, icon: Icon, tone }) => {
              const count = archiveCounts[key] ?? 0;
              const active = archiveTab === key;
              return (
                <button key={key} onClick={() => setArchiveTab(key)}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black transition-all
                    ${active
                      ? `bg-${tone}-600 text-white shadow-sm`
                      : `bg-slate-50 text-slate-600 hover:bg-slate-100`}`}>
                  <Icon size={13} />{label}
                  <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-black ${
                    active ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'
                  }`}>{count}</span>
                </button>
              );
            })}
          </div>

          <div className="px-4 pb-3">
            <div className="relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search in this bucket…"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 font-bold text-sm outline-none focus:border-indigo-500 focus:bg-white transition-colors" />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {archiveLoading && (
            <div className="flex flex-col items-center py-12 text-slate-400">
              <div className="w-7 h-7 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
              <p className="font-bold text-xs mt-3">Loading…</p>
            </div>
          )}
          {!archiveLoading && filtered.length === 0 && (
            <div className="flex flex-col items-center py-16 text-slate-400">
              <Archive size={32} className="mb-3 opacity-40" />
              <p className="font-bold text-sm">No students in this bucket</p>
            </div>
          )}
          <div className="space-y-2">
            {filtered.slice(0, showCountArchive).map(student => {
              const initials = student.name.split(' ').map(w => w[0]).join('').slice(0, 2);
              const isUnassigned = !student.className;
              return (
                <div key={student.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3">
                  <button
                    onClick={() => { setSelected(student); loadStudentData(student); setActiveProfileTab('INFO'); setSubView('PROFILE'); }}
                    className="w-full flex items-center gap-3 text-left active:bg-slate-50 transition-colors p-1 rounded-xl">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-400 to-violet-500 text-white flex items-center justify-center font-black text-sm shrink-0">
                      {initials.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-extrabold text-slate-900 text-sm truncate">{student.name}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] font-bold text-slate-400">
                          {isUnassigned ? 'Unassigned' : `${student.className}-${student.section} · Roll ${student.rollNo || '—'}`}
                        </span>
                        <span className="text-[9px] font-bold text-slate-300">·</span>
                        <span className="text-[10px] font-bold text-indigo-500">{student.admissionNo}</span>
                      </div>
                    </div>
                    <ChevronRight size={14} className="text-slate-300" />
                  </button>

                  {/* Per-row actions */}
                  <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-slate-100">
                    {(archiveTab === 'UNASSIGNED' || archiveTab === 'ACTIVE' || archiveTab === 'INACTIVE') && (
                      <button onClick={() => setAssignTarget(student)}
                        className="flex-1 min-w-[110px] px-3 py-1.5 bg-indigo-600 text-white text-[10px] font-black rounded-lg active:scale-95 flex items-center justify-center gap-1">
                        <UserCheck size={11} /> {isUnassigned ? 'Assign to Class' : 'Re-assign'}
                      </button>
                    )}
                    {archiveTab === 'ACTIVE' && (
                      <button onClick={() => handleMarkFailed(student)}
                        className="flex-1 min-w-[100px] px-3 py-1.5 bg-amber-100 text-amber-700 text-[10px] font-black rounded-lg active:scale-95 flex items-center justify-center gap-1">
                        <AlertTriangle size={11} /> Mark Failed
                      </button>
                    )}
                    {(archiveTab === 'ACTIVE' || archiveTab === 'INACTIVE' || archiveTab === 'UNASSIGNED') && (
                      <button onClick={() => setTcModal({ student, tcNumber: '', reason: '' })}
                        className="flex-1 min-w-[100px] px-3 py-1.5 bg-rose-100 text-rose-700 text-[10px] font-black rounded-lg active:scale-95 flex items-center justify-center gap-1">
                        <FileCheck size={11} /> Issue TC
                      </button>
                    )}
                    {(archiveTab === 'TC_ISSUED' || archiveTab === 'INACTIVE') && (
                      <button onClick={() => handleReadmit(student)}
                        className="flex-1 min-w-[100px] px-3 py-1.5 bg-emerald-100 text-emerald-700 text-[10px] font-black rounded-lg active:scale-95 flex items-center justify-center gap-1">
                        <RefreshCw size={11} /> Re-admit
                      </button>
                    )}
                    {archiveTab === 'TC_ISSUED' && student.tcNumber && (
                      <span className="px-2 py-1.5 bg-slate-100 text-slate-600 text-[9px] font-black rounded-lg">
                        TC #{student.tcNumber}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            {showCountArchive < filtered.length && (
              <button onClick={() => setShowCountArchive(c => c + PAGE_SIZE)}
                className="w-full py-3 mt-2 bg-white border border-slate-200 rounded-2xl text-xs font-black text-slate-500 uppercase tracking-widest active:scale-95 transition-transform">
                Load More ({filtered.length - showCountArchive} remaining)
              </button>
            )}
            {showCountArchive >= filtered.length && filtered.length > PAGE_SIZE && (
              <p className="text-center text-[9px] font-bold text-slate-300 py-3">
                All {filtered.length} students shown
              </p>
            )}
          </div>
        </div>

        {/* Class assignment modal */}
        {assignTarget && (
          <StudentClassAssignmentModal
            student={assignTarget}
            onClose={() => setAssignTarget(null)}
            onSuccess={async () => {
              await refreshArchive();
              const all = await studentService.getAll(); setStudents(all);
            }}
          />
        )}

        {/* TC modal */}
        {tcModal && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-black text-slate-900">Issue Transfer Certificate</h3>
                  <p className="text-[11px] font-bold text-slate-500 mt-0.5">
                    {tcModal.student.name} · {tcModal.student.admissionNo}
                  </p>
                </div>
                <button onClick={() => setTcModal(null)} className="p-2 bg-slate-100 rounded-xl active:scale-95">
                  <X size={18} />
                </button>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500">TC Number *</label>
                  <input value={tcModal.tcNumber}
                    onChange={e => setTcModal(t => t ? { ...t, tcNumber: e.target.value } : t)}
                    placeholder="e.g. TC/2025/021"
                    className="w-full mt-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold" />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500">Reason (optional)</label>
                  <textarea value={tcModal.reason}
                    onChange={e => setTcModal(t => t ? { ...t, reason: e.target.value } : t)}
                    rows={2}
                    placeholder="Family relocating, change of school, etc."
                    className="w-full mt-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold resize-none" />
                </div>
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-3">
                  <p className="text-[10px] font-bold text-rose-700 leading-relaxed">
                    Issuing a TC marks this student inactive and disables the parent
                    portal login. Use <b>Re-admit</b> from the TC Issued tab to reverse.
                  </p>
                </div>
              </div>
              <div className="px-4 py-3 border-t border-slate-100 flex gap-2">
                <button onClick={() => setTcModal(null)}
                  className="flex-1 px-4 py-3 bg-slate-100 text-slate-700 font-black text-xs rounded-xl active:scale-95">
                  Cancel
                </button>
                <button onClick={handleIssueTC}
                  className="flex-1 px-4 py-3 bg-rose-600 text-white font-black text-xs rounded-xl active:scale-95">
                  Issue TC
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── FEES (Fee Collection) ──────────────────────────────────────────────

  if (!renderProfile && mainView === 'FEES') {
    const filteredFees = students.filter(s =>
      (classFilter === 'ALL' || s.className === classFilter) &&
      s.name.toLowerCase().includes(search.toLowerCase())
    );

    return (
      <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        {renderHeader('Fee Collection', () => setMainView('MENU'))}
        <div className="flex-1 overflow-y-auto p-4  space-y-3">
          <div className="relative">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name…"
              className="w-full bg-white border border-slate-200 rounded-2xl pl-11 pr-4 py-3 font-bold text-sm outline-none focus:border-indigo-500 shadow-sm" />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
            {['ALL', ...CLASS_OPTIONS.filter(c => students.some(s => s.className === c))].map(c => (
              <button key={c} onClick={() => setClassFilter(c)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors ${classFilter === c ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 border border-slate-200'}`}>
                {c}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            {filteredFees.slice(0, showCountFees).map(student => (
              <button key={student.id}
                onClick={() => { setSelected(student); loadStudentData(student); setActiveProfileTab('FEES'); setSubView('PROFILE'); }}
                className="w-full bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-left active:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-100 to-violet-100 text-indigo-700 flex items-center justify-center font-black text-sm shrink-0">
                    {student.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                  </div>
                  <div className="flex-1">
                    <div className="font-extrabold text-slate-900 text-sm">{student.name}</div>
                    <div className="text-[10px] font-bold text-slate-400 mt-0.5">
                      {student.className ? `${student.className}-${student.section}` : 'Unassigned'} · ₹{((student.totalFee - student.paidFee) / 1000).toFixed(0)}K due
                    </div>
                  </div>
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${PAYMENT_COLORS[student.feeStatus]}`}>
                    {student.feeStatus}
                  </span>
                </div>
              </button>
            ))}
            {showCountFees < filteredFees.length && (
              <button onClick={() => setShowCountFees(c => c + PAGE_SIZE)}
                className="w-full py-3 mt-2 bg-white border border-slate-200 rounded-2xl text-xs font-black text-slate-500 uppercase tracking-widest active:scale-95 transition-transform">
                Load More ({filteredFees.length - showCountFees} remaining)
              </button>
            )}
            {showCountFees >= filteredFees.length && filteredFees.length > PAGE_SIZE && (
              <p className="text-center text-[9px] font-bold text-slate-300 py-3">
                All {filteredFees.length} students shown
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── CLASSES (Class → Section → Students) ────────────────────────────────

  if (!renderProfile && mainView === 'CLASSES') {
    // Sort helper: Pre-KG → LKG → UKG → Class 1 … Class 12
    const sortClassNames = (a: string, b: string) => {
      const order = ['Pre-KG', 'LKG', 'UKG'];
      const ia = order.indexOf(a), ib = order.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return (parseInt(a.replace('Class ', ''), 10) || 0) - (parseInt(b.replace('Class ', ''), 10) || 0);
    };

    // Class list: use DB sections (shows classes even if no students assigned yet)
    // Falls back to student-derived list when DB sections haven't loaded.
    const classNames: string[] = dbSections.length
      ? [...new Set<string>(dbSections.map(s => s.className))].sort(sortClassNames)
      : [...new Set<string>(students.map(s => s.className).filter(Boolean) as string[])].sort(sortClassNames);

    // Sections for selected class: from DB (includes empty/unfilled sections)
    const classSections: DbSection[] = selectedClass
      ? dbSections.length
        ? dbSections.filter(s => s.className === selectedClass).sort((a, b) => a.section.localeCompare(b.section))
        : [...new Set(students.filter(s => s.className === selectedClass).map(s => s.section))].sort()
            .map(sec => ({ id: sec, className: selectedClass, section: sec, studentCount: 0, capacity: 45, classTeacher: null, stream: null }))
      : [];

    const classStudents = selectedClass && selectedSection
      ? students.filter(s => s.className === selectedClass && s.section === selectedSection)
      : [];

    // ── Student list in a section ──────────────────────────────────────────
    if (selectedClass && selectedSection) {
      const filteredClassStudents = classStudents.filter(s =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.rollNo.includes(search)
      );
      const secMeta = classSections.find(s => s.section === selectedSection);

      return (
        <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
          <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-3 sticky top-0 z-10 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <button onClick={() => { setSelectedSection(null); setSearch(''); }} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
                <ArrowLeft size={20} />
              </button>
              <div>
                <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">
                  {selectedClass.replace('Class ', '')}-{selectedSection}
                </h2>
                <p className="text-[10px] font-bold text-slate-400">
                  {classStudents.length}{secMeta?.capacity ? `/${secMeta.capacity}` : ''} students
                  {secMeta?.classTeacher ? ` · ${secMeta.classTeacher}` : ''}
                </p>
              </div>
            </div>
            <div className="relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by name or roll no..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 font-bold text-sm outline-none focus:border-indigo-500 focus:bg-white transition-colors" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              {filteredClassStudents
                .sort((a, b) => (parseInt(a.rollNo, 10) || 0) - (parseInt(b.rollNo, 10) || 0))
                .map((s, idx) => (
                <button key={s.id}
                  onClick={() => { setSelected(s); void loadStudentData(s); setActiveProfileTab('INFO'); setSubView('PROFILE'); }}
                  className={`w-full flex items-center gap-4 px-4 py-3.5 text-left active:bg-slate-50 transition-colors ${idx < filteredClassStudents.length - 1 ? 'border-b border-slate-100' : ''}`}>
                  <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-sm shrink-0">
                    {s.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2)}
                  </div>
                  <div className="flex-1">
                    <div className="font-extrabold text-slate-900 text-sm">{s.name}</div>
                    <div className="text-[10px] font-bold text-slate-400 mt-0.5">Roll: {s.rollNo.padStart(2, '0')}</div>
                  </div>
                  <div className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase ${
                    s.attendancePercent >= 75 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-600'
                  }`}>
                    {s.attendancePercent}%
                  </div>
                  <ChevronRight size={16} className="text-slate-300" />
                </button>
              ))}
              {filteredClassStudents.length === 0 && (
                <div className="flex flex-col items-center py-10 text-slate-400">
                  <Users size={28} className="mb-2 opacity-40" />
                  <p className="font-bold text-sm">{search ? 'No students found' : 'No students assigned to this section'}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    // ── Sections in a class ────────────────────────────────────────────────
    if (selectedClass) {
      const clsNum = selectedClass.replace('Class ', '');
      return (
        <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
          <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
            <button onClick={() => setSelectedClass(null)} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
              <ArrowLeft size={20} />
            </button>
            <div>
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Class {clsNum}</h2>
              <p className="text-[10px] font-bold text-slate-400">{classSections.length} section{classSections.length !== 1 ? 's' : ''}</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              {classSections.map((sec, idx) => {
                const liveCount = students.filter(s => s.className === selectedClass && s.section === sec.section).length;
                const highAtt = students.filter(s => s.className === selectedClass && s.section === sec.section && s.attendancePercent >= 75).length;
                const isFull = sec.capacity > 0 && liveCount >= sec.capacity;
                return (
                  <button key={sec.id}
                    onClick={() => { setSelectedSection(sec.section); setSearch(''); }}
                    className={`w-full flex items-center gap-4 px-4 py-4 text-left active:bg-slate-50 transition-colors ${idx < classSections.length - 1 ? 'border-b border-slate-100' : ''}`}>
                    <div className="w-11 h-11 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-lg shrink-0">
                      {sec.section}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-extrabold text-slate-900 text-sm">{clsNum}-{sec.section}</div>
                      <div className="flex flex-wrap items-center gap-x-1.5 mt-0.5">
                        <span className="text-[10px] font-bold text-slate-400">
                          {liveCount}{sec.capacity > 0 ? `/${sec.capacity}` : ''} enrolled
                        </span>
                        {highAtt > 0 && <span className="text-[9px] font-black text-emerald-600">· {highAtt} ≥75% att</span>}
                        {sec.classTeacher && <span className="text-[9px] font-bold text-slate-400 truncate">· {sec.classTeacher}</span>}
                      </div>
                    </div>
                    <div className={`text-[10px] font-black px-2.5 py-1 rounded-lg shrink-0 ${
                      isFull ? 'bg-rose-50 text-rose-600' : 'bg-indigo-50 text-indigo-700'
                    }`}>
                      {liveCount}
                    </div>
                    <ChevronRight size={16} className="text-slate-300" />
                  </button>
                );
              })}
              {classSections.length === 0 && (
                <div className="flex flex-col items-center py-10 text-slate-400">
                  <BookOpen size={28} className="mb-2 opacity-40" />
                  <p className="font-bold text-sm">No sections configured</p>
                  <p className="text-xs font-bold mt-1 opacity-60">Add sections in Academic Year setup</p>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    // ── Class Directory ────────────────────────────────────────────────────
    return (
      <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        <div className="sticky top-0 z-10 bg-white border-b border-slate-100 shadow-sm">
          <div className="px-4 pt-4 pb-4 flex items-center gap-3">
            <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
              <ArrowLeft size={20} />
            </button>
            <div>
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Students Directory</h2>
              <p className="text-[10px] font-bold text-slate-400">
                {students.length} enrolled · {classNames.length} class{classNames.length !== 1 ? 'es' : ''}
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-3">
            {classNames.map(cls => {
              const count = students.filter(s => s.className === cls).length;
              const clsNum = cls.replace('Class ', '');
              const paid = students.filter(s => s.className === cls && s.feeStatus === PaymentStatus.PAID).length;
              const numSections = dbSections.filter(s => s.className === cls).length;
              return (
                <button key={cls}
                  onClick={() => { setSelectedClass(cls); setSearch(''); }}
                  className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-left active:scale-95 transition-transform">
                  <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-xl mb-3">
                    {clsNum}
                  </div>
                  <div className="font-black text-slate-900 text-sm">{cls}</div>
                  <div className="text-[10px] font-bold text-slate-400 mt-0.5">
                    {numSections > 0 ? `${numSections} sec · ` : ''}{count} students
                  </div>
                  {paid > 0 && (
                    <span className="inline-block mt-1 text-[9px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                      {paid} paid
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {classNames.length === 0 && (
            <div className="flex flex-col items-center py-16 text-slate-400">
              <Users size={32} className="mb-3 opacity-40" />
              <p className="font-bold text-sm">No classes yet</p>
              <p className="text-xs font-bold mt-1 opacity-60">Create classes in the Academic Year setup</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── PROFILE (Student Details) ──────────────────────────────────────────

  if (subView === 'PROFILE' && selected) {
    const initials = selected.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const fmtDob = selected.dob ? new Date(selected.dob).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
    const fmtAdm = selected.admissionDate ? new Date(selected.admissionDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
    const attGood = selected.attendancePercent >= 75;

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
      { key: 'INFO' as const,       label: 'Info' },
      { key: 'ALLOTMENT' as const,  label: 'Allotment' },
      { key: 'FAMILY' as const,     label: 'Family' },
      { key: 'RESULTS' as const,    label: 'Results' },
      { key: 'FEES' as const,       label: 'Fees' },
      { key: 'DOCS' as const,       label: 'Docs' },
    ];

    return (
      <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">

        {/* ── Sticky Header ── */}
        <div className="sticky top-0 z-10 bg-white border-b border-slate-100 shadow-sm">

          {/* Top bar */}
          <div className="px-4 pt-4 pb-3 flex items-center justify-between">
            <button onClick={() => setSubView('LIST')} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
              <ArrowLeft size={20} />
            </button>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowAdmissionForm(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-600 font-black text-[10px] uppercase tracking-widest rounded-xl active:scale-90 transition-transform">
                <FileCheck size={13} /> Form
              </button>
            </div>
          </div>

          {/* Hero card */}
          <div className="px-4 pb-4">
            <div className="bg-gradient-to-r from-indigo-600 to-violet-700 rounded-2xl p-4 text-white">
              <div className="flex items-start gap-4">
                {/* Avatar */}
                <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center font-black text-xl text-white shrink-0 border-2 border-white/30 overflow-hidden">
                  {selected.photo
                    ? <img src={selected.photo} alt={selected.name} className="w-full h-full object-cover" />
                    : <span>{initials}</span>
                  }
                </div>
                {/* Name + badges */}
                <div className="flex-1 min-w-0">
                  <h2 className="font-black text-base text-white leading-tight">{selected.name}</h2>
                  <p className="text-[10px] font-bold text-white/60 mt-0.5">{selected.admissionNo}</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <span className="text-[9px] font-black bg-white/20 text-white px-2 py-0.5 rounded-full">
                      {selected.className ? `${selected.className}-${selected.section}` : 'Unassigned'}
                    </span>
                    {selected.rollNo && (
                      <span className="text-[9px] font-black bg-white/20 text-white px-2 py-0.5 rounded-full">
                        Roll #{selected.rollNo}
                      </span>
                    )}
                    {selected.stream && (
                      <span className="text-[9px] font-black bg-white/20 text-white px-2 py-0.5 rounded-full">
                        {selected.stream}
                      </span>
                    )}
                    {selected.rte && (
                      <span className="text-[9px] font-black bg-amber-400/80 text-white px-2 py-0.5 rounded-full">RTE</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Quick stats row */}
              <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-white/20">
                <div className="text-center">
                  <div className={`text-lg font-black ${attGood ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {selected.attendancePercent}%
                  </div>
                  <div className="text-[8px] font-bold text-white/50 uppercase">Attend.</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-black text-white">
                    ₹{(selected.paidFee / 1000).toFixed(0)}K
                  </div>
                  <div className="text-[8px] font-bold text-white/50 uppercase">Paid</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-black text-rose-300">
                    ₹{((selected.totalFee - selected.paidFee) / 1000).toFixed(0)}K
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
              const locked = isAllotment && !!selected.className && !editorModeActive;
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
                {/* Personal info quick chips */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 flex flex-col items-center gap-1">
                    <Droplets size={16} className="text-rose-500" />
                    <span className="text-sm font-black text-slate-900">{selected.bloodGroup}</span>
                    <span className="text-[9px] font-bold text-slate-400">Blood</span>
                  </div>
                  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 flex flex-col items-center gap-1">
                    <User size={16} className="text-blue-500" />
                    <span className="text-sm font-black text-slate-900">{selected.gender === 'MALE' ? 'Male' : selected.gender === 'FEMALE' ? 'Female' : 'Other'}</span>
                    <span className="text-[9px] font-bold text-slate-400">Gender</span>
                  </div>
                  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 flex flex-col items-center gap-1">
                    <Calendar size={16} className="text-violet-500" />
                    <span className="text-[11px] font-black text-slate-900 text-center leading-tight">{fmtDob}</span>
                    <span className="text-[9px] font-bold text-slate-400">DOB</span>
                  </div>
                </div>

                {/* Academic identity */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                  <SectionTitle icon={GraduationCap} title="Academic Details" />
                  <div className="space-y-0">
                    <ProfileField label="Admission No." value={selected.admissionNo} />
                    <ProfileField label="Roll Number" value={selected.rollNo || '—'} />
                    <ProfileField label="Class & Section" value={selected.className ? `${selected.className} – ${selected.section}` : 'Unassigned'} />
                    {selected.stream && <ProfileField label="Stream" value={selected.stream} />}
                    <ProfileField label="Academic Year" value={academicYears.find(y => y.id === selected.academicYearId)?.name ?? (selected.academicYearId ? 'Unknown Year' : 'Not assigned')} />
                    <ProfileField label="Admission Date" value={fmtAdm} />
                  </div>
                </div>

                {/* Identity documents */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                  <SectionTitle icon={Shield} title="Identity & Documents" />
                  <div className="space-y-0">
                    <ProfileField label="Aadhaar No."
                      value={selected.aadhaarNo ? `XXXX-XXXX-${selected.aadhaarNo.slice(-4)}` : '—'} />
                    <ProfileField label="Birth Cert No." value={selected.birthCertNo} />
                    <ProfileField label="PEN Number" value={selected.penNumber} />
                    <ProfileField label="TC Number" value={selected.tcNumber} />
                    <ProfileField label="Religion" value={selected.religion} />
                    <ProfileField label="Category / Caste" value={selected.caste} />
                    <ProfileField label="RTE Status"
                      value={
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${selected.rte ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                          {selected.rte ? 'RTE Admitted' : 'No'}
                        </span>
                      } />
                  </div>
                </div>

                {/* Contact & address */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                  <SectionTitle icon={HomeIcon} title="Contact & Address" />
                  <div className="space-y-0">
                    {selected.phone && <ProfileField label="Phone" value={selected.phone} icon={Phone} />}
                    {selected.email && <ProfileField label="Email" value={selected.email} icon={Mail} />}
                    <ProfileField label="Address" value={selected.address} icon={MapPin} />
                  </div>
                </div>
              </>
            )}

            {/* ── FAMILY TAB ───────────────────────────── */}
            {/* ── ALLOTMENT TAB ─────────────────────────────── */}
            {activeProfileTab === 'ALLOTMENT' && (
              <>
                {/* ── Class / Section / Roll ── */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                  <SectionTitle icon={GraduationCap} title="Class Allotment" />

                  {selected.className ? (
                    <>
                      <div className="grid grid-cols-3 gap-2 mb-4">
                        <div className="bg-indigo-50 rounded-xl p-3 text-center">
                          <div className="text-base font-black text-indigo-700">{selected.className.replace('Class ', '')}</div>
                          <div className="text-[9px] font-bold text-indigo-400 mt-0.5">Class</div>
                        </div>
                        <div className="bg-violet-50 rounded-xl p-3 text-center">
                          <div className="text-base font-black text-violet-700">{selected.section || '—'}</div>
                          <div className="text-[9px] font-bold text-violet-400 mt-0.5">Section</div>
                        </div>
                        <div className="bg-emerald-50 rounded-xl p-3 text-center">
                          <div className="text-base font-black text-emerald-700">{selected.rollNo || '—'}</div>
                          <div className="text-[9px] font-bold text-emerald-400 mt-0.5">Roll No</div>
                        </div>
                      </div>

                      {/* Lock / Edit based on editor mode */}
                      {editorModeActive ? (
                        <button
                          onClick={() => setAssignTarget(selected)}
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
                        onClick={() => setAssignTarget(selected)}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-[11px] font-black rounded-xl active:scale-95 transition-transform">
                        <UserCheck size={13} /> Assign to Class
                      </button>
                    </>
                  )}
                </div>

                {/* ── Fee Summary ── */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                  <SectionTitle icon={IndianRupee} title="Fee Allotment" />
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-slate-50 rounded-xl p-3 text-center">
                      <div className="text-sm font-black text-slate-700">₹{(selected.totalFee / 1000).toFixed(0)}K</div>
                      <div className="text-[9px] font-bold text-slate-400 mt-0.5">Total</div>
                    </div>
                    <div className="bg-emerald-50 rounded-xl p-3 text-center">
                      <div className="text-sm font-black text-emerald-700">₹{(selected.paidFee / 1000).toFixed(0)}K</div>
                      <div className="text-[9px] font-bold text-emerald-400 mt-0.5">Paid</div>
                    </div>
                    <div className="bg-rose-50 rounded-xl p-3 text-center">
                      <div className="text-sm font-black text-rose-600">₹{((selected.totalFee - selected.paidFee) / 1000).toFixed(0)}K</div>
                      <div className="text-[9px] font-bold text-rose-400 mt-0.5">Due</div>
                    </div>
                  </div>
                  {selected.totalFee === 0 && (
                    <p className="text-[10px] font-bold text-slate-400 mt-3 text-center">
                      Fee schedule is generated when class is assigned.
                    </p>
                  )}
                </div>

                {/* ── Transport Allotment ── */}
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

            {activeProfileTab === 'FAMILY' && (
              <>
                {/* Father */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-black text-sm">F</div>
                    <div>
                      <p className="text-sm font-black text-slate-900">{selected.fatherName || 'Father'}</p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Father</p>
                    </div>
                  </div>
                  <div className="space-y-0">
                    <ProfileField label="Occupation" value={selected.fatherOccupation} icon={Briefcase} />
                    <ProfileField label="Annual Income" value={selected.fatherIncome} icon={TrendingUp} />
                    <ProfileField label="Phone" value={selected.fatherPhone} icon={Phone} />
                    <ProfileField label="Email" value={selected.fatherEmail} icon={Mail} />
                  </div>
                </div>

                {/* Mother */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center font-black text-sm">M</div>
                    <div>
                      <p className="text-sm font-black text-slate-900">{selected.motherName || 'Mother'}</p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Mother</p>
                    </div>
                  </div>
                  <div className="space-y-0">
                    <ProfileField label="Occupation" value={selected.motherOccupation} icon={Briefcase} />
                    <ProfileField label="Phone" value={selected.motherPhone} icon={Phone} />
                  </div>
                </div>

                {/* Guardian (only if filled) */}
                {selected.guardianName && (
                  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-black text-sm">G</div>
                      <div>
                        <p className="text-sm font-black text-slate-900">{selected.guardianName}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Guardian</p>
                      </div>
                    </div>
                    <div className="space-y-0">
                      <ProfileField label="Relation" value={selected.guardianRelation} />
                      <ProfileField label="Phone" value={selected.guardianPhone} icon={Phone} />
                    </div>
                  </div>
                )}

                {!selected.fatherName && !selected.motherName && (
                  <div className="flex flex-col items-center py-12 text-slate-400">
                    <User size={32} className="mb-3 opacity-40" />
                    <p className="font-bold text-sm">No family info added</p>
                    <p className="text-xs font-bold mt-1 opacity-60">Fill parent details during admission</p>
                  </div>
                )}
              </>
            )}

            {/* ── RESULTS TAB ──────────────────────────── */}
            {activeProfileTab === 'RESULTS' && (
              <>
                {/* Attendance summary */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                  <SectionTitle icon={Calendar} title="Attendance" />
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className={`text-3xl font-black ${attGood ? 'text-emerald-600' : 'text-rose-500'}`}>
                        {selected.attendancePercent}%
                      </div>
                      <div className={`text-[10px] font-black uppercase mt-0.5 ${attGood ? 'text-emerald-600' : 'text-rose-500'}`}>
                        {attGood ? 'Good Standing' : 'Below 75% — Low'}
                      </div>
                    </div>
                    <div className={`w-16 h-16 rounded-full border-4 flex items-center justify-center ${attGood ? 'border-emerald-200' : 'border-rose-200'}`}>
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${attGood ? 'bg-emerald-100' : 'bg-rose-100'}`}>
                        <Calendar size={18} className={attGood ? 'text-emerald-600' : 'text-rose-500'} />
                      </div>
                    </div>
                  </div>
                  {(academicRecord?.attendanceRecords.length ?? 0) === 0 ? (
                    <div className="flex flex-col items-center py-4 text-slate-400">
                      <p className="font-bold text-sm">No monthly data</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {academicRecord?.attendanceRecords.map(att => {
                        const pct = att.total > 0 ? Math.round((att.present / att.total) * 100) : 0;
                        return (
                          <div key={att.month} className="flex items-center gap-3">
                            <div className="w-12 text-[10px] font-bold text-slate-500 shrink-0">{att.month}</div>
                            <div className="flex-1 bg-slate-100 rounded-full h-2.5">
                              <div className={`h-2.5 rounded-full transition-all ${pct >= 75 ? 'bg-emerald-500' : 'bg-rose-400'}`}
                                style={{ width: `${pct}%` }} />
                            </div>
                            <div className="w-14 text-right text-[10px] font-black text-slate-600 shrink-0">{att.present}/{att.total}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Exam results */}
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
              // Group installments by month (ordered by due_date via DB)
              const instByMonth = feeInstallments.reduce<Record<string, FeeInstallment[]>>(
                (acc, inst) => {
                  const key = inst.month;
                  if (!acc[key]) acc[key] = [];
                  acc[key].push(inst);
                  return acc;
                }, {},
              );
              // Preserve due_date order: use the first installment's dueDate for sorting
              const monthEntries = (Object.entries(instByMonth) as [string, FeeInstallment[]][]).sort(
                ([, a], [, b]) => new Date(a[0].dueDate).getTime() - new Date(b[0].dueDate).getTime(),
              );

              const totalFee = feeInstallments.reduce((s, i) => s + i.amount, 0);
              const totalPaid = feeInstallments.reduce((s, i) => s + i.paidAmount + i.writeOffAmount, 0);
              const totalDue = Math.max(0, totalFee - totalPaid);
              const pct = totalFee > 0 ? Math.round((totalPaid / totalFee) * 100) : 0;

              const statusBadge = (status: string) => {
                if (status === 'PAID') return 'bg-emerald-100 text-emerald-700';
                if (status === 'PARTIAL') return 'bg-amber-100 text-amber-700';
                if (status === 'WAIVED' || status === 'WRITTEN_OFF') return 'bg-slate-100 text-slate-500';
                if (status === 'OVERDUE') return 'bg-rose-200 text-rose-700';
                return 'bg-rose-100 text-rose-600';
              };

              return (
                <>
                  {/* Fee structure banner */}
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

                  {/* Summary card */}
                  <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-5 text-white">
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/50 mb-3">Fee Overview · {selected.className || 'Unassigned'}</p>
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



                  {/* Fee payment history timeline */}
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
                                <span className="text-[9px] font-black bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">Advance ₹{p.advanceAmount.toLocaleString('en-IN')}</span>
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

                  {/* Installments grouped by month */}
                  {feeInstallments.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center py-10 text-slate-400">
                      <IndianRupee size={28} className="mb-2 opacity-40" />
                      <p className="font-bold text-sm">No fee schedule for this year</p>
                      {!selected.className && (
                        <p className="text-xs font-bold mt-1 text-slate-400 opacity-60">Assign student to a class first</p>
                      )}
                      {selected.className && !studentFeeStructure && (
                        <p className="text-xs font-bold mt-1 text-slate-400 opacity-60">No fee structure configured for {selected.className}</p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {monthEntries.map(([month, insts]) => {
                        const monthTotal = insts.reduce((s, i) => s + i.amount, 0);
                        const monthPaid = insts.reduce((s, i) => s + i.paidAmount + i.writeOffAmount, 0);
                        const monthDue = Math.max(0, monthTotal - monthPaid);
                        const allPaid = insts.every(i => i.status === 'PAID' || i.status === 'WAIVED' || i.status === 'WRITTEN_OFF');
                        return (
                          <div key={month} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${allPaid ? 'border-emerald-100' : 'border-slate-100'}`}>
                            {/* Month header */}
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
                            {/* Fee heads */}
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
                                        <button onClick={() => handleMarkFeePaid(inst)}
                                          className="text-[9px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-xl active:scale-95 transition-transform">
                                          Collect ₹{instDue.toLocaleString('en-IN')}
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            {/* Month total */}
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

            {/* ── DOCS TAB ─────────────────────────────── */}
            {activeProfileTab === 'DOCS' && (
              <>
                {/* Transport assignment + history */}
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

                  {/* History timeline ─ all past + current rows */}
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
                              className={`rounded-xl p-2.5 border ${
                                isActive
                                  ? 'bg-emerald-50 border-emerald-200'
                                  : 'bg-slate-50 border-slate-200'
                              }`}>
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <Bus size={12} className={isActive ? 'text-emerald-600' : 'text-slate-400'} />
                                  <span className={`text-xs font-black truncate ${
                                    isActive ? 'text-emerald-800' : 'text-slate-700'
                                  }`}>
                                    {h.vehicleNo ?? '—'} · {h.boardingStopName}
                                  </span>
                                </div>
                                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full shrink-0 ${
                                  isActive
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-slate-200 text-slate-600'
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

                {/* Submitted documents — actual storage rows with view/delete */}
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
                            className="text-[9px] font-black text-emerald-700 bg-emerald-100 hover:bg-emerald-200 px-2 py-1 rounded-full shrink-0">
                            VIEW
                          </button>
                          <button onClick={() => handleProfileDocRemove(doc.id)}
                            className="p-1 text-rose-500 hover:bg-rose-50 rounded shrink-0" title="Remove">
                            <Trash2 size={13} />
                          </button>
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

                {/* Upload checklist — uploads straight to Supabase Storage */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                  <SectionTitle icon={CreditCard} title="Document Checklist" />
                  <p className="text-[10px] font-bold text-slate-400 mb-3">
                    Upload missing documents · max 5MB · JPG / PNG / WEBP / HEIC / PDF
                  </p>
                  <div className="space-y-2">
                    {profileDocs.map(doc => {
                      const busy = profileDocUploading === doc.type;
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
                          <label className={`cursor-pointer shrink-0 ${busy ? 'pointer-events-none opacity-60' : ''}`}>
                            <input type="file" onChange={e => handleProfileDocUpload(e, doc.type)}
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
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

          </div>
        </div>

        {/* ── Change Transport modal ─────────────────────────────────── */}
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
                    <p className="text-[10px] font-bold text-slate-400">{selected.name}</p>
                  </div>
                  <button onClick={() => setChangeModalOpen(false)} disabled={changeBusy}
                    className="p-1 hover:bg-slate-100 rounded-lg disabled:opacity-50">✕</button>
                </div>
                <div className="p-4 space-y-3">
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                      Vehicle
                    </label>
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
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                      Boarding Stop
                    </label>
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
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                      Monthly Fee (₹)
                    </label>
                    <input type="number" min="0" value={changeMonthly}
                      onChange={e => setChangeMonthly(e.target.value)}
                      className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                      Effective From
                    </label>
                    <input type="date" value={changeEffectiveDate}
                      onChange={e => setChangeEffectiveDate(e.target.value)}
                      className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                      Reason *
                    </label>
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

        {/* ── Class Assignment Modal (accessible from profile) ────────── */}
        {assignTarget && (
          <StudentClassAssignmentModal
            student={assignTarget}
            onClose={() => setAssignTarget(null)}
            onSuccess={async () => {
              await refreshArchive();
              const all = await studentService.getAll();
              setStudents(all);
              const refreshed = await studentService.getById(selected.id);
              if (refreshed) {
                setSelected(refreshed);
                void loadStudentData(refreshed);
              }
            }}
          />
        )}

        {/* ── Cancel Transport modal ─────────────────────────────────── */}
        {cancelTransportOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
               onClick={() => !cancelTransportBusy && setCancelTransportOpen(false)}>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-sm"
                 onClick={e => e.stopPropagation()}>
              <div className="p-4 border-b border-slate-100">
                <h3 className="font-black text-slate-900 text-sm uppercase tracking-tight">
                  Cancel transport?
                </h3>
                <p className="text-[10px] font-bold text-slate-400 mt-1">
                  {selected.name} · ends today
                </p>
              </div>
              <div className="p-4 space-y-2">
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                  Reason *
                </label>
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
      </div>
    );
  }

  {/* Parent Account Creation Modal */}
  if (showParentModal && createdParent) {
    return (
      <div className="w-full bg-slate-900/50 backdrop-blur-sm flex items-end">
        <div className="w-full bg-white rounded-t-3xl p-6 pb-8 animate-in slide-in-from-bottom-8">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-black text-slate-900">Parent Account Created</h3>
            <button onClick={() => setShowParentModal(false)} className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500">✕</button>
          </div>

          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-6 space-y-3">
            <div className="flex items-start gap-2">
              <CheckCircle2 size={20} className="text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-black text-emerald-900">Account Created</p>
                <p className="text-sm font-bold text-emerald-700 mt-1">
                  A new parent account has been created. Share these credentials with the parent.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Mobile Number</label>
              <div className="flex gap-2">
                <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-900 text-sm">
                  {createdParent.mobileNumber}
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(createdParent.mobileNumber);
                    showToast('Mobile number copied!');
                  }}
                  className="px-4 py-3 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
                >
                  <Copy size={16} className="text-slate-600" />
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Temporary Password</label>
              <div className="flex gap-2">
                <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-black text-slate-900 text-sm">
                  {createdParent.password}
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(createdParent.password);
                    showToast('Password copied!');
                  }}
                  className="px-4 py-3 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
                >
                  <Copy size={16} className="text-slate-600" />
                </button>
              </div>
              <p className="text-[10px] font-bold text-slate-400 mt-2">
                Parent should change password on first login
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowParentModal(false)}
            className="w-full py-3 bg-emerald-600 text-white font-black rounded-xl"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  {/* Admission Form Print Modal */}
  if (showAdmissionForm && selected) {
    if (!schoolInfo) {
      return (
        <div className="w-full p-6 text-center">
          <div className="inline-block w-8 h-8 border-4 border-slate-300 border-t-emerald-600 rounded-full animate-spin" />
          <p className="text-sm font-bold text-slate-600 mt-3">Loading school info…</p>
        </div>
      );
    }
    return <AdmissionFormPrint student={selected} schoolInfo={schoolInfo} onClose={() => setShowAdmissionForm(false)} />;
  }

  return null;
};
