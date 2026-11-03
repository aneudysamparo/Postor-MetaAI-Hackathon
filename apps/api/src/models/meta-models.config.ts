// Meta model configuration. Read from the environment, validated lazily:
// validation happens on the first model call, never at import time, so the
// API can boot (health checks, UI) on machines where the key is not set yet.
export interface MetaModelsConfig {
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  timeoutMs: number;
  maxAttempts: number;
}

const DEFAULT_MODEL = 'muse-spark-1.3';
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_ATTEMPTS = 2;

function readTrimmed(env: NodeJS.ProcessEnv, name: string): string {
  return (env[name] ?? '').trim();
}

export function loadMetaModelsConfig(env: NodeJS.ProcessEnv = process.env): MetaModelsConfig {
  const baseUrl = readTrimmed(env, 'META_BASE_URL');
  if (baseUrl.length === 0) {
    throw new Error(
      'Missing META_BASE_URL. Copy .env.example to .env and set the Meta Model API base URL.',
    );
  }
  const apiKey = readTrimmed(env, 'META_API_KEY');
  if (apiKey.length === 0) {
    throw new Error(
      'Missing META_API_KEY. Request the demo key from the team, paste it into .env, and retry.',
    );
  }
  const configuredModel = readTrimmed(env, 'META_MODEL_DEFAULT');
  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    apiKey,
    defaultModel: configuredModel.length > 0 ? configuredModel : DEFAULT_MODEL,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    maxAttempts: DEFAULT_MAX_ATTEMPTS,
  };
}
