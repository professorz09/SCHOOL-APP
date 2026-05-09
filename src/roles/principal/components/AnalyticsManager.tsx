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
  Wallet, AlertCircle, Receipt, Briefcase, Bus, Banknote,
} from 'lucide-react';
import JSZip from 'jszip';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import { useAcademicYear } from '@/shared/context/AcademicYearContext';
import { principalService, type FinancialAnalyticsSummary } from '@/roles/principal/principal.service';

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
  // detail aggregation (which still loads payments / expenses / staff
  // for the chart + class breakdown). One server-side aggregate via
  // get_financial_analytics RPC; refetched only when the academic
  // year changes, not on date-range tweaks.
  const [finSummary, setFinSummary] = useState<FinancialAnalyticsSummary | null>(null);
  const [finLoading, setFinLoading] = useState(true);
  useEffect(() => {
    if (!currentYear?.id) { setFinSummary(null); setFinLoading(false); return; }
    let cancelled = false;
    setFinLoading(true);
    principalService.getFinancialAnalytics(currentYear.id)
      .then(s => { if (!cancelled) setFinSummary(s); })
      .catch(err => { if (!cancelled) console.warn('[analytics] financial summary failed', err); })
      .finally(() => { if (!cancelled) setFinLoading(false); });
    return () => { cancelled = true; };
  }, [currentYear?.id]);

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
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
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

  // ── Quick reports — three one-tap CSVs the office uses regularly ──
  // Each one queries Supabase directly with an indexed filter so we don't
  // ship the whole roster to the client. RLS already enforces school
  // isolation; we add an explicit school_id eq for clarity. The current
  // academic year scopes student_academic_records joins.
  const [reportBusy, setReportBusy] = useState<null | 'RTE' | 'DUES' | 'ATT'>(null);

  const triggerCsvDownload = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  const downloadRteCsv = async () => {
    if (!session?.schoolId || !currentYear?.id) {
      showToast('Pick an academic year first', 'error'); return;
    }
    setReportBusy('RTE');
    try {
      // Pull RTE students + their academic record for the active year. The
      // RTE flag lives on `students`, fee + attendance on the per-year
      // `student_academic_records` row.
      const { data: rows, error } = await supabase
        .from('students')
        .select(`
          id, name, admission_no, roll_no, dob, gender, phone,
          father_name, father_phone, address,
          student_academic_records!inner(class_name, section, total_fee, paid_fee, attendance_percent)
        `)
        .eq('school_id', session.schoolId)
        .eq('rte', true)
        .eq('is_active', true)
        .eq('student_academic_records.academic_year_id', currentYear.id)
        .order('name', { ascending: true });
      if (error) throw new Error(error.message);
      type Row = {
        id: string; name: string; admission_no: string; roll_no: string | null;
        dob: string | null; gender: string | null; phone: string | null;
        father_name: string | null; father_phone: string | null; address: string | null;
        student_academic_records: { class_name: string | null; section: string | null;
          total_fee: number | null; paid_fee: number | null; attendance_percent: number | null }
          | Array<{ class_name: string | null; section: string | null;
              total_fee: number | null; paid_fee: number | null; attendance_percent: number | null }>;
      };
      const flat = ((rows ?? []) as unknown as Row[]).map(r => {
        const ar = Array.isArray(r.student_academic_records)
          ? r.student_academic_records[0]
          : r.student_academic_records;
        const total = Number(ar?.total_fee ?? 0);
        const paid  = Number(ar?.paid_fee ?? 0);
        return {
          name: r.name,
          admission_no: r.admission_no,
          roll_no: r.roll_no ?? '',
          class: `${ar?.class_name ?? ''}-${ar?.section ?? ''}`,
          dob: r.dob ?? '',
          gender: r.gender ?? '',
          phone: r.phone ?? '',
          father_name: r.father_name ?? '',
          father_phone: r.father_phone ?? '',
          address: r.address ?? '',
          total_fee: total,
          paid_fee: paid,
          pending_fee: Math.max(0, total - paid),
          attendance_percent: Number(ar?.attendance_percent ?? 0),
        };
      });
      const headers = ['name','admission_no','roll_no','class','dob','gender','phone',
        'father_name','father_phone','address','total_fee','paid_fee','pending_fee','attendance_percent'];
      triggerCsvDownload(
        `rte-students_${currentYear.name}_${new Date().toISOString().slice(0, 10)}.csv`,
        toCsv(flat, headers),
      );
      showToast(`${flat.length} RTE student${flat.length === 1 ? '' : 's'} exported`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Export failed', 'error');
    } finally { setReportBusy(null); }
  };

  const downloadDuesCsv = async () => {
    if (!session?.schoolId || !currentYear?.id) {
      showToast('Pick an academic year first', 'error'); return;
    }
    setReportBusy('DUES');
    try {
      // student_academic_records is the canonical fee aggregate per
      // (student, year). Filter where paid_fee < total_fee — only active
      // students, current year. Phone/address come via the joined students row.
      const { data: rows, error } = await supabase
        .from('student_academic_records')
        .select(`
          student_id, class_name, section, total_fee, paid_fee, attendance_percent,
          students!inner(name, admission_no, phone, father_name, father_phone, address, is_active)
        `)
        .eq('academic_year_id', currentYear.id)
        .order('class_name', { ascending: true });
      if (error) throw new Error(error.message);
      type Row = {
        student_id: string; class_name: string | null; section: string | null;
        total_fee: number | null; paid_fee: number | null; attendance_percent: number | null;
        students: { name: string; admission_no: string; phone: string | null;
          father_name: string | null; father_phone: string | null; address: string | null;
          is_active: boolean } | null;
      };
      const flat = ((rows ?? []) as unknown as Row[])
        .filter(r => r.students?.is_active !== false)
        .map(r => {
          const total = Number(r.total_fee ?? 0);
          const paid  = Number(r.paid_fee ?? 0);
          return {
            name: r.students?.name ?? '',
            admission_no: r.students?.admission_no ?? '',
            class: `${r.class_name ?? ''}-${r.section ?? ''}`,
            father_name: r.students?.father_name ?? '',
            father_phone: r.students?.father_phone ?? '',
            phone: r.students?.phone ?? '',
            address: r.students?.address ?? '',
            total_fee: total,
            paid_fee: paid,
            pending_fee: Math.max(0, total - paid),
            attendance_percent: Number(r.attendance_percent ?? 0),
          };
        })
        .filter(r => r.pending_fee > 0)
        .sort((a, b) => b.pending_fee - a.pending_fee);
      const headers = ['name','admission_no','class','father_name','father_phone','phone',
        'address','total_fee','paid_fee','pending_fee','attendance_percent'];
      triggerCsvDownload(
        `fee-dues_${currentYear.name}_${new Date().toISOString().slice(0, 10)}.csv`,
        toCsv(flat, headers),
      );
      showToast(`${flat.length} student${flat.length === 1 ? '' : 's'} with pending fees`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Export failed', 'error');
    } finally { setReportBusy(null); }
  };

  const downloadLowAttendanceCsv = async () => {
    if (!session?.schoolId || !currentYear?.id) {
      showToast('Pick an academic year first', 'error'); return;
    }
    setReportBusy('ATT');
    try {
      const { data: rows, error } = await supabase
        .from('student_academic_records')
        .select(`
          student_id, class_name, section, total_fee, paid_fee, attendance_percent,
          students!inner(name, admission_no, phone, father_name, father_phone, is_active)
        `)
        .eq('academic_year_id', currentYear.id)
        .lt('attendance_percent', 75)
        .order('attendance_percent', { ascending: true });
      if (error) throw new Error(error.message);
      type Row = {
        student_id: string; class_name: string | null; section: string | null;
        total_fee: number | null; paid_fee: number | null; attendance_percent: number | null;
        students: { name: string; admission_no: string; phone: string | null;
          father_name: string | null; father_phone: string | null; is_active: boolean } | null;
      };
      const flat = ((rows ?? []) as unknown as Row[])
        .filter(r => r.students?.is_active !== false)
        .map(r => ({
          name: r.students?.name ?? '',
          admission_no: r.students?.admission_no ?? '',
          class: `${r.class_name ?? ''}-${r.section ?? ''}`,
          father_name: r.students?.father_name ?? '',
          father_phone: r.students?.father_phone ?? '',
          phone: r.students?.phone ?? '',
          attendance_percent: Number(r.attendance_percent ?? 0),
          pending_fee: Math.max(0, Number(r.total_fee ?? 0) - Number(r.paid_fee ?? 0)),
        }));
      const headers = ['name','admission_no','class','father_name','father_phone','phone',
        'attendance_percent','pending_fee'];
      triggerCsvDownload(
        `low-attendance_${currentYear.name}_${new Date().toISOString().slice(0, 10)}.csv`,
        toCsv(flat, headers),
      );
      showToast(`${flat.length} student${flat.length === 1 ? '' : 's'} below 75%`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Export failed', 'error');
    } finally { setReportBusy(null); }
  };

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

        {/* Range picker + presets */}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1 block">From</label>
            <input type="date" value={from} onChange={e => { setUserTouchedRange(true); setFrom(e.target.value); }}
              className="border border-slate-200 bg-slate-50 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-400"/>
          </div>
          <div>
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1 block">To</label>
            <input type="date" value={to} onChange={e => { setUserTouchedRange(true); setTo(e.target.value); }}
              className="border border-slate-200 bg-slate-50 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-400"/>
          </div>
          <div className="flex gap-1.5">
            {([
              { id: 'TODAY', label: 'Today' },
              { id: 'M1',    label: 'This month' },
              { id: 'M3',    label: '3 months' },
              { id: 'YEAR',  label: 'Year' },
            ] as const).map(p => (
              <button key={p.id} onClick={() => setPreset(p.id)}
                className="px-3 py-2 text-[10px] font-black uppercase tracking-wide border border-slate-200 bg-slate-50 text-slate-600 rounded-xl hover:border-blue-300 hover:text-blue-700 transition-colors">
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-5 lg:space-y-7 lg:max-w-6xl lg:mx-auto lg:w-full">
        {/* ── Financial summary cards — top of dashboard. School- and
            year-scoped via the get_financial_analytics RPC; loads
            independently of the heavier KPI/chart fetch below so the
            cards paint first. ─────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base lg:text-lg font-black text-slate-900">Financial Summary</h3>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {currentYear?.name ?? 'No year selected'}
            </span>
          </div>
          {finLoading ? (
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5 lg:gap-3">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 lg:p-4 animate-pulse">
                  <div className="h-3 w-16 bg-slate-200 rounded mb-2" />
                  <div className="h-5 w-20 bg-slate-200 rounded" />
                </div>
              ))}
            </div>
          ) : finSummary ? (
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5 lg:gap-3">
              <FinTile icon={<Wallet size={14} />}      tone="emerald" label="Collected · Month" value={fmtINR(finSummary.feesCollectedMonth)} />
              <FinTile icon={<Wallet size={14} />}      tone="emerald" label="Collected · Year"  value={fmtINR(finSummary.feesCollectedYear)}  />
              <FinTile icon={<AlertCircle size={14} />} tone="rose"    label="Fees Pending"      value={fmtINR(finSummary.feesPending)}        />
              <FinTile icon={<Receipt size={14} />}     tone="indigo"  label="Discounts Given"   value={fmtINR(finSummary.discountsGiven)}     />
              <FinTile icon={<TrendingDown size={14}/>} tone="amber"   label="Expenses · Month"  value={fmtINR(finSummary.expensesMonth)}      />
              <FinTile icon={<TrendingDown size={14}/>} tone="amber"   label="Expenses · Year"   value={fmtINR(finSummary.expensesYear)}       />
              <FinTile icon={<Briefcase size={14}/>}    tone="violet"  label="Salary · Month"    value={fmtINR(finSummary.salaryPaidMonth)}    />
              <FinTile icon={<Briefcase size={14}/>}    tone="rose"    label="Salary Pending"    value={fmtINR(finSummary.salaryPending)}      />
              <FinTile icon={<Bus size={14}/>}          tone="orange"  label="Transport · Year"  value={fmtINR(finSummary.transportCollectionYear)} />
              <FinTile
                icon={<Banknote size={14}/>}
                tone={finSummary.netBalanceYear >= 0 ? 'blue' : 'rose'}
                label="Net Balance"
                value={fmtINR(finSummary.netBalanceYear)}
                emphasised
              />
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-[12px] font-bold text-amber-700">
              Pick an academic year to load the financial summary.
            </div>
          )}
        </section>

        {/* ── Quick Reports — one-tap CSV exports the office uses regularly.
             Each report queries Supabase with an indexed filter so we don't
             ship the whole roster client-side. ─────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base lg:text-lg font-black text-slate-900">Quick Reports</h3>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              CSV downloads
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <button onClick={downloadRteCsv} disabled={!currentYear || reportBusy !== null}
              className="bg-white border border-slate-100 hover:border-emerald-300 rounded-2xl p-4 text-left shadow-sm active:scale-[0.99] transition-all disabled:opacity-50">
              <div className="flex items-center justify-between mb-2">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <Users size={18} />
                </div>
                {reportBusy === 'RTE'
                  ? <Loader size={14} className="animate-spin text-slate-400" />
                  : <Download size={14} className="text-slate-400" />}
              </div>
              <p className="font-black text-slate-900 text-sm">RTE Students</p>
              <p className="text-[11px] font-bold text-slate-500 mt-0.5">
                Roll, parents, fees, attendance — full details
              </p>
            </button>

            <button onClick={downloadDuesCsv} disabled={!currentYear || reportBusy !== null}
              className="bg-white border border-slate-100 hover:border-rose-300 rounded-2xl p-4 text-left shadow-sm active:scale-[0.99] transition-all disabled:opacity-50">
              <div className="flex items-center justify-between mb-2">
                <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                  <AlertCircle size={18} />
                </div>
                {reportBusy === 'DUES'
                  ? <Loader size={14} className="animate-spin text-slate-400" />
                  : <Download size={14} className="text-slate-400" />}
              </div>
              <p className="font-black text-slate-900 text-sm">Fee Dues</p>
              <p className="text-[11px] font-bold text-slate-500 mt-0.5">
                Defaulters with pending amount + parent contact
              </p>
            </button>

            <button onClick={downloadLowAttendanceCsv} disabled={!currentYear || reportBusy !== null}
              className="bg-white border border-slate-100 hover:border-amber-300 rounded-2xl p-4 text-left shadow-sm active:scale-[0.99] transition-all disabled:opacity-50">
              <div className="flex items-center justify-between mb-2">
                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <ChartBar size={18} />
                </div>
                {reportBusy === 'ATT'
                  ? <Loader size={14} className="animate-spin text-slate-400" />
                  : <Download size={14} className="text-slate-400" />}
              </div>
              <p className="font-black text-slate-900 text-sm">Below 75% Attendance</p>
              <p className="text-[11px] font-bold text-slate-500 mt-0.5">
                Students at risk of detainment
              </p>
            </button>
          </div>
        </section>

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
      </div>
    </div>
  );
};

// Compact financial tile — denser than KpiTile because there are 10
// of them stacked at the top of the analytics dashboard. Tone colour
// only on the small leading icon so the value reads cleanly in black.
const FinTile: React.FC<{
  icon: React.ReactNode; label: string; value: string;
  tone: 'emerald' | 'rose' | 'blue' | 'amber' | 'violet' | 'indigo' | 'orange';
  emphasised?: boolean;
}> = ({ icon, label, value, tone, emphasised }) => {
  const TONE: Record<string, { chip: string; valueText: string }> = {
    emerald: { chip: 'bg-emerald-100 text-emerald-700', valueText: 'text-emerald-700' },
    rose:    { chip: 'bg-rose-100 text-rose-700',       valueText: 'text-rose-700' },
    blue:    { chip: 'bg-blue-100 text-blue-700',       valueText: 'text-blue-700' },
    amber:   { chip: 'bg-amber-100 text-amber-700',     valueText: 'text-amber-700' },
    violet:  { chip: 'bg-violet-100 text-violet-700',   valueText: 'text-violet-700' },
    indigo:  { chip: 'bg-indigo-100 text-indigo-700',   valueText: 'text-indigo-700' },
    orange:  { chip: 'bg-orange-100 text-orange-700',   valueText: 'text-orange-700' },
  };
  const t = TONE[tone];
  return (
    <div className={`bg-white rounded-2xl border shadow-sm p-3 lg:p-4 ${emphasised ? 'border-blue-300 ring-1 ring-blue-100' : 'border-slate-100'}`}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <div className={`w-5 h-5 rounded-md ${t.chip} flex items-center justify-center shrink-0`}>{icon}</div>
        <span className="text-[9px] lg:text-[10px] font-black uppercase tracking-wider text-slate-500 truncate">{label}</span>
      </div>
      <div className={`text-base lg:text-xl font-black tabular-nums leading-none ${emphasised ? t.valueText : 'text-slate-900'}`}>
        {value}
      </div>
    </div>
  );
};

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
