import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ArrowLeft, Bus, Users, MapPin, Phone, Plus, Trash2, ChevronDown,
  Edit2, Check, X, Navigation, AlertTriangle, Shuffle,
  CheckCircle2, Circle, Clock, UserCheck, RefreshCw, ChevronRight, History,
} from 'lucide-react';
import {
  transportService, TransportVehicle, StudentTransportAssignment, TransportStudent,
  TRANSPORT_CHANGE_REASONS,
} from '@/modules/transport/transport.service';
import { staffService } from '@/modules/staff/staff.service';
import { StaffMember } from '@/modules/staff/staff.types';
import { useRealtimeTable } from '@/shared/hooks/useRealtimeTable';
import { useUIStore } from '@/store/uiStore';

type Tab = 'VEHICLES' | 'TRACKING' | 'STUDENTS';

interface Props { onBack: () => void; }

// ─── Stop status builder ──────────────────────────────────────────────────────
function buildStopsWithStatus(vehicle: TransportVehicle) {
  const lastIdx = vehicle.lastStopIndex ?? -1;
  return vehicle.stops.map((stop, i) => ({
    ...stop,
    status: (
      lastIdx >= 0 && i < lastIdx  ? 'COMPLETED' :
      lastIdx >= 0 && i === lastIdx ? 'CURRENT'   :
      lastIdx < 0  && i === 0       ? 'CURRENT'   :
      'UPCOMING'
    ) as 'COMPLETED' | 'CURRENT' | 'UPCOMING',
  }));
}

