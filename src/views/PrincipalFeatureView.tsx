import React, { useState } from 'react';
import { ArrowLeft, Users, UserCheck, BookOpen, Receipt, Bus, CircleAlert, Wallet, ChevronRight, CheckCircle2, Search, User, MapPin, Phone, CalendarDays } from 'lucide-react';
import { AppCard, SectionTitle } from '../components/SharedUI';

interface PrincipalFeatureViewProps {
  feature: string;
  onClose: () => void;
}

export const PrincipalFeatureView: React.FC<PrincipalFeatureViewProps> = ({ feature, onClose }) => {
  const [studentView, setStudentView] = useState<'CLASSES' | 'SECTIONS' | 'STUDENTS' | 'PROFILE'>('CLASSES');
  const [selectedClass, setSelectedClass] = useState<any>(null);
  const [selectedSection, setSelectedSection] = useState<any>(null);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const classesMock = [
    { name: 'Class 12', count: 180, sections: [{ name: '12-A', count: 60, teacher: 'Dr. R.K. Singh' }, { name: '12-B', count: 60, teacher: 'Ms. A. Sharma' }, { name: '12-C', count: 60, teacher: 'Mr. V. Verma' }] },
    { name: 'Class 11', count: 200, sections: [{ name: '11-A', count: 65, teacher: 'Mrs. K. Patel' }, { name: '11-B', count: 65, teacher: 'Mr. S. Kumar' }, { name: '11-C', count: 70, teacher: 'Ms. J. Kaur' }] },
    { name: 'Class 10', count: 150, sections: [{ name: '10-A', count: 50, teacher: 'Mr. P. Joshi' }, { name: '10-B', count: 50, teacher: 'Ms. M. Reddy' }, { name: '10-C', count: 50, teacher: 'Mrs. S. Gupta' }] },
    { name: 'Class 9', count: 160, sections: [{ name: '9-A', count: 52, teacher: 'Ms. N. Desai' }, { name: '9-B', count: 55, teacher: 'Mr. T. Pillai' }, { name: '9-C', count: 53, teacher: 'Mr. R. Bhatia' }] },
  ];

  const getStudentsMock = (sectionName: string) => {
     return [
       { id: 1, name: 'Aarav Sharma', cls: sectionName, roll: '01', status: 'Present', phone: '+91 9876543210', attendance: '92%', grade: 'A', parent: 'Rakesh Sharma', address: 'Block C, Vasant Vihar' },
       { id: 2, name: 'Isha Patel', cls: sectionName, roll: '02', status: 'Absent', phone: '+91 8765432109', attendance: '85%', grade: 'B+', parent: 'Suresh Patel', address: 'Sector 4, Dwarka' },
       { id: 3, name: 'Rohan Gupta', cls: sectionName, roll: '03', status: 'Present', phone: '+91 7654321098', attendance: '98%', grade: 'A+', parent: 'Mukesh Gupta', address: 'GK-1, New Delhi' },
       { id: 4, name: 'Ananya Singh', cls: sectionName, roll: '04', status: 'Present', phone: '+91 6543210987', attendance: '88%', grade: 'B', parent: 'Vikram Singh', address: 'Lajpat Nagar' },
     ];
  };

  const handleBack = () => {
    if (feature === 'STUDENTS') {
      if (studentView === 'PROFILE') setStudentView('STUDENTS');
      else if (studentView === 'STUDENTS') setStudentView('SECTIONS');
      else if (studentView === 'SECTIONS') setStudentView('CLASSES');
      else onClose();
    } else {
      onClose();
    }
  };

  let title = '';
  switch (feature) {
    case 'STUDENTS': 
      if (studentView === 'PROFILE' && selectedStudent) title = selectedStudent.name;
      else if (studentView === 'STUDENTS' && selectedSection) title = selectedSection.name + ' Students';
      else if (studentView === 'SECTIONS' && selectedClass) title = selectedClass.name + ' Sections';
      else title = 'Students Directory';
      break;
    case 'STAFF': title = 'Staff Management'; break;
    case 'CLASSES': title = 'Classes & Sections'; break;
    case 'FEES': title = 'Fee Collections'; break;
    case 'TRANSPORT': title = 'Transport Fleet'; break;
    case 'COMPLAINTS': title = 'Complaints Review'; break;
    case 'EXPENSES': title = 'Expenses Manager'; break;
  }

  return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-bottom-8">
      <div className="bg-white border-b border-slate-200 px-4 pt-12 pb-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <button 
            onClick={handleBack} 
            className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600 hover:bg-slate-200 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight truncate">
            {title}
          </h2>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 pb-24">
        {feature === 'STUDENTS' && (
          <div className="space-y-4 animate-in slide-in-from-right-4 relative">
             <div className="sticky top-0 z-10 bg-slate-50 pb-4">
               <div className="relative">
                 <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                 <input 
                   value={searchQuery}
                   onChange={e => setSearchQuery(e.target.value)}
                   placeholder="Search students, classes..." 
                   className="w-full bg-white border border-slate-200 rounded-2xl pl-12 pr-4 py-3.5 font-bold text-sm outline-none focus:border-indigo-500 transition-colors shadow-sm"
                 />
               </div>
             </div>

             {studentView === 'CLASSES' && (
               <div className="grid grid-cols-2 gap-4">
                 {classesMock.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase())).map((cls, i) => (
                   <AppCard 
                     key={i}
                     onClick={() => { setSelectedClass(cls); setStudentView('SECTIONS'); setSearchQuery(''); }}
                     className="flex flex-col items-center justify-center p-6 cursor-pointer hover:border-indigo-200 transition-colors bg-white shadow-sm"
                   >
                     <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 mb-3 font-black text-xl">
                       {cls.name.split(' ')[1]}
                     </div>
                     <h4 className="font-black text-slate-800 text-sm">{cls.name}</h4>
                     <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{cls.count} Students</p>
                   </AppCard>
                 ))}
               </div>
             )}

             {studentView === 'SECTIONS' && selectedClass && (
               <AppCard noPadding className="shadow-sm border border-slate-100 mb-4 animate-in fade-in">
                 <div className="divide-y divide-slate-100">
                   {selectedClass.sections.filter((s: any) => s.name.toLowerCase().includes(searchQuery.toLowerCase())).map((section: any, i: number) => (
                     <div 
                       key={i} 
                       onClick={() => { setSelectedSection(section); setStudentView('STUDENTS'); setSearchQuery(''); }}
                       className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer"
                     >
                       <div className="flex items-center gap-3">
                         <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center font-bold text-sm text-purple-700">
                           {section.name.split('-')[1]}
                         </div>
                         <div>
                           <span className="font-extrabold text-slate-900 text-sm tracking-tight block">{section.name}</span>
                           <span className="font-bold text-slate-500 text-[10px] uppercase tracking-widest">{section.teacher}</span>
                         </div>
                       </div>
                       <div className="flex items-center gap-2">
                         <span className="font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded text-[10px] uppercase tracking-widest">{section.count} Students</span>
                         <ChevronRight size={16} className="text-slate-400" />
                       </div>
                     </div>
                   ))}
                 </div>
               </AppCard>
             )}

             {studentView === 'STUDENTS' && selectedSection && (
               <AppCard noPadding className="shadow-sm border border-slate-100 mb-4 animate-in fade-in">
                 <div className="divide-y divide-slate-100">
                   {getStudentsMock(selectedSection.name).filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase())).map((student, i) => (
                     <div 
                       key={i} 
                       onClick={() => { setSelectedStudent(student); setStudentView('PROFILE'); }}
                       className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer"
                     >
                       <div className="flex items-center gap-3">
                         <div className="w-10 h-10 rounded-full bg-pink-100 flex items-center justify-center font-bold text-lg text-pink-700 uppercase">
                           {student.name.charAt(0)}
                         </div>
                         <div>
                           <span className="font-extrabold text-slate-900 text-sm tracking-tight block">{student.name}</span>
                           <span className="font-bold text-slate-500 text-[10px] uppercase tracking-widest">Roll: {student.roll}</span>
                         </div>
                       </div>
                       <div className="flex items-center gap-3">
                         {student.status === 'Present' ? (
                           <span className="font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded text-[10px] uppercase tracking-widest">Present</span>
                         ) : (
                           <span className="font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded text-[10px] uppercase tracking-widest">Absent</span>
                         )}
                         <ChevronRight size={16} className="text-slate-400" />
                       </div>
                     </div>
                   ))}
                 </div>
               </AppCard>
             )}

             {studentView === 'PROFILE' && selectedStudent && (
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
             )}
          </div>
        )}

        {feature === 'STAFF' && (
           <div className="space-y-4">
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

        {feature === 'CLASSES' && (
           <div className="space-y-4">
               <AppCard noPadding className="shadow-sm border border-slate-100 mb-4">
                 <div className="divide-y divide-slate-100">
                   {[
                     { name: 'Class 10-A', teacher: 'Anita Sharma', count: 45 },
                     { name: 'Class 10-B', teacher: 'Suresh Kumar', count: 42 },
                     { name: 'Class 9-A', teacher: 'Vikram Singh', count: 40 },
                     { name: 'Class 9-B', teacher: 'Meera Reddy', count: 44 }
                   ].map((cls, i) => (
                     <div key={i} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer">
                       <div className="flex items-center gap-3">
                         <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center font-bold text-sm text-purple-700">
                           {cls.name.split(' ')[1]}
                         </div>
                         <div>
                           <span className="font-extrabold text-slate-900 text-sm tracking-tight block">{cls.name}</span>
                           <span className="font-bold text-slate-500 text-[10px] uppercase tracking-widest">{cls.teacher}</span>
                         </div>
                       </div>
                       <div className="flex flex-col items-end">
                         <span className="font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded text-[10px] uppercase tracking-widest">{cls.count} Students</span>
                       </div>
                     </div>
                   ))}
                 </div>
               </AppCard>
           </div>
        )}

        {feature === 'FEES' && (
           <div className="space-y-4">
               <AppCard noPadding className="shadow-sm border border-slate-100 mb-4">
                 <div className="divide-y divide-slate-100">
                   {[
                     { title: 'Term 1 Fees', amount: '45,20,000', status: 'Target Met' },
                     { title: 'Transport Fees', amount: '8,50,000', status: 'Ongoing' },
                     { title: 'Late Fines', amount: '25,000', status: 'Collected' }
                   ].map((fee, i) => (
                     <div key={i} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer">
                         <div>
                           <span className="font-extrabold text-slate-900 text-sm tracking-tight block">{fee.title}</span>
                         </div>
                         <div className="flex flex-col items-end">
                           <span className="font-black text-emerald-700">₹{fee.amount}</span>
                           <span className="font-bold text-emerald-600 text-[10px] uppercase tracking-widest">{fee.status}</span>
                         </div>
                     </div>
                   ))}
                 </div>
               </AppCard>
           </div>
        )}

        {feature === 'TRANSPORT' && (
           <div className="space-y-4">
               <AppCard noPadding className="shadow-sm border border-slate-100 mb-4">
                 <div className="divide-y divide-slate-100">
                   {[
                     { route: 'Route #4', driver: 'Raju Bhai', students: 35, status: 'Active' },
                     { route: 'Route #7', driver: 'Suresh', students: 42, status: 'Idle' },
                     { route: 'Route #2', driver: 'Amit', students: 28, status: 'Active' }
                   ].map((trans, i) => (
                     <div key={i} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer">
                         <div className="flex items-center gap-3">
                           <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center font-bold text-sm text-amber-700">
                             <Bus size={20} />
                           </div>
                           <div>
                             <span className="font-extrabold text-slate-900 text-sm tracking-tight block">{trans.route}</span>
                             <span className="font-bold text-slate-500 text-[10px] uppercase tracking-widest">{trans.driver} • {trans.students} passes</span>
                           </div>
                         </div>
                         <div className="flex flex-col items-end">
                           {trans.status === 'Active' ? (
                             <span className="font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded text-[10px] uppercase tracking-widest">Active</span>
                           ) : (
                             <span className="font-black text-slate-600 bg-slate-100 px-2 py-0.5 rounded text-[10px] uppercase tracking-widest">Idle</span>
                           )}
                         </div>
                     </div>
                   ))}
                 </div>
               </AppCard>
           </div>
        )}

        {feature === 'COMPLAINTS' && (
           <div className="space-y-4">
               <AppCard noPadding className="shadow-sm border border-slate-100 mb-4">
                 <div className="divide-y divide-slate-100">
                   {[
                     { title: 'Smartboard Issue', from: 'Staff', date: '25 Apr' },
                     { title: 'Transport Delay', from: 'Parent', date: '24 Apr' },
                     { title: 'Library AC', from: 'Student', date: '23 Apr' }
                   ].map((comp, i) => (
                     <div key={i} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer">
                         <div>
                           <span className="font-extrabold text-slate-900 text-sm tracking-tight block">{comp.title}</span>
                           <span className="font-bold text-slate-500 text-[10px] uppercase tracking-widest">From: {comp.from} • {comp.date}</span>
                         </div>
                         <ChevronRight size={16} className="text-slate-400" />
                     </div>
                   ))}
                 </div>
               </AppCard>
           </div>
        )}

        {feature === 'EXPENSES' && (
           <div className="space-y-4">
               <AppCard noPadding className="shadow-sm border border-slate-100 mb-4">
                 <div className="divide-y divide-slate-100">
                   {[
                     { title: 'Staff Salaries (April)', date: '30 Apr 2024', amount: '35,00,000' },
                     { title: 'Electricity & Utilities', date: '28 Apr 2024', amount: '2,40,000' },
                     { title: 'New Lab Equipment', date: '15 Apr 2024', amount: '4,50,000' }
                   ].map((exp, i) => (
                     <div key={i} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer">
                         <div>
                           <span className="font-extrabold text-slate-900 text-sm tracking-tight block">{exp.title}</span>
                           <span className="font-bold text-slate-500 text-[10px] uppercase tracking-widest">{exp.date}</span>
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
      </div>
    </div>
  );
};
