import React, { useState, useEffect } from 'react';
import { Users, MapPin, Bus } from 'lucide-react';
import { transportService, StudentTransportAssignment, TransportVehicle } from '@/modules/transport/transport.service';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/lib/supabase';

export const DriverStudentsView: React.FC = () => {
  const session = useAuthStore(s => s.session);
  const [vehicle, setVehicle] = useState<TransportVehicle | null>(null);
  const [students, setStudents] = useState<StudentTransportAssignment[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Same hardcoded-staff6 bug pattern as DriverLayout / DriverRouteView.
      // Resolve real staff_id from session so each driver only sees
      // their own students.
      if (!session?.userId) return;
      const { data } = await supabase
        .from('staff').select('id').eq('user_id', session.userId).maybeSingle();
      const staffId = (data as { id: string } | null)?.id;
      if (!staffId || cancelled) return;
      await transportService.refreshAll();
      if (cancelled) return;
      const v = transportService.getVehicles().find(x => x.driverId === staffId);
      if (v) {
        setVehicle(v);
        setStudents(transportService.getAssignmentsByVehicle(v.id));
      }
    })();
    return () => { cancelled = true; };
  }, [session?.userId]);

  if (!vehicle) return (
    <div className="flex flex-col items-center justify-center p-10 text-center">
      <Bus size={40} className="text-slate-200 mb-3" />
      <p className="font-extrabold text-slate-900">No Vehicle Assigned</p>
      <p className="text-xs font-bold text-slate-400 mt-1">Contact principal for vehicle assignment</p>
    </div>
  );

  return (
    <div className="flex flex-col gap-4 px-5 pt-4 pb-32 animate-in fade-in duration-300">

      {/* Header card */}
      <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-4 text-white">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-white/20 rounded-xl flex items-center justify-center">
            <Users size={22} className="text-white" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-200">On Board</p>
            <p className="text-3xl font-black">{students.length}</p>
          </div>
        </div>
        <div className="mt-3 text-[11px] font-bold text-blue-200">
          {vehicle.vehicleNo} · {vehicle.routeName}
        </div>
      </div>

      {/* Students list */}
      {students.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center">
          <Users size={36} className="text-slate-200 mx-auto mb-3" />
          <p className="font-bold text-slate-400 text-sm">No students assigned to this vehicle</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-4 pt-4 pb-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Students</p>
          </div>
          <div className="divide-y divide-slate-50">
            {students.map(s => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-sm shrink-0">
                  {s.studentName.split(' ').map(w => w[0]).join('').slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-extrabold text-slate-900 text-sm">{s.studentName}</div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-[10px] font-bold text-slate-400">{s.className}</span>
                    <span className="text-slate-300">·</span>
                    <MapPin size={9} className="text-blue-500" />
                    <span className="text-[10px] font-bold text-blue-600 truncate">{s.boardingStopName}</span>
                  </div>
                </div>
                <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
