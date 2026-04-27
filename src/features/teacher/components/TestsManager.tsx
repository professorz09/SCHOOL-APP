import React, { useEffect, useState } from 'react';
import { ArrowLeft, Plus, ClipboardList, Calendar, Clock, Upload, CheckCircle, ChevronRight } from 'lucide-react';
import { teacherService } from '../../../services/teacher.service';
import { TestSchedule, TestType, TeacherClass } from '../../../types/teacher.types';
import { useUIStore } from '../../../store/uiStore';

type View = 'LIST' | 'CREATE' | 'UPLOAD';

const TEST_TYPES: TestType[] = ['UNIT_TEST', 'MID_TERM', 'FINAL', 'QUIZ', 'PRACTICAL'];

const typeColor = (t: TestType) => {
  const map: Record<TestType, string> = {
    UNIT_TEST:  'bg-blue-50 text-blue-700',
    MID_TERM:   'bg-violet-50 text-violet-700',
    FINAL:      'bg-rose-50 text-rose-700',
    QUIZ:       'bg-emerald-50 text-emerald-700',
    PRACTICAL:  'bg-amber-50 text-amber-700',
  };
  return map[t];
};

const typeBadge = (t: TestType) => {
  const labels: Record<TestType, string> = {
    UNIT_TEST: 'Unit Test', MID_TERM: 'Mid Term', FINAL: 'Final Exam',
    QUIZ: 'Quiz', PRACTICAL: 'Practical',
  };
  return labels[t] ?? t;
};

interface StudentRow {
  studentId: string;
  name: string;
  rollNo: string;
  marks: string;
  note: string;
}

interface Props { onBack: () => void; }

