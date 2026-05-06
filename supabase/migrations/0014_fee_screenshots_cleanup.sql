-- 0014_fee_screenshots_cleanup.sql
-- Storage hygiene for the private `fee-screenshots` bucket.
--
-- Two complementary mechanisms keep the bucket from growing forever:
--
--   A) AFTER-DELETE trigger on fee_payment_uploads — whenever an upload
--      row goes away (any reason: principal action, school cascade,
--      manual SQL, scheduled purge below) we also drop the matching
--      storage.objects row. The Supabase storage worker handles eventual
--      removal of the underlying object bytes.
--
--   B) Two SECURITY DEFINER RPCs that the cron-style cleanup script
--      (scripts/cleanup-fee-screenshots.ts) calls with the service-role
--      key:
--
--        * list_purgeable_fee_screenshots(rejected_after_days)
--            – returns rows eligible for purge:
--                · status = 'REJECTED' and reviewed_at older than the
--                  threshold (default 90 days), OR
--                · created_at falls inside an academic_year for the
--                  same school where is_closed = TRUE.
--
--        * delete_fee_payment_uploads(ids[])
--            – deletes the listed upload rows. Trigger A) fires for
--              each, dropping the storage.objects metadata. The script
--              has already removed the underlying files via the storage
--              API before calling this, so the trigger is a no-op /
--              safety net.
--
-- Both RPCs are restricted to the service role — the public-facing
-- frontend never needs them.
-- ---------------------------------------------------------------------------

-- A) Cascade trigger ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fee_payment_upload_after_delete()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.screenshot_url IS NOT NULL AND length(OLD.screenshot_url) > 0 THEN
    DELETE FROM storage.objects
     WHERE bucket_id = 'fee-screenshots'
       AND name = OLD.screenshot_url;
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS fee_payment_uploads_cleanup_storage
  ON public.fee_payment_uploads;
CREATE TRIGGER fee_payment_uploads_cleanup_storage
AFTER DELETE ON public.fee_payment_uploads
FOR EACH ROW EXECUTE FUNCTION public.fee_payment_upload_after_delete();


-- B1) list_purgeable_fee_screenshots ----------------------------------------
CREATE OR REPLACE FUNCTION public.list_purgeable_fee_screenshots(
  p_rejected_after_days INT DEFAULT 90
) RETURNS TABLE (
  id              UUID,
  school_id       UUID,
  screenshot_url  TEXT,
  status          TEXT,
  created_at      TIMESTAMPTZ,
  reviewed_at     TIMESTAMPTZ,
  reason          TEXT
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH cutoff AS (
    SELECT NOW() - (GREATEST(p_rejected_after_days, 0) || ' days')::INTERVAL AS ts
  )
  SELECT fpu.id,
         fpu.school_id,
         fpu.screenshot_url,
         fpu.status,
         fpu.created_at,
         fpu.reviewed_at,
         CASE
           WHEN fpu.status = 'REJECTED'
                AND fpu.reviewed_at IS NOT NULL
                AND fpu.reviewed_at < (SELECT ts FROM cutoff)
             THEN 'rejected_old'
           ELSE 'closed_academic_year'
         END AS reason
    FROM public.fee_payment_uploads fpu
   WHERE (
           fpu.status = 'REJECTED'
           AND fpu.reviewed_at IS NOT NULL
           AND fpu.reviewed_at < (SELECT ts FROM cutoff)
         )
      OR EXISTS (
           SELECT 1
             FROM public.academic_years ay
            WHERE ay.school_id = fpu.school_id
              AND ay.is_closed = TRUE
              AND fpu.created_at::date BETWEEN ay.start_date AND ay.end_date
         )
   ORDER BY fpu.created_at ASC;
$$;

REVOKE EXECUTE ON FUNCTION public.list_purgeable_fee_screenshots(INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.list_purgeable_fee_screenshots(INT) TO service_role;


-- B2) delete_fee_payment_uploads --------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_fee_payment_uploads(
  p_ids UUID[]
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_deleted INT;
BEGIN
  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  WITH del AS (
    DELETE FROM public.fee_payment_uploads
     WHERE id = ANY(p_ids)
    RETURNING id
  )
  SELECT count(*)::INT INTO v_deleted FROM del;

  RETURN COALESCE(v_deleted, 0);
END $$;

REVOKE EXECUTE ON FUNCTION public.delete_fee_payment_uploads(UUID[]) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.delete_fee_payment_uploads(UUID[]) TO service_role;
