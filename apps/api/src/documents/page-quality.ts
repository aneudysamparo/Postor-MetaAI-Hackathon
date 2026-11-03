// Per-page extraction quality (TECH section 6). Pure functions: the same page
// always classifies the same way, which keeps ingestion reproducible.
export type PageQuality = 'text' | 'mixed' | 'scanned' | 'poor' | 'failed';

export interface PageSignals {
  chars: number;
  mojibakeRatio: number;
  disorderedTable: boolean;
  hasImages: boolean;
}

export interface PositionedWord {
  x: number;
  y: number;
  text: string;
}

const SHORT_PAGE_CHARS = 50;
const MOJIBAKE_RATIO_LIMIT = 0.05;
const TABLE_DISORDER_RATIO_LIMIT = 0.4;
const MIN_TABLE_LIKE_LINES = 6;
const MIN_WORDS_PER_TABLE_LINE = 3;
const X_JITTER_PX = 2;

const MOJIBAKE_PATTERN = /[�\x00-\x08\x0B\x0C\x0E-\x1F]/g;

export function measureMojibake(text: string): number {
  if (text.length === 0) {
    return 0;
  }
  const hits = text.match(MOJIBAKE_PATTERN);
  return (hits === null ? 0 : hits.length) / text.length;
}

export function detectDisorderedTable(words: PositionedWord[]): boolean {
  const lines = new Map<number, PositionedWord[]>();
  for (const word of words) {
    if (word.text.trim().length === 0) {
      continue;
    }
    const row = Math.round(word.y);
    const line = lines.get(row) ?? [];
    line.push(word);
    lines.set(row, line);
  }
  const tableLike = [...lines.values()].filter((line) => line.length >= MIN_WORDS_PER_TABLE_LINE);
  if (tableLike.length < MIN_TABLE_LIKE_LINES) {
    return false;
  }
  const disordered = tableLike.filter((line) => {
    for (let index = 1; index < line.length; index += 1) {
      if (line[index].x + X_JITTER_PX < line[index - 1].x) {
        return true;
      }
    }
    return false;
  });
  return disordered.length / tableLike.length > TABLE_DISORDER_RATIO_LIMIT;
}

export function classifyPageQuality(signals: PageSignals): PageQuality {
  if (signals.chars === 0) {
    return 'scanned';
  }
  if (signals.chars < SHORT_PAGE_CHARS) {
    return 'scanned';
  }
  if (signals.mojibakeRatio > MOJIBAKE_RATIO_LIMIT) {
    return 'poor';
  }
  if (signals.disorderedTable) {
    return 'poor';
  }
  if (signals.hasImages) {
    return 'mixed';
  }
  return 'text';
}
