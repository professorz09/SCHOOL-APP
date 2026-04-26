import React, { useEffect, useState } from 'react';
import {
  ArrowLeft, Plus, Search, Users, ChevronRight, User, Phone, Mail,
  IndianRupee, BookOpen, Calendar, AlertCircle, CheckCircle2, Clock,
  X, Save, Send, FileText, BarChart2,
} from 'lucide-react';
import { studentService } from '../../../services/student.service';
import { Student, CreateStudentInput, FeeRecord, StudentAcademicRecord } from '../../../types/principal.types';
import { PaymentStatus, PAYMENT_COLORS } from '../../../config/constants';
import { useUIStore } from '../../../store/uiStore';

type View = 'LIST' | 'CREATE' | 'PROFILE' | 'FEES' | 'RESULTS' | 'ATTENDANCE';
type FeeFilter = 'ALL' | 'PAID' | 'PENDING' | 'OVERDUE';

interface Props { onBack: () => void; }

const CLASS_OPTIONS = ['Class 1','Class 2','Class 3','Class 4','Class 5','Class 6','Class 7','Class 8','Class 9','Class 10','Class 11','Class 12'];
const BLOOD_GROUPS = ['A+','A-','B+','B-','O+','O-','AB+','AB-'];

const BLANK_FORM: CreateStudentInput = {
  name: '', rollNo: '', admissionNo: '', className: 'Class 10', section: 'A',
  dob: '', gender: 'MALE', bloodGroup: 'O+', aadhaarNo: '', phone: '',
  email: '', address: '', photo: '', fatherName: '', fatherPhone: '',
  motherName: '', motherPhone: '', academicYearId: 'ay1',
  admissionDate: new Date().toISOString().split('T')[0], totalFee: 45000,
};

