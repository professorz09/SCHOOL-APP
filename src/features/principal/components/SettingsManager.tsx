import React, { useEffect, useState } from 'react';
import { ArrowLeft, Plus, Trash2, ChevronDown, ChevronUp, Save, Calendar, Users, QrCode, CreditCard, CheckCircle2, Lock, Eye, EyeOff, ShieldCheck, IndianRupee, Edit2 } from 'lucide-react';
import { principalService } from '../../../services/principal.service';
import { AcademicYearConfig, ClassConfig, Student } from '../../../types/principal.types';
import { useUIStore } from '../../../store/uiStore';
import { studentService } from '../../../services/student.service';
import { authService } from '../../../services/auth.service';
import { useAuthStore } from '../../../store/authStore';

type Tab = 'ACADEMIC' | 'CLASSES' | 'FEE_STRUCT' | 'PROMOTION' | 'PAYMENTS' | 'SECURITY';
type View = 'CONFIG' | 'CREATE_AY' | 'PROMOTION' | 'FEE_STRUCT_EDIT';

interface FeeStructureItem {
  id: string;
  className: string;
  tuitionPerMonth: number;
  admissionFee: number;
  examFeePerYear: number;
  otherCharges: { label: string; amount: number; frequency: 'MONTHLY' | 'ANNUAL' | 'ONE_TIME' }[];
}

const DEFAULT_FEE_STRUCTURES: FeeStructureItem[] = [
  { id: 'fs1', className: 'Class 1', tuitionPerMonth: 1500, admissionFee: 2000, examFeePerYear: 1200, otherCharges: [{ label: 'Smart Class', amount: 200, frequency: 'MONTHLY' }] },
  { id: 'fs2', className: 'Class 9', tuitionPerMonth: 2800, admissionFee: 3000, examFeePerYear: 2000, otherCharges: [{ label: 'Lab Fee', amount: 300, frequency: 'MONTHLY' }] },
  { id: 'fs3', className: 'Class 10', tuitionPerMonth: 3500, admissionFee: 3500, examFeePerYear: 2500, otherCharges: [{ label: 'Lab Fee', amount: 350, frequency: 'MONTHLY' }, { label: 'Board Fee', amount: 1500, frequency: 'ONE_TIME' }] },
];

interface Props { onBack: () => void; }

const BOARDS = ['CBSE', 'ICSE', 'State Board', 'IB', 'Cambridge'];

