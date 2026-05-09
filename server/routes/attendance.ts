import { Router } from 'express';
import { adminDb } from '../lib/db';
import { ok, fail, ApiError, requireBody } from '../lib/helpers';
import { requireAuth, requireRole } from '../middleware/auth';

export const attendanceRouter = Router();

// ─── Value types ─────────────────────────────────────────────────────────────

type AttendanceStatus = 'present' | 'absent' | 'holiday' | 'half';

// ─── Typed row shapes (avoid as-any casts) ───────────────────────────────────

interface StaffRow     { id: string }
interface PermRow      { id: string }
interface AssignRow    { id: string }
interface SectionRow   { id: string; class_name: string; section: string; academic_year_id: string; school_id: string }
interface RecordRow    { id: string; date: string; approval_status: string; is_locked: boolean; total_present: number; total_absent: number; total_holiday: number; total_half: number; total_students: number }
interface RecordMinRow { id: string; is_locked: boolean; approval_status: string }
interface RecordSchool { id: string; school_id: string; is_locked: boolean }
interface DetailRow    { attendance_id: string; student_id: string; is_present: boolean; status: AttendanceStatus | null }
interface StuDetailRow { student_id: string }
interface AcYearRow    { id: string }
interface StuAcRow     { student_id: string; roll_no: string | null; students: { name: string } | null }
interface SectionIdRow { id: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusToIsPresent(status: AttendanceStatus): boolean {
  return status === 'present' || status === 'half';
}

function countsByStatus(records: { status: AttendanceStatus }[]) {
  let present = 0, absent = 0, holiday = 0, half = 0;
  for (const r of records) {
    if (r.status === 'present')      present++;
    else if (r.status === 'half')    half++;
    else if (r.status === 'holiday') holiday++;
    else                             absent++;
  }
  return { present, absent, holiday, half, total: records.length };
}

function normalizeStatus(
  rawStatus: AttendanceStatus | undefined,
  isPresent: boolean | undefined,
): AttendanceStatus {
  if (rawStatus) return rawStatus;
  return isPresent !== undefined ? (isPresent ? 'present' : 'absent') : 'absent';
}

// ─── Teacher-to-section authorization ─────────────────────────────────────────
// Returns true when the teacher (identified by userId) is assigned to sectionId.
// Checks: staff_permissions (per-section) → staff_class_assignments (per-class).
async function verifyTeacherSectionAccess(
  userId: string, schoolId: string, sectionId: string,
): Promise<boolean> {
  const { data: staffData } = await adminDb
    .from('staff').select('id')
    .eq('user_id', userId).eq('school_id', schoolId).maybeSingle();
  const staffRow = staffData as StaffRow | null;
  if (!staffRow) return false;

  // 1. Per-section permission row
  const { data: permData } = await adminDb
    .from('staff_permissions').select('id')
    .eq('staff_id', staffRow.id).eq('section_id', sectionId).limit(1);
  if (((permData ?? []) as PermRow[]).length > 0) return true;

  // 2. Fallback: class-level assignment
  const { data: secData } = await adminDb
    .from('sections').select('class_name')
    .eq('id', sectionId).maybeSingle();
  const secRow = secData as Pick<SectionRow, 'class_name'> | null;
  if (!secRow) return false;

  const { data: assignData } = await adminDb
    .from('staff_class_assignments').select('id')
    .eq('staff_id', staffRow.id).eq('school_id', schoolId)
    .eq('class_name', secRow.class_name).limit(1);
  return ((assignData ?? []) as AssignRow[]).length > 0;
}

// ─── GET /api/attendance?sectionId=&date= ─────────────────────────────────────
attendanceRouter.get('/', requireAuth, requireRole('TEACHER', 'PRINCIPAL'), async (req, res) => {
  try {
    const { sectionId, date } = req.query as Record<string, string>;
    if (!sectionId || !date) throw new ApiError(400, 'sectionId and date required');

    // Tenant isolation: always scope to caller's school.
    if (req.user.role === 'TEACHER') {
      const allowed = await verifyTeacherSectionAccess(req.user.id, req.user.school_id!, sectionId);
      if (!allowed) throw new ApiError(403, 'You are not assigned to this section');
    }

    const { data: record } = await adminDb
      .from('attendance_records')
      .select('*, attendance_student_details(*)')
      .eq('school_id', req.user.school_id!)
      .eq('section_id', sectionId).eq('date', date)
      .maybeSingle();

    ok(res, record ?? null);
  } catch (err) { fail(res, err); }
});

// ─── GET /api/attendance/grid?sectionId=&startDate=&endDate= ─────────────────
attendanceRouter.get('/grid', requireAuth, requireRole('TEACHER', 'PRINCIPAL'), async (req, res) => {
  try {
    const { sectionId, startDate, endDate } = req.query as Record<string, string>;
    if (!sectionId || !startDate || !endDate) {
      throw new ApiError(400, 'sectionId, startDate and endDate required');
    }
    if (req.user.role === 'TEACHER') {
      const allowed = await verifyTeacherSectionAccess(req.user.id, req.user.school_id!, sectionId);
      if (!allowed) throw new ApiError(403, 'You are not assigned to this section');
    }

    const { data: recData, error: recErr } = await adminDb
      .from('attendance_records')
      // marked_by + nested user name surface "kisne mark kiya" in the UI
      // tooltip without an extra round-trip per date.
      .select('id, date, approval_status, is_locked, total_present, total_absent, total_holiday, total_half, total_students, marked_by, marker:marked_by(name)')
      .eq('school_id', req.user.school_id!).eq('section_id', sectionId)
      .gte('date', startDate).lte('date', endDate)
      .order('date', { ascending: true });
    if (recErr) throw new ApiError(500, recErr.message);

    type RecRow = RecordRow & {
      marked_by: string | null;
      marker: { name: string | null } | { name: string | null }[] | null;
    };
    const records = ((recData ?? []) as RecRow[]).map(r => {
      const m = Array.isArray(r.marker) ? r.marker[0] : r.marker;
      return { ...r, marked_by_name: m?.name ?? null };
    });
    if (records.length === 0) { ok(res, { records: [], studentDetails: {} }); return; }

    const recordIds = records.map(r => r.id);
    const { data: detData, error: detErr } = await adminDb
      .from('attendance_student_details')
      .select('attendance_id, student_id, is_present, status')
      .in('attendance_id', recordIds);
    if (detErr) throw new ApiError(500, detErr.message);

    const details = (detData ?? []) as DetailRow[];
    const recById = new Map(records.map(r => [r.id, r]));

    const studentDetails: Record<string, Record<string, { status: AttendanceStatus; isPresent: boolean }>> = {};
    for (const d of details) {
      const rec = recById.get(d.attendance_id);
      if (!rec) continue;
      const { date } = rec;
      if (!studentDetails[date]) studentDetails[date] = {};
      const status: AttendanceStatus = d.status ?? (d.is_present ? 'present' : 'absent');
      studentDetails[date][d.student_id] = { status, isPresent: d.is_present };
    }

    ok(res, { records, studentDetails });
  } catch (err) { fail(res, err); }
});

// ─── GET /api/attendance/export-excel?sectionId=&startDate=&endDate= ─────────
attendanceRouter.get('/export-excel', requireAuth, requireRole('TEACHER', 'PRINCIPAL'), async (req, res) => {
  try {
    const { sectionId, startDate, endDate, className, section: sectionName } = req.query as Record<string, string>;
    if (!sectionId || !startDate || !endDate) {
      throw new ApiError(400, 'sectionId, startDate and endDate required');
    }
    if (req.user.role === 'TEACHER') {
      const allowed = await verifyTeacherSectionAccess(req.user.id, req.user.school_id!, sectionId);
      if (!allowed) throw new ApiError(403, 'You are not assigned to this section');
    }

    const { data: recData, error: recErr } = await adminDb
      .from('attendance_records')
      .select('id, date, approval_status, is_locked')
      .eq('school_id', req.user.school_id!).eq('section_id', sectionId)
      .gte('date', startDate).lte('date', endDate)
      .order('date', { ascending: true });
    if (recErr) throw new ApiError(500, recErr.message);

    const records = (recData ?? []) as Pick<RecordRow, 'id' | 'date' | 'approval_status' | 'is_locked'>[];
    const recordIds = records.map(r => r.id);

    // Skip detail query entirely when there are no records in range.
    let details: DetailRow[] = [];
    if (recordIds.length > 0) {
      const { data: detData } = await adminDb
        .from('attendance_student_details')
        .select('attendance_id, student_id, is_present, status')
        .in('attendance_id', recordIds);
      details = (detData ?? []) as DetailRow[];
    }

    // Resolve academic year from the section itself (not just the active year),
    // so exports work correctly in correction/non-active-year contexts.
    const { data: secYearData } = await adminDb
      .from('sections').select('academic_year_id')
      .eq('id', sectionId).eq('school_id', req.user.school_id!).maybeSingle();
    const yearId = (secYearData as { academic_year_id: string } | null)?.academic_year_id;
    if (!yearId) throw new ApiError(400, 'Section not found or not accessible');

    const { data: stuData, error: stuErr } = await adminDb
      .from('student_academic_records')
      .select('student_id, roll_no, students!inner(name)')
      .eq('section_id', sectionId).eq('academic_year_id', yearId);
    if (stuErr) throw new ApiError(500, stuErr.message);
    const stuRows = (stuData ?? []) as unknown as StuAcRow[];
    const students = stuRows
      .filter(s => s.students)
      .map(s => ({ id: s.student_id, name: s.students!.name, rollNo: s.roll_no ?? '' }))
      .sort((a, b) => {
        const ar = parseInt(a.rollNo, 10); const br = parseInt(b.rollNo, 10);
        if (Number.isFinite(ar) && Number.isFinite(br)) return ar - br;
        return a.name.localeCompare(b.name);
      });

    // Build ALL calendar dates in range so unmarked dates appear as columns.
    // Use 'en-CA' formatter pinned to Asia/Kolkata so the column dates match
    // the school day (was: cur.toISOString() which is UTC and was off-by-one
    // for any IST-evening export).
    const istDateOf = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const allDates: string[] = [];
    const cur = new Date(startDate);
    const last = new Date(endDate);
    while (cur <= last) {
      allDates.push(istDateOf(cur));
      cur.setDate(cur.getDate() + 1);
    }

    const dates = allDates;
    const recByDate = new Map(records.map(r => [r.date, r.id]));

    // Pre-build a reverse map: attendanceId → date for O(1) lookup per detail row.
    const recIdToDate = new Map<string, string>(records.map(r => [r.id, r.date]));

    const detailMap: Record<string, Record<string, AttendanceStatus>> = {};
    for (const d of details) {
      const date = recIdToDate.get(d.attendance_id);
      if (!date) continue;
      if (!detailMap[date]) detailMap[date] = {};
      detailMap[date][d.student_id] = d.status ?? (d.is_present ? 'present' : 'absent');
    }

    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();

    const headerRow = [
      'Roll No', 'Student Name',
      ...dates.map(d => { const dt = new Date(d); return `${dt.getDate()}/${dt.getMonth() + 1}`; }),
      'Total P', 'Total A', 'Total H', 'Total Half', '%',
    ];

    const dataRows = students.map(s => {
      const statuses = dates.map(d => {
        const st = detailMap[d]?.[s.id];
        if (!st) return '-';
        if (st === 'present') return 'P';
        if (st === 'absent')  return 'A';
        if (st === 'holiday') return 'H';
        return 'HD'; // half
      });
      const totalP    = statuses.filter(x => x === 'P').length;
      const totalA    = statuses.filter(x => x === 'A').length;
      const totalH    = statuses.filter(x => x === 'H').length;
      const totalHalf = statuses.filter(x => x === 'HD').length;
      const workDays  = totalP + totalA + totalHalf;
      const pct       = workDays > 0 ? Math.round(((totalP + totalHalf * 0.5) / workDays) * 100) : 0;
      return [s.rollNo, s.name, ...statuses, totalP, totalA, totalH, totalHalf, `${pct}%`];
    });

    const ws = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
    ws['!cols'] = [
      { wch: 8 }, { wch: 24 },
      ...dates.map(() => ({ wch: 5 })),
      { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 6 },
    ];

    const sheetName = `${className ?? 'Class'}-${sectionName ?? 'Sec'}`.slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const label = `Attendance_${className ?? ''}_${sectionName ?? ''}_${startDate}_to_${endDate}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${label}"`);
    res.send(buf);
  } catch (err) { fail(res, err); }
});