export const StudentsManager: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();
  const [view, setView] = useState<View>('LIST');
  const [students, setStudents] = useState<Student[]>([]);
  const [selected, setSelected] = useState<Student | null>(null);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState<string>('ALL');
  const [feeFilter, setFeeFilter] = useState<FeeFilter>('ALL');
  const [form, setForm] = useState<CreateStudentInput>(BLANK_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feeRecords, setFeeRecords] = useState<FeeRecord[]>([]);
  const [academicRecord, setAcademicRecord] = useState<StudentAcademicRecord | null>(null);
  const [activeProfileTab, setActiveProfileTab] = useState<'INFO' | 'ACADEMIC' | 'FEES' | 'ATTENDANCE'>('INFO');

  useEffect(() => { studentService.getAll().then(setStudents); }, []);

  const loadStudentData = async (student: Student) => {
    const [fees, record] = await Promise.all([
      studentService.getFeeRecords(student.id),
      studentService.getAcademicRecord(student.id, student.academicYearId),
    ]);
    setFeeRecords(fees);
    setAcademicRecord(record);
  };

  const filtered = students.filter(s => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.rollNo.includes(search) || s.admissionNo.toLowerCase().includes(search.toLowerCase());
    const matchClass = classFilter === 'ALL' || s.className === classFilter;
    const matchFee = feeFilter === 'ALL' || s.feeStatus === feeFilter;
    return matchSearch && matchClass && matchFee;
  });

  const handleCreate = async () => {
    if (!form.name || !form.admissionNo || !form.rollNo) {
      showToast('Name, admission no. and roll no. required', 'error'); return;
    }
    setIsSubmitting(true);
    try {
      const student = await studentService.create(form);
      setStudents(prev => [...prev, student]);
      showToast(`${student.name} admitted successfully!`);
      setForm(BLANK_FORM);
      setView('LIST');
    } finally { setIsSubmitting(false); }
  };

  const handleMarkFeePaid = async (feeId: string) => {
    const txn = `TXN-${Date.now()}`;
    await studentService.markFeePaid(feeId, txn);
    const updated = await studentService.getFeeRecords(selected!.id);
    setFeeRecords(updated);
    const updatedStudent = await studentService.getById(selected!.id);
    if (updatedStudent) {
      setSelected(updatedStudent);
      setStudents(prev => prev.map(s => s.id === updatedStudent.id ? updatedStudent : s));
    }
    showToast('Payment marked as paid');
  };

  const handleSendReminder = async (studentId: string) => {
    await studentService.sendFeeReminder(studentId);
    showToast('Fee reminder sent to parent', 'info');
  };

  const renderHeader = (title: string, back: () => void, action?: React.ReactNode) => (
    <div className="bg-white border-b border-slate-100 px-4 pt-12 pb-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
      <div className="flex items-center gap-3">
        <button onClick={back} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">{title}</h2>
      </div>
      {action}
    </div>
  );

  const feeStatusIcon = (status: PaymentStatus) => {
    if (status === PaymentStatus.PAID) return <CheckCircle2 size={14} className="text-emerald-500" />;
    if (status === PaymentStatus.OVERDUE) return <AlertCircle size={14} className="text-rose-500" />;
    return <Clock size={14} className="text-amber-500" />;
  };

  // ─── LIST ──────────────────────────────────────────────────────────────────

  if (view === 'LIST') return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader('Students', onBack,
        <button onClick={() => setView('CREATE')} className="p-2 bg-indigo-500 text-white rounded-full shadow-md">
          <Plus size={18} />
        </button>
      )}
      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-3">
        {/* Search */}
        <div className="relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name / roll no…"
            className="w-full bg-white border border-slate-200 rounded-2xl pl-11 pr-4 py-3 font-bold text-sm outline-none focus:border-indigo-500 shadow-sm" />
        </div>

        {/* Class filter */}
        <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
          {['ALL', ...CLASS_OPTIONS.filter(c => students.some(s => s.className === c))].map(c => (
            <button key={c} onClick={() => setClassFilter(c)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors ${classFilter === c ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 border border-slate-200'}`}>
              {c}
            </button>
          ))}
        </div>

        {/* Fee filter */}
        <div className="flex gap-2">
          {(['ALL', 'PAID', 'PENDING', 'OVERDUE'] as FeeFilter[]).map(f => (
            <button key={f} onClick={() => setFeeFilter(f)}
              className={`flex-1 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-colors ${feeFilter === f ? 'bg-slate-900 text-white' : 'bg-white text-slate-400 border border-slate-200'}`}>
              {f}
            </button>
          ))}
        </div>

        {/* Summary */}
        <div className="flex gap-2">
          {[
            { label: 'Total', val: students.length, color: 'bg-slate-900 text-white' },
            { label: 'Paid', val: students.filter(s => s.feeStatus === PaymentStatus.PAID).length, color: 'bg-emerald-50 text-emerald-700' },
            { label: 'Pending', val: students.filter(s => s.feeStatus === PaymentStatus.PENDING).length, color: 'bg-amber-50 text-amber-700' },
            { label: 'Overdue', val: students.filter(s => s.feeStatus === PaymentStatus.OVERDUE).length, color: 'bg-rose-50 text-rose-700' },
          ].map(({ label, val, color }) => (
            <div key={label} className={`flex-1 px-2 py-1.5 rounded-xl text-center text-[9px] font-black uppercase tracking-widest ${color}`}>
              <div className="text-sm font-black">{val}</div>
              <div className="opacity-80">{label}</div>
            </div>
          ))}
        </div>

        {/* List */}
        <div className="space-y-2">
          {filtered.map(student => (
            <button key={student.id}
              onClick={() => { setSelected(student); loadStudentData(student); setActiveProfileTab('INFO'); setView('PROFILE'); }}
              className="w-full bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-left active:bg-slate-50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-100 to-violet-100 text-indigo-700 flex items-center justify-center font-black text-sm shrink-0">
                  {student.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-extrabold text-slate-900 text-sm truncate">{student.name}</div>
                  <div className="text-[10px] font-bold text-slate-400 mt-0.5">{student.className}-{student.section} · Roll {student.rollNo}</div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${PAYMENT_COLORS[student.feeStatus]}`}>
                    {student.feeStatus}
                  </span>
                  <span className="text-[10px] font-black text-slate-400">{student.attendancePercent}%</span>
                </div>
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="flex flex-col items-center py-16 text-slate-400">
              <Users size={32} className="mb-3 opacity-40" />
              <p className="font-bold text-sm">No students found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // ─── CREATE (ADMISSION) ────────────────────────────────────────────────────

  if (view === 'CREATE') return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader('New Admission', () => setView('LIST'))}
      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-4">
        {/* Basic Info */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Student Info</p>
          {[
            { label: 'Full Name *', key: 'name', placeholder: 'Student full name' },
            { label: 'Admission No. *', key: 'admissionNo', placeholder: 'ADM-2024-XXX' },
            { label: 'Roll No. *', key: 'rollNo', placeholder: '01' },
            { label: 'Aadhaar No.', key: 'aadhaarNo', placeholder: 'XXXX XXXX XXXX' },
          ].map(({ label, key, placeholder }) => (
            <div key={key}>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">{label}</label>
              <input value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500 focus:bg-white transition-colors" />
            </div>
          ))}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Class</label>
              <select value={form.className} onChange={e => setForm(f => ({ ...f, className: e.target.value }))}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none focus:border-indigo-500">
                {CLASS_OPTIONS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Section</label>
              <input value={form.section} onChange={e => setForm(f => ({ ...f, section: e.target.value }))}
                placeholder="A" className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Date of Birth</label>
              <input type="date" value={form.dob} onChange={e => setForm(f => ({ ...f, dob: e.target.value }))}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Blood Group</label>
              <select value={form.bloodGroup} onChange={e => setForm(f => ({ ...f, bloodGroup: e.target.value as any }))}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none focus:border-indigo-500">
                {BLOOD_GROUPS.map(bg => <option key={bg}>{bg}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Gender</label>
            <div className="flex gap-2">
              {(['MALE', 'FEMALE', 'OTHER'] as const).map(g => (
                <button key={g} onClick={() => setForm(f => ({ ...f, gender: g }))}
                  className={`flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-colors ${form.gender === g ? 'bg-indigo-600 text-white' : 'bg-slate-50 border border-slate-200 text-slate-500'}`}>
                  {g}
                </button>
              ))}
            </div>
          </div>
          {[
            { label: 'Phone', key: 'phone', placeholder: '+91 XXXXX XXXXX' },
            { label: 'Email', key: 'email', placeholder: 'student@school.edu.in' },
            { label: 'Address', key: 'address', placeholder: 'Full residential address' },
          ].map(({ label, key, placeholder }) => (
            <div key={key}>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">{label}</label>
              <input value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500" />
            </div>
          ))}
        </div>

        {/* Parent Info */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Parent Details</p>
          {[
            { label: "Father's Name", key: 'fatherName', placeholder: 'Full name' },
            { label: "Father's Phone", key: 'fatherPhone', placeholder: '+91 XXXXX XXXXX' },
            { label: "Mother's Name", key: 'motherName', placeholder: 'Full name' },
            { label: "Mother's Phone", key: 'motherPhone', placeholder: '+91 XXXXX XXXXX' },
          ].map(({ label, key, placeholder }) => (
            <div key={key}>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">{label}</label>
              <input value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500" />
            </div>
          ))}
        </div>

        {/* Fee */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Fee Settings</p>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Annual Fee (₹)</label>
            <input type="number" value={form.totalFee} onChange={e => setForm(f => ({ ...f, totalFee: +e.target.value }))}
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Admission Date</label>
            <input type="date" value={form.admissionDate} onChange={e => setForm(f => ({ ...f, admissionDate: e.target.value }))}
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none focus:border-indigo-500" />
          </div>
        </div>

        <button onClick={handleCreate} disabled={isSubmitting}
          className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg disabled:opacity-60">
          {isSubmitting ? 'Admitting…' : <><Plus size={16} /> Admit Student</>}
        </button>
      </div>
    </div>
  );

  // ─── PROFILE ───────────────────────────────────────────────────────────────

  if (view === 'PROFILE' && selected) {
    const tabs = [
      { key: 'INFO' as const, label: 'Info', icon: User },
      { key: 'ACADEMIC' as const, label: 'Results', icon: BarChart2 },
      { key: 'FEES' as const, label: 'Fees', icon: IndianRupee },
      { key: 'ATTENDANCE' as const, label: 'Attend.', icon: Calendar },
    ];

    return (
      <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        {renderHeader(selected.name, () => setView('LIST'))}
        <div className="flex-1 overflow-y-auto pb-28">
          {/* Profile hero */}
          <div className="bg-white px-4 pt-4 pb-0 border-b border-slate-100">
            <div className="flex items-center gap-4 pb-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-100 to-violet-200 text-indigo-700 flex items-center justify-center font-black text-2xl shrink-0">
                {selected.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
              </div>
              <div>
                <h3 className="font-black text-slate-900 text-base">{selected.name}</h3>
                <div className="flex gap-2 mt-1 flex-wrap">
                  <span className="text-[9px] font-black bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full uppercase">{selected.className}-{selected.section}</span>
                  <span className="text-[9px] font-black bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full uppercase">Roll {selected.rollNo}</span>
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${PAYMENT_COLORS[selected.feeStatus]}`}>{selected.feeStatus}</span>
                </div>
              </div>
            </div>

            {/* Tab bar */}
            <div className="flex border-t border-slate-100">
              {tabs.map(({ key, label, icon: Icon }) => (
                <button key={key} onClick={() => setActiveProfileTab(key)}
                  className={`flex-1 flex flex-col items-center gap-1 py-3 text-[10px] font-black uppercase tracking-widest transition-colors border-b-2 ${activeProfileTab === key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400'}`}>
                  <Icon size={14} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-4 space-y-3">
            {/* INFO TAB */}
            {activeProfileTab === 'INFO' && (
              <>
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Personal Details</p>
                  {[
                    { label: 'Admission No.', val: selected.admissionNo },
                    { label: 'Date of Birth', val: selected.dob },
                    { label: 'Blood Group', val: selected.bloodGroup },
                    { label: 'Gender', val: selected.gender },
                    { label: 'Aadhaar', val: selected.aadhaarNo || '—' },
                    { label: 'Phone', val: selected.phone || '—' },
                    { label: 'Email', val: selected.email || '—' },
                    { label: 'Address', val: selected.address || '—' },
                    { label: 'Admission Date', val: selected.admissionDate },
                  ].map(({ label, val }) => (
                    <div key={label} className="flex items-start justify-between gap-2">
                      <span className="text-[10px] font-bold text-slate-400 shrink-0">{label}</span>
                      <span className="text-[11px] font-bold text-slate-700 text-right">{val}</span>
                    </div>
                  ))}
                </div>
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Parent Details</p>
                  {[
                    { label: "Father", val: `${selected.fatherName} · ${selected.fatherPhone}` },
                    { label: "Mother", val: `${selected.motherName} · ${selected.motherPhone}` },
                  ].map(({ label, val }) => (
                    <div key={label} className="flex items-start justify-between gap-2">
                      <span className="text-[10px] font-bold text-slate-400 shrink-0">{label}</span>
                      <span className="text-[11px] font-bold text-slate-700 text-right">{val}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* RESULTS TAB */}
            {activeProfileTab === 'ACADEMIC' && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Exam Results</p>
                {(academicRecord?.exams.length ?? 0) === 0 && (
                  <div className="flex flex-col items-center py-8 text-slate-400">
                    <BarChart2 size={28} className="mb-2 opacity-40" />
                    <p className="font-bold text-sm">No results recorded yet</p>
                  </div>
                )}
                <div className="space-y-2">
                  {academicRecord?.exams.map(exam => (
                    <div key={exam.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                      <div>
                        <div className="font-bold text-slate-800 text-xs">{exam.examName}</div>
                        <div className="text-[10px] font-bold text-slate-400 mt-0.5">{exam.subject} · {exam.date}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-black text-slate-900 text-sm">{exam.obtainedMarks}/{exam.maxMarks}</div>
                        <div className={`text-[10px] font-black mt-0.5 ${exam.grade.startsWith('A') ? 'text-emerald-600' : exam.grade.startsWith('B') ? 'text-blue-600' : 'text-amber-600'}`}>{exam.grade}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* FEES TAB */}
            {activeProfileTab === 'FEES' && (
              <>
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Fee Summary</p>
                    <button onClick={() => handleSendReminder(selected.id)}
                      className="flex items-center gap-1 text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg">
                      <Send size={10} /> Reminder
                    </button>
                  </div>
                  <div className="flex gap-3 mt-2">
                    <div className="flex-1 text-center">
                      <div className="text-lg font-black text-emerald-600">₹{(selected.paidFee / 1000).toFixed(0)}K</div>
                      <div className="text-[9px] font-black text-slate-400 uppercase">Paid</div>
                    </div>
                    <div className="flex-1 text-center">
                      <div className="text-lg font-black text-rose-500">₹{((selected.totalFee - selected.paidFee) / 1000).toFixed(0)}K</div>
                      <div className="text-[9px] font-black text-slate-400 uppercase">Due</div>
                    </div>
                    <div className="flex-1 text-center">
                      <div className="text-lg font-black text-slate-900">{selected.totalFee > 0 ? Math.round((selected.paidFee / selected.totalFee) * 100) : 0}%</div>
                      <div className="text-[9px] font-black text-slate-400 uppercase">Complete</div>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  {feeRecords.map(fee => (
                    <div key={fee.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-bold text-slate-800 text-sm">{fee.description}</div>
                          <div className="text-[10px] font-bold text-slate-400 mt-0.5">Due: {fee.dueDate}</div>
                          {fee.paidAt && <div className="text-[10px] font-bold text-emerald-600 mt-0.5">Paid: {fee.paidAt}</div>}
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <div className="flex items-center gap-1">
                            {feeStatusIcon(fee.status)}
                            <span className="font-black text-slate-900 text-sm">₹{fee.amount.toLocaleString('en-IN')}</span>
                          </div>
                          {fee.status !== PaymentStatus.PAID && (
                            <button onClick={() => handleMarkFeePaid(fee.id)}
                              className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg">
                              Mark Paid
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {feeRecords.length === 0 && (
                    <div className="flex flex-col items-center py-8 text-slate-400">
                      <IndianRupee size={28} className="mb-2 opacity-40" />
                      <p className="font-bold text-sm">No fee records</p>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ATTENDANCE TAB */}
            {activeProfileTab === 'ATTENDANCE' && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Attendance</p>
                <div className="flex items-center justify-between mb-4">
                  <span className="font-black text-slate-400 text-xs">Overall</span>
                  <span className={`font-black text-2xl ${selected.attendancePercent >= 75 ? 'text-emerald-600' : 'text-rose-500'}`}>{selected.attendancePercent}%</span>
                </div>
                {(academicRecord?.attendanceRecords.length ?? 0) === 0 && (
                  <div className="flex flex-col items-center py-6 text-slate-400">
                    <Calendar size={28} className="mb-2 opacity-40" />
                    <p className="font-bold text-sm">No attendance data</p>
                  </div>
                )}
                <div className="space-y-2">
                  {academicRecord?.attendanceRecords.map(att => {
                    const pct = att.total > 0 ? Math.round((att.present / att.total) * 100) : 0;
                    return (
                      <div key={att.month} className="flex items-center gap-3">
                        <div className="w-20 text-[10px] font-bold text-slate-500 shrink-0">{att.month}</div>
                        <div className="flex-1 bg-slate-100 rounded-full h-2">
                          <div className={`h-2 rounded-full ${pct >= 75 ? 'bg-emerald-500' : 'bg-rose-400'}`} style={{ width: `${pct}%` }} />
                        </div>
                        <div className="text-[10px] font-black text-slate-600 shrink-0">{att.present}/{att.total}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
};
