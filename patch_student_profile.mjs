import fs from 'fs';

let c = fs.readFileSync('src/views/PrincipalFeatureView.tsx', 'utf8');

// Update imports
c = c.replace(
  "import { ArrowLeft, Users, UserCheck, BookOpen, Receipt, Bus, CircleAlert, Wallet, ChevronRight, CheckCircle2, Search, User, MapPin, Phone, CalendarDays } from 'lucide-react';",
  "import { ArrowLeft, Users, UserCheck, BookOpen, Receipt, Bus, CircleAlert, Wallet, ChevronRight, CheckCircle2, Search, User, MapPin, Phone, CalendarDays, IdCard, Droplet, FileText, Award, CreditCard, Activity } from 'lucide-react';"
);

// Add student tab state
c = c.replace(
  "const [searchQuery, setSearchQuery] = useState('');",
  "const [searchQuery, setSearchQuery] = useState('');\\n  const [studentTab, setStudentTab] = useState<'INFO' | 'RESULTS' | 'FEES' | 'COMPLAINTS'>('INFO');"
);

// Update getStudentsMock
const OLD_MOCK = `  const getStudentsMock = (sectionName: string) => {
     return [
       { id: 1, name: 'Aarav Sharma', cls: sectionName, roll: '01', status: 'Present', phone: '+91 9876543210', attendance: '92%', grade: 'A', parent: 'Rakesh Sharma', address: 'Block C, Vasant Vihar' },
       { id: 2, name: 'Isha Patel', cls: sectionName, roll: '02', status: 'Absent', phone: '+91 8765432109', attendance: '85%', grade: 'B+', parent: 'Suresh Patel', address: 'Sector 4, Dwarka' },
       { id: 3, name: 'Rohan Gupta', cls: sectionName, roll: '03', status: 'Present', phone: '+91 7654321098', attendance: '98%', grade: 'A+', parent: 'Mukesh Gupta', address: 'GK-1, New Delhi' },
       { id: 4, name: 'Ananya Singh', cls: sectionName, roll: '04', status: 'Present', phone: '+91 6543210987', attendance: '88%', grade: 'B', parent: 'Vikram Singh', address: 'Lajpat Nagar' },
     ];
  };`;

const NEW_MOCK = `  const getStudentsMock = (sectionName: string) => {
     return [
       { id: 1, name: 'Aarav Sharma', cls: sectionName, roll: '01', status: 'Present', phone: '+91 9876543210', attendance: '92%', grade: 'A', fatherName: 'Rakesh Sharma', motherName: 'Sunita Sharma', fatherMob: '+91 9876543210', address: 'Block C, Vasant Vihar, New Delhi', rte: 'No', aadhaar: 'xxxx-xxxx-1234', bloodGroup: 'O+', admissionNo: 'AD/2021/045', docs: ['Birth Certificate', 'Transfer Certificate', 'Aadhaar Card'] },
       { id: 2, name: 'Isha Patel', cls: sectionName, roll: '02', status: 'Absent', phone: '+91 8765432109', attendance: '85%', grade: 'B+', fatherName: 'Suresh Patel', motherName: 'Kavita Patel', fatherMob: '+91 8765432109', address: 'Sector 4, Dwarka, New Delhi', rte: 'Yes', aadhaar: 'xxxx-xxxx-5678', bloodGroup: 'B+', admissionNo: 'AD/2022/112', docs: ['Birth Certificate', 'Aadhaar Card'] },
       { id: 3, name: 'Rohan Gupta', cls: sectionName, roll: '03', status: 'Present', phone: '+91 7654321098', attendance: '98%', grade: 'A+', fatherName: 'Mukesh Gupta', motherName: 'Neha Gupta', fatherMob: '+91 7654321098', address: 'GK-1, New Delhi', rte: 'No', aadhaar: 'xxxx-xxxx-9012', bloodGroup: 'A-', admissionNo: 'AD/2020/003', docs: ['Birth Certificate', 'Previous Marksheet', 'Aadhaar Card', 'Medical Certificate'] },
       { id: 4, name: 'Ananya Singh', cls: sectionName, roll: '04', status: 'Present', phone: '+91 6543210987', attendance: '88%', grade: 'B', fatherName: 'Vikram Singh', motherName: 'Priya Singh', fatherMob: '+91 6543210987', address: 'Lajpat Nagar, New Delhi', rte: 'No', aadhaar: 'xxxx-xxxx-3456', bloodGroup: 'AB+', admissionNo: 'AD/2021/078', docs: ['Birth Certificate', 'Transfer Certificate'] },
     ];
  };

  const mockResults = [
    { term: 'Term 1 Exam', maths: '85/100', science: '90/100', english: '78/100', total: '84.3%' },
    { term: 'Half Yearly', maths: '88/100', science: '92/100', english: '80/100', total: '86.6%' }
  ];

  const mockFees = [
    { year: '2023-24', term: 'Term 1', amount: '12,500', status: 'Paid', date: '05 Apr 2023' },
    { year: '2023-24', term: 'Term 2', amount: '12,500', status: 'Paid', date: '08 Sep 2023' },
    { year: '2024-25', term: 'Term 1', amount: '13,000', status: 'Pending', date: '-' }
  ];

  const mockComplaints = [
    { date: '12 Oct 2023', subject: 'Late Arrival', remark: 'Arrived after assembly 3 times this month', reportedBy: 'Class Teacher' },
    { date: '05 Jan 2024', subject: 'Incomplete Homework', remark: 'Math homework not submitted', reportedBy: 'Subject Teacher' }
  ];
`;

