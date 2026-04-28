import React, { useEffect, useState } from 'react';
import { ArrowLeft, Bus, CheckCircle2, Circle, Navigation, Phone } from 'lucide-react';
import { transportService } from '../../../services/transport.service';

interface Props { onBack: () => void; }

const MY_STUDENT_ID = 'student1';

export const TransportView: React.FC<Props> = ({ onBack }) => {
  const [data, setData] = useState<ReturnType<typeof transportService.getStudentTransportInfo> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const info = transportService.getStudentTransportInfo(MY_STUDENT_ID);
    setData(info);
    setLoading(false);
    const interval = setInterval(() => setData(transportService.getStudentTransportInfo(MY_STUDENT_ID)), 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
          <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600"><ArrowLeft size={20} /></button>
          <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Transport Tracker</h2>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="inline-block w-12 h-12 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin mb-3" />
            <p className="text-sm font-bold text-slate-600">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
          <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600"><ArrowLeft size={20} /></button>
          <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Transport Tracker</h2>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <Bus size={32} className="text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-black text-slate-600">No Transport Assignment</p>
            <p className="text-xs font-bold text-slate-400 mt-1">You haven't been assigned a vehicle yet</p>
          </div>
        </div>
      </div>
    );
  }

  const currentStop = data.stops.find(s => s.status === 'CURRENT');
  const nextStop = data.stops.find(s => s.status === 'UPCOMING');

  return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
        <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600"><ArrowLeft size={20} /></button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Transport Tracker</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-4  space-y-4">
        {/* Vehicle card */}
        <div className="bg-slate-900 rounded-2xl p-4 text-white">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Bus size={20} className="text-orange-400" />
              <span className="font-black text-white">{data.vehicle.vehicleNo}</span>
            </div>
            <div className="flex items-center gap-1.5 bg-emerald-500/20 px-2 py-1 rounded-full">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              <span className="text-[10px] font-black text-emerald-400 uppercase">Live</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Current Stop</div>
              <div className="font-black text-sm text-white mt-0.5">{currentStop?.name ?? '—'}</div>
            </div>
            <div>
              <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Next Stop</div>
              <div className="font-black text-sm text-amber-300 mt-0.5">{nextStop?.name ?? '—'}</div>
            </div>
            <div>
              <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Driver</div>
              <div className="font-black text-sm text-white mt-0.5">{data.vehicle.driverName}</div>
            </div>
            <div>
              <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Your Stop</div>
              <div className="font-black text-sm text-emerald-300 mt-0.5">{data.assignment.boardingStopName}</div>
            </div>
          </div>
        </div>

        {/* Call driver */}
        {data.vehicle.driverId && (
          <a href={`tel:${data.vehicle.driverPhone}`}
            className="flex items-center justify-center gap-2 bg-white border border-slate-200 rounded-2xl py-3 text-sm font-black text-slate-700 active:scale-95 transition-transform shadow-sm">
            <Phone size={16} className="text-emerald-500" /> Call Driver: {data.vehicle.driverPhone}
          </a>
        )}

        {/* Route stops */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">{data.vehicle.routeName} — Live Stops</p>
          <div className="space-y-1">
            {data.stops.map((stop, i) => (
              <div key={stop.id} className="flex gap-4 items-start">
                <div className="flex flex-col items-center shrink-0">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                    stop.status === 'COMPLETED' ? 'bg-emerald-500' :
                    stop.status === 'CURRENT' ? 'bg-blue-500 animate-pulse' : 'bg-slate-200'
                  }`}>
                    {stop.status === 'COMPLETED' ? <CheckCircle2 size={12} className="text-white" /> :
                     stop.status === 'CURRENT' ? <Navigation size={10} className="text-white" /> :
                     <Circle size={10} className="text-slate-400" />}
                  </div>
                  {i < data.stops.length - 1 && (
                    <div className={`w-0.5 h-8 mt-1 ${stop.status === 'COMPLETED' ? 'bg-emerald-300' : 'bg-slate-200'}`} />
                  )}
                </div>
                <div className={`flex-1 pb-4 ${i === data.stops.length - 1 ? 'pb-0' : ''}`}>
                  <div className={`font-extrabold text-sm ${
                    stop.status === 'CURRENT' ? 'text-blue-600' :
                    stop.status === 'COMPLETED' ? 'text-slate-400' : 'text-slate-900'
                  }`}>{stop.name}</div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-[10px] font-bold text-slate-400">{stop.estimatedTime}</span>
                    <span className="text-[9px] font-bold text-slate-300">{stop.lat.toFixed(4)}°N, {stop.lng.toFixed(4)}°E</span>
                  </div>
                  {stop.status === 'CURRENT' && stop.id === data.assignment.boardingStopId && (
                    <span className="text-[9px] font-black bg-emerald-500 text-white px-2 py-0.5 rounded-full uppercase mt-1 inline-block">Your boarding stop</span>
                  )}
                  {stop.status === 'CURRENT' && (
                    <span className="text-[9px] font-black bg-blue-500 text-white px-2 py-0.5 rounded-full uppercase mt-1 inline-block">Vehicle is here</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
