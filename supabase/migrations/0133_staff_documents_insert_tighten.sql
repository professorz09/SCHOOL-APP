-- ════════════════════════════════════════════════════════════════════════
-- 0133 · Tighten staff-documents INSERT policy — teachers, own folder only
-- ════════════════════════════════════════════════════════════════════════
--
-- 0074 simplified the policy by allowing any PRINCIPAL or TEACHER in the
-- school to write to ANY staff member's folder under
-- `staff-documents/<school>/<staff_id>/...`. This was overly permissive
-- — a teacher could drop forged docs (Aadhaar, resignation letters,
-- PAN scans) into a colleague's or the principal's HR folder.
--
-- Restrict the cross-staff write to PRINCIPAL only. Teachers retain the
-- "own folder" branch via the staff.user_id = auth.uid() check, so a
-- teacher writing into their own staff_id stays unblocked.

BEGIN;

DROP POLICY IF EXISTS staff_documents_insert ON storage.objects;
CREATE POLICY staff_documents_insert ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'staff-documents'
    AND array_length(storage.foldername(name), 1) >= 3
    AND (
      -- Principals can upload on behalf of any staff member of their school.
      (
        public.current_user_role() = 'PRINCIPAL'
        AND public.current_user_school_id()::text = (storage.foldername(name))[1]
      )
      -- Any staff member (including teachers) can upload into THEIR OWN
      -- folder. The path's segment-2 must be their own staff.id.
      OR EXISTS (
        SELECT 1 FROM public.staff s
        WHERE s.id = ((storage.foldername(name))[2])::uuid
          AND s.user_id = auth.uid()
      )
    )
  );

COMMIT;
