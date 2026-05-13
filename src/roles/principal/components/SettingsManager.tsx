import React, { useEffect, useState, useRef } from 'react';
import { ArrowLeft, Plus, Trash2, ChevronDown, ChevronUp, Save, QrCode, CreditCard, CheckCircle2, Lock, Eye, EyeOff, ShieldCheck, IndianRupee, Edit2, Building2, BookOpen, ChevronRight, X, Download, Database, History, ShieldOff, Unlock, Users, Search, KeyRound, AlertTriangle, Calendar, LogOut } from 'lucide-react';
import { apiPrincipal } from '@/lib/apiClient';
import { BackupCard } from '@/shared/components/BackupCard';
import { supabase } from '@/lib/supabase';
import { principalService } from '@/roles/principal/principal.service';
import { feeService } from '@/modules/fees/fee.service';
import { AcademicYearConfig, ClassConfig } from '@/roles/principal/principal.types';
import { useUIStore } from '@/store/uiStore';
import { authService } from '@/modules/auth/auth.service';
import { useAuthStore } from '@/store/authStore';
import { schoolInfoService, SchoolInfo } from '@/shared/utils/schoolInfo.service';
import { FeeStructureForm, FeeStructureItem } from '@/modules/fees/components/FeeStructureForm';
import { AuditLogsViewer } from '@/roles/principal/components/AuditLogsViewer';
import { useEditorModeStore } from '@/store/editorModeStore';
import { stripClassPrefix } from '@/shared/utils/className';
import { useAcademicYear } from '@/shared/context/AcademicYearContext';
import { PolicyFooter } from '@/shared/components/PolicyFooter';

type View = 'MENU' | 'SCHOOL_INFO' | 'CLASSES' | 'FEE_STRUCT' | 'FEE_STRUCT_EDIT' | 'PAYMENTS' | 'SECURITY' | 'DATA_EXPORT' | 'ACTIVITY_LOG' | 'USERS';

interface Props { onBack: () => void; initialView?: View; }


