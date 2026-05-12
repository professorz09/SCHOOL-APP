// Vercel serverless function — single entry point that delegates all
// `/api/*` requests to the existing Express app. Vercel auto-routes
// `api/index.ts` to handle `/api` and we use `vercel.json` rewrites
// to capture `/api/*` paths.
//
// The Express app reads SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// SUPABASE_DB_PASSWORD, GEMINI_API_KEY from process.env — set these in
// Vercel project settings (Settings → Environment Variables).

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { app } from './app';

// Vercel hands us req/res objects that are compatible with Node's http
// types (which Express accepts). The double cast keeps TS happy without
// importing the full @types/node http surface here.
export default function handler(req: VercelRequest, res: VercelResponse): void {
  app(req as unknown as Parameters<typeof app>[0], res as unknown as Parameters<typeof app>[1]);
}
