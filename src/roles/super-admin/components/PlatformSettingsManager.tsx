import React, { useEffect, useState } from 'react';
import {
  ArrowLeft, Save, IndianRupee, Calendar, Sparkles,
  RefreshCw, Mail, Building2, Layers,
} from 'lucide-react';
import { useUIStore } from '@/store/uiStore';
import { BillingPlan, PLAN_COLORS } from '@/shared/config/constants';
import {
  platformSettings, PlanPricing, BrandSettings,
  DEFAULT_PLAN_PRICING, DEFAULT_TRIAL_DAYS, DEFAULT_BRAND,
} from '@/roles/super-admin/platformSettings.service';

interface Props { onBack: () => void; }

type Section = 'PRICING' | 'TRIAL' | 'BRAND';

export const PlatformSettingsManager: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Section | null>(null);

  const [pricing, setPricing]   = useState<PlanPricing>(DEFAULT_PLAN_PRICING);
  const [trialDays, setTrialDays] = useState<number>(DEFAULT_TRIAL_DAYS);
  const [brand, setBrand]       = useState<BrandSettings>(DEFAULT_BRAND);

  // dirty flags so each card can be saved independently
  const [dirty, setDirty] = useState<Record<Section, boolean>>({ PRICING: false, TRIAL: false, BRAND: false });

  const load = async () => {
    setLoading(true);
    try {
      const data = await platformSettings.getAll();
      setPricing(data.pricing);
      setTrialDays(data.trialDays);
      setBrand(data.brand);
      setDirty({ PRICING: false, TRIAL: false, BRAND: false });
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to load settings', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const onPriceChange = (plan: BillingPlan, raw: string) => {
    const n = parseInt(raw.replace(/[^\d]/g, ''), 10);
    setPricing(p => ({ ...p, [plan]: Number.isFinite(n) ? n : 0 }));
    setDirty(d => ({ ...d, PRICING: true }));
  };

  const savePricing = async () => {
    setSaving('PRICING');
    try {
      await platformSettings.setPricing(pricing);
      setDirty(d => ({ ...d, PRICING: false }));
      showToast('Plan pricing updated');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Save failed', 'error');
    } finally {
      setSaving(null);
    }
  };

  const saveTrial = async () => {
    setSaving('TRIAL');
    try {
      await platformSettings.setTrialDays(trialDays);
      setDirty(d => ({ ...d, TRIAL: false }));
      showToast('Trial duration updated');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Save failed', 'error');
    } finally {
      setSaving(null);
    }
  };

  const saveBrand = async () => {
    setSaving('BRAND');
    try {
      await platformSettings.setBrand(brand);
      setDirty(d => ({ ...d, BRAND: false }));
      showToast('Brand updated');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Save failed', 'error');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600 hover:bg-slate-200 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight leading-none">Settings</h2>
            <p className="text-[10px] font-bold text-slate-400 mt-0.5">Platform-wide configuration</p>
          </div>
        </div>
        <button onClick={() => void load()} disabled={loading || saving !== null}
          className="p-2 bg-slate-100 text-slate-600 rounded-full hover:bg-slate-200 transition-colors disabled:opacity-50">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center py-20 text-slate-400">
          <div className="w-8 h-8 border-2 border-slate-200 border-t-slate-700 rounded-full animate-spin mb-3" />
          <p className="text-xs font-bold">Loading settings…</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* ── Plan pricing ───────────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <Layers size={18} />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900">Plan Pricing</h3>
                <p className="text-[10px] font-bold text-slate-400">Annual price billed per school</p>
              </div>
            </div>

            <div className="space-y-3">
              {(Object.values(BillingPlan)).map(plan => (
                <div key={plan} className="flex items-center gap-3">
                  <span className={`text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-widest w-24 text-center ${PLAN_COLORS[plan]}`}>
                    {plan}
                  </span>
                  <div className="flex-1 relative">
                    <IndianRupee size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      inputMode="numeric"
                      value={pricing[plan].toLocaleString('en-IN')}
                      onChange={e => onPriceChange(plan, e.target.value)}
                      className="w-full border border-slate-200 bg-slate-50 rounded-xl pl-9 pr-3 py-2.5 font-black text-sm outline-none focus:border-amber-500 focus:bg-white transition-colors"
                    />
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 w-10 text-right">/ yr</span>
                </div>
              ))}
            </div>

            <button
              onClick={savePricing}
              disabled={!dirty.PRICING || saving === 'PRICING'}
              className="w-full mt-4 flex items-center justify-center gap-2 bg-slate-900 text-white font-black text-[11px] uppercase tracking-widest py-3 rounded-xl active:scale-95 transition-transform disabled:opacity-40 disabled:cursor-not-allowed">
              <Save size={14} /> {saving === 'PRICING' ? 'Saving…' : dirty.PRICING ? 'Save pricing' : 'Saved'}
            </button>
          </div>

          {/* ── Trial duration ─────────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center">
                <Sparkles size={18} />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900">Trial Duration</h3>
                <p className="text-[10px] font-bold text-slate-400">Default free-trial length for new schools</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Calendar size={16} className="text-slate-400" />
              <input
                type="number"
                min={1}
                max={365}
                value={trialDays}
                onChange={e => { setTrialDays(parseInt(e.target.value, 10) || 0); setDirty(d => ({ ...d, TRIAL: true })); }}
                className="w-24 border border-slate-200 bg-slate-50 rounded-xl px-3 py-2.5 font-black text-sm outline-none focus:border-violet-500 focus:bg-white transition-colors"
              />
              <span className="text-xs font-bold text-slate-500">days</span>
            </div>

            <button
              onClick={saveTrial}
              disabled={!dirty.TRIAL || saving === 'TRIAL'}
              className="w-full mt-4 flex items-center justify-center gap-2 bg-slate-900 text-white font-black text-[11px] uppercase tracking-widest py-3 rounded-xl active:scale-95 transition-transform disabled:opacity-40 disabled:cursor-not-allowed">
              <Save size={14} /> {saving === 'TRIAL' ? 'Saving…' : dirty.TRIAL ? 'Save trial duration' : 'Saved'}
            </button>
          </div>

          {/* ── Brand ──────────────────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <Building2 size={18} />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900">Brand</h3>
                <p className="text-[10px] font-bold text-slate-400">Shown in headers, emails and the login screen</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Platform Name</label>
                <input
                  value={brand.name}
                  onChange={e => { setBrand(b => ({ ...b, name: e.target.value })); setDirty(d => ({ ...d, BRAND: true })); }}
                  className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-2.5 font-black text-sm outline-none focus:border-blue-500 focus:bg-white transition-colors"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Support Email</label>
                <div className="relative">
                  <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    value={brand.support_email}
                    onChange={e => { setBrand(b => ({ ...b, support_email: e.target.value })); setDirty(d => ({ ...d, BRAND: true })); }}
                    className="w-full border border-slate-200 bg-slate-50 rounded-xl pl-9 pr-3 py-2.5 font-bold text-sm outline-none focus:border-blue-500 focus:bg-white transition-colors"
                  />
                </div>
              </div>
            </div>

            <button
              onClick={saveBrand}
              disabled={!dirty.BRAND || saving === 'BRAND'}
              className="w-full mt-4 flex items-center justify-center gap-2 bg-slate-900 text-white font-black text-[11px] uppercase tracking-widest py-3 rounded-xl active:scale-95 transition-transform disabled:opacity-40 disabled:cursor-not-allowed">
              <Save size={14} /> {saving === 'BRAND' ? 'Saving…' : dirty.BRAND ? 'Save brand' : 'Saved'}
            </button>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3">
            <p className="text-[11px] font-bold text-amber-800 leading-relaxed">
              Changes apply immediately to new schools. Existing billing schedules
              keep their already-stamped amounts — only the next renewal uses the
              new pricing.
            </p>
          </div>

          <div className="h-6" />
        </div>
      )}
    </div>
  );
};
