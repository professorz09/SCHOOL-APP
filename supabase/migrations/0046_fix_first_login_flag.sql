-- Allow the one-way flip of first_login_changed (false → true) by the user
-- themselves. Without this, the prevent-self-escalation trigger force-reverts
-- the column on every UPDATE, so the SECURITY DEFINER RPC
-- mark_first_login_complete() looks like a no-op and the user gets stuck on
-- the first-login password screen forever.

CREATE OR REPLACE FUNCTION public.users_prevent_self_escalation() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW; -- service role / admin tooling
  END IF;
  IF public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  -- Lock identity / authority columns to OLD so the user can't self-promote.
  NEW.id := OLD.id;
  NEW.role := OLD.role;
  NEW.school_id := OLD.school_id;
  NEW.is_active := OLD.is_active;
  NEW.mobile_number := OLD.mobile_number;
  NEW.created_at := OLD.created_at;

  -- first_login_changed: allow only the one-way flip false → true for the
  -- caller's own row (this lets mark_first_login_complete RPC succeed).
  -- Block any other transition (true → false, etc.).
  IF NEW.id = auth.uid() AND OLD.first_login_changed = FALSE AND NEW.first_login_changed = TRUE THEN
    -- allow
    NULL;
  ELSE
    NEW.first_login_changed := OLD.first_login_changed;
  END IF;

  RETURN NEW;
END;
$$;