export const SettingsManager: React.FC<Props> = ({ onBack, initialView }) => {
  const { showToast } = useUIStore();
  const { activeYear, newYearCreationEnabled } = useAcademicYear();
  const [view, setView] = useState<View>(initialView ?? 'MENU');
  const [configs, setConfigs] = useState<AcademicYearConfig[]>([]);
  const [activeConfig, setActiveConfig] = useState<AcademicYearConfig | null>(null);
  const [expandedClass, setExpandedClass] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newSection, setNewSection] = useState('');
  const [upiId, setUpiId] = useState('school@upi');
  const [upiSaved, setUpiSaved] = useState(false);
  const [qrFileName, setQrFileName] = useState('');
  const [qrPreviewUrl, setQrPreviewUrl] = useState('');
  const [qrPreviewBroken, setQrPreviewBroken] = useState(false);
  const [qrUploading, setQrUploading] = useState(false);
  // School logo + principal signature uploads — used by every printable
  // document (ID cards, admit cards, marksheets, TC, bonafide).
  const [logoPreview, setLogoPreview] = useState('');
  const [logoUploading, setLogoUploading] = useState(false);
  const [signaturePreview, setSignaturePreview] = useState('');
  const [signatureUploading, setSignatureUploading] = useState(false);
  const [feeStructures, setFeeStructures] = useState<FeeStructureItem[]>([]);
  const [editingFs, setEditingFs] = useState<FeeStructureItem | null>(null);
  const [feeStructuresLoading, setFeeStructuresLoading] = useState(false);
  const [schoolInfo, setSchoolInfo] = useState<SchoolInfo>({
    name: '', tagline: '', address: '', city: '', state: '', pin: '',
    phone: '', email: '', principalName: '', affiliationBoard: 'CBSE', schoolCode: '',
  });
  const [schoolInfoSaving, setSchoolInfoSaving] = useState(false);

  useEffect(() => {
    schoolInfoService.get().then(async (info) => {
      setSchoolInfo(info);
      setUpiId(info.upiId || '');
      // Logo + signature previews — same cache-bust pattern as payment QR
      // so swapping the file from another device doesn't keep showing the
      // old image.
      if (info.logoPath) {
        const url = schoolInfoService.getAssetUrl(info.logoPath);
        setLogoPreview(url ? `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}` : '');
      }
      if (info.principalSignaturePath) {
        const url = schoolInfoService.getAssetUrl(info.principalSignaturePath);
        setSignaturePreview(url ? `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}` : '');
      }
      if (info.paymentQrPath) {
        setQrFileName(info.paymentQrPath.split('/').pop() || 'payment-qr');
        const url = await schoolInfoService.getPaymentQrUrl(info.paymentQrPath);
        // Cache-buster on initial load too — the public URL is stable so an
        // image swapped from another device would otherwise stay cached.
        setQrPreviewUrl(url ? `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}` : '');
        setQrPreviewBroken(false);
      }
    }).catch(e => showToast(e instanceof Error ? e.message : 'Failed to load school info', 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const session = useAuthStore(s => s.session);
  const setSession = useAuthStore(s => s.setSession);
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwShow, setPwShow] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  // Loading flag for the "sign out from other devices" button. Gates
  // re-tap during the in-flight Supabase call so we don't fire two
  // global token revocations in parallel.
  const [signOutOthersBusy, setSignOutOthersBusy] = useState(false);

  // Email-OTP 2FA — current state from public.users.email_otp_2fa.
  // Loaded on mount so the toggle reflects what's persisted, not an
  // optimistic placeholder. Only shown for principal / super-admin.
  const [otp2faEnabled, setOtp2faEnabled] = useState<boolean | null>(null);
  const [otp2faSaving, setOtp2faSaving] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (!session?.userId) return;
    if (session.role !== 'PRINCIPAL' && session.role !== 'SUPER_ADMIN') return;
    (async () => {
      try {
        const { data } = await supabase.from('users').select('email_otp_2fa').eq('id', session.userId).maybeSingle();
        if (cancelled) return;
        setOtp2faEnabled(!!(data as { email_otp_2fa?: boolean } | null)?.email_otp_2fa);
      } catch {
        if (!cancelled) setOtp2faEnabled(false);
      }
    })();
    return () => { cancelled = true; };
  }, [session?.userId, session?.role]);

  // Editor Mode
  const editorEnabled = useEditorModeStore(s => s.isActive());
  const editorPending = useEditorModeStore(s => s.pending);
  const editorEnable  = useEditorModeStore(s => s.enable);
  const editorDisable = useEditorModeStore(s => s.disable);
  const editorRemMs   = useEditorModeStore(s => s.remainingMs);
  // Editor Mode confirmation went through a local boolean +
  // inline modal earlier; both call sites (toggle and main button)
  // now route through the global askMobileConfirm flow above, so
  // there's no local state needed here anymore.
  // tick refreshes every second so the countdown display updates
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!editorEnabled) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [editorEnabled]);
  const fmtRemaining = () => {
    const ms = editorRemMs();
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  useEffect(() => {
    principalService.getAYConfig().then(data => {
      setConfigs(data);
      setActiveConfig(data.find(c => c.isActive) ?? data[0] ?? null);
    });
  }, []);

  useEffect(() => {
    if (view !== 'FEE_STRUCT') return;
    setFeeStructuresLoading(true);
    feeService.getFeeStructures()
      .then(rows => setFeeStructures(rows))
      .catch(e => showToast(e instanceof Error ? e.message : 'Failed to load fee structures', 'error'))
      .finally(() => setFeeStructuresLoading(false));
    // Depend on activeYear?.id so the list re-fetches after a year switch.
    // feeService.getFeeStructures resolves the year internally via the
    // active session — flipping the active year invalidates upstream caches
    // and we need to re-pull to show the new year's structures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, activeYear?.id]);

  const handleChangePassword = async () => {
    if (!session) return;
    setPwError('');
    if (!pwCurrent || !pwNew || !pwConfirm) { setPwError('All fields required'); return; }
    if (pwNew.length < 6) { setPwError('New password must be at least 6 characters'); return; }
    if (pwNew === pwCurrent) { setPwError('New password must differ from current password'); return; }
    if (pwNew !== pwConfirm) { setPwError('Passwords do not match'); return; }
    setPwSaving(true);
    try {
      await authService.changePassword(pwCurrent, pwNew);
      if (session.mustChangePassword) setSession({ ...session, mustChangePassword: false });
      setPwCurrent(''); setPwNew(''); setPwConfirm('');
      showToast('Password changed successfully');
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'Could not change password');
    } finally {
      setPwSaving(false);
    }
  };


  const handleAddClass = async () => {
    if (!activeConfig || !newClassName.trim()) { showToast('Class name required', 'error'); return; }
    const newClasses = [...activeConfig.classes, { name: newClassName.trim(), sections: ['A'] }];
    const updated = await principalService.updateAYConfig(activeConfig.id, { classes: newClasses });
    setActiveConfig(updated);
    setConfigs(prev => prev.map(c => c.id === updated.id ? updated : c));
    setNewClassName('');
    showToast(`${newClassName} added`);
  };

  const handleAddSection = async (className: string) => {
    if (!activeConfig || !newSection.trim()) { showToast('Section letter required', 'error'); return; }
    const newClasses = activeConfig.classes.map(c => c.name === className ? { ...c, sections: [...c.sections, newSection.trim().toUpperCase()] } : c);
    const updated = await principalService.updateAYConfig(activeConfig.id, { classes: newClasses });
    setActiveConfig(updated);
    setConfigs(prev => prev.map(c => c.id === updated.id ? updated : c));
    setNewSection('');
    showToast(`Section ${newSection.toUpperCase()} added to ${className}`);
  };

  const handleRemoveSection = async (className: string, section: string) => {
    if (!activeConfig) return;
    const newClasses = activeConfig.classes.map(c => c.name === className ? { ...c, sections: c.sections.filter(s => s !== section) } : c);
    const updated = await principalService.updateAYConfig(activeConfig.id, { classes: newClasses });
    setActiveConfig(updated);
    setConfigs(prev => prev.map(c => c.id === updated.id ? updated : c));
  };

  const handleRemoveClass = async (className: string) => {
    if (!activeConfig) return;
    const newClasses = activeConfig.classes.filter(c => c.name !== className);
    const updated = await principalService.updateAYConfig(activeConfig.id, { classes: newClasses });
    setActiveConfig(updated);
    setConfigs(prev => prev.map(c => c.id === updated.id ? updated : c));
    showToast(`${className} removed`);
  };


  const handleDeleteFs = async (id: string) => {
    try {
      await feeService.deleteFeeStructure(id);
      setFeeStructures(prev => prev.filter(f => f.id !== id));
      showToast('Fee structure removed');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to delete fee structure', 'error');
    }
  };

  const handleSaveFs = async (data: FeeStructureItem) => {
    try {
      const saved = await feeService.saveFeeStructure(data);
      setFeeStructures(prev => {
        const exists = prev.some(f => f.id === saved.id);
        return exists ? prev.map(f => f.id === saved.id ? saved : f) : [...prev, saved];
      });
      setEditingFs(null);
      setView('FEE_STRUCT');
      showToast(`Fee structure "${saved.name}" saved`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to save fee structure', 'error');
    }
  };

  const handleSaveSchoolInfo = async () => {
    setSchoolInfoSaving(true);
    try {
      await schoolInfoService.save(schoolInfo);
      showToast('School information saved');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to save school info', 'error');
    } finally {
      setSchoolInfoSaving(false);
    }
  };

  const renderHeader = (title: string) => (
    <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 sticky top-0 z-10 shadow-sm flex items-center gap-3">
      <button onClick={() => setView('MENU')} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
        <ArrowLeft size={20} />
      </button>
      <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">{title}</h2>
    </div>
  );

  // MENU VIEW
  if (view === 'MENU') return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 sticky top-0 z-10 shadow-sm flex items-center gap-3">
        <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Settings</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">

        {/* ── Editor Mode card ────────────────────────────────────────────── */}
        <div className={`rounded-2xl border p-4 shadow-sm ${
          editorEnabled
            ? 'bg-amber-50 border-amber-200'
            : 'bg-white border-slate-100'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
              editorEnabled ? 'bg-amber-200' : 'bg-slate-100'
            }`}>
              {editorEnabled
                ? <Unlock size={20} className="text-amber-700" />
                : <Lock size={20} className="text-slate-500" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-extrabold text-slate-900 text-sm">Editor Mode</div>
              <div className={`text-[10px] font-bold mt-0.5 ${
                editorEnabled ? 'text-amber-700' : 'text-slate-400'
              }`}>
                {editorEnabled
                  ? `ON · auto-disables in ${fmtRemaining()}`
                  : 'OFF · enable to edit student assignments'}
              </div>
            </div>
            <button
              disabled={editorPending}
              onClick={async () => {
                if (editorPending) return;
                if (editorEnabled) {
                  editorDisable().catch(e => showToast(e instanceof Error ? e.message : 'Disable failed', 'error'));
                  return;
                }
                // Type-to-confirm gate. Replaces the simple yes/no
                // confirm — that was one careless tap away from
                // opening Editor Mode. Mobile last-4 is something
                // only the principal knows from memory.
                const last4 = (session?.mobileNumber ?? '').replace(/\D/g, '').slice(-4);
                if (last4.length !== 4) {
                  showToast('Mobile number missing on profile — set it first', 'error');
                  return;
                }
                const ok = await useUIStore.getState().askMobileConfirm({
                  title: 'Enable Editor Mode?',
                  message: 'Editor Mode 30 minute baad automatically band ho jayega. Sensitive cheejen change ho sakti hain — sirf zarurat par enable karein.',
                  expectedLast4: last4,
                });
                if (ok) {
                  editorEnable().catch(e => showToast(e instanceof Error ? e.message : 'Enable failed', 'error'));
                }
              }}
              className={`px-4 py-2 rounded-xl text-[11px] font-black transition-colors disabled:opacity-50 ${
                editorEnabled
                  ? 'bg-amber-500 text-white active:bg-amber-600'
                  : 'bg-slate-900 text-white active:bg-slate-700'
              }`}>
              {editorPending ? '…' : editorEnabled ? 'Disable' : 'Enable'}
            </button>
          </div>
          {editorEnabled && (
            <div className="mt-3 flex items-start gap-2 bg-amber-100/70 rounded-xl p-2.5">
              <ShieldOff size={13} className="text-amber-700 shrink-0 mt-0.5" />
              <p className="text-[10px] font-bold text-amber-800">
                Class assignments, roll numbers and sensitive student details can now be changed.
                Disable when done.
              </p>
            </div>
          )}
        </div>

        {/* Editor-mode confirmation moved to the global
            <MobileConfirmModal /> mounted at the app root — single
            source of truth for type-to-confirm gates. */}

        {/* Academic Year summary — moved from the dashboard hero so the
            chip lives where year-level configuration belongs. Shows the
            active year + the SUPER_ADMIN-controlled new-year-creation
            toggle state so the principal knows immediately whether the
            wizard is gated. Non-interactive: year management still
            happens from the dashboard's Year tile. */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-4 flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-white flex items-center justify-center shrink-0 shadow-sm">
            <Calendar size={20} className="text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-black uppercase tracking-widest text-blue-700">Academic Year</div>
            <div className="font-extrabold text-slate-900 text-sm mt-0.5">
              {activeYear ? activeYear.name : 'No active year'}
            </div>
            <div className={`text-[10px] font-black mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${
              newYearCreationEnabled
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-slate-200 text-slate-600'
            }`}>
              {newYearCreationEnabled ? '● New-year creation ENABLED' : '○ New-year creation DISABLED'}
            </div>
            {!newYearCreationEnabled && (
              <p className="text-[10px] font-bold text-slate-500 mt-1.5 leading-relaxed">
                Platform admin will turn this on when it's time to start the next year.
              </p>
            )}
          </div>
        </div>

        {/* Capacity meters — students + staff used vs school's hard cap.
            Hidden when no cap is set. The DB rejects new rows once the
            count hits the cap; this surface gives early warning so the
            principal can request a higher limit before they're blocked. */}
        <CapacityMeters />

        {[
          { icon: Building2, title: 'School Info',    desc: 'School details & contact info',    iconBg: 'bg-blue-100',    iconColor: 'text-blue-600',    action: () => setView('SCHOOL_INFO') },
          // Classes/sections are now set in the Academic Year wizard. The legacy
          // CLASSES view is kept in this file but is no longer reachable from
          // the menu — section editing post-wizard will get its own dedicated
          // surface in a future task.
          { icon: IndianRupee, title: 'Fee Structure', desc: 'Class-wise fee configuration',   iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600', action: () => setView('FEE_STRUCT') },
          { icon: CreditCard, title: 'Payments',      desc: 'UPI & QR code setup',             iconBg: 'bg-orange-100',  iconColor: 'text-orange-600',  action: () => setView('PAYMENTS') },
          { icon: Lock,      title: 'Security',       desc: 'Password & account security',     iconBg: 'bg-rose-100',    iconColor: 'text-rose-600',    action: () => setView('SECURITY') },
          { icon: Users,     title: 'Users',          desc: 'Students & staff connected to this school · reset passwords', iconBg: 'bg-indigo-100', iconColor: 'text-indigo-600', action: () => setView('USERS') },
          { icon: History,   title: 'Activity Logs',  desc: 'Who changed what · old → new · date/time',  iconBg: 'bg-violet-100',  iconColor: 'text-violet-600',  action: () => setView('ACTIVITY_LOG') },
          { icon: Database,  title: 'Download Data',  desc: 'Operational JSON snapshot — not a full DB backup',  iconBg: 'bg-cyan-100',    iconColor: 'text-cyan-600',    action: () => setView('DATA_EXPORT') },
        ].map(({ icon: Icon, title, desc, iconBg, iconColor, action }) => (
          <button key={title} onClick={action}
            className="w-full flex items-center gap-4 bg-white border border-slate-100 rounded-2xl p-4 shadow-sm text-left active:scale-[0.98] transition-transform">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
              <Icon size={20} className={iconColor} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-extrabold text-slate-900 text-sm">{title}</div>
              <div className="text-[10px] font-bold text-slate-400 mt-0.5">{desc}</div>
            </div>
            <ChevronRight size={16} className="text-slate-300 shrink-0" />
          </button>
        ))}

        <PolicyFooter />
      </div>
    </div>
  );

  // USERS VIEW — students + staff connected to the school, with password reset
  if (view === 'USERS') return <UsersView onBack={() => setView('MENU')} />;

  // SCHOOL INFO VIEW
  if (view === 'SCHOOL_INFO') return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader('School Information')}
      <div className="flex-1 overflow-y-auto p-4  space-y-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Basic Info</p>
          {([
            { label: 'School Name', key: 'name', readOnly: false },
            { label: 'Tagline/Motto', key: 'tagline', readOnly: false },
            { label: 'Principal Name', key: 'principalName', readOnly: false },
            { label: 'Affiliation Board', key: 'affiliationBoard', readOnly: false },
            // School Code is the immutable identifier set at school provisioning
            // time — schoolInfoService.save() does not persist changes to it.
            // Render disabled so the UI matches data rules.
            { label: 'School Code', key: 'schoolCode', readOnly: true },
          ] as Array<{ label: string; key: keyof SchoolInfo; readOnly: boolean }>).map(({ label, key, readOnly }) => (
            <div key={key}>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                {label}{readOnly && <span className="ml-2 text-slate-400 font-bold">(read-only)</span>}
              </label>
              <input
                value={schoolInfo[key]}
                onChange={e => setSchoolInfo(prev => ({ ...prev, [key]: e.target.value }))}
                disabled={readOnly}
                readOnly={readOnly}
                className={`w-full border rounded-xl px-4 py-3 font-bold text-sm outline-none ${
                  readOnly
                    ? 'border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed'
                    : 'border-slate-200 bg-slate-50 focus:border-indigo-500'
                }`}
              />
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Contact Info</p>
          {([
            { label: 'Address', key: 'address' },
            { label: 'City', key: 'city' },
            { label: 'State', key: 'state' },
            { label: 'PIN Code', key: 'pin' },
            { label: 'Phone Number', key: 'phone' },
            { label: 'Email Address', key: 'email' },
          ] as Array<{ label: string; key: keyof SchoolInfo }>).map(({ label, key }) => (
            <div key={key}>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">{label}</label>
              <input value={schoolInfo[key]} onChange={e => setSchoolInfo(prev => ({ ...prev, [key]: e.target.value }))} className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500" />
            </div>
          ))}
        </div>

        {/* School logo — auto-applied to ID cards, admit cards, marksheets, TC, bonafide */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">School Logo</p>
          <p className="text-[11px] font-bold text-slate-500 leading-snug">
            Auto-applied to every printable document (ID cards, admit cards, marksheets, TC, bonafide).
          </p>
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-2xl bg-slate-100 border-2 border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
              {logoPreview ? (
                <img src={logoPreview} alt="School logo" className="w-full h-full object-contain" />
              ) : (
                <Building2 size={28} className="text-slate-400" />
              )}
            </div>
            <div className="flex-1 space-y-2">
              <label className="block">
                <input type="file" accept="image/*" className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (!file.type.startsWith('image/')) {
                      showToast('Please pick an image file (PNG, JPG, SVG)', 'error'); return;
                    }
                    if (file.size > 2 * 1024 * 1024) {
                      showToast('Logo must be 2 MB or smaller', 'error'); return;
                    }
                    setLogoUploading(true);
                    try {
                      const path = await schoolInfoService.uploadLogo(file);
                      await schoolInfoService.save({ logoPath: path });
                      const url = schoolInfoService.getAssetUrl(path);
                      setLogoPreview(url ? `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}` : '');
                      setSchoolInfo(prev => ({ ...prev, logoPath: path }));
                      showToast('School logo uploaded');
                    } catch (err) {
                      showToast(err instanceof Error ? err.message : 'Logo upload failed', 'error');
                    } finally {
                      setLogoUploading(false);
                      e.target.value = '';
                    }
                  }} />
                <span className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-black text-[11px] uppercase tracking-widest cursor-pointer transition-colors ${
                  logoUploading ? 'bg-slate-200 text-slate-500 cursor-wait' : 'bg-slate-900 hover:bg-black text-white'
                }`}>
                  {logoUploading ? 'Uploading…' : (logoPreview ? 'Replace Logo' : 'Upload Logo')}
                </span>
              </label>
              {logoPreview && (
                <button onClick={async () => {
                  await schoolInfoService.save({ logoPath: '' });
                  setLogoPreview('');
                  setSchoolInfo(prev => ({ ...prev, logoPath: '' }));
                  showToast('Logo removed');
                }} className="text-[10px] font-bold text-rose-500 hover:text-rose-700 uppercase tracking-widest">
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Principal signature — used in TC / bonafide / marksheet footers */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Principal Signature</p>
          <p className="text-[11px] font-bold text-slate-500 leading-snug">
            Printed on TC, bonafide certificates, and marksheets. Use a transparent PNG.
          </p>
          <div className="flex items-center gap-4">
            <div className="w-28 h-16 rounded-xl bg-slate-50 border-2 border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
              {signaturePreview ? (
                <img src={signaturePreview} alt="Principal signature" className="max-w-full max-h-full object-contain" />
              ) : (
                <span className="text-[9px] font-bold text-slate-400">No signature</span>
              )}
            </div>
            <div className="flex-1 space-y-2">
              <label className="block">
                <input type="file" accept="image/*" className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (!file.type.startsWith('image/')) {
                      showToast('Please pick an image file (PNG, JPG)', 'error'); return;
                    }
                    if (file.size > 2 * 1024 * 1024) {
                      showToast('Signature must be 2 MB or smaller', 'error'); return;
                    }
                    setSignatureUploading(true);
                    try {
                      const path = await schoolInfoService.uploadPrincipalSignature(file);
                      await schoolInfoService.save({ principalSignaturePath: path });
                      const url = schoolInfoService.getAssetUrl(path);
                      setSignaturePreview(url ? `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}` : '');
                      setSchoolInfo(prev => ({ ...prev, principalSignaturePath: path }));
                      showToast('Signature uploaded');
                    } catch (err) {
                      showToast(err instanceof Error ? err.message : 'Signature upload failed', 'error');
                    } finally {
                      setSignatureUploading(false);
                      e.target.value = '';
                    }
                  }} />
                <span className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-black text-[11px] uppercase tracking-widest cursor-pointer transition-colors ${
                  signatureUploading ? 'bg-slate-200 text-slate-500 cursor-wait' : 'bg-slate-900 hover:bg-black text-white'
                }`}>
                  {signatureUploading ? 'Uploading…' : (signaturePreview ? 'Replace Signature' : 'Upload Signature')}
                </span>
              </label>
              {signaturePreview && (
                <button onClick={async () => {
                  await schoolInfoService.save({ principalSignaturePath: '' });
                  setSignaturePreview('');
                  setSchoolInfo(prev => ({ ...prev, principalSignaturePath: '' }));
                  showToast('Signature removed');
                }} className="text-[10px] font-bold text-rose-500 hover:text-rose-700 uppercase tracking-widest">
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={handleSaveSchoolInfo}
          disabled={schoolInfoSaving}
          className={`w-full flex items-center justify-center gap-2 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl transition-transform shadow-lg ${
            schoolInfoSaving
              ? 'bg-slate-500 cursor-not-allowed opacity-80'
              : 'bg-slate-900 active:scale-95'
          }`}
        >
          <Save size={16} /> {schoolInfoSaving ? 'Saving…' : 'Save School Info'}
        </button>
      </div>
    </div>
  );

  // CLASSES VIEW
  if (view === 'CLASSES') return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader('Classes')}
      <div className="flex-1 overflow-y-auto p-4  space-y-4">
        {activeConfig && (
          <>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Add New Class</p>
              <div className="flex gap-2">
                <input value={newClassName} onChange={e => setNewClassName(e.target.value)} placeholder="e.g. Class 11" className="flex-1 border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-slate-900" />
                <button onClick={handleAddClass} className="p-3 bg-slate-900 text-white rounded-xl"><Plus size={16} /></button>
              </div>
            </div>

            <div className="space-y-2">
              {activeConfig.classes.map(cls => (
                <div key={cls.name} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <button onClick={() => setExpandedClass(expandedClass === cls.name ? null : cls.name)} className="w-full flex items-center justify-between p-4">
                    <span className="font-extrabold text-slate-900 text-sm">{cls.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black text-slate-400">{cls.sections.length} sections</span>
                      <button onClick={e => { e.stopPropagation(); handleRemoveClass(cls.name); }} className="p-1 text-slate-300 hover:text-rose-500 transition-colors"><Trash2 size={13} /></button>
                      {expandedClass === cls.name ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                    </div>
                  </button>
                  {expandedClass === cls.name && (
                    <div className="px-4 pb-4 space-y-3 border-t border-slate-50">
                      <div className="flex flex-wrap gap-2 pt-3">
                        {cls.sections.map(sec => (
                          <div key={sec} className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 rounded-full pl-3 pr-2 py-1.5">
                            <span className="text-xs font-black text-indigo-700">Sec {sec}</span>
                            <button onClick={() => handleRemoveSection(cls.name, sec)}
                              className="w-4 h-4 bg-indigo-200 hover:bg-rose-400 hover:text-white text-indigo-600 rounded-full flex items-center justify-center transition-colors">
                              <X size={9} />
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input value={expandedClass === cls.name ? newSection : ''} onChange={e => setNewSection(e.target.value)} placeholder="Section letter (e.g. C)" className="flex-1 border border-slate-200 bg-slate-50 rounded-xl px-3 py-2.5 font-bold text-sm outline-none" />
                        <button onClick={() => handleAddSection(cls.name)} className="p-2.5 bg-indigo-600 text-white rounded-xl"><Plus size={14} /></button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );

  // FEE STRUCT — list view
  if (view === 'FEE_STRUCT') return (
    <>
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader('Fee Structure')}
      <div className="flex-1 overflow-y-auto p-4  space-y-4">
        <button
          onClick={() => { setEditingFs(null); setView('FEE_STRUCT_EDIT'); }}
          className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg"
        >
          <Plus size={16} /> Create Fee Structure
        </button>

        <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-3">
          <p className="text-xs font-black text-indigo-700">Define class-wise fee structures with custom fee heads, due dates, and late fee rules.</p>
        </div>

        <div className="space-y-2">
          {feeStructures.length === 0 && (
            <div className="flex flex-col items-center py-12 text-slate-400">
              <IndianRupee size={32} className="mb-3 opacity-30" />
              <p className="font-bold text-sm">No fee structures yet</p>
              <p className="text-[10px] font-bold text-slate-300 mt-1">Create one to get started</p>
            </div>
          )}
          {feeStructures.map(fs => {
            const annualTotal = fs.feeHeads.reduce((s, h) => {
              if (h.frequency === 'MONTHLY') return s + h.amount * 12;
              return s + h.amount;
            }, 0);
            // structureType is 'CLASS' (default) or 'VEHICLE' — distinguishes
            // class-wide tuition/fee templates from per-vehicle transport
            // schedules. Field comes back from feeService.getFeeStructures.
            const isVehicle = (fs as { structureType?: 'CLASS' | 'VEHICLE' }).structureType === 'VEHICLE';
            const tileLabel = isVehicle ? 'BUS' : stripClassPrefix(fs.className).slice(0, 4);
            const tileClass = isVehicle
              ? 'w-10 h-10 rounded-xl bg-orange-50 text-orange-700 flex items-center justify-center font-black text-xs shrink-0 text-center leading-tight'
              : 'w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-black text-xs shrink-0 text-center leading-tight';
            return (
              <div key={fs.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3.5">
                  <div className={tileClass}>
                    {tileLabel}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="font-extrabold text-slate-900 text-sm truncate">{fs.name}</span>
                      <span className={`shrink-0 text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full ${
                        isVehicle ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {isVehicle ? 'Vehicle' : 'Class'}
                      </span>
                    </div>
                    <div className="text-[10px] font-bold text-slate-400">
                      {fs.className} · {fs.feeHeads.length} fee heads · ₹{annualTotal.toLocaleString('en-IN')}/yr
                      {fs.lateFee.enabled && <span className="ml-1 text-amber-600">· Late fee on</span>}
                    </div>
                  </div>
                  {editorEnabled && (
                    <div className="flex gap-1.5 shrink-0">
                      <button onClick={() => { setEditingFs(fs); setView('FEE_STRUCT_EDIT'); }} className="p-2 bg-indigo-50 text-indigo-600 rounded-xl"><Edit2 size={13} /></button>
                      <button onClick={() => handleDeleteFs(fs.id)} className="p-2 bg-rose-50 text-rose-500 rounded-xl"><Trash2 size={13} /></button>
                    </div>
                  )}
                </div>
                {fs.feeHeads.length > 0 && (
                  <div className="px-4 pb-3.5 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                    {fs.feeHeads.slice(0, 4).map(h => (
                      <span key={h.id}
                        className="inline-flex items-center gap-1 text-[10px] font-bold bg-slate-50 border border-slate-200 text-slate-700 px-2.5 py-1 rounded-full">
                        <span className="font-black">{h.name}</span>
                        <span className="text-slate-400">·</span>
                        <span className="text-emerald-600 font-black">₹{h.amount.toLocaleString('en-IN')}</span>
                        <span className="text-slate-400 text-[9px]">{h.frequency === 'MONTHLY' ? '/mo' : 'once'}</span>
                      </span>
                    ))}
                    {fs.feeHeads.length > 4 && (
                      <span className="inline-flex items-center text-[10px] font-black bg-indigo-50 border border-indigo-200 text-indigo-600 px-2.5 py-1 rounded-full">
                        +{fs.feeHeads.length - 4} more
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>

    </>
  );

  // FEE STRUCT — create/edit form (delegates to FeeStructureForm component)
  if (view === 'FEE_STRUCT_EDIT') return (
    <FeeStructureForm
      initialData={editingFs ?? undefined}
      activeYearLabel={activeConfig?.label ?? ''}
      activeYearStartDate={activeConfig?.startDate ?? ''}
      onSave={handleSaveFs}
      onBack={() => setView('FEE_STRUCT')}
    />
  );

  // PAYMENTS VIEW
  if (view === 'PAYMENTS') return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader('Payments')}
      <div className="flex-1 overflow-y-auto p-4  space-y-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <CreditCard size={16} className="text-blue-600" />
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">UPI Payment ID</p>
          </div>
          <p className="text-xs font-bold text-slate-500">This UPI ID will be shown to parents in the fee payment screen.</p>
          <div className="flex gap-2">
            <input value={upiId} onChange={e => { setUpiId(e.target.value); setUpiSaved(false); }} placeholder="e.g. school@okaxis" className="flex-1 border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-blue-500" />
            <button onClick={async () => { await schoolInfoService.save({ upiId }); setUpiSaved(true); showToast('UPI ID saved'); }} className={`px-4 py-3 rounded-xl font-black text-sm transition-colors ${upiSaved ? 'bg-emerald-500 text-white' : 'bg-slate-900 text-white'}`}>
              {upiSaved ? <CheckCircle2 size={16} /> : <Save size={16} />}
            </button>
          </div>
          {upiId && <div className="flex items-center gap-2 bg-blue-50 rounded-xl px-3 py-2"><QrCode size={14} className="text-blue-600 shrink-0" /><span className="text-xs font-black text-blue-700">{upiId}</span></div>}
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <QrCode size={16} className="text-violet-600" />
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Payment QR Code</p>
          </div>
          <p className="text-xs font-bold text-slate-500">Upload a QR code image. Parents can scan this to pay fees directly.</p>

          <div className="w-36 h-36 mx-auto bg-slate-100 rounded-2xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center gap-2 overflow-hidden">
            {qrPreviewUrl && !qrPreviewBroken ? (
              <img
                src={qrPreviewUrl}
                alt="Payment QR code"
                className="w-full h-full object-contain rounded-2xl"
                onError={() => setQrPreviewBroken(true)}
              />
            ) : qrPreviewUrl && qrPreviewBroken ? (
              <>
                <QrCode size={28} className="text-rose-300" />
                <span className="text-[9px] font-black text-rose-400 uppercase tracking-widest text-center px-2">Image unavailable</span>
              </>
            ) : (
              <>
                <QrCode size={28} className="text-slate-300" />
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">No QR</span>
              </>
            )}
          </div>

          <label className={`w-full flex items-center justify-center gap-2 bg-violet-600 text-white font-black text-xs uppercase tracking-widest py-3 rounded-2xl cursor-pointer active:scale-95 transition-transform ${qrUploading ? 'opacity-60 pointer-events-none' : ''}`}>
            <Plus size={14} /> {qrUploading ? 'Uploading…' : (qrFileName ? 'Replace QR Image' : 'Upload QR Image')}
            <input type="file" accept="image/*" className="hidden" disabled={qrUploading} onChange={e => {
              const file = e.target.files?.[0];
              // Reset the input so picking the same file again still fires onChange.
              e.target.value = '';
              if (!file) return;
              // Guardrails: image MIME + 2 MB cap. Storage will accept anything,
              // but parents view this on slow mobile connections so we want
              // small, image-only payloads.
              if (!file.type.startsWith('image/')) {
                showToast('Please pick an image file (PNG, JPG, etc.)', 'error');
                return;
              }
              const MAX_BYTES = 2 * 1024 * 1024;
              if (file.size > MAX_BYTES) {
                showToast('QR image must be 2 MB or smaller', 'error');
                return;
              }
              setQrUploading(true);
              (async () => {
                const path = await schoolInfoService.uploadPaymentQr(file);
                await schoolInfoService.save({ paymentQrPath: path });
                const url = await schoolInfoService.getPaymentQrUrl(path);
                setQrFileName(file.name);
                // Cache-buster — the storage object name is stable, so without
                // a query param the browser keeps showing the previous image.
                setQrPreviewUrl(url ? `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}` : '');
                setQrPreviewBroken(false);
                showToast(`QR image "${file.name}" uploaded`);
              })()
                .catch(err => showToast(err instanceof Error ? err.message : 'QR upload failed', 'error'))
                .finally(() => setQrUploading(false));
            }} />
          </label>

          {qrFileName && (
            <div className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2.5">
              <span className="text-xs font-bold text-slate-600 truncate">{qrFileName}</span>
              <button onClick={async () => { await schoolInfoService.save({ paymentQrPath: '' }); setQrFileName(''); setQrPreviewUrl(''); setQrPreviewBroken(false); }} className="text-slate-400 hover:text-rose-500 transition-colors ml-2 shrink-0"><Trash2 size={13} /></button>
            </div>
          )}
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
          <p className="text-xs font-black text-blue-700">UPI ID and QR code are shown in the student/parent Fee Payment screen.</p>
        </div>
      </div>
    </div>
  );

  // SECURITY VIEW
  if (view === 'SECURITY') return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader('Security')}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* ── Editor Mode ─────────────────────────────────────────────────── */}
        <div className={`rounded-2xl border p-4 shadow-sm ${
          editorEnabled ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-100'
        }`}>
          <div className="flex items-center gap-2 mb-3">
            {editorEnabled
              ? <Unlock size={16} className="text-amber-600" />
              : <Lock size={16} className="text-slate-500" />}
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Editor Mode</p>
            <span className={`ml-auto text-[10px] font-black px-2 py-0.5 rounded-full ${
              editorEnabled ? 'bg-amber-200 text-amber-800' : 'bg-slate-100 text-slate-500'
            }`}>
              {editorEnabled ? `ON · ${fmtRemaining()}` : 'OFF'}
            </span>
          </div>
          <p className="text-xs font-bold text-slate-600 mb-3 leading-relaxed">
            {editorEnabled
              ? 'Editor Mode is active. Class assignments and locked student fields can be changed. Disable when done.'
              : 'Enable to allow changes to class assignments, roll numbers, and other locked student fields.'}
          </p>
          <button
            onClick={async () => {
              if (editorEnabled) {
                editorDisable().catch(e => showToast(e instanceof Error ? e.message : 'Disable failed', 'error'));
                return;
              }
              // Same type-to-confirm gate as the toggle above. Both
              // call paths route through askMobileConfirm so a casual
              // tap can't open Editor Mode regardless of which UI
              // surface the principal touched.
              const last4 = (session?.mobileNumber ?? '').replace(/\D/g, '').slice(-4);
              if (last4.length !== 4) {
                showToast('Mobile number missing on profile — set it first', 'error');
                return;
              }
              const ok = await useUIStore.getState().askMobileConfirm({
                title: 'Enable Editor Mode?',
                message: 'Editor Mode 30 minute baad automatically band ho jayega. Sensitive cheejen change ho sakti hain — sirf zarurat par enable karein.',
                expectedLast4: last4,
              });
              if (ok) {
                editorEnable().catch(e => showToast(e instanceof Error ? e.message : 'Enable failed', 'error'));
              }
            }}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-black text-xs transition-colors ${
              editorEnabled
                ? 'bg-rose-100 text-rose-700 active:bg-rose-200'
                : 'bg-amber-500 text-white active:bg-amber-600'
            }`}>
            {editorEnabled ? <><ShieldOff size={14} /> Disable Editor Mode</> : <><Unlock size={14} /> Enable Editor Mode</>}
          </button>
        </div>

        {session?.mustChangePassword && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-2">
            <ShieldCheck size={18} className="text-amber-700 shrink-0 mt-0.5" />
            <p className="text-xs font-black text-amber-800">You're still using the temporary password. Please set a new one.</p>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Lock size={16} className="text-blue-600" />
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Change Password</p>
          </div>

          {pwError && <div className="bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 text-xs font-bold text-rose-700">{pwError}</div>}

          {[
            { label: 'Current Password', key: 'pwCurrent' },
            { label: 'New Password', key: 'pwNew', placeholder: 'Min 6 characters' },
            { label: 'Confirm New Password', key: 'pwConfirm', placeholder: 'Re-enter new password' },
          ].map(({ label, key, placeholder }) => (
            <div key={key}>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">{label}</label>
              <div className="relative">
                <input type={pwShow ? 'text' : 'password'} value={(key === 'pwCurrent' ? pwCurrent : key === 'pwNew' ? pwNew : pwConfirm)} onChange={e => key === 'pwCurrent' ? setPwCurrent(e.target.value) : key === 'pwNew' ? setPwNew(e.target.value) : setPwConfirm(e.target.value)} placeholder={placeholder} className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 pr-11 font-bold text-sm outline-none focus:border-blue-500" />
                <button type="button" onClick={() => setPwShow(!pwShow)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                  {pwShow ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          ))}

          <button onClick={handleChangePassword} disabled={pwSaving} className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white font-black text-xs uppercase tracking-widest py-3 rounded-2xl active:scale-95 transition-transform disabled:opacity-60">
            {pwSaving ? 'Saving…' : <><Save size={14} /> Update Password</>}
          </button>
        </div>

        {/* Email-OTP 2FA — principal / super-admin only. Off by
            default. When on, every login goes through password
            then a 6-digit code from email. Mobile / parent / student
            / teacher / driver accounts don't see this card at all
            (they login by mobile and most don't have email on file). */}
        {(session?.role === 'PRINCIPAL' || session?.role === 'SUPER_ADMIN') && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck size={16} className="text-emerald-600" />
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Two-Factor Auth (Email OTP)</p>
            </div>
            <p className="text-[11px] font-bold text-slate-500 leading-relaxed">
              Login ke time password ke baad ek <span className="text-slate-900">6-digit code</span> aapke email par bheja jayega. Bina us code ke koi sign-in nahi kar sakta — chahe password leak ho.
              {!session?.email && (
                <span className="block mt-1.5 text-amber-700 font-black">
                  ⚠ Profile par email set karein pehle (Supabase Dashboard ya principal Users panel se).
                </span>
              )}
            </p>
            <button
              onClick={async () => {
                if (otp2faSaving || otp2faEnabled === null) return;
                if (!otp2faEnabled && !session?.email) {
                  showToast('Profile par email set karein pehle', 'error');
                  return;
                }
                setOtp2faSaving(true);
                const next = !otp2faEnabled;
                try {
                  const res = await fetch('/api/auth/2fa/toggle', {
                    method: 'POST',
                    headers: {
                      'content-type': 'application/json',
                      'authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token ?? ''}`,
                    },
                    body: JSON.stringify({ enabled: next }),
                  });
                  if (!res.ok) {
                    const j = await res.json().catch(() => ({}));
                    throw new Error(j.error ?? `Failed (HTTP ${res.status})`);
                  }
                  setOtp2faEnabled(next);
                  showToast(next ? '2FA enabled — next login me OTP step add ho gaya' : '2FA disabled');
                } catch (e) {
                  showToast(e instanceof Error ? e.message : 'Could not update 2FA', 'error');
                } finally {
                  setOtp2faSaving(false);
                }
              }}
              disabled={otp2faSaving || otp2faEnabled === null || (!otp2faEnabled && !session?.email)}
              className={`w-full flex items-center justify-between gap-2 font-black text-xs uppercase tracking-widest py-3 px-4 rounded-2xl active:scale-95 transition-transform disabled:opacity-60 border ${
                otp2faEnabled
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <span>{otp2faEnabled === null ? 'Loading…' : otp2faEnabled ? 'Email OTP 2FA — ON' : 'Email OTP 2FA — OFF'}</span>
              <span className={`w-9 h-5 rounded-full p-0.5 transition-colors ${otp2faEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                <span className={`block w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${otp2faEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
              </span>
            </button>
          </div>
        )}

        {/* Sign-out from other devices — Supabase native scope:'others'
            keeps THIS session alive and invalidates every other refresh
            token. Useful when the principal forgets to log out at home
            / a shared computer / suspects unauthorised access. No new
            tables, no listing — just a single safety button. */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <LogOut size={16} className="text-amber-600" />
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Active Sessions</p>
          </div>
          <p className="text-[11px] font-bold text-slate-500 leading-relaxed">
            Agar kahin aur (school computer, ghar, kisi aur device par) login chod diya ho, ya suspect ho ki kisi ne access kiya hai — ye button dabate hi sabhi <span className="text-slate-900">dusre devices</span> se logout ho jayega. Yeh device login rahega.
          </p>
          <button
            onClick={async () => {
              if (signOutOthersBusy) return;
              setSignOutOthersBusy(true);
              try {
                const { error } = await supabase.auth.signOut({ scope: 'others' });
                if (error) throw error;
                showToast('Sabhi dusre devices se logout ho gaya');
              } catch (e) {
                showToast(e instanceof Error ? e.message : 'Sign-out failed', 'error');
              } finally {
                setSignOutOthersBusy(false);
              }
            }}
            disabled={signOutOthersBusy}
            className="w-full flex items-center justify-center gap-2 bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 font-black text-xs uppercase tracking-widest py-3 rounded-2xl active:scale-95 transition-transform disabled:opacity-60"
          >
            {signOutOthersBusy ? 'Logging out…' : <><LogOut size={14} /> Dusre devices se logout karein</>}
          </button>
        </div>
      </div>
    </div>
  );

  // ACTIVITY LOG VIEW
  if (view === 'ACTIVITY_LOG') return <AuditLogsViewer onBack={() => setView('MENU')} />;

  // DATA EXPORT VIEW
  if (view === 'DATA_EXPORT') return <BackupView onBack={() => setView('MENU')} />;

  return null;
};

// ─── Backup view (Settings → Download Data) ─────────────────────────────────
// Replaces the old client-side JSON dump. The server handles fetching,
// zipping, rate-limiting and (for Full archives) bundling photos +
// signatures + QR codes. Streams directly to the browser — Supabase
// storage cost is zero.
const BackupView: React.FC<{ onBack: () => void }> = ({ onBack }) => (
  <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300 min-h-[60vh] lg:min-h-[80vh]">
    <div className="bg-white border-b border-slate-100 px-4 lg:px-6 pt-4 lg:pt-6 pb-4 sticky top-0 z-10 shadow-sm">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600 hover:bg-slate-200 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 className="text-xl lg:text-2xl font-black text-slate-900 uppercase tracking-tight">Backup &amp; Download</h2>
          <p className="text-[10px] lg:text-xs font-bold text-slate-400">Server-zipped · streamed to your device</p>
        </div>
      </div>
    </div>

    <div className="flex-1 p-4 lg:p-6 max-w-2xl mx-auto w-full">
      <BackupCard apiPath="/api/principal/backup" />
    </div>
  </div>
);

// ─── Data Export Panel ──────────────────────────────────────────────────────
// Fetches every school-scoped table the principal has read access to and
// downloads a single timestamped JSON dump. Useful for backups, audits, and
// migrating to another instance.

interface DataExportProps {
  onBack: () => void;
  schoolId: string | null;
  showToast: (msg: string, kind?: 'success' | 'error' | 'info') => void;
}

// Tables that have a school_id column — filter directly with .eq().
const EXPORT_TABLES_BY_SCHOOL = [
  'academic_years', 'sections',
  'students',
  'staff', 'salary_payments', 'staff_attendance',
  'fee_structures', 'fee_installments', 'payment_records', 'fee_write_offs',
  // 'government_payments' dropped in 0083 — RTE flow removed.
  'attendance_records',
  'timetable_periods', 'timetable_entries',
  'transport_vehicles',
  'homework_assignments', 'notices', 'test_schedules',
  'complaints', 'expenses', 'approvals',
  'assets', 'asset_issues',
  'audit_logs',
] as const;

// Tables that have NO school_id but DO have a student_id — scope by
// resolving the school's student id list and filtering with .in().
const EXPORT_TABLES_BY_STUDENT = [
  'student_academic_records',
  'student_transport_assignments',
  'exam_results',
  'advance_balances',
] as const;

const EXPORT_TABLES = [
  ...EXPORT_TABLES_BY_SCHOOL,
  ...EXPORT_TABLES_BY_STUDENT,
] as const;

// Tables intentionally excluded — pure junction rows (no school_id and no
// direct student_id) that can be reconstructed from FKs in the parent rows,
// plus cross-tenant tables like `broadcasts` whose RLS allows any
// authenticated read.
const EXPORT_TABLES_EXCLUDED = [
  'parent_student_links',
  'student_documents',
  'student_change_history',
  'student_class_movements',
  'staff_class_assignments',
  'staff_permissions',
  'payment_installment_links',
  // 'govt_payment_student_links' dropped in 0083.
  'attendance_student_details',
  'route_stops',
  'driver_locations',
  'broadcasts',
] as const;

const DataExportPanel: React.FC<DataExportProps> = ({ onBack, schoolId, showToast }) => {
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<string>('');
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [failedTables, setFailedTables] = useState<{ table: string; error: string }[]>([]);

  const handleExport = async () => {
    if (!schoolId) {
      showToast('No school linked to your account', 'error');
      return;
    }
    setExporting(true);
    setCounts({});
    setFailedTables([]);
    const newCounts: Record<string, number> = {};
    const failed: { table: string; error: string }[] = [];
    const dump: Record<string, unknown> = {};

    try {
      // Page in 1000-row windows; Supabase caps single responses near that.
      const PAGE = 1000;

      // Pass 1: school-scoped tables (.eq('school_id', schoolId)).
      for (const table of EXPORT_TABLES_BY_SCHOOL) {
        const accum: unknown[] = [];
        let from = 0;
        let tableError: string | null = null;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          setProgress(`Fetching ${table}… (${accum.length})`);
          const { data, error } = await supabase
            .from(table)
            .select('*')
            .eq('school_id', schoolId)
            .order('id', { ascending: true })
            .range(from, from + PAGE - 1);
          if (error) {
            tableError = error.message;
            break;
          }
          const chunk = data ?? [];
          accum.push(...chunk);
          if (chunk.length < PAGE) break;
          from += PAGE;
        }
        if (tableError) {
          dump[table] = { error: tableError, rows: [] };
          newCounts[table] = 0;
          failed.push({ table, error: tableError });
        } else {
          dump[table] = accum;
          newCounts[table] = accum.length;
        }
        setCounts({ ...newCounts });
        setFailedTables([...failed]);
      }

      // Pass 2: student-scoped tables. Resolve the school's student IDs
      // (loaded in pass 1) and filter with .in(). If the students fetch
      // failed in pass 1, dump.students is an error object — guard against
      // that so the export degrades to a partial result rather than
      // throwing.
      const studentRows = Array.isArray(dump.students)
        ? (dump.students as Array<{ id: string }>)
        : [];
      const studentIds = studentRows.map((s) => s.id);
      for (const table of EXPORT_TABLES_BY_STUDENT) {
        if (studentIds.length === 0) {
          dump[table] = [];
          newCounts[table] = 0;
          setCounts({ ...newCounts });
          continue;
        }
        const accum: unknown[] = [];
        let tableError: string | null = null;
        // Chunk the IN list to keep URLs sane (≤500 ids per request).
        const ID_BATCH = 500;
        for (let i = 0; i < studentIds.length; i += ID_BATCH) {
          const batch = studentIds.slice(i, i + ID_BATCH);
          let from = 0;
          // eslint-disable-next-line no-constant-condition
          while (true) {
            setProgress(`Fetching ${table}… (${accum.length})`);
            const { data, error } = await supabase
              .from(table)
              .select('*')
              .in('student_id', batch)
              .order('id', { ascending: true })
              .range(from, from + PAGE - 1);
            if (error) {
              tableError = error.message;
              break;
            }
            const chunk = data ?? [];
            accum.push(...chunk);
            if (chunk.length < PAGE) break;
            from += PAGE;
          }
          if (tableError) break;
        }
        if (tableError) {
          dump[table] = { error: tableError, rows: [] };
          newCounts[table] = 0;
          failed.push({ table, error: tableError });
        } else {
          dump[table] = accum;
          newCounts[table] = accum.length;
        }
        setCounts({ ...newCounts });
        setFailedTables([...failed]);
      }

      // _meta carries the final failure list so partial exports are
      // self-describing without inspecting per-table error shapes.
      dump._meta = {
        exportedAt: new Date().toISOString(),
        schoolId,
        version: 1,
        partial: failed.length > 0,
        failedTables: failed,
        tablesAttempted: EXPORT_TABLES.length,
        tablesSucceeded: EXPORT_TABLES.length - failed.length,
      };

      setProgress('Building download…');
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Filename includes "operational-snapshot" to make it clear at a
      // glance that this file is NOT a full DB backup — just the curated
      // operational subset documented in EXPORT_TABLES / _meta.
      a.download = `edugrow-operational-snapshot-${schoolId}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      if (failed.length > 0) {
        showToast(
          `Exported with ${failed.length} table(s) skipped — open file _meta for details`,
          'info',
        );
      } else {
        showToast('Data exported successfully');
      }
      setProgress('Done');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Export failed', 'error');
    } finally {
      setExporting(false);
    }
  };

  const totalRows = (Object.values(counts) as number[]).reduce((a, b) => a + b, 0);

  return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 sticky top-0 z-10 shadow-sm flex items-center gap-3">
        <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Download Data</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="bg-cyan-50 border border-cyan-200 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <Database size={20} className="text-cyan-700 shrink-0 mt-0.5" />
            <div className="text-xs font-bold text-cyan-900 leading-relaxed">
              <strong className="block mb-1">School-scoped operational export — NOT a full DB backup.</strong>
              This file contains only rows belonging to your school, useful for offline reports,
              migrating data, or sharing a snapshot. For a true point-in-time backup, use a server-side
              dump.
            </div>
          </div>
        </div>

        <details className="bg-white border border-slate-100 rounded-2xl p-4">
          <summary className="text-xs font-black text-slate-700 uppercase tracking-wider cursor-pointer">
            Scope of export ({EXPORT_TABLES.length} tables)
          </summary>
          <div className="mt-3 space-y-3">
            <div>
              <div className="text-[10px] font-black text-emerald-700 uppercase tracking-wider mb-1">
                Included
              </div>
              <div className="text-xs font-mono text-slate-700 leading-relaxed">
                {EXPORT_TABLES.join(', ')}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">
                Intentionally excluded
              </div>
              <div className="text-xs font-mono text-slate-600 leading-relaxed">
                {EXPORT_TABLES_EXCLUDED.join(', ')}
              </div>
              <div className="text-[11px] font-medium text-slate-500 mt-1 leading-relaxed">
                Junction / child rows without a <code className="font-mono">school_id</code> column —
                they can be reconstructed from parent rows via foreign keys. Cross-tenant tables
                like <code className="font-mono">broadcasts</code> are also excluded.
              </div>
            </div>
          </div>
        </details>

        <button
          onClick={handleExport}
          disabled={exporting || !schoolId}
          className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform disabled:opacity-60"
        >
          <Download size={16} />
          {exporting ? (progress || 'Exporting…') : 'Download All Data (JSON)'}
        </button>

        {failedTables.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <div className="text-xs font-black text-amber-900 uppercase tracking-wider mb-2">
              Partial export — {failedTables.length} table{failedTables.length === 1 ? '' : 's'} skipped
            </div>
            <div className="text-xs font-medium text-amber-800 leading-relaxed mb-2">
              These tables could not be read. The downloaded file is incomplete — do not rely on it
              as a full backup. Details are also in <code className="font-mono">_meta.failedTables</code>.
            </div>
            <ul className="text-xs font-mono text-amber-900 space-y-1">
              {failedTables.map((f) => (
                <li key={f.table}>
                  <span className="font-bold">{f.table}</span> — {f.error}
                </li>
              ))}
            </ul>
          </div>
        )}

        {Object.keys(counts).length > 0 && (
          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-black text-slate-700 uppercase tracking-wider">Tables Exported</div>
              <div className="text-xs font-black text-emerald-700">{totalRows.toLocaleString()} rows</div>
            </div>
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {(Object.entries(counts) as [string, number][]).map(([t, n]) => (
                <div key={t} className="flex items-center justify-between text-xs font-bold text-slate-600 py-1">
                  <span className="font-mono">{t}</span>
                  <span className={n > 0 ? 'text-slate-900' : 'text-slate-300'}>{n}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Users panel ──────────────────────────────────────────────────────────────
// Lists every public.users row attached to this school (students + staff,
// principal excluded). Each row has a "Reset" button → confirmation modal →
// server route resets password to mobile + flips first_login_changed = false.
//
// Server enforces same-school + cannot-reset-self; UI just provides the
// confirmation step so the principal doesn't accidentally reset somebody.
type ConnectedUser = {
  id: string; name: string; mobile_number: string; role: string;
  email: string | null; is_active: boolean; first_login_changed: boolean;
  last_login: string | null;
};

// ─── Capacity meters ────────────────────────────────────────────────────────
// Renders only when the school has at least one cap configured. Hidden
// entirely on unlimited schools so principals on small plans don't see
// noise. Numbers come straight from the schools row + live counts so
// the meter stays accurate without polling.
const CapacityMeters: React.FC = () => {
  const schoolId = useAuthStore.getState().session?.schoolId ?? null;
  const [data, setData] = useState<{
    maxStudents: number | null; maxStaff: number | null;
    activeStudents: number; activeStaff: number;
  } | null>(null);

  useEffect(() => {
    if (!schoolId) return;
    let cancelled = false;
    (async () => {
      const [schoolRes, stuRes, staffRes] = await Promise.all([
        supabase.from('schools').select('max_students, max_staff').eq('id', schoolId).maybeSingle(),
        supabase.from('students').select('id', { count: 'exact', head: true })
          .eq('school_id', schoolId).eq('is_active', true),
        supabase.from('staff').select('id', { count: 'exact', head: true })
          .eq('school_id', schoolId).eq('is_active', true),
      ]);
      if (cancelled) return;
      const r = (schoolRes.data ?? null) as { max_students: number | null; max_staff: number | null } | null;
      setData({
        maxStudents:   r?.max_students ?? null,
        maxStaff:      r?.max_staff ?? null,
        activeStudents: stuRes.count ?? 0,
        activeStaff:    staffRes.count ?? 0,
      });
    })();
    return () => { cancelled = true; };
  }, [schoolId]);

  if (!data) return null;
  // Hide the whole card if the school is unlimited on both axes — no
  // point burning vertical space showing two "Unlimited" rows.
  if (data.maxStudents === null && data.maxStaff === null) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Capacity</p>
      {data.maxStudents !== null && (
        <CapacityBar label="Students" used={data.activeStudents} cap={data.maxStudents} />
      )}
      {data.maxStaff !== null && (
        <CapacityBar label="Staff" used={data.activeStaff} cap={data.maxStaff} />
      )}
      <p className="text-[9px] font-bold text-slate-400 leading-relaxed">
        Limit reach hone par naya add nahi hoga. Higher limit chahiye to platform admin se contact karein.
      </p>
    </div>
  );
};

const CapacityBar: React.FC<{ label: string; used: number; cap: number }> = ({ label, used, cap }) => {
  const pct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 100;
  // Three-tier colour ramp: emerald < 75%, amber 75–94%, rose ≥ 95%.
  // Same vocabulary as the FeeLedger progress bars so principals carry
  // one mental model across screens.
  const tone = pct >= 95 ? 'rose' : pct >= 75 ? 'amber' : 'emerald';
  const barColor =
    tone === 'rose'   ? 'bg-rose-500'   :
    tone === 'amber'  ? 'bg-amber-400'  :
                        'bg-emerald-500';
  const numColor =
    tone === 'rose'   ? 'text-rose-600'   :
    tone === 'amber'  ? 'text-amber-600'  :
                        'text-slate-900';
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[11px] font-black uppercase tracking-wider text-slate-600">{label}</span>
        <span className={`text-sm font-black tabular-nums ${numColor}`}>
          {used.toLocaleString('en-IN')}<span className="text-slate-400 font-bold"> / {cap.toLocaleString('en-IN')}</span>
        </span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

const ROLE_TONE: Record<string, string> = {
  STUDENT:  'bg-indigo-50 text-indigo-700 border-indigo-200',
  PARENT:   'bg-violet-50 text-violet-700 border-violet-200',
  TEACHER:  'bg-blue-50 text-blue-700 border-blue-200',
  DRIVER:   'bg-orange-50 text-orange-700 border-orange-200',
  PEON:     'bg-amber-50 text-amber-700 border-amber-200',
  STAFF:    'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const PAGE_SIZE = 50;
const UsersView: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { showToast } = useUIStore();
  // Server-paginated users feed. `total` is the school-wide count for the
  // current role/search filter — drives the "X accounts" header + tab badges.
  const [users, setUsers]   = useState<ConnectedUser[]>([]);
  const [total, setTotal]   = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [confirm, setConfirm] = useState<ConnectedUser | null>(null);
  const [resetting, setResetting] = useState(false);
  const [tempPwd, setTempPwd] = useState<{ name: string; mobile: string; tempPassword: string } | null>(null);

  // Drop newer responses if the user has typed again — same race-guard
  // pattern as useStudentList.
  const tokenRef = useRef(0);
  const offsetRef = useRef(0);

  const fetchPage = async (offset: number, q: string, role: string) => {
    const token = ++tokenRef.current;
    setLoading(true);
    try {
      const page = await apiPrincipal.usersList({
        offset, limit: PAGE_SIZE,
        search: q || undefined,
        role: role !== 'ALL' ? role : undefined,
      });
      if (token !== tokenRef.current) return;
      setTotal(page.total);
      setHasMore(page.hasMore);
      offsetRef.current = page.nextOffset;
      setUsers(prev => offset === 0 ? page.items : [...prev, ...page.items]);
    } catch (e) {
      if (token === tokenRef.current) {
        showToast(e instanceof Error ? e.message : 'Failed to load users', 'error');
      }
    } finally {
      if (token === tokenRef.current) setLoading(false);
    }
  };

  // Debounced reload on search/role change.
  useEffect(() => {
    const handle = setTimeout(() => {
      offsetRef.current = 0;
      void fetchPage(0, search, roleFilter);
    }, 250);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, roleFilter]);

  const refresh = () => fetchPage(0, search, roleFilter);
  const loadMore = () => {
    if (loading || !hasMore) return;
    void fetchPage(offsetRef.current, search, roleFilter);
  };

  const handleReset = async () => {
    if (!confirm) return;
    setResetting(true);
    try {
      const res = await apiPrincipal.resetUserPassword(confirm.id);
      // Surface the one-time temp password in a sticky toast — the principal
      // must hand it over personally; the password is never stored anywhere
      // else and can't be recovered after this dialog closes.
      setTempPwd({ name: res.name, mobile: res.mobile, tempPassword: res.tempPassword });
      setConfirm(null);
      await refresh();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Reset failed', 'error');
    } finally {
      setResetting(false);
    }
  };

  // Server returns a filtered page already, so client just renders.
  const filtered = users;
  // Static role list — derived from the current (filtered) page would
  // collapse the tab strip every time the principal types a query.
  const distinctRoles = ['STUDENT', 'PARENT', 'TEACHER', 'DRIVER', 'PEON', 'STAFF'];

  return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300 min-h-[60vh] lg:min-h-[80vh]">
      <div className="bg-white border-b border-slate-100 px-4 lg:px-6 pt-4 lg:pt-6 pb-4 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600 hover:bg-slate-200 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-xl lg:text-2xl font-black text-slate-900 uppercase tracking-tight">Connected Users</h2>
            <p className="text-[10px] lg:text-xs font-bold text-slate-400">{total} {roleFilter !== 'ALL' ? roleFilter.toLowerCase() : ''} account{total === 1 ? '' : 's'} in this school</p>
          </div>
        </div>
        <div className="relative mb-2">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, mobile, or email…"
            className="w-full pl-9 pr-3 py-2.5 border border-slate-200 bg-slate-50 rounded-xl text-sm font-bold text-slate-800 outline-none focus:border-indigo-400"/>
        </div>
        <div className="flex gap-1.5 overflow-x-auto hide-scrollbar -mx-1 px-1">
          {/* Tab strip uses the static role list — counts come from the
              server-filtered total when a tab is active. Clicking a tab
              fires a fresh paginated query so the count is school-wide
              accurate (not just current page). */}
          <button onClick={() => setRoleFilter('ALL')}
            className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-colors ${
              roleFilter === 'ALL' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200'
            }`}>
            All
          </button>
          {distinctRoles.map(r => (
            <button key={r} onClick={() => setRoleFilter(r)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-colors ${
                roleFilter === r ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200'
              }`}>
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-2">
        {loading && filtered.length === 0 ? (
          <p className="text-center text-sm font-bold text-slate-400 py-12">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-sm font-bold text-slate-400 py-12">No users match.</p>
        ) : (
          filtered.map(u => {
            const initials = u.name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
            // Mirror server allowlist: PRINCIPAL / SUPER_ADMIN cannot be reset
            // by another principal. They use Settings → Security themselves.
            const canReset = ['STUDENT','PARENT','TEACHER','DRIVER','PEON','STAFF'].includes(u.role);
            return (
              <div key={u.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3.5 flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-400 to-violet-500 text-white flex items-center justify-center font-black text-sm shrink-0">
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-extrabold text-slate-900 text-sm truncate">{u.name}</span>
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border uppercase ${ROLE_TONE[u.role] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                      {u.role}
                    </span>
                    {!u.first_login_changed && (
                      <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 uppercase">
                        Default Pwd
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] font-bold text-slate-400 mt-0.5 truncate">
                    {u.mobile_number}{u.email ? ` · ${u.email}` : ''}
                  </div>
                </div>
                {canReset ? (
                  <button onClick={() => setConfirm(u)}
                    className="flex items-center gap-1 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all shrink-0">
                    <KeyRound size={12}/> Reset
                  </button>
                ) : (
                  <span title="Admin roles must change password from their own Settings → Security"
                    className="flex items-center gap-1 px-3 py-2 bg-slate-50 text-slate-400 border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-not-allowed shrink-0">
                    <Lock size={12}/> Self-only
                  </span>
                )}
              </div>
            );
          })
        )}

        {/* Load More — fetches the next page from the server. Same shape
            as FeeLedger / Students list, so the principal's mental model
            for pagination stays consistent across screens. */}
        {hasMore && (
          <div className="pt-2 pb-4 flex justify-center">
            <button
              onClick={loadMore}
              disabled={loading}
              className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-black uppercase tracking-widest rounded-xl disabled:opacity-50 transition-colors">
              {loading ? 'Loading…' : `Load more · ${total - users.length} remaining`}
            </button>
          </div>
        )}
      </div>

      {/* Confirmation modal — explicit copy so a misclick doesn't reset by accident */}
      {confirm && (
        <div className="absolute inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 pb-8 animate-in slide-in-from-bottom-4">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-11 h-11 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle size={20}/>
              </div>
              <div>
                <h3 className="font-black text-slate-900 text-lg">Reset password?</h3>
                <p className="text-sm text-slate-500 mt-1">
                  <span className="font-black text-slate-900">{confirm.name}</span> ({confirm.role}) ka password reset hoga to <span className="font-black text-slate-900">{confirm.mobile_number}</span> (their mobile number).
                </p>
              </div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-5 space-y-1">
              <p className="text-[11px] font-bold text-amber-800 leading-relaxed">
                User ko next login par naya password set karna padega. Active sessions turant log-out ho jayengi.
              </p>
              <p className="text-[10px] font-bold text-amber-700 leading-relaxed">
                Note: same user ka password 7 din me sirf ek baar reset ho sakta hai.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirm(null)} disabled={resetting}
                className="flex-1 py-3 rounded-2xl border border-slate-200 font-black text-slate-600 disabled:opacity-50">
                Cancel
              </button>
              <button onClick={handleReset} disabled={resetting}
                className="flex-1 py-3 rounded-2xl bg-rose-600 text-white font-black active:scale-95 transition-transform disabled:opacity-60">
                {resetting ? 'Resetting…' : 'Reset Password'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* One-time temp-password reveal — closes only on explicit click. */}
      {tempPwd && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
            <h3 className="font-black text-slate-900 text-base mb-1">Temporary password</h3>
            <p className="text-[11px] font-bold text-slate-500 mb-3">
              Hand this password to <span className="text-slate-900">{tempPwd.name}</span> (mobile {tempPwd.mobile}). It will not be shown again.
            </p>
            <div className="bg-slate-100 rounded-xl px-4 py-3 mb-4 flex items-center justify-between gap-3">
              <code className="font-mono text-base font-black text-slate-900 tracking-wider select-all break-all">
                {tempPwd.tempPassword}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(tempPwd.tempPassword);
                  showToast('Copied');
                }}
                className="text-[10px] font-black bg-slate-900 text-white px-3 py-1.5 rounded-lg shrink-0">
                Copy
              </button>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 mb-4">
              <p className="text-[10px] font-bold text-amber-800 leading-relaxed">
                User must change this on next login. Old sessions are already invalidated.
              </p>
            </div>
            <button onClick={() => setTempPwd(null)}
              className="w-full py-3 rounded-2xl bg-slate-900 text-white font-black">
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

