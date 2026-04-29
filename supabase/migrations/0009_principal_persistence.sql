-- ============================================================================
-- 0009 — Principal panel persistence: salary RPC, staff permissions
--        uniqueness, and AI-generated question papers.
-- All PKs remain UUIDs. Idempotent.
-- ============================================================================

-- ─── 1. AI-generated question papers ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.generated_question_papers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.users(id),
  subject TEXT NOT NULL,
  class_name TEXT NOT NULL,
  request JSONB NOT NULL DEFAULT '{}'::jsonb,   -- {subject, className, testType, totalMarks, duration, topics, difficulty}
  sections JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{title, instructions, marks, questions:[...]}, ...]
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS gqp_school_idx ON public.generated_question_papers(school_id, created_at DESC);

ALTER TABLE public.generated_question_papers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gqp_select ON public.generated_question_papers;
CREATE POLICY gqp_select ON public.generated_question_papers FOR SELECT
  USING (public.is_super_admin()
         OR (public.current_user_role() IN ('PRINCIPAL','TEACHER')
             AND school_id = public.current_user_school_id()));
DROP POLICY IF EXISTS gqp_write ON public.generated_question_papers;
CREATE POLICY gqp_write ON public.generated_question_papers FOR ALL
  USING (public.is_super_admin()
         OR (public.current_user_role() IN ('PRINCIPAL','TEACHER')
             AND school_id = public.current_user_school_id()))
  WITH CHECK (public.is_super_admin()
              OR (public.current_user_role() IN ('PRINCIPAL','TEACHER')
                  AND school_id = public.current_user_school_id()));

-- ─── 2. staff_permissions uniqueness ───────────────────────────────────────
-- Ensure a teacher can only hold a given permission once per (section, AY).
-- Using a partial unique index because section_id is NULLable.
DROP INDEX IF EXISTS staff_permissions_unique_idx;
CREATE UNIQUE INDEX staff_permissions_unique_idx
  ON public.staff_permissions(staff_id, section_id, permission)
  WHERE section_id IS NOT NULL;

-- ─── 3. record_salary_payment RPC ──────────────────────────────────────────
-- Atomic: inserts a salary_payments row AND a matching expenses row
-- (category='SALARY') so that cashflow/expense reports stay consistent.
-- Supports partial payments (caller supplies amount, not derived).
CREATE OR REPLACE FUNCTION public.record_salary_payment(
  p_staff_id UUID,
  p_month TEXT,
  p_amount BIGINT,
  p_note TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school UUID;
  v_caller UUID := auth.uid();
  v_year UUID;
  v_pay_id UUID;
  v_txn TEXT;
  v_staff_name TEXT;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;

  SELECT school_id, name INTO v_school, v_staff_name
    FROM public.staff WHERE id = p_staff_id;
  IF v_school IS NULL THEN RAISE EXCEPTION 'staff not found'; END IF;

  IF NOT (public.is_super_admin()
          OR (public.is_principal() AND public.current_user_school_id() = v_school)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT id INTO v_year FROM public.academic_years
    WHERE school_id = v_school AND is_active = TRUE LIMIT 1;

  v_txn := 'TXN-' || to_char(NOW(),'YYYYMMDDHH24MISS') || '-' || substr(p_staff_id::text, 1, 4);

  INSERT INTO public.salary_payments
    (staff_id, school_id, month, amount, paid_at, transaction_id, note)
  VALUES
    (p_staff_id, v_school, p_month, p_amount, CURRENT_DATE, v_txn, p_note)
  RETURNING id INTO v_pay_id;

  INSERT INTO public.expenses
    (school_id, academic_year_id, category, amount, date, description, created_by)
  VALUES
    (v_school, v_year, 'SALARY', p_amount, CURRENT_DATE,
     'Salary: ' || COALESCE(v_staff_name, p_staff_id::text) || ' — ' || p_month
     || COALESCE(' (' || NULLIF(p_note,'') || ')', ''),
     v_caller);

  INSERT INTO public.audit_logs (user_id, school_id, action, entity_type, entity_id, details)
  VALUES (v_caller, v_school, 'salary_paid', 'staff', p_staff_id,
          jsonb_build_object('month', p_month, 'amount', p_amount, 'txn', v_txn));

  RETURN v_pay_id;
END $$;
GRANT EXECUTE ON FUNCTION public.record_salary_payment(UUID, TEXT, BIGINT, TEXT) TO authenticated;
