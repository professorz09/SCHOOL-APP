-- Policy URL — single platform-wide setting that points to the public
-- privacy + terms + deletion-instructions page (hosted on Vercel).
-- Every role's Settings/Profile screen reads this and renders a link.
--
-- Stored as the existing key/value platform_settings singleton row
-- rather than a new column, so the super-admin Settings page just
-- adds one more input alongside Brand. Default '' until super-admin
-- fills it in — UI hides the link when blank to avoid a broken tap.
INSERT INTO public.platform_settings (key, value)
VALUES ('policy_url', to_jsonb(''::text))
ON CONFLICT (key) DO NOTHING;
