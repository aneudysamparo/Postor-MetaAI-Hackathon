// Deterministic text chunker for the Company Brain (new RAG module only).
// Splits on paragraph, then sentence boundaries, packing greedily toward the
// target size with overlap. Every chunk keeps the page its text starts on so
// evidence always cites document + page.
export interface PageBreak {
  page: number | null;
  startChar: number;
}

export interface TextChunk {
  text: string;
  startChar: number;
  page: number | null;
}

const CHUNK_TARGET_CHARS = 1200;
const CHUNK_OVERLAP_CHARS = 200;
const PARAGRAPH_SPLIT = /\n\s*\n/;
const SENTENCE_SPLIT = /(?<=[.!?])\s+/;

function pageAtOffset(breaks: PageBreak[], offset: number): number | null {
  let page: number | null = breaks.length > 0 ? breaks[0].page : null;
  for (const entry of breaks) {
    if (entry.startChar > offset) {
      break;
    }
    page = entry.page;
  }
  return page;
}

export function chunkText(fullText: string, pageBreaks: PageBreak[]): TextChunk[] {
  const text = fullText.replace(/\s+/g, ' ').trim();
  if (text.length === 0) {
    return [];
  }
  const units: string[] = [];
  for (const paragraph of fullText.split(PARAGRAPH_SPLIT)) {
    const cleaned = paragraph.replace(/\s+/g, ' ').trim();
    if (cleaned.length === 0) {
      continue;
    }
    if (cleaned.length <= CHUNK_TARGET_CHARS) {
      units.push(cleaned);
      continue;
    }
    for (const sentence of cleaned.split(SENTENCE_SPLIT)) {
      const trimmed = sentence.trim();
      if (trimmed.length > 0) {
        units.push(trimmed);
      }
    }
  }
  const chunks: TextChunk[] = [];
  let current = '';
  let searchFrom = 0;
  const flush = (): void => {
    const trimmed = current.trim();
    if (trimmed.length === 0) {
      return;
    }
    const startChar = text.indexOf(
      trimmed.slice(0, Math.min(trimmed.length, CHUNK_OVERLAP_CHARS)),
      searchFrom,
    );
    const start = startChar < 0 ? searchFrom : startChar;
    chunks.push({ text: trimmed, startChar: start, page: pageAtOffset(pageBreaks, start) });
    searchFrom = start + Math.max(trimmed.length - CHUNK_OVERLAP_CHARS, 0);
  };
  for (const unit of units) {
    const candidate = current.length === 0 ? unit : `${current} ${unit}`;
    if (candidate.length > CHUNK_TARGET_CHARS && current.length > 0) {
      flush();
      const overlap = current.slice(-CHUNK_OVERLAP_CHARS);
      current = `${overlap} ${unit}`.trim();
    } else {
      current = candidate;
    }
  }
  flush();
  return chunks;
}
