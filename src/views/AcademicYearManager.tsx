import React, { useState } from 'react';
import { ArrowLeft, Plus, CheckCircle2, CalendarDays, Trash2, CalendarRange, AlertTriangle } from 'lucide-react';
import { AppCard, SectionTitle } from '../components/SharedUI';
import { useAcademicYear, AcademicYear } from '../context/AcademicYearContext';

interface AcademicYearManagerProps {
  onClose: () => void;
}

export const AcademicYearManager: React.FC<AcademicYearManagerProps> = ({ onClose }) => {
  const { academicYears, activeYear, addAcademicYear, setActiveYear, removeAcademicYear } = useAcademicYear();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newYearName, setNewYearName] = useState('2025-2026');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  const [yearToDelete, setYearToDelete] = useState<AcademicYear | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const SCHOOL_NAME = "Delhi Public School";

  const handleCreate = () => {
    if (!newYearName || !startDate || !endDate) {
      alert("Please fill all fields.");
      return;
    }
    addAcademicYear({ name: newYearName, startDate, endDate });
    setShowCreateForm(false);
    setNewYearName('');
    setStartDate('');
    setEndDate('');
  };

  const handleConfirmDelete = () => {
    if (confirmText.toLowerCase() === SCHOOL_NAME.toLowerCase()) {
      if (yearToDelete) removeAcademicYear(yearToDelete.id);
      setYearToDelete(null);
      setConfirmText('');
    } else {
      alert("Incorrect school name. Deletion failed.");
    }
  };

  return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-bottom-8">
       {/* ... delete modal ... */}
       {yearToDelete && (
         <div className="absolute inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-5 animate-in fade-in">
           <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl">
             <div className="bg-rose-50 p-6 flex flex-col items-center border-b border-rose-100">
               <div className="w-16 h-16 bg-white text-rose-500 rounded-full flex items-center justify-center mb-4 shadow-sm">
                 <AlertTriangle size={32} />
               </div>
               <h3 className="font-black text-rose-900 text-lg uppercase tracking-tight text-center">Delete Academic Year?</h3>
               <p className="text-xs font-bold text-rose-600 text-center mt-2">
                 You are about to delete <span className="font-black">"{yearToDelete.name}"</span>. This action cannot be undone.
               </p>
             </div>
             <div className="p-6">
               <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
                 Type <span className="text-slate-900">"{SCHOOL_NAME}"</span> to confirm
               </label>
               <input 
                 value={confirmText}
                 onChange={(e) => setConfirmText(e.target.value)}
                 placeholder="Enter full school name"
                 className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm text-slate-900 outline-none focus:border-rose-500 focus:bg-white transition-colors mb-6"
               />
               <div className="flex gap-3">
                 <button 
                   onClick={() => {
                     setYearToDelete(null);
                     setConfirmText('');
                   }}
                   className="flex-1 bg-slate-100 text-slate-600 font-black text-xs uppercase tracking-widest py-3.5 rounded-2xl active:scale-95 transition-transform"
                 >
                   Cancel
                 </button>
                 <button 
                   onClick={handleConfirmDelete}
                   disabled={confirmText.toLowerCase() !== SCHOOL_NAME.toLowerCase()}
                   className="flex-1 bg-rose-600 text-white font-black text-xs uppercase tracking-widest py-3.5 rounded-2xl active:scale-95 transition-transform disabled:opacity-50 disabled:active:scale-100"
                 >
                   Delete
                 </button>
               </div>
             </div>
           </div>
         </div>
       )}

       {/* Header */}
       <div className="bg-white border-b border-slate-200 px-4 pt-12 pb-4 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
         <button onClick={onClose} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600 hover:bg-slate-200 transition-colors">
           <ArrowLeft size={20} />
         </button>
         <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Academic Years</h2>
       </div>

       <div className="flex-1 overflow-y-auto p-5 pb-24">
         {!showCreateForm ? (
           <div className="space-y-6">
             <div className="flex items-center justify-between">
               <SectionTitle title="Manage Years" />
               <button 
                 onClick={() => setShowCreateForm(true)}
                 className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest active:scale-95 transition-transform"
               >
                 <Plus size={14} /> New Year
               </button>
             </div>

             <div className="space-y-3">
               {academicYears.map((ay) => (
                 <AppCard key={ay.id} noPadding className={`border-2 transition-colors ${ay.isActive ? 'border-emerald-500 bg-emerald-50' : 'border-slate-100 bg-white hover:border-slate-200'}`}>
                   <div className="p-5 flex flex-col gap-3">
                     <div className="flex justify-between items-start">
                       <div className="flex items-center gap-2">
                         <div className={`p-2 rounded-xl ${ay.isActive ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                           <CalendarDays size={20} />
                         </div>
                         <div>
                           <h4 className={`font-black text-lg uppercase tracking-tight ${ay.isActive ? 'text-emerald-900' : 'text-slate-900'}`}>
                             {ay.name}
                           </h4>
                           <p className={`text-[10px] font-black uppercase tracking-widest ${ay.isActive ? 'text-emerald-600' : 'text-slate-400'}`}>
                             {ay.startDate} - {ay.endDate}
                           </p>
                         </div>
                       </div>
                       {ay.isActive && (
                         <span className="flex items-center gap-1 bg-emerald-600 text-white px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-widest">
                           <CheckCircle2 size={12} /> Active Let's Work
                         </span>
                       )}
                     </div>

                     <div className="flex gap-2 mt-2">
                       {!ay.isActive && (
                         <>
                           <button 
                             onClick={() => setActiveYear(ay.id)}
                             className="flex-1 bg-white border border-slate-200 text-slate-700 font-bold text-[10px] uppercase tracking-widest py-2 rounded-xl active:scale-95 transition-transform hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200"
                           >
                             Set as Active
                           </button>
                           <button 
                             onClick={() => setYearToDelete(ay)}
                             className="p-2 border border-slate-200 text-rose-500 rounded-xl hover:bg-rose-50 active:scale-95 transition-transform"
                           >
                             <Trash2 size={16} />
                           </button>
                         </>
                       )}
                     </div>
                   </div>
                 </AppCard>
               ))}
               {academicYears.length === 0 && (
                 <div className="text-center p-8 border-2 border-dashed border-slate-200 rounded-[32px] text-slate-400">
                    <CalendarRange size={32} className="mx-auto mb-2 opacity-50" />
                    <p className="font-bold text-sm">No academic years setup yet.</p>
                    <p className="text-xs mt-1">Create one to get started.</p>
                 </div>
               )}
             </div>
           </div>
         ) : (
           <div className="space-y-6">
             <SectionTitle title="Create New Academic Year" />
             <AppCard className="space-y-4 border-none shadow-md">
               <div>
                 <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Display Name</label>
                 <input 
                    value={newYearName} 
                    onChange={e => setNewYearName(e.target.value)} 
                    placeholder="e.g. 2025-2026"
                    className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-extrabold text-sm text-slate-900 outline-none focus:border-indigo-500 focus:bg-white transition-colors" 
                 />
               </div>
               <div>
                 <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Start Date</label>
                 <input 
                    type="date"
                    value={startDate} 
                    onChange={e => setStartDate(e.target.value)} 
                    className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-extrabold text-sm text-slate-900 outline-none focus:border-indigo-500 focus:bg-white transition-colors" 
                 />
               </div>
               <div>
                 <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">End Date</label>
                 <input 
                    type="date"
                    value={endDate} 
                    onChange={e => setEndDate(e.target.value)} 
                    className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-extrabold text-sm text-slate-900 outline-none focus:border-indigo-500 focus:bg-white transition-colors" 
                 />
               </div>
               <div className="flex gap-3 pt-4">
                 <button 
                   onClick={() => setShowCreateForm(false)}
                   className="flex-1 bg-slate-100 text-slate-600 font-black text-xs uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform"
                 >
                    Cancel
                 </button>
                 <button 
                   onClick={handleCreate}
                   className="flex-1 bg-slate-900 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg"
                 >
                    Create Year
                 </button>
               </div>
             </AppCard>
           </div>
         )}
       </div>
    </div>
  );
};
