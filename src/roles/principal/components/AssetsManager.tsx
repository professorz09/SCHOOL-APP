// School inventory — flat list of everything the school owns.
//
// Earlier this screen had a Library/Lab split with per-student loan tracking.
// In practice principals just wanted a register of what's on the shelves;
// the assignment workflow added churn (add → assign → decline → re-add) and
// kept the view perpetually in motion. This rewrite collapses everything to
// one chronological inventory list with three categories — BOOK / LAB / OTHER.
//
// What's gone:
//   • Issue / return / loan history (asset_issues table no longer touched)
//   • Library/Lab top-level tabs and Inventory/History sub-tabs
//   • Working-vs-faulty counter on equipment
// What's added:
//   • Single segmented filter (All / Books / Lab / Other)
//   • Add modal with title, category, quantity, description, note, date
//   • Timeline view grouped by addedOn date
//   • Server-side rate-limit on inventory/add (stops spam loops)

import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Library, FlaskConical, BookOpen, Box, Plus, Search,
  Trash2, X, Pencil, Check, AlertTriangle, History as HistoryIcon,
  ArrowUpFromLine, ArrowDownToLine, RefreshCw,
} from 'lucide-react';
import { apiPrincipal } from '@/lib/apiClient';
import { useUIStore } from '@/store/uiStore';

type Category = 'BOOK' | 'LAB_EQUIPMENT' | 'OTHER';
type Filter = 'ALL' | Category;

interface InventoryItem {
  id: string;
  category: Category;
  title: string;
  description: string;
  note: string;
  quantity: number;
  addedOn: string;
  createdAt: string;
}

interface Props { onBack: () => void; }

const CATEGORY_META: Record<Category, { label: string; icon: typeof BookOpen; tint: string; soft: string }> = {
  BOOK:          { label: 'Book',     icon: BookOpen,     tint: 'text-amber-700',   soft: 'bg-amber-50' },
  LAB_EQUIPMENT: { label: 'Lab',      icon: FlaskConical, tint: 'text-emerald-700', soft: 'bg-emerald-50' },
  OTHER:         { label: 'Other',    icon: Box,          tint: 'text-slate-700',   soft: 'bg-slate-100' },
};

const FILTER_TABS: Array<{ key: Filter; label: string }> = [
  { key: 'ALL',           label: 'All' },
  { key: 'BOOK',          label: 'Books' },
  { key: 'LAB_EQUIPMENT', label: 'Lab' },
  { key: 'OTHER',         label: 'Other' },
];

const todayIso = () => new Date().toISOString().slice(0, 10);
const formatDay = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

