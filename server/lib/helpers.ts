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
