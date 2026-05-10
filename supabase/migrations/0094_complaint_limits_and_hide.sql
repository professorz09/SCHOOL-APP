-- 0094_complaint_limits_and_hide.sql
--
-- Three product changes on the complaints flow:
--
-- 1. Anonymous-complaint cap: 1 per 7 days → 1 per 30 days. Anonymous filings
--    are sensitive (bullying, harassment); a tighter cap prevents the channel
--    from being used for routine grievances while still leaving room for a
--    student to escalate a long-running issue.
--
-- 2. Normal-complaint cap: 3/day (unchanged) PLUS a new 7/rolling-week ceiling.
--    Daily-only let a parent fire 21 complaints in a week; the combined cap
--    keeps the daily ceiling but blocks sustained abuse.
--
-- 3. New column `hidden_from_submitter` — student / parent can flip this on
--    their own complaints so they don't show up in their personal "my
--    complaints" list anymore. Used for the privacy-on-shared-device case
--    (student filed an anonymous bullying complaint; doesn't want a parent
--    glancing at the device to see it). Audit row stays intact, principal
--    still sees it as before.

ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS hidden_from_submitter BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_complaints_visible_to_submitter
  ON public.complaints (from_user_id, hidden_from_submitter)
  WHERE hidden_from_submitter = false;

-- ─── Trigger 1: normal complaint cap (2/day + 7/week) ────────────────────
CREATE OR REPLACE FUNCTION public.enforce_complaint_daily_limit() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_today_ist date;
  v_count_day  bigint;
  v_count_week bigint;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  -- Anonymous rows are governed by a separate trigger below; skip here so
  -- the limits don't double-count.
  IF NEW.is_anonymous IS TRUE THEN
    RETURN NEW;
  END IF;

  v_today_ist := (now() AT TIME ZONE 'Asia/Kolkata')::date;

  IF NEW.student_id IS NOT NULL THEN
    -- Parent / student complaint: cap per (submitter, child).
    SELECT count(*) INTO v_count_day
    FROM public.complaints
    WHERE from_user_id = NEW.from_user_id
      AND student_id   = NEW.student_id
      AND is_anonymous IS NOT TRUE
      AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = v_today_ist;
    SELECT count(*) INTO v_count_week
    FROM public.complaints
    WHERE from_user_id = NEW.from_user_id
      AND student_id   = NEW.student_id
      AND is_anonymous IS NOT TRUE
      AND created_at >= (now() - interval '7 days');
  ELSE
    -- Teacher / no-student complaint: cap per submitter (legacy behavior).
    SELECT count(*) INTO v_count_day
    FROM public.complaints
    WHERE from_user_id = NEW.from_user_id
      AND student_id IS NULL
      AND is_anonymous IS NOT TRUE
      AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = v_today_ist;
    SELECT count(*) INTO v_count_week
    FROM public.complaints
    WHERE from_user_id = NEW.from_user_id
      AND student_id IS NULL
      AND is_anonymous IS NOT TRUE
      AND created_at >= (now() - interval '7 days');
  END IF;

  IF v_count_day >= 3 THEN
    RAISE EXCEPTION
      'Daily limit reached — only 3 complaints allowed per day. Please contact the school office for another submission.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_count_week >= 7 THEN
    RAISE EXCEPTION
      'Weekly limit reached — only 7 complaints allowed in a 7-day window. Please contact the school office.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- ─── Trigger 2: anonymous-complaint cap (1 / 30 days) ────────────────────
CREATE OR REPLACE FUNCTION public.enforce_anonymous_complaint_weekly_cap()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  recent_count integer;
BEGIN
  IF NEW.is_anonymous IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  -- 30-day rolling window keyed on student_id when present, otherwise on
  -- the submitting user account. Function name kept for backwards compat
  -- with the existing trigger binding; the message + interval are what
  -- the user actually sees.
  SELECT COUNT(*) INTO recent_count
  FROM public.complaints
  WHERE is_anonymous = true
    AND created_at >= (now() - interval '30 days')
    AND (
      (NEW.student_id IS NOT NULL AND student_id = NEW.student_id)
      OR (NEW.student_id IS NULL AND from_user_id = NEW.from_user_id)
    );

  IF recent_count >= 1 THEN
    RAISE EXCEPTION 'Anonymous complaint limit reached: only 1 per 30 days'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- ─── Submitter UPDATE policy for hide-from-my-dashboard ──────────────────
-- The submitter (student / parent) can flip `hidden_from_submitter` on
-- their own row. Principal updates go through adminDb (service role) which
-- bypasses RLS, so this policy doesn't widen the principal write surface.
DROP POLICY IF EXISTS complaints_user_hide ON public.complaints;
CREATE POLICY complaints_user_hide ON public.complaints
  FOR UPDATE
  USING (from_user_id = auth.uid())
  WITH CHECK (from_user_id = auth.uid());
