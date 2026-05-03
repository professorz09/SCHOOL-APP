import React, { useEffect, useState } from 'react';
import { ArrowLeft, Plus, Trash2, ChevronDown, ChevronUp, Save, QrCode, CreditCard, CheckCircle2, Lock, Eye, EyeOff, ShieldCheck, IndianRupee, Edit2, Building2, BookOpen, ChevronRight, X, Download, Database, History, ShieldOff, Unlock } from 'lucide-react';
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
import { useAcademicYear } from '@/shared/context/AcademicYearContext';

type View = 'MENU' | 'SCHOOL_INFO' | 'CLASSES' | 'FEE_STRUCT' | 'FEE_STRUCT_EDIT' | 'PAYMENTS' | 'SECURITY' | 'DATA_EXPORT' | 'ACTIVITY_LOG';

interface Props { onBack: () => void; initialView?: View; }


export const SettingsManager: React.FC<Props> = ({ onBack, initialView }) => {
  const { showToast } = useUIStore();
  const { activeYear } = useAcademicYear();
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

  // Editor Mode
  const editorEnabled = useEditorModeStore(s => s.enabled);
  const editorEnable  = useEditorModeStore(s => s.enable);
  const editorDisable = useEditorModeStore(s => s.disable);
  const editorRemMs   = useEditorModeStore(s => s.remainingMs);
  const [editorConfirm, setEditorConfirm] = useState(false);
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
              onClick={() => editorEnabled ? editorDisable() : setEditorConfirm(true)}
              className={`px-4 py-2 rounded-xl text-[11px] font-black transition-colors ${
                editorEnabled
                  ? 'bg-amber-500 text-white active:bg-amber-600'
                  : 'bg-slate-900 text-white active:bg-slate-700'
              }`}>
              {editorEnabled ? 'Disable' : 'Enable'}
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

        {/* Confirm enable dialog */}
        {editorConfirm && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4"
               onClick={() => setEditorConfirm(false)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5"
                 onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                  <Unlock size={20} className="text-amber-600" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-sm">Enable Editor Mode?</h3>
                  <p className="text-[10px] font-bold text-slate-400 mt-0.5">Auto-disables after 30 minutes</p>
                </div>
              </div>
              <p className="text-xs font-bold text-slate-600 mb-4 leading-relaxed">
                Editor Mode allows changing student class assignments, roll numbers, and other
                locked fields. Only enable when you need to make corrections.
              </p>
              <div className="flex gap-2">
                <button onClick={() => setEditorConfirm(false)}
                  className="flex-1 py-3 bg-slate-100 text-slate-700 font-black text-xs rounded-xl">
                  Cancel
                </button>
                <button onClick={() => { editorEnable(); setEditorConfirm(false); }}
                  className="flex-1 py-3 bg-amber-500 text-white font-black text-xs rounded-xl">
                  Enable
                </button>
              </div>
            </div>
          </div>
        )}

        {[
          { icon: Building2, title: 'School Info',    desc: 'School details & contact info',    iconBg: 'bg-blue-100',    iconColor: 'text-blue-600',    action: () => setView('SCHOOL_INFO') },
          // Classes/sections are now set in the Academic Year wizard. The legacy
          // CLASSES view is kept in this file but is no longer reachable from
          // the menu — section editing post-wizard will get its own dedicated
          // surface in a future task.
          { icon: IndianRupee, title: 'Fee Structure', desc: 'Class-wise fee configuration',   iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600', action: () => setView('FEE_STRUCT') },
          { icon: CreditCard, title: 'Payments',      desc: 'UPI & QR code setup',             iconBg: 'bg-orange-100',  iconColor: 'text-orange-600',  action: () => setView('PAYMENTS') },
          { icon: Lock,      title: 'Security',       desc: 'Password & account security',     iconBg: 'bg-rose-100',    iconColor: 'text-rose-600',    action: () => setView('SECURITY') },
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
      </div>
    </div>
  );

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
            const tileLabel = isVehicle ? 'BUS' : fs.className.replace('Class ', '').slice(0, 4);
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
                  <div className="flex gap-1.5 shrink-0">
                    <button onClick={() => { setEditingFs(fs); setView('FEE_STRUCT_EDIT'); }} className="p-2 bg-indigo-50 text-indigo-600 rounded-xl"><Edit2 size={13} /></button>
                    <button onClick={() => handleDeleteFs(fs.id)} className="p-2 bg-rose-50 text-rose-500 rounded-xl"><Trash2 size={13} /></button>
                  </div>
                </div>
                {fs.feeHeads.length > 0 && (
                  <div className="px-4 pb-3.5 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                    {fs.feeHeads.slice(0, 4).map(h => (
                      <span key={h.id}
                        className="inline-flex items-center gap-1 text-[10px] font-bold bg-slate-50 border border-slate-200 text-slate-700 px-2.5 py-1 rounded-full">
                        <span className="font-black">{h.name}</span>
                        <span className="text-slate-400">·</span>
                        <span className="text-emerald-600 font-black">₹{h.amount.toLocaleString('en-IN')}</span>
                        <span className="text-slate-400 text-[9px]">{h.frequency === 'MONTHLY' ? '/mo' : h.frequency === 'QUARTERLY' ? '/qtr' : h.frequency === 'HALF_YEARLY' ? '/6mo' : h.frequency === 'ANNUAL' ? '/yr' : '×1'}</span>
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
            onClick={() => editorEnabled ? editorDisable() : setEditorConfirm(true)}
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
      </div>
    </div>
  );

  // ACTIVITY LOG VIEW
  if (view === 'ACTIVITY_LOG') return <AuditLogsViewer onBack={() => setView('MENU')} />;

  // DATA EXPORT VIEW
  if (view === 'DATA_EXPORT') return <DataExportPanel onBack={() => setView('MENU')} schoolId={session?.schoolId ?? null} showToast={showToast} />;

  return null;
};

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
  'academic_years', 'sections', 'subjects',
  'students',
  'staff', 'salary_payments', 'staff_attendance',
  'fee_structures', 'fee_installments', 'payment_records', 'fee_write_offs',
  'government_payments',
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
  'govt_payment_student_links',
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
