// Principal · Analytics & Export
//
// Live in-app dashboard: KPI tiles + month/year breakdowns + class-wise stats.
// Plus a one-click "Export CSV (.zip)" that bundles students / staff / fees /
// expenses / attendance / salary / audit into a single zip the principal can
// hand off to an accountant or keep as a backup.

import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Download, IndianRupee, TrendingDown, TrendingUp, Users,
  GraduationCap, Calendar, Loader, ChartBar,
} from 'lucide-react';
import { ReportsSection } from '@/roles/principal/components/ReportsSection';
import JSZip from 'jszip';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import { useAcademicYear } from '@/shared/context/AcademicYearContext';

interface Props { onBack: () => void; }

interface MonthBucket {
  ym: string;        // e.g. "2025-04"
  label: string;     // "Apr '25"
  income: number;
  expense: number;
}

interface ClassRow {
  className: string;
  section: string;
  studentCount: number;
}

interface StaffSummary {
  total: number;
  byRole: Record<string, number>;
}

interface AttendanceSummary {
  totalRecords: number;
  presentPct: number;
}

interface AnalyticsData {
  rangeFrom: string;
  rangeTo: string;
  income: number;
  expense: number;
  studentCount: number;
  staff: StaffSummary;
  attendance: AttendanceSummary;
  monthly: MonthBucket[];
  classes: ClassRow[];
  rawPayments: Array<{ id: string; date: string; amount: number; method: string; student_id: string | null; receipt_no: string | null }>;
  rawExpenses: Array<{ id: string; date: string; amount: number; category: string; description: string | null }>;
  rawSalaries: Array<{ id: string; staff_id: string | null; month: string; amount: number; paid_at: string | null }>;
  rawAttendance: Array<{ id: string; date: string; class_name: string | null; section: string | null; total_present: number | null; total_absent: number | null }>;
  rawStudents: Array<{ id: string; name: string; admission_no: string; class_name: string | null; section: string | null; status: string }>;
  rawStaff: Array<{ id: string; name: string; role: string; phone: string | null; salary: number; status: string }>;
}

const fmtINR = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

const monthKey = (d: string | Date): string => {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
};

const monthLabel = (ym: string): string => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
};

// CSV helper — quote any field containing comma / quote / newline.
const csvCell = (v: unknown): string => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows: Record<string, unknown>[], headers?: string[]): string => {
  if (rows.length === 0) return (headers ?? []).join(',') + '\n';
  const cols = headers ?? Object.keys(rows[0]);
  const lines = [cols.join(',')];
  for (const r of rows) lines.push(cols.map(c => csvCell(r[c])).join(','));
  return lines.join('\n') + '\n';
};

