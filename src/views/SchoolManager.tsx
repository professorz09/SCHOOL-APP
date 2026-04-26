import React, { useState } from 'react';
import { ArrowLeft, Building2, Plus, Search, MoreHorizontal, CheckCircle2, XCircle, ChevronRight, User, CalendarDays, MapPin, Phone } from 'lucide-react';
import { AppCard, SectionTitle } from '../components/SharedUI';

interface SchoolManagerProps {
  onClose: () => void;
}

export const SchoolManager: React.FC<SchoolManagerProps> = ({ onClose }) => {
  const [view, setView] = useState<'LIST' | 'CREATE' | 'DETAILS' | 'STUDENT_LIST' | 'STUDENT_PROFILE'>('LIST');
  const [selectedSchool, setSelectedSchool] = useState<any>(null);
  const [selectedSection, setSelectedSection] = useState<any>(null);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);

  const schools = [
    { id: 1, name: 'Delhi Public School', code: 'DPS-01', location: 'New Delhi', status: 'ACTIVE', students: 2400, revenue: '1.2L', totalFees: '1,20,00,000', totalExpense: '45,00,000' },
    { id: 2, name: 'Greenwood High', code: 'GWH-02', location: 'Bangalore', status: 'ACTIVE', students: 800, revenue: '40k', totalFees: '40,00,000', totalExpense: '12,00,000' },
    { id: 3, name: 'Sunrise Valley', code: 'SRV-03', location: 'Mumbai', status: 'INACTIVE', students: 1200, revenue: '60k', totalFees: '60,00,000', totalExpense: '18,00,000' },
  ];

  const mockAcademicYears = [
    {
      year: '2024-2025',
      sections: [
        { id: 'sec_1', name: 'Class 10-A', count: 45 },
        { id: 'sec_2', name: 'Class 10-B', count: 42 },
        { id: 'sec_3', name: 'Class 9-A', count: 38 },
      ]
    },
    {
      year: '2023-2024',
      sections: [
        { id: 'sec_4', name: 'Class 9-A', count: 44 },
        { id: 'sec_5', name: 'Class 9-B', count: 41 },
      ]
    }
  ];

  const mockStudents = [
    { 
      id: 1, name: 'Aarav Patel', rollNo: '101', attendance: '92%', grade: 'A', phone: '+91 9876543210', 
      parentName: 'Rajesh Patel', address: '123, Vasant Kunj, New Delhi', admissionDate: '2022-04-05', 
      feeStatus: 'Paid', feeHistory: [{ month: 'April 2024', amount: '₹4,500', status: 'Paid', date: '05 Apr' }, { month: 'May 2024', amount: '₹4,500', status: 'Paid', date: '02 May' }],
      dob: '12 Aug 2010', gender: 'Male', fatherName: 'Rajesh Patel', motherName: 'Smita Patel', 
      category: 'General', aadhaarNumber: 'XXXX-XXXX-1234', hasDocuments: true, image: 'https://i.pravatar.cc/150?u=1',
      isRte: false, stream: null
    },
    { 
      id: 2, name: 'Diya Sharma', rollNo: '102', attendance: '88%', grade: 'A+', phone: '+91 8765432109', 
      parentName: 'Sanjay Sharma', address: '45, Indiranagar, Bangalore', admissionDate: '2023-06-10', 
      feeStatus: 'Pending', feeHistory: [{ month: 'April 2024', amount: '₹4,500', status: 'Paid', date: '10 Apr' }, { month: 'May 2024', amount: '₹4,500', status: 'Pending', date: '-' }],
      dob: '25 Jan 2007', gender: 'Female', fatherName: 'Sanjay Sharma', motherName: 'Priya Sharma', 
      category: 'OBC', aadhaarNumber: 'XXXX-XXXX-5678', hasDocuments: true, image: 'https://i.pravatar.cc/150?u=2',
      isRte: true, stream: 'Science (PCM)'
    },
    { 
      id: 3, name: 'Rohan Gupta', rollNo: '103', attendance: '95%', grade: 'B+', phone: '+91 7654321098', 
      parentName: 'Amit Gupta', address: '8/2, Andheri West, Mumbai', admissionDate: '2024-03-20', 
      feeStatus: 'Paid', feeHistory: [{ month: 'April 2024', amount: '₹5,000', status: 'Paid', date: '01 Apr' }, { month: 'May 2024', amount: '₹5,000', status: 'Paid', date: '01 May' }],
      dob: '05 Nov 2008', gender: 'Male', fatherName: 'Amit Gupta', motherName: 'Neha Gupta', 
      category: 'General', aadhaarNumber: 'XXXX-XXXX-9012', hasDocuments: false, image: 'https://i.pravatar.cc/150?u=3',
      isRte: false, stream: 'Commerce'
    },
  ];

  const handleBack = () => {
    if (view === 'STUDENT_PROFILE') setView('STUDENT_LIST');
    else if (view === 'STUDENT_LIST') setView('DETAILS');
    else if (view === 'DETAILS') setView('LIST');
    else if (view === 'CREATE') setView('LIST');
    else onClose();
  };

  let title = 'Schools';
  if (view === 'DETAILS' && selectedSchool) title = selectedSchool.name;
  else if (view === 'STUDENT_LIST' && selectedSection) title = selectedSection.name;
  else if (view === 'STUDENT_PROFILE' && selectedStudent) title = selectedStudent.name;

  return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-bottom-8">
       {/* Header */}
       <div className="bg-white border-b border-slate-200 px-4 pt-12 pb-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
         <div className="flex items-center gap-3">
           <button 
             onClick={handleBack} 
             className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600 hover:bg-slate-200 transition-colors"
           >
             <ArrowLeft size={20} />
           </button>
           <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight truncate max-w-[200px]">
             {title}
           </h2>
         </div>
         {view === 'LIST' && (
           <button 
             onClick={() => setView('CREATE')}
             className="bg-slate-900 text-white p-2 rounded-full active:scale-95 transition-transform"
           >
             <Plus size={20} />
           </button>
         )}
       </div>

       <div className="flex-1 overflow-y-auto p-5 pb-24">
         {view === 'LIST' && (
           <>
             <div className="relative mb-6">
               <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
               <input 
                 placeholder="Search schools..." 
                 className="w-full bg-white border border-slate-200 rounded-2xl pl-12 pr-4 py-3.5 font-bold text-sm outline-none focus:border-indigo-500 transition-colors shadow-sm"
               />
             </div>

             <div className="space-y-4">
               {schools.map(school => (
                 <AppCard 
                   key={school.id} 
                   noPadding 
                   className="overflow-hidden hover:border-indigo-200 transition-colors cursor-pointer shadow-sm border border-slate-100 bg-white"
                   onClick={() => {
                     setSelectedSchool(school);
                     setView('DETAILS');
                   }}
                 >
                   <div className="p-5 flex justify-between items-start">
                     <div>
                       <div className="flex items-center gap-2 mb-1">
                         <h4 className="font-extrabold text-slate-900 text-base uppercase tracking-tight">{school.name}</h4>
                         {school.status === 'ACTIVE' ? (
                           <CheckCircle2 size={16} className="text-emerald-500" />
                         ) : (
                           <XCircle size={16} className="text-rose-500" />
                         )}
                       </div>
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{school.code} • {school.location}</p>
                       <div className="mt-3 flex flex-wrap gap-2">
                         <div className="inline-flex bg-slate-100 px-3 py-1 rounded-md text-[10px] font-black text-slate-600 uppercase tracking-widest border border-slate-200">
                           {school.students} Students
                         </div>
                         <div className="inline-flex bg-emerald-50 px-3 py-1 rounded-md text-[10px] font-black text-emerald-600 uppercase tracking-widest border border-emerald-100">
                           Fee: ₹{school.totalFees}
                         </div>
                         <div className="inline-flex bg-rose-50 px-3 py-1 rounded-md text-[10px] font-black text-rose-600 uppercase tracking-widest border border-rose-100">
                           Exp: ₹{school.totalExpense}
                         </div>
                       </div>
                     </div>
                     <button className="p-2 text-slate-400 hover:bg-slate-50 rounded-full">
                       <MoreHorizontal size={20} />
                     </button>
                   </div>
                 </AppCard>
               ))}
             </div>
           </>
         )}

         {view === 'CREATE' && (
           <div className="space-y-6">
             <SectionTitle title="Onboard New School" />
             <AppCard className="space-y-4 border-none shadow-md">
               <div>
                 <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">School Name <span className="text-rose-500">*</span></label>
                 <input 
                    placeholder="e.g. Apex International"
                    className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-extrabold text-sm text-slate-900 outline-none focus:border-indigo-500 focus:bg-white transition-colors" 
                 />
               </div>
               <div className="grid grid-cols-2 gap-4">
                 <div>
                   <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">School Code <span className="text-rose-500">*</span></label>
                   <input 
                      placeholder="e.g. APEX-01"
                      className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-extrabold text-sm text-slate-900 outline-none focus:border-indigo-500 focus:bg-white transition-colors" 
                   />
                 </div>
                 <div>
                   <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">City / Location <span className="text-rose-500">*</span></label>
                   <input 
                      placeholder="e.g. Pune"
                      className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-extrabold text-sm text-slate-900 outline-none focus:border-indigo-500 focus:bg-white transition-colors" 
                   />
                 </div>
               </div>

               <div className="mt-6 mb-2 flex items-center gap-2">
                 <div className="h-px bg-slate-200 flex-1"></div>
                 <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Principal Details (Mandatory)</span>
                 <div className="h-px bg-slate-200 flex-1"></div>
               </div>

               <div>
                 <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Principal Full Name <span className="text-rose-500">*</span></label>
                 <input 
                    placeholder="e.g. Dr. Rajesh Kumar"
                    className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-extrabold text-sm text-slate-900 outline-none focus:border-indigo-500 focus:bg-white transition-colors" 
                 />
               </div>
               <div>
                 <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Principal Login ID / Email <span className="text-rose-500">*</span></label>
                 <input 
                    type="email"
                    placeholder="principal@school.com"
                    className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-extrabold text-sm text-slate-900 outline-none focus:border-indigo-500 focus:bg-white transition-colors" 
                 />
               </div>
               <div>
                 <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Login Password <span className="text-rose-500">*</span></label>
                 <input 
                    type="password"
                    placeholder="Create a strong password"
                    className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-extrabold text-sm text-slate-900 outline-none focus:border-indigo-500 focus:bg-white transition-colors" 
                 />
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
                   onClick={() => setView('LIST')}
                   className="flex-1 flex items-center justify-center gap-2 bg-slate-900 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg"
                 >
                    <Building2 size={16} /> Save & Create
                 </button>
               </div>
             </AppCard>
           </div>
         )}
         
         {view === 'DETAILS' && selectedSchool && (
           <div className="space-y-6">
             <div className="grid grid-cols-2 gap-4">
               <AppCard className="!p-5 bg-indigo-50 border-indigo-100">
                 <h4 className="text-indigo-600 font-bold text-[10px] uppercase tracking-widest mb-1">Total Students</h4>
                 <div className="text-2xl font-black text-indigo-900">{selectedSchool.students}</div>
               </AppCard>
               <AppCard className="!p-5 bg-emerald-50 border-emerald-100">
                 <h4 className="text-emerald-600 font-bold text-[10px] uppercase tracking-widest mb-1">MRR</h4>
                 <div className="text-2xl font-black text-emerald-900">₹{selectedSchool.revenue}</div>
               </AppCard>
             </div>

             <SectionTitle title="Revenue Details" />
             <AppCard className="space-y-4 shadow-sm border border-slate-100">
               <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                 <span className="text-sm font-bold text-slate-500">Subscription Plan</span>
                 <span className="text-sm font-black text-slate-900">Premium ({selectedSchool.students} Seats)</span>
               </div>
               <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                 <span className="text-sm font-bold text-slate-500">Monthly Recurring Revenue</span>
                 <span className="text-sm font-black text-emerald-600">₹{selectedSchool.revenue}</span>
               </div>
               <div className="flex justify-between items-center">
                 <span className="text-sm font-bold text-slate-500">Last Invoice Status</span>
                 <span className="text-[10px] font-black bg-emerald-100 text-emerald-700 px-2 py-1 rounded uppercase tracking-widest">Paid</span>
               </div>
             </AppCard>

             <SectionTitle title="Academic Years & Sections" />
             {mockAcademicYears.map(ay => (
               <div key={ay.year} className="mb-4">
                 <div className="flex items-center gap-2 mb-2 pl-2 text-slate-500">
                   <CalendarDays size={14} />
                   <h5 className="text-xs font-black uppercase tracking-widest">{ay.year}</h5>
                 </div>
                 <AppCard noPadding className="shadow-sm border border-slate-100 mb-4">
                   <div className="divide-y divide-slate-100">
                     {ay.sections.map((section, i) => (
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
                         <div className="flex items-center gap-3">
                           <span className="font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full text-xs">
                             {section.count} Students
                           </span>
                           <ChevronRight size={16} className="text-slate-400" />
                         </div>
                       </div>
                     ))}
                   </div>
                 </AppCard>
               </div>
             ))}
           </div>
         )}

         {view === 'STUDENT_LIST' && selectedSection && (
           <div className="space-y-4">
             {mockStudents.map(student => (
               <AppCard 
                 key={student.id} 
                 noPadding 
                 onClick={() => { setSelectedStudent(student); setView('STUDENT_PROFILE'); }}
                 className="p-4 flex justify-between items-center cursor-pointer hover:border-indigo-200 transition-colors shadow-sm border border-slate-100"
               >
                 <div className="flex items-center gap-3">
                   <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-black">
                     {student.name.charAt(0)}
                   </div>
                   <div>
                     <h4 className="font-extrabold text-slate-900 text-sm uppercase tracking-tight">{student.name}</h4>
                     <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Roll: {student.rollNo}</p>
                   </div>
                 </div>
                 <ChevronRight size={20} className="text-slate-400" />
               </AppCard>
             ))}
           </div>
         )}

         {view === 'STUDENT_PROFILE' && selectedStudent && (
           <div className="space-y-6">
             <AppCard className="text-center shadow-lg border-none bg-gradient-to-br from-indigo-500 to-indigo-600 text-white relative">
               {selectedStudent.isRte && (
                 <div className="absolute top-4 right-4 bg-emerald-400 text-white text-[10px] uppercase font-black px-2 py-1 rounded shadow-sm">
                   RTE Student
                 </div>
               )}
               <div className="w-24 h-24 bg-white text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4 object-cover shadow-sm border-4 border-indigo-400/30 overflow-hidden">
                 {selectedStudent.image ? (
                   <img src={selectedStudent.image} alt={selectedStudent.name} className="w-full h-full object-cover" />
                 ) : (
                   <User size={32} />
                 )}
               </div>
               <h3 className="font-black text-xl uppercase tracking-tight">{selectedStudent.name}</h3>
               <p className="text-xs font-bold text-indigo-100 uppercase tracking-widest mt-1">
                 {selectedSchool?.name} • {selectedSection?.name}
                 {selectedStudent.stream ? ` • ${selectedStudent.stream}` : ''}
               </p>
             </AppCard>

             <div className="grid grid-cols-3 gap-4">
               <AppCard className="!p-4 text-center shadow-sm border border-slate-100">
                 <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Roll No</h4>
                 <div className="text-lg font-black text-slate-900">{selectedStudent.rollNo}</div>
               </AppCard>
               <AppCard className="!p-4 text-center shadow-sm border border-slate-100">
                 <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Attendance</h4>
                 <div className="text-lg font-black text-emerald-600">{selectedStudent.attendance}</div>
               </AppCard>
               <AppCard className="!p-4 text-center shadow-sm border border-slate-100">
                 <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Grade</h4>
                 <div className="text-lg font-black text-indigo-600">{selectedStudent.grade}</div>
               </AppCard>
             </div>

             <SectionTitle title="Personal Information" />
             <AppCard className="space-y-4 shadow-sm border border-slate-100">
               <div className="grid grid-cols-2 gap-4 pb-4 border-b border-slate-100">
                 <div>
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Date of Birth</p>
                   <p className="text-sm font-bold text-slate-900 mt-0.5">{selectedStudent.dob}</p>
                 </div>
                 <div>
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Gender</p>
                   <p className="text-sm font-bold text-slate-900 mt-0.5">{selectedStudent.gender}</p>
                 </div>
               </div>
               <div className="grid grid-cols-2 gap-4 pb-4 border-b border-slate-100">
                 <div>
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Category</p>
                   <p className="text-sm font-bold text-slate-900 mt-0.5">{selectedStudent.category}</p>
                 </div>
                 <div>
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Aadhaar Number</p>
                   <p className="text-sm font-bold text-slate-900 mt-0.5">{selectedStudent.aadhaarNumber}</p>
                 </div>
               </div>
               <div className="grid grid-cols-2 gap-4 pb-4 border-b border-slate-100">
                 <div>
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Father's Name</p>
                   <p className="text-sm font-bold text-slate-900 mt-0.5">{selectedStudent.fatherName}</p>
                 </div>
                 <div>
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Mother's Name</p>
                   <p className="text-sm font-bold text-slate-900 mt-0.5">{selectedStudent.motherName}</p>
                 </div>
               </div>
               <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                 <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500"><Phone size={16} /></div>
                 <div>
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Primary Contact</p>
                   <p className="text-sm font-bold text-slate-900">{selectedStudent.phone}</p>
                 </div>
               </div>
               <div className="flex items-center gap-3">
                 <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500"><MapPin size={16} /></div>
                 <div>
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Address</p>
                   <p className="text-sm font-bold text-slate-900">{selectedStudent.address}</p>
                 </div>
               </div>
             </AppCard>

             <SectionTitle title="Admission Details" />
             <AppCard className="space-y-4 shadow-sm border border-slate-100">
               <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                 <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500"><CalendarDays size={16} /></div>
                 <div>
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Admission Date</p>
                   <p className="text-sm font-bold text-slate-900">{selectedStudent.admissionDate}</p>
                 </div>
               </div>
               <div className="flex items-center justify-between">
                 <div>
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Documents Uploaded</p>
                   <p className="text-sm font-bold text-slate-900 mt-0.5">
                     {selectedStudent.hasDocuments ? 'Birth Certificate, Aadhaar Card' : 'Pending'}
                   </p>
                 </div>
                 {selectedStudent.hasDocuments ? (
                    <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-1 rounded font-black uppercase tracking-widest">Verified</span>
                 ) : (
                    <span className="text-[10px] bg-rose-100 text-rose-700 px-2 py-1 rounded font-black uppercase tracking-widest">Missing</span>
                 )}
               </div>
             </AppCard>

             <SectionTitle title="Fee History" />
             <AppCard noPadding className="shadow-sm border border-slate-100 overflow-hidden">
               <div className="divide-y divide-slate-100">
                 {selectedStudent.feeHistory.map((fee: any, idx: number) => (
                   <div key={idx} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                     <div>
                       <p className="text-sm font-bold text-slate-900">{fee.month}</p>
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Date: {fee.date}</p>
                     </div>
                     <div className="text-right">
                       <p className="text-sm font-black text-slate-900">{fee.amount}</p>
                       <p className={`text-[10px] font-black uppercase tracking-widest mt-1 ${fee.status === 'Paid' ? 'text-emerald-600' : 'text-rose-500'}`}>
                         {fee.status}
                       </p>
                     </div>
                   </div>
                 ))}
               </div>
             </AppCard>
           </div>
         )}
       </div>
    </div>
  );
};
