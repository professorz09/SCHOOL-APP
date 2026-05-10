import React, { useEffect, useState, useCallback } from 'react';
import {
  ArrowLeft, Plus, Search, Building2, MapPin, Phone, Users,
  Edit2, CheckCircle2, Save, UserCheck,
  IndianRupee, Copy, ChevronRight, BookOpen, TrendingUp, AlertCircle,
  Wallet, CreditCard, RefreshCw, Key, X,
} from 'lucide-react';
import { adminApi } from '@/lib/adminApi';
import { supabase } from '@/lib/supabase';
import { useSchoolStore } from '@/roles/super-admin/schoolStore';
import { useBillingStore } from '@/roles/super-admin/billingStore';
import { useUIStore } from '@/store/uiStore';
import { School, CreateSchoolInput } from '@/roles/super-admin/school.types';
import { SchoolStatus, BillingPlan, STATUS_COLORS, PLAN_COLORS } from '@/shared/config/constants';
import { schoolService } from '@/shared/utils/school.service';
import { BackupCard } from '@/shared/components/BackupCard';
import { billingService, ANNUAL_PLAN_PRICES } from '@/roles/super-admin/billing.service';
import { platformSettings, DEFAULT_PLAN_PRICING, PlanPricing } from '@/roles/super-admin/platformSettings.service';
import { BillingYear } from '@/roles/super-admin/billing.types';
import { apiAdminSchools, SchoolBillingInfo, SchoolFeePayment } from '@/lib/apiClient';

