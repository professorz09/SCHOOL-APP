// FeeCollectionsHub — opens from the dashboard's green "Total Collection ·
// This Month" card. Two tabs sit on top of the at-a-glance KPIs:
//
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

type Tab = 'COLLECTIONS' | 'DUES';

const fmtINR = (n: number): string => {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1)}Cr`;
  if (n >= 100_000)    return `₹${(n / 100_000).toFixed(1)}L`;
  if (n >= 1_000)      return `₹${(n / 1_000).toFixed(0)}k`;
  return `₹${n.toLocaleString('en-IN')}`;
};

const istToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

interface DueItem extends StudentListItem {
  due: number;
  /** YYYY-MM-DD or null — earliest unpaid installment due date if known. */
  oldestDue: string | null;
  /** Lazy-loaded; null while not yet fetched, '' if no number on file. */
  fatherPhone: string | null;
}

export const FeeCollectionsHub: React.FC<Props> = ({ onBack }) => {
  const [tab, setTab] = useState<Tab>('DUES');
  const [loading, setLoading] = useState(true);
  const [aggregate, setAggregate] = useState<Awaited<ReturnType<typeof feeService.getSchoolAggregate>> | null>(null);
  const [todayInflow, setTodayInflow] = useState(0);
  // showToast was previously only available inside the DuesPanel
  // sub-component. The useEffect below references it directly, so
  // pull it from the store at this scope too.
  const showToast = useUIStore(s => s.showToast);

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
        // Surface — earlier this only console.error'd. Same silent
        // empty-data pattern as FeeLedger had: principal saw zero
        // collections + no error and assumed "no payments today".
        console.error('[FeeCollectionsHub] load failed', e);
        showToast(
          e instanceof Error ? e.message : 'Failed to load fee summary',
          'error',
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (tab === 'COLLECTIONS') {
    // Reuse the existing per-student schedule + history viewer untouched.
    // Back button returns to the hub's default Dues tab, not the dashboard.
    return <FeeLedger onBack={() => setTab('DUES')} />;
  }

  const overdueTotal  = aggregate?.totalParentDue      ?? 0;
  const upcomingTotal = aggregate?.totalParentUpcoming ?? 0;
  const collectedTotal = aggregate?.totalCollected     ?? 0;

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
        {/* Today's inflow stays as a primary card. Three-up money strip
            below splits the school's lifetime totals into Collected
            (paid), Overdue (due today or earlier, unpaid) and Upcoming
            (future schedule). Earlier this was a single "Pending Dues"
            number that mashed the two together and either over-stated
            panic or under-stated total exposure. */}
        <KpiCard
          tone="blue"
          icon={<ArrowDownRight size={18} className="text-blue-600" />}
          label="Today's Inflow"
          value={fmtINR(todayInflow)}
          loading={loading}
        />
        <div className="grid grid-cols-3 gap-2">
          <MiniStat label="Collected" tone="emerald" value={fmtINR(collectedTotal)} loading={loading} />
          <MiniStat label="Overdue"   tone="rose"    value={fmtINR(overdueTotal)}   loading={loading} />
          <MiniStat label="Upcoming"  tone="slate"   value={fmtINR(upcomingTotal)}  loading={loading} />
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          {(['DUES', 'COLLECTIONS'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2.5 rounded-full text-[11px] font-black uppercase tracking-widest transition-colors ${
                tab === t ? 'bg-violet-600 text-white shadow-sm' : 'bg-white text-slate-500 border border-slate-200'
              }`}>
              {t.charAt(0) + t.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {tab === 'DUES' && <DuesPanel />}
      </div>
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────────────
// Hero KPI card
// ───────────────────────────────────────────────────────────────────────────

// Compact stat tile for the 3-up money strip. Tone drives just the
// value color so the cards visually group as one row without competing
// for attention. Used for Collected / Overdue / Upcoming.
const MiniStat: React.FC<{
  label: string;
  tone: 'emerald' | 'rose' | 'slate';
  value: string;
  loading?: boolean;
}> = ({ label, tone, value, loading }) => {
  const valueColor =
    tone === 'emerald' ? 'text-emerald-700' :
    tone === 'rose'    ? 'text-rose-700'    :
                         'text-slate-700';
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-3">
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className={`text-base font-black tabular-nums mt-1 truncate ${valueColor}`}>
        {loading ? '…' : value}
      </p>
    </div>
  );
};

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
// Dues tab
// ───────────────────────────────────────────────────────────────────────────

const DUE_PAGE = 50;

const DuesPanel: React.FC = () => {
  const { showToast } = useUIStore();
  const [items, setItems]     = useState<DueItem[]>([]);
  const [search, setSearch]   = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [serverTotal, setServerTotal] = useState(0);
  const [phoneLoading, setPhoneLoading] = useState<string | null>(null);

  // Server-paginated fetch — pulls one page at a time so a 5000-student
  // school doesn't ship the entire roster on tab open. The defaulter
  // filter uses `currentDue` (only OVERDUE/PARTIAL installments whose
  // due_date <= today), so upcoming months don't inflate Pending Dues.
  // Earlier this filtered on totalFee - paidFee which counted the entire
  // yearly schedule as "due" from April 1st.
  const appendPage = React.useCallback(async (offset: number, q: string) => {
    const page = await studentService.getList({
      offset, limit: DUE_PAGE, search: q || undefined,
    });
    const dues: DueItem[] = page.items
      .filter(s => s.currentDue > 0)
      .map(s => ({
        ...s,
        due: s.currentDue,
        oldestDue: null,
        fatherPhone: null,
      }));
    setItems(prev => offset === 0 ? dues : [...prev, ...dues]);
    setNextOffset(page.nextOffset);
    setHasMore(page.hasMore);
    setServerTotal(page.total);
  }, []);

  // Initial fetch + reload on search change (debounced).
  useEffect(() => {
    setLoading(true);
    setItems([]);
    const t = setTimeout(() => {
      appendPage(0, search)
        .catch(e => showToast(e instanceof Error ? e.message : 'Failed to load defaulters', 'error'))
        .finally(() => setLoading(false));
    }, search ? 250 : 0);
    return () => clearTimeout(t);
  }, [search, appendPage, showToast]);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      await appendPage(nextOffset, search);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to load more', 'error');
    } finally { setLoadingMore(false); }
  };

  // Sort largest dues first within the currently-loaded slice. Server-side
  // ordering by due-amount would need a custom RPC; client-side sort on the
  // in-memory page is fine here because we never hold more than a few pages.
  const visible = useMemo(
    () => [...items].sort((a, b) => b.due - a.due),
    [items],
  );

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

      {visible.length === 0 && !hasMore && (
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

      {hasMore && (
        <button onClick={loadMore} disabled={loadingMore}
          className="w-full py-3 bg-white border border-slate-200 rounded-2xl font-black text-xs text-violet-700 hover:bg-violet-50 disabled:opacity-60 flex items-center justify-center gap-2">
          {loadingMore ? <Loader2 size={14} className="animate-spin" /> : null}
          {loadingMore ? 'Loading…' : `Load More (${Math.max(0, serverTotal - nextOffset)} students remaining to scan)`}
        </button>
      )}
      {visible.length > 0 && (
        <p className="text-center text-[10px] font-bold text-slate-300">
          Showing {visible.length} due student{visible.length === 1 ? '' : 's'}
          {!hasMore && serverTotal > 0 ? ` from ${serverTotal} scanned` : ''}
        </p>
      )}
    </div>
  );
};
