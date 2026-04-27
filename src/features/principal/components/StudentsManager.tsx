import React, { useEffect, useState } from 'react';
import {
  ArrowLeft, Plus, Search, Users, ChevronRight, User, Phone, Mail,
  IndianRupee, BookOpen, Calendar, AlertCircle, CheckCircle2, Clock,
  X, Save, Send, FileText, BarChart2, FolderOpen, Home, Copy, MapPin, FileCheck,
} from 'lucide-react';
import { studentService } from '../../../services/student.service';
import { Student, CreateStudentInput, FeeRecord, StudentAcademicRecord, STREAMS, STREAM_CLASSES, StudentStream } from '../../../types/principal.types';
import { PaymentStatus, PAYMENT_COLORS } from '../../../config/constants';
import { useUIStore } from '../../../store/uiStore';
import { authService, ParentUser } from '../../../services/auth.service';
import { schoolInfoService } from '../../../services/schoolInfo.service';
import { AdmissionFormPrint } from '../../../components/AdmissionFormPrint';

type MainView = 'MENU' | 'ADMISSION' | 'FEES' | 'CLASSES';
type SubView = 'LIST' | 'CREATE' | 'PROFILE' | 'CLASS_DETAIL' | 'SECTION_DETAIL';

interface Props { onBack: () => void; initialView?: MainView; }

const CLASS_OPTIONS = ['Class 1','Class 2','Class 3','Class 4','Class 5','Class 6','Class 7','Class 8','Class 9','Class 10','Class 11','Class 12'];
const BLOOD_GROUPS = ['A+','A-','B+','B-','O+','O-','AB+','AB-'];

const BLANK_FORM: CreateStudentInput = {
  name: '', rollNo: '', admissionNo: '', className: 'Class 10', section: 'A',
  dob: '', gender: 'MALE', bloodGroup: 'O+', aadhaarNo: '', phone: '',
  email: '', address: '', photo: '', fatherName: '', fatherPhone: '',
  motherName: '', motherPhone: '', academicYearId: 'ay1',
  admissionDate: new Date().toISOString().split('T')[0], totalFee: 45000,
  religion: '', caste: '', penNumber: '', birthCertNo: '', tcNumber: '', rte: false,
  fatherOccupation: '', fatherIncome: '', fatherEmail: '', motherOccupation: '',
  guardianName: '', guardianPhone: '', guardianRelation: '',
};

interface FormWithParent extends CreateStudentInput {
  parentMobileNumber: string;
  parentName: string;
  parentEmail: string;
}

interface DocumentUpload {
  type: 'BIRTH_CERT' | 'TRANSFER_CERT' | 'AADHAAR' | 'PHOTO' | 'OTHER';
  name: string;
  uploaded: boolean;
}

const BLANK_FORM_WITH_PARENT: FormWithParent = {
  ...BLANK_FORM,
  parentMobileNumber: '',
  parentName: '',
  parentEmail: '',
};

