-- 0010_asset_history_meta.sql
--
-- Capture WHO performed an asset issue/return and WHAT condition the item
-- was in, so the principal's library/lab history shows actor + condition
-- notes (not just borrower + dates).
--
-- Adds nullable columns to public.asset_issues and republishes the
-- public.issue_asset / public.return_asset RPCs with optional note params
-- and automatic actor capture (auth.uid()).

ALTER TABLE public.asset_issues
  ADD COLUMN IF NOT EXISTS issued_by_user_id UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS returned_by_user_id UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS issue_note TEXT,
  ADD COLUMN IF NOT EXISTS return_note TEXT;

CREATE INDEX IF NOT EXISTS asset_issues_issued_by_idx
  ON public.asset_issues(issued_by_user_id);
CREATE INDEX IF NOT EXISTS asset_issues_returned_by_idx
  ON public.asset_issues(returned_by_user_id);

-- ─── issue_asset (republished with optional p_note) ────────────────────────
DROP FUNCTION IF EXISTS public.issue_asset(UUID, UUID, TEXT, INT);
DROP FUNCTION IF EXISTS public.issue_asset(UUID, UUID, TEXT, INT, TEXT);

CREATE OR REPLACE FUNCTION public.issue_asset(
  p_asset_id UUID,
  p_student_id UUID,
  p_borrower_name TEXT,
  p_loan_days INT DEFAULT 14,
  p_note TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school UUID := public.current_user_school_id();
  v_avail INT;
  v_issue_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF NOT public.is_principal() THEN RAISE EXCEPTION 'principal only'; END IF;

  SELECT available_count INTO v_avail
    FROM public.assets
   WHERE id = p_asset_id AND school_id = v_school
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'asset not found in school'; END IF;
  IF v_avail <= 0 THEN RAISE EXCEPTION 'no copies available'; END IF;

  INSERT INTO public.asset_issues (
    asset_id, school_id, student_id, borrower_name, issued_at, due_date,
    issued_by_user_id, issue_note
  ) VALUES (
    p_asset_id, v_school, p_student_id, p_borrower_name,
    CURRENT_DATE, CURRENT_DATE + (p_loan_days || ' days')::INTERVAL,
    auth.uid(), NULLIF(BTRIM(p_note), '')
  )
  RETURNING id INTO v_issue_id;

  UPDATE public.assets
     SET available_count = available_count - 1
   WHERE id = p_asset_id AND school_id = v_school;

  RETURN v_issue_id;
END $$;
GRANT EXECUTE ON FUNCTION public.issue_asset(UUID, UUID, TEXT, INT, TEXT) TO authenticated;

-- ─── return_asset (republished with optional p_note) ───────────────────────
DROP FUNCTION IF EXISTS public.return_asset(UUID, UUID);
DROP FUNCTION IF EXISTS public.return_asset(UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.return_asset(
  p_asset_id UUID,
  p_student_id UUID,
  p_note TEXT DEFAULT NULL
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school UUID := public.current_user_school_id();
  v_total INT;
  v_avail INT;
  v_returned INT;
  v_clean_note TEXT := NULLIF(BTRIM(p_note), '');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF NOT public.is_principal() THEN RAISE EXCEPTION 'principal only'; END IF;

  SELECT total_count, available_count INTO v_total, v_avail
    FROM public.assets
   WHERE id = p_asset_id AND school_id = v_school
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'asset not found in school'; END IF;

  UPDATE public.asset_issues
     SET returned_at = CURRENT_DATE,
         returned_by_user_id = auth.uid(),
         return_note = v_clean_note
   WHERE asset_id = p_asset_id
     AND school_id = v_school
     AND returned_at IS NULL
     AND (p_student_id IS NULL OR student_id = p_student_id);
  GET DIAGNOSTICS v_returned = ROW_COUNT;

  IF v_returned = 0 THEN
    RAISE EXCEPTION 'no open loan found for student';
  END IF;

  UPDATE public.assets
     SET available_count = LEAST(v_total, v_avail + v_returned)
   WHERE id = p_asset_id AND school_id = v_school;

  RETURN v_returned;
END $$;
GRANT EXECUTE ON FUNCTION public.return_asset(UUID, UUID, TEXT) TO authenticated;
