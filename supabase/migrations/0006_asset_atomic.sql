-- 0006_asset_atomic.sql — atomic asset issue / return RPCs.
--
-- Replace the multi-step client-side issueBook / returnBook flows with
-- transactional SECURITY DEFINER functions so the assets.available_count
-- column never drifts out of sync with asset_issues rows on partial failure.

CREATE OR REPLACE FUNCTION public.issue_asset(
  p_asset_id UUID,
  p_student_id UUID,
  p_borrower_name TEXT,
  p_loan_days INT DEFAULT 14
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
    asset_id, school_id, student_id, borrower_name, issued_at, due_date
  ) VALUES (
    p_asset_id, v_school, p_student_id, p_borrower_name,
    CURRENT_DATE, CURRENT_DATE + (p_loan_days || ' days')::INTERVAL
  )
  RETURNING id INTO v_issue_id;

  UPDATE public.assets
     SET available_count = available_count - 1
   WHERE id = p_asset_id AND school_id = v_school;

  RETURN v_issue_id;
END $$;
GRANT EXECUTE ON FUNCTION public.issue_asset(UUID, UUID, TEXT, INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.return_asset(
  p_asset_id UUID,
  p_student_id UUID
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school UUID := public.current_user_school_id();
  v_total INT;
  v_avail INT;
  v_returned INT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF NOT public.is_principal() THEN RAISE EXCEPTION 'principal only'; END IF;

  SELECT total_count, available_count INTO v_total, v_avail
    FROM public.assets
   WHERE id = p_asset_id AND school_id = v_school
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'asset not found in school'; END IF;

  UPDATE public.asset_issues
     SET returned_at = CURRENT_DATE
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
GRANT EXECUTE ON FUNCTION public.return_asset(UUID, UUID) TO authenticated;