// ─── POST /api/attendance/submit — teacher submits attendance ─────────────────
attendanceRouter.post('/submit', requireAuth, requireRole('TEACHER', 'PRINCIPAL'), async (req, res) => {
  try {
    const body = requireBody<{
      sectionId: string; date: string;
      records: { studentId: string; isPresent?: boolean; status?: AttendanceStatus }[];
    }>(req, ['sectionId', 'date', 'records']);
    if (!Array.isArray(body.records) || body.records.length === 0) {
      throw new ApiError(400, 'records array required');
    }

    // Teachers must be assigned to this section before any DB write.
    if (req.user.role === 'TEACHER') {
      const allowed = await verifyTeacherSectionAccess(req.user.id, req.user.school_id!, body.sectionId);
      if (!allowed) throw new ApiError(403, 'You are not assigned to this section');
    }

    const { data: secData } = await adminDb
      .from('sections')
      .select('id, class_name, section, academic_year_id, school_id')
      .eq('id', body.sectionId)
      .eq('school_id', req.user.school_id!)   // tenant isolation
      .single();
    const section = secData as SectionRow | null;
    if (!section) throw new ApiError(404, 'Section not found');

    // Server-side date guards. Client already enforces these but a
    // forged or stale payload could otherwise write a record dated in
    // the future, or outside the section's academic-year window.
    // Pull the AY bounds from the section's AY row.
    const todayIso = new Date().toISOString().slice(0, 10);
    if (body.date > todayIso) {
      throw new ApiError(400, 'Future-dated attendance is not allowed');
    }
    const { data: ayRow } = await adminDb
      .from('academic_years').select('start_date, end_date')
      .eq('id', section.academic_year_id).maybeSingle();
    const ay = ayRow as { start_date: string; end_date: string } | null;
    if (ay) {
      if (body.date < ay.start_date) {
        throw new ApiError(400, `Date ${body.date} is before this section's academic year started (${ay.start_date})`);
      }
      if (body.date > ay.end_date) {
        throw new ApiError(400, `Date ${body.date} is after this section's academic year ended (${ay.end_date})`);
      }
    }

    const { data: existData } = await adminDb
      .from('attendance_records')
      .select('id, is_locked, approval_status, marked_by')
      .eq('school_id', req.user.school_id!)   // tenant isolation
      .eq('section_id', body.sectionId).eq('date', body.date)
      .maybeSingle();
    const existing = existData as (RecordMinRow & { marked_by: string | null }) | null;

    if (existing?.is_locked) {
      throw new ApiError(403, 'Attendance is locked and approved — contact the principal for corrections');
    }
    // Defence-in-depth: even when not locked, a teacher must not silently
    // overwrite a record originally marked by a principal. Only the principal
    // can replace their own record (or use the Editor Mode flow).
    if (existing && req.user.role === 'TEACHER' && existing.marked_by) {
      const { data: priorMarker } = await adminDb
        .from('users').select('role').eq('id', existing.marked_by).maybeSingle();
      if ((priorMarker as { role: string } | null)?.role === 'PRINCIPAL') {
        throw new ApiError(403, 'This record was marked by the principal — ask them to update it');
      }
    }

    const normalizedRecords = body.records.map(r => ({
      studentId: r.studentId,
      status: normalizeStatus(r.status, r.isPresent),
    }));

    // Defence-in-depth: drop students whose admission_date is after the
    // attendance date. They weren't on the roster yet — marking them
    // absent (or present) would distort their percentage and pollute the
    // class register. Client-side already filters; this catches forged or
    // legacy payloads.
    const stuIds = normalizedRecords.map(r => r.studentId);
    let preEnrollment = new Set<string>();
    if (stuIds.length > 0) {
      const { data: admRows } = await adminDb.from('students')
        .select('id, admission_date')
        .eq('school_id', req.user.school_id!).in('id', stuIds);
      const admMap = new Map<string, string | null>();
      for (const r of (admRows ?? []) as Array<{ id: string; admission_date: string | null }>) {
        admMap.set(r.id, r.admission_date);
      }
      preEnrollment = new Set(
        normalizedRecords
          .filter(r => {
            const ad = admMap.get(r.studentId);
            return !!ad && body.date < ad;
          })
          .map(r => r.studentId),
      );
    }
    const filteredRecords = normalizedRecords.filter(r => !preEnrollment.has(r.studentId));
    const counts = countsByStatus(filteredRecords);

    // No more approval workflow. Whoever submits attendance — teacher or
    // principal — auto-approves and locks the record. Per the schools'
    // workflow, the marker is the source of truth; making the principal
    // approve every teacher submission was friction without value (and
    // it's not how attendance is treated in real registers either).
    // Corrections after the fact still require Editor Mode.
    const approvalStatus = 'APPROVED';
    const isLocked       = true;
    const approvedBy     = req.user.id;

    let attendanceId: string;
    if (existing) {
      attendanceId = existing.id;
      await adminDb.from('attendance_records').update({
        total_present:   counts.present,
        total_absent:    counts.absent,
        total_holiday:   counts.holiday,
        total_half:      counts.half,
        total_students:  filteredRecords.length,
        marked_by:       req.user.id,
        approval_status: approvalStatus,
        is_locked:       isLocked,
        approved_by:     approvedBy,
      }).eq('id', attendanceId);
      await adminDb.from('attendance_student_details').delete().eq('attendance_id', attendanceId);
    } else {
      const { data: recData, error: recErr } = await adminDb
        .from('attendance_records').insert({
          school_id:        section.school_id,
          academic_year_id: section.academic_year_id,
          section_id:       body.sectionId,
          class_name:       section.class_name,
          section:          section.section,
          date:             body.date,
          total_present:    counts.present,
          total_absent:     counts.absent,
          total_holiday:    counts.holiday,
          total_half:       counts.half,
          total_students:   filteredRecords.length,
          marked_by:        req.user.id,
          approval_status:  approvalStatus,
          is_locked:        isLocked,
          approved_by:      approvedBy,
        }).select('id').single();
      if (recErr) throw new ApiError(500, recErr.message);
      attendanceId = (recData as Pick<RecordRow, 'id'>).id;
    }

    const rows = filteredRecords.map(r => ({
      attendance_id: attendanceId,
      student_id:    r.studentId,
      is_present:    statusToIsPresent(r.status),
      status:        r.status,
    }));
    if (rows.length > 0) {
      const { error: insErr } = await adminDb.from('attendance_student_details').insert(rows);
      if (insErr) throw new ApiError(500, insErr.message);
    }

    ok(res, { attendanceId, date: body.date, ...counts });
  } catch (err) { fail(res, err); }
});

