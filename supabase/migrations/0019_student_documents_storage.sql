-- 0019_student_documents_storage.sql
-- Provisions the private Supabase Storage bucket that backs the
-- `student_documents.doc_url` column. Until now the column was free-form,
-- so principals had no way to upload, list, and review the actual
-- bytes of birth certificates / Aadhaar / TC scans.
--
-- Object key convention enforced by the policies below:
--
--     <school_id>/<student_id>/<doc_type>/<unique-filename>.<ext>
--
-- so we can authorise reads/writes purely from the path without joining
-- through the student_documents row.
--
-- Also adds two helper RPCs used by the principal "Assign to class"
-- modal:
--
--   • next_available_roll(school_id, year_id, class_name, section)
--       returns the smallest unused two-digit roll number for a
--       given section, considering only ACTIVE students in the
--       active academic year.
--
--   • roll_available(school_id, year_id, class_name, section, roll,
--                    exclude_student_id)
--       returns TRUE when the roll is free (or already belongs to the
--       student being edited).  Used as a real-time uniqueness check.
-- ---------------------------------------------------------------------------

-- ─── 1. Bucket — private, 5 MB cap, scans + PDFs only. ─────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'student-documents',
  'student-documents',
  false,
  5242880,
  ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif',
        'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ─── 2. INSERT policy. Two paths:
--      • Same-school PRINCIPAL/TEACHER uploading on behalf of any of their
--        school's students (admission flow, document review).
--      • Linked PARENT/STUDENT uploading their own document.
--      In both cases the path's first folder MUST equal the school of the
--      student id in the second folder, blocking cross-school injection.
DROP POLICY IF EXISTS student_documents_insert ON storage.objects;
CREATE POLICY student_documents_insert ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'student-documents'
    AND array_length(storage.foldername(name), 1) >= 3
    AND EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = ((storage.foldername(name))[2])::uuid
        AND s.school_id::text = (storage.foldername(name))[1]
        AND (
          (
            public.current_user_role() IN ('PRINCIPAL','TEACHER')
            AND s.school_id = public.current_user_school_id()
          )
          OR s.id = ANY(public.linked_student_ids())
        )
    )
  );

-- ─── 3. SELECT policy. createSignedUrl() requires SELECT.
--      Super admin OR same-school principal/teacher OR linked
--      parent/student of the student folder.
DROP POLICY IF EXISTS student_documents_select ON storage.objects;
CREATE POLICY student_documents_select ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'student-documents'
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

-- ─── 4. DELETE policy. Super admin OR same-school principal. Used when
--      a row is replaced or the student record is hard-cleaned.
DROP POLICY IF EXISTS student_documents_delete ON storage.objects;
CREATE POLICY student_documents_delete ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'student-documents'
    AND array_length(storage.foldername(name), 1) >= 2
    AND (
      public.is_super_admin()
      OR (
        public.is_principal()
        AND public.current_user_school_id()::text = (storage.foldername(name))[1]
      )
    )
  );

-- ─── 5. Roll-number helper RPCs ─────────────────────────────────────────────
-- Both run as SECURITY DEFINER but explicitly check that the caller is a
-- principal/teacher of the supplied school so they cannot be abused for
-- cross-school enumeration of student rolls.

DROP FUNCTION IF EXISTS public.next_available_roll(UUID, UUID, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.next_available_roll(
  p_school_id UUID,
  p_year_id   UUID,
  p_class     TEXT,
  p_section   TEXT
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role TEXT := public.current_user_role();
  v_school UUID := public.current_user_school_id();
  v_next INT := 1;
  v_used INT[];
BEGIN
  IF NOT public.is_super_admin()
     AND (v_role NOT IN ('PRINCIPAL','TEACHER') OR v_school IS DISTINCT FROM p_school_id)
  THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Collect numeric rolls already taken in this section for the given year.
  SELECT COALESCE(array_agg(roll), '{}')
    INTO v_used
  FROM (
    SELECT NULLIF(regexp_replace(ar.roll_no, '\D', '', 'g'), '')::INT AS roll
    FROM   public.student_academic_records ar
    JOIN   public.students s ON s.id = ar.student_id
    WHERE  s.school_id   = p_school_id
      AND  s.is_active   = TRUE
      AND  ar.academic_year_id = p_year_id
      AND  ar.class_name = p_class
      AND  ar.section    = p_section
      AND  ar.roll_no IS NOT NULL
      AND  ar.roll_no <> ''
      AND  regexp_replace(ar.roll_no, '\D', '', 'g') <> ''
  ) q
  WHERE roll IS NOT NULL;

  WHILE v_next = ANY(v_used) LOOP
    v_next := v_next + 1;
  END LOOP;

  RETURN lpad(v_next::TEXT, 2, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_available_roll(UUID, UUID, TEXT, TEXT)
  TO authenticated;

DROP FUNCTION IF EXISTS public.roll_available(UUID, UUID, TEXT, TEXT, TEXT, UUID);
CREATE OR REPLACE FUNCTION public.roll_available(
  p_school_id UUID,
  p_year_id   UUID,
  p_class     TEXT,
  p_section   TEXT,
  p_roll      TEXT,
  p_exclude_student_id UUID DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role TEXT := public.current_user_role();
  v_school UUID := public.current_user_school_id();
  v_taken UUID;
BEGIN
  IF NOT public.is_super_admin()
     AND (v_role NOT IN ('PRINCIPAL','TEACHER') OR v_school IS DISTINCT FROM p_school_id)
  THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_roll IS NULL OR btrim(p_roll) = '' THEN
    RETURN FALSE;
  END IF;

  SELECT s.id
    INTO v_taken
  FROM   public.student_academic_records ar
  JOIN   public.students s ON s.id = ar.student_id
  WHERE  s.school_id   = p_school_id
    AND  ar.academic_year_id = p_year_id
    AND  ar.class_name = p_class
    AND  ar.section    = p_section
    AND  lpad(regexp_replace(COALESCE(ar.roll_no,''), '\D', '', 'g'), 2, '0')
       = lpad(regexp_replace(p_roll,                 '\D', '', 'g'), 2, '0')
    AND  s.is_active   = TRUE
    AND  (p_exclude_student_id IS NULL OR s.id <> p_exclude_student_id)
  LIMIT 1;

  RETURN v_taken IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.roll_available(UUID, UUID, TEXT, TEXT, TEXT, UUID)
  TO authenticated;
