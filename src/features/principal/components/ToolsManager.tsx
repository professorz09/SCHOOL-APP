import React, { useState } from 'react';
import {
  ArrowLeft, Sparkles, FileText, IdCard, Award, Ticket,
  FileCheck, Download, Printer, Copy, Zap, ChevronRight,
  BookOpen, Users, Settings as SettingsIcon,
} from 'lucide-react';
import { studentService } from '../../../services/student.service';
import { Student } from '../../../types/principal.types';

type ToolView = 'DASHBOARD' | 'PAPERS' | 'TC' | 'IDCARD' | 'MARKSHEET' | 'ADMIT' | 'BONAFIDE';

interface Props {
  onBack: () => void;
}

export const ToolsManager: React.FC<Props> = ({ onBack }) => {
  const [view, setView] = useState<ToolView>('DASHBOARD');
  const [students, setStudents] = React.useState<Student[]>([]);

  React.useEffect(() => {
    studentService.getAll().then(setStudents);
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════════
  // QUESTION PAPER GENERATOR (AI)
  // ═══════════════════════════════════════════════════════════════════════════════

  const QuestionPaperGenerator = () => {
    const [config, setConfig] = useState({
      class: '10', section: 'A', subject: 'Mathematics',
      totalMarks: 100, numQuestions: 30, difficulty: 'MIXED',
    });
    const [generated, setGenerated] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);

    const handleGenerate = async () => {
      setIsGenerating(true);
      setTimeout(() => {
        setGenerated(true);
        setIsGenerating(false);
      }, 2000);
    };

    if (generated) {
      return (
        <div className="w-full flex flex-col">
          <div className="sticky top-0 bg-white px-4 pt-4 pb-4 flex items-center gap-3 border-b border-slate-100 z-10">
            <button onClick={() => setGenerated(false)} className="p-2 -ml-2 bg-slate-100 rounded-full">
              <ArrowLeft size={20} className="text-slate-600" />
            </button>
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Question Paper</h2>
          </div>
          <div className="p-5 space-y-4">
            {/* Paper Preview */}
            <div className="bg-white border-2 border-slate-200 rounded-2xl p-6 shadow-sm">
              <div className="text-center mb-6 pb-4 border-b-2 border-slate-200">
                <h3 className="text-lg font-black text-slate-900">MATHEMATICS</h3>
                <p className="text-sm font-bold text-slate-500 mt-1">Class 10-A | Time: 3 Hours | Total Marks: 100</p>
              </div>

              <div className="space-y-6">
                {/* Section A */}
                <div>
                  <h4 className="font-black text-sm text-slate-900 mb-3">SECTION A: Multiple Choice (1 Mark each)</h4>
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="text-sm font-bold text-slate-700">
                        {i}. What is the square root of 144?
                        <div className="ml-4 text-xs text-slate-500 mt-1">
                          <div>a) 10  b) 12  c) 14  d) 16</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Section B */}
                <div>
                  <h4 className="font-black text-sm text-slate-900 mb-3">SECTION B: Short Answer (3 Marks each)</h4>
                  <div className="space-y-2">
                    {[1, 2].map(i => (
                      <div key={i} className="text-sm font-bold text-slate-700">
                        {i}. Solve the quadratic equation: x² + 5x + 6 = 0
                      </div>
                    ))}
                  </div>
                </div>

                {/* Section C */}
                <div>
                  <h4 className="font-black text-sm text-slate-900 mb-3">SECTION C: Long Answer (5 Marks each)</h4>
                  <div className="text-sm font-bold text-slate-700">
                    1. Prove that the sum of angles in a triangle is 180°
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-2 gap-3">
              <button className="flex items-center justify-center gap-2 bg-blue-600 text-white font-black text-sm uppercase py-3 rounded-2xl active:scale-95 transition-transform">
                <Printer size={16} /> Print
              </button>
              <button className="flex items-center justify-center gap-2 bg-slate-100 text-slate-700 font-black text-sm uppercase py-3 rounded-2xl active:scale-95 transition-transform">
                <Download size={16} /> Download
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="w-full flex flex-col">
        <div className="sticky top-0 bg-white px-4 pt-4 pb-4 flex items-center gap-3 border-b border-slate-100 z-10">
          <button onClick={() => setView('DASHBOARD')} className="p-2 -ml-2 bg-slate-100 rounded-full">
            <ArrowLeft size={20} className="text-slate-600" />
          </button>
          <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">AI Question Paper Generator</h2>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-start gap-3">
            <Sparkles size={20} className="text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-black text-blue-900 text-sm">AI Powered</p>
              <p className="text-xs font-bold text-blue-700 mt-1">Generate question papers automatically with AI</p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-black uppercase tracking-widest text-slate-400">Class</label>
              <select value={config.class} onChange={e => setConfig({...config, class: e.target.value})}
                className="w-full mt-1.5 border border-slate-200 bg-white rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-blue-500">
                {['8', '9', '10', '11', '12'].map(c => <option key={c} value={c}>Class {c}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs font-black uppercase tracking-widest text-slate-400">Subject</label>
              <select value={config.subject} onChange={e => setConfig({...config, subject: e.target.value})}
                className="w-full mt-1.5 border border-slate-200 bg-white rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-blue-500">
                {['Mathematics', 'Science', 'English', 'History', 'Geography'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-black uppercase tracking-widest text-slate-400">Total Marks</label>
                <input type="number" value={config.totalMarks} onChange={e => setConfig({...config, totalMarks: parseInt(e.target.value)})}
                  className="w-full mt-1.5 border border-slate-200 bg-white rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="text-xs font-black uppercase tracking-widest text-slate-400">No. of Questions</label>
                <input type="number" value={config.numQuestions} onChange={e => setConfig({...config, numQuestions: parseInt(e.target.value)})}
                  className="w-full mt-1.5 border border-slate-200 bg-white rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-blue-500" />
              </div>
            </div>

            <div>
              <label className="text-xs font-black uppercase tracking-widest text-slate-400">Difficulty Level</label>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {['EASY', 'MIXED', 'HARD'].map(d => (
                  <button key={d} onClick={() => setConfig({...config, difficulty: d})}
                    className={`py-2.5 rounded-xl font-black text-xs uppercase tracking-wide transition-all ${
                      config.difficulty === d
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-600 border border-slate-200'
                    }`}>
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button onClick={handleGenerate} disabled={isGenerating}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white font-black text-sm uppercase py-4 rounded-2xl active:scale-95 transition-transform disabled:opacity-60">
            {isGenerating ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles size={16} /> Generate Paper
              </>
            )}
          </button>
        </div>
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════════
  // TC GENERATOR
  // ═══════════════════════════════════════════════════════════════════════════════

  const TCGenerator = () => {
    const [selectedStudent, setSelectedStudent] = useState<string>('');
    const [preview, setPreview] = useState(false);
    const student = students.find(s => s.id === selectedStudent);

    if (preview && student) {
      return (
        <div className="w-full flex flex-col">
          <div className="sticky top-0 bg-white px-4 pt-4 pb-4 flex items-center gap-3 border-b border-slate-100 z-10">
            <button onClick={() => setPreview(false)} className="p-2 -ml-2 bg-slate-100 rounded-full">
              <ArrowLeft size={20} className="text-slate-600" />
            </button>
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Transfer Certificate</h2>
          </div>
          <div className="p-5">
            <div className="bg-white border-2 border-slate-300 rounded-2xl p-8 shadow-sm">
              <div className="text-center border-b-2 border-slate-300 pb-6 mb-6">
                <h3 className="text-xl font-black text-slate-900">TRANSFER CERTIFICATE</h3>
                <p className="text-xs font-bold text-slate-500 mt-2">TC No: {student.tcNumber || 'TC-2024-001'}</p>
              </div>

              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-black text-slate-400 uppercase">Name</p>
                    <p className="font-bold text-slate-900 mt-1">{student.name}</p>
                  </div>
                  <div>
                    <p className="text-xs font-black text-slate-400 uppercase">Admission No.</p>
                    <p className="font-bold text-slate-900 mt-1">{student.admissionNo}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-black text-slate-400 uppercase">Class</p>
                    <p className="font-bold text-slate-900 mt-1">{student.className}-{student.section}</p>
                  </div>
                  <div>
                    <p className="text-xs font-black text-slate-400 uppercase">DOB</p>
                    <p className="font-bold text-slate-900 mt-1">{student.dob}</p>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-black text-slate-400 uppercase">Character</p>
                  <p className="font-bold text-slate-900 mt-1">Good</p>
                </div>

                <div className="pt-6 border-t-2 border-slate-300 flex items-end justify-between">
                  <div>
                    <p className="text-xs font-bold text-slate-500">Principal</p>
                    <div className="h-12 w-20 border-t border-slate-400 mt-2" />
                  </div>
                  <p className="text-xs font-bold text-slate-500">Date: {new Date().toLocaleDateString()}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-4">
              <button className="flex items-center justify-center gap-2 bg-blue-600 text-white font-black text-sm uppercase py-3 rounded-2xl">
                <Printer size={16} /> Print
              </button>
              <button className="flex items-center justify-center gap-2 bg-slate-100 text-slate-700 font-black text-sm uppercase py-3 rounded-2xl">
                <Download size={16} /> Download
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="w-full flex flex-col">
        <div className="sticky top-0 bg-white px-4 pt-4 pb-4 flex items-center gap-3 border-b border-slate-100 z-10">
          <button onClick={() => setView('DASHBOARD')} className="p-2 -ml-2 bg-slate-100 rounded-full">
            <ArrowLeft size={20} className="text-slate-600" />
          </button>
          <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Transfer Certificate</h2>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-black uppercase tracking-widest text-slate-400">Select Student</label>
            <select value={selectedStudent} onChange={e => setSelectedStudent(e.target.value)}
              className="w-full mt-2 border border-slate-200 bg-white rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-blue-500">
              <option value="">Choose a student...</option>
              {students.map(s => <option key={s.id} value={s.id}>{s.name} ({s.className}-{s.section})</option>)}
            </select>
          </div>

          {selectedStudent && (
            <button onClick={() => setPreview(true)}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white font-black text-sm uppercase py-3 rounded-2xl active:scale-95 transition-transform">
              <Eye size={16} /> Preview TC
            </button>
          )}
        </div>
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════════
  // MAIN DASHBOARD
  // ═══════════════════════════════════════════════════════════════════════════════

  if (view !== 'DASHBOARD') {
    return (
      <>
        {view === 'PAPERS' && <QuestionPaperGenerator />}
        {view === 'TC' && <TCGenerator />}
      </>
    );
  }

  const TOOLS = [
    {
      icon: <Sparkles size={24} />,
      label: 'AI Papers',
      desc: 'Generate question papers with AI',
      view: 'PAPERS' as ToolView,
      color: 'bg-gradient-to-br from-purple-50 to-pink-50 border-purple-200 text-purple-600'
    },
    {
      icon: <FileCheck size={24} />,
      label: 'Transfer Cert',
      desc: 'Generate TC for students',
      view: 'TC' as ToolView,
      color: 'bg-gradient-to-br from-blue-50 to-cyan-50 border-blue-200 text-blue-600'
    },
    {
      icon: <IdCard size={24} />,
      label: 'ID Cards',
      desc: 'Print ID cards in bulk',
      view: 'IDCARD' as ToolView,
      color: 'bg-gradient-to-br from-green-50 to-emerald-50 border-green-200 text-green-600'
    },
    {
      icon: <Award size={24} />,
      label: 'Marksheets',
      desc: 'Generate marksheets',
      view: 'MARKSHEET' as ToolView,
      color: 'bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200 text-amber-600'
    },
    {
      icon: <Ticket size={24} />,
      label: 'Admit Cards',
      desc: 'Generate admit cards',
      view: 'ADMIT' as ToolView,
      color: 'bg-gradient-to-br from-rose-50 to-pink-50 border-rose-200 text-rose-600'
    },
    {
      icon: <FileText size={24} />,
      label: 'Bonafide',
      desc: 'Issue bonafide certificates',
      view: 'BONAFIDE' as ToolView,
      color: 'bg-gradient-to-br from-indigo-50 to-blue-50 border-indigo-200 text-indigo-600'
    },
  ];

  return (
    <div className="w-full flex flex-col">
      <div className="sticky top-0 bg-white px-4 pt-4 pb-4 flex items-center gap-3 border-b border-slate-100 z-10">
        <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full">
          <ArrowLeft size={20} className="text-slate-600" />
        </button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Tools & Generators</h2>
      </div>

      <div className="p-5 space-y-4">
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl p-4 text-white">
          <div className="flex items-start gap-3">
            <Zap size={24} className="shrink-0 mt-0.5" />
            <div>
              <h3 className="font-black text-sm">Quick Tools</h3>
              <p className="text-xs font-bold text-white/80 mt-1">Generate documents, papers & certificates instantly</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {TOOLS.map(tool => (
            <button key={tool.label} onClick={() => setView(tool.view)}
              className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 active:scale-95 transition-transform ${tool.color}`}>
              {tool.icon}
              <span className="text-[10px] font-black uppercase text-center leading-tight">{tool.label}</span>
              <span className="text-[8px] font-bold text-center opacity-75">{tool.desc}</span>
            </button>
          ))}
        </div>

        {/* Coming Soon */}
        <div className="bg-slate-100 rounded-2xl p-4 text-center">
          <p className="text-xs font-black text-slate-500 uppercase tracking-wide">More Tools Coming Soon</p>
          <p className="text-[10px] font-bold text-slate-400 mt-1">Certificates, hall passes, attendance reports & more</p>
        </div>
      </div>
    </div>
  );
};

// Helper component placeholder
const Eye = ({ size }: { size: number }) => <FileText size={size} />;
