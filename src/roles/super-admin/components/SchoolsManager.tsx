import React, { useEffect, useState } from 'react';
import {
  ArrowLeft, Plus, Search, Building2, MapPin, Phone, Users,
  Edit2, CheckCircle2, Save, UserCheck,
  Copy, ChevronRight, BookOpen, TrendingUp, AlertCircle,
  RefreshCw, Key, X,
} from 'lucide-react';
import { adminApi } from '@/lib/adminApi';
import { apiAdminSchools } from '@/lib/apiClient';
import { supabase } from '@/lib/supabase';
import { Pagination } from '@/roles/super-admin/components/LogsViewer';
import { useSchoolStore } from '@/roles/super-admin/schoolStore';
import { useUIStore } from '@/store/uiStore';
import { School, CreateSchoolInput } from '@/roles/super-admin/school.types';
import { SchoolStatus, BillingPlan, STATUS_COLORS } from '@/shared/config/constants';
import { schoolService } from '@/shared/utils/school.service';
import { BackupCard } from '@/shared/components/BackupCard';

// Plans / billing-years / per-school payments — all part of the legacy
// billing system that's been replaced by school_billing_installments
// (managed from the dedicated Billing tab in the super-admin sidebar).
// Kept BillingPlan import only because school.types.ts still types it
// as required; we silently default it to BASIC on new schools.

type View = 'LIST' | 'CREATE' | 'DETAIL' | 'EDIT' | 'SECTIONS' | 'STUDENTS' | 'STAFF';

interface Props { onBack: () => void; }

// NOTE: This component MUST be declared outside SchoolsManager. If it were
// defined inside the parent's render body, every keystroke would create a new
// component identity, causing React to unmount/remount the underlying <input>
// — the visible symptom is the on-screen keyboard closing after each character.
interface FieldProps {
  label: string;
  k: string;
  placeholder: string;
  type?: string;
  locked?: boolean;
  form: Partial<CreateSchoolInput>;
  setForm: React.Dispatch<React.SetStateAction<Partial<CreateSchoolInput>>>;
}
const Field: React.FC<FieldProps> = ({ label, k, placeholder, type, locked, form, setForm }) => (
  <div>
    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">
      {label} {locked && <span className="text-[9px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">🔒 LOCKED</span>}
    </label>
    <input
      type={type ?? 'text'}
      value={(form as any)[k] ?? ''}
      readOnly={locked}
      disabled={locked}
      onChange={e => !locked && setForm(f => ({ ...f, [k]: e.target.value }))}
      placeholder={placeholder}
      className={`w-full border border-slate-200 rounded-xl px-4 py-3 font-bold text-sm outline-none transition-colors ${locked ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'bg-slate-50 focus:border-blue-500 focus:bg-white'}`}
    />
  </div>
);

