-- =============================================================
-- 0086_financial_analytics.sql
-- =============================================================
-- Single-round-trip aggregate for the Analytics dashboard's top
-- summary cards. Returns 10 totals scoped to (school, academic year)
-- so the UI never has to ship row-level data for these tiles.
--
-- All inputs are explicitly bounded by school_id (RLS-safe) and the
-- supplied year's start/end dates. "This month" is calendar-current
-- (date_trunc('month', now())), "this year" tracks the supplied
-- academic year window.
--
-- Indexed columns used: payment_records(school_id, date),
-- fee_installments(student_id, academic_year_id),
-- expenses(school_id, date), salary_payments(school_id, paid_at).
-- =============================================================

CREATE OR REPLACE FUNCTION public.get_financial_analytics(
  p_year_id UUID
) RETURNS TABLE (
  fees_collected_month       BIGINT,
  fees_collected_year        BIGINT,
  fees_pending               BIGINT,
  discounts_given            BIGINT,
  expenses_month             BIGINT,
  expenses_year              BIGINT,
  salary_paid_month          BIGINT,
  salary_pending             BIGINT,
  transport_collection_year  BIGINT,
  net_balance_year           BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school_id   UUID;
  v_year_start  DATE;
  v_year_end    DATE;
  v_month_start DATE := date_trunc('month', CURRENT_DATE)::date;
BEGIN
  IF NOT (public.is_super_admin() OR public.is_principal()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_school_id := public.current_user_school_id();

  SELECT start_date, end_date INTO v_year_start, v_year_end
    FROM public.academic_years
   WHERE id = p_year_id
     AND (school_id = v_school_id OR public.is_super_admin());
  IF v_year_start IS NULL THEN
    RAISE EXCEPTION 'academic year not found';
  END IF;

  RETURN QUERY
  WITH
  -- Cash receipts (excludes reversals via amount > 0 + reversed_at NULL).
  pay_year AS (
    SELECT COALESCE(SUM(amount), 0)::BIGINT AS total
      FROM public.payment_records
     WHERE school_id = v_school_id
       AND amount > 0
       AND reversed_at IS NULL
       AND date BETWEEN v_year_start AND v_year_end
  ),
  pay_month AS (
    SELECT COALESCE(SUM(amount), 0)::BIGINT AS total
      FROM public.payment_records
     WHERE school_id = v_school_id
       AND amount > 0
       AND reversed_at IS NULL
       AND date >= v_month_start
       AND date <= CURRENT_DATE
  ),
  -- Outstanding fee balance across the year's installments.
  fees_due AS (
    SELECT COALESCE(SUM(GREATEST(0, amount - paid_amount - write_off_amount)), 0)::BIGINT AS total
      FROM public.fee_installments
     WHERE school_id = v_school_id
       AND academic_year_id = p_year_id
  ),
  -- Discounts applied (write-offs) on the year's installments.
  discounts AS (
    SELECT COALESCE(SUM(write_off_amount), 0)::BIGINT AS total
      FROM public.fee_installments
     WHERE school_id = v_school_id
       AND academic_year_id = p_year_id
  ),
  -- Operational expenses.
  exp_year AS (
    SELECT COALESCE(SUM(amount), 0)::BIGINT AS total
      FROM public.expenses
     WHERE school_id = v_school_id
       AND date BETWEEN v_year_start AND v_year_end
  ),
  exp_month AS (
    SELECT COALESCE(SUM(amount), 0)::BIGINT AS total
      FROM public.expenses
     WHERE school_id = v_school_id
       AND date >= v_month_start
       AND date <= CURRENT_DATE
  ),
  -- Salary payouts.
  sal_month AS (
    SELECT COALESCE(SUM(amount), 0)::BIGINT AS total
      FROM public.salary_payments
     WHERE school_id = v_school_id
       AND paid_at >= v_month_start
       AND paid_at <= CURRENT_DATE
  ),
  sal_year AS (
    SELECT COALESCE(SUM(amount), 0)::BIGINT AS total
      FROM public.salary_payments
     WHERE school_id = v_school_id
       AND paid_at BETWEEN v_year_start AND v_year_end
  ),
  -- Total expected salary in the year so far: active staff × monthly
  -- salary × (months elapsed since year_start, capped at year_end).
  sal_expected AS (
    SELECT
      COALESCE(SUM(s.salary), 0)::BIGINT *
      GREATEST(1,
        LEAST(
          12,
          extract(year  from age(LEAST(CURRENT_DATE, v_year_end), v_year_start))::INT * 12
            + extract(month from age(LEAST(CURRENT_DATE, v_year_end), v_year_start))::INT
            + 1
        )
      )::BIGINT AS total
    FROM public.staff s
    WHERE s.school_id = v_school_id
      AND s.is_active = TRUE
  ),
  -- Transport-tagged receipts only (joined via payment_installment_links).
  transport AS (
    SELECT COALESCE(SUM(pil.amount_applied), 0)::BIGINT AS total
      FROM public.payment_installment_links pil
      JOIN public.fee_installments fi ON fi.id = pil.installment_id
      JOIN public.payment_records   pr ON pr.id = pil.payment_id
     WHERE fi.school_id = v_school_id
       AND fi.academic_year_id = p_year_id
       AND fi.fee_type = 'TRANSPORT'
       AND pr.amount > 0
       AND pr.reversed_at IS NULL
  )
  SELECT
    pm.total,
    py.total,
    fd.total,
    dc.total,
    em.total,
    ey.total,
    sm.total,
    GREATEST(0, se.total - sy.total),
    tr.total,
    py.total - ey.total - sy.total
  FROM pay_month pm, pay_year py, fees_due fd, discounts dc,
       exp_month em, exp_year ey, sal_month sm, sal_year sy,
       sal_expected se, transport tr;
END $$;

GRANT EXECUTE ON FUNCTION public.get_financial_analytics(UUID) TO authenticated;
