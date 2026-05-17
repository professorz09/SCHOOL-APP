import React, { useEffect, useState } from 'react';
import {
  ArrowLeft, Plus, Search, Users, ChevronRight, User, Phone, Mail,
  IndianRupee, BookOpen, Calendar, CheckCircle2,
  X, FileText, BarChart2, FolderOpen, Copy, MapPin, FileCheck,
  Bus, Briefcase, Droplets, GraduationCap, Shield, Heart,
  CreditCard, Building2, TrendingUp, Home as HomeIcon,
  Archive, UserCheck, UserX, Award, Trash2, AlertTriangle, RefreshCw,
  Lock, Edit2, History, Eye, Upload, Download,
} from 'lucide-react';
import { exportCsv } from '@/shared/utils/csv';
import { todayIST } from '@/shared/utils/date';
import { stripClassPrefix } from '@/shared/utils/className';
import { studentService } from '@/modules/students/student.service';
import { apiStudents } from '@/lib/apiClient';
import { Student, CreateStudentInput, STREAMS, STREAM_CLASSES, StudentStream } from '@/modules/students/student.types';
import { PaymentStatus, PAYMENT_COLORS } from '@/shared/config/constants';
import { useUIStore } from '@/store/uiStore';
type ParentCredsView = { mobileNumber: string; password: string };
import { schoolInfoService, SchoolInfo } from '@/shared/utils/schoolInfo.service';
import { AdmissionFormPrint } from '@/shared/components/AdmissionFormPrint';
import { transportService } from '@/modules/transport/transport.service';
import { StudentClassAssignmentModal } from '@/modules/students/components/StudentClassAssignmentModal';
import { SkeletonRow } from '@/shared/components/ui/Skeleton';
import { useAcademicYear } from '@/shared/context/AcademicYearContext';
import { principalService } from '@/roles/principal/principal.service';
import { feeService } from '@/modules/fees/fee.service';
import { StudentProfilePanel } from '@/modules/students/components/StudentProfilePanel';

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

/** How the admission UI should behave.
 *
 *  - PRINCIPAL_FULL  — default. Full StudentsManager: list, archive, fees, admission etc.
 *  - TEACHER_DRAFT   — only the admission form. Submit writes to approvals (draft).
 *  - PRINCIPAL_REVIEW — only the admission form, prefilled from a teacher's draft.
 *                      Submit runs the regular admission and then closes the
 *                      approval (status APPROVED).
 */
type AdmissionMode = 'PRINCIPAL_FULL' | 'TEACHER_DRAFT' | 'PRINCIPAL_REVIEW';

interface Props {
  onBack: () => void;
  initialView?: MainView;
  mode?: AdmissionMode;
  /** Only used when mode === 'PRINCIPAL_REVIEW'. */
  draftId?: string;
  /** Pre-filled CreateStudentInput payload. Used by PRINCIPAL_REVIEW (prefilled
   *  from an existing approval) and ignored otherwise. */
  draftPrefill?: Partial<CreateStudentInput>;
  /** Called after a successful TEACHER_DRAFT submit or PRINCIPAL_REVIEW
   *  approve so the parent screen can navigate away. */
  onDraftDone?: () => void;
}

const CLASS_OPTIONS = [
  'Nursery','LKG','UKG',
  'Class 1','Class 2','Class 3','Class 4','Class 5',
  'Class 6','Class 7','Class 8','Class 9','Class 10',
  '11th Science','11th Commerce','11th Arts','11th Maths',
  '12th Science','12th Commerce','12th Arts','12th Maths',
];
const BLOOD_GROUPS = ['A+','A-','B+','B-','O+','O-','AB+','AB-'];

const GENDER_OPTIONS: { value: string; label: string }[] = [
  { value: 'MALE',   label: 'Male'   },
  { value: 'FEMALE', label: 'Female' },
  { value: 'OTHER',  label: 'Other'  },
];
const RELIGION_OPTIONS = ['Hindu', 'Muslim', 'Christian', 'Sikh', 'Buddhist', 'Jain', 'Parsi', 'Other'];
const CASTE_OPTIONS    = ['General', 'OBC', 'SC', 'ST', 'EWS', 'Other'];

// Class/section/stream/totalFee deliberately blank — the new admission
// flow creates the student in the UNASSIGNED bucket and a separate
// "Assign to Class" modal handles class placement, fee schedule and
// transport in one transaction.
const BLANK_FORM: CreateStudentInput = {
  name: '', rollNo: '', admissionNo: '', className: '', section: '',
  // Gender starts blank to force an explicit choice — handleCreate
  // rejects the submit if it's still empty. Cast keeps the form
  // strictly typed against the service interface.
  dob: '', gender: '' as unknown as 'MALE', bloodGroup: 'O+', aadhaarNo: '', phone: '',
  email: '', address: '', photo: '', fatherName: '', fatherPhone: '',
  motherName: '', motherPhone: '', academicYearId: '',
  admissionDate: todayIST(), totalFee: 0,
  religion: '', caste: '', penNumber: '', birthCertNo: '', tcNumber: '', rte: false,
  fatherOccupation: '', fatherIncome: '', fatherEmail: '', motherOccupation: '',
  guardianName: '', guardianPhone: '', guardianRelation: '',
  loginPhone: '',
};

interface FormWithParent extends CreateStudentInput {
  parentMobileNumber: string;
  parentName: string;
  parentEmail: string;
}

const BLANK_FORM_WITH_PARENT: FormWithParent = {
  ...BLANK_FORM,
  parentMobileNumber: '',
  parentName: '',
  parentEmail: '',
};

