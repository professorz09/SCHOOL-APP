-- =============================================================
-- 0077_approvals_leave_parent_insert.sql
-- =============================================================
-- The approvals_write policy only allowed PRINCIPAL inserts. The
-- /api/principal/leave/submit endpoint uses the service-role
-- adminDb (which bypasses RLS), but if the env's SERVICE key
-- is ever missing the same flow falls back to anon and trips
-- "new row violates row-level security policy". Relax the policy
-- so PARENT/STUDENT/TEACHER can INSERT a LEAVE row for a student
-- they're allowed to act on; UPDATE/DELETE remain principal-only.
-- =============================================================

DROP POLICY IF EXISTS approvals_write ON public.approvals;

-- Principal can do anything (existing behaviour).
CREATE POLICY approvals_write_principal ON public.approvals
  FOR ALL
  USING (public.is_super_admin()
         OR (public.is_principal() AND school_id = public.current_user_school_id()))
  WITH CHECK (public.is_super_admin()
         OR (public.is_principal() AND school_id = public.current_user_school_id()));

-- PARENT / STUDENT / TEACHER may INSERT LEAVE requests only.
--   PARENT/STUDENT  → student must be in linked_student_ids().
--   TEACHER         → student must be in caller's school.
CREATE POLICY approvals_insert_leave ON public.approvals
  FOR INSERT
  WITH CHECK (
    request_type = 'LEAVE'
    AND entity_type = 'student'
    AND requested_by = auth.uid()
    AND (
      (public.current_user_role() IN ('PARENT', 'STUDENT')
        AND entity_id = ANY (public.linked_student_ids()))
      OR
      (public.current_user_role() = 'TEACHER'
        AND school_id = public.current_user_school_id())
    )
  );
