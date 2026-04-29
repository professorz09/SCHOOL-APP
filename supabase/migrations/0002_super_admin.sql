-- ============================================================================
-- Migration 0002 — Super Admin module
--   Audit log helper, soft-delete cascade, billing payment allocation RPC,
--   broadcast metadata columns, schools.status TRIAL state.
--
-- This migration is purely additive (CREATE OR REPLACE / IF NOT EXISTS / ALTER
-- with guards). It can be re-applied safely; primary keys are untouched.
-- ============================================================================

-- ─── schools.status: allow TRIAL ────────────────────────────────────────────
-- The frontend exposes a TRIAL plan state during onboarding; widen the CHECK.
ALTER TABLE public.schools DROP CONSTRAINT IF EXISTS schools_status_check;
ALTER TABLE public.schools ADD CONSTRAINT schools_status_check
  CHECK (status IN ('ACTIVE','INACTIVE','SUSPENDED','TRIAL'));

-- ─── broadcasts: add audience + reach metadata ──────────────────────────────
ALTER TABLE public.broadcasts
  ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'ALL',
  ADD COLUMN IF NOT EXISTS reach_count BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'SENT',
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

-- 0001 declared sent_at NOT NULL; SCHEDULED broadcasts haven't been sent yet
-- and need a null sent_at, so relax the constraint.
ALTER TABLE public.broadcasts
  ALTER COLUMN sent_at DROP NOT NULL;

-- ─── audit_logs: add useful indexes ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS audit_logs_created_idx
  ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx
  ON public.audit_logs(entity_type, created_at DESC);

