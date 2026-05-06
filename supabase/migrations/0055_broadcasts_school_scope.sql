-- Scope broadcast SELECT policy to the caller's school. The original policy
-- (`auth.uid() IS NOT NULL`) let any authenticated user across any tenant
-- read every broadcast row, including school-specific ones with sensitive
-- school IDs in `target_schools`.
--
-- New rule: a user sees a broadcast iff
--   • they are SUPER_ADMIN, OR
--   • the broadcast targets all schools (target_schools IS NULL or empty), OR
--   • the broadcast targets the user's school explicitly.

DROP POLICY IF EXISTS broadcasts_select ON public.broadcasts;

CREATE POLICY broadcasts_select ON public.broadcasts FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      public.is_super_admin()
      OR target_schools IS NULL
      OR cardinality(target_schools) = 0
      OR EXISTS (
        SELECT 1 FROM public.users u
         WHERE u.id = auth.uid()
           AND u.school_id IS NOT NULL
           AND u.school_id = ANY (broadcasts.target_schools)
      )
    )
  );
