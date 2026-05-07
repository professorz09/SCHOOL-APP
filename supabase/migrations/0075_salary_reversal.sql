-- 0075_salary_reversal.sql
--
-- Lets a principal mark an accidentally-recorded salary payment as
-- reversed within a 24-hour window. Why mark instead of delete?
--   • The history must show the mistake + the correction so the staff
--     member (and the auditor) can see what actually happened.
--   • The corresponding SALARY expense row also has to be balanced; we
--     post a NEGATIVE expense rather than touching the original so the
--     accounting trail stays append-only.
--
-- Also extends record_salary_payment with an optional paid_at param. The
-- Pay modal's "Advanced" toggle exposes a date picker — the common case
-- (record today's payment) doesn't change behaviour because NULL falls
-- back to CURRENT_DATE.

BEGIN;

-- ─── 1. Reversal columns ────────────────────────────────────────────────
ALTER TABLE public.salary_payments
  ADD COLUMN IF NOT EXISTS reversed_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversed_by      UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS reversal_reason  TEXT;

CREATE INDEX IF NOT EXISTS salary_payments_active_staff_idx
  ON public.salary_payments (staff_id, paid_at DESC)
  WHERE reversed_at IS NULL;

-- ─── 2. record_salary_payment — accept optional paid_at ─────────────────
DROP FUNCTION IF EXISTS public.record_salary_payment(UUID, TEXT, BIGINT, TEXT, TEXT, TEXT);
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

-- ─── 3. reverse_salary_payment ──────────────────────────────────────────
-- Marks an existing payment as reversed (within 24h) and posts a negative
-- balancing expense entry. Reason is required.
CREATE OR REPLACE FUNCTION public.reverse_salary_payment(
  p_payment_id UUID,
  p_reason     TEXT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller   UUID := auth.uid();
  v_school   UUID;
  v_staff_id UUID;
  v_staff_nm TEXT;
  v_amount   BIGINT;
  v_month    TEXT;
  v_paid_at  DATE;
  v_year     UUID;
  v_created  TIMESTAMPTZ;
  v_already  TIMESTAMPTZ;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF p_reason IS NULL OR BTRIM(p_reason) = '' THEN
    RAISE EXCEPTION 'reason is required';
  END IF;

  SELECT sp.staff_id, sp.school_id, sp.amount, sp.month, sp.paid_at,
         sp.created_at, sp.reversed_at, s.name
    INTO v_staff_id, v_school, v_amount, v_month, v_paid_at,
         v_created, v_already, v_staff_nm
  FROM public.salary_payments sp
  JOIN public.staff s ON s.id = sp.staff_id
  WHERE sp.id = p_payment_id;

  IF v_staff_id IS NULL THEN RAISE EXCEPTION 'payment not found'; END IF;
  IF v_already IS NOT NULL THEN RAISE EXCEPTION 'payment already reversed'; END IF;

  -- Same-school principal only.
  IF NOT (public.is_super_admin()
          OR (public.is_principal() AND public.current_user_school_id() = v_school)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- 24-hour window from when the row was originally created. Using
  -- created_at (not paid_at) so back-dated entries can still be reversed
  -- right after they were typed in.
  IF NOW() - v_created > INTERVAL '24 hours' THEN
    RAISE EXCEPTION 'reversal window expired (24 hours from record time)';
  END IF;

  UPDATE public.salary_payments
     SET reversed_at = NOW(),
         reversed_by = v_caller,
         reversal_reason = BTRIM(p_reason)
   WHERE id = p_payment_id;

  -- Balance the SALARY expense with a negative entry. Same date as the
  -- original so monthly summaries net correctly.
  SELECT id INTO v_year FROM public.academic_years
    WHERE school_id = v_school AND is_active = TRUE LIMIT 1;

  INSERT INTO public.expenses
    (school_id, academic_year_id, category, amount, date, description, created_by)
  VALUES
    (v_school, v_year, 'SALARY', -v_amount, v_paid_at,
     'Salary REVERSED: ' || COALESCE(v_staff_nm, v_staff_id::text)
     || ' — ' || v_month || ' · ' || BTRIM(p_reason),
     v_caller);

  PERFORM public.log_audit(
    'salary_payment_reversed', 'staff', v_staff_id,
    jsonb_build_object(
      'payment_id', p_payment_id,
      'amount', v_amount, 'month', v_month,
      'reason', BTRIM(p_reason)
    )
  );
END $$;

GRANT EXECUTE ON FUNCTION public.reverse_salary_payment(UUID, TEXT) TO authenticated;

COMMIT;
