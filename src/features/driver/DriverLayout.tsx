import React, { useState, useEffect } from 'react';
import {
  Power, MapPin, CheckCircle2, Circle, Settings, Plus, Trash2,
  Crosshair, AlertTriangle, Bus, Navigation, Clock,
} from 'lucide-react';

interface Stop {
  id: number;
  name: string;
  lat: string;
  lng: string;
  estimatedTime: string;
}

const INITIAL_STOPS: Stop[] = [
  { id: 1, name: 'School Campus (Start)', lat: '28.6139', lng: '77.2090', estimatedTime: '07:30' },
  { id: 2, name: 'City Center Point',     lat: '28.6200', lng: '77.2100', estimatedTime: '07:50' },
  { id: 3, name: 'Green Park Avenue',     lat: '28.6250', lng: '77.2150', estimatedTime: '08:05' },
  { id: 4, name: 'Sunrise Apartments',    lat: '28.6310', lng: '77.2205', estimatedTime: '08:20' },
  { id: 5, name: 'Sector 14 Market',      lat: '28.6380', lng: '77.2270', estimatedTime: '08:35' },
  { id: 6, name: 'School Campus (End)',   lat: '28.6139', lng: '77.2090', estimatedTime: '08:50' },
];

const VEHICLES = [
  { id: 'v1', number: 'DL 1C 4455', type: 'Bus', route: 'Route #4', capacity: 40, students: 32 },
  { id: 'v2', number: 'DL 8C 1122', type: 'Van', route: 'Route #2', capacity: 12, students: 10 },
];

