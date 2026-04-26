import fs from 'fs';

let c = fs.readFileSync('src/views/SchoolManager.tsx', 'utf8');

// I will clean up the `view === 'CREATE'` and `view === 'DETAILS'` blocks.
// Let's use regex to extract everything up to {view === 'CREATE' && (
let createIndex = c.indexOf("{view === 'CREATE' && (");
let fileUpToCreate = c.substring(0, createIndex);

let createBlock = `{view === 'CREATE' && (
           <div className="space-y-6">
             <SectionTitle title="Onboard New School" />
             <AppCard className="space-y-4 border-none shadow-md">
               <div>
                 <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">School Name <span className="text-rose-500">*</span></label>
                 <input value={createForm.name} onChange={e => setCreateForm({...createForm, name: e.target.value})} placeholder="e.g. Apex International" className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-extrabold text-sm text-slate-900 outline-none focus:border-indigo-500 focus:bg-white transition-colors" />
               </div>
               <div className="grid grid-cols-2 gap-4">
                 <div>
                   <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">School Code <span className="text-rose-500">*</span></label>
                   <input value={createForm.code} onChange={e => setCreateForm({...createForm, code: e.target.value})} placeholder="e.g. APEX-01" className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-extrabold text-sm text-slate-900 outline-none focus:border-indigo-500 focus:bg-white transition-colors" />
                 </div>
                 <div>
                   <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">City / Location <span className="text-rose-500">*</span></label>
                   <input value={createForm.location} onChange={e => setCreateForm({...createForm, location: e.target.value})} placeholder="e.g. Pune" className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-extrabold text-sm text-slate-900 outline-none focus:border-indigo-500 focus:bg-white transition-colors" />
                 </div>
               </div>
               <div className="grid grid-cols-2 gap-4">
                 <div>
                   <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">School Contact No <span className="text-rose-500">*</span></label>
                   <input value={createForm.phone} onChange={e => setCreateForm({...createForm, phone: e.target.value})} placeholder="+91 " className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-extrabold text-sm text-slate-900 outline-none focus:border-indigo-500 focus:bg-white transition-colors" />
                 </div>
                 <div>
                   <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Full Address <span className="text-rose-500">*</span></label>
                   <input value={createForm.address} onChange={e => setCreateForm({...createForm, address: e.target.value})} placeholder="e.g. Street, Area, Pincode" className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-extrabold text-sm text-slate-900 outline-none focus:border-indigo-500 focus:bg-white transition-colors" />
                 </div>
               </div>

               <div className="mt-6 mb-2 flex items-center gap-2">
                 <div className="h-px bg-slate-200 flex-1"></div>
                 <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Principal Details (Mandatory)</span>
                 <div className="h-px bg-slate-200 flex-1"></div>
               </div>

               <div>
                 <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Principal Full Name <span className="text-rose-500">*</span></label>
                 <input value={createForm.principalName} onChange={e => setCreateForm({...createForm, principalName: e.target.value})} placeholder="e.g. Dr. Rajesh Kumar" className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-extrabold text-sm text-slate-900 outline-none focus:border-indigo-500 focus:bg-white transition-colors" />
               </div>
               <div>
                 <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Principal Contact No <span className="text-rose-500">*</span></label>
                 <input value={createForm.principalPhone} onChange={e => setCreateForm({...createForm, principalPhone: e.target.value})} placeholder="+91 " className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-extrabold text-sm text-slate-900 outline-none focus:border-indigo-500 focus:bg-white transition-colors" />
               </div>
               <div>
                 <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Principal Login ID / Email <span className="text-rose-500">*</span></label>
                 <input value={createForm.principalEmail} onChange={e => setCreateForm({...createForm, principalEmail: e.target.value})} type="email" placeholder="principal@school.com" className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-extrabold text-sm text-slate-900 outline-none focus:border-indigo-500 focus:bg-white transition-colors" />
               </div>
               <div>
                 <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Login Password <span className="text-rose-500">*</span></label>
                 <input value={createForm.password} onChange={e => setCreateForm({...createForm, password: e.target.value})} type="password" placeholder="Create a strong password" className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-extrabold text-sm text-slate-900 outline-none focus:border-indigo-500 focus:bg-white transition-colors" />
                 <p className="text-[10px] text-slate-400 font-bold mt-1.5 uppercase tracking-widest">This password will be provided to the principal for first login.</p>
               </div>

               <div className="pt-4 flex gap-3">
                 <button 
                   onClick={() => setView('LIST')}
                   className="flex-1 bg-slate-100 text-slate-600 font-black text-xs uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform"
                 >
                    Cancel
                 </button>
                 <button 
                   onClick={() => { setSchools([...schools, { ...createForm, id: Date.now(), status: 'ACTIVE', students: 0, revenue: '0', totalFees: '0', totalExpense: '0'}]); setView('LIST'); }}
                   className="flex-1 flex items-center justify-center gap-2 bg-slate-900 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg"
                 >
                    <Building2 size={16} /> Save & Create
                 </button>
               </div>
             </AppCard>
           </div>
         )}`;


