-- ============================================================================
-- 0025 — Transport assignment history hardening (Task #6)
--
-- Purely additive on top of 0001 + 0017:
--   * student_transport_assignments already has start_date / end_date /
--     is_active / reason / changed_by (0001 + 0017).
--   * This migration adds:
--       end_reason  TEXT   — why a row was closed (separate from `reason`,
--                            which captures why a row was created).
--       ended_by    UUID   — user that closed the row.
--   * Adds a (student_id, start_date DESC) index so the per-student
--     timeline view is cheap.
--   * Idempotent — every column / index / function uses IF NOT EXISTS or
--     CREATE OR REPLACE.
-- ============================================================================

ALTER TABLE public.student_transport_assignments
  ADD COLUMN IF NOT EXISTS end_reason TEXT;

ALTER TABLE public.student_transport_assignments
  ADD COLUMN IF NOT EXISTS ended_by UUID REFERENCES public.users(id);

CREATE INDEX IF NOT EXISTS sta_student_start_idx
  ON public.student_transport_assignments (student_id, start_date DESC);

CREATE INDEX IF NOT EXISTS sta_vehicle_active_idx
  ON public.student_transport_assignments (vehicle_id)
  WHERE is_active = TRUE;

-- ----------------------------------------------------------------------------
-- bulk_close_transport_assignments(p_from_vehicle, p_effective_date,
--                                  p_end_reason)
--
-- Closes every active assignment on `p_from_vehicle` by setting
--   end_date    = p_effective_date - 1 day  (so p_effective_date can host
--                                            the new row's start_date)
--   is_active   = FALSE
--   end_reason  = p_end_reason
--   ended_by    = caller (auth.uid())
-- and returns the affected (student_id, stop_id, monthly_amount, academic_year_id)
-- rows so the caller can rebuild new assignments. Cancels any future-dated
-- TRANSPORT installments that were tied to those rows (only UNPAID ones —
-- partially-paid rows are flipped to status='CANCELLED' and their `amount`
-- frozen at `paid_amount + write_off_amount` so they no longer count as
-- outstanding but the historical receipt remains intact).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bulk_close_transport_assignments(
  p_from_vehicle    UUID,
  p_effective_date  DATE,
  p_end_reason      TEXT
)
RETURNS TABLE (
  assignment_id    UUID,
  student_id       UUID,
  stop_id          UUID,
  monthly_amount   BIGINT,
  academic_year_id UUID
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_school_id UUID;
BEGIN
  IF p_from_vehicle IS NULL OR p_effective_date IS NULL THEN
    RAISE EXCEPTION 'bulk_close_transport_assignments: vehicle and date required';
  END IF;

  SELECT school_id INTO v_school_id
    FROM public.transport_vehicles
   WHERE id = p_from_vehicle;
  IF v_school_id IS NULL THEN
    RAISE EXCEPTION 'Vehicle not found';
  END IF;

  -- Authz: super admin OR same-school principal/teacher.
  IF NOT (
    public.is_super_admin()
    OR v_school_id = public.current_user_school_id()
  ) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  -- Cancel future-dated TRANSPORT installments tied to those assignments
  -- (UNPAID rows → DELETE, PARTIAL rows → freeze amount + flag CANCELLED so
  -- they don't show as outstanding any more but the receipt history stays).
  DELETE FROM public.fee_installments fi
   USING public.student_transport_assignments sta
   WHERE fi.related_id   = sta.id
     AND sta.vehicle_id  = p_from_vehicle
     AND sta.is_active   = TRUE
     AND fi.fee_type     = 'TRANSPORT'
     AND fi.due_date    >= p_effective_date
     AND fi.paid_amount  = 0
     AND fi.write_off_amount = 0;

  UPDATE public.fee_installments fi
     SET status     = 'CANCELLED',
         amount     = fi.paid_amount + fi.write_off_amount,
         updated_at = NOW()
    FROM public.student_transport_assignments sta
   WHERE fi.related_id   = sta.id
     AND sta.vehicle_id  = p_from_vehicle
     AND sta.is_active   = TRUE
     AND fi.fee_type     = 'TRANSPORT'
     AND fi.due_date    >= p_effective_date
     AND (fi.paid_amount > 0 OR fi.write_off_amount > 0)
     AND fi.status <> 'PAID';

  RETURN QUERY
    UPDATE public.student_transport_assignments
       SET is_active  = FALSE,
           end_date   = p_effective_date - 1,
           end_reason = COALESCE(p_end_reason, end_reason),
           ended_by   = v_caller
     WHERE vehicle_id = p_from_vehicle
       AND is_active  = TRUE
    RETURNING id, student_id, stop_id, monthly_amount, academic_year_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_close_transport_assignments(UUID, DATE, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- Allow the linked parent / student to also read historical assignments
-- (the existing sta_select policy already covers this via
-- linked_student_ids() — no new policy needed). UPDATE/INSERT remain
-- school-staff-only.
-- ============================================================================
