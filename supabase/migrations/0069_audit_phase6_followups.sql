-- Migration 0065: Phase 6 follow-up fixes from second audit pass
-- - Atomic transport-cancel-after RPC (was looped UPDATE per row).
-- Run: npm run db:apply

CREATE OR REPLACE FUNCTION public.transport_cancel_after(
  p_assignment_id uuid,
  p_from_date     date
)
RETURNS TABLE (deleted_count integer, cancelled_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id uuid;
  v_caller_school uuid;
  v_deleted int := 0;
  v_cancelled int := 0;
BEGIN
  SELECT school_id INTO v_school_id
    FROM public.fee_installments
   WHERE related_id = p_assignment_id AND fee_type = 'TRANSPORT'
   LIMIT 1;
  IF v_school_id IS NULL THEN
    -- nothing to cancel
    RETURN QUERY SELECT 0, 0;
    RETURN;
  END IF;

  v_caller_school := public.current_user_school_id();
  IF NOT public.is_super_admin() THEN
    IF NOT public.is_principal() OR v_caller_school IS DISTINCT FROM v_school_id THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- Untouched rows: delete outright.
  WITH del AS (
    DELETE FROM public.fee_installments
     WHERE related_id = p_assignment_id
       AND fee_type   = 'TRANSPORT'
       AND due_date  >= p_from_date
       AND paid_amount = 0
       AND write_off_amount = 0
     RETURNING 1
  )
  SELECT COUNT(*) INTO v_deleted FROM del;

  -- Partial / paid rows: freeze amount at (paid + write-off) and stamp CANCELLED.
  WITH upd AS (
    UPDATE public.fee_installments
       SET status     = 'CANCELLED',
           amount     = paid_amount + write_off_amount,
           updated_at = NOW()
     WHERE related_id = p_assignment_id
       AND fee_type   = 'TRANSPORT'
       AND due_date  >= p_from_date
       AND (paid_amount > 0 OR write_off_amount > 0)
     RETURNING 1
  )
  SELECT COUNT(*) INTO v_cancelled FROM upd;

  RETURN QUERY SELECT v_deleted, v_cancelled;
END;
$$;

GRANT EXECUTE ON FUNCTION public.transport_cancel_after(uuid, date) TO authenticated;
