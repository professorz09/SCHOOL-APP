-- Migration 0062: Phase 1 security audit fixes
-- - Tighten school_settings RLS so only principal/super-admin can write.
-- - Tighten users_prevent_self_escalation trigger to use a small allowlist.
-- - Tighten parent_student_links admin write to require student.school_id match.
-- Run: npm run db:apply

-- ─── 0062.1 school_settings: write-only by principals/super-admins ──────────
-- Previously a single FOR ALL policy + GRANT INSERT/UPDATE on `authenticated`
-- let any same-school user (including teachers/students) toggle attendance
-- start/end times and the teacher-checkin flag.
DROP POLICY IF EXISTS school_settings_principal_rw ON public.school_settings;

CREATE POLICY school_settings_select ON public.school_settings
  FOR SELECT
  USING (
    public.is_super_admin()
    OR school_id = public.current_user_school_id()
  );

CREATE POLICY school_settings_principal_write ON public.school_settings
  FOR INSERT
  WITH CHECK (
    public.is_super_admin()
    OR (public.is_principal() AND school_id = public.current_user_school_id())
  );

CREATE POLICY school_settings_principal_update ON public.school_settings
  FOR UPDATE
  USING (
    public.is_super_admin()
    OR (public.is_principal() AND school_id = public.current_user_school_id())
  )
  WITH CHECK (
    public.is_super_admin()
    OR (public.is_principal() AND school_id = public.current_user_school_id())
  );

CREATE POLICY school_settings_principal_delete ON public.school_settings
  FOR DELETE
  USING (
    public.is_super_admin()
    OR (public.is_principal() AND school_id = public.current_user_school_id())
  );

-- ─── 0062.2 users_prevent_self_escalation: explicit allowlist ───────────────
-- Switch from a denylist (which missed editor_mode_until, email, name,
-- last_login) to an explicit allowlist of fields a non-super-admin user can
-- update on their own row. Service role (auth.uid() IS NULL) and SUPER_ADMIN
-- still get the unchanged path.
CREATE OR REPLACE FUNCTION public.users_prevent_self_escalation() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW; -- service role / admin tooling, allow
  END IF;
  IF public.is_super_admin() THEN
    RETURN NEW;
  END IF;
  -- Allowlist: phone-style profile fields user is permitted to self-edit.
  -- Everything else is forced back to OLD. This blocks self-escalation via
  -- editor_mode_until, role, school_id, is_active, first_login_changed,
  -- mobile_number, email, name, last_login, etc.
  NEW.id                  := OLD.id;
  NEW.role                := OLD.role;
  NEW.school_id           := OLD.school_id;
  NEW.is_active           := OLD.is_active;
  NEW.first_login_changed := OLD.first_login_changed;
  NEW.mobile_number       := OLD.mobile_number;
  NEW.email               := OLD.email;
  NEW.name                := OLD.name;
  NEW.editor_mode_until   := OLD.editor_mode_until;
  NEW.last_login          := OLD.last_login;
  NEW.created_at          := OLD.created_at;
  RETURN NEW;
END;
$$;

-- ─── 0062.3 parent_student_links: bind student to caller's school ───────────
-- Previously psl_admin_write let any principal insert links to a student in
-- a *different* school, allowing a malicious principal to attach a parent in
-- their school to a rival school's student record.
DROP POLICY IF EXISTS psl_admin_write ON public.parent_student_links;
CREATE POLICY psl_admin_write ON public.parent_student_links
  FOR ALL
  USING (
    public.is_super_admin()
    OR (
      public.is_principal()
      AND EXISTS (
        SELECT 1 FROM public.students s
         WHERE s.id = parent_student_links.student_id
           AND s.school_id = public.current_user_school_id()
      )
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.is_principal()
      AND EXISTS (
        SELECT 1 FROM public.students s
         WHERE s.id = parent_student_links.student_id
           AND s.school_id = public.current_user_school_id()
      )
    )
  );
