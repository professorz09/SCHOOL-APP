import type { Plugin, ViteDevServer, PreviewServer } from 'vite';
import { app } from '../server/app';

function mount(server: ViteDevServer | PreviewServer) {
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
    configureServer:        (s) => mount(s),
    configurePreviewServer: (s) => mount(s),
  };
}
