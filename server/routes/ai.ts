import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { adminDb } from '../lib/db';
import { ok, fail, ApiError, requireBody } from '../lib/helpers';
import { requireAuth, requireRole } from '../middleware/auth';

export const aiRouter = Router();

// Gemini calls are billable + share a single platform key across
// every school. A misbehaving client (or compromised teacher token)
// could otherwise exhaust the daily Gemini quota and break AI
// features for everyone. 10/min per user is well above any realistic
// paper-generation cadence; daily cap of 200 is the cost ceiling.
const aiPerMinuteLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  keyGenerator: (req: any) => `ai-min:${req.user?.id ?? req.ip}`,
  validate: { keyGeneratorIpFallback: false },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { ok: false, error: 'AI rate limit reached (10 / minute). Wait a bit.' },
});
const aiPerDayLimiter = rateLimit({
  windowMs: 24 * 60 * 60_000,
  limit: 200,
  keyGenerator: (req: any) => `ai-day:${req.user?.id ?? req.ip}`,
  validate: { keyGeneratorIpFallback: false },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { ok: false, error: 'AI daily quota reached (200 / day). Try tomorrow.' },
});

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
aiRouter.post('/generate', aiPerMinuteLimiter, aiPerDayLimiter, requireAuth, requireRole('TEACHER', 'PRINCIPAL'), async (req, res) => {
  try {
    const body = requireBody<{
      prompt: string;
      images?: Array<{ mimeType: string; data: string }>;
      // When the caller wants the generated content saved into the
      // last-50-papers history (paper-generator flow). Counts against
      // the school's monthly quota. Plain ad-hoc generations leave it
      // unset so they don't burn the quota.
      savePaper?: boolean;
      paperRequest?: Record<string, unknown>;
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
      // Gemini officially supports png/jpeg/webp/heic/heif. Some
      // Android cameras report "image/jpg" (no 'e') and "image/x-png"
      // — normalise both and accept. Also strip any "; charset=…"
      // suffix some browsers append when reading from clipboard.
      const cleanedMime = img.mimeType.split(';')[0].trim().toLowerCase();
      const normalised = cleanedMime
        .replace(/^image\/jpg$/, 'image/jpeg')
        .replace(/^image\/x-png$/, 'image/png');
      if (!/^image\/(png|jpeg|webp|heic|heif)$/.test(normalised)) {
        throw new ApiError(415, `Unsupported image type: ${img.mimeType} (use PNG / JPEG / WEBP / HEIC)`);
      }
      img.mimeType = normalised;
      // Rough cap: ~6 MB raw → ~8 MB base64. Gemini max inline ≈ 7 MB.
      if (img.data.length > 8 * 1024 * 1024) {
        throw new ApiError(413, 'Image too large (max ~6 MB)');
      }
    }

    // Per-school monthly quota — set by super-admin via
    // schools.ai_papers_monthly_limit. 0 means unlimited.
    // The count is taken from ai_paper_history rows for this school
    // dated this calendar month. We only enforce the quota for the
    // exam-paper flow (i.e. when the caller flagged this generation
    // as a paper save) — ad-hoc /generate calls without the
    // `savePaper` flag bypass the quota count but are still rate-
    // limited by aiPerMinuteLimiter / aiPerDayLimiter.
    const wantsSave = !!body.savePaper;
    // Reserve a placeholder row up-front so the quota count is incremented
    // BEFORE the slow Gemini call. Earlier the count check + actual insert
    // were separated by a multi-second LLM call — N parallel requests at
    // the cap could each see count < limit and all succeed, blowing past
    // the monthly cap. Reserving early closes the race to ~one DB
    // roundtrip; if the post-insert recount detects we crossed the line
    // (another racer reserved first), we yank the placeholder + 429.
    let reservedId: string | null = null;
    let monthlyLimit = 0;
    if (wantsSave && req.user.school_id) {
      const { data: schoolRow } = await adminDb.from('schools')
        .select('ai_papers_monthly_limit').eq('id', req.user.school_id).maybeSingle();
      monthlyLimit = (schoolRow as { ai_papers_monthly_limit: number } | null)?.ai_papers_monthly_limit ?? 50;
      if (monthlyLimit > 0) {
        const istMonthStart = new Date(
          new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }),
        );
        istMonthStart.setDate(1);
        istMonthStart.setHours(0, 0, 0, 0);
        // Pre-check (cheap reject when obviously over).
        const { count: preCount } = await adminDb.from('ai_paper_history')
          .select('id', { count: 'exact', head: true })
          .eq('school_id', req.user.school_id)
          .gte('created_at', istMonthStart.toISOString());
        if ((preCount ?? 0) >= monthlyLimit) {
          throw new ApiError(429,
            `This month's AI paper quota reached (${monthlyLimit}/month). Contact your school administrator.`);
        }
        // Reserve a slot. Empty paper_json gets filled in after Gemini
        // returns; if Gemini fails or we lose the race, delete the row.
        const { data: reserved, error: resErr } = await adminDb
          .from('ai_paper_history')
          .insert({
            school_id:    req.user.school_id,
            generated_by: req.user.id,
            request_json: body.paperRequest ?? {},
            paper_json:   { reserved: true },
            prompt_chars: body.prompt.length,
          })
          .select('id')
          .single();
        if (resErr) throw new ApiError(500, `Quota reservation failed: ${resErr.message}`);
        reservedId = (reserved as { id: string }).id;
        // Re-count after our own insert. If parallel racers pushed us
        // past the limit, surrender our reservation and 429.
        const { count: postCount } = await adminDb.from('ai_paper_history')
          .select('id', { count: 'exact', head: true })
          .eq('school_id', req.user.school_id)
          .gte('created_at', istMonthStart.toISOString());
        if ((postCount ?? 0) > monthlyLimit) {
          await adminDb.from('ai_paper_history').delete().eq('id', reservedId);
          reservedId = null;
          throw new ApiError(429,
            `This month's AI paper quota reached (${monthlyLimit}/month). Contact your school administrator.`);
        }
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
      // Gemini failed — surrender the reserved quota slot so the user
      // isn't billed for a generation that never returned content.
      if (reservedId) {
        try { await adminDb.from('ai_paper_history').delete().eq('id', reservedId); }
        catch { /* best-effort */ }
      }
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
    if (!text) {
      if (reservedId) {
        try { await adminDb.from('ai_paper_history').delete().eq('id', reservedId); }
        catch { /* best-effort */ }
      }
      throw new ApiError(502, 'Gemini returned an empty response');
    }

    // Fill in the reserved row with the real content. (Previous code
    // INSERTed here, but the quota-reservation path above already wrote
    // a placeholder we just need to update.)
    if (reservedId) {
      let parsed: unknown = text;
      try { parsed = JSON.parse(text); } catch { /* keep raw text */ }
      try {
        await adminDb.from('ai_paper_history').update({
          paper_json: typeof parsed === 'string' ? { raw: parsed } : parsed,
        }).eq('id', reservedId);
      } catch (e) {
        // Update failure shouldn't fail the user-visible call — the
        // paper already came back. Log and move on.
        // eslint-disable-next-line no-console
        console.warn('[ai] paper history fill-in failed:', e);
      }
    }

    ok(res, { text });
  } catch (err) { fail(res, err); }
});

