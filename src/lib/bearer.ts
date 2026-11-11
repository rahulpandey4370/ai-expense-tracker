import { createHash, timingSafeEqual } from 'crypto';

/** True when the request carries `Authorization: Bearer <expected>`. Constant-time compare. */
export function hasBearer(req: Request, expected: string | undefined): boolean {
  if (!expected) return false;
  const got = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const a = createHash('sha256').update(got).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}
