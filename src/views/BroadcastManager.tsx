import React, { useState } from 'react';
import { ArrowLeft, MailPlus, Send, History } from 'lucide-react';
import { AppCard, SectionTitle } from '../components/SharedUI';

interface BroadcastManagerProps {
  onClose: () => void;
}

export const BroadcastManager: React.FC<BroadcastManagerProps> = ({ onClose }) => {
  const [view, setView] = useState<'NEW' | 'HISTORY'>('NEW');

  const history = [
    { id: 1, title: 'Server Maintenance Notice', date: '2024-10-01', audience: 'All Admins', status: 'SENT' },
    { id: 2, title: 'New Feature Announcement', date: '2024-09-15', audience: 'All Schools', status: 'SENT' },
  ];

  return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-bottom-8">
       {/* Header */}
       <div className="bg-white border-b border-slate-200 px-4 pt-12 pb-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
         <div className="flex items-center gap-3">
           <button onClick={onClose} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600 hover:bg-slate-200 transition-colors">
             <ArrowLeft size={20} />
           </button>
           <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">System Broadcast</h2>
         </div>
         <div className="flex bg-slate-100 p-1 rounded-full">
           <button 
              onClick={() => setView('NEW')} 
              className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors flex items-center gap-1 ${view === 'NEW' ? 'bg-white shadow-sm text-amber-600' : 'text-slate-500'}`}
           >
              <MailPlus size={14} /> New
           </button>
           <button 
              onClick={() => setView('HISTORY')} 
              className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors flex items-center gap-1 ${view === 'HISTORY' ? 'bg-white shadow-sm text-amber-600' : 'text-slate-500'}`}
           >
              <History size={14} /> Log
           </button>
         </div>
       </div>

       <div className="flex-1 overflow-y-auto p-5 pb-24">
         {view === 'NEW' && (
           <div className="space-y-6">
             <SectionTitle title="Create Global Announcement" />
             <AppCard className="space-y-4 border-none shadow-md">
               <div>
                 <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Announcement Title</label>
                 <input 
                    placeholder="e.g. Scheduled Maintenance"
                    className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-extrabold text-sm text-slate-900 outline-none focus:border-amber-500 focus:bg-white transition-colors" 
                 />
               </div>
               <div>
                 <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Target Audience</label>
                 <select 
                    className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-extrabold text-sm text-slate-900 outline-none focus:border-amber-500 focus:bg-white transition-colors appearance-none" 
                 >
                    <option value="ALL">All Schools & Users</option>
                    <option value="ADMINS">School Principals/Admins Only</option>
                    <option value="STAFF">All Teachers/Staff</option>
                 </select>
               </div>
               <div>
                 <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Message Body</label>
                 <textarea 
                    placeholder="Write your announcement here..."
                    className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm text-slate-900 outline-none focus:border-amber-500 focus:bg-white transition-colors min-h-[150px]" 
                 />
               </div>
               <div className="pt-4 flex gap-3">
                 <button 
                   className="flex-1 flex items-center justify-center gap-2 bg-slate-900 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg"
                 >
                    <Send size={16} /> Send Broadcast
                 </button>
               </div>
             </AppCard>
           </div>
         )}
         {view === 'HISTORY' && (
           <div className="space-y-4">
             {history.map(item => (
               <AppCard key={item.id} noPadding className="border border-slate-100 shadow-sm overflow-hidden bg-white">
                 <div className="p-5 flex justify-between items-start">
                   <div>
                     <h4 className="font-extrabold text-slate-900 text-sm uppercase tracking-tight mb-1">{item.title}</h4>
                     <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{item.date}</p>
                     <div className="mt-2 inline-flex bg-amber-50 text-amber-700 px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-widest">
                       Target: {item.audience}
                     </div>
                   </div>
                 </div>
               </AppCard>
             ))}
           </div>
         )}
       </div>
    </div>
  );
};
