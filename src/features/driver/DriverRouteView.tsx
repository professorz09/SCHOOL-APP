import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Check, X, MapPin } from 'lucide-react';
import { transportService, TransportVehicle, RouteStop } from '../../services/transport.service';

const DRIVER_ID = 'staff6';

export const DriverRouteView: React.FC = () => {
  const [vehicle, setVehicle] = useState<TransportVehicle | null>(null);
  const [stops, setStops] = useState<RouteStop[]>([]);
  const [editingStopId, setEditingStopId] = useState<string | null>(null);
  const [editStopName, setEditStopName] = useState('');
  const [editStopTime, setEditStopTime] = useState('');
  const [editStopLat, setEditStopLat] = useState('');
  const [editStopLng, setEditStopLng] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTime, setNewTime] = useState('08:00');
  const [newLat, setNewLat] = useState('');
  const [newLng, setNewLng] = useState('');
  const [editRouteName, setEditRouteName] = useState(false);
  const [routeNameInput, setRouteNameInput] = useState('');

  useEffect(() => {
    const v = transportService.getVehicles().find(v => v.driverId === DRIVER_ID);
    if (v) { setVehicle(v); setStops(v.stops); setRouteNameInput(v.routeName); }
  }, []);

  const reload = () => {
    const v = transportService.getVehicleById(vehicle!.id);
    if (v) { setVehicle(v); setStops(v.stops); }
  };

  const handleSaveRouteName = () => {
    if (!vehicle || !routeNameInput.trim()) return;
    transportService.setRouteName(vehicle.id, routeNameInput);
    setVehicle(v => v ? { ...v, routeName: routeNameInput } : v);
    setEditRouteName(false);
  };

  const handleAddStop = () => {
    if (!vehicle || !newName.trim() || !newLat || !newLng) return;
    const lat = parseFloat(newLat), lng = parseFloat(newLng);
    if (isNaN(lat) || isNaN(lng)) return;
    transportService.addStop(vehicle.id, { name: newName, estimatedTime: newTime, lat, lng });
    reload();
    setNewName(''); setNewLat(''); setNewLng(''); setNewTime('08:00');
    setShowAdd(false);
  };

  const handleEditStop = () => {
    if (!vehicle || !editingStopId || !editStopName.trim()) return;
    const lat = parseFloat(editStopLat), lng = parseFloat(editStopLng);
    transportService.updateStop(vehicle.id, editingStopId, {
      name: editStopName,
      estimatedTime: editStopTime,
      lat: isNaN(lat) ? undefined : lat,
      lng: isNaN(lng) ? undefined : lng,
    });
    reload();
    setEditingStopId(null);
  };

  const handleDeleteStop = (stopId: string) => {
    if (!vehicle) return;
    transportService.removeStop(vehicle.id, stopId);
    reload();
  };

  if (!vehicle) return (
    <div className="flex flex-col items-center justify-center p-10 text-center">
      <MapPin size={40} className="text-slate-200 mb-3" />
      <p className="font-extrabold text-slate-900">No Vehicle Assigned</p>
      <p className="text-xs font-bold text-slate-400 mt-1">Contact principal for vehicle assignment</p>
    </div>
  );

  return (
    <div className="flex flex-col gap-4 px-5 pt-4 pb-32 animate-in fade-in duration-300">

      {/* Route Name */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Route Name</p>
        {editRouteName ? (
          <div className="flex gap-2">
            <input value={routeNameInput} onChange={e => setRouteNameInput(e.target.value)}
              placeholder="e.g. Route A — Dwarka"
              className="flex-1 border border-slate-200 bg-slate-50 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-500" />
            <button onClick={handleSaveRouteName} className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <Check size={18} />
            </button>
            <button onClick={() => { setEditRouteName(false); setRouteNameInput(vehicle.routeName); }}
              className="p-2 bg-slate-100 text-slate-500 rounded-xl">
              <X size={18} />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-base font-black text-slate-900">{vehicle.routeName || '—'}</span>
            <button onClick={() => setEditRouteName(true)}
              className="p-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100">
              <Edit2 size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Stops List */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
            Stops · {stops.length}
          </p>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-1 text-[10px] font-black text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full hover:bg-blue-100">
            <Plus size={12} /> Add Stop
          </button>
        </div>

        {stops.length === 0 ? (
          <div className="text-center py-8 px-4">
            <MapPin size={32} className="text-slate-200 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-400">No stops yet</p>
            <button onClick={() => setShowAdd(true)}
              className="mt-3 px-4 py-2 bg-blue-600 text-white font-black text-xs rounded-xl mx-auto flex items-center gap-1">
              <Plus size={12} /> Add First Stop
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {stops.map((stop, idx) => (
              <div key={stop.id}>
                {editingStopId === stop.id ? (
                  <div className="p-4 space-y-2 bg-blue-50/30">
                    <input value={editStopName} onChange={e => setEditStopName(e.target.value)}
                      placeholder="Stop name"
                      className="w-full border border-slate-200 bg-white rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-500" />
                    <input type="time" value={editStopTime} onChange={e => setEditStopTime(e.target.value)}
                      className="w-full border border-slate-200 bg-white rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-500" />
                    <div className="grid grid-cols-2 gap-2">
                      <input value={editStopLat} onChange={e => setEditStopLat(e.target.value)}
                        placeholder="Latitude"
                        className="border border-slate-200 bg-white rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-500" />
                      <input value={editStopLng} onChange={e => setEditStopLng(e.target.value)}
                        placeholder="Longitude"
                        className="border border-slate-200 bg-white rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-500" />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setEditingStopId(null)}
                        className="flex-1 py-2 bg-slate-100 text-slate-700 font-black rounded-xl text-sm">Cancel</button>
                      <button onClick={handleEditStop}
                        className="flex-1 py-2 bg-blue-600 text-white font-black rounded-xl text-sm flex items-center justify-center gap-1">
                        <Check size={14} /> Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-black text-xs shrink-0">
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-extrabold text-slate-900 text-sm">{stop.name}</div>
                      <div className="text-[10px] font-bold text-slate-400 mt-0.5">
                        {stop.estimatedTime} · {stop.lat.toFixed(4)}, {stop.lng.toFixed(4)}
                      </div>
                    </div>
                    <button onClick={() => {
                      setEditingStopId(stop.id);
                      setEditStopName(stop.name);
                      setEditStopTime(stop.estimatedTime);
                      setEditStopLat(stop.lat.toString());
                      setEditStopLng(stop.lng.toString());
                    }} className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg shrink-0">
                      <Edit2 size={15} />
                    </button>
                    <button onClick={() => handleDeleteStop(stop.id)}
                      className="p-2 text-rose-400 hover:bg-rose-50 rounded-lg shrink-0">
                      <X size={15} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Stop Form */}
      {showAdd && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Add New Stop</p>
            <button onClick={() => setShowAdd(false)} className="text-slate-400"><X size={16} /></button>
          </div>
          <input value={newName} onChange={e => setNewName(e.target.value)}
            placeholder="Stop name (e.g. Dwarka Sector 7)"
            className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-500" />
          <input type="time" value={newTime} onChange={e => setNewTime(e.target.value)}
            className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-500" />
          <div className="grid grid-cols-2 gap-2">
            <input value={newLat} onChange={e => setNewLat(e.target.value)}
              placeholder="Latitude"
              className="border border-slate-200 bg-slate-50 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-500" />
            <input value={newLng} onChange={e => setNewLng(e.target.value)}
              placeholder="Longitude"
              className="border border-slate-200 bg-slate-50 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-500" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowAdd(false)}
              className="flex-1 py-2.5 bg-slate-100 text-slate-700 font-black rounded-xl">Cancel</button>
            <button onClick={handleAddStop}
              className="flex-1 py-2.5 bg-blue-600 text-white font-black rounded-xl flex items-center justify-center gap-1">
              <Plus size={14} /> Add Stop
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
