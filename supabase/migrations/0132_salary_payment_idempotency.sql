-- ════════════════════════════════════════════════════════════════════════
-- 0132 · Idempotent record_salary_payment — kill the double-submit bug
-- ════════════════════════════════════════════════════════════════════════
--
-- Earlier `record_salary_payment` had no guard against a double-click
-- (or replay) creating two `salary_payments` rows + two `expenses` rows
-- for the same (staff, month, amount). Reconciliation got painful, and
-- the principal's books overstated payroll expense.
--
-- A hard UNIQUE(staff_id, month) won't work — split payments (partial
-- amount today + the remainder next week) are a legitimate flow. The
-- fix uses a short idempotency window: if a non-reversed payment with
-- the same (staff_id, month, amount) was created in the last 30 seconds,
-- return that row's id instead of inserting again. No new `expenses`
-- row is written on the second call either.
--
-- The window is intentionally short — a genuine "pay this same partial
-- amount twice" within 30 seconds is implausible.

BEGIN;

DROP FUNCTION IF EXISTS public.record_salary_payment(UUID, TEXT, BIGINT, TEXT, TEXT, TEXT, DATE);

CREATE OR REPLACE FUNCTION public.record_salary_payment(
  p_staff_id UUID,
  p_month    TEXT,
  p_amount   BIGINT,
  p_note     TEXT DEFAULT NULL,
  p_method   TEXT DEFAULT NULL,
  p_txn_id   TEXT DEFAULT NULL,
  p_paid_at  DATE DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school     UUID;
  v_caller     UUID := auth.uid();
  v_year       UUID;
  v_pay_id     UUID;
  v_existing   UUID;
  v_txn        TEXT;
  v_staff_name TEXT;
  v_method     TEXT;
  v_paid_at    DATE := COALESCE(p_paid_at, CURRENT_DATE);
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;
  IF v_paid_at > CURRENT_DATE THEN
    RAISE EXCEPTION 'paid_at cannot be in the future';
  END IF;

  v_method := UPPER(NULLIF(BTRIM(COALESCE(p_method, '')), ''));
  IF v_method IS NOT NULL AND v_method NOT IN ('CASH','BANK_TRANSFER','UPI','CHEQUE','OTHER') THEN
    RAISE EXCEPTION 'invalid method: %', v_method;
  END IF;

  SELECT school_id, name INTO v_school, v_staff_name
    FROM public.staff WHERE id = p_staff_id;
  IF v_school IS NULL THEN RAISE EXCEPTION 'staff not found'; END IF;

  IF NOT (public.is_super_admin()
          OR (public.is_principal() AND public.current_user_school_id() = v_school)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- ── Idempotency gate ────────────────────────────────────────────────
  -- A non-reversed payment with the same (staff, month, amount) inside
  -- the last 30 seconds is treated as a retry of the original — return
  -- its id and skip the expense INSERT below. Real partial-pay flows
  -- are minutes apart, so this only catches double-clicks / replays.
  SELECT id INTO v_existing
  FROM public.salary_payments
  WHERE staff_id = p_staff_id
    AND month    = p_month
    AND amount   = p_amount
    AND reversed_at IS NULL
    AND created_at > NOW() - INTERVAL '30 seconds'
  ORDER BY created_at DESC
  LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  SELECT id INTO v_year FROM public.academic_years
    WHERE school_id = v_school AND is_active = TRUE LIMIT 1;

  v_txn := NULLIF(BTRIM(COALESCE(p_txn_id, '')), '');
  IF v_txn IS NULL THEN
    v_txn := 'TXN-' || to_char(NOW(),'YYYYMMDDHH24MISS') || '-' || substr(p_staff_id::text, 1, 4);
  END IF;

  INSERT INTO public.salary_payments
    (staff_id, school_id, month, amount, paid_at, transaction_id, note, method)
  VALUES
    (p_staff_id, v_school, p_month, p_amount, v_paid_at, v_txn, p_note, v_method)
  RETURNING id INTO v_pay_id;

  INSERT INTO public.expenses
    (school_id, academic_year_id, category, amount, date, description, created_by)
  VALUES
    (v_school, v_year, 'SALARY', p_amount, v_paid_at,
     'Salary: ' || COALESCE(v_staff_name, p_staff_id::text) || ' — ' || p_month
     || COALESCE(' (' || NULLIF(p_note,'') || ')', ''),
     v_caller);

  PERFORM public.log_audit(
    'salary_paid', 'staff', p_staff_id,
    jsonb_build_object(
      'month', p_month, 'amount', p_amount,
      'method', v_method, 'txn', v_txn,
      'paid_at', v_paid_at
    )
  );

  RETURN v_pay_id;
END $$;

GRANT EXECUTE ON FUNCTION public.record_salary_payment(UUID, TEXT, BIGINT, TEXT, TEXT, TEXT, DATE)
  TO authenticated;

COMMIT;
