-- 0124_attendance_approvals_write.sql
-- attendance_approvals had RLS enabled with only a SELECT policy. Server
-- endpoints use adminDb (service-role) so writes worked in practice, but
-- the moment any client-side code tried to update the table (or a future
-- migration switched to userDb-style writes), the row would silently fail
-- to insert/update with zero error reported. Add an explicit FOR ALL
-- policy scoped to same-school PRINCIPAL so writes are predictable and
-- the table is no longer "RLS enabled, no write policy" — the same shape
-- that bit us on users / staff / route_stops earlier this month.

DROP POLICY IF EXISTS attendance_approvals_principal_write ON public.attendance_approvals;

CREATE POLICY attendance_approvals_principal_write ON public.attendance_approvals
  FOR ALL
  USING (
    public.is_super_admin()
    OR (
      public.is_principal()
      AND school_id = public.current_user_school_id()
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.is_principal()
      AND school_id = public.current_user_school_id()
    )
  );
