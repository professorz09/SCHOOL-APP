import React, { useState } from 'react';
import { ArrowLeft, Printer, Download, FileText, CheckCircle2 } from 'lucide-react';
import { AppCard, SectionTitle } from '../components/SharedUI';

interface AdmitCardManagerProps {
  onClose: () => void;
}

export const AdmitCardManager: React.FC<AdmitCardManagerProps> = ({ onClose }) => {
  const [view, setView] = useState<'GENERATE' | 'SETTINGS'>('GENERATE');
  const [schoolName, setSchoolName] = useState('Delhi Public School');
  const [examName, setExamName] = useState('Mid-Term Examination 2024');
  const [instructions, setInstructions] = useState('1. Bring this card daily.\n2. No digital devices allowed.\n3. Report 30 mins before start.');
  
  const [selectedClass, setSelectedClass] = useState('10-A');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedFinished, setGeneratedFinished] = useState(false);

  const handleGenerate = () => {
    setIsGenerating(true);
    setGeneratedFinished(false);
    setTimeout(() => {
      setIsGenerating(false);
      setGeneratedFinished(true);
    }, 2000);
  };

  return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-bottom-8">
       {/* Header */}
       <div className="bg-white border-b border-slate-200 px-4 pt-12 pb-4 flex items-center justify-between sticky top-0 z-10">
         <div className="flex items-center gap-3">
           <button onClick={onClose} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600 hover:bg-slate-200 transition-colors">
             <ArrowLeft size={20} />
           </button>
           <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Admit Cards</h2>
         </div>
         <div className="flex bg-slate-100 p-1 rounded-full">
           <button 
              onClick={() => setView('GENERATE')} 
              className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors ${view === 'GENERATE' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}
           >
              Generate
           </button>
           <button 
              onClick={() => setView('SETTINGS')} 
              className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors ${view === 'SETTINGS' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}
           >
              Settings
           </button>
         </div>
       </div>

       <div className="flex-1 overflow-y-auto p-5 pb-24">
          {view === 'SETTINGS' && (
            <div className="space-y-6">
               <SectionTitle title="Template Config" />
               <AppCard className="space-y-4 border-none shadow-md">
                 <div>
                   <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">School Name</label>
                   <input 
                      value={schoolName} 
                      onChange={e => setSchoolName(e.target.value)} 
                      className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-extrabold text-sm text-slate-900 outline-none focus:border-blue-500 focus:bg-white transition-colors" 
                   />
                 </div>
                 <div>
                   <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Examination Name</label>
                   <input 
                      value={examName} 
                      onChange={e => setExamName(e.target.value)} 
                      className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-extrabold text-sm text-slate-900 outline-none focus:border-blue-500 focus:bg-white transition-colors" 
                   />
                 </div>
                 <div>
                   <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Important Instructions</label>
                   <textarea 
                      value={instructions} 
                      onChange={e => setInstructions(e.target.value)} 
                      className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm text-slate-700 outline-none focus:border-blue-500 focus:bg-white transition-colors min-h-[120px]" 
                   />
                 </div>
                 <button className="w-full bg-slate-900 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg">
                    Save Template
                 </button>
               </AppCard>

               <div className="bg-blue-50 border border-blue-100 rounded-[32px] p-6 text-center shadow-inner">
                  <div className="w-16 h-16 bg-white text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                     <FileText size={28} />
                  </div>
                  <h4 className="font-black text-blue-900 text-lg uppercase tracking-tight">Template Preview</h4>
                  <p className="text-xs font-bold text-blue-700 mt-2 mb-6 max-w-[250px] mx-auto leading-relaxed">
                     A standard 1-page layout with student photo, basic details, standard constraints, and schedule will be applied automatically.
                  </p>
                  <button className="bg-white text-blue-600 text-[10px] font-black uppercase tracking-widest px-6 py-3 rounded-full border border-blue-200 shadow-sm hover:bg-blue-50 transition-colors">
                     View Demo PDF
                  </button>
               </div>
            </div>
          )}

          {view === 'GENERATE' && (
            <div className="space-y-6">
               <SectionTitle title="Batch Generate" />
               <AppCard className="border-none shadow-md">
                 <p className="text-xs font-bold text-slate-500 mb-6 leading-relaxed">
                    Select a class to generate a single print-ready PDF containing admit cards for all active students in that section.
                 </p>
                 
                 <div className="space-y-3 mb-8">
                    {['10-A', '10-B', '12-Science', '12-Commerce'].map(cls => (
                       <label 
                          key={cls} 
                          className={`flex justify-between items-center p-5 rounded-2xl border-2 cursor-pointer transition-colors ${
                              selectedClass === cls ? 'border-blue-600 bg-blue-50' : 'border-slate-100 bg-white hover:border-blue-200'
                          }`}
                       >
                          <span className="font-black text-base text-slate-900 uppercase tracking-tight">{cls}</span>
                          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                              selectedClass === cls ? 'border-blue-600' : 'border-slate-300'
                          }`}>
                            {selectedClass === cls && <div className="w-3 h-3 rounded-full bg-blue-600" />}
                          </div>
                       </label>
                    ))}
                 </div>

                 {!generatedFinished && !isGenerating && (
                   <button 
                      onClick={handleGenerate} 
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black text-sm uppercase tracking-widest py-4 rounded-2xl transition-transform active:scale-95 shadow-lg flex items-center justify-center gap-3"
                   >
                     <Printer size={20} /> Generate Class PDF
                   </button>
                 )}

                 {isGenerating && (
                   <div className="w-full bg-blue-50 border border-blue-100 rounded-2xl p-8 flex flex-col items-center justify-center space-y-5 animate-in fade-in">
                     <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                     <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Compiling 45 Admit Cards...</p>
                   </div>
                 )}

                 {generatedFinished && (
                   <div className="w-full bg-emerald-50 border border-emerald-100 rounded-2xl p-8 flex flex-col items-center justify-center space-y-6 animate-in zoom-in-95">
                     <div className="w-16 h-16 bg-white text-emerald-600 rounded-full flex items-center justify-center shadow-lg">
                       <CheckCircle2 size={36} />
                     </div>
                     <div className="text-center">
                        <p className="text-sm font-black text-emerald-900 uppercase tracking-tight mb-1">Success</p>
                        <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">45 pages ready • 2.4 MB</p>
                     </div>
                     <button 
                       onClick={() => {
                         // Action to download (Mock)
                         setGeneratedFinished(false);
                         setIsGenerating(false);
                       }} 
                       className="w-full bg-emerald-600 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-transform"
                     >
                       <Download size={18} /> Download Print-Ready PDF
                     </button>
                   </div>
                 )}
               </AppCard>
            </div>
          )}
       </div>
    </div>
  );
}
