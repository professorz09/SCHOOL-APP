import React, { useState } from 'react';
import { ArrowLeft, FlaskConical, AlertTriangle, Plus, Search, Microscope, Zap, Beaker } from 'lucide-react';
import { AppCard, SectionTitle } from '../components/SharedUI';

interface LabInventoryManagerProps {
  onClose: () => void;
}

export const LabInventoryManager: React.FC<LabInventoryManagerProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<'CHEMISTRY' | 'PHYSICS' | 'BIOLOGY'>('CHEMISTRY');

  const chemistryInventory = [
    { id: 1, name: 'Glass Beakers (250ml)', count: 45, status: 'GOOD' },
    { id: 2, name: 'Test Tubes', count: 120, status: 'GOOD' },
    { id: 3, name: 'Sulphuric Acid (H2SO4)', count: 2, status: 'LOW', unit: 'Liters' },
    { id: 4, name: 'Bunsen Burners', count: 15, status: 'REPAIR', notes: '3 need new gas valves' },
  ];

  const physicsInventory = [
    { id: 1, name: 'Digital Multimeters', count: 12, status: 'GOOD' },
    { id: 2, name: 'Convex Lenses', count: 30, status: 'GOOD' },
    { id: 3, name: 'Connecting Wires', count: 10, status: 'LOW', unit: 'Bundles' },
    { id: 4, name: 'Voltmeters (Analog)', count: 8, status: 'REPAIR', notes: 'Need recalibration' },
  ];

  const biologyInventory = [
    { id: 1, name: 'Compound Microscopes', count: 15, status: 'GOOD' },
    { id: 2, name: 'Glass Slides', count: 200, status: 'GOOD' },
    { id: 3, name: 'Specimen Jars', count: 8, status: 'LOW' },
  ];

  const getActiveInventory = () => {
    switch(activeTab) {
      case 'CHEMISTRY': return chemistryInventory;
      case 'PHYSICS': return physicsInventory;
      case 'BIOLOGY': return biologyInventory;
      default: return [];
    }
  };

  return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-bottom-8">
       {/* Header */}
       <div className="bg-white border-b border-slate-200 px-4 pt-12 pb-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
         <div className="flex items-center gap-3">
           <button onClick={onClose} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600 hover:bg-slate-200 transition-colors">
             <ArrowLeft size={20} />
           </button>
           <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Lab Inventory</h2>
         </div>
         <button className="bg-slate-900 text-white p-2 rounded-full active:scale-95 transition-transform">
           <Plus size={20} />
         </button>
       </div>

       {/* Labs Tabs */}
       <div className="bg-white px-4 py-3 border-b border-slate-100 flex gap-2 overflow-x-auto no-scrollbar">
          <button 
             onClick={() => setActiveTab('CHEMISTRY')}
             className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-black uppercase tracking-widest whitespace-nowrap transition-colors ${activeTab === 'CHEMISTRY' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
          >
             <Beaker size={14} /> Chemistry
          </button>
          <button 
             onClick={() => setActiveTab('PHYSICS')}
             className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-black uppercase tracking-widest whitespace-nowrap transition-colors ${activeTab === 'PHYSICS' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
          >
             <Zap size={14} /> Physics
          </button>
          <button 
             onClick={() => setActiveTab('BIOLOGY')}
             className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-black uppercase tracking-widest whitespace-nowrap transition-colors ${activeTab === 'BIOLOGY' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
          >
             <Microscope size={14} /> Biology
          </button>
       </div>

       <div className="flex-1 overflow-y-auto p-5 pb-24">
         <div className="relative mb-6">
           <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
           <input 
             placeholder="Search equipment or chemicals..." 
             className="w-full bg-white border border-slate-200 rounded-2xl pl-12 pr-4 py-3.5 font-bold text-sm outline-none focus:border-blue-500 transition-colors shadow-sm"
           />
         </div>

         <div className="space-y-4">
           {getActiveInventory().map(item => (
             <AppCard key={item.id} noPadding className="overflow-hidden bg-white hover:border-blue-200 transition-colors cursor-pointer border border-slate-100 shadow-sm">
               <div className="p-5 flex justify-between items-start">
                 <div>
                   <h4 className="font-extrabold text-slate-900 text-base uppercase tracking-tight">{item.name}</h4>
                   <p className="text-xs font-bold text-slate-500 mt-1">
                     <span className="text-slate-900">{item.count}</span> {item.unit || 'Units'} Available
                   </p>
                   {item.notes && <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest mt-2 bg-rose-50 px-2 py-1 rounded inline-block">{item.notes}</p>}
                 </div>
                 
                 <div>
                   {item.status === 'GOOD' && (
                     <span className="bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest">In Stock</span>
                   )}
                   {item.status === 'LOW' && (
                     <span className="bg-amber-50 text-amber-600 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                       <AlertTriangle size={12} /> Low
                     </span>
                   )}
                   {item.status === 'REPAIR' && (
                     <span className="bg-rose-50 text-rose-600 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                       Needs Repair
                     </span>
                   )}
                 </div>
               </div>
             </AppCard>
           ))}
         </div>
       </div>

       <div className="fixed bottom-0 left-0 w-full p-4 bg-white border-t border-slate-200 z-10 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
         <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black text-sm uppercase tracking-widest py-4 rounded-2xl transition-transform active:scale-95 shadow-lg flex items-center justify-center gap-2">
           <FlaskConical size={20} /> Request Restock Quotes
         </button>
       </div>
    </div>
  );
}
