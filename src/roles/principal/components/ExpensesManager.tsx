import React, { useEffect, useState } from 'react';
import { ArrowLeft, Plus, Wallet, IndianRupee, Download, Pencil, Trash2, Lock, Calendar } from 'lucide-react';
import { exportCsv } from '@/shared/utils/csv';
import { principalService } from '@/roles/principal/principal.service';
import { Expense } from '@/roles/principal/principal.types';
import { useUIStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import { useEditorModeStore } from '@/store/editorModeStore';
import { useAcademicYear } from '@/shared/context/AcademicYearContext';

// IST-anchored "today" so users opening the form after 18:30 UTC don't see
// tomorrow's date pre-filled.
const istToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

type View = 'LIST' | 'ADD' | 'EDIT';

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
  const sessionName = useAuthStore(s => s.session?.name ?? '');
  const editorModeActive = useEditorModeStore(s => s.isActive());
  const { activeYear } = useAcademicYear();

  const [view, setView] = useState<View>('LIST');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<Expense, 'id'>>({
    category: 'MAINTENANCE', description: '', amount: 0,
    date: istToday(), approvedBy: sessionName,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [shown, setShown] = useState(50);
  useEffect(() => { setShown(50); }, [activeYear?.id]);

  // If session arrives after first render, backfill approver name once.
  useEffect(() => {
    if (sessionName) {
      setForm(f => f.approvedBy ? f : { ...f, approvedBy: sessionName });
    }
  }, [sessionName]);

  const loadExpenses = React.useCallback(() => {
    principalService.getExpenses(activeYear?.id)
      .then(setExpenses)
      .catch(e => showToast(e instanceof Error ? e.message : 'Failed to load expenses', 'error'));
  }, [activeYear?.id, showToast]);

  useEffect(() => { loadExpenses(); }, [loadExpenses]);

  const total = expenses.reduce((a, e) => a + e.amount, 0);

  const byCategory = CATEGORIES.map(cat => ({
    cat, amount: expenses.filter(e => e.category === cat).reduce((a, e) => a + e.amount, 0),
  })).filter(x => x.amount > 0);

  // Monthly summary — used for the Excel-friendly export. Groups by YYYY-MM
  // with a per-month total + per-category split. Driven off the
  // currently-loaded list (which is already year-scoped).
  const monthlyRows = React.useMemo(() => {
    const buckets = new Map<string, { total: number; perCat: Record<string, number> }>();
    for (const e of expenses) {
      const key = e.date.slice(0, 7);
      const b = buckets.get(key) ?? { total: 0, perCat: {} };
      b.total += e.amount;
      b.perCat[e.category] = (b.perCat[e.category] ?? 0) + e.amount;
      buckets.set(key, b);
    }
    return Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({
        month,
        month_label: new Date(month + '-01').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }),
        total: v.total,
        salary:      v.perCat['SALARY']      ?? 0,
        maintenance: v.perCat['MAINTENANCE'] ?? 0,
        utilities:   v.perCat['UTILITIES']   ?? 0,
        events:      v.perCat['EVENTS']      ?? 0,
        supplies:    v.perCat['SUPPLIES']    ?? 0,
        other:       v.perCat['OTHER']       ?? 0,
      }));
  }, [expenses]);

  const resetForm = () => {
    setForm({ category: 'MAINTENANCE', description: '', amount: 0, date: istToday(), approvedBy: sessionName });
    setEditingId(null);
  };

  const validateForm = (): boolean => {
    if (!form.description.trim()) { showToast('Description required', 'error'); return false; }
    if (!form.date)                { showToast('Date required', 'error'); return false; }
    if (!form.approvedBy?.trim())  { showToast('Approver name required', 'error'); return false; }
    if (!Number.isFinite(form.amount) || form.amount <= 0) {
      showToast('Amount must be a positive number', 'error'); return false;
    }
    if (form.amount > 10_000_000) {
      showToast('Amount looks too large — max ₹1,00,00,000', 'error'); return false;
    }
    if (!Number.isInteger(form.amount)) {
      showToast('Amount must be a whole rupee value', 'error'); return false;
    }
    return true;
  };

  const handleAdd = async () => {
    if (!validateForm()) return;
    setIsSubmitting(true);
    try {
      const exp = await principalService.addExpense(form);
      setExpenses(prev => [exp, ...prev]);
      showToast('Expense recorded');
      resetForm();
      setView('LIST');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to record expense', 'error');
    } finally { setIsSubmitting(false); }
  };

  const handleUpdate = async () => {
    if (!editingId) return;
    if (!validateForm()) return;
    setIsSubmitting(true);
    try {
      const exp = await principalService.updateExpense(editingId, {
        category: form.category, description: form.description,
        amount: form.amount, date: form.date,
      });
      setExpenses(prev => prev.map(e => e.id === editingId ? exp : e));
      showToast('Expense updated');
      resetForm();
      setView('LIST');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to update expense', 'error');
    } finally { setIsSubmitting(false); }
  };

  const startEdit = (exp: Expense) => {
    if (!editorModeActive) {
      showToast('Editor mode is off — turn it on from the menu before editing', 'error');
      return;
    }
    setForm({
      category: exp.category, description: exp.description,
      amount: exp.amount, date: exp.date, approvedBy: exp.approvedBy,
    });
    setEditingId(exp.id);
    setView('EDIT');
  };

  const handleDelete = async (id: string) => {
    if (!editorModeActive) {
      showToast('Editor mode is off — turn it on from the menu before deleting', 'error');
      return;
    }
    if (!window.confirm('Delete this expense? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      await principalService.deleteExpense(id);
      setExpenses(prev => prev.filter(e => e.id !== id));
      showToast('Expense deleted');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to delete expense', 'error');
    } finally { setDeletingId(null); }
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

  if (view === 'ADD' || view === 'EDIT') return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader(view === 'EDIT' ? 'Edit Expense' : 'Add Expense', () => { resetForm(); setView('LIST'); })}
      <div className="flex-1 overflow-y-auto p-4  space-y-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Category</label>
            <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as Expense['category'] }))}
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
        <button onClick={view === 'EDIT' ? handleUpdate : handleAdd} disabled={isSubmitting}
          className="w-full flex items-center justify-center gap-2 bg-rose-600 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg disabled:opacity-60">
          {isSubmitting ? 'Saving…' : <><Plus size={16} /> {view === 'EDIT' ? 'Save Changes' : 'Record Expense'}</>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader('Expenses', onBack,
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportCsv(
              `expenses_monthly_${activeYear?.name?.replace(/\s+/g, '_') ?? 'all'}_${new Date().toISOString().slice(0, 10)}`,
              monthlyRows,
            )}
            disabled={monthlyRows.length === 0}
            title="Monthly summary CSV"
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs rounded-xl active:scale-95 transition-all disabled:opacity-40">
            <Calendar size={13} /> Monthly
          </button>
          <button
            onClick={() => exportCsv(
              `expenses_${new Date().toISOString().slice(0, 10)}`,
              expenses.map(e => ({
                date:        e.date,
                category:    e.category,
                amount:      e.amount,
                description: e.description ?? '',
                approved_by: e.approvedBy ?? '',
              })),
            )}
            disabled={expenses.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs rounded-xl active:scale-95 transition-all disabled:opacity-40">
            <Download size={13} /> CSV
          </button>
          <button onClick={() => setView('ADD')} className="p-2 bg-rose-500 text-white rounded-full shadow-md"><Plus size={18} /></button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-4  space-y-4">
        {/* Year scope chip */}
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Showing:</span>
          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
            {activeYear?.name ?? 'All years'}
          </span>
          {!editorModeActive && (
            <span className="ml-auto flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
              <Lock size={10} /> Editor mode off
            </span>
          )}
        </div>

        {/* Total */}
        <div className="bg-slate-900 rounded-2xl p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Total Expenses</p>
          <div className="text-3xl font-black text-white">₹{(total / 100000).toFixed(2)}L</div>
        </div>

        {/* By category */}
        {byCategory.length > 0 && (
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
        )}

        {/* List */}
        <div className="space-y-2">
          {expenses.slice(0, shown).map(exp => (
            <div key={exp.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-extrabold text-slate-900 text-sm break-words">{exp.description}</div>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
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
              {/* Per-row actions — gated behind editor mode */}
              <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-slate-100">
                <button
                  onClick={() => startEdit(exp)}
                  disabled={!editorModeActive}
                  title={editorModeActive ? 'Edit expense' : 'Turn on Editor mode to edit'}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 text-blue-700 font-black text-[10px] rounded-lg hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed">
                  <Pencil size={11} /> Edit
                </button>
                <button
                  onClick={() => handleDelete(exp.id)}
                  disabled={!editorModeActive || deletingId === exp.id}
                  title={editorModeActive ? 'Delete expense' : 'Turn on Editor mode to delete'}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-rose-50 text-rose-700 font-black text-[10px] rounded-lg hover:bg-rose-100 disabled:opacity-40 disabled:cursor-not-allowed">
                  <Trash2 size={11} /> {deletingId === exp.id ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          ))}
          {expenses.length === 0 && (
            <div className="flex flex-col items-center py-16 text-slate-400">
              <Wallet size={32} className="mb-3 opacity-40" />
              <p className="font-bold text-sm">No expenses recorded</p>
            </div>
          )}
          {expenses.length > shown && (
            <button onClick={() => setShown(s => s + 50)}
              className="w-full py-3 bg-white border border-slate-200 rounded-2xl font-black text-xs text-rose-700 hover:bg-rose-50 transition-colors">
              Load More ({expenses.length - shown} remaining)
            </button>
          )}
          {expenses.length > 0 && (
            <p className="text-center text-[10px] font-bold text-slate-300 pt-1">
              Showing {Math.min(shown, expenses.length)} of {expenses.length}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
