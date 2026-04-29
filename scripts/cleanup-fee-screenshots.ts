// scripts/cleanup-fee-screenshots.ts
//
// Cron-style cleanup for the private `fee-screenshots` Supabase Storage
// bucket. Without this the bucket grows forever — every parent submission
// stays around even after the upload has been rejected or the academic
// year it belongs to has been closed.
//
// What it removes:
//   1. fee_payment_uploads rows whose status = 'REJECTED' and were
//      reviewed more than --rejected-after-days days ago (default 90).
//   2. fee_payment_uploads rows whose created_at falls inside an
//      academic_year that is marked is_closed = TRUE for the same school.
//
// For every matching row we:
//   a. Remove the underlying file from the `fee-screenshots` bucket
//      via the Storage API (this also deletes the storage.objects row).
//   b. Delete the fee_payment_uploads row itself. The AFTER-DELETE
//      trigger added in migration 0014 fires as a safety net but is a
//      no-op because step (a) has already cleaned the metadata.
//
// Usage:
//   tsx scripts/cleanup-fee-screenshots.ts                  # default 90 day cutoff
//   tsx scripts/cleanup-fee-screenshots.ts --days 30        # custom cutoff
//   tsx scripts/cleanup-fee-screenshots.ts --dry-run        # report only
//
// Environment: requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (loaded
// by scripts/supabase-admin.ts via dotenv).
//
// Schedule it from any host cron / Replit scheduled deployment / GitHub
// Action — e.g. once per day:
//   0 3 * * *  cd /app && tsx scripts/cleanup-fee-screenshots.ts >> /var/log/fee-cleanup.log 2>&1

import { adminClient } from './supabase-admin';

const FEE_SCREENSHOTS_BUCKET = 'fee-screenshots';
const STORAGE_BATCH = 100; // Supabase storage.remove() comfortably handles ~100/req.

type PurgeRow = {
  id: string;
  school_id: string;
  screenshot_url: string | null;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  reason: 'rejected_old' | 'closed_academic_year';
};

interface Args {
  rejectedAfterDays: number;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { rejectedAfterDays: 90, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run' || a === '-n') {
      out.dryRun = true;
    } else if (a === '--days' || a === '--rejected-after-days') {
      const v = Number(argv[++i]);
      if (!Number.isFinite(v) || v < 0) {
        throw new Error(`Invalid --days value: ${argv[i]}`);
      }
      out.rejectedAfterDays = Math.floor(v);
    } else if (a === '--help' || a === '-h') {
      console.log(
        'Usage: tsx scripts/cleanup-fee-screenshots.ts [--days N] [--dry-run]',
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown arg: ${a}`);
    }
  }
  return out;
}

function chunk<T>(arr: T[], size: number): T[][] {
  if (size <= 0) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const startedAt = Date.now();

  console.log(
    `[fee-cleanup] start  dry_run=${args.dryRun}  rejected_after_days=${args.rejectedAfterDays}`,
  );

  // 1. Discover candidates.
  const { data, error } = await adminClient.rpc('list_purgeable_fee_screenshots', {
    p_rejected_after_days: args.rejectedAfterDays,
  });
  if (error) {
    console.error('[fee-cleanup] list RPC failed:', error.message);
    process.exit(1);
  }
  const rows: PurgeRow[] = (data ?? []) as PurgeRow[];

  // Per-reason tally is helpful for ops dashboards.
  const tally = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.reason] = (acc[r.reason] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    `[fee-cleanup] found ${rows.length} candidates`,
    Object.keys(tally).length ? tally : '',
  );

  if (rows.length === 0) {
    console.log('[fee-cleanup] nothing to do');
    return;
  }

  if (args.dryRun) {
    for (const r of rows.slice(0, 10)) {
      console.log(
        `[fee-cleanup] would purge id=${r.id} school=${r.school_id} reason=${r.reason} path=${r.screenshot_url ?? '∅'}`,
      );
    }
    if (rows.length > 10) console.log(`[fee-cleanup] (… ${rows.length - 10} more)`);
    return;
  }

  // 2. Remove storage objects in batches. We track which paths failed so
  //    we can leave their corresponding DB rows intact for the next run
  //    to retry — deleting the row would orphan the file in S3 forever.
  const paths = rows
    .map(r => r.screenshot_url)
    .filter((p): p is string => typeof p === 'string' && p.length > 0);

  const failedPaths = new Set<string>();
  let storageRemoved = 0;
  for (const batch of chunk(paths, STORAGE_BATCH)) {
    const { data: removed, error: rmErr } = await adminClient.storage
      .from(FEE_SCREENSHOTS_BUCKET)
      .remove(batch);
    if (rmErr) {
      // Mark every path in the batch as failed so we retry them next
      // time. Supabase's storage.remove() is all-or-nothing per call,
      // so we can't partially attribute success here.
      for (const p of batch) failedPaths.add(p);
      console.warn(`[fee-cleanup] storage.remove batch failed: ${rmErr.message}`);
      continue;
    }
    storageRemoved += removed?.length ?? 0;
  }
  console.log(
    `[fee-cleanup] storage objects removed=${storageRemoved} failed=${failedPaths.size} (of ${paths.length} paths)`,
  );

  // 3. Delete only the rows whose storage object was removed (or that
  //    had no path to begin with). Rows whose storage delete failed are
  //    intentionally left behind so the next cron tick retries them.
  const idsToDelete = rows
    .filter(r => !r.screenshot_url || !failedPaths.has(r.screenshot_url))
    .map(r => r.id);
  const idsSkipped = rows.length - idsToDelete.length;

  let rowsDeleted = 0;
  for (const batch of chunk(idsToDelete, STORAGE_BATCH)) {
    const { data: count, error: delErr } = await adminClient.rpc(
      'delete_fee_payment_uploads',
      { p_ids: batch },
    );
    if (delErr) {
      console.error(`[fee-cleanup] delete RPC batch failed: ${delErr.message}`);
      process.exit(1);
    }
    rowsDeleted += Number(count ?? 0);
  }

  const elapsedMs = Date.now() - startedAt;
  // storage_failed > 0 is the alert-worthy signal: it means the bucket
  // didn't actually shrink for those paths and they'll be retried next
  // run. Surface it prominently in the final log line.
  console.log(
    `[fee-cleanup] done rows_deleted=${rowsDeleted} rows_skipped_for_retry=${idsSkipped} storage_removed=${storageRemoved} storage_failed=${failedPaths.size} elapsed_ms=${elapsedMs}`,
  );
}

main().catch(err => {
  console.error('[fee-cleanup] fatal:', err);
  process.exit(1);
});
