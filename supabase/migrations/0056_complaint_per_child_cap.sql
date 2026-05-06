-- Cap complaint submissions per child for PARENT users.
--
-- Problem: 0052 keyed the daily-3 cap on `from_user_id` only. A parent with
-- two kids on a single login hits the 3-cap across BOTH children — meaning
-- one child's spam locks the other out. Asymmetric with leave applications,
-- which are already per-student.
--
-- Fix: add `student_id` to complaints, populate it from the parent context
-- on insert, and re-key the trigger by (from_user_id, student_id) when
-- present. Existing rows keep student_id NULL and continue to use the old
-- per-user counting (safe — it just preserves the old behavior for
-- TEACHER complaints which have no student-context).

ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS student_id uuid REFERENCES public.students(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS complaints_student_idx
  ON public.complaints (student_id) WHERE student_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_complaint_daily_limit() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_today_ist date;
  v_count     bigint;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_today_ist := (now() AT TIME ZONE 'Asia/Kolkata')::date;

  IF NEW.student_id IS NOT NULL THEN
    -- Parent / student complaint: cap per (submitter, child).
    SELECT count(*) INTO v_count
    FROM public.complaints
    WHERE from_user_id = NEW.from_user_id
      AND student_id   = NEW.student_id
      AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = v_today_ist;
  ELSE
    -- Teacher / no-student complaint: cap per submitter (legacy behavior).
    SELECT count(*) INTO v_count
    FROM public.complaints
    WHERE from_user_id = NEW.from_user_id
      AND student_id IS NULL
      AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = v_today_ist;
  END IF;

  IF v_count >= 3 THEN
    RAISE EXCEPTION
      'Daily limit reached — only 3 complaints allowed per day. Please contact the school office for another submission.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;
