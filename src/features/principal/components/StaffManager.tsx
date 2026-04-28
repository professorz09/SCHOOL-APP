import React, { useEffect, useState } from 'react';
import { ArrowLeft, Plus, Search, UserCheck, Phone, Mail, IndianRupee, Calendar, CheckCircle2, X, Save, History, Edit3 } from 'lucide-react';
import { staffService } from '../../../services/staff.service';
import { StaffMember, StaffRole, StaffStatus } from '../../../types/principal.types';
import { useUIStore } from '../../../store/uiStore';

type View = 'LIST' | 'CREATE' | 'PROFILE' | 'EDIT';

interface Props { onBack: () => void; }

const ROLE_OPTIONS: StaffRole[] = ['TEACHER', 'VICE_PRINCIPAL', 'ACCOUNTANT', 'LIBRARIAN', 'LAB_INCHARGE', 'DRIVER', 'PEON', 'SECURITY'];

const roleColor = (role: StaffRole) => {
  const map: Record<StaffRole, string> = {
    TEACHER: 'bg-blue-50 text-blue-700', VICE_PRINCIPAL: 'bg-violet-50 text-violet-700',
    ACCOUNTANT: 'bg-emerald-50 text-emerald-700', LIBRARIAN: 'bg-amber-50 text-amber-700',
    LAB_INCHARGE: 'bg-cyan-50 text-cyan-700', DRIVER: 'bg-orange-50 text-orange-700',
    PEON: 'bg-slate-100 text-slate-600', SECURITY: 'bg-rose-50 text-rose-700',
  };
  return map[role];
};

const statusColor = (s: StaffStatus) =>
  s === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' :
  s === 'ON_LEAVE' ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700';

const BLANK: Omit<StaffMember, 'id'> = {
  name: '', role: 'TEACHER', subject: '', phone: '', email: '', aadhaarNo: '',
  salary: 0, joiningDate: new Date().toISOString().split('T')[0], status: 'ACTIVE',
  assignedClasses: [], address: '', photo: '',
};

