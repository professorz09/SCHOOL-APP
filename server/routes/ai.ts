import { Router } from 'express';
import { ok, fail, ApiError, requireBody } from '../lib/helpers';
import { requireAuth, requireRole } from '../middleware/auth';

export const aiRouter = Router();

// Gemini 3-series. gemini-2.0-flash and gemini-2.5-* are scheduled for
// deprecation (June 2026); we're already on the 3.x line. `flash-preview`
// is the production-grade flash tier with Pro-level reasoning at flash
// pricing. Switch to `gemini-3.1-flash-lite-preview` for high-volume /
// cost-sensitive workloads.
const MODEL = 'gemini-3-flash-preview';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

// POST /api/ai/generate — proxy to Google Gemini.
// The API key lives only on the server (process.env.GEMINI_API_KEY); the
// browser never sees it. Restricted to TEACHER/PRINCIPAL roles since this
// is meant for paper generation, not a public LLM playground.
//
// `images` (optional) lets callers do vision tasks — each entry is an
// inline base64 image (mimeType + data, NO data: prefix). Gemini 3 Flash
// handles multimodal inputs natively. Used by the "AI Scan Notes" flow
// in the Exam Gen tool to OCR handwritten/printed notes into structured
// questions.
aiRouter.post('/generate', requireAuth, requireRole('TEACHER', 'PRINCIPAL'), async (req, res) => {
  try {
    const body = requireBody<{
      prompt: string;
      images?: Array<{ mimeType: string; data: string }>;
    }>(req, ['prompt']);
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

    // Validate image payload if present. Limits guard against runaway
    // memory and Gemini's per-request payload cap.
    const images = Array.isArray(body.images) ? body.images : [];
    if (images.length > 4) {
      throw new ApiError(413, 'At most 4 images per request');
    }
    for (const img of images) {
      if (!img || typeof img.mimeType !== 'string' || typeof img.data !== 'string') {
        throw new ApiError(400, 'Each image needs mimeType and base64 data');
      }
      if (!/^image\/(png|jpe?g|webp|heic|heif)$/i.test(img.mimeType)) {
        throw new ApiError(415, `Unsupported image type: ${img.mimeType}`);
      }
      // Rough cap: ~6 MB raw → ~8 MB base64. Gemini max inline ≈ 7 MB.
      if (img.data.length > 8 * 1024 * 1024) {
        throw new ApiError(413, 'Image too large (max ~6 MB)');
      }
    }

    const parts: Array<Record<string, unknown>> = [{ text: body.prompt }];
    for (const img of images) {
      parts.push({ inline_data: { mime_type: img.mimeType, data: img.data } });
    }

    const r = await fetch(`${ENDPOINT}?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
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
