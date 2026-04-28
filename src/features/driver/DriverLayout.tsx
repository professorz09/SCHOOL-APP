import React, { useState, useEffect } from 'react';
import {
  Power, CheckCircle2, Circle, AlertTriangle, Bus, Navigation, Clock, Plus, Edit2, Check, X, MapPin,
} from 'lucide-react';
import { transportService, TransportVehicle, RouteStop } from '../../services/transport.service';

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
  const [showAddWaypoint, setShowAddWaypoint] = useState(false);
  const [newWaypointName, setNewWaypointName] = useState('');
  const [newWaypointLat, setNewWaypointLat] = useState('');
  const [newWaypointLng, setNewWaypointLng] = useState('');
  const [newWaypointTime, setNewWaypointTime] = useState('08:00');
  const [editingStopId, setEditingStopId] = useState<string | null>(null);
  const [editStopName, setEditStopName] = useState('');
  const [editStopLat, setEditStopLat] = useState('');
  const [editStopLng, setEditStopLng] = useState('');

  useEffect(() => {
    const vehicles = transportService.getVehicles();
    const assignedVehicle = vehicles.find(v => v.driverId === DRIVER_ID);
    if (assignedVehicle) {
      setVehicle(assignedVehicle);
      setStops(assignedVehicle.stops);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isTracking && vehicle) {
      // Simulate GPS updates moving towards next stop
      interval = setInterval(() => {
        setCurrentLat(prev => {
          const nextStop = stops[currentStopIndex];
          if (!nextStop) return prev;
          const diff = nextStop.lat - prev;
          const newLat = prev + diff * 0.05; // Move 5% closer

          if (vehicle && Math.abs(newLat - nextStop.lat) < 0.001) {
            // Close enough to trigger arrival
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

  const handleAddWaypoint = () => {
    if (!vehicle || !newWaypointName.trim() || !newWaypointLat || !newWaypointLng) return;
    const lat = parseFloat(newWaypointLat);
    const lng = parseFloat(newWaypointLng);
    if (isNaN(lat) || isNaN(lng)) return;

    transportService.addWaypoint(vehicle.id, newWaypointName, lat, lng, newWaypointTime);
    const updated = transportService.getVehicleById(vehicle.id);
    if (updated) setVehicle(updated);
    setStops(updated?.stops || []);
    setNewWaypointName('');
    setNewWaypointLat('');
    setNewWaypointLng('');
    setNewWaypointTime('08:00');
    setShowAddWaypoint(false);
  };

  const handleEditWaypoint = () => {
    if (!vehicle || !editingStopId || !editStopName.trim() || !editStopLat || !editStopLng) return;
    const lat = parseFloat(editStopLat);
    const lng = parseFloat(editStopLng);
    if (isNaN(lat) || isNaN(lng)) return;

    transportService.editWaypoint(vehicle.id, editingStopId, { name: editStopName, lat, lng });
    const updated = transportService.getVehicleById(vehicle.id);
    if (updated) setVehicle(updated);
    setStops(updated?.stops || []);
    setEditingStopId(null);
    setEditStopName('');
    setEditStopLat('');
    setEditStopLng('');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-10 text-center bg-white rounded-3xl border border-slate-100 shadow-sm">
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
    <div className="flex flex-col gap-4 animate-in slide-in-from-bottom-4 duration-500 fade-in pt-4">

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
          <div className="flex items-center gap-2 mb-2">
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

                    {isTracking && (
                      <button onClick={() => {
                        setEditingStopId(stop.id);
                        setEditStopName(stop.name);
                        setEditStopLat(stop.lat.toString());
                        setEditStopLng(stop.lng.toString());
                      }} className="p-1 text-slate-400 hover:text-blue-600">
                        <Edit2 size={14} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Add Waypoint Button */}
          {!showAddWaypoint && (
            <button onClick={() => setShowAddWaypoint(true)}
              className="w-full mt-4 flex items-center justify-center gap-2 bg-blue-50 border border-blue-200 text-blue-600 py-2 rounded-2xl font-black text-xs hover:bg-blue-100 transition-colors">
              <Plus size={14} /> Add Waypoint
            </button>
          )}
        </div>
      )}

      {/* Edit Waypoint Modal */}
      {editingStopId && (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Edit Waypoint</p>
            <button onClick={() => setEditingStopId(null)} className="p-1 text-slate-400">
              <X size={16} />
            </button>
          </div>
          <input value={editStopName} onChange={e => setEditStopName(e.target.value)}
            placeholder="Location name"
            className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-500" />
          <div className="grid grid-cols-2 gap-2">
            <input value={editStopLat} onChange={e => setEditStopLat(e.target.value)}
              placeholder="Latitude"
              className="border border-slate-200 bg-slate-50 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-500" />
            <input value={editStopLng} onChange={e => setEditStopLng(e.target.value)}
              placeholder="Longitude"
              className="border border-slate-200 bg-slate-50 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-500" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setEditingStopId(null)}
              className="flex-1 py-2 bg-slate-100 text-slate-700 font-black rounded-xl text-sm">
              Cancel
            </button>
            <button onClick={handleEditWaypoint}
              className="flex-1 py-2 bg-blue-600 text-white font-black rounded-xl text-sm flex items-center justify-center gap-1">
              <Check size={14} /> Save
            </button>
          </div>
        </div>
      )}

      {/* Add Waypoint Form */}
      {showAddWaypoint && (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Add New Waypoint</p>
            <button onClick={() => setShowAddWaypoint(false)} className="p-1 text-slate-400">
              <X size={16} />
            </button>
          </div>
          <div>
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1 block">Location Name</label>
            <input value={newWaypointName} onChange={e => setNewWaypointName(e.target.value)}
              placeholder="e.g., School Campus"
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1 block">Use Current GPS</label>
            <button onClick={() => { setNewWaypointLat(currentLat.toString()); setNewWaypointLng(currentLng.toString()); }}
              className="w-full py-2 bg-blue-50 border border-blue-200 text-blue-600 font-black text-xs rounded-xl hover:bg-blue-100">
              📍 Use Current Location
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1 block">Latitude</label>
              <input value={newWaypointLat} onChange={e => setNewWaypointLat(e.target.value)}
                placeholder="e.g., 28.6139"
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1 block">Longitude</label>
              <input value={newWaypointLng} onChange={e => setNewWaypointLng(e.target.value)}
                placeholder="e.g., 77.2090"
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-500" />
            </div>
          </div>
          <div>
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1 block">Estimated Time</label>
            <input type="time" value={newWaypointTime} onChange={e => setNewWaypointTime(e.target.value)}
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-500" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowAddWaypoint(false)}
              className="flex-1 py-2.5 bg-slate-100 text-slate-700 font-black rounded-xl">
              Cancel
            </button>
            <button onClick={handleAddWaypoint}
              className="flex-1 py-2.5 bg-emerald-600 text-white font-black rounded-xl flex items-center justify-center gap-1">
              <Plus size={14} /> Add
            </button>
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
