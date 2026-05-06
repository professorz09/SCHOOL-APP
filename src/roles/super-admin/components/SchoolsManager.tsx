import React, { useEffect, useState, useCallback } from 'react';
import {
  ArrowLeft, Plus, Search, Building2, MapPin, Phone, Users,
  Edit2, CheckCircle2, Save, UserCheck,
  IndianRupee, Copy, ChevronRight, BookOpen, TrendingUp, AlertCircle,
  Wallet, CreditCard, RefreshCw,
} from 'lucide-react';
import { useSchoolStore } from '@/roles/super-admin/schoolStore';
import { useBillingStore } from '@/roles/super-admin/billingStore';
import { useUIStore } from '@/store/uiStore';
import { School, CreateSchoolInput } from '@/roles/super-admin/school.types';
import { SchoolStatus, BillingPlan, STATUS_COLORS, PLAN_COLORS } from '@/shared/config/constants';
import { schoolService } from '@/shared/utils/school.service';
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
      await updateSchool(selected.id, form as any);
      setSelected(s => s ? { ...s, ...form } : null);
      if (planChanged) {
        await billingService.updatePlan(selected.id, form.plan!);
        await fetchBilling();
        showToast(`Plan updated to ${form.plan}`);
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
            <Field form={form} setForm={setForm} label="Phone" k="phone" placeholder="+91 XXXXX XXXXX" />
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
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm space-y-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Principal Account</p>
            <Field form={form} setForm={setForm} label="Principal Name" k="principalName" placeholder="Dr. / Mr. / Ms." />
            <Field form={form} setForm={setForm} label="Email *" k="principalEmail" placeholder="principal@school.edu.in" />
            <Field form={form} setForm={setForm} label="Phone (Login ID) *" k="principalPhone" placeholder="10-digit mobile" />
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
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Principal</p>
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
                    {billingInfo.payments.map((p, idx) => (
                      <div key={p.id}
                        className={`flex items-center gap-3 px-4 py-3 ${idx < billingInfo.payments.length - 1 ? 'border-b border-slate-50' : ''}`}>
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
                  </div>
                )}
              </div>
            </>
          )}
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
              {filtered_stu.map((s, idx) => (
                <div key={s.id}
                  className={`flex items-center gap-3 px-4 py-3 ${idx < filtered_stu.length - 1 ? 'border-b border-slate-50' : ''}`}>
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
              {filtered_staff.map((s, idx) => (
                <div key={s.id}
                  className={`flex items-center gap-3 px-4 py-3 ${idx < filtered_staff.length - 1 ? 'border-b border-slate-50' : ''}`}>
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
              <Field form={form} setForm={setForm} label="Phone" k="phone" placeholder="+91 XXXXX XXXXX" />
            </div>
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
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm space-y-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Principal</p>
            <Field form={form} setForm={setForm} label="Name" k="principalName" placeholder="Dr. / Mr. / Ms." />
            <Field form={form} setForm={setForm} label="Email *" k="principalEmail" placeholder="principal@school.edu.in" />
            <Field form={form} setForm={setForm} label="Phone" k="principalPhone" placeholder="+91 XXXXX XXXXX" />
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
