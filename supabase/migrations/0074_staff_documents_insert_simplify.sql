-- 0074_staff_documents_insert_simplify.sql
--
-- Same fix as 0073 (student-documents): drop the EXISTS-on-staff sub-query
-- from the storage INSERT policy. Tenant boundary already enforced by the
-- path's first folder == caller's school_id; the EXISTS check was
-- belt-and-suspenders that occasionally failed during freshly-issued JWTs
-- or same-transaction writes.

BEGIN;

DROP POLICY IF EXISTS staff_documents_insert ON storage.objects;
CREATE POLICY staff_documents_insert ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'staff-documents'
    AND array_length(storage.foldername(name), 1) >= 3
    AND (
      -- School staff (principal/teacher) uploading on behalf of any staff
      -- member of their own school.
      (
        public.current_user_role() IN ('PRINCIPAL','TEACHER')
        AND public.current_user_school_id()::text = (storage.foldername(name))[1]
      )
      -- The staff member themselves uploading their own document.
      OR EXISTS (
        SELECT 1 FROM public.staff s
        WHERE s.id = ((storage.foldername(name))[2])::uuid
          AND s.user_id = auth.uid()
      )
    )
  );

COMMIT;
