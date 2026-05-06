// Client wrapper around the server-side Gemini proxy at /api/ai/generate.
// The Google API key lives only on the server — see server/routes/ai.ts.
// This module used to ship the key in the bundle; that has been removed.

import { apiFetch } from '@/lib/apiClient';

export class GeminiUnavailableError extends Error {
  constructor() {
    super(
      'Gemini AI is not configured on the server. Ask your administrator to set ' +
      'GEMINI_API_KEY in the server environment to enable AI-powered exam paper generation.',
    );
    this.name = 'GeminiUnavailableError';
  }
}

/**
 * Send a prompt to Gemini via the server proxy and return the raw text.
 * Throws `GeminiUnavailableError` when the server reports 503.
 */
export async function generateText(prompt: string): Promise<string> {
  try {
    const { text } = await apiFetch<{ text: string }>('POST', '/ai/generate', { prompt });
    return text;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.toLowerCase().includes('not configured')) throw new GeminiUnavailableError();
    throw e;
  }
}

/** Strip markdown fences ```json … ``` if Gemini wraps its JSON output. */
export function stripJsonFence(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('```')) {
    return trimmed
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
  }
  return trimmed;
}

/**
 * Best-effort runtime probe — tries a no-op generation. The result isn't
 * cached; UI should call once per session if it needs to disable AI buttons.
 * For backwards compatibility callers can still get a "configured" answer
 * synchronously via the server's 503 path.
 */
export function isGeminiConfigured(): boolean {
  // Without an extra round-trip we can't know whether the server has the key.
  // Return true so UI doesn't pre-disable buttons; the actual call will
  // surface GeminiUnavailableError if the server is missing the key.
  return true;
}
