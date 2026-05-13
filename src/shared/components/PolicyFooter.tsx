import React, { useEffect, useState } from 'react';
import { ShieldCheck, ExternalLink } from 'lucide-react';
import { platformSettings } from '@/roles/super-admin/platformSettings.service';

/**
 * Tiny footer that renders a single tap-able "Privacy & Terms" link
 * pointing to the platform-wide policy URL configured by super-admin.
 *
 * - When the URL is empty (super-admin hasn't configured it yet), the
 *   component renders nothing so we don't show a broken anchor.
 * - Single source of truth: every role's Settings/Profile screen just
 *   drops this in, no per-role link duplication.
 * - Required by Play Store + Apple for any account-based app — the
 *   privacy policy must be reachable from inside the app, not just on
 *   the store listing page.
 *
 * The URL is cached at module scope so every role's
 * dashboard / profile / settings mount doesn't fire an independent
 * supabase round-trip. Cache survives the whole tab lifetime; if
 * super-admin changes the URL, a reload picks it up.
 */
let cachedUrl: string | null = null;
let inflight: Promise<string> | null = null;

export const PolicyFooter: React.FC<{ className?: string }> = ({ className = '' }) => {
  const [url, setUrl] = useState<string>(cachedUrl ?? '');
  const [loaded, setLoaded] = useState(cachedUrl !== null);

  useEffect(() => {
    if (cachedUrl !== null) return;
    let cancelled = false;
    const p = inflight ?? (inflight = platformSettings.getPolicyUrl()
      .then(u => { cachedUrl = u; return u; })
      .catch(() => { cachedUrl = ''; return ''; })
      .finally(() => { inflight = null; }));
    p.then(u => { if (!cancelled) { setUrl(u); setLoaded(true); } });
    return () => { cancelled = true; };
  }, []);

  if (!loaded || !url) return null;

  return (
    <div className={`flex justify-center pt-2 pb-4 ${className}`}>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-500 hover:text-slate-700 transition-colors px-3 py-2 rounded-full hover:bg-slate-100">
        <ShieldCheck size={12} />
        Privacy &amp; Terms
        <ExternalLink size={10} className="opacity-60" />
      </a>
    </div>
  );
};
