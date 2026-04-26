import fs from 'fs';

let c = fs.readFileSync('src/views/SchoolManager.tsx', 'utf8');

const DETAILS_TOP_REGEX = /\{view === 'DETAILS' && selectedSchool && \([\s\S]*?<div className="grid grid-cols-2 gap-4">\s*<AppCard className="!p-5 bg-indigo-50 border-indigo-100">\s*<h4 className="text-indigo-600 font-bold text-\[10px\] uppercase tracking-widest mb-1">Total Students<\/h4>\s*<div className="text-2xl font-black text-indigo-900">\{selectedSchool\.students\}<\/div>\s*<\/AppCard>\s*<AppCard className="!p-5 bg-emerald-50 border-emerald-100">\s*<h4 className="text-emerald-600 font-bold text-\[10px\] uppercase tracking-widest mb-1">MRR<\/h4>\s*<div className="text-2xl font-black text-emerald-900">₹\{selectedSchool\.revenue\}<\/div>\s*<\/AppCard>\s*<\/div>/m;

const REPLACEMENT = `{view === 'DETAILS' && selectedSchool && (
           <div className="space-y-6">
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
                 <div className="grid grid-cols-2 gap-4">
                   <div>
                     <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500">Total Students</p>
                     <p className="text-lg font-black text-indigo-900 mt-0.5">{mockAcademicYears[selectedAcademicYearIndex].students}</p>
                   </div>
                   <div>
                     <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500">MRR</p>
                     <p className="text-lg font-black text-emerald-900 mt-0.5">₹{mockAcademicYears[selectedAcademicYearIndex].mrr}</p>
                   </div>
                 </div>
               </AppCard>
             </div>`;

c = c.replace(DETAILS_TOP_REGEX, REPLACEMENT);

fs.writeFileSync('src/views/SchoolManager.tsx', c);
