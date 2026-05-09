-- 0088_export_logs.sql
--
-- Audit + rate-limit infrastructure for the principal's Reports panel.
--
-- Why a dedicated table (and not just audit_logs)?
--   • Reports get pulled often (daily/weekly cadence), so the volume
--     would dilute the audit_logs table used for sensitive actions.
--   • The rate-limit RPC counts rows in a tight window per user — a
--     tightly-indexed dedicated table makes that O(small) regardless of
--     how big the audit log gets.
--
-- Rate-limit policy enforced server-side:
--   • 50 exports per user per rolling 1-hour window
--   • 100 exports per user per rolling 24-hour window
--
-- Idempotent: CREATE … IF NOT EXISTS / CREATE OR REPLACE throughout.

BEGIN;

CREATE TABLE IF NOT EXISTS public.export_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.users(id)   ON DELETE CASCADE,
  school_id    UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  report_type  TEXT NOT NULL,
  filters_json JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The rate-limit RPC reads (user_id, created_at DESC). The school
-- analytics view reads (school_id, created_at DESC) for activity
-- summaries. Two narrow indexes keep both reads fast.
CREATE INDEX IF NOT EXISTS export_logs_user_created_idx
  ON public.export_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS export_logs_school_created_idx
  ON public.export_logs (school_id, created_at DESC);

ALTER TABLE public.export_logs ENABLE ROW LEVEL SECURITY;

-- Principals + super-admins read their own school's export history;
-- the table is otherwise inaccessible to clients (writes go through
-- the SECURITY DEFINER RPC below, never via direct insert).
DROP POLICY IF EXISTS export_logs_select ON public.export_logs;
CREATE POLICY export_logs_select ON public.export_logs FOR SELECT
USING (
  public.is_super_admin()
  OR (public.is_principal() AND school_id = public.current_user_school_id())
);

-- log_export(p_report_type, p_filters)
--   • Verifies caller is authenticated and tied to a school.
--   • Counts the caller's exports in the last 1h and 24h.
--   • Raises 'rate_limited_hour' / 'rate_limited_day' on overshoot.
--   • Else inserts a fresh row stamped with the caller's user_id +
--     school_id and returns the new row id.
--
-- The client should call this BEFORE generating the CSV — surfacing the
-- friendly Hindi/English error in a toast instead of letting the user
-- watch a long query run only to be told "limit reached" at the end.
CREATE OR REPLACE FUNCTION public.log_export(
  p_report_type TEXT,
  p_filters     JSONB DEFAULT '{}'::jsonb
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller    UUID := auth.uid();
  v_school_id UUID;
  v_hour_cnt  INT;
  v_day_cnt   INT;
  v_id        UUID;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF p_report_type IS NULL OR length(trim(p_report_type)) = 0 THEN
    RAISE EXCEPTION 'report_type_required' USING ERRCODE = '22023';
  END IF;

  SELECT school_id INTO v_school_id FROM public.users WHERE id = v_caller;
  IF v_school_id IS NULL THEN
    RAISE EXCEPTION 'no_school_in_session' USING ERRCODE = '22023';
  END IF;

  -- Per-user rolling window counts. The narrow user_created_idx makes
  -- both lookups O(small) even when the table grows into the millions.
  SELECT count(*) INTO v_hour_cnt
    FROM public.export_logs
   WHERE user_id = v_caller
     AND created_at > NOW() - INTERVAL '1 hour';
  IF v_hour_cnt >= 50 THEN
    RAISE EXCEPTION 'rate_limited_hour'
      USING ERRCODE = 'too_many_connections',
            HINT = '50 exports/hour limit reached. Try after some time.';
  END IF;

  SELECT count(*) INTO v_day_cnt
    FROM public.export_logs
   WHERE user_id = v_caller
     AND created_at > NOW() - INTERVAL '24 hours';
  IF v_day_cnt >= 100 THEN
    RAISE EXCEPTION 'rate_limited_day'
      USING ERRCODE = 'too_many_connections',
            HINT = '100 exports/day limit reached. Try tomorrow.';
  END IF;

  INSERT INTO public.export_logs (user_id, school_id, report_type, filters_json)
  VALUES (v_caller, v_school_id, trim(p_report_type), COALESCE(p_filters, '{}'::jsonb))
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION public.log_export(TEXT, JSONB) TO authenticated;

COMMIT;
