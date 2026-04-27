import React from 'react';
import { User, Phone, Shield, LogOut, ChevronRight, Bell, Lock, GraduationCap, Briefcase, Car, Star } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

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
  const { session, logout } = useAuthStore();
  if (!session) return null;

  const initials = session.name
    ? session.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
    : 'U';
  const roleLabel = ROLE_LABEL[session.role] ?? session.role;
  const gradient = ROLE_GRADIENT[session.role] ?? 'from-indigo-600 to-blue-700';

  return (
    <div className="space-y-4 pb-4">
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
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 px-4 pt-4 pb-2">Account Info</p>
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

      {/* Settings Links */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 px-4 pt-4 pb-2">Settings</p>
        <button className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-slate-50 active:bg-slate-50 transition-colors">
          <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
            <Bell size={15} className="text-blue-600" />
          </div>
          <div className="flex-1 text-left">
            <div className="font-bold text-slate-900 text-sm">Notifications</div>
            <div className="text-[9px] font-bold text-slate-400">Manage alerts & reminders</div>
          </div>
          <ChevronRight size={16} className="text-slate-300" />
        </button>
        <button className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-slate-50 transition-colors">
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
          onClick={() => { logout(); window.location.reload(); }}
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
    </div>
  );
};