export const StudentsManager: React.FC<Props> = ({
  onBack, initialView,
  mode = 'PRINCIPAL_FULL',
  draftId,
  draftPrefill,
  onDraftDone,
}) => {
  const { showToast } = useUIStore();
  const { activeYear, academicYears } = useAcademicYear();
// In TEACHER_DRAFT / PRINCIPAL_REVIEW modes we skip straight to the
  // admission form (mainView='ADMISSION', subView='CREATE'). Otherwise
  // honour the explicit initialView, falling back to the classes home.
  const [mainView, setMainView] = useState<MainView>(
    mode === 'PRINCIPAL_FULL' ? (initialView ?? 'CLASSES') : 'ADMISSION',
  );
  const [subView, setSubView] = useState<SubView>(
    mode === 'PRINCIPAL_FULL' ? 'LIST' : 'CREATE',
  );
  // Admission form is one scrollable page with section dividers
  // (Basic / Family / Documents) — earlier it was a 3-step wizard
  // which doubled the tap count and made copy-pasting parent details
  // from a paper form harder.
  // mobile. Earlier the entire form was one giant scroll which
  // most principals found overwhelming. Order matches the user's
  // mental model: Basic → Family → Documents.
  // (The previous "Show more details" disclosure was removed — DOB
  // is mandatory in handleCreate's validation and principals were
  // skipping it because it sat under the collapse. Every step-1
  // field now renders inline so no compulsory input is one tap away
  // from being missed.)
  const [students, setStudents] = useState<Student[]>([]);
  // Inactive students (TC issued + suspended/failed/etc) — fetched lazily
  // when the user picks the "Inactive" filter chip. studentService.getAll()
  // hard-filters to is_active=true so they're never in `students`.
  const [inactiveStudents, setInactiveStudents] = useState<Student[]>([]);
  const [inactiveLoading,  setInactiveLoading]  = useState(false);
  const [inactiveLoaded,   setInactiveLoaded]   = useState(false);
  // Track whether the initial student fetch has completed. Without
  // this, the class card briefly renders "0" (empty array) before
  // the real count arrives ~1-2s later — which reads as a real
  // "no students" state.
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [selected, setSelected] = useState<Student | null>(null);
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState<string>('ALL');
  // Admission-list filter — All / Unassigned / specific class / fee-status.
  // 'ALL' is the default no-op; UI pills toggle this state.
  const [admFilter, setAdmFilter] = useState<
    | { type: 'ALL' }
    | { type: 'ASSIGNED' }
    | { type: 'CLASS'; value: string }
    | { type: 'UNASSIGNED' }
    | { type: 'INACTIVE' }
    | { type: 'FEE'; value: string }
    // 'REVIEW' shows pending teacher-submitted admission drafts. Sits
    // alongside the other filters but draws from the approvals queue,
    // not the students table — its count is intentionally separate
    // from the All / class / fee buckets.
    | { type: 'REVIEW' }
  >({ type: 'ALL' });
  // Pending admission drafts from teachers (request_type='ADMISSION',
  // status='PENDING'). Refreshed on mount + after any approve/reject.
  const [pendingDrafts, setPendingDrafts] = useState<import('@/roles/principal/principal.types').Approval[]>([]);
  const [reviewing, setReviewing] = useState<import('@/roles/principal/principal.types').Approval | null>(null);
  const refreshPendingDrafts = React.useCallback(async () => {
    if (mode !== 'PRINCIPAL_FULL') return;
    try {
      const list = await principalService.getApprovals();
      setPendingDrafts(list.filter(a => a.type === 'ADMISSION' && a.status === 'PENDING'));
    } catch { /* swallow — list will retry on next mount/filter switch */ }
  }, [mode]);
  useEffect(() => { void refreshPendingDrafts(); }, [refreshPendingDrafts]);
  // If the user is parked on the REVIEW filter and the queue empties
  // (after they approved/rejected the last draft), bounce them back
  // to ALL — otherwise they stare at an empty list with the chip
  // already hidden and no obvious way out.
  useEffect(() => {
    // Lazy-fetch inactive students the first time the Inactive chip is
    // selected. Cached after that — switching back to the chip is free.
    if (admFilter.type === 'INACTIVE' && !inactiveLoaded && !inactiveLoading) {
      setInactiveLoading(true);
      void Promise.all([
        studentService.getStudentsByArchiveStatus('TC_ISSUED'),
        studentService.getStudentsByArchiveStatus('INACTIVE'),
      ])
        .then(([tc, inact]) => {
          setInactiveStudents([...tc, ...inact]);
          setInactiveLoaded(true);
        })
        .catch(e => showToast(e instanceof Error ? e.message : 'Failed to load inactive list', 'error'))
        .finally(() => setInactiveLoading(false));
    }
    if (admFilter.type === 'REVIEW' && pendingDrafts.length === 0) {
      setAdmFilter({ type: 'ALL' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingDrafts.length, admFilter.type, inactiveLoaded, inactiveLoading]);

  // Reject-draft modal state. Captured at the row level so the principal
  // can reject without opening the full form.
  const [rejectingDraft, setRejectingDraft] = useState<import('@/roles/principal/principal.types').Approval | null>(null);
  const [rejectReasonText, setRejectReasonText] = useState('');
  const [rejectingBusy, setRejectingBusy] = useState(false);
  const submitDraftReject = async () => {
    if (!rejectingDraft) return;
    if (!rejectReasonText.trim()) { showToast('Reason daalein', 'error'); return; }
    setRejectingBusy(true);
    try {
      await principalService.rejectAdmissionDraft(rejectingDraft.id, rejectReasonText.trim());
      showToast('Draft rejected', 'info');
      setRejectingDraft(null);
      setRejectReasonText('');
      await refreshPendingDrafts();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Reject failed', 'error');
    } finally {
      setRejectingBusy(false);
    }
  };
  const [form, setForm] = useState<FormWithParent>({ ...BLANK_FORM_WITH_PARENT, ...(draftPrefill as object ?? {}) });
  // PRINCIPAL_REVIEW mode: when a teacher's draft is opened for review,
  // hydrate the form from the saved payload. Re-runs if the parent passes
  // a different draft (rare but defensive).
  useEffect(() => {
    if (mode === 'PRINCIPAL_REVIEW' && draftPrefill) {
      setForm(prev => ({ ...prev, ...(draftPrefill as object) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId]);

  // Guard rail: useState initial values run only on first mount, so if a
  // hot-reload replaces this component without remount, mainView/subView
  // can still be 'CLASSES'/'LIST' from before. Force-correct them whenever
  // mode is non-PRINCIPAL_FULL — cheap, idempotent, only fires on mode
  // change.
  useEffect(() => {
    if (mode !== 'PRINCIPAL_FULL') {
      setMainView('ADMISSION');
      setSubView('CREATE');
    }
  }, [mode]);
  const [religionIsOther, setReligionIsOther] = useState(false);
  const [casteIsOther, setCasteIsOther] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);


  // FEES main view status filter
  type FeeStatusFilter = 'ALL' | 'PAID' | 'PARTIAL' | 'UNPAID' | 'OVERDUE';
  const [feeStatusFilter, setFeeStatusFilter] = useState<FeeStatusFilter>('ALL');



  const [showCountAdmission, setShowCountAdmission] = useState(PAGE_SIZE);
  const [showCountArchive, setShowCountArchive] = useState(PAGE_SIZE);
  const [showCountFees, setShowCountFees] = useState(PAGE_SIZE);
  const [classRosterShown, setClassRosterShown] = useState(PAGE_SIZE);

  const [createdParent, setCreatedParent] = useState<ParentCredsView | null>(null);
  const [showParentModal, setShowParentModal] = useState(false);
  const [schoolInfo, setSchoolInfo] = useState<SchoolInfo | null>(null);
  const [showAdmissionForm, setShowAdmissionForm] = useState(false);
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

  useEffect(() => {
    // Teacher-draft / principal-review modes only render the admission
    // form — no list, no archive, no fees. Skip the heavy
    // students-of-school fetch (which hits a PRINCIPAL/TEACHER-only
    // surface and would 403 for any future expanded role).
    if (mode !== 'PRINCIPAL_FULL') { setStudentsLoading(false); return; }
    setStudentsLoading(true);
    void studentService.getAll()
      .then(rows => { setStudents(rows); setStudentsLoading(false); })
      .catch(e => {
        showToast(e instanceof Error ? e.message : 'Failed to load students', 'error');
        setStudentsLoading(false);
      });
  }, [activeYear?.id, mode]);
  useEffect(() => {
    if (mode !== 'PRINCIPAL_FULL') { setDbSections([]); return; }
    if (!activeYear?.id) { setDbSections([]); return; }
    void principalService.getSectionsForYear(activeYear.id)
      .then(setDbSections).catch(() => setDbSections([]));
  }, [activeYear?.id, mode]);
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

  useEffect(() => { setShowCountAdmission(PAGE_SIZE); }, [search, admFilter]);
  useEffect(() => { setShowCountArchive(PAGE_SIZE); }, [search, archiveTab]);
  useEffect(() => { setShowCountFees(PAGE_SIZE); }, [search, classFilter]);
  // Reset class-roster pager when the user changes class/section or types a
  // new search inside the section view.
  useEffect(() => { setClassRosterShown(PAGE_SIZE); }, [selectedClass, selectedSection, search]);

  const handleCreate = async () => {
    // Aggregate ALL missing-field problems first so the principal sees a
    // single clear list instead of fixing one issue, tapping submit, and
    // discovering the next one. Order matches form layout so the toast
    // message reads top-to-bottom of the screen.
    const missing: string[] = [];
    if (!form.name?.trim())                              missing.push('Student name');
    if (!form.admissionNo?.trim())                       missing.push('Admission no.');
    const loginRaw = (form.loginPhone || form.fatherPhone || form.motherPhone || form.guardianPhone || '').trim();
    if (!loginRaw)                                        missing.push('Login mobile');
    if (!form.fatherName?.trim() && !form.motherName?.trim()) missing.push('Father or Mother name');
    if (!form.dob)                                        missing.push('Date of birth');
    if (!form.gender)                                     missing.push('Gender');
    if (missing.length > 0) {
      showToast(`Required fields: ${missing.join(', ')}`, 'error');
      return;
    }
    // Cross-school mobile-uniqueness check — runs once on submit
    // instead of mid-form. The /create endpoint repeats this
    // server-side; this client check just gives a nicer toast.
    if (mode !== 'TEACHER_DRAFT' && mode !== 'PRINCIPAL_REVIEW') {
      const login10 = loginRaw.replace(/\D/g, '').slice(-10);
      if (login10.length === 10) {
        try {
          const r = await apiStudents.checkAdmissionEligibility(login10);
          if (!r.eligible) {
            showToast(
              'This mobile is already linked to an active student. ' +
              'Get a TC from the previous school or use a different mobile.',
              'error',
            );
            return;
          }
        } catch {
          // Network hiccup — let it proceed; server re-checks.
        }
      }
    }
    // Date sanity checks — these are *format* / range errors rather than
    // "missing" so they keep their own focused toasts. Resolve the value
    // into a local first: the previous version queued `setForm` for the
    // empty case, but React state updates don't apply within the same
    // handler — `form.admissionDate` stayed empty and the payload below
    // shipped an empty admission date despite the toast suggesting today.
    let resolvedAdmissionDate = form.admissionDate;
    if (resolvedAdmissionDate) {
      const adm = new Date(resolvedAdmissionDate);
      const today = new Date(todayIST());
      if (Number.isNaN(adm.getTime())) {
        showToast('Invalid admission date', 'error'); return;
      }
      if (adm > today) {
        showToast('Admission date cannot be in the future — use today or an earlier date', 'error');
        return;
      }
    } else {
      resolvedAdmissionDate = todayIST();
      setForm(f => ({ ...f, admissionDate: resolvedAdmissionDate }));
    }
    {
      const dob = new Date(form.dob);
      const today = new Date();
      if (Number.isNaN(dob.getTime())) {
        showToast('Invalid date of birth', 'error'); return;
      }
      if (dob > today) { showToast('Date of birth cannot be in the future', 'error'); return; }
      const ageYrs = (today.getTime() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      if (ageYrs < 2 || ageYrs > 25) {
        showToast(`Date of birth looks wrong — calculated age is ${Math.floor(ageYrs)} years (expected 2–25)`, 'error');
        return;
      }
    }
    // Mobile sanity — login number must be 10 digits after stripping noise.
    const cleanedMobile = loginRaw.replace(/\D/g, '');
    if (cleanedMobile.length !== 10) {
      showToast('Login mobile (Father / Mother) must be 10 digits', 'error');
      return;
    }
    // Class/section/stream are NOT collected at admission anymore — the
    // student lands in the UNASSIGNED bucket and the principal places
    // them via the "Assign to Class" modal. So no stream guard here.

    // ── TEACHER_DRAFT branch ────────────────────────────────────────────
    // A teacher can't directly create a student; their submission becomes
    // a PENDING approval row that the principal reviews. We skip the
    // studentService.create() side effects entirely (auth account, fee
    // schedule, etc.) — those run later, when the principal approves.
    if (mode === 'TEACHER_DRAFT') {
      setIsSubmitting(true);
      try {
        // Strip the legacy parent* fields off — they shadow the explicit
        // Father/Mother fields in the saved payload.
        const { parentMobileNumber: _pm, parentName: _pn, parentEmail: _pe, ...rest } = form;
        void _pm; void _pn; void _pe;
        const payload = { ...rest, admissionDate: resolvedAdmissionDate } as Record<string, unknown>;
        await principalService.submitAdmissionDraft(
          payload, form.name.trim(), form.admissionNo.trim(),
        );
        showToast('Admission draft submitted — principal will review.');
        setForm(BLANK_FORM_WITH_PARENT);
        setReligionIsOther(false);
        setCasteIsOther(false);
        if (onDraftDone) onDraftDone();
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Draft submit failed', 'error');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    setIsSubmitting(true);
    try {
      // student.service.create() handles the parent Auth account, parent_student_links,
      // duplicate-check (Aadhaar/father-mobile), per-year academic record, and audit log
      // — all atomically against Supabase. Canonicalize the parent mobile here so a
      // single value drives both the duplicate check and the auth-account provisioning.
      // Strip the legacy parent* keys from the payload — they used to be
      // separate inputs but now they're computed from Father / Mother fields.
      const { parentMobileNumber: _pm, parentName: _pn, parentEmail: _pe, ...rest } = form;
      void _pm; void _pn; void _pe;
      // Canonicalise the explicit Login Mobile (last-10-digit so leading
      // +91 / spaces / 0 are dropped consistently). Falls back to
      // father / mother / guardian phone if the user skipped the
      // dedicated field.
      const canonicalLoginMobile = (
        (form.loginPhone || form.fatherPhone || form.motherPhone || form.guardianPhone || '').replace(/\D/g, '')
      ).slice(-10);
      const studentData: CreateStudentInput = {
        ...rest,
        admissionDate: resolvedAdmissionDate,
        // Force class/section blank so the AR insert in create() is skipped
        // (UNASSIGNED bucket). totalFee is taken in the assignment modal.
        className: '', section: '', stream: undefined, totalFee: 0,
        // Father / Mother / Guardian phones go through as plain
        // contact info now. The dedicated loginPhone drives auth.
        loginPhone: canonicalLoginMobile,
        fatherName: rest.fatherName || rest.motherName || rest.guardianName || 'Parent',
      };
      const { student, parent } = await studentService.create(studentData);

      // PRINCIPAL_REVIEW: close the linked teacher draft so it stops
      // showing in the approvals queue. We do this *after* the student
      // row is in so the queue update reflects the real outcome.
      if (mode === 'PRINCIPAL_REVIEW' && draftId) {
        try {
          await principalService.approveAdmissionDraft(draftId, student.id);
        } catch (closeErr) {
          // eslint-disable-next-line no-console
          console.error('[admission] failed to close approval row', closeErr);
          showToast('Student admitted, but draft row could not be closed — refresh approvals.', 'error');
        }
      }

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

      // Document uploads (photo / Aadhaar / Birth Cert / TC) were
      // removed from the admission flow — they now happen from the
      // student profile after admission, via the Document Checklist
      // panel. Admission stays fast and offline-tolerant.

      // Wrap the post-create UI updates so a render error in any one of
      // the downstream components (admission-print, list refresh) doesn't
      // leave the user on a hard crash with no recovery — toast surfaces
      // the failure but the form state is still cleared and the user
      // lands back on LIST.
      try {
        setStudents(prev => [...prev, student]);
        setSelected(student);
        setForm(BLANK_FORM_WITH_PARENT);
        setReligionIsOther(false);
        setCasteIsOther(false);
        setSubView('LIST');
        // PRINCIPAL_REVIEW done — bounce back to the approvals queue.
        if (mode === 'PRINCIPAL_REVIEW' && onDraftDone) onDraftDone();
        // Admission-print modal is rendered at a top-level branch which is
        // unreachable while mainView==='ADMISSION', so flipping this flag
        // here was a no-op that risked leaving the modal stuck open if the
        // user later switched away. Kept off until the print flow is moved
        // into the admission view itself.
        // if (schoolInfo) setShowAdmissionForm(true);
      } catch (uiErr) {
        // eslint-disable-next-line no-console
        console.error('[admission] post-create UI update failed', uiErr);
        showToast('Student saved, but UI update failed — please refresh', 'error');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Admission failed';
      showToast(msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };


  // ── Archive lifecycle handlers ──────────────────────────────────────────
  const handleMarkFailed = async (student: Student) => {
    const ok = await useUIStore.getState().askConfirm({
      title: `Mark ${student.name} as FAILED?`,
      message: 'Will be marked FAILED in the active year\'s promotion records. Reversing this requires the principal to enable Editor Mode.',
      confirmLabel: 'Mark Failed',
      destructive: true,
    });
    if (!ok) return;
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
    const ok = await useUIStore.getState().askConfirm({
      title: `Re-admit ${student.name}?`,
      message: 'Iss student ko aap manually class assign karna padega next step me.',
      confirmLabel: 'Re-admit',
    });
    if (!ok) return;
    try {
      // Server requires class+section now (creates AR row for active year).
      // Use the student's last-known class as the default placeholder; the
      // assignment modal opens immediately after for the principal to
      // adjust if needed.
      await studentService.readmitStudent(student.id, student.className || 'Unassigned', student.section || '');
      showToast(`${student.name} re-admitted — assign them to a class`);
      await refreshArchive();
      const all = await studentService.getAll(); setStudents(all);
      const refreshed = await studentService.getById(student.id);
      if (refreshed) setAssignTarget(refreshed);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed', 'error');
    }
  };

  const handleIssueTC = async () => {
    if (!tcModal) return;
    try {
      // tcNumber is auto-generated by the RPC unless principal supplied
      // a custom override (school's off-app numbering).
      await studentService.issueTC(
        tcModal.student.id,
        tcModal.reason,
        tcModal.tcNumber.trim() || undefined,
      );
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
    // Principal opened a teacher's draft from the REVIEW filter. Mount
    // a nested StudentsManager in PRINCIPAL_REVIEW mode prefilled from
    // the saved payload — same flow as the Approvals queue Review &
    // Admit button. On done/back we clear `reviewing` to restore the
    // queue list.
    if (reviewing && reviewing.type === 'ADMISSION') {
      const prefill = (reviewing.draftPayload ?? {}) as Partial<CreateStudentInput>;
      return (
        <StudentsManager
          mode="PRINCIPAL_REVIEW"
          draftId={reviewing.id}
          draftPrefill={prefill}
          onBack={() => setReviewing(null)}
          onDraftDone={() => { setReviewing(null); void refreshPendingDrafts(); }}
        />
      );
    }
    const q = search.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    // Filter pills — class chips driven by what's actually in the data, plus
    // an "Unassigned" pseudo-bucket and a fee-status filter. The active filter
    // lives in `admFilter` state above; "ALL" is the default no-op.
    const distinctClasses: string[] = Array.from(
      new Set<string>(students.map(s => s.className).filter((c): c is string => !!c && c !== ''))
    ).sort();
    const passesFilter = (s: Student): boolean => {
      switch (admFilter.type) {
        case 'ALL':        return true;
        case 'ASSIGNED':   return !!s.className;
        case 'UNASSIGNED': return !s.className;
        case 'CLASS':      return s.className === admFilter.value;
        case 'FEE':        return String(s.feeStatus) === admFilter.value;
        // Inactive list comes from a separate state — this branch should
        // never run, but a defensive `false` keeps the type-narrowing
        // exhaustive without leaking active rows.
        case 'INACTIVE':   return false;
      }
    };
    // INACTIVE tab uses its own pre-fetched list (TC'd / failed / etc).
    // Everyone else uses the in-memory active-only `students` array.
    const sourceList: Student[] = admFilter.type === 'INACTIVE' ? inactiveStudents : students;
    const filteredStudents = sourceList
      .filter(s => admFilter.type === 'INACTIVE' ? true : passesFilter(s))
      .filter(s => {
        if (!q) return true;
        if (s.name.toLowerCase().includes(q)) return true;
        if (s.rollNo.includes(search)) return true;
        if (s.admissionNo.toLowerCase().includes(q)) return true;
        // Mobile-number search (item 5.3): match digit-only prefix
        // against either parent's phone, ignoring formatting.
        if (digits && digits.length >= 3) {
          const fp = (s.fatherPhone || '').replace(/\D/g, '');
          const mp = (s.motherPhone || '').replace(/\D/g, '');
          if (fp.includes(digits) || mp.includes(digits)) return true;
        }
        return false;
      })
      .sort((a, b) => new Date(b.admissionDate ?? 0).getTime() - new Date(a.admissionDate ?? 0).getTime());

    const unassignedCount = students.filter(s => !s.className).length;
    // Filters here are FEE statuses, not admission statuses. Earlier this
    // chip read just "Pending" which read like "admission pending" — a
    // principal saw a class-assigned student under it and assumed a bug.
    // Prefix every label with "Fee" so it's unambiguous.
    const feeStatusOptions: Array<{ key: string; label: string; cls: string }> = [
      { key: 'PAID',    label: 'Fee Paid',    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
      { key: 'PARTIAL', label: 'Fee Partial', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
      { key: 'PENDING', label: 'Fee Unpaid',  cls: 'bg-rose-50 text-rose-700 border-rose-200' },
    ];

    if (subView === 'CREATE') return (
      // h-full so the inner flex-1 scroll area gets a real height to
      // distribute. Without it the outer box is content-sized, sticky
      // children can't extend past form-bottom, and the Cancel/Next
      // bar lands in the middle of the form on short pages.
      <div className="w-full h-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        {renderHeader(
          mode === 'TEACHER_DRAFT' ? 'New Admission Draft'
          : mode === 'PRINCIPAL_REVIEW' ? 'Review Draft'
          : 'New Admission',
          () => {
            // In non-PRINCIPAL_FULL modes there's no LIST behind the form
            // — bail all the way back to the parent screen instead of
            // landing on an empty Students list.
            if (mode !== 'PRINCIPAL_FULL') { onBack(); return; }
            setSubView('LIST');
          },
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-24">

          {/* ─── Basic Info ────────────────────────────────────────── */}
          <div className="text-[10px] font-black uppercase tracking-widest text-indigo-600 px-1">1. Basic Info</div>
          {/* Photo upload moved to Profile → Document Checklist (post-admission).
              Keeping it inline at admission time stalled the form on slow
              wifi and added one more "Did I tap upload?" gotcha. */}

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Student Info</p>

            {/* Full Name */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                Full Name<sup className="text-rose-500 font-black ml-0.5">*</sup>
              </label>
              <input value={form.name ?? ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Student full name"
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500 focus:bg-white transition-colors" />
            </div>

            {/* Admission No. with Auto-generate chip on the right.
                Format: <3-letter school code><2-digit year><001…>.
                Sequential per (schoolCode, yearCode) — scans existing
                admissionNo's in the loaded students[] for the highest
                trailing number that matches the prefix and adds 1.
                Principal can still type a custom number to override. */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                Admission No.<sup className="text-rose-500 font-black ml-0.5">*</sup>
              </label>
              <div className="flex gap-2">
                <input value={form.admissionNo ?? ''} onChange={e => setForm(f => ({ ...f, admissionNo: e.target.value }))}
                  placeholder="ADM-2024-XXX"
                  className="flex-1 min-w-0 border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500 focus:bg-white transition-colors" />
                <button type="button"
                  onClick={() => {
                    const rawName = (schoolInfo?.name ?? '').replace(/[^A-Za-z]/g, '').toUpperCase();
                    if (rawName.length < 3) {
                      showToast('Set the school name (min 3 letters) — Settings → School Info', 'error');
                      return;
                    }
                    const code = rawName.slice(0, 3);
                    // Year: first 4-digit number in activeYear.name (e.g. "2024-2025" → 24).
                    const yearMatch = (activeYear?.name ?? '').match(/\d{4}/);
                    const yr = yearMatch ? yearMatch[0].slice(-2) : new Date().getFullYear().toString().slice(-2);
                    const prefix = `${code}${yr}`;
                    // Find highest existing sequence for this prefix in the
                    // already-loaded students. Pads to 3 digits, but if the
                    // school has crossed 999 it'll still increment correctly.
                    let max = 0;
                    const re = new RegExp(`^${prefix}(\\d+)$`);
                    for (const s of students) {
                      const m = (s.admissionNo ?? '').match(re);
                      if (m) max = Math.max(max, parseInt(m[1], 10));
                    }
                    const next = String(max + 1).padStart(3, '0');
                    setForm(f => ({ ...f, admissionNo: `${prefix}${next}` }));
                  }}
                  className="shrink-0 px-3 py-3 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-[11px] font-black uppercase tracking-widest rounded-xl transition-transform shadow-sm shadow-indigo-200">
                  Auto
                </button>
              </div>
              <p className="text-[10px] font-bold text-slate-400 mt-1.5">
                Auto = School-3 + Year-2 + 001 (e.g. ABC25001). Aap manually bhi likh sakte hain.
              </p>
            </div>

            {/* Earlier these fields lived under a collapsible
                "+ Add more details" disclosure. DOB is mandatory in
                handleCreate's validation, so hiding it behind a tap
                meant principals were skipping it and getting an
                unexpected error on submit. Always-visible now —
                slightly longer first screen, but no compulsory
                field is one click away from being missed. */}

            <>
            {/* Aadhaar — moved here from the always-visible array
                above. Optional for most boards; principals fill it
                later once parents bring the card. */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                Aadhaar No. <span className="text-slate-400 normal-case font-bold text-[9px]">(optional)</span>
              </label>
              <input value={form.aadhaarNo ?? ''} onChange={e => setForm(f => ({ ...f, aadhaarNo: e.target.value }))}
                placeholder="XXXX XXXX XXXX"
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500 focus:bg-white transition-colors" />
            </div>

            {/* Gender dropdown */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                Gender <span className="text-rose-500">*</span>
              </label>
              <select value={form.gender} required
                onChange={e => setForm(f => ({ ...f, gender: e.target.value as any }))}
                className={`w-full border rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500 focus:bg-white transition-colors ${
                  form.gender ? 'border-slate-200 bg-slate-50' : 'border-slate-300 bg-slate-50 text-slate-500'
                }`}>
                <option value="">— Select gender —</option>
                {GENDER_OPTIONS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>
            </div>

            {/* Religion dropdown + Other text */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Religion <span className="text-slate-400 normal-case font-bold text-[9px]">(optional)</span></label>
              <select
                value={religionIsOther ? 'Other' : (RELIGION_OPTIONS.includes(form.religion ?? '') ? form.religion : '')}
                onChange={e => {
                  if (e.target.value === 'Other') {
                    setReligionIsOther(true);
                    setForm(f => ({ ...f, religion: '' }));
                  } else {
                    setReligionIsOther(false);
                    setForm(f => ({ ...f, religion: e.target.value }));
                  }
                }}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500 focus:bg-white transition-colors">
                <option value="">Select religion</option>
                {RELIGION_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              {religionIsOther && (
                <input value={form.religion ?? ''} onChange={e => setForm(f => ({ ...f, religion: e.target.value }))}
                  placeholder="Enter religion"
                  className="w-full mt-2 border border-indigo-300 bg-indigo-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500 focus:bg-white transition-colors" />
              )}
            </div>

            {/* Caste dropdown + Other text */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Caste / Category <span className="text-slate-400 normal-case font-bold text-[9px]">(optional)</span></label>
              <select
                value={casteIsOther ? 'Other' : (CASTE_OPTIONS.includes(form.caste ?? '') ? form.caste : '')}
                onChange={e => {
                  if (e.target.value === 'Other') {
                    setCasteIsOther(true);
                    setForm(f => ({ ...f, caste: '' }));
                  } else {
                    setCasteIsOther(false);
                    setForm(f => ({ ...f, caste: e.target.value }));
                  }
                }}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500 focus:bg-white transition-colors">
                <option value="">Select category</option>
                {CASTE_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              {casteIsOther && (
                <input value={form.caste ?? ''} onChange={e => setForm(f => ({ ...f, caste: e.target.value }))}
                  placeholder="Enter caste / category"
                  className="w-full mt-2 border border-indigo-300 bg-indigo-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500 focus:bg-white transition-colors" />
              )}
            </div>

            {/* PEN & Birth Cert */}
            {[
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
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                  Date of Birth <span className="text-rose-500">*</span>
                </label>
                <input type="date" value={form.dob}
                  required
                  max={new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })}
                  min="1950-01-01"
                  onChange={e => setForm(f => ({ ...f, dob: e.target.value }))}
                  className="w-full appearance-none border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Blood Group</label>
                <select value={form.bloodGroup} onChange={e => setForm(f => ({ ...f, bloodGroup: e.target.value as any }))}
                  className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none focus:border-indigo-500">
                  {BLOOD_GROUPS.map(bg => <option key={bg}>{bg}</option>)}
                </select>
              </div>
            </div>
            {/* Admission date — optional, backdate-only. Empty defaults
                to today (IST). Useful for entering a student whose
                paperwork was completed last week but data entry happens
                today. Future dates rejected — admission can't be
                scheduled into tomorrow. */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                Admission Date <span className="text-slate-400 normal-case tracking-normal">(optional — khaali = aaj)</span>
              </label>
              <input type="date"
                value={form.admissionDate ?? ''}
                max={todayIST()}
                onChange={e => setForm(f => ({ ...f, admissionDate: e.target.value || todayIST() }))}
                className="w-full appearance-none border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none focus:border-indigo-500" />
            </div>
            {[
              { label: 'Phone', key: 'phone', placeholder: '+91 XXXXX XXXXX' },
              { label: 'Email', key: 'email', placeholder: 'student@school.edu.in' },
              { label: 'Address', key: 'address', placeholder: 'Full residential address' },
            ].map(({ label, key, placeholder }) => (
              <div key={key}>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                  {label} <span className="text-slate-400 normal-case font-bold text-[9px]">(optional)</span>
                </label>
                <input value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500" />
              </div>
            ))}
            </>
          </div>

          {/* ─── Family ───────────────────────────────────────────── */}
          <div className="text-[10px] font-black uppercase tracking-widest text-indigo-600 px-1 pt-4">2. Family</div>
          {/* ── Parent details — single consolidated section ────────────
              Login Mobile is now an explicit field separate from
              father / mother / guardian contact phones. */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Parent Details</p>
              <p className="text-[10px] font-bold text-slate-500 mt-1">
                Father / Mother phones are contact info only. Use the dedicated "Login Mobile" field below for the login number — it can be the same as Father's, Mother's, or anyone else's.
              </p>
            </div>
            {[
              { label: "Father's Name", key: 'fatherName', placeholder: 'Full name', req: true },
              { label: "Father's Phone", key: 'fatherPhone', placeholder: '10-digit mobile (contact)', hint: 'Contact info only' },
              { label: "Father's Occupation", key: 'fatherOccupation', placeholder: 'Business / Service / Farmer / etc.' },
              { label: "Father's Income", key: 'fatherIncome', placeholder: 'e.g. 5-10 LPA' },
              { label: "Father's Email", key: 'fatherEmail', placeholder: 'father@email.com' },
              { label: "Mother's Name", key: 'motherName', placeholder: 'Full name' },
              { label: "Mother's Phone", key: 'motherPhone', placeholder: '10-digit mobile (contact)', hint: 'Contact info only' },
              { label: "Mother's Occupation", key: 'motherOccupation', placeholder: 'Occupation or Homemaker' },
              {
                label: 'Login Mobile',
                key: 'loginPhone',
                placeholder: '10-digit mobile parent uses to log in',
                req: true,
                hint: 'Parent will use this number + a temp password to log in. Can be same as Father / Mother / Guardian.',
              },
            ].map(({ label, key, placeholder, req, hint }) => (
              <div key={key}>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                  {label}{req && <sup className="text-rose-500 font-black ml-0.5">*</sup>}
                  {hint && <span className="text-slate-400 normal-case font-bold text-[9px] ml-2">({hint})</span>}
                </label>
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

          {/* Document uploads (Photo / Aadhaar / Birth Certificate /
              Transfer Certificate) live on the student's profile page
              now, in the Document Checklist panel. Removing them from
              the admission flow cut three round-trips out of a slow-
              wifi admission and ended the "form looks done but upload
              still pending" gotcha. */}
          <div className="bg-sky-50 border border-sky-200 rounded-2xl p-3.5 mt-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-sky-700">Documents</p>
            <p className="text-xs font-bold text-sky-800 mt-1.5 leading-relaxed">
              Upload photo + documents from the student's profile after admission. Open the student → Documents tab → Document Checklist.
            </p>
          </div>

        </div>

        {/* Sticky footer — single Cancel + Submit pair. All field
            validation runs inside handleCreate so missing fields are
            reported in one aggregated toast instead of mid-scroll. */}
        <div className="sticky bottom-0 bg-white border-t border-slate-200 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] px-4 py-3 flex items-center gap-2 z-20">
          <button
            type="button"
            onClick={() => {
              if (mode !== 'PRINCIPAL_FULL') { onBack(); return; }
              setSubView('LIST');
            }}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs uppercase tracking-widest rounded-xl active:scale-95 transition-transform">
            <ArrowLeft size={14} /> Cancel
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={handleCreate}
            disabled={isSubmitting}
            className="flex items-center gap-1.5 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs uppercase tracking-widest rounded-xl active:scale-95 transition-transform shadow-md shadow-indigo-200 disabled:opacity-60">
            {isSubmitting
              ? (mode === 'TEACHER_DRAFT' ? 'Submitting…' : 'Admitting…')
              : mode === 'TEACHER_DRAFT'
                ? <><Plus size={14} /> Submit Draft</>
                : mode === 'PRINCIPAL_REVIEW'
                  ? <><CheckCircle2 size={14} /> Approve & Admit</>
                  : <><Plus size={14} /> Admit Student</>}
          </button>
        </div>
      </div>
    );

    return (
      <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        {/* Submit overlay — covers the whole screen while the network round
            trip is in flight. Stops the principal from tapping the button
            twice (which used to fire two parallel creates) and gives a
            clear visual "yes the app is working, hang tight" instead of
            the silent "hang" feeling. Backdrop intercepts every touch. */}
        {isSubmitting && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-150">
            <div className="bg-white rounded-2xl shadow-2xl px-8 py-6 flex flex-col items-center gap-3 max-w-xs">
              <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"/>
              <p className="font-black text-slate-900 text-sm">
                {mode === 'TEACHER_DRAFT' ? 'Submitting draft…' : 'Admitting student…'}
              </p>
              <p className="text-[11px] font-bold text-slate-500 text-center leading-relaxed">
                Parent account, fee schedule, audit log set up ho rahe hain. 5–10 second lagega.
              </p>
            </div>
          </div>
        )}
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
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  // Filename reflects the active filter so the downloaded file
                  // is self-describing — "students_class-8-A_…" instead of an
                  // anonymous "students_admissions_…".
                  const slug =
                    admFilter.type === 'CLASS'      ? `class-${admFilter.value.replace(/^Class\s*/i,'').replace(/\s+/g,'-')}` :
                    admFilter.type === 'UNASSIGNED' ? 'unassigned' :
                    admFilter.type === 'FEE'        ? `fee-${admFilter.value.toLowerCase()}` :
                    'all';
                  exportCsv(
                    `students_${slug}_${new Date().toISOString().slice(0, 10)}`,
                    filteredStudents.map(s => ({
                      admission_no: s.admissionNo,
                      name: s.name,
                      admission_date: s.admissionDate ?? '',
                      class: s.className ?? '',
                      section: s.section ?? '',
                      roll_no: s.rollNo ?? '',
                      gender: s.gender ?? '',
                      dob: s.dob ?? '',
                      phone: s.phone ?? '',
                      father_name: s.fatherName ?? '',
                      father_phone: s.fatherPhone ?? '',
                      mother_name: s.motherName ?? '',
                      mother_phone: s.motherPhone ?? '',
                      is_rte: s.rte ? 'YES' : 'NO',
                      fee_status: String(s.feeStatus ?? ''),
                      total_fee: s.totalFee ?? 0,
                      paid_fee: s.paidFee ?? 0,
                      pending_fee: Math.max(0, (s.totalFee ?? 0) - (s.paidFee ?? 0)),
                    })),
                  );
                }}
                disabled={filteredStudents.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs rounded-xl active:scale-95 transition-all disabled:opacity-40">
                <Download size={13} /> CSV
              </button>
              <button onClick={() => { setSubView('CREATE'); }}
                className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white font-black text-xs rounded-xl shadow-md active:scale-95 transition-transform">
                <Plus size={14} /> New
              </button>
            </div>
          </div>
          <div className="px-4 pb-3 space-y-2">
            <div className="relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, roll, admission or mobile…"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 font-bold text-sm outline-none focus:border-indigo-500 focus:bg-white transition-colors" />
            </div>
            {/* Filter row — refactored to a segmented control pattern.
                Earlier: tinted-background pills with ALL-CAPS labels and
                inconsistent active tones looked like a row of alerts,
                not filters. Now: single rounded container with subtle
                separators, mixed-case labels, count badges instead of
                inline parens. Mobile: horizontal scroll; desktop:
                wraps to single line. Active state = solid pill inside
                the container. */}
            <div className="flex gap-1 p-1 bg-slate-100 rounded-2xl overflow-x-auto hide-scrollbar -mx-1">
              {([
                { key: 'ALL',        label: 'All',        count: students.length,                       active: 'bg-slate-900 text-white',   countActive: 'bg-white/20 text-white', countIdle: 'bg-slate-200 text-slate-600' },
                { key: 'ASSIGNED',   label: 'Assigned',   count: students.length - unassignedCount,     active: 'bg-emerald-600 text-white', countActive: 'bg-white/20 text-white', countIdle: 'bg-emerald-100 text-emerald-700' },
                { key: 'UNASSIGNED', label: 'Unassigned', count: unassignedCount,                       active: 'bg-amber-500 text-white',   countActive: 'bg-white/20 text-white', countIdle: 'bg-amber-100 text-amber-700' },
                { key: 'INACTIVE',   label: 'Inactive',   count: inactiveLoaded ? inactiveStudents.length : null, active: 'bg-rose-600 text-white', countActive: 'bg-white/20 text-white', countIdle: 'bg-rose-100 text-rose-700' },
              ] as const).map(f => {
                const isActive = admFilter.type === f.key;
                return (
                  <button key={f.key}
                    onClick={() => setAdmFilter({ type: f.key })}
                    className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                      isActive ? f.active : 'text-slate-600 hover:bg-white'
                    }`}>
                    <span>{f.label}</span>
                    {f.count !== null && (
                      <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full tabular-nums ${
                        isActive ? f.countActive : f.countIdle
                      }`}>
                        {f.count}
                      </span>
                    )}
                    {f.key === 'INACTIVE' && !inactiveLoaded && inactiveLoading && (
                      <span className="text-[10px] font-bold text-slate-400">…</span>
                    )}
                  </button>
                );
              })}
              {pendingDrafts.length > 0 && (
                <button onClick={() => setAdmFilter({ type: 'REVIEW' })}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                    admFilter.type === 'REVIEW'
                      ? 'bg-violet-600 text-white'
                      : 'text-violet-700 hover:bg-white'
                  }`}>
                  <span>Review</span>
                  <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full tabular-nums ${
                    admFilter.type === 'REVIEW' ? 'bg-white/20 text-white' : 'bg-violet-100 text-violet-700'
                  }`}>
                    {pendingDrafts.length}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {/* REVIEW filter: render the pending teacher-submitted drafts
              instead of the students list. Tapping a row opens the
              admission form prefilled (PRINCIPAL_REVIEW mode). */}
          {admFilter.type === 'REVIEW' ? (
            <div className="space-y-2">
              {pendingDrafts.length === 0 ? (
                <div className="flex flex-col items-center py-16 text-slate-400">
                  <FileText size={32} className="mb-3 opacity-40" />
                  <p className="font-bold text-sm">No drafts pending review</p>
                  <p className="text-xs font-medium mt-1">Teacher submissions will appear here</p>
                </div>
              ) : (
                pendingDrafts.map(d => {
                  const initials = (d.fromName || '?').split(' ').map(w => w[0]).join('').slice(0, 2);
                  return (
                    <div key={d.id}
                      className="bg-white rounded-2xl border border-violet-100 shadow-sm p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center font-black text-sm shrink-0">
                          {initials.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-extrabold text-slate-900 text-sm truncate">{d.fromName || 'Unnamed'}</div>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="text-[10px] font-bold text-slate-400">Adm No:</span>
                            <span className="text-[10px] font-bold text-indigo-500">{d.fromAdmissionNo || '—'}</span>
                            <span className="text-[9px] font-bold text-slate-300">·</span>
                            <span className="text-[10px] font-bold text-slate-400">{d.createdAt}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => { setRejectingDraft(d); setRejectReasonText(''); }}
                          className="flex-1 py-2.5 bg-rose-50 text-rose-700 border border-rose-200 font-black text-[11px] uppercase tracking-widest rounded-xl active:scale-95 transition-transform">
                          Reject
                        </button>
                        <button
                          onClick={() => setReviewing(d)}
                          className="flex-[2] py-2.5 bg-violet-600 text-white font-black text-[11px] uppercase tracking-widest rounded-xl active:scale-95 transition-transform">
                          Review &amp; Admit
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
          <div className="space-y-2">
            {filteredStudents.slice(0, showCountAdmission).map(student => {
              const initials = student.name.split(' ').map(w => w[0]).join('').slice(0, 2);
              return (
                <button key={student.id}
                  onClick={() => { setSelected(student); setSubView('PROFILE'); }}
                  className="w-full bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-left active:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-black text-sm shrink-0">
                      {initials.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-extrabold text-slate-900 text-sm truncate">{student.name}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] font-bold text-slate-400">
                          {student.className
                            ? `${student.className}${student.section ? `·${student.section.replace(/_/g, '/')}` : ''}`
                            : 'Unassigned'}
                        </span>
                        <span className="text-[9px] font-bold text-slate-300">·</span>
                        <span className="text-[10px] font-bold text-indigo-500">{student.admissionNo}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {/* Admission badge — assignment status, not fee status.
                          Earlier this surfaced fee state (PARTIAL / PENDING)
                          which clashed with the page header ("Admission") and
                          left the principal asking "why is this PENDING when
                          class is assigned?". Fee status is still visible on
                          the student profile + Fee Ledger pages. */}
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${
                        student.className
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {student.className ? 'Assigned' : 'Unassigned'}
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
          )}
        </div>

        {/* Reject-draft modal — opened from a draft row in the Review filter. */}
        {rejectingDraft && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4"
               onClick={() => { if (!rejectingBusy) { setRejectingDraft(null); setRejectReasonText(''); } }}>
            <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-3"
                 onClick={e => e.stopPropagation()}>
              <p className="text-[10px] font-black uppercase tracking-widest text-rose-500">Reject Draft</p>
              <p className="text-sm font-bold text-slate-700">
                {rejectingDraft.fromName || 'Unnamed'} <span className="text-slate-400">· {rejectingDraft.fromAdmissionNo || '—'}</span>
              </p>
              <textarea
                placeholder="Reason (not visible to teacher — for internal audit only)"
                value={rejectReasonText}
                onChange={e => setRejectReasonText(e.target.value)}
                rows={3}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-rose-400 resize-none"
              />
              <div className="flex gap-2">
                <button
                  disabled={rejectingBusy}
                  onClick={() => { setRejectingDraft(null); setRejectReasonText(''); }}
                  className="flex-1 py-3 bg-slate-100 text-slate-600 font-black rounded-xl text-sm">
                  Cancel
                </button>
                <button
                  disabled={rejectingBusy || !rejectReasonText.trim()}
                  onClick={submitDraftReject}
                  className="flex-1 py-3 bg-rose-600 text-white font-black rounded-xl text-sm disabled:opacity-50">
                  {rejectingBusy ? 'Rejecting…' : 'Confirm Reject'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── ARCHIVE (Lifecycle buckets) ────────────────────────────────────────

  if (!renderProfile && mainView === 'ARCHIVE') {
    const aq = search.trim().toLowerCase();
    const aDigits = aq.replace(/\D/g, '');
    const filtered = archiveStudents.filter(s => {
      if (!aq) return true;
      if (s.name.toLowerCase().includes(aq)) return true;
      if (s.admissionNo.toLowerCase().includes(aq)) return true;
      if (s.rollNo.includes(search)) return true;
      // Mobile-number search (item 5.3): match digit-only prefix against
      // either parent's phone, ignoring formatting. Same semantics as the
      // ADMISSION list above so principals only need to remember one rule.
      if (aDigits && aDigits.length >= 3) {
        const fp = (s.fatherPhone || '').replace(/\D/g, '');
        const mp = (s.motherPhone || '').replace(/\D/g, '');
        if (fp.includes(aDigits) || mp.includes(aDigits)) return true;
      }
      return false;
    });

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
                placeholder="Search by name, roll, admission or mobile…"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 font-bold text-sm outline-none focus:border-indigo-500 focus:bg-white transition-colors" />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {archiveLoading && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <SkeletonRow count={5} />
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
                    onClick={() => { setSelected(student); setSubView('PROFILE'); }}
                    className="w-full flex items-center gap-3 text-left active:bg-slate-50 transition-colors p-1 rounded-xl">
                    <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-black text-sm shrink-0">
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
              // Refresh the fee cache too — assignment generated installments
              // server-side, but the in-memory cache used by FeeLedger /
              // FeesView is stale until we explicitly reload. Without this,
              // the principal opens FeeLedger right after and sees an empty
              // schedule until they hard-refresh the page.
              await Promise.all([
                refreshArchive(),
                feeService.refreshAll().catch(() => undefined),
              ]);
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
    // School-wide totals from in-memory students list
    const totalFeeAll  = students.reduce((s, x) => s + x.totalFee, 0);
    const totalPaidAll = students.reduce((s, x) => s + x.paidFee,  0);
    const totalDueAll  = Math.max(0, totalFeeAll - totalPaidAll);
    const countPaid    = students.filter(s => s.feeStatus === 'PAID').length;
    const countPartial = students.filter(s => s.feeStatus === 'PARTIAL').length;
    const countUnpaid  = students.filter(s => s.feeStatus === 'UNPAID' || s.feeStatus === 'OVERDUE').length;

    const filteredFees = students.filter(s => {
      const matchClass  = classFilter === 'ALL' || s.className === classFilter;
      const matchSearch = s.name.toLowerCase().includes(search.toLowerCase());
      const matchStatus = feeStatusFilter === 'ALL' || s.feeStatus === feeStatusFilter;
      return matchClass && matchSearch && matchStatus;
    });

    const FEE_STATUS_TABS: Array<{ key: 'ALL' | 'PAID' | 'PARTIAL' | 'UNPAID' | 'OVERDUE'; label: string; count: number; color: string }> = [
      { key: 'ALL',     label: 'All',     count: students.length, color: 'bg-slate-700 text-white' },
      { key: 'UNPAID',  label: 'Due',     count: countUnpaid,     color: 'bg-rose-600 text-white' },
      { key: 'PARTIAL', label: 'Partial', count: countPartial,    color: 'bg-amber-500 text-white' },
      { key: 'PAID',    label: 'Paid',    count: countPaid,       color: 'bg-emerald-600 text-white' },
    ];

    return (
      <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        {renderHeader('Fee Collection', () => setMainView('MENU'))}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">

          {/* School-wide fee summary card */}
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-4 text-white">
            <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-3">
              {activeYear?.name ?? 'Current Year'} · Fee Overview
            </p>
            <div className="grid grid-cols-3 gap-3 text-center mb-4">
              <div>
                <div className="text-lg font-black text-white">₹{(totalFeeAll / 1000).toFixed(0)}K</div>
                <div className="text-[8px] font-bold text-white/40 uppercase mt-0.5">Total Billed</div>
              </div>
              <div>
                <div className="text-lg font-black text-emerald-400">₹{(totalPaidAll / 1000).toFixed(0)}K</div>
                <div className="text-[8px] font-bold text-white/40 uppercase mt-0.5">Collected</div>
              </div>
              <div>
                <div className="text-lg font-black text-rose-400">₹{(totalDueAll / 1000).toFixed(0)}K</div>
                <div className="text-[8px] font-bold text-white/40 uppercase mt-0.5">Pending</div>
              </div>
            </div>
            <div className="bg-white/10 rounded-full h-2">
              <div className="h-2 rounded-full bg-emerald-400 transition-all"
                style={{ width: totalFeeAll > 0 ? `${Math.round((totalPaidAll / totalFeeAll) * 100)}%` : '0%' }} />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[9px] font-bold text-white/30">0%</span>
              <span className="text-[9px] font-black text-emerald-400">
                {totalFeeAll > 0 ? Math.round((totalPaidAll / totalFeeAll) * 100) : 0}% collected
              </span>
              <span className="text-[9px] font-bold text-white/30">100%</span>
            </div>
            {/* Quick status counts */}
            <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-white/10">
              <div className="text-center">
                <div className="text-sm font-black text-emerald-300">{countPaid}</div>
                <div className="text-[8px] font-bold text-white/30">Fully Paid</div>
              </div>
              <div className="text-center">
                <div className="text-sm font-black text-amber-300">{countPartial}</div>
                <div className="text-[8px] font-bold text-white/30">Partial</div>
              </div>
              <div className="text-center">
                <div className="text-sm font-black text-rose-300">{countUnpaid}</div>
                <div className="text-[8px] font-bold text-white/30">Due/Overdue</div>
              </div>
            </div>
          </div>

          {/* Status filter pills */}
          <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
            {FEE_STATUS_TABS.map(tab => (
              <button key={tab.key} onClick={() => setFeeStatusFilter(tab.key)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors ${
                  feeStatusFilter === tab.key ? tab.color : 'bg-white text-slate-500 border border-slate-200'
                }`}>
                {tab.label}
                <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black ${
                  feeStatusFilter === tab.key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                }`}>{tab.count}</span>
              </button>
            ))}
          </div>

          <div className="relative">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name…"
              className="w-full bg-white border border-slate-200 rounded-2xl pl-11 pr-4 py-3 font-bold text-sm outline-none focus:border-indigo-500 shadow-sm" />
          </div>

          {/* Class filter */}
          <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
            {['ALL', ...CLASS_OPTIONS.filter(c => students.some(s => s.className === c))].map(c => (
              <button key={c} onClick={() => setClassFilter(c)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors ${classFilter === c ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 border border-slate-200'}`}>
                {c}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            {filteredFees.length === 0 && (
              <div className="flex flex-col items-center py-12 text-slate-400">
                <IndianRupee size={28} className="mb-2 opacity-40" />
                <p className="font-bold text-sm">No students in this filter</p>
              </div>
            )}
            {filteredFees.slice(0, showCountFees).map(student => {
              const due = student.totalFee - student.paidFee;
              const pct = student.totalFee > 0 ? Math.round((student.paidFee / student.totalFee) * 100) : 0;
              return (
                <button key={student.id}
                  onClick={() => { setSelected(student); setSubView('PROFILE'); }}
                  className="w-full bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-left active:bg-slate-50 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-black text-sm shrink-0 mt-0.5">
                      {student.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-extrabold text-slate-900 text-sm truncate">{student.name}</div>
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase shrink-0 ${PAYMENT_COLORS[student.feeStatus]}`}>
                          {student.feeStatus}
                        </span>
                      </div>
                      <div className="text-[10px] font-bold text-slate-400 mt-0.5">
                        {student.className ? `${student.className}-${student.section}` : 'Unassigned'}
                        {due > 0 && <span className="text-rose-500 ml-1">· ₹{(due / 1000).toFixed(0)}K due</span>}
                      </div>
                      {student.totalFee > 0 && (
                        <div className="mt-2 bg-slate-100 rounded-full h-1.5">
                          <div className={`h-1.5 rounded-full transition-all ${
                            pct === 100 ? 'bg-emerald-500' : pct > 0 ? 'bg-amber-400' : 'bg-rose-400'
                          }`} style={{ width: `${pct}%` }} />
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
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
      return (parseInt(stripClassPrefix(a), 10) || 0) - (parseInt(stripClassPrefix(b), 10) || 0);
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
      const sortedClassStudents = [...filteredClassStudents]
        .sort((a, b) => (parseInt(a.rollNo, 10) || 0) - (parseInt(b.rollNo, 10) || 0));
      const visibleClassStudents = sortedClassStudents.slice(0, classRosterShown);
      const remainingClassStudents = sortedClassStudents.length - visibleClassStudents.length;

      return (
        <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
          <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-3 sticky top-0 z-10 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <button onClick={() => { setSelectedSection(null); setSearch(''); }} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
                <ArrowLeft size={20} />
              </button>
              <div>
                <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">
                  {stripClassPrefix(selectedClass)}-{selectedSection}
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
              {visibleClassStudents.map((s, idx) => (
                <button key={s.id}
                  onClick={() => { setSelected(s); setSubView('PROFILE'); }}
                  className={`w-full flex items-center gap-4 px-4 py-3.5 text-left active:bg-slate-50 transition-colors ${idx < visibleClassStudents.length - 1 ? 'border-b border-slate-100' : ''}`}>
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
            {remainingClassStudents > 0 && (
              <button onClick={() => setClassRosterShown(c => c + PAGE_SIZE)}
                className="w-full mt-3 py-3 bg-white border border-slate-200 rounded-2xl font-black text-xs text-indigo-700 hover:bg-indigo-50 transition-colors">
                Load More ({remainingClassStudents} remaining)
              </button>
            )}
            {sortedClassStudents.length > 0 && (
              <p className="text-center text-[10px] font-bold text-slate-300 pt-2">
                Showing {visibleClassStudents.length} of {sortedClassStudents.length} student{sortedClassStudents.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>
      );
    }

    // ── Sections in a class ────────────────────────────────────────────────
    if (selectedClass) {
      const clsNum = stripClassPrefix(selectedClass);
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
                    {/* Avatar shows first 2 chars only — section names like
                        "BIO-CHEMISTRY-PHYCIS" used to overflow the 44px box
                        and crash into the title. */}
                    <div className="w-11 h-11 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-lg shrink-0 overflow-hidden">
                      {sec.section.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '–'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-extrabold text-slate-900 text-sm truncate">{clsNum}-{sec.section}</div>
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
              <h2 className="text-xl font-black text-slate-900">Students</h2>
              <p className="text-[11px] font-semibold text-slate-400">
                {classNames.length} class{classNames.length !== 1 ? 'es' : ''}
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          <div className="grid grid-cols-2 gap-3">
            {classNames.map(cls => {
              const count = students.filter(s => s.className === cls).length;
              const clsNum = stripClassPrefix(cls);
              const numSections = dbSections.filter(s => s.className === cls).length;
              return (
                <button key={cls}
                  onClick={() => { setSelectedClass(cls); setSearch(''); }}
                  className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-left active:scale-95 transition-transform">
                  <div className="flex items-start justify-between mb-2">
                    <span className="font-black text-slate-900 text-base leading-tight">{clsNum}</span>
                    <ChevronRight size={18} className="text-slate-300 mt-0.5" />
                  </div>
                  {/* Reserve the same footprint as the loaded count so the
                      card doesn't reflow when data arrives. While loading
                      we show a faint dash instead of a pulsing block —
                      the block mid-card with no caption looked like a
                      broken image placeholder. */}
                  <div className="text-3xl font-black leading-none mb-1 tabular-nums">
                    {studentsLoading
                      ? <span className="text-slate-200">—</span>
                      : <span className="text-indigo-600">{count}</span>}
                  </div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    {numSections} section{numSections !== 1 ? 's' : ''}
                  </div>
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
    return (
      <StudentProfilePanel
        student={selected}
        onBack={() => setSubView('LIST')}
        onStudentChanged={async (updated) => {
          if (updated) setSelected(updated);
          const all = await studentService.getAll();
          setStudents(all);
          if (mainView === 'ARCHIVE') void refreshArchive();
        }}
      />
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

  {/* Admission Form Print Modal — only render when school info is ready.
      The handleCreate guard above already skips opening this if schoolInfo
      is null, so the user can't get stuck on a spinner here. */}
  if (showAdmissionForm && selected && schoolInfo) {
    return <AdmissionFormPrint student={selected} schoolInfo={schoolInfo}
      onClose={() => { setShowAdmissionForm(false); setSubView('LIST'); }} />;
  }

  return null;
};
