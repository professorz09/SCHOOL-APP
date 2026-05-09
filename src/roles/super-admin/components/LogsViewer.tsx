import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, History, ShieldCheck, Building2, IndianRupee, MailPlus, Server, Shield, Search, Download, X } from 'lucide-react';
import { useLogsStore } from '@/roles/super-admin/logsStore';
import { useUIStore } from '@/store/uiStore';
import { LogType } from '@/shared/config/constants';

interface Props {
  onBack: () => void;
}

const LOG_META: Record<LogType | 'ALL', { label: string; icon: React.ReactNode; color: string }> = {
  ALL: { label: 'All', icon: <History size={14} />, color: 'text-slate-600 bg-slate-100' },
  [LogType.SCHOOL]: { label: 'School', icon: <Building2 size={14} />, color: 'text-indigo-600 bg-indigo-50' },
  [LogType.BILLING]: { label: 'Billing', icon: <IndianRupee size={14} />, color: 'text-emerald-600 bg-emerald-50' },
  [LogType.ADMIN]: { label: 'Admin', icon: <ShieldCheck size={14} />, color: 'text-rose-600 bg-rose-50' },
  [LogType.BROADCAST]: { label: 'Broadcast', icon: <MailPlus size={14} />, color: 'text-amber-600 bg-amber-50' },
  [LogType.SYSTEM]: { label: 'System', icon: <Server size={14} />, color: 'text-slate-600 bg-slate-100' },
  [LogType.SECURITY]: { label: 'Security', icon: <Shield size={14} />, color: 'text-red-600 bg-red-50' },
};

export const LogsViewer: React.FC<Props> = ({ onBack }) => {
  const { logs, isLoading, activeFilter, fetchLogs, setFilter } = useLogsStore();
  const { showToast } = useUIStore();

  // Free-text search (action / entity / performer) and a simple date range.
  // Both filters are client-side so they layer on top of the existing type
  // chip without touching the store or service.
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [shown, setShown] = useState(50);
  useEffect(() => { setShown(50); }, [activeFilter, search, fromDate, toDate]);

  useEffect(() => {
    fetchLogs().catch(e => showToast(e instanceof Error ? e.message : 'Failed to load logs', 'error'));
  }, []);

  const visible = useMemo(() => {
    let out = activeFilter === 'ALL' ? logs : logs.filter(l => l.entityType === activeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter(l =>
        l.action.toLowerCase().includes(q) ||
        l.entity.toLowerCase().includes(q) ||
        l.performedBy.toLowerCase().includes(q),
      );
    }
    // Timestamp is a free-form display string from the service. We only
    // filter by date when the row's timestamp parses to a real Date — rows
    // with relative strings ("2 min ago") fall through unchanged.
    if (fromDate || toDate) {
      const fromTs = fromDate ? new Date(fromDate).getTime() : -Infinity;
      const toTs = toDate ? new Date(toDate).getTime() + 86_399_000 : Infinity;
      out = out.filter(l => {
        const t = new Date(l.timestamp).getTime();
        if (Number.isNaN(t)) return true;
        return t >= fromTs && t <= toTs;
      });
    }
    return out;
  }, [logs, activeFilter, search, fromDate, toDate]);

  const exportCsv = () => {
    if (visible.length === 0) {
      showToast('Nothing to export with current filters', 'error');
      return;
    }
    // RFC 4180-ish escaping: wrap every field in quotes and double any
    // embedded quote. Good enough for Excel + Google Sheets.
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const header = ['Timestamp', 'Type', 'Action', 'Entity', 'Performed By'].map(esc).join(',');
    const rows = visible.map(l =>
      [l.timestamp, l.entityType, l.action, l.entity, l.performedBy].map(esc).join(','),
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `system-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${visible.length} entries`);
  };

  const hasActiveFilters = !!search || !!fromDate || !!toDate || activeFilter !== 'ALL';
  const clearFilters = () => {
    setSearch(''); setFromDate(''); setToDate(''); setFilter('ALL');
  };

  return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600 hover:bg-slate-200 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">System Logs</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-[10px] font-black text-slate-500 bg-slate-100 px-3 py-1 rounded-full uppercase tracking-widest">
            {visible.length} entries
          </div>
          <button onClick={exportCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 text-white rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm hover:bg-emerald-600 transition-colors">
            <Download size={12}/> CSV
          </button>
        </div>
      </div>

      {/* Search + date range */}
      <div className="bg-white border-b border-slate-100 px-4 py-3 space-y-2">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search action, entity, or user…"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-9 py-2.5 font-bold text-sm outline-none focus:border-blue-500"/>
          {search && (
            <button onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center">
              <X size={11} className="text-slate-600"/>
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold text-xs outline-none focus:border-blue-500"/>
          <span className="text-[10px] font-black text-slate-400">→</span>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold text-xs outline-none focus:border-blue-500"/>
          {hasActiveFilters && (
            <button onClick={clearFilters}
              className="px-3 py-2 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest">
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Filter chips */}
      <div className="bg-white border-b border-slate-100 px-4 py-3">
        <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
          {(['ALL', ...Object.values(LogType)] as const).map(type => {
            const meta = LOG_META[type];
            return (
              <button key={type} onClick={() => setFilter(type)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors ${activeFilter === type ? 'bg-slate-900 text-white' : `${meta.color} border border-transparent`}`}>
                {meta.icon}
                {meta.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4  space-y-3">
        {isLoading && (
          <div className="flex flex-col items-center py-16 text-slate-400">
            <div className="w-8 h-8 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin mb-3" />
            <p className="font-bold text-sm">Loading…</p>
          </div>
        )}
        {!isLoading && visible.length === 0 && (
          <div className="flex flex-col items-center py-16 text-slate-400">
            <History size={32} className="mb-3 opacity-40" />
            <p className="font-bold text-sm">No logs for this filter</p>
          </div>
        )}
        {visible.slice(0, shown).map(log => {
          const meta = LOG_META[log.entityType];
          return (
            <div key={log.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex gap-3 items-start">
              <div className={`mt-0.5 w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${meta.color}`}>
                {meta.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start gap-2">
                  <div className="font-extrabold text-slate-900 text-sm leading-tight">{log.action}</div>
                  <span className="text-[9px] font-black text-slate-400 whitespace-nowrap shrink-0">{log.timestamp}</span>
                </div>
                <div className="mt-1.5 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-slate-400 w-10 shrink-0">Entity</span>
                    <span className="text-[10px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md truncate">{log.entity}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-slate-400 w-10 shrink-0">By</span>
                    <span className="text-[10px] font-bold text-slate-500">{log.performedBy}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {visible.length > shown && (
          <button onClick={() => setShown(s => s + 50)}
            className="w-full py-3 bg-white border border-slate-200 rounded-2xl font-black text-xs text-blue-700 hover:bg-blue-50 transition-colors">
            Load More ({visible.length - shown} remaining)
          </button>
        )}
        {visible.length > 0 && (
          <p className="text-center text-[10px] font-bold text-slate-300 pt-1">
            Showing {Math.min(shown, visible.length)} of {visible.length}
          </p>
        )}
      </div>
    </div>
  );
};
