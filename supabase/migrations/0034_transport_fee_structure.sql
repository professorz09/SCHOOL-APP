-- ============================================================================
-- 0034 — Transport fee structures (Task #29)
--
-- Wires VEHICLE-type fee_structures all the way through transport assignment
-- so transport bills are generated from a structure (heads + due dates),
-- traceable back to the structure, the same way class assignment already is.
--
-- Changes:
--   1. Add fee_structure_id UUID (nullable, FK → fee_structures.id) to
--      student_transport_assignments. New transport rows MUST populate it
--      (enforced in app code); legacy rows stay NULL so historical data is
--      preserved.
--   2. Mirror the same column on student_academic_records so the audit trail
--      for class assignments is symmetric (kept nullable for backward
--      compatibility with rows created before this migration).
--   3. RPC `generate_transport_fee_schedule(p_student_id, p_year_id,
--      p_assignment_id, p_heads, p_due_dates)` — mirrors
--      `generate_student_fee_schedule` (0005) but ONLY touches TRANSPORT
--      installments tied to `p_assignment_id`. Drops only unpaid TRANSPORT
--      rows for the assignment, then re-inserts from the structure's heads
--      x due-dates with `fee_type='TRANSPORT'`, `payer_type='PARENT'`,
--      `related_id = p_assignment_id`.
--
-- Idempotent — every column / index / function uses IF NOT EXISTS or
-- CREATE OR REPLACE.
-- ============================================================================

ALTER TABLE public.student_transport_assignments
  ADD COLUMN IF NOT EXISTS fee_structure_id UUID
  REFERENCES public.fee_structures(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS sta_fee_structure_idx
  ON public.student_transport_assignments (fee_structure_id);

ALTER TABLE public.student_academic_records
  ADD COLUMN IF NOT EXISTS fee_structure_id UUID
  REFERENCES public.fee_structures(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS sar_fee_structure_idx
  ON public.student_academic_records (fee_structure_id);

-- An earlier draft of this migration shipped the RPC with a JSONB-based
-- signature (heads + due_dates supplied by the client). The hardened
-- version below takes only the structure id and looks the heads up
-- server-side, so we drop the old signature first to avoid an overload
-- ambiguity at call time.
DROP FUNCTION IF EXISTS public.generate_transport_fee_schedule(UUID, UUID, UUID, JSONB, JSONB);

-- ----------------------------------------------------------------------------
-- generate_transport_fee_schedule
--
-- Schedule generator for TRANSPORT installments tied to a single
-- student_transport_assignments row. Modeled on
-- generate_student_fee_schedule (0005) with four deliberate differences:
--
--   * Scope is narrowed to ONE assignment via `related_id = p_assignment_id`
--     so re-running it for a different vehicle on the same student in the
--     same year doesn't wipe other transport rows.
--   * Only UNPAID/no-write-off rows are dropped. Paid / partially-paid rows
--     stay intact — receipts are immutable.
--   * Every inserted row is fee_type='TRANSPORT' regardless of head name,
--     and payer_type is always 'PARENT' (transport fees are never
--     RTE/government-paid).
--   * Heads + due-dates are read SERVER-SIDE from fee_structures by id —
--     never accepted from the client. The structure is validated to be
--     same-school + structure_type='VEHICLE' + same academic year so a
--     tampered client payload can't silently bill the wrong amounts.
--
-- Frequencies: MONTHLY → one row per due-date, ANNUAL/ONE_TIME → single
-- row using earliest due-date (matches the class-side behaviour).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_transport_fee_schedule(
  p_student_id       UUID,
  p_year_id          UUID,
  p_assignment_id    UUID,
  p_fee_structure_id UUID
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school_id          UUID;
  v_caller             UUID := auth.uid();
  v_count              INT  := 0;
  v_head               JSONB;
  v_dd                 JSONB;
  v_freq               TEXT;
  v_amt                BIGINT;
  v_heads              JSONB;
  v_due_dates          JSONB;
  v_struct_school      UUID;
  v_struct_year        UUID;
  v_struct_type        TEXT;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF p_assignment_id    IS NULL THEN RAISE EXCEPTION 'assignment_id required'; END IF;
  IF p_fee_structure_id IS NULL THEN RAISE EXCEPTION 'fee_structure_id required'; END IF;

  SELECT school_id INTO v_school_id FROM public.students WHERE id = p_student_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'student not found'; END IF;

  IF NOT (public.is_super_admin()
          OR (public.is_principal() AND public.current_user_school_id() = v_school_id)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Server-authoritative structure lookup. Reject any structure that
  -- doesn't belong to the same school, isn't VEHICLE-type, or doesn't
  -- match the assignment's academic year — protects against tampered
  -- client payloads silently billing the wrong amounts.
  SELECT school_id, academic_year_id, structure_type, fee_heads, monthly_due_dates
    INTO v_struct_school, v_struct_year, v_struct_type, v_heads, v_due_dates
    FROM public.fee_structures
   WHERE id = p_fee_structure_id;
  IF v_struct_school IS NULL THEN RAISE EXCEPTION 'fee structure not found'; END IF;
  IF v_struct_school <> v_school_id THEN
    RAISE EXCEPTION 'fee structure belongs to a different school';
  END IF;
  IF v_struct_year <> p_year_id THEN
    RAISE EXCEPTION 'fee structure year mismatch';
  END IF;
  IF COALESCE(v_struct_type, 'CLASS') <> 'VEHICLE' THEN
    RAISE EXCEPTION 'fee structure is not VEHICLE-type';
  END IF;
  IF v_due_dates IS NULL OR jsonb_typeof(v_due_dates) <> 'array' OR jsonb_array_length(v_due_dates) = 0 THEN
    RAISE EXCEPTION 'fee structure has no monthly due dates';
  END IF;

  -- Defense in depth: make sure the assignment row actually belongs to
  -- this student + year before we touch any installments. Catches caller
  -- bugs and tampered RPC payloads where the assignment id was swapped
  -- for someone else's. PERFORM raises NO_DATA_FOUND if zero rows match.
  PERFORM 1
    FROM public.student_transport_assignments
   WHERE id               = p_assignment_id
     AND student_id       = p_student_id
     AND academic_year_id = p_year_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'assignment % does not belong to student % / year %',
      p_assignment_id, p_student_id, p_year_id;
  END IF;

  -- Drop only unpaid TRANSPORT rows tied to THIS assignment so re-running
  -- after a structure edit doesn't duplicate, and so other transport
  -- assignments for the same student/year (legacy) aren't disturbed.
  DELETE FROM public.fee_installments
   WHERE student_id       = p_student_id
     AND academic_year_id = p_year_id
     AND fee_type         = 'TRANSPORT'
     AND related_id       = p_assignment_id
     AND paid_amount      = 0
     AND write_off_amount = 0;

  -- Re-create from the structure.
  FOR v_head IN SELECT * FROM jsonb_array_elements(v_heads)
  LOOP
    v_amt  := COALESCE((v_head->>'amount')::BIGINT, 0);
    v_freq := COALESCE(v_head->>'frequency', 'MONTHLY');

    IF v_amt = 0 THEN CONTINUE; END IF;

    IF v_freq = 'MONTHLY' THEN
      FOR v_dd IN SELECT * FROM jsonb_array_elements(v_due_dates)
      LOOP
        INSERT INTO public.fee_installments
          (student_id, academic_year_id, school_id, month, due_date,
           fee_type, amount, payer_type, related_id)
        VALUES
          (p_student_id, p_year_id, v_school_id,
           v_dd->>'month',
           (v_dd->>'date')::DATE,
           'TRANSPORT', v_amt, 'PARENT', p_assignment_id);
        v_count := v_count + 1;
      END LOOP;
    ELSE  -- ANNUAL or ONE_TIME
      INSERT INTO public.fee_installments
        (student_id, academic_year_id, school_id, month, due_date,
         fee_type, amount, payer_type, related_id)
      VALUES
        (p_student_id, p_year_id, v_school_id,
         CASE WHEN v_freq = 'ONE_TIME' THEN 'OneTime' ELSE 'Annual' END,
         (SELECT MIN((dd->>'date')::DATE) FROM jsonb_array_elements(v_due_dates) dd),
         'TRANSPORT', v_amt, 'PARENT', p_assignment_id);
      v_count := v_count + 1;
    END IF;
  END LOOP;

  PERFORM public.refresh_student_fee_aggregate(p_student_id, p_year_id);
  RETURN v_count;
END $$;

GRANT EXECUTE ON FUNCTION
  public.generate_transport_fee_schedule(UUID, UUID, UUID, UUID)
  TO authenticated;
