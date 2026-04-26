import React, { useState } from 'react';
import { ArrowLeft, Building2, Plus, Search, MoreHorizontal, CheckCircle2, XCircle, ChevronRight, User, CalendarDays, MapPin, Phone, Folder, Users, IndianRupee, Wallet } from 'lucide-react';
import { AppCard, SectionTitle } from '../components/SharedUI';

interface SchoolManagerProps {
  onClose: () => void;
}

export const SchoolManager: React.FC<SchoolManagerProps> = ({ onClose }) => {
  const [view, setView] = useState<'LIST' | 'CREATE' | 'DETAILS' | 'SECTIONS_LIST' | 'STUDENT_LIST' | 'STUDENT_PROFILE' | 'STAFF_LIST' | 'REVENUE_LIST' | 'EXPENDITURE_LIST'>('LIST');
  const [selectedSchool, setSelectedSchool] = useState<any>(null);
  const [selectedSection, setSelectedSection] = useState<any>(null);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [selectedAcademicYearIndex, setSelectedAcademicYearIndex] = useState<number>(0);

  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [createForm, setCreateForm] = useState<any>({ name: '', code: '', location: '', address: '', phone: '', principalName: '', principalPhone: '', principalEmail: '', password: '' });
  const [editForm, setEditForm] = useState<any>({});
  
  const [schools, setSchools] = useState([
    { id: 1, name: 'Delhi Public School', code: 'DPS-01', location: 'New Delhi', address: 'Sector 3 Dwarka, New Delhi 110078', phone: '+91 9876543210', principalName: 'Dr. Rajesh Kumar', principalEmail: 'principal@dps.edu.in', principalPhone: '+91 9123456780', status: 'ACTIVE', students: 2400, revenue: '1.2L', totalFees: '1,20,00,000', totalExpense: '45,00,000', paymentStatus: 'PAID' },
    { id: 2, name: 'Greenwood High', code: 'GWH-02', location: 'Bangalore', address: 'No.8 Chikkawadayarapura, Near Heggondahalli, Carmelaram Post, Varthur Via, Bangalore 560035', phone: '+91 8765432109', principalName: 'Vikram Singh', principalEmail: 'principal@greenwood.edu.in', principalPhone: '+91 9876543211', status: 'ACTIVE', students: 800, revenue: '40k', totalFees: '40,00,000', totalExpense: '12,00,000', paymentStatus: 'PENDING' },
    { id: 3, name: 'Sunrise Valley', code: 'SRV-03', location: 'Mumbai', address: 'Plot No. 2, Sector 15, Kopar Khairane, Navi Mumbai 400709', phone: '+91 7654321098', principalName: 'Aarti Desai', principalEmail: 'principal@sunrise.edu.in', principalPhone: '+91 8765432101', status: 'INACTIVE', students: 1200, revenue: '60k', totalFees: '60,00,000', totalExpense: '18,00,000', paymentStatus: 'PENDING' },
  ]);

  const mockAcademicYears = [
    {
      year: '2024-2025',
      startDate: '01 Apr 2024',
      endDate: '31 Mar 2025',
      students: 2400,
      totalRevenue: '1,20,00,000',
      pendingFees: '15,00,000',
      totalExpenditure: '85,00,000',
      sections: [
        { id: 'sec_1', name: 'Class 10-A', count: 45, totalRevenue: '22,50,000', pendingFees: '2,50,000' },
        { id: 'sec_2', name: 'Class 10-B', count: 42, totalRevenue: '21,00,000', pendingFees: '1,50,000' },
        { id: 'sec_3', name: 'Class 9-A', count: 38, totalRevenue: '18,50,000', pendingFees: '3,00,000' },
      ]
    },
    {
      year: '2023-2024',
      startDate: '01 Apr 2023',
      endDate: '31 Mar 2024',
      students: 2150,
      totalRevenue: '1,05,00,000',
      pendingFees: '5,00,000',
      totalExpenditure: '78,00,000',
      sections: [
        { id: 'sec_4', name: 'Class 9-A', count: 44, totalRevenue: '21,50,000', pendingFees: '1,00,000' },
        { id: 'sec_5', name: 'Class 9-B', count: 41, totalRevenue: '20,00,000', pendingFees: '50,000' },
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
    else if (view === 'STUDENT_LIST') setView('SECTIONS_LIST');
    else if (view === 'SECTIONS_LIST' || view === 'STAFF_LIST' || view === 'REVENUE_LIST' || view === 'EXPENDITURE_LIST') setView('DETAILS');
    else if (view === 'DETAILS') setView('LIST');
    else if (view === 'CREATE') setView('LIST');
    else onClose();
  };

  let title = 'Data';
  if (view === 'DETAILS' && selectedSchool) title = selectedSchool.name;
  else if (view === 'SECTIONS_LIST') title = 'Students Data';
  else if (view === 'STAFF_LIST') title = 'Staff Data';
  else if (view === 'REVENUE_LIST') title = 'Revenue Data';
  else if (view === 'EXPENDITURE_LIST') title = 'Expenditure Data';
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
               {[...schools].sort((a, b) => {
                 if (a.paymentStatus === 'PENDING' && b.paymentStatus !== 'PENDING') return -1;
                 if (a.paymentStatus !== 'PENDING' && b.paymentStatus === 'PENDING') return 1;
                 return 0;
               }).map(school => (
                 <AppCard 
                   key={school.id} 
                   noPadding 
                   className="overflow-hidden hover:border-indigo-200 transition-colors cursor-pointer shadow-sm border border-slate-100 bg-white"
                   onClick={() => {
                     setSelectedSchool(school);
                     setView('DETAILS');
                   }}
                 >
                   <div className="p-4 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
                     <div className="flex items-center gap-2">
                         <h4 className="font-extrabold text-slate-900 text-sm uppercase tracking-tight">{school.name}</h4>
                         {school.status === 'ACTIVE' ? (
                           <CheckCircle2 size={14} className="text-emerald-500" />
                         ) : (
                           <XCircle size={14} className="text-rose-500" />
                         )}
                     </div>
                     <div className="flex items-center gap-2">
                       {school.paymentStatus === 'PENDING' ? (
                         <span className="font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded text-[10px] uppercase tracking-widest">Pending</span>
                       ) : (
                         <span className="font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded text-[10px] uppercase tracking-widest">Paid</span>
                       )}
                       <span className="font-black text-indigo-600 text-[10px] uppercase tracking-widest">{school.code}</span>
                     </div>
                   </div>
                   <div className="p-5">
                     <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">{school.location}</p>
                     
                     <div className="grid grid-cols-3 gap-2 lg:gap-3">
                        <div className="bg-slate-50 p-2 lg:p-3 rounded-xl border border-slate-100 flex flex-col items-center justify-center text-center overflow-hidden">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 truncate w-full" title="Students">Students</p>
                          <p className="text-xs lg:text-sm font-black text-slate-700 truncate w-full" title={school.students.toLocaleString('en-IN')}>{school.students.toLocaleString('en-IN')}</p>
                        </div>
                        <div className="bg-emerald-50/50 p-2 lg:p-3 rounded-xl border border-emerald-50 flex flex-col items-center justify-center text-center overflow-hidden">
                          <p className="text-[9px] font-black text-emerald-600/70 uppercase tracking-widest mb-1 truncate w-full" title="Revenue">Revenue</p>
                          <p className="text-xs lg:text-sm font-black text-emerald-700 truncate w-full" title={'₹' + school.totalFees}>₹{school.totalFees}</p>
                        </div>
                        <div className="bg-rose-50/50 p-2 lg:p-3 rounded-xl border border-rose-50 flex flex-col items-center justify-center text-center overflow-hidden">
                          <p className="text-[9px] font-black text-rose-600/70 uppercase tracking-widest mb-1 truncate w-full" title="Expense">Expense</p>
                          <p className="text-xs lg:text-sm font-black text-rose-700 truncate w-full" title={'₹' + school.totalExpense}>₹{school.totalExpense}</p>
                        </div>
                     </div>
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
         )}
         
{view === 'DETAILS' && selectedSchool && (
           <div className="space-y-6">

                          <div className="flex justify-between items-center">
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
             )}

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

           </div>
         )}
         


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
