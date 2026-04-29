import React, { useEffect, useState } from 'react';
import {
  ArrowLeft, Plus, Search, Users, ChevronRight, User, Phone, Mail,
  IndianRupee, BookOpen, Calendar, CheckCircle2,
  X, FileText, BarChart2, FolderOpen, Copy, MapPin, FileCheck,
  Bus, Briefcase, Droplets, GraduationCap, Shield, Heart,
  CreditCard, Building2, TrendingUp, Home as HomeIcon,
  Archive, UserCheck, UserX, Award, Trash2, AlertTriangle, RefreshCw,
} from 'lucide-react';
import { studentService } from '../../../services/student.service';
import { Student, CreateStudentInput, FeeRecord, StudentAcademicRecord, STREAMS, STREAM_CLASSES, StudentStream, StudentDoc } from '../../../types/principal.types';
import { PaymentStatus, PAYMENT_COLORS } from '../../../config/constants';
import { useUIStore } from '../../../store/uiStore';
type ParentCredsView = { mobileNumber: string; password: string };
import { schoolInfoService, SchoolInfo } from '../../../services/schoolInfo.service';
import { AdmissionFormPrint } from '../../../components/AdmissionFormPrint';
import { transportService, TransportVehicle, StudentTransportAssignment } from '../../../services/transport.service';
import { storageService } from '../../../services/storage.service';
import { StudentClassAssignmentModal } from './StudentClassAssignmentModal';

type MainView = 'MENU' | 'ADMISSION' | 'FEES' | 'CLASSES' | 'ARCHIVE';
type SubView = 'LIST' | 'CREATE' | 'PROFILE' | 'CLASS_DETAIL' | 'SECTION_DETAIL';
type ArchiveTab = 'ACTIVE' | 'INACTIVE' | 'TC_ISSUED' | 'ALUMNI' | 'UNASSIGNED';

