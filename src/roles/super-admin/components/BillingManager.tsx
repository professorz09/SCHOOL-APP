// Super-admin billing — the simple version.
//
// Old version had plans (BASIC/STANDARD/PREMIUM), pre-stamped annual
// totals, billing years, and a multi-screen flow. Replaced with a flat
// model: pick a school → see its academic years → add installments
// (name + amount + due date) under each AY → mark each one paid as it
// comes in. History below.
//
// Backed by school_billing_installments (migration 0098). All data
// flows through admin-only endpoints under /api/admin/schools/:id/.

import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Building2, Search, Plus, IndianRupee, Calendar,
  CheckCircle2, Trash2, X, Receipt, RefreshCw,
} from 'lucide-react';
import { useUIStore } from '@/store/uiStore';
import { useSchoolStore } from '@/roles/super-admin/schoolStore';
import { adminApi } from '@/lib/adminApi';
import { fmtINR as fmt } from '@/shared/utils/currency';

interface Props { onBack: () => void }

interface AY {
  id: string; label: string; start_date: string; end_date: string;
  is_active: boolean; is_closed: boolean;
}
interface Installment {
  id: string; academic_year_id: string; name: string;
  description: string | null;
  amount: number; due_date: string;
  paid_amount: number; paid_at: string | null;
  paid_method: string | null; paid_note: string | null;
  created_at: string;
}

const fmtDate = (d: string) => {
  const dt = new Date(d.length <= 10 ? d + 'T00:00:00' : d);
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};
const fmtDateTime = (d: string) => {
  const dt = new Date(d);
  return dt.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
};