export const StaffManager: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();
  const [view, setView] = useState<View>('LIST');
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [selected, setSelected] = useState<StaffMember | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<StaffRole | 'ALL'>('ALL');
  const [form, setForm] = useState<Omit<StaffMember, 'id'>>(BLANK);
  const [editForm, setEditForm] = useState<Omit<StaffMember, 'id'>>(BLANK);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmSuspend, setConfirmSuspend] = useState<StaffMember | null>(null);

  useEffect(() => { staffService.getAll().then(setStaff); }, []);

  const filtered = staff.filter(s => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase()) || s.subject.toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === 'ALL' || s.role === roleFilter;
    return matchSearch && matchRole;
  });

  const handleCreate = async () => {
    if (!form.name) { showToast('Staff name required', 'error'); return; }
    setIsSubmitting(true);
    try {
      const member = await staffService.create(form);
      setStaff(prev => [...prev, member]);
      showToast(`${member.name} added to staff`);
      setForm(BLANK);
      setView('LIST');
    } finally { setIsSubmitting(false); }
  };

  const handleUpdate = async () => {
    if (!selected || !editForm.name) { showToast('Name required', 'error'); return; }
    setIsSubmitting(true);
    try {
      const updated = await staffService.update(selected.id, editForm);
      setStaff(prev => prev.map(s => s.id === updated.id ? updated : s));
      setSelected(updated);
      showToast(`${updated.name} updated`);
      setView('PROFILE');
    } finally { setIsSubmitting(false); }
  };

  const handleSuspend = async (member: StaffMember) => {
    const updated = member.status === 'SUSPENDED'
      ? await staffService.reinstate(member.id)
      : await staffService.suspend(member.id);
    setStaff(prev => prev.map(s => s.id === updated.id ? updated : s));
    if (selected?.id === updated.id) setSelected(updated);
    showToast(updated.status === 'SUSPENDED' ? `${updated.name} suspended` : `${updated.name} reinstated`);
    setConfirmSuspend(null);
  };

  const renderHeader = (title: string, back: () => void, action?: React.ReactNode) => (
    <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
      <div className="flex items-center gap-3">
        <button onClick={back} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600"><ArrowLeft size={20} /></button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">{title}</h2>
      </div>
      {action}
    </div>
  );

  if (view === 'LIST') return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader('Staff', onBack,
        <button onClick={() => setView('CREATE')} className="w-9 h-9 bg-blue-600 text-white rounded-full shadow-md flex items-center justify-center active:scale-90 transition-transform"><Plus size={18} /></button>
      )}
      <div className="flex-1 overflow-y-auto ">

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-2 px-4 pt-3 pb-1">
          {[
            { label: 'Total',     val: staff.length,                                          num: 'text-slate-900', bg: 'bg-white border border-slate-100' },
            { label: 'Active',    val: staff.filter(s => s.status === 'ACTIVE').length,       num: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'On Leave',  val: staff.filter(s => s.status === 'ON_LEAVE').length,     num: 'text-amber-600',  bg: 'bg-amber-50' },
            { label: 'Suspended', val: staff.filter(s => s.status === 'SUSPENDED').length,    num: 'text-rose-600',   bg: 'bg-rose-50' },
          ].map(({ label, val, num, bg }) => (
            <div key={label} className={`rounded-2xl px-2 py-3 text-center shadow-sm ${bg}`}>
              <div className={`text-xl font-black leading-none ${num}`}>{val}</div>
              <div className="text-[9px] font-black text-slate-400 uppercase tracking-wide mt-1">{label}</div>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="relative px-4 pt-2">
          <Search size={15} className="absolute left-8 top-1/2 -translate-y-1/2 text-slate-400 mt-1" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or subject…"
            className="w-full bg-white border border-slate-200 rounded-2xl pl-10 pr-4 py-2.5 font-bold text-sm outline-none shadow-sm focus:border-blue-400 transition-colors" />
        </div>

        {/* Role filter chips */}
        <div className="flex gap-2 overflow-x-auto px-4 py-2.5 pb-1 hide-scrollbar">
          {(['ALL', ...ROLE_OPTIONS] as const).map(r => (
            <button key={r} onClick={() => setRoleFilter(r as any)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wide transition-all ${
                roleFilter === r
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white text-slate-500 border border-slate-200'
              }`}>
              {String(r).replace(/_/g, ' ')}
            </button>
          ))}
        </div>

        {/* Staff list */}
        <div className="space-y-2 px-4 pt-1">
          {filtered.map(member => (
            <button key={member.id} onClick={() => { setSelected(member); setView('PROFILE'); }}
              className="w-full bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3.5 text-left active:scale-[0.98] transition-transform">
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black text-sm shrink-0 ${roleColor(member.role)}`}>
                  {member.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-extrabold text-slate-900 text-sm truncate">{member.name}</div>
                  <div className="text-[11px] font-bold text-slate-400 mt-0.5">
                    {member.role.replace(/_/g, ' ')}{member.subject && member.subject !== '—' ? ` · ${member.subject}` : ''}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wide ${statusColor(member.status)}`}>
                    {member.status.replace('_', ' ')}
                  </span>
                  <span className="text-xs font-black text-slate-600">₹{(member.salary / 1000).toFixed(0)}K</span>
                </div>
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="flex flex-col items-center py-16 text-slate-400">
              <UserCheck size={32} className="mb-3 opacity-40" />
              <p className="font-bold text-sm">No staff found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (view === 'CREATE') return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader('Add Staff', () => setView('LIST'))}
      <div className="flex-1 overflow-y-auto p-4  space-y-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
          {[
            { label: 'Full Name *', key: 'name', placeholder: 'Staff full name' },
            { label: 'Subject', key: 'subject', placeholder: 'e.g. Mathematics' },
            { label: 'Phone', key: 'phone', placeholder: '+91 XXXXX XXXXX' },
            { label: 'Email', key: 'email', placeholder: 'staff@school.edu.in' },
            { label: 'Aadhaar No.', key: 'aadhaarNo', placeholder: 'XXXX XXXX XXXX' },
            { label: 'Address', key: 'address', placeholder: 'Residential address' },
          ].map(({ label, key, placeholder }) => (
            <div key={key}>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">{label}</label>
              <input value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-blue-500 focus:bg-white transition-colors" />
            </div>
          ))}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Role</label>
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as StaffRole }))}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none">
                {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Monthly Salary (₹)</label>
              <input type="number" value={form.salary} onChange={e => setForm(f => ({ ...f, salary: +e.target.value }))}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Joining Date</label>
            <input type="date" value={form.joiningDate} onChange={e => setForm(f => ({ ...f, joiningDate: e.target.value }))}
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none focus:border-blue-500" />
          </div>
        </div>
        <button onClick={handleCreate} disabled={isSubmitting}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg disabled:opacity-60">
          {isSubmitting ? 'Adding…' : <><Plus size={16} /> Add Staff Member</>}
        </button>
      </div>
    </div>
  );

  if (view === 'EDIT' && selected) return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader('Edit Staff', () => setView('PROFILE'))}
      <div className="flex-1 overflow-y-auto p-4  space-y-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
          {[
            { label: 'Full Name *', key: 'name', placeholder: 'Staff full name' },
            { label: 'Subject', key: 'subject', placeholder: 'e.g. Mathematics' },
            { label: 'Phone', key: 'phone', placeholder: '+91 XXXXX XXXXX' },
            { label: 'Email', key: 'email', placeholder: 'staff@school.edu.in' },
            { label: 'Aadhaar No.', key: 'aadhaarNo', placeholder: 'XXXX XXXX XXXX' },
            { label: 'Address', key: 'address', placeholder: 'Residential address' },
          ].map(({ label, key, placeholder }) => (
            <div key={key}>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">{label}</label>
              <input value={(editForm as any)[key] ?? ''} onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-blue-500 focus:bg-white transition-colors" />
            </div>
          ))}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Role</label>
              <select value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value as StaffRole }))}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none">
                {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Monthly Salary (₹)</label>
              <input type="number" value={editForm.salary} onChange={e => setEditForm(f => ({ ...f, salary: +e.target.value }))}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Joining Date</label>
            <input type="date" value={editForm.joiningDate} onChange={e => setEditForm(f => ({ ...f, joiningDate: e.target.value }))}
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Status</label>
            <select value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value as StaffStatus }))}
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none">
              {(['ACTIVE', 'ON_LEAVE', 'SUSPENDED'] as StaffStatus[]).map(s => (
                <option key={s} value={s}>{s.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
        </div>
        <button onClick={handleUpdate} disabled={isSubmitting}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg disabled:opacity-60">
          {isSubmitting ? 'Saving…' : <><Save size={16} /> Save Changes</>}
        </button>
      </div>
    </div>
  );

  if (view === 'PROFILE' && selected) return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader(selected.name, () => setView('LIST'),
        <button onClick={() => { setEditForm({ ...selected }); setView('EDIT'); }}
          className="p-2 bg-slate-100 rounded-full text-slate-600">
          <Edit3 size={18} />
        </button>
      )}
      <div className="flex-1 overflow-y-auto p-4  space-y-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <div className="flex items-center gap-4 mb-4">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center font-black text-2xl ${roleColor(selected.role)}`}>
              {selected.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-base">{selected.name}</h3>
              <div className="flex gap-2 mt-1">
                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${roleColor(selected.role)}`}>{selected.role.replace('_', ' ')}</span>
                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${statusColor(selected.status)}`}>{selected.status.replace('_', ' ')}</span>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            {[
              { icon: Phone, val: selected.phone || '—' },
              { icon: Mail, val: selected.email || '—' },
            ].map(({ icon: Icon, val }) => (
              <div key={val} className="flex items-center gap-2">
                <Icon size={13} className="text-slate-400 shrink-0" />
                <span className="text-xs font-bold text-slate-600">{val}</span>
              </div>
            ))}
            {selected.address && (
              <div className="text-xs font-bold text-slate-400 pt-1">{selected.address}</div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Salary', val: `₹${(selected.salary / 1000).toFixed(0)}K/mo`, color: 'text-emerald-600' },
            { label: 'Joined', val: selected.joiningDate.slice(0, 7), color: 'text-slate-700' },
            { label: 'Classes', val: selected.assignedClasses.length > 0 ? selected.assignedClasses.length : '—', color: 'text-blue-600' },
          ].map(({ label, val, color }) => (
            <div key={label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 text-center">
              <div className={`text-base font-black ${color}`}>{val}</div>
              <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-0.5">{label}</div>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          {selected.role === 'TEACHER' && selected.assignedClasses.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Assigned Classes</p>
              <div className="flex flex-wrap gap-2">
                {selected.assignedClasses.map(cls => (
                  <span key={cls} className="text-xs font-black bg-blue-50 text-blue-700 px-3 py-1 rounded-xl">{cls}</span>
                ))}
              </div>
            </div>
          )}

          {/* Salary History */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Salary History</p>
            {(selected.salaryHistory?.length ?? 0) === 0 ? (
              <div className="flex flex-col items-center py-6 text-slate-400">
                <History size={24} className="mb-2 opacity-40" />
                <p className="font-bold text-xs">No salary payments yet</p>
                <p className="text-[10px] font-bold text-slate-400 mt-1">Use Salary Ledger to pay salary</p>
              </div>
            ) : (
              <div className="space-y-2">
                {selected.salaryHistory?.map(pay => (
                  <div key={pay.id} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
                    <div>
                      <div className="font-bold text-slate-800 text-xs">{pay.month}</div>
                      <div className="text-[9px] font-bold text-slate-400 mt-0.5">{pay.paidAt} · {pay.transactionId}</div>
                    </div>
                    <div className="font-black text-emerald-600 text-sm">₹{pay.amount.toLocaleString('en-IN')}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button onClick={() => setConfirmSuspend(selected)}
            className={`w-full py-3 rounded-2xl font-black text-sm active:scale-95 transition-transform ${selected.status === 'SUSPENDED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
            {selected.status === 'SUSPENDED' ? '✓ Reinstate Staff Member' : '⚠ Suspend Staff Member'}
          </button>
        </div>
      </div>
    </div>
  );

  if (confirmSuspend) return (
    <div className="absolute inset-0 z-60 bg-slate-900/60 flex items-end justify-center animate-in fade-in">
      <div className="bg-white w-full rounded-t-3xl p-6 pb-10 animate-in slide-in-from-bottom-4">
        <h3 className="font-black text-slate-900 text-lg mb-2">
          {confirmSuspend.status === 'SUSPENDED' ? 'Reinstate' : 'Suspend'} {confirmSuspend.name}?
        </h3>
        <p className="text-sm text-slate-500 mb-6">
          {confirmSuspend.status === 'SUSPENDED'
            ? 'This will restore their access and active status.'
            : 'This will revoke access. Salary payments will be put on hold.'}
        </p>
        <div className="flex gap-3">
          <button onClick={() => setConfirmSuspend(null)} className="flex-1 py-3 rounded-2xl border border-slate-200 font-black text-slate-600">Cancel</button>
          <button onClick={() => handleSuspend(confirmSuspend)} className={`flex-1 py-3 rounded-2xl text-white font-black ${confirmSuspend.status === 'SUSPENDED' ? 'bg-emerald-600' : 'bg-rose-600'}`}>
            {confirmSuspend.status === 'SUSPENDED' ? 'Reinstate' : 'Suspend'}
          </button>
        </div>
      </div>
    </div>
  );

  return null;
};
