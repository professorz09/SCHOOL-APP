import React, { useEffect, useState } from 'react';
import {
  ArrowLeft, Plus, Search, Building2, MapPin, Phone, Users, ChevronRight,
  Edit2, Trash2, CheckCircle2, XCircle, X, Save, Eye, BookOpen, UserCheck, IndianRupee, Copy,
} from 'lucide-react';
import { useSchoolStore } from '../../../store/schoolStore';
import { useBillingStore } from '../../../store/billingStore';
import { useUIStore } from '../../../store/uiStore';
import { School, CreateSchoolInput } from '../../../types/school.types';
import { SchoolStatus, BillingPlan, PaymentStatus, STATUS_COLORS, PLAN_COLORS, PAYMENT_COLORS, PLAN_PRICES } from '../../../config/constants';
import { schoolService } from '../../../services/school.service';
import { billingService } from '../../../services/billing.service';

type View = 'LIST' | 'CREATE' | 'DETAIL' | 'EDIT' | 'SECTIONS' | 'STUDENTS' | 'STAFF';

const STAFF_MOCK = [
  { id: 'st1', name: 'Aarti Desai', role: 'Teacher', subject: 'Mathematics', phone: '+91 98001 11111', status: 'ACTIVE' as const },
  { id: 'st2', name: 'Sanjay Mehta', role: 'Teacher', subject: 'Science', phone: '+91 98001 22222', status: 'ACTIVE' as const },
  { id: 'st3', name: 'Priya Singh', role: 'Teacher', subject: 'English', phone: '+91 98001 33333', status: 'ON_LEAVE' as const },
  { id: 'st4', name: 'Rahul Verma', role: 'Accountant', subject: '—', phone: '+91 98001 44444', status: 'ACTIVE' as const },
];

interface Props {
  onBack: () => void;
}