// ─── POST /api/attendance/mark-by-principal ────────────────────────────────────
attendanceRouter.post('/mark-by-principal', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const body = requireBody<{
      className: string; section: string; date: string;
      records: { studentId: string; isPresent?: boolean; status?: AttendanceStatus }[];
    }>(req, ['className', 'section', 'date', 'records']);
    if (!Array.isArray(body.records) || body.records.length === 0) {
      throw new ApiError(400, 'records array required');
    }

    // Resolve section by class+section across ALL years (not just
    // active) so correction mode for a closed year resolves to the
    // CORRECT historical section, not whatever the active year
    // currently has under that name. We disambiguate by date — pull
    // any section whose AY window covers body.date.
    const { data: candidateSections } = await adminDb
      .from('sections')
      .select('id, academic_year_id, academic_years(start_date, end_date)')
      .eq('school_id', req.user.school_id!)
      .eq('class_name', body.className)
      .eq('section', body.section);
    type Cand = {
      id: string; academic_year_id: string;
      academic_years: { start_date: string; end_date: string } | null;
    };
    const matching = ((candidateSections ?? []) as unknown as Cand[]).find(c =>
      c.academic_years &&
      body.date >= c.academic_years.start_date &&
      body.date <= c.academic_years.end_date,
    );
    if (!matching) {
      throw new ApiError(404, `Section ${body.className}-${body.section} not found for date ${body.date}`);
    }
    const sectionId = matching.id;

    // Future-date guard.
    const todayIso = new Date().toISOString().slice(0, 10);
    if (body.date > todayIso) {
      throw new ApiError(400, 'Future-dated attendance is not allowed');
    }

    const normalizedRecords = body.records.map(r => ({
      studentId: r.studentId,
      status: normalizeStatus(r.status, r.isPresent),
    }));

    // Pre-enrollment guard mirrors /submit — a principal direct-mark on
    // 1-Apr shouldn't put a student admitted on 1-May into the register.
    const stuIds = normalizedRecords.map(r => r.studentId);
    let admMap = new Map<string, string | null>();
    if (stuIds.length > 0) {
      const { data: admRows } = await adminDb.from('students')
        .select('id, admission_date')
        .eq('school_id', req.user.school_id!).in('id', stuIds);
      for (const r of (admRows ?? []) as Array<{ id: string; admission_date: string | null }>) {
        admMap.set(r.id, r.admission_date);
      }
    }
    const filteredRecords = normalizedRecords.filter(r => {
      const ad = admMap.get(r.studentId);
      return !ad || body.date >= ad;
    });
    const counts = countsByStatus(filteredRecords);

    const { data: existData } = await adminDb
      .from('attendance_records')
      .select('id, is_locked')
      .eq('school_id', req.user.school_id!)
      .eq('section_id', sectionId).eq('date', body.date)
      .maybeSingle();
    const existing = existData as Pick<RecordRow, 'id' | 'is_locked'> | null;

    // Guard: already approved+locked records must go through the correction flow.
    if (existing?.is_locked) {
      throw new ApiError(409, 'Attendance for this date is already approved and locked. Use the edit/correction flow.');
    }

    let attendanceId: string;
    // When updating an existing record we must replace its detail rows.
    // Snapshot them first so we can restore on partial failure (avoids
    // leaving the record with totals but zero per-student rows).
    let priorDetails: Array<Record<string, unknown>> = [];
    if (existing) {
      attendanceId = existing.id;
      const { data: snap } = await adminDb.from('attendance_student_details')
        .select('attendance_id, student_id, is_present, status')
        .eq('attendance_id', attendanceId);
      priorDetails = (snap ?? []) as Array<Record<string, unknown>>;

      await adminDb.from('attendance_records').update({
        total_present:   counts.present,
        total_absent:    counts.absent,
        total_holiday:   counts.holiday,
        total_half:      counts.half,
        total_students:  filteredRecords.length,
        marked_by:       req.user.id,
        approved_by:     req.user.id,
        approval_status: 'APPROVED',
        is_locked:       true,
      }).eq('id', attendanceId);
      await adminDb.from('attendance_student_details').delete().eq('attendance_id', attendanceId);
    } else {
      const { data: recData, error: rErr } = await adminDb
        .from('attendance_records').insert({
          school_id:        req.user.school_id,
          academic_year_id: matching.academic_year_id,
          section_id:       sectionId,
          class_name:       body.className,
          section:          body.section,
          date:             body.date,
          total_present:    counts.present,
          total_absent:     counts.absent,
          total_holiday:    counts.holiday,
          total_half:       counts.half,
          total_students:   filteredRecords.length,
          marked_by:        req.user.id,
          approved_by:      req.user.id,
          approval_status:  'APPROVED',
          is_locked:        true,
        }).select('id').single();
      if (rErr) {
        if (/duplicate/i.test(rErr.message)) throw new ApiError(409, 'Attendance already marked for this date');
        throw new ApiError(500, rErr.message);
      }
      attendanceId = (recData as Pick<RecordRow, 'id'>).id;
    }

    const detail = filteredRecords.map(r => ({
      attendance_id: attendanceId,
      student_id:    r.studentId,
      is_present:    statusToIsPresent(r.status),
      status:        r.status,
    }));
    const { error: dErr } = await adminDb.from('attendance_student_details').insert(detail);
    if (dErr) {
      if (!existing) {
        // Brand-new record — drop the orphan parent.
        await adminDb.from('attendance_records').delete().eq('id', attendanceId);
      } else if (priorDetails.length) {
        // Restore the snapshot so the existing record isn't left with totals
        // but no student rows.
        try {
          await adminDb.from('attendance_student_details').insert(priorDetails);
        } catch { /* best-effort restore */ }
      }
      throw new ApiError(500, dErr.message);
    }

    ok(res, { attendanceId, date: body.date, ...counts }, 201);
  } catch (err) { fail(res, err); }
});

