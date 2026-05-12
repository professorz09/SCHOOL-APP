-- 0115_drop_student_stop_id.sql
-- Student-side route assignment is being simplified: each student is only
-- linked to a VEHICLE, not to a specific stop on that vehicle's route.
-- Drivers manage stops on their assigned vehicle independently, and any
-- student riding that vehicle can board at any stop.
--
-- Drop student_transport_assignments.stop_id and recreate the
-- bulk_close_transport_assignments RPC without that column in its
-- RETURNS TABLE shape.

-- 1. Recreate bulk_close_transport_assignments without stop_id in the
--    returned column list. Drop first so the RETURN TABLE shape change is
--    accepted by Postgres.
DROP FUNCTION IF EXISTS public.bulk_close_transport_assignments(UUID, DATE, TEXT);

CREATE OR REPLACE FUNCTION public.bulk_close_transport_assignments(
  p_from_vehicle    UUID,
  p_effective_date  DATE,
  p_end_reason      TEXT
)
RETURNS TABLE (
  assignment_id    UUID,
  student_id       UUID,
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

  IF NOT (
    public.is_super_admin()
    OR (public.is_principal() AND v_school_id = public.current_user_school_id())
  ) THEN
    RAISE EXCEPTION 'Not authorised: principal role required';
  END IF;

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
    RETURNING id, student_id, monthly_amount, academic_year_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_close_transport_assignments(UUID, DATE, TEXT) TO authenticated;

-- 2. Drop the column. CASCADE clears the FK to route_stops as well as any
--    leftover indexes that referenced it.
ALTER TABLE public.student_transport_assignments
  DROP COLUMN IF EXISTS stop_id CASCADE;
