-- 0095_email_otp_2fa.sql
--
-- Optional email-OTP two-factor for high-stakes accounts (PRINCIPAL +
-- SUPER_ADMIN). Default OFF so existing users see no change. When the
-- principal toggles it on from Settings → Security, login flow becomes:
--
--   1. mobile + password (server verifies)
--   2. server detects email_otp_2fa = true → does NOT issue tokens,
--      returns { requires2FA: true, email } to client
--   3. client calls supabase.auth.signInWithOtp({ email }) → Supabase
--      emails a 6-digit code natively (free tier: 4/hour/user)
--   4. user types code → supabase.auth.verifyOtp() → real session
--
-- Schema cost: one nullable boolean column, indexed lookup not needed
-- (column already accessed by id in the per-row login profile fetch).
-- The trigger below blocks the toggle for non-principal/super-admin
-- roles AND for users with no email — same protection done in the UI,
-- but defended at the DB so a direct REST call can't bypass it.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS email_otp_2fa BOOLEAN NOT NULL DEFAULT false;

-- Block the flag being flipped on for accounts where it has no meaning.
-- Phrased as a BEFORE UPDATE trigger because the existing
-- users_prevent_self_escalation trigger already pattern-locks role
-- changes — same shape here keeps server-side admin updates allowed
-- while RLS-bypassing service-role inserts/updates work as expected.
CREATE OR REPLACE FUNCTION public.enforce_email_otp_2fa_eligibility() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.email_otp_2fa IS TRUE AND OLD.email_otp_2fa IS DISTINCT FROM TRUE THEN
    -- Only PRINCIPAL / SUPER_ADMIN may enable. STUDENT / PARENT /
    -- TEACHER / DRIVER login by mobile number — most don't even have
    -- an email on file — so 2FA via email isn't applicable.
    IF NEW.role NOT IN ('PRINCIPAL', 'SUPER_ADMIN') THEN
      RAISE EXCEPTION 'email_otp_2fa is only available for PRINCIPAL / SUPER_ADMIN accounts';
    END IF;
    -- Email is required so the OTP has somewhere to land.
    IF NEW.email IS NULL OR length(trim(NEW.email)) = 0 THEN
      RAISE EXCEPTION 'Cannot enable email OTP 2FA — set an email on this account first';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_email_otp_2fa_eligibility ON public.users;
CREATE TRIGGER users_email_otp_2fa_eligibility
  BEFORE UPDATE OF email_otp_2fa, role, email ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.enforce_email_otp_2fa_eligibility();
