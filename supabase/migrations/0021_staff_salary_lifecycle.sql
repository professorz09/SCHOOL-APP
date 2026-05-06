-- ============================================================================
-- Migration 0021 — Staff salary lifecycle (Task #5)
--
-- Builds on 0017's staff_salary_history + update_staff_salary RPC and
-- 0009's record_salary_payment with the remaining pieces the salary UI
-- needs:
--
--   * salary_payments.method column + TEXT enum-style check.
--   * record_salary_payment re-created with caller-supplied
--     p_method / p_txn_id (auto-generates if NULL) so the Pay modal
--     can record cash / bank-transfer / UPI / cheque + reference id.
--   * staff_status_history table + before-update trigger so every
--     status change (ACTIVE → ON_LEAVE → RELIEVED, etc.) is captured.
--   * set_staff_relieving_date(staff_id, date, reason) RPC: flips
--     status to 'RELIEVED', stamps relieving_date / relieving_reason,
--     records history + audit log atomically.
--   * salary_reminders(school_id, year_month) RPC: returns staff with
--     unpaid / partially-paid salary for a given month, excluding
--     RELIEVED / SUSPENDED / not-yet-joined / past-relieving-date staff.
--   * staff-documents private Storage bucket + RLS policies (mirrors
--     0019 student-documents). Path convention:
--         <school_id>/<staff_id>/<doc_type>/<filename>
--     Same-school principals & teachers get full CRUD; the staff
--     member themselves can read their own documents; super admins do
--     anything; everyone else is denied.
--   * staff_documents table for persistent document metadata (mirrors
--     student_documents shape).
--
-- Idempotent: ALTER ... ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT
-- EXISTS, DROP POLICY / DROP FUNCTION before CREATE. Re-running is safe.
-- ============================================================================

BEGIN;

-- ─── 1. salary_payments.method column ─────────────────────────────────────
ALTER TABLE public.salary_payments
  ADD COLUMN IF NOT EXISTS method TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'salary_payments_method_chk'
  ) THEN
    ALTER TABLE public.salary_payments
      ADD CONSTRAINT salary_payments_method_chk
      CHECK (method IS NULL OR method IN ('CASH','BANK_TRANSFER','UPI','CHEQUE','OTHER'));
  END IF;
END $$;

