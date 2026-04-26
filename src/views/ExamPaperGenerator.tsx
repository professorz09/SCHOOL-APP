import React, { useState } from 'react';
import { ArrowLeft, ScrollText, CheckCircle2, Download, Printer, Settings, Plus, Camera, Sparkles, X, ListOrdered } from 'lucide-react';
import { AppCard, SectionTitle } from '../components/SharedUI';

interface ExamPaperGeneratorProps {
  onClose: () => void;
}

export const ExamPaperGenerator: React.FC<ExamPaperGeneratorProps> = ({ onClose }) => {
  const [view, setView] = useState<'GENERATE' | 'SETTINGS' | 'QUESTIONS'>('GENERATE');
  
  const [selectedClass, setSelectedClass] = useState('10-A');
  const [selectedSubject, setSelectedSubject] = useState('Mathematics');
  const [examType, setExamType] = useState('Mid-Term');
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedFinished, setGeneratedFinished] = useState(false);
  
  const [questions, setQuestions] = useState([
    { id: 1, type: 'MCQ', text: 'What is the capital of India?', options: ['Delhi', 'Mumbai', 'Chennai', 'Kolkata'], marks: 1 },
    { id: 2, type: 'SUBJECTIVE', text: 'Explain the process of photosynthesis.', marks: 5 }
  ]);
  const [isAiScanning, setIsAiScanning] = useState(false);

  const handleGenerate = () => {
    if (questions.length === 0) {
      alert("Please add some questions first.");
      return;
    }
    setIsGenerating(true);
    setGeneratedFinished(false);
    setTimeout(() => {
      setIsGenerating(false);
      setGeneratedFinished(true);
    }, 2000);
  };

  const handleAiScan = () => {
    setIsAiScanning(true);
    setTimeout(() => {
      setIsAiScanning(false);
      setQuestions([...questions, 
        { id: Date.now(), type: 'MCQ', text: 'Extracted: Which planet is known as the Red Planet?', options: ['Earth', 'Mars', 'Jupiter', 'Venus'], marks: 1 },
        { id: Date.now()+1, type: 'SUBJECTIVE', text: 'Extracted: Describe Newton\'s Three Laws of Motion.', marks: 3 }
      ]);
    }, 2500);
  };

  const addManualQuestion = () => {
    setQuestions([...questions, { id: Date.now(), type: 'SUBJECTIVE', text: 'New Question...', marks: 2 }]);
  };

  const removeQuestion = (id: number) => {
    setQuestions(questions.filter(q => q.id !== id));
  };

  return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-bottom-8">
       {/* Header */}
       <div className="bg-white border-b border-slate-200 px-4 pt-12 pb-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
         <div className="flex items-center gap-3">
           <button onClick={onClose} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600 hover:bg-slate-200 transition-colors">
             <ArrowLeft size={20} />
           </button>
           <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Exam Gen</h2>
         </div>
         <div className="flex bg-slate-100 p-1 rounded-full overflow-x-auto no-scrollbar">
           <button 
              onClick={() => setView('GENERATE')} 
              className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors ${view === 'GENERATE' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}
           >
              Create
           </button>
           <button 
              onClick={() => setView('QUESTIONS')} 
              className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors flex items-center gap-1 ${view === 'QUESTIONS' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}
           >
              Questions <span className="bg-slate-200 text-slate-600 px-1.5 rounded-full">{questions.length}</span>
           </button>
           <button 
              onClick={() => setView('SETTINGS')} 
              className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors ${view === 'SETTINGS' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}
           >
              Config
           </button>
         </div>
       </div>

       <div className="flex-1 overflow-y-auto p-5 pb-24">
          {view === 'SETTINGS' && (
            <div className="space-y-6">
               <SectionTitle title="Template Config" />
               <AppCard className="space-y-4 border-none shadow-md">
                 <div>
                   <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">School Header</label>
                   <input 
                      defaultValue="Delhi Public School" 
                      className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-extrabold text-sm text-slate-900 outline-none focus:border-indigo-500 focus:bg-white transition-colors" 
                   />
                 </div>
                 <div>
                   <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Paper Format</label>
                   <select 
                      className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-extrabold text-sm text-slate-900 outline-none focus:border-indigo-500 focus:bg-white transition-colors appearance-none" 
                   >
                     <option>CBSE Standard Format</option>
                     <option>ICSE Format</option>
                     <option>Custom Objective Layout</option>
                   </select>
                 </div>
                 <div>
                   <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Standard Instructions</label>
                   <textarea 
                      defaultValue={`1. All questions are compulsory.
2. The question paper consists of 30 questions divided into four sections A, B, C and D.
3. Use of calculator is not permitted.`}
                      className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm text-slate-700 outline-none focus:border-indigo-500 focus:bg-white transition-colors min-h-[100px]" 
                   />
                 </div>
                 <button className="w-full bg-slate-900 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg">
                    Save Template
                 </button>
               </AppCard>
            </div>
          )}

          {view === 'QUESTIONS' && (
            <div className="space-y-6">
               <div className="flex items-center justify-between">
                 <SectionTitle title="Question Bank" />
               </div>
               
               <div className="flex gap-3">
                 <button 
                   onClick={handleAiScan}
                   disabled={isAiScanning}
                   className="flex-1 bg-gradient-to-r from-indigo-500 to-purple-600 text-white p-4 rounded-2xl shadow-md flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-70"
                 >
                   {isAiScanning ? (
                     <div className="flex items-center gap-2">
                       <Sparkles size={18} className="animate-pulse" /> <span className="font-black text-xs uppercase tracking-widest">Scanning...</span>
                     </div>
                   ) : (
                     <div className="flex flex-col items-center gap-1">
                       <Camera size={24} />
                       <span className="font-black text-[10px] uppercase tracking-widest">AI Scan Notes</span>
                     </div>
                   )}
                 </button>
                 <button 
                   onClick={addManualQuestion}
                   className="flex-1 bg-white border-2 border-dashed border-slate-300 text-slate-600 p-4 rounded-2xl flex items-center justify-center flex-col gap-1 active:scale-95 transition-transform hover:border-indigo-300 hover:text-indigo-600"
                 >
                   <Plus size={24} />
                   <span className="font-black text-[10px] uppercase tracking-widest">Manual Entry</span>
                 </button>
               </div>

               <div className="space-y-3">
                 {questions.map((q, i) => (
                   <AppCard key={q.id} noPadding className="border border-slate-100 shadow-sm relative group overflow-hidden">
                     <div className="p-4 flex gap-3">
                       <div className="mt-1 font-black text-slate-300">Q{i+1}.</div>
                       <div className="flex-1">
                         <div className="flex justify-between items-start mb-2">
                           <span className="text-[10px] font-black uppercase tracking-widest bg-slate-100 text-slate-500 px-2 py-0.5 rounded">{q.type}</span>
                           <span className="text-[10px] font-black uppercase tracking-widest text-indigo-500">{q.marks} Marks</span>
                         </div>
                         <textarea 
                           defaultValue={q.text} 
                           className="w-full font-bold text-sm text-slate-900 outline-none resize-none bg-transparent" 
                           rows={2}
                         />
                         {q.options && (
                           <div className="mt-2 space-y-1">
                             {q.options.map((opt, idx) => (
                               <div key={idx} className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                                 <span className="w-4 h-4 rounded-full border border-slate-300 flex items-center justify-center text-[8px] uppercase">{String.fromCharCode(97+idx)}</span>
                                 <input defaultValue={opt} className="outline-none bg-transparent flex-1" />
                               </div>
                             ))}
                           </div>
                         )}
                       </div>
                       <button onClick={() => removeQuestion(q.id)} className="text-slate-300 hover:text-rose-500 p-1 transition-colors self-start">
                         <X size={16} />
                       </button>
                     </div>
                   </AppCard>
                 ))}
                 {questions.length === 0 && (
                   <div className="text-center p-8 border-2 border-dashed border-slate-200 rounded-[32px] text-slate-400">
                      <ListOrdered size={32} className="mx-auto mb-2 opacity-50" />
                      <p className="font-bold text-sm">No questions added yet.</p>
                      <p className="text-xs mt-1">Scan handwritten notes or add manually.</p>
                   </div>
                 )}
               </div>
            </div>
          )}

          {view === 'GENERATE' && (
            <div className="space-y-6">
               <SectionTitle title="Generate Paper" />
               <AppCard className="border-none shadow-md">
                 <p className="text-xs font-bold text-slate-500 mb-6 leading-relaxed">
                    Select parameters to generate a formatted question paper PDF based on your <span className="text-indigo-600">{questions.length} questions</span>.
                 </p>
                 
                 <div className="space-y-4 mb-8">
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Select Class</label>
                      <select 
                         value={selectedClass}
                         onChange={(e) => setSelectedClass(e.target.value)}
                         className="w-full border border-slate-200 bg-white rounded-xl px-4 py-3 font-extrabold text-sm text-slate-900 outline-none focus:border-indigo-500 transition-colors" 
                      >
                        <option>10-A</option>
                        <option>10-B</option>
                        <option>9-A</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Select Subject</label>
                      <select 
                         value={selectedSubject}
                         onChange={(e) => setSelectedSubject(e.target.value)}
                         className="w-full border border-slate-200 bg-white rounded-xl px-4 py-3 font-extrabold text-sm text-slate-900 outline-none focus:border-indigo-500 transition-colors" 
                      >
                        <option>Mathematics</option>
                        <option>Physics</option>
                        <option>Chemistry</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Exam Type</label>
                      <select 
                         value={examType}
                         onChange={(e) => setExamType(e.target.value)}
                         className="w-full border border-slate-200 bg-white rounded-xl px-4 py-3 font-extrabold text-sm text-slate-900 outline-none focus:border-indigo-500 transition-colors" 
                      >
                        <option>Mid-Term</option>
                        <option>Unit Test 1</option>
                        <option>Final Examination</option>
                      </select>
                    </div>
                 </div>

                 {!generatedFinished && !isGenerating && (
                   <button 
                      onClick={handleGenerate} 
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm uppercase tracking-widest py-4 rounded-2xl transition-transform active:scale-95 shadow-lg flex items-center justify-center gap-3"
                   >
                     <ScrollText size={20} /> Generate Paper
                   </button>
                 )}

                 {isGenerating && (
                   <div className="w-full bg-indigo-50 border border-indigo-100 rounded-2xl p-8 flex flex-col items-center justify-center space-y-5 animate-in fade-in">
                     <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                     <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Formatting Document...</p>
                   </div>
                 )}

                 {generatedFinished && (
                   <div className="w-full bg-emerald-50 border border-emerald-100 rounded-2xl p-8 flex flex-col items-center justify-center space-y-6 animate-in zoom-in-95">
                     <div className="w-16 h-16 bg-white text-emerald-600 rounded-full flex items-center justify-center shadow-lg">
                       <CheckCircle2 size={36} />
                     </div>
                     <div className="text-center">
                        <p className="text-sm font-black text-emerald-900 uppercase tracking-tight mb-1">Success</p>
                        <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Format: CBSE • 4 Pages</p>
                     </div>
                     <div className="flex gap-2 w-full">
                       <button 
                         onClick={() => {
                           setGeneratedFinished(false);
                           setIsGenerating(false);
                         }} 
                         className="flex-1 bg-emerald-600 text-white font-black text-xs uppercase tracking-widest py-3 rounded-2xl shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-transform"
                       >
                         <Download size={16} /> PDF
                       </button>
                       <button 
                         onClick={() => {
                           setGeneratedFinished(false);
                           setIsGenerating(false);
                         }} 
                         className="flex-1 bg-white border border-emerald-200 text-emerald-600 font-black text-xs uppercase tracking-widest py-3 rounded-2xl shadow-sm flex items-center justify-center gap-2 active:scale-95 transition-transform"
                       >
                         <Printer size={16} /> Print
                       </button>
                     </div>
                   </div>
                 )}
               </AppCard>
            </div>
          )}
       </div>
    </div>
  );
}

