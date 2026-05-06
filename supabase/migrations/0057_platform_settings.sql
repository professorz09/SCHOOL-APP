-- Platform-level configuration that the super admin can tune from the UI
-- without redeploying. Singleton row pattern: one row per `key`, JSONB value.
-- Used initially for plan pricing, but the schema is generic enough to host
-- trial duration, support email, brand colours, feature flags, etc.

CREATE TABLE IF NOT EXISTS public.platform_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES public.users(id)
);

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated user (the principals dashboard reads default trial
-- length, brand name, etc.). No PII here.
DROP POLICY IF EXISTS platform_settings_read ON public.platform_settings;
CREATE POLICY platform_settings_read ON public.platform_settings
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Write: super-admin only.
DROP POLICY IF EXISTS platform_settings_write ON public.platform_settings;
CREATE POLICY platform_settings_write ON public.platform_settings
  FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Seed default plan pricing (matches the previous build-time constants).
INSERT INTO public.platform_settings (key, value)
VALUES
  ('plan_pricing', jsonb_build_object('BASIC', 2999, 'STANDARD', 5999, 'PREMIUM', 9999)),
  ('trial_days',   to_jsonb(30)),
  ('brand',        jsonb_build_object('name', 'EduGrow', 'support_email', 'support@edugrow.in'))
ON CONFLICT (key) DO NOTHING;
