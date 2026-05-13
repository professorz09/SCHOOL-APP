// yearClosing.service.ts — Supabase-backed year-closing flow.
//
// Reads pre-closing checklist from live tables (student_academic_records,
// salary_payments, attendance_records). Commits the close via RPCs:
//   close_academic_year(p_year_id)
//   create_academic_year(label, start, end, board, medium)
//   promote_students(from_year, to_year, decisions JSONB)
//
// The wizard form draft (saveConfig/getConfig) is intentionally kept in
// memory because it represents UI form state during a single principal
// session, NOT persistent data.

import { supabase } from '@/lib/supabase';
import { apiAcademicYear } from '@/lib/apiClient';
import { logAudit } from '@/lib/audit';
import type {
  StreamDefinition,
  StreamName,
  YearClosingConfig,
  PreClosingChecklist,
  YearClosingPreview,
  YearClosingResult,
  AuditLogEntry,
} from '@/modules/academic-year/yearClosing.types';

// ─── In-memory wizard form draft (UI state) ──────────────────────────────────
// Configs are NOT persisted — they hold the wizard form between steps.
let _yearClosingConfigs: YearClosingConfig[] = [];

const generateId = () => `cfg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const monthsBetween = (startISO: string, endISO: string): number => {
  const a = new Date(startISO);
  const b = new Date(endISO);
  return Math.max(
    0,
    (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1,
  );
};

const bumpClass = (cls: string | null | undefined): string => {
  if (!cls) return cls ?? '';
  // Replace the FIRST digit-run via a regex callback so the replace
  // position is anchored to the match (not a free string search).
  // Earlier `cls.replace(m[1], …)` did a string-based first-occurrence
  // replace, which would target the wrong substring when the same
  // digits appear elsewhere in the label (e.g. "Class 10, Group 10").
  return cls.replace(/\d+/, (m) => String(parseInt(m, 10) + 1));
};

const isClass12 = (cls: string | null | undefined): boolean => {
  if (!cls) return false;
  const m = cls.match(/(\d+)/);
  return m ? parseInt(m[1], 10) >= 12 : false;
};

// ─── Stream service stub (kept for compatibility — wizard imports it) ───────
// Stream auto-assignment is handled inside the wizard config (capacities) and
// applied on-demand during commit. The principal can still configure stream
// capacities; per-student stream-section assignment is a UX-side decision.

const STREAM_ELIGIBILITY: Record<StreamName, { minPercent: number; note: string }> = {
  'Science-PCM': { minPercent: 60, note: 'Requires 60%+ in Maths & Science' },
  'Science-PCB': { minPercent: 60, note: 'Requires 60%+ in Science (with Biology)' },
  Commerce: { minPercent: 40, note: 'Requires 40%+ overall' },
  Arts: { minPercent: 0, note: 'Open to all students' },
};

// Internal helper — used by yearClosingService.simulateYearClosing for
// stream eligibility/auto-assignment. No external consumers (was previously
// exported for an older wizard prototype).
const streamService = {
  checkEligibility(
    attendancePercent: number,
    stream: StreamName,
  ): { eligible: boolean; reason?: string } {
    const rule = STREAM_ELIGIBILITY[stream];
    if (!rule) return { eligible: false, reason: 'Invalid stream' };
    if (attendancePercent < rule.minPercent) {
      return {
        eligible: false,
        reason: `${rule.note} (current: ${attendancePercent.toFixed(1)}%)`,
      };
    }
    return { eligible: true };
  },

  autoAssignStreams(
    students: Array<{ id: string; name: string; attendancePercent: number }>,
    _yearId: string,
    streamDefs: StreamDefinition[],
  ): { assigned: number; waitlisted: string[] } {
    const seatMap: Record<string, number> = {};
    streamDefs.forEach((s) => {
      seatMap[s.name] = s.capacity;
    });

    let assigned = 0;
    const waitlisted: string[] = [];
    const order: StreamName[] = ['Science-PCM', 'Science-PCB', 'Commerce', 'Arts'];

    const sorted = [...students].sort((a, b) => b.attendancePercent - a.attendancePercent);

    sorted.forEach((stu) => {
      let assignedStream: StreamName | null = null;
      for (const stream of order) {
        if ((seatMap[stream] ?? 0) <= 0) continue;
        const elig = this.checkEligibility(stu.attendancePercent, stream);
        if (elig.eligible) {
          assignedStream = stream;
          break;
        }
      }
      if (!assignedStream) {
        waitlisted.push(stu.id);
        return;
      }
      seatMap[assignedStream]--;
      assigned++;
    });

    return { assigned, waitlisted };
  },
};

// ─── Year Closing Service (Supabase-backed) ─────────────────────────────────

const getSchoolId = async (): Promise<string> => {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error('Not authenticated');
  const { data, error } = await supabase
    .from('users')
    .select('school_id')
    .eq('id', u.user.id)
    .single();
  if (error || !data?.school_id) throw new Error('No school linked to user');
  return data.school_id as string;
};

export const yearClosingService = {
  // ── Read: is year locked / audit logs ────────────────────────────────────

  async isYearLocked(yearId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('academic_years')
      .select('is_closed')
      .eq('id', yearId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return !!data?.is_closed;
  },

  async getAuditLogs(yearId?: string): Promise<AuditLogEntry[]> {
    let q = supabase
      .from('audit_logs')
      .select('id, action, entity_type, entity_id, details, created_at')
      .order('created_at', { ascending: false })
      .limit(200);
    if (yearId) {
      q = q.eq('entity_type', 'academic_year').eq('entity_id', yearId);
    }
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    type AuditRow = {
      id: string;
      action: string;
      entity_type: string;
      entity_id: string | null;
      details: Record<string, unknown> | null;
      created_at: string;
    };
    return ((data ?? []) as AuditRow[]).map((r) => ({
      id: r.id,
      academicYearId:
        r.entity_type === 'academic_year' ? (r.entity_id ?? '') : (yearId ?? ''),
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id ?? '',
      details: typeof r.details === 'object' ? JSON.stringify(r.details) : String(r.details ?? ''),
      performedAt: r.created_at,
    }));
  },

  // ── Write: lock year (helper — same as close_academic_year RPC) ─────────

  async lockYear(yearId: string): Promise<void> {
    await apiAcademicYear.close(yearId);
  },

  // ── Close-only flow ──────────────────────────────────────────────────────
  //
  // Locks the academic year (is_closed = TRUE, is_active = FALSE) WITHOUT
  // creating a new year and WITHOUT auto-promoting students. Use this for
  // the year-closing flow surfaced in AcademicYearManager.
  //
  // After the close:
  //   • Attendance / results / timetable for the year become read-only
  //     (gated client-side via useEditGuard + Correction Mode).
  //   • Failed / unassigned / TC students continue to be handled by the
  //     Student Archive flow (Task #3).
  //   • Outstanding fees stay on the locked year — no carry, no write-off.
  //   • The principal opens the next year separately via AcademicYearWizard.
  async closeAcademicYear(yearId: string): Promise<void> {
    await apiAcademicYear.close(yearId);
    await logAudit('close_academic_year', 'academic_year', yearId, {
      mode: 'manual_close_only',
    });
  },

  async getCorrectionCount(yearId: string): Promise<number> {
    const { count, error } = await supabase
      .from('audit_logs')
      .select('id', { count: 'exact', head: true })
      .eq('action', 'YEAR_CORRECTION')
      .eq('entity_type', 'academic_year')
      .eq('entity_id', yearId);
    if (error) return 0;
    return count ?? 0;
  },

  // ── PHASE 1: Pre-closing checklist ──────────────────────────────────────

  async getPreClosingChecklist(yearId: string): Promise<PreClosingChecklist> {
    const schoolId = await getSchoolId();

    // Year date range for salary expectations
    const { data: yearRow, error: yErr } = await supabase
      .from('academic_years')
      .select('start_date, end_date')
      .eq('id', yearId)
      .single();
    if (yErr || !yearRow) throw new Error('Academic year not found');

    // Pending fees from student_academic_records (per-student carry)
    type RecRow = {
      student_id: string;
      total_fee: number;
      paid_fee: number;
      attendance_percent: number | null;
      students: { name: string; is_active: boolean } | null;
    };
    const { data: recRows, error: recErr } = await supabase
      .from('student_academic_records')
      .select(
        'student_id, total_fee, paid_fee, attendance_percent, students!inner(name, is_active)',
      )
      .eq('academic_year_id', yearId);
    if (recErr) throw new Error(recErr.message);

    const records = ((recRows ?? []) as unknown as RecRow[]).filter(
      (r) => r.students?.is_active !== false,
    );
    const feeStudents = records
      .map((r) => ({
        id: r.student_id,
        name: r.students?.name ?? 'Unknown',
        dueAmount: Math.max(0, (r.total_fee ?? 0) - (r.paid_fee ?? 0)),
      }))
      .filter((s) => s.dueAmount > 0);
    const feesTotal = feeStudents.reduce((sum, s) => sum + s.dueAmount, 0);

    // Attendance + results completion
    const totalStudents = records.length;
    const withAttendance = records.filter((r) => (r.attendance_percent ?? 0) > 0).length;
    const attendancePercentage = totalStudents > 0 ? (withAttendance / totalStudents) * 100 : 100;

    // Results: students with at least one exam_result row in this year
    let withResults = 0;
    if (totalStudents > 0) {
      const { data: examRows } = await supabase
        .from('exam_results')
        .select('student_id')
        .eq('academic_year_id', yearId);
      const set = new Set<string>(
        ((examRows ?? []) as Array<{ student_id: string }>).map((r) => r.student_id),
      );
      withResults = records.filter((r) => set.has(r.student_id)).length;
    }
    const resultsPercentage = totalStudents > 0 ? (withResults / totalStudents) * 100 : 100;

    // Pending salary: months elapsed since year start (cap at year end / today)
    const today = new Date();
    const cap = today < new Date(yearRow.end_date) ? today.toISOString() : yearRow.end_date;
    const monthsExpected = monthsBetween(yearRow.start_date, cap);

    type StaffRow = { id: string; name: string; salary: number; is_active: boolean };
    const { data: staffRows } = await supabase
      .from('staff')
      .select('id, name, salary, is_active')
      .eq('school_id', schoolId)
      .eq('is_active', true);
    const staff = ((staffRows ?? []) as StaffRow[]);

    type SalRow = { staff_id: string; month: string };
    const { data: salRows } = await supabase
      .from('salary_payments')
      .select('staff_id, month')
      .eq('school_id', schoolId)
      .gte('paid_at', yearRow.start_date)
      .lte('paid_at', yearRow.end_date);
    const paidByStaff = new Map<string, Set<string>>();
    ((salRows ?? []) as SalRow[]).forEach((p) => {
      if (!paidByStaff.has(p.staff_id)) paidByStaff.set(p.staff_id, new Set());
      paidByStaff.get(p.staff_id)!.add(p.month);
    });

    const salaryPendingStaff = staff
      .map((s) => {
        const paidCount = paidByStaff.get(s.id)?.size ?? 0;
        const pendingMonths = Math.max(0, monthsExpected - paidCount);
        return { id: s.id, name: s.name, pendingMonths, salary: s.salary };
      })
      .filter((s) => s.pendingMonths > 0);
    const salaryTotal = salaryPendingStaff.reduce(
      (sum, s) => sum + s.pendingMonths * s.salary,
      0,
    );

    const blockers: string[] = [];
    const warnings: string[] = [];

    // All financial / completion items are warnings — the principal may
    // close a year with fees outstanding (left in place on the locked year)
    // or salary unpaid (with explicit acknowledgment). Auto-promotion is
    // no longer part of close, so there are no hard blockers here.
    if (feesTotal > 0) {
      warnings.push(
        `₹${feesTotal.toLocaleString()} outstanding fees from ${feeStudents.length} student(s) — will remain on the locked year`,
      );
    }
    if (salaryTotal > 0) {
      warnings.push(
        `₹${salaryTotal.toLocaleString()} pending salary for ${salaryPendingStaff.length} staff member(s) — clear from Salary Ledger before closing`,
      );
    }
    if (resultsPercentage < 95 && totalStudents > 0) {
      warnings.push(`${totalStudents - withResults} student(s) have no results entered`);
    }
    if (attendancePercentage < 90 && totalStudents > 0) {
      warnings.push(`${totalStudents - withAttendance} student(s) have no attendance records`);
    }
    if (totalStudents === 0) {
      warnings.push('No students enrolled in this academic year');
    }

    return {
      feesPending: { total: feesTotal, count: feeStudents.length, students: feeStudents },
      salaryPending: {
        total: salaryTotal,
        count: salaryPendingStaff.length,
        staff: salaryPendingStaff.map(({ id, name, pendingMonths }) => ({
          id,
          name,
          pendingMonths,
        })),
      },
      resultsCompletion: {
        completed: withResults,
        total: totalStudents,
        percentage: resultsPercentage,
      },
      attendanceCompletion: {
        completed: withAttendance,
        total: totalStudents,
        percentage: attendancePercentage,
      },
      status: blockers.length === 0 ? 'READY' : 'NOT_READY',
      blockers,
      warnings,
    };
  },

  // ── PHASE 2: Save wizard form draft (in-memory UI state) ────────────────

  saveConfig(config: Omit<YearClosingConfig, 'id' | 'status' | 'createdDate'>): YearClosingConfig {
    const saved: YearClosingConfig = {
      ...config,
      id: generateId(),
      status: 'PENDING_COMMIT',
      createdDate: new Date().toISOString(),
    };
    _yearClosingConfigs = [..._yearClosingConfigs, saved];
    return saved;
  },

  getConfig(configId: string): YearClosingConfig | null {
    return _yearClosingConfigs.find((c) => c.id === configId) ?? null;
  },

  // ── PHASE 3: Simulate (preview) ─────────────────────────────────────────

  async simulateYearClosing(configId: string): Promise<YearClosingPreview> {
    const config = this.getConfig(configId);
    if (!config) throw new Error('Config not found');

    const errors: string[] = [];
    const warnings: string[] = [];

    if (!config.nextYearName?.trim()) errors.push('Next academic year name is required');
    if (!config.nextYearStartDate || !config.nextYearEndDate) {
      errors.push('Start and end dates for next year are required');
    }

    type RecRow = {
      student_id: string;
      class_name: string | null;
      attendance_percent: number | null;
      students: { is_active: boolean; status: string } | null;
    };
    const { data: rows, error } = await supabase
      .from('student_academic_records')
      .select(
        'student_id, class_name, attendance_percent, students!inner(is_active, status)',
      )
      .eq('academic_year_id', config.fromYearId);
    if (error) throw new Error(error.message);

    const recs = ((rows ?? []) as unknown as RecRow[]).filter(
      (r) => r.students?.is_active !== false,
    );

    const class10 = recs.filter((r) => r.class_name?.match(/(?:^|[^\d])10(?:[^\d]|$)/));
    const class12 = recs.filter((r) => isClass12(r.class_name ?? ''));
    const droppedOut = recs.filter(
      (r) => r.students?.status && r.students.status !== 'ACTIVE',
    ).length;
    const toDetain = recs.filter((r) => (r.attendance_percent ?? 0) < 75).length;
    const toGraduate = class12.length;
    const toPromote = Math.max(0, recs.length - toDetain - droppedOut - toGraduate);

    if (class10.length > 0 && config.streams.length === 0) {
      errors.push(
        `${class10.length} Class 10 student(s) need stream assignment but no streams defined`,
      );
    }
    const totalCapacity = config.streams.reduce((sum, s) => sum + s.capacity, 0);
    if (class10.length > totalCapacity && totalCapacity > 0) {
      warnings.push(
        `Stream capacity (${totalCapacity}) is less than Class 10 students (${class10.length}) — some will be waitlisted`,
      );
    }
    if (recs.length === 0) warnings.push('No students enrolled in current academic year');

    const schoolId = await getSchoolId();
    const { count: staffCount } = await supabase
      .from('staff')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .eq('is_active', true);

    return {
      summary: {
        fromYear: config.fromYearId,
        toYear: config.nextYearName,
        studentsTotal: recs.length,
        studentsToPromote: toPromote,
        studentsToDetain: toDetain,
        studentsDroppedOut: droppedOut,
        studentsGraduating: toGraduate,
        streamsToAssign: class10.length,
        staffToCarry: config.carryForward.staff ? (staffCount ?? 0) : 0,
      },
      errors,
      warnings,
    };
  },

  // ── PHASE 4: Commit (single atomic RPC) ─────────────────────────────────
  //
  // Uses public.commit_year_closing(...) which executes close-old +
  // create-new + promote-students inside ONE PostgreSQL transaction. If any
  // step fails, the entire commit rolls back — no partial state possible.

  async commitYearClosing(configId: string): Promise<YearClosingResult> {
    const config = this.getConfig(configId);
    if (!config) throw new Error('Config not found');
    if (config.status === 'COMMITTED') throw new Error('Year closing already committed');

    try {
      // Build per-student decisions from current-year records
      type RecRow = {
        student_id: string;
        class_name: string | null;
        attendance_percent: number | null;
        students: { is_active: boolean; status: string } | null;
      };
      const { data: rows, error: recErr } = await supabase
        .from('student_academic_records')
        .select(
          'student_id, class_name, attendance_percent, students!inner(is_active, status)',
        )
        .eq('academic_year_id', config.fromYearId);
      if (recErr) throw new Error(recErr.message);
      const recs = ((rows ?? []) as unknown as RecRow[]);

      type Decision = {
        student_id: string;
        action: 'PROMOTE' | 'REPEAT' | 'TC';
        new_class_name?: string;
      };
      const decisions: Decision[] = [];
      let promoted = 0;
      let detained = 0;
      let graduated = 0;

      for (const r of recs) {
        // Skip students already inactive / TC issued
        if (r.students?.is_active === false || r.students?.status !== 'ACTIVE') continue;
        const cls = r.class_name ?? '';

        if (isClass12(cls)) {
          decisions.push({ student_id: r.student_id, action: 'TC' });
          graduated++;
        } else if ((r.attendance_percent ?? 0) < 75) {
          decisions.push({ student_id: r.student_id, action: 'REPEAT' });
          detained++;
        } else {
          decisions.push({
            student_id: r.student_id,
            action: 'PROMOTE',
            new_class_name: bumpClass(cls),
          });
          promoted++;
        }
      }

      // ─── Atomic commit ─────────────────────────────────────────────────
      // Pass the dues-handling choice through to the RPC so it actually
      // takes effect (WRITEOFF zeros next-year carry + records write-offs;
      // ARREARS keeps the carry-forward behavior).
      const duesHandling: 'WRITEOFF' | 'ARREARS' | 'NONE' =
        config.outstandingDuesHandling === 'WRITEOFF' ? 'WRITEOFF'
        : config.outstandingDuesHandling === 'ARREARS' ? 'ARREARS'
        : 'NONE';

      const result = await apiAcademicYear.commitClosing({
        oldYearId:   config.fromYearId,
        newLabel:    config.nextYearName,
        newStart:    config.nextYearStartDate,
        newEnd:      config.nextYearEndDate,
        newBoard:    config.board ?? 'CBSE',
        newMedium:   config.nextYearMedium ?? 'English',
        decisions,
        duesHandling,
      });
      const newYearId = result.newYearId;
      if (!newYearId) throw new Error('API returned no newYearId');

      // Stream count — informational (per-section assignment is a follow-up
      // step the principal handles after the new year is opened)
      const streamsAssigned = decisions.filter(
        (d) => d.action === 'PROMOTE' && d.new_class_name === 'Class 11',
      ).length;

      let feesAction = 'No outstanding dues to handle';
      if (config.outstandingDuesHandling === 'WRITEOFF') {
        feesAction = 'Outstanding dues left in old (locked) year — not carried forward';
      } else if (config.outstandingDuesHandling === 'ARREARS') {
        feesAction = 'Outstanding dues carried as arrears into new academic year';
      }

      // Persist success on draft
      _yearClosingConfigs = _yearClosingConfigs.map((c) =>
        c.id === configId ? { ...c, status: 'COMMITTED' } : c,
      );

      await logAudit('year_closing_ui_committed', 'academic_year', config.fromYearId, {
        newYearId,
        promoted,
        detained,
        graduated,
      });

      return {
        success: true,
        newYearId,
        newYearName: config.nextYearName,
        summary: {
          oldYearLocked: config.fromYearId,
          newYearCreated: config.nextYearName,
          studentsPromoted: promoted,
          studentsDetained: detained,
          studentsGraduated: graduated,
          streamsAssigned,
          feesAction,
        },
      };
    } catch (e) {
      // Persist FAILED state on draft so the wizard can show a clear status
      const message = e instanceof Error ? e.message : String(e);
      _yearClosingConfigs = _yearClosingConfigs.map((c) =>
        c.id === configId ? { ...c, status: 'FAILED', errorMessage: message } : c,
      );
      await logAudit('year_closing_failed', 'academic_year', config.fromYearId, {
        error: message,
      });
      throw e instanceof Error ? e : new Error(message);
    }
  },
};
