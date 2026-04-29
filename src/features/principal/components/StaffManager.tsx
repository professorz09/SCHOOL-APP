import React, { useEffect, useState, useCallback } from 'react';
import {
  ArrowLeft, Plus, Search, UserCheck, Phone, Mail, X, Save, Edit3,
  IndianRupee, FileText, Calendar, History, Upload, Eye, Trash2,
  Loader2, BadgeAlert, BookOpen, AlertTriangle,
} from 'lucide-react';
import { staffService } from '../../../services/staff.service';
import {
  StaffMember, StaffRole, StaffStatus, SalaryPaymentMethod,
  StaffSalaryHistoryEntry, StaffStatusHistoryEntry, StaffDocument, SalaryPayment,
} from '../../../types/principal.types';
import { useUIStore } from '../../../store/uiStore';

type View = 'LIST' | 'CREATE' | 'PROFILE' | 'EDIT';
type Tab = 'INFO' | 'SALARY' | 'ATTENDANCE' | 'CLASSES' | 'DOCS' | 'LOG';

interface Props { onBack: () => void; }

const ROLE_OPTIONS: StaffRole[] = ['TEACHER', 'VICE_PRINCIPAL', 'ACCOUNTANT', 'LIBRARIAN', 'LAB_INCHARGE', 'DRIVER', 'PEON', 'SECURITY'];

const PAY_METHODS: SalaryPaymentMethod[] = ['CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE', 'OTHER'];

const DOC_TYPES = ['PAN', 'AADHAAR', 'RESUME', 'OFFER_LETTER', 'EXPERIENCE_LETTER', 'PHOTO', 'OTHER'] as const;

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
  s === 'ON_LEAVE' ? 'bg-amber-50 text-amber-700' :
  s === 'RELIEVED' ? 'bg-slate-200 text-slate-700' :
  'bg-rose-50 text-rose-700';

const todayIso = () => new Date().toISOString().split('T')[0];

const monthLabel = (d: Date) =>
  d.toLocaleString('en-IN', { month: 'long', year: 'numeric' });

const BLANK: Omit<StaffMember, 'id'> = {
  name: '', role: 'TEACHER', subject: '', phone: '', email: '', aadhaarNo: '',
  salary: 0, joiningDate: todayIso(), status: 'ACTIVE',
  assignedClasses: [], address: '', photo: '',
};

