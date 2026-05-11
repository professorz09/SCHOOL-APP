// Platform settings — simplified.
//
// Earlier this page also held Plan Pricing (BASIC/STANDARD/PREMIUM annual
// rates) and Trial Duration. Both were dropped along with the legacy
// billing system; what remains is the platform brand (name + support
// email shown on the login screen / emails).

import React, { useEffect, useState } from 'react';
import { ArrowLeft, Save, Mail, Building2, RefreshCw } from 'lucide-react';
import { useUIStore } from '@/store/uiStore';
import {
  platformSettings, BrandSettings, DEFAULT_BRAND,
} from '@/roles/super-admin/platformSettings.service';

interface Props { onBack: () => void; }

export const PlatformSettingsManager: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [brand, setBrand] = useState<BrandSettings>(DEFAULT_BRAND);
  const [dirty, setDirty] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await platformSettings.getAll();
      setBrand(data.brand);
      setDirty(false);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to load settings', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const saveBrand = async () => {
    setSaving(true);
    try {
      await platformSettings.setBrand(brand);
      setDirty(false);
      showToast('Brand updated');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Save failed', 'error');
    } finally {
      setSaving(false);
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
            <p className="text-[10px] font-bold text-slate-400 mt-0.5">Platform brand</p>
          </div>
        </div>
        <button onClick={() => void load()} disabled={loading || saving}
          className="p-2 bg-slate-100 text-slate-600 rounded-full hover:bg-slate-200 transition-colors disabled:opacity-50">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center py-20 text-slate-400">
          <div className="w-8 h-8 border-2 border-slate-200 border-t-slate-700 rounded-full animate-spin mb-3" />
          <p className="text-xs font-bold">Loading…</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <Building2 size={18} />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900">Brand</h3>
                <p className="text-[10px] font-bold text-slate-400">Login screen + outgoing emails me dikhta hai</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Platform Name</label>
                <input
                  value={brand.name}
                  onChange={e => { setBrand(b => ({ ...b, name: e.target.value })); setDirty(true); }}
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
                    onChange={e => { setBrand(b => ({ ...b, support_email: e.target.value })); setDirty(true); }}
                    className="w-full border border-slate-200 bg-slate-50 rounded-xl pl-9 pr-3 py-2.5 font-bold text-sm outline-none focus:border-blue-500 focus:bg-white transition-colors"
                  />
                </div>
              </div>
            </div>

            <button
              onClick={saveBrand}
              disabled={!dirty || saving}
              className="w-full mt-4 flex items-center justify-center gap-2 bg-slate-900 text-white font-black text-[11px] uppercase tracking-widest py-3 rounded-xl active:scale-95 transition-transform disabled:opacity-40 disabled:cursor-not-allowed">
              <Save size={14} /> {saving ? 'Saving…' : dirty ? 'Save Brand' : 'Saved'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