// GET /api/ai/papers — list the last 50 generated papers for the
// caller's school. Read-restricted to PRINCIPAL/TEACHER (RLS already
// enforces school scoping; we add the role gate as defence).
aiRouter.get('/papers', requireAuth, requireRole('TEACHER', 'PRINCIPAL'), async (req, res) => {
  try {
    if (!req.user.school_id) throw new ApiError(400, 'No school in session');
    const { data, error } = await adminDb.from('ai_paper_history')
      .select('id, generated_by, request_json, paper_json, created_at')
      .eq('school_id', req.user.school_id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw new ApiError(500, error.message);
    ok(res, data ?? []);
  } catch (err) { fail(res, err); }
});

// GET /api/ai/quota — current month's usage + cap.
aiRouter.get('/quota', requireAuth, requireRole('TEACHER', 'PRINCIPAL'), async (req, res) => {
  try {
    if (!req.user.school_id) throw new ApiError(400, 'No school in session');
    const { data: schoolRow } = await adminDb.from('schools')
      .select('ai_papers_monthly_limit').eq('id', req.user.school_id).maybeSingle();
    const limit = (schoolRow as { ai_papers_monthly_limit: number } | null)?.ai_papers_monthly_limit ?? 50;
    const istMonthStart = new Date(
      new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }),
    );
    istMonthStart.setDate(1);
    istMonthStart.setHours(0, 0, 0, 0);
    const { count } = await adminDb.from('ai_paper_history')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', req.user.school_id)
      .gte('created_at', istMonthStart.toISOString());
    ok(res, { used: count ?? 0, limit, unlimited: limit === 0 });
  } catch (err) { fail(res, err); }
});
