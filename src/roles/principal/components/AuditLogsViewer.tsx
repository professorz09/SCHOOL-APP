import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Filter, Search, RefreshCw, ChevronDown, ChevronUp,
  History, User, Clock, ArrowRight,
} from 'lucide-react';
import {
  auditService, MODULE_LABEL, DEFAULT_MODULES,
  type AuditLogEntry, type AuditModule,
} from '@/shared/utils/audit.service';
import { useUIStore } from '@/store/uiStore';

interface Props { onBack: () => void; }

const MODULE_ORDER: AuditModule[] = [
  'STUDENT_EDIT', 'CLASS_ASSIGNMENT', 'TC', 'READMISSION',
  'FEE_PAYMENT', 'FEE_STRUCTURE', 'STAFF_ATTENDANCE', 'ACADEMIC_YEAR',
  'OTHER',
];

const MODULE_PILL: Record<AuditModule, string> = {
  STUDENT_EDIT:    'bg-indigo-50 text-indigo-700 border-indigo-200',
  CLASS_ASSIGNMENT:'bg-violet-50 text-violet-700 border-violet-200',
  TC:              'bg-rose-50 text-rose-700 border-rose-200',
  READMISSION:     'bg-emerald-50 text-emerald-700 border-emerald-200',
  FEE_PAYMENT:     'bg-amber-50 text-amber-700 border-amber-200',
  FEE_STRUCTURE:   'bg-orange-50 text-orange-700 border-orange-200',
  STAFF_ATTENDANCE:'bg-cyan-50 text-cyan-700 border-cyan-200',
  ACADEMIC_YEAR:   'bg-slate-100 text-slate-700 border-slate-200',
  OTHER:           'bg-slate-50 text-slate-500 border-slate-200',
};

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try { return JSON.stringify(v); } catch { return String(v); }
}

