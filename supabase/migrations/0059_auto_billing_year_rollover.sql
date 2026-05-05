-- Auto-rollover for school billing years.
--
-- Until now the super-admin had to manually click "Create next year" on
-- every school. This RPC walks every active school and ensures its latest
-- billing year covers today's date — creating successive years (carrying
-- forward arrears or advance credit) until the latest one is current.
--
-- Idempotent: re-running on a school whose latest year is already current
-- is a no-op. Called by the super-admin dashboard on every billing fetch,
-- so the rollover happens lazily without needing a cron job.

CREATE OR REPLACE FUNCTION public.ensure_billing_years_up_to_date()
RETURNS TABLE (school_id uuid, created_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school   record;
  v_latest   record;
  v_new_id   uuid;
  v_count    int;
  v_loop     int;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  FOR v_school IN
    SELECT s.school_id
      FROM public.school_billing_schedules s
      JOIN public.schools sc ON sc.id = s.school_id
     WHERE sc.is_deleted = false
  LOOP
    v_count := 0;
    -- Cap the loop at 5 iterations as a safety net — a real school will
    -- only ever be 1-2 years behind. Anything more means the schedule was
    -- paused or there's data corruption; either way we'd rather log and
    -- bail than burn cycles.
    FOR v_loop IN 1..5 LOOP
      SELECT * INTO v_latest
        FROM public.school_billing_years
       WHERE school_id = v_school.school_id
       ORDER BY start_date DESC LIMIT 1;

      EXIT WHEN v_latest IS NULL;                  -- no schedule yet — skip.
      EXIT WHEN v_latest.end_date >= CURRENT_DATE; -- already current.

      v_new_id := public.create_next_billing_year(v_school.school_id);
      v_count := v_count + 1;
    END LOOP;

    school_id := v_school.school_id;
    created_count := v_count;
    RETURN NEXT;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_billing_years_up_to_date() TO authenticated;
