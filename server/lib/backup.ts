// Per-school backup generator.
//
// Two flavours, both stream a single ZIP to the caller (no Supabase
// storage cost):
//   • QUICK — JSON dump of every school-scoped table. ~3-5 MB.
//             Once per 24 hours per school.
//   • FULL  — QUICK + storage assets (school logo / signatures / QRs,
//             student-documents, staff-documents) bundled as files.
//             Once per 7 days per school.
//
// Service-role queries — no RLS interference, dump is complete
// regardless of caller's role. Daily/weekly rate-limit lives in
// audit_logs (`action = 'school_backup_quick' | 'school_backup_full'`).

import JSZip from 'jszip';
import { adminDb } from './db';
import { ApiError } from './helpers';

const BACKUP_SCHEMA_VERSION = '1.0';

// Storage buckets to mirror in a FULL archive. Path-based filter
// applied per bucket so other schools' files don't leak.
const STORAGE_BUCKETS = {
  schoolAssets:    'school-assets',     // <schoolId>/*
  studentDocs:     'student-documents', // <studentId>/*
  staffDocs:       'staff-documents',   // <staffId>/*
} as const;

const TABLES_BY_SCHOOL = [
  'academic_years', 'sections',
  'students', 'staff',
  'salary_payments', 'staff_attendance',
  'fee_structures', 'fee_installments', 'payment_records', 'fee_write_offs',
  'attendance_records',
  'timetable_periods', 'timetable_entries',
  'transport_vehicles', 'route_stops',
  'homework_assignments', 'notices', 'test_schedules',
  'complaints', 'expenses', 'approvals',
  'assets', 'asset_issues',
  'audit_logs',
  'users',
] as const;

const TABLES_BY_STUDENT = [
  'student_academic_records',
  'student_transport_assignments',
  'exam_results',
  'advance_balances',
  'parent_student_links',
  'student_documents',
  'student_class_movements',
] as const;

const TABLES_BY_PAYMENT = [
  'payment_installment_links',
] as const;

const PAGE = 1000;

// Fetch all rows of a table where `column` matches one or more values.
// Pages through results so a 50k-row table doesn't get clipped at 1k.
// `op` picks `.eq()` for single value or `.in()` for array.
async function pageFetch(
  table: string,
  column: string,
  value: string | string[],
): Promise<{ rows: unknown[]; error?: string }> {
  const accum: unknown[] = [];
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let q = adminDb.from(table).select('*').range(from, from + PAGE - 1);
    q = Array.isArray(value)
      ? (q.in(column, value) as typeof q)
      : (q.eq(column, value) as typeof q);
    const { data, error } = await q;
    if (error) return { rows: accum, error: error.message };
    const chunk = data ?? [];
    accum.push(...chunk);
    if (chunk.length < PAGE) break;
    from += PAGE;
  }
  return { rows: accum };
}

export type BackupKind = 'QUICK' | 'FULL';

export interface BackupResult {
  zipBytes: Buffer;
  filename: string;
  schoolName: string;
  schemaVersion: string;
  counts: Record<string, number>;
  failed: { source: string; error: string }[];
}