export const SchoolsManager: React.FC<Props> = ({ onBack }) => {
  const { schools, fetchSchools, addSchool, updateSchool, deleteSchool } = useSchoolStore();
  const { fetchAll: fetchBilling } = useBillingStore();
  const { showToast } = useUIStore();

  const [view, setView] = useState<View>('LIST');
  const [selected, setSelected] = useState<School | null>(null);
  const [selectedSection, setSelectedSection] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [activeAYIdx, setActiveAYIdx] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<School | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<School | null>(null);
  const [createdCredentials, setCreatedCredentials] = useState<{ schoolName: string; mobile: string; password: string } | null>(null);

  const [form, setForm] = useState<Partial<CreateSchoolInput>>({
    name: '', code: '', location: '', address: '', phone: '',
    principalName: '', principalEmail: '', principalPhone: '',
    status: SchoolStatus.ACTIVE, plan: BillingPlan.STANDARD,
    paymentStartDate: new Date().toISOString().split('T')[0],
    password: '',
  });

  useEffect(() => { fetchSchools(); }, []);

  const filtered = schools.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.location.toLowerCase().includes(search.toLowerCase()) ||
    s.code.toLowerCase().includes(search.toLowerCase()),
  );

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
      // Auto-generate 12 months of billing schedule from payment start date
      await billingService.generateScheduleForSchool(
        school.id,
        school.name,
        school.plan,
        school.paymentStartDate,
      );
      await fetchBilling();
      setCreatedCredentials({
        schoolName: school.name,
        mobile: cleanPhone,
        password: form.password as string,
      });
      setForm({
        name: '', code: '', location: '', address: '', phone: '',
        principalName: '', principalEmail: '', principalPhone: '',
        status: SchoolStatus.ACTIVE, plan: BillingPlan.STANDARD,
        paymentStartDate: new Date().toISOString().split('T')[0], password: '',
      });
      setView('LIST');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (school: School) => {
    await deleteSchool(school.id);
    showToast(`${school.name} removed`, 'info');
    setConfirmDelete(null);
    if (view === 'DETAIL') setView('LIST');
  };

  const handleStatusToggle = (school: School) => {
    if (school.status === SchoolStatus.ACTIVE) {
      setConfirmDeactivate(school);
    } else {
      doStatusChange(school, SchoolStatus.ACTIVE);
    }
  };

  const doStatusChange = async (school: School, next: SchoolStatus) => {
    await updateSchool(school.id, { status: next });
    showToast(`${school.name} marked ${next.toLowerCase()}`);
    if (selected?.id === school.id) setSelected(s => s ? { ...s, status: next } : null);
    setConfirmDeactivate(null);
  };

  const handleEdit = (school: School) => {
    setForm({
      name: school.name, code: school.code, location: school.location,
      address: school.address, phone: school.phone,
      principalName: school.principalName, principalEmail: school.principalEmail,
      principalPhone: school.principalPhone, status: school.status, plan: school.plan,
      password: '',
    });
    setView('EDIT');
  };

  const handleUpdate = async () => {
    if (!selected || !form.name || !form.code) {
      showToast('Name and code required', 'error'); return;
    }
    setIsSubmitting(true);
    try {
      const planChanged = form.plan && form.plan !== selected.plan;
      await updateSchool(selected.id, form as any);
      setSelected(s => s ? { ...s, ...form } : null);
      if (planChanged) {
        const { updated, unchanged } = await billingService.updatePlan(selected.id, form.plan!);
        await fetchBilling();
        showToast(`Plan updated! ${updated} upcoming payments repriced, ${unchanged} paid records unchanged.`);
      } else {
        showToast(`${form.name} updated successfully!`);
      }
      setView('DETAIL');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── VIEWS ────────────────────────────────────────────────────────────────

  const renderHeader = (title: string, back: () => void, actions?: React.ReactNode) => (
    <div className="bg-white border-b border-slate-100 px-4 pt-12 pb-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
      <div className="flex items-center gap-3">
        <button onClick={back} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600 hover:bg-slate-200 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">{title}</h2>
      </div>
      {actions}
    </div>
  );

  if (view === 'LIST') return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader('Schools', onBack,
        <button onClick={() => setView('CREATE')} className="p-2 bg-emerald-500 text-white rounded-full hover:bg-emerald-600 transition-colors shadow-md">
          <Plus size={18} />
        </button>
      )}
      <div className="flex-1 overflow-y-auto p-4 pb-28">
        <div className="relative mb-4">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search schools…"
            className="w-full bg-white border border-slate-200 rounded-2xl pl-11 pr-4 py-3 font-bold text-sm outline-none focus:border-blue-500 transition-colors shadow-sm" />
        </div>

        {/* Summary strip */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1 hide-scrollbar">
          {[
            { label: 'Total', val: schools.length, color: 'bg-slate-900 text-white' },
            { label: 'Active', val: schools.filter(s => s.status === SchoolStatus.ACTIVE).length, color: 'bg-emerald-50 text-emerald-700' },
            { label: 'Trial', val: schools.filter(s => s.status === SchoolStatus.TRIAL).length, color: 'bg-violet-50 text-violet-700' },
            { label: 'Overdue', val: schools.filter(s => s.paymentStatus === PaymentStatus.OVERDUE).length, color: 'bg-rose-50 text-rose-700' },
          ].map(({ label, val, color }) => (
            <div key={label} className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest ${color}`}>
              {val} {label}
            </div>
          ))}
        </div>

        <div className="space-y-3">
          {filtered.map(school => (
            <div key={school.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <button
                className="w-full p-4 text-left active:bg-slate-50 transition-colors"
                onClick={() => { setSelected(school); setActiveAYIdx(0); setView('DETAIL'); }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 text-blue-700 flex items-center justify-center font-black text-xs shrink-0">
                      {school.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                    </div>
                    <div>
                      <div className="font-extrabold text-slate-900 text-sm">{school.name}</div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <MapPin size={10} className="text-slate-400" />
                        <span className="text-[10px] font-bold text-slate-400">{school.location}</span>
                        <span className="text-slate-200 mx-1">·</span>
                        <span className="text-[10px] font-black text-slate-500">{school.code}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${STATUS_COLORS[school.status]}`}>
                      {school.status}
                    </span>
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${PLAN_COLORS[school.plan]}`}>
                      {school.plan}
                    </span>
                  </div>
                </div>
                <div className="flex gap-4 mt-3 pt-3 border-t border-slate-50">
                  <div className="flex items-center gap-1.5">
                    <Users size={12} className="text-blue-500" />
                    <span className="text-[10px] font-black text-slate-600">{school.studentCount.toLocaleString('en-IN')} students</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <UserCheck size={12} className="text-emerald-500" />
                    <span className="text-[10px] font-black text-slate-600">{school.teacherCount} teachers</span>
                  </div>
                  <div className={`ml-auto text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${PAYMENT_COLORS[school.paymentStatus]}`}>
                    {school.paymentStatus}
                  </div>
                </div>
              </button>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="flex flex-col items-center py-16 text-slate-400">
              <Building2 size={32} className="mb-3 opacity-40" />
              <p className="font-bold text-sm">No schools found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (view === 'CREATE') return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader('Add School', () => setView('LIST'))}
      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-4">
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm space-y-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">School Info</p>
          {[
            { label: 'School Name *', key: 'name', placeholder: 'e.g. Delhi Public School' },
            { label: 'School Code *', key: 'code', placeholder: 'e.g. DPS-01' },
            { label: 'City / Location *', key: 'location', placeholder: 'e.g. New Delhi' },
            { label: 'Full Address', key: 'address', placeholder: 'Street, Area, City, PIN' },
            { label: 'Phone', key: 'phone', placeholder: '+91 XXXXX XXXXX' },
          ].map(({ label, key, placeholder }) => (
            <div key={key}>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">{label}</label>
              <input value={(form as any)[key] ?? ''} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-blue-500 focus:bg-white transition-colors" />
            </div>
          ))}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Plan</label>
              <select value={form.plan} onChange={e => setForm(f => ({ ...f, plan: e.target.value as BillingPlan }))}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none focus:border-blue-500 focus:bg-white transition-colors">
                {Object.values(BillingPlan).map(p => <option key={p} value={p}>₹{PLAN_PRICES[p].toLocaleString('en-IN')} — {p}</option>)}
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

          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Payment Start Date *</label>
            <input type="date" value={form.paymentStartDate ?? ''} onChange={e => setForm(f => ({ ...f, paymentStartDate: e.target.value }))}
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-blue-500 focus:bg-white transition-colors" />
            <p className="text-[10px] font-bold text-slate-400 mt-1">12 months billing schedule will be auto-generated from this date (1st of each month)</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm space-y-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Principal Account</p>
          {[
            { label: 'Principal Name', key: 'principalName', placeholder: 'Dr. / Mr. / Ms.' },
            { label: 'Email *', key: 'principalEmail', placeholder: 'principal@school.edu.in' },
            { label: 'Phone', key: 'principalPhone', placeholder: '+91 XXXXX XXXXX' },
            { label: 'Login Password', key: 'password', placeholder: 'Min 8 characters', type: 'password' },
          ].map(({ label, key, placeholder, type }) => (
            <div key={key}>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">{label}</label>
              <input type={type ?? 'text'} value={(form as any)[key] ?? ''} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-blue-500 focus:bg-white transition-colors" />
            </div>
          ))}
        </div>

        <button onClick={handleCreate} disabled={isSubmitting}
          className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg disabled:opacity-60">
          {isSubmitting ? 'Creating…' : <><Plus size={16} /> Onboard School</>}
        </button>
      </div>
    </div>
  );

  if (view === 'DETAIL' && selected) {
    const ay = selected.academicYears[activeAYIdx];
    return (
      <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        {renderHeader(selected.name, () => setView('LIST'),
          <div className="flex gap-2">
            <button onClick={() => handleEdit(selected)} className="p-2 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 transition-colors">
              <Edit2 size={18} />
            </button>
            <button onClick={() => handleStatusToggle(selected)}
              className={`p-2 rounded-full transition-colors ${selected.status === SchoolStatus.ACTIVE ? 'bg-rose-50 text-rose-600 hover:bg-rose-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}>
              {selected.status === SchoolStatus.ACTIVE ? <XCircle size={18} /> : <CheckCircle2 size={18} />}
            </button>
            <button onClick={() => setConfirmDelete(selected)} className="p-2 bg-rose-50 text-rose-600 rounded-full hover:bg-rose-100 transition-colors">
              <Trash2 size={18} />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-4">
          {/* School identity card */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-200 text-blue-700 flex items-center justify-center font-black text-lg">
                {selected.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
              </div>
              <div>
                <h3 className="font-black text-slate-900 text-base">{selected.name}</h3>
                <div className="flex gap-2 mt-1">
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${STATUS_COLORS[selected.status]}`}>{selected.status}</span>
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${PLAN_COLORS[selected.plan]}`}>{selected.plan}</span>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              {[
                { icon: MapPin, label: selected.address },
                { icon: Phone, label: selected.phone },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-2">
                  <Icon size={13} className="text-slate-400 shrink-0" />
                  <span className="text-xs font-bold text-slate-600">{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Principal card */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Principal</p>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-black text-sm">
                {selected.principalName.split(' ').map(w => w[0]).join('').slice(0, 2)}
              </div>
              <div>
                <div className="font-extrabold text-slate-900 text-sm">{selected.principalName}</div>
                <div className="text-[10px] font-bold text-slate-400 mt-0.5">{selected.principalEmail}</div>
                <div className="text-[10px] font-bold text-slate-400">{selected.principalPhone}</div>
              </div>
            </div>
          </div>

          {/* Academic year selector */}
          <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
            {selected.academicYears.map((ay, i) => (
              <button key={ay.id} onClick={() => setActiveAYIdx(i)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors ${activeAYIdx === i ? 'bg-slate-900 text-white' : 'bg-white text-slate-500 border border-slate-200'}`}>
                {ay.label} {ay.isActive && '●'}
              </button>
            ))}
          </div>

          {/* AY stats */}
          {ay && (
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Students', val: ay.totalStudents.toLocaleString('en-IN'), color: 'text-blue-600' },
                { label: 'Revenue', val: `₹${(ay.totalRevenue / 100000).toFixed(1)}L`, color: 'text-emerald-600' },
                { label: 'Expense', val: `₹${(ay.totalExpense / 100000).toFixed(1)}L`, color: 'text-rose-500' },
              ].map(({ label, val, color }) => (
                <div key={label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 text-center">
                  <div className={`text-lg font-black ${color}`}>{val}</div>
                  <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-0.5">{label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Module drill-down buttons */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: BookOpen, label: 'Sections & Classes', view: 'SECTIONS' as View, color: 'text-indigo-600 bg-indigo-50', count: ay?.sections.length ?? 0 },
              { icon: Users, label: 'Student List', view: 'STUDENTS' as View, color: 'text-blue-600 bg-blue-50', count: ay?.totalStudents ?? 0 },
              { icon: UserCheck, label: 'Staff & Teachers', view: 'STAFF' as View, color: 'text-emerald-600 bg-emerald-50', count: selected.teacherCount },
              { icon: IndianRupee, label: 'Fee Summary', view: 'DETAIL' as View, color: 'text-amber-600 bg-amber-50', count: 0 },
            ].map(({ icon: Icon, label, view: v, color, count }) => (
              <button key={label} onClick={() => v !== 'DETAIL' && setView(v)}
                className="flex items-center gap-3 bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-left active:scale-95 transition-transform">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color}`}>
                  <Icon size={18} />
                </div>
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

  if (view === 'SECTIONS' && selected) {
    const ay = selected.academicYears[activeAYIdx];
    return (
      <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        {renderHeader('Sections', () => setView('DETAIL'))}
        <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-3">
          {ay?.sections.length === 0 && (
            <div className="flex flex-col items-center py-16 text-slate-400">
              <BookOpen size={32} className="mb-3 opacity-40" />
              <p className="font-bold text-sm">No sections in {ay.label}</p>
            </div>
          )}
          {ay?.sections.map(sec => (
            <button key={sec.id} onClick={() => { setSelectedSection(sec); setView('STUDENTS'); }}
              className="w-full flex items-center justify-between bg-white rounded-2xl border border-slate-100 shadow-sm p-4 active:scale-95 transition-transform text-left">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-black text-xs">
                  {sec.section}
                </div>
                <div>
                  <div className="font-extrabold text-slate-900 text-sm">{sec.className} – Section {sec.section}</div>
                  <div className="text-[10px] font-bold text-slate-400 mt-0.5">
                    {sec.studentCount} students · {sec.classTeacher}
                  </div>
                </div>
              </div>
              <ChevronRight size={18} className="text-slate-300" />
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (view === 'STUDENTS' && selected) {
    const sec = selectedSection;
    return (
      <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        {renderHeader(sec ? `${sec.className}-${sec.section} Students` : 'Students', () => setView(sec ? 'SECTIONS' : 'DETAIL'))}
        <div className="flex-1 overflow-y-auto p-4 pb-28">
          <div className="flex flex-col items-center py-16 text-slate-400">
            <Users size={32} className="mb-3 opacity-40" />
            <p className="font-bold text-sm">Student list coming soon</p>
            <p className="text-xs mt-1">Connect Supabase to load real data</p>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'STAFF' && selected) {
    return (
      <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        {renderHeader('Staff & Teachers', () => setView('DETAIL'))}
        <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-3">
          {STAFF_MOCK.map(s => (
            <div key={s.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${s.role === 'Teacher' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>
                {s.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
              </div>
              <div className="flex-1">
                <div className="font-extrabold text-slate-900 text-sm">{s.name}</div>
                <div className="text-[10px] font-bold text-slate-400 mt-0.5">{s.role} · {s.subject}</div>
                <div className="text-[10px] font-bold text-slate-400">{s.phone}</div>
              </div>
              <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${s.status === 'ACTIVE' ? 'text-emerald-700 bg-emerald-50' : 'text-amber-700 bg-amber-50'}`}>
                {s.status === 'ON_LEAVE' ? 'On Leave' : s.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (view === 'EDIT' && selected) {
    return (
      <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        {renderHeader(`Edit: ${selected.name}`, () => setView('DETAIL'))}
        <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-4">
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm space-y-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">School Info</p>

            {/* School Code — LOCKED in edit mode (this is the unique identity) */}
            <div>
              <label className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                School Code
                <span className="text-[9px] font-black text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">🔒 LOCKED</span>
              </label>
              <input value={form.code ?? ''} readOnly disabled
                className="w-full border border-slate-200 bg-slate-100 rounded-xl px-4 py-3 font-black text-sm text-slate-500 cursor-not-allowed" />
              <p className="text-[10px] font-bold text-slate-400 mt-1">School code is the unique identity — cannot be changed after creation</p>
            </div>

            {[
              { label: 'School Name *', key: 'name', placeholder: 'e.g. Delhi Public School' },
              { label: 'City / Location *', key: 'location', placeholder: 'e.g. New Delhi' },
              { label: 'Full Address', key: 'address', placeholder: 'Street, Area, City, PIN' },
              { label: 'Phone', key: 'phone', placeholder: '+91 XXXXX XXXXX' },
            ].map(({ label, key, placeholder }) => (
              <div key={key}>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">{label}</label>
                <input value={(form as any)[key] ?? ''} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-blue-500 focus:bg-white transition-colors" />
              </div>
            ))}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Plan</label>
                <select value={form.plan} onChange={e => setForm(f => ({ ...f, plan: e.target.value as BillingPlan }))}
                  className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none focus:border-blue-500 focus:bg-white transition-colors">
                  {Object.values(BillingPlan).map(p => <option key={p} value={p}>₹{PLAN_PRICES[p].toLocaleString('en-IN')} — {p}</option>)}
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
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Principal Account</p>
            {[
              { label: 'Principal Name', key: 'principalName', placeholder: 'Dr. / Mr. / Ms.' },
              { label: 'Email *', key: 'principalEmail', placeholder: 'principal@school.edu.in' },
              { label: 'Phone', key: 'principalPhone', placeholder: '+91 XXXXX XXXXX' },
            ].map(({ label, key, placeholder }) => (
              <div key={key}>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">{label}</label>
                <input value={(form as any)[key] ?? ''} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-blue-500 focus:bg-white transition-colors" />
              </div>
            ))}
          </div>

          <button onClick={handleUpdate} disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg disabled:opacity-60">
            {isSubmitting ? 'Updating…' : <><Save size={16} /> Update School</>}
          </button>
        </div>
      </div>
    );
  }

  // Principal credentials hand-off after creation
  if (createdCredentials) {
    return (
      <div className="absolute inset-0 z-60 bg-slate-900/60 flex items-end justify-center animate-in fade-in">
        <div className="bg-white w-full rounded-t-3xl p-6 pb-8 animate-in slide-in-from-bottom-4">
          <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mb-4">
            <CheckCircle2 size={22} />
          </div>
          <h3 className="font-black text-slate-900 text-lg mb-1">School Onboarded</h3>
          <p className="text-sm text-slate-500 mb-5">
            "<span className="font-black text-slate-800">{createdCredentials.schoolName}</span>" is live. Share these login credentials with the principal.
          </p>

          <div className="space-y-3 mb-5">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Login Mobile</label>
              <div className="flex gap-2">
                <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-black text-slate-900 text-sm">
                  {createdCredentials.mobile}
                </div>
                <button
                  onClick={() => { navigator.clipboard.writeText(createdCredentials.mobile); showToast('Mobile copied!'); }}
                  className="px-4 py-3 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors">
                  <Copy size={16} className="text-slate-600" />
                </button>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Temporary Password</label>
              <div className="flex gap-2">
                <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-black text-slate-900 text-sm">
                  {createdCredentials.password}
                </div>
                <button
                  onClick={() => { navigator.clipboard.writeText(createdCredentials.password); showToast('Password copied!'); }}
                  className="px-4 py-3 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors">
                  <Copy size={16} className="text-slate-600" />
                </button>
              </div>
              <p className="text-[10px] font-bold text-slate-400 mt-2">Principal will be asked to change this on first login.</p>
            </div>
          </div>

          <button
            onClick={() => setCreatedCredentials(null)}
            className="w-full py-3 bg-emerald-600 text-white font-black rounded-xl active:scale-95 transition-transform">
            Done
          </button>
        </div>
      </div>
    );
  }

  // Cascade deactivate warning
  if (confirmDeactivate) {
    return (
      <div className="absolute inset-0 z-60 bg-slate-900/60 flex items-end justify-center animate-in fade-in">
        <div className="bg-white w-full rounded-t-3xl p-6 pb-10 animate-in slide-in-from-bottom-4">
          <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mb-4">
            <XCircle size={22} />
          </div>
          <h3 className="font-black text-slate-900 text-lg mb-1">Deactivate School?</h3>
          <p className="text-sm text-slate-500 mb-2">
            Deactivating <span className="font-black text-slate-800">"{confirmDeactivate.name}"</span> will suspend access for:
          </p>
          <div className="bg-rose-50 rounded-2xl p-3 mb-5 space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-bold text-rose-700">
              <Users size={14} /> {confirmDeactivate.studentCount.toLocaleString('en-IN')} students
            </div>
            <div className="flex items-center gap-2 text-sm font-bold text-rose-700">
              <UserCheck size={14} /> {confirmDeactivate.teacherCount} teachers &amp; staff
            </div>
          </div>
          <p className="text-xs font-bold text-slate-400 mb-5">All data is retained. Re-activate anytime.</p>
          <div className="flex gap-3">
            <button onClick={() => setConfirmDeactivate(null)} className="flex-1 py-3 rounded-2xl border border-slate-200 font-black text-slate-600 active:scale-95 transition-transform">
              Cancel
            </button>
            <button onClick={() => doStatusChange(confirmDeactivate, SchoolStatus.INACTIVE)} className="flex-1 py-3 rounded-2xl bg-rose-600 text-white font-black active:scale-95 transition-transform">
              Deactivate
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Confirmation dialog
  if (confirmDelete) {
    return (
      <div className="absolute inset-0 z-60 bg-slate-900/60 flex items-end justify-center animate-in fade-in">
        <div className="bg-white w-full rounded-t-3xl p-6 pb-10 animate-in slide-in-from-bottom-4">
          <h3 className="font-black text-slate-900 text-lg mb-2">Delete School?</h3>
          <p className="text-sm text-slate-500 mb-6">"{confirmDelete.name}" and all related data will be permanently removed.</p>
          <div className="flex gap-3">
            <button onClick={() => setConfirmDelete(null)} className="flex-1 py-3 rounded-2xl border border-slate-200 font-black text-slate-600 active:scale-95 transition-transform">
              Cancel
            </button>
            <button onClick={() => handleDelete(confirmDelete)} className="flex-1 py-3 rounded-2xl bg-rose-600 text-white font-black active:scale-95 transition-transform">
              Delete
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};
