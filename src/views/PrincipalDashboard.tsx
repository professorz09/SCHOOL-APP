import React, { useState } from 'react';
import { Users, UserCheck, Receipt, BookOpen, CircleAlert, CheckCircle2, AlertTriangle, Wallet, MoreHorizontal, CalendarSync, IndianRupee, Bus, MapPin, CalendarOff, IdCard, Library, FlaskConical } from 'lucide-react';
import { ActionGrid, AppCard, SectionTitle } from '../components/SharedUI';
import { ActionItem } from '../types';
import { AdmitCardManager } from './AdmitCardManager';
import { LabInventoryManager } from './LabInventoryManager';
import { PrincipalFeatureView } from './PrincipalFeatureView';

export const PrincipalDashboard: React.FC = () => {
  const [showAdmitCards, setShowAdmitCards] = useState(false);
  const [showLabInventory, setShowLabInventory] = useState(false);
  const [featureView, setFeatureView] = useState<string | null>(null);

  const actions: ActionItem[] = [
    { title: 'Students', icon: <Users size={28} />, color: 'text-indigo-600', onClick: () => setFeatureView('STUDENTS') },
    { title: 'Staff', icon: <UserCheck size={28} />, color: 'text-blue-600', onClick: () => setFeatureView('STAFF') },
    { title: 'Classes', icon: <BookOpen size={28} />, color: 'text-purple-600', onClick: () => setFeatureView('CLASSES') },
    { title: 'Fees Col.', icon: <Receipt size={28} />, color: 'text-emerald-600', onClick: () => setFeatureView('FEES') },
    { title: 'Transport', icon: <Bus size={28} />, color: 'text-amber-500', onClick: () => setFeatureView('TRANSPORT') },
    { title: 'Complaints', icon: <CircleAlert size={28} />, color: 'text-rose-500', onClick: () => setFeatureView('COMPLAINTS') },
    { title: 'Expenses', icon: <Wallet size={28} />, color: 'text-red-500', onClick: () => setFeatureView('EXPENSES') },
    { title: 'More', icon: <MoreHorizontal size={28} />, color: 'text-slate-600' },
  ];

  return (
    <div className="flex flex-col gap-6 animate-in slide-in-from-bottom-4 duration-500 fade-in">
      <div className="pt-4">
        <p className="text-slate-500 font-bold text-xs uppercase tracking-widest mb-2">Today's Attendance</p>
        <div className="flex items-baseline gap-3">
          <h2 className="text-4xl font-black text-blue-600">92.4%</h2>
        </div>
      </div>

      <ActionGrid actions={actions} />

      <div className="grid grid-cols-2 gap-4">
         <AppCard className="!p-6">
            <h4 className="text-slate-500 font-bold text-[10px] uppercase tracking-widest mb-2">Total Students</h4>
            <div className="text-3xl font-black text-slate-900">1,240</div>
            <div className="mt-4 flex items-center gap-1 text-emerald-500 font-bold text-[10px] uppercase tracking-widest">
              <CheckCircle2 size={12} className="inline-block" /> +12 this month
            </div>
         </AppCard>
         <AppCard className="!p-6 bg-slate-900 border-none">
            <h4 className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mb-2">Fee Collected</h4>
            <div className="text-3xl font-black text-white">₹8.4L</div>
            <div className="mt-4 text-[10px] font-black text-emerald-400 bg-emerald-500/20 max-w-fit px-2 py-1 rounded-full uppercase tracking-widest">
              85% Target
            </div>
         </AppCard>
      </div>

      <div>
        <SectionTitle title="Live Classes" action="Monitor All" />
        <AppCard noPadding>
          <div className="p-4 flex items-center justify-between border-b border-slate-100">
             <div className="flex items-center gap-3">
               <div className="w-10 h-10 bg-purple-100 text-purple-600 rounded-xl flex items-center justify-center font-bold">
                 10-A
               </div>
               <div>
                 <h4 className="font-extrabold text-slate-900 text-sm uppercase tracking-tight">Mathematics</h4>
                 <p className="text-xs font-bold text-slate-500 mt-1">Mr. Sharma • 42/45 Present</p>
               </div>
             </div>
             <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]"></div>
          </div>
          <div className="p-4 flex items-center justify-between">
             <div className="flex items-center gap-3">
               <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center font-bold">
                 9-B
               </div>
               <div>
                 <h4 className="font-extrabold text-slate-900 text-sm uppercase tracking-tight">Physics</h4>
                 <p className="text-xs font-bold text-slate-500 mt-1">Mrs. Gupta • 38/40 Present</p>
               </div>
             </div>
             <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]"></div>
          </div>
        </AppCard>
      </div>

      <div>
        <SectionTitle title="Transport Fleet" action="View Map" />
        <AppCard noPadding>
          <div className="p-4 flex items-center justify-between border-b border-slate-100">
             <div className="flex items-center gap-3">
               <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center font-bold">
                 <Bus size={20} />
               </div>
               <div className="flex-1">
                 <h4 className="font-extrabold text-slate-900 text-sm uppercase tracking-tight">Route #4 • DL 1C 4455</h4>
                 <p className="text-xs font-bold text-blue-600 mt-1 flex items-center gap-1">
                    <MapPin size={12} /> approaching Green Park Avenue
                 </p>
                 <p className="text-[10px] font-black text-slate-400 mt-1 uppercase tracking-widest">Driver: Raju Bhai • Ongoing</p>
               </div>
             </div>
             <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
          </div>
          <div className="p-4 flex items-center justify-between opacity-60">
             <div className="flex items-center gap-3">
               <div className="w-10 h-10 bg-slate-100 text-slate-400 rounded-xl flex items-center justify-center font-bold">
                 <Bus size={20} />
               </div>
               <div className="flex-1">
                 <h4 className="font-extrabold text-slate-900 text-sm uppercase tracking-tight">Route #7 • DL 1C 7789</h4>
                 <p className="text-xs font-bold text-slate-500 mt-1">
                    Route Completed
                 </p>
                 <p className="text-[10px] font-black text-slate-400 mt-1 uppercase tracking-widest">Driver: Suresh • Offline</p>
               </div>
             </div>
             <div className="w-2.5 h-2.5 bg-slate-300 rounded-full"></div>
          </div>
        </AppCard>
      </div>

      <div>
        <SectionTitle title="Pending Leave Approvals" action="Review All" />
        <AppCard noPadding>
          <div className="p-4 flex gap-4 border-b border-slate-100">
             <div className="text-amber-500 mt-1"><CalendarOff size={20} /></div>
             <div className="flex-1">
               <h4 className="font-extrabold text-slate-900 text-sm uppercase tracking-tight">Leave Request: Mr. Desai</h4>
               <p className="text-[10px] font-black text-slate-400 mt-1 uppercase tracking-widest">Sick Leave • 24 Apr - 25 Apr</p>
               <div className="flex gap-2 mt-3">
                 <button className="px-4 py-2 bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-widest rounded-full">Approve</button>
                 <button className="px-4 py-2 bg-slate-50 text-slate-600 text-[10px] font-black uppercase tracking-widest rounded-full">Reject</button>
               </div>
             </div>
          </div>
          <div className="p-4 flex gap-4">
             <div className="text-blue-500 mt-1"><CalendarOff size={20} /></div>
             <div className="flex-1">
               <h4 className="font-extrabold text-slate-900 text-sm uppercase tracking-tight">Leave Request: Anjali (10-A)</h4>
               <p className="text-[10px] font-black text-slate-400 mt-1 uppercase tracking-widest">Family Event • 26 Apr</p>
               <div className="flex gap-2 mt-3">
                 <button className="px-4 py-2 bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-widest rounded-full">Approve</button>
                 <button className="px-4 py-2 bg-slate-50 text-slate-600 text-[10px] font-black uppercase tracking-widest rounded-full">Reject</button>
               </div>
             </div>
          </div>
        </AppCard>
      </div>

      <div>
        <SectionTitle title="Recent Complaints" action="View All" />
        <AppCard noPadding>
          <div className="p-4 flex gap-4 border-b border-slate-100">
             <div className="text-amber-500 mt-1"><AlertTriangle size={20} /></div>
             <div>
               <h4 className="font-extrabold text-slate-900 text-sm uppercase tracking-tight">Staff: Smartboard Issue</h4>
               <p className="text-xs text-slate-500 font-medium mt-1">Class 9-A smartboard is not turning on. Raised by Mr. Sharma.</p>
             </div>
          </div>
          <div className="p-4 flex gap-4 border-b border-slate-100">
             <div className="text-rose-500 mt-1"><CircleAlert size={20} /></div>
             <div>
               <h4 className="font-extrabold text-slate-900 text-sm uppercase tracking-tight">Parent: Transport Delay</h4>
               <p className="text-xs text-slate-500 font-medium mt-1">Regarding continuous delay in Route #4 for the last 3 days.</p>
             </div>
          </div>
          <div className="p-4 flex gap-4">
             <div className="text-blue-500 mt-1"><CircleAlert size={20} /></div>
             <div>
               <h4 className="font-extrabold text-slate-900 text-sm uppercase tracking-tight">Student: Library AC</h4>
               <p className="text-xs text-slate-500 font-medium mt-1">Air conditioning not working in the main reading room. Raised by Rohan (10-A).</p>
             </div>
          </div>
        </AppCard>
      </div>

      <div>
        <SectionTitle title="Administration Configuration" action="Manage" />
        <AppCard noPadding>
          <div className="p-4 flex items-center justify-between border-b border-slate-100">
             <div className="flex items-center gap-3">
               <div className="w-10 h-10 bg-slate-100 text-slate-600 rounded-xl flex items-center justify-center font-bold">
                 <CalendarSync size={20} />
               </div>
               <div>
                 <h4 className="font-extrabold text-slate-900 text-sm uppercase tracking-tight">Academic Session</h4>
                 <p className="text-xs text-slate-500 font-medium mt-1">Current: <strong className="text-slate-700">2024-2025</strong></p>
               </div>
             </div>
             <button className="bg-slate-900 text-white text-[10px] font-black px-3 py-1.5 rounded-full uppercase tracking-widest leading-none">
                 Change
             </button>
          </div>
          <div className="p-4 flex items-center justify-between">
             <div className="flex items-center gap-3">
               <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center font-bold">
                 <IndianRupee size={20} />
               </div>
               <div>
                 <h4 className="font-extrabold text-slate-900 text-sm uppercase tracking-tight">Fee Structure Setup</h4>
                 <p className="text-xs text-slate-500 font-medium mt-1">Configure tuition, transport & late fees</p>
               </div>
             </div>
             <button className="bg-slate-900 text-white text-[10px] font-black px-3 py-1.5 rounded-full uppercase tracking-widest leading-none">
                 Configure
             </button>
          </div>
        </AppCard>
      </div>

      <div>
        <SectionTitle title="Facilities & Resources" action="View All" />
        <AppCard noPadding>
          <div className="p-4 flex items-center justify-between border-b border-slate-100">
             <div className="flex items-center gap-3">
               <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center font-bold">
                 <IdCard size={20} />
               </div>
               <div>
                 <h4 className="font-extrabold text-slate-900 text-sm uppercase tracking-tight">Generate Admit Cards</h4>
                 <p className="text-xs text-slate-500 font-medium mt-1">Mid-Term Exams 2024</p>
               </div>
             </div>
             <button 
               onClick={() => setShowAdmitCards(true)}
               className="bg-slate-900 text-white text-[10px] font-black px-3 py-1.5 rounded-full uppercase tracking-widest leading-none active:scale-95 transition-transform"
             >
                 Generate
             </button>
          </div>
          <div className="p-4 flex items-center justify-between border-b border-slate-100">
             <div className="flex items-center gap-3">
               <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center font-bold">
                 <Library size={20} />
               </div>
               <div>
                 <h4 className="font-extrabold text-slate-900 text-sm uppercase tracking-tight">Library Control</h4>
                 <p className="text-xs text-slate-500 font-medium mt-1">14 overdue • 284 issues</p>
               </div>
             </div>
             <button className="bg-slate-900 text-white text-[10px] font-black px-3 py-1.5 rounded-full uppercase tracking-widest leading-none">
                 Manage
             </button>
          </div>
          <div className="p-4 flex items-center justify-between">
             <div className="flex items-center gap-3">
               <div className="w-10 h-10 bg-rose-100 text-rose-600 rounded-xl flex items-center justify-center font-bold">
                 <FlaskConical size={20} />
               </div>
               <div>
                 <h4 className="font-extrabold text-slate-900 text-sm uppercase tracking-tight">Lab Inventory</h4>
                 <p className="text-xs text-slate-500 font-medium mt-1">Microscopes, Test tubes, etc.</p>
               </div>
             </div>
             <button 
               onClick={() => setShowLabInventory(true)}
               className="bg-slate-900 text-white text-[10px] font-black px-3 py-1.5 rounded-full uppercase tracking-widest leading-none active:scale-95 transition-transform"
             >
                 Check
             </button>
          </div>
        </AppCard>
      </div>

      <div className="h-8"></div>

      {showAdmitCards && <AdmitCardManager onClose={() => setShowAdmitCards(false)} />}
      {showLabInventory && <LabInventoryManager onClose={() => setShowLabInventory(false)} />}
      {featureView && <PrincipalFeatureView feature={featureView} onClose={() => setFeatureView(null)} />}
    </div>
  );
};
