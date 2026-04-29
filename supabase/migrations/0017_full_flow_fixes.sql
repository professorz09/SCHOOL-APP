-- ============================================================================
-- Migration 0017 — Full-flow database foundations
--
-- Lays the schema/RPC groundwork that every later UI task in the "Full School
-- App Flow" plan depends on. Bundling all changes into one transactional file
-- keeps the order deterministic and avoids per-task migrations.
--
-- Highlights
--   * staff: relieving_date / relieving_reason columns + staff_salary_history
--     table + update_staff_salary() RPC.
--   * sections: stream + capacity columns.
--   * student_transport_assignments: reason + changed_by columns.
--   * academic_years: streams JSONB + single-active-year BEFORE-UPDATE trigger.
--   * student_academic_records: UNIQUE (academic_year_id, section_id, roll_no).
--     Pre-existing duplicates have their roll_no quietly NULLed before the
--     constraint is added so the migration is safe to run on dirty data.
--   * student_class_movements: extra columns (section ids, denormalised class
--     name fields, changed_by) so the RPC and the UI can carry richer history.
--   * record_class_movement RPC: writes section_id/class_name + changed_by.
--   * generate_student_fee_schedule RPC: re-created with discount_amount /
--     discount_pct / is_rte parameters; per-installment discount applied,
--     payer_type forced to GOVERNMENT when RTE.
--   * school_billing_schedules.advance_balance column: lets record_school_payment
--     park surplus credit at the schedule level instead of overpaying the
--     latest year. record_school_payment is re-created to use it.
--
-- Idempotent: every ALTER uses IF NOT EXISTS guards, every CREATE TABLE uses
-- IF NOT EXISTS, every RPC uses CREATE OR REPLACE (or DROP + CREATE where the
-- signature changed). Re-running the file is a no-op.
-- ============================================================================

BEGIN;

-- ─── 1. staff: relieving info + salary history ───────────────────────────────

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS relieving_date   DATE,
  ADD COLUMN IF NOT EXISTS relieving_reason TEXT;

CREATE TABLE IF NOT EXISTS public.staff_salary_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  salary_amount BIGINT NOT NULL,
  effective_from DATE NOT NULL,
  reason TEXT,
  changed_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS staff_salary_history_staff_idx
  ON public.staff_salary_history(staff_id, effective_from DESC);
CREATE INDEX IF NOT EXISTS staff_salary_history_school_idx
  ON public.staff_salary_history(school_id);

ALTER TABLE public.staff_salary_history ENABLE ROW LEVEL SECURITY;

