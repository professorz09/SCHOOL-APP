import React, { useState, useEffect } from 'react';
import {
  Power, CheckCircle2, Circle, AlertTriangle, Bus, Navigation, Clock, MapPin,
} from 'lucide-react';
import { transportService, TransportVehicle, RouteStop, StudentTransportAssignment } from '@/modules/transport/transport.service';

const DRIVER_ID = 'staff6';
const INITIAL_LAT = 28.6139;
const INITIAL_LNG = 77.2090;

export const DriverLayout: React.FC = () => {
  const [isTracking, setIsTracking] = useState(false);
  const [currentStopIndex, setCurrentStopIndex] = useState(0);
  const [autoArrive, setAutoArrive] = useState(false);
  const [showEmergencyConfirm, setShowEmergencyConfirm] = useState(false);
  const [emergencySent, setEmergencySent] = useState(false);
  const [vehicle, setVehicle] = useState<TransportVehicle | null>(null);
  const [stops, setStops] = useState<RouteStop[]>([]);
  const [tripComplete, setTripComplete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentLat, setCurrentLat] = useState(INITIAL_LAT);
  const [currentLng, setCurrentLng] = useState(INITIAL_LNG);
  const [assignedStudents, setAssignedStudents] = useState<StudentTransportAssignment[]>([]);

  useEffect(() => {
    const vehicles = transportService.getVehicles();
    const assignedVehicle = vehicles.find(v => v.driverId === DRIVER_ID);
    if (assignedVehicle) {
      setVehicle(assignedVehicle);
      setStops(assignedVehicle.stops);
      const students = transportService.getAssignmentsByVehicle(assignedVehicle.id);
      setAssignedStudents(students);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isTracking && vehicle) {
      interval = setInterval(() => {
        setCurrentLat(prev => {
          const nextStop = stops[currentStopIndex];
          if (!nextStop) return prev;
          const diff = nextStop.lat - prev;
          const newLat = prev + diff * 0.05;
          if (vehicle && Math.abs(newLat - nextStop.lat) < 0.001) {
            if (autoArrive) {
              setCurrentStopIndex(c => {
                const next = c + 1;
                if (next >= stops.length - 1) setTripComplete(true);
                return next;
              });
            }
            return nextStop.lat;
          }
          return newLat;
        });
        setCurrentLng(prev => {
          const nextStop = stops[currentStopIndex];
          if (!nextStop) return prev;
          const diff = nextStop.lng - prev;
          return prev + diff * 0.05;
        });
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [isTracking, autoArrive, currentStopIndex, stops, vehicle]);

  const handleManualArrive = () => {
    const next = currentStopIndex + 1;
    setCurrentStopIndex(next);
    if (next >= stops.length - 1) setTripComplete(true);
  };

  const handleEmergency = () => {
    setEmergencySent(true);
    setShowEmergencyConfirm(false);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-10 text-center bg-white rounded-3xl border border-slate-100 shadow-sm">
        <div className="inline-block w-12 h-12 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin mb-3" />
        <p className="text-sm font-bold text-slate-600">Loading...</p>
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="flex flex-col items-center justify-center p-10 text-center bg-white rounded-3xl border border-slate-100 shadow-sm">
        <Bus size={48} className="text-slate-200 mb-4" />
        <h3 className="font-extrabold text-slate-900 text-lg">No Vehicle Assigned</h3>
        <p className="text-xs font-bold text-slate-400 mt-2 max-w-[200px]">
          Wait for the principal to assign a vehicle to you.
        </p>
      </div>
    );
  }

  const studentCount = transportService.getAssignmentsByVehicle(vehicle.id).length;

  return (
    <div className="flex flex-col gap-4 animate-in slide-in-from-bottom-4 duration-500 fade-in pt-4 px-5">

      {/* Status card */}
      <div className={`rounded-3xl p-6 transition-colors duration-300 ${isTracking ? 'bg-blue-600' : 'bg-slate-900'}`}>
        <div className="flex justify-between items-start text-white">
          <div>
            <p className="font-bold text-[10px] uppercase tracking-widest text-white/70">Vehicle Status</p>
            <h2 className="text-3xl font-black mt-1">
              {tripComplete ? 'TRIP DONE' : isTracking ? 'ON TRIP' : 'OFFLINE'}
            </h2>
            <p className="text-xs font-bold mt-2 text-white/80">{vehicle.type} · {vehicle.vehicleNo} · {vehicle.routeName}</p>
            <p className="text-[10px] font-bold text-white/60 mt-0.5">{studentCount} students on board</p>
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

      {/* GPS Location Display */}
      {isTracking && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3">
          <div className="flex items-center gap-2 mb-1">
            <MapPin size={14} className="text-blue-600" />
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Current Location</p>
          </div>
          <div className="text-xs font-bold text-blue-900 font-mono">
            {currentLat.toFixed(4)}, {currentLng.toFixed(4)}
          </div>
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
                        {stop.name}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                          <Clock size={9} /> {stop.estimatedTime}
                        </span>
                        {isNext && (
                          <span className="text-[9px] font-black text-blue-500">
                            {autoArrive ? 'GPS detecting...' : 'Next stop'}
                          </span>
                        )}
                        {isCompleted && (
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

          <p className="text-[9px] font-bold text-slate-400 text-center mt-4">
            To edit stops, go to the Route tab →
          </p>
        </div>
      )}

      {!isTracking && (
        <div className="flex flex-col items-center justify-center py-8 text-center bg-white rounded-3xl border border-slate-100 shadow-sm">
          <Bus size={44} className="text-slate-200 mb-3" />
          <h3 className="font-extrabold text-slate-900">Ready to Go</h3>
          <p className="text-xs font-bold text-slate-400 mt-1 max-w-[200px]">
            Press Start to begin trip tracking. Edit stops in the Route tab.
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
