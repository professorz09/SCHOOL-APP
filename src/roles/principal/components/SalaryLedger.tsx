import React, { useEffect, useState } from 'react';
import { ArrowLeft, IndianRupee, CheckCircle2, Clock, AlertTriangle, Loader2, Download, Calendar, Pencil } from 'lucide-react';
import { exportCsv } from '@/shared/utils/csv';
import { todayIST } from '@/shared/utils/date';
import { staffService } from '@/modules/staff/staff.service';
import { StaffMember, SalaryPaymentMethod } from '@/modules/staff/staff.types';
import { useUIStore } from '@/store/uiStore';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useEditorModeStore } from '@/store/editorModeStore';
import { Lock } from 'lucide-react';

const PAY_METHODS: SalaryPaymentMethod[] = ['CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE', 'OTHER'];

type SalaryStatus = 'PAID' | 'PARTIAL' | 'PENDING';

interface SalaryRow {
  month: string;
  amount: number;
  paid: number;
  status: SalaryStatus;
  paidAt: string | null;
  note: string;
}

interface StaffSalaryProfile {
  staff: StaffMember;
  schedule: SalaryRow[];
}

const statusColor: Record<SalaryStatus, string> = {
  PAID:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  PARTIAL: 'bg-amber-50 text-amber-700 border-amber-200',
  PENDING: 'bg-rose-50 text-rose-700 border-rose-200',
};

const statusIcon = (s: SalaryStatus) => {
  if (s === 'PAID')    return <CheckCircle2 size={12} className="text-emerald-500" />;
  if (s === 'PARTIAL') return <AlertTriangle size={12} className="text-amber-500" />;
  return <Clock size={12} className="text-rose-500" />;
};

const roleColor: Record<string, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700',
  ON_LEAVE: 'bg-amber-50 text-amber-700',
  SUSPENDED: 'bg-rose-50 text-rose-700',
};

interface Props { onBack: () => void; }

const toRow = (m: { month: string; due: number; paid: number; lastPaidAt: string | null; note: string }): SalaryRow => {
  const status: SalaryStatus = m.paid >= m.due ? 'PAID' : m.paid > 0 ? 'PARTIAL' : 'PENDING';
  return { month: m.month, amount: m.due, paid: m.paid, status, paidAt: m.lastPaidAt, note: m.note };
};

