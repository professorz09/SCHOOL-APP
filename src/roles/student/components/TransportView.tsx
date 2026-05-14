import React, { useEffect, useState } from 'react';
import { ArrowLeft, Bus, CheckCircle2, Circle, Navigation, Phone } from 'lucide-react';
import { transportService } from '@/modules/transport/transport.service';
import { studentDashboardService } from '@/modules/students/studentDashboard.service';
import { useUIStore } from '@/store/uiStore';
import { supabase } from '@/lib/supabase';

interface Props { onBack: () => void; }

// Treat the bus as offline if the driver app hasn't pinged in 30 min
// (matches server-side stale cutoff in /api/transport/live).
const LIVE_STALE_MS = 30 * 60_000;

export const TransportView: React.FC<Props> = ({ onBack }) => {
  const [data, setData] = useState<ReturnType<typeof transportService.getStudentTransportInfo> | null>(null);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Live tracking state from vehicle_live (driver toggles is_tracking ON
  // when they start the trip). Parents see a prominent banner that
  // flips between "BUS IS LIVE NOW" and "Offline" so they know whether
  // tracking is actually live or stale.
  const [liveState, setLiveState] = useState<{ isTracking: boolean; lastSeen: string | null } | null>(null);

  // Resolve the active student (handles STUDENT and PARENT-with-selected-child)
  // and load transport info once. Polling for live GPS is gated on the
  // tracking flag below — when the driver hasn't started a trip there's
  // nothing live to refresh, so we don't hammer the server every 15s for
  // every parent device.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [sid] = await Promise.all([
          studentDashboardService.getActiveStudentId(),
          transportService.refreshAll(),
        ]);
        if (cancelled) return;
        setStudentId(sid);
        setData(transportService.getStudentTransportInfo(sid));
      } catch (err) {
        console.error('[transport] resolve failed', err);
        if (!cancelled) {
          useUIStore.getState().showToast(
            err instanceof Error ? err.message : 'Could not load transport info',
            'error',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // GPS poll — only while the driver has tracking ON. vehicle_live realtime
  // flips `liveState.isTracking` the moment they toggle it, which starts /
  // stops this loop. Idle hours = zero polling.
  useEffect(() => {
    if (!studentId || !liveState?.isTracking) return;
    let cancelled = false;
    const tick = async () => {
      try {
        await transportService.refreshAll();
        if (!cancelled) setData(transportService.getStudentTransportInfo(studentId));
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[transport] poll refresh failed', err);
      }
    };
    void tick();
    const interval = setInterval(tick, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [studentId, liveState?.isTracking]);

  // Subscribe to vehicle_live updates for the assigned bus. RLS already
  // limits this to the parent's linked student's vehicle, so no extra
  // scoping needed client-side.
  useEffect(() => {
    if (!data?.vehicle.id) { setLiveState(null); return; }
    const vid = data.vehicle.id;
    let cancelled = false;

    // Initial fetch.
    supabase.from('vehicle_live')
      .select('is_tracking, last_seen')
      .eq('vehicle_id', vid).maybeSingle()
      .then(({ data: row }) => {
        if (cancelled) return;
        const r = row as { is_tracking: boolean; last_seen: string | null } | null;
        setLiveState(r ? { isTracking: r.is_tracking, lastSeen: r.last_seen } : { isTracking: false, lastSeen: null });
      });

    // Realtime subscription so the banner flips the moment the driver
    // toggles tracking on the bus.
    const channel = supabase.channel(`vlive-${vid}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'vehicle_live', filter: `vehicle_id=eq.${vid}` },
        (payload) => {
          if (cancelled) return;
          const next = payload.new as { is_tracking: boolean; last_seen: string | null } | null;
          if (next) setLiveState({ isTracking: next.is_tracking, lastSeen: next.last_seen });
        },
      )
      .subscribe();

    return () => { cancelled = true; void supabase.removeChannel(channel); };
  }, [data?.vehicle.id]);

  // Compute fresh-live: is_tracking AND last_seen within the stale window.
  const isLiveNow = (() => {
    if (!liveState?.isTracking || !liveState.lastSeen) return false;
    return Date.now() - new Date(liveState.lastSeen).getTime() < LIVE_STALE_MS;
  })();

  if (loading) {
    return (
      <div className="w-full lg:max-w-5xl lg:mx-auto bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
          <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600"><ArrowLeft size={20} /></button>
          <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Transport Tracker</h2>
        </div>
        {/* Center the spinner against a meaningful viewport height. flex-1 alone
            collapses because the parent <main> uses overflow-y, so the empty
            content area has no implicit height to fill. */}
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
          <div className="w-12 h-12 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin mb-3" />
          <p className="text-sm font-bold text-slate-600">Loading…</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="w-full lg:max-w-5xl lg:mx-auto bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
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
    <div className="w-full lg:max-w-5xl lg:mx-auto bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
        <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600"><ArrowLeft size={20} /></button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Transport Tracker</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-4  space-y-4">
        {/* Prominent "BUS IS LIVE NOW" banner — only when the driver has
            tracking actively on. Parents asked for an unmistakable signal
            because the prior "Live" pill in the card was always green
            regardless of actual state and looked like a static label. */}
        {isLiveNow && (
          <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-2xl p-3 flex items-center gap-3 shadow-md animate-in fade-in duration-300">
            <div className="w-3 h-3 rounded-full bg-white animate-pulse"/>
            <div className="flex-1">
              <div className="text-[10px] font-black uppercase tracking-widest text-white/80">Bus Tracking</div>
              <div className="text-sm font-black text-white">LIVE NOW — driver has started the trip</div>
            </div>
            <Navigation size={18} className="text-white"/>
          </div>
        )}

        {/* Vehicle card */}
        <div className="bg-slate-900 rounded-2xl p-4 text-white">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Bus size={20} className="text-orange-400" />
              <span className="font-black text-white">{data.vehicle.vehicleNo}</span>
            </div>
            {isLiveNow ? (
              <div className="flex items-center gap-1.5 bg-emerald-500/20 px-2 py-1 rounded-full">
                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                <span className="text-[10px] font-black text-emerald-400 uppercase">Live</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 bg-slate-700 px-2 py-1 rounded-full">
                <div className="w-2 h-2 bg-slate-500 rounded-full"/>
                <span className="text-[10px] font-black text-slate-300 uppercase">Offline</span>
              </div>
            )}
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
              <div className="font-black text-sm text-white mt-0.5">
                {data.vehicle.driverName && data.vehicle.driverName !== '—' ? data.vehicle.driverName : 'Not assigned'}
              </div>
              {/* Tap-to-call driver phone right here so parents don't have
                  to scroll to a separate "Call Driver" button when the bus
                  is running late. Only rendered when a phone is actually
                  set; falls back to '—' otherwise. */}
              {data.vehicle.driverPhone && data.vehicle.driverPhone !== '—' ? (
                <a href={`tel:${data.vehicle.driverPhone}`}
                  className="inline-flex items-center gap-1.5 mt-1.5 text-[11px] font-black text-emerald-300 hover:text-emerald-200">
                  <Phone size={12} /> {data.vehicle.driverPhone}
                </a>
              ) : (
                <div className="text-[11px] font-bold text-slate-500 mt-1">No phone on file</div>
              )}
            </div>
          </div>
        </div>

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
                  </div>
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