export const TestsManager: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();
  const [view, setView]         = useState<View>('LIST');
  const [tests, setTests]       = useState<TestSchedule[]>([]);
  const [classes, setClasses]   = useState<TeacherClass[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Create form
  const [form, setForm] = useState({
    classId: 'tc1', className: 'Class 10', section: 'A', subject: 'Mathematics',
    testType: 'UNIT_TEST' as TestType, title: '', scheduledDate: '', duration: 60, maxMarks: 25, syllabus: '',
  });

  // Upload state
  const [uploadTest, setUploadTest]         = useState<TestSchedule | null>(null);
  const [uploadDescription, setUploadDescription] = useState('');
  const [studentRows, setStudentRows]       = useState<StudentRow[]>([]);

  useEffect(() => {
    teacherService.getTests().then(setTests);
    teacherService.getClasses().then(setClasses);
  }, []);

  const handleCreate = async () => {
    if (!form.title || !form.scheduledDate) { showToast('Title and date required', 'error'); return; }
    setIsSubmitting(true);
    try {
      const test = await teacherService.createTest(form);
      setTests(prev => [test, ...prev]);
      showToast(`${typeBadge(form.testType)} scheduled`);
      setForm({ classId: 'tc1', className: 'Class 10', section: 'A', subject: 'Mathematics', testType: 'UNIT_TEST', title: '', scheduledDate: '', duration: 60, maxMarks: 25, syllabus: '' });
      setView('LIST');
    } finally { setIsSubmitting(false); }
  };

  const openUpload = (test: TestSchedule) => {
    const cls = classes.find(c => c.id === test.classId);
    const students = cls?.students ?? [];
    setUploadTest(test);
    setUploadDescription('');
    setStudentRows(students.map(s => ({ studentId: s.id, name: s.name, rollNo: s.rollNo, marks: '', note: '' })));
    setView('UPLOAD');
  };

  const handlePublish = async () => {
    if (!uploadTest) return;
    const invalid = studentRows.filter(r => r.marks === '' || isNaN(+r.marks) || +r.marks < 0 || +r.marks > uploadTest.maxMarks);
    if (invalid.length > 0) {
      showToast(`Fill valid marks (0–${uploadTest.maxMarks}) for all students`, 'error'); return;
    }
    setIsSubmitting(true);
    try {
      const cls = classes.find(c => c.id === uploadTest.classId);
      await teacherService.publishResults({
        testId:      uploadTest.id,
        examName:    uploadTest.title,
        description: uploadDescription,
        testType:    uploadTest.testType,
        subject:     uploadTest.subject,
        teacherName: 'Aarti Desai',
        date:        uploadTest.scheduledDate,
        maxMarks:    uploadTest.maxMarks,
        studentResults: studentRows.map(r => ({
          studentId:     r.studentId,
          obtainedMarks: +r.marks,
          note:          r.note,
        })),
        allStudents: cls?.students.map(s => ({ id: s.id, name: s.name, rollNo: s.rollNo })) ?? [],
      });
      setTests(prev => prev.map(t => t.id === uploadTest.id ? { ...t, resultsUploaded: true } : t));
      showToast('Results published! Students can now view their results.');
      setView('LIST');
    } finally { setIsSubmitting(false); }
  };

  const updateRow = (idx: number, field: 'marks' | 'note', val: string) => {
    setStudentRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r));
  };

  const renderHeader = (title: string, back: () => void, action?: React.ReactNode) => (
    <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
      <div className="flex items-center gap-3">
        <button onClick={back} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600"><ArrowLeft size={20} /></button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">{title}</h2>
      </div>
      {action}
    </div>
  );

  /* ── UPLOAD RESULTS VIEW ─────────────────────────────────────────── */
  if (view === 'UPLOAD' && uploadTest) return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader('Upload Results', () => setView('LIST'))}
      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-4">

        {/* Exam info card */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${typeColor(uploadTest.testType)}`}>
              {typeBadge(uploadTest.testType)}
            </span>
            <span className="text-[10px] font-bold text-slate-400">{uploadTest.className}-{uploadTest.section} · {uploadTest.subject}</span>
          </div>
          <div className="font-black text-slate-900 text-base">{uploadTest.title}</div>
          <div className="flex gap-4 text-[10px] font-bold text-slate-500">
            <span>📅 {uploadTest.scheduledDate}</span>
            <span>⏱ {uploadTest.duration} min</span>
            <span>📊 Max {uploadTest.maxMarks} marks</span>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">
              Exam Description <span className="text-slate-300 normal-case font-bold">(optional — students will see this)</span>
            </label>
            <textarea
              value={uploadDescription}
              onChange={e => setUploadDescription(e.target.value)}
              rows={2}
              placeholder="e.g. Covered chapters 3-5, algebra and trigonometry basics…"
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-medium text-sm outline-none focus:border-indigo-400 resize-none"
            />
          </div>
        </div>

        {/* Student marks entry */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-50 flex items-center justify-between">
            <span className="font-black text-slate-800 text-sm">Student Marks</span>
            <span className="text-[10px] font-bold text-slate-400">{studentRows.length} students</span>
          </div>
          <div className="divide-y divide-slate-50">
            {studentRows.map((row, idx) => {
              const marks = row.marks === '' ? null : +row.marks;
              const pct = marks !== null && uploadTest.maxMarks > 0 ? Math.round((marks / uploadTest.maxMarks) * 100) : null;
              return (
                <div key={row.studentId} className="px-4 py-3">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-7 h-7 bg-slate-100 rounded-full flex items-center justify-center shrink-0">
                      <span className="text-[10px] font-black text-slate-500">{row.rollNo}</span>
                    </div>
                    <div className="flex-1 font-bold text-slate-800 text-sm">{row.name}</div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <input
                        type="number"
                        min={0}
                        max={uploadTest.maxMarks}
                        value={row.marks}
                        onChange={e => updateRow(idx, 'marks', e.target.value)}
                        placeholder="—"
                        className="w-16 border border-slate-200 bg-slate-50 rounded-xl px-2 py-1.5 text-center font-black text-sm outline-none focus:border-indigo-400"
                      />
                      <span className="text-[10px] font-bold text-slate-400">/{uploadTest.maxMarks}</span>
                      {pct !== null && (
                        <span className={`text-[10px] font-black w-9 text-right ${pct >= 75 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-rose-500'}`}>
                          {pct}%
                        </span>
                      )}
                    </div>
                  </div>
                  <input
                    type="text"
                    value={row.note}
                    onChange={e => updateRow(idx, 'note', e.target.value)}
                    placeholder="Note for student (optional)…"
                    className="w-full border border-slate-100 bg-slate-50 rounded-xl px-3 py-2 text-[11px] font-medium text-slate-600 outline-none focus:border-indigo-300 placeholder:text-slate-300"
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Publish button */}
        <button
          onClick={handlePublish}
          disabled={isSubmitting || studentRows.some(r => r.marks === '')}
          className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg disabled:opacity-50">
          {isSubmitting
            ? 'Publishing…'
            : <><CheckCircle size={16} /> Publish Results — Students Will See Now</>}
        </button>
        {studentRows.some(r => r.marks === '') && (
          <p className="text-center text-[10px] font-bold text-slate-400">Fill marks for all students to publish</p>
        )}
      </div>
    </div>
  );

  /* ── CREATE VIEW ─────────────────────────────────────────────────── */
  if (view === 'CREATE') return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader('Schedule Test', () => setView('LIST'))}
      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Class</label>
            <select value={form.classId}
              onChange={e => {
                const cls = classes.find(c => c.id === e.target.value);
                if (cls) setForm(f => ({ ...f, classId: cls.id, className: cls.className, section: cls.section, subject: cls.subject }));
              }}
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none">
              {classes.map(c => <option key={c.id} value={c.id}>{c.className}-{c.section} · {c.subject}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Test Type</label>
            <div className="flex flex-wrap gap-2">
              {TEST_TYPES.map(t => (
                <button key={t} onClick={() => setForm(f => ({ ...f, testType: t }))}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors ${form.testType === t ? typeColor(t) + ' ring-1 ring-current' : 'bg-slate-50 border border-slate-200 text-slate-400'}`}>
                  {typeBadge(t)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Exam Title *</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Unit Test 1 — Algebra"
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Syllabus / Topics</label>
            <textarea value={form.syllabus} onChange={e => setForm(f => ({ ...f, syllabus: e.target.value }))} rows={3}
              placeholder="Chapter numbers, topics covered…"
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500 resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Date *</label>
              <input type="date" value={form.scheduledDate} onChange={e => setForm(f => ({ ...f, scheduledDate: e.target.value }))}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Duration (min)</label>
              <input type="number" value={form.duration} onChange={e => setForm(f => ({ ...f, duration: +e.target.value }))}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500" />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Max Marks</label>
            <input type="number" value={form.maxMarks} onChange={e => setForm(f => ({ ...f, maxMarks: +e.target.value }))}
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500" />
          </div>
        </div>
        <button onClick={handleCreate} disabled={isSubmitting}
          className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg disabled:opacity-60">
          {isSubmitting ? 'Scheduling…' : <><Plus size={16} /> Schedule Exam</>}
        </button>
      </div>
    </div>
  );

  /* ── LIST VIEW ───────────────────────────────────────────────────── */
  return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader('Tests & Exams', onBack,
        <button onClick={() => setView('CREATE')} className="p-2 bg-indigo-500 text-white rounded-full shadow-md"><Plus size={18} /></button>
      )}
      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Scheduled',       val: tests.length,                                               c: 'text-slate-900' },
            { label: 'Upcoming',        val: tests.filter(t => new Date(t.scheduledDate) >= new Date()).length, c: 'text-blue-600' },
            { label: 'Results Pending', val: tests.filter(t => !t.resultsUploaded).length,              c: 'text-amber-600' },
          ].map(({ label, val, c }) => (
            <div key={label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 text-center">
              <div className={`text-xl font-black ${c}`}>{val}</div>
              <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-0.5">{label}</div>
            </div>
          ))}
        </div>

        {tests.map(test => (
          <div key={test.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${typeColor(test.testType)}`}>
                {typeBadge(test.testType)}
              </span>
              <span className="text-[10px] font-bold text-slate-400">{test.className}-{test.section}</span>
            </div>
            <div className="font-extrabold text-slate-900 text-sm">{test.title}</div>
            <div className="text-[11px] font-bold text-slate-400 mt-1 line-clamp-1">{test.syllabus}</div>
            <div className="flex gap-4 mt-3 pt-3 border-t border-slate-50">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600">
                <Calendar size={11} className="text-slate-400" /> {test.scheduledDate}
              </div>
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600">
                <Clock size={11} className="text-slate-400" /> {test.duration}m
              </div>
              <div className="ml-auto text-[10px] font-black text-slate-700">{test.maxMarks} marks</div>
            </div>

            {test.resultsUploaded ? (
              <div className="mt-2 flex items-center gap-1.5 text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg w-fit">
                <CheckCircle size={10} /> Results Published
              </div>
            ) : (
              <button
                onClick={() => openUpload(test)}
                className="mt-2 w-full flex items-center justify-between gap-2 bg-indigo-50 border border-indigo-100 text-indigo-700 font-black text-[11px] uppercase tracking-widest px-3 py-2 rounded-xl active:scale-95 transition-transform">
                <div className="flex items-center gap-1.5">
                  <Upload size={12} /> Upload Results
                </div>
                <ChevronRight size={14} className="text-indigo-400" />
              </button>
            )}
          </div>
        ))}

        {tests.length === 0 && (
          <div className="flex flex-col items-center py-16 text-slate-400">
            <ClipboardList size={32} className="mb-3 opacity-40" />
            <p className="font-bold text-sm">No tests scheduled</p>
          </div>
        )}
      </div>
    </div>
  );
};
