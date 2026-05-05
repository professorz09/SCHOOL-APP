import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import {adminApiPlugin} from './vite-plugins/admin-api';
import {apiServerPlugin} from './vite-plugins/api-server';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const supabaseUrl = process.env.SUPABASE_URL ?? env.SUPABASE_URL ?? '';
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? env.SUPABASE_ANON_KEY ?? '';
  // GEMINI_API_KEY is intentionally NOT exposed to the client bundle. The
  // browser proxies through /api/ai/generate (server/routes/ai.ts) and the
  // key stays in the server process env only.
  return {
    plugins: [react(), tailwindcss(), adminApiPlugin(), apiServerPlugin()],
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey),
    },
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
