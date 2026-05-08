import type { Plugin, ViteDevServer, PreviewServer } from 'vite';

// Lazy-import the server bundle inside the dev/preview hooks instead of
// at module top-level. Vite re-bundles plugin source during config load,
// and a top-level `import { app } from '../server/app'` drags in
// express-rate-limit's import-time validator — which triggers
// ERR_ERL_KEY_GEN_IPV6 because esbuild renames the `ipKeyGenerator`
// helper inside the keyGenerator's stringified source. Deferring the
// import to runtime keeps the validator happy and means `vite build`
// (production bundle) doesn't import the server at all.
async function mount(server: ViteDevServer | PreviewServer) {
  const { app } = await import('../server/app');
  server.middlewares.use((req, res, next) => {
    if (req.url?.startsWith('/api/')) {
      app(req as any, res as any, next);
    } else {
      next();
    }
  });
}

export function apiServerPlugin(): Plugin {
  return {
    name: 'api-server',
    configureServer:        (s) => { void mount(s); },
    configurePreviewServer: (s) => { void mount(s); },
  };
}
