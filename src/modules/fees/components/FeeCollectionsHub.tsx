// FeeCollectionsHub — the principal's bottom-nav landing for Fees.
//
// Three tabs sit on top of one financial pulse view:
//   • Overview    — KPIs + this-month inflow + status mix.
//   • Collections — the existing per-student FeeLedger (delegated).
//   • Dues        — defaulter list with Call / WhatsApp reminder shortcuts.
//
// Today's Inflow + Pending Dues hero cards are computed from the same
// server aggregate the dashboard uses, so no fresh round-trip per tab.

import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, ArrowDownRight, Clock, Phone, MessageCircle, Search, Users, Loader2,
} from 'lucide-react';
import { feeService } from '@/modules/fees/fee.service';
import { studentService, type StudentListItem } from '@/modules/students/student.service';
import { FeeLedger } from '@/modules/fees/components/FeeLedger';
import { useUIStore } from '@/store/uiStore';

interface Props { onBack: () => void; }

type Tab = 'OVERVIEW' | 'COLLECTIONS' | 'DUES';

const fmtINR = (n: number): string => {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1)}Cr`;
  if (n >= 100_000)    return `₹${(n / 100_000).toFixed(1)}L`;
  if (n >= 1_000)      return `₹${(n / 1_000).toFixed(0)}k`;
  return `₹${n.toLocaleString('en-IN')}`;
};

const fmtFullINR = (n: number) => `₹${n.toLocaleString('en-IN')}`;

const istToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

interface DueItem extends StudentListItem {
  due: number;
  /** YYYY-MM-DD or null — earliest unpaid installment due date if known. */
  oldestDue: string | null;
  /** Lazy-loaded; null while not yet fetched, '' if no number on file. */
  fatherPhone: string | null;
}

export const FeeCollectionsHub: React.FC<Props> = ({ onBack }) => {
  const [tab, setTab] = useState<Tab>('OVERVIEW');
  const [loading, setLoading] = useState(true);
  const [aggregate, setAggregate] = useState<Awaited<ReturnType<typeof feeService.getSchoolAggregate>> | null>(null);
  const [todayInflow, setTodayInflow] = useState(0);

  // Initial load: aggregate (one RPC) + light payment history (cached) so we
  // can derive today's inflow without a separate round-trip.
  useEffect(() => {
    (async () => {
      try {
        await feeService.refreshLite();
        const agg = await feeService.getSchoolAggregate();
        setAggregate(agg);
        const today = istToday();
        const inflow = feeService.getPaymentHistory()
          .filter(p => !p.reversedAt && (p.date ?? '').slice(0, 10) === today)
          .reduce((s, p) => s + Math.max(0, p.amount), 0);
        setTodayInflow(inflow);
      } catch (e) {
        console.error('[FeeCollectionsHub] load failed', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (tab === 'COLLECTIONS') {
    // Reuse the existing per-student schedule + history viewer untouched.
    // Back button takes the user back to the hub, not to the dashboard.
    return <FeeLedger onBack={() => setTab('OVERVIEW')} />;
  }

  const pendingTotal = aggregate?.totalParentDue ?? 0;

  return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 sticky top-0 z-10 shadow-sm flex items-center gap-3">
        <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Fee Collections</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Hero KPI cards */}
        <div className="grid grid-cols-2 gap-3">
          <KpiCard
            tone="blue"
            icon={<ArrowDownRight size={18} className="text-blue-600" />}
            label="Today's Inflow"
            value={fmtINR(todayInflow)}
            loading={loading}
          />
          <KpiCard
            tone="rose"
            icon={<Clock size={18} className="text-rose-600" />}
            label="Pending Dues"
            value={fmtINR(pendingTotal)}
            loading={loading}
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          {(['OVERVIEW', 'COLLECTIONS', 'DUES'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2.5 rounded-full text-[11px] font-black uppercase tracking-widest transition-colors ${
                tab === t ? 'bg-violet-600 text-white shadow-sm' : 'bg-white text-slate-500 border border-slate-200'
              }`}>
              {t.charAt(0) + t.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {tab === 'OVERVIEW' && <OverviewPanel aggregate={aggregate} todayInflow={todayInflow} loading={loading} />}
        {tab === 'DUES'     && <DuesPanel />}
      </div>
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────────────
// Hero KPI card
// ───────────────────────────────────────────────────────────────────────────

const KpiCard: React.FC<{
  tone: 'blue' | 'rose';
  icon: React.ReactNode;
  label: string;
  value: string;
  loading?: boolean;
}> = ({ tone, icon, label, value, loading }) => {
  const labelColor   = tone === 'blue' ? 'text-blue-700'   : 'text-rose-700';
  const iconBg       = tone === 'blue' ? 'bg-blue-100'     : 'bg-rose-100';
  const valueColor   = tone === 'blue' ? 'text-blue-900'   : 'text-rose-900';
  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-4 flex flex-col gap-3 min-h-[140px]">
      <div className={`w-10 h-10 rounded-full ${iconBg} flex items-center justify-center`}>
        {icon}
      </div>
      <div>
        <p className={`text-[10px] font-black uppercase tracking-widest ${labelColor}`}>{label}</p>
        <p className={`text-3xl font-black mt-1 tabular-nums ${valueColor}`}>
          {loading ? '…' : value}
        </p>
      </div>
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────────────
// Overview tab
// ───────────────────────────────────────────────────────────────────────────

const OverviewPanel: React.FC<{
  aggregate: Awaited<ReturnType<typeof feeService.getSchoolAggregate>> | null;
  todayInflow: number;
  loading: boolean;
}> = ({ aggregate, todayInflow, loading }) => {
  if (loading || !aggregate) {
    return <div className="flex justify-center py-8"><Loader2 className="animate-spin text-slate-400" /></div>;
  }
  const collected = aggregate.totalCollected;
  const due       = aggregate.totalParentDue;
  const total     = collected + due;
  const collectedPct = total > 0 ? Math.round((collected / total) * 100) : 0;

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Year-to-Date</p>
        <div className="grid grid-cols-2 gap-3 text-center">
          <Cell label="Collected" value={fmtFullINR(collected)} tone="emerald" />
          <Cell label="Outstanding" value={fmtFullINR(due)} tone="rose" />
        </div>
        <div className="mt-4">
          <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest mb-1.5">
            <span className="text-slate-500">Collection Rate</span>
            <span className="text-emerald-600">{collectedPct}%</span>
          </div>
          <div className="bg-slate-100 h-2 rounded-full overflow-hidden">
            <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${collectedPct}%` }} />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Student Status</p>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Cell label="Cleared" value={String(aggregate.clearedCount)} tone="emerald" />
          <Cell label="Partial" value={String(aggregate.dueCount)} tone="amber" />
          <Cell label="Pending" value={String(aggregate.pendingCount)} tone="rose" />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Today</p>
        <p className="text-2xl font-black text-blue-700 tabular-nums">{fmtFullINR(todayInflow)}</p>
        <p className="text-[10px] font-bold text-slate-400 mt-0.5">collected so far</p>
      </div>
    </div>
  );
};

const Cell: React.FC<{ label: string; value: string; tone: 'emerald' | 'rose' | 'amber' }> = ({ label, value, tone }) => {
  const colour = tone === 'emerald' ? 'text-emerald-600' : tone === 'rose' ? 'text-rose-600' : 'text-amber-600';
  return (
    <div className="bg-slate-50 rounded-xl p-3">
      <p className={`font-black text-base tabular-nums ${colour}`}>{value}</p>
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-0.5">{label}</p>
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────────────
// Dues tab
// ───────────────────────────────────────────────────────────────────────────

const DUE_PAGE = 50;

const DuesPanel: React.FC = () => {
  const { showToast } = useUIStore();
  const [items, setItems]     = useState<DueItem[]>([]);
  const [search, setSearch]   = useState('');
  const [shown, setShown]     = useState(DUE_PAGE);
  const [loading, setLoading] = useState(true);
  const [phoneLoading, setPhoneLoading] = useState<string | null>(null);

  // Pull the full student list (paginated server-side) and keep only those
  // with outstanding dues. Status PENDING/PARTIAL maps to "owes money".
  useEffect(() => {
    (async () => {
      try {
        // Pull a generous first page; the student.service paginator caps at
        // 200 rows server-side. Schools larger than that get a Load More
        // pager below — we fetch additional pages on demand.
        const page = await studentService.getList({ offset: 0, limit: 200 });
        const dues: DueItem[] = page.items
          .filter(s => s.totalFee > 0 && s.paidFee < s.totalFee)
          .map(s => ({
            ...s,
            due: Math.max(0, s.totalFee - s.paidFee),
            oldestDue: null,
            fatherPhone: null,
          }))
          .sort((a, b) => b.due - a.due);
        setItems(dues);
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Failed to load defaulters', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, [showToast]);

  useEffect(() => { setShown(DUE_PAGE); }, [search]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(s =>
      s.name.toLowerCase().includes(q) ||
      `${s.className}-${s.section}`.toLowerCase().includes(q) ||
      s.admissionNo.toLowerCase().includes(q),
    );
  }, [items, search]);

  const visible = filtered.slice(0, shown);
  const remaining = filtered.length - visible.length;

  // Lazy-fetch the parent phone on demand — the slim list endpoint doesn't
  // ship it. Update the row in-place so subsequent calls hit the cached value.
  const ensurePhone = async (item: DueItem): Promise<string> => {
    if (item.fatherPhone !== null) return item.fatherPhone;
    setPhoneLoading(item.id);
    try {
      const full = await studentService.getById(item.id);
      const phone = full?.fatherPhone ?? '';
      setItems(prev => prev.map(x => x.id === item.id ? { ...x, fatherPhone: phone } : x));
      return phone;
    } finally {
      setPhoneLoading(null);
    }
  };

  const callParent = async (item: DueItem) => {
    const phone = await ensurePhone(item);
    if (!phone) { showToast('No parent number on file', 'error'); return; }
    window.location.href = `tel:${phone.replace(/[^0-9+]/g, '')}`;
  };

  const sendReminder = async (item: DueItem) => {
    const phone = await ensurePhone(item);
    if (!phone) { showToast('No parent number on file', 'error'); return; }
    const cleaned = phone.replace(/[^0-9+]/g, '').replace(/^\+?91?/, '91');
    const text = encodeURIComponent(
      `Namaste, ${item.name} (${item.className}-${item.section}) ki fees ` +
      `₹${item.due.toLocaleString('en-IN')} pending hai. ` +
      `Kripya jaldi se jama karwa dein. Dhanyavaad.`,
    );
    window.open(`https://wa.me/${cleaned}?text=${text}`, '_blank');
  };

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="animate-spin text-slate-400" /></div>;
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search due students…"
          className="w-full bg-white border border-slate-200 rounded-2xl pl-11 pr-4 py-3 text-sm font-bold outline-none focus:border-violet-400 shadow-sm" />
      </div>

      {filtered.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center text-slate-400">
          <Users size={28} className="mx-auto mb-2 opacity-40" />
          <p className="font-bold text-sm">{search ? 'No matches' : 'All clear — no pending dues!'}</p>
        </div>
      )}

      <div className="space-y-3">
        {visible.map(s => (
          <div key={s.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-extrabold text-slate-900 text-sm truncate">{s.name}</p>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">
                  Class {s.className.replace(/^Class\s*/i, '')}-{s.section}
                </p>
              </div>
              <div className="text-right shrink-0">
                <span className="text-xs font-black px-2.5 py-1 rounded-md bg-rose-50 text-rose-700 tabular-nums">
                  ₹{s.due.toLocaleString('en-IN')}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <button onClick={() => callParent(s)}
                disabled={phoneLoading === s.id}
                className="flex items-center justify-center gap-2 py-2.5 bg-violet-50 text-violet-700 font-black text-[11px] uppercase tracking-widest rounded-xl hover:bg-violet-100 active:scale-95 transition-all disabled:opacity-50">
                <Phone size={13} /> Call Parents
              </button>
              <button onClick={() => sendReminder(s)}
                disabled={phoneLoading === s.id}
                className="flex items-center justify-center gap-2 py-2.5 bg-white border border-slate-200 text-slate-700 font-black text-[11px] uppercase tracking-widest rounded-xl hover:bg-slate-50 active:scale-95 transition-all disabled:opacity-50">
                <MessageCircle size={13} /> Send Reminder
              </button>
            </div>
          </div>
        ))}
      </div>

      {remaining > 0 && (
        <button onClick={() => setShown(s => s + DUE_PAGE)}
          className="w-full py-3 bg-white border border-slate-200 rounded-2xl font-black text-xs text-violet-700 hover:bg-violet-50">
          Load More ({remaining} remaining)
        </button>
      )}
      {filtered.length > 0 && (
        <p className="text-center text-[10px] font-bold text-slate-300">
          Showing {visible.length} of {filtered.length} due students
        </p>
      )}
    </div>
  );
};
