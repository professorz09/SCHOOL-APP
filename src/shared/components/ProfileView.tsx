import React, { useState } from 'react';
import { User, Phone, Shield, LogOut, ChevronRight, Bell, Lock, GraduationCap, Briefcase, Car, Star, X, Save, Eye, EyeOff } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  PRINCIPAL: 'Principal',
  TEACHER: 'Teacher',
  STUDENT: 'Student',
  PARENT: 'Parent',
  DRIVER: 'Driver',
};

const ROLE_GRADIENT: Record<string, string> = {
  SUPER_ADMIN: 'from-violet-600 to-purple-700',
  PRINCIPAL: 'from-indigo-600 to-blue-700',
  TEACHER: 'from-blue-500 to-cyan-600',
  STUDENT: 'from-emerald-500 to-teal-600',
  PARENT: 'from-amber-500 to-orange-600',
  DRIVER: 'from-orange-500 to-red-600',
};

const ROLE_ICON: Record<string, React.ReactNode> = {
  SUPER_ADMIN: <Star size={20} />,
  PRINCIPAL: <Shield size={20} />,
  TEACHER: <GraduationCap size={20} />,
  STUDENT: <GraduationCap size={20} />,
  PARENT: <User size={20} />,
  DRIVER: <Car size={20} />,
};

