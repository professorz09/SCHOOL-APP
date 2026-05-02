import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import {adminApiPlugin} from './vite-plugins/admin-api';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const supabaseUrl = process.env.SUPABASE_URL ?? env.SUPABASE_URL ?? '';
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? env.SUPABASE_ANON_KEY ?? '';
  const geminiApiKey = process.env.GEMINI_API_KEY ?? env.GEMINI_API_KEY ?? '';
  return {
    plugins: [react(), tailwindcss(), adminApiPlugin()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(geminiApiKey),
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
