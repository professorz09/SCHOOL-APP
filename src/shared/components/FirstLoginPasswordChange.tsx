import React, { useState } from 'react';
import { Lock, Eye, EyeOff, AlertCircle, ShieldCheck, Loader } from 'lucide-react';
import { authService } from '@/modules/auth/auth.service';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';

export const FirstLoginPasswordChange: React.FC = () => {
  const { session, setSession, logout } = useAuthStore();
  const { showToast } = useUIStore();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!session) return null;

  const handleSubmit = async () => {
    setError('');
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('All fields required');
      return;
    }
    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters');
      return;
    }
    if (newPassword === currentPassword) {
      setError('New password must differ from temporary password');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setSubmitting(true);
    try {
      await authService.changePassword(currentPassword, newPassword);
      // Set the local flag immediately so the UI advances. The
      // changePassword() call above already issues a getUser() to
      // poison any in-flight stale refresh, so this update should
      // stick across subsequent listener events on this same login.
      setSession({ ...session, mustChangePassword: false });
      showToast('Password changed successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change password');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    // Earlier this rendered a fake phone shell (rounded-[40px] +
    // border-[8px]) at all viewports — looked like a screenshot
    // mock-up rather than a real screen on tablets and desktops, and
    // pushed the form way off-center. Now it's a normal centered
    // card that adapts naturally.
    <div className="min-h-dvh bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 pt-6 pb-7 text-white">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
              <ShieldCheck size={22} />
            </div>
            <div className="min-w-0">
              <div className="text-xl font-black leading-tight">Set New Password</div>
              <div className="text-[11px] font-bold text-blue-100 mt-0.5">First-login security check</div>
            </div>
          </div>
        </div>

        <div className="p-6 pb-7 max-h-[calc(100dvh-200px)] overflow-y-auto">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-6">
            <p className="text-[11px] font-bold text-amber-800">
              For security, change your temporary password before continuing. You won't be asked again.
            </p>
          </div>

          {error && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 mb-4 flex gap-2 items-start">
              <AlertCircle size={18} className="text-rose-600 shrink-0 mt-0.5" />
              <div className="text-sm font-bold text-rose-700">{error}</div>
            </div>
          )}

          <div className="mb-4">
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-600 mb-2">Temporary Password</label>
            <div className="relative">
              <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                placeholder="Enter the password you received"
                className="w-full pl-12 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              <button type="button" onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
                {showCurrent ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-600 mb-2">New Password</label>
            <div className="relative">
              <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Min 6 characters"
                className="w-full pl-12 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              <button type="button" onClick={() => setShowNew(!showNew)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
                {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-600 mb-2">Confirm New Password</label>
            <div className="relative">
              <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type={showNew ? 'text' : 'password'}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-black text-lg rounded-xl shadow-lg active:scale-95 transition-all disabled:opacity-60 flex items-center justify-center gap-2">
            {submitting ? <><Loader size={20} className="animate-spin" /> Saving…</> : 'Change Password'}
          </button>

          <button
            onClick={async () => { await logout(); }}
            className="w-full mt-3 py-3 text-slate-500 font-bold text-sm hover:text-slate-700 transition-colors">
            Cancel & log out
          </button>
        </div>
      </div>
    </div>
  );
};
