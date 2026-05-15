-- =============================================================
-- 0141_consent_capture.sql
-- =============================================================
-- Captures parent/student consent for processing personal data —
-- the minimal DPDP Act 2023 §6 (Notice & Consent) primitive. Two
-- columns on users:
--
--   consent_version  — integer; matches the CURRENT_CONSENT_VERSION
--                      constant on client+server. When the privacy
--                      text changes, bump the constant → every
--                      affected user is re-prompted on next login.
--   consent_at       — timestamp of the consent record. Useful for
--                      compliance audits ("when did parent agree?").
--
-- The middleware in server/middleware/auth.ts blocks every API call
-- from PARENT / STUDENT users whose consent_version is below the
-- current one, except /auth/consent + /auth/me + /auth/logout +
-- /auth/change-password. The client ConsentGate uses the same rule
-- to render a consent screen before the dashboard.
--
-- Existing users default to 0 — they'll see the consent screen on
-- next login. Per DPDP this retroactive prompt is required for
-- already-onboarded parents.
-- =============================================================

BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS consent_version INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS consent_at      TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS users_consent_version_idx
  ON public.users (consent_version);

COMMIT;