c = c.replace(OLD_MOCK, NEW_MOCK);

// Update PROFILE View

const OLD_PROFILE = `             {studentView === 'PROFILE' && selectedStudent && (
               <div className="space-y-4 animate-in fade-in">
                 <AppCard className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-sm border-0 relative overflow-hidden">
                   <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mt-10 -mr-10" />
                   <div className="flex items-center gap-4 relative z-10">
                     <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center font-black text-2xl text-white backdrop-blur-sm border border-white/20">
                       {selectedStudent.name.charAt(0)}
                     </div>
                     <div>
                       <h3 className="font-black text-xl">{selectedStudent.name}</h3>
                       <p className="font-bold text-indigo-100 text-xs uppercase tracking-widest mt-1">Class {selectedStudent.cls} • Roll {selectedStudent.roll}</p>
                     </div>
                   </div>
                 </AppCard>
                 
                 <AppCard noPadding className="shadow-sm border border-slate-100">
                   <div className="divide-y divide-slate-100">
                     <div className="p-4 flex items-center gap-3">
                       <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400">
                         <User size={16} />
                       </div>
                       <div className="flex-1">
                         <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Parent Name</p>
                         <p className="font-bold text-slate-700 text-sm">{selectedStudent.parent}</p>
                       </div>
                     </div>
                     <div className="p-4 flex items-center gap-3">
                       <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400">
                         <Phone size={16} />
                       </div>
                       <div className="flex-1">
                         <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Contact Phone</p>
                         <p className="font-bold text-slate-700 text-sm">{selectedStudent.phone}</p>
                       </div>
                     </div>
                     <div className="p-4 flex items-center gap-3">
                       <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400">
                         <MapPin size={16} />
                       </div>
                       <div className="flex-1">
                         <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Address</p>
                         <p className="font-bold text-slate-700 text-sm">{selectedStudent.address}</p>
                       </div>
                     </div>
                     <div className="p-4 flex items-center gap-3">
                       <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400">
                         <CalendarDays size={16} />
                       </div>
                       <div className="flex-1">
                         <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Attendance YTD</p>
                         <p className="font-bold text-slate-700 text-sm">{selectedStudent.attendance}</p>
                       </div>
                     </div>
                   </div>
                 </AppCard>
               </div>
             )}`;

