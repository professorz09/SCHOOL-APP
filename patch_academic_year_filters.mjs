import fs from 'fs';

let c = fs.readFileSync('src/views/PrincipalFeatureView.tsx', 'utf8');

c = c.replace(
  "const [studentTab, setStudentTab] = useState<'INFO' | 'RESULTS' | 'FEES' | 'COMPLAINTS'>('INFO');",
  "const [studentTab, setStudentTab] = useState<'INFO' | 'RESULTS' | 'FEES' | 'COMPLAINTS'>('INFO');\n  const [selectedProfileYear, setSelectedProfileYear] = useState('2024-25');"
);

c = c.replace(
  `  const mockResults = [
    { term: 'Term 1 Exam', maths: '85/100', science: '90/100', english: '78/100', total: '84.3%' },
    { term: 'Half Yearly', maths: '88/100', science: '92/100', english: '80/100', total: '86.6%' }
  ];`,
  `  const mockResults = [
    { year: '2023-24', term: 'Term 1 Exam', maths: '85/100', science: '90/100', english: '78/100', total: '84.3%' },
    { year: '2023-24', term: 'Half Yearly', maths: '88/100', science: '92/100', english: '80/100', total: '86.6%' },
    { year: '2024-25', term: 'Term 1 Exam', maths: '90/100', science: '95/100', english: '85/100', total: '90.0%' }
  ];`
);

c = c.replace(
  `  const mockComplaints = [
    { date: '12 Oct 2023', subject: 'Late Arrival', remark: 'Arrived after assembly 3 times this month', reportedBy: 'Class Teacher' },
    { date: '05 Jan 2024', subject: 'Incomplete Homework', remark: 'Math homework not submitted', reportedBy: 'Subject Teacher' }
  ];`,
  `  const mockComplaints = [
    { year: '2023-24', date: '12 Oct 2023', subject: 'Late Arrival', remark: 'Arrived after assembly 3 times this month', reportedBy: 'Class Teacher' },
    { year: '2023-24', date: '05 Jan 2024', subject: 'Incomplete Homework', remark: 'Math homework not submitted', reportedBy: 'Subject Teacher' },
    { year: '2024-25', date: '15 Aug 2024', subject: 'Talking in class', remark: 'Disturbing others during lecture', reportedBy: 'Science Teacher' }
  ];`
);

c = c.replace(
  `                 {/* Student Tabs */}
                 <div className="flex overflow-x-auto hide-scrollbar gap-2 sticky top-[72px] z-20 bg-slate-50 py-2">
                   {(['INFO', 'RESULTS', 'FEES', 'COMPLAINTS'] as const).map(tab => (
                     <button
                       key={tab}
                       onClick={() => setStudentTab(tab)}
                       className={\`px-4 py-2 rounded-full font-black text-xs uppercase tracking-widest whitespace-nowrap transition-colors \${studentTab === tab ? 'bg-indigo-600 text-white shadow-md' : 'bg-white text-slate-500 border border-slate-200'}\`}
                     >
                       {tab.charAt(0) + tab.slice(1).toLowerCase()}
                     </button>
                   ))}
                 </div>`,
  `                 {/* Student Tabs */}
                 <div className="flex overflow-x-auto hide-scrollbar gap-2 sticky top-[72px] z-20 bg-slate-50 py-2">
                   {(['INFO', 'RESULTS', 'FEES', 'COMPLAINTS'] as const).map(tab => (
                     <button
                       key={tab}
                       onClick={() => setStudentTab(tab)}
                       className={\`px-4 py-2 rounded-full font-black text-xs uppercase tracking-widest whitespace-nowrap transition-colors \${studentTab === tab ? 'bg-indigo-600 text-white shadow-md' : 'bg-white text-slate-500 border border-slate-200'}\`}
                     >
                       {tab.charAt(0) + tab.slice(1).toLowerCase()}
                     </button>
                   ))}
                 </div>

                 {studentTab !== 'INFO' && (
                    <div className="flex flex-row justify-end mb-3 mt-1">
                      <select 
                         value={selectedProfileYear}
                         onChange={(e) => setSelectedProfileYear(e.target.value)}
                         className="bg-white border text-xs font-bold border-slate-200 rounded-full px-4 py-2 outline-none text-slate-700 shadow-sm"
                      >
                        <option value="2024-25">2024-25</option>
                        <option value="2023-24">2023-24</option>
                      </select>
                    </div>
                 )}`
);

c = c.replace(
  `                 {studentTab === 'RESULTS' && (
                    <div className="space-y-4 animate-in fade-in">
                       {mockResults.map((res, i) => (`,
  `                 {studentTab === 'RESULTS' && (
                    <div className="space-y-4 animate-in fade-in">
                       {mockResults.filter(r => r.year === selectedProfileYear).map((res, i) => (`
);

c = c.replace(
  `                       <div className="flex items-center gap-2 mb-2">
                         <select className="bg-white border text-sm font-bold border-slate-200 rounded-lg px-3 py-2 outline-none text-slate-700 shadow-sm">
                           <option>2023-24</option>
                           <option>2024-25</option>
                         </select>
                       </div>
                       <AppCard noPadding className="shadow-sm border border-slate-100 divide-y divide-slate-100">
                          {mockFees.map((fee, i) => (`,
  `                       <AppCard noPadding className="shadow-sm border border-slate-100 divide-y divide-slate-100">
                          {mockFees.filter(f => f.year === selectedProfileYear).map((fee, i) => (`
);

c = c.replace(
  `                 {studentTab === 'COMPLAINTS' && (
                    <div className="space-y-3 animate-in fade-in">
                       {mockComplaints.map((comp, i) => (`,
  `                 {studentTab === 'COMPLAINTS' && (
                    <div className="space-y-3 animate-in fade-in">
                       {mockComplaints.filter(c => c.year === selectedProfileProfileYear || c.year === selectedProfileYear).map((comp, i) => (`
);


fs.writeFileSync('src/views/PrincipalFeatureView.tsx', c);
