-- ============================================================================
-- 0005 — Principal-side helpers, new tables, and atomic RPCs.
-- All PKs remain UUIDs. Idempotent.
-- ============================================================================

-- ─── 0. Extend existing tables with principal-needed columns ────────────────

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS tagline TEXT,
  ADD COLUMN IF NOT EXISTS city    TEXT,
  ADD COLUMN IF NOT EXISTS state   TEXT,
  ADD COLUMN IF NOT EXISTS pin     TEXT,
  ADD COLUMN IF NOT EXISTS email   TEXT,
  ADD COLUMN IF NOT EXISTS affiliation_board TEXT;

-- ─── 1. New tables for principal features ───────────────────────────────────

-- Per-class fee structure plans defined by principal (heads + due dates).
CREATE TABLE IF NOT EXISTS public.fee_structures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  class_name TEXT NOT NULL,
  fee_heads JSONB NOT NULL DEFAULT '[]'::jsonb,        -- [{name, amount, frequency, description}]
  monthly_due_dates JSONB NOT NULL DEFAULT '[]'::jsonb,-- [{month, date}]
  late_fee JSONB NOT NULL DEFAULT '{}'::jsonb,         -- {enabled, gracePeriodDays, type, amount, maxCap}
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS fee_structures_school_year_idx
  ON public.fee_structures(school_id, academic_year_id);

-- Staff attendance records (separate from student attendance).
CREATE TABLE IF NOT EXISTS public.staff_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PRESENT','ABSENT','HALF_DAY','LEAVE','LATE','HOLIDAY')),
  marked_by UUID REFERENCES public.users(id),
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(staff_id, date)
);
CREATE INDEX IF NOT EXISTS staff_attendance_school_idx
  ON public.staff_attendance(school_id, date);

-- Assets (library books, lab equipment, generic inventory).
CREATE TABLE IF NOT EXISTS public.assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('BOOK','LAB_EQUIPMENT','OTHER')),
  name TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_count INT NOT NULL DEFAULT 0,
  available_count INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS assets_school_category_idx
  ON public.assets(school_id, category);

-- Asset issues (book/equipment loans to students/staff).
CREATE TABLE IF NOT EXISTS public.asset_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id UUID REFERENCES public.students(id),
  staff_id UUID REFERENCES public.staff(id),
  borrower_name TEXT,
  issued_at DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  returned_at DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS asset_issues_asset_idx ON public.asset_issues(asset_id);
CREATE INDEX IF NOT EXISTS asset_issues_school_idx ON public.asset_issues(school_id);

-- Enable RLS + apply standard "school-scoped" policy for the new tables.
DO $$
DECLARE t TEXT;
DECLARE tables TEXT[] := ARRAY['fee_structures','staff_attendance','assets','asset_issues'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT USING (public.is_super_admin() OR (public.current_user_role() IN (''PRINCIPAL'',''TEACHER'') AND school_id = public.current_user_school_id()))',
      t || '_select', t
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_write', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL USING (public.is_super_admin() OR (public.is_principal() AND school_id = public.current_user_school_id())) WITH CHECK (public.is_super_admin() OR (public.is_principal() AND school_id = public.current_user_school_id()))',
      t || '_write', t
    );
  END LOOP;
END $$;

-- updated_at trigger for new tables that have updated_at column.
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['fee_structures','assets']) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()', t, t);
  END LOOP;
END $$;

-- ─── 2. Helper for installment status derivation ────────────────────────────

CREATE OR REPLACE FUNCTION public.compute_installment_status(
  p_amount BIGINT, p_paid BIGINT, p_writeoff BIGINT, p_due DATE
) RETURNS TEXT
LANGUAGE SQL IMMUTABLE AS $$
  SELECT CASE
    WHEN p_paid + p_writeoff >= p_amount THEN 'PAID'
    WHEN p_paid > 0 THEN 'PARTIAL'
    WHEN p_due < CURRENT_DATE THEN 'OVERDUE'
    ELSE 'UNPAID'
  END
$$;

