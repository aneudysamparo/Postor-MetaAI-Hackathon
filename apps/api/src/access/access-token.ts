import { createHash, timingSafeEqual } from 'node:crypto';

// Optional access gate for a public demo deployment (e.g. demo.postor.do).
// When DEMO_ACCESS_TOKEN is set, every /api route except health and the
// access endpoint requires proof of the token: an httpOnly cookie holding
// its SHA-256 (set by POST /api/access) or the x-postor-access header. The
// token itself is never stored in the cookie or logged.
export const ACCESS_COOKIE = 'postor_access';
export const ACCESS_HEADER = 'x-postor-access';
export const OPEN_PATHS = new Set(['/api/health', '/api/access']);

export function configuredAccessToken(env: NodeJS.ProcessEnv = process.env): string | null {
  const token = (env.DEMO_ACCESS_TOKEN ?? '').trim();
  if (token.length === 0) {
    return null;
  }
  return token;
}

export function digestOf(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

// Constant-time comparison of two hex digests.
export function digestsMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function cookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (cookieHeader === undefined) {
    return null;
  }
  for (const part of cookieHeader.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) {
      return decodeURIComponent(rest.join('='));
    }
  }
  return null;
}

// Pure decision (unit-tested): may this request reach the API?
export function isRequestAllowed(input: {
  path: string;
  token: string | null;
  cookieHeader: string | undefined;
  headerToken: string | undefined;
}): boolean {
  if (input.token === null || !input.path.startsWith('/api') || OPEN_PATHS.has(input.path)) {
    return true;
  }
  const expected = digestOf(input.token);
  const fromCookie = cookieValue(input.cookieHeader, ACCESS_COOKIE);
  if (fromCookie !== null && digestsMatch(fromCookie, expected)) {
    return true;
  }
  if (input.headerToken !== undefined && digestsMatch(digestOf(input.headerToken), expected)) {
    return true;
  }
  return false;
}
