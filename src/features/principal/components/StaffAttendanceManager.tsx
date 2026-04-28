import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  ArrowLeft, ChevronLeft, ChevronRight, CheckCircle2,
  UserX, Clock3, CalendarX, Sun, RotateCcw, Lock, Save, Search,
} from 'lucide-react';
import { staffService } from '../../../services/staff.service';
import { StaffMember } from '../../../types/principal.types';

// ─── Types ────────────────────────────────────────────────────────────────────
export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'LEAVE' | 'LATE' | 'HOLIDAY';

interface StaffAttendanceRow {
  staffId: string;
  name: string;
  role: string;
  status: AttendanceStatus;
}

interface DayRecord {
  date: string;          // ISO YYYY-MM-DD
  rows: StaffAttendanceRow[];
  isLocked: boolean;     // locked once salary generated
  savedAt: string | null;
}

// ─── In-memory DB (simulates backend) ─────────────────────────────────────────
let _records: DayRecord[] = [];

// Salary-generated months (locked) – simulate: last month is locked
const LOCKED_MONTHS = new Set(['2026-03']); // March 2026 salary already generated

const isSalaryLocked = (date: string) => {
  const ym = date.slice(0, 7); // "YYYY-MM"
  return LOCKED_MONTHS.has(ym);
};

const getOrCreateRecord = (date: string, staff: StaffMember[]): DayRecord => {
  const existing = _records.find(r => r.date === date);
  if (existing) return existing;
  const fresh: DayRecord = {
    date,
    isLocked: isSalaryLocked(date),
    savedAt: null,
    rows: staff
      .filter(s => s.status !== 'SUSPENDED')
      .map(s => ({
        staffId: s.id,
        name: s.name,
        role: s.role.replace('_', ' '),
        status: 'PRESENT',
      })),
  };
  _records.push(fresh);
  return fresh;
};