export const AnalyticsManager: React.FC<Props> = ({ onBack }) => {
  const session = useAuthStore(s => s.session);
  const { showToast } = useUIStore();
  const { currentYear } = useAcademicYear();

  // Default range = current academic year (or last 12 months if no year).
  // currentYear loads asynchronously from context, so the initial mount may
  // see undefined — we fall back to a 12-month window and then sync once
  // currentYear arrives.
  const today = new Date();
  const defaultFrom = currentYear?.startDate ?? new Date(today.getFullYear(), today.getMonth() - 11, 1).toISOString().slice(0, 10);
  const defaultTo   = currentYear?.endDate   ?? today.toISOString().slice(0, 10);

  const [from, setFrom] = useState(defaultFrom);
  const [to,   setTo]   = useState(defaultTo);
  // Track whether the user has manually picked a date so a late-arriving
  // currentYear doesn't blow away their selection.
  const [userTouchedRange, setUserTouchedRange] = useState(false);

  useEffect(() => {
    if (userTouchedRange) return;
    if (currentYear?.startDate && currentYear?.endDate) {
      setFrom(currentYear.startDate);
      setTo(currentYear.endDate);
    }
  }, [currentYear?.startDate, currentYear?.endDate, userTouchedRange]);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Top-of-page financial summary — separate fetch from the heavy
  const load = async () => {
    if (!session?.schoolId) return;
    setLoading(true);
    try {
      const schoolId = session.schoolId;
      // Fire all queries in parallel — they're all read-only and independent.
      const [
        payRes, expRes, salRes, attRes, stuRes, stfRes,
      ] = await Promise.all([
        supabase.from('payment_records')
          .select('id, date, amount, method, student_id, receipt_no')
          .eq('school_id', schoolId).gte('date', from).lte('date', to)
          .order('date'),
        supabase.from('expenses')
          .select('id, date, amount, category, description')
          .eq('school_id', schoolId).gte('date', from).lte('date', to)
          .order('date'),
        supabase.from('salary_payments')
          .select('id, staff_id, month, amount, paid_at')
          .eq('school_id', schoolId).gte('paid_at', from).lte('paid_at', to + 'T23:59:59'),
        supabase.from('attendance_records')
          .select('id, date, class_name, section, total_present, total_absent')
          .eq('school_id', schoolId).gte('date', from).lte('date', to),
        supabase.from('students')
          .select('id, name, admission_no, status, student_academic_records!inner(class_name, section, academic_year_id)')
          .eq('school_id', schoolId).eq('is_active', true),
        supabase.from('staff')
          .select('id, name, role, phone, salary, status')
          .eq('school_id', schoolId).eq('is_active', true),
      ]);

      const errs = [payRes, expRes, salRes, attRes, stuRes, stfRes].filter(r => r.error);
      if (errs.length) throw new Error(errs.map(e => e.error!.message).join(' · '));

      const rawPayments  = (payRes.data ?? []) as AnalyticsData['rawPayments'];
      const rawExpenses  = (expRes.data ?? []) as AnalyticsData['rawExpenses'];
      const rawSalaries  = (salRes.data ?? []) as AnalyticsData['rawSalaries'];
      const rawAttendance = (attRes.data ?? []) as AnalyticsData['rawAttendance'];

      // Flatten the embedded AR for student class/section
      type StudentRow = { id: string; name: string; admission_no: string; status: string;
        student_academic_records: { class_name: string | null; section: string | null; academic_year_id: string }[] };
      const rawStudents: AnalyticsData['rawStudents'] = (stuRes.data as unknown as StudentRow[] ?? []).map(s => {
        // Pick the AR row matching the active year if available, else the first.
        const ar = currentYear?.id
          ? s.student_academic_records.find(r => r.academic_year_id === currentYear.id)
          : s.student_academic_records[0];
        return {
          id: s.id, name: s.name, admission_no: s.admission_no, status: s.status,
          class_name: ar?.class_name ?? null, section: ar?.section ?? null,
        };
      });

      const rawStaff = (stfRes.data ?? []) as AnalyticsData['rawStaff'];

      // ── KPI rollups ────────────────────────────────────────────────────
      const income  = rawPayments.reduce((a, r) => a + Number(r.amount || 0), 0);
      const expense = rawExpenses.reduce((a, r) => a + Number(r.amount || 0), 0)
                    + rawSalaries.reduce((a, r) => a + Number(r.amount || 0), 0);

      // Monthly buckets
      const buckets = new Map<string, MonthBucket>();
      const ensure = (ym: string): MonthBucket => {
        let b = buckets.get(ym);
        if (!b) { b = { ym, label: monthLabel(ym), income: 0, expense: 0 }; buckets.set(ym, b); }
        return b;
      };
      for (const p of rawPayments)  ensure(monthKey(p.date)).income  += Number(p.amount || 0);
      for (const e of rawExpenses)  ensure(monthKey(e.date)).expense += Number(e.amount || 0);
      for (const s of rawSalaries)  if (s.paid_at) ensure(monthKey(s.paid_at)).expense += Number(s.amount || 0);
      const monthly = [...buckets.values()].sort((a, b) => a.ym.localeCompare(b.ym));

      // Attendance %
      const attTotals = rawAttendance.reduce(
        (a, r) => ({ p: a.p + (r.total_present ?? 0), ab: a.ab + (r.total_absent ?? 0) }),
        { p: 0, ab: 0 },
      );
      const attendance: AttendanceSummary = {
        totalRecords: rawAttendance.length,
        presentPct: attTotals.p + attTotals.ab > 0
          ? Math.round((attTotals.p / (attTotals.p + attTotals.ab)) * 100)
          : 0,
      };

      // Class-wise student strength
      const classMap = new Map<string, ClassRow>();
      for (const s of rawStudents) {
        if (!s.class_name) continue;
        const key = `${s.class_name}-${s.section ?? ''}`;
        const row = classMap.get(key) ?? { className: s.class_name, section: s.section ?? '', studentCount: 0 };
        row.studentCount++;
        classMap.set(key, row);
      }
      const classes = [...classMap.values()].sort((a, b) =>
        a.className.localeCompare(b.className) || a.section.localeCompare(b.section));

      // Staff by role
      const byRole: Record<string, number> = {};
      for (const s of rawStaff) byRole[s.role] = (byRole[s.role] ?? 0) + 1;
      const staff: StaffSummary = { total: rawStaff.length, byRole };

      setData({
        rangeFrom: from, rangeTo: to,
        income, expense,
        studentCount: rawStudents.length,
        staff, attendance, monthly, classes,
        rawPayments, rawExpenses, rawSalaries, rawAttendance, rawStudents, rawStaff,
      });
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to load analytics', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [from, to, session?.schoolId]);

  const handleExport = async () => {
    if (!data) return;
    setExporting(true);
    try {
      const zip = new JSZip();
      const folder = `school-export_${data.rangeFrom}_to_${data.rangeTo}`;

      zip.file(`${folder}/summary.json`, JSON.stringify({
        rangeFrom: data.rangeFrom, rangeTo: data.rangeTo,
        income: data.income, expense: data.expense,
        net: data.income - data.expense,
        studentCount: data.studentCount,
        staffTotal: data.staff.total, staffByRole: data.staff.byRole,
        attendancePct: data.attendance.presentPct,
        monthly: data.monthly,
        classes: data.classes,
        generatedAt: new Date().toISOString(),
      }, null, 2));

      zip.file(`${folder}/students.csv`, toCsv(data.rawStudents,
        ['id', 'name', 'admission_no', 'class_name', 'section', 'status']));
      zip.file(`${folder}/staff.csv`, toCsv(data.rawStaff,
        ['id', 'name', 'role', 'phone', 'salary', 'status']));
      zip.file(`${folder}/payments.csv`, toCsv(data.rawPayments,
        ['id', 'date', 'amount', 'method', 'student_id', 'receipt_no']));
      zip.file(`${folder}/expenses.csv`, toCsv(data.rawExpenses,
        ['id', 'date', 'amount', 'category', 'description']));
      zip.file(`${folder}/salaries.csv`, toCsv(data.rawSalaries,
        ['id', 'staff_id', 'month', 'amount', 'paid_at']));
      zip.file(`${folder}/attendance.csv`, toCsv(data.rawAttendance,
        ['id', 'date', 'class_name', 'section', 'total_present', 'total_absent']));

      const blob = await zip.generateAsync({ type: 'blob' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `${folder}.zip`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      // Deferred cleanup — multi-MB zips on Safari / mobile WebKit
      // truncate to 0 bytes if we revoke synchronously after click.
      setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1000);
      showToast('Export downloaded');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Export failed', 'error');
    } finally {
      setExporting(false);
    }
  };

  // Quick range presets
  const setPreset = (preset: 'YEAR' | 'M3' | 'M1' | 'TODAY') => {
    setUserTouchedRange(true);
    const t = new Date();
    if (preset === 'YEAR') {
      setFrom(currentYear?.startDate ?? new Date(t.getFullYear(), 0, 1).toISOString().slice(0, 10));
      setTo(currentYear?.endDate ?? t.toISOString().slice(0, 10));
    } else if (preset === 'M3') {
      setFrom(new Date(t.getFullYear(), t.getMonth() - 2, 1).toISOString().slice(0, 10));
      setTo(t.toISOString().slice(0, 10));
    } else if (preset === 'M1') {
      setFrom(new Date(t.getFullYear(), t.getMonth(), 1).toISOString().slice(0, 10));
      setTo(t.toISOString().slice(0, 10));
    } else if (preset === 'TODAY') {
      const d = t.toISOString().slice(0, 10); setFrom(d); setTo(d);
    }
  };

  // ── Reports & Downloads ────────────────────────────────────────────
  // 30+ on-demand CSVs grouped into 6 categories. Each report:
  //   1. Calls log_export RPC FIRST — this is the rate-limit gate
  //      (50/hour, 100/day per user). On limit hit the RPC raises and
  //      we toast a friendly message; the heavy supabase query never runs.
  //   2. Runs a single, indexed Supabase query (no full-roster downloads).
  //   3. Maps rows → flat CSV objects → toCsv() → browser download.
  //
  // The active academic year + (optional) class filter scope the queries.
  // Date-range reports (daily attendance, monthly collection) honour the
  // From/To pickers in the header.
  const [reportBusy, setReportBusy] = useState<string | null>(null);
  const [classFilter, setClassFilter] = useState<string>(''); // 'class:section' or ''

  const triggerCsvDownload = (filename: string, content: string) => {
    // BOM prefix → Excel opens UTF-8 cleanly (₹, accents, devanagari).
    const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    // Deferred cleanup — synchronous revoke after click() races the
    // file fetch on Safari / mobile WebKit, producing empty files.
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1000);
  };

  // Single source of truth for running a report. Rate-limit + error
  // surfacing live here so each report-definition can stay declarative.
  const runReport = React.useCallback(async (
    reportType: string,
    filters: Record<string, unknown>,
    fetchFlat: () => Promise<{ rows: Record<string, unknown>[]; headers: string[]; filenamePrefix: string }>,
  ) => {
    if (reportBusy) return;
    setReportBusy(reportType);
    try {
      // Gate first — if rate-limited, the RPC raises before we burn a
      // potentially expensive supabase round-trip.
      const { error: logErr } = await supabase.rpc('log_export', {
        p_report_type: reportType,
        p_filters: filters,
      });
      if (logErr) {
        if (logErr.message.includes('rate_limited_hour')) {
          showToast('1 ghante me 50 export se zyada nahi — thodi der baad try karein', 'error');
        } else if (logErr.message.includes('rate_limited_day')) {
          showToast('Aaj 100 export ho chuke — kal try karein', 'error');
        } else {
          // Don't fail the export just because the audit row couldn't
          // be written — log to console so the admin can debug.
          console.warn('[reports] log_export warning:', logErr.message);
        }
        if (logErr.message.includes('rate_limited')) return;
      }

      const { rows, headers, filenamePrefix } = await fetchFlat();
      const stamp = new Date().toISOString().slice(0, 10);
      triggerCsvDownload(`${filenamePrefix}_${stamp}.csv`, toCsv(rows, headers));
      showToast(`${rows.length} row${rows.length === 1 ? '' : 's'} exported`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Export failed', 'error');
    } finally { setReportBusy(null); }
  }, [reportBusy, showToast]);


  const net = data ? data.income - data.expense : 0;
  const monthlyMax = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, ...data.monthly.flatMap(m => [m.income, m.expense]));
  }, [data]);
  const classMax = useMemo(() => Math.max(1, ...(data?.classes.map(c => c.studentCount) ?? [1])), [data]);

  return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 lg:px-6 pt-4 lg:pt-6 pb-4 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600 hover:bg-slate-200 transition-colors">
              <ArrowLeft size={20}/>
            </button>
            <div className="min-w-0">
              <h2 className="text-xl lg:text-2xl font-black text-slate-900 uppercase tracking-tight leading-none">Analytics</h2>
              <p className="text-[10px] lg:text-xs font-bold text-slate-400 mt-0.5">Income · Expenses · Attendance · Class strength · Staff</p>
            </div>
          </div>
          <button onClick={handleExport} disabled={!data || exporting}
            className="flex items-center gap-1.5 px-3 lg:px-4 py-2 lg:py-2.5 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-wide active:scale-95 transition-transform disabled:opacity-50">
            {exporting ? <Loader size={14} className="animate-spin"/> : <Download size={14}/>}
            <span className="hidden sm:inline">Export ZIP</span>
            <span className="sm:hidden">ZIP</span>
          </button>
        </div>

        {/* Range picker + presets — compact on mobile (date pickers
            on one row, presets on the next) so the sticky header
            doesn't eat half the viewport. */}
        <div className="space-y-2 lg:space-y-3">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-[auto_auto_1fr] lg:gap-3 lg:items-end">
            <label className="block">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1 block">From</span>
              <input type="date" value={from} onChange={e => { setUserTouchedRange(true); setFrom(e.target.value); }}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-400"/>
            </label>
            <label className="block">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1 block">To</span>
              <input type="date" value={to} onChange={e => { setUserTouchedRange(true); setTo(e.target.value); }}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-400"/>
            </label>
            <div className="hidden lg:flex gap-1.5 col-span-1">
              {([
                { id: 'TODAY', label: 'Today' },
                { id: 'M1',    label: 'Month' },
                { id: 'M3',    label: '3 mo' },
                { id: 'YEAR',  label: 'Year' },
              ] as const).map(p => (
                <button key={p.id} onClick={() => setPreset(p.id)}
                  className="px-3 py-2 text-[10px] font-black uppercase tracking-wide border border-slate-200 bg-slate-50 text-slate-600 rounded-xl hover:border-blue-300 hover:text-blue-700 transition-colors">
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          {/* Mobile-only preset row — narrower chips so all 4 fit on
              even small viewports without wrapping. */}
          <div className="flex gap-1.5 lg:hidden">
            {([
              { id: 'TODAY', label: 'Today' },
              { id: 'M1',    label: 'Month' },
              { id: 'M3',    label: '3 mo' },
              { id: 'YEAR',  label: 'Year' },
            ] as const).map(p => (
              <button key={p.id} onClick={() => setPreset(p.id)}
                className="flex-1 py-1.5 text-[10px] font-black uppercase tracking-wide border border-slate-200 bg-slate-50 text-slate-600 rounded-lg active:bg-blue-50 active:border-blue-300 active:text-blue-700 transition-colors">
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-5 lg:space-y-7 max-w-3xl lg:max-w-5xl mx-auto w-full">

        {loading ? (
          <div className="flex flex-col items-center py-24 text-slate-400">
            <Loader size={28} className="animate-spin mb-3"/>
            <p className="text-sm font-bold">Crunching numbers…</p>
          </div>
        ) : !data ? null : (
          <>
            {/* KPI tiles */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
              <KpiTile icon={<TrendingUp size={18}/>} label="Income"     value={fmtINR(data.income)}         tone="emerald"/>
              <KpiTile icon={<TrendingDown size={18}/>} label="Expense"  value={fmtINR(data.expense)}        tone="rose"/>
              <KpiTile icon={<IndianRupee size={18}/>} label="Net"       value={fmtINR(net)}                 tone={net >= 0 ? 'blue' : 'amber'}/>
              <KpiTile icon={<ChartBar size={18}/>}    label="Attendance" value={`${data.attendance.presentPct}%`} sub={`${data.attendance.totalRecords} days`} tone="violet"/>
              <KpiTile icon={<Users size={18}/>}        label="Students"  value={String(data.studentCount)}   tone="indigo"/>
              <KpiTile icon={<GraduationCap size={18}/>} label="Staff"     value={String(data.staff.total)}    sub={Object.entries(data.staff.byRole).map(([r,c]) => `${c} ${r.toLowerCase()}`).join(' · ')} tone="amber"/>
              <KpiTile icon={<Calendar size={18}/>}     label="Months"     value={String(data.monthly.length)} sub="with activity" tone="slate"/>
              <KpiTile icon={<Calendar size={18}/>}     label="Classes"    value={String(data.classes.length)} tone="teal"/>
            </div>

            {/* Monthly breakdown chart */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 lg:p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base lg:text-lg font-black text-slate-900">Monthly trend</h3>
                  <p className="text-[10px] lg:text-xs font-bold text-slate-400">Income vs expense (incl. salaries)</p>
                </div>
                <div className="flex items-center gap-3 text-[10px] lg:text-xs font-black">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500"/> Income</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-rose-400"/> Expense</span>
                </div>
              </div>
              {data.monthly.length === 0 ? (
                <p className="text-center py-8 text-slate-400 text-sm font-bold">No data in this range</p>
              ) : (
                <div className="space-y-3">
                  {data.monthly.map(m => (
                    <div key={m.ym} className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-black">
                        <span className="text-slate-700 w-16">{m.label}</span>
                        <span className="text-slate-400 tabular-nums">
                          <span className="text-emerald-600">{fmtINR(m.income)}</span>
                          <span className="opacity-50 mx-2">·</span>
                          <span className="text-rose-500">-{fmtINR(m.expense)}</span>
                        </span>
                      </div>
                      <div className="flex gap-1 h-2.5">
                        <div className="bg-emerald-500 rounded-full" style={{ width: `${(m.income / monthlyMax) * 50}%` }}/>
                        <div className="bg-rose-400 rounded-full" style={{ width: `${(m.expense / monthlyMax) * 50}%` }}/>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Profit / Loss strip — derived from the same monthly
                buckets (no extra fetch). Visualises net per month so
                the principal can spot loss-making months at a glance.
                Centre-aligned baseline; bars grow up (profit) or
                down (loss) from the centre line. ─────────────────── */}
            {data.monthly.length > 0 && (() => {
              const series = data.monthly.map(m => ({
                ym: m.ym,
                label: m.label,
                net: m.income - m.expense,
              }));
              const peak = Math.max(1, ...series.map(s => Math.abs(s.net)));
              const totalNet = series.reduce((sum, s) => sum + s.net, 0);
              const profitMonths = series.filter(s => s.net >= 0).length;
              return (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 lg:p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-base lg:text-lg font-black text-slate-900">Profit / Loss trend</h3>
                      <p className="text-[10px] lg:text-xs font-bold text-slate-400">
                        Net per month · {profitMonths}/{series.length} profitable
                      </p>
                    </div>
                    <span className={`text-sm lg:text-base font-black tabular-nums ${totalNet >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                      {totalNet >= 0 ? '+' : ''}{fmtINR(totalNet)}
                    </span>
                  </div>
                  <div className="grid grid-cols-6 lg:grid-cols-12 gap-2">
                    {series.map(s => {
                      const isProfit = s.net >= 0;
                      const heightPct = Math.round((Math.abs(s.net) / peak) * 90); // cap at 90% of half-cell
                      return (
                        <div key={s.ym} className="flex flex-col items-center gap-1 group">
                          {/* 60px tall split-axis cell — top half for
                              profit (emerald grows up), bottom half for
                              loss (rose grows down). */}
                          <div className="relative w-full h-16 flex flex-col justify-center">
                            <div className="h-px w-full bg-slate-200" />
                            <div className="absolute inset-0 flex flex-col">
                              <div className="h-1/2 flex items-end justify-center">
                                {isProfit && (
                                  <div className="w-3/4 bg-emerald-500 rounded-t-md transition-all"
                                       style={{ height: `${heightPct}%` }} />
                                )}
                              </div>
                              <div className="h-1/2 flex items-start justify-center">
                                {!isProfit && (
                                  <div className="w-3/4 bg-rose-500 rounded-b-md transition-all"
                                       style={{ height: `${heightPct}%` }} />
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="text-[8px] lg:text-[9px] font-black text-slate-400 leading-none">
                            {s.label.split(' ')[0]}
                          </div>
                          <div className={`text-[9px] font-black tabular-nums leading-none ${isProfit ? 'text-emerald-700' : 'text-rose-600'}`}>
                            {isProfit ? '+' : ''}{Math.round(s.net / 1000)}k
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Class-wise + Staff-by-role */}
            <div className="grid lg:grid-cols-2 gap-5 lg:gap-7">
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 lg:p-5">
                <h3 className="text-base lg:text-lg font-black text-slate-900 mb-1">Class strength</h3>
                <p className="text-[10px] lg:text-xs font-bold text-slate-400 mb-4">{data.classes.length} active classes</p>
                {data.classes.length === 0 ? (
                  <p className="text-center py-6 text-slate-400 text-sm font-bold">No classes</p>
                ) : (
                  <div className="space-y-2">
                    {data.classes.map(c => (
                      <div key={`${c.className}-${c.section}`} className="flex items-center gap-3">
                        <span className="w-20 shrink-0 text-[11px] font-black text-slate-700 truncate">{c.className.replace(/^Class\s*/i,'')}-{c.section}</span>
                        <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                          <div className="bg-blue-500 h-full rounded-full" style={{ width: `${(c.studentCount / classMax) * 100}%` }}/>
                        </div>
                        <span className="w-10 text-right text-[11px] font-black text-slate-900 tabular-nums">{c.studentCount}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 lg:p-5">
                <h3 className="text-base lg:text-lg font-black text-slate-900 mb-1">Staff breakdown</h3>
                <p className="text-[10px] lg:text-xs font-bold text-slate-400 mb-4">{data.staff.total} active members</p>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(data.staff.byRole).map(([role, count]) => (
                    <div key={role} className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                      <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{role}</div>
                      <div className="text-2xl font-black text-slate-900 tabular-nums mt-1">{count}</div>
                    </div>
                  ))}
                  {Object.keys(data.staff.byRole).length === 0 && (
                    <p className="col-span-2 text-center py-4 text-slate-400 text-sm font-bold">No staff</p>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Reports & Downloads pinned at the bottom of the dashboard.
            Sits below the KPI tiles + charts so the live numbers paint
            first and the (lighter, on-demand) reports section never
            blocks the visual hierarchy. */}
        <ReportsSection
          runReport={runReport}
          reportBusy={reportBusy}
          schoolId={session?.schoolId ?? ''}
          yearId={currentYear?.id ?? ''}
          yearName={currentYear?.name ?? ''}
          rangeFrom={from}
          rangeTo={to}
          classFilter={classFilter}
          setClassFilter={setClassFilter}
          classOptions={data?.classes ?? []}
        />
      </div>
    </div>
  );
};

// Compact financial tile — denser than KpiTile because there are 10
// of them stacked at the top of the analytics dashboard. Tone colour
// only on the small leading icon so the value reads cleanly in black.
const KpiTile: React.FC<{
  icon: React.ReactNode; label: string; value: string; sub?: string;
  tone: 'emerald' | 'rose' | 'blue' | 'amber' | 'violet' | 'indigo' | 'slate' | 'teal';
}> = ({ icon, label, value, sub, tone }) => {
  const TONE: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-600',
    rose:    'bg-rose-50 text-rose-600',
    blue:    'bg-blue-50 text-blue-600',
    amber:   'bg-amber-50 text-amber-600',
    violet:  'bg-violet-50 text-violet-600',
    indigo:  'bg-indigo-50 text-indigo-600',
    slate:   'bg-slate-100 text-slate-600',
    teal:    'bg-teal-50 text-teal-600',
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3.5 lg:p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</span>
        <div className={`w-7 h-7 lg:w-8 lg:h-8 rounded-lg ${TONE[tone]} flex items-center justify-center`}>{icon}</div>
      </div>
      <div className="text-lg lg:text-2xl font-black text-slate-900 tabular-nums leading-none">{value}</div>
      {sub && <div className="text-[9px] lg:text-[10px] font-bold text-slate-400 mt-1.5 truncate">{sub}</div>}
    </div>
  );
};
