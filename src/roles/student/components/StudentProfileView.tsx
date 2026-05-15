import React, { useEffect, useState } from 'react';
import {
  ArrowLeft, User, Phone, Mail, MapPin, Calendar, Droplet,
  GraduationCap, IdCard, Lock, LogOut, X, Eye, EyeOff, Fingerprint,
  Building2, ShieldCheck, MessageCircle, FileText,
} from 'lucide-react';
import { buildContactLinks } from '@/shared/utils/contactLinks';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import { authService } from '@/modules/auth/auth.service';
import {
  studentDashboardService, type ActiveStudentContext,
} from '@/modules/students/studentDashboard.service';
import { PolicyFooter } from '@/shared/components/PolicyFooter';
import { CONSENT_SECTIONS, CURRENT_CONSENT_VERSION } from '@/shared/config/consent';

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
  const [school, setSchool] = useState<{
    name: string; address: string | null; phone: string | null;
    email: string | null; principalName: string | null; principalPhone: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  // Change-password modal state (mirrors src/views/ProfileView.tsx).
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword]         = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword]       = useState(false);
  const [savingPwd, setSavingPwd]             = useState(false);

  // Privacy / consent view state.
  // consent_version + consent_at live on the users row; the rest of this
  // screen reads from students. Separate one-row fetch on demand so the
  // initial profile paint isn't slowed by it.
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [consentInfo, setConsentInfo] = useState<{ version: number; at: string | null } | null>(null);

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

        // Pull the school's contact details + principal's name & phone so
        // the parent can reach out (especially after a REJECTED fee
        // submission — the rejection note tells them WHY, this card tells
        // them WHO to call). RLS allows any user with school_id = this
        // school to read the row, which covers students + parents.
        if (c.schoolId) {
          const { data: sch } = await supabase
            .from('schools')
            .select('name, address, phone, email, principal_name, principal_phone')
            .eq('id', c.schoolId)
            .maybeSingle();
          if (!cancelled && sch) {
            const s = sch as { name: string; address: string | null; phone: string | null;
              email: string | null; principal_name: string | null; principal_phone: string | null };
            setSchool({
              name: s.name,
              address: s.address,
              phone: s.phone,
              email: s.email,
              principalName: s.principal_name,
              principalPhone: s.principal_phone,
            });
          }
        }
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

  // Multi-child parent: show a switcher when the parent's session lists more
  // than one linked student. Switching just flips selectedStudentId in the
  // auth store; App.tsx already keys StudentLayout on it so every nested view
  // remounts and reloads for the newly-picked child. Pure UI — no DB writes.
  const linkedIds = session?.linkedStudentIds ?? [];
  const isParentWithMultiKids = session?.role === 'PARENT' && linkedIds.length > 1;
  const selectedStudentId = useAuthStore(s => s.selectedStudentId);
  const setSelectedStudentId = useAuthStore(s => s.setSelectedStudentId);
  const [linkedChildren, setLinkedChildren] = useState<Array<{ id: string; name: string; className: string | null; section: string | null }>>([]);

  useEffect(() => {
    if (!isParentWithMultiKids) { setLinkedChildren([]); return; }
    let cancelled = false;
    (async () => {
      // Look up the school's active academic year first so we render each
      // child's CURRENT class label, not whatever AR row Postgres happened
      // to return first. ctx.schoolId is already resolved for the active
      // student; all linked siblings share the same school.
      const schoolId = ctx?.schoolId ?? null;
      let activeYearId: string | null = null;
      if (schoolId) {
        const { data: yr } = await supabase
          .from('academic_years').select('id')
          .eq('school_id', schoolId).eq('is_active', true).maybeSingle();
        activeYearId = (yr as { id: string } | null)?.id ?? null;
      }

      const { data } = await supabase
        .from('students')
        .select('id, name, student_academic_records(class_name, section, academic_year_id)')
        .in('id', linkedIds);
      if (cancelled) return;
      type Row = { id: string; name: string; student_academic_records: Array<{ class_name: string | null; section: string | null; academic_year_id: string }> };
      const list = ((data ?? []) as unknown as Row[]).map(r => {
        // Pick the AR matching the active year; fall back to the first row
        // only when no active year is known (school in a "between years"
        // state).
        const ar = (activeYearId
          ? r.student_academic_records.find(a => a.academic_year_id === activeYearId)
          : null)
          ?? r.student_academic_records[0]
          ?? { class_name: null, section: null };
        return { id: r.id, name: r.name, className: ar.class_name, section: ar.section };
      });
      setLinkedChildren(list);
    })();
    return () => { cancelled = true; };
  }, [isParentWithMultiKids, linkedIds.join(','), ctx?.schoolId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="w-full lg:max-w-5xl lg:mx-auto bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
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

        {/* ── Child switcher — only when parent has multiple linked kids ─── */}
        {isParentWithMultiKids && linkedChildren.length > 1 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 px-4 pt-4 pb-2">Switch Child</p>
            <div className="px-4 pb-4 space-y-2">
              {linkedChildren.map(child => {
                const isActive = (selectedStudentId ?? linkedIds[0]) === child.id;
                const childInitials = child.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
                return (
                  <button key={child.id}
                    onClick={() => {
                      if (isActive) return;
                      setSelectedStudentId(child.id);
                      // App.tsx remounts StudentLayout on selectedStudentId change,
                      // which re-fetches the context for the new child.
                    }}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                      isActive
                        ? 'bg-emerald-50 border-emerald-300 shadow-sm'
                        : 'bg-slate-50 border-slate-200 hover:border-emerald-200 active:scale-[0.98]'
                    }`}>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm shrink-0 ${
                      isActive ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {childInitials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-black text-sm text-slate-900 truncate">{child.name}</div>
                      <div className="text-[10px] font-bold text-slate-400">
                        {child.className ? `${child.className}-${child.section ?? ''}` : 'Unassigned'}
                      </div>
                    </div>
                    {isActive && (
                      <span className="text-[9px] font-black text-emerald-700 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full uppercase shrink-0">
                        Viewing
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

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

            {/* School / Principal contact — surface here so the parent has
                an obvious place to find the school's number (especially
                after a REJECTED fee upload where the rejection note tells
                them WHY, and this card tells them WHO to call). */}
            {school && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 px-4 pt-4 pb-2">School &amp; Principal</p>
                <div className="flex items-start gap-3 px-4 py-3.5 border-b border-slate-50">
                  <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                    <Building2 size={15} className="text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">School</div>
                    <div className="font-bold text-slate-900 text-sm mt-0.5 break-words">{school.name}</div>
                    {school.address && (
                      <div className="text-[11px] font-bold text-slate-500 mt-1 break-words">{school.address}</div>
                    )}
                  </div>
                </div>
                {school.phone && (
                  <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-50">
                    <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                      <Phone size={15} className="text-emerald-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">School Phone</div>
                      <a href={`tel:${school.phone}`} className="font-bold text-emerald-600 text-sm mt-0.5 inline-block">{school.phone}</a>
                    </div>
                  </div>
                )}
                {school.email && (
                  <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-50">
                    <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center shrink-0">
                      <Mail size={15} className="text-slate-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">School Email</div>
                      <a href={`mailto:${school.email}`} className="font-bold text-slate-900 text-sm mt-0.5 break-all">{school.email}</a>
                    </div>
                  </div>
                )}
                <div className="px-4 py-3.5">
                  <div className="flex items-start gap-3 mb-2">
                    <div className="w-8 h-8 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
                      <ShieldCheck size={15} className="text-violet-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Principal</div>
                      <div className="font-bold text-slate-900 text-sm mt-0.5 truncate">{school.principalName || '—'}</div>
                      {school.principalPhone && (
                        <div className="text-[11px] font-bold text-slate-500 mt-0.5">{school.principalPhone}</div>
                      )}
                    </div>
                  </div>
                  {/* Twin Call + WhatsApp buttons. Phone is the same number
                      either way; tel: opens the dialer, wa.me opens the
                      WhatsApp chat with this contact. Indian parents
                      reach the principal almost entirely through
                      WhatsApp — the dual surface saves a copy-paste step. */}
                  {(() => {
                    const links = buildContactLinks(school.principalPhone);
                    if (!links) return null;
                    return (
                      <div className="flex gap-2 mt-1">
                        <a href={links.tel}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-emerald-50 border border-emerald-200 text-emerald-700 font-black text-xs rounded-xl hover:bg-emerald-100 active:scale-95 transition-all">
                          <Phone size={13} /> Call
                        </a>
                        <a href={links.whatsapp} target="_blank" rel="noopener noreferrer"
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-green-50 border border-green-200 text-green-700 font-black text-xs rounded-xl hover:bg-green-100 active:scale-95 transition-all">
                          <MessageCircle size={13} /> WhatsApp
                        </a>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

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
              <button onClick={async () => {
                  // Lazy-fetch on first open so initial profile paint stays fast.
                  if (!consentInfo && session?.userId) {
                    const { data } = await supabase.from('users')
                      .select('consent_version, consent_at').eq('id', session.userId).maybeSingle();
                    const row = data as { consent_version: number; consent_at: string | null } | null;
                    setConsentInfo({ version: row?.consent_version ?? 0, at: row?.consent_at ?? null });
                  }
                  setShowPrivacy(true);
                }}
                className="w-full flex items-center gap-3 px-4 py-3.5 border-t border-slate-50 active:bg-slate-50">
                <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                  <FileText size={15} className="text-blue-600" />
                </div>
                <div className="flex-1 text-left">
                  <div className="font-bold text-slate-900 text-sm">Privacy &amp; Data Use</div>
                  <div className="text-[9px] font-bold text-slate-400">What you agreed to — read the full policy</div>
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

        <PolicyFooter />
      </div>

      {/* Privacy & Data Use modal — full structured policy (DPDP §11
          right-to-information). Reads CONSENT_SECTIONS so the same
          content drives both this view and the first-login consent
          gate. */}
      {showPrivacy && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-end justify-center">
          <div className="w-full max-h-[92dvh] bg-white rounded-t-3xl flex flex-col animate-in slide-in-from-bottom-8">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100">
              <div className="min-w-0">
                <h3 className="text-lg font-black text-slate-900 leading-tight">Privacy &amp; Data Use</h3>
                <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                  {consentInfo?.at
                    ? `Agreed on ${formatDate(consentInfo.at)} · v${consentInfo.version}`
                    : `Version ${CURRENT_CONSENT_VERSION}`}
                </p>
              </div>
              <button onClick={() => setShowPrivacy(false)}
                className="p-2 -mr-2 text-slate-400 shrink-0"><X size={20} /></button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
              {CONSENT_SECTIONS.map(s => (
                <div key={s.number} className="bg-slate-50 rounded-2xl p-4">
                  <h4 className="font-black text-sm text-slate-900 mb-2">
                    {s.number}. {s.title}
                  </h4>
                  <p className="text-[12px] font-medium text-slate-700 leading-relaxed whitespace-pre-wrap">
                    {s.body}
                  </p>
                </div>
              ))}
              <p className="text-[10px] font-bold text-slate-400 text-center pt-2 pb-1">
                To withdraw consent, request a TC from your school principal.
              </p>
            </div>

            <div className="px-5 py-3 border-t border-slate-100">
              <button onClick={() => setShowPrivacy(false)}
                className="w-full py-3 bg-slate-900 text-white font-black text-sm rounded-2xl active:scale-95 transition-transform">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

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
