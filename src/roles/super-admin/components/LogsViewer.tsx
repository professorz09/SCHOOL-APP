import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, History, ShieldCheck, Building2, IndianRupee, MailPlus, Server, Shield, Search, Download, X, ChevronLeft, ChevronRight } from 'lucide-react';
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
  const PAGE_SIZE = 25;
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [activeFilter, search, fromDate, toDate]);

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
    // BOM so Excel opens UTF-8 cleanly.
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `system-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    // Defer cleanup — Safari + mobile WebKit need the URL alive while
    // they actually start the download, otherwise the file is empty.
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1000);
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
        {visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(log => {
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
        {visible.length > PAGE_SIZE && (
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={visible.length}
            onChange={setPage}
          />
        )}
      </div>
    </div>
  );
};

// ─── Reusable pagination control ────────────────────────────────────────────
// Page-number style: Prev | 1 2 [3] 4 5 | Next. Window slides around the
// current page so we never render hundreds of buttons. Used here in the
// logs viewer; export-grade so other heavy lists can reuse it.
export const Pagination: React.FC<{
  page: number;
  pageSize: number;
  total: number;
  onChange: (next: number) => void;
}> = ({ page, pageSize, total, onChange }) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pages = pageWindow(safePage, totalPages, 5);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(total, safePage * pageSize);
  return (
    <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-3 mt-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
          {start}–{end} of {total}
        </p>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onChange(safePage - 1)}
            disabled={safePage <= 1}
            className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center active:scale-95 transition-transform">
            <ChevronLeft size={14} className="text-slate-600" />
          </button>
          {pages[0] > 1 && (
            <>
              <PageBtn n={1} active={safePage === 1} onClick={() => onChange(1)} />
              {pages[0] > 2 && <span className="text-[10px] font-bold text-slate-400 px-1">…</span>}
            </>
          )}
          {pages.map(n => (
            <PageBtn key={n} n={n} active={n === safePage} onClick={() => onChange(n)} />
          ))}
          {pages[pages.length - 1] < totalPages && (
            <>
              {pages[pages.length - 1] < totalPages - 1 && <span className="text-[10px] font-bold text-slate-400 px-1">…</span>}
              <PageBtn n={totalPages} active={safePage === totalPages} onClick={() => onChange(totalPages)} />
            </>
          )}
          <button
            onClick={() => onChange(safePage + 1)}
            disabled={safePage >= totalPages}
            className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center active:scale-95 transition-transform">
            <ChevronRight size={14} className="text-slate-600" />
          </button>
        </div>
      </div>
    </div>
  );
};

const PageBtn: React.FC<{ n: number; active: boolean; onClick: () => void }> = ({ n, active, onClick }) => (
  <button
    onClick={onClick}
    className={`min-w-8 h-8 px-2 rounded-lg text-xs font-black active:scale-95 transition-transform ${
      active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
    }`}>
    {n}
  </button>
);

function pageWindow(current: number, total: number, size: number): number[] {
  if (total <= size) return Array.from({ length: total }, (_, i) => i + 1);
  const half = Math.floor(size / 2);
  let start = Math.max(1, current - half);
  let end = start + size - 1;
  if (end > total) { end = total; start = end - size + 1; }
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}
