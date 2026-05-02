// Thin wrapper around Google Gemini's REST API, used by the teacher's
// AI Exam Paper Generator. The key is injected at build time from
// `GEMINI_API_KEY` (.env), substituted by Vite via `define`.
//
// Calls go directly from the browser → Gemini, so the key is shipped to
// the client. For a multi-tenant production deployment this should move
// to a server-side proxy, but for the current single-school SaaS pilot
// the principal/teacher already authenticates against Supabase, and the
// Gemini key is the school's own paid quota.

const GEMINI_KEY = (process.env.GEMINI_API_KEY ?? '').trim();
const MODEL = 'gemini-2.0-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export class GeminiUnavailableError extends Error {
  constructor() {
    super(
      'Gemini AI key is not configured. Ask your administrator to set GEMINI_API_KEY ' +
      'in the project secrets to enable AI-powered exam paper generation.',
    );
    this.name = 'GeminiUnavailableError';
  }
}

export function isGeminiConfigured(): boolean {
  return GEMINI_KEY.length > 0 && GEMINI_KEY !== 'MY_GEMINI_API_KEY';
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: { message?: string };
}

/**
 * Send a prompt to Gemini and return the raw text response. Throws a
 * `GeminiUnavailableError` if the key is missing, or a generic Error with
 * Gemini's diagnostic message on API failure.
 */
export async function generateText(prompt: string): Promise<string> {
  if (!isGeminiConfigured()) throw new GeminiUnavailableError();

  const url = `${ENDPOINT}?key=${encodeURIComponent(GEMINI_KEY)}`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = (await res.json()) as GeminiResponse;
      detail = j.error?.message ?? detail;
    } catch { /* ignore parse failure */ }
    throw new Error(`Gemini API failed (${res.status}): ${detail}`);
  }

  const json = (await res.json()) as GeminiResponse;
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned an empty response');
  return text;
}

/**
 * Strip markdown fences `​```json … ​```` if Gemini wraps its JSON output.
 */
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