export const BillingManager: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();
  const { schools, fetchSchools } = useSchoolStore();
  const [search, setSearch] = useState('');
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null);

  useEffect(() => {
    fetchSchools().catch(e => showToast(e instanceof Error ? e.message : 'Failed to load schools', 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return schools;
    return schools.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.code.toLowerCase().includes(q) ||
      (s.location ?? '').toLowerCase().includes(q),
    );
  }, [schools, search]);

  const selected = schools.find(s => s.id === selectedSchoolId) ?? null;

  // ── DETAIL ────────────────────────────────────────────────────────────────
  if (selected) {
    return <SchoolBilling school={selected} onBack={() => setSelectedSchoolId(null)} />;
  }

  // ── LIST ──────────────────────────────────────────────────────────────────
  return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600 hover:bg-slate-200 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight leading-none">Billing</h2>
            <p className="text-[10px] font-bold text-slate-400 mt-0.5">School chunein → AY → installments add karein</p>
          </div>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, code, city…"
            className="w-full bg-slate-100 rounded-xl pl-9 pr-3 py-2.5 font-bold text-sm outline-none border border-transparent focus:border-blue-400 focus:bg-white transition-colors"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {filtered.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <Building2 size={32} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm font-bold">Koi school nahi mila</p>
          </div>
        )}
        {filtered.map(s => (
          <button key={s.id}
            onClick={() => setSelectedSchoolId(s.id)}
            className="w-full bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-3 active:scale-[0.99] transition-transform">
            <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-black shrink-0">
              {s.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="font-extrabold text-slate-900 text-sm truncate">{s.name}</p>
              <p className="text-[10px] font-bold text-slate-400 mt-0.5">{s.code} · {s.location}</p>
            </div>
            <ArrowLeft size={16} className="text-slate-300 rotate-180 shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
};

// ─── School billing detail ─────────────────────────────────────────────────
const SchoolBilling: React.FC<{
  school: { id: string; name: string; code: string };
  onBack: () => void;
}> = ({ school, onBack }) => {
  const { showToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [academicYears, setAcademicYears] = useState<AY[]>([]);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [openAyId, setOpenAyId] = useState<string | null>(null);
  const [addingForAyId, setAddingForAyId] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const data = await adminApi.listBillingInstallments(school.id);
      setAcademicYears(data.academicYears);
      setInstallments(data.installments);
      const activeAy = data.academicYears.find(a => a.is_active);
      setOpenAyId(prev => prev ?? activeAy?.id ?? data.academicYears[0]?.id ?? null);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to load', 'error');
    } finally { setLoading(false); }
  };

  useEffect(() => { void refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [school.id]);

  const installmentsByAy = useMemo(() => {
    const m = new Map<string, Installment[]>();
    for (const i of installments) {
      if (!m.has(i.academic_year_id)) m.set(i.academic_year_id, []);
      m.get(i.academic_year_id)!.push(i);
    }
    return m;
  }, [installments]);

  return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600 hover:bg-slate-200 transition-colors shrink-0">
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0">
            <h2 className="text-base font-black text-slate-900 uppercase tracking-tight truncate">{school.name}</h2>
            <p className="text-[10px] font-bold text-slate-400">Billing · {school.code}</p>
          </div>
        </div>
        <button onClick={() => void refresh()} disabled={loading}
          className="p-2 bg-slate-100 text-slate-600 rounded-full hover:bg-slate-200 transition-colors disabled:opacity-50">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading && (
          <div className="text-center py-12 text-slate-400">
            <div className="w-8 h-8 border-2 border-slate-200 border-t-slate-700 rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs font-bold">Loading…</p>
          </div>
        )}

        {!loading && academicYears.length === 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center">
            <p className="text-sm font-black text-amber-800">Koi academic year nahi hai</p>
            <p className="text-[11px] font-bold text-amber-700 mt-1">
              School ka principal jab AY banayega tab yaha installments add kar sakte ho.
            </p>
          </div>
        )}

        {!loading && academicYears.map(ay => {
          const items = installmentsByAy.get(ay.id) ?? [];
          const total = items.reduce((t, i) => t + i.amount, 0);
          const paid  = items.reduce((t, i) => t + i.paid_amount, 0);
          const pending = total - paid;
          const isOpen = openAyId === ay.id;
          return (
            <div key={ay.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <button
                onClick={() => setOpenAyId(isOpen ? null : ay.id)}
                className="w-full px-4 py-3 flex items-center justify-between gap-3 active:bg-slate-50 transition-colors">
                <div className="text-left min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-black text-slate-900 text-sm">{ay.label}</p>
                    {ay.is_active && (
                      <span className="text-[9px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">Active</span>
                    )}
                    {ay.is_closed && (
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">Closed</span>
                    )}
                  </div>
                  <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                    {fmtDate(ay.start_date)} → {fmtDate(ay.end_date)} · {items.length} installment{items.length === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    {pending > 0 ? `Pending ${fmt(pending)}` : 'All paid'}
                  </p>
                  <p className="text-xs font-black text-slate-900 mt-0.5">{fmt(paid)} / {fmt(total)}</p>
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-slate-100 bg-slate-50/40 px-3 py-3 space-y-2">
                  {items.length === 0 && (
                    <p className="text-[11px] font-bold text-slate-400 text-center py-2">
                      Koi installment nahi. Add karne ke liye niche dabaye.
                    </p>
                  )}
                  {items.map(i => {
                    const fullyPaid = i.paid_amount >= i.amount;
                    const partial = i.paid_amount > 0 && !fullyPaid;
                    const overdue = !fullyPaid && new Date(i.due_date) < new Date(new Date().toDateString());
                    return (
                      <div key={i.id} className={`bg-white border rounded-xl px-3 py-3 ${
                        fullyPaid ? 'border-emerald-100'
                        : partial ? 'border-amber-200'
                        : overdue ? 'border-rose-200'
                        : 'border-slate-100'
                      }`}>
                        <div className="flex items-start gap-2">
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                            fullyPaid ? 'bg-emerald-50 text-emerald-600'
                            : partial ? 'bg-amber-50 text-amber-600'
                            : overdue ? 'bg-rose-50 text-rose-600'
                            : 'bg-slate-50 text-slate-400'
                          }`}>
                            {fullyPaid ? <CheckCircle2 size={18} /> : <Receipt size={15} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-extrabold text-slate-900 text-sm truncate">{i.name}</p>
                              {fullyPaid && (
                                <span className="text-[9px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">Paid</span>
                              )}
                              {partial && (
                                <span className="text-[9px] font-black uppercase tracking-widest text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">Partial</span>
                              )}
                              {!fullyPaid && !partial && overdue && (
                                <span className="text-[9px] font-black uppercase tracking-widest text-rose-700 bg-rose-50 border border-rose-200 rounded px-1.5 py-0.5">Overdue</span>
                              )}
                            </div>
                            {i.description && (
                              <p className="text-[11px] font-bold text-slate-500 mt-0.5 leading-relaxed">{i.description}</p>
                            )}
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] font-bold text-slate-400 mt-1">
                              <span>Due <span className="text-slate-600">{fmtDate(i.due_date)}</span></span>
                              <span>Amount <span className="text-slate-700 font-black">{fmt(i.amount)}</span></span>
                              {partial && <span className="text-amber-600">Paid {fmt(i.paid_amount)}</span>}
                              {fullyPaid && i.paid_at && <span className="text-emerald-600">Paid on {fmtDate(i.paid_at)}</span>}
                              <span className="text-slate-300">· Added {fmtDateTime(i.created_at)}</span>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1.5 shrink-0">
                            {!fullyPaid && (
                              <button
                                onClick={() => setPayingId(i.id)}
                                className="text-[10px] font-black bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-3 py-1.5 active:scale-95 transition-transform">
                                Pay
                              </button>
                            )}
                            {i.paid_amount === 0 && (
                              <button
                                onClick={async () => {
                                  if (!confirm(`Delete "${i.name}"?`)) return;
                                  try {
                                    await adminApi.deleteBillingInstallment(school.id, i.id);
                                    setInstallments(prev => prev.filter(x => x.id !== i.id));
                                    showToast('Installment deleted');
                                  } catch (e) {
                                    showToast(e instanceof Error ? e.message : 'Delete failed', 'error');
                                  }
                                }}
                                className="p-1 text-slate-300 hover:text-rose-500 transition-colors"
                                title="Delete">
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  <button
                    onClick={() => setAddingForAyId(ay.id)}
                    className="w-full flex items-center justify-center gap-1.5 py-2 border-2 border-dashed border-slate-200 hover:border-blue-300 rounded-xl text-[11px] font-black text-slate-500 hover:text-blue-600 transition-colors">
                    <Plus size={13} /> Installment add karein
                  </button>

                  {/* History — paid items, latest first */}
                  {items.some(i => i.paid_amount > 0) && (
                    <div className="mt-3 pt-3 border-t border-slate-200">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Payment History</p>
                      <ul className="space-y-1.5">
                        {items
                          .filter(i => i.paid_amount > 0)
                          .sort((a, b) => (b.paid_at ?? b.created_at).localeCompare(a.paid_at ?? a.created_at))
                          .map(i => (
                            <li key={'h-' + i.id} className="flex items-center gap-2 bg-white border border-slate-100 rounded-lg px-2.5 py-2">
                              <CheckCircle2 size={12} className="text-emerald-600 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-[11px] font-black text-slate-700 truncate">{i.name}</p>
                                <p className="text-[9px] font-bold text-slate-400">
                                  {i.paid_at ? fmtDateTime(i.paid_at) : 'pending paid_at'}
                                  {i.paid_method && ` · ${i.paid_method}`}
                                  {i.paid_note && ` · ${i.paid_note}`}
                                </p>
                              </div>
                              <span className="text-[11px] font-black text-emerald-700 tabular-nums shrink-0">{fmt(i.paid_amount)}</span>
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add installment modal */}
      {addingForAyId && (
        <AddInstallmentModal
          schoolId={school.id}
          ayId={addingForAyId}
          ayLabel={academicYears.find(a => a.id === addingForAyId)?.label ?? ''}
          onClose={() => setAddingForAyId(null)}
          onCreated={(row) => {
            setInstallments(prev => [...prev, row]);
            setAddingForAyId(null);
          }}
        />
      )}

      {/* Pay modal */}
      {payingId && (
        <PayInstallmentModal
          schoolId={school.id}
          installment={installments.find(i => i.id === payingId)!}
          onClose={() => setPayingId(null)}
          onPaid={(row) => {
            setInstallments(prev => prev.map(x => x.id === row.id ? row : x));
            setPayingId(null);
          }}
        />
      )}
    </div>
  );
};

// ─── Add installment modal ─────────────────────────────────────────────────
const AddInstallmentModal: React.FC<{
  schoolId: string; ayId: string; ayLabel: string;
  onClose: () => void;
  onCreated: (row: Installment) => void;
}> = ({ schoolId, ayId, ayLabel, onClose, onCreated }) => {
  const { showToast } = useUIStore();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const amt = parseInt(amount.replace(/[^\d]/g, ''), 10);
    if (!name.trim()) { showToast('Enter a name', 'error'); return; }
    if (!Number.isFinite(amt) || amt <= 0) { showToast('Amount must be greater than 0', 'error'); return; }
    if (!dueDate) { showToast('Enter a due date', 'error'); return; }
    setSaving(true);
    try {
      const row = await adminApi.createBillingInstallment(schoolId, {
        academicYearId: ayId, name: name.trim(), amount: amt, dueDate,
        description: description.trim() || undefined,
      });
      showToast('Installment added');
      onCreated(row);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Save failed', 'error');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={saving ? undefined : onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom-4"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-base font-black text-slate-900">Naya Installment</p>
            <p className="text-[11px] font-bold text-slate-400">{ayLabel}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center"><X size={16} /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Name *</label>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Q1 Subscription"
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none focus:border-blue-500 focus:bg-white transition-colors" />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Description (optional)</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Kya cover ho raha hai is installment me…"
              rows={2}
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-2.5 font-bold text-sm outline-none focus:border-blue-500 focus:bg-white transition-colors resize-none" />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Amount *</label>
            <div className="relative">
              <IndianRupee size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d]/g, ''))}
                inputMode="numeric"
                placeholder="0"
                className="w-full border border-slate-200 bg-slate-50 rounded-xl pl-9 pr-3 py-3 font-black text-sm outline-none focus:border-blue-500 focus:bg-white transition-colors" />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Due date *</label>
            <div className="relative">
              <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl pl-9 pr-3 py-3 font-bold text-sm outline-none focus:border-blue-500 focus:bg-white transition-colors" />
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={onClose} disabled={saving}
            className="flex-1 py-3 bg-slate-100 text-slate-700 font-black rounded-2xl text-sm uppercase tracking-widest active:scale-95 transition-transform">
            Cancel
          </button>
          <button onClick={submit} disabled={saving}
            className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-2xl text-sm uppercase tracking-widest active:scale-95 transition-transform disabled:opacity-50">
            {saving ? 'Saving…' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Pay installment modal ─────────────────────────────────────────────────
const PayInstallmentModal: React.FC<{
  schoolId: string;
  installment: Installment;
  onClose: () => void;
  onPaid: (row: Installment) => void;
}> = ({ schoolId, installment, onClose, onPaid }) => {
  const { showToast } = useUIStore();
  const outstanding = installment.amount - installment.paid_amount;
  const [amount, setAmount] = useState(String(outstanding));
  const [method, setMethod] = useState('CASH');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const amt = parseInt(amount.replace(/[^\d]/g, ''), 10);
    if (!Number.isFinite(amt) || amt <= 0) { showToast('Amount > 0 hona chahiye', 'error'); return; }
    if (amt > outstanding) { showToast(`Outstanding sirf ${fmt(outstanding)} hai`, 'error'); return; }
    setSaving(true);
    try {
      const row = await adminApi.payBillingInstallment(schoolId, installment.id, {
        amount: amt, method, note: note.trim() || undefined,
      });
      showToast('Payment recorded');
      onPaid(row);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Payment failed', 'error');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={saving ? undefined : onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom-4"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-base font-black text-slate-900">Pay {installment.name}</p>
            <p className="text-[11px] font-bold text-slate-400">
              Total {fmt(installment.amount)} · Paid {fmt(installment.paid_amount)} · Outstanding {fmt(outstanding)}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center"><X size={16} /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Amount received</label>
            <div className="relative">
              <IndianRupee size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d]/g, ''))}
                inputMode="numeric"
                className="w-full border border-slate-200 bg-slate-50 rounded-xl pl-9 pr-3 py-3 font-black text-sm outline-none focus:border-emerald-500 focus:bg-white transition-colors" />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Method</label>
            <div className="grid grid-cols-3 gap-2">
              {['CASH', 'UPI', 'BANK'].map(m => (
                <button key={m} onClick={() => setMethod(m)}
                  className={`py-2 rounded-xl text-[11px] font-black uppercase tracking-widest border-2 transition-colors ${
                    method === m ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500'
                  }`}>{m}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Note (optional)</label>
            <input value={note} onChange={e => setNote(e.target.value)}
              placeholder="Txn ID / reference"
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none focus:border-emerald-500 focus:bg-white transition-colors" />
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={onClose} disabled={saving}
            className="flex-1 py-3 bg-slate-100 text-slate-700 font-black rounded-2xl text-sm uppercase tracking-widest active:scale-95 transition-transform">
            Cancel
          </button>
          <button onClick={submit} disabled={saving}
            className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-2xl text-sm uppercase tracking-widest active:scale-95 transition-transform disabled:opacity-50">
            {saving ? 'Recording…' : 'Pay'}
          </button>
        </div>
      </div>
    </div>
  );
};
