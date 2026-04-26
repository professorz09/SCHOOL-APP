import React, { useEffect, useState } from 'react';
import { ArrowLeft, Library, FlaskConical, Bus, BookOpen, Wrench, ChevronRight } from 'lucide-react';
import { principalService } from '../../../services/principal.service';
import { LibraryBook, LabEquipment, Vehicle } from '../../../types/principal.types';

type Tab = 'LIBRARY' | 'LAB' | 'VEHICLES';

interface Props { onBack: () => void; }

export const AssetsManager: React.FC<Props> = ({ onBack }) => {
  const [tab, setTab] = useState<Tab>('LIBRARY');
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [equipment, setEquipment] = useState<LabEquipment[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);

  useEffect(() => {
    Promise.all([
      principalService.getBooks(),
      principalService.getEquipment(),
      principalService.getVehicles(),
    ]).then(([b, e, v]) => { setBooks(b); setEquipment(e); setVehicles(v); });
  }, []);

  const tabs = [
    { key: 'LIBRARY' as Tab, label: 'Library', icon: Library },
    { key: 'LAB' as Tab, label: 'Lab', icon: FlaskConical },
    { key: 'VEHICLES' as Tab, label: 'Transport', icon: Bus },
  ];

  const labTypeColor = (t: string) =>
    t === 'SCIENCE' ? 'bg-emerald-50 text-emerald-700' :
    t === 'COMPUTER' ? 'bg-blue-50 text-blue-700' : 'bg-violet-50 text-violet-700';

  return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-4 pt-12 pb-0 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3 pb-3">
          <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600"><ArrowLeft size={20} /></button>
          <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Assets</h2>
        </div>
        <div className="flex border-t border-slate-100">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-[11px] font-black uppercase tracking-widest transition-colors border-b-2 ${tab === key ? 'border-amber-500 text-amber-600' : 'border-transparent text-slate-400'}`}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-3">

        {/* LIBRARY */}
        {tab === 'LIBRARY' && (
          <>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Total Books', val: books.reduce((a, b) => a + b.totalCopies, 0) },
                { label: 'Available', val: books.reduce((a, b) => a + b.availableCopies, 0), c: 'text-emerald-600' },
                { label: 'Issued', val: books.reduce((a, b) => a + b.issuedTo.filter(i => !i.returnedAt).length, 0), c: 'text-amber-600' },
              ].map(({ label, val, c }) => (
                <div key={label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 text-center">
                  <div className={`text-xl font-black ${c ?? 'text-slate-900'}`}>{val}</div>
                  <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-0.5">{label}</div>
                </div>
              ))}
            </div>
            {books.map(book => (
              <div key={book.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <div className="font-extrabold text-slate-900 text-sm">{book.title}</div>
                    <div className="text-[10px] font-bold text-slate-400 mt-0.5">{book.author} · {book.subject}</div>
                    <div className="text-[10px] font-bold text-slate-400">ISBN: {book.isbn}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-black text-emerald-600">{book.availableCopies} avail</div>
                    <div className="text-[10px] font-bold text-slate-400">of {book.totalCopies}</div>
                  </div>
                </div>
                {book.issuedTo.filter(i => !i.returnedAt).length > 0 && (
                  <div className="border-t border-slate-50 pt-2 mt-2 space-y-1">
                    {book.issuedTo.filter(i => !i.returnedAt).map(issue => (
                      <div key={issue.studentId} className="flex justify-between text-[10px]">
                        <span className="font-bold text-slate-600">{issue.studentName}</span>
                        <span className="font-bold text-amber-600">Due: {issue.dueDate}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </>
        )}

        {/* LAB */}
        {tab === 'LAB' && (
          <>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Total Items', val: equipment.reduce((a, e) => a + e.quantity, 0) },
                { label: 'Working', val: equipment.reduce((a, e) => a + e.workingCount, 0), c: 'text-emerald-600' },
                { label: 'Faulty', val: equipment.reduce((a, e) => a + (e.quantity - e.workingCount), 0), c: 'text-rose-500' },
              ].map(({ label, val, c }) => (
                <div key={label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 text-center">
                  <div className={`text-xl font-black ${c ?? 'text-slate-900'}`}>{val}</div>
                  <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-0.5">{label}</div>
                </div>
              ))}
            </div>
            {equipment.map(eq => (
              <div key={eq.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-extrabold text-slate-900 text-sm">{eq.name}</div>
                    <div className="flex gap-2 mt-1.5">
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${labTypeColor(eq.labType)}`}>{eq.labType}</span>
                      <span className="text-[10px] font-bold text-slate-400">Serviced: {eq.lastServiced}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`text-sm font-black ${eq.workingCount === eq.quantity ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {eq.workingCount}/{eq.quantity}
                    </div>
                    <div className="text-[9px] font-bold text-slate-400">working</div>
                    {eq.workingCount < eq.quantity && (
                      <div className="flex items-center gap-1 mt-1 text-[10px] font-black text-rose-500">
                        <Wrench size={10} /> {eq.quantity - eq.workingCount} faulty
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        {/* VEHICLES */}
        {tab === 'VEHICLES' && (
          <>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Vehicles', val: vehicles.length },
                { label: 'Capacity', val: vehicles.reduce((a, v) => a + v.capacity, 0) },
                { label: 'Students', val: vehicles.reduce((a, v) => a + v.studentsAssigned, 0), c: 'text-blue-600' },
              ].map(({ label, val, c }) => (
                <div key={label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 text-center">
                  <div className={`text-xl font-black ${c ?? 'text-slate-900'}`}>{val}</div>
                  <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-0.5">{label}</div>
                </div>
              ))}
            </div>
            {vehicles.map(v => (
              <div key={v.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-extrabold text-slate-900 text-sm">{v.vehicleNo}</div>
                    <div className="flex gap-2 mt-1">
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${v.type === 'BUS' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>{v.type}</span>
                      <span className="text-[10px] font-bold text-slate-400">{v.studentsAssigned}/{v.capacity} students</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-black text-slate-700">{v.driverName}</div>
                    <div className="text-[10px] font-bold text-slate-400">{v.driverPhone}</div>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">{v.route}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {v.routeStops.map((stop, i) => (
                      <span key={i} className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-lg">{stop}</span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
};
