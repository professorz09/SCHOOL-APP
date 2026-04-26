import React from 'react';
import { ArrowLeft, BarChart3, TrendingUp, Users, Activity, School } from 'lucide-react';
import { AppCard, SectionTitle } from '../components/SharedUI';

interface SuperAdminReportsProps {
  onClose: () => void;
}

export const SuperAdminReports: React.FC<SuperAdminReportsProps> = ({ onClose }) => {
  return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-bottom-8">
       {/* Header */}
       <div className="bg-white border-b border-slate-200 px-4 pt-12 pb-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
         <div className="flex items-center gap-3">
           <button onClick={onClose} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600 hover:bg-slate-200 transition-colors">
             <ArrowLeft size={20} />
           </button>
           <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">System Reports</h2>
         </div>
       </div>

       <div className="flex-1 overflow-y-auto p-5 pb-24 space-y-6">
         <div className="grid grid-cols-2 gap-4">
           <AppCard className="!p-5 bg-gradient-to-br from-indigo-500 to-indigo-600 border-none text-white shadow-md">
             <div className="mb-2 bg-white/20 w-8 h-8 rounded-lg flex items-center justify-center">
               <Activity size={16} />
             </div>
             <h4 className="font-bold text-[10px] uppercase tracking-widest mb-1 opacity-80">Platform Usage</h4>
             <div className="text-2xl font-black">94%</div>
             <p className="text-[10px] mt-1 opacity-80">Daily active users</p>
           </AppCard>
           
           <AppCard className="!p-5 bg-gradient-to-br from-blue-500 to-blue-600 border-none text-white shadow-md">
             <div className="mb-2 bg-white/20 w-8 h-8 rounded-lg flex items-center justify-center">
               <TrendingUp size={16} />
             </div>
             <h4 className="font-bold text-[10px] uppercase tracking-widest mb-1 opacity-80">Growth</h4>
             <div className="text-2xl font-black">+24%</div>
             <p className="text-[10px] mt-1 opacity-80">vs last quarter</p>
           </AppCard>
         </div>

         <SectionTitle title="Engagement by School" />
         <AppCard noPadding className="border-none shadow-md overflow-hidden">
           <div className="p-5 border-b border-slate-100 flex items-center gap-3 bg-white">
             <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center font-bold">
               <School size={20} />
             </div>
             <div className="flex-1">
               <div className="flex justify-between items-end mb-1">
                 <h4 className="font-extrabold text-slate-900 text-sm uppercase tracking-tight">Delhi Public School</h4>
                 <span className="text-[10px] font-black text-indigo-600">98% Active</span>
               </div>
               <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                 <div className="bg-indigo-600 h-full rounded-full" style={{ width: '98%' }}></div>
               </div>
             </div>
           </div>
           <div className="p-5 border-b border-slate-100 flex items-center gap-3 bg-white">
             <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center font-bold">
               <School size={20} />
             </div>
             <div className="flex-1">
               <div className="flex justify-between items-end mb-1">
                 <h4 className="font-extrabold text-slate-900 text-sm uppercase tracking-tight">Greenwood High</h4>
                 <span className="text-[10px] font-black text-blue-600">85% Active</span>
               </div>
               <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                 <div className="bg-blue-600 h-full rounded-full" style={{ width: '85%' }}></div>
               </div>
             </div>
           </div>
           <div className="p-5 flex items-center gap-3 bg-white">
             <div className="w-10 h-10 bg-slate-50 text-slate-400 rounded-xl flex items-center justify-center font-bold">
               <School size={20} />
             </div>
             <div className="flex-1">
               <div className="flex justify-between items-end mb-1">
                 <h4 className="font-extrabold text-slate-900 text-sm uppercase tracking-tight">Sunrise Valley</h4>
                 <span className="text-[10px] font-black text-slate-400">42% Active</span>
               </div>
               <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                 <div className="bg-slate-300 h-full rounded-full" style={{ width: '42%' }}></div>
               </div>
             </div>
           </div>
         </AppCard>

         <SectionTitle title="User Demographics" />
         <AppCard className="border-none shadow-md">
           <div className="flex items-center justify-between mb-4">
             <div className="flex items-center gap-2 text-sm font-bold text-slate-600">
               <div className="w-3 h-3 rounded-full bg-indigo-500"></div> Students (14.2k)
             </div>
             <div className="font-black text-slate-900">76%</div>
           </div>
           <div className="flex items-center justify-between mb-4">
             <div className="flex items-center gap-2 text-sm font-bold text-slate-600">
               <div className="w-3 h-3 rounded-full bg-blue-500"></div> Parents (2.8k)
             </div>
             <div className="font-black text-slate-900">15%</div>
           </div>
           <div className="flex items-center justify-between mb-4">
             <div className="flex items-center gap-2 text-sm font-bold text-slate-600">
               <div className="w-3 h-3 rounded-full bg-amber-500"></div> Teachers (1.2k)
             </div>
             <div className="font-black text-slate-900">7%</div>
           </div>
           <div className="flex items-center justify-between">
             <div className="flex items-center gap-2 text-sm font-bold text-slate-600">
               <div className="w-3 h-3 rounded-full bg-rose-500"></div> Staff/Admins (300)
             </div>
             <div className="font-black text-slate-900">2%</div>
           </div>
         </AppCard>
       </div>
    </div>
  );
};
