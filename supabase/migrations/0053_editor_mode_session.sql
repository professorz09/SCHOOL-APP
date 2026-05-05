-- Server-side Editor Mode session.
--
-- Editor Mode = a 30-min privileged-edit window the principal flips on for
-- destructive operations (payment reversal, document delete, locked
-- attendance correction, locked-result edit). Previously this state lived
-- only in a Zustand store, which means an attacker could bypass every gated
-- route by sending `editorMode:true` in the request body. We now persist
-- the window on the user row so the server is the source of truth.
--
-- Only the user themselves (or service role) can flip their own column.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS editor_mode_until timestamptz NULL;

CREATE INDEX IF NOT EXISTS users_editor_mode_until_idx
  ON public.users(editor_mode_until)
  WHERE editor_mode_until IS NOT NULL;

-- Helper RPC: enable for caller. Returns the new expiry timestamp.
CREATE OR REPLACE FUNCTION public.enable_editor_mode(p_minutes int DEFAULT 30)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_until timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_minutes <= 0 OR p_minutes > 60 THEN
    RAISE EXCEPTION 'invalid duration' USING ERRCODE = 'check_violation';
  END IF;
  v_until := now() + make_interval(mins => p_minutes);
  UPDATE public.users
     SET editor_mode_until = v_until
   WHERE id = auth.uid();
  RETURN v_until;
END;
$$;

CREATE OR REPLACE FUNCTION public.disable_editor_mode()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE public.users
     SET editor_mode_until = NULL
   WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.enable_editor_mode(int)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.disable_editor_mode()    TO authenticated;