type View = 'LIST' | 'CREATE' | 'DETAIL' | 'EDIT' | 'SECTIONS' | 'STUDENTS' | 'STAFF' | 'BILLING';

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
  const { billingYears, fetchAll: fetchBilling } = useBillingStore();
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
  const [stuShown, setStuShown]             = useState(50);
  const [staffShown, setStaffShown]         = useState(50);
  const [paymentsShown, setPaymentsShown]   = useState(50);
  useEffect(() => { setStuShown(50); }, [studentsSearch]);
  useEffect(() => { setStaffShown(50); }, [staffSearch]);
  const [overview, setOverview]             = useState<SchoolOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);

  // ── Billing state ─────────────────────────────────────────────────────────
  const [billingInfo, setBillingInfo]       = useState<SchoolBillingInfo | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [fixedAmtInput, setFixedAmtInput]   = useState('');
  const [savingAmt, setSavingAmt]           = useState(false);
  const [payAmt, setPayAmt]                 = useState('');
  const [payDate, setPayDate]               = useState(() => new Date().toISOString().split('T')[0]);
  const [payNote, setPayNote]               = useState('');
  const [addingPay, setAddingPay]           = useState(false);

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

  const openResetModal = (schoolId: string) => {
    setResetSchoolId(schoolId);
    setResetDone(null);
  };

  const submitReset = async () => {
    if (!resetSchoolId) return;
    setResetSubmitting(true);
    try {
      const res = await adminApi.resetPrincipalPassword(resetSchoolId);
      setResetDone({ password: res.tempPassword, principalName: res.name, mobile: res.mobile });
      showToast('Password reset · share with principal');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Reset failed', 'error');
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
  // Live plan prices from platform_settings (Settings page) — falls back to
  // the static defaults if the platform_settings row hasn't been seeded yet.
  const [livePricing, setLivePricing] = useState<PlanPricing>(DEFAULT_PLAN_PRICING);

  useEffect(() => {
    fetchSchools().catch(e => showToast(e instanceof Error ? e.message : 'Failed to load schools', 'error'));
    fetchBilling().catch(e => showToast(e instanceof Error ? e.message : 'Failed to load billing data', 'error'));
    platformSettings.getAll()
      .then(s => setLivePricing(s.pricing))
      .catch(() => { /* keep defaults */ });
  }, []);

  const filtered = schools.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.location.toLowerCase().includes(search.toLowerCase()) ||
    s.code.toLowerCase().includes(search.toLowerCase()),
  );

  // Latest billing year per school
  const latestBillingMap: Record<string, BillingYear> = {};
  billingYears.forEach(y => {
    const prev = latestBillingMap[y.schoolId];
    if (!prev || y.startDate > prev.startDate) latestBillingMap[y.schoolId] = y;
  });

  const loadBillingInfo = useCallback(async (schoolId: string) => {
    setBillingLoading(true);
    try {
      const info = await apiAdminSchools.getPayments(schoolId);
      setBillingInfo(info);
      setFixedAmtInput(info.fixedAmount > 0 ? String(info.fixedAmount) : '');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to load billing info', 'error');
    } finally {
      setBillingLoading(false);
    }
  }, []);

  const handleCreate = async () => {
    if (!form.name || !form.code || !form.principalEmail || !form.paymentStartDate) {
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
      await billingService.setupSchoolBilling(school.id, school.name, school.plan, school.paymentStartDate);
      await fetchBilling();
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
      const planChanged = form.plan && form.plan !== selected.plan;

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
      if (planChanged) {
        await billingService.updatePlan(selected.id, form.plan!);
        await fetchBilling();
        showToast(`Plan updated to ${form.plan}`);
      } else if (principalMobileChanged) {
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


  const handleSaveFixedAmount = async () => {
    if (!selected) return;
    const amt = parseFloat(fixedAmtInput);
    if (!Number.isFinite(amt) || amt < 0) {
      showToast('Valid amount required', 'error'); return;
    }
    setSavingAmt(true);
    try {
      await apiAdminSchools.setBillingAmount(selected.id, Math.round(amt));
      showToast('Monthly fee updated');
      await loadBillingInfo(selected.id);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to save', 'error');
    } finally { setSavingAmt(false); }
  };

  const handleAddPayment = async () => {
    if (!selected) return;
    const amt = parseFloat(payAmt);
    if (!Number.isFinite(amt) || amt <= 0) {
      showToast('Valid payment amount required', 'error'); return;
    }
    if (!payDate) { showToast('Payment date required', 'error'); return; }
    setAddingPay(true);
    try {
      await apiAdminSchools.addPayment(selected.id, { amount: Math.round(amt), paidOn: payDate, note: payNote || undefined });
      showToast('Payment recorded');
      setPayAmt('');
      setPayNote('');
      setPayDate(new Date().toISOString().split('T')[0]);
      await loadBillingInfo(selected.id);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to add payment', 'error');
    } finally { setAddingPay(false); }
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
    const activeCount    = schools.filter(s => s.status === SchoolStatus.ACTIVE).length;
    const trialCount     = schools.filter(s => s.status === SchoolStatus.TRIAL).length;
    const overdueCount   = Object.values(latestBillingMap).filter(y => y.outstanding > 0).length;

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
              <div className="text-2xl font-black text-violet-600">{trialCount}</div>
              <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Trial</div>
            </div>
            <div className="w-px bg-slate-100" />
            <div className="flex-1 text-center">
              <div className="text-2xl font-black text-rose-600">{overdueCount}</div>
              <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Dues</div>
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

            {filtered.map(school => {
              const billing = latestBillingMap[school.id];
              const pct = billing ? Math.round((billing.totalPaid / billing.totalDue) * 100) : 0;
              const hasOutstanding = billing && billing.outstanding > 0;
              return (
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
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      {/* Avatar */}
                      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center font-black text-sm shrink-0">
                        {school.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-slate-900 text-sm truncate">{school.name}</span>
                          <span className={`shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-widest ${STATUS_COLORS[school.status]}`}>{school.status}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <div className="flex items-center gap-1 text-slate-400">
                            <MapPin size={10} />
                            <span className="text-[10px] font-bold">{school.location}</span>
                          </div>
                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-widest ${PLAN_COLORS[school.plan]}`}>{school.plan}</span>
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

                    {/* Billing progress */}
                    {billing && (
                      <div className="mt-3">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            {billing.yearLabel} · {pct}% paid
                          </span>
                          {hasOutstanding && (
                            <span className="flex items-center gap-0.5 text-[10px] font-black text-rose-500">
                              <AlertCircle size={10} />
                              ₹{billing.outstanding.toLocaleString('en-IN')} due
                            </span>
                          )}
                          {!hasOutstanding && (
                            <span className="flex items-center gap-0.5 text-[10px] font-black text-emerald-600">
                              <CheckCircle2 size={10} /> Settled
                            </span>
                          )}
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : hasOutstanding ? 'bg-amber-400' : 'bg-blue-500'}`}
                            style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
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

          {/* Plan & Date */}
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm space-y-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Billing Setup</p>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Plan</label>
              <select value={form.plan} onChange={e => setForm(f => ({ ...f, plan: e.target.value as BillingPlan }))}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none focus:border-blue-500 focus:bg-white transition-colors">
                {Object.values(BillingPlan).map(p => (
                  <option key={p} value={p}>₹{livePricing[p].toLocaleString('en-IN')}/yr — {p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Billing Start Date *</label>
              <input type="date" value={form.paymentStartDate ?? ''} onChange={e => setForm(f => ({ ...f, paymentStartDate: e.target.value }))}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-blue-500 focus:bg-white transition-colors" />
            </div>
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
    const billing = latestBillingMap[selected.id];
    const pct = billing ? Math.round((billing.totalPaid / billing.totalDue) * 100) : 0;
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
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${PLAN_COLORS[selected.plan]}`}>{selected.plan}</span>
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

          {/* Principal */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Principal</p>
              <button
                onClick={() => openResetModal(selected.id)}
                className="flex items-center gap-1.5 text-[10px] font-black text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2.5 py-1 rounded-lg uppercase tracking-wider transition-colors">
                <Key size={10} /> Reset Password
              </button>
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

          {/* New Academic Year creation toggle — SUPER_ADMIN-only.
              When ON, the school's principal sees an active "Add Year"
              wizard. When OFF, the wizard's CTA is disabled and the
              server-side guard rejects any direct RPC. Default OFF
              so schools opt-in for year-end planning windows only. */}
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
                    : 'Principal cannot create a new academic year. Turn this on a few days before the school plans year-end rollover.'}
                </p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  const next = !selected.newYearCreationEnabled;
                  try {
                    await updateSchool(selected.id, { newYearCreationEnabled: next });
                    showToast(next ? 'New AY creation enabled' : 'New AY creation disabled');
                  } catch (e) {
                    showToast(e instanceof Error ? e.message : 'Toggle failed', 'error');
                  }
                }}
                className={`shrink-0 w-12 h-7 rounded-full relative transition-colors ${selected.newYearCreationEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
                aria-label="Toggle new academic year creation">
                <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-all ${selected.newYearCreationEnabled ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            </div>
          </div>

          {/* Capacity limits — hard caps on active students + active staff.
              NULL = unlimited. The DB blocks lowering these below the
              school's current active count, so the input rejects bad
              values before they reach the server. */}
          <SchoolLimitsCard
            school={selected}
            onSaved={(patch) => setSelected(prev => prev ? { ...prev, ...patch } : null)}
          />

          {/* Backup — Quick (daily) + Full (weekly). Streams a ZIP
              directly to the SUPER_ADMIN's browser, nothing is stored
              on Supabase. Rate limits are enforced server-side via
              audit_logs so a refresh-spam can't bypass them. */}
          <BackupCard schoolId={selected.id} apiPath={`/api/admin/schools/${selected.id}/backup`} />

          {/* Billing snapshot */}
          {billing && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Billing · {billing.yearLabel}</p>
                {billing.outstanding === 0
                  ? <span className="flex items-center gap-1 text-[10px] font-black text-emerald-600"><CheckCircle2 size={11} /> Settled</span>
                  : <span className="flex items-center gap-1 text-[10px] font-black text-rose-500"><AlertCircle size={11} /> ₹{billing.outstanding.toLocaleString('en-IN')} due</span>
                }
              </div>
              <div className="flex gap-4 mb-3">
                <div>
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Annual</div>
                  <div className="text-base font-black text-slate-900">₹{billing.annualAmount.toLocaleString('en-IN')}</div>
                </div>
                <div>
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Paid</div>
                  <div className="text-base font-black text-emerald-600">₹{billing.totalPaid.toLocaleString('en-IN')}</div>
                </div>
                {billing.carriedForward > 0 && (
                  <div>
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Carried</div>
                    <div className="text-base font-black text-amber-600">₹{billing.carriedForward.toLocaleString('en-IN')}</div>
                  </div>
                )}
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
              </div>
              <div className="text-right text-[10px] font-black text-slate-400 mt-1">{pct}%</div>
            </div>
          )}

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

          {/* Quick-nav tiles */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: BookOpen,    label: 'Sections',    view: 'SECTIONS' as View, color: 'text-indigo-600 bg-indigo-50', count: overview?.classBreakdown.length ?? 0 },
              { icon: Users,       label: 'Students',    view: 'STUDENTS' as View, color: 'text-blue-600 bg-blue-50',    count: overview?.totalStudents ?? 0 },
              { icon: UserCheck,   label: 'Staff',       view: 'STAFF' as View,    color: 'text-emerald-600 bg-emerald-50', count: overview?.totalStaff ?? 0 },
              { icon: Wallet,      label: 'Billing',     view: 'BILLING' as View,  color: 'text-violet-600 bg-violet-50', count: 0 },
            ].map(({ icon: Icon, label, view: v, color, count }) => (
              <button key={label}
                onClick={() => {
                  if (v === 'STAFF') { setStaffSearch(''); loadStaff(selected.id); setView(v); }
                  else if (v === 'STUDENTS') { setStudentsSearch(''); setSelectedSection(null); loadStudents(selected.id); setView(v); }
                  else if (v === 'BILLING') { setBillingInfo(null); loadBillingInfo(selected.id); setView(v); }
                  else if (v !== 'DETAIL') setView(v);
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

  // ── BILLING ───────────────────────────────────────────────────────────────────
  if (view === 'BILLING' && selected) {
    const outstanding = billingInfo?.outstanding ?? 0;
    return (
      <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        {renderHeader(`Billing · ${selected.name}`, () => setView('DETAIL'),
          <button onClick={() => loadBillingInfo(selected.id)} disabled={billingLoading}
            className="p-2 bg-slate-100 rounded-full text-slate-600 hover:bg-slate-200 transition-colors disabled:opacity-50">
            <RefreshCw size={16} className={billingLoading ? 'animate-spin' : ''} />
          </button>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {billingLoading && !billingInfo ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-slate-200 border-t-violet-600 rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Outstanding balance card */}
              <div className={`rounded-2xl p-5 ${outstanding > 0 ? 'bg-rose-600' : 'bg-emerald-600'}`}>
                <p className="text-[10px] font-black uppercase tracking-widest text-white/70 mb-1">Outstanding Balance</p>
                <div className="flex items-end gap-2">
                  <span className="text-3xl font-black text-white">
                    ₹{outstanding.toLocaleString('en-IN')}
                  </span>
                  {outstanding === 0 && <CheckCircle2 size={20} className="text-white mb-1" />}
                </div>
                {billingInfo && billingInfo.fixedAmount > 0 && (
                  <div className="mt-3 flex gap-4 text-white/80 text-[10px] font-bold">
                    <span>₹{billingInfo.fixedAmount.toLocaleString('en-IN')}/mo × {billingInfo.monthsElapsed} months</span>
                    <span className="text-white/50">|</span>
                    <span>Paid ₹{billingInfo.totalPaid.toLocaleString('en-IN')}</span>
                  </div>
                )}
                {billingInfo && billingInfo.fixedAmount === 0 && (
                  <p className="mt-2 text-white/70 text-xs font-bold">Set a monthly fee below to track balance</p>
                )}
              </div>

              {/* Set fixed monthly fee */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Monthly Fee</p>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">₹</span>
                    <input
                      type="number"
                      min="0"
                      value={fixedAmtInput}
                      onChange={e => setFixedAmtInput(e.target.value)}
                      placeholder="e.g. 5000"
                      className="w-full border border-slate-200 bg-slate-50 rounded-xl pl-7 pr-4 py-3 font-bold text-sm outline-none focus:border-violet-500 focus:bg-white transition-colors"
                    />
                  </div>
                  <button onClick={handleSaveFixedAmount} disabled={savingAmt}
                    className="flex items-center gap-1.5 bg-violet-600 text-white font-black text-xs uppercase tracking-widest px-4 py-3 rounded-xl disabled:opacity-60 active:scale-95 transition-transform">
                    {savingAmt ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                    Save
                  </button>
                </div>
                <p className="text-[10px] font-bold text-slate-400 mt-2">
                  Fixed amount charged to this school every month
                </p>
              </div>

              {/* Add Payment */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Add Payment</p>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">₹</span>
                      <input
                        type="number"
                        min="1"
                        value={payAmt}
                        onChange={e => setPayAmt(e.target.value)}
                        placeholder="Amount"
                        className="w-full border border-slate-200 bg-slate-50 rounded-xl pl-7 pr-3 py-3 font-bold text-sm outline-none focus:border-emerald-500 focus:bg-white transition-colors"
                      />
                    </div>
                    <input
                      type="date"
                      value={payDate}
                      onChange={e => setPayDate(e.target.value)}
                      className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none focus:border-emerald-500 focus:bg-white transition-colors"
                    />
                  </div>
                  <input
                    type="text"
                    value={payNote}
                    onChange={e => setPayNote(e.target.value)}
                    placeholder="Note (optional) — e.g. NEFT / cheque no."
                    className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-emerald-500 focus:bg-white transition-colors"
                  />
                  <button onClick={handleAddPayment} disabled={addingPay}
                    className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white font-black text-xs uppercase tracking-widest py-3.5 rounded-xl active:scale-95 transition-transform disabled:opacity-60 shadow-sm">
                    {addingPay ? <RefreshCw size={14} className="animate-spin" /> : <CreditCard size={14} />}
                    Record Payment
                  </button>
                </div>
              </div>

              {/* Payment History */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-50">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Payment History</p>
                </div>
                {!billingInfo || billingInfo.payments.length === 0 ? (
                  <div className="flex flex-col items-center py-10 text-slate-400">
                    <IndianRupee size={28} className="mb-2 opacity-30" />
                    <p className="font-bold text-sm">No payments recorded yet</p>
                  </div>
                ) : (
                  <div>
                    {billingInfo.payments.slice(0, paymentsShown).map((p, idx) => (
                      <div key={p.id}
                        className={`flex items-center gap-3 px-4 py-3 ${idx < Math.min(billingInfo.payments.length, paymentsShown) - 1 ? 'border-b border-slate-50' : ''}`}>
                        <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                          <IndianRupee size={15} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-extrabold text-slate-900 text-sm">
                            ₹{Number(p.amount).toLocaleString('en-IN')}
                          </div>
                          {p.note && (
                            <div className="text-[10px] font-bold text-slate-400 truncate mt-0.5">{p.note}</div>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-[11px] font-black text-slate-500">{fmtDate(p.paid_on)}</div>
                        </div>
                      </div>
                    ))}
                    {billingInfo.payments.length > paymentsShown && (
                      <button onClick={() => setPaymentsShown(s => s + 50)}
                        className="w-full py-3 border-t border-slate-100 font-black text-xs text-emerald-700 hover:bg-emerald-50 transition-colors">
                        Load More ({billingInfo.payments.length - paymentsShown} remaining)
                      </button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* ── PRINCIPAL PASSWORD RESET MODAL ──────────────────────────────── */}
        {/* Two-stage flow: confirm first ("are you sure"), then show the
            server-generated temp password once. Server enforces a 24h
            cooldown per school + force-logout on the principal so the
            old session can't keep working. */}
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
                <button onClick={closeResetModal} className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center shrink-0">
                  <X size={16} className="text-slate-500" />
                </button>
              </div>

              {!resetDone ? (
                <>
                  <p className="text-[12px] font-bold text-slate-700 leading-relaxed mb-3">
                    The principal of <span className="font-black text-slate-900">{selected.name}</span> ({selected.principalName || 'principal'}) will:
                  </p>
                  <ul className="space-y-2 text-[12px] font-bold text-slate-600 mb-4 list-none">
                    <li className="flex gap-2"><span className="text-rose-600">•</span> Be logged out of all active sessions immediately.</li>
                    <li className="flex gap-2"><span className="text-rose-600">•</span> Receive a one-time temporary password (shown to you once).</li>
                    <li className="flex gap-2"><span className="text-rose-600">•</span> Be forced to set a new password on next login.</li>
                  </ul>
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-5 flex gap-2">
                    <AlertCircle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-[11px] font-bold text-amber-800 leading-relaxed">
                      A principal can be reset only once every 24 hours. Make sure the principal is reachable
                      to receive the temp password.
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <button onClick={closeResetModal}
                      className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black rounded-xl text-sm transition-colors">
                      Cancel
                    </button>
                    <button onClick={submitReset} disabled={resetSubmitting}
                      className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-xl text-sm disabled:opacity-50 active:scale-[0.98] transition-all">
                      {resetSubmitting ? 'Resetting…' : 'Confirm Reset'}
                    </button>
                  </div>
                </>
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
                      className="px-3 py-3 bg-slate-100 hover:bg-slate-200 rounded-xl">
                      <Copy size={14} className="text-slate-600" />
                    </button>
                  </div>
                  <button onClick={closeResetModal}
                    className="w-full mt-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-sm">
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
              {filtered_stu.slice(0, stuShown).map((s, idx) => (
                <div key={s.id}
                  className={`flex items-center gap-3 px-4 py-3 ${idx < Math.min(filtered_stu.length, stuShown) - 1 ? 'border-b border-slate-50' : ''}`}>
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
                </div>
              ))}
            </div>
          )}
          {filtered_stu.length > stuShown && (
            <button onClick={() => setStuShown(s => s + 50)}
              className="w-full mt-3 py-3 bg-white border border-slate-200 rounded-2xl font-black text-xs text-indigo-700 hover:bg-indigo-50 transition-colors">
              Load More ({filtered_stu.length - stuShown} remaining)
            </button>
          )}
        </div>
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
              {filtered_staff.slice(0, staffShown).map((s, idx) => (
                <div key={s.id}
                  className={`flex items-center gap-3 px-4 py-3 ${idx < Math.min(filtered_staff.length, staffShown) - 1 ? 'border-b border-slate-50' : ''}`}>
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
                </div>
              ))}
            </div>
          )}
          {filtered_staff.length > staffShown && (
            <button onClick={() => setStaffShown(s => s + 50)}
              className="w-full mt-3 py-3 bg-white border border-slate-200 rounded-2xl font-black text-xs text-indigo-700 hover:bg-indigo-50 transition-colors">
              Load More ({filtered_staff.length - staffShown} remaining)
            </button>
          )}
        </div>
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Plan</label>
                <select value={form.plan} onChange={e => setForm(f => ({ ...f, plan: e.target.value as BillingPlan }))}
                  className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none focus:border-blue-500 focus:bg-white transition-colors">
                  {Object.values(BillingPlan).map(p => (
                    <option key={p} value={p}>₹{livePricing[p].toLocaleString('en-IN')}/yr — {p}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Status</label>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as SchoolStatus }))}
                  className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none focus:border-blue-500 focus:bg-white transition-colors">
                  {Object.values(SchoolStatus).map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
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
          <button onClick={handleUpdate} disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg disabled:opacity-60">
            {isSubmitting ? 'Updating…' : <><Save size={16} /> Save Changes</>}
          </button>
        </div>
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

// ─── Capacity limits card ───────────────────────────────────────────────────
// Hard caps on active students + active staff. Inline editable; the DB
// rejects lowering below the school's current count (trigger added in
// migration 0082) so this component just surfaces that error to the user.
//
// Inputs are blanked → NULL on save (= unlimited). Numbers must be ≥ 0.
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
          className="mt-3 w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-black text-xs uppercase tracking-widest rounded-xl active:scale-[0.98] transition-all disabled:opacity-50">
          {saving ? 'Saving…' : 'Save Limits'}
        </button>
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