const SCHOOL_INFO_BLOCK = `             <div className="flex justify-between items-center">
               <SectionTitle title="School Information" />
               {!isEditingInfo ? (
                 <button 
                    onClick={() => {
                      setEditForm({...selectedSchool});
                      setIsEditingInfo(true);
                    }}
                    className="text-[10px] font-black uppercase tracking-widest text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-full active:scale-95 transition-transform"
                 >
                   Edit Info
                 </button>
               ) : (
                 <div className="flex gap-2">
                   <button 
                      onClick={() => setIsEditingInfo(false)}
                      className="text-[10px] font-black uppercase tracking-widest text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full active:scale-95 transition-transform"
                   >
                     Cancel
                   </button>
                   <button 
                      onClick={() => {
                        const updatedSchools = schools.map(s => s.id === selectedSchool.id ? editForm : s);
                        setSchools(updatedSchools);
                        setSelectedSchool(editForm);
                        setIsEditingInfo(false);
                      }}
                      className="text-[10px] font-black uppercase tracking-widest text-white bg-indigo-600 px-3 py-1.5 rounded-full active:scale-95 transition-transform shadow-sm"
                   >
                     Save Changes
                   </button>
                 </div>
               )}
             </div>
             
             {!isEditingInfo ? (
               <AppCard className="space-y-4 shadow-sm border border-slate-100 mb-6">
                  <div className="flex items-start gap-3 pb-4 border-b border-slate-100">
                    <div className="mt-0.5 bg-slate-100 p-2 rounded-full text-slate-500">
                      <Building2 size={16} />
                    </div>
                    <div>
                      <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Address & Location</h5>
                      <p className="text-sm font-bold text-slate-900">{selectedSchool.address}</p>
                      <p className="text-xs font-bold text-slate-500 mt-0.5">{selectedSchool.location}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 pb-4 border-b border-slate-100">
                    <div className="mt-0.5 bg-slate-100 p-2 rounded-full text-slate-500">
                      <Phone size={16} />
                    </div>
                    <div>
                      <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">School Contact</h5>
                      <p className="text-sm font-bold text-slate-900">{selectedSchool.phone || '+91 0000000000'}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 bg-slate-100 p-2 rounded-full text-slate-500">
                      <User size={16} />
                    </div>
                    <div>
                      <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Principal Details</h5>
                      <p className="text-sm font-bold text-slate-900">{selectedSchool.principalName}</p>
                      <p className="text-xs font-bold text-slate-500 mt-0.5">{selectedSchool.principalEmail} (Admin ID) • {selectedSchool.principalPhone}</p>
                    </div>
                  </div>
               </AppCard>
             ) : (
               <AppCard className="space-y-4 shadow-sm border border-slate-200 bg-slate-50 mb-6">
                 <div>
                   <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">School Name</label>
                   <input className="w-full border border-slate-200 bg-white rounded-xl px-4 py-2.5 text-sm font-bold outline-none" value={editForm.name || ''} onChange={e => setEditForm({...editForm, name: e.target.value})} />
                 </div>
                 <div className="grid grid-cols-2 gap-3">
                   <div>
                     <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">City / Location</label>
                     <input className="w-full border border-slate-200 bg-white rounded-xl px-4 py-2.5 text-sm font-bold outline-none" value={editForm.location || ''} onChange={e => setEditForm({...editForm, location: e.target.value})} />
                   </div>
                   <div>
                     <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">School Contact</label>
                     <input className="w-full border border-slate-200 bg-white rounded-xl px-4 py-2.5 text-sm font-bold outline-none" value={editForm.phone || ''} onChange={e => setEditForm({...editForm, phone: e.target.value})} />
                   </div>
                 </div>
                 <div>
                   <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Full Address</label>
                   <input className="w-full border border-slate-200 bg-white rounded-xl px-4 py-2.5 text-sm font-bold outline-none" value={editForm.address || ''} onChange={e => setEditForm({...editForm, address: e.target.value})} />
                 </div>
                 
                 <div className="pt-2 border-t border-slate-200">
                   <h4 className="text-xs font-black uppercase tracking-widest text-slate-700 mb-3">Principal Information</h4>
                   <div className="space-y-3">
                     <div>
                       <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Principal Name</label>
                       <input className="w-full border border-slate-200 bg-white rounded-xl px-4 py-2.5 text-sm font-bold outline-none" value={editForm.principalName || ''} onChange={e => setEditForm({...editForm, principalName: e.target.value})} />
                     </div>
                     <div className="grid grid-cols-2 gap-3">
                       <div>
                         <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 flex items-center justify-between">
                           Admin ID / Email
                         </label>
                         <input className="w-full border border-slate-200 bg-white rounded-xl px-4 py-2.5 text-sm font-bold outline-none" value={editForm.principalEmail || ''} onChange={e => setEditForm({...editForm, principalEmail: e.target.value})} />
                       </div>
                       <div>
                         <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Principal Contact No</label>
                         <input className="w-full border border-slate-200 bg-white rounded-xl px-4 py-2.5 text-sm font-bold outline-none" value={editForm.principalPhone || ''} onChange={e => setEditForm({...editForm, principalPhone: e.target.value})} />
                       </div>
                     </div>
                   </div>
                 </div>
               </AppCard>
             )}`;