export const ProfileView: React.FC = () => {
  const { session, logout, setSession } = useAuthStore();
  const { showToast } = useUIStore();
  const [isEditMode, setIsEditMode] = useState(false);
  const [editName, setEditName] = useState(session?.name || '');
  const [editMobile, setEditMobile] = useState(session?.mobileNumber || '');
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  if (!session) return null;

  const handleSaveProfile = () => {
    if (!editName.trim()) {
      showToast('Name cannot be empty', 'error');
      return;
    }
    if (!editMobile.trim() || editMobile.length < 10) {
      showToast('Valid mobile number required', 'error');
      return;
    }
    const updated = { ...session, name: editName, mobileNumber: editMobile };
    setSession(updated);
    setIsEditMode(false);
    showToast('Profile updated successfully');
  };

  const handleChangePassword = () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      showToast('All fields required', 'error');
      return;
    }
    if (newPassword.length < 6) {
      showToast('Password must be at least 6 characters', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('Passwords do not match', 'error');
      return;
    }
    if (currentPassword === newPassword) {
      showToast('New password must be different from current', 'error');
      return;
    }
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowChangePassword(false);
    showToast('Password changed successfully');
  };

  const initials = session.name
    ? session.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
    : 'U';
  const roleLabel = ROLE_LABEL[session.role] ?? session.role;
  const gradient = ROLE_GRADIENT[session.role] ?? 'from-indigo-600 to-blue-700';

  return (
    <div className="space-y-4 pb-4 px-5">
      {/* Profile Hero Card */}
      <div className={`bg-gradient-to-br ${gradient} rounded-3xl p-6 text-white mt-2`}>
        <div className="flex items-center gap-4">
          <div className="w-18 h-18 w-[72px] h-[72px] rounded-2xl bg-white/20 border-2 border-white/40 flex items-center justify-center font-black text-2xl shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-black text-xl leading-tight truncate">{session.name || 'User'}</h2>
            <div className="flex items-center gap-1.5 mt-1">
              <div className="opacity-80">{ROLE_ICON[session.role]}</div>
              <span className="text-sm font-bold opacity-90">{roleLabel}</span>
            </div>
          </div>
        </div>
        {session.mobileNumber && (
          <div className="mt-4 flex items-center gap-2 bg-white/10 rounded-xl px-3 py-2">
            <Phone size={14} className="opacity-70" />
            <span className="text-sm font-bold opacity-90">{session.mobileNumber}</span>
          </div>
        )}
      </div>

      {/* Account Info */}
      {!isEditMode ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Account Info</p>
            {/* Edit is intentionally hidden for PARENT, PRINCIPAL, and
                DRIVER. PARENT rows are provisioned during student
                onboarding; PRINCIPAL edits via Settings ▸ School;
                DRIVER rows are created by the principal alongside the
                staff record + vehicle assignment and edited there.
                STUDENT / TEACHER fall through to allow self-edit. */}
            {session.role !== 'PRINCIPAL'
              && session.role !== 'PARENT'
              && session.role !== 'DRIVER' && (
              <button onClick={() => { setEditName(session.name || ''); setEditMobile(session.mobileNumber || ''); setIsEditMode(true); }}
                className="text-[9px] font-black text-indigo-600 hover:text-indigo-700">
                Edit
              </button>
            )}
          </div>
          {[
            { icon: User, label: 'Full Name', val: session.name || '—' },
            { icon: Phone, label: 'Mobile Number', val: session.mobileNumber || '—' },
            { icon: Shield, label: 'Role', val: roleLabel },
          ].map(({ icon: Icon, label, val }, idx, arr) => (
            <div key={label} className={`flex items-center gap-3 px-4 py-3.5 ${idx < arr.length - 1 ? 'border-b border-slate-50' : ''}`}>
              <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center shrink-0">
                <Icon size={15} className="text-slate-500" />
              </div>
              <div className="flex-1">
                <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</div>
                <div className="font-bold text-slate-900 text-sm mt-0.5">{val}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden p-4 space-y-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Edit Profile</p>
            <button onClick={() => setIsEditMode(false)} className="p-1 text-slate-400 hover:text-slate-600">
              <X size={16} />
            </button>
          </div>
          <div>
            <label className="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Full Name</label>
            <input value={editName} onChange={e => setEditName(e.target.value)}
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label className="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Mobile Number</label>
            <input value={editMobile} onChange={e => setEditMobile(e.target.value)} placeholder="10-digit mobile"
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500" />
          </div>
          <button onClick={handleSaveProfile}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white font-black text-sm py-3 rounded-xl hover:bg-indigo-700 transition-colors">
            <Save size={16} /> Save Changes
          </button>
        </div>
      )}

      {/* Settings Links */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 px-4 pt-4 pb-2">Settings</p>
        <button disabled className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-slate-50 active:bg-slate-50 transition-colors opacity-50 cursor-not-allowed">
          <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
            <Bell size={15} className="text-blue-600" />
          </div>
          <div className="flex-1 text-left">
            <div className="font-bold text-slate-900 text-sm">Notifications</div>
            <div className="text-[9px] font-bold text-slate-400">Coming soon</div>
          </div>
          <ChevronRight size={16} className="text-slate-300" />
        </button>
        <button onClick={() => setShowChangePassword(true)} className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-slate-50 transition-colors hover:bg-slate-50">
          <div className="w-8 h-8 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
            <Lock size={15} className="text-violet-600" />
          </div>
          <div className="flex-1 text-left">
            <div className="font-bold text-slate-900 text-sm">Security & Password</div>
            <div className="text-[9px] font-bold text-slate-400">Change password & security settings</div>
          </div>
          <ChevronRight size={16} className="text-slate-300" />
        </button>
      </div>

      {/* Logout */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <button
          onClick={() => { logout(); }}
          className="w-full flex items-center gap-3 px-4 py-4 active:bg-rose-50 transition-colors"
        >
          <div className="w-8 h-8 rounded-xl bg-rose-50 flex items-center justify-center shrink-0">
            <LogOut size={15} className="text-rose-600" />
          </div>
          <div className="flex-1 text-left">
            <div className="font-bold text-rose-600 text-sm">Logout</div>
            <div className="text-[9px] font-bold text-rose-400">{session.mobileNumber}</div>
          </div>
        </button>
      </div>

      {/* App Version */}
      <div className="text-center py-2">
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-300">EduGrow · Version 1.0</p>
      </div>

      {/* Change Password Modal */}
      {showChangePassword && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-end justify-center">
          <div className="w-full bg-white rounded-t-3xl p-6 pb-8 animate-in slide-in-from-bottom-8 space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-black text-slate-900">Change Password</h3>
              <button onClick={() => setShowChangePassword(false)} className="p-2 -mr-2 text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Current Password</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500 pr-10" />
                <button onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">New Password</label>
              <input type={showPassword ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)}
                placeholder="Min 6 characters"
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500" />
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Confirm Password</label>
              <input type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500" />
            </div>

            <p className="text-[10px] font-bold text-slate-400">Password must be at least 6 characters long and different from your current password.</p>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowChangePassword(false)}
                className="flex-1 py-3 bg-slate-100 text-slate-900 font-black rounded-xl hover:bg-slate-200 transition-colors">
                Cancel
              </button>
              <button onClick={handleChangePassword}
                className="flex-1 py-3 bg-indigo-600 text-white font-black rounded-xl hover:bg-indigo-700 transition-colors">
                Change Password
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