const saveRecord = (record: DayRecord) => {
  const idx = _records.findIndex(r => r.date === record.date);
  const saved = { ...record, savedAt: new Date().toISOString() };
  if (idx >= 0) _records[idx] = saved;
  else _records.push(saved);
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<AttendanceStatus, { label: string; color: string; dot: string; short: string }> = {
  PRESENT:  { label: 'Present',  color: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', short: 'P' },
  ABSENT:   { label: 'Absent',   color: 'bg-rose-50 text-rose-700 border-rose-200',          dot: 'bg-rose-500',    short: 'A' },
  HALF_DAY: { label: 'Half Day', color: 'bg-amber-50 text-amber-700 border-amber-200',       dot: 'bg-amber-400',   short: 'H' },
  LEAVE:    { label: 'Leave',    color: 'bg-violet-50 text-violet-700 border-violet-200',    dot: 'bg-violet-400',  short: 'L' },
  LATE:     { label: 'Late',     color: 'bg-orange-50 text-orange-700 border-orange-200',    dot: 'bg-orange-400',  short: 'LT' },
  HOLIDAY:  { label: 'Holiday',  color: 'bg-sky-50 text-sky-700 border-sky-200',             dot: 'bg-sky-400',     short: 'H' },
};

const ROLE_LABEL: Record<string, string> = {
  TEACHER: 'Teacher', VICE_PRINCIPAL: 'V. Principal', ACCOUNTANT: 'Accountant',
  LIBRARIAN: 'Librarian', LAB_INCHARGE: 'Lab', DRIVER: 'Driver', PEON: 'Peon', SECURITY: 'Security',
};

const today = () => new Date().toISOString().split('T')[0];

const fmt = (iso: string) => {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};

const addDays = (iso: string, n: number) => {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
};

const monthLabel = (iso: string) => {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};

const dayShort = (d: string) => new Date(d).toLocaleDateString('en-IN', { weekday: 'short' });
const dayNum   = (d: string) => new Date(d).getDate();
const monthShort = (d: string) => new Date(d).toLocaleDateString('en-IN', { month: 'short' });
const isToday  = (d: string) => d === today();

const buildDateStrip = (count = 14): string[] => {
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(d.toISOString().split('T')[0]);
  }
  return out;
};

// ─── SALARY IMPACT helper ─────────────────────────────────────────────────────
const SALARY_IMPACT: Record<AttendanceStatus, string> = {
  PRESENT:  'Full salary',
  HOLIDAY:  'Full salary',
  LEAVE:    'Depends on config',
  ABSENT:   'Deducted',
  HALF_DAY: 'Half deducted',
  LATE:     'Optional rule',
};

// ─── Component ────────────────────────────────────────────────────────────────
interface Props { onBack: () => void; }

export const StaffAttendanceManager: React.FC<Props> = ({ onBack }) => {
  const stripRef = useRef<HTMLDivElement | null>(null);
  const [allStaff, setAllStaff] = useState<StaffMember[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(today());
  const [record, setRecord] = useState<DayRecord | null>(null);
  const [saved, setSaved] = useState(false);
  const [activeStatus, setActiveStatus] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const dateStrip = useMemo(() => buildDateStrip(14), []);

  useEffect(() => {
    staffService.getAll().then(staff => {
      setAllStaff(staff);
      setRecord(getOrCreateRecord(today(), staff));
    });
  }, []);

  const loadDate = (date: string) => {
    const r = getOrCreateRecord(date, allStaff);
    setSelectedDate(date);
    setRecord({ ...r });
    setSaved(false);
    setActiveStatus(null);
  };

  // ── ALL hooks BEFORE any conditional return ──────────────────────────────
  const counts = useMemo(() => {
    const c: Record<AttendanceStatus, number> = { PRESENT: 0, ABSENT: 0, HALF_DAY: 0, LEAVE: 0, LATE: 0, HOLIDAY: 0 };
    if (!record) return c;
    for (const row of record.rows) c[row.status]++;
    return c;
  }, [record]);

  const filtered = useMemo(() =>
    record ? record.rows.filter(s =>
      s.name.toLowerCase().includes(search.toLowerCase()) || s.role.toLowerCase().includes(search.toLowerCase())
    ) : []
  , [record, search]);

  useEffect(() => {
    if (!stripRef.current) return;
    const todayEl = stripRef.current.querySelector('[data-today="true"]');
    if (todayEl && 'scrollIntoView' in todayEl) {
      (todayEl as HTMLElement).scrollIntoView({ behavior: 'auto', inline: 'end', block: 'nearest' });
    }
  }, [dateStrip]);

  // ── Action handlers ───────────────────────────────────────────────────────
  const isLocked = record?.isLocked ?? false;

  const bulkSet = (status: AttendanceStatus) => {
    if (isLocked) return;
    setRecord(r => r ? ({ ...r, rows: r.rows.map(row => ({ ...row, status })) }) : r);
    setSaved(false);
  };

  const clearAll = () => {
    if (isLocked) return;
    setRecord(r => r ? ({ ...r, rows: r.rows.map(row => ({ ...row, status: 'PRESENT' as AttendanceStatus })) }) : r);
    setSaved(false);
  };

  const setRowStatus = (staffId: string, status: AttendanceStatus) => {
    if (isLocked) return;
    setRecord(r => r ? ({
      ...r,
      rows: r.rows.map(row => row.staffId === staffId ? { ...row, status } : row),
    }) : r);
    setActiveStatus(null);
    setSaved(false);
  };

  const handleSave = () => {
    if (isLocked || !record) return;
    saveRecord(record);
    setSaved(true);
  };

  const ROW_STATUSES: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE', 'LATE'];

  // ── Loading state (after all hooks) ──────────────────────────────────────
  if (!record) {
    return (
      <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-3 shadow-sm sticky top-0 z-20 flex items-center gap-3">
          <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full">
            <ArrowLeft size={20} className="text-slate-600" />
          </button>
          <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Staff Attendance</h2>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">

      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-0 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3 pb-3">
          <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Staff Attendance</h2>
            <p className="text-[10px] font-bold text-slate-400">Mark & Save attendance</p>
          </div>
        </div>

        {/* ── Date strip ── */}
        <div ref={stripRef} className="flex border-t border-slate-100 overflow-x-auto hide-scrollbar -mx-4 px-4 pt-1.5 pb-1">
          {dateStrip.map(d => {
            const isSelected = selectedDate === d;
            const today_flag = isToday(d);
            return (
              <button key={d}
                data-today={today_flag ? 'true' : 'false'}
                onClick={() => { loadDate(d); setSearch(''); }}
                className={`shrink-0 flex flex-col items-center mx-0.5 px-2.5 py-1.5 rounded-xl border-2 transition-colors ${
                  isSelected
                    ? today_flag ? 'bg-blue-600 border-blue-600 text-white' : 'bg-slate-800 border-slate-800 text-white'
                    : today_flag ? 'border-blue-200 text-blue-600 bg-blue-50' : 'border-transparent text-slate-400'
                }`}>
                <span className="text-[9px] font-black uppercase tracking-widest">{dayShort(d)}</span>
                <span className="text-base font-black tabular-nums leading-none my-0.5">{dayNum(d)}</span>
                <span className="text-[8px] font-bold uppercase tracking-wide opacity-75">{monthShort(d)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Status bar ── */}
      <div className="bg-white border-b border-slate-100 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="font-black text-slate-900 text-sm">
              {new Date(selectedDate).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>
            <div className="text-[10px] font-bold text-slate-400 mt-0.5">
              {isLocked ? 'Salary generated — record locked' : 'Edit and save'}
            </div>
          </div>
          {isLocked && (
            <div className="flex items-center gap-1 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
              <Lock size={11} className="text-amber-500" />
              <span className="text-[9px] font-black text-amber-700">LOCKED</span>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center bg-emerald-50 rounded-xl py-2">
            <div className="text-base font-black text-emerald-600 tabular-nums">{counts.PRESENT}</div>
            <div className="text-[8px] font-black text-emerald-500 uppercase tracking-wide">Present</div>
          </div>
          <div className="text-center bg-rose-50 rounded-xl py-2">
            <div className="text-base font-black text-rose-500 tabular-nums">{counts.ABSENT}</div>
            <div className="text-[8px] font-black text-rose-400 uppercase tracking-wide">Absent</div>
          </div>
          <div className="text-center bg-slate-100 rounded-xl py-2">
            <div className="text-base font-black text-slate-600 tabular-nums">{record.rows.length}</div>
            <div className="text-[8px] font-black text-slate-500 uppercase tracking-wide">Total</div>
          </div>
        </div>
      </div>

      {/* ── Quick actions ── */}
      {!isLocked && (
        <div className="bg-white border-b border-slate-100 px-4 py-3 space-y-3">
          <div className="flex gap-2">
            <button onClick={() => bulkSet('PRESENT')}
              className="flex-1 py-2 bg-emerald-500 text-white text-[11px] font-black rounded-xl active:scale-95 transition-transform">
              All Present
            </button>
            <button onClick={() => bulkSet('HOLIDAY')}
              className="flex-1 py-2 bg-sky-500 text-white text-[11px] font-black rounded-xl active:scale-95 transition-transform">
              Holiday
            </button>
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search staff…"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 font-bold text-sm outline-none focus:border-indigo-500"/>
          </div>
        </div>
      )}

      {/* ── Staff list ── */}
      <div className="flex-1 overflow-y-auto pb-32">
        {record.rows.length > 0 && (
          <div className="p-4">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              {filtered.map((row, idx) => {
                const cfg = STATUS_CONFIG[row.status];
                return (
                  <div key={row.staffId}
                    className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                      idx < filtered.length - 1 ? 'border-b border-slate-100' : ''
                    } ${row.status === 'PRESENT' ? 'bg-emerald-50/40' : row.status === 'ABSENT' ? 'bg-rose-50/40' : 'bg-slate-50/40'}`}>
                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${cfg.dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-slate-900 text-sm">{row.name}</div>
                      <div className="text-[10px] font-bold text-slate-400 mt-0.5">{ROLE_LABEL[row.role] ?? row.role}</div>
                    </div>
                    {isLocked ? (
                      <span className={`text-[10px] font-black px-2.5 py-1 rounded-lg ${cfg.color} border`}>{cfg.label}</span>
                    ) : (
                      <div className="relative shrink-0">
                        <button
                          onClick={() => setActiveStatus(prev => prev === row.staffId ? null : row.staffId)}
                          className={`flex items-center gap-1.5 text-[10px] font-black px-3 py-1.5 rounded-full border active:scale-95 transition-transform ${cfg.color}`}>
                          {cfg.label}
                          <span className="text-[8px] opacity-60">▾</span>
                        </button>

                        {activeStatus === row.staffId && (
                          <div className="absolute right-0 top-full mt-1 bg-white rounded-2xl border border-slate-200 shadow-lg z-30 overflow-hidden min-w-[130px]">
                            {ROW_STATUSES.map(s => (
                              <button key={s} onClick={() => setRowStatus(row.staffId, s)}
                                className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-[11px] font-black text-left hover:bg-slate-50 transition-colors ${
                                  row.status === s ? 'bg-slate-50' : ''
                                }`}>
                                <div className={`w-2 h-2 rounded-full ${STATUS_CONFIG[s].dot}`} />
                                {STATUS_CONFIG[s].label}
                                {row.status === s && <CheckCircle2 size={11} className="ml-auto text-emerald-500" />}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {record.savedAt && (
          <p className="text-center text-[9px] font-bold text-slate-400 mt-4">
            Last saved: {new Date(record.savedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>

      {/* ── Floating Save button ── */}
      {!isLocked && (
        <div className="fixed bottom-16 left-0 right-0 p-4 bg-white border-t border-slate-100 z-30">
          <button onClick={handleSave}
            className={`w-full py-4 font-black text-base rounded-2xl flex items-center justify-center gap-2 transition-all ${
              saved
                ? 'bg-emerald-500 text-white'
                : 'bg-slate-900 text-white active:scale-95'
            }`}>
            {saved ? (
              <><CheckCircle2 size={20} /> Attendance Saved!</>
            ) : (
              <><Save size={20} /> Save Attendance</>
            )}
          </button>
        </div>
      )}

      {isLocked && (
        <div className="fixed bottom-16 left-0 right-0 p-4 bg-white border-t border-slate-100 z-30">
          <div className="w-full py-3 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-center gap-2">
            <Lock size={16} className="text-amber-500" />
            <span className="font-black text-amber-700 text-sm">Salary generated — record locked</span>
          </div>
        </div>
      )}

      {/* Backdrop for dropdown close */}
      {activeStatus && (
        <div className="absolute inset-0 z-20" onClick={() => setActiveStatus(null)} />
      )}
    </div>
  );
};