// For DETAILS, I will find where it says {view === 'DETAILS' && selectedSchool && ( and extract everything up to {view === 'STUDENT_LIST'
let detailsIndex = c.indexOf("{view === 'DETAILS' && selectedSchool && (");
// Wait, is {view === 'STUDENT_LIST' preserved?
let studentListIndex = c.indexOf("{view === 'STUDENT_LIST' && selectedSection && (");

let detailsBlock = c.substring(detailsIndex, studentListIndex);

// Let's clean the details block to keep only Academic Year onwards
// But wait, it might contain the duplicated section. Let's just rebuild the details block!
let NEW_DETAILS_BLOCK = `{view === 'DETAILS' && selectedSchool && (
           <div className="space-y-6">

             ${SCHOOL_INFO_BLOCK}

             <div className="mb-4">
               <div className="flex justify-between items-center mb-3">
                 <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Academic Year</h4>
                 <select 
                   value={selectedAcademicYearIndex} 
                   onChange={(e) => setSelectedAcademicYearIndex(Number(e.target.value))}
                   className="bg-slate-100 text-slate-700 text-xs font-bold px-3 py-1.5 rounded-lg outline-none border border-slate-200"
                 >
                   {mockAcademicYears.map((ay, idx) => (
                     <option key={ay.year} value={idx}>{ay.year}</option>
                   ))}
                 </select>
               </div>
               
               <AppCard className="shadow-sm border border-slate-100 mb-6 bg-slate-50">
                 <div className="flex justify-between items-center pb-3 border-b border-slate-200 mb-3">
                   <div>
                     <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Duration</p>
                     <p className="text-xs font-bold text-slate-700 mt-0.5">{mockAcademicYears[selectedAcademicYearIndex].startDate} - {mockAcademicYears[selectedAcademicYearIndex].endDate}</p>
                   </div>
                 </div>
                 <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                   <div>
                     <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500">Total Students</p>
                     <p className="text-lg font-black text-indigo-900 mt-0.5">{mockAcademicYears[selectedAcademicYearIndex].students}</p>
                   </div>
                   <div>
                     <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Total Revenue</p>
                     <p className="text-lg font-black text-emerald-900 mt-0.5">₹{mockAcademicYears[selectedAcademicYearIndex].totalRevenue}</p>
                   </div>
                   <div>
                     <p className="text-[10px] font-black uppercase tracking-widest text-rose-500">Pending Fees</p>
                     <p className="text-lg font-black text-rose-900 mt-0.5">₹{mockAcademicYears[selectedAcademicYearIndex].pendingFees}</p>
                   </div>
                   <div>
                     <p className="text-[10px] font-black uppercase tracking-widest text-amber-500">Total Expenditure</p>
                     <p className="text-lg font-black text-amber-900 mt-0.5">₹{mockAcademicYears[selectedAcademicYearIndex].totalExpenditure}</p>
                   </div>
                 </div>
               </AppCard>
             </div>

             <SectionTitle title="Sections for Selected Academic Year" />
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
             </div>
           </div>
         )}
         
`;


let fileAfterDetails = c.substring(studentListIndex);

let newFileContent = fileUpToCreate + createBlock + '\n         \n' + NEW_DETAILS_BLOCK + '\n' + fileAfterDetails;

fs.writeFileSync('src/views/SchoolManager.tsx', newFileContent);
