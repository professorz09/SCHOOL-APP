import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, Bus, Users, MapPin, Phone, Plus, Trash2, ChevronDown,
  Edit2, Check, X, Navigation, Map, Activity, Clock, AlertCircle,
} from 'lucide-react';
import {
  transportService, TransportVehicle, StudentTransportAssignment, TransportStudent,
} from '../../../services/transport.service';
import { staffService } from '../../../services/staff.service';
import { StaffMember } from '../../../types/principal.types';

type Tab = 'VEHICLES' | 'DRIVERS' | 'ROUTES' | 'STUDENTS' | 'LOCATIONS';

interface Props { onBack: () => void; }

export const TransportManager: React.FC<Props> = ({ onBack }) => {
  const [tab, setTab] = useState<Tab>('VEHICLES');
  const [vehicles, setVehicles] = useState<TransportVehicle[]>([]);
  const [assignments, setAssignments] = useState<StudentTransportAssignment[]>([]);
  const [students, setStudents] = useState<TransportStudent[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);

  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [editingRouteId, setEditingRouteId] = useState<string | null>(null);
  const [newVehicleName, setNewVehicleName] = useState('');
  const [newVehicleType, setNewVehicleType] = useState<'BUS' | 'VAN' | 'MINI_BUS'>('BUS');
  const [newVehicleCapacity, setNewVehicleCapacity] = useState('50');
  const [newRouteName, setNewRouteName] = useState('');
  const [newStopName, setNewStopName] = useState('');
  const [newStopTime, setNewStopTime] = useState('08:00');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);

  const reloadAll = async () => {
    await transportService.refreshAll();
    const [s, f] = await Promise.all([
      transportService.getStudents(),
      staffService.getAll?.() ?? Promise.resolve([]),
    ]);
    setVehicles(transportService.getVehicles());
    setAssignments(transportService.getAssignments());
    setStudents(s);
    setStaff(f);
  };

  useEffect(() => { void reloadAll(); }, []);

  const getDriverStaff = () => staff.filter(s => s.role === 'DRIVER');
  const getAssignedCount = (vehicleId: string) =>
    assignments.filter(a => a.vehicleId === vehicleId).length;
  const assignedIds = new Set(assignments.map(a => a.studentId));
  const unassignedStudents = students.filter(s => !assignedIds.has(s.id));

  const handleAddVehicle = async () => {
    if (!newVehicleName.trim()) return;
    await transportService.addVehicle({
      vehicleNo: newVehicleName,
      type: newVehicleType,
      capacity: Number(newVehicleCapacity),
      routeName: '',
    });
    setVehicles(transportService.getVehicles());
    setNewVehicleName('');
    setNewVehicleType('BUS');
    setNewVehicleCapacity('50');
  };

  const handleDeleteVehicle = async (id: string) => {
    await transportService.deleteVehicle(id);
    setVehicles(transportService.getVehicles());
    setAssignments(transportService.getAssignments());
  };

  const handleAssignDriver = async (vehicleId: string, staffId: string) => {
    const s = staff.find(x => x.id === staffId);
    if (!s) return;
    await transportService.assignDriver(vehicleId, staffId, s.name, s.phone);
    setVehicles(transportService.getVehicles());
  };

  const handleRemoveDriver = async (vehicleId: string) => {
    await transportService.removeDriver(vehicleId);
    setVehicles(transportService.getVehicles());
  };

  const handleSetRouteName = async (vehicleId: string, name: string) => {
    await transportService.setRouteName(vehicleId, name);
    setVehicles(vehicles.map(v => v.id === vehicleId ? { ...v, routeName: name } : v));
  };

  const handleAddStop = async (vehicleId: string) => {
    if (!newStopName.trim()) return;
    await transportService.addStop(vehicleId, {
      name: newStopName,
      estimatedTime: newStopTime,
      lat: 28.6 + Math.random() * 0.1,
      lng: 77.2 + Math.random() * 0.1,
    });
    setVehicles(transportService.getVehicles());
    setNewStopName('');
    setNewStopTime('08:00');
  };

  const handleRemoveStop = async (vehicleId: string, stopId: string) => {
    await transportService.removeStop(vehicleId, stopId);
    setVehicles(transportService.getVehicles());
  };

  const handleAssignStudent = async () => {
    if (!selectedStudentId || !selectedVehicleId || !selectedStopId) return;
    const student = students.find(s => s.id === selectedStudentId);
    const vehicle = vehicles.find(v => v.id === selectedVehicleId);
    const stop = vehicle?.stops.find(s => s.id === selectedStopId);
    if (!student || !vehicle || !stop) return;

    await transportService.assignStudent(
      student.id, student.name, student.className,
      vehicle.id, stop.id, stop.name
    );
    // Refresh both assignments and the source student list so the
    // unassigned/assigned UI immediately reflects the new state, even
    // if a concurrent admission/transfer changed the underlying students.
    setAssignments(transportService.getAssignments());
    setStudents(await transportService.getStudents());
    setSelectedStudentId(null);
    setSelectedVehicleId(null);
    setSelectedStopId(null);
  };

  const handleRemoveAssignment = async (studentId: string) => {
    await transportService.removeStudentAssignment(studentId);
    setAssignments(transportService.getAssignments());
    setStudents(await transportService.getStudents());
  };

  return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-0 sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-3 pb-3">
          <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full">
            <ArrowLeft size={20} className="text-slate-600" />
          </button>
          <div>
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Transport Management</h2>
            <p className="text-[10px] font-bold text-slate-400">Vehicles · Drivers · Routes · Students</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-t border-slate-100 overflow-x-auto hide-scrollbar">
          {(['VEHICLES', 'DRIVERS', 'LOCATIONS', 'ROUTES', 'STUDENTS'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`shrink-0 px-4 py-3 text-[10px] font-black uppercase tracking-widest border-b-2 transition-colors ${
                tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400'
              }`}>
              {t === 'VEHICLES' && '🚌 Vehicles'}
              {t === 'DRIVERS' && '👨‍✈️ Drivers'}
              {t === 'LOCATIONS' && '📍 Locations'}
              {t === 'ROUTES' && '🗺️ Routes'}
              {t === 'STUDENTS' && '👥 Students'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto p-4  space-y-3">

        {/* VEHICLES TAB */}
        {tab === 'VEHICLES' && (
          <>
            {/* Add vehicle form */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Add Vehicle</p>
              <div className="grid grid-cols-2 gap-2">
                <input value={newVehicleName} onChange={e => setNewVehicleName(e.target.value)}
                  placeholder="Vehicle No. (e.g., DL-01-CA-1234)"
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-500" />
                <select value={newVehicleType} onChange={e => setNewVehicleType(e.target.value as any)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-500 appearance-none">
                  <option>BUS</option>
                  <option>VAN</option>
                  <option>MINI_BUS</option>
                </select>
                <input type="number" value={newVehicleCapacity} onChange={e => setNewVehicleCapacity(e.target.value)}
                  placeholder="Capacity"
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-500" />
                <button onClick={handleAddVehicle}
                  className="bg-blue-600 text-white font-black rounded-xl flex items-center justify-center gap-1.5">
                  <Plus size={14} /> Add
                </button>
              </div>
            </div>

            {/* Vehicles list */}
            {vehicles.map(v => (
              <div key={v.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-extrabold text-slate-900 text-sm">{v.vehicleNo}</div>
                    <div className="text-[10px] font-bold text-slate-400">{v.type} · {v.capacity} capacity</div>
                  </div>
                  <button onClick={() => handleDeleteVehicle(v.id)}
                    className="p-2 hover:bg-rose-50 text-rose-400 rounded-lg">
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="flex items-center gap-2 text-[10px]">
                  <Bus size={12} className="text-slate-400" />
                  <span className="font-bold text-slate-600">{getAssignedCount(v.id)} students assigned</span>
                </div>
              </div>
            ))}
          </>
        )}

        {/* DRIVERS TAB */}
        {tab === 'DRIVERS' && (
          <>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Assign Drivers to Vehicles</p>
            {vehicles.map(v => (
              <div key={v.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="font-extrabold text-slate-900">{v.vehicleNo}</div>
                    <div className="text-[10px] font-bold text-slate-400">{v.type}</div>
                  </div>
                  {v.driverId ? (
                    <button onClick={() => handleRemoveDriver(v.id)}
                      className="text-[9px] font-black text-rose-500 bg-rose-50 px-2 py-1 rounded-full">
                      Remove
                    </button>
                  ) : null}
                </div>

                {v.driverId ? (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span className="font-black text-emerald-700 text-sm">{v.driverName}</span>
                    </div>
                    <a href={`tel:${v.driverPhone}`} className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                      <Phone size={10} /> {v.driverPhone}
                    </a>
                  </div>
                ) : (
                  <div className="relative">
                    <select onChange={e => handleAssignDriver(v.id, e.target.value)}
                      defaultValue=""
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-500 appearance-none">
                      <option value="">Select Driver...</option>
                      {getDriverStaff().map(d => (
                        <option key={d.id} value={d.id}>{d.name} ({d.phone})</option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                )}
              </div>
            ))}
          </>
        )}

        {/* LOCATIONS TAB */}
        {tab === 'LOCATIONS' && (
          <>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Real-time Vehicle Locations</p>
            {vehicles.map(v => {
              const nextStopIdx = (v.lastStopIndex ?? -1) + 1;
              const nextStop = v.stops[nextStopIdx];
              const lastStop = v.lastStopIndex !== undefined && v.lastStopIndex >= 0 ? v.stops[v.lastStopIndex] : null;
              const isActive = v.driverId && v.isActive;

              return (
                <div key={v.id} className={`rounded-2xl border shadow-sm p-4 space-y-3 ${
                  isActive ? 'bg-white border-slate-100' : 'bg-slate-50 border-slate-100 opacity-60'
                }`}>
                  {/* Vehicle Header */}
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                        <Bus size={14} className="text-amber-600" />
                        {v.vehicleNo}
                      </div>
                      <div className="text-[10px] font-bold text-slate-400 mt-1">{v.routeName || '—'}</div>
                    </div>
                    <div className={`w-3 h-3 rounded-full shrink-0 ${
                      isActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'
                    }`} />
                  </div>

                  {/* Driver Info */}
                  {v.driverId && (
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-2.5 space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-blue-600" />
                        <span className="text-sm font-black text-blue-900">{v.driverName}</span>
                      </div>
                      <a href={`tel:${v.driverPhone}`} className="text-[10px] font-bold text-blue-600 flex items-center gap-1">
                        <Phone size={10} /> {v.driverPhone}
                      </a>
                    </div>
                  )}

                  {/* Current Location (Simulated GPS) */}
                  {isActive && (
                    <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-2.5">
                      <div className="flex items-center gap-2 mb-1">
                        <MapPin size={12} className="text-emerald-600" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-emerald-700">Current Location</span>
                      </div>
                      <div className="text-[10px] font-mono text-emerald-900">
                        {(28.6139 + Math.random() * 0.05).toFixed(4)}, {(77.2090 + Math.random() * 0.05).toFixed(4)}
                      </div>
                    </div>
                  )}

                  {/* Progress */}
                  <div className="border-t border-slate-100 pt-2.5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Progress</span>
                      <span className="text-[9px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                        {nextStopIdx}/{v.stops.length}
                      </span>
                    </div>

                    {lastStop && (
                      <div className="flex items-center gap-2 mb-2 bg-slate-50 rounded-lg p-2">
                        <Clock size={12} className="text-emerald-600 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] font-black text-emerald-700 line-through">{lastStop.name}</div>
                          <div className="text-[8px] font-bold text-emerald-600">Reached at {lastStop.estimatedTime}</div>
                        </div>
                      </div>
                    )}

                    {nextStop && (
                      <div className="flex items-center gap-2 bg-blue-50 rounded-lg p-2">
                        <AlertCircle size={12} className="text-blue-600 shrink-0 animate-pulse" />
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] font-black text-blue-900">{nextStop.name}</div>
                          <div className="text-[8px] font-bold text-blue-600">Next stop • ETA {nextStop.estimatedTime}</div>
                        </div>
                      </div>
                    )}

                    {nextStopIdx >= v.stops.length && (
                      <div className="text-[9px] font-bold text-emerald-600 text-center py-2 bg-emerald-50 rounded-lg">
                        ✓ Trip Completed
                      </div>
                    )}
                  </div>

                  {/* Students Count */}
                  <div className="text-[10px] font-bold text-slate-600 flex items-center gap-2">
                    <Users size={12} className="text-slate-400" />
                    {getAssignedCount(v.id)} students on board
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* ROUTES TAB */}
        {tab === 'ROUTES' && (
          <>
            {vehicles.map(v => (
              <div key={v.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                    {v.vehicleNo} - Route Setup
                  </p>
                  {editingRouteId === v.id ? (
                    <div className="flex gap-2">
                      <input value={newRouteName} onChange={e => setNewRouteName(e.target.value)}
                        placeholder="Route name (e.g., Route A - Dwarka)"
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-500" />
                      <button onClick={() => {
                        handleSetRouteName(v.id, newRouteName);
                        setEditingRouteId(null);
                        setNewRouteName('');
                      }} className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                        <Check size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 text-sm font-black text-slate-900">
                        {v.routeName || '—'}
                      </div>
                      <button onClick={() => {
                        setEditingRouteId(v.id);
                        setNewRouteName(v.routeName);
                      }} className="p-2 hover:bg-blue-50 text-blue-500 rounded-lg">
                        <Edit2 size={14} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Stops */}
                <div className="border-t border-slate-100 pt-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Stops</p>
                  <div className="space-y-2 mb-3">
                    {v.stops.map(stop => (
                      <div key={stop.id} className="flex items-start justify-between bg-slate-50 rounded-xl p-2.5">
                        <div className="flex-1">
                          <div className="font-bold text-slate-900 text-sm">{stop.name}</div>
                          <div className="text-[10px] font-bold text-slate-400">{stop.estimatedTime}</div>
                        </div>
                        <button onClick={() => handleRemoveStop(v.id, stop.id)}
                          className="p-1 hover:bg-rose-50 text-rose-400 rounded">
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Add stop */}
                  <div className="flex gap-2">
                    <input value={newStopName} onChange={e => setNewStopName(e.target.value)}
                      placeholder="Stop name"
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold outline-none focus:border-blue-500" />
                    <input type="time" value={newStopTime} onChange={e => setNewStopTime(e.target.value)}
                      className="w-24 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold outline-none focus:border-blue-500" />
                    <button onClick={() => handleAddStop(v.id)}
                      className="px-3 py-1.5 bg-blue-600 text-white font-black text-xs rounded-lg flex items-center gap-1">
                      <Plus size={12} /> Add
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        {/* STUDENTS TAB */}
        {tab === 'STUDENTS' && (
          <>
            {/* Assign form */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Assign Student to Vehicle</p>
              <div className="relative">
                <select value={selectedStudentId || ''} onChange={e => setSelectedStudentId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-500 appearance-none">
                  <option value="">Select Student...</option>
                  {unassignedStudents.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.className})</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>

              {selectedStudentId && (
                <>
                  <div className="relative">
                    <select value={selectedVehicleId || ''} onChange={e => setSelectedVehicleId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-500 appearance-none">
                      <option value="">Select Vehicle...</option>
                      {vehicles.map(v => (
                        <option key={v.id} value={v.id}>{v.vehicleNo} ({v.routeName})</option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>

                  {selectedVehicleId && (
                    <div className="relative">
                      <select value={selectedStopId || ''} onChange={e => setSelectedStopId(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-500 appearance-none">
                        <option value="">Select Boarding Stop...</option>
                        {vehicles.find(v => v.id === selectedVehicleId)?.stops.map(s => (
                          <option key={s.id} value={s.id}>{s.name} ({s.estimatedTime})</option>
                        ))}
                      </select>
                      <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                  )}

                  <button onClick={handleAssignStudent}
                    disabled={!selectedStudentId || !selectedVehicleId || !selectedStopId}
                    className="w-full py-2.5 bg-emerald-600 text-white font-black rounded-xl disabled:opacity-40 flex items-center justify-center gap-1.5">
                    <Check size={16} /> Assign Student
                  </button>
                </>
              )}
            </div>

            {/* Assignments */}
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Current Assignments</p>
            {assignments.map(a => (
              <div key={a.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3.5">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-extrabold text-slate-900 text-sm">{a.studentName}</div>
                    <div className="text-[10px] font-bold text-slate-400">{a.className}</div>
                  </div>
                  <button onClick={() => handleRemoveAssignment(a.studentId)}
                    className="p-1 hover:bg-rose-50 text-rose-400">
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="flex items-center gap-2 text-[10px]">
                  <Bus size={12} className="text-slate-400" />
                  <span className="font-bold text-slate-600">
                    {vehicles.find(v => v.id === a.vehicleId)?.vehicleNo}
                  </span>
                  <MapPin size={12} className="text-slate-400 ml-1" />
                  <span className="font-bold text-slate-600">{a.boardingStopName}</span>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
};
