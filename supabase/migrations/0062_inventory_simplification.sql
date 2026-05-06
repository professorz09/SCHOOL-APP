-- 0062_inventory_simplification.sql
--
-- Aligns the assets schema with the new flat-inventory model.
--
--   • Drops the asset_issues table — student-loan tracking is gone. The new
--     UI treats assets as a school-wide register; per-student check-out is
--     no longer surfaced anywhere. Existing rows are preserved as a JSON
--     archive on each asset's `details` column so historical loans aren't
--     lost (auditors can still inspect them via the column).
--
--   • Drops the issue_asset / return_asset RPCs that fed asset_issues.
--
--   • Adds a CHECK ensuring `details` is a JSON object (so the new schema —
--     details.description / details.note / details.addedOn — is at least
--     structurally valid).
--
--   • Backfills `details.addedOn` from `created_at::date` for legacy rows
--     so the new timeline view groups them on a real date instead of NULL.
--
--   • Backfills `details.description` from any legacy author/subject combo
--     so the inventory list reads cleanly even before the principal edits
--     each item.
--
-- Idempotent: drops are IF EXISTS; backfills only touch rows where the new
-- fields are absent. Re-running is safe.

BEGIN;

-- ─── 1. Archive asset_issues rows onto each asset, then drop the table ──
-- The archive lives in details.legacy_loans (jsonb array) so the row count
-- stays bounded by the asset itself. If asset_issues was empty (clean
-- environment), this no-ops.
DO $archive$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'asset_issues') THEN
    UPDATE public.assets a
       SET details = COALESCE(a.details, '{}'::jsonb) || jsonb_build_object(
             'legacy_loans',
             (SELECT jsonb_agg(jsonb_build_object(
                       'id',            i.id,
                       'student_id',    i.student_id,
                       'borrower_name', i.borrower_name,
                       'issued_at',     i.issued_at,
                       'due_date',      i.due_date,
                       'returned_at',   i.returned_at,
                       'created_at',    i.created_at
                     ) ORDER BY i.created_at DESC)
                FROM public.asset_issues i
               WHERE i.asset_id = a.id)
           )
     WHERE EXISTS (SELECT 1 FROM public.asset_issues i WHERE i.asset_id = a.id);
  END IF;
END
$archive$;

-- Drop dependent RPCs first; they reference asset_issues directly.
DROP FUNCTION IF EXISTS public.issue_asset(UUID, UUID, TEXT, INT);
DROP FUNCTION IF EXISTS public.issue_asset(UUID, UUID, TEXT, INT, TEXT);
DROP FUNCTION IF EXISTS public.return_asset(UUID, UUID);
DROP FUNCTION IF EXISTS public.return_asset(UUID, UUID, TEXT);

DROP TABLE IF EXISTS public.asset_issues CASCADE;

-- ─── 2. Reset available_count to total_count ───────────────────────────
-- Loan tracking is gone; available was only ever decremented by an issue.
-- Sync them so any read that still uses available_count sees real stock.
UPDATE public.assets
   SET available_count = total_count
 WHERE available_count <> total_count;

-- ─── 3. Backfill details.addedOn / details.description for legacy rows ─
-- Skip rows that already carry the new keys (idempotent).
UPDATE public.assets
   SET details = COALESCE(details, '{}'::jsonb)
                 || jsonb_build_object('addedOn', to_char(created_at, 'YYYY-MM-DD'))
 WHERE details IS NULL
    OR NOT (details ? 'addedOn');

UPDATE public.assets
   SET details = details || jsonb_build_object(
         'description',
         trim(BOTH ' · ' FROM concat_ws(
           ' · ',
           NULLIF(details->>'author', ''),
           NULLIF(details->>'subject', ''),
           NULLIF(details->>'isbn', '')
         ))
       )
 WHERE category = 'BOOK'
   AND NOT (details ? 'description');

UPDATE public.assets
   SET details = details || jsonb_build_object(
         'description',
         trim(BOTH ' · ' FROM concat_ws(
           ' · ',
           NULLIF(details->>'labType', ''),
           CASE WHEN (details->>'lastServiced') IS NOT NULL
                THEN 'serviced ' || (details->>'lastServiced')
                ELSE NULL END
         ))
       )
 WHERE category = 'LAB_EQUIPMENT'
   AND NOT (details ? 'description');

-- ─── 4. Validate details shape ────────────────────────────────────────
-- A jsonb object (not an array, not a scalar) so the app code's
-- `details?.description` style access never blows up. Drop and re-add to
-- stay idempotent across reruns.
ALTER TABLE public.assets DROP CONSTRAINT IF EXISTS assets_details_object_chk;
ALTER TABLE public.assets ADD CONSTRAINT assets_details_object_chk
  CHECK (jsonb_typeof(details) = 'object');

COMMIT;
