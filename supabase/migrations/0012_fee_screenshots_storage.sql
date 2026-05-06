-- 0012_fee_screenshots_storage.sql
-- Provisions the private Supabase Storage bucket that backs the
-- `fee_payment_uploads.screenshot_url` column. Without this the parent
-- upload flow only ever recorded a UTR/filename string and the bytes of
-- the screenshot itself were never stored, which made principal review
-- impossible.
--
-- Object key convention enforced by the policies below:
--
--     <school_id>/<student_id>/<unique-filename>.<ext>
--
-- so we can authorise reads/writes purely from the path without joining
-- back through the fee_payment_uploads row.
-- ---------------------------------------------------------------------------

-- 1. Bucket. Private (public = false), capped at 5 MB, image MIME types only.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'fee-screenshots',
  'fee-screenshots',
  false,
  5242880,
  ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. INSERT policy: authenticated parent / student, uploading into a folder
--    structured as <school_id>/<student_id>/... where the student id must
--    be one of the caller's linked students AND must actually belong to
--    the school folder named in the path.
DROP POLICY IF EXISTS fee_screenshots_insert ON storage.objects;
CREATE POLICY fee_screenshots_insert ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'fee-screenshots'
    AND array_length(storage.foldername(name), 1) >= 2
    AND ((storage.foldername(name))[2])::uuid = ANY(public.linked_student_ids())
    AND EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = ((storage.foldername(name))[2])::uuid
        AND s.school_id::text = (storage.foldername(name))[1]
    )
  );

-- 3. SELECT policy: super admin OR same-school principal/teacher OR a
--    parent/student linked to the student folder. createSignedUrl()
--    requires SELECT permission, which is what gates principal review.
DROP POLICY IF EXISTS fee_screenshots_select ON storage.objects;
CREATE POLICY fee_screenshots_select ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'fee-screenshots'
    AND array_length(storage.foldername(name), 1) >= 2
    AND (
      public.is_super_admin()
      OR (
        public.current_user_role() IN ('PRINCIPAL','TEACHER')
        AND public.current_user_school_id()::text = (storage.foldername(name))[1]
      )
      OR ((storage.foldername(name))[2])::uuid = ANY(public.linked_student_ids())
    )
  );

-- 4. DELETE policy: super admin OR principal of the same school. Used to
--    clean up orphaned uploads when a fee_payment_uploads insert fails
--    after the bytes have already landed (best-effort, not relied on).
DROP POLICY IF EXISTS fee_screenshots_delete ON storage.objects;
CREATE POLICY fee_screenshots_delete ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'fee-screenshots'
    AND array_length(storage.foldername(name), 1) >= 2
    AND (
      public.is_super_admin()
      OR (
        public.is_principal()
        AND public.current_user_school_id()::text = (storage.foldername(name))[1]
      )
      OR (
        owner = auth.uid()
        AND ((storage.foldername(name))[2])::uuid = ANY(public.linked_student_ids())
      )
    )
  );