// ─── POST /api/attendance/reject ──────────────────────────────────────────────
attendanceRouter.post('/reject', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const { attendanceId, reason } = requireBody<{ attendanceId: string; reason?: string }>(req, ['attendanceId']);

    const { data: recData } = await adminDb.from('attendance_records')
      .select('id, school_id').eq('id', attendanceId).maybeSingle();
    const record = recData as Pick<RecordSchool, 'id' | 'school_id'> | null;
    if (!record) throw new ApiError(404, 'Attendance record not found');
    if (record.school_id !== req.user.school_id) throw new ApiError(403, 'Access denied');

    const { error } = await adminDb.from('attendance_records')
      .update({ approval_status: 'REJECTED', approved_by: req.user.id })
      .eq('id', attendanceId);
    if (error) throw new ApiError(500, error.message);

    await adminDb.from('attendance_approvals').insert({
      attendance_id: attendanceId,
      school_id:     record.school_id,
      action:        'REJECTED',
      performed_by:  req.user.id,
      reason:        reason ?? null,
    });

    ok(res, { attendanceId, rejected: true });
  } catch (err) { fail(res, err); }
});

// ─── POST /api/attendance/update-students ─────────────────────────────────────
// Principal-only: edit per-student rows for an existing record.
// Locked (APPROVED) records may be corrected by the principal only; a reason
// is required for audit purposes. The record stays APPROVED after correction.
attendanceRouter.post('/update-students', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const body = requireBody<{
      attendanceId: string;
      reason?: string;
      // 'patch' = upsert only the listed students; existing student rows
      // not in the payload are left untouched (default — UI sends only the
      // edited rows). 'full' = treat the payload as the complete roster
      // for this attendance and delete any existing student rows that
      // aren't in the payload (used by full-class submit).
      mode?: 'patch' | 'full';
      students: { studentId: string; isPresent?: boolean; status?: AttendanceStatus }[];
    }>(req, ['attendanceId', 'students']);
    const mode: 'patch' | 'full' = body.mode === 'full' ? 'full' : 'patch';

    const { data: ownData } = await adminDb.from('attendance_records')
      .select('id, school_id, is_locked, date')
      .eq('id', body.attendanceId)
      .eq('school_id', req.user.school_id!).maybeSingle();
    const ownRecord = ownData as (Pick<RecordRow, 'id' | 'is_locked'> & { school_id: string; date: string }) | null;
    if (!ownRecord) throw new ApiError(404, 'Attendance record not found');

    // Locked records require an explicit correction reason for audit trail.
    if (ownRecord.is_locked && !body.reason?.trim()) {
      throw new ApiError(400, 'A correction reason is required when editing an approved and locked attendance record');
    }

    const normalizedStudents = body.students.map(s => ({
      studentId: s.studentId,
      status: normalizeStatus(s.status, s.isPresent),
    }));

    // Pre-enrollment guard — same as /submit. Drop students whose
    // admission_date is after the record's date so a correction can't
    // accidentally backfill attendance for someone who hadn't joined yet.
    let filteredStudents = normalizedStudents;

    if (normalizedStudents.length) {
      // Bind every student_id to the attendance record's school. The route
      // uses adminDb (service role), so RLS won't catch a forged payload
      // that references students from another tenant. Reject the whole
      // batch if any studentId doesn't belong to the same school.
      const stuIds = normalizedStudents.map(s => s.studentId);
      const { data: validStu } = await adminDb.from('students')
        .select('id, admission_date')
        .eq('school_id', ownRecord.school_id).in('id', stuIds);
      const validRows = (validStu ?? []) as Array<{ id: string; admission_date: string | null }>;
      const validSet = new Set(validRows.map(r => r.id));
      const stranger = stuIds.find(id => !validSet.has(id));
      if (stranger) {
        throw new ApiError(403, `Student ${stranger} does not belong to this school`);
      }
      const admMap = new Map<string, string | null>();
      for (const r of validRows) admMap.set(r.id, r.admission_date);
      filteredStudents = normalizedStudents.filter(s => {
        const ad = admMap.get(s.studentId);
        return !ad || ownRecord.date >= ad;
      });

      if (filteredStudents.length) {
        const rows = filteredStudents.map(s => ({
          attendance_id: body.attendanceId,
          student_id:    s.studentId,
          is_present:    statusToIsPresent(s.status),
          status:        s.status,
        }));
        const { error: uErr } = await adminDb.from('attendance_student_details')
          .upsert(rows, { onConflict: 'attendance_id,student_id' });
        if (uErr) throw new ApiError(500, uErr.message);
      }
    }

    // In 'full' mode the payload represents the complete class roster; rows
    // not in the payload are pruned. In 'patch' mode (default) we never
    // delete — partial submits used to clobber unchanged students.
    // keepIds uses filteredStudents so any legacy pre-enrollment rows in
    // the DB get cleaned up alongside this update.
    if (mode === 'full') {
      const keepIds = new Set(filteredStudents.map(s => s.studentId));
      const { data: existData } = await adminDb.from('attendance_student_details')
        .select('student_id').eq('attendance_id', body.attendanceId);
      const toDelete = ((existData ?? []) as StuDetailRow[])
        .map(r => r.student_id).filter(sid => !keepIds.has(sid));

      if (toDelete.length) {
        const { error: dErr } = await adminDb.from('attendance_student_details').delete()
          .eq('attendance_id', body.attendanceId).in('student_id', toDelete);
        if (dErr) throw new ApiError(500, dErr.message);
      }
    }

    // Recompute totals from the canonical row set. In patch mode that means
    // re-reading the full set after the upsert; in full mode the filtered
    // payload already represents the complete (post-prune) roster.
    let counts: ReturnType<typeof countsByStatus>;
    let totalStudents: number;
    if (mode === 'patch') {
      const { data: allRows } = await adminDb.from('attendance_student_details')
        .select('student_id, status, is_present')
        .eq('attendance_id', body.attendanceId);
      const merged = ((allRows ?? []) as Array<{ student_id: string; status: AttendanceStatus | null; is_present: boolean | null }>)
        .map(r => ({ studentId: r.student_id, status: normalizeStatus(r.status ?? undefined, r.is_present ?? undefined) }));
      counts = countsByStatus(merged);
      totalStudents = merged.length;
    } else {
      counts = countsByStatus(filteredStudents);
      totalStudents = filteredStudents.length;
    }
    const { error: rErr } = await adminDb.from('attendance_records').update({
      total_present:  counts.present,
      total_absent:   counts.absent,
      total_holiday:  counts.holiday,
      total_half:     counts.half,
      total_students: totalStudents,
    }).eq('id', body.attendanceId);
    if (rErr) throw new ApiError(500, rErr.message);

    // Insert correction audit row when the record was locked.
    if (ownRecord.is_locked) {
      await adminDb.from('attendance_approvals').insert({
        attendance_id: body.attendanceId,
        school_id:     ownRecord.school_id,
        action:        'CORRECTION',
        performed_by:  req.user.id,
        reason:        body.reason ?? null,
      });
    }

    ok(res, { attendanceId: body.attendanceId, ...counts });
  } catch (err) { fail(res, err); }
});

