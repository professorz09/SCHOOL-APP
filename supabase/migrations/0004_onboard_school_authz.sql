-- ============================================================================
-- Migration 0004 — harden public.onboard_school() against direct RPC abuse.
--
-- Round 3 review found the SECURITY DEFINER RPC trusted a caller-supplied
-- p_caller_id and didn't itself check that auth.uid() is a SUPER_ADMIN. That
-- meant any authenticated user (e.g. a Principal in another school) could
-- POST to PostgREST `/rest/v1/rpc/onboard_school` and create schools.
--
-- Fix: drop the old signature and recreate the function so it
--   * derives the actor strictly from auth.uid()
--   * refuses unless public.is_super_admin() is true
--   * grants EXECUTE only to authenticated (the inner check is the gate)
--
-- Primary keys are untouched.
-- ============================================================================

DROP FUNCTION IF EXISTS public.onboard_school(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, BIGINT
);

CREATE OR REPLACE FUNCTION public.onboard_school(
  p_principal_user_id  UUID,
  p_school_name        TEXT,
  p_school_code        TEXT,
  p_location           TEXT,
  p_address            TEXT,
  p_phone              TEXT,
  p_principal_name     TEXT,
  p_principal_email    TEXT,
  p_principal_phone    TEXT,
  p_principal_mobile   TEXT,
  p_status             TEXT,
  p_plan               TEXT,
  p_payment_start_date DATE,
  p_annual_amount      BIGINT
) RETURNS TABLE (
  id                 UUID,
  name               TEXT,
  code               TEXT,
  location           TEXT,
  address            TEXT,
  phone              TEXT,
  principal_name     TEXT,
  principal_email    TEXT,
  principal_phone    TEXT,
  status             TEXT,
  plan               TEXT,
  payment_status     TEXT,
  payment_start_date DATE,
  is_deleted         BOOLEAN,
  created_at         TIMESTAMPTZ,
  updated_at         TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller_id  UUID := auth.uid();
  v_school_id  UUID;
  v_year_label TEXT;
  v_end_date   DATE;
BEGIN
  -- Authorization: only an active SUPER_ADMIN may onboard schools.
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'only super admins may onboard schools' USING ERRCODE = '42501';
  END IF;

  IF p_annual_amount IS NULL OR p_annual_amount <= 0 THEN
    RAISE EXCEPTION 'annualAmount must be positive';
  END IF;

  -- Reject duplicates up-front so the caller gets a clean error.
  IF EXISTS (SELECT 1 FROM public.schools WHERE code = p_school_code AND is_deleted = false) THEN
    RAISE EXCEPTION 'A school with code % already exists', p_school_code;
  END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE mobile_number = p_principal_mobile) THEN
    RAISE EXCEPTION 'Mobile % is already registered', p_principal_mobile;
  END IF;

  -- 1. School row.
  INSERT INTO public.schools (
    name, code, location, address, phone,
    principal_name, principal_email, principal_phone,
    status, plan, payment_status, payment_start_date
  ) VALUES (
    p_school_name, p_school_code, p_location, p_address, p_phone,
    p_principal_name, p_principal_email, p_principal_phone,
    p_status, p_plan, 'PENDING', p_payment_start_date
  ) RETURNING schools.id INTO v_school_id;

  -- 2. Principal profile (1:1 with auth.users by id).
  INSERT INTO public.users (
    id, mobile_number, role, name, email, school_id,
    first_login_changed, is_active
  ) VALUES (
    p_principal_user_id, p_principal_mobile, 'PRINCIPAL',
    p_principal_name, p_principal_email, v_school_id,
    false, true
  );

  -- 3. Billing schedule.
  INSERT INTO public.school_billing_schedules (
    school_id, plan, annual_amount, billing_start_date
  ) VALUES (
    v_school_id, p_plan, p_annual_amount, p_payment_start_date
  );

  -- 4. First billing year.
  v_end_date := (p_payment_start_date + INTERVAL '1 year' - INTERVAL '1 day')::DATE;
  v_year_label := EXTRACT(YEAR FROM p_payment_start_date)::TEXT
                  || '-'
                  || RIGHT(EXTRACT(YEAR FROM v_end_date)::TEXT, 2);

  INSERT INTO public.school_billing_years (
    school_id, year_label, start_date, end_date,
    annual_amount, carried_forward, total_due, total_paid, outstanding
  ) VALUES (
    v_school_id, v_year_label, p_payment_start_date, v_end_date,
    p_annual_amount, 0, p_annual_amount, 0, p_annual_amount
  );

  -- 5. Audit (best-effort, attributed to the verified caller).
  INSERT INTO public.audit_logs (user_id, school_id, action, entity_type, entity_id, details)
  VALUES (
    v_caller_id, v_school_id, 'onboard_school', 'school', v_school_id,
    jsonb_build_object(
      'name', p_school_name, 'code', p_school_code,
      'plan', p_plan, 'principal', p_principal_name
    )
  );

  RETURN QUERY
    SELECT s.id, s.name, s.code, s.location, s.address, s.phone,
           s.principal_name, s.principal_email, s.principal_phone,
           s.status, s.plan, s.payment_status, s.payment_start_date,
           s.is_deleted, s.created_at, s.updated_at
      FROM public.schools s
     WHERE s.id = v_school_id;
END;
$$;

REVOKE ALL ON FUNCTION public.onboard_school(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, BIGINT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.onboard_school(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, BIGINT
) TO authenticated, service_role;
