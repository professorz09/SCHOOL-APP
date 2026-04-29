-- 0011_fee_payment_uploads.sql
-- Persists parent / student fee-payment screenshot submissions so they no
-- longer disappear when the device reloads, and so principals can review
-- and approve / reject them from the same school.
--
-- Workflow:
--   1. Parent / student submits a UTR / screenshot reference for a payment
--      they made via UPI. Row lands in PENDING.
--   2. Principal of the same school reviews and either approves the upload
--      (which usually corresponds to a real payment record being created
--      separately) or rejects it with a reviewer note.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.fee_payment_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  submitted_by UUID NOT NULL REFERENCES public.users(id),
  amount BIGINT NOT NULL CHECK (amount >= 0),
  description TEXT,
  screenshot_name TEXT,
  screenshot_url TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  reviewed_by UUID REFERENCES public.users(id),
  reviewed_at TIMESTAMPTZ,
  reviewer_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS fpu_school_status_idx
  ON public.fee_payment_uploads(school_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS fpu_student_idx
  ON public.fee_payment_uploads(student_id, created_at DESC);

ALTER TABLE public.fee_payment_uploads ENABLE ROW LEVEL SECURITY;

-- SELECT:
--   * super admin: everything
--   * principal / teacher of the same school: every upload at their school
--   * parent / student: only uploads tied to a student they're linked to
DROP POLICY IF EXISTS fpu_select ON public.fee_payment_uploads;
CREATE POLICY fpu_select ON public.fee_payment_uploads FOR SELECT
  USING (
    public.is_super_admin()
    OR (
      public.current_user_role() IN ('PRINCIPAL','TEACHER')
      AND school_id = public.current_user_school_id()
    )
    OR student_id = ANY(public.linked_student_ids())
  );

-- INSERT: parent or student authoring the row, for a student they're linked
-- to, scoped to that student's school. submitted_by must equal auth.uid().
DROP POLICY IF EXISTS fpu_insert ON public.fee_payment_uploads;
CREATE POLICY fpu_insert ON public.fee_payment_uploads FOR INSERT
  WITH CHECK (
    submitted_by = auth.uid()
    AND student_id = ANY(public.linked_student_ids())
    AND EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = student_id AND s.school_id = fee_payment_uploads.school_id
    )
  );

-- UPDATE / DELETE: super admin OR principal of the same school.
DROP POLICY IF EXISTS fpu_admin_write ON public.fee_payment_uploads;
CREATE POLICY fpu_admin_write ON public.fee_payment_uploads FOR ALL
  USING (
    public.is_super_admin()
    OR (public.is_principal() AND school_id = public.current_user_school_id())
  )
  WITH CHECK (
    public.is_super_admin()
    OR (public.is_principal() AND school_id = public.current_user_school_id())
  );