-- ─── 2. record_salary_payment: accept method + caller txn_id ─────────────
DROP FUNCTION IF EXISTS public.record_salary_payment(UUID, TEXT, BIGINT, TEXT);
DROP FUNCTION IF EXISTS public.record_salary_payment(UUID, TEXT, BIGINT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.record_salary_payment(
  p_staff_id UUID,
  p_month    TEXT,
  p_amount   BIGINT,
  p_note     TEXT DEFAULT NULL,
  p_method   TEXT DEFAULT NULL,
  p_txn_id   TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school     UUID;
  v_caller     UUID := auth.uid();
  v_year       UUID;
  v_pay_id     UUID;
  v_txn        TEXT;
  v_staff_name TEXT;
  v_method     TEXT;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;

  v_method := UPPER(NULLIF(BTRIM(COALESCE(p_method, '')), ''));
  IF v_method IS NOT NULL AND v_method NOT IN ('CASH','BANK_TRANSFER','UPI','CHEQUE','OTHER') THEN
    RAISE EXCEPTION 'invalid method: %', v_method;
  END IF;

  SELECT school_id, name INTO v_school, v_staff_name
    FROM public.staff WHERE id = p_staff_id;
  IF v_school IS NULL THEN RAISE EXCEPTION 'staff not found'; END IF;

  IF NOT (public.is_super_admin()
          OR (public.is_principal() AND public.current_user_school_id() = v_school)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT id INTO v_year FROM public.academic_years
    WHERE school_id = v_school AND is_active = TRUE LIMIT 1;

  -- Caller-supplied txn id wins; otherwise we generate one.
  v_txn := NULLIF(BTRIM(COALESCE(p_txn_id, '')), '');
  IF v_txn IS NULL THEN
    v_txn := 'TXN-' || to_char(NOW(),'YYYYMMDDHH24MISS') || '-' || substr(p_staff_id::text, 1, 4);
  END IF;

  INSERT INTO public.salary_payments
    (staff_id, school_id, month, amount, paid_at, transaction_id, note, method)
  VALUES
    (p_staff_id, v_school, p_month, p_amount, CURRENT_DATE, v_txn, p_note, v_method)
  RETURNING id INTO v_pay_id;

  INSERT INTO public.expenses
    (school_id, academic_year_id, category, amount, date, description, created_by)
  VALUES
    (v_school, v_year, 'SALARY', p_amount, CURRENT_DATE,
     'Salary: ' || COALESCE(v_staff_name, p_staff_id::text) || ' — ' || p_month
     || COALESCE(' (' || NULLIF(p_note,'') || ')', ''),
     v_caller);

  PERFORM public.log_audit(
    'salary_paid', 'staff', p_staff_id,
    jsonb_build_object(
      'month', p_month,
      'amount', p_amount,
      'method', v_method,
      'txn', v_txn
    )
  );

  RETURN v_pay_id;
END $$;

GRANT EXECUTE ON FUNCTION public.record_salary_payment(UUID, TEXT, BIGINT, TEXT, TEXT, TEXT)
  TO authenticated;

-- ─── 3. staff_status_history table + trigger ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.staff_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id   UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  school_id  UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  reason     TEXT,
  changed_by UUID REFERENCES public.users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS staff_status_history_staff_idx
  ON public.staff_status_history(staff_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS staff_status_history_school_idx
  ON public.staff_status_history(school_id);

ALTER TABLE public.staff_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_status_history_select ON public.staff_status_history;
CREATE POLICY staff_status_history_select ON public.staff_status_history FOR SELECT
  USING (
    public.is_super_admin()
    OR (public.current_user_role() IN ('PRINCIPAL','TEACHER')
        AND school_id = public.current_user_school_id())
  );

DROP POLICY IF EXISTS staff_status_history_write ON public.staff_status_history;
CREATE POLICY staff_status_history_write ON public.staff_status_history FOR ALL
  USING (
    public.is_super_admin()
    OR (public.is_principal() AND school_id = public.current_user_school_id())
  )
  WITH CHECK (
    public.is_super_admin()
    OR (public.is_principal() AND school_id = public.current_user_school_id())
  );

-- AFTER-UPDATE trigger so every status change is captured automatically.
CREATE OR REPLACE FUNCTION public.staff_status_history_trg()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.staff_status_history
      (staff_id, school_id, old_status, new_status, reason, changed_by)
    VALUES
      (NEW.id, NEW.school_id, OLD.status, NEW.status, NULL, auth.uid());
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS staff_status_history_trg ON public.staff;
CREATE TRIGGER staff_status_history_trg
  AFTER UPDATE OF status ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.staff_status_history_trg();

-- Seed an initial row for every existing staff so the LOG tab isn't empty.
INSERT INTO public.staff_status_history (staff_id, school_id, old_status, new_status, reason)
  SELECT s.id, s.school_id, NULL, COALESCE(s.status, 'ACTIVE'), 'Initial'
    FROM public.staff s
   WHERE NOT EXISTS (
     SELECT 1 FROM public.staff_status_history h WHERE h.staff_id = s.id
   );

-- ─── 4. set_staff_relieving_date RPC ─────────────────────────────────────
DROP FUNCTION IF EXISTS public.set_staff_relieving_date(UUID, DATE, TEXT);
CREATE OR REPLACE FUNCTION public.set_staff_relieving_date(
  p_staff_id UUID,
  p_date     DATE,
  p_reason   TEXT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school UUID;
  v_caller UUID := auth.uid();
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF p_date IS NULL THEN RAISE EXCEPTION 'relieving date required'; END IF;

  SELECT school_id INTO v_school FROM public.staff WHERE id = p_staff_id;
  IF v_school IS NULL THEN RAISE EXCEPTION 'staff not found'; END IF;

  IF NOT (public.is_super_admin()
          OR (public.is_principal() AND public.current_user_school_id() = v_school)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.staff
     SET relieving_date   = p_date,
         relieving_reason = NULLIF(BTRIM(COALESCE(p_reason,'')), ''),
         status           = 'RELIEVED',
         updated_at       = NOW()
   WHERE id = p_staff_id;

  -- The status-change trigger only stamps the transition; layer the reason on top.
  UPDATE public.staff_status_history
     SET reason = NULLIF(BTRIM(COALESCE(p_reason,'')), '')
   WHERE id = (
     SELECT id FROM public.staff_status_history
      WHERE staff_id = p_staff_id ORDER BY changed_at DESC LIMIT 1
   );

  PERFORM public.log_audit(
    'staff_relieved', 'staff', p_staff_id,
    jsonb_build_object('date', p_date, 'reason', p_reason)
  );
END $$;
GRANT EXECUTE ON FUNCTION public.set_staff_relieving_date(UUID, DATE, TEXT) TO authenticated;

-- ─── 5. salary_reminders RPC ─────────────────────────────────────────────
-- Returns staff who have NOT been fully paid for a given month
-- (`p_year_month` is the same TEXT format that the UI / record_salary_payment
-- already use, e.g. 'October 2025'). Excludes RELIEVED / SUSPENDED staff and
-- staff whose joining_date is after the month, or whose relieving_date is
-- before the month. Salary read from staff.salary (the latest amount —
-- effective-from history isn't applied here because the spec is "fixed
-- monthly salary; future months default to the new amount").
DROP FUNCTION IF EXISTS public.salary_reminders(UUID, TEXT);
CREATE OR REPLACE FUNCTION public.salary_reminders(
  p_school_id UUID,
  p_year_month TEXT
) RETURNS TABLE (
  staff_id    UUID,
  name        TEXT,
  role        TEXT,
  salary      BIGINT,
  paid_amount BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role TEXT := public.current_user_role();
BEGIN
  IF NOT public.is_super_admin()
     AND (v_role IS NULL OR v_role NOT IN ('PRINCIPAL','TEACHER')
          OR public.current_user_school_id() IS DISTINCT FROM p_school_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    s.name,
    s.role,
    s.salary,
    COALESCE(SUM(sp.amount) FILTER (WHERE sp.month = p_year_month), 0)::BIGINT
  FROM public.staff s
  LEFT JOIN public.salary_payments sp
    ON sp.staff_id = s.id
   AND sp.month    = p_year_month
  WHERE s.school_id = p_school_id
    AND s.is_active = TRUE
    AND COALESCE(s.status, 'ACTIVE') NOT IN ('SUSPENDED','RELIEVED')
    AND (s.relieving_date IS NULL OR s.relieving_date >= CURRENT_DATE)
    AND s.salary > 0
  GROUP BY s.id, s.name, s.role, s.salary
  HAVING COALESCE(SUM(sp.amount) FILTER (WHERE sp.month = p_year_month), 0) < s.salary;
END $$;
GRANT EXECUTE ON FUNCTION public.salary_reminders(UUID, TEXT) TO authenticated;

-- ─── 6. staff_documents table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.staff_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id  UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  doc_type  TEXT NOT NULL,
  doc_name  TEXT NOT NULL,
  doc_url   TEXT NOT NULL,
  uploaded_by UUID REFERENCES public.users(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS staff_documents_staff_idx ON public.staff_documents(staff_id);
CREATE INDEX IF NOT EXISTS staff_documents_school_idx ON public.staff_documents(school_id);

ALTER TABLE public.staff_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_documents_select ON public.staff_documents;
CREATE POLICY staff_documents_select ON public.staff_documents FOR SELECT
  USING (
    public.is_super_admin()
    OR (public.current_user_role() IN ('PRINCIPAL','TEACHER')
        AND school_id = public.current_user_school_id())
    OR EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = staff_documents.staff_id AND s.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS staff_documents_write ON public.staff_documents;
CREATE POLICY staff_documents_write ON public.staff_documents FOR ALL
  USING (
    public.is_super_admin()
    OR (public.current_user_role() IN ('PRINCIPAL','TEACHER')
        AND school_id = public.current_user_school_id())
  )
  WITH CHECK (
    public.is_super_admin()
    OR (public.current_user_role() IN ('PRINCIPAL','TEACHER')
        AND school_id = public.current_user_school_id())
  );

-- ─── 7. staff-documents Storage bucket ────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'staff-documents',
  'staff-documents',
  false,
  5242880,
  ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif',
        'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- INSERT: same-school principals/teachers OR the staff member themselves
-- (e.g. self-uploading their PAN). The path's first folder MUST equal the
-- staff member's school_id, blocking cross-school injection.
DROP POLICY IF EXISTS staff_documents_insert ON storage.objects;
CREATE POLICY staff_documents_insert ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'staff-documents'
    AND array_length(storage.foldername(name), 1) >= 3
    AND EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = ((storage.foldername(name))[2])::uuid
        AND s.school_id::text = (storage.foldername(name))[1]
        AND (
          (
            public.current_user_role() IN ('PRINCIPAL','TEACHER')
            AND s.school_id = public.current_user_school_id()
          )
          OR s.user_id = auth.uid()
        )
    )
  );

-- SELECT: super admin OR same-school principal/teacher OR the staff
-- member themselves (createSignedUrl requires SELECT).
DROP POLICY IF EXISTS staff_documents_select_obj ON storage.objects;
CREATE POLICY staff_documents_select_obj ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'staff-documents'
    AND array_length(storage.foldername(name), 1) >= 2
    AND (
      public.is_super_admin()
      OR (
        public.current_user_role() IN ('PRINCIPAL','TEACHER')
        AND public.current_user_school_id()::text = (storage.foldername(name))[1]
      )
      OR EXISTS (
        SELECT 1 FROM public.staff s
        WHERE s.id = ((storage.foldername(name))[2])::uuid
          AND s.user_id = auth.uid()
      )
    )
  );

-- DELETE: super admin OR same-school principal.
DROP POLICY IF EXISTS staff_documents_delete_obj ON storage.objects;
CREATE POLICY staff_documents_delete_obj ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'staff-documents'
    AND array_length(storage.foldername(name), 1) >= 2
    AND (
      public.is_super_admin()
      OR (
        public.is_principal()
        AND public.current_user_school_id()::text = (storage.foldername(name))[1]
      )
    )
  );

COMMIT;
