import fs from 'fs';

let c = fs.readFileSync('src/views/SchoolManager.tsx', 'utf8');

const EDIT_BLOCK = `             <div className="flex justify-between items-center">
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
                           <span className="text-rose-500 bg-rose-50 px-1.5 py-0.5 rounded text-[8px]">Unchangeable</span>
                         </label>
                         <input className="w-full border border-slate-200 bg-slate-100 opacity-70 cursor-not-allowed rounded-xl px-4 py-2.5 text-sm font-bold outline-none" disabled value={editForm.principalEmail || ''} />
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

c = c.replace(/<SectionTitle title="School Information" \/>[\s\S]*?<\/AppCard>/, EDIT_BLOCK);

fs.writeFileSync('src/views/SchoolManager.tsx', c);
