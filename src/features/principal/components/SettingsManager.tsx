import React, { useEffect, useState } from 'react';
import { ArrowLeft, Plus, Trash2, ChevronDown, ChevronUp, Save, Calendar, QrCode, CreditCard, CheckCircle2, Lock, Eye, EyeOff, ShieldCheck, IndianRupee, Edit2, Building2, BookOpen } from 'lucide-react';
import { principalService } from '../../../services/principal.service';
import { AcademicYearConfig, ClassConfig } from '../../../types/principal.types';
import { useUIStore } from '../../../store/uiStore';
import { authService } from '../../../services/auth.service';
import { useAuthStore } from '../../../store/authStore';
import { schoolInfoService, SchoolInfo } from '../../../services/schoolInfo.service';
import { useAcademicYear } from '../../../context/AcademicYearContext';
import { FeeStructureForm, FeeStructureItem } from './FeeStructureForm';

type View = 'MENU' | 'SCHOOL_INFO' | 'ACADEMIC' | 'CLASSES' | 'FEE_STRUCT' | 'FEE_STRUCT_EDIT' | 'PAYMENTS' | 'SECURITY';

const DEFAULT_FEE_STRUCTURES: FeeStructureItem[] = [
  {
    id: 'fs1', name: 'Standard Fees - Class 1', className: 'Class 1',
    feeHeads: [
      { id: 'h1', name: 'Tuition Fee', amount: 1500, frequency: 'MONTHLY', description: 'Monthly tuition charges' },
      { id: 'h2', name: 'Admission Fee', amount: 2000, frequency: 'ONE_TIME', description: '' },
      { id: 'h3', name: 'Exam Fee', amount: 1200, frequency: 'ANNUAL', description: '' },
      { id: 'h4', name: 'Smart Class Fee', amount: 200, frequency: 'MONTHLY', description: '' },
    ],
    monthlyDueDates: [],
    lateFee: { enabled: false, gracePeriodDays: 5, type: 'FIXED', amount: 100, maxCap: 1000 },
  },
  {
    id: 'fs2', name: 'Standard Fees - Class 9', className: 'Class 9',
    feeHeads: [
      { id: 'h1', name: 'Tuition Fee', amount: 2800, frequency: 'MONTHLY', description: '' },
      { id: 'h2', name: 'Admission Fee', amount: 3000, frequency: 'ONE_TIME', description: '' },
      { id: 'h3', name: 'Exam Fee', amount: 2000, frequency: 'ANNUAL', description: '' },
      { id: 'h4', name: 'Lab Fee', amount: 300, frequency: 'MONTHLY', description: '' },
    ],
    monthlyDueDates: [],
    lateFee: { enabled: true, gracePeriodDays: 5, type: 'FIXED', amount: 100, maxCap: 1000 },
  },
];

interface Props { onBack: () => void; }


