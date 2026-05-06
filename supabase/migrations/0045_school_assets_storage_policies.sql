-- Storage policies for the `school-assets` bucket (created in 0032).
-- Without these RLS policies, supabase-js storage uploads from the principal
-- silently fail with "permission denied" — the QR upload UI looked broken
-- because of this.
--
-- Path convention: <school_id>/<filename> (see schoolInfoService.uploadPaymentQr)
-- The policies use storage.foldername(name)[1] to extract the school_id.

-- Set bucket size limit + allowed MIME types defensively (in case 0032 ran
-- before these were configured).
UPDATE storage.buckets
SET file_size_limit = 5 * 1024 * 1024, -- 5 MB
    allowed_mime_types = ARRAY['image/png','image/jpeg','image/jpg','image/webp']
WHERE id = 'school-assets';

-- ─── INSERT: principal of the same school can upload.
DROP POLICY IF EXISTS school_assets_insert ON storage.objects;
CREATE POLICY school_assets_insert ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'school-assets'
    AND array_length(storage.foldername(name), 1) >= 1
    AND public.current_user_role() = 'PRINCIPAL'
    AND public.current_user_school_id()::text = (storage.foldername(name))[1]
  );

-- ─── UPDATE: same — used when supabase-js does upsert on existing object.
DROP POLICY IF EXISTS school_assets_update ON storage.objects;
CREATE POLICY school_assets_update ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'school-assets'
    AND array_length(storage.foldername(name), 1) >= 1
    AND public.current_user_role() = 'PRINCIPAL'
    AND public.current_user_school_id()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'school-assets'
    AND array_length(storage.foldername(name), 1) >= 1
    AND public.current_user_role() = 'PRINCIPAL'
    AND public.current_user_school_id()::text = (storage.foldername(name))[1]
  );

-- ─── SELECT: bucket is public so anonymous URL works for students/parents.
--      But signed URL flows + same-app reads still need an authenticated path.
DROP POLICY IF EXISTS school_assets_select ON storage.objects;
CREATE POLICY school_assets_select ON storage.objects FOR SELECT
  TO authenticated, anon
  USING (bucket_id = 'school-assets');

-- ─── DELETE: principal of the same school only.
DROP POLICY IF EXISTS school_assets_delete ON storage.objects;
CREATE POLICY school_assets_delete ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'school-assets'
    AND array_length(storage.foldername(name), 1) >= 1
    AND public.current_user_role() = 'PRINCIPAL'
    AND public.current_user_school_id()::text = (storage.foldername(name))[1]
  );
