import React, { useState } from 'react';
import { ArrowLeft, IndianRupee, Download, Building2, CalendarDays, CheckCircle2, Search, Settings } from 'lucide-react';
import { SchoolSettingsCard } from './SchoolSettingsCard';
import { AppCard, SectionTitle } from '../components/SharedUI';

interface BillingManagerProps {
  onClose: () => void;
}

export const BillingManager: React.FC<BillingManagerProps> = ({ onClose }) => {
  const [view, setView] = useState<'OVERVIEW' | 'SETTINGS'>('OVERVIEW');
  const [showAddSchool, setShowAddSchool] = useState(false);
  const [newSchool, setNewSchool] = useState({ name: '', principalId: '', principalName: '', principalPassword: '', agreedAmount: 0 });

  const handleAddSchool = () => {
    if (!newSchool.name || !newSchool.principalId) return;
    
    setSchools([
      ...schools, 
      {
         id: Math.floor(Math.random() * 100000),
         name: newSchool.name,
         principalId: newSchool.principalId,
         isActive: true,
         agreedAmount: newSchool.agreedAmount,
         registeredDate: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
         billingCycle: 'MONTHLY',
         expectedSchedule: [],
         history: [],
         logs: [{ date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }), description: 'School onboarded.' }]
      }
    ]);
    setShowAddSchool(false);
    setNewSchool({ name: '', principalId: '', principalName: '', principalPassword: '', agreedAmount: 0 });
  };
  const [selectedSchool, setSelectedSchool] = useState<any>(null);

  const [schools, setSchools] = useState([
    { 
      id: 1, name: 'Delhi Public School', principalId: 'principal@dps.edu.in', isActive: true, 
      agreedAmount: 120000, 
      registeredDate: '01 Apr 2024',
      billingCycle: 'QUARTERLY',
      expectedSchedule: [
        { dueDate: '2026-07-01', expectedAmount: 40000, status: 'PENDING' },
        { dueDate: '2026-10-01', expectedAmount: 40000, status: 'PENDING' },
        { dueDate: '2027-01-01', expectedAmount: 40000, status: 'PENDING' }
      ],
      history: [
        { id: 'TXN-001', date: '01 Apr 2024', amount: 50000, note: 'Advance Token' }, 
        { id: 'TXN-002', date: '15 May 2024', amount: 20000, note: 'Part Payment' }
      ],
      logs: [
        { date: '15 May 2024', description: 'Payment of ₹20,000 received.' },
        { date: '01 Apr 2024', description: 'School onboarded and amount set to ₹1,20,000' }
      ]
    },
    { 
      id: 2, name: 'Greenwood High', principalId: 'admin@greenwoodhigh.in', isActive: true, 
      agreedAmount: 40000, 
      registeredDate: '10 Jan 2024',
      billingCycle: 'MONTHLY',
      expectedSchedule: [
        { dueDate: '2026-02-10', expectedAmount: 10000, status: 'PAID' },
        { dueDate: '2026-03-10', expectedAmount: 10000, status: 'PAID' },
        { dueDate: '2026-04-10', expectedAmount: 10000, status: 'OVERDUE' },
        { dueDate: '2026-05-10', expectedAmount: 10000, status: 'PENDING' }
      ],
      history: [
        { id: 'TXN-003', date: '10 Jan 2024', amount: 40000, note: 'Full Payment' }
      ],
      logs: [
        { date: '10 Jan 2024', description: 'School onboarded and amount set to ₹40,000' }
      ]
    },
    { 
      id: 3, name: 'Sunrise Valley', principalId: 'director@sunrise.edu', isActive: false, 
      agreedAmount: 85000, 
      registeredDate: '01 Mar 2024',
      billingCycle: 'ANNUALLY',
      expectedSchedule: [
        { dueDate: '2026-03-01', expectedAmount: 85000, status: 'PENDING' }
      ],
      history: [],
      logs: [
        { date: '10 Mar 2024', description: 'School marked as Inactive' },
        { date: '01 Mar 2024', description: 'School onboarded and amount set to ₹85,000' }
      ]
    },
  ]);

  const toggleSchool = (id: number) => {
    setSchools(schools.map(s => {
      if (s.id === id) {
        const newStatus = !s.isActive;
        return { 
          ...s, 
          isActive: newStatus,
          logs: [{ date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }), description: `School marked as ${newStatus ? 'Active' : 'Inactive'}` }, ...s.logs]
        };
      }
      return s;
    }));
  };

  const handleUpdateSchool = (updatedSchool: any) => {
    setSchools(schools.map(s => s.id === updatedSchool.id ? updatedSchool : s));
  };

  const [paymentModal, setPaymentModal] = useState<{ schoolId: number, scheduleIdx: number, show: boolean, expectedAmount: number } | null>(null);

  const markPaid = (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentModal) return;

    const form = e.target as HTMLFormElement;
    const note = (form.elements.namedItem('note') as HTMLInputElement).value || 'Scheduled Payment';
    
    setSchools(schools.map(s => {
      if (s.id === paymentModal.schoolId) {
        const newSchedule = [...(s.expectedSchedule || [])];
        const item = newSchedule[paymentModal.scheduleIdx];
        if (!item || item.status === 'PAID') return s;
        
        item.status = 'PAID';
        const amount = Number(item.expectedAmount);
        
        return { 
          ...s, 
          expectedSchedule: newSchedule,
          history: [{ id: `TXN-${Math.floor(Math.random() * 1000)}`, date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }), amount, note: note }, ...s.history],
          logs: [{ date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }), description: `Payment of ₹${amount.toLocaleString('en-IN')} received for due date ${new Date(item.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}` }, ...s.logs]
        };
      }
      return s;
    }));
    setPaymentModal(null);
  };

  const handleBack = () => {
    onClose();
  };

  return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-bottom-8">
       {/* Header */}
       <div className="bg-white border-b border-slate-200 px-4 pt-12 pb-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
         <div className="flex items-center gap-3">
           <button onClick={handleBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600 hover:bg-slate-200 transition-colors">
             <ArrowLeft size={20} />
           </button>
           <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight truncate max-w-[150px]">
             Schools
           </h2>
         </div>
         <div className="flex bg-slate-100 p-1 rounded-full">
           <button 
              onClick={() => setView('OVERVIEW')} 
              className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors ${view === 'OVERVIEW' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-500'}`}
           >
              Overview
           </button>
           <button 
              onClick={() => setView('SETTINGS')} 
              className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors ${view === 'SETTINGS' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-500'}`}
           >
              Settings
           </button>
         </div>
       </div>

       <div className="flex-1 overflow-y-auto p-5 pb-24">
          {view === 'OVERVIEW' && (
            <div className="space-y-6">
               <div className="grid grid-cols-2 gap-4">
                 <AppCard className="!p-5 bg-gradient-to-br from-emerald-500 to-emerald-600 border-none text-white shadow-md">
                   <h4 className="font-bold text-[10px] uppercase tracking-widest mb-2 opacity-80">Monthly Recurring</h4>
                   <div className="text-3xl font-black">₹4.2L</div>
                   <div className="mt-4 flex items-center gap-1 text-[10px] font-black uppercase tracking-widest">
                     <span className="bg-white/20 px-2 py-1 rounded-full">+15% from last month</span>
                   </div>
                 </AppCard>
                 <AppCard className="!p-5">
                   <h4 className="text-slate-500 font-bold text-[10px] uppercase tracking-widest mb-2">Total Outstanding</h4>
                   <div className="text-2xl font-black text-rose-600">₹85k</div>
                   <div className="mt-4 text-[10px] font-black uppercase tracking-widest text-slate-500 bg-slate-100 px-2 py-1 rounded-full inline-block">
                     3 Schools over due
                   </div>
                 </AppCard>
               </div>

               <SectionTitle title="Schools & Recent Payments" />
               <div className="space-y-6">
                 {schools.map(school => (
                   <AppCard 
                     key={school.id} 
                     noPadding 
                     className={`overflow-hidden border ${school.expectedSchedule?.some((sch: any) => sch.status !== 'PAID' && new Date(sch.dueDate) < new Date()) ? 'border-rose-300 ring-1 ring-rose-300' : 'border-slate-100'} shadow-sm transition-all`}
                   >
                     <div className={`p-4 flex justify-between items-center bg-slate-50/50 border-b border-slate-100 pb-3 ${school.expectedSchedule?.some((sch: any) => sch.status !== 'PAID' && new Date(sch.dueDate) < new Date()) ? 'bg-rose-50/50' : ''}`}>
                       <div className="flex items-center gap-3">
                         <div className={`w-10 h-10 ${school.expectedSchedule?.some((sch: any) => sch.status !== 'PAID' && new Date(sch.dueDate) < new Date()) ? 'bg-rose-100 text-rose-600' : 'bg-indigo-50 text-indigo-600'} rounded-xl flex items-center justify-center font-bold`}>
                           <Building2 size={20} />
                         </div>
                         <div>
                           <h4 className={`font-extrabold text-sm uppercase tracking-tight flex items-center gap-2 ${school.expectedSchedule?.some((sch: any) => sch.status !== 'PAID' && new Date(sch.dueDate) < new Date()) ? 'text-rose-600' : 'text-slate-900'}`}>
                             {school.name}
                             {school.expectedSchedule?.some((sch: any) => sch.status !== 'PAID' && new Date(sch.dueDate) < new Date()) && (
                               <span className="bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest">Overdue</span>
                             )}
                           </h4>
                           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Agreed: ₹{school.agreedAmount.toLocaleString('en-IN')}</p>
                         </div>
                       </div>
                       <div className="text-right">
                         <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Status</p>
                         <div 
                           className={`w-10 h-5 py-0.5 px-0.5 rounded-full cursor-pointer flex items-center transition-colors ${school.isActive ? 'bg-emerald-500 justify-end' : 'bg-slate-300 justify-start'}`}
                           onClick={(e) => { e.stopPropagation(); toggleSchool(school.id); }}
                         >
                           <div className="bg-white w-4 h-4 rounded-full shadow-sm"></div>
                         </div>
                       </div>
                     </div>
                     
                     <div className="px-4 py-3 bg-white border-b-2 border-transparent hover:border-emerald-500 transition-colors">
                        <details className="group">
                          <summary className="flex justify-between items-center mb-2 text-[10px] font-black uppercase tracking-widest cursor-pointer outline-none select-none list-none marker:hidden">
                            <span className="text-slate-500 group-open:text-emerald-600 transition-colors flex items-center gap-1">
                              Payment Schedule <span className="text-[8px] opacity-50 group-open:rotate-180 transition-transform">▼</span>
                            </span>
                            <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                              Received: ₹{school.history.reduce((sum: number, tx: any) => sum + tx.amount, 0).toLocaleString('en-IN')}
                            </span>
                          </summary>
                          
                          {!school.expectedSchedule || school.expectedSchedule.length === 0 ? (
                            <div className="text-xs font-bold text-slate-400 py-2">No schedule generated yet. Check Settings.</div>
                          ) : (
                            <div className="space-y-2 mt-3 mb-4 max-h-[220px] overflow-y-auto pr-1">
                               {school.expectedSchedule.map((sch: any, idx: number) => {
                                 const isOverdue = sch.status !== 'PAID' && new Date(sch.dueDate) < new Date();
                                 const statusStyle = sch.status === 'PAID' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : isOverdue ? 'bg-rose-50 border-rose-100 text-rose-700' : 'bg-slate-50 border-slate-100 text-slate-700';
                                 
                                 return (
                                   <div key={idx} className={`flex justify-between items-center text-xs p-2.5 rounded-lg border shadow-sm ${statusStyle}`}>
                                     <div>
                                       <div className="font-bold flex items-center gap-2">
                                         Due: {new Date(sch.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                         {isOverdue && <span className="bg-rose-600 text-white px-1.5 py-0.5 rounded-[4px] text-[8px] font-black uppercase tracking-widest">Overdue</span>}
                                       </div>
                                       <div className="font-black text-[10px] opacity-60 mt-0.5 uppercase tracking-widest">₹{Math.round(sch.expectedAmount).toLocaleString('en-IN')}</div>
                                     </div>
                                     <div>
                                       {sch.status === 'PAID' ? (
                                         <div className="font-black text-emerald-600 uppercase tracking-widest text-[10px] flex items-center gap-1">
                                            <CheckCircle2 size={12} /> Paid
                                         </div>
                                       ) : (
                                         <button 
                                           onClick={(e) => { e.preventDefault(); setPaymentModal({ schoolId: school.id, scheduleIdx: idx, show: true, expectedAmount: sch.expectedAmount }); }}
                                           className="bg-slate-900 text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-colors shadow-sm"
                                         >
                                           Pay Now
                                         </button>
                                       )}
                                     </div>
                                   </div>
                                 );
                               })}
                            </div>
                          )}
                        </details>
                     </div>
                   </AppCard>
                 ))}
               </div>
            </div>
          )}

          {view === 'SETTINGS' && (
            <div className="space-y-6">
               <div className="flex justify-between items-center">
                 <SectionTitle title="School Financials Configuration" />
                 {!showAddSchool && (
                   <button onClick={() => setShowAddSchool(true)} className="bg-slate-900 text-white px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm active:scale-95 transition-transform">
                     + Add School
                   </button>
                 )}
               </div>
               
               {showAddSchool && (
                 <AppCard className="space-y-4 border border-slate-200 bg-slate-50 shadow-sm relative">
                   <h3 className="font-extrabold text-slate-900 text-sm uppercase tracking-tight mb-2">New School Details</h3>
                   <div className="space-y-3">
                     <div>
                       <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">School Name</label>
                       <input 
                          value={newSchool.name} 
                          onChange={(e) => setNewSchool({...newSchool, name: e.target.value})} 
                          placeholder="e.g. Modern High School"
                          className="w-full border border-slate-200 bg-white rounded-xl px-4 py-3 font-bold text-sm text-slate-900 outline-none focus:border-emerald-500" 
                       />
                     </div>
                     <div>
                       <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Create Principal Account</label>
                       <div className="grid grid-cols-2 gap-3">
                         <input 
                            value={newSchool.principalName} 
                            onChange={(e) => setNewSchool({...newSchool, principalName: e.target.value})} 
                            placeholder="Principal Name (e.g. Dr. Rajesh Kumar)"
                            className="w-full border border-slate-200 bg-white rounded-xl px-4 py-3 font-bold text-sm text-slate-900 outline-none focus:border-emerald-500" 
                         />
                         <input 
                            value={newSchool.principalId} 
                            onChange={(e) => setNewSchool({...newSchool, principalId: e.target.value})} 
                            placeholder="Email ID (principal@school.com)"
                            className="w-full border border-slate-200 bg-white rounded-xl px-4 py-3 font-bold text-sm text-slate-900 outline-none focus:border-emerald-500" 
                         />
                         <input 
                            type="password"
                            value={newSchool.principalPassword} 
                            onChange={(e) => setNewSchool({...newSchool, principalPassword: e.target.value})} 
                            placeholder="Set Password"
                            className="w-full border border-slate-200 bg-white rounded-xl px-4 py-3 font-bold text-sm text-slate-900 outline-none focus:border-emerald-500 col-span-2" 
                         />
                       </div>
                       <p className="text-[10px] text-slate-400 font-bold mt-1.5 ml-1">This will automatically create a Principal (Admin) account for this school.</p>
                     </div>
                     <div>
                       <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Agreed Amount (₹)</label>
                       <input 
                          type="number"
                          value={newSchool.agreedAmount || ''} 
                          onChange={(e) => setNewSchool({...newSchool, agreedAmount: Number(e.target.value)})} 
                          placeholder="0"
                          className="w-full border border-slate-200 bg-white rounded-xl px-4 py-3 font-bold text-sm text-slate-900 outline-none focus:border-emerald-500" 
                       />
                     </div>
                   </div>
                   <div className="pt-4 flex gap-3">
                     <button 
                       onClick={() => setShowAddSchool(false)}
                       className="flex-1 bg-white border border-slate-200 text-slate-600 font-black text-[10px] uppercase tracking-widest py-3 rounded-xl hover:bg-slate-50 active:scale-95 transition-transform"
                     >
                        Cancel
                     </button>
                     <button 
                       onClick={handleAddSchool}
                       className="flex-1 bg-emerald-600 text-white font-black text-[10px] uppercase tracking-widest py-3 rounded-xl shadow-sm hover:bg-emerald-700 active:scale-95 transition-transform"
                     >
                        Create School
                     </button>
                   </div>
                 </AppCard>
               )}

               <div className="space-y-4">
                  {schools.map(school => (
                    <SchoolSettingsCard key={school.id} school={school} onSave={handleUpdateSchool} />
                  ))}
                </div>
            </div>
          )}
       </div>

       {paymentModal && (
         <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
           <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl">
             <div className="p-6 border-b border-slate-100 border-dashed bg-slate-50/50">
               <h3 className="font-black text-slate-900 text-lg uppercase tracking-tight">Confirm Payment</h3>
               <p className="text-xs font-bold text-slate-500 mt-1">Amount: ₹{paymentModal.expectedAmount.toLocaleString('en-IN')}</p>
             </div>
             <form onSubmit={markPaid}>
               <div className="p-6 space-y-4">
                 <div>
                   <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Optional Note</label>
                   <input 
                     name="note" 
                     type="text" 
                     placeholder="Transaction ID / Details" 
                     className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm text-slate-900 outline-none focus:border-emerald-500 focus:bg-white" 
                   />
                 </div>
                 <div className="bg-emerald-50 text-emerald-700 p-3 rounded-xl flex gap-3 text-xs font-bold items-start">
                   <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
                   <p>This will mark the scheduled payment as received and cannot be easily undone from this screen.</p>
                 </div>
               </div>
               <div className="p-4 bg-slate-50 border-t border-slate-100 grid grid-cols-2 gap-3">
                 <button type="button" onClick={() => setPaymentModal(null)} className="px-4 py-3 rounded-xl font-black text-xs uppercase tracking-widest text-slate-500 hover:bg-slate-200 transition-colors">Cancel</button>
                 <button type="submit" className="bg-emerald-600 text-white px-4 py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-sm hover:bg-emerald-700 active:scale-95 transition-all">Confirm</button>
               </div>
             </form>
           </div>
         </div>
       )}

    </div>
  );
};
