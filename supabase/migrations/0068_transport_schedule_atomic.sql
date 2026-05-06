-- Migration 0064: Atomic transport-fee schedule replace.
--
-- The client previously did:
--   DELETE unpaid TRANSPORT installments for this assignment;
--   INSERT new monthly rows.
-- Two separate round-trips. If the INSERT failed (RLS, constraint, network)
-- the student lost ALL unpaid TRANSPORT installments without replacement.
--
-- This RPC moves both ops into one transaction. Caller passes a JSONB array
-- of new rows; we delete the old unpaid set, then insert the new set, both
-- under the same SECURITY DEFINER context (PRINCIPAL same-school enforced
-- via the explicit checks below).
--
-- Run: npm run db:apply

CREATE OR REPLACE FUNCTION public.transport_replace_unpaid_installments(
  p_assignment_id uuid,
  p_rows          jsonb
)
RETURNS TABLE (deleted_count integer, inserted_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id uuid;
  v_caller_school uuid;
  v_deleted int := 0;
  v_inserted int := 0;
BEGIN
  -- Identify the school this assignment belongs to via any installment row,
  -- or fall back to the first JSONB row's school_id (initial seeding).
  SELECT school_id INTO v_school_id
    FROM public.fee_installments
   WHERE related_id = p_assignment_id AND fee_type = 'TRANSPORT'
   LIMIT 1;
  IF v_school_id IS NULL THEN
    v_school_id := (p_rows -> 0 ->> 'school_id')::uuid;
  END IF;

  -- Caller must be principal of that school (or super-admin).
  v_caller_school := public.current_user_school_id();
  IF NOT public.is_super_admin() THEN
    IF NOT public.is_principal() OR v_caller_school IS DISTINCT FROM v_school_id THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  WITH del AS (
    DELETE FROM public.fee_installments
     WHERE related_id = p_assignment_id
       AND fee_type = 'TRANSPORT'
       AND paid_amount = 0
       AND write_off_amount = 0
     RETURNING 1
  )
  SELECT COUNT(*) INTO v_deleted FROM del;

  WITH ins AS (
    INSERT INTO public.fee_installments
      (student_id, school_id, academic_year_id, month, due_date,
       fee_type, amount, payer_type, related_id)
    SELECT
      (r->>'student_id')::uuid,
      (r->>'school_id')::uuid,
      (r->>'academic_year_id')::uuid,
       r->>'month',
      (r->>'due_date')::date,
       r->>'fee_type',
      (r->>'amount')::numeric,
       r->>'payer_type',
      (r->>'related_id')::uuid
    FROM jsonb_array_elements(p_rows) AS r
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_inserted FROM ins;

  RETURN QUERY SELECT v_deleted, v_inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.transport_replace_unpaid_installments(uuid, jsonb) TO authenticated;