export const SalaryLedger: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();
  const [profiles, setProfiles] = useState<StaffSalaryProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [payModal, setPayModal] = useState<SalaryRow | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payNote, setPayNote] = useState('');
  const [payMethod, setPayMethod] = useState<SalaryPaymentMethod>('BANK_TRANSFER');
  const [payTxn, setPayTxn] = useState('');
  const [payBusy, setPayBusy] = useState(false);
  const [search, setSearch] = useState('');

  // School-level salary day (1-28). One setting for the entire school —
  // used to flag overdue rows and shown as an editable header chip. NULL
  // = not configured yet (no overdue calculation, no chip).
  const [salaryPayDay, setSalaryPayDay] = useState<number | null>(null);
  const [editingDay, setEditingDay] = useState(false);
  const [dayDraft, setDayDraft] = useState('');
  const [savingDay, setSavingDay] = useState(false);
  // Salary day is a school-wide policy setting that retroactively
  // affects every staff member's "Overdue" flag. Casual edits caused
  // confusion — accidentally bumping the day made dozens of rows go
  // green/red unexpectedly. Gate behind Editor Mode (same pattern as
  // ExpensesManager + SettingsManager) so the principal has to
  // deliberately unlock before changing it.
  const editorModeActive = useEditorModeStore(s => s.isActive());

  const loadSalaryDay = async () => {
    const schoolId = useAuthStore.getState().session?.schoolId;
    if (!schoolId) return;
    const { data } = await supabase
      .from('schools').select('salary_pay_day').eq('id', schoolId).maybeSingle();
    // Default to 7th of the month if a school hasn't been migrated
    // yet (or somehow stored NULL). Matches the DB default set in
    // migration 0130. Avoids the "SALARY DAY · not set" pill that
    // confused principals into thinking the feature was broken.
    const d = (data as { salary_pay_day: number | null } | null)?.salary_pay_day ?? 7;
    setSalaryPayDay(d);
  };

  const saveSalaryDay = async () => {
    if (!editorModeActive) {
      showToast('Editor Mode chalu karein — Settings → Editor Mode', 'error');
      return;
    }
    const schoolId = useAuthStore.getState().session?.schoolId;
    if (!schoolId) return;
    const raw = dayDraft.trim();
    const parsed = raw === '' ? null : Math.round(Number(raw));
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 1 || parsed > 28)) {
      showToast('Salary day must be 1–28', 'error');
      return;
    }
    setSavingDay(true);
    try {
      const { error } = await supabase
        .from('schools').update({ salary_pay_day: parsed }).eq('id', schoolId);
      if (error) throw new Error(error.message);
      setSalaryPayDay(parsed);
      setEditingDay(false);
      showToast(parsed === null ? 'Salary day cleared' : `Salary day set to ${parsed}`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not save', 'error');
    } finally {
      setSavingDay(false);
    }
  };

  const reload = async () => {
    try {
      const data = await staffService.getSalaryLedger();
      setProfiles(data.map(d => ({ staff: d.staff, schedule: d.months.map(toRow) })));
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to load salary ledger', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    void loadSalaryDay();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  const selected = selectedId ? profiles.find(p => p.staff.id === selectedId) ?? null : null;

  const filtered = profiles.filter(p =>
    p.staff.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.staff.role ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const handlePay = async () => {
    if (!selected || !payModal) return;
    const amount = Number(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) { showToast('Enter a valid amount', 'error'); return; }
    // Overpay block — same rule as fee ledger's pay_installment. The server
    // doesn't enforce a hard cap on salary payments (cumulative), so we
    // gate it on the client to prevent accidental double-payment of a
    // month's salary.
    const outstanding = Math.max(0, payModal.amount - payModal.paid);
    if (amount > outstanding) {
      showToast(`Overpay blocked — max ₹${outstanding.toLocaleString('en-IN')} for ${payModal.month}`, 'error');
      return;
    }
    setPayBusy(true);
    try {
      await staffService.recordSalaryPayment(
        selected.staff.id, payModal.month, amount, payNote, payMethod, payTxn || null,
      );
      await reload();
      showToast(`₹${amount.toLocaleString('en-IN')} recorded for ${payModal.month}`);
      setPayModal(null); setPayAmount(''); setPayNote(''); setPayTxn('');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Payment failed', 'error');
    } finally {
      setPayBusy(false);
    }
  };

  const getTotals = (s: StaffSalaryProfile) => {
    const totalDue = s.schedule.reduce((a, r) => a + r.amount, 0);
    const totalPaid = s.schedule.reduce((a, r) => a + r.paid, 0);
    return { totalDue, totalPaid, pending: Math.max(0, totalDue - totalPaid) };
  };

  if (loading) {
    return (
      <div className="w-full bg-slate-50 flex items-center justify-center min-h-[60vh]">
        <Loader2 size={28} className="text-slate-400 animate-spin" />
      </div>
    );
  }

  if (selected) {
    const totals = getTotals(selected);
    return (
      <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <button onClick={() => setSelectedId(null)} className="p-2 -ml-2 bg-slate-100 rounded-full">
              <ArrowLeft size={20} className="text-slate-600" />
            </button>
            <div className="flex-1">
              <h2 className="text-xl font-black text-slate-900">{selected.staff.name}</h2>
              <p className="text-[10px] font-bold text-slate-400">{selected.staff.role}{selected.staff.subject ? ` · ${selected.staff.subject}` : ''}</p>
            </div>
            <span className={`text-[9px] font-black px-2.5 py-1 rounded-full ${roleColor[selected.staff.status] ?? 'bg-slate-100 text-slate-600'}`}>
              {(selected.staff.status ?? 'ACTIVE').replace('_', ' ')}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Monthly', val: `₹${selected.staff.salary.toLocaleString('en-IN')}`, color: 'text-slate-900' },
              { label: 'Total Paid', val: `₹${totals.totalPaid.toLocaleString('en-IN')}`, color: 'text-emerald-600' },
              { label: 'Pending', val: `₹${totals.pending.toLocaleString('en-IN')}`, color: totals.pending > 0 ? 'text-rose-600' : 'text-emerald-600' },
            ].map(({ label, val, color }) => (
              <div key={label} className="bg-slate-50 rounded-xl p-3 text-center">
                <div className={`text-sm font-black ${color}`}>{val}</div>
                <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4  space-y-3">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Salary History</p>
          {selected.schedule.length === 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 text-center text-slate-400">
              <p className="font-bold text-sm">No salary months yet for this staff.</p>
              <p className="text-[10px] font-bold text-slate-300 mt-1">Months appear once their joining date falls inside the active academic year.</p>
            </div>
          )}
          {[...selected.schedule].reverse().map(row => {
            // School-level salary pay day drives the due date for every staff
            // member's monthly row. If unset, no overdue badge is shown.
            const dueDay = salaryPayDay;
            const monthDate = new Date(`${row.month} 1`);
            const lastDay = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
            const effectiveDueDay = dueDay && dueDay <= lastDay ? dueDay : lastDay;
            const dueDate = new Date(monthDate.getFullYear(), monthDate.getMonth(), effectiveDueDay);
            const isOverdue = dueDay !== null && row.status !== 'PAID' && new Date() > dueDate;
            return (
            <div key={row.month} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-extrabold text-slate-900">{row.month}</div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <div className={`inline-flex items-center gap-1.5 text-[10px] font-black px-2.5 py-1 rounded-full border ${statusColor[row.status]}`}>
                      {statusIcon(row.status)} {row.status}
                    </div>
                    {dueDay && (
                      <div className="text-[10px] font-black text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
                        Due {dueDay}<sup>th</sup>
                      </div>
                    )}
                    {isOverdue && (
                      <div className="text-[10px] font-black text-rose-700 bg-rose-50 border border-rose-200 px-2 py-1 rounded-full">
                        Overdue
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-black text-slate-900">₹{row.amount.toLocaleString('en-IN')}</div>
                  {row.paid > 0 && <div className="text-[10px] font-bold text-emerald-600">Paid: ₹{row.paid.toLocaleString('en-IN')}</div>}
                  {row.paidAt && <div className="text-[9px] font-bold text-slate-400 mt-0.5">{row.paidAt}</div>}
                  {row.note && <div className="text-[9px] font-bold text-slate-400 mt-0.5">{row.note}</div>}
                </div>
              </div>
              {row.status !== 'PAID' && selected.staff.status !== 'SUSPENDED' && selected.staff.status !== 'RELIEVED' && (
                <button onClick={() => {
                  setPayModal(row);
                  setPayAmount(String(Math.max(0, row.amount - row.paid)));
                  setPayNote(''); setPayTxn(''); setPayMethod('BANK_TRANSFER');
                }}
                  className="mt-3 w-full py-2 bg-slate-900 text-white text-[10px] font-black rounded-xl">
                  Record Payment
                </button>
              )}
            </div>
            );
          })}
        </div>

        {payModal && (
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-end">
            <div className="w-full bg-white rounded-t-3xl p-6 pb-8 animate-in slide-in-from-bottom-8">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-black text-slate-900">Record Salary Payment</h3>
                <button onClick={() => setPayModal(null)} className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500">✕</button>
              </div>
              <p className="text-[10px] font-bold text-slate-400 mb-2">{payModal.month} · {selected.staff.name}</p>
              {(() => {
                const outstanding = Math.max(0, payModal.amount - payModal.paid);
                const entered = Number(payAmount) || 0;
                const overpay = entered > outstanding;
                return (
                  <>
                    <div className="flex items-center justify-between text-[10px] font-black mb-2">
                      <span className="text-slate-500 uppercase tracking-widest">Outstanding</span>
                      <span className="text-emerald-700 tabular-nums">₹{outstanding.toLocaleString('en-IN')}</span>
                    </div>
                    <div className={`bg-slate-50 border rounded-xl p-3 flex items-center gap-2 mb-1 ${overpay ? 'border-rose-300 bg-rose-50' : 'border-slate-200'}`}>
                      <IndianRupee size={16} className={overpay ? 'text-rose-500' : 'text-slate-400'} />
                      <input type="number" min={0} max={outstanding} value={payAmount}
                        onChange={e => setPayAmount(e.target.value)}
                        placeholder="Amount"
                        className="flex-1 bg-transparent font-black text-slate-900 text-lg outline-none" />
                    </div>
                    {overpay && (
                      <div className="text-[10px] font-black text-rose-600 mb-2">
                        Overpay blocked — max ₹{outstanding.toLocaleString('en-IN')}
                      </div>
                    )}
                    {!overpay && <div className="mb-2" />}
                  </>
                );
              })()}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <select value={payMethod} onChange={e => setPayMethod(e.target.value as SalaryPaymentMethod)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm font-bold outline-none focus:border-blue-500">
                  {PAY_METHODS.map(m => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
                </select>
                <input value={payTxn} onChange={e => setPayTxn(e.target.value)}
                  placeholder="Txn ID (optional)"
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm font-bold outline-none focus:border-blue-500" />
              </div>
              <input value={payNote} onChange={e => setPayNote(e.target.value)}
                placeholder="Note (optional)"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-blue-500 mb-4" />
              <button onClick={handlePay}
                disabled={
                  !payAmount || payBusy ||
                  (Number(payAmount) || 0) <= 0 ||
                  (Number(payAmount) || 0) > Math.max(0, payModal.amount - payModal.paid)
                }
                className="w-full py-3 bg-emerald-600 text-white font-black rounded-xl disabled:opacity-40 flex items-center justify-center gap-2">
                {payBusy ? <Loader2 size={16} className="animate-spin" /> : null}
                {payBusy ? 'Saving…' : 'Save Payment'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full">
              <ArrowLeft size={20} className="text-slate-600" />
            </button>
            <div>
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Salary Ledger</h2>
              <p className="text-[10px] font-bold text-slate-400">Schedule · Payments · History</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                // Monthly roll-up across all staff: one row per month with
                // total due / paid / pending and a "fully paid" head-count.
                // Matches the fee ledger monthly export shape so principals
                // can drop both into the same workbook.
                const buckets = new Map<string, { due: number; paid: number; staffPaid: number; staffTotal: number }>();
                filtered.forEach(p => p.schedule.forEach(s => {
                  const b = buckets.get(s.month) ?? { due: 0, paid: 0, staffPaid: 0, staffTotal: 0 };
                  b.due += s.amount;
                  b.paid += s.paid;
                  b.staffTotal += 1;
                  if (s.status === 'PAID') b.staffPaid += 1;
                  buckets.set(s.month, b);
                }));
                const monthlyRows = Array.from(buckets.entries())
                  .sort(([a], [b]) => new Date(`${a} 1`).getTime() - new Date(`${b} 1`).getTime())
                  .map(([month, v]) => ({
                    month,
                    due: v.due,
                    paid: v.paid,
                    pending: Math.max(0, v.due - v.paid),
                    staff_paid: v.staffPaid,
                    staff_total: v.staffTotal,
                  }));
                exportCsv(`salary_monthly_${todayIST()}`, monthlyRows);
              }}
              disabled={filtered.length === 0}
              title="Monthly summary CSV"
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs rounded-xl active:scale-95 transition-all disabled:opacity-40">
              <Calendar size={13} /> Monthly
            </button>
            <button
              onClick={() => {
                const rows = filtered.flatMap(p => p.schedule.map(s => ({
                  staff_name: p.staff.name,
                  role:       p.staff.role,
                  staff_status: p.staff.status,
                  month:      s.month,
                  due:        s.amount,
                  paid:       s.paid,
                  pending:    Math.max(0, s.amount - s.paid),
                  status:     s.status,
                  paid_at:    s.paidAt ?? '',
                  note:       s.note ?? '',
                })));
                exportCsv(`salary_ledger_${todayIST()}`, rows);
              }}
              disabled={filtered.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs rounded-xl active:scale-95 transition-all disabled:opacity-40">
              <Download size={13} /> CSV
            </button>
          </div>
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search staff name or role..."
          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:border-blue-500" />

        {/* School-wide salary day — single setting that drives the
            "Due Xth / Overdue" badge on every staff member's monthly
            row. Editable inline so principal doesn't have to dig
            through Settings. */}
        <div className="mt-3 flex items-center justify-between gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
          <div className="flex items-center gap-2 text-[11px] font-black text-blue-800">
            <Calendar size={13} />
            <span className="uppercase tracking-wider">Salary Day</span>
            {!editingDay && (
              <span className="bg-white text-blue-700 px-2 py-0.5 rounded-md tabular-nums">
                {salaryPayDay !== null
                  ? <>{salaryPayDay}<sup>th</sup> of every month</>
                  : 'not set'}
              </span>
            )}
          </div>
          {editingDay ? (
            <div className="flex items-center gap-1.5">
              <input
                type="number" min={1} max={28}
                value={dayDraft}
                onChange={e => setDayDraft(e.target.value)}
                placeholder="1–28"
                className="w-16 bg-white border border-blue-300 rounded-md px-2 py-1 text-[11px] font-black text-slate-900 text-center outline-none focus:border-blue-500"
              />
              <button onClick={saveSalaryDay} disabled={savingDay}
                className="px-2.5 py-1 bg-blue-600 text-white text-[10px] font-black rounded-md disabled:opacity-50">
                {savingDay ? '…' : 'Save'}
              </button>
              <button onClick={() => setEditingDay(false)} disabled={savingDay}
                className="px-2 py-1 bg-white border border-slate-200 text-slate-600 text-[10px] font-black rounded-md">
                ×
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                if (!editorModeActive) {
                  showToast('Editor Mode chalu karein pehle — Settings → Editor Mode', 'info');
                  return;
                }
                setDayDraft(salaryPayDay !== null ? String(salaryPayDay) : '');
                setEditingDay(true);
              }}
              className={`flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-md transition-colors ${
                editorModeActive
                  ? 'text-blue-700 hover:bg-blue-100'
                  : 'text-slate-400 bg-slate-100 cursor-not-allowed'
              }`}
              title={editorModeActive ? '' : 'Editor Mode required'}>
              {editorModeActive ? <Pencil size={10} /> : <Lock size={10} />}
              {salaryPayDay !== null ? 'Edit' : 'Set'}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4  space-y-3">
        {filtered.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center text-slate-400">
            <p className="font-bold text-sm">No staff found.</p>
            <p className="text-[10px] font-bold text-slate-300 mt-1">Add staff in the Staff Manager to start tracking salaries.</p>
          </div>
        )}
        {filtered.map(p => {
          const totals = getTotals(p);
          return (
            <button key={p.staff.id} onClick={() => setSelectedId(p.staff.id)}
              className="w-full bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-left active:scale-[0.98] transition-transform">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-extrabold text-slate-900">{p.staff.name}</div>
                  <div className="text-[10px] font-bold text-slate-400 mt-0.5">{p.staff.role}{p.staff.subject ? ` · ${p.staff.subject}` : ''}</div>
                  <span className={`inline-block text-[9px] font-black px-2 py-0.5 rounded-full mt-1.5 ${roleColor[p.staff.status] ?? 'bg-slate-100 text-slate-600'}`}>
                    {(p.staff.status ?? 'ACTIVE').replace('_', ' ')}
                  </span>
                </div>
                <div className="text-right">
                  <div className="font-black text-slate-900">₹{p.staff.salary.toLocaleString('en-IN')}/mo</div>
                  {totals.pending > 0 && (
                    <div className="text-[10px] font-black text-rose-600 mt-0.5">₹{totals.pending.toLocaleString('en-IN')} pending</div>
                  )}
                </div>
              </div>
              <div className="mt-3 w-full bg-slate-100 rounded-full h-1.5">
                <div className="bg-emerald-500 h-1.5 rounded-full transition-all"
                  style={{ width: `${totals.totalDue > 0 ? Math.min(100, (totals.totalPaid / totals.totalDue) * 100) : 0}%` }} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
