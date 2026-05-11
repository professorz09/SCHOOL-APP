// Hydrate process.env from .env / .env.local BEFORE any other plugin
// module loads. Done via a side-effect import (env-bootstrap.ts) because
// ES module imports hoist — calling dotenv inline after the plugin
// imports would run too late, after admin-api.ts had already cached
// empty SUPABASE_URL constants at its module top-level.
import './vite-plugins/env-bootstrap';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';
import {adminApiPlugin} from './vite-plugins/admin-api';
import {apiServerPlugin} from './vite-plugins/api-server';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  // Hydrate process.env from .env / .env.local so the API server (loaded
  // lazily by vite-plugins/api-server.ts) can see Supabase + Gemini keys.
  // Vite's loadEnv only returns the values for `define` substitution; the
  // server side reads process.env directly. Without this, the API server
  // boots with an empty SUPABASE_URL and the toast says "API server boot
  // failed" the moment the principal hits any /api/* endpoint.
  for (const k of [
    'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_DB_PASSWORD', 'SUPABASE_DB_HOST',
    'GEMINI_API_KEY', 'APP_URL', 'PORT',
  ]) {
    if (!process.env[k] && env[k]) process.env[k] = env[k];
  }
  const supabaseUrl = process.env.SUPABASE_URL ?? env.SUPABASE_URL ?? '';
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? env.SUPABASE_ANON_KEY ?? '';
  // GEMINI_API_KEY is intentionally NOT exposed to the client bundle. The
  // browser proxies through /api/ai/generate (server/routes/ai.ts) and the
  // key stays in the server process env only.
  return {
    plugins: [
      react(),
      tailwindcss(),
      adminApiPlugin(),
      apiServerPlugin(),
      // PWA — generates manifest + service worker so the app is
      // installable on Android/iOS home screens. Cache strategy is
      // network-first for /api/* (always fresh data) and stale-while-
      // revalidate for the static app shell. `registerType: autoUpdate`
      // means a new deploy is picked up on next reload without forcing
      // the user to manually clear cache.
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon.svg'],
        manifest: {
          name: 'EduGrow — School Management',
          short_name: 'EduGrow',
          description: 'Attendance, fees, exams, transport — one app for the whole school.',
          theme_color: '#4f46e5',
          background_color: '#ffffff',
          display: 'standalone',
          orientation: 'portrait',
          scope: '/',
          start_url: '/',
          lang: 'en-IN',
          categories: ['education', 'productivity'],
          icons: [
            { src: 'icon.svg', sizes: 'any',     type: 'image/svg+xml', purpose: 'any' },
            { src: 'icon.svg', sizes: 'any',     type: 'image/svg+xml', purpose: 'maskable' },
          ],
        },
        workbox: {
          // Skip caching API responses — always hit the network for live
          // fee/attendance/result data. App-shell assets get stale-while-
          // revalidate so the app boots instantly even offline.
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [
            {
              urlPattern: /^https?:\/\/[^/]+\/api\//,
              handler: 'NetworkOnly',
              options: { cacheName: 'api-no-cache' },
            },
            {
              urlPattern: ({ request }) =>
                request.destination === 'document' ||
                request.destination === 'script' ||
                request.destination === 'style',
              handler: 'StaleWhileRevalidate',
              options: { cacheName: 'app-shell' },
            },
            {
              urlPattern: ({ request }) => request.destination === 'image',
              handler: 'CacheFirst',
              options: {
                cacheName: 'images',
                expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
          ],
        },
        // Disable in dev — service workers cache aggressively and make
        // hot-reload painful. Use `vite build && vite preview` to test.
        devOptions: { enabled: false },
      }),
    ],
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey),
    },
    // Production hardening — strip console.* and debugger statements from
    // the prod bundle. console.warn/error stay in dev for debugging but
    // are dropped in `vite build` so internal state doesn't leak to a
    // user opening DevTools, and the bundle is a touch smaller.
    esbuild: mode === 'production'
      ? { drop: ['console', 'debugger'] }
      : undefined,
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5000,
      allowedHosts: true,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: {
        ignored: ['**/.local/**', '**/node_modules/**'],
      },
    },
    preview: {
      host: '0.0.0.0',
      port: 5000,
      allowedHosts: true,
    },
  };
});
