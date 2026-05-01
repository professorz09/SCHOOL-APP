-- Add principal-managed payment settings
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS upi_id TEXT,
  ADD COLUMN IF NOT EXISTS payment_qr_path TEXT;

-- Storage bucket for school assets (payment QR etc.)
INSERT INTO storage.buckets (id, name, public)
VALUES ('school-assets', 'school-assets', true)
ON CONFLICT (id) DO NOTHING;
