import React, { useEffect, useState } from 'react';
import { ArrowLeft, ShieldCheck, Plus, Search, UserCircle, Star, CheckCircle2, XCircle, Trash2, ChevronDown, ChevronUp, KeyRound } from 'lucide-react';
import { useAdminStore } from '../../../store/adminStore';
import { useAuthStore } from '../../../store/authStore';
import { useUIStore } from '../../../store/uiStore';
import { AdminUser, CreateAdminInput } from '../../../types/admin.types';
import { adminService } from '../../../services/admin.service';

const PASSWORD_RESET_VALUE = 'edugrow@reset';

type View = 'LIST' | 'CREATE' | 'DETAIL';

interface Props {
  onBack: () => void;
}

export const AdminsManager: React.FC<Props> = ({ onBack }) => {
  const { admins, fetchAdmins, addAdmin, updateStatus, deleteAdmin } = useAdminStore();
  const { showToast } = useUIStore();
  const callerId = useAuthStore(s => s.session?.userId);

  const [view, setView] = useState<View>('LIST');
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<AdminUser | null>(null);
  const [confirmResetPassword, setConfirmResetPassword] = useState<AdminUser | null>(null);

  const [form, setForm] = useState<CreateAdminInput>({
    name: '', email: '', phone: '', role: 'SUPER_ADMIN', schoolId: '', password: '',
  });

  useEffect(() => {
    fetchAdmins().catch(e => showToast(e instanceof Error ? e.message : 'Failed to load admins', 'error'));
  }, []);

  const filtered = admins.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.email.toLowerCase().includes(search.toLowerCase()) ||
    a.adminId.toLowerCase().includes(search.toLowerCase()),
  );

  const handleCreate = async () => {
    if (!form.name || !form.phone || !form.password) {
      showToast('Name, mobile and password required', 'error'); return;
    }
    setIsSubmitting(true);
    try {
      const admin = await adminService.create(form);
      addAdmin(admin);
      showToast(`${admin.name} account created`);
      setForm({ name: '', email: '', phone: '', role: 'SUPER_ADMIN', schoolId: '', password: '' });
      setView('LIST');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to create admin', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (admin: AdminUser) => {
    if (admin.role === 'SUPER_ADMIN' && admin.id === callerId) {
      showToast('You cannot deactivate your own account', 'error');
      return;
    }
    const next = admin.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await updateStatus(admin.id, next);
      showToast(`${admin.name} marked ${next.toLowerCase()}`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Status change failed', 'error');
    }
  };

  const handleDelete = async (admin: AdminUser) => {
    if (admin.id === callerId) {
      showToast('You cannot remove your own account', 'error');
      setConfirmDelete(null);
      return;
    }
    if (admin.role === 'PRINCIPAL') {
      showToast('Principal accounts cannot be deleted — use Reset Password instead', 'error');
      setConfirmDelete(null);
      return;
    }
    try {
      await deleteAdmin(admin.id);
      showToast(`${admin.name} deactivated`, 'info');
      setConfirmDelete(null);
      if (view === 'DETAIL') setView('LIST');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Deactivation failed', 'error');
    }
  };

  const handleResetPassword = (admin: AdminUser) => {
    setConfirmResetPassword(admin);
  };

  const doResetPassword = async (admin: AdminUser) => {
    try {
      await adminService.resetPassword(admin.id, PASSWORD_RESET_VALUE);
      showToast(`${admin.name}'s password has been reset. They must change it on next login.`, 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Reset failed', 'error');
    } finally {
      setConfirmResetPassword(null);
    }
  };

  const renderHeader = (title: string, back: () => void, action?: React.ReactNode) => (
    <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
      <div className="flex items-center gap-3">
        <button onClick={back} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600 hover:bg-slate-200 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">{title}</h2>
      </div>
      {action}
    </div>
  );

  const roleColor = (role: string) => role === 'SUPER_ADMIN' ? 'text-rose-700 bg-rose-50' : role === 'PRINCIPAL' ? 'text-indigo-700 bg-indigo-50' : 'text-slate-600 bg-slate-100';
  const statusColor = (s: string) => s === 'ACTIVE' ? 'text-emerald-700 bg-emerald-50' : s === 'SUSPENDED' ? 'text-rose-700 bg-rose-50' : 'text-slate-500 bg-slate-100';

  if (view === 'LIST') return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader('System Admins', onBack,
        <button onClick={() => setView('CREATE')} className="p-2 bg-rose-500 text-white rounded-full hover:bg-rose-600 transition-colors shadow-md">
          <Plus size={18} />
        </button>
      )}
      <div className="flex-1 overflow-y-auto p-4  space-y-4">
        <div className="relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search admins…"
            className="w-full bg-white border border-slate-200 rounded-2xl pl-11 pr-4 py-3 font-bold text-sm outline-none focus:border-rose-500 transition-colors shadow-sm" />
        </div>

        {/* Stats */}
        <div className="flex gap-2">
          {[
            { label: 'Total', val: admins.length, color: 'bg-slate-900 text-white' },
            { label: 'Active', val: admins.filter(a => a.status === 'ACTIVE').length, color: 'bg-emerald-50 text-emerald-700' },
            { label: 'Principals', val: admins.filter(a => a.role === 'PRINCIPAL').length, color: 'bg-indigo-50 text-indigo-700' },
          ].map(({ label, val, color }) => (
            <div key={label} className={`flex-1 px-3 py-2 rounded-xl text-center text-[10px] font-black uppercase tracking-widest ${color}`}>
              <div className="text-base font-black">{val}</div>
              <div className="opacity-80">{label}</div>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          {filtered.map(admin => (
            <div key={admin.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              {/* Top strip */}
              <div className="px-4 pt-3 pb-2 flex justify-between items-center bg-slate-50/50">
                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${roleColor(admin.role)}`}>
                  {admin.adminId}
                </span>
                <div className="flex items-center gap-1.5">
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${statusColor(admin.status)}`}>
                    {admin.status}
                  </span>
                  {(() => {
                    const isSelf = admin.id === callerId;
                    return (
                      <>
                        <button
                          onClick={() => handleToggleStatus(admin)}
                          disabled={isSelf}
                          title={isSelf ? 'You cannot change your own status' : (admin.status === 'ACTIVE' ? 'Deactivate' : 'Activate')}
                          className={`p-1 rounded-full transition-colors ${isSelf ? 'opacity-40 cursor-not-allowed' : 'text-slate-400 hover:bg-slate-100'}`}
                        >
                          {admin.status === 'ACTIVE' ? <XCircle size={14} className="text-rose-400" /> : <CheckCircle2 size={14} className="text-emerald-400" />}
                        </button>
                        {admin.role === 'PRINCIPAL' ? (
                          <button onClick={() => handleResetPassword(admin)} className="p-1 rounded-full text-amber-500 hover:bg-amber-50 transition-colors" title="Reset Password">
                            <KeyRound size={14} />
                          </button>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(admin)}
                            disabled={isSelf}
                            title={isSelf ? 'You cannot remove your own account' : 'Remove'}
                            className={`p-1 rounded-full transition-colors ${isSelf ? 'opacity-40 cursor-not-allowed' : 'text-slate-400 hover:bg-slate-100'}`}
                          >
                            <Trash2 size={14} className="text-rose-400" />
                          </button>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Main info */}
              <div className="px-4 py-3 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${admin.role === 'SUPER_ADMIN' ? 'bg-rose-100 text-rose-600' : 'bg-indigo-100 text-indigo-600'}`}>
                  <UserCircle size={22} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-extrabold text-slate-900 text-sm">{admin.name}</span>
                    {admin.role === 'SUPER_ADMIN' && <Star size={11} className="text-rose-500 fill-rose-500" />}
                  </div>
                  <div className="text-[10px] font-bold text-slate-400 mt-0.5">{admin.email}</div>
                  {admin.schoolName && <div className="text-[10px] font-black text-indigo-500 mt-0.5">{admin.schoolName}</div>}
                </div>
                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${roleColor(admin.role)}`}>
                  {admin.role.replace('_', ' ')}
                </span>
              </div>

              {/* Last login */}
              <div className="px-4 py-2 border-t border-slate-50 flex justify-between items-center">
                <span className="text-[10px] font-bold text-slate-400">Last login: <span className="text-slate-600">{admin.lastLogin}</span></span>
                {admin.createdAccounts.length > 0 && (
                  <button onClick={() => setExpandedId(expandedId === admin.id ? null : admin.id)}
                    className="flex items-center gap-1 text-[10px] font-black text-slate-500 hover:text-slate-900">
                    {admin.createdAccounts.length} accounts
                    {expandedId === admin.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>
                )}
              </div>

              {/* Connected accounts */}
              {expandedId === admin.id && admin.createdAccounts.length > 0 && (
                <div className="px-4 pb-3 space-y-2">
                  {admin.createdAccounts.map(acc => (
                    <div key={acc.id} className="flex justify-between items-center p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                      <div>
                        <div className="font-bold text-slate-700 text-xs">{acc.name}</div>
                        <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">{acc.role}</div>
                      </div>
                      <span className="text-[10px] font-black text-indigo-600 bg-white border border-indigo-100 px-2 py-0.5 rounded-lg">{acc.id}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="flex flex-col items-center py-16 text-slate-400">
              <ShieldCheck size={32} className="mb-3 opacity-40" />
              <p className="font-bold text-sm">No admins found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (view === 'CREATE') return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader('Create Admin', () => setView('LIST'))}
      <div className="flex-1 overflow-y-auto p-4  space-y-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
          {[
            { label: 'Full Name *', key: 'name', placeholder: 'Dr. / Mr. / Ms.' },
            { label: 'Email Address (optional)', key: 'email', placeholder: 'admin@edugrow.in' },
            { label: 'Mobile Number *', key: 'phone', placeholder: '10-digit mobile' },
            { label: 'Password *', key: 'password', placeholder: 'Min 6 characters', type: 'password' },
          ].map(({ label, key, placeholder, type }) => (
            <div key={key}>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">{label}</label>
              <input type={type ?? 'text'} value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-rose-500 focus:bg-white transition-colors" />
            </div>
          ))}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Role</label>
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as AdminUser['role'] }))}
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-rose-500 focus:bg-white transition-colors">
              <option value="SUPER_ADMIN">Super Admin</option>
            </select>
            <p className="text-[10px] font-bold text-slate-400 mt-1.5">
              Principal accounts are created automatically when you onboard a new school.
            </p>
          </div>
        </div>
        <button onClick={handleCreate} disabled={isSubmitting}
          className="w-full flex items-center justify-center gap-2 bg-rose-600 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg disabled:opacity-60">
          {isSubmitting ? 'Creating…' : <><Plus size={16} /> Create Account</>}
        </button>
      </div>
    </div>
  );

  // Reset Password confirmation
  if (confirmResetPassword) {
    return (
      <div className="absolute inset-0 z-60 bg-slate-900/60 flex items-end justify-center animate-in fade-in">
        <div className="bg-white w-full rounded-t-3xl p-6 pb-10 animate-in slide-in-from-bottom-4">
          <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mb-4">
            <KeyRound size={20} />
          </div>
          <h3 className="font-black text-slate-900 text-lg mb-2">Reset Password?</h3>
          <p className="text-sm text-slate-500 mb-1">A password reset link will be sent to:</p>
          <p className="text-sm font-black text-slate-800 mb-5">{confirmResetPassword.email}</p>
          <p className="text-xs font-bold text-amber-600 bg-amber-50 rounded-xl px-3 py-2 mb-5">A temporary password will be set on this account. The principal will be required to change it on their next login.</p>
          <div className="flex gap-3">
            <button onClick={() => setConfirmResetPassword(null)} className="flex-1 py-3 rounded-2xl border border-slate-200 font-black text-slate-600 active:scale-95 transition-transform">
              Cancel
            </button>
            <button onClick={() => doResetPassword(confirmResetPassword)} className="flex-1 py-3 rounded-2xl bg-amber-500 text-white font-black active:scale-95 transition-transform">
              Send Reset Link
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Confirmation dialog
  if (confirmDelete && confirmDelete.id !== callerId && confirmDelete.role !== 'PRINCIPAL') {
    return (
      <div className="absolute inset-0 z-60 bg-slate-900/60 flex items-end justify-center animate-in fade-in">
        <div className="bg-white w-full rounded-t-3xl p-6 pb-10 animate-in slide-in-from-bottom-4">
          <h3 className="font-black text-slate-900 text-lg mb-2">Deactivate Admin?</h3>
          <p className="text-sm text-slate-500 mb-6">"{confirmDelete.name}" will be soft-deactivated. Their account is preserved for audit and can be re-activated later.</p>
          <div className="flex gap-3">
            <button onClick={() => setConfirmDelete(null)} className="flex-1 py-3 rounded-2xl border border-slate-200 font-black text-slate-600 active:scale-95 transition-transform">
              Cancel
            </button>
            <button onClick={() => handleDelete(confirmDelete)} className="flex-1 py-3 rounded-2xl bg-rose-600 text-white font-black active:scale-95 transition-transform">
              Deactivate
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};
