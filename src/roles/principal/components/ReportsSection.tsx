// Reports & Downloads — categorized one-tap CSV exports.
//
// Six sections, ~30 reports total. Every report is fired on demand
// (no preload), gated by the log_export RPC for rate-limit + audit,
// and queries Supabase with indexed filters so we never ship the full
// roster client-side.
//
// All reports respect:
//   • school_id (RLS + explicit eq guards)
//   • active academic year (where applicable)
//   • optional class filter (where applicable — see usesClass)
//   • date range (where applicable — payment / attendance reports)

import React, { useState } from 'react';
import {
  Users, AlertCircle, Calendar, ChartBar, GraduationCap, Briefcase,
  Bus, Download, Loader, ChevronDown, ChevronRight,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

// Match the runReport helper in AnalyticsManager.tsx
type RunReport = (
  reportType: string,
  filters: Record<string, unknown>,
  fetchFlat: () => Promise<{ rows: Record<string, unknown>[]; headers: string[]; filenamePrefix: string }>,
) => Promise<void>;

interface Props {
  runReport: RunReport;
  reportBusy: string | null;
  schoolId: string;
  yearId: string;
  yearName: string;
  rangeFrom: string; // YYYY-MM-DD
  rangeTo: string;   // YYYY-MM-DD
  classFilter: string; // 'class:section' or ''
  setClassFilter: (v: string) => void;
  classOptions: Array<{ className: string; section: string; studentCount: number }>;
}

interface ReportDef {
  id: string;
  label: string;
  desc: string;
  needsYear?: boolean;
  needsRange?: boolean;
  run: () => Promise<{ rows: Record<string, unknown>[]; headers: string[]; filenamePrefix: string }>;
}

interface SectionDef {
  id: string;
  label: string;
  icon: React.ReactNode;
  tone: string;       // hover border color tw class
  reports: ReportDef[];
}

// ── Helpers ──────────────────────────────────────────────────────────────

const fail = (msg: string): never => { throw new Error(msg); };

const splitClass = (cf: string) => {
  if (!cf) return { className: null as string | null, section: null as string | null };
  const [className, section] = cf.split(':');
  return { className: className || null, section: section || null };
};

const flattenAr = (
  s: { id: string; name: string; admission_no: string; phone: string | null; is_rte: boolean | null;
       father_name: string | null; father_phone: string | null; mother_name: string | null;
       mother_phone: string | null; address: string | null; admission_date: string | null;
       student_academic_records?: Array<{
         class_name: string | null; section: string | null;
         total_fee: number | null; paid_fee: number | null;
         attendance_percent: number | null; academic_year_id: string;
       }> },
  yearId: string,
) => {
  const ar = (s.student_academic_records ?? []).find(a => a.academic_year_id === yearId);
  const total = Number(ar?.total_fee ?? 0);
  const paid  = Number(ar?.paid_fee ?? 0);
  return {
    name: s.name,
    admission_no: s.admission_no,
    class: ar ? `${ar.class_name ?? ''}-${ar.section ?? ''}` : '',
    rte: s.is_rte ? 'YES' : 'NO',
    phone: s.phone ?? '',
    father_name: s.father_name ?? '',
    father_phone: s.father_phone ?? '',
    mother_name: s.mother_name ?? '',
    mother_phone: s.mother_phone ?? '',
    address: s.address ?? '',
    admission_date: s.admission_date ?? '',
    total_fee: total,
    paid_fee: paid,
    pending_fee: Math.max(0, total - paid),
    attendance_percent: Number(ar?.attendance_percent ?? 0),
  };
};

const STUDENT_HEADERS = ['name','admission_no','class','rte','phone',
  'father_name','father_phone','mother_name','mother_phone','address',
  'admission_date','total_fee','paid_fee','pending_fee','attendance_percent'];

// ── Component ────────────────────────────────────────────────────────────

export const ReportsSection: React.FC<Props> = ({
  runReport, reportBusy, schoolId, yearId, yearName,
  rangeFrom, rangeTo, classFilter, setClassFilter, classOptions,
}) => {
  // Sections collapsed by default to keep the UI scannable. Most-used
  // sections (Students, Fees) start expanded.
  const [open, setOpen] = useState<Record<string, boolean>>({
    students: true, fees: true, attendance: false,
    exams: false, staff: false, transport: false,
  });
  const toggle = (id: string) => setOpen(o => ({ ...o, [id]: !o[id] }));

  // ── Report definitions per category ──────────────────────────────────

  const sections: SectionDef[] = [
    {
      id: 'students', label: 'Students', tone: 'hover:border-blue-300',
      icon: <Users size={16} className="text-blue-600" />,
      reports: [
        {
          id: 'students_active', label: 'Active Students',
          desc: 'Roster enrolled in the active year (with class allotment)',
          needsYear: true,
          run: async () => {
            if (!schoolId || !yearId) fail('Pick an academic year first');
            // Use !inner + year filter so we exclude active students who
            // haven't been allotted a class for THIS year yet (they
            // belong to last year's roster but haven't been promoted /
            // re-enrolled — surfacing them here was misleading).
            const { data, error } = await supabase.from('students')
              .select('id, name, admission_no, phone, is_rte, father_name, father_phone, mother_name, mother_phone, address, admission_date, student_academic_records!inner(class_name, section, total_fee, paid_fee, attendance_percent, academic_year_id)')
              .eq('school_id', schoolId).eq('is_active', true)
              .eq('student_academic_records.academic_year_id', yearId)
              .not('student_academic_records.class_name', 'is', null)
              .order('name');
            if (error) throw new Error(error.message);
            const rows = ((data ?? []) as any[]).map(s => flattenAr(s, yearId));
            return { rows, headers: STUDENT_HEADERS, filenamePrefix: `active-students_${yearName}` };
          },
        },
        {
          id: 'students_rte', label: 'RTE Students', desc: 'Quota students with full details', needsYear: true,
          run: async () => {
            if (!yearId) fail('Pick an academic year first');
            const { data, error } = await supabase.from('students')
              .select('id, name, admission_no, phone, is_rte, father_name, father_phone, mother_name, mother_phone, address, admission_date, student_academic_records(class_name, section, total_fee, paid_fee, attendance_percent, academic_year_id)')
              .eq('school_id', schoolId).eq('is_rte', true).eq('is_active', true).order('name');
            if (error) throw new Error(error.message);
            const rows = ((data ?? []) as any[]).map(s => flattenAr(s, yearId));
            return { rows, headers: STUDENT_HEADERS, filenamePrefix: `rte-students_${yearName}` };
          },
        },
        {
          id: 'students_new', label: 'New Admissions · 30d', desc: 'Students admitted in the last 30 days',
          run: async () => {
            const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
            const cutoffIso = cutoff.toISOString().slice(0, 10);
            const { data, error } = await supabase.from('students')
              .select('id, name, admission_no, phone, is_rte, father_name, father_phone, mother_name, mother_phone, address, admission_date, student_academic_records(class_name, section, total_fee, paid_fee, attendance_percent, academic_year_id)')
              .eq('school_id', schoolId).gte('admission_date', cutoffIso)
              .order('admission_date', { ascending: false });
            if (error) throw new Error(error.message);
            const rows = ((data ?? []) as any[]).map(s => flattenAr(s, yearId));
            return { rows, headers: STUDENT_HEADERS, filenamePrefix: `new-admissions-30d` };
          },
        },
        {
          id: 'students_tc', label: 'TC Students', desc: 'Students with a TC issued (left school)',
          run: async () => {
            const { data, error } = await supabase.from('students')
              .select('id, name, admission_no, phone, is_rte, father_name, father_phone, mother_name, mother_phone, address, admission_date, tc_number, is_active, status, student_academic_records(class_name, section, total_fee, paid_fee, attendance_percent, academic_year_id)')
              .eq('school_id', schoolId).eq('status', 'TC_ISSUED').order('name');
            if (error) throw new Error(error.message);
            const rows = ((data ?? []) as any[]).map(s => ({
              tc_number: s.tc_number ?? '',
              ...flattenAr(s, yearId),
              status: s.status ?? '',
            }));
            return { rows, headers: ['tc_number', ...STUDENT_HEADERS, 'status'], filenamePrefix: 'tc-students' };
          },
        },
        {
          id: 'students_inactive', label: 'Inactive Students', desc: 'Dropped out / withdrawn / TC issued',
          run: async () => {
            const { data, error } = await supabase.from('students')
              .select('id, name, admission_no, phone, is_rte, father_name, father_phone, mother_name, mother_phone, address, admission_date, student_academic_records(class_name, section, total_fee, paid_fee, attendance_percent, academic_year_id)')
              .eq('school_id', schoolId).eq('is_active', false).order('name');
            if (error) throw new Error(error.message);
            const rows = ((data ?? []) as any[]).map(s => flattenAr(s, yearId));
            return { rows, headers: STUDENT_HEADERS, filenamePrefix: 'inactive-students' };
          },
        },
        {
          id: 'students_classwise', label: 'Class-wise Students',
          desc: classFilter ? `Students of ${classFilter.replace(':', '-')}` : 'Filtered by class above',
          needsYear: true,
          run: async () => {
            if (!yearId) fail('Pick an academic year first');
            if (!classFilter) fail('Choose a class from the filter above');
            const { className, section } = splitClass(classFilter);
            const { data, error } = await supabase.from('students')
              .select('id, name, admission_no, phone, is_rte, father_name, father_phone, mother_name, mother_phone, address, admission_date, student_academic_records!inner(class_name, section, total_fee, paid_fee, attendance_percent, academic_year_id)')
              .eq('school_id', schoolId).eq('is_active', true)
              .eq('student_academic_records.academic_year_id', yearId)
              .eq('student_academic_records.class_name', className!)
              .eq('student_academic_records.section', section!)
              .order('name');
            if (error) throw new Error(error.message);
            const rows = ((data ?? []) as any[]).map(s => flattenAr(s, yearId));
            return { rows, headers: STUDENT_HEADERS, filenamePrefix: `class-${className}-${section}` };
          },
        },
        {
          id: 'students_birthday', label: 'Birthday Students', desc: 'Students whose DOB falls in the current month',
          run: async () => {
            const m = new Date().getMonth() + 1;
            const { data, error } = await supabase.from('students')
              .select('id, name, admission_no, phone, dob, is_rte, father_name, father_phone, mother_name, mother_phone, address, admission_date, student_academic_records(class_name, section, total_fee, paid_fee, attendance_percent, academic_year_id)')
              .eq('school_id', schoolId).eq('is_active', true).not('dob', 'is', null);
            if (error) throw new Error(error.message);
            // Filter month client-side because Supabase doesn't expose
            // EXTRACT() through the JS client; the result set is bounded
            // by the active roster anyway.
            const inMonth = ((data ?? []) as any[]).filter(s => s.dob && new Date(s.dob).getMonth() + 1 === m);
            const rows = inMonth.map(s => ({ dob: s.dob, ...flattenAr(s, yearId) }));
            return { rows, headers: ['dob', ...STUDENT_HEADERS], filenamePrefix: 'birthday-students-this-month' };
          },
        },
      ],
    },

    {
      id: 'fees', label: 'Fees', tone: 'hover:border-rose-300',
      icon: <AlertCircle size={16} className="text-rose-600" />,
      reports: [
        {
          id: 'fees_due', label: 'Due Fees Students', desc: 'Pending dues — sorted by largest first', needsYear: true,
          run: async () => {
            if (!yearId) fail('Pick an academic year first');
            const { data, error } = await supabase.from('student_academic_records')
              .select('total_fee, paid_fee, attendance_percent, students!inner(name, admission_no, phone, is_rte, father_name, father_phone, mother_name, mother_phone, address, admission_date, school_id, is_active), class_name, section, academic_year_id')
              .eq('academic_year_id', yearId)
              .not('class_name', 'is', null);
            if (error) throw new Error(error.message);
            type Row = { total_fee: number|null; paid_fee: number|null; attendance_percent: number|null;
              class_name: string|null; section: string|null;
              students: { name: string; admission_no: string; phone: string|null; is_rte: boolean|null;
                father_name: string|null; father_phone: string|null; mother_name: string|null;
                mother_phone: string|null; address: string|null; admission_date: string|null;
                school_id: string; is_active: boolean } };
            const rows = ((data ?? []) as unknown as Row[])
              .filter(r => r.students.school_id === schoolId && r.students.is_active)
              .map(r => ({
                name: r.students.name,
                admission_no: r.students.admission_no,
                class: `${r.class_name ?? ''}-${r.section ?? ''}`,
                pending_fee: Math.max(0, Number(r.total_fee ?? 0) - Number(r.paid_fee ?? 0)),
                total_fee: Number(r.total_fee ?? 0),
                paid_fee: Number(r.paid_fee ?? 0),
                father_phone: r.students.father_phone ?? '',
                mother_phone: r.students.mother_phone ?? '',
                phone: r.students.phone ?? '',
              }))
              .filter(r => r.pending_fee > 0)
              .sort((a, b) => b.pending_fee - a.pending_fee);
            return {
              rows,
              headers: ['name','admission_no','class','pending_fee','total_fee','paid_fee','father_phone','mother_phone','phone'],
              filenamePrefix: `fee-dues_${yearName}`,
            };
          },
        },
        {
          id: 'fees_paid', label: 'Fully Paid Students', desc: 'Students who have cleared all dues', needsYear: true,
          run: async () => {
            if (!yearId) fail('Pick an academic year first');
            const { data, error } = await supabase.from('student_academic_records')
              .select('total_fee, paid_fee, students!inner(name, admission_no, school_id, is_active), class_name, section')
              .eq('academic_year_id', yearId)
              .not('class_name', 'is', null);
            if (error) throw new Error(error.message);
            const rows = ((data ?? []) as any[])
              .filter(r => r.students.school_id === schoolId && r.students.is_active)
              .filter(r => Number(r.total_fee ?? 0) > 0 && Number(r.paid_fee ?? 0) >= Number(r.total_fee ?? 0))
              .map(r => ({
                name: r.students.name,
                admission_no: r.students.admission_no,
                class: `${r.class_name ?? ''}-${r.section ?? ''}`,
                total_fee: Number(r.total_fee ?? 0),
                paid_fee: Number(r.paid_fee ?? 0),
              }));
            return { rows, headers: ['name','admission_no','class','total_fee','paid_fee'], filenamePrefix: 'fully-paid' };
          },
        },
        {
          id: 'fees_partial', label: 'Partial Fees Students', desc: 'Some paid, some pending', needsYear: true,
          run: async () => {
            if (!yearId) fail('Pick an academic year first');
            const { data, error } = await supabase.from('student_academic_records')
              .select('total_fee, paid_fee, students!inner(name, admission_no, father_phone, school_id, is_active), class_name, section')
              .eq('academic_year_id', yearId)
              .not('class_name', 'is', null);
            if (error) throw new Error(error.message);
            const rows = ((data ?? []) as any[])
              .filter(r => r.students.school_id === schoolId && r.students.is_active)
              .filter(r => {
                const t = Number(r.total_fee ?? 0); const p = Number(r.paid_fee ?? 0);
                return p > 0 && p < t;
              })
              .map(r => ({
                name: r.students.name,
                admission_no: r.students.admission_no,
                class: `${r.class_name ?? ''}-${r.section ?? ''}`,
                paid_fee: Number(r.paid_fee ?? 0),
                pending_fee: Math.max(0, Number(r.total_fee ?? 0) - Number(r.paid_fee ?? 0)),
                father_phone: r.students.father_phone ?? '',
              }));
            return { rows, headers: ['name','admission_no','class','paid_fee','pending_fee','father_phone'], filenamePrefix: 'partial-fees' };
          },
        },
        {
          id: 'fees_discounts', label: 'Discounts Report', desc: 'Write-offs / discounts in active year', needsYear: true,
          run: async () => {
            if (!yearId) fail('Pick an academic year first');
            // fee_write_offs has no direct academic_year_id; we reach
            // it via the parent fee_installments row, then through
            // students for the friendly name.
            const { data, error } = await supabase.from('fee_write_offs')
              .select('amount, reason, created_at, fee_installments!inner(month, due_date, academic_year_id, students!inner(name, admission_no, school_id))')
              .eq('school_id', schoolId)
              .eq('fee_installments.academic_year_id', yearId)
              .order('created_at', { ascending: false });
            if (error) throw new Error(error.message);
            const rows = ((data ?? []) as any[])
              .filter(r => r.fee_installments?.students?.school_id === schoolId)
              .map(r => ({
                date: r.created_at?.slice(0, 10) ?? '',
                student: r.fee_installments?.students?.name ?? '',
                admission_no: r.fee_installments?.students?.admission_no ?? '',
                month: r.fee_installments?.month ?? '',
                amount: Number(r.amount ?? 0),
                reason: r.reason ?? '',
              }));
            return { rows, headers: ['date','student','admission_no','month','amount','reason'], filenamePrefix: 'discounts' };
          },
        },
        {
          id: 'fees_collection_monthly', label: 'Monthly Collection',
          desc: `Payments grouped by month · ${rangeFrom} → ${rangeTo}`, needsRange: true,
          run: async () => {
            const { data, error } = await supabase.from('payment_records')
              .select('amount, date, method, reversed_at')
              .eq('school_id', schoolId).gte('date', rangeFrom).lte('date', rangeTo)
              .is('reversed_at', null);
            if (error) throw new Error(error.message);
            const buckets = new Map<string, { count: number; total: number }>();
            for (const p of (data ?? []) as any[]) {
              const key = (p.date ?? '').slice(0, 7);
              const b = buckets.get(key) ?? { count: 0, total: 0 };
              b.count += 1; b.total += Number(p.amount ?? 0);
              buckets.set(key, b);
            }
            const rows = Array.from(buckets.entries()).sort(([a], [b]) => a.localeCompare(b))
              .map(([month, v]) => ({ month, payments: v.count, total: v.total }));
            return { rows, headers: ['month','payments','total'], filenamePrefix: 'monthly-collection' };
          },
        },
        {
          id: 'fees_collection_classwise', label: 'Class-wise Collection', desc: 'Total collected & pending per class', needsYear: true,
          run: async () => {
            if (!yearId) fail('Pick an academic year first');
            const { data, error } = await supabase.from('student_academic_records')
              .select('total_fee, paid_fee, class_name, section, students!inner(school_id, is_active)')
              .eq('academic_year_id', yearId)
              .not('class_name', 'is', null);
            if (error) throw new Error(error.message);
            type R = { total_fee:number|null; paid_fee:number|null; class_name:string|null; section:string|null;
              students: { school_id: string; is_active: boolean } };
            const buckets = new Map<string, { total: number; paid: number; count: number }>();
            for (const r of (data ?? []) as unknown as R[]) {
              if (r.students.school_id !== schoolId || !r.students.is_active) continue;
              const key = `${r.class_name ?? ''}-${r.section ?? ''}`;
              const b = buckets.get(key) ?? { total: 0, paid: 0, count: 0 };
              b.total += Number(r.total_fee ?? 0); b.paid += Number(r.paid_fee ?? 0); b.count++;
              buckets.set(key, b);
            }
            const rows = Array.from(buckets.entries())
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([cls, v]) => ({
                class: cls, students: v.count, total: v.total, collected: v.paid,
                pending: Math.max(0, v.total - v.paid),
              }));
            return { rows, headers: ['class','students','total','collected','pending'], filenamePrefix: 'class-collection' };
          },
        },
        {
          id: 'fees_transport_due', label: 'Transport Fees Due', desc: 'Pending transport-fee installments', needsYear: true,
          run: async () => {
            if (!yearId) fail('Pick an academic year first');
            const { data, error } = await supabase.from('fee_installments')
              .select('amount, paid_amount, write_off_amount, month, due_date, students!inner(name, admission_no, father_phone, school_id, is_active)')
              .eq('academic_year_id', yearId).eq('fee_type', 'TRANSPORT');
            if (error) throw new Error(error.message);
            const rows = ((data ?? []) as any[])
              .filter(r => r.students.school_id === schoolId && r.students.is_active)
              .map(r => ({
                name: r.students.name,
                admission_no: r.students.admission_no,
                month: r.month,
                due_date: r.due_date,
                outstanding: Math.max(0, Number(r.amount ?? 0) - Number(r.paid_amount ?? 0) - Number(r.write_off_amount ?? 0)),
                father_phone: r.students.father_phone ?? '',
              }))
              .filter(r => r.outstanding > 0);
            return { rows, headers: ['name','admission_no','month','due_date','outstanding','father_phone'], filenamePrefix: 'transport-fees-due' };
          },
        },
        {
          id: 'fees_payment_history', label: 'Payment History',
          desc: `All payments in range · ${rangeFrom} → ${rangeTo}`, needsRange: true,
          run: async () => {
            const { data, error } = await supabase.from('payment_records')
              .select('id, date, amount, method, receipt_no, note, reversed_at, students(name, admission_no)')
              .eq('school_id', schoolId).gte('date', rangeFrom).lte('date', rangeTo)
              .order('date', { ascending: false });
            if (error) throw new Error(error.message);
            const rows = ((data ?? []) as any[]).map(p => ({
              date: p.date,
              receipt: p.receipt_no ?? '',
              student: p.students?.name ?? '',
              admission_no: p.students?.admission_no ?? '',
              amount: Number(p.amount ?? 0),
              method: p.method ?? '',
              status: p.reversed_at ? 'REVERSED' : 'OK',
              note: p.note ?? '',
            }));
            return { rows, headers: ['date','receipt','student','admission_no','amount','method','status','note'], filenamePrefix: 'payment-history' };
          },
        },
      ],
    },

    {
      id: 'attendance', label: 'Attendance', tone: 'hover:border-amber-300',
      icon: <ChartBar size={16} className="text-amber-600" />,
      reports: [
        {
          id: 'att_low', label: 'Below 75% Attendance', desc: 'Students at risk of detainment', needsYear: true,
          run: async () => {
            if (!yearId) fail('Pick an academic year first');
            // Skip students without a class allotment for this year —
            // their attendance % is meaningless when no roll-call ran
            // for them. Same `not class_name is null` guard we apply
            // to every AR-based report.
            const { data, error } = await supabase.from('student_academic_records')
              .select('attendance_percent, class_name, section, students!inner(name, admission_no, father_phone, school_id, is_active)')
              .eq('academic_year_id', yearId).lt('attendance_percent', 75)
              .not('class_name', 'is', null);
            if (error) throw new Error(error.message);
            const rows = ((data ?? []) as any[])
              .filter(r => r.students.school_id === schoolId && r.students.is_active)
              .sort((a, b) => Number(a.attendance_percent ?? 0) - Number(b.attendance_percent ?? 0))
              .map(r => ({
                name: r.students.name,
                admission_no: r.students.admission_no,
                class: `${r.class_name ?? ''}-${r.section ?? ''}`,
                attendance_percent: Number(r.attendance_percent ?? 0),
                father_phone: r.students.father_phone ?? '',
              }));
            return { rows, headers: ['name','admission_no','class','attendance_percent','father_phone'], filenamePrefix: 'below-75-attendance' };
          },
        },
        {
          id: 'att_daily', label: 'Daily Attendance',
          desc: `Per-day class summaries · ${rangeFrom} → ${rangeTo}`, needsRange: true,
          run: async () => {
            const { data, error } = await supabase.from('attendance_records')
              .select('date, class_name, section, total_present, total_absent, approval_status')
              .eq('school_id', schoolId).gte('date', rangeFrom).lte('date', rangeTo)
              .order('date', { ascending: false });
            if (error) throw new Error(error.message);
            const rows = ((data ?? []) as any[]).map(r => ({
              date: r.date,
              class: `${r.class_name ?? ''}-${r.section ?? ''}`,
              present: Number(r.total_present ?? 0),
              absent: Number(r.total_absent ?? 0),
              status: r.approval_status ?? '',
            }));
            return { rows, headers: ['date','class','present','absent','status'], filenamePrefix: 'daily-attendance' };
          },
        },
        {
          id: 'att_monthly', label: 'Monthly Attendance Summary',
          desc: `Aggregated by month · ${rangeFrom} → ${rangeTo}`, needsRange: true,
          run: async () => {
            const { data, error } = await supabase.from('attendance_records')
              .select('date, total_present, total_absent')
              .eq('school_id', schoolId).gte('date', rangeFrom).lte('date', rangeTo);
            if (error) throw new Error(error.message);
            const buckets = new Map<string, { p: number; a: number; days: number }>();
            for (const r of (data ?? []) as any[]) {
              const key = (r.date ?? '').slice(0, 7);
              const b = buckets.get(key) ?? { p: 0, a: 0, days: 0 };
              b.p += Number(r.total_present ?? 0);
              b.a += Number(r.total_absent ?? 0);
              b.days += 1;
              buckets.set(key, b);
            }
            const rows = Array.from(buckets.entries()).sort(([a], [b]) => a.localeCompare(b))
              .map(([month, v]) => ({
                month, days_marked: v.days, total_present: v.p, total_absent: v.a,
                avg_present_pct: v.p + v.a > 0 ? Math.round((v.p / (v.p + v.a)) * 100) : 0,
              }));
            return { rows, headers: ['month','days_marked','total_present','total_absent','avg_present_pct'], filenamePrefix: 'monthly-attendance' };
          },
        },
        {
          id: 'att_absent_today', label: 'Absent Students · Today', desc: 'Students absent on the most recent marked day',
          run: async () => {
            const today = new Date().toISOString().slice(0, 10);
            // Step 1: find the SINGLE most recent date with attendance.
            // Earlier we pulled the last 20 attendance_records and merged
            // their absentees — that quietly mixed multiple days into the
            // "today" report. Now we lock to one date.
            const { data: latestRow, error: e1 } = await supabase.from('attendance_records')
              .select('date').eq('school_id', schoolId).lte('date', today)
              .order('date', { ascending: false }).limit(1).maybeSingle();
            if (e1) throw new Error(e1.message);
            const latestDate = (latestRow as { date: string } | null)?.date;
            if (!latestDate) {
              return { rows: [], headers: ['name','admission_no','class','date'], filenamePrefix: 'absent-today' };
            }
            // Step 2: pull every attendance_record on that exact date so
            // we cover every class+section that marked rolls.
            const { data: recs, error: e2 } = await supabase.from('attendance_records')
              .select('id').eq('school_id', schoolId).eq('date', latestDate);
            if (e2) throw new Error(e2.message);
            const ids = ((recs ?? []) as { id: string }[]).map(r => r.id);
            if (ids.length === 0) {
              return { rows: [], headers: ['name','admission_no','class','date'], filenamePrefix: 'absent-today' };
            }
            // Step 3: absentees on that date only.
            const { data, error } = await supabase.from('attendance_student_details')
              .select('students!inner(name, admission_no, school_id), attendance_records!inner(date, class_name, section, school_id), status, is_present')
              .in('attendance_id', ids)
              .or('is_present.eq.false,status.eq.absent');
            if (error) throw new Error(error.message);
            const rows = ((data ?? []) as any[])
              .filter(r => r.students?.school_id === schoolId)
              .map(r => ({
                name: r.students?.name ?? '',
                admission_no: r.students?.admission_no ?? '',
                class: `${r.attendance_records?.class_name ?? ''}-${r.attendance_records?.section ?? ''}`,
                date: r.attendance_records?.date ?? latestDate,
              }))
              // Defensive: only rows actually on the latest date.
              .filter(r => r.date === latestDate);
            return { rows, headers: ['name','admission_no','class','date'], filenamePrefix: `absent-${latestDate}` };
          },
        },
        {
          id: 'att_staff', label: 'Staff Attendance Summary',
          desc: `Staff present/absent days · ${rangeFrom} → ${rangeTo}`, needsRange: true,
          run: async () => {
            const { data, error } = await supabase.from('staff_attendance')
              .select('staff_id, date, status, staff!inner(name, role, school_id)')
              .gte('date', rangeFrom).lte('date', rangeTo);
            if (error) throw new Error(error.message);
            const buckets = new Map<string, { name: string; role: string; present: number; absent: number; half: number; leave: number }>();
            for (const r of (data ?? []) as any[]) {
              if (r.staff?.school_id !== schoolId) continue;
              const k = r.staff_id;
              const b = buckets.get(k) ?? { name: r.staff.name, role: r.staff.role, present: 0, absent: 0, half: 0, leave: 0 };
              const s = String(r.status ?? '').toUpperCase();
              if (s === 'PRESENT') b.present++;
              else if (s === 'ABSENT') b.absent++;
              else if (s === 'HALF_DAY' || s === 'HALF') b.half++;
              else if (s === 'LEAVE' || s === 'ON_LEAVE') b.leave++;
              buckets.set(k, b);
            }
            const rows = Array.from(buckets.values())
              .sort((a, b) => a.name.localeCompare(b.name));
            return { rows: rows as unknown as Record<string, unknown>[], headers: ['name','role','present','absent','half','leave'], filenamePrefix: 'staff-attendance' };
          },
        },
      ],
    },

    {
      id: 'exams', label: 'Exam Reports', tone: 'hover:border-violet-300',
      icon: <GraduationCap size={16} className="text-violet-600" />,
      reports: [
        {
          id: 'exam_failed', label: 'Failed Students', desc: 'Below 33% in latest finals · active year', needsYear: true,
          run: async () => {
            if (!yearId) fail('Pick an academic year first');
            const { data: tests, error: e1 } = await supabase.from('test_schedules')
              .select('id, title, subject, max_marks, class_name, section')
              .eq('school_id', schoolId).eq('academic_year_id', yearId).eq('results_uploaded', true)
              .in('test_type', ['FINAL', 'ANNUAL', 'TERMINAL']);
            if (e1) throw new Error(e1.message);
            const testIds = ((tests ?? []) as any[]).map(t => t.id);
            if (testIds.length === 0) return { rows: [], headers: ['name','admission_no','class','subject','obtained','max'], filenamePrefix: 'failed-students' };
            const { data: results, error: e2 } = await supabase.from('exam_results')
              .select('test_id, obtained_marks, students!inner(name, admission_no, school_id)')
              .in('test_id', testIds);
            if (e2) throw new Error(e2.message);
            const testMap = new Map<string, any>(((tests ?? []) as any[]).map(t => [t.id, t]));
            const rows = ((results ?? []) as any[])
              .filter(r => r.students?.school_id === schoolId)
              .map(r => {
                const t = testMap.get(r.test_id);
                if (!t) return null;
                const obt = Number(r.obtained_marks ?? 0);
                const max = Number(t.max_marks ?? 0);
                if (max === 0 || obt >= max * 0.33) return null;
                return {
                  name: r.students.name, admission_no: r.students.admission_no,
                  class: `${t.class_name ?? ''}-${t.section ?? ''}`,
                  subject: t.subject ?? '', obtained: obt, max,
                };
              })
              .filter((r): r is NonNullable<typeof r> => r !== null);
            return { rows, headers: ['name','admission_no','class','subject','obtained','max'], filenamePrefix: 'failed-students' };
          },
        },
        {
          id: 'exam_top', label: 'Top Performers', desc: 'Top 10% by total marks in active year', needsYear: true,
          run: async () => {
            if (!yearId) fail('Pick an academic year first');
            const { data, error } = await supabase.from('exam_results')
              .select('obtained_marks, students!inner(name, admission_no, school_id), test_schedules!inner(max_marks, school_id, academic_year_id)')
              .eq('test_schedules.school_id', schoolId).eq('test_schedules.academic_year_id', yearId);
            if (error) throw new Error(error.message);
            const totals = new Map<string, { name: string; admission_no: string; obt: number; max: number }>();
            for (const r of (data ?? []) as any[]) {
              if (r.students?.school_id !== schoolId) continue;
              const k = r.students.admission_no;
              const t = totals.get(k) ?? { name: r.students.name, admission_no: k, obt: 0, max: 0 };
              t.obt += Number(r.obtained_marks ?? 0);
              t.max += Number(r.test_schedules?.max_marks ?? 0);
              totals.set(k, t);
            }
            const sorted = Array.from(totals.values())
              .filter(t => t.max > 0)
              .map(t => ({ ...t, percent: Math.round((t.obt / t.max) * 100) }))
              .sort((a, b) => b.percent - a.percent);
            const cut = Math.max(1, Math.ceil(sorted.length * 0.1));
            const rows = sorted.slice(0, cut).map(t => ({
              name: t.name, admission_no: t.admission_no,
              total_obtained: t.obt, total_max: t.max, percent: t.percent,
            }));
            return { rows, headers: ['name','admission_no','total_obtained','total_max','percent'], filenamePrefix: 'top-performers' };
          },
        },
        {
          id: 'exam_subject', label: 'Subject-wise Results',
          desc: 'All exam results grouped by subject', needsYear: true,
          run: async () => {
            if (!yearId) fail('Pick an academic year first');
            const { data, error } = await supabase.from('exam_results')
              .select('obtained_marks, grade, students!inner(name, admission_no, school_id), test_schedules!inner(title, subject, max_marks, class_name, section, school_id, academic_year_id)')
              .eq('test_schedules.school_id', schoolId).eq('test_schedules.academic_year_id', yearId);
            if (error) throw new Error(error.message);
            const rows = ((data ?? []) as any[])
              .filter(r => r.students?.school_id === schoolId)
              .map(r => ({
                subject: r.test_schedules?.subject ?? '',
                test: r.test_schedules?.title ?? '',
                class: `${r.test_schedules?.class_name ?? ''}-${r.test_schedules?.section ?? ''}`,
                name: r.students.name,
                admission_no: r.students.admission_no,
                obtained: Number(r.obtained_marks ?? 0),
                max: Number(r.test_schedules?.max_marks ?? 0),
                grade: r.grade ?? '',
              }))
              .sort((a, b) => a.subject.localeCompare(b.subject) || a.test.localeCompare(b.test));
            return { rows, headers: ['subject','test','class','name','admission_no','obtained','max','grade'], filenamePrefix: 'subject-results' };
          },
        },
        {
          id: 'exam_class_summary', label: 'Class Result Summary', desc: 'Pass/fail counts per class', needsYear: true,
          run: async () => {
            if (!yearId) fail('Pick an academic year first');
            const { data, error } = await supabase.from('exam_results')
              .select('obtained_marks, students!inner(school_id), test_schedules!inner(max_marks, class_name, section, school_id, academic_year_id, test_type)')
              .eq('test_schedules.school_id', schoolId).eq('test_schedules.academic_year_id', yearId)
              .in('test_schedules.test_type', ['FINAL', 'ANNUAL', 'TERMINAL']);
            if (error) throw new Error(error.message);
            const buckets = new Map<string, { pass: number; fail: number }>();
            for (const r of (data ?? []) as any[]) {
              if (r.students?.school_id !== schoolId) continue;
              const cls = `${r.test_schedules?.class_name ?? ''}-${r.test_schedules?.section ?? ''}`;
              const obt = Number(r.obtained_marks ?? 0);
              const max = Number(r.test_schedules?.max_marks ?? 0);
              const b = buckets.get(cls) ?? { pass: 0, fail: 0 };
              if (max > 0 && obt >= max * 0.33) b.pass++; else b.fail++;
              buckets.set(cls, b);
            }
            const rows = Array.from(buckets.entries())
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([cls, v]) => ({
                class: cls, pass: v.pass, fail: v.fail,
                pass_pct: v.pass + v.fail > 0 ? Math.round((v.pass / (v.pass + v.fail)) * 100) : 0,
              }));
            return { rows, headers: ['class','pass','fail','pass_pct'], filenamePrefix: 'class-result-summary' };
          },
        },
        {
          id: 'exam_promotion', label: 'Promotion Eligibility', desc: 'Active students with attendance ≥ 75% AND no failed final',
          needsYear: true,
          run: async () => {
            if (!yearId) fail('Pick an academic year first');
            // Pull AR + final results in parallel.
            const [arRes, exRes] = await Promise.all([
              supabase.from('student_academic_records')
                .select('attendance_percent, class_name, section, students!inner(id, name, admission_no, school_id, is_active)')
                .eq('academic_year_id', yearId)
                .not('class_name', 'is', null),
              supabase.from('exam_results')
                .select('obtained_marks, student_id, test_schedules!inner(max_marks, school_id, academic_year_id, test_type)')
                .eq('test_schedules.school_id', schoolId).eq('test_schedules.academic_year_id', yearId)
                .in('test_schedules.test_type', ['FINAL', 'ANNUAL', 'TERMINAL']),
            ]);
            if (arRes.error) throw new Error(arRes.error.message);
            if (exRes.error) throw new Error(exRes.error.message);
            const failedSet = new Set<string>();
            for (const r of (exRes.data ?? []) as any[]) {
              const obt = Number(r.obtained_marks ?? 0);
              const max = Number(r.test_schedules?.max_marks ?? 0);
              if (max > 0 && obt < max * 0.33) failedSet.add(r.student_id);
            }
            const rows = ((arRes.data ?? []) as any[])
              .filter(r => r.students.school_id === schoolId && r.students.is_active)
              .filter(r => Number(r.attendance_percent ?? 0) >= 75 && !failedSet.has(r.students.id))
              .map(r => ({
                name: r.students.name, admission_no: r.students.admission_no,
                class: `${r.class_name ?? ''}-${r.section ?? ''}`,
                attendance_percent: Number(r.attendance_percent ?? 0),
                eligible: 'YES',
              }));
            return { rows, headers: ['name','admission_no','class','attendance_percent','eligible'], filenamePrefix: 'promotion-eligibility' };
          },
        },
      ],
    },

    {
      id: 'staff', label: 'Staff Reports', tone: 'hover:border-indigo-300',
      icon: <Briefcase size={16} className="text-indigo-600" />,
      reports: [
        {
          id: 'staff_list', label: 'Staff List', desc: 'Complete active staff with contact + role',
          run: async () => {
            const { data, error } = await supabase.from('staff')
              .select('name, role, subject, phone, email, salary, joining_date, status, is_active')
              .eq('school_id', schoolId).eq('is_active', true).order('name');
            if (error) throw new Error(error.message);
            const rows = (data ?? []) as Record<string, unknown>[];
            return { rows, headers: ['name','role','subject','phone','email','salary','joining_date','status'], filenamePrefix: 'staff-list' };
          },
        },
        {
          id: 'staff_suspended', label: 'Suspended Staff', desc: 'Staff with status SUSPENDED',
          run: async () => {
            const { data, error } = await supabase.from('staff')
              .select('name, role, phone, email, joining_date, status, is_active')
              .eq('school_id', schoolId).eq('status', 'SUSPENDED');
            if (error) throw new Error(error.message);
            return { rows: (data ?? []) as Record<string, unknown>[], headers: ['name','role','phone','email','joining_date','status'], filenamePrefix: 'suspended-staff' };
          },
        },
        {
          id: 'staff_joining', label: 'Joining Report · 90d', desc: 'Staff who joined in last 90 days',
          run: async () => {
            const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 90);
            const { data, error } = await supabase.from('staff')
              .select('name, role, phone, joining_date, salary')
              .eq('school_id', schoolId).gte('joining_date', cutoff.toISOString().slice(0, 10))
              .order('joining_date', { ascending: false });
            if (error) throw new Error(error.message);
            return { rows: (data ?? []) as Record<string, unknown>[], headers: ['name','role','phone','joining_date','salary'], filenamePrefix: 'joining-90d' };
          },
        },
        {
          id: 'staff_salary', label: 'Salary Report',
          desc: `Payments in range · ${rangeFrom} → ${rangeTo}`, needsRange: true,
          run: async () => {
            const { data, error } = await supabase.from('salary_payments')
              .select('paid_at, month, amount, method, staff!inner(name, role, school_id)')
              .gte('paid_at', rangeFrom).lte('paid_at', rangeTo + 'T23:59:59')
              .order('paid_at', { ascending: false });
            if (error) throw new Error(error.message);
            const rows = ((data ?? []) as any[])
              .filter(r => r.staff?.school_id === schoolId)
              .map(r => ({
                date: r.paid_at?.slice(0, 10) ?? '',
                staff: r.staff?.name ?? '',
                role: r.staff?.role ?? '',
                month: r.month,
                amount: Number(r.amount ?? 0),
                method: r.method ?? '',
              }));
            return { rows, headers: ['date','staff','role','month','amount','method'], filenamePrefix: 'salary-report' };
          },
        },
        {
          id: 'staff_salary_pending', label: 'Salary Pending Report', desc: 'Months with unpaid salary per staff',
          run: async () => {
            // Compute month-by-month from staff.joining_date → today; subtract paid months.
            const [staffRes, payRes] = await Promise.all([
              supabase.from('staff').select('id, name, role, salary, joining_date, is_active').eq('school_id', schoolId).eq('is_active', true),
              supabase.from('salary_payments').select('staff_id, month, amount').eq('school_id', schoolId),
            ]);
            if (staffRes.error) throw new Error(staffRes.error.message);
            if (payRes.error) throw new Error(payRes.error.message);
            const paidByStaff = new Map<string, Map<string, number>>();
            for (const p of (payRes.data ?? []) as any[]) {
              const m = paidByStaff.get(p.staff_id) ?? new Map();
              m.set(p.month, (m.get(p.month) ?? 0) + Number(p.amount ?? 0));
              paidByStaff.set(p.staff_id, m);
            }
            const monthLabel = (d: Date) => d.toLocaleString('en-IN', { month: 'short', year: 'numeric' });
            const today = new Date();
            const rows: Record<string, unknown>[] = [];
            for (const s of (staffRes.data ?? []) as any[]) {
              const start = s.joining_date ? new Date(s.joining_date) : null;
              if (!start) continue;
              const cur = new Date(start.getFullYear(), start.getMonth(), 1);
              const end = new Date(today.getFullYear(), today.getMonth(), 1);
              while (cur <= end) {
                const label = monthLabel(cur);
                const paid = paidByStaff.get(s.id)?.get(label) ?? 0;
                const due = Number(s.salary ?? 0);
                if (paid < due) {
                  rows.push({
                    staff: s.name, role: s.role, month: label,
                    expected: due, paid, pending: Math.max(0, due - paid),
                  });
                }
                cur.setMonth(cur.getMonth() + 1);
              }
            }
            return { rows, headers: ['staff','role','month','expected','paid','pending'], filenamePrefix: 'salary-pending' };
          },
        },
      ],
    },

    {
      id: 'transport', label: 'Transport Reports', tone: 'hover:border-orange-300',
      icon: <Bus size={16} className="text-orange-600" />,
      reports: [
        {
          id: 'tx_active', label: 'Active Transport Students', desc: 'Students with an active transport assignment', needsYear: true,
          run: async () => {
            if (!yearId) fail('Pick an academic year first');
            const { data, error } = await supabase.from('student_transport_assignments')
              .select('monthly_amount, start_date, students!inner(name, admission_no, father_phone, school_id, is_active), transport_vehicles(vehicle_no, route_name), route_stops(name)')
              .eq('academic_year_id', yearId).eq('is_active', true);
            if (error) throw new Error(error.message);
            const rows = ((data ?? []) as any[])
              .filter(r => r.students.school_id === schoolId && r.students.is_active)
              .map(r => ({
                name: r.students.name,
                admission_no: r.students.admission_no,
                vehicle: r.transport_vehicles?.vehicle_no ?? '',
                route: r.transport_vehicles?.route_name ?? '',
                stop: r.route_stops?.name ?? '',
                monthly: Number(r.monthly_amount ?? 0),
                start_date: r.start_date ?? '',
                father_phone: r.students.father_phone ?? '',
              }));
            return { rows, headers: ['name','admission_no','vehicle','route','stop','monthly','start_date','father_phone'], filenamePrefix: 'active-transport' };
          },
        },
        {
          id: 'tx_routewise', label: 'Route-wise Students', desc: 'Active assignments grouped by vehicle/route',
          needsYear: true,
          run: async () => {
            if (!yearId) fail('Pick an academic year first');
            const { data, error } = await supabase.from('student_transport_assignments')
              .select('students!inner(name, admission_no, school_id, is_active), transport_vehicles!inner(vehicle_no, route_name), route_stops(name)')
              .eq('academic_year_id', yearId).eq('is_active', true);
            if (error) throw new Error(error.message);
            const rows = ((data ?? []) as any[])
              .filter(r => r.students.school_id === schoolId && r.students.is_active)
              .map(r => ({
                route: r.transport_vehicles?.route_name ?? '',
                vehicle: r.transport_vehicles?.vehicle_no ?? '',
                stop: r.route_stops?.name ?? '',
                name: r.students.name,
                admission_no: r.students.admission_no,
              }))
              .sort((a, b) => a.route.localeCompare(b.route) || a.vehicle.localeCompare(b.vehicle));
            return { rows, headers: ['route','vehicle','stop','name','admission_no'], filenamePrefix: 'route-wise-students' };
          },
        },
        {
          id: 'tx_due', label: 'Transport Due Report', desc: 'Pending transport-fee installments', needsYear: true,
          run: async () => {
            if (!yearId) fail('Pick an academic year first');
            const { data, error } = await supabase.from('fee_installments')
              .select('amount, paid_amount, write_off_amount, month, due_date, students!inner(name, admission_no, father_phone, school_id, is_active)')
              .eq('academic_year_id', yearId).eq('fee_type', 'TRANSPORT');
            if (error) throw new Error(error.message);
            const rows = ((data ?? []) as any[])
              .filter(r => r.students.school_id === schoolId && r.students.is_active)
              .map(r => ({
                name: r.students.name,
                admission_no: r.students.admission_no,
                month: r.month,
                due_date: r.due_date,
                outstanding: Math.max(0, Number(r.amount ?? 0) - Number(r.paid_amount ?? 0) - Number(r.write_off_amount ?? 0)),
                father_phone: r.students.father_phone ?? '',
              }))
              .filter(r => r.outstanding > 0);
            return { rows, headers: ['name','admission_no','month','due_date','outstanding','father_phone'], filenamePrefix: 'transport-due' };
          },
        },
        {
          id: 'tx_history', label: 'Transport History', desc: 'All assignments (active + ended) in active year',
          needsYear: true,
          run: async () => {
            if (!yearId) fail('Pick an academic year first');
            const { data, error } = await supabase.from('student_transport_assignments')
              .select('start_date, end_date, is_active, monthly_amount, end_reason, students!inner(name, admission_no, school_id), transport_vehicles(vehicle_no, route_name), route_stops(name)')
              .eq('academic_year_id', yearId)
              .order('start_date', { ascending: false });
            if (error) throw new Error(error.message);
            const rows = ((data ?? []) as any[])
              .filter(r => r.students.school_id === schoolId)
              .map(r => ({
                name: r.students.name,
                admission_no: r.students.admission_no,
                vehicle: r.transport_vehicles?.vehicle_no ?? '',
                route: r.transport_vehicles?.route_name ?? '',
                stop: r.route_stops?.name ?? '',
                monthly: Number(r.monthly_amount ?? 0),
                start_date: r.start_date ?? '',
                end_date: r.end_date ?? '',
                status: r.is_active ? 'ACTIVE' : 'ENDED',
                end_reason: r.end_reason ?? '',
              }));
            return { rows, headers: ['name','admission_no','vehicle','route','stop','monthly','start_date','end_date','status','end_reason'], filenamePrefix: 'transport-history' };
          },
        },
      ],
    },
  ];

  const fire = (def: ReportDef) => {
    runReport(def.id, { yearId, classFilter, rangeFrom, rangeTo }, def.run);
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-base lg:text-lg font-black text-slate-900">Reports &amp; Downloads</h3>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
            On-demand CSVs · 50/hour · 100/day
          </p>
        </div>
      </div>

      {/* Class filter — only relevant for class-scoped reports below.
           Year + date range come from the page header. */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 mb-4 flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 shrink-0">Class filter</span>
        <select value={classFilter} onChange={e => setClassFilter(e.target.value)}
          className="border border-slate-200 bg-slate-50 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-blue-400">
          <option value="">All classes</option>
          {classOptions.map(c => (
            <option key={`${c.className}-${c.section}`} value={`${c.className}:${c.section}`}>
              {c.className}-{c.section} · {c.studentCount} students
            </option>
          ))}
        </select>
        {classFilter && (
          <button onClick={() => setClassFilter('')}
            className="text-[10px] font-black text-rose-600 px-2 py-1 hover:bg-rose-50 rounded-md">
            Clear
          </button>
        )}
      </div>

      <div className="space-y-3">
        {sections.map(sec => {
          const isOpen = open[sec.id];
          return (
            <div key={sec.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <button onClick={() => toggle(sec.id)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 active:bg-slate-50 transition-colors">
                <div className="flex items-center gap-2.5">
                  {sec.icon}
                  <span className="font-black text-slate-900 text-sm">{sec.label}</span>
                  <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                    {sec.reports.length}
                  </span>
                </div>
                {isOpen ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
              </button>
              {isOpen && (
                <div className="border-t border-slate-100 p-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {sec.reports.map(r => {
                    const busy = reportBusy === r.id;
                    return (
                      <button key={r.id} onClick={() => fire(r)}
                        disabled={!!reportBusy}
                        className={`text-left bg-slate-50 hover:bg-white rounded-xl border border-slate-100 ${sec.tone} p-3 transition-all disabled:opacity-50 active:scale-[0.99]`}>
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <span className="font-black text-slate-900 text-[13px] leading-tight">{r.label}</span>
                          {busy
                            ? <Loader size={13} className="animate-spin text-slate-400 shrink-0 mt-0.5" />
                            : <Download size={13} className="text-slate-400 shrink-0 mt-0.5" />}
                        </div>
                        <p className="text-[11px] font-bold text-slate-500 leading-snug">{r.desc}</p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};