export const TransportManager: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();
  // Default landing is the live-tracking view — principals open transport
  // 99% of the time to check where buses are, not to add a new vehicle.
  const [tab, setTab]                   = useState<Tab>('TRACKING');
  const [vehicles, setVehicles]         = useState<TransportVehicle[]>([]);
  const [assignments, setAssignments]   = useState<StudentTransportAssignment[]>([]);
  const [students, setStudents]         = useState<TransportStudent[]>([]);
  const [staff, setStaff]               = useState<StaffMember[]>([]);
  const [loading, setLoading]           = useState(true);
  const studentsLoadedRef               = useRef(false);
  const staffLoadedRef                  = useRef(false);

  // ── Driver history state ────────────────────────────────────────────────────
  const [driverHistoryId,      setDriverHistoryId]      = useState<string | null>(null);
  const [driverHistoryVehicle, setDriverHistoryVehicle] = useState<string>('');
  const [driverHistoryItems,   setDriverHistoryItems]   = useState<{ id: string; action: string; details: Record<string, unknown>; createdAt: string }[]>([]);
  const [driverHistoryShown,   setDriverHistoryShown]   = useState(50);
  const [driverHistoryLoading, setDriverHistoryLoading] = useState(false);

  // ── Vehicles tab state ──────────────────────────────────────────────────────
  const [newVehicleNo,       setNewVehicleNo]       = useState('');
  const [newVehicleType,     setNewVehicleType]     = useState<'BUS'|'VAN'|'MINI_BUS'>('BUS');
  const [newVehicleCapacity, setNewVehicleCapacity] = useState('50');
  const [addingVehicle,      setAddingVehicle]      = useState(false);

  // ── Route management sub-screen ─────────────────────────────────────────────
  const [routeVehicleId,  setRouteVehicleId]  = useState<string | null>(null);
  const [newRouteName,    setNewRouteName]    = useState('');
  const [editingRoute,    setEditingRoute]    = useState(false);
  const [newStopName,     setNewStopName]     = useState('');
  const [newStopTime,     setNewStopTime]     = useState('08:00');
  const [savingStop,      setSavingStop]      = useState(false);

  // ── Driver assignment ───────────────────────────────────────────────────────
  const [driverPickerId, setDriverPickerId] = useState<string | null>(null);

  // ── Tracking tab state ──────────────────────────────────────────────────────
  const [trackingVehicleId, setTrackingVehicleId] = useState<string | null>(null);

  // ── Students tab state ──────────────────────────────────────────────────────
  const [selStudentId,  setSelStudentId]  = useState<string | null>(null);
  const [selVehicleId,  setSelVehicleId]  = useState<string | null>(null);
  const [selStopId,     setSelStopId]     = useState<string | null>(null);
  const [assigning,     setAssigning]     = useState(false);

  // ── Bulk reassign modal ─────────────────────────────────────────────────────
  const [bulkFromId,       setBulkFromId]       = useState<string | null>(null);
  const [bulkToVehicleId,  setBulkToVehicleId]  = useState('');
  const [bulkToStopId,     setBulkToStopId]     = useState('');
  const [bulkDate,         setBulkDate]         = useState(() => new Date().toISOString().slice(0, 10));
  const [bulkReason,       setBulkReason]       = useState('VEHICLE_BREAKDOWN');
  const [bulkNote,         setBulkNote]         = useState('');
  const [bulkBusy,         setBulkBusy]         = useState(false);
  const [bulkErr,          setBulkErr]          = useState<string | null>(null);

  // ─── Data loading (lazy) ────────────────────────────────────────────────────
  // Core: vehicles + assignments — always needed
  const reloadCore = useCallback(async () => {
    await transportService.refreshAll();
    setVehicles(transportService.getVehicles());
    setAssignments(transportService.getAssignments());
  }, []);

  // Students: only needed for STUDENTS tab
  const loadStudents = useCallback(async () => {
    if (studentsLoadedRef.current) return;
    studentsLoadedRef.current = true;
    const studs = await transportService.getStudents();
    setStudents(studs);
  }, []);

  // Drivers (staff): only needed when driver picker is opened
  const loadDrivers = useCallback(async () => {
    if (staffLoadedRef.current) return;
    staffLoadedRef.current = true;
    const staffList = (await (staffService.getAll?.() ?? Promise.resolve([]))) as StaffMember[];
    setStaff(staffList);
  }, []);

  // Full refresh (manual refresh button or realtime trigger)
  const reloadAll = useCallback(async () => {
    studentsLoadedRef.current = false;
    staffLoadedRef.current = false;
    await reloadCore();
    if (tab === 'STUDENTS') await loadStudents();
  }, [reloadCore, loadStudents, tab]);

  useEffect(() => {
    setLoading(true);
    reloadCore().finally(() => setLoading(false));
  }, [reloadCore]);

  // Realtime subscriptions: refresh core on any transport table change
  useRealtimeTable('transport_vehicles',           reloadCore);
  useRealtimeTable('route_stops',                  reloadCore);
  useRealtimeTable('student_transport_assignments', reloadCore);
  useRealtimeTable('driver_locations',             reloadCore);

  // Auto-select first vehicle for tracking when vehicles load
  useEffect(() => {
    if (vehicles.length > 0 && !trackingVehicleId) {
      setTrackingVehicleId(vehicles[0].id);
    }
  }, [vehicles, trackingVehicleId]);

  // Lazy: load students when STUDENTS tab is opened
  useEffect(() => {
    if (tab === 'STUDENTS') void loadStudents();
  }, [tab, loadStudents]);

  // ─── Helpers ────────────────────────────────────────────────────────────────
  const drivers = staff.filter(s => s.role === 'DRIVER');
  const assignedIds = new Set(assignments.map(a => a.studentId));
  const unassignedStudents = students.filter(s => !assignedIds.has(s.id));
  const getCount = (vId: string) => assignments.filter(a => a.vehicleId === vId).length;
  const routeVehicle = routeVehicleId ? vehicles.find(v => v.id === routeVehicleId) : null;
  const trackVehicle = trackingVehicleId ? vehicles.find(v => v.id === trackingVehicleId) : null;

  // ─── Handlers ───────────────────────────────────────────────────────────────
  const handleAddVehicle = async () => {
    if (!newVehicleNo.trim()) return;
    // Validate capacity strictly — `|| 50` was silently masking invalid input
    // (0, NaN) and accepting negatives/huge values that broke isFull checks.
    const cap = Number(newVehicleCapacity);
    if (!Number.isInteger(cap) || cap < 1 || cap > 200) {
      showToast('Capacity must be a whole number between 1 and 200', 'error');
      return;
    }
    setAddingVehicle(true);
    try {
      await transportService.addVehicle({
        vehicleNo: newVehicleNo.trim(),
        type: newVehicleType,
        capacity: cap,
        routeName: '',
      });
      await reloadCore();
      const fresh = transportService.getVehicles();
      const created = fresh.find(v => v.vehicleNo === newVehicleNo.trim());
      setNewVehicleNo('');
      setNewVehicleType('BUS');
      setNewVehicleCapacity('50');
      if (created) { setRouteVehicleId(created.id); setNewRouteName(''); }
      showToast('Vehicle added');
    } catch (e) {
      // Was previously swallowed — a 400 from the server (e.g. duplicate
      // vehicle_no, validation failure) silently reset the spinner with no
      // user feedback, so the principal thought "add nahi ho raha".
      showToast(e instanceof Error ? e.message : 'Failed to add vehicle', 'error');
    } finally { setAddingVehicle(false); }
  };

  const handleDeleteVehicle = async (id: string) => {
    const v = transportService.getVehicleById(id);
    const label = v ? `${v.vehicleNo}${v.routeName ? ` (${v.routeName})` : ''}` : 'this vehicle';
    // Earlier this fired the delete on a single click with no
    // confirmation — accidental tap could remove a bus + cascade
    // student assignments. Now requires explicit confirm + surfaces
    // any server error (e.g. RLS, vehicle still has active students).
    const ok = await useUIStore.getState().askConfirm({
      title: `Delete ${label}?`,
      message: 'Vehicle ka record hat jayega. Saare assigned students se transport service hat jayegi. Past trip history audit me bachti hai.',
      confirmLabel: 'Delete Vehicle',
      destructive: true,
    });
    if (!ok) return;
    try {
      await transportService.deleteVehicle(id);
      await reloadCore();
      showToast(`${label} deleted`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not delete vehicle', 'error');
    }
  };

  const openDriverPicker = (vehicleId: string) => {
    setDriverPickerId(vehicleId);
    void loadDrivers();
  };

  const handleAssignDriver = async (vehicleId: string, staffId: string) => {
    if (!staffId) return;
    const s = staff.find(x => x.id === staffId);
    if (!s) return;
    try {
      await transportService.assignDriver(vehicleId, staffId, s.name, s.phone);
      setDriverPickerId(null);
      await reloadCore();
      showToast(`${s.name} assigned as driver`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Driver assign failed', 'error');
    }
  };

  const handleRemoveDriver = async (vehicleId: string) => {
    try {
      await transportService.removeDriver(vehicleId);
      await reloadCore();
      showToast('Driver removed from vehicle');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not remove driver', 'error');
    }
  };

  const handleSaveRouteName = async () => {
    if (!routeVehicleId) return;
    await transportService.setRouteName(routeVehicleId, newRouteName);
    setEditingRoute(false);
    await reloadCore();
  };

  const handleAddStop = async () => {
    if (!routeVehicleId || !newStopName.trim()) return;
    setSavingStop(true);
    try {
      await transportService.addStop(routeVehicleId, {
        name: newStopName.trim(),
        estimatedTime: newStopTime,
        lat: 0,
        lng: 0,
      });
      await reloadCore();
      setNewStopName('');
      setNewStopTime('08:00');
    } finally { setSavingStop(false); }
  };

  const handleRemoveStop = async (stopId: string) => {
    if (!routeVehicleId) return;
    await transportService.removeStop(routeVehicleId, stopId);
    await reloadCore();
  };

  const handleAssignStudent = async () => {
    // Stop is now optional — if the vehicle's route hasn't been mapped
    // yet, the principal can still assign the student to the vehicle;
    // the driver fills in stops on their first trip.
    if (!selStudentId || !selVehicleId) return;
    const student = students.find(s => s.id === selStudentId);
    const vehicle = vehicles.find(v => v.id === selVehicleId);
    if (!student || !vehicle) return;
    const stop = selStopId ? vehicle.stops.find(s => s.id === selStopId) : null;
    setAssigning(true);
    try {
      await transportService.assignStudent(
        student.id, student.name, student.className,
        vehicle.id, stop?.id ?? null, stop?.name ?? '',
      );
      studentsLoadedRef.current = false;
      await reloadCore();
      await loadStudents();
      setSelStudentId(null); setSelVehicleId(null); setSelStopId(null);
      showToast(`${student.name} assigned to ${vehicle.vehicleNo}`);
    } catch (e) {
      // Earlier this only had try/finally — assign failed, spinner stopped,
      // user got no feedback and assumed it worked. Surface the actual error.
      showToast(e instanceof Error ? e.message : 'Could not assign student to vehicle', 'error');
    } finally { setAssigning(false); }
  };

  const handleRemoveAssignment = async (studentId: string) => {
    await transportService.removeStudentAssignment(studentId);
    studentsLoadedRef.current = false;
    await reloadCore();
    await loadStudents();
  };

  const openDriverHistory = async (driverId: string, vehicleNo: string) => {
    setDriverHistoryId(driverId);
    setDriverHistoryVehicle(vehicleNo);
    setDriverHistoryItems([]);
    setDriverHistoryShown(50);
    setDriverHistoryLoading(true);
    try {
      const items = await transportService.getDriverHistory(driverId);
      setDriverHistoryItems(items);
    } finally {
      setDriverHistoryLoading(false);
    }
  };

  const handleBulkReassign = async () => {
    if (!bulkFromId || !bulkToVehicleId || !bulkToStopId || !bulkDate) {
      setBulkErr('Please fill all fields.'); return;
    }
    const reasonLabel = TRANSPORT_CHANGE_REASONS.find(r => r.value === bulkReason)?.label ?? bulkReason;
    const finalReason = bulkNote.trim() ? `${reasonLabel}: ${bulkNote.trim()}` : reasonLabel;
    setBulkBusy(true); setBulkErr(null);
    try {
      const { moved } = await transportService.bulkReassignVehicle({
        fromVehicleId: bulkFromId, toVehicleId: bulkToVehicleId,
        toStopId: bulkToStopId, effectiveDate: bulkDate, reason: finalReason,
      });
      studentsLoadedRef.current = false;
      await reloadCore();
      setBulkFromId(null);
      showToast(`Moved ${moved} student${moved === 1 ? '' : 's'} to new vehicle`);
    } catch (e) {
      setBulkErr(e instanceof Error ? e.message : 'Reassign failed');
    } finally { setBulkBusy(false); }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // ── ROUTE MANAGEMENT SUB-SCREEN ────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════
  if (routeVehicle) {
    return (
      <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        {/* Header */}
        <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 sticky top-0 z-10 shadow-sm">
          <div className="flex items-center gap-3">
            <button onClick={() => { setRouteVehicleId(null); setEditingRoute(false); }}
              className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
              <ArrowLeft size={20} />
            </button>
            <div className="flex-1">
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Manage Routes</h2>
              <p className="text-[10px] font-bold text-slate-400">{routeVehicle.vehicleNo} · {routeVehicle.type}</p>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-black text-slate-400">{routeVehicle.stops.length} stops</div>
              <div className="text-[10px] font-bold text-slate-400">{getCount(routeVehicle.id)} students</div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Route name */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Route Name</p>
            {editingRoute ? (
              <div className="flex gap-2">
                <input value={newRouteName} onChange={e => setNewRouteName(e.target.value)}
                  placeholder="e.g., Route A – Dwarka Express"
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-500" />
                <button onClick={handleSaveRouteName}
                  className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                  <Check size={16} />
                </button>
                <button onClick={() => setEditingRoute(false)}
                  className="p-2 bg-slate-100 text-slate-500 rounded-xl">
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className={`flex-1 text-sm font-black ${routeVehicle.routeName ? 'text-slate-900' : 'text-slate-300'}`}>
                  {routeVehicle.routeName || 'No route name set'}
                </span>
                <button onClick={() => { setEditingRoute(true); setNewRouteName(routeVehicle.routeName); }}
                  className="p-2 bg-blue-50 text-blue-500 rounded-xl">
                  <Edit2 size={14} />
                </button>
              </div>
            )}
          </div>

          {/* Stops list */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3">Stops</p>
            {routeVehicle.stops.length === 0 ? (
              <p className="text-sm font-bold text-slate-300 text-center py-4">No stops added yet</p>
            ) : (
              <div className="space-y-1 mb-4">
                {routeVehicle.stops.map((stop, i) => (
                  <div key={stop.id} className="flex items-center gap-3 bg-slate-50 rounded-xl px-3 py-2.5">
                    <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[9px] font-black shrink-0">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-slate-900 text-sm">{stop.name}</div>
                      <div className="text-[10px] font-bold text-slate-400">{stop.estimatedTime}</div>
                    </div>
                    <button onClick={() => handleRemoveStop(stop.id)}
                      className="p-1.5 hover:bg-rose-50 text-rose-400 rounded-lg shrink-0">
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add stop */}
            <div className="border-t border-slate-100 pt-3 space-y-2">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Add Stop</p>
              <input value={newStopName} onChange={e => setNewStopName(e.target.value)}
                placeholder="Stop name (e.g., Main Gate, Sector 12)"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-500" />
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[9px] font-bold text-slate-400 mb-1 block">Estimated time</label>
                  <input type="time" value={newStopTime} onChange={e => setNewStopTime(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-500" />
                </div>
                <div className="flex items-end">
                  <button onClick={handleAddStop} disabled={savingStop || !newStopName.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white font-black text-sm rounded-xl disabled:opacity-40">
                    <Plus size={14} /> {savingStop ? 'Adding…' : 'Add'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* After adding stops, guide to student assignment */}
          {routeVehicle.stops.length > 0 && (
            <button onClick={() => { setRouteVehicleId(null); setTab('STUDENTS'); setSelVehicleId(routeVehicle.id); }}
              className="w-full flex items-center justify-between bg-emerald-600 text-white rounded-2xl px-4 py-3.5 font-black text-sm active:scale-95 transition-transform">
              <span>Assign Students to This Vehicle</span>
              <ChevronRight size={18} />
            </button>
          )}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ── MAIN VIEW ──────────────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-0 sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-3 pb-3">
          <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full">
            <ArrowLeft size={20} className="text-slate-600" />
          </button>
          <div>
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Transport</h2>
            <p className="text-[10px] font-bold text-slate-400">{vehicles.length} vehicles · {assignments.length} students</p>
          </div>
          <button onClick={() => reloadAll()} className="ml-auto p-2 bg-slate-100 rounded-full text-slate-500">
            <RefreshCw size={14} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-t border-slate-100">
          {(['TRACKING', 'VEHICLES', 'STUDENTS'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest border-b-2 transition-colors ${
                tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400'
              }`}>
              {t === 'VEHICLES' && '🚌 Vehicles'}
              {t === 'TRACKING' && '📍 Tracking'}
              {t === 'STUDENTS' && '👥 Students'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">

        {/* ══ VEHICLES TAB ══════════════════════════════════════════════════════ */}
        {tab === 'VEHICLES' && (
          <>
            {/* Add vehicle form */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Add New Vehicle</p>
              <input value={newVehicleNo} onChange={e => setNewVehicleNo(e.target.value)}
                placeholder="Vehicle No. (e.g., DL-01-CA-1234)"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold outline-none focus:border-blue-500" />
              <div className="grid grid-cols-2 gap-2">
                <div className="relative">
                  <select value={newVehicleType} onChange={e => setNewVehicleType(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold outline-none focus:border-blue-500 appearance-none">
                    <option value="BUS">Bus</option>
                    <option value="VAN">Van</option>
                    <option value="MINI_BUS">Mini Bus</option>
                  </select>
                  <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
                <input type="number" value={newVehicleCapacity} onChange={e => setNewVehicleCapacity(e.target.value)}
                  placeholder="Capacity"
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold outline-none focus:border-blue-500" />
              </div>
              <button onClick={handleAddVehicle} disabled={addingVehicle || !newVehicleNo.trim()}
                className="w-full py-3 bg-blue-600 text-white font-black rounded-xl flex items-center justify-center gap-1.5 disabled:opacity-40 active:scale-95 transition-transform">
                <Plus size={15} /> {addingVehicle ? 'Adding…' : 'Add Vehicle & Set Up Routes'}
              </button>
            </div>

            {/* Vehicle list */}
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-7 h-7 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
              </div>
            ) : vehicles.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center">
                <Bus size={36} className="text-slate-200 mx-auto mb-3" />
                <p className="text-sm font-black text-slate-400">No vehicles yet</p>
                <p className="text-[10px] font-bold text-slate-300 mt-1">Add your first vehicle above</p>
              </div>
            ) : (
              vehicles.map(v => (
                <div key={v.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
                  {/* Vehicle header row */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center shrink-0">
                        <Bus size={18} className="text-orange-600" />
                      </div>
                      <div>
                        <div className="font-extrabold text-slate-900 text-sm">{v.vehicleNo}</div>
                        <div className="text-[10px] font-bold text-slate-400">{v.type} · {v.capacity} seats</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {getCount(v.id) > 0 && (
                        <button onClick={() => { setBulkFromId(v.id); setBulkToVehicleId(''); setBulkToStopId(''); setBulkErr(null); }}
                          title="Move all students to another vehicle"
                          className="p-2 hover:bg-amber-50 text-amber-500 rounded-lg">
                          <Shuffle size={14} />
                        </button>
                      )}
                      <button onClick={() => handleDeleteVehicle(v.id)}
                        className="p-2 hover:bg-rose-50 text-rose-400 rounded-lg">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-slate-50 rounded-xl py-2">
                      <div className="font-black text-slate-900 text-sm">{v.stops.length}</div>
                      <div className="text-[8px] font-bold text-slate-400">Stops</div>
                    </div>
                    <div className="bg-slate-50 rounded-xl py-2">
                      <div className="font-black text-slate-900 text-sm">{getCount(v.id)}</div>
                      <div className="text-[8px] font-bold text-slate-400">Students</div>
                    </div>
                    <div className="bg-slate-50 rounded-xl py-2">
                      <div className={`font-black text-sm ${v.driverId ? 'text-emerald-600' : 'text-slate-300'}`}>
                        {v.driverId ? '✓' : '—'}
                      </div>
                      <div className="text-[8px] font-bold text-slate-400">Driver</div>
                    </div>
                  </div>

                  {/* Driver assignment */}
                  {v.driverId ? (
                    <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2.5">
                      <UserCheck size={14} className="text-emerald-600 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-black text-emerald-800 text-sm">{v.driverName}</div>
                        <a href={`tel:${v.driverPhone}`} className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                          <Phone size={9} /> {v.driverPhone}
                        </a>
                      </div>
                      <button onClick={() => openDriverHistory(v.driverId!, v.vehicleNo)}
                        title="View driver history"
                        className="p-1.5 bg-white border border-emerald-100 text-emerald-600 rounded-lg">
                        <History size={12} />
                      </button>
                      <button onClick={() => handleRemoveDriver(v.id)}
                        className="text-[9px] font-black text-rose-500 bg-rose-50 border border-rose-100 px-2.5 py-1 rounded-full">
                        Remove
                      </button>
                    </div>
                  ) : driverPickerId === v.id ? (
                    <div className="flex gap-2 items-center">
                      <div className="relative flex-1">
                        <select defaultValue="" onChange={e => handleAssignDriver(v.id, e.target.value)}
                          className="w-full bg-slate-50 border border-blue-300 rounded-xl px-3 py-2 text-sm font-bold outline-none appearance-none">
                          <option value="">Select Driver…</option>
                          {drivers.map(d => (
                            <option key={d.id} value={d.id}>{d.name} · {d.phone}</option>
                          ))}
                        </select>
                        <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>
                      <button onClick={() => setDriverPickerId(null)}
                        className="p-2 bg-slate-100 rounded-xl text-slate-500">
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => openDriverPicker(v.id)}
                      className="w-full flex items-center justify-center gap-1.5 py-2 border border-dashed border-slate-200 rounded-xl text-[10px] font-black text-slate-400 hover:bg-slate-50">
                      <UserCheck size={12} /> Assign Driver
                    </button>
                  )}

                  {/* Route management CTA */}
                  <button onClick={() => { setRouteVehicleId(v.id); setEditingRoute(false); setNewRouteName(v.routeName); }}
                    className="w-full flex items-center justify-between bg-slate-900 text-white rounded-xl px-4 py-3 font-black text-xs uppercase tracking-widest active:scale-95 transition-transform">
                    <div className="flex items-center gap-2">
                      <MapPin size={13} />
                      {v.routeName ? `Route: ${v.routeName}` : 'Set up Routes & Stops'}
                    </div>
                    <ChevronRight size={14} />
                  </button>
                </div>
              ))
            )}
          </>
        )}

        {/* ══ TRACKING TAB ══════════════════════════════════════════════════════ */}
        {tab === 'TRACKING' && (
          <>
            {vehicles.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center">
                <Bus size={36} className="text-slate-200 mx-auto mb-3" />
                <p className="text-sm font-black text-slate-400">No vehicles added yet</p>
              </div>
            ) : (
              <>
                {/* Vehicle selector */}
                <div className="flex gap-2 overflow-x-auto hide-scrollbar -mx-1 px-1 pb-1">
                  {vehicles.map(v => (
                    <button key={v.id} onClick={() => setTrackingVehicleId(v.id)}
                      className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black border-2 transition-colors ${
                        trackingVehicleId === v.id
                          ? 'bg-slate-900 border-slate-900 text-white'
                          : 'bg-white border-slate-200 text-slate-600'
                      }`}>
                      <Bus size={11} />
                      {v.vehicleNo}
                    </button>
                  ))}
                </div>

                {/* Vehicle tracker */}
                {trackVehicle && (() => {
                  const stopsWithStatus = buildStopsWithStatus(trackVehicle);
                  const currentStop = stopsWithStatus.find(s => s.status === 'CURRENT');
                  const nextStop = stopsWithStatus.find(s => s.status === 'UPCOMING');
                  const isActive = !!trackVehicle.driverId && trackVehicle.isActive;
                  const tripDone = trackVehicle.stops.length > 0 &&
                    (trackVehicle.lastStopIndex ?? -1) >= trackVehicle.stops.length - 1;

                  return (
                    <div className="space-y-3">
                      {/* Dark vehicle card */}
                      <div className="bg-slate-900 rounded-2xl p-4 text-white">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Bus size={18} className="text-orange-400" />
                            <span className="font-black text-white text-base">{trackVehicle.vehicleNo}</span>
                            <span className="text-[9px] font-black text-slate-400">{trackVehicle.type}</span>
                          </div>
                          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full ${
                            isActive ? 'bg-emerald-500/20' : 'bg-slate-700'
                          }`}>
                            <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                            <span className={`text-[9px] font-black ${isActive ? 'text-emerald-400' : 'text-slate-400'}`}>
                              {isActive ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Current Stop</div>
                            <div className="font-black text-sm text-white mt-0.5">{currentStop?.name ?? (tripDone ? 'Trip Done' : '—')}</div>
                          </div>
                          <div>
                            <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Next Stop</div>
                            <div className="font-black text-sm text-amber-300 mt-0.5">{nextStop?.name ?? '—'}</div>
                          </div>
                          <div>
                            <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Driver</div>
                            <div className="font-black text-sm text-white mt-0.5">{trackVehicle.driverName || '—'}</div>
                          </div>
                          <div>
                            <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Students</div>
                            <div className="font-black text-sm text-white mt-0.5">{getCount(trackVehicle.id)} on board</div>
                          </div>
                        </div>
                      </div>

                      {/* Call driver */}
                      {trackVehicle.driverId && (
                        <a href={`tel:${trackVehicle.driverPhone}`}
                          className="flex items-center justify-center gap-2 bg-white border border-slate-200 rounded-2xl py-3 text-sm font-black text-slate-700 active:scale-95 transition-transform shadow-sm">
                          <Phone size={15} className="text-emerald-500" /> Call Driver · {trackVehicle.driverPhone}
                        </a>
                      )}

                      {/* Route timeline */}
                      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                        <div className="flex items-center justify-between mb-4">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                            {trackVehicle.routeName || 'Route'} — Stops
                          </p>
                          <span className="text-[9px] font-black text-slate-400">
                            {stopsWithStatus.filter(s => s.status === 'COMPLETED').length}/{trackVehicle.stops.length} done
                          </span>
                        </div>

                        {trackVehicle.stops.length === 0 ? (
                          <div className="text-center py-6">
                            <MapPin size={24} className="text-slate-200 mx-auto mb-2" />
                            <p className="text-xs font-bold text-slate-400">No stops configured</p>
                            <button onClick={() => { setRouteVehicleId(trackVehicle.id); setTab('VEHICLES'); }}
                              className="mt-3 text-[10px] font-black text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full">
                              Set up routes →
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {stopsWithStatus.map((stop, i) => (
                              <div key={stop.id} className="flex gap-4 items-start">
                                <div className="flex flex-col items-center shrink-0">
                                  <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                                    stop.status === 'COMPLETED' ? 'bg-emerald-500' :
                                    stop.status === 'CURRENT'   ? 'bg-blue-500 animate-pulse' :
                                    'bg-slate-200'
                                  }`}>
                                    {stop.status === 'COMPLETED' ? <CheckCircle2 size={11} className="text-white" /> :
                                     stop.status === 'CURRENT'   ? <Navigation size={9} className="text-white" /> :
                                     <Circle size={9} className="text-slate-400" />}
                                  </div>
                                  {i < stopsWithStatus.length - 1 && (
                                    <div className={`w-0.5 h-8 mt-1 ${stop.status === 'COMPLETED' ? 'bg-emerald-200' : 'bg-slate-100'}`} />
                                  )}
                                </div>
                                <div className={`flex-1 pb-4 ${i === stopsWithStatus.length - 1 ? 'pb-0' : ''}`}>
                                  <div className={`font-extrabold text-sm ${
                                    stop.status === 'CURRENT'   ? 'text-blue-600' :
                                    stop.status === 'COMPLETED' ? 'text-slate-400' :
                                    'text-slate-900'
                                  }`}>{stop.name}</div>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <Clock size={9} className="text-slate-300" />
                                    <span className="text-[10px] font-bold text-slate-400">{stop.estimatedTime}</span>
                                    {stop.status === 'CURRENT' && (
                                      <span className="text-[9px] font-black bg-blue-500 text-white px-2 py-0.5 rounded-full">Vehicle here</span>
                                    )}
                                    {stop.status === 'COMPLETED' && (
                                      <span className="text-[9px] font-black text-emerald-500">✓ Passed</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {tripDone && (
                          <div className="mt-3 bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center">
                            <p className="text-[10px] font-black text-emerald-700 uppercase tracking-wide">✓ Trip Completed</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </>
        )}

        {/* ══ STUDENTS TAB ══════════════════════════════════════════════════════ */}
        {tab === 'STUDENTS' && (
          <>
            {/* Assign form */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Assign Student to Vehicle</p>

              {/* Student selector */}
              <div className="relative">
                <select value={selStudentId || ''} onChange={e => setSelStudentId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold outline-none focus:border-blue-500 appearance-none">
                  <option value="">Select Student…</option>
                  {unassignedStudents.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.className})</option>
                  ))}
                </select>
                <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>

              {/* Vehicle selector */}
              {selStudentId && (
                <div className="relative">
                  <select value={selVehicleId || ''} onChange={e => { setSelVehicleId(e.target.value); setSelStopId(null); }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold outline-none focus:border-blue-500 appearance-none">
                    <option value="">Select Vehicle…</option>
                    {vehicles.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.vehicleNo} {v.routeName ? `– ${v.routeName}` : ''} ({v.stops.length} stops)
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              )}

              {/* Stop selector — OPTIONAL. When the vehicle's route
                  isn't mapped yet, principal can still assign on the
                  vehicle alone; the driver builds stops on the first
                  trip via Driver Settings → "Add stop here". */}
              {selVehicleId && (() => {
                const veh = vehicles.find(v => v.id === selVehicleId);
                return veh?.stops.length ? (
                  <div className="relative">
                    <select value={selStopId || ''} onChange={e => setSelStopId(e.target.value || null)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold outline-none focus:border-blue-500 appearance-none">
                      <option value="">No specific stop (optional)</option>
                      {veh.stops.map(s => (
                        <option key={s.id} value={s.id}>{s.name} · {s.estimatedTime}</option>
                      ))}
                    </select>
                    <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                ) : (
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex items-center gap-2">
                    <AlertTriangle size={13} className="text-blue-500 shrink-0" />
                    <p className="text-xs font-bold text-blue-700">No stops on this vehicle yet — that's fine. Driver will add them on the route.</p>
                  </div>
                );
              })()}

              <button onClick={handleAssignStudent}
                disabled={assigning || !selStudentId || !selVehicleId}
                className="w-full py-3 bg-emerald-600 text-white font-black rounded-xl flex items-center justify-center gap-1.5 disabled:opacity-40 active:scale-95 transition-transform">
                <Check size={16} /> {assigning ? 'Assigning…' : 'Assign Student'}
              </button>
            </div>

            {/* Current assignments grouped by vehicle */}
            {vehicles.map(v => {
              const vAssignments = assignments.filter(a => a.vehicleId === v.id);
              if (vAssignments.length === 0) return null;
              return (
                <div key={v.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                    <Bus size={13} className="text-slate-500" />
                    <span className="font-black text-slate-900 text-sm">{v.vehicleNo}</span>
                    {v.routeName && <span className="text-[10px] font-bold text-slate-400">· {v.routeName}</span>}
                    <span className="ml-auto text-[10px] font-black text-slate-400">{vAssignments.length} students</span>
                  </div>
                  {vAssignments.map((a, idx) => (
                    <div key={a.id} className={`flex items-center gap-3 px-4 py-3 ${idx < vAssignments.length - 1 ? 'border-b border-slate-100' : ''}`}>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-slate-900 text-sm truncate">{a.studentName}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] font-bold text-slate-400">{a.className}</span>
                          <span className="text-slate-200">·</span>
                          <MapPin size={8} className="text-slate-300" />
                          <span className="text-[10px] font-bold text-slate-400">{a.boardingStopName}</span>
                        </div>
                      </div>
                      <button onClick={() => handleRemoveAssignment(a.studentId)}
                        className="p-1.5 hover:bg-rose-50 text-rose-400 rounded-lg shrink-0">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              );
            })}

            {assignments.length === 0 && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center">
                <Users size={32} className="text-slate-200 mx-auto mb-3" />
                <p className="text-sm font-black text-slate-400">No students assigned yet</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Driver History modal ─────────────────────────────────────────────── */}
      {driverHistoryId && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-end justify-center"
             onClick={() => setDriverHistoryId(null)}>
          <div className="bg-white rounded-t-3xl w-full max-h-[80vh] overflow-y-auto"
               onClick={e => e.stopPropagation()}>
            <div className="px-4 py-4 border-b border-slate-100 flex items-center gap-2">
              <History size={18} className="text-violet-500" />
              <div className="flex-1">
                <h3 className="font-black text-slate-900 text-sm">Driver History</h3>
                <p className="text-[10px] font-bold text-slate-400">{driverHistoryVehicle}</p>
              </div>
              <button onClick={() => setDriverHistoryId(null)} className="p-1 hover:bg-slate-100 rounded-lg">
                <X size={16} className="text-slate-500" />
              </button>
            </div>
            <div className="p-4">
              {driverHistoryLoading ? (
                <div className="flex justify-center py-8">
                  <div className="w-5 h-5 border-2 border-slate-200 border-t-violet-600 rounded-full animate-spin" />
                </div>
              ) : driverHistoryItems.length === 0 ? (
                <div className="text-center py-8">
                  <History size={28} className="text-slate-200 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-400">No history yet</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {driverHistoryItems.slice(0, driverHistoryShown).map(item => {
                    const d = item.details as { vehicleNo?: string; vehicleId?: string; previousDriverName?: string };
                    const isAssigned  = item.action === 'driver_vehicle_assigned';
                    const isRemoved   = item.action === 'driver_vehicle_removed';
                    const isSuspended = item.action === 'staff_suspended';
                    const isReinstate = item.action === 'staff_reinstated';
                    const dot = isAssigned  ? 'bg-emerald-500' :
                                isRemoved   ? 'bg-rose-400'    :
                                isSuspended ? 'bg-amber-500'   :
                                isReinstate ? 'bg-blue-500'    : 'bg-slate-400';
                    const label = isAssigned  ? `Assigned to ${d.vehicleNo ?? 'vehicle'}` :
                                  isRemoved   ? `Removed from ${d.vehicleNo ?? 'vehicle'}` :
                                  isSuspended ? 'Driver suspended'   :
                                  isReinstate ? 'Driver reinstated'  : item.action;
                    const sub = isAssigned && d.previousDriverName
                      ? `Previous: ${d.previousDriverName}`
                      : undefined;
                    const when = new Date(item.createdAt).toLocaleDateString('en-IN', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    });
                    return (
                      <div key={item.id} className="flex gap-3 items-start py-2.5 border-b border-slate-50 last:border-0">
                        <div className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1 ${dot}`} />
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-slate-900 text-sm">{label}</div>
                          {sub && <div className="text-[10px] font-bold text-slate-400">{sub}</div>}
                        </div>
                        <div className="text-[10px] font-bold text-slate-400 shrink-0">{when}</div>
                      </div>
                    );
                  })}
                  {driverHistoryItems.length > driverHistoryShown && (
                    <button onClick={() => setDriverHistoryShown(s => s + 50)}
                      className="w-full mt-2 py-2.5 bg-white border border-slate-200 rounded-xl font-black text-[11px] text-violet-700 hover:bg-violet-50 transition-colors">
                      Load More ({driverHistoryItems.length - driverHistoryShown} remaining)
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Bulk Reassign modal ───────────────────────────────────────────────── */}
      {bulkFromId && (() => {
        const fromVehicle = vehicles.find(v => v.id === bulkFromId);
        const toVehicle   = vehicles.find(v => v.id === bulkToVehicleId);
        const affectedCount = assignments.filter(a => a.vehicleId === bulkFromId).length;
        if (!fromVehicle) return null;
        return (
          <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-end justify-center"
               onClick={() => !bulkBusy && setBulkFromId(null)}>
            <div className="bg-white rounded-t-3xl w-full max-h-[90vh] overflow-y-auto"
                 onClick={e => e.stopPropagation()}>
              <div className="px-4 py-4 border-b border-slate-100 flex items-center gap-2">
                <AlertTriangle size={18} className="text-amber-500" />
                <div className="flex-1">
                  <h3 className="font-black text-slate-900 text-sm">Move All Students — {fromVehicle.vehicleNo}</h3>
                  <p className="text-[10px] font-bold text-slate-400">{affectedCount} active assignment{affectedCount !== 1 ? 's' : ''}</p>
                </div>
                <button onClick={() => setBulkFromId(null)} disabled={bulkBusy}
                  className="p-1 hover:bg-slate-100 rounded-lg">
                  <X size={16} className="text-slate-500" />
                </button>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Target Vehicle</label>
                  <div className="relative mt-1">
                    <select value={bulkToVehicleId} onChange={e => { setBulkToVehicleId(e.target.value); setBulkToStopId(''); }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold outline-none focus:border-blue-500 appearance-none">
                      <option value="">— Select —</option>
                      {vehicles.filter(v => v.id !== bulkFromId).map(v => (
                        <option key={v.id} value={v.id}>{v.vehicleNo} ({v.type})</option>
                      ))}
                    </select>
                    <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Target Stop</label>
                  <div className="relative mt-1">
                    <select value={bulkToStopId} onChange={e => setBulkToStopId(e.target.value)}
                      disabled={!toVehicle}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold outline-none focus:border-blue-500 disabled:opacity-50 appearance-none">
                      <option value="">— Select —</option>
                      {(toVehicle?.stops ?? []).map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Effective Date</label>
                  <input type="date" value={bulkDate} onChange={e => setBulkDate(e.target.value)}
                    className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Reason</label>
                  <div className="relative mt-1">
                    <select value={bulkReason} onChange={e => setBulkReason(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold outline-none focus:border-blue-500 appearance-none">
                      {TRANSPORT_CHANGE_REASONS.filter(r => r.value !== 'CANCEL_SERVICE').map(r => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                    <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                  <input type="text" value={bulkNote} onChange={e => setBulkNote(e.target.value)}
                    placeholder="Note (optional)"
                    className="w-full mt-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-blue-500" />
                </div>
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-[10px] font-bold text-amber-800">
                  Future transport installments on this vehicle will be cancelled. Paid receipts stay intact.
                </div>
                {bulkErr && (
                  <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs font-bold text-rose-700">{bulkErr}</div>
                )}
              </div>
              <div className="px-4 py-3 border-t border-slate-100 flex gap-2">
                <button onClick={() => setBulkFromId(null)} disabled={bulkBusy}
                  className="flex-1 bg-slate-100 text-slate-700 font-black text-xs rounded-xl py-3 disabled:opacity-50">
                  Cancel
                </button>
                <button onClick={handleBulkReassign} disabled={bulkBusy}
                  className="flex-1 bg-amber-600 text-white font-black text-xs rounded-xl py-3 disabled:opacity-50">
                  {bulkBusy ? 'Moving…' : `Move ${affectedCount} Student${affectedCount !== 1 ? 's' : ''}`}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
