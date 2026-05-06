-- ============================================================================
-- 0026 — Tighten authorization on bulk_close_transport_assignments (Task #6)
--
-- 0025 originally allowed any authenticated same-school user to invoke the
-- SECURITY DEFINER bulk-close RPC (and thereby mutate fee_installments via
-- the function body). That meant a PARENT or STUDENT account in the same
-- school technically had a write path. This migration redefines the
-- function with a strict role gate (SUPER_ADMIN OR same-school PRINCIPAL),
-- matching the pattern used by every other write-side RLS policy in 0001.
--
-- Purely additive — CREATE OR REPLACE on a function that already exists
-- and re-grants EXECUTE to authenticated (the function itself enforces the
-- role check, so the broad grant is safe).
-- ============================================================================

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

  -- Authz: super admin OR same-school PRINCIPAL only. Parents, students,
  -- teachers, and drivers are explicitly excluded from this mutation path
  -- even if they share the school_id.
  IF NOT (
    public.is_super_admin()
    OR (public.is_principal() AND v_school_id = public.current_user_school_id())
  ) THEN
    RAISE EXCEPTION 'Not authorised: principal role required';
  END IF;

  -- Cancel future-dated TRANSPORT installments tied to those assignments.
  -- UNPAID rows → DELETE; PARTIAL rows → freeze amount at paid + writeoff
  -- and flag CANCELLED so they no longer count as outstanding but the
  -- historical receipt remains intact.
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
