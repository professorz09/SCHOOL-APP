import fs from 'fs';

let c = fs.readFileSync('src/views/SchoolManager.tsx', 'utf8');

const OLD_SECTIONS_BLOCK = `<SectionTitle title="Sections for Selected Academic Year" />
             <div className="mb-4">
               <AppCard noPadding className="shadow-sm border border-slate-100 mb-4">
                 <div className="divide-y divide-slate-100">
                   {mockAcademicYears[selectedAcademicYearIndex].sections.map((section, i) => (
                     <div 
                       key={i} 
                       onClick={() => { setSelectedSection(section); setView('STUDENT_LIST'); }}
                       className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer"
                     >
                       <div className="flex items-center gap-3">
                         <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-xs text-slate-600">
                           {section.name.charAt(0)}
                         </div>
                         <span className="font-extrabold text-slate-900 text-sm tracking-tight">{section.name}</span>
                       </div>
                       <div className="flex flex-col items-end gap-1">
                         <div className="flex items-center gap-2">
                           <span className="font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full text-[10px]">
                             ₹{section.totalRevenue}
                           </span>
                           <span className="font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full text-[10px]">
                             ₹{section.pendingFees} pending
                           </span>
                           <span className="font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full text-xs ml-2">
                             {section.count} Students
                           </span>
                           <ChevronRight size={16} className="text-slate-400" />
                         </div>
                       </div>
                     </div>
                   ))}
                 </div>
               </AppCard>
             </div>`;

const NEW_DETAILS_BLOCK = `
             <SectionTitle title="Data Explorer" />
             <div className="grid grid-cols-2 gap-4 mb-4">
               <AppCard 
                  onClick={() => setView('SECTIONS_LIST')}
                  className="flex flex-col items-center justify-center p-6 cursor-pointer hover:border-indigo-200 transition-colors bg-white shadow-sm"
               >
                 <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 mb-3">
                   <Users size={24} />
                 </div>
                 <h4 className="font-black text-slate-800 text-sm">Students Data</h4>
                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Class wise list</p>
               </AppCard>
               <AppCard 
                  onClick={() => setView('STAFF_LIST')}
                  className="flex flex-col items-center justify-center p-6 cursor-pointer hover:border-violet-200 transition-colors bg-white shadow-sm"
               >
                 <div className="w-12 h-12 bg-violet-50 rounded-2xl flex items-center justify-center text-violet-600 mb-3">
                   <User size={24} />
                 </div>
                 <h4 className="font-black text-slate-800 text-sm">Staff Data</h4>
                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Teachers & Admins</p>
               </AppCard>
               <AppCard 
                  onClick={() => setView('REVENUE_LIST')}
                  className="flex flex-col items-center justify-center p-6 cursor-pointer hover:border-emerald-200 transition-colors bg-white shadow-sm"
               >
                 <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 mb-3">
                   <IndianRupee size={24} />
                 </div>
                 <h4 className="font-black text-slate-800 text-sm">Revenue Data</h4>
                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Fees & Income</p>
               </AppCard>
               <AppCard 
                  onClick={() => setView('EXPENDITURE_LIST')}
                  className="flex flex-col items-center justify-center p-6 cursor-pointer hover:border-rose-200 transition-colors bg-white shadow-sm"
               >
                 <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-600 mb-3">
                   <Wallet size={24} />
                 </div>
                 <h4 className="font-black text-slate-800 text-sm">Expenditure Data</h4>
                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">School Expenses</p>
               </AppCard>
             </div>
`;

if (c.includes(OLD_SECTIONS_BLOCK)) {
   c = c.replace(OLD_SECTIONS_BLOCK, NEW_DETAILS_BLOCK);
} else {
   console.log("OLD_SECTIONS_BLOCK not found");
}

// Now inject the new views before {view === 'STUDENT_LIST'

