import React, { useState, useMemo, useEffect } from 'react';
import {
  ArrowLeft, ChevronLeft, ChevronRight, CheckCircle2,
  UserX, Clock3, CalendarX, Sun, RotateCcw, Lock, Save,
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
  const [allStaff, setAllStaff] = useState<StaffMember[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(today());
  const [record, setRecord] = useState<DayRecord | null>(null);
  const [saved, setSaved] = useState(false);
  const [activeStatus, setActiveStatus] = useState<string | null>(null);

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

  // ── Summary counts — must be before any conditional return ────────────────
  const counts = useMemo(() => {
    const c: Record<AttendanceStatus, number> = { PRESENT: 0, ABSENT: 0, HALF_DAY: 0, LEAVE: 0, LATE: 0, HOLIDAY: 0 };
    if (!record) return c;
    for (const row of record.rows) c[row.status]++;
    return c;
  }, [record]);

  if (!record) {
    return (
      <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        <div className="bg-white border-b border-slate-100 px-4 pt-12 pb-3 shadow-sm sticky top-0 z-20 flex items-center gap-3">
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

  const isLocked = record.isLocked;

  // ── Bulk actions ──────────────────────────────────────────────────────────
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

  // ── Per-row status change ─────────────────────────────────────────────────
  const setRowStatus = (staffId: string, status: AttendanceStatus) => {
    if (isLocked) return;
    setRecord(r => r ? ({
      ...r,
      rows: r.rows.map(row => row.staffId === staffId ? { ...row, status } : row),
    }) : r);
    setActiveStatus(null);
    setSaved(false);
  };

  // ── Save ─────────────────────────────────────────────────────────────────
  const handleSave = () => {
    if (isLocked || !record) return;
    saveRecord(record);
    setSaved(true);
  };


  const ROW_STATUSES: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE', 'LATE'];

  return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">

      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-100 px-4 pt-12 pb-3 shadow-sm sticky top-0 z-20">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full">
            <ArrowLeft size={20} className="text-slate-600" />
          </button>
          <div className="flex-1">
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Staff Attendance</h2>
            <p className="text-[10px] font-bold text-slate-400">Principal · Mark &amp; Save</p>
          </div>
          {isLocked && (
            <div className="flex items-center gap-1 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
              <Lock size={11} className="text-amber-500" />
              <span className="text-[9px] font-black text-amber-700">LOCKED</span>
            </div>
          )}
        </div>

        {/* ── Date nav ── */}
        <div className="flex items-center gap-2">
          <button onClick={() => loadDate(addDays(selectedDate, -1))}
            className="w-9 h-9 bg-slate-100 rounded-full flex items-center justify-center active:scale-90 transition-transform">
            <ChevronLeft size={18} className="text-slate-600" />
          </button>

          <div className="flex-1 text-center">
            <div className="font-extrabold text-slate-900 text-sm">{fmt(selectedDate)}</div>
            <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">
              {monthLabel(selectedDate)}
            </div>
          </div>

          <button onClick={() => loadDate(addDays(selectedDate, 1))}
            disabled={selectedDate >= today()}
            className="w-9 h-9 bg-slate-100 rounded-full flex items-center justify-center active:scale-90 transition-transform disabled:opacity-30">
            <ChevronRight size={18} className="text-slate-600" />
          </button>

          {selectedDate !== today() && (
            <button onClick={() => loadDate(today())}
              className="text-[9px] font-black text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full">
              Today
            </button>
          )}
        </div>
      </div>

      {/* ── Quick actions ── */}
      {!isLocked && (
        <div className="bg-white border-b border-slate-100 px-4 py-3">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Quick Actions</p>
          <div className="flex gap-2 overflow-x-auto hide-scrollbar">
            <button onClick={() => bulkSet('PRESENT')}
              className="shrink-0 flex items-center gap-1.5 bg-emerald-600 text-white text-[10px] font-black px-3 py-2 rounded-full active:scale-95 transition-transform">
              <CheckCircle2 size={13} /> All Present
            </button>
            <button onClick={() => bulkSet('HOLIDAY')}
              className="shrink-0 flex items-center gap-1.5 bg-sky-500 text-white text-[10px] font-black px-3 py-2 rounded-full active:scale-95 transition-transform">
              <Sun size={13} /> Holiday
            </button>
            <button onClick={clearAll}
              className="shrink-0 flex items-center gap-1.5 bg-slate-200 text-slate-700 text-[10px] font-black px-3 py-2 rounded-full active:scale-95 transition-transform">
              <RotateCcw size={13} /> Reset
            </button>
          </div>
        </div>
      )}

      {/* ── Summary bar ── */}
      <div className="bg-white border-b border-slate-100 px-4 py-2.5">
        <div className="flex gap-3 overflow-x-auto hide-scrollbar">
          {(Object.entries(counts) as [AttendanceStatus, number][])
            .filter(([, n]) => n > 0)
            .map(([status, n]) => (
              <div key={status} className="flex items-center gap-1.5 shrink-0">
                <div className={`w-2 h-2 rounded-full ${STATUS_CONFIG[status].dot}`} />
                <span className="text-[10px] font-black text-slate-600">{n} {STATUS_CONFIG[status].label}</span>
              </div>
            ))}
        </div>
      </div>

      {/* ── Attendance table ── */}
      <div className="flex-1 overflow-y-auto pb-28">
        {/* Table header */}
        <div className="flex items-center gap-3 px-4 py-2 bg-slate-100 border-b border-slate-200">
          <div className="flex-1 text-[9px] font-black uppercase tracking-widest text-slate-400">Staff</div>
          <div className="w-28 text-[9px] font-black uppercase tracking-widest text-slate-400 text-right">Status</div>
        </div>

        <div className="divide-y divide-slate-100">
          {record.rows.map(row => {
            const cfg = STATUS_CONFIG[row.status];
            return (
              <div key={row.staffId} className="flex items-center gap-3 px-4 py-3 bg-white">
                {/* Status dot */}
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${cfg.dot}`} />

                {/* Name + role */}
                <div className="flex-1 min-w-0">
                  <div className="font-extrabold text-slate-900 text-sm truncate">{row.name}</div>
                  <div className="text-[10px] font-bold text-slate-400">{ROLE_LABEL[row.role] ?? row.role}</div>
                </div>

                {/* Salary impact hint */}
                <div className="hidden text-[9px] font-bold text-slate-300 w-20 text-center leading-tight shrink-0">
                  {SALARY_IMPACT[row.status]}
                </div>

                {/* Status badge / selector */}
                {isLocked ? (
                  <div className={`text-[10px] font-black px-3 py-1.5 rounded-full border ${cfg.color}`}>
                    {cfg.label}
                  </div>
                ) : (
                  <div className="relative shrink-0">
                    <button
                      onClick={() => setActiveStatus(prev => prev === row.staffId ? null : row.staffId)}
                      className={`flex items-center gap-1.5 text-[10px] font-black px-3 py-1.5 rounded-full border active:scale-95 transition-transform ${cfg.color}`}>
                      {cfg.label}
                      <span className="text-[8px] opacity-60">▾</span>
                    </button>

                    {/* Dropdown */}
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

        {/* Salary impact legend */}
        <div className="mx-4 mt-4 mb-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3">Salary Impact</p>
          <div className="space-y-2">
            {(Object.entries(SALARY_IMPACT) as [AttendanceStatus, string][]).map(([status, impact]) => (
              <div key={status} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${STATUS_CONFIG[status].dot}`} />
                  <span className="text-[10px] font-bold text-slate-600">{STATUS_CONFIG[status].label}</span>
                </div>
                <span className="text-[10px] font-black text-slate-400">{impact}</span>
              </div>
            ))}
          </div>
        </div>

        {record.savedAt && (
          <p className="text-center text-[9px] font-bold text-slate-400 pb-4">
            Last saved: {new Date(record.savedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>

      {/* ── Floating Save button ── */}
      {!isLocked && (
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-100">
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
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-100">
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
