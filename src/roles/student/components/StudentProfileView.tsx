import React, { useEffect, useState } from 'react';
import {
  ArrowLeft, User, Phone, Mail, MapPin, Calendar, Droplet,
  GraduationCap, IdCard, Lock, LogOut, X, Eye, EyeOff, Fingerprint,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import { authService } from '@/shared/services/auth.service';
import {
  studentDashboardService, type ActiveStudentContext,
} from '@/modules/students/studentDashboard.service';

interface Props { onBack: () => void; }

interface ProfileRow {
  admission_no: string | null;
  roll_no: string | null;
  dob: string | null;
  gender: string | null;
  blood_group: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  /** Master Aadhaar number stored on the students table — read-only here. */
  aadhaar_no: string | null;
  /** Public/signed URL or storage path of the student photo. */
  photo: string | null;
  father_name: string | null;
  father_phone: string | null;
  mother_name: string | null;
  mother_phone: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
}

/**
 * Aadhaar numbers are 12 digits. We only show the last 4 to keep the
 * sensitive ID off-screen by default, in line with UIDAI masking guidance.
 * Empty / partial values are returned verbatim so the "—" placeholder
 * still works for missing data.
 */
const maskAadhaar = (raw: string | null): string => {
  if (!raw) return '—';
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 4) return raw;
  const last4 = digits.slice(-4);
  return `XXXX-XXXX-${last4}`;
};

const formatDate = (iso: string | null): string => {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return iso; }
};