export const SettingsManager: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();
  const { academicYears, isYearLocked } = useAcademicYear();
  const [view, setView] = useState<View>('MENU');
  const [configs, setConfigs] = useState<AcademicYearConfig[]>([]);
  const [activeConfig, setActiveConfig] = useState<AcademicYearConfig | null>(null);
  const [expandedClass, setExpandedClass] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newSection, setNewSection] = useState('');
  const [upiId, setUpiId] = useState('school@upi');
  const [upiSaved, setUpiSaved] = useState(false);
  const [qrFileName, setQrFileName] = useState('');
  const [feeStructures, setFeeStructures] = useState<FeeStructureItem[]>(DEFAULT_FEE_STRUCTURES);
  const [editingFs, setEditingFs] = useState<FeeStructureItem | null>(null);
  const [schoolInfo, setSchoolInfo] = useState<SchoolInfo>(schoolInfoService.get());
  const session = useAuthStore(s => s.session);
  const setSession = useAuthStore(s => s.setSession);
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwShow, setPwShow] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  useEffect(() => {
    principalService.getAYConfig().then(data => {
      setConfigs(data);
      setActiveConfig(data.find(c => c.isActive) ?? data[0] ?? null);
    });
  }, []);

  const handleChangePassword = () => {
    if (!session) return;
    setPwError('');
    if (!pwCurrent || !pwNew || !pwConfirm) { setPwError('All fields required'); return; }
    if (pwNew.length < 6) { setPwError('New password must be at least 6 characters'); return; }
    if (pwNew === pwCurrent) { setPwError('New password must differ from current password'); return; }
    if (pwNew !== pwConfirm) { setPwError('Passwords do not match'); return; }
    setPwSaving(true);
    const ok = session.role === 'PRINCIPAL' ? authService.changePrincipalPassword(session.userId, pwCurrent, pwNew) : authService.changeParentPassword(session.userId, pwCurrent, pwNew);
    if (!ok) { setPwError('Current password is incorrect'); setPwSaving(false); return; }
    if (session.mustChangePassword) setSession({ ...session, mustChangePassword: false });
    setPwCurrent(''); setPwNew(''); setPwConfirm('');
    setPwSaving(false);
    showToast('Password changed successfully');
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


  const handleDeleteFs = (id: string) => {
    setFeeStructures(prev => prev.filter(f => f.id !== id));
    showToast('Fee structure removed');
  };

  const handleSaveFs = (data: FeeStructureItem) => {
    setFeeStructures(prev => {
      const exists = prev.some(f => f.id === data.id);
      return exists ? prev.map(f => f.id === data.id ? data : f) : [...prev, data];
    });
    setEditingFs(null);
    setView('FEE_STRUCT');
    showToast(`Fee structure "${data.name}" saved`);
  };

  const handleSaveSchoolInfo = () => {
    schoolInfoService.save(schoolInfo);
    showToast('School information saved');
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
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 sticky top-0 z-10 shadow-sm flex items-center gap-3">
        <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Settings</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-4 pb-28">
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: Building2, title: 'School Info', desc: 'School details & contact', color: 'bg-blue-50 text-blue-600', action: () => setView('SCHOOL_INFO') },
            { icon: Calendar, title: 'Academic Year', desc: 'View active & locked years', color: 'bg-indigo-50 text-indigo-600', action: () => setView('ACADEMIC') },
            { icon: BookOpen, title: 'Classes', desc: 'Class & section setup', color: 'bg-violet-50 text-violet-600', action: () => setView('CLASSES') },
            { icon: IndianRupee, title: 'Fee Structure', desc: 'Class-wise fee config', color: 'bg-emerald-50 text-emerald-600', action: () => setView('FEE_STRUCT') },
            { icon: CreditCard, title: 'Payments', desc: 'UPI & QR code setup', color: 'bg-orange-50 text-orange-600', action: () => setView('PAYMENTS') },
            { icon: Lock, title: 'Security', desc: 'Password & security', color: 'bg-rose-50 text-rose-600', action: () => setView('SECURITY') },
          ].map(({ icon: Icon, title, desc, color, action }) => (
            <button key={title} onClick={action} className={`${color} rounded-2xl p-4 text-left active:scale-95 transition-transform border border-opacity-20`}>
              <Icon size={28} className="mb-2 opacity-80" />
              <div className="font-black text-sm">{title}</div>
              <div className="text-[9px] font-bold opacity-70 mt-1">{desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  // SCHOOL INFO VIEW
  if (view === 'SCHOOL_INFO') return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader('School Information')}
      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Basic Info</p>
          {[
            { label: 'School Name', key: 'name' },
            { label: 'Tagline/Motto', key: 'tagline' },
            { label: 'Principal Name', key: 'principalName' },
            { label: 'Affiliation Board', key: 'affiliationBoard' },
            { label: 'School Code', key: 'schoolCode' },
          ].map(({ label, key }) => (
            <div key={key}>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">{label}</label>
              <input value={(schoolInfo as any)[key]} onChange={e => setSchoolInfo(prev => ({ ...prev, [key]: e.target.value }))} className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500" />
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Contact Info</p>
          {[
            { label: 'Address', key: 'address' },
            { label: 'City', key: 'city' },
            { label: 'State', key: 'state' },
            { label: 'PIN Code', key: 'pin' },
            { label: 'Phone Number', key: 'phone' },
            { label: 'Email Address', key: 'email' },
          ].map(({ label, key }) => (
            <div key={key}>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">{label}</label>
              <input value={(schoolInfo as any)[key]} onChange={e => setSchoolInfo(prev => ({ ...prev, [key]: e.target.value }))} className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500" />
            </div>
          ))}
        </div>

        <button onClick={handleSaveSchoolInfo} className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg">
          <Save size={16} /> Save School Info
        </button>
      </div>
    </div>
  );

  // ACADEMIC VIEW — read-only, sirf year cards + active/locked status
  if (view === 'ACADEMIC') return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader('Academic Year')}
      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-4">
        <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-3">
          <p className="text-xs font-bold text-indigo-700">
            Naya academic year create karne ke liye "Year Closing Wizard" use karein.
          </p>
        </div>
        <div className="space-y-3">
          {academicYears.map(year => {
            const locked = isYearLocked(year.id);
            const isActive = year.isActive;
            return (
              <div
                key={year.id}
                className={`bg-white rounded-2xl border shadow-sm p-4 ${
                  isActive ? 'border-emerald-300' : locked ? 'border-slate-200' : 'border-slate-100'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-slate-900">{year.name}</span>
                      {isActive && (
                        <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                          Active
                        </span>
                      )}
                      {locked && !isActive && (
                        <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 flex items-center gap-1">
                          <Lock size={9} /> Locked
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] font-bold text-slate-400 mt-1">
                      {year.startDate} → {year.endDate} · {year.board}
                    </div>
                    {year.closedDate && (
                      <div className="text-[10px] font-bold text-slate-400">
                        Closed: {year.closedDate}
                      </div>
                    )}
                  </div>
                  {/* Status indicator */}
                  <div
                    className={`w-10 h-6 rounded-full flex items-center transition-all duration-300 ${
                      isActive ? 'bg-emerald-500 justify-end' : 'bg-slate-200 justify-start'
                    } px-1`}
                  >
                    <div className="w-4 h-4 bg-white rounded-full shadow-sm" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  // CLASSES VIEW
  if (view === 'CLASSES') return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader('Classes')}
      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-4">
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
                          <div key={sec} className="flex items-center gap-1 bg-slate-100 rounded-xl pl-3 pr-2 py-1.5">
                            <span className="text-xs font-black text-slate-700">Section {sec}</span>
                            <button onClick={() => handleRemoveSection(cls.name, sec)} className="text-slate-400 hover:text-rose-500"><Trash2 size={11} /></button>
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
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader('Fee Structure')}
      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-4">
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
            return (
              <div key={fs.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3.5">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-black text-xs shrink-0 text-center leading-tight">
                    {fs.className.replace('Class ', '').slice(0, 4)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-extrabold text-slate-900 text-sm truncate">{fs.name}</div>
                    <div className="text-[10px] font-bold text-slate-400 mt-0.5">
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
                  <div className="px-4 pb-3 flex flex-wrap gap-1.5 border-t border-slate-50 pt-2">
                    {fs.feeHeads.slice(0, 4).map(h => (
                      <span key={h.id} className="text-[9px] font-black bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                        {h.name} ₹{h.amount.toLocaleString('en-IN')} ({h.frequency === 'MONTHLY' ? 'mo' : h.frequency === 'ANNUAL' ? 'yr' : '1x'})
                      </span>
                    ))}
                    {fs.feeHeads.length > 4 && (
                      <span className="text-[9px] font-black bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">+{fs.feeHeads.length - 4} more</span>
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
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader('Payments')}
      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <CreditCard size={16} className="text-blue-600" />
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">UPI Payment ID</p>
          </div>
          <p className="text-xs font-bold text-slate-500">This UPI ID will be shown to parents in the fee payment screen.</p>
          <div className="flex gap-2">
            <input value={upiId} onChange={e => { setUpiId(e.target.value); setUpiSaved(false); }} placeholder="e.g. school@okaxis" className="flex-1 border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-blue-500" />
            <button onClick={() => { setUpiSaved(true); showToast('UPI ID saved'); }} className={`px-4 py-3 rounded-xl font-black text-sm transition-colors ${upiSaved ? 'bg-emerald-500 text-white' : 'bg-slate-900 text-white'}`}>
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

          <div className="w-36 h-36 mx-auto bg-slate-100 rounded-2xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center gap-2">
            {qrFileName ? (
              <div className="w-full h-full grid grid-cols-6 gap-px p-3 rounded-2xl">
                {Array.from({ length: 36 }, (_, i) => (
                  <div key={i} className={`rounded-sm ${(i * 7 + i * 3) % 3 === 0 ? 'bg-slate-800' : 'bg-white'}`} />
                ))}
              </div>
            ) : (
              <>
                <QrCode size={28} className="text-slate-300" />
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">No QR</span>
              </>
            )}
          </div>

          <label className="w-full flex items-center justify-center gap-2 bg-violet-600 text-white font-black text-xs uppercase tracking-widest py-3 rounded-2xl cursor-pointer active:scale-95 transition-transform">
            <Plus size={14} /> {qrFileName ? 'Replace QR Image' : 'Upload QR Image'}
            <input type="file" accept="image/*" className="hidden" onChange={e => {
              const file = e.target.files?.[0];
              if (file) { setQrFileName(file.name); showToast(`QR image "${file.name}" uploaded`); }
            }} />
          </label>

          {qrFileName && (
            <div className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2.5">
              <span className="text-xs font-bold text-slate-600 truncate">{qrFileName}</span>
              <button onClick={() => setQrFileName('')} className="text-slate-400 hover:text-rose-500 transition-colors ml-2 shrink-0"><Trash2 size={13} /></button>
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
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader('Security')}
      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-4">
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

  return null;
};
