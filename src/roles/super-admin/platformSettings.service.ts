import { supabase } from '@/lib/supabase';
import { BillingPlan } from '@/shared/config/constants';

/**
 * Platform-level settings that the super admin tunes from the UI. Backed by
 * the `platform_settings` table (singleton-row-per-key with JSONB value).
 *
 * Defaults mirror the original build-time constants — the service reads
 * once at startup, falls back to defaults if a key is missing, and the
 * Settings page writes new values via `setKey`.
 */

export type PlanPricing = Record<BillingPlan, number>;
export interface BrandSettings { name: string; support_email: string; }

export const DEFAULT_PLAN_PRICING: PlanPricing = {
  [BillingPlan.BASIC]: 2999,
  [BillingPlan.STANDARD]: 5999,
  [BillingPlan.PREMIUM]: 9999,
};
export const DEFAULT_TRIAL_DAYS = 30;
export const DEFAULT_BRAND: BrandSettings = { name: 'EduGrow', support_email: 'support@edugrow.in' };
/** Public URL where the Privacy Policy + Terms + Account-Deletion
 *  instructions live (single page with anchored sections). Empty string
 *  means the super-admin hasn't configured it yet — UI hides the link
 *  rather than rendering a dead anchor. */
export const DEFAULT_POLICY_URL = '';

async function readKey<T>(key: string, fallback: T): Promise<T> {
  const { data, error } = await supabase
    .from('platform_settings').select('value').eq('key', key).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return fallback;
  return (data as { value: T }).value ?? fallback;
}

async function writeKey<T>(key: string, value: T): Promise<void> {
  const { error } = await supabase
    .from('platform_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(error.message);
}

export const platformSettings = {
  async getAll(): Promise<{ pricing: PlanPricing; trialDays: number; brand: BrandSettings; policyUrl: string }> {
    const [pricing, trialDays, brand, policyUrl] = await Promise.all([
      readKey<PlanPricing>('plan_pricing', DEFAULT_PLAN_PRICING),
      readKey<number>('trial_days', DEFAULT_TRIAL_DAYS),
      readKey<BrandSettings>('brand', DEFAULT_BRAND),
      readKey<string>('policy_url', DEFAULT_POLICY_URL),
    ]);
    return { pricing, trialDays, brand, policyUrl };
  },

  /** Lightweight read used by per-role Settings/Profile screens — they
   *  only need the URL, not the whole bundle. Returns '' if unset. */
  async getPolicyUrl(): Promise<string> {
    return readKey<string>('policy_url', DEFAULT_POLICY_URL);
  },

  async setPricing(pricing: PlanPricing): Promise<void> {
    // Defensive: reject negative or non-finite numbers — DB has no CHECK
    // constraint on JSONB content, so guard at the call site.
    for (const v of Object.values(pricing)) {
      if (!Number.isFinite(v) || v < 0) throw new Error(`Invalid plan price: ${v}`);
    }
    await writeKey('plan_pricing', pricing);
  },

  async setTrialDays(days: number): Promise<void> {
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      throw new Error('Trial duration must be 1–365 days');
    }
    await writeKey('trial_days', days);
  },

  async setBrand(brand: BrandSettings): Promise<void> {
    if (!brand.name.trim()) throw new Error('Brand name required');
    await writeKey('brand', brand);
  },

  async setPolicyUrl(url: string): Promise<void> {
    const trimmed = url.trim();
    // Allow empty (= hide link everywhere) or a valid http/https URL.
    // No partial/local URLs — Play Store + Apple want a publicly
    // reachable page, so a typo'd value is safer rejected than saved.
    if (trimmed && !/^https?:\/\/.+/i.test(trimmed)) {
      throw new Error('Policy URL must start with https:// or http://');
    }
    await writeKey('policy_url', trimmed);
  },
};
