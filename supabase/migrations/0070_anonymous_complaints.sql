-- Anonymous complaints with a per-student weekly cap.
--
-- Adds `is_anonymous` to the existing complaints table so a student can
-- file a sensitive complaint (bullying, harassment) without exposing their
-- identity to the principal. Identity columns (from_user_id, from_name,
-- student_id) stay populated server-side so the abuse-prevention triggers
-- and audit log can still see who filed; the principal UI is what hides
-- those fields when is_anonymous is true.
--
-- Cap: 1 anonymous complaint per student per rolling 7 days. This is on
-- top of the existing daily 3-complaint cap from migration 0056. We keep
-- it as a row-level trigger so the limit is enforced server-side regardless
-- of what the client sends.

ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS is_anonymous boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_complaints_anon_student_created
  ON public.complaints (student_id, created_at)
  WHERE is_anonymous = true;

CREATE OR REPLACE FUNCTION public.enforce_anonymous_complaint_weekly_cap()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  recent_count integer;
BEGIN
  IF NEW.is_anonymous IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  -- student_id may be null for parent-filed rows; in that case fall back
  -- to from_user_id so the cap still applies per-account.
  SELECT COUNT(*) INTO recent_count
  FROM public.complaints
  WHERE is_anonymous = true
    AND created_at >= (now() - interval '7 days')
    AND (
      (NEW.student_id IS NOT NULL AND student_id = NEW.student_id)
      OR (NEW.student_id IS NULL AND from_user_id = NEW.from_user_id)
    );

  IF recent_count >= 1 THEN
    RAISE EXCEPTION 'Anonymous complaint limit reached: only 1 per 7 days'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_anonymous_complaint_weekly_cap ON public.complaints;
CREATE TRIGGER trg_anonymous_complaint_weekly_cap
  BEFORE INSERT ON public.complaints
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_anonymous_complaint_weekly_cap();