const fmtIN = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

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

  // Profile / tabs
  const [tab, setTab] = useState<Tab>('INFO');
  const [salaryHistory, setSalaryHistory] = useState<StaffSalaryHistoryEntry[]>([]);
  const [paymentHistory, setPaymentHistory] = useState<SalaryPayment[]>([]);
  const [statusHistory, setStatusHistory] = useState<StaffStatusHistoryEntry[]>([]);
  const [docs, setDocs] = useState<StaffDocument[]>([]);
  const [tabLoading, setTabLoading] = useState(false);

  // Modals
  const [editSalaryOpen, setEditSalaryOpen] = useState(false);
  const [editSalaryAmt, setEditSalaryAmt] = useState('');
  const [editSalaryFrom, setEditSalaryFrom] = useState(todayIso());
  const [editSalaryReason, setEditSalaryReason] = useState('');
  const [editSalaryBusy, setEditSalaryBusy] = useState(false);

  const [payOpen, setPayOpen] = useState(false);
  const [payMonth, setPayMonth] = useState(monthLabel(new Date()));
  const [payAmt, setPayAmt] = useState('');
  const [payMethod, setPayMethod] = useState<SalaryPaymentMethod>('BANK_TRANSFER');
  const [payTxn, setPayTxn] = useState('');
  const [payNote, setPayNote] = useState('');
  const [payBusy, setPayBusy] = useState(false);

  const [relieveOpen, setRelieveOpen] = useState(false);
  const [relieveDate, setRelieveDate] = useState(todayIso());
  const [relieveReason, setRelieveReason] = useState('');
  const [relieveBusy, setRelieveBusy] = useState(false);

  const [docType, setDocType] = useState<string>('PAN');
  const [docBusy, setDocBusy] = useState(false);

  useEffect(() => { staffService.getAll().then(setStaff); }, []);

  const loadProfileTabs = useCallback(async (staffId: string) => {
    setTabLoading(true);
    try {
      const [history, payments, statuses, documents] = await Promise.all([
        staffService.getSalaryHistory(staffId),
        staffService.getPaymentHistory(staffId),
        staffService.getStatusHistory(staffId),
        staffService.getDocuments(staffId),
      ]);
      setSalaryHistory(history);
      setPaymentHistory(payments);
      setStatusHistory(statuses);
      setDocs(documents);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to load profile data', 'error');
    } finally {
      setTabLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (view === 'PROFILE' && selected) {
      loadProfileTabs(selected.id);
    }
  }, [view, selected, loadProfileTabs]);

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
      // Seed initial salary-history row if a salary was entered.
      if (form.salary > 0) {
        try {
          await staffService.updateSalary(
            member.id, form.salary, form.joiningDate || todayIso(), 'Initial',
          );
        } catch (e) {
          // Non-fatal: staff is created, history row missing is recoverable later
          // via the Salary tab's Edit button.
          // eslint-disable-next-line no-console
          console.warn('[staff] initial salary history seed failed:', e);
        }
      }
      setStaff(prev => [...prev, member]);
      showToast(`${member.name} added to staff`);
      setForm(BLANK);
      setView('LIST');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to create staff', 'error');
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
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Update failed', 'error');
    } finally { setIsSubmitting(false); }
  };

  const handleSuspend = async (member: StaffMember) => {
    try {
      const updated = member.status === 'SUSPENDED'
        ? await staffService.reinstate(member.id)
        : await staffService.suspend(member.id);
      setStaff(prev => prev.map(s => s.id === updated.id ? updated : s));
      if (selected?.id === updated.id) setSelected(updated);
      showToast(updated.status === 'SUSPENDED' ? `${updated.name} suspended` : `${updated.name} reinstated`);
      setConfirmSuspend(null);
      if (view === 'PROFILE' && selected) await loadProfileTabs(selected.id);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Action failed', 'error');
    }
  };

  const handleEditSalary = async () => {
    if (!selected) return;
    const amt = Number(editSalaryAmt);
    if (!Number.isFinite(amt) || amt < 0) { showToast('Enter a valid amount', 'error'); return; }
    setEditSalaryBusy(true);
    try {
      await staffService.updateSalary(selected.id, amt, editSalaryFrom, editSalaryReason || 'Revision');
      const fresh = await staffService.getById(selected.id);
      if (fresh) {
        setSelected(fresh);
        setStaff(prev => prev.map(s => s.id === fresh.id ? fresh : s));
      }
      await loadProfileTabs(selected.id);
      showToast(`Salary updated to ${fmtIN(amt)}`);
      setEditSalaryOpen(false);
      setEditSalaryAmt(''); setEditSalaryReason('');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to update salary', 'error');
    } finally {
      setEditSalaryBusy(false);
    }
  };

  const handlePay = async () => {
    if (!selected) return;
    const amt = Number(payAmt);
    if (!Number.isFinite(amt) || amt <= 0) { showToast('Enter a valid amount', 'error'); return; }
    setPayBusy(true);
    try {
      await staffService.recordSalaryPayment(
        selected.id, payMonth, amt, payNote, payMethod, payTxn || null,
      );
      await loadProfileTabs(selected.id);
      showToast(`${fmtIN(amt)} recorded for ${payMonth}`);
      setPayOpen(false);
      setPayAmt(''); setPayTxn(''); setPayNote('');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Payment failed', 'error');
    } finally {
      setPayBusy(false);
    }
  };

  const handleRelieve = async () => {
    if (!selected) return;
    if (!relieveDate) { showToast('Date required', 'error'); return; }
    setRelieveBusy(true);
    try {
      await staffService.setRelievingDate(selected.id, relieveDate, relieveReason);
      const fresh = await staffService.getById(selected.id);
      if (fresh) {
        setSelected(fresh);
        setStaff(prev => prev.map(s => s.id === fresh.id ? fresh : s));
      }
      await loadProfileTabs(selected.id);
      showToast(`${selected.name} relieved on ${fmtDate(relieveDate)}`);
      setRelieveOpen(false);
      setRelieveReason('');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to set relieving date', 'error');
    } finally {
      setRelieveBusy(false);
    }
  };

  const handleUpload = async (file: File) => {
    if (!selected) return;
    setDocBusy(true);
    try {
      const doc = await staffService.uploadDocument(selected.id, docType, file);
      setDocs(prev => [doc, ...prev]);
      showToast(`${file.name} uploaded`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Upload failed', 'error');
    } finally {
      setDocBusy(false);
    }
  };

  const handleViewDoc = async (path: string) => {
    const url = await staffService.getDocumentSignedUrl(path);
    if (!url) { showToast('Could not open document', 'error'); return; }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleDeleteDoc = async (id: string) => {
    if (!selected) return;
    try {
      await staffService.removeDocument(id);
      setDocs(prev => prev.filter(d => d.id !== id));
      showToast('Document deleted');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Delete failed', 'error');
    }
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

  // ─── LIST view ─────────────────────────────────────────────────────────────
  if (view === 'LIST') return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader('Staff', onBack,
        <button onClick={() => setView('CREATE')} className="w-9 h-9 bg-blue-600 text-white rounded-full shadow-md flex items-center justify-center active:scale-90 transition-transform"><Plus size={18} /></button>
      )}
      <div className="flex-1 overflow-y-auto ">

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

        <div className="relative px-4 pt-2">
          <Search size={15} className="absolute left-8 top-1/2 -translate-y-1/2 text-slate-400 mt-1" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or subject…"
            className="w-full bg-white border border-slate-200 rounded-2xl pl-10 pr-4 py-2.5 font-bold text-sm outline-none shadow-sm focus:border-blue-400 transition-colors" />
        </div>

        <div className="flex gap-2 overflow-x-auto px-4 py-2.5 pb-1 hide-scrollbar">
          {(['ALL', ...ROLE_OPTIONS] as const).map(r => (
            <button key={r} onClick={() => setRoleFilter(r as StaffRole | 'ALL')}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wide transition-all ${
                roleFilter === r ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-slate-500 border border-slate-200'
              }`}>
              {String(r).replace(/_/g, ' ')}
            </button>
          ))}
        </div>

        <div className="space-y-2 px-4 pt-1">
          {filtered.map(member => (
            <button key={member.id} onClick={() => { setSelected(member); setTab('INFO'); setView('PROFILE'); }}
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

  // ─── CREATE view ───────────────────────────────────────────────────────────
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
              <input value={(form as unknown as Record<string, string>)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
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
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Monthly Salary (₹) *</label>
              <input type="number" value={form.salary} onChange={e => setForm(f => ({ ...f, salary: +e.target.value }))}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Joining Date</label>
            <input type="date" value={form.joiningDate} onChange={e => setForm(f => ({ ...f, joiningDate: e.target.value }))}
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none focus:border-blue-500" />
          </div>
          <p className="text-[10px] font-bold text-slate-400 leading-relaxed">
            The salary you enter is recorded as the &quot;Initial&quot; entry in this staff member&apos;s salary history. You can revise it any time from the Salary tab.
          </p>
        </div>
        <button onClick={handleCreate} disabled={isSubmitting}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg disabled:opacity-60">
          {isSubmitting ? 'Adding…' : <><Plus size={16} /> Add Staff Member</>}
        </button>
      </div>
    </div>
  );

  // ─── EDIT view ─────────────────────────────────────────────────────────────
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
              <input value={(editForm as unknown as Record<string, string>)[key] ?? ''} onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
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
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Joining Date</label>
              <input type="date" value={editForm.joiningDate} onChange={e => setEditForm(f => ({ ...f, joiningDate: e.target.value }))}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none focus:border-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Status</label>
            <select value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value as StaffStatus }))}
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none">
              {(['ACTIVE', 'ON_LEAVE', 'SUSPENDED'] as StaffStatus[]).map(s => (
                <option key={s} value={s}>{s.replace('_', ' ')}</option>
              ))}
            </select>
            <p className="text-[10px] font-bold text-slate-400 mt-1.5">
              Use the &quot;Set Relieving Date&quot; button on the Info tab to mark a staff member as RELIEVED — that flow records the date and reason.
            </p>
          </div>
          <p className="text-[10px] font-bold text-slate-400">
            Salary is managed from the Salary tab so every change is recorded with an effective-from date and reason. Use the &quot;Edit Salary&quot; button there.
          </p>
        </div>
        <button onClick={handleUpdate} disabled={isSubmitting}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg disabled:opacity-60">
          {isSubmitting ? 'Saving…' : <><Save size={16} /> Save Changes</>}
        </button>
      </div>
    </div>
  );

  // ─── PROFILE view (6 tabs) ─────────────────────────────────────────────────
  if (view === 'PROFILE' && selected) {
    const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
      { id: 'INFO',       label: 'Info',       icon: <UserCheck size={14} /> },
      { id: 'SALARY',     label: 'Salary',     icon: <IndianRupee size={14} /> },
      { id: 'ATTENDANCE', label: 'Attendance', icon: <Calendar size={14} /> },
      { id: 'CLASSES',    label: 'Classes',    icon: <BookOpen size={14} /> },
      { id: 'DOCS',       label: 'Docs',       icon: <FileText size={14} /> },
      { id: 'LOG',        label: 'Log',        icon: <History size={14} /> },
    ];

    return (
      <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        {renderHeader(selected.name, () => setView('LIST'),
          <button onClick={() => { setEditForm({ ...selected }); setView('EDIT'); }}
            className="p-2 bg-slate-100 rounded-full text-slate-600">
            <Edit3 size={18} />
          </button>
        )}

        {/* Identity card */}
        <div className="bg-white border-b border-slate-100 px-4 pt-3 pb-3">
          <div className="flex items-center gap-3">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl shrink-0 ${roleColor(selected.role)}`}>
              {selected.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-black text-slate-900">{selected.name}</div>
              <div className="flex flex-wrap gap-1.5 mt-1">
                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${roleColor(selected.role)}`}>{selected.role.replace('_', ' ')}</span>
                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${statusColor(selected.status)}`}>{selected.status.replace('_', ' ')}</span>
                {selected.relievingDate && (
                  <span className="text-[9px] font-black px-2 py-0.5 rounded-full uppercase bg-slate-200 text-slate-700">
                    Relieved {fmtDate(selected.relievingDate)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Tab strip */}
        <div className="bg-white border-b border-slate-100 overflow-x-auto hide-scrollbar sticky top-0 z-10">
          <div className="flex">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-3 text-[10px] font-black uppercase tracking-wide whitespace-nowrap border-b-2 transition-colors ${
                  tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400'
                }`}>
                {t.icon}{t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-24">
          {tabLoading && tab !== 'INFO' && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex justify-center text-slate-400">
              <Loader2 size={20} className="animate-spin" />
            </div>
          )}

          {tab === 'INFO' && (
            <>
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Contact</p>
                <div className="flex items-center gap-2"><Phone size={13} className="text-slate-400" /><span className="text-xs font-bold text-slate-600">{selected.phone || '—'}</span></div>
                <div className="flex items-center gap-2"><Mail size={13} className="text-slate-400" /><span className="text-xs font-bold text-slate-600">{selected.email || '—'}</span></div>
                {selected.aadhaarNo && <div className="text-xs font-bold text-slate-500">Aadhaar: {selected.aadhaarNo}</div>}
                {selected.address && <div className="text-xs font-bold text-slate-400 pt-1">{selected.address}</div>}
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Salary',  val: `₹${(selected.salary / 1000).toFixed(0)}K/mo`, color: 'text-emerald-600' },
                  { label: 'Joined',  val: selected.joiningDate.slice(0, 7), color: 'text-slate-700' },
                  { label: 'Classes', val: selected.assignedClasses.length > 0 ? selected.assignedClasses.length : '—', color: 'text-blue-600' },
                ].map(({ label, val, color }) => (
                  <div key={label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 text-center">
                    <div className={`text-base font-black ${color}`}>{val}</div>
                    <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-0.5">{label}</div>
                  </div>
                ))}
              </div>

              {selected.relievingDate && (
                <div className="bg-slate-100 rounded-2xl p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Relieving</p>
                  <div className="text-xs font-black text-slate-800">{fmtDate(selected.relievingDate)}</div>
                  {selected.relievingReason && <div className="text-xs font-bold text-slate-500 mt-1">{selected.relievingReason}</div>}
                </div>
              )}

              <div className="space-y-2">
                {selected.status !== 'RELIEVED' && (
                  <button onClick={() => { setRelieveDate(todayIso()); setRelieveReason(''); setRelieveOpen(true); }}
                    className="w-full py-3 rounded-2xl font-black text-sm bg-amber-50 text-amber-700 border border-amber-200 active:scale-95 transition-transform">
                    Set Relieving Date
                  </button>
                )}
                <button onClick={() => setConfirmSuspend(selected)}
                  className={`w-full py-3 rounded-2xl font-black text-sm active:scale-95 transition-transform ${selected.status === 'SUSPENDED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                  {selected.status === 'SUSPENDED' ? 'Reinstate Staff Member' : 'Suspend Staff Member'}
                </button>
              </div>
            </>
          )}

          {tab === 'SALARY' && !tabLoading && (
            <>
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                <div className="flex items-start justify-between mb-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Current Salary</p>
                  {selected.status !== 'RELIEVED' && (
                    <button onClick={() => { setEditSalaryAmt(String(selected.salary)); setEditSalaryFrom(todayIso()); setEditSalaryReason(''); setEditSalaryOpen(true); }}
                      className="flex items-center gap-1 text-[10px] font-black text-blue-600">
                      <Edit3 size={11} /> Edit Salary
                    </button>
                  )}
                </div>
                <div className="text-3xl font-black text-emerald-600 tabular-nums">{fmtIN(selected.salary)}</div>
                <div className="text-[10px] font-bold text-slate-400 mt-0.5">per month</div>
                {selected.status !== 'RELIEVED' && (
                  <button onClick={() => { setPayMonth(monthLabel(new Date())); setPayAmt(String(selected.salary)); setPayMethod('BANK_TRANSFER'); setPayTxn(''); setPayNote(''); setPayOpen(true); }}
                    className="mt-3 w-full py-3 bg-slate-900 text-white text-xs font-black rounded-xl uppercase tracking-wide active:scale-95 transition-transform">
                    Pay This Month
                  </button>
                )}
              </div>

              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Salary Amount History</p>
                {salaryHistory.length === 0 ? (
                  <p className="text-xs font-bold text-slate-400 py-3 text-center">No salary changes recorded.</p>
                ) : (
                  <div className="space-y-2">
                    {salaryHistory.map(h => (
                      <div key={h.id} className="flex items-center justify-between bg-slate-50 rounded-xl p-3">
                        <div>
                          <div className="font-black text-slate-800 text-sm tabular-nums">{fmtIN(h.amount)}</div>
                          <div className="text-[10px] font-bold text-slate-400 mt-0.5">From {fmtDate(h.effectiveFrom)}{h.reason ? ` · ${h.reason}` : ''}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Payment History</p>
                {paymentHistory.length === 0 ? (
                  <p className="text-xs font-bold text-slate-400 py-3 text-center">No payments yet.</p>
                ) : (
                  <div className="space-y-2">
                    {paymentHistory.map(p => (
                      <div key={p.id} className="flex items-start justify-between bg-slate-50 rounded-xl p-3">
                        <div>
                          <div className="font-black text-slate-800 text-sm">{p.month}</div>
                          <div className="text-[10px] font-bold text-slate-400 mt-0.5">
                            {fmtDate(p.paidAt)}{p.method ? ` · ${p.method.replace('_', ' ')}` : ''}{p.transactionId ? ` · ${p.transactionId}` : ''}
                          </div>
                          {p.note && <div className="text-[10px] font-bold text-slate-500 mt-0.5">{p.note}</div>}
                        </div>
                        <div className="font-black text-emerald-600 text-sm">{fmtIN(p.amount)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {tab === 'ATTENDANCE' && !tabLoading && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 text-center text-slate-400">
              <Calendar size={28} className="mx-auto mb-2 opacity-40" />
              <p className="font-bold text-sm">Mark attendance from the Staff Attendance screen on the dashboard.</p>
              <p className="text-[10px] font-bold text-slate-300 mt-1">Attendance is shown for visibility only — salary is fixed monthly per the simple model.</p>
            </div>
          )}

          {tab === 'CLASSES' && !tabLoading && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Assigned Classes</p>
              {selected.assignedClasses.length === 0 ? (
                <p className="text-xs font-bold text-slate-400 py-3 text-center">No classes assigned in the active year.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {selected.assignedClasses.map(cls => (
                    <span key={cls} className="text-xs font-black bg-blue-50 text-blue-700 px-3 py-1 rounded-xl">{cls}</span>
                  ))}
                </div>
              )}
              <p className="text-[10px] font-bold text-slate-400 mt-3">Use Edit to revise class assignments for the active academic year.</p>
            </div>
          )}

          {tab === 'DOCS' && !tabLoading && (
            <>
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Upload Document</p>
                <div className="grid grid-cols-2 gap-2">
                  <select value={docType} onChange={e => setDocType(e.target.value)}
                    className="border border-slate-200 bg-slate-50 rounded-xl px-3 py-2.5 font-bold text-sm outline-none">
                    {DOC_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                  </select>
                  <label className={`flex items-center justify-center gap-2 bg-blue-600 text-white text-xs font-black rounded-xl px-4 py-2.5 cursor-pointer active:scale-95 transition-transform ${docBusy ? 'opacity-60 pointer-events-none' : ''}`}>
                    {docBusy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                    <span>{docBusy ? 'Uploading…' : 'Choose File'}</span>
                    <input type="file" accept="image/*,application/pdf" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }} />
                  </label>
                </div>
                <p className="text-[10px] font-bold text-slate-400">JPG/PNG/WEBP/HEIC/PDF · max 5 MB</p>
              </div>

              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Submitted Documents</p>
                {docs.length === 0 ? (
                  <p className="text-xs font-bold text-slate-400 py-3 text-center">No documents uploaded yet.</p>
                ) : (
                  <div className="space-y-2">
                    {docs.map(d => (
                      <div key={d.id} className="flex items-center justify-between bg-slate-50 rounded-xl p-3">
                        <div className="min-w-0 flex-1">
                          <div className="font-black text-slate-800 text-xs truncate">{d.docName}</div>
                          <div className="text-[10px] font-bold text-slate-400 mt-0.5">{d.docType.replace('_', ' ')} · {fmtDate(d.uploadedAt)}</div>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => handleViewDoc(d.storagePath)} className="p-2 bg-blue-100 text-blue-600 rounded-lg active:scale-90 transition-transform" title="View">
                            <Eye size={13} />
                          </button>
                          <button onClick={() => handleDeleteDoc(d.id)} className="p-2 bg-rose-100 text-rose-600 rounded-lg active:scale-90 transition-transform" title="Delete">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {tab === 'LOG' && !tabLoading && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Status History</p>
              {statusHistory.length === 0 ? (
                <p className="text-xs font-bold text-slate-400 py-3 text-center">No status changes recorded.</p>
              ) : (
                <div className="space-y-2">
                  {statusHistory.map(h => (
                    <div key={h.id} className="flex items-start gap-3 bg-slate-50 rounded-xl p-3">
                      <BadgeAlert size={14} className="text-slate-400 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-black text-slate-800">
                          {h.oldStatus ? `${h.oldStatus.replace('_', ' ')} → ${h.newStatus.replace('_', ' ')}` : h.newStatus.replace('_', ' ')}
                        </div>
                        <div className="text-[10px] font-bold text-slate-400 mt-0.5">{fmtDate(h.changedAt)}{h.reason ? ` · ${h.reason}` : ''}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ─── Edit Salary modal ───────────────────────────────────────────── */}
        {editSalaryOpen && (
          <div className="absolute inset-0 z-50 bg-slate-900/60 flex items-end">
            <div className="w-full bg-white rounded-t-3xl p-6 pb-8 animate-in slide-in-from-bottom-8">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-black text-slate-900">Edit Salary</h3>
                <button onClick={() => setEditSalaryOpen(false)} className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500"><X size={16} /></button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">New Monthly Salary (₹)</label>
                  <input type="number" value={editSalaryAmt} onChange={e => setEditSalaryAmt(e.target.value)}
                    className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-black text-slate-900 text-lg outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Effective From</label>
                  <input type="date" value={editSalaryFrom} onChange={e => setEditSalaryFrom(e.target.value)}
                    className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Reason</label>
                  <input value={editSalaryReason} onChange={e => setEditSalaryReason(e.target.value)}
                    placeholder="Annual revision, promotion, etc."
                    className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-blue-500" />
                </div>
              </div>
              <button onClick={handleEditSalary} disabled={editSalaryBusy}
                className="mt-5 w-full py-3 bg-blue-600 text-white font-black text-sm rounded-xl disabled:opacity-40 flex items-center justify-center gap-2">
                {editSalaryBusy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {editSalaryBusy ? 'Saving…' : 'Save Salary'}
              </button>
            </div>
          </div>
        )}

        {/* ─── Pay modal ───────────────────────────────────────────────────── */}
        {payOpen && (
          <div className="absolute inset-0 z-50 bg-slate-900/60 flex items-end">
            <div className="w-full bg-white rounded-t-3xl p-6 pb-8 animate-in slide-in-from-bottom-8">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-black text-slate-900">Record Payment</h3>
                <button onClick={() => setPayOpen(false)} className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500"><X size={16} /></button>
              </div>
              <p className="text-[10px] font-bold text-slate-400 mb-3">{selected.name}</p>
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Month</label>
                  <input value={payMonth} onChange={e => setPayMonth(e.target.value)}
                    placeholder="e.g. April 2026"
                    className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Amount Paid (₹)</label>
                  <input type="number" value={payAmt} onChange={e => setPayAmt(e.target.value)}
                    className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-black text-slate-900 text-lg outline-none focus:border-blue-500" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Method</label>
                    <select value={payMethod} onChange={e => setPayMethod(e.target.value as SalaryPaymentMethod)}
                      className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none">
                      {PAY_METHODS.map(m => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Txn ID (optional)</label>
                    <input value={payTxn} onChange={e => setPayTxn(e.target.value)}
                      placeholder="UTR / Cheque #"
                      className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none focus:border-blue-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Note (optional)</label>
                  <input value={payNote} onChange={e => setPayNote(e.target.value)}
                    className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-blue-500" />
                </div>
              </div>
              <button onClick={handlePay} disabled={payBusy || !payAmt}
                className="mt-5 w-full py-3 bg-emerald-600 text-white font-black text-sm rounded-xl disabled:opacity-40 flex items-center justify-center gap-2">
                {payBusy ? <Loader2 size={14} className="animate-spin" /> : <IndianRupee size={14} />}
                {payBusy ? 'Saving…' : 'Save Payment'}
              </button>
            </div>
          </div>
        )}

        {/* ─── Relieving date modal ───────────────────────────────────────── */}
        {relieveOpen && (
          <div className="absolute inset-0 z-50 bg-slate-900/60 flex items-end">
            <div className="w-full bg-white rounded-t-3xl p-6 pb-8 animate-in slide-in-from-bottom-8">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-black text-slate-900">Set Relieving Date</h3>
                <button onClick={() => setRelieveOpen(false)} className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500"><X size={16} /></button>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 flex gap-2">
                <AlertTriangle size={14} className="text-amber-600 mt-0.5 shrink-0" />
                <p className="text-[11px] font-bold text-amber-700">This will mark {selected.name} as RELIEVED. Salary reminders will stop after the relieving date.</p>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Relieving Date</label>
                  <input type="date" value={relieveDate} onChange={e => setRelieveDate(e.target.value)}
                    className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Reason</label>
                  <textarea value={relieveReason} onChange={e => setRelieveReason(e.target.value)}
                    rows={3} placeholder="Resignation / End of contract / Termination…"
                    className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-blue-500 resize-none" />
                </div>
              </div>
              <button onClick={handleRelieve} disabled={relieveBusy}
                className="mt-5 w-full py-3 bg-amber-600 text-white font-black text-sm rounded-xl disabled:opacity-40 flex items-center justify-center gap-2">
                {relieveBusy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {relieveBusy ? 'Saving…' : 'Confirm Relieving'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

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
