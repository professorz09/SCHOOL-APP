import type { Plugin, ViteDevServer, PreviewServer } from 'vite';

// Lazy-import the server bundle inside the dev/preview hooks instead of
// at module top-level. Vite re-bundles plugin source during config load,
// and a top-level `import { app } from '../server/app'` drags in
// express-rate-limit's import-time validator — which triggers
// ERR_ERL_KEY_GEN_IPV6 because esbuild renames the `ipKeyGenerator`
// helper inside the keyGenerator's stringified source. Deferring the
// import to runtime keeps the validator happy and means `vite build`
// (production bundle) doesn't import the server at all.
// Mount synchronously — Vite registers its own middlewares (including
// the SPA fallback) immediately after configureServer() returns, so any
// async-only registration ends up AFTER the SPA handler and gets shadowed
// for /api/* paths. We register a wrapper now and swap in the real
// express app once the dynamic import resolves.
function mount(server: ViteDevServer | PreviewServer) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let app: any = null;
  let importErr: unknown = null;

  // Kick off the real server import. Lazy because top-level imports
  // re-trigger express-rate-limit's validator during Vite's plugin bundle
  // step (ERR_ERL_KEY_GEN_IPV6) and stamp out the entire /api/* surface.
  import('../server/app')
    .then(m => {
      app = m.app;
      // eslint-disable-next-line no-console
      console.log('  ➜  api server: /api/* (dev) ready');
    })
    .catch(err => {
      importErr = err;
      // eslint-disable-next-line no-console
      console.error('[api-server] failed to mount /api/*:', err);
    });

  server.middlewares.use((req, res, next) => {
    if (!req.url?.startsWith('/api/')) return next();
    if (importErr) {
      res.statusCode = 500;
      res.end(JSON.stringify({ ok: false, error: 'API server boot failed — check terminal' }));
      return;
    }
    if (!app) {
      // Boot still pending. 503 so the client knows to retry.
      res.statusCode = 503;
      res.setHeader('Retry-After', '1');
      res.end(JSON.stringify({ ok: false, error: 'API server booting, please retry' }));
      return;
    }
    app(req, res, next);
  });
}

export function apiServerPlugin(): Plugin {
  return {
    name: 'api-server',
    configureServer:        (s) => mount(s),
    configurePreviewServer: (s) => mount(s),
  };
}