const fmtDate = (d: string) => {
  const dt = new Date(d + (d.includes('T') ? '' : 'T00:00:00'));
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

type RealStaff = Awaited<ReturnType<typeof schoolService.getSchoolStaff>>[number];
type RealStudent = Awaited<ReturnType<typeof schoolService.getSchoolStudents>>[number];
type SchoolOverview = Awaited<ReturnType<typeof schoolService.getSchoolOverview>>;

export const SchoolsManager: React.FC<Props> = ({ onBack }) => {
  const { schools, fetchSchools, addSchool, updateSchool } = useSchoolStore();
  const { showToast } = useUIStore();

  const [view, setView]         = useState<View>('LIST');
  const [selected, setSelected] = useState<School | null>(null);
  const [selectedSection, setSelectedSection] = useState<any>(null);
  const [search, setSearch]     = useState('');
  const [activeAYIdx, setActiveAYIdx] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<{ schoolName: string; mobile: string; password: string } | null>(null);
  const [schoolStaff, setSchoolStaff]       = useState<RealStaff[]>([]);
  const [schoolStudents, setSchoolStudents] = useState<RealStudent[]>([]);
  const [staffLoading, setStaffLoading]     = useState(false);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [staffSearch, setStaffSearch]       = useState('');
  const [studentsSearch, setStudentsSearch] = useState('');
  const PAGE_SIZE = 25;
  const [stuPage, setStuPage] = useState(1);
  const [staffPage, setStaffPage] = useState(1);
  useEffect(() => { setStuPage(1); }, [studentsSearch]);
  useEffect(() => { setStaffPage(1); }, [staffSearch]);
  const [overview, setOverview]             = useState<SchoolOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);

  // Principal password reset — two-stage flow with explicit confirmation.
  //   1. Confirm dialog ("you sure?") — explains what will happen and why
  //      the principal will be logged out everywhere.
  //   2. Server generates a fresh random one-time password; we show it
  //      once. 24h cooldown enforced server-side so the same principal
  //      can't be reset repeatedly by mistake (or maliciously).
  // The previous "type-or-generate-then-submit" flow let an admin choose
  // a weak password; this new flow makes the password server-generated
  // (always strong) and adds the cooldown + audit tags.
  const [resetSchoolId, setResetSchoolId]   = useState<string | null>(null);
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetDone, setResetDone]   = useState<{ password: string; principalName: string; mobile: string } | null>(null);
  // Two-stage flow: pendingResetSchoolId opens the confirm prompt;
  // resetSchoolId opens the result modal once the API call fires.
  const [pendingResetSchoolId, setPendingResetSchoolId] = useState<string | null>(null);
  // AY-creation toggle confirm — same inline pattern as the password
  // reset (the global ConfirmModal store route silently drops prompts
  // in this EDIT view).
  const [pendingAyToggle, setPendingAyToggle] = useState<boolean | null>(null);
  const [ayToggleSaving, setAyToggleSaving] = useState(false);
  // Year-close one-shot toggle — same inline-confirm pattern as the AY
  // creation toggle. Auto-resets server-side after a successful close.
  const [pendingYearCloseToggle, setPendingYearCloseToggle] = useState<boolean | null>(null);
  const [yearCloseToggleSaving, setYearCloseToggleSaving] = useState(false);
  // School active/inactive toggle confirm
  const [pendingStatusToggle, setPendingStatusToggle] = useState<SchoolStatus | null>(null);
  const [statusToggleSaving, setStatusToggleSaving] = useState(false);
  // Profile drawer (super-admin can inspect any student / staff in full).
  const [profileTarget, setProfileTarget] = useState<{ type: 'student' | 'staff'; id: string; name: string } | null>(null);
  const [profileData, setProfileData] = useState<Record<string, unknown> | null>(null);
  const [profileExtra, setProfileExtra] = useState<Record<string, unknown> | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const openStudentProfile = async (id: string, name: string) => {
    setProfileTarget({ type: 'student', id, name });
    setProfileData(null); setProfileExtra(null); setProfileLoading(true);
    try {
      const { student, academicRecord } = await schoolService.getStudentFullProfile(id);
      setProfileData(student);
      setProfileExtra(academicRecord);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Profile load failed', 'error');
    } finally { setProfileLoading(false); }
  };

  const openStaffProfile = async (id: string, name: string) => {
    setProfileTarget({ type: 'staff', id, name });
    setProfileData(null); setProfileExtra(null); setProfileLoading(true);
    try {
      const { staff } = await schoolService.getStaffFullProfile(id);
      setProfileData(staff);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Profile load failed', 'error');
    } finally { setProfileLoading(false); }
  };

  const closeProfile = () => {
    setProfileTarget(null); setProfileData(null); setProfileExtra(null);
  };

  // Single-step reset: type the principal's last-4-of-mobile, then we
  // immediately fire the server call. The earlier two-modal flow (mobile
  // confirm → "Confirm Reset" review modal) felt broken — users would
  // type the digits and think nothing happened because the second modal
  // was easy to miss. Now: type-last-4 IS the confirmation; on success
  // we hop straight to the temp-password display modal.
  // Single-step reset with a styled inline confirm modal. We render the
  // confirm dialog right inside the EDIT view (next to the temp-password
  // modal) instead of routing through the global ConfirmModal store —
  // that route was mysteriously dropping prompts in this view earlier
  // (modal mounted at App.tsx but state set from here never reflected).
  // Inline render is dumber and reliably works.
  const openResetModal = (schoolId: string) => {
    setPendingResetSchoolId(schoolId);
  };

  const cancelResetConfirm = () => setPendingResetSchoolId(null);

  const confirmStatusToggle = async () => {
    if (pendingStatusToggle === null || !selected) return;
    const next = pendingStatusToggle;
    setStatusToggleSaving(true);
    try {
      await updateSchool(selected.id, { status: next });
      setSelected(prev => prev ? { ...prev, status: next } : null);
      setForm(f => ({ ...f, status: next }));
      showToast(next === SchoolStatus.ACTIVE ? 'School active' : 'School inactive');
      setPendingStatusToggle(null);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Status update failed', 'error');
    } finally {
      setStatusToggleSaving(false);
    }
  };

  const confirmAyToggle = async () => {
    if (pendingAyToggle === null || !selected) return;
    const next = pendingAyToggle;
    setAyToggleSaving(true);
    try {
      await updateSchool(selected.id, { newYearCreationEnabled: next });
      setSelected(prev => prev ? { ...prev, newYearCreationEnabled: next } : null);
      showToast(next ? 'New AY creation enabled' : 'New AY creation disabled');
      setPendingAyToggle(null);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Toggle failed', 'error');
    } finally {
      setAyToggleSaving(false);
    }
  };

  const confirmYearCloseToggle = async () => {
    if (pendingYearCloseToggle === null || !selected) return;
    const next = pendingYearCloseToggle;
    setYearCloseToggleSaving(true);
    try {
      await updateSchool(selected.id, { yearCloseEnabled: next });
      setSelected(prev => prev ? { ...prev, yearCloseEnabled: next } : null);
      showToast(next ? 'Year Close enabled — principal can now close this year' : 'Year Close disabled');
      setPendingYearCloseToggle(null);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Toggle failed', 'error');
    } finally {
      setYearCloseToggleSaving(false);
    }
  };

  const confirmAndReset = async () => {
    const schoolId = pendingResetSchoolId;
    if (!schoolId) return;
    setPendingResetSchoolId(null);
    setResetSchoolId(schoolId);
    setResetDone(null);
    setResetSubmitting(true);
    try {
      const r = await adminApi.resetPrincipalPassword(schoolId);
      setResetDone({ password: r.tempPassword, principalName: r.name, mobile: r.mobile });
      showToast('Password reset · share with principal');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Reset failed', 'error');
      setResetSchoolId(null);
    } finally {
      setResetSubmitting(false);
    }
  };

  const closeResetModal = () => {
    setResetSchoolId(null);
    setResetDone(null);
  };

  const blankForm: Partial<CreateSchoolInput> = {
    name: '', code: '', location: '', address: '', phone: '',
    principalName: '', principalEmail: '', principalPhone: '',
    status: SchoolStatus.ACTIVE, plan: BillingPlan.STANDARD,
    paymentStartDate: new Date().toISOString().split('T')[0], password: '',
  };
  const [form, setForm] = useState<Partial<CreateSchoolInput>>(blankForm);

  useEffect(() => {
    fetchSchools().catch(e => showToast(e instanceof Error ? e.message : 'Failed to load schools', 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = schools.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.location.toLowerCase().includes(search.toLowerCase()) ||
    s.code.toLowerCase().includes(search.toLowerCase()),
  );

  const handleCreate = async () => {
    if (!form.name || !form.code || !form.principalEmail) {
      showToast('Please fill all required fields', 'error'); return;
    }
    if (!form.principalPhone || !form.password) {
      showToast('Principal phone & login password required', 'error'); return;
    }
    const cleanPhone = form.principalPhone.replace(/\D/g, '').slice(-10);
    if (cleanPhone.length !== 10) {
      showToast('Principal phone must be a 10-digit number', 'error'); return;
    }
    setIsSubmitting(true);
    try {
      const school = await schoolService.create(form as CreateSchoolInput);
      addSchool(school);
      setCreatedCredentials({ schoolName: school.name, mobile: cleanPhone, password: form.password as string });
      setForm(blankForm);
      setView('LIST');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to create school', 'error');
    } finally { setIsSubmitting(false); }
  };

  const handleEdit = (school: School) => {
    setForm({
      name: school.name, code: school.code, location: school.location,
      address: school.address, phone: school.phone, principalName: school.principalName,
      principalEmail: school.principalEmail, principalPhone: school.principalPhone,
      status: school.status, plan: school.plan,
    });
    setView('EDIT');
  };

  const handleUpdate = async () => {
    if (!selected || !form.name || !form.code) { showToast('Name and code required', 'error'); return; }
    setIsSubmitting(true);
    try {
      // Detect principal-mobile change. The plain updateSchool path
      // would only update schools.principal_phone (display) and leave
      // auth.users.email + public.users.mobile_number stale → next
      // login on the new number fails. Route this via a dedicated
      // server endpoint that updates all three atomically + force
      // signs-out the principal.
      const cleanedNew = (form.principalPhone ?? '').replace(/\D/g, '').slice(-10);
      const cleanedOld = (selected.principalPhone ?? '').replace(/\D/g, '').slice(-10);
      const principalMobileChanged = cleanedNew && cleanedNew !== cleanedOld;
      if (principalMobileChanged && cleanedNew.length !== 10) {
        showToast('Login mobile 10-digit hona chahiye', 'error');
        setIsSubmitting(false);
        return;
      }

      // Strip principalPhone from the regular update payload so the
      // mirror update below is the single source of truth for that
      // field. Otherwise schools.principal_phone could land before
      // the auth update + we'd re-introduce the desync risk.
      const updatePayload: typeof form = principalMobileChanged
        ? { ...form, principalPhone: cleanedOld } // keep old until atomic update succeeds
        : form;
      await updateSchool(selected.id, updatePayload as any);

      if (principalMobileChanged) {
        await apiAdminSchools.updatePrincipalMobile(selected.id, cleanedNew);
      }

      setSelected(s => s ? { ...s, ...form, principalPhone: cleanedNew || s.principalPhone } : null);
      if (principalMobileChanged) {
        showToast(`Principal login mobile updated → ${cleanedNew}. Principal ko dobara login karna hoga.`);
      } else {
        showToast(`${form.name} updated`);
      }
      setView('DETAIL');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Update failed', 'error');
    } finally { setIsSubmitting(false); }
  };

  const loadStaff = async (schoolId: string) => {
    setStaffLoading(true);
    try {
      const data = await schoolService.getSchoolStaff(schoolId);
      setSchoolStaff(data);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to load staff', 'error');
    } finally {
      setStaffLoading(false);
    }
  };

  const loadStudents = async (schoolId: string) => {
    setStudentsLoading(true);
    try {
      const data = await schoolService.getSchoolStudents(schoolId);
      setSchoolStudents(data);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to load students', 'error');
    } finally {
      setStudentsLoading(false);
    }
  };


  // ── Reusable header ───────────────────────────────────────────────────────────
  const renderHeader = (title: string, back: () => void, actions?: React.ReactNode) => (
    <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
      <div className="flex items-center gap-3">
        <button onClick={back} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600 hover:bg-slate-200 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">{title}</h2>
      </div>
      {actions}
    </div>
  );

  // ── LIST ─────────────────────────────────────────────────────────────────────
  if (view === 'LIST') {
    const activeCount = schools.filter(s => s.status === SchoolStatus.ACTIVE).length;
    const inactiveCount = schools.length - activeCount;

    return (
      <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        {renderHeader('Schools', onBack,
          <button onClick={() => setView('CREATE')} className="flex items-center gap-1.5 bg-emerald-500 text-white font-black text-[10px] uppercase tracking-widest px-3 py-2 rounded-xl hover:bg-emerald-600 transition-colors shadow-md">
            <Plus size={14} /> Add
          </button>
        )}

        <div className="flex-1 overflow-y-auto">
          {/* Stats bar */}
          <div className="bg-white border-b border-slate-100 px-4 py-3 flex gap-4">
            <div className="flex-1 text-center">
              <div className="text-2xl font-black text-slate-900">{schools.length}</div>
              <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Total</div>
            </div>
            <div className="w-px bg-slate-100" />
            <div className="flex-1 text-center">
              <div className="text-2xl font-black text-emerald-600">{activeCount}</div>
              <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Active</div>
            </div>
            <div className="w-px bg-slate-100" />
            <div className="flex-1 text-center">
              <div className="text-2xl font-black text-slate-500">{inactiveCount}</div>
              <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Inactive</div>
            </div>
          </div>

          <div className="p-4  space-y-3">
            {/* Search */}
            <div className="relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search schools…"
                className="w-full bg-white border border-slate-200 rounded-2xl pl-10 pr-4 py-3 font-bold text-sm outline-none focus:border-blue-500 transition-colors shadow-sm" />
            </div>

            {filtered.length === 0 && (
              <div className="flex flex-col items-center py-16 text-slate-400">
                <Building2 size={36} className="mb-3 opacity-30" />
                <p className="font-bold text-sm">No schools found</p>
              </div>
            )}

            {filtered.map(school => (
              <button key={school.id}
                className="w-full bg-white rounded-2xl border border-slate-100 shadow-sm text-left active:scale-[0.99] transition-transform overflow-hidden"
                onClick={() => {
                  setSelected(school); setActiveAYIdx(0); setView('DETAIL');
                  setOverview(null); setOverviewLoading(true);
                  schoolService.getSchoolOverview(school.id)
                    .then(setOverview)
                    .catch(e => showToast(e instanceof Error ? e.message : 'Failed to load overview', 'error'))
                    .finally(() => setOverviewLoading(false));
                }}>
                <div className="p-4 flex items-start gap-3">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center font-black text-sm shrink-0">
                    {school.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-slate-900 text-sm truncate">{school.name}</span>
                      <span className={`shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-widest ${STATUS_COLORS[school.status]}`}>{school.status}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-slate-400">
                      <div className="flex items-center gap-1">
                        <MapPin size={10} />
                        <span className="text-[10px] font-bold">{school.location}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-slate-400">
                      <div className="flex items-center gap-1">
                        <Users size={10} />
                        <span className="text-[10px] font-bold">{school.studentCount.toLocaleString('en-IN')} students</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <UserCheck size={10} />
                        <span className="text-[10px] font-bold">{school.teacherCount} teachers</span>
                      </div>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-slate-300 mt-1 shrink-0" />
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── CREATE ────────────────────────────────────────────────────────────────────
  if (view === 'CREATE') {
    return (
      <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        {renderHeader('Add School', () => setView('LIST'))}
        <div className="flex-1 overflow-y-auto p-4  space-y-4">

          {/* School Info */}
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm space-y-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">School Info</p>
            <Field form={form} setForm={setForm} label="School Name *" k="name" placeholder="e.g. Delhi Public School" />
            <div className="grid grid-cols-2 gap-3">
              <Field form={form} setForm={setForm} label="School Code *" k="code" placeholder="DPS-001" />
              <Field form={form} setForm={setForm} label="City *" k="location" placeholder="New Delhi" />
            </div>
            <Field form={form} setForm={setForm} label="Full Address" k="address" placeholder="Street, Area, City, PIN" />
            <Field form={form} setForm={setForm} label="School Office Phone" k="phone" placeholder="School ka contact number (e.g. landline)" />
            <p className="text-[10px] font-bold text-slate-400 -mt-1.5 leading-relaxed">
              Ye school ka <span className="font-black text-slate-600">office contact</span> hai (landline / general number). Yahan se <span className="font-black text-slate-600">login</span> nahi hota — login mobile alag hai (Principal Account section me).
            </p>
          </div>

          {/* Principal */}
          <div className="bg-white rounded-2xl p-4 border border-blue-100 shadow-sm space-y-4">
            <div className="flex items-start gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                <Phone size={13} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Principal Login Account</p>
                <p className="text-[10px] font-bold text-slate-500 leading-relaxed mt-0.5">
                  Ye principal ka <span className="text-slate-900 font-black">personal login</span> hai. Niche diya gaya mobile + password se woh app me sign-in karenge. <span className="text-slate-900 font-black">School office phone se alag</span> hai.
                </p>
              </div>
            </div>
            <Field form={form} setForm={setForm} label="Principal Name" k="principalName" placeholder="Dr. / Mr. / Ms." />
            <Field form={form} setForm={setForm} label="Email *" k="principalEmail" placeholder="principal@school.edu.in" />
            <Field form={form} setForm={setForm} label="Login Mobile *" k="principalPhone" placeholder="10-digit mobile (login ID)" />
            <Field form={form} setForm={setForm} label="Login Password *" k="password" placeholder="Min 8 characters" type="password" />
          </div>

          <button onClick={handleCreate} disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg disabled:opacity-60">
            {isSubmitting ? 'Creating…' : <><Plus size={16} /> Onboard School</>}
          </button>
        </div>
      </div>
    );
  }

  // ── DETAIL ────────────────────────────────────────────────────────────────────
  if (view === 'DETAIL' && selected) {
    const ay = selected.academicYears[activeAYIdx];
    return (
      <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        {/* Edit-only action set. Deactivation/deletion was intentionally
            removed from this header — status changes happen inside the
            Edit form so a destructive action can't be one tap away. */}
        {renderHeader(selected.name, () => setView('LIST'),
          <button onClick={() => handleEdit(selected)} className="p-2 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 transition-colors">
            <Edit2 size={18} />
          </button>
        )}
        <div className="flex-1 overflow-y-auto p-4  space-y-4">

          {/* Hero identity */}
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-5 text-white">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center font-black text-xl text-white">
                {selected.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
              </div>
              <div>
                <h3 className="font-black text-white text-base leading-tight">{selected.name}</h3>
                <div className="flex gap-2 mt-1.5">
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${STATUS_COLORS[selected.status]}`}>{selected.status}</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Students', val: (overview?.totalStudents ?? selected.studentCount).toLocaleString('en-IN'), color: 'text-blue-300' },
                { label: 'Teachers', val: overview?.totalTeachers ?? selected.teacherCount, color: 'text-emerald-300' },
                { label: 'Classes',  val: overview?.classBreakdown.length ?? 0, color: 'text-amber-300' },
              ].map(({ label, val, color }) => (
                <div key={label} className="bg-white/10 rounded-xl p-3 text-center">
                  <div className={`text-xl font-black ${color}`}>{val}</div>
                  <div className="text-[9px] font-black text-white/50 uppercase tracking-widest mt-0.5">{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Contact */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Contact</p>
            {[
              { icon: MapPin, val: selected.address || selected.location },
              { icon: Phone, val: selected.phone },
            ].map(({ icon: Icon, val }) => val ? (
              <div key={val} className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
                  <Icon size={13} className="text-slate-400" />
                </div>
                <span className="text-xs font-bold text-slate-600">{val}</span>
              </div>
            ) : null)}
          </div>

          {/* Principal — read-only here. Destructive actions (password
              reset, capacity limits) live in the Edit form so a stray
              tap from the detail view can't fire them. */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Principal</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-black text-sm">
                {selected.principalName.split(' ').map(w => w[0]).join('').slice(0, 2)}
              </div>
              <div>
                <div className="font-extrabold text-slate-900 text-sm">{selected.principalName}</div>
                <div className="text-[10px] font-bold text-slate-400">{selected.principalEmail}</div>
                <div className="text-[10px] font-bold text-slate-400">{selected.principalPhone}</div>
              </div>
            </div>
          </div>

          {/* New Academic Year creation toggle moved into Edit so a stray
              tap on the detail screen can't flip it on/off accidentally
              (it controls whether the principal can roll the school into
              a new year — a year-end-only operation). Read-only state
              shown here. */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">New Academic Year</p>
            <div className="text-sm font-black text-slate-900">
              {selected.newYearCreationEnabled ? 'Creation enabled' : 'Creation disabled'}
            </div>
            <p className="text-[11px] font-bold text-slate-500 mt-1 leading-relaxed">
              {selected.newYearCreationEnabled
                ? 'Principal can create a new academic year from Settings.'
                : 'Principal cannot create a new academic year. Edit form me jaake on/off karein.'}
            </p>
          </div>

          {/* Backup — Quick (daily) + Full (weekly). Streams a ZIP
              directly to the SUPER_ADMIN's browser, nothing is stored
              on Supabase. Rate limits are enforced server-side via
              audit_logs so a refresh-spam can't bypass them. */}
          <BackupCard schoolId={selected.id} apiPath={`/api/admin/schools/${selected.id}/backup`} />

          {/* Live Operations — real numbers pulled from each domain table.
              Replaces the placeholder AY stats which read from a static
              array that the school service never populated. */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Operations {overview?.activeAYLabel ? `· ${overview.activeAYLabel}` : ''}
              </p>
              {overviewLoading && (
                <div className="w-3 h-3 border border-slate-200 border-t-slate-600 rounded-full animate-spin" />
              )}
            </div>
            {!overview ? (
              <p className="text-xs font-bold text-slate-400">Loading…</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Students',           val: overview.totalStudents.toLocaleString('en-IN'),
                    sub: overview.rteStudents > 0 ? `${overview.rteStudents} RTE` : 'Active', color: 'text-blue-600' },
                  { label: 'Staff',              val: overview.totalStaff.toLocaleString('en-IN'),
                    sub: `${overview.totalTeachers} teachers`, color: 'text-emerald-600' },
                  { label: 'Salary Cost / mo',   val: `₹${overview.monthlySalaryCost.toLocaleString('en-IN')}`,
                    sub: `₹${overview.salaryPaidThisMonth.toLocaleString('en-IN')} paid`, color: 'text-amber-600' },
                  { label: 'Fees This Month',    val: `₹${overview.feeCollectedThisMonth.toLocaleString('en-IN')}`,
                    sub: `₹${overview.feeCollectedThisYear.toLocaleString('en-IN')} YTD`, color: 'text-indigo-600' },
                  { label: 'Expenses / mo',      val: `₹${overview.expensesThisMonth.toLocaleString('en-IN')}`,
                    sub: `₹${overview.expensesThisYear.toLocaleString('en-IN')} YTD`, color: 'text-rose-600' },
                  { label: 'Net This Month',
                    val: `₹${(overview.feeCollectedThisMonth - overview.expensesThisMonth - overview.salaryPaidThisMonth).toLocaleString('en-IN')}`,
                    sub: 'Fees − exp − salary',
                    color: (overview.feeCollectedThisMonth - overview.expensesThisMonth - overview.salaryPaidThisMonth) >= 0 ? 'text-emerald-600' : 'text-rose-600' },
                ].map(s => (
                  <div key={s.label} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                    <div className={`text-base font-black ${s.color} leading-tight`}>{s.val}</div>
                    <div className="text-[9px] font-black uppercase tracking-widest text-slate-500 mt-1">{s.label}</div>
                    <div className="text-[9px] font-bold text-slate-400 mt-0.5">{s.sub}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Class-wise breakdown */}
          {overview && overview.classBreakdown.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Class Breakdown</p>
              <div className="grid grid-cols-3 gap-2">
                {overview.classBreakdown.map(c => (
                  <div key={`${c.className}-${c.section}`} className="bg-slate-50 rounded-xl p-2 text-center border border-slate-100">
                    <div className="text-[10px] font-black text-slate-700">{c.className}{c.section ? `-${c.section}` : ''}</div>
                    <div className="text-base font-black text-slate-900 mt-0.5">{c.count}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Academic year tabs */}
          {selected.academicYears.length > 0 && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Academic Years</p>
              <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
                {selected.academicYears.map((a, i) => (
                  <button key={a.id} onClick={() => setActiveAYIdx(i)}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors ${activeAYIdx === i ? 'bg-slate-900 text-white' : 'bg-white text-slate-500 border border-slate-200'}`}>
                    {a.label} {a.isActive && '●'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quick-nav tiles — Sections tile removed (super-admin doesn't
              need section-level breakdown here; it lives inside the
              principal's own UI). Students + Staff are the only useful
              cross-school drill-downs from this view. */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: Users,     label: 'Students', view: 'STUDENTS' as View, color: 'text-blue-600 bg-blue-50',       count: overview?.totalStudents ?? 0 },
              { icon: UserCheck, label: 'Staff',    view: 'STAFF' as View,    color: 'text-emerald-600 bg-emerald-50', count: overview?.totalStaff ?? 0 },
            ].map(({ icon: Icon, label, view: v, color, count }) => (
              <button key={label}
                onClick={() => {
                  if (v === 'STAFF') { setStaffSearch(''); loadStaff(selected.id); setView(v); }
                  else if (v === 'STUDENTS') { setStudentsSearch(''); setSelectedSection(null); loadStudents(selected.id); setView(v); }
                }}
                className="flex items-center gap-3 bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-left active:scale-95 transition-transform">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color}`}><Icon size={18} /></div>
                <div>
                  <div className="font-extrabold text-slate-900 text-xs">{label}</div>
                  <div className="text-[10px] font-bold text-slate-400 mt-0.5">{count > 0 ? count : '—'}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── SECTIONS ──────────────────────────────────────────────────────────────────
  if (view === 'SECTIONS' && selected) {
    const sections = overview?.classBreakdown ?? [];
    return (
      <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        {renderHeader(`Sections${overview?.activeAYLabel ? ` · ${overview.activeAYLabel}` : ''}`, () => setView('DETAIL'))}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {sections.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-slate-400">
              <BookOpen size={32} className="mb-3 opacity-40" />
              <p className="font-bold text-sm">No sections in this year</p>
            </div>
          ) : sections.map(sec => (
            <button key={`${sec.className}-${sec.section}`}
              onClick={() => {
                setSelectedSection({ className: sec.className, section: sec.section });
                setStudentsSearch(`${sec.className}${sec.section ? '-' + sec.section : ''}`);
                loadStudents(selected.id); setView('STUDENTS');
              }}
              className="w-full flex items-center justify-between bg-white rounded-2xl border border-slate-100 shadow-sm p-4 active:scale-95 transition-transform text-left">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-black text-xs">
                  {sec.section || '—'}
                </div>
                <div>
                  <div className="font-extrabold text-slate-900 text-sm">{sec.className}{sec.section ? ` – Section ${sec.section}` : ''}</div>
                  <div className="text-[10px] font-bold text-slate-400 mt-0.5">{sec.count} students</div>
                </div>
              </div>
              <ChevronRight size={18} className="text-slate-300" />
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── STUDENTS ──────────────────────────────────────────────────────────────────
  if (view === 'STUDENTS' && selected) {
    const filtered_stu = schoolStudents.filter(s =>
      s.name.toLowerCase().includes(studentsSearch.toLowerCase()) ||
      s.admission_no.toLowerCase().includes(studentsSearch.toLowerCase()) ||
      (s.class_name ?? '').toLowerCase().includes(studentsSearch.toLowerCase()),
    );
    return (
      <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        {renderHeader(`Students · ${selected.name}`, () => setView('DETAIL'))}

        <div className="bg-white border-b border-slate-100 px-4 py-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
            <input value={studentsSearch} onChange={e => setStudentsSearch(e.target.value)}
              placeholder="Search by name, admission no, class…"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 font-bold text-sm outline-none focus:border-indigo-500"/>
          </div>
          <p className="text-[10px] font-bold text-slate-400 mt-2">
            {schoolStudents.length} students enrolled
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {studentsLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
            </div>
          ) : filtered_stu.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Users size={32} className="mb-3 opacity-40" />
              <p className="font-bold text-sm">{schoolStudents.length === 0 ? 'No students enrolled' : 'No results'}</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              {filtered_stu.slice((stuPage - 1) * PAGE_SIZE, stuPage * PAGE_SIZE).map((s, idx, page) => (
                <button key={s.id}
                  onClick={() => void openStudentProfile(s.id, s.name)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left active:bg-slate-50 transition-colors ${idx < page.length - 1 ? 'border-b border-slate-50' : ''}`}>
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-black text-xs shrink-0">
                    {s.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-900 text-sm truncate">{s.name}</div>
                    <div className="text-[10px] font-bold text-slate-400 mt-0.5">
                      {s.admission_no}
                      {s.class_name && ` · ${s.class_name}${s.section ? `-${s.section}` : ''}`}
                      {s.roll_no != null && ` · Roll ${s.roll_no}`}
                    </div>
                    {s.father_name && (
                      <div className="text-[9px] font-bold text-slate-300">{s.father_name}</div>
                    )}
                  </div>
                  {s.is_rte && (
                    <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 shrink-0">RTE</span>
                  )}
                  <ChevronRight size={14} className="text-slate-300 shrink-0" />
                </button>
              ))}
            </div>
          )}
          {filtered_stu.length > PAGE_SIZE && (
            <Pagination page={stuPage} pageSize={PAGE_SIZE} total={filtered_stu.length} onChange={setStuPage} />
          )}
        </div>
        {profileTarget && (
          <ProfileSheet
            target={profileTarget}
            data={profileData}
            extra={profileExtra}
            loading={profileLoading}
            onClose={closeProfile}
          />
        )}
      </div>
    );
  }

  // ── STAFF ─────────────────────────────────────────────────────────────────────
  if (view === 'STAFF' && selected) {
    const filtered_staff = schoolStaff.filter(s =>
      s.name.toLowerCase().includes(staffSearch.toLowerCase()) ||
      s.role.toLowerCase().includes(staffSearch.toLowerCase()) ||
      (s.subject ?? '').toLowerCase().includes(staffSearch.toLowerCase()),
    );
    return (
      <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        {renderHeader(`Staff · ${selected.name}`, () => setView('DETAIL'))}

        <div className="bg-white border-b border-slate-100 px-4 py-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
            <input value={staffSearch} onChange={e => setStaffSearch(e.target.value)}
              placeholder="Search by name, role, subject…"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 font-bold text-sm outline-none focus:border-indigo-500"/>
          </div>
          <p className="text-[10px] font-bold text-slate-400 mt-2">
            {schoolStaff.length} active staff members
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {staffLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
            </div>
          ) : filtered_staff.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Users size={32} className="mb-3 opacity-40" />
              <p className="font-bold text-sm">{schoolStaff.length === 0 ? 'No staff found' : 'No results'}</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              {filtered_staff.slice((staffPage - 1) * PAGE_SIZE, staffPage * PAGE_SIZE).map((s, idx, page) => (
                <button key={s.id}
                  onClick={() => void openStaffProfile(s.id, s.name)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left active:bg-slate-50 transition-colors ${idx < page.length - 1 ? 'border-b border-slate-50' : ''}`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${s.role === 'TEACHER' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>
                    {s.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-extrabold text-slate-900 text-sm truncate">{s.name}</div>
                    <div className="text-[10px] font-bold text-slate-400 mt-0.5">
                      {s.role}{s.subject ? ` · ${s.subject}` : ''}
                    </div>
                    {s.phone && <div className="text-[10px] font-bold text-slate-300">{s.phone}</div>}
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${
                      s.status === 'ACTIVE' ? 'text-emerald-700 bg-emerald-50' :
                      s.status === 'ON_LEAVE' ? 'text-amber-700 bg-amber-50' :
                      'text-slate-500 bg-slate-100'
                    }`}>
                      {s.status === 'ON_LEAVE' ? 'On Leave' : s.status}
                    </span>
                    {s.salary > 0 && (
                      <div className="text-[9px] font-bold text-slate-400 mt-1">
                        ₹{s.salary.toLocaleString('en-IN')}/mo
                      </div>
                    )}
                  </div>
                  <ChevronRight size={14} className="text-slate-300 shrink-0 ml-1" />
                </button>
              ))}
            </div>
          )}
          {filtered_staff.length > PAGE_SIZE && (
            <Pagination page={staffPage} pageSize={PAGE_SIZE} total={filtered_staff.length} onChange={setStaffPage} />
          )}
        </div>
        {profileTarget && (
          <ProfileSheet
            target={profileTarget}
            data={profileData}
            extra={profileExtra}
            loading={profileLoading}
            onClose={closeProfile}
          />
        )}
      </div>
    );
  }

  // ── EDIT ──────────────────────────────────────────────────────────────────────
  if (view === 'EDIT' && selected) {
    return (
      <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        {renderHeader(`Edit: ${selected.name}`, () => setView('DETAIL'))}
        <div className="flex-1 overflow-y-auto p-4  space-y-4">
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm space-y-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">School Info</p>
            <Field form={form} setForm={setForm} label="School Code" k="code" placeholder="" locked />
            <Field form={form} setForm={setForm} label="School Name *" k="name" placeholder="e.g. Delhi Public School" />
            <div className="grid grid-cols-2 gap-3">
              <Field form={form} setForm={setForm} label="City *" k="location" placeholder="New Delhi" />
              <Field form={form} setForm={setForm} label="School Office Phone" k="phone" placeholder="School ka contact number" />
            </div>
            <p className="text-[10px] font-bold text-slate-400 -mt-1.5 leading-relaxed">
              Ye school ka <span className="font-black text-slate-600">office number</span> hai (display only). Login mobile niche Principal section me alag hai.
            </p>
            <Field form={form} setForm={setForm} label="Full Address" k="address" placeholder="Street, Area, City, PIN" />
          </div>
          <div className="bg-white rounded-2xl p-4 border border-blue-100 shadow-sm space-y-4">
            <div className="flex items-start gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                <Phone size={13} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Principal Login Account</p>
                <p className="text-[10px] font-bold text-slate-500 leading-relaxed mt-0.5">
                  Login mobile change karne par auth + users + schools — sab ek saath update honge. Principal ko sabhi devices se sign-out kar diya jayega — naye number par dobara login karna hoga (password same rahega).
                </p>
              </div>
            </div>
            <Field form={form} setForm={setForm} label="Name" k="principalName" placeholder="Dr. / Mr. / Ms." />
            <Field form={form} setForm={setForm} label="Email *" k="principalEmail" placeholder="principal@school.edu.in" />
            <Field form={form} setForm={setForm} label="Login Mobile *" k="principalPhone" placeholder="10-digit mobile (login ID)" />
          </div>

          {/* Capacity limits — moved into Edit so a stray tap on the
              detail screen can't accidentally raise/lower a school's
              hard caps. Save inside this card has its own type-last-4
              gate before it touches the DB. */}
          <SchoolLimitsCard
            school={selected}
            onSaved={(patch) => setSelected(prev => prev ? { ...prev, ...patch } : null)}
          />

          {/* New Academic Year creation toggle — also Edit-only with a
              type-last-4 gate. Accidental flip used to lock principals
              out of creating a new year (or, worse, let them roll into
              a new year before they were ready). */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">New Academic Year</p>
                <div className="text-sm font-black text-slate-900 mt-1">
                  {selected.newYearCreationEnabled ? 'Creation enabled' : 'Creation disabled'}
                </div>
                <p className="text-[11px] font-bold text-slate-500 mt-1 leading-relaxed">
                  {selected.newYearCreationEnabled
                    ? 'Principal can create a new academic year from Settings.'
                    : 'Principal cannot create a new academic year. Year-end rollover ke kuch din pehle on karein.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPendingAyToggle(!selected.newYearCreationEnabled)}
                className={`shrink-0 w-12 h-7 rounded-full relative transition-colors active:scale-95 transition-transform ${selected.newYearCreationEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
                aria-label="Toggle new academic year creation">
                <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-all ${selected.newYearCreationEnabled ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            </div>
          </div>

          {/* Year-close one-shot toggle. Off by default; super-admin flips
              on for a few minutes at year-end, principal closes the year,
              the close_academic_year RPC auto-resets it to false. Visual
              tint is amber (high-stakes / irreversible) vs the emerald of
              the AY-creation toggle so the principal can't confuse them. */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Year Close</p>
                <div className={`text-sm font-black mt-1 ${selected.yearCloseEnabled ? 'text-amber-700' : 'text-slate-900'}`}>
                  {selected.yearCloseEnabled ? 'Unlocked · principal can close' : 'Locked'}
                </div>
                <p className="text-[11px] font-bold text-slate-500 mt-1 leading-relaxed">
                  {selected.yearCloseEnabled
                    ? 'Principal can close the active academic year. Flag auto-resets after a successful close.'
                    : 'Principal cannot close the active year. Flip on only when the school is ready for promotion / final salary / fee year-end.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPendingYearCloseToggle(!selected.yearCloseEnabled)}
                className={`shrink-0 w-12 h-7 rounded-full relative transition-colors active:scale-95 transition-transform ${selected.yearCloseEnabled ? 'bg-amber-500' : 'bg-slate-300'}`}
                aria-label="Toggle year close permission">
                <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-all ${selected.yearCloseEnabled ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            </div>
          </div>

          {/* Save Changes — primary action for the school-info form. */}
          <button onClick={handleUpdate} disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg disabled:opacity-60">
            {isSubmitting ? 'Updating…' : <><Save size={16} /> Save Changes</>}
          </button>

          {/* Danger zone — kept visually separate at the bottom, behind
              its own type-last-4 confirmation. Reset Password used to
              live one tap away in the detail view; moved here so it
              can't be triggered without entering Edit + typing 4 digits
              of the principal's mobile. */}
          <div className="bg-rose-50/40 border border-rose-200 rounded-2xl p-4 mt-2">
            <div className="flex items-start gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 mt-0.5">
                <AlertCircle size={13} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-rose-700">Danger Zone</p>
                <p className="text-[10px] font-bold text-slate-600 leading-relaxed mt-0.5">
                  Reset karne par principal ki saari sessions kat jayengi aur ek one-time password mile ga (24h cooldown).
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => openResetModal(selected.id)}
              className="w-full flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs uppercase tracking-widest py-3 rounded-xl active:scale-95 transition-transform shadow-sm">
              <Key size={14} /> Reset Principal Password
            </button>

            {/* School status toggle — moved below Reset Password so all
                destructive / high-impact actions live in one Danger Zone
                block, each behind its own type-last-4 confirm. */}
            <div className="mt-4 pt-4 border-t border-rose-200/70">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-widest text-rose-700">School Status</p>
                  <p className="text-sm font-black text-slate-900 mt-0.5">
                    {form.status === SchoolStatus.ACTIVE ? 'Active' : 'Inactive'}
                  </p>
                  <p className="text-[10px] font-bold text-slate-600 mt-0.5 leading-relaxed">
                    {form.status === SchoolStatus.ACTIVE
                      ? 'Principal aur staff login kar sakte hain. Inactive karne par sabhi sessions block ho jayengi.'
                      : 'Login band hai. Toggle karke active karein, principals ko reload karna padega.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPendingStatusToggle(form.status === SchoolStatus.ACTIVE ? SchoolStatus.INACTIVE : SchoolStatus.ACTIVE)}
                  className={`shrink-0 w-12 h-7 rounded-full relative transition-colors active:scale-95 ${form.status === SchoolStatus.ACTIVE ? 'bg-emerald-500' : 'bg-slate-300'}`}
                  aria-label="Toggle school active status">
                  <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-all ${form.status === SchoolStatus.ACTIVE ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── RESET CONFIRM (inline, type-last-4) ───────────────────────
            Rendered locally inside EDIT instead of via the global
            ConfirmModal store — that route was silently dropping the
            prompt in this view (HMR / nested-modal interaction). The
            principal's last 4 mobile digits act as the type-to-confirm
            so a stray tap can't trigger a credential rotation. */}
        {pendingResetSchoolId && (
          <ResetConfirmDialog
            school={selected}
            onCancel={cancelResetConfirm}
            onConfirm={confirmAndReset}
          />
        )}

        {/* ── SCHOOL STATUS TOGGLE CONFIRM (inline) ─────────────────────
            Active ↔ Inactive flip. Locked behind the principal's mobile
            last-4 because turning a school inactive kills every login
            for that school. */}
        {pendingStatusToggle !== null && (
          <SchoolStatusToggleConfirmDialog
            school={selected}
            next={pendingStatusToggle}
            saving={statusToggleSaving}
            onCancel={() => setPendingStatusToggle(null)}
            onConfirm={confirmStatusToggle}
          />
        )}

        {/* ── AY CREATION TOGGLE CONFIRM (inline) ───────────────────────
            Same inline-render pattern as the reset confirm above. Shown
            whenever the super-admin flips the toggle; locks the action
            behind the principal's mobile last-4 so a stray tap can't
            silently flip year-creation rights. */}
        {pendingAyToggle !== null && (
          <AyToggleConfirmDialog
            school={selected}
            next={pendingAyToggle}
            saving={ayToggleSaving}
            onCancel={() => setPendingAyToggle(null)}
            onConfirm={confirmAyToggle}
          />
        )}

        {/* Year-close one-shot toggle confirm — same last-4-digit gate. */}
        {pendingYearCloseToggle !== null && (
          <YearCloseToggleConfirmDialog
            school={selected}
            next={pendingYearCloseToggle}
            saving={yearCloseToggleSaving}
            onCancel={() => setPendingYearCloseToggle(null)}
            onConfirm={confirmYearCloseToggle}
          />
        )}

        {/* ── PRINCIPAL PASSWORD RESET MODAL ────────────────────────────────
            Shows the server-generated temp password once. Server enforces
            a 24h cooldown per school + force-logout on the principal so
            the old session can't keep working. */}
        {resetSchoolId && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 pb-8 animate-in slide-in-from-bottom-8">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                    <AlertCircle size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900">
                      {resetDone ? 'Password Reset' : 'Reset Principal Password?'}
                    </h3>
                    <p className="text-[11px] font-bold text-slate-400 mt-0.5">{selected.name}</p>
                  </div>
                </div>
                <button onClick={closeResetModal} className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center shrink-0 active:scale-90 transition-transform">
                  <X size={16} className="text-slate-500" />
                </button>
              </div>

              {!resetDone ? (
                /* In-flight: type-last-4 already passed, server call
                   running. Show a busy state instead of a redundant
                   "Confirm Reset" button. */
                <div className="py-8 flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-2 border-rose-200 border-t-rose-600 rounded-full animate-spin" />
                  <p className="text-xs font-black text-slate-600">Generating temp password…</p>
                </div>
              ) : (
                <>
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-4 flex gap-2">
                    <CheckCircle2 size={14} className="text-emerald-600 shrink-0 mt-0.5" />
                    <p className="text-[11px] font-bold text-emerald-800 leading-relaxed">
                      Password reset for <span className="font-black">{resetDone.principalName}</span> (mobile {resetDone.mobile}).
                      Share this immediately — it will not be shown again.
                    </p>
                  </div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Temporary Password</label>
                  <div className="mt-1 flex gap-2">
                    <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 font-black text-slate-900 text-sm tabular-nums break-all">
                      {resetDone.password}
                    </div>
                    <button onClick={() => { navigator.clipboard.writeText(resetDone.password); showToast('Copied!'); }}
                      className="px-3 py-3 bg-slate-100 hover:bg-slate-200 rounded-xl active:scale-95 transition-all">
                      <Copy size={14} className="text-slate-600" />
                    </button>
                  </div>
                  <button onClick={closeResetModal}
                    className="w-full mt-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-sm active:scale-95 transition-all">
                    Done
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Credentials modal ─────────────────────────────────────────────────────────
  if (createdCredentials) {
    return (
      <div className="absolute inset-0 z-60 bg-slate-900/60 flex items-end justify-center animate-in fade-in">
        <div className="bg-white w-full rounded-t-3xl p-6 pb-8 animate-in slide-in-from-bottom-4">
          <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mb-4">
            <CheckCircle2 size={22} />
          </div>
          <h3 className="font-black text-slate-900 text-lg mb-1">School Onboarded!</h3>
          <p className="text-sm text-slate-500 mb-5">
            "<span className="font-black text-slate-800">{createdCredentials.schoolName}</span>" is live. Share these with the principal.
          </p>
          <div className="space-y-3 mb-5">
            {[
              { label: 'Login Mobile', val: createdCredentials.mobile },
              { label: 'Temporary Password', val: createdCredentials.password },
            ].map(({ label, val }) => (
              <div key={label}>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">{label}</p>
                <div className="flex gap-2">
                  <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-black text-slate-900 text-sm">{val}</div>
                  <button onClick={() => { navigator.clipboard.writeText(val); showToast('Copied!'); }}
                    className="px-4 py-3 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors">
                    <Copy size={16} className="text-slate-600" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => setCreatedCredentials(null)}
            className="w-full py-3 bg-emerald-600 text-white font-black rounded-xl active:scale-95 transition-transform">
            Done
          </button>
        </div>
      </div>
    );
  }

  return null;
};

// ─── Reset password confirm dialog ───────────────────────────────────────────
// Type-last-4-of-principal's-login-mobile gate. Inline (rendered next to
// where the action fires) instead of routed through the global
// ConfirmModal store — that route was silently dropping prompts in the
// EDIT view (mounted at App.tsx but state not reflecting). Accepts the
// principal's LOGIN mobile last 4 (schools.principal_phone — the auth
// identity), not the school's office phone.
const ResetConfirmDialog: React.FC<{
  school: School;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ school, onCancel, onConfirm }) => {
  const fullPhone = (school.principalPhone ?? '').replace(/\D/g, '');
  const last4 = fullPhone.slice(-4);
  const masked = fullPhone.length >= 4 ? `XXXXXX${last4}` : '(set nahi hai)';
  const [text, setText] = useState('');
  const [error, setError] = useState(false);

  const tryConfirm = () => {
    // If no mobile registered, accept any non-empty input as confirmation.
    // Otherwise require an exact last-4 match.
    if (last4.length === 4) {
      if (text.replace(/\D/g, '').slice(-4) !== last4) {
        setError(true);
        return;
      }
    }
    onConfirm();
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onCancel}>
      <div className="bg-white w-full sm:max-w-md rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom-4"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-3">
          <div className="w-11 h-11 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
            <Key size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-black text-slate-900">Reset Principal Password?</p>
            <p className="text-[12px] font-bold text-slate-500 mt-1 leading-relaxed">
              <span className="font-black text-slate-800">{school.principalName || 'Principal'}</span> ki saari sessions kat jayengi aur ek one-time temp password milega (24h cooldown).
            </p>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mt-2 text-[11px] font-bold text-slate-600">
          <span className="block text-[10px] uppercase tracking-widest text-slate-400 mb-0.5">Login mobile</span>
          {masked}
        </div>

        <p className="text-[11px] font-black uppercase tracking-widest text-slate-500 mt-4 mb-2">
          {last4.length === 4
            ? "Principal ke login mobile ke last 4 digits daalein"
            : 'Confirm karne ke liye "RESET" type karein'}
        </p>
        <input
          type={last4.length === 4 ? 'text' : 'text'}
          inputMode={last4.length === 4 ? 'numeric' : undefined}
          pattern={last4.length === 4 ? '[0-9]*' : undefined}
          maxLength={last4.length === 4 ? 4 : 8}
          autoFocus
          autoComplete="off"
          value={text}
          onChange={e => {
            const v = last4.length === 4
              ? e.target.value.replace(/\D/g, '').slice(0, 4)
              : e.target.value.slice(0, 8);
            setText(v);
            setError(false);
          }}
          onKeyDown={e => { if (e.key === 'Enter') tryConfirm(); }}
          placeholder={last4.length === 4 ? '••••' : 'RESET'}
          className={`w-full px-4 py-3.5 bg-slate-50 border rounded-xl font-black text-2xl text-center tracking-[0.4em] text-slate-900 outline-none transition-colors ${
            error ? 'border-rose-400 bg-rose-50' : 'border-slate-200 focus:border-rose-500'
          }`}
        />
        {error && (
          <p className="text-[11px] font-black text-rose-600 mt-2">
            Galat number — login mobile ke last 4 digits check karein.
          </p>
        )}

        <div className="flex gap-3 mt-5">
          <button onClick={onCancel}
            className="flex-1 py-3 bg-slate-100 text-slate-700 font-black rounded-2xl text-sm uppercase tracking-widest active:scale-95 transition-transform">
            Cancel
          </button>
          <button onClick={tryConfirm}
            disabled={last4.length === 4 ? text.length < 4 : text.trim().toUpperCase() !== 'RESET'}
            className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-2xl text-sm uppercase tracking-widest active:scale-95 transition-transform disabled:opacity-40">
            Reset
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── AY creation toggle confirm ──────────────────────────────────────────────
// Same inline gate pattern as ResetConfirmDialog. Locks the toggle behind
// the principal's mobile last-4 so a stray tap can't silently grant or
// revoke year-creation rights for a school.
const AyToggleConfirmDialog: React.FC<{
  school: School;
  next: boolean;
  saving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ school, next, saving, onCancel, onConfirm }) => {
  const fullPhone = (school.principalPhone ?? '').replace(/\D/g, '');
  const last4 = fullPhone.slice(-4);
  const masked = fullPhone.length >= 4 ? `XXXXXX${last4}` : '(set nahi hai)';
  const [text, setText] = useState('');
  const [error, setError] = useState(false);

  const tryConfirm = () => {
    if (last4.length === 4) {
      if (text.replace(/\D/g, '').slice(-4) !== last4) {
        setError(true);
        return;
      }
    } else if (text.trim().toUpperCase() !== (next ? 'ENABLE' : 'DISABLE')) {
      setError(true);
      return;
    }
    onConfirm();
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={saving ? undefined : onCancel}>
      <div className="bg-white w-full sm:max-w-md rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom-4"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-3">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${next ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
            <AlertCircle size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-black text-slate-900">
              {next ? 'Enable AY creation?' : 'Disable AY creation?'}
            </p>
            <p className="text-[12px] font-bold text-slate-500 mt-1 leading-relaxed">
              {next
                ? `${school.principalName || 'Principal'} ko Settings se naya academic year banane ki permission mil jayegi.`
                : `${school.principalName || 'Principal'} naya academic year nahi bana payenge jab tak aap dobara enable na karein.`}
            </p>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mt-2 text-[11px] font-bold text-slate-600">
          <span className="block text-[10px] uppercase tracking-widest text-slate-400 mb-0.5">Login mobile</span>
          {masked}
        </div>

        <p className="text-[11px] font-black uppercase tracking-widest text-slate-500 mt-4 mb-2">
          {last4.length === 4
            ? 'Principal ke login mobile ke last 4 digits daalein'
            : `Confirm karne ke liye "${next ? 'ENABLE' : 'DISABLE'}" type karein`}
        </p>
        <input
          type="text"
          inputMode={last4.length === 4 ? 'numeric' : undefined}
          pattern={last4.length === 4 ? '[0-9]*' : undefined}
          maxLength={last4.length === 4 ? 4 : 10}
          autoFocus
          autoComplete="off"
          value={text}
          onChange={e => {
            const v = last4.length === 4
              ? e.target.value.replace(/\D/g, '').slice(0, 4)
              : e.target.value.slice(0, 10);
            setText(v);
            setError(false);
          }}
          onKeyDown={e => { if (e.key === 'Enter') tryConfirm(); }}
          placeholder={last4.length === 4 ? '••••' : (next ? 'ENABLE' : 'DISABLE')}
          className={`w-full px-4 py-3.5 bg-slate-50 border rounded-xl font-black text-2xl text-center tracking-[0.4em] text-slate-900 outline-none transition-colors ${
            error ? 'border-rose-400 bg-rose-50' : `border-slate-200 ${next ? 'focus:border-emerald-500' : 'focus:border-amber-500'}`
          }`}
        />
        {error && (
          <p className="text-[11px] font-black text-rose-600 mt-2">
            Galat input — phir se check karein.
          </p>
        )}

        <div className="flex gap-3 mt-5">
          <button onClick={onCancel} disabled={saving}
            className="flex-1 py-3 bg-slate-100 text-slate-700 font-black rounded-2xl text-sm uppercase tracking-widest active:scale-95 transition-transform disabled:opacity-50">
            Cancel
          </button>
          <button onClick={tryConfirm} disabled={saving}
            className={`flex-1 py-3 text-white font-black rounded-2xl text-sm uppercase tracking-widest active:scale-95 transition-transform disabled:opacity-50 ${next ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-600 hover:bg-amber-700'}`}>
            {saving ? 'Saving…' : (next ? 'Enable' : 'Disable')}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Year-close toggle confirm dialog ────────────────────────────────────────
// Sibling of AyToggleConfirmDialog with year-close-specific copy. Always
// amber (high-stakes / irreversible) regardless of direction so the
// super-admin reads the action carefully. Same last-4-digit gate as
// elsewhere so an accidental tap can't flip the permission.
const YearCloseToggleConfirmDialog: React.FC<{
  school: School;
  next: boolean;
  saving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ school, next, saving, onCancel, onConfirm }) => {
  const fullPhone = (school.principalPhone ?? '').replace(/\D/g, '');
  const last4 = fullPhone.slice(-4);
  const masked = fullPhone.length >= 4 ? `XXXXXX${last4}` : '(set nahi hai)';
  const [text, setText] = useState('');
  const [error, setError] = useState(false);

  const tryConfirm = () => {
    if (last4.length === 4) {
      if (text.replace(/\D/g, '').slice(-4) !== last4) {
        setError(true);
        return;
      }
    } else if (text.trim().toUpperCase() !== (next ? 'UNLOCK' : 'LOCK')) {
      setError(true);
      return;
    }
    onConfirm();
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={saving ? undefined : onCancel}>
      <div className="bg-white w-full sm:max-w-md rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom-4"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-3">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 bg-amber-50 text-amber-600">
            <AlertCircle size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-black text-slate-900">
              {next ? 'Unlock Year Close?' : 'Lock Year Close?'}
            </p>
            <p className="text-[12px] font-bold text-slate-500 mt-1 leading-relaxed">
              {next
                ? `${school.principalName || 'Principal'} active academic year close kar payenge. Year close se students promote ho jayenge, fees + salary finalize ho jayengi — irreversible-ish action. Flag close ke baad auto-reset ho jayega.`
                : `${school.principalName || 'Principal'} ab year close nahi kar payenge jab tak aap dobara enable na karein.`}
            </p>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mt-2 text-[11px] font-bold text-slate-600">
          <span className="block text-[10px] uppercase tracking-widest text-slate-400 mb-0.5">Login mobile</span>
          {masked}
        </div>

        <p className="text-[11px] font-black uppercase tracking-widest text-slate-500 mt-4 mb-2">
          {last4.length === 4
            ? 'Principal ke login mobile ke last 4 digits daalein'
            : `Confirm karne ke liye "${next ? 'UNLOCK' : 'LOCK'}" type karein`}
        </p>
        <input
          type="text"
          inputMode={last4.length === 4 ? 'numeric' : undefined}
          pattern={last4.length === 4 ? '[0-9]*' : undefined}
          maxLength={last4.length === 4 ? 4 : 10}
          autoFocus
          autoComplete="off"
          value={text}
          onChange={e => {
            const v = last4.length === 4
              ? e.target.value.replace(/\D/g, '').slice(0, 4)
              : e.target.value.slice(0, 10);
            setText(v);
            setError(false);
          }}
          onKeyDown={e => { if (e.key === 'Enter') tryConfirm(); }}
          placeholder={last4.length === 4 ? '••••' : (next ? 'UNLOCK' : 'LOCK')}
          className={`w-full px-4 py-3.5 bg-slate-50 border rounded-xl font-black text-2xl text-center tracking-[0.4em] text-slate-900 outline-none transition-colors ${
            error ? 'border-rose-400 bg-rose-50' : 'border-slate-200 focus:border-amber-500'
          }`}
        />
        {error && (
          <p className="text-[11px] font-black text-rose-600 mt-2">
            Galat input — phir se check karein.
          </p>
        )}

        <div className="flex gap-3 mt-5">
          <button onClick={onCancel} disabled={saving}
            className="flex-1 py-3 bg-slate-100 text-slate-700 font-black rounded-2xl text-sm uppercase tracking-widest active:scale-95 transition-transform disabled:opacity-50">
            Cancel
          </button>
          <button onClick={tryConfirm} disabled={saving}
            className="flex-1 py-3 text-white font-black rounded-2xl text-sm uppercase tracking-widest active:scale-95 transition-transform disabled:opacity-50 bg-amber-600 hover:bg-amber-700">
            {saving ? 'Saving…' : (next ? 'Unlock' : 'Lock')}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Capacity limits card ───────────────────────────────────────────────────
// Hard caps on active students + active staff. Inline editable; the DB
// rejects lowering below the school's current count (trigger added in
// migration 0082) so this component just surfaces that error to the user.
//
// Inputs are blanked → NULL on save (= unlimited). Numbers must be ≥ 0.
// ─── Full profile sheet (super-admin) ────────────────────────────────────────
// Read-only drawer that surfaces every column on a students / staff row.
// Empty / null values are hidden so the sheet stays scannable. Photos
// render inline if present; long fields wrap.
const ProfileSheet: React.FC<{
  target: { type: 'student' | 'staff'; id: string; name: string };
  data: Record<string, unknown> | null;
  extra: Record<string, unknown> | null;
  loading: boolean;
  onClose: () => void;
}> = ({ target, data, extra, loading, onClose }) => {
  // Friendly labels + grouping per type. Anything not listed here falls
  // into a generic "More" group so we never silently drop a column.
  const STUDENT_GROUPS: { title: string; fields: { key: string; label: string }[] }[] = [
    { title: 'Identity', fields: [
      { key: 'name',        label: 'Name' },
      { key: 'admission_no',label: 'Admission No' },
      { key: 'roll_no',     label: 'Roll No' },
      { key: 'dob',         label: 'Date of Birth' },
      { key: 'gender',      label: 'Gender' },
      { key: 'blood_group', label: 'Blood Group' },
      { key: 'religion',    label: 'Religion' },
      { key: 'caste',       label: 'Caste' },
      { key: 'aadhaar_no',  label: 'Aadhaar' },
      { key: 'pen_number',  label: 'PEN Number' },
      { key: 'birth_cert_no', label: 'Birth Cert No' },
    ]},
    { title: 'Contact', fields: [
      { key: 'phone',   label: 'Phone' },
      { key: 'email',   label: 'Email' },
      { key: 'address', label: 'Address' },
    ]},
    { title: 'Father', fields: [
      { key: 'father_name',       label: 'Name' },
      { key: 'father_phone',      label: 'Phone' },
      { key: 'father_email',      label: 'Email' },
      { key: 'father_occupation', label: 'Occupation' },
      { key: 'father_income',     label: 'Income' },
    ]},
    { title: 'Mother', fields: [
      { key: 'mother_name',       label: 'Name' },
      { key: 'mother_phone',      label: 'Phone' },
      { key: 'mother_occupation', label: 'Occupation' },
    ]},
    { title: 'Guardian', fields: [
      { key: 'guardian_name',     label: 'Name' },
      { key: 'guardian_phone',    label: 'Phone' },
      { key: 'guardian_relation', label: 'Relation' },
    ]},
    { title: 'Admin / Status', fields: [
      { key: 'admission_date', label: 'Admission Date' },
      { key: 'status',         label: 'Status' },
      { key: 'is_active',      label: 'Active' },
      { key: 'is_rte',         label: 'RTE' },
      { key: 'tc_number',      label: 'TC Number' },
      { key: 'created_at',     label: 'Created' },
      { key: 'updated_at',     label: 'Updated' },
    ]},
  ];
  const STAFF_GROUPS: { title: string; fields: { key: string; label: string }[] }[] = [
    { title: 'Identity', fields: [
      { key: 'name',       label: 'Name' },
      { key: 'role',       label: 'Role' },
      { key: 'subject',    label: 'Subject' },
      { key: 'aadhaar_no', label: 'Aadhaar' },
    ]},
    { title: 'Contact', fields: [
      { key: 'phone',   label: 'Phone' },
      { key: 'email',   label: 'Email' },
      { key: 'address', label: 'Address' },
    ]},
    { title: 'Employment', fields: [
      { key: 'salary',       label: 'Salary' },
      { key: 'joining_date', label: 'Joining Date' },
      { key: 'status',       label: 'Status' },
      { key: 'is_active',    label: 'Active' },
      { key: 'created_at',   label: 'Created' },
      { key: 'updated_at',   label: 'Updated' },
    ]},
  ];

  const formatVal = (v: unknown): string => {
    if (v === null || v === undefined || v === '') return '';
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    if (typeof v === 'number') return v.toLocaleString('en-IN');
    if (typeof v === 'string') {
      // ISO timestamp → friendlier
      if (/^\d{4}-\d{2}-\d{2}T/.test(v)) {
        const d = new Date(v);
        if (!isNaN(d.getTime())) return d.toLocaleString('en-IN', {
          day: '2-digit', month: 'short', year: 'numeric',
          hour: 'numeric', minute: '2-digit', hour12: true,
        });
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        const d = new Date(v + 'T00:00:00');
        if (!isNaN(d.getTime())) return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      }
      return v;
    }
    return String(v);
  };

  const groups = target.type === 'student' ? STUDENT_GROUPS : STAFF_GROUPS;
  const photo = data ? (data.photo as string | null) : null;
  const initials = target.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}>
      <div className="bg-slate-50 w-full sm:max-w-lg max-h-[92vh] rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-4 sm:zoom-in-95"
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3">
          {photo ? (
            <img src={photo} alt={target.name} className="w-12 h-12 rounded-2xl object-cover shrink-0 bg-slate-100" />
          ) : (
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-black text-base shrink-0">
              {initials}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-black text-slate-900 text-sm truncate">{target.name}</p>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-0.5">
              {target.type === 'student' ? 'Student profile' : 'Staff profile'}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center active:scale-95 transition-transform shrink-0">
            <X size={16} className="text-slate-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading && (
            <div className="text-center py-12">
              <div className="w-8 h-8 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-400">Loading profile…</p>
            </div>
          )}

          {!loading && !data && (
            <div className="text-center py-12 text-slate-400">
              <p className="text-sm font-bold">Profile not found</p>
            </div>
          )}

          {!loading && data && (
            <>
              {/* Latest academic record (students only) */}
              {target.type === 'student' && extra && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Current Year</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: 'Class', val: extra.class_name },
                      { label: 'Section', val: extra.section },
                      { label: 'Roll', val: extra.roll_no },
                      { label: 'Total Fee', val: typeof extra.total_fee === 'number' ? `₹${(extra.total_fee as number).toLocaleString('en-IN')}` : '' },
                      { label: 'Paid', val: typeof extra.paid_fee === 'number' ? `₹${(extra.paid_fee as number).toLocaleString('en-IN')}` : '' },
                      { label: 'Fee Status', val: extra.fee_status },
                      { label: 'Attendance', val: typeof extra.attendance_percent === 'number' ? `${extra.attendance_percent}%` : '' },
                      { label: 'Status', val: extra.status },
                    ].filter(r => r.val !== null && r.val !== undefined && r.val !== '').map(r => (
                      <div key={r.label} className="bg-slate-50 rounded-lg px-2.5 py-1.5">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{r.label}</p>
                        <p className="text-xs font-black text-slate-800 mt-0.5 break-words">{String(r.val)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Grouped fields */}
              {groups.map(g => {
                const rows = g.fields
                  .map(f => ({ ...f, val: formatVal(data[f.key]) }))
                  .filter(r => r.val !== '');
                if (rows.length === 0) return null;
                return (
                  <div key={g.title} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{g.title}</p>
                    <div className="space-y-1.5">
                      {rows.map(r => (
                        <div key={r.key} className="flex items-start gap-3 text-xs">
                          <span className="font-bold text-slate-400 w-28 shrink-0">{r.label}</span>
                          <span className="font-black text-slate-800 break-words flex-1 min-w-0">{r.val}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* Anything we didn't surface in the curated groups —
                  show under "More" so columns added later don't get
                  silently dropped. */}
              {(() => {
                const known = new Set([
                  'id', 'school_id', 'user_id', 'photo',
                  ...groups.flatMap(g => g.fields.map(f => f.key)),
                ]);
                const extras = Object.entries(data)
                  .filter(([k, v]) => !known.has(k) && v !== null && v !== undefined && v !== '');
                if (extras.length === 0) return null;
                return (
                  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">More</p>
                    <div className="space-y-1.5">
                      {extras.map(([k, v]) => (
                        <div key={k} className="flex items-start gap-3 text-xs">
                          <span className="font-bold text-slate-400 w-28 shrink-0">{k}</span>
                          <span className="font-black text-slate-800 break-words flex-1 min-w-0">{formatVal(v)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── School active/inactive toggle confirm ───────────────────────────────────
// Same inline pattern as AyToggleConfirmDialog. Inactive blocks every
// login for the school, so we gate behind the principal's mobile last-4.
const SchoolStatusToggleConfirmDialog: React.FC<{
  school: School;
  next: SchoolStatus;
  saving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ school, next, saving, onCancel, onConfirm }) => {
  const fullPhone = (school.principalPhone ?? '').replace(/\D/g, '');
  const last4 = fullPhone.slice(-4);
  const masked = fullPhone.length >= 4 ? `XXXXXX${last4}` : '(set nahi hai)';
  const isActivating = next === SchoolStatus.ACTIVE;
  const [text, setText] = useState('');
  const [error, setError] = useState(false);

  const tryConfirm = () => {
    if (last4.length === 4) {
      if (text.replace(/\D/g, '').slice(-4) !== last4) {
        setError(true);
        return;
      }
    } else if (text.trim().toUpperCase() !== (isActivating ? 'ACTIVATE' : 'DEACTIVATE')) {
      setError(true);
      return;
    }
    onConfirm();
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={saving ? undefined : onCancel}>
      <div className="bg-white w-full sm:max-w-md rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom-4"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-3">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${isActivating ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
            <AlertCircle size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-black text-slate-900">
              {isActivating ? 'Activate school?' : 'Deactivate school?'}
            </p>
            <p className="text-[12px] font-bold text-slate-500 mt-1 leading-relaxed">
              {isActivating
                ? `${school.name} ke principal aur staff dobara login kar payenge.`
                : `${school.name} ki saari sessions kat jayengi. Principal aur staff jab tak dobara active na karein, login nahi kar payenge.`}
            </p>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mt-2 text-[11px] font-bold text-slate-600">
          <span className="block text-[10px] uppercase tracking-widest text-slate-400 mb-0.5">Login mobile</span>
          {masked}
        </div>

        <p className="text-[11px] font-black uppercase tracking-widest text-slate-500 mt-4 mb-2">
          {last4.length === 4
            ? 'Principal ke login mobile ke last 4 digits daalein'
            : `Confirm karne ke liye "${isActivating ? 'ACTIVATE' : 'DEACTIVATE'}" type karein`}
        </p>
        <input
          type="text"
          inputMode={last4.length === 4 ? 'numeric' : undefined}
          pattern={last4.length === 4 ? '[0-9]*' : undefined}
          maxLength={last4.length === 4 ? 4 : 12}
          autoFocus
          autoComplete="off"
          value={text}
          onChange={e => {
            const v = last4.length === 4
              ? e.target.value.replace(/\D/g, '').slice(0, 4)
              : e.target.value.slice(0, 12);
            setText(v);
            setError(false);
          }}
          onKeyDown={e => { if (e.key === 'Enter') tryConfirm(); }}
          placeholder={last4.length === 4 ? '••••' : (isActivating ? 'ACTIVATE' : 'DEACTIVATE')}
          className={`w-full px-4 py-3.5 bg-slate-50 border rounded-xl font-black text-2xl text-center tracking-[0.4em] text-slate-900 outline-none transition-colors ${
            error ? 'border-rose-400 bg-rose-50' : `border-slate-200 ${isActivating ? 'focus:border-emerald-500' : 'focus:border-rose-500'}`
          }`}
        />
        {error && (
          <p className="text-[11px] font-black text-rose-600 mt-2">Galat input — phir se check karein.</p>
        )}

        <div className="flex gap-3 mt-5">
          <button onClick={onCancel} disabled={saving}
            className="flex-1 py-3 bg-slate-100 text-slate-700 font-black rounded-2xl text-sm uppercase tracking-widest active:scale-95 transition-transform disabled:opacity-50">
            Cancel
          </button>
          <button onClick={tryConfirm} disabled={saving}
            className={`flex-1 py-3 text-white font-black rounded-2xl text-sm uppercase tracking-widest active:scale-95 transition-transform disabled:opacity-50 ${isActivating ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}>
            {saving ? 'Saving…' : (isActivating ? 'Activate' : 'Deactivate')}
          </button>
        </div>
      </div>
    </div>
  );
};

const SchoolLimitsCard: React.FC<{
  school: School;
  onSaved: (patch: Partial<School>) => void;
}> = ({ school, onSaved }) => {
  const { showToast } = useUIStore();
  const [studentsLimit, setStudentsLimit] = useState<string>(
    school.maxStudents !== null && school.maxStudents !== undefined ? String(school.maxStudents) : '',
  );
  const [staffLimit, setStaffLimit] = useState<string>(
    school.maxStaff !== null && school.maxStaff !== undefined ? String(school.maxStaff) : '',
  );
  // Vehicle cap. Distinct from students/staff because 0 carries
  // special meaning ("transport service disabled") — handled
  // explicitly in the save / hint text below.
  const [vehiclesLimit, setVehiclesLimit] = useState<string>(
    school.maxVehicles !== null && school.maxVehicles !== undefined ? String(school.maxVehicles) : '',
  );
  const [activeStudents, setActiveStudents] = useState<number | null>(null);
  const [activeStaff, setActiveStaff]       = useState<number | null>(null);
  const [activeVehicles, setActiveVehicles] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Pull live counts on mount so the input help-text can show how low the
  // SUPER_ADMIN is allowed to go ("min 1000 — currently 1000 active").
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [stuRes, staffRes, vehRes] = await Promise.all([
        supabase.from('students').select('id', { count: 'exact', head: true })
          .eq('school_id', school.id).eq('is_active', true),
        supabase.from('staff').select('id', { count: 'exact', head: true })
          .eq('school_id', school.id).eq('is_active', true),
        supabase.from('transport_vehicles').select('id', { count: 'exact', head: true })
          .eq('school_id', school.id).eq('is_active', true),
      ]);
      if (cancelled) return;
      setActiveStudents(stuRes.count ?? 0);
      setActiveStaff(staffRes.count ?? 0);
      setActiveVehicles(vehRes.count ?? 0);
    })();
    return () => { cancelled = true; };
  }, [school.id]);

  const parseLimit = (raw: string): number | null => {
    const t = raw.trim();
    if (t === '') return null;
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return NaN as unknown as number;
    return n;
  };

  const handleSave = async () => {
    const stu = parseLimit(studentsLimit);
    const stf = parseLimit(staffLimit);
    const veh = parseLimit(vehiclesLimit);
    if (Number.isNaN(stu) || Number.isNaN(stf) || Number.isNaN(veh)) {
      showToast('Limits must be whole numbers (or blank for unlimited)', 'error');
      return;
    }
    // Don't let the principal lower vehicle cap below the live count —
    // the trigger would just refuse the next reactivation, but a
    // friendlier upfront block is better UX.
    if (veh !== null && activeVehicles !== null && veh < activeVehicles && veh > 0) {
      showToast(`Cannot set max vehicles below current active count (${activeVehicles}). Deactivate vehicles first.`, 'error');
      return;
    }
    // Type-last-4 gate so a stray tap can't push new caps to the DB.
    const last4 = (school.principalPhone ?? '').replace(/\D/g, '').slice(-4);
    if (last4.length === 4) {
      const ok = await useUIStore.getState().askMobileConfirm({
        title: 'Save Capacity Limits?',
        message: `Type the last 4 digits of ${school.principalName || 'principal'}'s mobile (${school.principalPhone ?? ''}) to confirm new limits — Students: ${stu ?? '∞'}, Staff: ${stf ?? '∞'}, Vehicles: ${veh ?? '∞'}${veh === 0 ? ' (transport disabled)' : ''}.`,
        expectedLast4: last4,
      });
      if (!ok) return;
    }
    setSaving(true);
    try {
      await schoolService.update(school.id, { maxStudents: stu, maxStaff: stf, maxVehicles: veh });
      onSaved({ maxStudents: stu, maxStaff: stf, maxVehicles: veh });
      showToast('Limits saved');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const dirty = studentsLimit !== (school.maxStudents != null ? String(school.maxStudents) : '')
              || staffLimit    !== (school.maxStaff    != null ? String(school.maxStaff)    : '')
              || vehiclesLimit !== (school.maxVehicles != null ? String(school.maxVehicles) : '');

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Capacity Limits</p>
        <span className="text-[10px] font-bold text-slate-400">Blank = unlimited</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <LimitInput
          label="Max Students"
          value={studentsLimit}
          onChange={setStudentsLimit}
          activeCount={activeStudents}
          accent="indigo"
        />
        <LimitInput
          label="Max Staff"
          value={staffLimit}
          onChange={setStaffLimit}
          activeCount={activeStaff}
          accent="emerald"
        />
        <div className="col-span-2">
          <LimitInput
            label="Max Vehicles"
            value={vehiclesLimit}
            onChange={setVehiclesLimit}
            activeCount={activeVehicles}
            accent="amber"
          />
          {/* Special meaning of 0 — make it impossible to miss. */}
          {vehiclesLimit === '0' && (
            <p className="text-[11px] font-black text-rose-600 mt-1.5 leading-relaxed">
              ⚠ <span className="uppercase tracking-widest">Transport service disabled</span> for this school. Principal won't see the Transport tile or any vehicle UI until you raise this above 0.
            </p>
          )}
          {vehiclesLimit !== '0' && vehiclesLimit !== '' && (
            <p className="text-[10px] font-bold text-slate-400 mt-1">
              School can run up to {vehiclesLimit} active vehicle{vehiclesLimit === '1' ? '' : 's'}.
            </p>
          )}
          {vehiclesLimit === '' && (
            <p className="text-[10px] font-bold text-slate-400 mt-1">
              Blank = unlimited vehicles. Set 0 to disable transport entirely.
            </p>
          )}
        </div>
      </div>
      {dirty && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="mt-3 w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-black text-xs uppercase tracking-widest rounded-xl active:scale-95 transition-transform shadow-sm disabled:opacity-50 flex items-center justify-center gap-2">
          {saving ? 'Saving…' : <><Save size={14} /> Save Limits</>}
        </button>
      )}
      {!dirty && (
        <p className="mt-3 text-[10px] font-bold text-slate-400 text-center">
          Change a value above to enable Save.
        </p>
      )}
    </div>
  );
};

const LimitInput: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  activeCount: number | null;
  accent: 'indigo' | 'emerald' | 'amber';
}> = ({ label, value, onChange, activeCount, accent }) => {
  const accentClass =
    accent === 'indigo'  ? 'focus:border-indigo-500'  :
    accent === 'emerald' ? 'focus:border-emerald-500' :
                            'focus:border-amber-500';
  return (
    <div>
      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">{label}</label>
      <input
        type="number"
        min={0}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Unlimited"
        className={`w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-2.5 font-black text-slate-900 text-base outline-none ${accentClass}`}
      />
      {activeCount !== null && (
        <p className="text-[10px] font-bold text-slate-400 mt-1 tabular-nums">
          Currently {activeCount} active · min allowed {activeCount}
        </p>
      )}
    </div>
  );
};
