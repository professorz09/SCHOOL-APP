import { Router } from 'express';
import { ok, fail, ApiError, requireBody } from '../lib/helpers';
import { requireAuth, requireRole } from '../middleware/auth';

export const aiRouter = Router();

const MODEL = 'gemini-2.0-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

// POST /api/ai/generate — proxy to Google Gemini.
// The API key lives only on the server (process.env.GEMINI_API_KEY); the
// browser never sees it. Restricted to TEACHER/PRINCIPAL roles since this
// is meant for paper generation, not a public LLM playground.
aiRouter.post('/generate', requireAuth, requireRole('TEACHER', 'PRINCIPAL'), async (req, res) => {
  try {
    const body = requireBody<{ prompt: string }>(req, ['prompt']);
    const key = (process.env.GEMINI_API_KEY ?? '').trim();
    if (!key || key === 'MY_GEMINI_API_KEY') {
      throw new ApiError(503, 'Gemini AI is not configured on the server');
    }

    if (typeof body.prompt !== 'string' || body.prompt.length === 0) {
      throw new ApiError(400, 'Prompt is required');
    }
    if (body.prompt.length > 12000) {
      throw new ApiError(413, 'Prompt is too large (max 12000 chars)');
    }

    const r = await fetch(`${ENDPOINT}?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: body.prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!r.ok) {
      let detail = r.statusText;
      try {
        const j = await r.json() as { error?: { message?: string } };
        detail = j.error?.message ?? detail;
      } catch { /* ignore */ }
      throw new ApiError(502, `Gemini API failed (${r.status}): ${detail}`);
    }

    const json = await r.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new ApiError(502, 'Gemini returned an empty response');

    ok(res, { text });
  } catch (err) { fail(res, err); }
});
