import React from 'react';
import { CreditCard, ArrowUpRight, ArrowDownRight, Receipt, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { AppCard, SectionTitle } from '../components/SharedUI';
import { AppRole } from '../types';

interface PaymentsViewProps {
  role: AppRole;
}

export const PaymentsView: React.FC<PaymentsViewProps> = ({ role }) => {
  // ---------------------------------------------------------
  // STUDENT / PARENT VIEW
  // ---------------------------------------------------------
  if (role === 'STUDENT') {
    return (
      <div className="flex flex-col gap-6 animate-in slide-in-from-bottom-4 duration-500 fade-in pt-4">
        {/* Payable Amount Header */}
        <div className="flex flex-col items-center justify-center p-6 bg-slate-900 rounded-[40px] text-white shadow-lg relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-blue-500/20 to-transparent"></div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 relative z-10">Total Due • Q2 Term</p>
          <h2 className="text-5xl font-black text-white relative z-10">₹12,450</h2>
          <p className="text-xs font-bold text-red-400 mt-2 flex items-center gap-1 relative z-10">
             <AlertCircle size={14} /> Due in 5 Days
          </p>
          
          <button className="mt-8 w-full bg-blue-600 hover:bg-blue-500 text-white font-black text-sm uppercase tracking-widest py-4 rounded-full transition-colors relative z-10 shadow-[0_4px_16px_rgba(37,99,235,0.4)]">
             Pay Securely via UPI
          </button>
        </div>

        <div>
          <SectionTitle title="Fee Breakdown" />
          <AppCard noPadding>
            <div className="p-4 flex justify-between items-center border-b border-slate-100">
               <div>
                 <h4 className="font-extrabold text-slate-900 text-sm uppercase tracking-tight">Tuition Fee</h4>
                 <p className="text-xs font-bold text-slate-500 mt-0.5">July - September 2024</p>
               </div>
               <span className="font-black text-slate-900">₹8,000</span>
            </div>
            <div className="p-4 flex justify-between items-center border-b border-slate-100">
               <div>
                 <h4 className="font-extrabold text-slate-900 text-sm uppercase tracking-tight">Transport Fee</h4>
                 <p className="text-xs font-bold text-slate-500 mt-0.5">Route #4</p>
               </div>
               <span className="font-black text-slate-900">₹3,200</span>
            </div>
            <div className="p-4 flex justify-between items-center">
               <div>
                 <h4 className="font-extrabold text-slate-900 text-sm uppercase tracking-tight">Library & Lab</h4>
                 <p className="text-xs font-bold text-slate-500 mt-0.5">Annual Charges</p>
               </div>
               <span className="font-black text-slate-900">₹1,250</span>
            </div>
          </AppCard>
        </div>

        <div>
          <SectionTitle title="Recent Transactions" />
          <div className="space-y-4">
             <div className="flex items-center gap-4">
               <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                 <ArrowUpRight size={20} className="transform rotate-45" />
               </div>
               <div className="flex-1">
                 <h4 className="font-extrabold text-slate-900 text-sm uppercase tracking-tight">Paid Q1 Fee</h4>
                 <p className="text-[10px] font-black text-slate-400 mt-1 uppercase tracking-widest">12 Apr 2024 • UPI</p>
               </div>
               <div className="text-right">
                 <span className="block font-black text-slate-900">-₹11,500</span>
                 <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest bg-emerald-50 px-2 py-0.5 rounded">Success</span>
               </div>
             </div>
          </div>
        </div>
        
        <div className="h-8"></div>
      </div>
    );
  }

  // ---------------------------------------------------------
  // PRINCIPAL / ADMIN VIEW
  // ---------------------------------------------------------
  if (role === 'PRINCIPAL' || role === 'SUPER_ADMIN') {
    return (
      <div className="flex flex-col gap-6 animate-in slide-in-from-bottom-4 duration-500 fade-in pt-4">
        {/* Collection Header */}
        <div className="bg-emerald-600 rounded-[40px] p-6 text-white shadow-lg relative overflow-hidden">
           <div className="absolute top-[-50%] right-[-10%] opacity-10">
              <Receipt size={200} />
           </div>
           <p className="text-[10px] font-black uppercase tracking-widest text-emerald-200 mb-2">Total Collection • This Month</p>
           <h2 className="text-4xl font-black mb-2">₹8,42,000</h2>
           
           <div className="mt-6 bg-black/20 rounded-2xl p-4 backdrop-blur-sm">
              <div className="flex justify-between items-center mb-2">
                 <span className="text-xs font-bold text-emerald-100">Monthly Target</span>
                 <span className="text-xs font-black text-white">84%</span>
              </div>
              <div className="w-full bg-black/20 h-2 rounded-full overflow-hidden">
                 <div className="bg-white h-full w-[84%] rounded-full"></div>
              </div>
           </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
           <AppCard className="!p-4 border-none bg-blue-50">
              <div className="w-8 h-8 rounded-full bg-blue-200 text-blue-700 flex items-center justify-center mb-3">
                <ArrowDownRight size={16} />
              </div>
              <h4 className="text-blue-600 font-bold text-[10px] uppercase tracking-widest mb-1">Today's Inflow</h4>
              <div className="text-2xl font-black text-blue-900">₹45k</div>
           </AppCard>
           <AppCard className="!p-4 border-none bg-rose-50">
              <div className="w-8 h-8 rounded-full bg-rose-200 text-rose-700 flex items-center justify-center mb-3">
                <Clock size={16} />
              </div>
              <h4 className="text-rose-600 font-bold text-[10px] uppercase tracking-widest mb-1">Pending Dues</h4>
              <div className="text-2xl font-black text-rose-900">₹2.1L</div>
           </AppCard>
        </div>

        <div>
           <SectionTitle title="Payment Alerts" action="View All" />
           <AppCard className="bg-white" noPadding>
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                 <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-100 text-slate-500 rounded-xl flex items-center justify-center font-bold">10-A</div>
                    <div>
                       <h4 className="font-extrabold text-slate-900 text-sm uppercase tracking-tight">14 Students Pending</h4>
                       <p className="text-[10px] font-black text-slate-400 mt-1 uppercase tracking-widest">Overdue by 10+ days</p>
                    </div>
                 </div>
                 <button className="px-3 py-1.5 bg-slate-100 text-slate-600 text-[10px] font-black uppercase tracking-widest rounded-full">Remind</button>
              </div>
              <div className="p-4 flex items-center justify-between">
                 <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-100 text-slate-500 rounded-xl flex items-center justify-center font-bold">12-C</div>
                    <div>
                       <h4 className="font-extrabold text-slate-900 text-sm uppercase tracking-tight">8 Students Pending</h4>
                       <p className="text-[10px] font-black text-slate-400 mt-1 uppercase tracking-widest">Overdue by 5 days</p>
                    </div>
                 </div>
                 <button className="px-3 py-1.5 bg-slate-100 text-slate-600 text-[10px] font-black uppercase tracking-widest rounded-full">Remind</button>
              </div>
           </AppCard>
        </div>

        <div className="h-8"></div>
      </div>
    );
  }

  // Fallback for Teacher / Driver
  return (
    <div className="flex flex-col items-center justify-center h-64 opacity-50 mt-10">
      <div className="w-16 h-16 bg-slate-200 rounded-full mb-4 flex items-center justify-center">
         <CreditCard className="text-slate-400" size={24} />
      </div>
      <p className="font-semibold text-slate-500 text-center px-8">Financial analytics and payroll are available on the web portal.</p>
    </div>
  );
};