export const AuditLogsViewer: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();
  const [rows, setRows] = useState<AuditLogEntry[]>([]);
  const [shown, setShown] = useState(50);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Filters — default to "everything important", today onward.
  const [modules, setModules] = useState<AuditModule[]>(DEFAULT_MODULES);
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const data = await auditService.list({
        modules,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        search: search || undefined,
      });
      setRows(data);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to load logs', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleModule = (m: AuditModule) => {
    setModules(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);
  };

  // Reset pager when the filter set changes (the parent component refetches
  // rows, so this component can't know directly — but bumping shown back to
  // 50 whenever rows length drops keeps the pager honest).
  useEffect(() => { setShown(50); }, [rows.length]);
  const visibleRows = rows.slice(0, shown);
  const remainingRows = rows.length - visibleRows.length;

  // Group VISIBLE rows by date for a scannable feed.
  const grouped = useMemo(() => {
    const buckets = new Map<string, AuditLogEntry[]>();
    for (const r of visibleRows) {
      const key = r.createdAt.slice(0, 10);
      const list = buckets.get(key) ?? [];
      list.push(r);
      buckets.set(key, list);
    }
    return Array.from(buckets.entries()).sort(([a], [b]) => (a < b ? 1 : -1));
  }, [visibleRows]);

  return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300 min-h-screen">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 sticky top-0 z-10 shadow-sm flex items-center gap-3">
        <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Activity Logs</h2>
          <p className="text-[10px] font-bold text-slate-400 mt-0.5">
            Important changes · who, what, old → new, when
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="p-2 bg-slate-100 rounded-full text-slate-600 disabled:opacity-50"
          aria-label="Refresh"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Filter bar */}
      <div className="bg-white border-b border-slate-100 px-4 py-3 space-y-3">
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 bg-slate-100 rounded-xl px-3 py-2.5">
            <Search size={14} className="text-slate-400 shrink-0" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void refresh(); }}
              placeholder="Search action / id…"
              className="flex-1 bg-transparent outline-none text-xs font-bold text-slate-700 placeholder:text-slate-400"
            />
          </div>
          <button
            onClick={() => setFiltersOpen(v => !v)}
            className={`p-2.5 rounded-xl ${filtersOpen ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}
            aria-label="Filters"
          >
            <Filter size={14} />
          </button>
          <button
            onClick={refresh}
            className="px-3 py-2.5 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest"
          >
            Apply
          </button>
        </div>

        {filtersOpen && (
          <div className="space-y-3 pt-1">
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Modules</p>
              <div className="flex flex-wrap gap-1.5">
                {MODULE_ORDER.map(m => {
                  const active = modules.includes(m);
                  return (
                    <button
                      key={m}
                      onClick={() => toggleModule(m)}
                      className={`px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-wider ${
                        active ? MODULE_PILL[m] : 'bg-white text-slate-400 border-slate-200'
                      }`}
                    >
                      {MODULE_LABEL[m]}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1 block">From</label>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                  className="w-full bg-slate-100 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none" />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1 block">To</label>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                  className="w-full bg-slate-100 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {loading && rows.length === 0 && (
          <div className="flex flex-col items-center py-16 text-slate-400">
            <RefreshCw size={28} className="animate-spin mb-3" />
            <p className="font-bold text-sm">Loading…</p>
          </div>
        )}

        {!loading && rows.length === 0 && (
          <div className="flex flex-col items-center py-16 text-slate-400">
            <History size={32} className="mb-3 opacity-30" />
            <p className="font-bold text-sm">No activity in this range</p>
            <p className="text-[10px] font-bold text-slate-300 mt-1">Try widening your filters</p>
          </div>
        )}

        {grouped.map(([day, items]) => (
          <div key={day} className="space-y-2">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">
              {fmtDateTime(`${day}T00:00:00.000Z`).split(',')[0]}
            </div>
            {items.map(row => {
              const isOpen = expanded === row.id;
              const hasDetails = row.changes.length > 0 || Object.keys(row.details).length > 0;
              return (
                <div key={row.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <button
                    onClick={() => setExpanded(isOpen ? null : row.id)}
                    className="w-full flex items-start gap-3 p-3 text-left active:scale-[0.99] transition-transform"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${MODULE_PILL[row.module]}`}>
                          {row.moduleLabel}
                        </span>
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                          {row.action}
                        </span>
                      </div>
                      <p className="font-extrabold text-slate-900 text-sm mt-1 truncate">
                        {row.summary}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5 text-[10px] font-bold text-slate-500">
                        <span className="flex items-center gap-1">
                          <User size={10} className="text-slate-400" />
                          {row.actor.name}
                          {row.actor.role && (
                            <span className="text-slate-400">· {row.actor.role}</span>
                          )}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock size={10} className="text-slate-400" />
                          {fmtDateTime(row.createdAt)}
                        </span>
                      </div>
                    </div>
                    {hasDetails && (
                      isOpen
                        ? <ChevronUp size={16} className="text-slate-400 shrink-0 mt-1" />
                        : <ChevronDown size={16} className="text-slate-400 shrink-0 mt-1" />
                    )}
                  </button>

                  {isOpen && (
                    <div className="border-t border-slate-100 px-3 py-3 bg-slate-50 space-y-2.5">
                      {row.changes.length > 0 ? (
                        row.changes.map((c, i) => (
                          <div key={`${c.field}-${i}`} className="bg-white rounded-xl border border-slate-200 p-2.5">
                            <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                              {c.field}
                            </div>
                            <div className="flex items-start gap-2 text-xs font-bold">
                              <div className="flex-1 min-w-0 bg-rose-50 border border-rose-100 rounded-lg px-2 py-1.5 text-rose-700 break-words">
                                {fmtValue(c.oldValue)}
                              </div>
                              <ArrowRight size={12} className="text-slate-400 shrink-0 mt-2" />
                              <div className="flex-1 min-w-0 bg-emerald-50 border border-emerald-100 rounded-lg px-2 py-1.5 text-emerald-700 break-words">
                                {fmtValue(c.newValue)}
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-[10px] font-bold text-slate-500 italic">
                          No before/after captured for this event. Raw details below.
                        </p>
                      )}
                      {Object.keys(row.details).length > 0 && (
                        <details className="bg-white rounded-xl border border-slate-200 px-2.5 py-2">
                          <summary className="text-[10px] font-black uppercase tracking-widest text-slate-500 cursor-pointer">
                            Raw details
                          </summary>
                          <pre className="mt-2 text-[10px] font-mono text-slate-600 overflow-x-auto whitespace-pre-wrap break-all">
{JSON.stringify(row.details, null, 2)}
                          </pre>
                        </details>
                      )}
                      {row.entityId && (
                        <div className="text-[10px] font-bold text-slate-400">
                          {row.entityType ?? 'entity'} · <span className="font-mono text-slate-500">{row.entityId}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        {remainingRows > 0 && (
          <button onClick={() => setShown(s => s + 50)}
            className="w-full py-3 bg-white border border-slate-200 rounded-2xl font-black text-xs text-slate-700 hover:bg-slate-50 transition-colors">
            Load More ({remainingRows} remaining)
          </button>
        )}
        {rows.length > 0 && (
          <p className="text-center text-[10px] font-bold text-slate-300 pt-1">
            Showing {visibleRows.length} of {rows.length} events
          </p>
        )}
      </div>
    </div>
  );
};
