import fs from 'fs';

let c = fs.readFileSync('src/views/SchoolManager.tsx', 'utf8');

c = c.replace(/const \[isEditingInfo, setIsEditingInfo\] = useState\(false\);/, `const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [createForm, setCreateForm] = useState<any>({ name: '', code: '', location: '', address: '', phone: '', principalName: '', principalPhone: '', principalEmail: '', password: '' });`);

// Wire up the CREATE form inputs
c = c.replace(/<input \s*placeholder="e.g. Apex International"\s*className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-extrabold text-sm text-slate-900 outline-none focus:border-indigo-500 focus:bg-white transition-colors" \s*\/>/m, 
`<input value={createForm.name} onChange={e => setCreateForm({...createForm, name: e.target.value})} placeholder="e.g. Apex International" className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-extrabold text-sm text-slate-900 outline-none focus:border-indigo-500 focus:bg-white transition-colors" />`);

c = c.replace(/<input \s*placeholder="e.g. APEX-01"\s*className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-extrabold text-sm text-slate-900 outline-none focus:border-indigo-500 focus:bg-white transition-colors" \s*\/>/m, 
`<input value={createForm.code} onChange={e => setCreateForm({...createForm, code: e.target.value})} placeholder="e.g. APEX-01" className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-extrabold text-sm text-slate-900 outline-none focus:border-indigo-500 focus:bg-white transition-colors" />`);

c = c.replace(/<input \s*placeholder="e.g. Pune"\s*className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-extrabold text-sm text-slate-900 outline-none focus:border-indigo-500 focus:bg-white transition-colors" \s*\/>/m, 
`<input value={createForm.location} onChange={e => setCreateForm({...createForm, location: e.target.value})} placeholder="e.g. Pune" className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-extrabold text-sm text-slate-900 outline-none focus:border-indigo-500 focus:bg-white transition-colors" />`);

c = c.replace(/<input \s*placeholder="\+91 "\s*className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-extrabold text-sm text-slate-900 outline-none focus:border-indigo-500 focus:bg-white transition-colors" \s*\/>/m, 
`<input value={createForm.phone} onChange={e => setCreateForm({...createForm, phone: e.target.value})} placeholder="+91 " className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-extrabold text-sm text-slate-900 outline-none focus:border-indigo-500 focus:bg-white transition-colors" />`);

c = c.replace(/<input \s*placeholder="e.g. Street, Area, Pincode"\s*className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-extrabold text-sm text-slate-900 outline-none focus:border-indigo-500 focus:bg-white transition-colors" \s*\/>/m, 
`<input value={createForm.address} onChange={e => setCreateForm({...createForm, address: e.target.value})} placeholder="e.g. Street, Area, Pincode" className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-extrabold text-sm text-slate-900 outline-none focus:border-indigo-500 focus:bg-white transition-colors" />`);

c = c.replace(/<input \s*placeholder="e.g. Dr. Rajesh Kumar"\s*className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-extrabold text-sm text-slate-900 outline-none focus:border-indigo-500 focus:bg-white transition-colors" \s*\/>/m, 
`<input value={createForm.principalName} onChange={e => setCreateForm({...createForm, principalName: e.target.value})} placeholder="e.g. Dr. Rajesh Kumar" className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-extrabold text-sm text-slate-900 outline-none focus:border-indigo-500 focus:bg-white transition-colors" />`);

c = c.replace(/<input \s*placeholder="\+91 "\s*className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-extrabold text-sm text-slate-900 outline-none focus:border-indigo-500 focus:bg-white transition-colors" \s*\/>/, 
`<input value={createForm.principalPhone} onChange={e => setCreateForm({...createForm, principalPhone: e.target.value})} placeholder="+91 " className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-extrabold text-sm text-slate-900 outline-none focus:border-indigo-500 focus:bg-white transition-colors" />`);

c = c.replace(/<input \s*type="email"\s*placeholder="principal@school.com"\s*className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-extrabold text-sm text-slate-900 outline-none focus:border-indigo-500 focus:bg-white transition-colors" \s*\/>/m, 
`<input value={createForm.principalEmail} onChange={e => setCreateForm({...createForm, principalEmail: e.target.value})} type="email" placeholder="principal@school.com" className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-extrabold text-sm text-slate-900 outline-none focus:border-indigo-500 focus:bg-white transition-colors" />`);

c = c.replace(/<input \s*type="password"\s*placeholder="Create a strong password"\s*className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-extrabold text-sm text-slate-900 outline-none focus:border-indigo-500 focus:bg-white transition-colors" \s*\/>/m, 
`<input value={createForm.password} onChange={e => setCreateForm({...createForm, password: e.target.value})} type="password" placeholder="Create a strong password" className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-extrabold text-sm text-slate-900 outline-none focus:border-indigo-500 focus:bg-white transition-colors" />`);

c = c.replace(/<button \s*className="flex-1 bg-slate-900 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl shadow-md active:scale-95 transition-transform"\s*>\s*Finish Onboarding\s*<\/button>/m, 
`<button onClick={() => { setSchools([...schools, { ...createForm, id: Date.now(), status: 'ACTIVE', students: 0, revenue: '0', totalFees: '0', totalExpense: '0'}]); setView('LIST'); }} className="flex-1 bg-slate-900 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl shadow-md active:scale-95 transition-transform">Finish Onboarding</button>`);

fs.writeFileSync('src/views/SchoolManager.tsx', c);
