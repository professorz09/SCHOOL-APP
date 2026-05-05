-- Anti-spam guards for parent/student-side request flows.
--   • approvals (LEAVE)  → max 3 per student per IST day
--   • complaints         → max 3 per parent/student account per IST day
--
-- Day boundary is IST calendar midnight (matches school operations + parent
-- mental model). Service-role inserts bypass — only authenticated user
-- traffic is rate-limited.

-- ─── 1. LEAVE applications (per student) ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_leave_daily_limit() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_today_ist date;
  v_count     bigint;
BEGIN
  -- Only LEAVE requests are capped — other approval types (admission edit,
  -- attendance correction, etc.) flow through different UX and aren't spam-prone.
  IF NEW.request_type <> 'LEAVE' THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_today_ist := (now() AT TIME ZONE 'Asia/Kolkata')::date;

  -- Cap per student (entity_id) so a parent with 2 kids can file 3 per kid.
  SELECT count(*) INTO v_count
  FROM public.approvals
  WHERE request_type = 'LEAVE'
    AND entity_type = 'student'
    AND entity_id = NEW.entity_id
    AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = v_today_ist;

  IF v_count >= 3 THEN
    RAISE EXCEPTION
      'Daily limit reached — only 3 leave applications allowed per student per day. Please contact the school office for another submission.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leave_daily_limit ON public.approvals;
CREATE TRIGGER leave_daily_limit
  BEFORE INSERT ON public.approvals
  FOR EACH ROW EXECUTE FUNCTION public.enforce_leave_daily_limit();

-- ─── 2. COMPLAINTS (per submitter user) ───────────────────────────────────
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

  SELECT count(*) INTO v_count
  FROM public.complaints
  WHERE from_user_id = NEW.from_user_id
    AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = v_today_ist;

  IF v_count >= 3 THEN
    RAISE EXCEPTION
      'Daily limit reached — only 3 complaints allowed per day. Please contact the school office for another submission.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS complaint_daily_limit ON public.complaints;
CREATE TRIGGER complaint_daily_limit
  BEFORE INSERT ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.enforce_complaint_daily_limit();