const NEW_VIEWS = `
         {view === 'SECTIONS_LIST' && (
           <div className="space-y-4 animate-in slide-in-from-right-4">
             <SectionTitle title="Class Wise Students" />
               <AppCard noPadding className="shadow-sm border border-slate-100 mb-4">
                 <div className="divide-y divide-slate-100">
                   {mockAcademicYears[selectedAcademicYearIndex].sections.map((section, i) => (
                     <div 
                       key={i} 
                       onClick={() => { setSelectedSection(section); setView('STUDENT_LIST'); }}
                       className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer"
                     >
                       <div className="flex items-center gap-3">
                         <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-xs text-slate-600">
                           {section.name.charAt(0)}
                         </div>
                         <span className="font-extrabold text-slate-900 text-sm tracking-tight">{section.name}</span>
                       </div>
                       <div className="flex flex-col items-end gap-1">
                         <div className="flex items-center gap-2">
                           <span className="font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full text-[10px]">
                             ₹{section.totalRevenue}
                           </span>
                           <span className="font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full text-[10px]">
                             ₹{section.pendingFees} pending
                           </span>
                           <span className="font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full text-xs ml-2">
                             {section.count} Students
                           </span>
                           <ChevronRight size={16} className="text-slate-400" />
                         </div>
                       </div>
                     </div>
                   ))}
                 </div>
               </AppCard>
           </div>
         )}

         {view === 'STAFF_LIST' && (
           <div className="space-y-4 animate-in slide-in-from-right-4">
               <AppCard noPadding className="shadow-sm border border-slate-100 mb-4">
                 <div className="divide-y divide-slate-100">
                   {[
                     { name: 'Dr. Rajesh Kumar', role: 'Principal', subject: 'Administration' },
                     { name: 'Anita Sharma', role: 'Senior Teacher', subject: 'Mathematics' },
                     { name: 'Vikram Singh', role: 'Teacher', subject: 'Science' },
                     { name: 'Meera Patel', role: 'Admin Staff', subject: 'Accounts' }
                   ].map((staff, i) => (
                     <div key={i} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer">
                       <div className="flex items-center gap-3">
                         <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center font-bold text-sm text-violet-700">
                           {staff.name.charAt(0)}
                         </div>
                         <div>
                           <span className="font-extrabold text-slate-900 text-sm tracking-tight block">{staff.name}</span>
                           <span className="font-bold text-slate-500 text-[10px] uppercase tracking-widest">{staff.role} • {staff.subject}</span>
                         </div>
                       </div>
                       <ChevronRight size={16} className="text-slate-400" />
                     </div>
                   ))}
                 </div>
               </AppCard>
           </div>
         )}
         
         {view === 'REVENUE_LIST' && (
           <div className="space-y-4 animate-in slide-in-from-right-4">
               <AppCard noPadding className="shadow-sm border border-slate-100 mb-4">
                 <div className="divide-y divide-slate-100">
                   {[
                     { source: 'Term 1 Fees', date: '10 Apr 2024', amount: '45,20,000', status: 'Completed' },
                     { source: 'Transport Fees', date: '05 Apr 2024', amount: '8,50,000', status: 'Completed' },
                     { source: 'Uniform Sales', date: '01 Apr 2024', amount: '2,10,000', status: 'Completed' }
                   ].map((rev, i) => (
                     <div key={i} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer">
                         <div>
                           <span className="font-extrabold text-slate-900 text-sm tracking-tight block">{rev.source}</span>
                           <span className="font-bold text-slate-500 text-[10px] uppercase tracking-widest">{rev.date}</span>
                         </div>
                         <div className="flex flex-col items-end">
                           <span className="font-black text-emerald-700">₹{rev.amount}</span>
                           <span className="font-bold text-emerald-600 text-[10px] uppercase tracking-widest">{rev.status}</span>
                         </div>
                     </div>
                   ))}
                 </div>
               </AppCard>
           </div>
         )}
         
         {view === 'EXPENDITURE_LIST' && (
           <div className="space-y-4 animate-in slide-in-from-right-4">
               <AppCard noPadding className="shadow-sm border border-slate-100 mb-4">
                 <div className="divide-y divide-slate-100">
                   {[
                     { item: 'Staff Salaries (April)', date: '30 Apr 2024', amount: '35,00,000', category: 'Payroll' },
                     { item: 'Electricity & Utilities', date: '28 Apr 2024', amount: '2,40,000', category: 'Operations' },
                     { item: 'New Lab Equipment', date: '15 Apr 2024', amount: '4,50,000', category: 'Infrastructure' },
                     { item: 'Maintenance', date: '10 Apr 2024', amount: '1,20,000', category: 'Operations' }
                   ].map((exp, i) => (
                     <div key={i} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer">
                         <div>
                           <span className="font-extrabold text-slate-900 text-sm tracking-tight block">{exp.item}</span>
                           <span className="font-bold text-slate-500 text-[10px] uppercase tracking-widest">{exp.date} • {exp.category}</span>
                         </div>
                         <div className="flex flex-col items-end">
                           <span className="font-black text-rose-700">₹{exp.amount}</span>
                         </div>
                     </div>
                   ))}
                 </div>
               </AppCard>
           </div>
         )}

`;

c = c.replace("{view === 'STUDENT_LIST' && selectedSection && (", NEW_VIEWS + "{view === 'STUDENT_LIST' && selectedSection && (");

fs.writeFileSync('src/views/SchoolManager.tsx', c);
