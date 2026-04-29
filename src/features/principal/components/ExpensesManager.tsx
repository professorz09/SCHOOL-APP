import React, { useEffect, useState } from 'react';
import { ArrowLeft, Plus, Wallet, IndianRupee } from 'lucide-react';
import { principalService } from '../../../services/principal.service';
import { Expense } from '../../../types/principal.types';
import { useUIStore } from '../../../store/uiStore';

type View = 'LIST' | 'ADD';

const CATEGORIES = ['SALARY', 'MAINTENANCE', 'UTILITIES', 'EVENTS', 'SUPPLIES', 'OTHER'] as const;

const catColor = (c: string) => {
  const map: Record<string, string> = {
    SALARY: 'bg-blue-50 text-blue-700', MAINTENANCE: 'bg-amber-50 text-amber-700',
    UTILITIES: 'bg-cyan-50 text-cyan-700', EVENTS: 'bg-violet-50 text-violet-700',
    SUPPLIES: 'bg-emerald-50 text-emerald-700', OTHER: 'bg-slate-100 text-slate-600',
  };
  return map[c] ?? 'bg-slate-100 text-slate-600';
};

interface Props { onBack: () => void; }

export const ExpensesManager: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();
  const [view, setView] = useState<View>('LIST');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [form, setForm] = useState<Omit<Expense, 'id'>>({
    category: 'MAINTENANCE', description: '', amount: 0,
    date: new Date().toISOString().split('T')[0], approvedBy: 'Dr. Rajesh Kumar',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => { principalService.getExpenses().then(setExpenses); }, []);

  const total = expenses.reduce((a, e) => a + e.amount, 0);

  const byCategory = CATEGORIES.map(cat => ({
    cat, amount: expenses.filter(e => e.category === cat).reduce((a, e) => a + e.amount, 0),
  })).filter(x => x.amount > 0);

  const handleAdd = async () => {
    if (!form.description || form.amount <= 0) { showToast('Description and amount required', 'error'); return; }
    setIsSubmitting(true);
    try {
      const exp = await principalService.addExpense(form);
      setExpenses(prev => [exp, ...prev]);
      showToast('Expense recorded');
      setForm({ category: 'MAINTENANCE', description: '', amount: 0, date: new Date().toISOString().split('T')[0], approvedBy: 'Dr. Rajesh Kumar' });
      setView('LIST');
    } finally { setIsSubmitting(false); }
  };

  const renderHeader = (title: string, back: () => void, action?: React.ReactNode) => (
    <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
      <div className="flex items-center gap-3">
        <button onClick={back} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600"><ArrowLeft size={20} /></button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">{title}</h2>
      </div>
      {action}
    </div>
  );

  if (view === 'ADD') return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader('Add Expense', () => setView('LIST'))}
      <div className="flex-1 overflow-y-auto p-4  space-y-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Category</label>
            <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as any }))}
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none">
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Description *</label>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="What was purchased / paid for?"
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-rose-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Amount (₹) *</label>
              <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: +e.target.value }))}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-rose-500" />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Date</label>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none focus:border-rose-500" />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Approved By</label>
            <input value={form.approvedBy} onChange={e => setForm(f => ({ ...f, approvedBy: e.target.value }))}
              placeholder="Approver name"
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none" />
          </div>
        </div>
        <button onClick={handleAdd} disabled={isSubmitting}
          className="w-full flex items-center justify-center gap-2 bg-rose-600 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg disabled:opacity-60">
          {isSubmitting ? 'Recording…' : <><Plus size={16} /> Record Expense</>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader('Expenses', onBack,
        <button onClick={() => setView('ADD')} className="p-2 bg-rose-500 text-white rounded-full shadow-md"><Plus size={18} /></button>
      )}
      <div className="flex-1 overflow-y-auto p-4  space-y-4">
        {/* Total */}
        <div className="bg-slate-900 rounded-2xl p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Total Expenses</p>
          <div className="text-3xl font-black text-white">₹{(total / 100000).toFixed(2)}L</div>
        </div>

        {/* By category */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">By Category</p>
          {byCategory.map(({ cat, amount }) => (
            <div key={cat} className="flex items-center gap-3">
              <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase shrink-0 ${catColor(cat)}`}>{cat}</span>
              <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                <div className="bg-rose-500 h-1.5 rounded-full" style={{ width: `${total > 0 ? (amount / total) * 100 : 0}%` }} />
              </div>
              <span className="text-xs font-black text-slate-700 shrink-0">₹{(amount / 1000).toFixed(0)}K</span>
            </div>
          ))}
        </div>

        {/* List */}
        <div className="space-y-2">
          {expenses.map(exp => (
            <div key={exp.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-extrabold text-slate-900 text-sm">{exp.description}</div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${catColor(exp.category)}`}>{exp.category}</span>
                    <span className="text-[10px] font-bold text-slate-400">{exp.date}</span>
                  </div>
                  <div className="text-[10px] font-bold text-slate-400 mt-1">Approved by: {exp.approvedBy}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <IndianRupee size={14} className="text-rose-500" />
                  <span className="font-black text-slate-900 text-base">{exp.amount.toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>
          ))}
          {expenses.length === 0 && (
            <div className="flex flex-col items-center py-16 text-slate-400">
              <Wallet size={32} className="mb-3 opacity-40" />
              <p className="font-bold text-sm">No expenses recorded</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