export const StudentProfileView: React.FC<Props> = ({ onBack }) => {
  const { session, logout } = useAuthStore();
  const { showToast } = useUIStore();
  const [ctx, setCtx] = useState<ActiveStudentContext | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);

  // Change-password modal state (mirrors src/views/ProfileView.tsx).
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword]         = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword]       = useState(false);
  const [savingPwd, setSavingPwd]             = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const c = await studentDashboardService.getActiveContext();
        if (cancelled) return;
        setCtx(c);

        // Pull the master student row directly. RLS guarantees only the
        // student themselves, their parent, or same-school staff can read it.
        const { data, error } = await supabase
          .from('students')
          .select(
            'admission_no, roll_no, dob, gender, blood_group, address, email, phone, ' +
            'aadhaar_no, photo, ' +
            'father_name, father_phone, mother_name, mother_phone, guardian_name, guardian_phone'
          )
          .eq('id', c.studentId)
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!cancelled) setProfile((data as unknown as ProfileRow | null) ?? null);
      } catch (err) {
        console.error('[student-profile] load failed', err);
        if (!cancelled) showToast('Could not load profile', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [showToast]);

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      showToast('All fields required', 'error'); return;
    }
    if (newPassword.length < 6) {
      showToast('Password must be at least 6 characters', 'error'); return;
    }
    if (newPassword !== confirmPassword) {
      showToast('Passwords do not match', 'error'); return;
    }
    if (currentPassword === newPassword) {
      showToast('New password must be different from current', 'error'); return;
    }
    setSavingPwd(true);
    try {
      await authService.changePassword(currentPassword, newPassword);
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setShowChangePassword(false);
      showToast('Password changed successfully');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to change password', 'error');
    } finally {
      setSavingPwd(false);
    }
  };

  const displayName = ctx?.studentName ?? session?.name ?? 'Student';
  const initials = displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const classLabel = ctx?.classLabel ?? (ctx?.className ?? '—');

  return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
        <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">My Profile</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Hero */}
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-3xl p-6 text-white">
          <div className="flex items-center gap-4">
            {profile?.photo ? (
              // Student photo — read-only here. Editing happens in the
              // principal's StudentsManager (admission flow).
              <img src={profile.photo} alt={displayName}
                className="w-[72px] h-[72px] rounded-2xl object-cover border-2 border-white/40 shrink-0 bg-white/20" />
            ) : (
              <div className="w-[72px] h-[72px] rounded-2xl bg-white/20 border-2 border-white/40 flex items-center justify-center font-black text-2xl shrink-0">
                {initials}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h2 className="font-black text-xl leading-tight truncate">{displayName}</h2>
              <div className="flex items-center gap-1.5 mt-1 opacity-90">
                <GraduationCap size={16} />
                <span className="text-sm font-bold">{classLabel}</span>
              </div>
              {ctx?.schoolName && (
                <p className="text-[11px] font-bold opacity-80 mt-0.5 truncate">{ctx.schoolName}</p>
              )}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-6 text-center text-sm font-bold text-slate-400">
            Loading profile…
          </div>
        ) : (
          <>
            {/* Academic info */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 px-4 pt-4 pb-2">Academic</p>
              {[
                { icon: IdCard,        label: 'Admission No', val: profile?.admission_no || '—' },
                { icon: User,          label: 'Roll No',      val: profile?.roll_no || '—' },
                { icon: GraduationCap, label: 'Class & Section', val: classLabel },
              ].map(({ icon: Icon, label, val }, idx, arr) => (
                <div key={label}
                  className={`flex items-center gap-3 px-4 py-3.5 ${idx < arr.length - 1 ? 'border-b border-slate-50' : ''}`}>
                  <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center shrink-0">
                    <Icon size={15} className="text-slate-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</div>
                    <div className="font-bold text-slate-900 text-sm mt-0.5 truncate">{val}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Personal */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 px-4 pt-4 pb-2">Personal</p>
              {[
                { icon: Calendar,    label: 'Date of Birth', val: formatDate(profile?.dob ?? null) },
                { icon: User,        label: 'Gender',        val: profile?.gender || '—' },
                { icon: Droplet,     label: 'Blood Group',   val: profile?.blood_group || '—' },
                { icon: Fingerprint, label: 'Aadhaar',       val: maskAadhaar(profile?.aadhaar_no ?? null) },
                { icon: Phone,       label: 'Mobile',        val: profile?.phone || session?.mobileNumber || '—' },
                { icon: Mail,        label: 'Email',         val: profile?.email || '—' },
                { icon: MapPin,      label: 'Address',       val: profile?.address || '—' },
              ].map(({ icon: Icon, label, val }, idx, arr) => (
                <div key={label}
                  className={`flex items-start gap-3 px-4 py-3.5 ${idx < arr.length - 1 ? 'border-b border-slate-50' : ''}`}>
                  <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center shrink-0">
                    <Icon size={15} className="text-slate-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</div>
                    <div className="font-bold text-slate-900 text-sm mt-0.5 break-words">{val}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Parents / Guardian */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 px-4 pt-4 pb-2">Parents &amp; Guardian</p>
              {[
                { label: 'Father', name: profile?.father_name, phone: profile?.father_phone },
                { label: 'Mother', name: profile?.mother_name, phone: profile?.mother_phone },
                ...(profile?.guardian_name ? [{ label: 'Guardian', name: profile.guardian_name, phone: profile.guardian_phone }] : []),
              ].map(({ label, name, phone }, idx, arr) => (
                <div key={label}
                  className={`flex items-center gap-3 px-4 py-3.5 ${idx < arr.length - 1 ? 'border-b border-slate-50' : ''}`}>
                  <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                    <User size={15} className="text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</div>
                    <div className="font-bold text-slate-900 text-sm mt-0.5 truncate">{name || '—'}</div>
                    {phone && (
                      <a href={`tel:${phone}`} className="text-[11px] font-bold text-emerald-600 mt-0.5 inline-block">
                        {phone}
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Settings */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 px-4 pt-4 pb-2">Settings</p>
              <button onClick={() => setShowChangePassword(true)}
                className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-slate-50">
                <div className="w-8 h-8 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
                  <Lock size={15} className="text-violet-600" />
                </div>
                <div className="flex-1 text-left">
                  <div className="font-bold text-slate-900 text-sm">Change Password</div>
                  <div className="text-[9px] font-bold text-slate-400">Update your account password</div>
                </div>
              </button>
              <button onClick={() => logout()}
                className="w-full flex items-center gap-3 px-4 py-3.5 border-t border-slate-50 active:bg-rose-50">
                <div className="w-8 h-8 rounded-xl bg-rose-50 flex items-center justify-center shrink-0">
                  <LogOut size={15} className="text-rose-600" />
                </div>
                <div className="flex-1 text-left">
                  <div className="font-bold text-rose-600 text-sm">Logout</div>
                  <div className="text-[9px] font-bold text-rose-400">Sign out of this device</div>
                </div>
              </button>
            </div>
          </>
        )}
      </div>

      {/* Change Password Modal */}
      {showChangePassword && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-end justify-center">
          <div className="w-full bg-white rounded-t-3xl p-6 pb-8 animate-in slide-in-from-bottom-8 space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-black text-slate-900">Change Password</h3>
              <button onClick={() => setShowChangePassword(false)}
                className="p-2 -mr-2 text-slate-400"><X size={20} /></button>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Current Password</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'}
                  value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500 pr-10" />
                <button onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">New Password</label>
              <input type={showPassword ? 'text' : 'password'}
                value={newPassword} onChange={e => setNewPassword(e.target.value)}
                placeholder="Min 6 characters"
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Confirm Password</label>
              <input type={showPassword ? 'text' : 'password'}
                value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500" />
            </div>
            <p className="text-[10px] font-bold text-slate-400">
              Password must be at least 6 characters and different from your current one.
            </p>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowChangePassword(false)}
                className="flex-1 py-3 bg-slate-100 text-slate-900 font-black rounded-xl">Cancel</button>
              <button onClick={handleChangePassword} disabled={savingPwd}
                className="flex-1 py-3 bg-indigo-600 text-white font-black rounded-xl disabled:opacity-60">
                {savingPwd ? 'Saving…' : 'Change Password'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
