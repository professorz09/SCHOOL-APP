import React, { useState, useEffect } from 'react';
import { Building2 } from 'lucide-react';

export const SchoolSettingsCard = ({ school, onSave }: { school: any, onSave: (updated: any) => void }) => {
  const [draft, setDraft] = useState<any>(JSON.parse(JSON.stringify(school)));

  useEffect(() => {
    setDraft(JSON.parse(JSON.stringify(school)));
  }, [school]);

  const updateAmount = (val: number) => {
    setDraft({ ...draft, agreedAmount: val });
  };

  const addScheduleItem = () => {
    const newSchedule = [...(draft.expectedSchedule || [])];
    newSchedule.push({ dueDate: new Date().toISOString().split('T')[0], expectedAmount: 0, status: 'PENDING' });
    setDraft({ ...draft, expectedSchedule: newSchedule });
  };

  const updateScheduleItem = (idx: number, field: string, value: any) => {
    const newSchedule = [...(draft.expectedSchedule || [])];
    newSchedule[idx] = { ...newSchedule[idx], [field]: value };
    setDraft({ ...draft, expectedSchedule: newSchedule });
  };

  const removeScheduleItem = (idx: number) => {
    const newSchedule = draft.expectedSchedule.filter((_: any, i: number) => i !== idx);
    setDraft({ ...draft, expectedSchedule: newSchedule });
  };

  const handleSave = () => {
    const logs = [...draft.logs];
    if (draft.agreedAmount !== school.agreedAmount) {
      logs.unshift({ date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }), description: `Agreed amount updated from ₹${school.agreedAmount.toLocaleString('en-IN')} to ₹${draft.agreedAmount.toLocaleString('en-IN')}` });
    }
    // simple check for schedule changes
    if (JSON.stringify(draft.expectedSchedule) !== JSON.stringify(school.expectedSchedule)) {
       logs.unshift({ date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }), description: `Payment schedule was modified.` });
    }
    onSave({ ...draft, logs });
  };

  const hasChanges = JSON.stringify(draft) !== JSON.stringify(school);

  return (
    <div className="space-y-3 bg-white border border-slate-100 shadow-sm rounded-3xl p-5 relative">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center font-bold">
          <Building2 size={16} />
        </div>
        <div>
          <h4 className="font-extrabold text-slate-900 text-sm uppercase tracking-tight">{draft.name}</h4>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Principal: {draft.principalId}</p>
        </div>
      </div>
      
      <div className="pt-2 border-t border-slate-100">
        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Registered Date</label>
        <div className="border border-slate-200 bg-slate-100 rounded-xl px-4 py-3 font-extrabold text-sm text-slate-500">
          {draft.registeredDate}
        </div>
      </div>
      
      <div className="pt-2 border-t border-slate-100">
        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Total Agreed Amount (₹)</label>
        <input 
           type="number" 
           value={draft.agreedAmount} 
           onChange={(e) => updateAmount(Number(e.target.value))} 
           className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-extrabold text-sm text-slate-900 outline-none focus:border-emerald-500 focus:bg-white" 
        />
      </div>
      
      <div className="pt-4 border-t border-slate-100">
        <div className="flex justify-between items-center mb-3">
           <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Payment Schedule</p>
           <button onClick={addScheduleItem} className="bg-emerald-50 text-emerald-600 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-emerald-100 active:scale-95 transition-all outline-none">Add Date</button>
        </div>
        {!draft.expectedSchedule || draft.expectedSchedule.length === 0 ? (
           <div className="text-xs font-bold text-slate-400">No schedule generated.</div>
        ) : (
           <div className="space-y-2">
              {draft.expectedSchedule.map((sch: any, idx: number) => (
                <div key={idx} className="flex flex-col gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100 border-dashed">
                  <div className="flex justify-between items-center mb-1">
                    <div className="flex gap-2 items-center">
                       <div className={`w-2 h-2 rounded-full ${sch.status === 'PAID' ? 'bg-emerald-500' : sch.status !== 'PAID' && new Date(sch.dueDate) < new Date() ? 'bg-rose-500' : 'bg-amber-400'}`}></div>
                       <div className={`font-black text-[9px] uppercase tracking-widest ${sch.status === 'PAID' ? 'text-emerald-600' : sch.status !== 'PAID' && new Date(sch.dueDate) < new Date() ? 'text-rose-600' : 'text-amber-600'}`}>{sch.status}</div>
                    </div>
                    {sch.status !== 'PAID' && (
                       <button onClick={() => removeScheduleItem(idx)} className="text-rose-400 hover:text-rose-600 font-bold text-[10px] uppercase tracking-widest">Remove</button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <input 
                       type="date" 
                       value={sch.dueDate} 
                       onChange={(e) => updateScheduleItem(idx, 'dueDate', e.target.value)}
                       disabled={sch.status === 'PAID'}
                       className="flex-1 border border-slate-200 bg-white rounded-lg px-3 py-2 font-bold text-xs text-slate-900 outline-none focus:border-emerald-500 disabled:opacity-60 uppercase"
                    />
                    <input 
                       type="number" 
                       value={sch.expectedAmount} 
                       onChange={(e) => updateScheduleItem(idx, 'expectedAmount', Number(e.target.value))}
                       disabled={sch.status === 'PAID'}
                       placeholder="Amount"
                       className="w-1/3 border border-slate-200 bg-white rounded-lg px-3 py-2 font-bold text-xs text-slate-900 outline-none focus:border-emerald-500 disabled:opacity-60"
                    />
                  </div>
                </div>
              ))}
           </div>
        )}
      </div>

      <div className="pt-6 pb-2 border-t border-slate-100 flex justify-center">
        <button 
           onClick={handleSave}
           disabled={!hasChanges}
           className={`px-8 py-3 rounded-full font-black text-xs uppercase tracking-widest transition-all shadow-sm ${hasChanges ? 'bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
        >
           {hasChanges ? 'Update Setting' : 'Up to date'}
        </button>
      </div>

    </div>
  );
};
