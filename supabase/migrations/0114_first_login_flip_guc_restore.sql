-- 0114_first_login_flip_guc_restore.sql
-- Migration 0062.2 rewrote users_prevent_self_escalation() as a strict
-- allowlist trigger that unconditionally resets first_login_changed back
-- to OLD for any non-super-admin caller. That clobbered the GUC escape
-- hatch added in migration 0016 (app.allow_first_login_flip), so
-- mark_first_login_complete()'s UPDATE silently no-ops. Symptom: a
-- principal changes their password on first login, but the next login
-- still routes them to the "change password" screen forever.
--
-- Fix: re-add the GUC check. When mark_first_login_complete() sets
-- app.allow_first_login_flip='true' for the duration of its own
-- transaction, allow first_login_changed to flip from false→true (and
-- only that direction). Everything else stays locked.

CREATE OR REPLACE FUNCTION public.users_prevent_self_escalation() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_allow_flip TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  NEW.id                := OLD.id;
  NEW.role              := OLD.role;
  NEW.school_id         := OLD.school_id;
  NEW.is_active         := OLD.is_active;
  NEW.mobile_number     := OLD.mobile_number;
  NEW.email             := OLD.email;
  NEW.name              := OLD.name;
  NEW.editor_mode_until := OLD.editor_mode_until;
  NEW.last_login        := OLD.last_login;
  NEW.created_at        := OLD.created_at;

  v_allow_flip := current_setting('app.allow_first_login_flip', true);
  IF v_allow_flip IS DISTINCT FROM 'true'
     OR OLD.first_login_changed IS NOT FALSE
     OR NEW.first_login_changed IS NOT TRUE THEN
    NEW.first_login_changed := OLD.first_login_changed;
  END IF;

  RETURN NEW;
END;
$$;
