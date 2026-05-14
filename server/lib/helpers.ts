import type { Request, Response } from 'express';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function ok(res: Response, data: unknown, status = 200) {
  res.status(status).json({ ok: true, data });
}

export function fail(res: Response, err: unknown) {
  if (err instanceof ApiError) {
    // Log 4xx ApiErrors too — they make user-facing failures (e.g. silent
    // 400 from missing-field validators) much easier to diagnose.
    console.warn(`[api ${err.status}] ${err.message}`);
    return res.status(err.status).json({ ok: false, error: err.message });
  }
  const msg = err instanceof Error ? err.message : 'Internal server error';
  console.error('[api error]', err);
  res.status(500).json({ ok: false, error: msg });
}

export function requireBody<T>(req: Request, fields: (keyof T)[]): T {
  const body = req.body as T;
  for (const f of fields) {
    if (body[f] === undefined || body[f] === null || body[f] === '') {
      throw new ApiError(400, `Field '${String(f)}' is required`);
    }
  }
  return body;
}

/**
 * Trim a user-supplied string field and enforce a length cap. Strips
 * control chars (NUL/BEL/etc.) that broke nothing functionally but
 * polluted notice/complaint bodies sent from copy-pasted Word docs.
 * Throws 400 if `required` is true and the trimmed value is empty.
 */
export function requireText(
  value: unknown,
  label: string,
  opts: { max: number; required?: boolean } = { max: 1000, required: true },
): string {
  if (value === null || value === undefined) {
    if (opts.required !== false) throw new ApiError(400, `${label} is required`);
    return '';
  }
  if (typeof value !== 'string') {
    throw new ApiError(400, `${label} must be text`);
  }
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
  if (cleaned === '' && opts.required !== false) {
    throw new ApiError(400, `${label} is required`);
  }
  if (cleaned.length > opts.max) {
    throw new ApiError(400, `${label} is too long (max ${opts.max} chars)`);
  }
  return cleaned;
}