const ARCHIVE_TABS: Array<{ key: ArchiveTab; label: string; icon: React.ComponentType<{ size?: number; className?: string }>; tone: string }> = [
  { key: 'ACTIVE',     label: 'Active',     icon: UserCheck,    tone: 'emerald' },
  { key: 'UNASSIGNED', label: 'Unassigned', icon: AlertTriangle, tone: 'amber' },
  { key: 'INACTIVE',   label: 'Inactive',   icon: UserX,        tone: 'slate' },
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
  const [feeRecords, setFeeRecords] = useState<FeeRecord[]>([]);
  const [academicRecord, setAcademicRecord] = useState<StudentAcademicRecord | null>(null);
  const [activeProfileTab, setActiveProfileTab] = useState<'INFO' | 'FAMILY' | 'RESULTS' | 'FEES' | 'DOCS'>('INFO');
  const [studentTransport, setStudentTransport] = useState<{ vehicle: TransportVehicle; assignment: StudentTransportAssignment } | null>(null);
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
  const [assignTarget, setAssignTarget] = useState<Student | null>(null);
  const [tcModal, setTcModal] = useState<{ student: Student; tcNumber: string; reason: string } | null>(null);
  const [profileDocsLive, setProfileDocsLive] = useState<StudentDoc[]>([]);
  const [profileDocUploading, setProfileDocUploading] = useState<DocumentUpload['type'] | null>(null);

  useEffect(() => { studentService.getAll().then(setStudents); }, []);
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
    if (mainView === 'ARCHIVE') refreshArchive();
  }, [mainView, refreshArchive]);

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
    const [feesRes, recordRes, docsRes] = await Promise.allSettled([
      studentService.getFeeRecords(student.id),
      hasYear
        ? studentService.getAcademicRecord(student.id, student.academicYearId)
        : Promise.resolve(null),
      studentService.listDocuments(student.id),
    ]);
    const fees = feesRes.status === 'fulfilled' ? feesRes.value : [];
    const record = recordRes.status === 'fulfilled' ? recordRes.value : null;
    const docs = docsRes.status === 'fulfilled' ? docsRes.value : [];
    setFeeRecords(fees);
    setAcademicRecord(record);
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

  const handleMarkFeePaid = async (feeId: string) => {
    await studentService.markFeePaid(feeId, `TXN-${Date.now()}`);
    const updated = await studentService.getFeeRecords(selected!.id);
    setFeeRecords(updated);
    showToast('Payment marked as paid');
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
            {filteredStudents.map(student => {
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
                        <span className="text-[10px] font-bold text-slate-400">{student.className}-{student.section}</span>
                        <span className="text-[9px] font-bold text-slate-300">·</span>
                        <span className="text-[10px] font-bold text-indigo-500">{student.admissionNo}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${
                        student.feeStatus === 'PAID' ? 'bg-emerald-100 text-emerald-700' :
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
            {filtered.map(student => {
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
            {filteredFees.map(student => (
              <button key={student.id}
                onClick={() => { setSelected(student); loadStudentData(student); setActiveProfileTab('FEES'); setSubView('PROFILE'); }}
                className="w-full bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-left active:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-100 to-violet-100 text-indigo-700 flex items-center justify-center font-black text-sm shrink-0">
                    {student.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                  </div>
                  <div className="flex-1">
                    <div className="font-extrabold text-slate-900 text-sm">{student.name}</div>
                    <div className="text-[10px] font-bold text-slate-400 mt-0.5">{student.className}-{student.section} · ₹{((student.totalFee - student.paidFee) / 1000).toFixed(0)}K due</div>
                  </div>
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${PAYMENT_COLORS[student.feeStatus]}`}>
                    {student.feeStatus}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ─── CLASSES (Class → Section → Students) ────────────────────────────────

  if (!renderProfile && mainView === 'CLASSES') {
    const classes = [...new Set(students.map(s => s.className))].sort();
    const sections = selectedClass
      ? [...new Set(students.filter(s => s.className === selectedClass).map(s => s.section))].sort()
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
                <p className="text-[10px] font-bold text-slate-400">{classStudents.length} students</p>
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
              {filteredClassStudents.map((s, idx) => (
                <button key={s.id}
                  onClick={() => { setSelected(s); loadStudentData(s); setActiveProfileTab('INFO'); setSubView('PROFILE'); }}
                  className={`w-full flex items-center gap-4 px-4 py-3.5 text-left active:bg-slate-50 transition-colors ${idx < filteredClassStudents.length - 1 ? 'border-b border-slate-100' : ''}`}>
                  <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-sm shrink-0">
                    {s.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
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
                  <p className="font-bold text-sm">No students found</p>
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
              <p className="text-[10px] font-bold text-slate-400">{sections.length} section{sections.length !== 1 ? 's' : ''}</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              {sections.map((section, idx) => {
                const count = students.filter(s => s.className === selectedClass && s.section === section).length;
                const sectionStudents = students.filter(s => s.className === selectedClass && s.section === section);
                const highAtt = sectionStudents.filter(s => s.attendancePercent >= 75).length;
                return (
                  <button key={section}
                    onClick={() => { setSelectedSection(section); setSearch(''); }}
                    className={`w-full flex items-center gap-4 px-4 py-4 text-left active:bg-slate-50 transition-colors ${idx < sections.length - 1 ? 'border-b border-slate-100' : ''}`}>
                    <div className="w-11 h-11 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-lg shrink-0">
                      {section}
                    </div>
                    <div className="flex-1">
                      <div className="font-extrabold text-slate-900 text-sm">{clsNum}-{section}</div>
                      <div className="text-[10px] font-bold text-slate-400 mt-0.5">{count} students · {highAtt} good attendance</div>
                    </div>
                    <div className="bg-indigo-50 text-indigo-700 text-[10px] font-black px-2.5 py-1 rounded-lg">
                      {count}
                    </div>
                    <ChevronRight size={16} className="text-slate-300" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      );
    }

    // ── Class Directory (2×2 Grid) ─────────────────────────────────────────
    return (
      <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        <div className="sticky top-0 z-10 bg-white border-b border-slate-100 shadow-sm">
          <div className="px-4 pt-4 pb-4 flex items-center gap-3">
            <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
              <ArrowLeft size={20} />
            </button>
            <div>
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Students Directory</h2>
              <p className="text-[10px] font-bold text-slate-400">{students.length} total students · {classes.length} classes</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-3">
            {classes.map(cls => {
              const count = students.filter(s => s.className === cls).length;
              const clsNum = cls.replace('Class ', '');
              const paid = students.filter(s => s.className === cls && s.feeStatus === 'PAID').length;
              return (
                <button key={cls}
                  onClick={() => { setSelectedClass(cls); setSearch(''); }}
                  className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-left active:scale-95 transition-transform">
                  <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-xl mb-3">
                    {clsNum}
                  </div>
                  <div className="font-black text-slate-900 text-sm">{cls}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-black text-slate-400">{count} students</span>
                    {paid > 0 && <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">{paid} paid</span>}
                  </div>
                </button>
              );
            })}
          </div>

          {classes.length === 0 && (
            <div className="flex flex-col items-center py-16 text-slate-400">
              <Users size={32} className="mb-3 opacity-40" />
              <p className="font-bold text-sm">No students yet</p>
              <p className="text-xs font-bold mt-1 opacity-60">Add students via Admission section</p>
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
      { key: 'INFO' as const,    label: 'Info' },
      { key: 'FAMILY' as const,  label: 'Family' },
      { key: 'RESULTS' as const, label: 'Results' },
      { key: 'FEES' as const,    label: 'Fees' },
      { key: 'DOCS' as const,    label: 'Docs' },
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
                      {selected.className}-{selected.section}
                    </span>
                    <span className="text-[9px] font-black bg-white/20 text-white px-2 py-0.5 rounded-full">
                      Roll #{selected.rollNo}
                    </span>
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
            {tabList.map(({ key, label }) => (
              <button key={key} onClick={() => setActiveProfileTab(key)}
                className={`flex-shrink-0 px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-widest transition-all ${
                  activeProfileTab === key
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'bg-slate-100 text-slate-500 border border-slate-200'
                }`}>
                {label}
              </button>
            ))}
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
                    <ProfileField label="Roll Number" value={selected.rollNo} />
                    <ProfileField label="Class & Section" value={`${selected.className} – ${selected.section}`} />
                    {selected.stream && <ProfileField label="Stream" value={selected.stream} />}
                    <ProfileField label="Admission Date" value={fmtAdm} />
                    <ProfileField label="Academic Year" value={selected.academicYearId} />
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
            {activeProfileTab === 'FEES' && (
              <>
                {/* Summary */}
                <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-5 text-white">
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/50 mb-3">Fee Overview</p>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <div className="text-xl font-black text-white">₹{(selected.totalFee / 1000).toFixed(0)}K</div>
                      <div className="text-[8px] font-bold text-white/40 uppercase mt-0.5">Total</div>
                    </div>
                    <div>
                      <div className="text-xl font-black text-emerald-400">₹{(selected.paidFee / 1000).toFixed(0)}K</div>
                      <div className="text-[8px] font-bold text-white/40 uppercase mt-0.5">Paid</div>
                    </div>
                    <div>
                      <div className="text-xl font-black text-rose-400">₹{((selected.totalFee - selected.paidFee) / 1000).toFixed(0)}K</div>
                      <div className="text-[8px] font-bold text-white/40 uppercase mt-0.5">Due</div>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="mt-4 bg-white/10 rounded-full h-2">
                    <div className="h-2 rounded-full bg-emerald-400 transition-all"
                      style={{ width: `${selected.totalFee > 0 ? Math.round((selected.paidFee / selected.totalFee) * 100) : 0}%` }} />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-[9px] font-bold text-white/40">0%</span>
                    <span className="text-[9px] font-black text-emerald-400">
                      {selected.totalFee > 0 ? Math.round((selected.paidFee / selected.totalFee) * 100) : 0}% paid
                    </span>
                    <span className="text-[9px] font-bold text-white/40">100%</span>
                  </div>
                </div>

                {/* Records */}
                {feeRecords.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center py-10 text-slate-400">
                    <IndianRupee size={28} className="mb-2 opacity-40" />
                    <p className="font-bold text-sm">No fee records</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {feeRecords.map(fee => (
                      <div key={fee.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="font-bold text-slate-800 text-sm">{fee.description}</div>
                            <div className="text-[10px] font-bold text-slate-400 mt-0.5">Due: {fee.dueDate}</div>
                            {fee.paidAt && (
                              <div className="text-[10px] font-bold text-emerald-600 mt-0.5">Paid: {fee.paidAt}</div>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-2 shrink-0">
                            <span className="font-black text-slate-900 text-sm">₹{fee.amount.toLocaleString('en-IN')}</span>
                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${
                              fee.status === PaymentStatus.PAID ? 'bg-emerald-100 text-emerald-700' :
                              fee.status === 'PARTIAL' ? 'bg-amber-100 text-amber-700' :
                              'bg-rose-100 text-rose-600'
                            }`}>{fee.status}</span>
                            {fee.status !== PaymentStatus.PAID && (
                              <button onClick={() => handleMarkFeePaid(fee.id)}
                                className="text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-xl active:scale-95 transition-transform">
                                Mark Paid
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* ── DOCS TAB ─────────────────────────────── */}
            {activeProfileTab === 'DOCS' && (
              <>
                {/* Transport assignment */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                  <SectionTitle icon={Bus} title="Transport Assignment" />
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
                    </div>
                  ) : (
                    <div className="flex flex-col items-center py-6 text-slate-400">
                      <Bus size={28} className="mb-2 opacity-40" />
                      <p className="font-bold text-sm">No transport assigned</p>
                      <p className="text-xs font-bold mt-1 opacity-60">Assign via Transport Management</p>
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