export const SettingsManager: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();
  const [view, setView] = useState<View>('CONFIG');
  const [tab, setTab] = useState<Tab>('ACADEMIC');
  const [configs, setConfigs] = useState<AcademicYearConfig[]>([]);
  const [activeConfig, setActiveConfig] = useState<AcademicYearConfig | null>(null);
  const [expandedClass, setExpandedClass] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newSection, setNewSection] = useState('');

  const [students, setStudents] = useState<Student[]>([]);
  const [failedStudents, setFailedStudents] = useState<Set<string>>(new Set());
  const [rteStudents, setRteStudents] = useState<Set<string>>(new Set());
  const [tcStudents, setTcStudents] = useState<Set<string>>(new Set());

  const [newAY, setNewAY] = useState({
    label: '',
    startDate: '',
    endDate: '',
    board: 'CBSE',
  });

  const [upiId, setUpiId] = useState('school@upi');
  const [upiSaved, setUpiSaved] = useState(false);
  const [qrFileName, setQrFileName] = useState('');

  // Fee Structure
  const [feeStructures, setFeeStructures] = useState<FeeStructureItem[]>(DEFAULT_FEE_STRUCTURES);
  const [editingFs, setEditingFs] = useState<FeeStructureItem | null>(null);
  const [newFsClass, setNewFsClass] = useState('');
  const [newFsTuition, setNewFsTuition] = useState('');
  const [newFsAdmission, setNewFsAdmission] = useState('');
  const [newFsExam, setNewFsExam] = useState('');
  const [newChargeLabel, setNewChargeLabel] = useState('');
  const [newChargeAmount, setNewChargeAmount] = useState('');
  const [newChargeFreq, setNewChargeFreq] = useState<'MONTHLY' | 'ANNUAL' | 'ONE_TIME'>('MONTHLY');

  const session = useAuthStore(s => s.session);
  const setSession = useAuthStore(s => s.setSession);
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwShow, setPwShow] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  const handleChangePassword = () => {
    if (!session) return;
    setPwError('');
    if (!pwCurrent || !pwNew || !pwConfirm) {
      setPwError('All fields required'); return;
    }
    if (pwNew.length < 6) {
      setPwError('New password must be at least 6 characters'); return;
    }
    if (pwNew === pwCurrent) {
      setPwError('New password must differ from current password'); return;
    }
    if (pwNew !== pwConfirm) {
      setPwError('Passwords do not match'); return;
    }
    setPwSaving(true);
    const ok = session.role === 'PRINCIPAL'
      ? authService.changePrincipalPassword(session.userId, pwCurrent, pwNew)
      : authService.changeParentPassword(session.userId, pwCurrent, pwNew);
    if (!ok) {
      setPwError('Current password is incorrect');
      setPwSaving(false);
      return;
    }
    if (session.mustChangePassword) {
      setSession({ ...session, mustChangePassword: false });
    }
    setPwCurrent(''); setPwNew(''); setPwConfirm('');
    setPwSaving(false);
    showToast('Password changed successfully');
  };

  useEffect(() => {
    principalService.getAYConfig().then(data => {
      setConfigs(data);
      setActiveConfig(data.find(c => c.isActive) ?? data[0] ?? null);
    });
    studentService.getAll().then(setStudents);
  }, []);

  const handleSaveBoard = async (board: string) => {
    if (!activeConfig) return;
    setIsSaving(true);
    try {
      const updated = await principalService.updateAYConfig(activeConfig.id, { board });
      setActiveConfig(updated);
      setConfigs(prev => prev.map(c => c.id === updated.id ? updated : c));
      showToast('Board updated');
    } finally { setIsSaving(false); }
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
    const newClasses = activeConfig.classes.map(c =>
      c.name === className ? { ...c, sections: [...c.sections, newSection.trim().toUpperCase()] } : c
    );
    const updated = await principalService.updateAYConfig(activeConfig.id, { classes: newClasses });
    setActiveConfig(updated);
    setConfigs(prev => prev.map(c => c.id === updated.id ? updated : c));
    setNewSection('');
    showToast(`Section ${newSection.toUpperCase()} added to ${className}`);
  };

  const handleRemoveSection = async (className: string, section: string) => {
    if (!activeConfig) return;
    const newClasses = activeConfig.classes.map(c =>
      c.name === className ? { ...c, sections: c.sections.filter(s => s !== section) } : c
    );
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

  const handleCreateAY = async () => {
    if (!newAY.label || !newAY.startDate || !newAY.endDate) {
      showToast('All fields required', 'error'); return;
    }
    setIsSaving(true);
    try {
      const ayConfig: AcademicYearConfig = {
        id: `ay${Date.now()}`,
        label: newAY.label,
        startDate: newAY.startDate,
        endDate: newAY.endDate,
        isActive: false,
        board: newAY.board,
        classes: activeConfig?.classes || [],
      };
      setConfigs(prev => [...prev, ayConfig]);
      showToast(`Academic Year ${newAY.label} created!`);
      setNewAY({ label: '', startDate: '', endDate: '', board: 'CBSE' });
      setView('CONFIG');
      setTab('ACADEMIC');
    } finally { setIsSaving(false); }
  };

  const handlePromoteStudents = async () => {
    setIsSaving(true);
    try {
      const promoted = students.filter(s =>
        !failedStudents.has(s.id) && !tcStudents.has(s.id)
      );
      const rte = students.filter(s => rteStudents.has(s.id));

      showToast(`${promoted.length} students promoted, ${rte.length} RTE marked, ${failedStudents.size} retained`);
      setFailedStudents(new Set());
      setRteStudents(new Set());
      setTcStudents(new Set());
      setView('CONFIG');
      setTab('ACADEMIC');
    } finally { setIsSaving(false); }
  };

  const handleAddFeeStructure = () => {
    if (!newFsClass.trim() || !newFsTuition) { showToast('Class name and tuition fee required', 'error'); return; }
    const newFs: FeeStructureItem = {
      id: `fs${Date.now()}`,
      className: newFsClass.trim(),
      tuitionPerMonth: Number(newFsTuition),
      admissionFee: Number(newFsAdmission) || 0,
      examFeePerYear: Number(newFsExam) || 0,
      otherCharges: [],
    };
    setFeeStructures(prev => [...prev, newFs]);
    setNewFsClass(''); setNewFsTuition(''); setNewFsAdmission(''); setNewFsExam('');
    showToast(`Fee structure added for ${newFs.className}`);
  };

  const handleDeleteFs = (id: string) => {
    setFeeStructures(prev => prev.filter(f => f.id !== id));
    showToast('Fee structure removed');
  };

  const handleSaveEditFs = () => {
    if (!editingFs) return;
    setFeeStructures(prev => prev.map(f => f.id === editingFs.id ? editingFs : f));
    setEditingFs(null);
    showToast('Fee structure saved');
  };

  const handleAddOtherCharge = () => {
    if (!editingFs || !newChargeLabel.trim() || !newChargeAmount) return;
    setEditingFs(prev => prev ? {
      ...prev,
      otherCharges: [...prev.otherCharges, { label: newChargeLabel.trim(), amount: Number(newChargeAmount), frequency: newChargeFreq }],
    } : prev);
    setNewChargeLabel(''); setNewChargeAmount('');
  };

  const tabs = [
    { key: 'ACADEMIC' as Tab, label: 'Academic' },
    { key: 'CLASSES' as Tab, label: 'Classes' },
    { key: 'FEE_STRUCT' as Tab, label: 'Fees' },
    { key: 'PROMOTION' as Tab, label: 'Promotion' },
    { key: 'PAYMENTS' as Tab, label: 'Payments' },
    { key: 'SECURITY' as Tab, label: 'Security' },
  ];

  // ─── CREATE ACADEMIC YEAR VIEW ─────────────────────────────────────────

  if (view === 'CREATE_AY') return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-4 pt-12 pb-4 sticky top-0 z-10 shadow-sm flex items-center gap-3">
        <button onClick={() => setView('CONFIG')} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">New Academic Year</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Year Details</p>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Label (e.g., 2024-25) *</label>
            <input value={newAY.label} onChange={e => setNewAY(s => ({ ...s, label: e.target.value }))}
              placeholder="2024-25" className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-slate-900 focus:bg-white" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Start Date *</label>
              <input type="date" value={newAY.startDate} onChange={e => setNewAY(s => ({ ...s, startDate: e.target.value }))}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none focus:border-slate-900" />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">End Date *</label>
              <input type="date" value={newAY.endDate} onChange={e => setNewAY(s => ({ ...s, endDate: e.target.value }))}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none focus:border-slate-900" />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Board</label>
            <div className="flex flex-wrap gap-2">
              {BOARDS.map(board => (
                <button key={board} onClick={() => setNewAY(s => ({ ...s, board }))}
                  className={`px-3 py-2 rounded-xl text-xs font-black transition-colors ${newAY.board === board ? 'bg-slate-900 text-white' : 'bg-slate-50 border border-slate-200 text-slate-600'}`}>
                  {board}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button onClick={handleCreateAY} disabled={isSaving}
          className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg disabled:opacity-60">
          {isSaving ? 'Creating…' : <><Plus size={16} /> Create Academic Year</>}
        </button>
      </div>
    </div>
  );

  // ─── PROMOTION VIEW ────────────────────────────────────────────────────

  if (view === 'PROMOTION') return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-4 pt-12 pb-4 sticky top-0 z-10 shadow-sm flex items-center gap-3">
        <button onClick={() => setView('CONFIG')} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Promotion Logic</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">System Rules</p>
          {[
            { label: 'Minimum Attendance for Promotion', val: '75%' },
            { label: 'Minimum Pass Percentage', val: '33%' },
            { label: 'Grace Marks', val: 'Up to 5 marks per subject' },
            { label: 'Compartmental Policy', val: 'Max 2 subjects allowed' },
          ].map(({ label, val }) => (
            <div key={label} className="flex items-start justify-between gap-2 mb-3">
              <span className="text-[11px] font-bold text-slate-500 flex-1">{label}</span>
              <span className="text-[11px] font-black text-slate-900 text-right">{val}</span>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Mark Student Status</p>
          <div className="space-y-3">
            {students.map(student => (
              <div key={student.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <div>
                  <div className="font-bold text-slate-800 text-sm">{student.name}</div>
                  <div className="text-[10px] font-bold text-slate-400 mt-0.5">{student.className}-{student.section} · {student.attendancePercent}% attendance</div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => {
                    const newFailed = new Set(failedStudents);
                    newFailed.has(student.id) ? newFailed.delete(student.id) : newFailed.add(student.id);
                    setFailedStudents(newFailed);
                  }}
                    className={`px-2 py-1 rounded text-[9px] font-black uppercase ${failedStudents.has(student.id) ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                    Failed
                  </button>
                  <button onClick={() => {
                    const newRte = new Set(rteStudents);
                    newRte.has(student.id) ? newRte.delete(student.id) : newRte.add(student.id);
                    setRteStudents(newRte);
                  }}
                    className={`px-2 py-1 rounded text-[9px] font-black uppercase ${rteStudents.has(student.id) ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                    RTE
                  </button>
                  <button onClick={() => {
                    const newTc = new Set(tcStudents);
                    newTc.has(student.id) ? newTc.delete(student.id) : newTc.add(student.id);
                    setTcStudents(newTc);
                  }}
                    className={`px-2 py-1 rounded text-[9px] font-black uppercase ${tcStudents.has(student.id) ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                    TC
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <button onClick={handlePromoteStudents} disabled={isSaving}
          className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg disabled:opacity-60">
          {isSaving ? 'Processing…' : <><Save size={16} /> Confirm Promotions</>}
        </button>
      </div>
    </div>
  );

  // ─── FEE STRUCTURE EDIT VIEW ──────────────────────────────────────────
  if (view === 'FEE_STRUCT_EDIT' && editingFs) return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-4 pt-12 pb-4 sticky top-0 z-10 shadow-sm flex items-center gap-3">
        <button onClick={() => { setView('CONFIG'); setTab('FEE_STRUCT'); }} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Edit: {editingFs.className}</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Core Fees</p>
          {[
            { label: 'Tuition Fee / Month (₹)', key: 'tuitionPerMonth' },
            { label: 'Admission Fee (₹)', key: 'admissionFee' },
            { label: 'Exam Fee / Year (₹)', key: 'examFeePerYear' },
          ].map(({ label, key }) => (
            <div key={key}>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">{label}</label>
              <input type="number" value={(editingFs as any)[key]}
                onChange={e => setEditingFs(prev => prev ? { ...prev, [key]: Number(e.target.value) } : prev)}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500" />
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Other Charges</p>
          {editingFs.otherCharges.map((charge, idx) => (
            <div key={idx} className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2.5">
              <div className="flex-1">
                <div className="font-bold text-slate-800 text-sm">{charge.label}</div>
                <div className="text-[10px] font-bold text-slate-400">₹{charge.amount} · {charge.frequency}</div>
              </div>
              <button onClick={() => setEditingFs(prev => prev ? { ...prev, otherCharges: prev.otherCharges.filter((_, i) => i !== idx) } : prev)}
                className="text-slate-300 hover:text-rose-500 transition-colors"><Trash2 size={14} /></button>
            </div>
          ))}
          <div className="border-t border-slate-100 pt-3 space-y-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Add Charge</p>
            <input value={newChargeLabel} onChange={e => setNewChargeLabel(e.target.value)}
              placeholder="Charge label (e.g. Lab Fee, Smart Class)"
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-2.5 font-bold text-sm outline-none focus:border-indigo-500" />
            <div className="flex gap-2">
              <input type="number" value={newChargeAmount} onChange={e => setNewChargeAmount(e.target.value)}
                placeholder="Amount (₹)"
                className="flex-1 border border-slate-200 bg-slate-50 rounded-xl px-3 py-2.5 font-bold text-sm outline-none focus:border-indigo-500" />
              <select value={newChargeFreq} onChange={e => setNewChargeFreq(e.target.value as any)}
                className="border border-slate-200 bg-slate-50 rounded-xl px-3 py-2.5 font-bold text-xs outline-none focus:border-indigo-500">
                <option value="MONTHLY">Monthly</option>
                <option value="ANNUAL">Annual</option>
                <option value="ONE_TIME">One-time</option>
              </select>
            </div>
            <button onClick={handleAddOtherCharge}
              className="w-full flex items-center justify-center gap-2 bg-indigo-50 text-indigo-700 font-black text-xs uppercase py-2.5 rounded-xl">
              <Plus size={14} /> Add Charge
            </button>
          </div>
        </div>

        <button onClick={handleSaveEditFs}
          className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg">
          <Save size={16} /> Save Fee Structure
        </button>
      </div>
    </div>
  );

  // ─── CONFIG VIEW (Default) ─────────────────────────────────────────────

  return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-4 pt-12 pb-0 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3 pb-3">
          <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
            <ArrowLeft size={20} />
          </button>
          <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Settings</h2>
        </div>
        <div className="flex overflow-x-auto hide-scrollbar border-t border-slate-100">
          {tabs.map(({ key, label }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex-shrink-0 px-3 py-3 text-[10px] font-black uppercase tracking-widest transition-colors border-b-2 ${tab === key ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-4">

        {/* ACADEMIC YEAR TAB */}
        {tab === 'ACADEMIC' && activeConfig && (
          <>
            <button onClick={() => setView('CREATE_AY')}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white font-black text-xs uppercase tracking-widest py-3 rounded-2xl active:scale-95 transition-transform">
              <Calendar size={14} /> Create New Academic Year
            </button>

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Active Academic Year</p>
              <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
                {configs.map(c => (
                  <button key={c.id} onClick={() => setActiveConfig(c)}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors ${activeConfig.id === c.id ? 'bg-slate-900 text-white' : 'bg-white text-slate-500 border border-slate-200'}`}>
                    {c.label} {c.isActive && '●'}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Year Details</p>
              {[
                { label: 'Label', val: activeConfig.label },
                { label: 'Start Date', val: activeConfig.startDate },
                { label: 'End Date', val: activeConfig.endDate },
                { label: 'Status', val: activeConfig.isActive ? '● Active' : 'Inactive' },
              ].map(({ label, val }) => (
                <div key={label} className="flex justify-between">
                  <span className="text-[10px] font-bold text-slate-400">{label}</span>
                  <span className={`text-xs font-black ${label === 'Status' && activeConfig.isActive ? 'text-emerald-600' : 'text-slate-700'}`}>{val}</span>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Board Affiliation</p>
              <div className="flex flex-wrap gap-2">
                {BOARDS.map(board => (
                  <button key={board} onClick={() => handleSaveBoard(board)}
                    className={`px-3 py-2 rounded-xl text-xs font-black transition-colors ${activeConfig.board === board ? 'bg-slate-900 text-white' : 'bg-slate-50 border border-slate-200 text-slate-600'}`}>
                    {board}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* CLASSES TAB */}
        {tab === 'CLASSES' && activeConfig && (
          <>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Add New Class</p>
              <div className="flex gap-2">
                <input value={newClassName} onChange={e => setNewClassName(e.target.value)}
                  placeholder="e.g. Class 11"
                  className="flex-1 border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-slate-900" />
                <button onClick={handleAddClass} className="p-3 bg-slate-900 text-white rounded-xl">
                  <Plus size={16} />
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {activeConfig.classes.map(cls => (
                <div key={cls.name} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <button onClick={() => setExpandedClass(expandedClass === cls.name ? null : cls.name)}
                    className="w-full flex items-center justify-between p-4">
                    <span className="font-extrabold text-slate-900 text-sm">{cls.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black text-slate-400">{cls.sections.length} sections</span>
                      <button onClick={e => { e.stopPropagation(); handleRemoveClass(cls.name); }}
                        className="p-1 text-slate-300 hover:text-rose-500 transition-colors"><Trash2 size={13} /></button>
                      {expandedClass === cls.name ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                    </div>
                  </button>
                  {expandedClass === cls.name && (
                    <div className="px-4 pb-4 space-y-3 border-t border-slate-50">
                      <div className="flex flex-wrap gap-2 pt-3">
                        {cls.sections.map(sec => (
                          <div key={sec} className="flex items-center gap-1 bg-slate-100 rounded-xl pl-3 pr-2 py-1.5">
                            <span className="text-xs font-black text-slate-700">Section {sec}</span>
                            <button onClick={() => handleRemoveSection(cls.name, sec)} className="text-slate-400 hover:text-rose-500">
                              <Trash2 size={11} />
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input value={expandedClass === cls.name ? newSection : ''}
                          onChange={e => setNewSection(e.target.value)}
                          placeholder="Section letter (e.g. C)"
                          className="flex-1 border border-slate-200 bg-slate-50 rounded-xl px-3 py-2.5 font-bold text-sm outline-none" />
                        <button onClick={() => handleAddSection(cls.name)} className="p-2.5 bg-indigo-600 text-white rounded-xl">
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* FEE STRUCTURE TAB */}
        {tab === 'FEE_STRUCT' && (
          <>
            <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4">
              <p className="text-xs font-black text-indigo-700">
                Define class-wise fee structure. These rates are used as default when admitting new students.
              </p>
            </div>

            {/* Add new fee structure */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Add Class Fee Structure</p>
              <input value={newFsClass} onChange={e => setNewFsClass(e.target.value)}
                placeholder="Class name (e.g. Class 1, Class 10)"
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500" />
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Tuition/Month</label>
                  <input type="number" value={newFsTuition} onChange={e => setNewFsTuition(e.target.value)}
                    placeholder="₹"
                    className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-2.5 font-bold text-sm outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Admission Fee</label>
                  <input type="number" value={newFsAdmission} onChange={e => setNewFsAdmission(e.target.value)}
                    placeholder="₹"
                    className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-2.5 font-bold text-sm outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Exam Fee/Year</label>
                  <input type="number" value={newFsExam} onChange={e => setNewFsExam(e.target.value)}
                    placeholder="₹"
                    className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-2.5 font-bold text-sm outline-none focus:border-indigo-500" />
                </div>
              </div>
              <button onClick={handleAddFeeStructure}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white font-black text-xs uppercase tracking-widest py-3 rounded-xl active:scale-95 transition-transform">
                <Plus size={14} /> Add Fee Structure
              </button>
            </div>

            {/* Existing fee structures */}
            <div className="space-y-2">
              {feeStructures.length === 0 && (
                <div className="flex flex-col items-center py-10 text-slate-400">
                  <IndianRupee size={28} className="mb-2 opacity-40" />
                  <p className="font-bold text-sm">No fee structures yet</p>
                </div>
              )}
              {feeStructures.map(fs => (
                <div key={fs.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3.5">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-sm shrink-0">
                      {fs.className.replace('Class ', '')}
                    </div>
                    <div className="flex-1">
                      <div className="font-extrabold text-slate-900 text-sm">{fs.className}</div>
                      <div className="text-[10px] font-bold text-slate-400 mt-0.5">
                        ₹{fs.tuitionPerMonth.toLocaleString('en-IN')}/mo · Admission ₹{fs.admissionFee.toLocaleString('en-IN')} · Exam ₹{fs.examFeePerYear.toLocaleString('en-IN')}/yr
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={() => { setEditingFs(fs); setView('FEE_STRUCT_EDIT'); }}
                        className="p-2 bg-indigo-50 text-indigo-600 rounded-xl"><Edit2 size={13} /></button>
                      <button onClick={() => handleDeleteFs(fs.id)}
                        className="p-2 bg-rose-50 text-rose-500 rounded-xl"><Trash2 size={13} /></button>
                    </div>
                  </div>
                  {fs.otherCharges.length > 0 && (
                    <div className="px-4 pb-3 flex flex-wrap gap-1.5 border-t border-slate-50 pt-2">
                      {fs.otherCharges.map((c, i) => (
                        <span key={i} className="text-[9px] font-black bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                          {c.label} ₹{c.amount} ({c.frequency === 'MONTHLY' ? 'mo' : c.frequency === 'ANNUAL' ? 'yr' : '1x'})
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* PROMOTION TAB */}
        {tab === 'PROMOTION' && (
          <>
            <button onClick={() => setView('PROMOTION')}
              className="w-full flex items-center justify-center gap-2 bg-amber-600 text-white font-black text-xs uppercase tracking-widest py-3 rounded-2xl active:scale-95 transition-transform">
              <Users size={14} /> Process Promotions
            </button>
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <p className="text-xs font-black text-amber-700">When a new academic year is created, use promotion workflow to mark failed, RTE, and transfer certificate students.</p>
            </div>
          </>
        )}

        {/* PAYMENTS TAB */}
        {tab === 'PAYMENTS' && (
          <>
            {/* UPI ID */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <CreditCard size={16} className="text-blue-600" />
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">UPI Payment ID</p>
              </div>
              <p className="text-xs font-bold text-slate-500">
                This UPI ID will be shown to parents in the fee payment screen.
              </p>
              <div className="flex gap-2">
                <input
                  value={upiId}
                  onChange={e => { setUpiId(e.target.value); setUpiSaved(false); }}
                  placeholder="e.g. school@okaxis"
                  className="flex-1 border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-blue-500 focus:bg-white transition-colors"
                />
                <button
                  onClick={() => { setUpiSaved(true); showToast('UPI ID saved'); }}
                  className={`px-4 py-3 rounded-xl font-black text-sm transition-colors ${upiSaved ? 'bg-emerald-500 text-white' : 'bg-slate-900 text-white'}`}>
                  {upiSaved ? <CheckCircle2 size={16} /> : <Save size={16} />}
                </button>
              </div>
              {upiId && (
                <div className="flex items-center gap-2 bg-blue-50 rounded-xl px-3 py-2">
                  <QrCode size={14} className="text-blue-600 shrink-0" />
                  <span className="text-xs font-black text-blue-700">{upiId}</span>
                </div>
              )}
            </div>

            {/* QR Code Upload */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <QrCode size={16} className="text-violet-600" />
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Payment QR Code</p>
              </div>
              <p className="text-xs font-bold text-slate-500">
                Upload a QR code image. Parents can scan this to pay fees directly.
              </p>

              {/* QR preview placeholder */}
              <div className="w-36 h-36 mx-auto bg-slate-100 rounded-2xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center gap-2">
                {qrFileName ? (
                  <>
                    <div className="w-full h-full grid grid-cols-6 gap-px p-3 rounded-2xl">
                      {Array.from({ length: 36 }, (_, i) => (
                        <div key={i} className={`rounded-sm ${(i * 7 + i * 3) % 3 === 0 ? 'bg-slate-800' : 'bg-white'}`} />
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <QrCode size={28} className="text-slate-300" />
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">No QR</span>
                  </>
                )}
              </div>

              <label className="w-full flex items-center justify-center gap-2 bg-violet-600 text-white font-black text-xs uppercase tracking-widest py-3 rounded-2xl cursor-pointer active:scale-95 transition-transform">
                <Plus size={14} /> {qrFileName ? 'Replace QR Image' : 'Upload QR Image'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setQrFileName(file.name);
                      showToast(`QR image "${file.name}" uploaded`);
                    }
                  }}
                />
              </label>

              {qrFileName && (
                <div className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2.5">
                  <span className="text-xs font-bold text-slate-600 truncate">{qrFileName}</span>
                  <button onClick={() => setQrFileName('')} className="text-slate-400 hover:text-rose-500 transition-colors ml-2 shrink-0">
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </div>

            {/* Info note */}
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
              <p className="text-xs font-black text-blue-700">
                UPI ID and QR code are shown in the student/parent Fee Payment screen under "Pay via UPI".
              </p>
            </div>
          </>
        )}

        {/* SECURITY TAB */}
        {tab === 'SECURITY' && (
          <>
            {session?.mustChangePassword && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-2">
                <ShieldCheck size={18} className="text-amber-700 shrink-0 mt-0.5" />
                <p className="text-xs font-black text-amber-800">
                  You're still using the temporary password. Please set a new one before continuing.
                </p>
              </div>
            )}

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <Lock size={16} className="text-blue-600" />
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Change Password</p>
              </div>

              {pwError && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 text-xs font-bold text-rose-700">{pwError}</div>
              )}

              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Current Password</label>
                <div className="relative">
                  <input
                    type={pwShow ? 'text' : 'password'}
                    value={pwCurrent}
                    onChange={e => setPwCurrent(e.target.value)}
                    placeholder="Enter current password"
                    className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 pr-11 font-bold text-sm outline-none focus:border-blue-500 focus:bg-white" />
                  <button type="button" onClick={() => setPwShow(!pwShow)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                    {pwShow ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">New Password</label>
                <input
                  type={pwShow ? 'text' : 'password'}
                  value={pwNew}
                  onChange={e => setPwNew(e.target.value)}
                  placeholder="Min 6 characters"
                  className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-blue-500 focus:bg-white" />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Confirm New Password</label>
                <input
                  type={pwShow ? 'text' : 'password'}
                  value={pwConfirm}
                  onChange={e => setPwConfirm(e.target.value)}
                  placeholder="Re-enter new password"
                  className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-blue-500 focus:bg-white" />
              </div>

              <button onClick={handleChangePassword} disabled={pwSaving}
                className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white font-black text-xs uppercase tracking-widest py-3 rounded-2xl active:scale-95 transition-transform disabled:opacity-60">
                {pwSaving ? 'Saving…' : <><Save size={14} /> Update Password</>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