-- ─── log_audit() : SECURITY DEFINER helper ─────────────────────────────────
-- Inserts into public.audit_logs using auth.uid() as the actor.  Runs with
-- elevated privileges so any authenticated role can record an audit entry
-- without needing direct write access to audit_logs.
CREATE OR REPLACE FUNCTION public.log_audit(
  p_action      TEXT,
  p_entity_type TEXT,
  p_entity_id   UUID,
  p_details     JSONB DEFAULT '{}'::jsonb
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id   UUID;
  v_school_id UUID;
  v_log_id    UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NOT NULL THEN
    SELECT school_id INTO v_school_id
      FROM public.users WHERE id = v_user_id;
  END IF;

  INSERT INTO public.audit_logs
    (user_id, school_id, action, entity_type, entity_id, details)
  VALUES
    (v_user_id, v_school_id, p_action, p_entity_type, p_entity_id, COALESCE(p_details,'{}'::jsonb))
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.log_audit(TEXT, TEXT, UUID, JSONB) TO authenticated;

-- ─── cascade school deactivation ────────────────────────────────────────────
-- When a school is moved to INACTIVE/SUSPENDED, deactivate all its non-super
-- users + students + staff. Reactivating the school flips the principal back
-- to active but leaves student/staff is_active states intact (those are
-- managed individually).
CREATE OR REPLACE FUNCTION public.cascade_school_deactivation() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('INACTIVE','SUSPENDED')
     AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    UPDATE public.users
       SET is_active = FALSE
     WHERE school_id = NEW.id AND role <> 'SUPER_ADMIN';
    UPDATE public.students SET is_active = FALSE WHERE school_id = NEW.id;
    UPDATE public.staff    SET is_active = FALSE WHERE school_id = NEW.id;
  ELSIF NEW.status IN ('ACTIVE','TRIAL')
        AND OLD.status IN ('INACTIVE','SUSPENDED') THEN
    UPDATE public.users
       SET is_active = TRUE
     WHERE school_id = NEW.id AND role = 'PRINCIPAL';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS schools_cascade_deactivation ON public.schools;
CREATE TRIGGER schools_cascade_deactivation
  AFTER UPDATE OF status ON public.schools
  FOR EACH ROW EXECUTE FUNCTION public.cascade_school_deactivation();

-- ─── record_school_payment() RPC ────────────────────────────────────────────
-- Records a payment + allocates the amount across outstanding billing years
-- oldest-first, then dumps any leftover as advance credit on the latest year
-- (outstanding may go negative, representing pre-payment).
-- Returns the new payment row's id.
CREATE OR REPLACE FUNCTION public.record_school_payment(
  p_school_id UUID,
  p_amount    BIGINT,
  p_txn_id    TEXT,
  p_method    TEXT,
  p_notes     TEXT DEFAULT ''
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_payment_id     UUID;
  v_remaining      BIGINT := p_amount;
  v_alloc          BIGINT;
  v_year           RECORD;
  v_latest_year_id UUID;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'forbidden: super admin only'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  INSERT INTO public.school_payments
    (school_id, amount, paid_at, txn_id, method, notes)
  VALUES
    (p_school_id, p_amount, CURRENT_DATE, p_txn_id, p_method, COALESCE(p_notes,''))
  RETURNING id INTO v_payment_id;

  -- Allocate to outstanding years oldest-first.
  FOR v_year IN
    SELECT id, outstanding
      FROM public.school_billing_years
     WHERE school_id = p_school_id AND outstanding > 0
     ORDER BY start_date ASC
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_alloc := LEAST(v_remaining, v_year.outstanding);
    INSERT INTO public.school_payment_allocations
      (school_payment_id, billing_year_id, amount_applied)
      VALUES (v_payment_id, v_year.id, v_alloc);
    UPDATE public.school_billing_years
       SET total_paid  = total_paid  + v_alloc,
           outstanding = outstanding - v_alloc
     WHERE id = v_year.id;
    v_remaining := v_remaining - v_alloc;
  END LOOP;

  -- Leftover becomes an advance credit on the latest year.
  IF v_remaining > 0 THEN
    SELECT id INTO v_latest_year_id
      FROM public.school_billing_years
     WHERE school_id = p_school_id
     ORDER BY start_date DESC LIMIT 1;
    IF v_latest_year_id IS NOT NULL THEN
      INSERT INTO public.school_payment_allocations
        (school_payment_id, billing_year_id, amount_applied)
        VALUES (v_payment_id, v_latest_year_id, v_remaining);
      UPDATE public.school_billing_years
         SET total_paid  = total_paid  + v_remaining,
             outstanding = outstanding - v_remaining
       WHERE id = v_latest_year_id;
    END IF;
  END IF;

  -- Refresh schools.payment_status from current outstanding totals.
  UPDATE public.schools
     SET payment_status = CASE
       WHEN COALESCE((SELECT SUM(outstanding) FROM public.school_billing_years
                      WHERE school_id = p_school_id), 0) <= 0
            THEN 'PAID'
       ELSE 'PENDING'
     END,
     updated_at = NOW()
   WHERE id = p_school_id;

  PERFORM public.log_audit(
    'record_school_payment',
    'school_payment',
    v_payment_id,
    jsonb_build_object(
      'school_id', p_school_id,
      'amount',    p_amount,
      'txn_id',    p_txn_id,
      'method',    p_method
    )
  );

  RETURN v_payment_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_school_payment(UUID, BIGINT, TEXT, TEXT, TEXT)
  TO authenticated;

-- ─── create_next_billing_year() RPC ─────────────────────────────────────────
-- Produces the next billing year for a school, carrying forward the
-- outstanding balance from the latest year (negative carry = advance credit).
CREATE OR REPLACE FUNCTION public.create_next_billing_year(
  p_school_id UUID
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_latest         RECORD;
  v_schedule       RECORD;
  v_new_id         UUID;
  v_new_start      DATE;
  v_new_end        DATE;
  v_carried        BIGINT;
  v_total_due      BIGINT;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_schedule
    FROM public.school_billing_schedules WHERE school_id = p_school_id;
  IF v_schedule IS NULL THEN
    RAISE EXCEPTION 'no billing schedule for school %', p_school_id;
  END IF;

  SELECT * INTO v_latest
    FROM public.school_billing_years
   WHERE school_id = p_school_id
   ORDER BY start_date DESC LIMIT 1;

  IF v_latest IS NULL THEN
    v_new_start := v_schedule.billing_start_date;
    v_carried   := 0;
  ELSE
    v_new_start := v_latest.end_date + INTERVAL '1 day';
    v_carried   := v_latest.outstanding; -- can be negative (advance)
  END IF;

  v_new_end := (v_new_start + INTERVAL '1 year - 1 day')::DATE;
  v_total_due := v_schedule.annual_amount + v_carried;

  INSERT INTO public.school_billing_years
    (school_id, year_label, start_date, end_date, annual_amount,
     carried_forward, total_due, total_paid, outstanding)
  VALUES (
    p_school_id,
    to_char(v_new_start, 'YYYY') || '-' || to_char(v_new_end, 'YY'),
    v_new_start, v_new_end,
    v_schedule.annual_amount, v_carried, v_total_due, 0, v_total_due
  )
  RETURNING id INTO v_new_id;

  PERFORM public.log_audit(
    'create_next_billing_year', 'school_billing_year', v_new_id,
    jsonb_build_object('school_id', p_school_id, 'carried_forward', v_carried)
  );

  RETURN v_new_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_next_billing_year(UUID) TO authenticated;
