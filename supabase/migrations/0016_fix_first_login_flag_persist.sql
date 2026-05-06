-- ============================================================================
-- Migration 0016 — fix `first_login_changed` not persisting after a Principal
-- (or any non–super-admin user) completes the forced first-login password
-- change. Symptom: the password change succeeded, but every subsequent login
-- still showed the "change your password" screen.
--
-- Root cause:
--   * `public.mark_first_login_complete()` (SECURITY DEFINER, called by the
--     UI right after `supabase.auth.updateUser({ password })`) runs
--     `UPDATE public.users SET first_login_changed = TRUE WHERE id = auth.uid()`.
--   * The BEFORE UPDATE trigger `users_prevent_self_escalation` on the same
--     table forcibly resets a list of locked columns — including
--     `first_login_changed` — back to OLD.* whenever the caller is an
--     authenticated user that is NOT a super admin. Even though the RPC
--     runs SECURITY DEFINER, `auth.uid()` is still the principal's user id,
--     so the trigger nullifies its own RPC's write. The UPDATE silently
--     becomes a no-op.
--
-- Fix:
--   * `mark_first_login_complete()` sets a transaction-local GUC
--     `app.allow_first_login_flip = 'true'` *before* the UPDATE.
--   * `users_prevent_self_escalation` looks at the GUC and, if it is on,
--     allows the flag to flip from false to true (and only that direction;
--     it still blocks any other tampering with `first_login_changed` and
--     all the other locked columns). The GUC is transaction-scoped (third
--     arg `true` to set_config), so the escape hatch closes as soon as the
--     RPC's transaction commits.
--
-- Primary keys are untouched. Function signature of
-- `mark_first_login_complete()` is unchanged so existing GRANTs carry over.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.users_prevent_self_escalation() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_allow_first_login_flip TEXT;
BEGIN
  -- Service role / admin tooling: no JWT, allow everything.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  -- Super admins manage user rows directly.
  IF public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  -- Lock the rest of the sensitive columns to OLD values regardless.
  NEW.id := OLD.id;
  NEW.role := OLD.role;
  NEW.school_id := OLD.school_id;
  NEW.is_active := OLD.is_active;
  NEW.mobile_number := OLD.mobile_number;
  NEW.created_at := OLD.created_at;

  -- The forced first-login password-change flow needs to flip
  -- `first_login_changed` from FALSE to TRUE. The dedicated SECURITY
  -- DEFINER RPC `mark_first_login_complete()` opts in by setting the
  -- transaction-local GUC below; we honour that one-way flip and lock
  -- the column down again everywhere else.
  v_allow_first_login_flip := current_setting('app.allow_first_login_flip', true);
  IF v_allow_first_login_flip IS DISTINCT FROM 'true'
     OR OLD.first_login_changed IS NOT FALSE
     OR NEW.first_login_changed IS NOT TRUE
  THEN
    NEW.first_login_changed := OLD.first_login_changed;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_first_login_complete() RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;
  -- Open the trigger's escape hatch for just this transaction. Third
  -- argument `true` makes the setting transaction-local, so it is
  -- automatically reset when this RPC's implicit transaction commits.
  PERFORM set_config('app.allow_first_login_flip', 'true', true);
  UPDATE public.users
     SET first_login_changed = TRUE
   WHERE id = auth.uid();
END;
$$;
