import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, Bus, Users, MapPin, Phone, Plus, Trash2, ChevronDown,
  Edit2, Check, X, Navigation,
} from 'lucide-react';
import {
  transportService, TransportVehicle, StudentTransportAssignment, TransportStudent,
} from '../../../services/transport.service';
import { staffService } from '../../../services/staff.service';
import { StaffMember } from '../../../types/principal.types';

type Tab = 'VEHICLES' | 'DRIVERS' | 'ROUTES' | 'STUDENTS';

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

  useEffect(() => {
    Promise.all([
      Promise.resolve(transportService.getVehicles()),
      Promise.resolve(transportService.getAssignments()),
      Promise.resolve(transportService.getStudents()),
      staffService.getAll?.() || Promise.resolve([]),
    ]).then(([v, a, s, f]) => {
      setVehicles(v);
      setAssignments(a);
      setStudents(s);
      setStaff(f);
    });
  }, []);

  const getDriverStaff = () => staff.filter(s => s.role === 'DRIVER');
  const getAssignedCount = (vehicleId: string) =>
    assignments.filter(a => a.vehicleId === vehicleId).length;

  const handleAddVehicle = () => {
    if (!newVehicleName.trim()) return;
    const v = transportService.addVehicle({
      vehicleNo: newVehicleName,
      type: newVehicleType,
      capacity: Number(newVehicleCapacity),
      routeName: '',
    });
    setVehicles([...vehicles, v]);
    setNewVehicleName('');
    setNewVehicleType('BUS');
    setNewVehicleCapacity('50');
  };

  const handleDeleteVehicle = (id: string) => {
    transportService.deleteVehicle(id);
    setVehicles(vehicles.filter(v => v.id !== id));
    setAssignments(assignments.filter(a => a.vehicleId !== id));
  };

  const handleAssignDriver = (vehicleId: string, staffId: string) => {
    const s = staff.find(x => x.id === staffId);
    if (!s) return;
    transportService.assignDriver(vehicleId, staffId, s.name, s.phone);
    setVehicles(vehicles.map(v =>
      v.id === vehicleId ? { ...v, driverId: staffId, driverName: s.name, driverPhone: s.phone } : v
    ));
  };

  const handleRemoveDriver = (vehicleId: string) => {
    transportService.removeDriver(vehicleId);
    setVehicles(vehicles.map(v =>
      v.id === vehicleId ? { ...v, driverId: null, driverName: '—', driverPhone: '—' } : v
    ));
  };

  const handleSetRouteName = (vehicleId: string, name: string) => {
    transportService.setRouteName(vehicleId, name);
    setVehicles(vehicles.map(v => v.id === vehicleId ? { ...v, routeName: name } : v));
  };

  const handleAddStop = (vehicleId: string) => {
    if (!newStopName.trim()) return;
    const stop = transportService.addStop(vehicleId, {
      name: newStopName,
      estimatedTime: newStopTime,
      lat: 28.6 + Math.random() * 0.1,
      lng: 77.2 + Math.random() * 0.1,
    });
    setVehicles(vehicles.map(v =>
      v.id === vehicleId ? { ...v, stops: [...v.stops, stop] } : v
    ));
    setNewStopName('');
    setNewStopTime('08:00');
  };

  const handleRemoveStop = (vehicleId: string, stopId: string) => {
    transportService.removeStop(vehicleId, stopId);
    setVehicles(vehicles.map(v =>
      v.id === vehicleId ? { ...v, stops: v.stops.filter(s => s.id !== stopId) } : v
    ));
  };

  const handleAssignStudent = () => {
    if (!selectedStudentId || !selectedVehicleId || !selectedStopId) return;
    const student = students.find(s => s.id === selectedStudentId);
    const vehicle = vehicles.find(v => v.id === selectedVehicleId);
    const stop = vehicle?.stops.find(s => s.id === selectedStopId);
    if (!student || !vehicle || !stop) return;

    transportService.assignStudent(
      student.id, student.name, student.className,
      vehicle.id, stop.id, stop.name
    );
    setAssignments(transportService.getAssignments());
    setSelectedStudentId(null);
    setSelectedVehicleId(null);
    setSelectedStopId(null);
  };

  const handleRemoveAssignment = (studentId: string) => {
    transportService.removeStudentAssignment(studentId);
    setAssignments(transportService.getAssignments());
  };

  return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
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
          {(['VEHICLES', 'DRIVERS', 'ROUTES', 'STUDENTS'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`shrink-0 px-4 py-3 text-[10px] font-black uppercase tracking-widest border-b-2 transition-colors ${
                tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400'
              }`}>
              {t === 'VEHICLES' && '🚌 Vehicles'}
              {t === 'DRIVERS' && '👨‍✈️ Drivers'}
              {t === 'ROUTES' && '🗺️ Routes'}
              {t === 'STUDENTS' && '👥 Students'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-3">

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
                  {transportService.getUnassignedStudents().map(s => (
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
