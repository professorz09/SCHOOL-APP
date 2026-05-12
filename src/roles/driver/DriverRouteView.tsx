import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Check, X, MapPin, Trash2, Pencil, Settings2, ChevronUp, ChevronDown, Lock, Unlock } from 'lucide-react';
import { transportService, TransportVehicle, RouteStop } from '@/modules/transport/transport.service';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import { supabase } from '@/lib/supabase';

export const DriverRouteView: React.FC = () => {
  const session = useAuthStore(s => s.session);
  const { showToast, askConfirm } = useUIStore();
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
  const [locating, setLocating] = useState(false);
  const [editRouteName, setEditRouteName] = useState(false);
  const [routeNameInput, setRouteNameInput] = useState('');
  // Edit Mode toggle — when OFF the page is a clean read-only timeline.
  // When ON the driver gets the big "Add at Current Location" button + the
  // edit/delete/reorder controls on each stop. Default OFF so the route
  // can't be mutated accidentally during a trip.
  const [editMode, setEditMode] = useState(false);
  // localStops is the optimistic source of truth for the UI. Every
  // mutation (add / delete / reorder) updates this list synchronously so
  // the driver sees the change instantly; the server call runs in the
  // background. On error we rollback and toast — but tapping never feels
  // stuck waiting for the network.
  const [localStops, setLocalStops] = useState<RouteStop[]>([]);
  // In-flight guards — disable the relevant tap target while a request
  // is on the wire so a frustrated double-tap can't enqueue duplicates.
  const [savingAdd, setSavingAdd] = useState(false);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Earlier this used a hardcoded DRIVER_ID = 'staff6' — every
      // driver who opened this view edited staff6's vehicle stops,
      // not their own. Same bug pattern as DriverLayout had; same fix.
      if (!session?.userId) return;
      const { data } = await supabase
        .from('staff').select('id').eq('user_id', session.userId).maybeSingle();
      const staffId = (data as { id: string } | null)?.id;
      if (!staffId || cancelled) return;
      await transportService.refreshAll();
      if (cancelled) return;
      const v = transportService.getVehicles().find(x => x.driverId === staffId);
      if (v) { setVehicle(v); setStops(v.stops); setRouteNameInput(v.routeName); }
    })();
    return () => { cancelled = true; };
  }, [session?.userId]);

  const reload = () => {
    const v = transportService.getVehicleById(vehicle!.id);
    if (v) {
      setVehicle(v);
      setStops(v.stops);
      setLocalStops(v.stops);
    }
  };

  // Keep localStops aligned with the server-confirmed list. Optimistic
  // mutations bypass this by directly setting localStops first.
  useEffect(() => {
    setLocalStops(stops);
  }, [stops]);

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

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      showToast('GPS not supported on this device', 'error');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setNewLat(pos.coords.latitude.toFixed(6));
        setNewLng(pos.coords.longitude.toFixed(6));
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        showToast(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied — enable in browser settings'
            : 'Could not get location. Try again or type co-ordinates manually.',
          'error',
        );
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  // Single-tap quick add — captures GPS, drops an optimistic "Stop N" row
  // into the list as soon as coords arrive, then writes to the server in
  // the background. No inline form, no name prompt. Driver renames later
  // via the pencil if they want a friendlier label. Button stays disabled
  // for the entire request so a frustrated double-tap can't fire twice.
  const handleQuickAddHere = async () => {
    if (!vehicle || savingAdd) return;
    if (!navigator.geolocation) {
      showToast('GPS not supported on this device', 'error');
      return;
    }
    setSavingAdd(true);

    // Wrap geolocation in a promise so we can use try/finally cleanly.
    const pos = await new Promise<GeolocationPosition | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (p) => resolve(p),
        (err) => {
          showToast(
            err.code === err.PERMISSION_DENIED
              ? 'Location permission denied — enable in browser settings'
              : 'Could not get GPS. Try again.',
            'error',
          );
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 8000 },
      );
    });
    if (!pos) { setSavingAdd(false); return; }

    const lat = +pos.coords.latitude.toFixed(6);
    const lng = +pos.coords.longitude.toFixed(6);
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const tempId = `temp-${Date.now()}`;
    const autoName = `Stop ${localStops.length + 1}`;
    const placeholder: RouteStop = {
      id: tempId,
      name: autoName,
      estimatedTime: `${hh}:${mm}`,
      lat, lng,
    };
    // Optimistic insert — driver sees the row appear immediately.
    setLocalStops(prev => [...prev, placeholder]);

    try {
      await transportService.addStop(vehicle.id, {
        name: autoName,
        estimatedTime: `${hh}:${mm}`,
        lat, lng,
      });
      reload();
      showToast(`${autoName} added — pencil tap karke rename kar sakte ho`, 'success');
    } catch (e) {
      // Rollback the placeholder if the server didn't accept it.
      setLocalStops(prev => prev.filter(s => s.id !== tempId));
      showToast(e instanceof Error ? e.message : 'Failed to add stop', 'error');
    } finally {
      setSavingAdd(false);
    }
  };

  // Reorder — swap adjacent rows instantly in the UI, then write the two
  // affected sort_orders in the background. No bottom confirm bar; the
  // change is committed on the spot. Server failures rollback the swap
  // and toast so the on-screen order never disagrees with the DB.
  const handleReorder = async (idx: number, direction: 'up' | 'down') => {
    if (!vehicle) return;
    const otherIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (otherIdx < 0 || otherIdx >= localStops.length) return;

    const before = localStops.slice();
    const next = localStops.slice();
    [next[idx], next[otherIdx]] = [next[otherIdx], next[idx]];
    setLocalStops(next);

    try {
      // Swap is two write rows; do them in parallel since they don't
      // depend on each other and the order of arrival doesn't matter.
      await Promise.all([
        transportService.updateStop(vehicle.id, next[idx].id, { sort_order: idx } as Partial<RouteStop>),
        transportService.updateStop(vehicle.id, next[otherIdx].id, { sort_order: otherIdx } as Partial<RouteStop>),
      ]);
      reload();
    } catch (e) {
      setLocalStops(before);
      showToast(e instanceof Error ? e.message : 'Reorder failed', 'error');
    }
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

  // Optimistic delete — strip the row from localStops immediately so the
  // driver sees it gone; fire the server call in the background. On
  // error we put it back and toast. In-flight guard via deletingIds so a
  // double-tap on the same row doesn't double-fire.
  const handleDeleteStop = async (stopId: string) => {
    if (!vehicle) return;
    if (deletingIds.has(stopId)) return;
    const removed = localStops.find(s => s.id === stopId);
    if (!removed) return;
    setLocalStops(prev => prev.filter(s => s.id !== stopId));
    setDeletingIds(prev => new Set(prev).add(stopId));
    try {
      await transportService.removeStop(vehicle.id, stopId);
      reload();
    } catch (e) {
      setLocalStops(prev => prev.find(s => s.id === stopId) ? prev : [...prev, removed]);
      showToast(e instanceof Error ? e.message : 'Delete failed', 'error');
    } finally {
      setDeletingIds(prev => {
        const next = new Set(prev);
        next.delete(stopId);
        return next;
      });
    }
  };

  if (!vehicle) return (
    <div className="flex flex-col items-center justify-center p-10 text-center">
      <MapPin size={40} className="text-slate-200 mb-3" />
      <p className="font-extrabold text-slate-900">No Vehicle Assigned</p>
      <p className="text-xs font-bold text-slate-400 mt-1">Contact principal for vehicle assignment</p>
    </div>
  );

  // Custom in-app confirm via the shared ConfirmModal (replaces the ugly
  // browser-native window.confirm which on mobile Codespaces showed the
  // hostname as the dialog title). Double-trigger is prevented because
  // handleDeleteStop short-circuits when the row is already in deletingIds.
  const confirmDelete = async (stop: RouteStop) => {
    if (deletingIds.has(stop.id)) return;
    const ok = await askConfirm({
      title: `Delete "${stop.name}"?`,
      message: 'Ye stop route se hat jayega. Phir se chahiye to GPS se add karna padega.',
      confirmLabel: 'Delete',
      cancelLabel: 'Keep',
      destructive: true,
    });
    if (!ok) return;
    void handleDeleteStop(stop.id);
  };

  return (
    <div className="flex flex-col gap-4 px-5 pt-4 pb-32 animate-in fade-in duration-300">

      {/* Edit Mode toggle — prominent banner at the top. OFF = clean
          read-only timeline (default during trips). ON = adds the big
          GPS-add button + per-stop edit/delete/reorder controls. */}
      <button onClick={() => { setEditMode(m => !m); setEditingStopId(null); }}
        className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl shadow-sm transition-all active:scale-[0.99] ${
          editMode
            ? 'bg-amber-50 border-2 border-amber-300 text-amber-800'
            : 'bg-white border border-slate-200 text-slate-700'
        }`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            editMode ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
          }`}>
            {editMode ? <Unlock size={18}/> : <Lock size={18}/>}
          </div>
          <div className="text-left">
            <div className="text-sm font-black uppercase tracking-tight">
              {editMode ? 'Edit Mode · ON' : 'Edit Mode · OFF'}
            </div>
            <div className="text-[10px] font-bold opacity-75 mt-0.5">
              {editMode ? 'Stops add / edit / reorder kar sakte ho' : 'Tap to enable route editing'}
            </div>
          </div>
        </div>
        <div className={`w-12 h-7 rounded-full relative transition-colors ${editMode ? 'bg-amber-500' : 'bg-slate-300'}`}>
          <div className={`w-5 h-5 bg-white rounded-full shadow absolute top-1 transition-transform ${editMode ? 'translate-x-6' : 'translate-x-1'}`}/>
        </div>
      </button>

      {/* Route Name */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Route Name</p>
        {editRouteName ? (
          <div className="flex gap-2">
            <input value={routeNameInput} onChange={e => setRouteNameInput(e.target.value)}
              placeholder="e.g. Route A — Dwarka"
              className="flex-1 border border-slate-200 bg-slate-50 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-emerald-500" />
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
              className="p-2 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200">
              <Edit2 size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Primary CTA — one tap captures GPS, auto-inserts "Stop N" into
          the list, and writes to server in the background. Stays disabled
          throughout the request so a second tap can't fire a duplicate. */}
      {editMode && (
        <>
          <button onClick={handleQuickAddHere}
            disabled={savingAdd}
            className="w-full flex items-center justify-center gap-3 py-5 rounded-2xl font-black text-sm uppercase tracking-widest text-white shadow-lg shadow-emerald-500/30 active:scale-[0.98] transition-all bg-gradient-to-br from-emerald-500 to-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none">
            <MapPin size={20} className={savingAdd ? 'animate-pulse' : ''}/>
            {savingAdd ? 'Adding stop…' : 'Add Stop at Current Location'}
          </button>
          <p className="text-[10px] font-bold text-slate-400 -mt-2 text-center leading-relaxed">
            Ek baar tap karo — GPS apne aap capture hoga, "Stop N" naam se add ho jayega. Pencil tap karke rename kar lena.
          </p>
        </>
      )}

      {/* Stops List */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Stops · {localStops.length}
          </p>
          {editMode && (
            <button onClick={() => setShowAdd(s => !s)}
              className="flex items-center gap-1 text-[10px] font-black text-slate-600 bg-slate-100 px-3 py-1.5 rounded-full hover:bg-slate-200">
              <Settings2 size={12} /> Add manually
            </button>
          )}
        </div>

        {localStops.length === 0 ? (
          <div className="text-center py-8 px-4">
            <MapPin size={32} className="text-slate-200 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-400">No stops yet</p>
            <p className="text-[11px] font-bold text-slate-400 mt-1 max-w-[240px] mx-auto leading-relaxed">
              Edit mode ON karke "Add at Current Location" tap karo.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {localStops.map((stop, idx) => (
              <div key={stop.id}>
                {editingStopId === stop.id ? (
                  <div className="p-4 space-y-2.5 bg-emerald-50/40">
                    <p className="text-[9px] font-black uppercase tracking-widest text-emerald-700">Edit Stop #{idx + 1}</p>
                    <input value={editStopName} onChange={e => setEditStopName(e.target.value)}
                      placeholder="Stop name"
                      autoFocus
                      className="w-full border border-slate-200 bg-white rounded-xl px-3 py-3 text-sm font-bold outline-none focus:border-emerald-500" />
                    <input type="time" value={editStopTime} onChange={e => setEditStopTime(e.target.value)}
                      className="w-full border border-slate-200 bg-white rounded-xl px-3 py-3 text-sm font-bold outline-none focus:border-emerald-500" />
                    <details className="text-[11px] font-bold text-slate-500">
                      <summary className="cursor-pointer text-emerald-700">Advanced — change GPS coordinates</summary>
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <input value={editStopLat} onChange={e => setEditStopLat(e.target.value)}
                          placeholder="Latitude"
                          className="border border-slate-200 bg-white rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-emerald-500" />
                        <input value={editStopLng} onChange={e => setEditStopLng(e.target.value)}
                          placeholder="Longitude"
                          className="border border-slate-200 bg-white rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-emerald-500" />
                      </div>
                    </details>
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => setEditingStopId(null)}
                        className="flex-1 py-3 bg-slate-100 text-slate-700 font-black rounded-xl text-sm">Cancel</button>
                      <button onClick={handleEditStop}
                        className="flex-1 py-3 bg-emerald-600 text-white font-black rounded-xl text-sm flex items-center justify-center gap-1.5">
                        <Check size={15} /> Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 px-4 py-3.5">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-black text-xs shrink-0">
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-extrabold text-slate-900 text-sm truncate">{stop.name}</div>
                      <div className="text-[10px] font-bold text-slate-400 mt-0.5">
                        {stop.estimatedTime || 'No time set'}
                      </div>
                    </div>
                    {/* Mutation controls only when Edit Mode is ON. Up/down
                        arrows reorder locally; pencil/trash hit the server. */}
                    {editMode && (
                      <>
                        <div className="flex flex-col gap-1 shrink-0">
                          <button onClick={() => handleReorder(idx, 'up')}
                            disabled={idx === 0}
                            aria-label="Move up"
                            className="w-9 h-7 flex items-center justify-center text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed">
                            <ChevronUp size={14}/>
                          </button>
                          <button onClick={() => handleReorder(idx, 'down')}
                            disabled={idx === localStops.length - 1}
                            aria-label="Move down"
                            className="w-9 h-7 flex items-center justify-center text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed">
                            <ChevronDown size={14}/>
                          </button>
                        </div>
                        <button onClick={() => {
                          setEditingStopId(stop.id);
                          setEditStopName(stop.name);
                          setEditStopTime(stop.estimatedTime);
                          setEditStopLat(stop.lat.toString());
                          setEditStopLng(stop.lng.toString());
                        }}
                          aria-label={`Edit ${stop.name}`}
                          className="w-10 h-10 flex items-center justify-center text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl shrink-0">
                          <Pencil size={16} />
                        </button>
                        <button onClick={() => confirmDelete(stop)}
                          disabled={deletingIds.has(stop.id)}
                          aria-label={`Delete ${stop.name}`}
                          className="w-10 h-10 flex items-center justify-center text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-xl shrink-0 disabled:opacity-40 disabled:cursor-not-allowed">
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Manual Add Form — collapsed by default; for desk-side editing
          when the driver isn't physically at the stop yet. */}
      {editMode && showAdd && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Add Stop Manually</p>
            <button onClick={() => setShowAdd(false)} className="text-slate-400"><X size={16} /></button>
          </div>
          <input value={newName} onChange={e => setNewName(e.target.value)}
            placeholder="Stop name (e.g. Dwarka Sector 7)"
            className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 text-sm font-bold outline-none focus:border-emerald-500" />
          <input type="time" value={newTime} onChange={e => setNewTime(e.target.value)}
            className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 text-sm font-bold outline-none focus:border-emerald-500" />

          <button onClick={handleUseCurrentLocation} disabled={locating}
            className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-50 border border-emerald-200 text-emerald-700 font-black text-xs rounded-xl hover:bg-emerald-100 disabled:opacity-60">
            <MapPin size={14} />
            {locating ? 'Getting location…' : 'Use Current GPS Location'}
          </button>

          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">or type coords</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input value={newLat} onChange={e => setNewLat(e.target.value)}
              placeholder="Latitude"
              className="border border-slate-200 bg-slate-50 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-emerald-500" />
            <input value={newLng} onChange={e => setNewLng(e.target.value)}
              placeholder="Longitude"
              className="border border-slate-200 bg-slate-50 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-emerald-500" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowAdd(false)}
              className="flex-1 py-3 bg-slate-100 text-slate-700 font-black rounded-xl">Cancel</button>
            <button onClick={handleAddStop}
              className="flex-1 py-3 bg-emerald-600 text-white font-black rounded-xl flex items-center justify-center gap-1.5">
              <Plus size={15} /> Add Stop
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
