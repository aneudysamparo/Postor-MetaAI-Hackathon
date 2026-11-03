import { AsyncLocalStorage } from 'node:async_hooks';

// Bring-your-own-key for the public demo: a visitor's Meta key travels in
// the x-meta-api-key header of POST /api/workflows only, lives in this
// async context for that run, and is never stored, logged or returned.
// loadMetaModelsConfig reads it before the server key; with
// POSTOR_REQUIRE_USER_KEY=true the server key is never used for runs.
const requestKeyStore = new AsyncLocalStorage<string>();
const MIN_KEY_LENGTH = 16;
const MAX_KEY_LENGTH = 512;
const ENABLED_FLAG_VALUES = new Set(['true', '1', 'yes']);

export function runWithMetaKey<T>(key: string | null, work: () => T): T {
  if (key === null) {
    return work();
  }
  return requestKeyStore.run(key, work);
}

export function currentRequestMetaKey(): string | null {
  return requestKeyStore.getStore() ?? null;
}

export function userKeyRequired(env: NodeJS.ProcessEnv = process.env): boolean {
  return ENABLED_FLAG_VALUES.has((env.POSTOR_REQUIRE_USER_KEY ?? '').trim().toLowerCase());
}

// Shape check only (no network call): rejects empty/garbage headers early.
export function normalizeUserKey(raw: unknown): string | null {
  if (typeof raw !== 'string') {
    return null;
  }
  const key = raw.trim();
  if (key.length < MIN_KEY_LENGTH || key.length > MAX_KEY_LENGTH || /\s/.test(key)) {
    return null;
  }
  return key;
}
