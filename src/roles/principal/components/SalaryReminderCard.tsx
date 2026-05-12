import React, { useEffect, useMemo, useState } from 'react';
import { BanknoteIcon, ChevronRight, X, Loader2, IndianRupee } from 'lucide-react';
import { staffService } from '@/modules/staff/staff.service';
import {
  SalaryReminderRow, SalaryPaymentMethod,
} from '@/modules/staff/staff.types';
import { useUIStore } from '@/store/uiStore';
import { PrincipalView } from '@/roles/principal/pages/PrincipalLayout';

const monthLabel = (d: Date) =>
  d.toLocaleString('en-IN', { month: 'long', year: 'numeric' });

const PAY_METHODS: SalaryPaymentMethod[] = ['CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE', 'OTHER'];

interface Props {
  onNavigate: (view: PrincipalView) => void;
}

/**
 * Dashboard widget showing how many staff are pending salary for the current
 * month. Tapping it opens a modal listing each staff member with a quick
 * "Pay" action that records the full salary in one tap. For partial / custom
 * payments the principal jumps to the Salary Ledger.
 */
export const SalaryReminderCard: React.FC<Props> = ({ onNavigate }) => {
  const { showToast } = useUIStore();
  const month = useMemo(() => monthLabel(new Date()), []);
  const [rows, setRows] = useState<SalaryReminderRow[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [method, setMethod] = useState<SalaryPaymentMethod>('BANK_TRANSFER');

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await staffService.getSalaryReminders(month);
      setRows(data);
    } catch (e) {
      // Surface to UI so the principal knows the widget is degraded; the
      // dashboard itself stays functional.
      const msg = e instanceof Error ? e.message : 'Could not load salary reminders';
      setLoadError(msg);
      // eslint-disable-next-line no-console
      console.warn('[salary-reminder] load failed:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const handleQuickPay = async (row: SalaryReminderRow) => {
    setPayingId(row.staffId);
    try {
      await staffService.recordSalaryPayment(
        row.staffId, month, row.pending, '', method, null,
      );
      showToast(`${row.name}: ${row.pending.toLocaleString('en-IN')} paid`);
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Payment failed', 'error');
    } finally {
      setPayingId(null);
    }
  };

  if (loading) return null;

  // Silently hide the widget on fetch failure (e.g. transient network
  // blip, RLS check still warming up). The widget is non-essential —
  // a noisy red "TypeError: Failed to fetch" banner on the home
  // dashboard was alarming users without any actionable info. The
  // widget will reappear on the next successful load. (load() is still
  // wired to `loadError` if we ever want to re-introduce a less
  // intrusive surfacing.)
  if (loadError || rows.length === 0) return null;

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="w-full bg-amber-50 border border-amber-200 rounded-2xl p-4 text-left active:scale-[0.98] transition-transform">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
            <BanknoteIcon size={20} className="text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-amber-800">Salary Reminder</p>
            <p className="text-[11px] font-bold text-amber-700 mt-0.5">
              {rows.length} staff pending salary for {month}
            </p>
          </div>
          <ChevronRight size={16} className="text-amber-500 shrink-0" />
        </div>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-end" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md mx-auto bg-white rounded-t-3xl p-5 pb-8 max-h-[85vh] flex flex-col animate-in slide-in-from-bottom-8"
            onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3 shrink-0">
              <div>
                <h3 className="text-base font-black text-slate-900">Salary Reminder</h3>
                <p className="text-[10px] font-bold text-slate-400 mt-0.5">{month} · {rows.length} pending</p>
              </div>
              <button onClick={() => setOpen(false)} className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500"><X size={16} /></button>
            </div>

            <div className="flex items-center gap-2 mb-3 shrink-0">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Quick-pay method:</span>
              <select value={method} onChange={e => setMethod(e.target.value as SalaryPaymentMethod)}
                className="border border-slate-200 bg-slate-50 rounded-xl px-3 py-1.5 font-bold text-xs outline-none">
                {PAY_METHODS.map(m => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
              </select>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2">
              {rows.map(row => (
                <div key={row.staffId} className="bg-slate-50 rounded-xl p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-black text-slate-800 text-sm truncate">{row.name}</div>
                      <div className="text-[10px] font-bold text-slate-400 mt-0.5">
                        {row.role.replace('_', ' ')} · ₹{row.pending.toLocaleString('en-IN')} pending
                      </div>
                    </div>
                    <button onClick={() => handleQuickPay(row)} disabled={payingId === row.staffId}
                      className="bg-emerald-600 text-white text-[10px] font-black px-3 py-2 rounded-xl flex items-center gap-1 shrink-0 disabled:opacity-50">
                      {payingId === row.staffId
                        ? <Loader2 size={12} className="animate-spin" />
                        : <IndianRupee size={12} />}
                      {payingId === row.staffId ? 'Paying' : 'Pay'}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button onClick={() => { setOpen(false); onNavigate('SALARY_LEDGER'); }}
              className="mt-4 w-full py-3 bg-slate-900 text-white text-xs font-black rounded-xl uppercase tracking-wide active:scale-95 transition-transform shrink-0">
              Open Salary Ledger
            </button>
          </div>
        </div>
      )}
    </>
  );
};