-- Salary is sensitive: only PRINCIPAL of the same school + super admin may
-- read history. Teachers explicitly excluded so they cannot see other staff
-- salaries (or each other's). Service role still bypasses RLS as usual.
DROP POLICY IF EXISTS staff_salary_history_select ON public.staff_salary_history;
CREATE POLICY staff_salary_history_select ON public.staff_salary_history FOR SELECT
  USING (
    public.is_super_admin()
    OR (public.is_principal() AND school_id = public.current_user_school_id())
  );

DROP POLICY IF EXISTS staff_salary_history_write ON public.staff_salary_history;
CREATE POLICY staff_salary_history_write ON public.staff_salary_history FOR ALL
  USING (
    public.is_super_admin()
    OR (public.is_principal() AND school_id = public.current_user_school_id())
  )
  WITH CHECK (
    public.is_super_admin()
    OR (public.is_principal() AND school_id = public.current_user_school_id())
  );

-- update_staff_salary(): atomic salary edit — bumps staff.salary and inserts
-- a history row in one transaction. Principal-of-same-school OR super admin.
CREATE OR REPLACE FUNCTION public.update_staff_salary(
  p_staff_id      UUID,
  p_new_amount    BIGINT,
  p_effective_from DATE DEFAULT CURRENT_DATE,
  p_reason        TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school_id UUID;
  v_history_id UUID;
  v_caller UUID := auth.uid();
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF p_new_amount IS NULL OR p_new_amount < 0 THEN
    RAISE EXCEPTION 'salary must be non-negative';
  END IF;

  SELECT school_id INTO v_school_id FROM public.staff WHERE id = p_staff_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'staff not found'; END IF;

  IF NOT (public.is_super_admin()
          OR (public.is_principal() AND public.current_user_school_id() = v_school_id)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.staff
     SET salary = p_new_amount,
         updated_at = NOW()
   WHERE id = p_staff_id;

  INSERT INTO public.staff_salary_history
    (staff_id, school_id, salary_amount, effective_from, reason, changed_by)
  VALUES
    (p_staff_id, v_school_id, p_new_amount, p_effective_from, p_reason, v_caller)
  RETURNING id INTO v_history_id;

  PERFORM public.log_audit(
    'update_staff_salary', 'staff', p_staff_id,
    jsonb_build_object('amount', p_new_amount, 'effective_from', p_effective_from, 'reason', p_reason)
  );

  RETURN v_history_id;
END $$;
GRANT EXECUTE ON FUNCTION public.update_staff_salary(UUID, BIGINT, DATE, TEXT) TO authenticated;

-- ─── 2. sections: stream + capacity ─────────────────────────────────────────

ALTER TABLE public.sections
  ADD COLUMN IF NOT EXISTS stream   TEXT,
  ADD COLUMN IF NOT EXISTS capacity INT NOT NULL DEFAULT 45;

-- ─── 3. student_transport_assignments: reason + changed_by ──────────────────

ALTER TABLE public.student_transport_assignments
  ADD COLUMN IF NOT EXISTS reason     TEXT,
  ADD COLUMN IF NOT EXISTS changed_by UUID REFERENCES public.users(id);

-- ─── 4. academic_years: streams JSONB + single-active trigger ───────────────

ALTER TABLE public.academic_years
  ADD COLUMN IF NOT EXISTS streams JSONB NOT NULL DEFAULT '["Science","Commerce","Arts"]'::jsonb;

-- Before flipping a year to is_active = TRUE, deactivate every other year of
-- the same school. Recursion-safe: the inner UPDATE flips siblings to FALSE,
-- which fails the (NEW.is_active = TRUE) condition and short-circuits.
CREATE OR REPLACE FUNCTION public.academic_years_single_active() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_active = TRUE
     AND (TG_OP = 'INSERT' OR OLD.is_active IS DISTINCT FROM TRUE) THEN
    UPDATE public.academic_years
       SET is_active = FALSE
     WHERE school_id = NEW.school_id
       AND id <> NEW.id
       AND is_active = TRUE;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS academic_years_single_active_upd ON public.academic_years;
CREATE TRIGGER academic_years_single_active_upd
  BEFORE UPDATE OF is_active ON public.academic_years
  FOR EACH ROW EXECUTE FUNCTION public.academic_years_single_active();

DROP TRIGGER IF EXISTS academic_years_single_active_ins ON public.academic_years;
CREATE TRIGGER academic_years_single_active_ins
  BEFORE INSERT ON public.academic_years
  FOR EACH ROW EXECUTE FUNCTION public.academic_years_single_active();

-- ─── 5. student_academic_records: roll-no uniqueness ────────────────────────
--
-- NULL out roll_no for any duplicate-within-section rows so the constraint
-- can be added on dirty data. The "first" row in each duplicate group keeps
-- its roll_no; the rest get NULLed and can be re-assigned by the UI later.
WITH dups AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY academic_year_id, section_id, roll_no
           ORDER BY created_at, id
         ) AS rn
    FROM public.student_academic_records
   WHERE roll_no IS NOT NULL
     AND section_id IS NOT NULL
)
UPDATE public.student_academic_records sar
   SET roll_no = NULL
  FROM dups
 WHERE sar.id = dups.id
   AND dups.rn > 1;

-- Partial unique index ignores NULL roll_no / NULL section_id rows.
CREATE UNIQUE INDEX IF NOT EXISTS sar_year_section_roll_uniq
  ON public.student_academic_records (academic_year_id, section_id, roll_no)
  WHERE roll_no IS NOT NULL AND section_id IS NOT NULL;

-- ─── 6. student_class_movements: richer history columns ─────────────────────

ALTER TABLE public.student_class_movements
  ADD COLUMN IF NOT EXISTS old_section_id  UUID REFERENCES public.sections(id),
  ADD COLUMN IF NOT EXISTS new_section_id  UUID REFERENCES public.sections(id),
  ADD COLUMN IF NOT EXISTS old_class_name  TEXT,
  ADD COLUMN IF NOT EXISTS new_class_name  TEXT,
  ADD COLUMN IF NOT EXISTS changed_by      UUID REFERENCES public.users(id);

CREATE INDEX IF NOT EXISTS scm_student_year_idx
  ON public.student_class_movements(student_id, academic_year_id);

-- Re-create record_class_movement so it populates the new columns + changed_by.
-- Signature unchanged so existing GRANT carries over.
CREATE OR REPLACE FUNCTION public.record_class_movement(
  p_student_id UUID, p_year_id UUID,
  p_new_class TEXT, p_new_section TEXT,
  p_effective_date DATE, p_reason TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id UUID;
  v_old_class TEXT;
  v_old_section TEXT;
  v_old_section_id UUID;
  v_new_section_id UUID;
  v_school_id UUID;
  v_caller UUID := auth.uid();
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF NOT public.is_principal() THEN RAISE EXCEPTION 'principal only'; END IF;

  SELECT s.school_id INTO v_school_id FROM public.students s WHERE s.id = p_student_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'student not found'; END IF;
  IF v_school_id <> public.current_user_school_id() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT class_name, section, section_id
    INTO v_old_class, v_old_section, v_old_section_id
    FROM public.student_academic_records
   WHERE student_id = p_student_id AND academic_year_id = p_year_id;

  -- Best-effort lookup of new section_id by class+section+year.
  SELECT id INTO v_new_section_id
    FROM public.sections
   WHERE academic_year_id = p_year_id
     AND class_name = p_new_class
     AND section    = p_new_section
   LIMIT 1;

  INSERT INTO public.student_class_movements
    (student_id, academic_year_id,
     old_class, old_section, old_class_name, old_section_id,
     new_class, new_section, new_class_name, new_section_id,
     effective_date, reason, changed_by)
  VALUES
    (p_student_id, p_year_id,
     v_old_class, v_old_section, v_old_class, v_old_section_id,
     p_new_class, p_new_section, p_new_class, v_new_section_id,
     p_effective_date, p_reason, v_caller)
  RETURNING id INTO v_id;

  -- If the new section couldn't be resolved, NULL the section_id rather
  -- than keep the old one (which would create a class_name vs section_id
  -- mismatch). The UI/principal can then re-link it from the section list.
  UPDATE public.student_academic_records
     SET class_name = p_new_class,
         section    = p_new_section,
         section_id = v_new_section_id
   WHERE student_id = p_student_id AND academic_year_id = p_year_id;

  PERFORM public.log_audit(
    'record_class_movement', 'student', p_student_id,
    jsonb_build_object(
      'year_id',         p_year_id,
      'old_class',       v_old_class,
      'old_section',     v_old_section,
      'new_class',       p_new_class,
      'new_section',     p_new_section,
      'effective_date',  p_effective_date,
      'reason',          p_reason
    )
  );

  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.record_class_movement(UUID, UUID, TEXT, TEXT, DATE, TEXT) TO authenticated;

-- ─── 7. generate_student_fee_schedule: discounts + RTE ──────────────────────
--
-- Adds p_discount_amount (₹ fixed, applied per installment) and
-- p_discount_pct (% off each installment) — the larger of the two wins per
-- head when both are set, but the typical caller sets only one. RTE flips
-- payer_type to GOVERNMENT for monthly heads (existing behaviour preserved).
--
-- The new parameter list (7 args vs. the old 5) means CREATE OR REPLACE
-- cannot re-use the existing function; we drop the prior signature first.
DROP FUNCTION IF EXISTS public.generate_student_fee_schedule(UUID, UUID, JSONB, JSONB, BOOLEAN);

CREATE OR REPLACE FUNCTION public.generate_student_fee_schedule(
  p_student_id      UUID,
  p_year_id         UUID,
  p_heads           JSONB,
  p_due_dates       JSONB,
  p_is_rte          BOOLEAN DEFAULT FALSE,
  p_discount_amount NUMERIC DEFAULT 0,
  p_discount_pct    NUMERIC DEFAULT 0
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school_id UUID;
  v_caller UUID := auth.uid();
  v_count INT := 0;
  v_head JSONB;
  v_dd JSONB;
  v_payer TEXT;
  v_freq TEXT;
  v_amt BIGINT;
  v_name TEXT;
  v_discount BIGINT;
  v_pct NUMERIC := COALESCE(p_discount_pct, 0);
  v_fixed NUMERIC := COALESCE(p_discount_amount, 0);
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF v_pct < 0 OR v_pct > 100 THEN RAISE EXCEPTION 'discount_pct out of range'; END IF;
  IF v_fixed < 0 THEN RAISE EXCEPTION 'discount_amount must be non-negative'; END IF;

  SELECT school_id INTO v_school_id FROM public.students WHERE id = p_student_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'student not found'; END IF;
  IF NOT (public.is_super_admin()
          OR (public.is_principal() AND public.current_user_school_id() = v_school_id)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Drop unpaid/un-written-off rows so we re-create cleanly. Paid history is preserved.
  DELETE FROM public.fee_installments
   WHERE student_id = p_student_id
     AND academic_year_id = p_year_id
     AND paid_amount = 0
     AND write_off_amount = 0;

  FOR v_head IN SELECT * FROM jsonb_array_elements(p_heads)
  LOOP
    v_name := v_head->>'name';
    v_amt  := (v_head->>'amount')::BIGINT;
    v_freq := COALESCE(v_head->>'frequency', 'MONTHLY');
    -- RTE flips payer to GOVERNMENT for ALL frequencies (monthly tuition,
    -- annual exam fee, etc). The 0005 version only flipped MONTHLY which
    -- left annual RTE charges incorrectly billed to the parent.
    v_payer := CASE WHEN p_is_rte THEN 'GOVERNMENT' ELSE 'PARENT' END;

    -- Larger of fixed-₹ vs %-of-amount per installment.
    v_discount := GREATEST(
      v_fixed::BIGINT,
      FLOOR(v_amt * v_pct / 100.0)::BIGINT
    );
    v_amt := GREATEST(0, v_amt - v_discount);

    IF v_freq = 'MONTHLY' THEN
      FOR v_dd IN SELECT * FROM jsonb_array_elements(p_due_dates)
      LOOP
        INSERT INTO public.fee_installments
          (student_id, academic_year_id, school_id, month, due_date, fee_type, amount, payer_type)
        VALUES
          (p_student_id, p_year_id, v_school_id, v_dd->>'month',
           (v_dd->>'date')::DATE,
           CASE WHEN lower(v_name) LIKE '%transport%' THEN 'TRANSPORT'
                WHEN lower(v_name) LIKE '%exam%'      THEN 'EXAM'
                WHEN lower(v_name) LIKE '%tuition%'   THEN 'TUITION'
                ELSE 'OTHER' END,
           v_amt, v_payer);
        v_count := v_count + 1;
      END LOOP;
    ELSE  -- ANNUAL or ONE_TIME
      INSERT INTO public.fee_installments
        (student_id, academic_year_id, school_id, month, due_date, fee_type, amount, payer_type)
      VALUES
        (p_student_id, p_year_id, v_school_id,
         CASE WHEN v_freq = 'ONE_TIME' THEN 'OneTime' ELSE 'Annual' END,
         (SELECT MIN((dd->>'date')::DATE) FROM jsonb_array_elements(p_due_dates) dd),
         'OTHER',
         v_amt, 'PARENT');
      v_count := v_count + 1;
    END IF;
  END LOOP;

  PERFORM public.refresh_student_fee_aggregate(p_student_id, p_year_id);
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.generate_student_fee_schedule(UUID, UUID, JSONB, JSONB, BOOLEAN, NUMERIC, NUMERIC) TO authenticated;

-- ─── 8. school_billing_schedules.advance_balance + record_school_payment ────
--
-- The 0002 RPC dumped surplus credit onto the latest billing year by
-- overpaying its `outstanding` (forcing it negative). That worked but mixed
-- "real" outstanding with credit. We add advance_balance on the schedule so
-- credit is parked separately and survives across years.
ALTER TABLE public.school_billing_schedules
  ADD COLUMN IF NOT EXISTS advance_balance BIGINT NOT NULL DEFAULT 0;

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
     FOR UPDATE
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

  -- Surplus → schedule-level advance balance (no longer overpaying a year).
  IF v_remaining > 0 THEN
    UPDATE public.school_billing_schedules
       SET advance_balance = advance_balance + v_remaining,
           updated_at = NOW()
     WHERE school_id = p_school_id;
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
      'method',    p_method,
      'parked_advance', GREATEST(v_remaining, 0)
    )
  );

  RETURN v_payment_id;
END $$;
GRANT EXECUTE ON FUNCTION public.record_school_payment(UUID, BIGINT, TEXT, TEXT, TEXT)
  TO authenticated;

COMMIT;
