-- Anti-spam guard for parent fee submissions.
--
-- Cap: max 3 submissions per parent (submitted_by) per IST calendar day.
-- Enforced via a BEFORE INSERT trigger so it can't be bypassed by direct
-- API calls — the same trigger fires whether the row comes from the app,
-- supabase-js, or psql.
--
-- IST is the relevant calendar boundary because the school operates in
-- India; counting from "today in IST" matches the parent's mental model
-- ("I already tried 3 times today").

CREATE OR REPLACE FUNCTION public.enforce_fee_upload_daily_limit() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_today_ist date;
  v_count     bigint;
BEGIN
  -- Service role and seed scripts (auth.uid() = NULL) bypass — they're
  -- trusted infra paths, not parent traffic.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_today_ist := (now() AT TIME ZONE 'Asia/Kolkata')::date;

  SELECT count(*) INTO v_count
  FROM public.fee_payment_uploads
  WHERE submitted_by = NEW.submitted_by
    AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = v_today_ist;

  IF v_count >= 3 THEN
    RAISE EXCEPTION
      'Daily limit reached — only 3 fee submissions allowed per day. Please contact the school office if you need to submit another.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fee_upload_daily_limit ON public.fee_payment_uploads;
CREATE TRIGGER fee_upload_daily_limit
  BEFORE INSERT ON public.fee_payment_uploads
  FOR EACH ROW EXECUTE FUNCTION public.enforce_fee_upload_daily_limit();
