import { Injectable } from '@nestjs/common';

// Document guard (Meta Llama Prompt Guard 2, 86M, self-hosted on Modal; see
// deploy/modal/prompt_guard.py). Tender documents are DATA, never
// instructions: before agents read them, every page chunk is scored for
// prompt-injection / jailbreak intent. Flagged chunks are reported in the
// trace and the UI; agents keep treating them as plain data. When
// POSTOR_GUARD_URL is unset the step is skipped and says so.

export interface GuardChunk {
  fileName: string;
  page: number;
  text: string;
}

export interface GuardFinding extends GuardChunk {
  score: number;
}

export interface GuardScan {
  model: string;
  scannedChunks: number;
  threshold: number;
  flagged: GuardFinding[];
  calls: { durationMs: number; texts: number }[];
}

export const GUARD_MODEL_ID = 'meta-llama/Llama-Prompt-Guard-2-86M';
// Prompt Guard 2 reads at most 512 tokens; ~1,500 characters of Spanish
// stays under that, so no chunk is silently truncated.
export const GUARD_CHUNK_CHARS = 1500;
// Probability above which a chunk is reported as a likely injection. Meta's
// model card treats high-confidence malicious scores as actionable; 0.8
// keeps ordinary legal language ("deberá", "no se aceptará") out.
const DEFAULT_GUARD_THRESHOLD = 0.8;
const TEXTS_PER_CALL = 64;
const GUARD_TIMEOUT_MS = 60_000;
const MIN_CHUNK_CHARS = 20;

// Pure (unit-tested): page text -> chunks under the classifier window,
// split on whitespace so words are never cut.
export function chunkForGuard(text: string, maxChars: number = GUARD_CHUNK_CHARS): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length < MIN_CHUNK_CHARS) {
    return [];
  }
  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(start + maxChars, normalized.length);
    if (end < normalized.length) {
      const lastSpace = normalized.lastIndexOf(' ', end);
      if (lastSpace > start) {
        end = lastSpace;
      }
    }
    chunks.push(normalized.slice(start, end).trim());
    start = end;
  }
  return chunks.filter((chunk) => chunk.length >= MIN_CHUNK_CHARS);
}

export function guardConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.POSTOR_GUARD_URL ?? '').trim().length > 0;
}

function guardThreshold(env: NodeJS.ProcessEnv = process.env): number {
  const configured = Number((env.POSTOR_GUARD_THRESHOLD ?? '').trim());
  if (Number.isFinite(configured) && configured > 0 && configured < 1) {
    return configured;
  }
  return DEFAULT_GUARD_THRESHOLD;
}

type FetchFn = typeof fetch;

@Injectable()
export class DocumentGuardService {
  public constructor(private readonly httpFetch: FetchFn = fetch) {}

  public async scan(chunks: GuardChunk[]): Promise<GuardScan> {
    const baseUrl = (process.env.POSTOR_GUARD_URL ?? '').trim().replace(/\/+$/, '');
    if (baseUrl.length === 0) {
      throw new Error('POSTOR_GUARD_URL is not set: the document guard is not deployed.');
    }
    const token = (process.env.POSTOR_GUARD_TOKEN ?? '').trim();
    const threshold = guardThreshold();
    const flagged: GuardFinding[] = [];
    const calls: GuardScan['calls'] = [];
    let model = GUARD_MODEL_ID;
    for (let start = 0; start < chunks.length; start += TEXTS_PER_CALL) {
      const batch = chunks.slice(start, start + TEXTS_PER_CALL);
      const startedAt = Date.now();
      const response = await this.httpFetch(`${baseUrl}/classify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ texts: batch.map((chunk) => chunk.text) }),
        signal: AbortSignal.timeout(GUARD_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`Document guard answered HTTP ${response.status}.`);
      }
      const payload = (await response.json()) as { model?: unknown; scores?: unknown };
      if (!Array.isArray(payload.scores) || payload.scores.length !== batch.length) {
        throw new Error('Document guard returned a malformed score list.');
      }
      if (typeof payload.model === 'string') {
        model = payload.model;
      }
      calls.push({ durationMs: Date.now() - startedAt, texts: batch.length });
      payload.scores.forEach((score, index) => {
        const chunk = batch[index];
        if (typeof score === 'number' && score >= threshold && chunk !== undefined) {
          flagged.push({ ...chunk, score });
        }
      });
    }
    return { model, scannedChunks: chunks.length, threshold, flagged, calls };
  }
}
