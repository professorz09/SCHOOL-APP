import React from 'react';
import { ArrowLeft, ShieldCheck, Search, MoreHorizontal, UserCircle, Star } from 'lucide-react';
import { AppCard } from '../components/SharedUI';

interface GlobalAdminsManagerProps {
  onClose: () => void;
}

export const GlobalAdminsManager: React.FC<GlobalAdminsManagerProps> = ({ onClose }) => {
  const admins = [
    { 
      id: 2, adminId: 'PRN-DPS01', name: 'Dr. Rajesh Kumar', email: 'principal@dps.edu.in', role: 'PRINCIPAL', status: 'ACTIVE',
      createdAccounts: [
        { id: 'TCH-841', name: 'Aarti Desai', role: 'Teacher' },
        { id: 'STF-102', name: 'Sanjay Gupta', role: 'Accountant' }
      ]
    },
    { 
      id: 3, adminId: 'PRN-GWH02', name: 'Vikram Singh', email: 'principal@greenwood.edu.in', role: 'PRINCIPAL', status: 'ACTIVE',
      createdAccounts: [
        { id: 'TCH-722', name: 'Meera Reddy', role: 'Teacher' }
      ]
    },
  ];

  return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-bottom-8">
       {/* Header */}
       <div className="bg-white border-b border-slate-200 px-4 pt-12 pb-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
         <div className="flex items-center gap-3">
           <button onClick={onClose} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600 hover:bg-slate-200 transition-colors">
             <ArrowLeft size={20} />
           </button>
           <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">System Admins</h2>
         </div>
       </div>

       <div className="flex-1 overflow-y-auto p-5 pb-24">
         <div className="relative mb-6">
           <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
           <input 
             placeholder="Search admins..." 
             className="w-full bg-white border border-slate-200 rounded-2xl pl-12 pr-4 py-3.5 font-bold text-sm outline-none focus:border-rose-500 transition-colors shadow-sm"
           />
         </div>

         <div className="space-y-4">
           {admins.map(admin => (
             <AppCard key={admin.id} noPadding className="overflow-hidden shadow-sm border border-slate-100 bg-white">
               <div className="p-4 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
                 <span className="font-black text-rose-600 text-xs uppercase tracking-widest">{admin.adminId}</span>
                 <div className="inline-flex bg-white px-2 py-0.5 rounded shadow-sm text-[10px] font-black text-slate-600 uppercase tracking-widest border border-slate-100">
                   {admin.role}
                 </div>
               </div>
               <div className="p-5 flex justify-between items-center">
                 <div className="flex items-center gap-3">
                   <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${admin.role === 'PRINCIPAL' ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-600'}`}>
                     <UserCircle size={24} />
                   </div>
                   <div>
                     <div className="flex items-center gap-2 mb-0.5">
                       <h4 className="font-extrabold text-slate-900 text-sm uppercase tracking-tight">{admin.name}</h4>
                       {admin.role === 'PRINCIPAL' && <Star size={12} className="text-rose-500 fill-rose-500" />}
                     </div>
                     <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{admin.email}</p>
                   </div>
                 </div>
                 <button className="p-2 text-slate-400 hover:bg-slate-50 rounded-full">
                   <MoreHorizontal size={20} />
                 </button>
               </div>
               <div className="px-5 py-3 border-t border-slate-100 bg-white">
                 <details className="group">
                   <summary className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest cursor-pointer outline-none select-none list-none marker:hidden">
                     <span className="text-slate-500 group-open:text-rose-600 transition-colors flex items-center gap-2">
                       Connected Accounts <span className="text-[8px] opacity-50 group-open:rotate-180 transition-transform">▼</span>
                     </span>
                     <span className="bg-rose-50 text-rose-600 px-2 py-0.5 rounded">
                       {admin.createdAccounts.length}
                     </span>
                   </summary>
                   
                   {admin.createdAccounts.length === 0 ? (
                     <div className="text-xs font-bold text-slate-400 py-3 mt-1 opacity-60">No connected accounts.</div>
                   ) : (
                     <div className="space-y-2 mt-3 mb-1 max-h-[150px] overflow-y-auto pr-1">
                        {admin.createdAccounts.map((acc: any, idx: number) => (
                          <div key={idx} className="flex justify-between items-center p-2.5 bg-slate-50 rounded-xl border border-slate-100/50">
                            <div>
                              <div className="font-bold text-slate-700 text-xs">{acc.name}</div>
                              <div className="font-black text-[9px] text-slate-400 mt-0.5 uppercase tracking-widest">{acc.role}</div>
                            </div>
                            <div className="font-black text-rose-600 uppercase tracking-widest text-[10px] bg-white border border-rose-100 shadow-sm px-2 py-1 rounded-lg">
                              {acc.id}
                            </div>
                          </div>
                        ))}
                     </div>
                   )}
                 </details>
               </div>
             </AppCard>
           ))}
         </div>
       </div>
    </div>
  );
};