-- ─── 3. Atomic fee-payment RPC (oldest-due-first allocation) ────────────────
--
-- Allocates p_amount across the student's UNPAID/PARTIAL installments in
-- order of due_date ASC. Any remainder becomes / adds to advance_balances.
-- Optionally pulls down advance_balance first when starting the run if
-- p_use_advance is TRUE. Returns the new payment_records.id.
--
CREATE OR REPLACE FUNCTION public.record_fee_payment(
  p_student_id UUID,
  p_amount BIGINT,
  p_method TEXT DEFAULT 'CASH',
  p_date DATE DEFAULT CURRENT_DATE,
  p_note TEXT DEFAULT NULL,
  p_use_advance BOOLEAN DEFAULT FALSE
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school_id UUID;
  v_year_id   UUID;
  v_payment_id UUID;
  v_remaining BIGINT;
  v_receipt   TEXT;
  v_inst RECORD;
  v_apply BIGINT;
  v_advance BIGINT := 0;
  v_caller UUID := auth.uid();
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;

  -- Authorize: caller must be SUPER_ADMIN or principal of the student's school.
  SELECT school_id INTO v_school_id FROM public.students WHERE id = p_student_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'student not found'; END IF;
  IF NOT (public.is_super_admin()
          OR (public.is_principal() AND public.current_user_school_id() = v_school_id)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Pick the active academic year for this school.
  SELECT id INTO v_year_id FROM public.academic_years
   WHERE school_id = v_school_id AND is_active = TRUE
   LIMIT 1;
  IF v_year_id IS NULL THEN RAISE EXCEPTION 'no active academic year for school'; END IF;

  v_remaining := p_amount;

  -- Optionally fold in the existing advance balance first.
  IF p_use_advance THEN
    SELECT amount INTO v_advance FROM public.advance_balances WHERE student_id = p_student_id;
    IF COALESCE(v_advance, 0) > 0 THEN
      v_remaining := v_remaining + v_advance;
      UPDATE public.advance_balances SET amount = 0, updated_at = NOW()
        WHERE student_id = p_student_id;
    END IF;
  END IF;

  -- Generate receipt number (school-scoped, monotonic-ish).
  v_receipt := 'RCT-' || to_char(NOW(),'YYYYMMDDHH24MISS') || '-' || substr(p_student_id::text, 1, 4);

  -- Create the payment row first (we'll patch advance_amount at the end).
  INSERT INTO public.payment_records
    (student_id, school_id, academic_year_id, amount, method, date, receipt_no, note)
  VALUES
    (p_student_id, v_school_id, v_year_id, p_amount, p_method, p_date, v_receipt, p_note)
  RETURNING id INTO v_payment_id;

  -- Walk installments oldest-due-first, skipping fully-PAID and govt-payer rows.
  -- Lock with FOR UPDATE so concurrent payments don't double-count.
  FOR v_inst IN
    SELECT id, amount, paid_amount, write_off_amount, due_date
      FROM public.fee_installments
     WHERE student_id = p_student_id
       AND payer_type = 'PARENT'
       AND (amount - paid_amount - write_off_amount) > 0
     ORDER BY due_date ASC, created_at ASC
     FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_apply := LEAST(v_remaining, v_inst.amount - v_inst.paid_amount - v_inst.write_off_amount);
    UPDATE public.fee_installments
       SET paid_amount = paid_amount + v_apply,
           status = public.compute_installment_status(amount, paid_amount + v_apply, write_off_amount, due_date),
           updated_at = NOW()
     WHERE id = v_inst.id;

    INSERT INTO public.payment_installment_links
      (payment_id, installment_id, amount_applied)
    VALUES (v_payment_id, v_inst.id, v_apply);

    v_remaining := v_remaining - v_apply;
  END LOOP;

  -- Whatever's left becomes (or adds to) advance balance.
  IF v_remaining > 0 THEN
    INSERT INTO public.advance_balances (student_id, amount)
    VALUES (p_student_id, v_remaining)
    ON CONFLICT (student_id) DO UPDATE
      SET amount = public.advance_balances.amount + EXCLUDED.amount,
          updated_at = NOW();
    UPDATE public.payment_records SET advance_amount = v_remaining WHERE id = v_payment_id;
  END IF;

  -- Refresh student_academic_records aggregates.
  PERFORM public.refresh_student_fee_aggregate(p_student_id, v_year_id);

  -- Audit.
  INSERT INTO public.audit_logs (user_id, school_id, action, entity_type, entity_id, details)
  VALUES (v_caller, v_school_id, 'fee_payment', 'payment', v_payment_id,
          jsonb_build_object('amount', p_amount, 'student_id', p_student_id,
                             'receipt', v_receipt, 'used_advance', p_use_advance));

  RETURN v_payment_id;
END $$;
GRANT EXECUTE ON FUNCTION public.record_fee_payment(UUID, BIGINT, TEXT, DATE, TEXT, BOOLEAN) TO authenticated;

-- Helper used by both fee + govt payment paths.
CREATE OR REPLACE FUNCTION public.refresh_student_fee_aggregate(
  p_student_id UUID, p_year_id UUID
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total BIGINT;
  v_paid  BIGINT;
  v_status TEXT;
BEGIN
  SELECT COALESCE(SUM(amount), 0), COALESCE(SUM(paid_amount + write_off_amount), 0)
    INTO v_total, v_paid
    FROM public.fee_installments
   WHERE student_id = p_student_id AND academic_year_id = p_year_id;

  v_status := CASE
    WHEN v_total = 0 THEN 'PENDING'
    WHEN v_paid >= v_total THEN 'PAID'
    WHEN v_paid > 0 THEN 'PARTIAL'
    ELSE 'PENDING'
  END;

  UPDATE public.student_academic_records
     SET total_fee = v_total, paid_fee = v_paid, fee_status = v_status
   WHERE student_id = p_student_id AND academic_year_id = p_year_id;
END $$;
GRANT EXECUTE ON FUNCTION public.refresh_student_fee_aggregate(UUID, UUID) TO authenticated;

-- ─── 4. Government bulk payment (RTE) ────────────────────────────────────────
--
-- Records one government payment row, links it to all p_student_ids, and
-- allocates the per-student share by paying down the oldest TUITION
-- installments whose payer_type='GOVERNMENT'.
--
CREATE OR REPLACE FUNCTION public.record_govt_payment(
  p_amount BIGINT,
  p_date DATE,
  p_reference TEXT,
  p_note TEXT,
  p_student_ids UUID[]
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school_id UUID;
  v_payment_id UUID;
  v_per_student BIGINT;
  v_caller UUID := auth.uid();
  v_sid UUID;
  v_remaining BIGINT;
  v_inst RECORD;
  v_apply BIGINT;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF array_length(p_student_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'no students provided';
  END IF;

  v_school_id := public.current_user_school_id();
  IF v_school_id IS NULL AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- All students must belong to the caller's school (or caller is super admin).
  IF NOT public.is_super_admin() THEN
    IF EXISTS (SELECT 1 FROM unnest(p_student_ids) sid
                LEFT JOIN public.students s ON s.id = sid
                WHERE s.school_id IS DISTINCT FROM v_school_id) THEN
      RAISE EXCEPTION 'one or more students belong to a different school';
    END IF;
  END IF;

  v_per_student := (p_amount / array_length(p_student_ids, 1))::BIGINT;
  IF v_per_student <= 0 THEN RAISE EXCEPTION 'amount per student must be positive'; END IF;

  INSERT INTO public.government_payments (school_id, amount, date, reference_no, note)
  VALUES (v_school_id, p_amount, p_date, p_reference, p_note)
  RETURNING id INTO v_payment_id;

  FOREACH v_sid IN ARRAY p_student_ids LOOP
    INSERT INTO public.govt_payment_student_links (govt_payment_id, student_id)
    VALUES (v_payment_id, v_sid);

    v_remaining := v_per_student;
    FOR v_inst IN
      SELECT id, amount, paid_amount, write_off_amount, academic_year_id
        FROM public.fee_installments
       WHERE student_id = v_sid
         AND payer_type = 'GOVERNMENT'
         AND fee_type = 'TUITION'
         AND (amount - paid_amount - write_off_amount) > 0
       ORDER BY due_date ASC
       FOR UPDATE
    LOOP
      EXIT WHEN v_remaining <= 0;
      v_apply := LEAST(v_remaining, v_inst.amount - v_inst.paid_amount - v_inst.write_off_amount);
      UPDATE public.fee_installments
         SET paid_amount = paid_amount + v_apply,
             status = public.compute_installment_status(amount, paid_amount + v_apply, write_off_amount, due_date),
             related_id = v_payment_id,
             updated_at = NOW()
       WHERE id = v_inst.id;
      v_remaining := v_remaining - v_apply;
    END LOOP;

    -- Refresh aggregate for whichever year contained the payments.
    UPDATE public.student_academic_records sar
       SET total_fee = COALESCE((SELECT SUM(amount) FROM public.fee_installments fi WHERE fi.student_id = v_sid AND fi.academic_year_id = sar.academic_year_id), 0),
           paid_fee  = COALESCE((SELECT SUM(paid_amount + write_off_amount) FROM public.fee_installments fi WHERE fi.student_id = v_sid AND fi.academic_year_id = sar.academic_year_id), 0)
     WHERE sar.student_id = v_sid;
  END LOOP;

  INSERT INTO public.audit_logs (user_id, school_id, action, entity_type, entity_id, details)
  VALUES (v_caller, v_school_id, 'govt_payment', 'government_payment', v_payment_id,
          jsonb_build_object('amount', p_amount, 'students', array_length(p_student_ids, 1),
                             'reference', p_reference));
  RETURN v_payment_id;
END $$;
GRANT EXECUTE ON FUNCTION public.record_govt_payment(BIGINT, DATE, TEXT, TEXT, UUID[]) TO authenticated;

-- ─── 5. Fee schedule generator for a student ─────────────────────────────────
--
-- Wipes any existing UNPAID installments for the student/year (won't touch
-- ones with paid_amount > 0 or write_offs) and re-creates them from the
-- supplied heads + monthly_due_dates.
--
CREATE OR REPLACE FUNCTION public.generate_student_fee_schedule(
  p_student_id UUID,
  p_year_id UUID,
  p_heads JSONB,           -- [{name, amount, frequency, description}]
  p_due_dates JSONB,       -- [{month, date}]
  p_is_rte BOOLEAN DEFAULT FALSE
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
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT school_id INTO v_school_id FROM public.students WHERE id = p_student_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'student not found'; END IF;
  IF NOT (public.is_super_admin()
          OR (public.is_principal() AND public.current_user_school_id() = v_school_id)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Drop schedule rows that have not been paid/written-off yet.
  DELETE FROM public.fee_installments
   WHERE student_id = p_student_id
     AND academic_year_id = p_year_id
     AND paid_amount = 0
     AND write_off_amount = 0;

  -- Re-create from the structure.
  FOR v_head IN SELECT * FROM jsonb_array_elements(p_heads)
  LOOP
    v_name := v_head->>'name';
    v_amt := (v_head->>'amount')::BIGINT;
    v_freq := COALESCE(v_head->>'frequency', 'MONTHLY');
    v_payer := CASE WHEN p_is_rte AND v_freq = 'MONTHLY' THEN 'GOVERNMENT' ELSE 'PARENT' END;

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
         CASE WHEN lower(v_name) LIKE '%admission%' THEN 'OTHER' ELSE 'OTHER' END,
         v_amt, 'PARENT');
      v_count := v_count + 1;
    END IF;
  END LOOP;

  PERFORM public.refresh_student_fee_aggregate(p_student_id, p_year_id);
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.generate_student_fee_schedule(UUID, UUID, JSONB, JSONB, BOOLEAN) TO authenticated;

-- ─── 6. Academic year RPCs ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_academic_year(
  p_label TEXT, p_start DATE, p_end DATE, p_board TEXT DEFAULT 'CBSE', p_medium TEXT DEFAULT 'English'
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school UUID := public.current_user_school_id();
  v_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF NOT public.is_principal() THEN RAISE EXCEPTION 'principal only'; END IF;
  IF v_school IS NULL THEN RAISE EXCEPTION 'no school for caller'; END IF;

  UPDATE public.academic_years SET is_active = FALSE WHERE school_id = v_school AND is_active;

  INSERT INTO public.academic_years (school_id, label, start_date, end_date, is_active, board, medium)
  VALUES (v_school, p_label, p_start, p_end, TRUE, p_board, p_medium)
  RETURNING id INTO v_id;

  INSERT INTO public.audit_logs (user_id, school_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), v_school, 'create_year', 'academic_year', v_id,
          jsonb_build_object('label', p_label, 'start', p_start, 'end', p_end));
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_academic_year(TEXT, DATE, DATE, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_active_academic_year(p_year_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_school UUID := public.current_user_school_id();
BEGIN
  IF NOT public.is_principal() THEN RAISE EXCEPTION 'principal only'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.academic_years WHERE id = p_year_id AND school_id = v_school) THEN
    RAISE EXCEPTION 'year not found in school';
  END IF;
  UPDATE public.academic_years SET is_active = (id = p_year_id) WHERE school_id = v_school;
END $$;
GRANT EXECUTE ON FUNCTION public.set_active_academic_year(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.close_academic_year(p_year_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_school UUID := public.current_user_school_id();
BEGIN
  IF NOT public.is_principal() THEN RAISE EXCEPTION 'principal only'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.academic_years WHERE id = p_year_id AND school_id = v_school) THEN
    RAISE EXCEPTION 'year not found in school';
  END IF;
  UPDATE public.academic_years
     SET is_closed = TRUE, is_active = FALSE
   WHERE id = p_year_id;
  INSERT INTO public.audit_logs (user_id, school_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), v_school, 'close_year', 'academic_year', p_year_id, '{}'::jsonb);
END $$;
GRANT EXECUTE ON FUNCTION public.close_academic_year(UUID) TO authenticated;

-- ─── 7. Promotion (year closing step 4) ──────────────────────────────────────
--
-- p_decisions = [{ student_id, action: 'PROMOTE'|'REPEAT'|'TC', new_class_name? }]
-- Creates next-year academic_record rows for PROMOTE/REPEAT and marks TC.
--
CREATE OR REPLACE FUNCTION public.promote_students(
  p_from_year_id UUID, p_to_year_id UUID, p_decisions JSONB
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school UUID := public.current_user_school_id();
  v_d JSONB;
  v_sid UUID;
  v_action TEXT;
  v_new_class TEXT;
  v_old RECORD;
  v_carry BIGINT;
  v_count INT := 0;
BEGIN
  IF NOT public.is_principal() THEN RAISE EXCEPTION 'principal only'; END IF;

  FOR v_d IN SELECT * FROM jsonb_array_elements(p_decisions)
  LOOP
    v_sid := (v_d->>'student_id')::UUID;
    v_action := COALESCE(v_d->>'action', 'PROMOTE');
    v_new_class := v_d->>'new_class_name';

    SELECT class_name, section, total_fee, paid_fee
      INTO v_old
      FROM public.student_academic_records
     WHERE student_id = v_sid AND academic_year_id = p_from_year_id;
    IF NOT FOUND THEN CONTINUE; END IF;

    -- Mark prior year status
    UPDATE public.student_academic_records
       SET status = CASE v_action WHEN 'PROMOTE' THEN 'PROMOTED'
                                  WHEN 'REPEAT'  THEN 'FAILED'
                                  WHEN 'TC'      THEN 'TC' END,
           is_promoted = (v_action = 'PROMOTE')
     WHERE student_id = v_sid AND academic_year_id = p_from_year_id;

    IF v_action = 'TC' THEN
      UPDATE public.students SET status = 'TC_ISSUED', is_active = FALSE WHERE id = v_sid;
    ELSE
      v_carry := GREATEST(0, v_old.total_fee - v_old.paid_fee);
      INSERT INTO public.student_academic_records
        (student_id, academic_year_id, class_name, section, roll_no,
         total_fee, paid_fee, fee_status)
      VALUES
        (v_sid, p_to_year_id,
         COALESCE(v_new_class, v_old.class_name),
         v_old.section, NULL,
         v_carry, 0,
         CASE WHEN v_carry = 0 THEN 'PENDING' ELSE 'PENDING' END)
      ON CONFLICT (student_id, academic_year_id) DO NOTHING;
    END IF;
    v_count := v_count + 1;
  END LOOP;

  INSERT INTO public.audit_logs (user_id, school_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), v_school, 'promote_students', 'academic_year', p_to_year_id,
          jsonb_build_object('count', v_count));
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.promote_students(UUID, UUID, JSONB) TO authenticated;

-- ─── 8. Critical-field change request workflow ──────────────────────────────

CREATE OR REPLACE FUNCTION public.submit_change_request(
  p_student_id UUID, p_field TEXT, p_new_value TEXT, p_reason TEXT, p_proof TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school UUID;
  v_old TEXT;
  v_change_id UUID;
  v_approval_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT school_id INTO v_school FROM public.students WHERE id = p_student_id;
  IF v_school IS NULL THEN RAISE EXCEPTION 'student not found'; END IF;
  IF NOT (public.is_super_admin()
          OR (public.is_principal() AND public.current_user_school_id() = v_school)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  EXECUTE format('SELECT %I::text FROM public.students WHERE id = $1', p_field)
    INTO v_old USING p_student_id;

  INSERT INTO public.student_change_history
    (student_id, field_name, old_value, new_value, reason, proof_url, changed_by)
  VALUES (p_student_id, p_field, v_old, p_new_value, p_reason, p_proof, auth.uid())
  RETURNING id INTO v_change_id;

  INSERT INTO public.approvals
    (school_id, request_type, requested_by, entity_type, entity_id, old_value, new_value, proof_url)
  VALUES (v_school, 'PROFILE_CHANGE', auth.uid(), 'student', p_student_id,
          jsonb_build_object('field', p_field, 'value', v_old),
          jsonb_build_object('field', p_field, 'value', p_new_value, 'change_id', v_change_id),
          p_proof)
  RETURNING id INTO v_approval_id;

  RETURN v_approval_id;
END $$;
GRANT EXECUTE ON FUNCTION public.submit_change_request(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_change_request(p_approval_id UUID, p_approve BOOLEAN, p_reason TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_app RECORD;
  v_field TEXT;
  v_value TEXT;
  v_change_id UUID;
BEGIN
  IF NOT public.is_principal() THEN RAISE EXCEPTION 'principal only'; END IF;
  SELECT * INTO v_app FROM public.approvals WHERE id = p_approval_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'approval not found'; END IF;
  IF v_app.status <> 'PENDING' THEN RAISE EXCEPTION 'approval already resolved'; END IF;
  IF v_app.school_id <> public.current_user_school_id() THEN RAISE EXCEPTION 'forbidden'; END IF;

  IF p_approve THEN
    v_field := v_app.new_value->>'field';
    v_value := v_app.new_value->>'value';
    v_change_id := (v_app.new_value->>'change_id')::UUID;
    IF v_app.request_type = 'PROFILE_CHANGE' AND v_field IS NOT NULL THEN
      EXECUTE format('UPDATE public.students SET %I = $1, updated_at = NOW() WHERE id = $2', v_field)
        USING v_value, v_app.entity_id;
      UPDATE public.student_change_history SET approved_by = auth.uid() WHERE id = v_change_id;
    END IF;
  END IF;

  UPDATE public.approvals
     SET status = CASE WHEN p_approve THEN 'APPROVED' ELSE 'REJECTED' END,
         approved_by = auth.uid(),
         approved_at = NOW()
   WHERE id = p_approval_id;
END $$;
GRANT EXECUTE ON FUNCTION public.apply_change_request(UUID, BOOLEAN, TEXT) TO authenticated;

-- ─── 9. Mid-year class movement ─────────────────────────────────────────────

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
BEGIN
  IF NOT public.is_principal() THEN RAISE EXCEPTION 'principal only'; END IF;

  SELECT class_name, section INTO v_old_class, v_old_section
    FROM public.student_academic_records
   WHERE student_id = p_student_id AND academic_year_id = p_year_id;

  INSERT INTO public.student_class_movements
    (student_id, academic_year_id, old_class, old_section, new_class, new_section, effective_date, reason)
  VALUES (p_student_id, p_year_id, v_old_class, v_old_section, p_new_class, p_new_section, p_effective_date, p_reason)
  RETURNING id INTO v_id;

  -- Update current academic record to reflect new class/section as the current placement.
  UPDATE public.student_academic_records
     SET class_name = p_new_class, section = p_new_section
   WHERE student_id = p_student_id AND academic_year_id = p_year_id;

  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.record_class_movement(UUID, UUID, TEXT, TEXT, DATE, TEXT) TO authenticated;
