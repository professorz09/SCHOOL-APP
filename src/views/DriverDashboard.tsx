import React, { useState, useEffect } from 'react';
import { Power, MapPin, CheckCircle2, Circle, Settings, Plus, Trash2, Crosshair } from 'lucide-react';
import { AppCard, SectionTitle } from '../components/SharedUI';

export const DriverDashboard: React.FC = () => {
  const [isTracking, setIsTracking] = useState(false);
  const [currentStopIndex, setCurrentStopIndex] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [autoArrive, setAutoArrive] = useState(true);

  const availableVehicles = [
    { id: 'v1', number: 'DL 1C 4455', type: 'Bus • Route #4' },
    { id: 'v2', number: 'DL 8C 1122', type: 'Minivan • Route #2' },
    { id: 'v3', number: 'HR 26 9988', type: 'Bus • Route #7' },
  ];

  const [vehicle, setVehicle] = useState(availableVehicles[0]);
  
  const [stops, setStops] = useState([
    { id: 1, name: 'School Campus (Start)', lat: '28.6139', lng: '77.2090' },
    { id: 2, name: 'City Center Point', lat: '28.6200', lng: '77.2100' },
    { id: 3, name: 'Green Park Avenue', lat: '28.6250', lng: '77.2150' },
    { id: 4, name: 'Sunrise Apartments', lat: '28.6310', lng: '77.2205' },
    { id: 5, name: 'School Campus (End)', lat: '28.6139', lng: '77.2090' },
  ]);

  // Simulate Automatic GPS Arrival
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isTracking && autoArrive && currentStopIndex < stops.length - 1) {
      interval = setInterval(() => {
        setCurrentStopIndex(prev => prev + 1);
      }, 3500); // Auto arrive every 3.5 seconds
    }
    return () => clearInterval(interval);
  }, [isTracking, autoArrive, currentStopIndex, stops.length]);

  const handleAddStop = () => {
    setStops([...stops, { 
      id: Date.now(), 
      name: '', 
      lat: (28.61 + Math.random()*0.05).toFixed(4), 
      lng: (77.20 + Math.random()*0.05).toFixed(4) 
    }]);
  };

  const updateStop = (id: number, field: string, value: string | null) => {
    setStops(stops.map(s => {
      if (s.id === id) {
         if (field === 'coords') {
           return { ...s, lat: (28.61 + Math.random()*0.05).toFixed(4), lng: (77.20 + Math.random()*0.05).toFixed(4) }
         }
         return { ...s, [field]: value };
      }
      return s;
    }));
  };

  const removeStop = (id: number) => {
    setStops(stops.filter(s => s.id !== id));
  };

  if (showSettings) {
    return (
      <div className="flex flex-col gap-6 animate-in slide-in-from-bottom-4 duration-300 fade-in pt-4">
        <SectionTitle 
           title="Trip Settings" 
           action={
             <button onClick={() => setShowSettings(false)} className="bg-slate-900 text-white px-4 py-2 rounded-full shadow-sm text-[10px]">
                DONE Configuration
             </button>
           } 
        />

        <AppCard>
          <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4">Select Assigned Vehicle</h4>
          <div className="space-y-3">
            {availableVehicles.map(v => (
               <div 
                  key={v.id} 
                  onClick={() => setVehicle(v)} 
                  className={`p-4 rounded-2xl border-2 cursor-pointer transition-colors ${vehicle.id === v.id ? 'border-blue-600 bg-blue-50' : 'border-slate-100 bg-white'}`}
               >
                  <div className="flex justify-between items-center">
                    <div>
                      <h5 className="font-extrabold text-slate-900 uppercase tracking-tight">{v.number}</h5>
                      <p className="text-xs font-bold text-slate-500 mt-0.5">{v.type}</p>
                    </div>
                    {vehicle.id === v.id && <CheckCircle2 className="text-blue-600" />}
                  </div>
               </div>
            ))}
          </div>
        </AppCard>

        <AppCard>
          <div className="flex justify-between items-center mb-6">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Route Coordinates Setup</h4>
            <button onClick={handleAddStop} className="text-blue-600 flex items-center gap-1 text-[10px] font-black uppercase tracking-widest bg-blue-50 px-3 py-1.5 rounded-full">
              <Plus size={14}/> Add Stop
            </button>
          </div>
          
          <div className="space-y-6">
             {stops.map((stop, i) => (
               <div key={stop.id} className="p-4 bg-slate-50 rounded-3xl border border-slate-200 flex flex-col gap-3 relative">
                  <div className="flex justify-between items-center">
                    <span className="font-black text-slate-400 text-[10px] uppercase tracking-widest">STOP {i+1}</span>
                    {stops.length > 2 && (
                       <button onClick={() => removeStop(stop.id)} className="text-red-500 p-1 hover:bg-red-50 rounded-full">
                         <Trash2 size={16} />
                       </button>
                    )}
                  </div>
                  
                  <input
                    value={stop.name}
                    onChange={(e) => updateStop(stop.id, 'name', e.target.value)}
                    className="w-full bg-white px-4 py-3 rounded-2xl font-bold text-sm border border-slate-200 outline-none focus:border-blue-500 text-slate-900"
                    placeholder="E.g. Green Park Sector 4..."
                  />
                  
                  <div className="flex gap-2 items-center">
                    <div className="flex-1 bg-slate-200 rounded-2xl px-4 py-3 flex items-center justify-between opacity-70 border border-slate-300">
                      <span className="text-[10px] font-black font-mono text-slate-600 tracking-wider">
                        {stop.lat}° N, {stop.lng}° E
                      </span>
                      <MapPin size={12} className="text-slate-500" />
                    </div>
                    <button 
                      onClick={() => updateStop(stop.id, 'coords', null)} 
                      className="h-[42px] w-[42px] bg-blue-100 text-blue-700 rounded-2xl flex items-center justify-center active:scale-95 transition-transform" 
                      title="Update Current GPS Coords"
                    >
                      <Crosshair size={18} />
                    </button>
                  </div>
               </div>
             ))}
          </div>
        </AppCard>

        <div className="h-8"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-in slide-in-from-bottom-4 duration-500 fade-in pt-4">
      
      {/* Status Toggle Header */}
      <AppCard className={`!p-6 border-none transition-colors duration-300 ${isTracking ? 'bg-blue-600' : 'bg-slate-900'}`}>
         <div className="flex justify-between items-start text-white">
           <div>
             <h4 className="font-bold text-[10px] uppercase tracking-widest text-white/70 flex items-center gap-2 mb-1">
                Vehicle Status
                <button onClick={() => setShowSettings(true)} className="p-1.5 bg-white/10 rounded-full hover:bg-white/20 transition-colors">
                  <Settings size={12} />
                </button>
             </h4>
             <h2 className="text-3xl font-black mt-2">{isTracking ? 'ON TRIP' : 'OFFLINE'}</h2>
             <p className="text-xs font-bold mt-2 text-white/90">{vehicle.type} • {vehicle.number}</p>
           </div>
           
           <button 
              onClick={() => {
                if(!isTracking) setCurrentStopIndex(0); // Reset when starting
                setIsTracking(!isTracking);
              }}
              className={`w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-90 ${isTracking ? 'bg-rose-500 text-white' : 'bg-white text-slate-900'}`}
           >
             <Power size={28} />
           </button>
         </div>
      </AppCard>

      {/* Control Actions */}
      {isTracking && (
        <div className="flex flex-col gap-3">
          <SectionTitle 
            title="Live Route Progress" 
            action={
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest border border-slate-200 px-2 py-1 rounded bg-white">Auto GPS: {autoArrive ? 'ON' : 'OFF'}</span>
                <input type="checkbox" checked={autoArrive} onChange={(e) => setAutoArrive(e.target.checked)} className="hidden" />
              </label>
            } 
          />
          <div className="bg-white rounded-[32px] shadow-sm border border-slate-100 p-6">
            <div className="relative">
              {/* Vertical Progress Line */}
              <div className="absolute left-[15px] top-4 bottom-4 w-1 bg-slate-100 rounded-full"></div>
              
              <div className="space-y-6">
                {stops.map((stop, index) => {
                  const isCompleted = index < currentStopIndex || (index === stops.length - 1 && currentStopIndex === stops.length - 1);
                  const isNext = index === currentStopIndex && index !== stops.length - 1;
                  
                  return (
                    <div key={stop.id} className="relative flex items-center gap-4">
                      {/* Node Indicator */}
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center relative z-10 ${
                        isCompleted ? 'bg-emerald-500 text-white' : 
                        isNext ? 'bg-blue-500 text-white shadow-[0_0_12px_rgba(59,130,246,0.6)] animate-pulse' : 
                        'bg-slate-100 text-slate-300'
                      }`}>
                        {isCompleted ? <CheckCircle2 size={16} /> : <Circle size={10} fill="currentColor" />}
                      </div>
                      
                      {/* Location details */}
                      <div className="flex-1">
                        <h4 className={`font-extrabold text-sm uppercase tracking-tight ${
                          isCompleted ? 'text-slate-500 line-through' : 
                          isNext ? 'text-blue-600' : 'text-slate-900'
                        }`}>
                          {stop.name || 'Unnamed Stop'}
                        </h4>
                        {isNext ? (
                           autoArrive ? (
                             <span className="text-[10px] font-black uppercase tracking-widest text-blue-500 mt-1">Driving... GPS auto-detect ON</span>
                           ) : (
                             <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">Ready for arrival check in</span>
                           )
                        ) : null}
                      </div>
                      
                      {/* Driver Action Button to Mark Reached if Auto Arrive is OFF */}
                      {isNext && !autoArrive && (
                        <button 
                          onClick={() => setCurrentStopIndex(index + 1)}
                          className="px-4 py-2 bg-blue-50 text-blue-700 text-[10px] font-black uppercase tracking-widest rounded-full"
                        >
                          Arrived
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {!isTracking && (
        <div className="flex flex-col items-center justify-center p-8 text-center bg-white rounded-[32px] border border-slate-100 shadow-sm opacity-60">
           <MapPin size={48} className="text-slate-300 mb-4" />
           <h3 className="font-extrabold text-slate-900 text-lg uppercase tracking-tight">Location Sharing Paused</h3>
           <p className="text-xs font-bold text-slate-500 mt-2 max-w-[200px]">Start the trip to enable live tracking for parents and admins.</p>
        </div>
      )}

      <div className="h-8"></div>
    </div>
  );
};