export async function generateSchoolBackup(
  schoolId: string,
  kind: BackupKind,
): Promise<BackupResult> {
  // Resolve school + sanitise into filename-safe tokens.
  const { data: schoolRow, error: schoolErr } = await adminDb
    .from('schools')
    .select('id, name, code')
    .eq('id', schoolId)
    .maybeSingle();
  if (schoolErr) throw new ApiError(500, schoolErr.message);
  if (!schoolRow) throw new ApiError(404, 'School not found');
  const school = schoolRow as { id: string; name: string; code: string };

  const counts: Record<string, number> = {};
  const failed: { source: string; error: string }[] = [];
  const data: Record<string, unknown[]> = {};

  data['schools'] = [school];
  counts['schools'] = 1;

  // ─── Pass 1 — school-scoped tables ────────────────────────────────────
  for (const table of TABLES_BY_SCHOOL) {
    const result = await pageFetch(table, 'school_id', schoolId);
    data[table] = result.rows;
    counts[table] = result.rows.length;
    if (result.error) failed.push({ source: `table:${table}`, error: result.error });
  }

  // ─── Pass 2 — student-scoped tables ───────────────────────────────────
  const studentRows = (data['students'] ?? []) as Array<{ id: string }>;
  const studentIds  = studentRows.map(s => s.id);
  for (const table of TABLES_BY_STUDENT) {
    if (studentIds.length === 0) {
      data[table] = [];
      counts[table] = 0;
      continue;
    }
    const accum: unknown[] = [];
    const ID_BATCH = 500;
    let tableErr: string | null = null;
    for (let i = 0; i < studentIds.length; i += ID_BATCH) {
      const batch = studentIds.slice(i, i + ID_BATCH);
      const result = await pageFetch(table, 'student_id', batch);
      if (result.error) { tableErr = result.error; break; }
      accum.push(...result.rows);
    }
    data[table] = accum;
    counts[table] = accum.length;
    if (tableErr) failed.push({ source: `table:${table}`, error: tableErr });
  }

  // ─── Pass 3 — payment-junction tables ────────────────────────────────
  const paymentRows = (data['payment_records'] ?? []) as Array<{ id: string }>;
  const paymentIds  = paymentRows.map(p => p.id);
  for (const table of TABLES_BY_PAYMENT) {
    if (paymentIds.length === 0) {
      data[table] = [];
      counts[table] = 0;
      continue;
    }
    const accum: unknown[] = [];
    const ID_BATCH = 500;
    let tableErr: string | null = null;
    for (let i = 0; i < paymentIds.length; i += ID_BATCH) {
      const batch = paymentIds.slice(i, i + ID_BATCH);
      const result = await pageFetch(table, 'payment_id', batch);
      if (result.error) { tableErr = result.error; break; }
      accum.push(...result.rows);
    }
    data[table] = accum;
    counts[table] = accum.length;
    if (tableErr) failed.push({ source: `table:${table}`, error: tableErr });
  }

  // ─── Build the ZIP ─────────────────────────────────────────────────────
  const zip = new JSZip();
  const meta = {
    schoolId:        school.id,
    schoolName:      school.name,
    schoolCode:      school.code,
    backupKind:      kind,
    schemaVersion:   BACKUP_SCHEMA_VERSION,
    exportedAt:      new Date().toISOString(),
    counts,
    failedTables:    failed.filter(f => f.source.startsWith('table:')),
  };

  // README — the first thing a school staff member would open.
  zip.file('README.txt', readmeText(kind, school.name, meta));
  zip.file('_meta.json', JSON.stringify(meta, null, 2));
  zip.file('data.json', JSON.stringify({ schoolId: school.id, exportedAt: meta.exportedAt, data }, null, 2));

  // FULL backup — also bundle storage assets.
  if (kind === 'FULL') {
    await dumpBucket(zip, STORAGE_BUCKETS.schoolAssets, school.id, 'assets/school', failed);
    if (studentIds.length) {
      await dumpStudentBuckets(zip, studentIds, failed);
    }
    const staffRows = (data['staff'] ?? []) as Array<{ id: string }>;
    if (staffRows.length) {
      await dumpStaffBuckets(zip, staffRows.map(s => s.id), failed);
    }
  }

  // Re-write _meta with full failed list (now includes asset failures).
  zip.file('_meta.json', JSON.stringify({ ...meta, failed }, null, 2));

  const zipBytes = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const safeCode = (school.code || school.id).replace(/[^A-Za-z0-9_-]/g, '');
  const stamp    = new Date().toISOString().slice(0, 10);
  const filename = `school-${safeCode}-${kind.toLowerCase()}-${stamp}.zip`;

  return {
    zipBytes,
    filename,
    schoolName: school.name,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    counts,
    failed,
  };
}

// ─── Storage dumps ──────────────────────────────────────────────────────────

async function dumpBucket(
  zip: JSZip, bucket: string, prefix: string,
  zipFolder: string,
  failed: { source: string; error: string }[],
): Promise<void> {
  // Recursively list everything under <prefix>/. Supabase's list() is
  // shallow per call, so we BFS through subfolders.
  const queue: string[] = [prefix];
  while (queue.length > 0) {
    const folder = queue.shift()!;
    const { data: entries, error } = await adminDb.storage.from(bucket).list(folder, { limit: 1000 });
    if (error) {
      failed.push({ source: `bucket:${bucket}/${folder}`, error: error.message });
      continue;
    }
    for (const e of (entries ?? [])) {
      // Folders have no `id`. Files always have one.
      const isFolder = !e.id;
      const path = `${folder}/${e.name}`;
      if (isFolder) { queue.push(path); continue; }
      const { data: blob, error: dlErr } = await adminDb.storage.from(bucket).download(path);
      if (dlErr || !blob) {
        failed.push({ source: `file:${bucket}/${path}`, error: dlErr?.message ?? 'download returned null' });
        continue;
      }
      const buf = Buffer.from(await blob.arrayBuffer());
      zip.folder(zipFolder)!.file(e.name, buf);
    }
  }
}