const NEW_PROFILE = `             {studentView === 'PROFILE' && selectedStudent && (
               <div className="space-y-4 animate-in fade-in pb-10">
                 <AppCard className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-sm border-0 relative overflow-hidden">
                   <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mt-10 -mr-10" />
                   <div className="flex items-center justify-between relative z-10">
                     <div className="flex items-center gap-4">
                       <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center font-black text-2xl text-white backdrop-blur-sm border border-white/20">
                         {selectedStudent.name.charAt(0)}
                       </div>
                       <div>
                         <h3 className="font-black text-xl">{selectedStudent.name}</h3>
                         <p className="font-bold text-indigo-100 text-xs uppercase tracking-widest mt-1">Class {selectedStudent.cls} • Roll {selectedStudent.roll}</p>
                       </div>
                     </div>
                     <div className="text-right">
                        <span className="font-black text-indigo-800 bg-white shadow-sm px-2.5 py-1 rounded-full text-[10px] uppercase tracking-widest whitespace-nowrap">Admn: {selectedStudent.admissionNo}</span>
                     </div>
                   </div>
                 </AppCard>
                 
                 {/* Student Tabs */}
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

                 {studentTab === 'INFO' && (
                 <AppCard noPadding className="shadow-sm border border-slate-100 mb-4">
                   <div className="divide-y divide-slate-100">
                     {/* Basic Contacts */}
                     <div className="p-4 grid grid-cols-2 gap-4">
                       <div>
                         <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Phone size={12}/> Student Phone</p>
                         <p className="font-bold text-slate-700 text-sm mt-0.5">{selectedStudent.phone}</p>
                       </div>
                       <div>
                         <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Droplet size={12}/> Blood Group</p>
                         <p className="font-bold text-rose-600 text-sm mt-0.5">{selectedStudent.bloodGroup}</p>
                       </div>
                     </div>
                     
                     <div className="p-4">
                       <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><MapPin size={12}/> Address</p>
                       <p className="font-bold text-slate-700 text-sm mt-0.5">{selectedStudent.address}</p>
                     </div>

                     {/* Parents */}
                     <div className="p-4 grid grid-cols-2 gap-4">
                       <div>
                         <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><User size={12}/> Father's Name</p>
                         <p className="font-bold text-slate-700 text-sm mt-0.5">{selectedStudent.fatherName}</p>
                       </div>
                       <div>
                         <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><User size={12}/> Mother's Name</p>
                         <p className="font-bold text-slate-700 text-sm mt-0.5">{selectedStudent.motherName}</p>
                       </div>
                       <div>
                         <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Phone size={12}/> Father Mobile</p>
                         <p className="font-bold text-slate-700 text-sm mt-0.5">{selectedStudent.fatherMob}</p>
                       </div>
                     </div>

                     {/* Official Info */}
                     <div className="p-4 grid grid-cols-2 gap-4 bg-slate-50/50">
                       <div>
                         <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><IdCard size={12}/> Aadhaar No</p>
                         <p className="font-bold text-slate-700 text-sm mt-0.5">{selectedStudent.aadhaar}</p>
                       </div>
                       <div>
                         <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Activity size={12}/> RTE Applied</p>
                         <span className={\`inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest \${selectedStudent.rte === 'Yes' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}\`}>{selectedStudent.rte}</span>
                       </div>
                     </div>

                     {/* Documents */}
                     <div className="p-4">
                       <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-2"><FileText size={12}/> Uploaded Documents</p>
                       <div className="flex flex-wrap gap-2">
                         {selectedStudent.docs.map((doc: string, idx: number) => (
                           <div key={idx} className="bg-indigo-50 border border-indigo-100 text-indigo-700 px-3 py-1.5 rounded flex items-center gap-2">
                             <CheckCircle2 size={14} className="text-indigo-500" />
                             <span className="text-xs font-bold">{doc}</span>
                           </div>
                         ))}
                       </div>
                     </div>

                   </div>
                 </AppCard>
                 )}

                 {studentTab === 'RESULTS' && (
                    <div className="space-y-4 animate-in fade-in">
                       {mockResults.map((res, i) => (
                         <AppCard key={i} noPadding className="shadow-sm border border-slate-100 divide-y divide-slate-100">
                           <div className="p-4 bg-slate-50 flex items-center justify-between">
                              <h4 className="font-extrabold text-slate-800 text-sm flex items-center gap-2">
                                <Award size={16} className="text-purple-500"/> {res.term}
                              </h4>
                              <span className="font-black text-indigo-600 bg-indigo-100 px-2 py-1 rounded text-xs">Total: {res.total}</span>
                           </div>
                           <div className="p-4 grid grid-cols-3 gap-2 text-center">
                             <div>
                               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Maths</p>
                               <p className="font-bold text-slate-700 text-sm mt-1">{res.maths}</p>
                             </div>
                             <div>
                               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Science</p>
                               <p className="font-bold text-slate-700 text-sm mt-1">{res.science}</p>
                             </div>
                             <div>
                               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">English</p>
                               <p className="font-bold text-slate-700 text-sm mt-1">{res.english}</p>
                             </div>
                           </div>
                         </AppCard>
                       ))}
                    </div>
                 )}

                 {studentTab === 'FEES' && (
                    <div className="space-y-4 animate-in fade-in">
                       <div className="flex items-center gap-2 mb-2">
                         <select className="bg-white border text-sm font-bold border-slate-200 rounded-lg px-3 py-2 outline-none text-slate-700 shadow-sm">
                           <option>2023-24</option>
                           <option>2024-25</option>
                         </select>
                       </div>
                       <AppCard noPadding className="shadow-sm border border-slate-100 divide-y divide-slate-100">
                          {mockFees.map((fee, i) => (
                            <div key={i} className="p-4 flex items-center justify-between">
                               <div>
                                  <h4 className="font-extrabold text-slate-800 text-sm">{fee.term}</h4>
                                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{fee.year} • {fee.date}</p>
                               </div>
                               <div className="flex flex-col items-end gap-1">
                                  <span className="font-black text-slate-700 text-sm">₹{fee.amount}</span>
                                  <span className={\`font-black px-2 py-0.5 rounded text-[10px] uppercase tracking-widest \${fee.status === 'Paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}\`}>
                                    {fee.status}
                                  </span>
                               </div>
                            </div>
                          ))}
                       </AppCard>
                    </div>
                 )}

                 {studentTab === 'COMPLAINTS' && (
                    <div className="space-y-3 animate-in fade-in">
                       {mockComplaints.map((comp, i) => (
                         <AppCard key={i} className="shadow-sm border border-slate-100 bg-white">
                            <div className="flex items-start gap-3">
                               <div className="mt-1 bg-amber-100 text-amber-600 p-1.5 rounded-full">
                                 <AlertCircle size={16} />
                               </div>
                               <div>
                                  <div className="flex items-center justify-between mb-1">
                                    <h4 className="font-extrabold text-slate-800 text-sm">{comp.subject}</h4>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{comp.date}</span>
                                  </div>
                                  <p className="text-sm text-slate-600 font-medium">{comp.remark}</p>
                                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2 block">Reported By: {comp.reportedBy}</p>
                               </div>
                            </div>
                         </AppCard>
                       ))}
                       {mockComplaints.length === 0 && (
                          <div className="text-center py-10 text-slate-400 font-bold text-sm">
                            No complaints recorded yet.
                          </div>
                       )}
                    </div>
                 )}

               </div>
             )}`;

c = c.replace(OLD_PROFILE, NEW_PROFILE);

// Add AlertCircle to imports
c = c.replace(
  "import { ArrowLeft, Users, UserCheck, BookOpen, Receipt, Bus, CircleAlert, Wallet, ChevronRight, CheckCircle2, Search, User, MapPin, Phone, CalendarDays, IdCard, Droplet, FileText, Award, CreditCard, Activity } from 'lucide-react';",
  "import { ArrowLeft, Users, UserCheck, BookOpen, Receipt, Bus, CircleAlert, Wallet, ChevronRight, CheckCircle2, Search, User, MapPin, Phone, CalendarDays, IdCard, Droplet, FileText, Award, CreditCard, Activity, AlertCircle } from 'lucide-react';"
);

fs.writeFileSync('src/views/PrincipalFeatureView.tsx', c);