export const DriverLayout: React.FC = () => {
  const [isTracking, setIsTracking] = useState(false);
  const [currentStopIndex, setCurrentStopIndex] = useState(0);
  const [autoArrive, setAutoArrive] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showEmergencyConfirm, setShowEmergencyConfirm] = useState(false);
  const [emergencySent, setEmergencySent] = useState(false);
  const [vehicle, setVehicle] = useState(VEHICLES[0]);
  const [stops, setStops] = useState<Stop[]>(INITIAL_STOPS);
  const [tripComplete, setTripComplete] = useState(false);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isTracking && autoArrive && currentStopIndex < stops.length - 1) {
      interval = setInterval(() => {
        setCurrentStopIndex(prev => {
          const next = prev + 1;
          if (next >= stops.length - 1) setTripComplete(true);
          return next;
        });
      }, 4000);
    }
    return () => clearInterval(interval);
  }, [isTracking, autoArrive, currentStopIndex, stops.length]);

  const handleManualArrive = () => {
    const next = currentStopIndex + 1;
    setCurrentStopIndex(next);
    if (next >= stops.length - 1) setTripComplete(true);
  };

  const handleEmergency = () => {
    setEmergencySent(true);
    setShowEmergencyConfirm(false);
  };

  const handleAddStop = () => {
    const newStop: Stop = {
      id: Date.now(),
      name: '',
      lat: (28.61 + Math.random() * 0.05).toFixed(4),
      lng: (77.20 + Math.random() * 0.05).toFixed(4),
      estimatedTime: '',
    };
    setStops([...stops, newStop]);
  };

  const updateStop = (id: number, field: keyof Stop, value: string) => {
    setStops(stops.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const refreshCoords = (id: number) => {
    setStops(stops.map(s => s.id === id
      ? { ...s, lat: (28.61 + Math.random() * 0.05).toFixed(4), lng: (77.20 + Math.random() * 0.05).toFixed(4) }
      : s));
  };

  if (showSettings) {
    return (
      <div className="flex flex-col gap-4 animate-in slide-in-from-bottom-4 duration-300 fade-in pt-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Settings</p>
            <h2 className="text-xl font-black text-slate-900">Trip Configuration</h2>
          </div>
          <button onClick={() => setShowSettings(false)}
            className="bg-slate-900 text-white px-4 py-2 rounded-full text-[10px] font-black uppercase">
            Done
          </button>
        </div>

        {/* Vehicle selector */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3">Assigned Vehicle</p>
          <div className="space-y-2">
            {VEHICLES.map(v => (
              <button key={v.id} onClick={() => setVehicle(v)}
                className={`w-full p-4 rounded-2xl border-2 text-left transition-colors ${
                  vehicle.id === v.id ? 'border-blue-600 bg-blue-50' : 'border-slate-100 bg-white'
                }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-extrabold text-slate-900">{v.number}</div>
                    <div className="text-[10px] font-bold text-slate-400 mt-0.5">{v.type} · {v.route} · {v.students}/{v.capacity} students</div>
                  </div>
                  {vehicle.id === v.id && <CheckCircle2 size={20} className="text-blue-600" />}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Route stops */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Route Stops</p>
            <button onClick={handleAddStop}
              className="flex items-center gap-1 text-[9px] font-black text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full">
              <Plus size={12} /> Add Stop
            </button>
          </div>
          <div className="space-y-4">
            {stops.map((stop, i) => (
              <div key={stop.id} className="bg-slate-50 rounded-2xl border border-slate-200 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Stop {i + 1}</span>
                  {stops.length > 2 && (
                    <button onClick={() => setStops(stops.filter(s => s.id !== stop.id))}
                      className="text-rose-400 p-1">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                <input value={stop.name} onChange={e => updateStop(stop.id, 'name', e.target.value)}
                  placeholder="Stop name..."
                  className="w-full bg-white px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold outline-none focus:border-blue-500" />
                <div className="flex gap-2">
                  <input value={stop.estimatedTime} onChange={e => updateStop(stop.id, 'estimatedTime', e.target.value)}
                    placeholder="HH:MM"
                    className="w-24 bg-white px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold outline-none focus:border-blue-500" />
                  <div className="flex-1 bg-slate-200 rounded-xl px-3 py-2 flex items-center justify-between">
                    <span className="text-[10px] font-mono text-slate-600">{stop.lat}°N, {stop.lng}°E</span>
                  </div>
                  <button onClick={() => refreshCoords(stop.id)}
                    className="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
                    <Crosshair size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 animate-in slide-in-from-bottom-4 duration-500 fade-in pt-4">

      {/* Status card */}
      <div className={`rounded-3xl p-6 transition-colors duration-300 ${isTracking ? 'bg-blue-600' : 'bg-slate-900'}`}>
        <div className="flex justify-between items-start text-white">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <p className="font-bold text-[10px] uppercase tracking-widest text-white/70">Vehicle Status</p>
              <button onClick={() => setShowSettings(true)}
                className="p-1 bg-white/10 rounded-full hover:bg-white/20">
                <Settings size={11} />
              </button>
            </div>
            <h2 className="text-3xl font-black mt-1">
              {tripComplete ? 'TRIP DONE' : isTracking ? 'ON TRIP' : 'OFFLINE'}
            </h2>
            <p className="text-xs font-bold mt-2 text-white/80">{vehicle.type} · {vehicle.number} · {vehicle.route}</p>
            <p className="text-[10px] font-bold text-white/60 mt-0.5">{vehicle.students} students on board</p>
          </div>
          <button
            onClick={() => {
              if (!isTracking) { setCurrentStopIndex(0); setTripComplete(false); }
              setIsTracking(!isTracking);
            }}
            className={`w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-90 ${
              isTracking ? 'bg-rose-500 text-white' : 'bg-white text-slate-900'
            }`}>
            <Power size={28} />
          </button>
        </div>
      </div>

      {/* Emergency button */}
      {isTracking && !emergencySent && (
        <button onClick={() => setShowEmergencyConfirm(true)}
          className="w-full flex items-center justify-center gap-2 bg-rose-50 border-2 border-rose-300 text-rose-700 py-3 rounded-2xl font-black text-sm active:scale-95 transition-transform">
          <AlertTriangle size={18} /> Emergency Alert
        </button>
      )}

      {emergencySent && (
        <div className="flex items-center gap-3 bg-rose-50 border border-rose-200 rounded-2xl p-4">
          <AlertTriangle size={18} className="text-rose-500 shrink-0" />
          <div>
            <div className="font-extrabold text-rose-800 text-sm">Emergency Alert Sent</div>
            <div className="text-[10px] font-bold text-rose-600 mt-0.5">Principal has been notified. Help is on the way.</div>
          </div>
        </div>
      )}

      {/* Auto GPS toggle */}
      {isTracking && (
        <div className="flex items-center justify-between bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3">
          <div className="flex items-center gap-2">
            <Navigation size={16} className="text-slate-500" />
            <span className="text-sm font-extrabold text-slate-900">Auto GPS Mode</span>
          </div>
          <button onClick={() => setAutoArrive(!autoArrive)}
            className={`w-12 h-6 rounded-full transition-colors relative ${autoArrive ? 'bg-blue-500' : 'bg-slate-200'}`}>
            <div className={`w-5 h-5 bg-white rounded-full shadow absolute top-0.5 transition-transform ${autoArrive ? 'translate-x-6' : 'translate-x-0.5'}`} />
          </button>
        </div>
      )}

      {/* Route progress */}
      {isTracking && (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Live Route Progress</p>
            <span className="text-[9px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
              {currentStopIndex}/{stops.length - 1} stops
            </span>
          </div>

          <div className="relative">
            <div className="absolute left-[15px] top-4 bottom-4 w-0.5 bg-slate-100 rounded-full" />
            <div className="space-y-5">
              {stops.map((stop, index) => {
                const isCompleted = index < currentStopIndex;
                const isNext = index === currentStopIndex && !tripComplete;
                const isLast = index === stops.length - 1;

                return (
                  <div key={stop.id} className="relative flex items-center gap-4">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center relative z-10 shrink-0 transition-all ${
                      isCompleted ? 'bg-emerald-500 text-white' :
                      isNext      ? 'bg-blue-500 text-white shadow-lg shadow-blue-200 animate-pulse' :
                      'bg-slate-100 text-slate-300'
                    }`}>
                      {isCompleted ? <CheckCircle2 size={16} /> : <Circle size={10} fill="currentColor" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className={`font-extrabold text-sm truncate ${
                        isCompleted ? 'text-slate-400 line-through' :
                        isNext      ? 'text-blue-700' :
                        'text-slate-900'
                      }`}>
                        {stop.name || 'Unnamed Stop'}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {stop.estimatedTime && (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                            <Clock size={9} /> {stop.estimatedTime}
                          </span>
                        )}
                        {isNext && (
                          <span className="text-[9px] font-black text-blue-500">
                            {autoArrive ? 'GPS detecting...' : 'Next stop'}
                          </span>
                        )}
                        {isCompleted && !isLast && (
                          <span className="text-[9px] font-black text-emerald-500">Reached</span>
                        )}
                      </div>
                    </div>

                    {isNext && !autoArrive && (
                      <button onClick={handleManualArrive}
                        className="shrink-0 px-3 py-1.5 bg-blue-600 text-white text-[10px] font-black rounded-full">
                        Arrived
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {!isTracking && (
        <div className="flex flex-col items-center justify-center p-10 text-center bg-white rounded-3xl border border-slate-100 shadow-sm">
          <Bus size={48} className="text-slate-200 mb-4" />
          <h3 className="font-extrabold text-slate-900 text-lg">Location Sharing Paused</h3>
          <p className="text-xs font-bold text-slate-400 mt-2 max-w-[200px]">
            Start the trip to enable live tracking for parents and admins.
          </p>
        </div>
      )}

      {/* Emergency confirm modal */}
      {showEmergencyConfirm && (
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end">
          <div className="w-full bg-white rounded-t-3xl p-6 pb-8 animate-in slide-in-from-bottom-8">
            <div className="text-center mb-5">
              <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <AlertTriangle size={32} className="text-rose-500" />
              </div>
              <h3 className="text-xl font-black text-slate-900">Send Emergency Alert?</h3>
              <p className="text-sm font-bold text-slate-400 mt-2">
                This will immediately notify the Principal and school admin with your current location.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowEmergencyConfirm(false)}
                className="flex-1 py-3 bg-slate-100 text-slate-700 font-black rounded-2xl">
                Cancel
              </button>
              <button onClick={handleEmergency}
                className="flex-1 py-3 bg-rose-600 text-white font-black rounded-2xl">
                Send Alert
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