async function dumpStudentBuckets(
  zip: JSZip, studentIds: string[],
  failed: { source: string; error: string }[],
): Promise<void> {
  // Each student's docs live under <studentId>/. Iterate sequentially
  // so one slow student doesn't stall the whole backup behind a
  // Promise.all timeout, and so we can recover from partial failures.
  for (const id of studentIds) {
    await dumpBucket(zip, STORAGE_BUCKETS.studentDocs, id, `assets/students/${id}`, failed);
  }
}

async function dumpStaffBuckets(
  zip: JSZip, staffIds: string[],
  failed: { source: string; error: string }[],
): Promise<void> {
  for (const id of staffIds) {
    await dumpBucket(zip, STORAGE_BUCKETS.staffDocs, id, `assets/staff/${id}`, failed);
  }
}

// ─── README ─────────────────────────────────────────────────────────────────

function readmeText(kind: BackupKind, schoolName: string, meta: object): string {
  return `EduGrow School Backup
======================

School:        ${schoolName}
Backup type:   ${kind === 'QUICK' ? 'Quick (JSON only)' : 'Full Archive (JSON + photos + documents)'}
Generated at:  ${(meta as any).exportedAt}
Schema:        ${BACKUP_SCHEMA_VERSION}

Yeh ZIP me kya hai / What's in this ZIP
---------------------------------------
README.txt   - this file
_meta.json   - backup metadata, table row counts, any failed items
data.json    - all school records (students, staff, payments, fees,
               attendance, results, notices, audit logs, etc.) as JSON
${kind === 'FULL' ? `assets/      - school logo, signatures, payment QR
                staff documents, student documents` : ''}

Kaise padhein / How to read it
------------------------------
data.json me har table ka data hai. JSON file ko text editor me
khol sakte hain ya online tool (jsonlint.com) se Excel ke CSV
me convert kar sakte hain.

Photos / files (FULL backup only) sub-folders me hain:
- assets/school/         → school's logo, signature, QR code
- assets/students/<id>/  → us student ke documents
- assets/staff/<id>/     → us staff member ke documents

Important
---------
- Yeh backup taken AT ${(meta as any).exportedAt}. Iske baad
  add hua data is file me NAHI hai.
- Login passwords backup me nahi hain (security ke liye).
  Schools agar app band ho jaye, naye system me log in
  fresh banane padenge.
- Restore karna ho to platform admin se contact karein.

— EduGrow
`;
}

// ─── Rate limits ────────────────────────────────────────────────────────────

function actionForKind(kind: BackupKind): string {
  return kind === 'QUICK' ? 'school_backup_quick' : 'school_backup_full';
}

function windowMsForKind(kind: BackupKind): number {
  return kind === 'QUICK' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
}

export async function assertBackupAllowed(schoolId: string, kind: BackupKind): Promise<void> {
  const since = new Date(Date.now() - windowMsForKind(kind)).toISOString();
  const { data, error } = await adminDb
    .from('audit_logs')
    .select('id, created_at')
    .eq('action', actionForKind(kind))
    .eq('entity_id', schoolId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw new ApiError(500, error.message);
  const last = (data ?? [])[0] as { created_at: string } | undefined;
  if (!last) return;
  const nextAt = new Date(new Date(last.created_at).getTime() + windowMsForKind(kind));
  const waitMs = nextAt.getTime() - Date.now();
  const waitH  = Math.ceil(waitMs / (60 * 60 * 1000));
  const human  = kind === 'QUICK'
    ? `~${waitH} hour${waitH === 1 ? '' : 's'}`
    : `~${Math.ceil(waitH / 24)} day${waitH > 24 ? 's' : ''}`;
  throw new ApiError(429,
    `${kind === 'QUICK' ? 'Quick' : 'Full'} backup limit reached — only one per ${kind === 'QUICK' ? '24 hours' : '7 days'} per school. Next available in ${human}.`);
}

export async function logBackupSuccess(
  schoolId: string, userId: string, kind: BackupKind, byteSize: number,
): Promise<void> {
  await adminDb.from('audit_logs').insert({
    user_id:     userId,
    school_id:   schoolId,
    action:      actionForKind(kind),
    entity_type: 'school',
    entity_id:   schoolId,
    details:     { byteSize, schemaVersion: BACKUP_SCHEMA_VERSION, kind },
  });
}