// ─── POST /api/attendance/approve ─────────────────────────────────────────────
attendanceRouter.post('/approve', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const { attendanceId } = requireBody<{ attendanceId: string }>(req, ['attendanceId']);

    const { data: recData } = await adminDb
      .from('attendance_records')
      .select('id, is_locked, school_id')
      .eq('id', attendanceId).maybeSingle();
    const record = recData as RecordSchool | null;
    if (!record) throw new ApiError(404, 'Attendance record not found');
    if (record.school_id !== req.user.school_id) throw new ApiError(403, 'Access denied');
    if (record.is_locked) throw new ApiError(400, 'Already approved and locked');

    // Conditional update: matches only when still unlocked. If two principals
    // click approve simultaneously the second one's update returns 0 rows and
    // we fail loud instead of double-stamping.
    const { data: updated, error } = await adminDb.from('attendance_records')
      .update({ is_locked: true, approval_status: 'APPROVED', approved_by: req.user.id })
      .eq('id', attendanceId)
      .eq('school_id', req.user.school_id!)
      .eq('is_locked', false)
      .select('id');
    if (error) throw new ApiError(500, error.message);
    if (!updated || updated.length === 0) {
      throw new ApiError(409, 'Attendance was just approved by someone else — refresh and verify');
    }

    await adminDb.from('attendance_approvals').insert({
      attendance_id: attendanceId,
      school_id:     record.school_id,
      action:        'APPROVED',
      performed_by:  req.user.id,
    });

    ok(res, { attendanceId, approved: true });
  } catch (err) { fail(res, err); }
});
