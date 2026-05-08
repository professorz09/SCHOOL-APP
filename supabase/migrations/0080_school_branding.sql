-- =============================================================
-- 0080_school_branding.sql
-- =============================================================
-- Branding columns on schools so admit cards / ID cards / marksheets
-- can pick up the school's logo, accent color, and principal
-- signature without each tool persisting its own copies. Storage paths
-- live under the existing `school-assets` bucket — same convention as
-- payment_qr_path. Defaults intentionally empty so nothing changes for
-- schools that haven't configured branding yet.
-- =============================================================

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS logo_path                TEXT,
  ADD COLUMN IF NOT EXISTS principal_signature_path TEXT,
  ADD COLUMN IF NOT EXISTS accent_color             TEXT;

-- Sanity check: accent_color must be a 7-char hex (#RRGGBB) or NULL.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'schools_accent_color_chk'
  ) THEN
    ALTER TABLE public.schools
      ADD CONSTRAINT schools_accent_color_chk
      CHECK (accent_color IS NULL OR accent_color ~ '^#[0-9A-Fa-f]{6}$');
  END IF;
END $$;