export const AssetsManager: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();

  const [items, setItems]         = useState<InventoryItem[]>([]);
  const [filter, setFilter]       = useState<Filter>('ALL');
  const [search, setSearch]       = useState('');
  const [editMode, setEditMode]   = useState(false);
  const [loading, setLoading]     = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // History view + data. Toggled on demand so we don't fetch the audit log
  // until the principal asks for it. The trigger keeps history bounded to
  // 7 days / 1000 rows per school, so this is always small.
  // Three action types — ADD / DELETE / UPDATE — all logged by the
  // server endpoints. UPDATE was missing in the prior backend; now
  // every edit produces a row so the timeline reflects every change.
  type HistoryEntry = {
    id: string; action: 'ADD' | 'DELETE' | 'UPDATE';
    title: string; category: Category;
    quantity: number; description: string | null; note: string | null;
    done_by_name: string | null; done_at: string;
  };
  const [view, setView] = useState<'INVENTORY' | 'HISTORY'>('INVENTORY');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyShown, setHistoryShown] = useState(50);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [addOpen, setAddOpen]   = useState(false);
  const [editing, setEditing]   = useState<InventoryItem | null>(null);
  const [deleting, setDeleting] = useState<InventoryItem | null>(null);

  const blankForm = () => ({
    title: '', category: 'BOOK' as Category, quantity: 1,
    description: '', note: '', addedOn: todayIso(),
  });
  const [form, setForm] = useState(blankForm);

  const refresh = async () => {
    setLoading(true);
    try {
      const list = await apiPrincipal.inventoryList();
      setItems(list);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to load inventory', 'error');
    } finally { setLoading(false); }
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const refreshHistory = React.useCallback(async () => {
    setHistoryLoading(true);
    try {
      const rows = await apiPrincipal.inventoryHistory();
      setHistory(rows as HistoryEntry[]);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to load history', 'error');
    } finally {
      setHistoryLoading(false);
    }
  }, [showToast]);

  // Lazy-load history when the user flips to that view; refresh on every
  // open so adds/deletes the principal just performed appear without a
  // hard reload.
  useEffect(() => {
    if (view !== 'HISTORY') return;
    void refreshHistory();
  }, [view, refreshHistory]);

  // Group history entries by date for the same timeline pattern as the
  // inventory list. Newest first.
  const historyGroups = useMemo(() => {
    // Slice BEFORE grouping so the Load More pager shows the latest N
    // entries grouped by day, not the latest N days.
    const limited = history.slice(0, historyShown);
    const map = new Map<string, HistoryEntry[]>();
    for (const h of limited) {
      const day = h.done_at.slice(0, 10);
      const arr = map.get(day) ?? [];
      arr.push(h);
      map.set(day, arr);
    }
    return [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, arr]) => ({ date, entries: arr }));
  }, [history, historyShown]);
  const historyRemaining = history.length - Math.min(historyShown, history.length);

  // Filter + search applied in one pass; memoised so the long timeline
  // grouping below only re-runs when the inputs actually change.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter(i => filter === 'ALL' || i.category === filter)
      .filter(i => !q
        || i.title.toLowerCase().includes(q)
        || i.description.toLowerCase().includes(q)
        || i.note.toLowerCase().includes(q));
  }, [items, filter, search]);

  // Group by addedOn so the timeline reads as "what we got on this date"
  // rather than a flat list. Newest first.
  const groups = useMemo(() => {
    const map = new Map<string, InventoryItem[]>();
    for (const i of filtered) {
      const arr = map.get(i.addedOn) ?? [];
      arr.push(i);
      map.set(i.addedOn, arr);
    }
    return [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, arr]) => ({ date, items: arr }));
  }, [filtered]);

  // Counters surfaced as filter-pill badges so the principal sees totals
  // without opening each category.
  const counts = useMemo(() => {
    const c = { ALL: items.length, BOOK: 0, LAB_EQUIPMENT: 0, OTHER: 0 } as Record<Filter, number>;
    for (const i of items) c[i.category]++;
    return c;
  }, [items]);

  const totalUnits = useMemo(
    () => filtered.reduce((s, i) => s + i.quantity, 0),
    [filtered],
  );

  const handleAdd = async () => {
    const title = form.title.trim();
    if (!title) { showToast('Title required', 'error'); return; }
    if (!Number.isFinite(form.quantity) || form.quantity < 1) {
      showToast('Quantity must be 1 or more', 'error'); return;
    }
    setSubmitting(true);
    try {
      const result = await apiPrincipal.inventoryAdd({
        title, category: form.category, quantity: form.quantity,
        description: form.description.trim() || undefined,
        note: form.note.trim() || undefined,
        addedOn: form.addedOn,
      });
      // Diagnostic — earlier users reported "no error, no add" silent
      // failures. Logging the server-returned id confirms the insert
      // really happened; if it didn't, the catch path runs instead.
      // eslint-disable-next-line no-console
      console.log('[inventory/add] inserted:', result);
      showToast(`"${title}" added to inventory`);
      setForm(blankForm());
      setAddOpen(false);
      // Optimistically prepend so the row appears before the round-
      // trip to /inventory/list lands. If refresh() returns a fresher
      // value, setItems will replace this with the canonical list.
      const optimistic: InventoryItem = {
        id: result.id, category: form.category, title,
        description: form.description.trim() || '',
        note: form.note.trim() || '',
        quantity: form.quantity,
        addedOn: form.addedOn || todayIso(),
        createdAt: new Date().toISOString(),
      };
      setItems(prev => [optimistic, ...prev]);
      // Refresh both lists so the History tab is current the next time
      // the principal flips to it without waiting for the tab effect.
      await Promise.all([refresh(), refreshHistory()]);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[inventory/add] failed:', e);
      showToast(e instanceof Error ? e.message : 'Failed to add', 'error');
    } finally { setSubmitting(false); }
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    const title = editing.title.trim();
    if (!title) { showToast('Title required', 'error'); return; }
    setSubmitting(true);
    try {
      await apiPrincipal.inventoryUpdate({
        id: editing.id,
        title,
        quantity: editing.quantity,
        description: editing.description,
        note: editing.note,
      });
      showToast('Saved');
      setEditing(null);
      await refresh();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to save', 'error');
    } finally { setSubmitting(false); }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setSubmitting(true);
    try {
      await apiPrincipal.inventoryDelete(deleting.id);
      showToast(`"${deleting.title}" removed`);
      setDeleting(null);
      await Promise.all([refresh(), refreshHistory()]);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to delete', 'error');
    } finally { setSubmitting(false); }
  };

  return (
    <div className="w-full lg:max-w-5xl lg:mx-auto bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300 min-h-screen">
      {/* Sticky header — top bar minimal, search + filters compact. */}
      <div className="bg-white border-b border-slate-100 sticky top-0 z-10 shadow-sm">
        {/* Title row */}
        <div className="px-4 pt-4 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600 shrink-0">
              <ArrowLeft size={20} />
            </button>
            <div className="min-w-0">
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Inventory</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">
                School ka register · history bhi
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setEditMode(m => !m)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors ${
                editMode ? 'bg-rose-500 text-white shadow-md' : 'bg-slate-100 text-slate-600'
              }`}>
              {editMode ? <><Check size={12}/> Done</> : <><Pencil size={12}/> Edit</>}
            </button>
            <button
              onClick={() => { setForm(blankForm()); setAddOpen(true); }}
              className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-full shadow-md shadow-amber-200/50 font-black text-[11px] uppercase tracking-widest active:scale-95 transition-transform">
              <Plus size={14} /> Add
            </button>
          </div>
        </div>

        {/* Stat hero — three coloured tiles summarising totals at a
            glance. Replaces the tiny "X items · Y units" line which was
            invisible on phones. Tapping a stat sets the filter. */}
        <div className="px-4 pb-3 grid grid-cols-3 gap-2">
          {(['BOOK', 'LAB_EQUIPMENT', 'OTHER'] as const).map(cat => {
            const meta = CATEGORY_META[cat];
            const Icon = meta.icon;
            const active = filter === cat;
            return (
              <button key={cat}
                onClick={() => { setView('INVENTORY'); setFilter(active ? 'ALL' : cat); }}
                className={`text-left rounded-2xl p-3 border transition-all active:scale-[0.98] ${
                  active
                    ? `${meta.soft} border-current ${meta.tint} ring-2 ring-current/20`
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-1.5 ${meta.soft} ${meta.tint}`}>
                  <Icon size={16} />
                </div>
                <div className={`text-lg font-black tabular-nums ${active ? meta.tint : 'text-slate-900'}`}>
                  {counts[cat]}
                </div>
                <div className={`text-[9px] font-black uppercase tracking-widest ${active ? meta.tint : 'text-slate-400'}`}>
                  {meta.label}
                </div>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="px-4 pb-2.5">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by title, description, note…"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 font-bold text-sm outline-none focus:border-amber-400 focus:bg-white transition-colors" />
          </div>
        </div>

        {/* View switch + All filter pill in one compact row */}
        <div className="px-4 pb-3 flex gap-2">
          <div className="flex bg-slate-100 rounded-xl p-1 flex-1">
            <button onClick={() => setView('INVENTORY')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-widest transition-colors ${
                view === 'INVENTORY' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500'
              }`}>
              <Library size={13}/> Inventory
              <span className={`text-[9px] tabular-nums ${view === 'INVENTORY' ? 'text-amber-500' : 'text-slate-400'}`}>
                {counts.ALL}
              </span>
            </button>
            <button onClick={() => setView('HISTORY')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-widest transition-colors ${
                view === 'HISTORY' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500'
              }`}>
              <HistoryIcon size={13}/> History
            </button>
          </div>
          {view === 'INVENTORY' && filter !== 'ALL' && (
            <button onClick={() => setFilter('ALL')}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors flex items-center gap-1">
              <X size={12}/> Clear
            </button>
          )}
        </div>

        {/* Active filter strip — show only when a category is selected,
            replaces the always-present row of 4 filter pills */}
        {view === 'INVENTORY' && filter !== 'ALL' && (
          <div className="px-4 pb-2 -mt-1">
            <div className="text-[10px] font-bold text-slate-500">
              Showing <span className={`px-1.5 py-0.5 rounded ${CATEGORY_META[filter as Category].soft} ${CATEGORY_META[filter as Category].tint} font-black uppercase tracking-widest`}>
                {CATEGORY_META[filter as Category].label}
              </span> · {filtered.length} item{filtered.length === 1 ? '' : 's'} · {totalUnits} units
            </div>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4">
        {view === 'HISTORY' ? (
          historyLoading ? (
            <div className="flex flex-col items-center py-20 text-slate-400">
              <HistoryIcon size={32} className="mb-3 opacity-30 animate-pulse" />
              <p className="font-bold text-sm">Loading…</p>
            </div>
          ) : historyGroups.length === 0 ? (
            <div className="flex flex-col items-center py-20 text-slate-400">
              <HistoryIcon size={32} className="mb-3 opacity-30" />
              <p className="font-bold text-sm">No activity in the last 7 days</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 mb-3">
                <p className="text-[10px] font-bold text-slate-500">
                  Last 7 days · max 1000 entries · auto-pruned
                </p>
                <button onClick={refreshHistory}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors">
                  <RefreshCw size={11}/> Refresh
                </button>
              </div>
              {/* Vertical-rail timeline. A 2 px slate line runs down the
                  left margin; every event gets a coloured dot punched
                  through it (emerald = added, rose = removed, sky =
                  updated). Cards float to the right of the rail. */}
              <div className="relative pl-6">
                <div className="absolute left-2 top-1 bottom-1 w-px bg-slate-200" aria-hidden />
                <div className="space-y-5">
                  {historyGroups.map(group => (
                    <div key={group.date}>
                      <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 -ml-6 pl-6">
                        {formatDay(group.date)}
                        <span className="text-slate-300 font-bold mx-1.5">·</span>
                        <span className="text-slate-400">{group.entries.length} event{group.entries.length === 1 ? '' : 's'}</span>
                      </div>
                      <div className="space-y-2">
                        {group.entries.map(h => {
                          const meta = CATEGORY_META[h.category];
                          const actionLabel =
                            h.action === 'ADD' ? 'Added'
                          : h.action === 'DELETE' ? 'Removed'
                          : 'Updated';
                          const dotBg =
                            h.action === 'ADD' ? 'bg-emerald-500'
                          : h.action === 'DELETE' ? 'bg-rose-500'
                          : 'bg-sky-500';
                          const actionFg =
                            h.action === 'ADD' ? 'text-emerald-600'
                          : h.action === 'DELETE' ? 'text-rose-600'
                          : 'text-sky-600';
                          return (
                            <div key={h.id} className="relative">
                              {/* Dot punched through the rail */}
                              <span className={`absolute -left-[18px] top-4 w-2.5 h-2.5 rounded-full ring-2 ring-white ${dotBg}`} aria-hidden />
                              <div className="bg-white rounded-xl border border-slate-200 hover:border-slate-300 transition-colors px-4 py-3.5">
                                <div className="flex items-start justify-between gap-3">
                                  <h3 className="font-semibold text-slate-900 text-[15px] leading-tight truncate">
                                    {h.title}
                                  </h3>
                                  <span className={`text-[11px] font-medium uppercase tracking-wider shrink-0 ${actionFg}`}>
                                    {actionLabel}
                                  </span>
                                </div>
                                {h.description && (
                                  <p className="text-xs text-slate-500 mt-1 leading-snug line-clamp-2">{h.description}</p>
                                )}
                                <div className="flex items-center flex-wrap gap-2 mt-2 text-[11px] text-slate-400">
                                  <span className="uppercase tracking-wider">{meta.label}</span>
                                  <span>·</span>
                                  <span className="tabular-nums">Qty {h.quantity}</span>
                                  {h.done_by_name && (<><span>·</span><span>by {h.done_by_name}</span></>)}
                                  <span>·</span>
                                  <span className="tabular-nums">
                                    {new Date(h.done_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {historyRemaining > 0 && (
                <button onClick={() => setHistoryShown(s => s + 50)}
                  className="mt-4 w-full py-3 bg-white border border-slate-200 rounded-2xl font-black text-xs text-amber-700 hover:bg-amber-50 transition-colors">
                  Load More ({historyRemaining} remaining)
                </button>
              )}
            </>
          )
        ) : loading ? (
          <div className="flex flex-col items-center py-20 text-slate-400">
            <Library size={32} className="mb-3 opacity-30 animate-pulse" />
            <p className="font-bold text-sm">Loading…</p>
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-slate-400">
            <Library size={32} className="mb-3 opacity-30" />
            <p className="font-bold text-sm">
              {search ? 'No matches' : items.length === 0 ? 'No inventory yet' : `No ${CATEGORY_META[filter as Category]?.label?.toLowerCase() ?? 'items'} found`}
            </p>
            {items.length === 0 && (
              <button onClick={() => { setForm(blankForm()); setAddOpen(true); }}
                className="mt-4 flex items-center gap-1.5 bg-amber-500 text-white font-black text-[11px] uppercase tracking-widest px-4 py-2 rounded-xl shadow-md active:scale-95 transition-transform">
                <Plus size={14}/> Add your first item
              </button>
            )}
          </div>
        ) : (
          // Date-grouped list. Each group has a small heading and a stack of
          // rows. No timeline rail / coloured dots — earlier the dots read as
          // playful indicators on what's really a register, so swapped to a
          // clean section + row layout. Category is conveyed via a slim left
          // border accent + small label, not the icon size.
          // Flat list — no date headers. Each card carries its own
          // "Added on" date in the meta line so the principal can see
          // when every item entered the register without scanning a
          // separate group label.
          <div className="space-y-2">
            {groups.flatMap(g => g.items).map(item => {
              const meta = CATEGORY_META[item.category];
              return (
                <div key={item.id}
                  className="bg-white rounded-xl border border-slate-200 hover:border-slate-300 transition-colors px-4 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-slate-900 text-[15px] leading-tight truncate">
                        {item.title}
                      </h3>
                      {item.description && (
                        <p className="text-xs text-slate-500 mt-1 leading-snug line-clamp-2">
                          {item.description}
                        </p>
                      )}
                      <div className="flex items-center flex-wrap gap-2 mt-2 text-[11px] text-slate-400">
                        <span className="uppercase tracking-wider">{meta.label}</span>
                        <span>·</span>
                        <span className="tabular-nums">Qty {item.quantity}</span>
                        <span>·</span>
                        <span className="tabular-nums">Added {formatDay(item.addedOn)}</span>
                      </div>
                      {item.note && (
                        <p className="text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100 leading-snug">
                          {item.note}
                        </p>
                      )}
                    </div>
                    {editMode && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => setEditing({ ...item })}
                          title="Edit"
                          className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => setDeleting(item)}
                          title="Delete"
                          className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add modal */}
      {addOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-end">
          <div className="w-full max-w-lg mx-auto bg-white rounded-t-3xl p-5 pb-7 animate-in slide-in-from-bottom-8 max-h-[90vh] overflow-y-auto space-y-3.5">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-slate-900 text-lg">Add Inventory</h3>
              <button onClick={() => setAddOpen(false)} className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center">
                <X size={16} className="text-slate-500" />
              </button>
            </div>

            {/* Category */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Category</label>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(CATEGORY_META) as Category[]).map(c => {
                  const meta = CATEGORY_META[c];
                  const active = form.category === c;
                  const Icon = meta.icon;
                  return (
                    <button key={c} onClick={() => setForm(f => ({ ...f, category: c }))}
                      className={`flex flex-col items-center gap-1 py-3 rounded-xl border-2 transition-colors ${
                        active ? `${meta.soft} border-current ${meta.tint}` : 'bg-slate-50 border-slate-200 text-slate-500'
                      }`}>
                      <Icon size={18} />
                      <span className="text-[10px] font-black uppercase tracking-widest">{meta.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Title *</label>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Class 5 Mathematics"
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-amber-500" />
            </div>

            {/* Quantity + Date */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Quantity *</label>
                <input type="number" min="1" value={form.quantity}
                  onChange={e => setForm(f => ({ ...f, quantity: +e.target.value }))}
                  className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-amber-500" />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Added on</label>
                <input type="date" value={form.addedOn}
                  max={todayIso()}
                  onChange={e => setForm(f => ({ ...f, addedOn: e.target.value }))}
                  className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none focus:border-amber-500" />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Description</label>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={2} placeholder="What is this? Author / model / make…"
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-2.5 font-bold text-sm outline-none focus:border-amber-500 resize-none" />
            </div>

            {/* Note — separate from description so it's clearly the
                purchase / condition / supplier annotation, not the item info. */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Note (optional)</label>
              <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                rows={2} placeholder="Purchase invoice, condition on arrival, supplier…"
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-2.5 font-bold text-sm outline-none focus:border-amber-500 resize-none" />
            </div>

            <button type="button" onClick={handleAdd} disabled={submitting || !form.title.trim()}
              className="w-full flex items-center justify-center gap-2 bg-amber-500 text-white font-black text-sm uppercase tracking-widest py-3.5 rounded-2xl active:scale-95 transition-transform disabled:opacity-60">
              {submitting ? 'Adding…' : <><Plus size={16} /> Add to Inventory</>}
            </button>
          </div>
        </div>
      )}

      {/* Edit modal — same layout, addedOn locked to keep timeline groups stable */}
      {editing && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-end">
          <div className="w-full max-w-lg mx-auto bg-white rounded-t-3xl p-5 pb-7 animate-in slide-in-from-bottom-8 max-h-[90vh] overflow-y-auto space-y-3.5">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-slate-900 text-lg">Edit Item</h3>
              <button onClick={() => setEditing(null)} className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center">
                <X size={16} className="text-slate-500" />
              </button>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Title *</label>
              <input value={editing.title} onChange={e => setEditing(prev => prev ? { ...prev, title: e.target.value } : prev)}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-amber-500" />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Quantity *</label>
              <input type="number" min="0" value={editing.quantity}
                onChange={e => setEditing(prev => prev ? { ...prev, quantity: +e.target.value } : prev)}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-amber-500" />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Description</label>
              <textarea value={editing.description}
                onChange={e => setEditing(prev => prev ? { ...prev, description: e.target.value } : prev)}
                rows={2}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-2.5 font-bold text-sm outline-none focus:border-amber-500 resize-none" />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Note</label>
              <textarea value={editing.note}
                onChange={e => setEditing(prev => prev ? { ...prev, note: e.target.value } : prev)}
                rows={2}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-2.5 font-bold text-sm outline-none focus:border-amber-500 resize-none" />
            </div>
            <button onClick={handleSaveEdit} disabled={submitting || !editing.title.trim()}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white font-black text-sm uppercase tracking-widest py-3.5 rounded-2xl active:scale-95 transition-transform disabled:opacity-60">
              {submitting ? 'Saving…' : <><Check size={16}/> Save Changes</>}
            </button>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleting && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-5">
          <div className="w-full max-w-sm bg-white rounded-3xl p-5 animate-in zoom-in-95 duration-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 flex items-center justify-center shrink-0">
                <AlertTriangle size={22} className="text-rose-600"/>
              </div>
              <div className="min-w-0">
                <h3 className="font-black text-slate-900 text-base">Delete from inventory?</h3>
                <p className="text-xs font-bold text-slate-500 truncate">{deleting.title}</p>
              </div>
            </div>
            <p className="text-[11px] font-bold text-slate-500 leading-relaxed">
              Permanently removes this item. Can't be undone.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setDeleting(null)}
                className="flex-1 py-3 rounded-2xl bg-slate-100 text-slate-700 font-black text-sm uppercase tracking-widest">
                Cancel
              </button>
              <button onClick={handleDelete} disabled={submitting}
                className="flex-1 py-3 rounded-2xl bg-rose-600 text-white font-black text-sm uppercase tracking-widest disabled:opacity-60">
                {submitting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
