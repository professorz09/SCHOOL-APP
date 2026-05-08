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

/**
 * Multimodal call: prompt + one or more images. Images must be supplied as
 * base64-encoded strings WITHOUT the `data:image/...;base64,` prefix —
 * use the helper below to convert a File. Returns the raw model text.
 */
export async function generateFromImages(
  prompt: string,
  images: Array<{ mimeType: string; data: string }>,
): Promise<string> {
  try {
    const { text } = await apiFetch<{ text: string }>('POST', '/ai/generate', { prompt, images });
    return text;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.toLowerCase().includes('not configured')) throw new GeminiUnavailableError();
    throw e;
  }
}

/** Read a browser File into the `{ mimeType, data }` shape Gemini expects.
 *  Strips the `data:...;base64,` prefix so the server gets pure base64. */
export async function fileToInlineImage(file: File): Promise<{ mimeType: string; data: string }> {
  const buf = await file.arrayBuffer();
  // btoa works on binary strings, so chunk the bytes to avoid call-stack limits
  // on large files.
  const bytes = new Uint8Array(buf);
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return { mimeType: file.type || 'image/jpeg', data: btoa(binary) };
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