export const StudentsManager: React.FC<Props> = ({ onBack, initialView }) => {
  const { showToast } = useUIStore();
  const [mainView, setMainView] = useState<MainView>(initialView ?? 'CLASSES');
  const [subView, setSubView] = useState<SubView>('LIST');
  const [students, setStudents] = useState<Student[]>([]);
  const [selected, setSelected] = useState<Student | null>(null);
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState<string>('ALL');
  const [form, setForm] = useState<FormWithParent>(BLANK_FORM_WITH_PARENT);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feeRecords, setFeeRecords] = useState<FeeRecord[]>([]);
  const [academicRecord, setAcademicRecord] = useState<StudentAcademicRecord | null>(null);
  const [activeProfileTab, setActiveProfileTab] = useState<'INFO' | 'ACADEMIC' | 'FEES' | 'ATTENDANCE'>('INFO');
  const [createdParent, setCreatedParent] = useState<ParentUser | null>(null);
  const [showParentModal, setShowParentModal] = useState(false);
  const [showAdmissionForm, setShowAdmissionForm] = useState(false);
  const [documents, setDocuments] = useState<DocumentUpload[]>([
    { type: 'BIRTH_CERT', name: 'Birth Certificate', uploaded: false },
    { type: 'TRANSFER_CERT', name: 'Transfer Certificate', uploaded: false },
    { type: 'AADHAAR', name: 'Aadhaar Card', uploaded: false },
    { type: 'PHOTO', name: 'Student Photo', uploaded: false },
    { type: 'OTHER', name: 'Other Documents', uploaded: false },
  ]);

  useEffect(() => { studentService.getAll().then(setStudents); }, []);

  const loadStudentData = async (student: Student) => {
    const [fees, record] = await Promise.all([
      studentService.getFeeRecords(student.id),
      studentService.getAcademicRecord(student.id, student.academicYearId),
    ]);
    setFeeRecords(fees);
    setAcademicRecord(record);
  };

  const handleCreate = async () => {
    if (!form.name || !form.admissionNo || !form.rollNo) {
      showToast('Name, admission no. and roll no. required', 'error');
      return;
    }
    if (!form.parentMobileNumber.trim()) {
      showToast('Parent mobile number required', 'error');
      return;
    }
    if (STREAM_CLASSES.has(form.className) && !form.stream) {
      showToast('Stream is required for Class 11 and 12', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      // Create the student
      const { parentMobileNumber, parentName, parentEmail, ...studentData } = form;
      const student = await studentService.create(studentData);

      // Check if parent exists by mobile number
      let parent = authService.getParentByMobile(parentMobileNumber);

      if (parent) {
        // Link student to existing parent
        authService.linkStudentToParent(parent.id, student.id);
        showToast(`${student.name} admitted! Linked to existing parent account (${parentName})`);
      } else {
        // Create new parent account
        parent = authService.createParentAccount(
          parentMobileNumber,
          parentName || form.fatherName,
          parentEmail || form.fatherEmail || '',
          'sch1',
          student.id,
        );
        setCreatedParent(parent);
        setShowParentModal(true);
      }

      setStudents(prev => [...prev, student]);
      setSelected(student);
      setForm(BLANK_FORM_WITH_PARENT);
      setShowAdmissionForm(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMarkFeePaid = async (feeId: string) => {
    await studentService.markFeePaid(feeId, `TXN-${Date.now()}`);
    const updated = await studentService.getFeeRecords(selected!.id);
    setFeeRecords(updated);
    showToast('Payment marked as paid');
  };

  const handleDocumentUpload = (e: React.ChangeEvent<HTMLInputElement>, docType: DocumentUpload['type']) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxSizeMB = 2;
    const maxSizeBytes = maxSizeMB * 1024 * 1024;

    if (file.size > maxSizeBytes) {
      showToast(`File must be less than ${maxSizeMB}MB. Current: ${(file.size / 1024 / 1024).toFixed(1)}MB`, 'error');
      return;
    }

    setDocuments(prev => prev.map(d => d.type === docType ? { ...d, uploaded: true } : d));
    showToast(`${file.name} uploaded (${(file.size / 1024).toFixed(0)}KB)`);
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

  // ─── PROFILE short-circuit ─────────────────────────────────────────────
  // Profile rendering is independent of the active mainView. It must be
  // checked BEFORE the mainView blocks because clicking a student from any
  // tab (Admission / Fees / Classes) only flips subView, leaving mainView
  // pointing at the source list — without this guard the source list would
  // re-render instead of the profile.
  const renderProfile = subView === 'PROFILE' && selected;

  // ─── MENU (Main Folders) ────────────────────────────────────────────────

  if (!renderProfile && mainView === 'MENU') return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader('Students', onBack)}
      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-4">
        <div className="grid grid-cols-1 gap-3">
          {[
            { icon: FileText, label: 'Admission', desc: 'Add new students & update records', action: () => { setMainView('ADMISSION'); setSubView('LIST'); } },
          ].map(({ icon: Icon, label, desc, action }) => (
            <button key={label} onClick={action}
              className="flex items-center gap-4 bg-white rounded-2xl border border-slate-100 shadow-sm p-5 active:scale-95 transition-transform text-left">
              <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                <Icon size={24} />
              </div>
              <div className="flex-1">
                <div className="font-extrabold text-slate-900 text-base">{label}</div>
                <div className="text-[10px] font-bold text-slate-400 mt-1">{desc}</div>
              </div>
              <ChevronRight size={20} className="text-slate-300" />
            </button>
          ))}
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-2 mt-6">
          {[
            { label: 'Total', val: students.length, color: 'bg-slate-900 text-white' },
            { label: 'Fees Paid', val: students.filter(s => s.feeStatus === PaymentStatus.PAID).length, color: 'bg-emerald-50 text-emerald-700' },
            { label: 'Pending', val: students.filter(s => s.feeStatus === PaymentStatus.PENDING).length, color: 'bg-amber-50 text-amber-700' },
          ].map(({ label, val, color }) => (
            <div key={label} className={`rounded-2xl p-3 text-center ${color}`}>
              <div className="font-black text-lg">{val}</div>
              <div className="text-[9px] font-black uppercase tracking-widest mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ─── ADMISSION (Add/Search) ────────────────────────────────────────────

  if (!renderProfile && mainView === 'ADMISSION') {
    const filteredStudents = students
      .filter(s =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.rollNo.includes(search) || s.admissionNo.toLowerCase().includes(search.toLowerCase())
      )
      .sort((a, b) => new Date(b.admissionDate ?? 0).getTime() - new Date(a.admissionDate ?? 0).getTime());

    if (subView === 'CREATE') return (
      <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        {renderHeader('New Admission', () => setSubView('LIST'))}
        <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Student Info</p>
            {[
              { label: 'Full Name *', key: 'name', placeholder: 'Student full name' },
              { label: 'Admission No. *', key: 'admissionNo', placeholder: 'ADM-2024-XXX' },
              { label: 'Roll No. *', key: 'rollNo', placeholder: '01' },
              { label: 'Aadhaar No.', key: 'aadhaarNo', placeholder: 'XXXX XXXX XXXX' },
              { label: 'Religion', key: 'religion', placeholder: 'e.g. Hindu, Muslim, Christian' },
              { label: 'Caste', key: 'caste', placeholder: 'e.g. General, OBC, SC, ST' },
              { label: 'PEN Number', key: 'penNumber', placeholder: 'Optional' },
              { label: 'Birth Certificate No.', key: 'birthCertNo', placeholder: 'Optional' },
            ].map(({ label, key, placeholder }) => (
              <div key={key}>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">{label}</label>
                <input value={(form as any)[key] ?? ''} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500 focus:bg-white transition-colors" />
              </div>
            ))}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Class</label>
                <select value={form.className} onChange={e => setForm(f => ({ ...f, className: e.target.value, stream: undefined }))}
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
            {STREAM_CLASSES.has(form.className) && (
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Stream *</label>
                <div className="grid grid-cols-3 gap-2">
                  {STREAMS.map(s => (
                    <button key={s} type="button"
                      onClick={() => setForm(f => ({ ...f, stream: s }))}
                      className={`py-3 rounded-xl text-sm font-black border transition-all ${form.stream === s ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
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

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Parent Mobile & Login</p>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-3">
              <p className="text-[10px] font-bold text-blue-700">
                Parent mobile number is used for app login. A temporary password will be created.
              </p>
            </div>
            {[
              { label: 'Parent Mobile Number *', key: 'parentMobileNumber', placeholder: '10-digit mobile' },
              { label: 'Parent Name *', key: 'parentName', placeholder: 'Mother or Father name' },
              { label: 'Parent Email', key: 'parentEmail', placeholder: 'parent@email.com' },
            ].map(({ label, key, placeholder }) => (
              <div key={key}>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">{label}</label>
                <input value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500" />
              </div>
            ))}
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Parent Details</p>
            {[
              { label: "Father's Name", key: 'fatherName', placeholder: 'Full name' },
              { label: "Father's Occupation", key: 'fatherOccupation', placeholder: 'Business / Service / Farmer / etc.' },
              { label: "Father's Income", key: 'fatherIncome', placeholder: 'e.g. 5-10 LPA' },
              { label: "Father's Email", key: 'fatherEmail', placeholder: 'father@email.com' },
              { label: "Father's Phone", key: 'fatherPhone', placeholder: '+91 XXXXX XXXXX' },
              { label: "Mother's Name", key: 'motherName', placeholder: 'Full name' },
              { label: "Mother's Occupation", key: 'motherOccupation', placeholder: 'Occupation or Homemaker' },
              { label: "Mother's Phone", key: 'motherPhone', placeholder: '+91 XXXXX XXXXX' },
            ].map(({ label, key, placeholder }) => (
              <div key={key}>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">{label}</label>
                <input value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500" />
              </div>
            ))}
            <div className="flex items-center gap-2">
              <input type="checkbox" id="rte" checked={form.rte} onChange={e => setForm(f => ({ ...f, rte: e.target.checked }))}
                className="w-4 h-4 rounded" />
              <label htmlFor="rte" className="text-xs font-bold text-slate-600">RTE (Right to Free Education)</label>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Documents Checklist</p>
            <p className="text-[10px] font-bold text-slate-500 mb-3">Upload required documents. Max 2MB per file.</p>
            <div className="space-y-2">
              {documents.map(doc => (
                <div key={doc.type} className="flex items-center justify-between bg-slate-50 rounded-xl p-3 border border-slate-200">
                  <label className="flex items-center gap-3 flex-1 cursor-pointer">
                    <input type="checkbox" checked={doc.uploaded} readOnly className="w-4 h-4 rounded" />
                    <span className="text-sm font-bold text-slate-700">{doc.name}</span>
                  </label>
                  <label className="cursor-pointer">
                    <input type="file" onChange={(e) => handleDocumentUpload(e, doc.type)} className="hidden" accept="image/*,.pdf,.doc,.docx" />
                    <span className={`text-[10px] font-black px-3 py-1.5 rounded-full ${doc.uploaded ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'} transition-colors`}>
                      {doc.uploaded ? '✓ Done' : 'Upload'}
                    </span>
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Fee Settings</p>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Annual Fee (₹)</label>
              <input type="number" value={form.totalFee} onChange={e => setForm(f => ({ ...f, totalFee: +e.target.value }))}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500" />
            </div>
          </div>

          <button onClick={handleCreate} disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg disabled:opacity-60">
            {isSubmitting ? 'Admitting…' : <><Plus size={16} /> Admit Student</>}
          </button>
        </div>
      </div>
    );

    return (
      <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        {renderHeader('Admission', onBack,
          <button onClick={() => { setSubView('CREATE'); }} className="p-2 bg-indigo-500 text-white rounded-full shadow-md">
            <Plus size={18} />
          </button>
        )}
        <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-3">
          <div className="relative">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name / roll no…"
              className="w-full bg-white border border-slate-200 rounded-2xl pl-11 pr-4 py-3 font-bold text-sm outline-none focus:border-indigo-500 shadow-sm" />
          </div>

          <div className="space-y-2">
            {filteredStudents.map(student => (
              <button key={student.id}
                onClick={() => { setSelected(student); loadStudentData(student); setActiveProfileTab('INFO'); setSubView('PROFILE'); }}
                className="w-full bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-left active:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-100 to-violet-100 text-indigo-700 flex items-center justify-center font-black text-sm shrink-0">
                    {student.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-extrabold text-slate-900 text-sm truncate">{student.name}</div>
                    <div className="text-[10px] font-bold text-slate-400 mt-0.5">{student.admissionNo} · {student.className}-{student.section}</div>
                  </div>
                  <ChevronRight size={18} className="text-slate-300" />
                </div>
              </button>
            ))}
            {filteredStudents.length === 0 && (
              <div className="flex flex-col items-center py-16 text-slate-400">
                <Users size={32} className="mb-3 opacity-40" />
                <p className="font-bold text-sm">No students found</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── FEES (Fee Collection) ──────────────────────────────────────────────

  if (!renderProfile && mainView === 'FEES') {
    const filteredFees = students.filter(s =>
      (classFilter === 'ALL' || s.className === classFilter) &&
      s.name.toLowerCase().includes(search.toLowerCase())
    );

    return (
      <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        {renderHeader('Fee Collection', () => setMainView('MENU'))}
        <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-3">
          <div className="relative">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name…"
              className="w-full bg-white border border-slate-200 rounded-2xl pl-11 pr-4 py-3 font-bold text-sm outline-none focus:border-indigo-500 shadow-sm" />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
            {['ALL', ...CLASS_OPTIONS.filter(c => students.some(s => s.className === c))].map(c => (
              <button key={c} onClick={() => setClassFilter(c)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors ${classFilter === c ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 border border-slate-200'}`}>
                {c}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            {filteredFees.map(student => (
              <button key={student.id}
                onClick={() => { setSelected(student); loadStudentData(student); setActiveProfileTab('FEES'); setSubView('PROFILE'); }}
                className="w-full bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-left active:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-100 to-violet-100 text-indigo-700 flex items-center justify-center font-black text-sm shrink-0">
                    {student.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                  </div>
                  <div className="flex-1">
                    <div className="font-extrabold text-slate-900 text-sm">{student.name}</div>
                    <div className="text-[10px] font-bold text-slate-400 mt-0.5">{student.className}-{student.section} · ₹{((student.totalFee - student.paidFee) / 1000).toFixed(0)}K due</div>
                  </div>
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${PAYMENT_COLORS[student.feeStatus]}`}>
                    {student.feeStatus}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ─── CLASSES (Class → Section → Students) ────────────────────────────────

  if (!renderProfile && mainView === 'CLASSES') {
    const classes = [...new Set(students.map(s => s.className))].sort();
    const sections = selectedClass
      ? [...new Set(students.filter(s => s.className === selectedClass).map(s => s.section))].sort()
      : [];
    const classStudents = selectedClass && selectedSection
      ? students.filter(s => s.className === selectedClass && s.section === selectedSection)
      : [];

    // ── Student list in a section ──────────────────────────────────────────
    if (selectedClass && selectedSection) {
      return (
        <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
          <div className="bg-white border-b border-slate-100 px-4 pt-12 pb-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
            <div className="flex items-center gap-3">
              <button onClick={() => setSelectedSection(null)} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
                <ArrowLeft size={20} />
              </button>
              <div>
                <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">
                  {selectedClass}-{selectedSection} Students
                </h2>
                <p className="text-[10px] font-bold text-slate-400">{classStudents.length} students</p>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 pb-28">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              {classStudents.map((s, idx) => (
                <button key={s.id}
                  onClick={() => { setSelected(s); loadStudentData(s); setActiveProfileTab('INFO'); setSubView('PROFILE'); }}
                  className={`w-full flex items-center gap-4 px-4 py-3.5 text-left active:bg-slate-50 transition-colors ${idx < classStudents.length - 1 ? 'border-b border-slate-100' : ''}`}>
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-sm shrink-0">
                    {s.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                  </div>
                  {/* Name + Roll */}
                  <div className="flex-1">
                    <div className="font-extrabold text-slate-900 text-sm">{s.name}</div>
                    <div className="text-[10px] font-bold text-slate-400 mt-0.5">ROLL: {s.rollNo.padStart(2, '0')}</div>
                  </div>
                  {/* Attendance Badge */}
                  <div className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                    s.attendancePercent >= 75 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-600'
                  }`}>
                    {s.attendancePercent >= 75 ? 'PRESENT' : 'ABSENT'}
                  </div>
                  <ChevronRight size={16} className="text-slate-300" />
                </button>
              ))}
            </div>
          </div>
        </div>
      );
    }

    // ── Sections in a class ────────────────────────────────────────────────
    if (selectedClass) {
      const clsNum = selectedClass.replace('Class ', '');
      return (
        <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
          <div className="bg-white border-b border-slate-100 px-4 pt-12 pb-4 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
            <button onClick={() => setSelectedClass(null)} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
              <ArrowLeft size={20} />
            </button>
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">
              Class {clsNum} Sections
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto p-4 pb-28">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              {sections.map((section, idx) => {
                const count = students.filter(s => s.className === selectedClass && s.section === section).length;
                return (
                  <button key={section}
                    onClick={() => setSelectedSection(section)}
                    className={`w-full flex items-center gap-4 px-4 py-4 text-left active:bg-slate-50 transition-colors ${idx < sections.length - 1 ? 'border-b border-slate-100' : ''}`}>
                    {/* Section Avatar */}
                    <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-base shrink-0">
                      {section}
                    </div>
                    {/* Details */}
                    <div className="flex-1">
                      <div className="font-extrabold text-slate-900 text-sm">{clsNum}-{section}</div>
                      <div className="text-[10px] font-bold text-slate-400 mt-0.5 uppercase">Section {section}</div>
                    </div>
                    {/* Count Badge */}
                    <div className="bg-indigo-50 text-indigo-700 text-[10px] font-black px-3 py-1 rounded-lg uppercase">
                      {count} Students
                    </div>
                    <ChevronRight size={16} className="text-slate-300" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      );
    }

    // ── Class Directory (2×2 Grid) ─────────────────────────────────────────
    return (
      <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        <div className="bg-white border-b border-slate-100 px-4 pt-12 pb-4 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
          <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Students Directory</h2>
          </div>
        </div>

        {/* Search */}
        <div className="bg-white px-4 pb-4 border-b border-slate-100">
          <div className="relative">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search students, classes..."
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-11 pr-4 py-3 font-bold text-sm outline-none focus:border-indigo-500" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 pb-28">
          {/* 2x2 Grid of classes */}
          <div className="grid grid-cols-2 gap-3">
            {classes.map(cls => {
              const count = students.filter(s => s.className === cls).length;
              const clsNum = cls.replace('Class ', '');
              return (
                <button key={cls}
                  onClick={() => setSelectedClass(cls)}
                  className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 text-left active:scale-95 transition-transform flex flex-col items-start gap-1">
                  {/* Big Number */}
                  <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-xl mb-2">
                    {clsNum}
                  </div>
                  <div className="font-black text-slate-900 text-sm">{cls}</div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    {count} Students
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ─── PROFILE (Student Details) ──────────────────────────────────────────

  if (subView === 'PROFILE' && selected) {
    const tabList = [
      { key: 'INFO' as const,       label: 'INFO' },
      { key: 'ACADEMIC' as const,   label: 'RESULTS' },
      { key: 'FEES' as const,       label: 'FEES' },
      { key: 'ATTENDANCE' as const, label: 'ATTEND.' },
    ];

    return (
      <div className="absolute inset-0 z-50 bg-white flex flex-col animate-in slide-in-from-right-8 duration-300">
        {/* Header */}
        <div className="bg-white border-b border-slate-100 px-4 pt-12 pb-4 sticky top-0 z-10 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <button onClick={() => setSubView('LIST')}
                className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
                <ArrowLeft size={20} />
              </button>
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">{selected.name}</h2>
            </div>
            <button
              onClick={() => setShowAdmissionForm(true)}
              className="p-2 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center active:scale-90 transition-transform"
              title="View Admission Form"
            >
              <FileCheck size={20} />
            </button>
          </div>
          {/* Search */}
          <div className="relative mb-4">
            <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input readOnly placeholder="Search students, classes..."
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-11 pr-4 py-3 font-bold text-sm text-slate-400" />
          </div>
          {/* Tab Pills */}
          <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1">
            {tabList.map(({ key, label }) => (
              <button key={key} onClick={() => setActiveProfileTab(key)}
                className={`flex-shrink-0 px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-widest transition-all ${
                  activeProfileTab === key
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'bg-slate-100 text-slate-500 border border-slate-200'
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pb-28">
          <div className="p-4 space-y-4">
            {activeProfileTab === 'INFO' && (
              <>
                {/* Address */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5 mb-2">
                    <MapPin size={10} /> Address
                  </p>
                  <p className="font-bold text-slate-900 text-sm">{selected.address || '—'}</p>
                </div>

                {/* Parent Grid */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1 mb-1">
                        <User size={9} /> Father's Name
                      </p>
                      <p className="font-bold text-slate-900 text-sm">{selected.fatherName || '—'}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1 mb-1">
                        <User size={9} /> Mother's Name
                      </p>
                      <p className="font-bold text-slate-900 text-sm">{selected.motherName || '—'}</p>
                    </div>
                  </div>
                  <div className="border-t border-slate-100 pt-3">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1 mb-1">
                      <Phone size={9} /> Father Mobile
                    </p>
                    <p className="font-bold text-slate-900 text-sm">{selected.fatherPhone || '—'}</p>
                  </div>
                </div>

                {/* Aadhaar + RTE */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Aadhaar No</p>
                      <p className="font-bold text-slate-900 text-sm">
                        xxxx-xxxx-{(selected.aadhaarNo || '0000').slice(-4)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">RTE Applied</p>
                      <span className={`inline-block px-3 py-1 rounded-lg text-[10px] font-black uppercase ${
                        selected.rte ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {selected.rte ? 'YES' : 'NO'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Personal Details */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Personal Details</p>
                  {[
                    { label: 'Admission No.', val: selected.admissionNo },
                    { label: 'Date of Birth',  val: selected.dob },
                    { label: 'Blood Group',    val: selected.bloodGroup },
                    { label: 'Gender',         val: selected.gender },
                    ...(STREAM_CLASSES.has(selected.className) ? [{ label: 'Stream', val: selected.stream || '—' }] : []),
                    { label: 'Religion',       val: selected.religion || '—' },
                    { label: 'Caste',          val: selected.caste || '—' },
                    { label: 'PEN Number',     val: selected.penNumber || '—' },
                    { label: 'Admission Date', val: selected.admissionDate },
                  ].map(({ label, val }) => (
                    <div key={label} className="flex items-center justify-between gap-2 border-b border-slate-50 pb-2 last:border-0 last:pb-0">
                      <span className="text-[10px] font-bold text-slate-400 shrink-0">{label}</span>
                      <span className="text-[11px] font-bold text-slate-800 text-right">{val}</span>
                    </div>
                  ))}
                </div>

                {/* Documents */}
                {selected.docs.length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5 mb-3">
                      <FileText size={10} /> Uploaded Documents
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {selected.docs.map(doc => (
                        <div key={doc.id}
                          className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2">
                          <CheckCircle2 size={14} className="text-indigo-600 shrink-0" />
                          <span className="text-[10px] font-black text-indigo-700 truncate">{doc.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {selected.docs.length === 0 && (
                  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5 mb-3">
                      <FileText size={10} /> Uploaded Documents
                    </p>
                    <div className="flex flex-col items-center py-6 text-slate-400">
                      <FolderOpen size={28} className="mb-2 opacity-40" />
                      <p className="font-bold text-sm">No documents uploaded</p>
                    </div>
                  </div>
                )}
              </>
            )}

            {activeProfileTab === 'ACADEMIC' && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Exam Results</p>
                <div className="space-y-2">
                  {(academicRecord?.exams.length ?? 0) === 0 && (
                    <div className="flex flex-col items-center py-8 text-slate-400">
                      <BarChart2 size={28} className="mb-2 opacity-40" />
                      <p className="font-bold text-sm">No results yet</p>
                    </div>
                  )}
                  {academicRecord?.exams.map(exam => (
                    <div key={exam.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                      <div>
                        <div className="font-bold text-slate-800 text-xs">{exam.examName}</div>
                        <div className="text-[10px] font-bold text-slate-400 mt-0.5">{exam.subject} · {exam.date}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-black text-slate-900 text-sm">{exam.obtainedMarks}/{exam.maxMarks}</div>
                        <div className={`text-[10px] font-black mt-0.5 ${exam.grade.startsWith('A') ? 'text-emerald-600' : 'text-blue-600'}`}>{exam.grade}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeProfileTab === 'FEES' && (
              <>
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Fee Summary</p>
                  <div className="flex gap-3">
                    <div className="flex-1 text-center">
                      <div className="text-lg font-black text-emerald-600">₹{(selected.paidFee / 1000).toFixed(0)}K</div>
                      <div className="text-[9px] font-black text-slate-400 uppercase">Paid</div>
                    </div>
                    <div className="flex-1 text-center">
                      <div className="text-lg font-black text-rose-500">₹{((selected.totalFee - selected.paidFee) / 1000).toFixed(0)}K</div>
                      <div className="text-[9px] font-black text-slate-400 uppercase">Due</div>
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
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span className="font-black text-slate-900 text-sm">₹{fee.amount.toLocaleString('en-IN')}</span>
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
                </div>
              </>
            )}

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
                    <p className="font-bold text-sm">No data</p>
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

  {/* Parent Account Creation Modal */}
  if (showParentModal && createdParent) {
    const tempPassword = authService.getTempPassword(form.parentMobileNumber);
    return (
      <div className="absolute inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-end">
        <div className="w-full bg-white rounded-t-3xl p-6 pb-8 animate-in slide-in-from-bottom-8">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-black text-slate-900">Parent Account Created</h3>
            <button onClick={() => setShowParentModal(false)} className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500">✕</button>
          </div>

          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-6 space-y-3">
            <div className="flex items-start gap-2">
              <CheckCircle2 size={20} className="text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-black text-emerald-900">Account Created</p>
                <p className="text-sm font-bold text-emerald-700 mt-1">
                  A new parent account has been created. Share these credentials with the parent.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Mobile Number</label>
              <div className="flex gap-2">
                <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-900 text-sm">
                  {createdParent.mobileNumber}
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(createdParent.mobileNumber);
                    showToast('Mobile number copied!');
                  }}
                  className="px-4 py-3 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
                >
                  <Copy size={16} className="text-slate-600" />
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Temporary Password</label>
              <div className="flex gap-2">
                <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-black text-slate-900 text-sm">
                  {createdParent.password}
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(createdParent.password);
                    showToast('Password copied!');
                  }}
                  className="px-4 py-3 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
                >
                  <Copy size={16} className="text-slate-600" />
                </button>
              </div>
              <p className="text-[10px] font-bold text-slate-400 mt-2">
                Parent should change password on first login
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowParentModal(false)}
            className="w-full py-3 bg-emerald-600 text-white font-black rounded-xl"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  {/* Admission Form Print Modal */}
  if (showAdmissionForm && selected) {
    return <AdmissionFormPrint student={selected} schoolInfo={schoolInfoService.get()} onClose={() => setShowAdmissionForm(false)} />;
  }

  return null;
};
