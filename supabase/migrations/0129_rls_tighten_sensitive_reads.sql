-- ─────────────────────────────────────────────────────────────────────────────
-- RLS tightening — sensitive-read findings from full-app audit.
--
-- A generic `*_select` loop earlier in _apply.sql granted PRINCIPAL **and**
-- TEACHER roles SELECT access across every school-scoped table. Most of
-- those tables that is fine (timetable, subjects, assignments). For
-- the tables listed below it is not, and creates real privacy / safety
-- gaps:
--
--   complaints           — anonymous student complaints carry the
--                          author's identity in `from_user_id` /
--                          `from_name` so the abuse-cap trigger can run.
--                          The teacher who is the subject of an
--                          "anonymous" harassment complaint can query
--                          the table and see who filed it. Anonymity
--                          guarantee broken.
--   salary_payments      — every teacher can see every staff member's
--                          paid salary across all months. Workplace
--                          privacy violation.
--   audit_logs           — every teacher can read every action the
--                          principal / super-admin took (password
--                          resets, fee changes, login times).
--   staff_permissions    — info-gathering surface for malicious users.
--   school_billing_*     — platform billing data. Not relevant to
--                          anyone in the school role.
--   school_payments      — same; principal should see their school's
--                          rows, teachers should not.
--   government_payments  — RTE / scholarship financial data.
--
-- Fix: replace the generic SELECT policy on each of these tables with
-- a role-specific version that excludes TEACHER (and, where relevant,
-- adds a self-read carve-out for the data subject).
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── complaints: hide anonymous rows from teachers, allow authors ───────────
DROP POLICY IF EXISTS complaints_select ON public.complaints;
CREATE POLICY complaints_select ON public.complaints FOR SELECT
  USING (
    public.is_super_admin()
    OR (public.is_principal() AND school_id = public.current_user_school_id())
    -- Teachers see only their school's NON-anonymous complaints. The
    -- anonymity contract requires teacher-targeted authors stay
    -- invisible to teachers themselves. Principal still sees them and
    -- the principal UI masks identity fields.
    OR (
      public.current_user_role() = 'TEACHER'
      AND school_id = public.current_user_school_id()
      AND is_anonymous IS NOT TRUE
    )
    -- The author always sees their own filings (anonymous or not).
    OR from_user_id = auth.uid()
  );


-- ─── salary_payments: super-admin + principal + the staff member themselves ─
DROP POLICY IF EXISTS salary_payments_select ON public.salary_payments;
CREATE POLICY salary_payments_select ON public.salary_payments FOR SELECT
  USING (
    public.is_super_admin()
    OR (public.is_principal() AND school_id = public.current_user_school_id())
    -- A staff member can read their own salary history. Joins through
    -- the staff table so we trust staff.user_id, not a self-asserted
    -- field on salary_payments.
    OR EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = salary_payments.staff_id
        AND s.user_id = auth.uid()
    )
  );


-- ─── audit_logs: super-admin + principal only ───────────────────────────────
DROP POLICY IF EXISTS audit_logs_select ON public.audit_logs;
CREATE POLICY audit_logs_select ON public.audit_logs FOR SELECT
  USING (
    public.is_super_admin()
    OR (public.is_principal() AND school_id = public.current_user_school_id())
  );


-- ─── staff_permissions: super-admin + principal + the staff member ──────────
DROP POLICY IF EXISTS staff_permissions_select ON public.staff_permissions;
CREATE POLICY staff_permissions_select ON public.staff_permissions FOR SELECT
  USING (
    public.is_super_admin()
    OR (public.is_principal() AND school_id = public.current_user_school_id())
    OR EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = staff_permissions.staff_id
        AND s.user_id = auth.uid()
    )
  );


-- ─── school_billing_schedules: super-admin only (platform billing) ──────────
DROP POLICY IF EXISTS school_billing_schedules_select ON public.school_billing_schedules;
CREATE POLICY school_billing_schedules_select ON public.school_billing_schedules FOR SELECT
  USING (public.is_super_admin());


-- ─── school_billing_years: super-admin only ─────────────────────────────────
DROP POLICY IF EXISTS school_billing_years_select ON public.school_billing_years;
CREATE POLICY school_billing_years_select ON public.school_billing_years FOR SELECT
  USING (public.is_super_admin());


-- ─── school_payments: super-admin + principal (principal sees own school) ───
DROP POLICY IF EXISTS school_payments_select ON public.school_payments;
CREATE POLICY school_payments_select ON public.school_payments FOR SELECT
  USING (
    public.is_super_admin()
    OR (public.is_principal() AND school_id = public.current_user_school_id())
  );


-- ─── government_payments: super-admin + principal only ──────────────────────
DROP POLICY IF EXISTS government_payments_select ON public.government_payments;
CREATE POLICY government_payments_select ON public.government_payments FOR SELECT
  USING (
    public.is_super_admin()
    OR (public.is_principal() AND school_id = public.current_user_school_id())
  );
