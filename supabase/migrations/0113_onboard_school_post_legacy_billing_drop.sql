-- 0113_onboard_school_post_legacy_billing_drop.sql
-- Migration 0015's onboard_school RPC inserted into school_billing_schedules
-- and school_billing_years. Migration 0111 dropped both tables in favour of
-- the flat school_billing_installments model, but the RPC was never updated
-- — every super-admin "Add School" call now fails with
--   relation "public.school_billing_schedules" does not exist.
--
-- Fix: re-create onboard_school without those two inserts. Per-AY billing
-- installments are now created on demand by the super-admin via
-- /api/admin/schools/:id/billing-installments.

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
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'only super admins may onboard schools' USING ERRCODE = '42501';
  END IF;
  IF p_annual_amount IS NULL OR p_annual_amount <= 0 THEN
    RAISE EXCEPTION 'annualAmount must be positive';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.schools s
     WHERE s.code = p_school_code AND s.is_deleted = false
  ) THEN
    RAISE EXCEPTION 'A school with code % already exists', p_school_code;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.users u WHERE u.mobile_number = p_principal_mobile
  ) THEN
    RAISE EXCEPTION 'Mobile % is already registered', p_principal_mobile;
  END IF;

  INSERT INTO public.schools (
    name, code, location, address, phone,
    principal_name, principal_email, principal_phone,
    status, plan, payment_status, payment_start_date
  ) VALUES (
    p_school_name, p_school_code, p_location, p_address, p_phone,
    p_principal_name, p_principal_email, p_principal_phone,
    p_status, p_plan, 'PENDING', p_payment_start_date
  ) RETURNING schools.id INTO v_school_id;

  INSERT INTO public.users (
    id, mobile_number, role, name, email, school_id,
    first_login_changed, is_active
  ) VALUES (
    p_principal_user_id, p_principal_mobile, 'PRINCIPAL',
    p_principal_name, p_principal_email, v_school_id,
    false, true
  );

  INSERT INTO public.audit_logs (user_id, school_id, action, entity_type, entity_id, details)
  VALUES (
    v_caller_id, v_school_id, 'onboard_school', 'school', v_school_id,
    jsonb_build_object(
      'name', p_school_name, 'code', p_school_code,
      'plan', p_plan, 'principal', p_principal_name,
      'annual_amount', p_annual_amount
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
