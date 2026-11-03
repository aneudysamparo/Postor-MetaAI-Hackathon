// Lexical scorer for Spanish tender terminology: IDF-weighted token overlap
// over codes, names, dates, and amounts (RPE, CCNA, TSS, Microsoft...).
// Deterministic and explainable: every score decomposes into matched terms.
const MIN_TOKEN_CHARS = 2;

const SPANISH_STOPWORDS = new Set([
  'de',
  'la',
  'el',
  'en',
  'que',
  'los',
  'del',
  'se',
  'las',
  'por',
  'una',
  'para',
  'con',
  'una',
  'su',
  'al',
  'como',
  'mas',
  'pero',
  'sus',
  'este',
  'esta',
  'estos',
  'entre',
  'cuando',
  'muy',
  'sin',
  'sobre',
  'tambien',
  'hasta',
  'donde',
  'quien',
  'the',
  'and',
  'for',
  'with',
]);

const TOKEN_SPLIT = /[^\p{L}\p{N}]+/u;

export function tokenizeLexical(text: string): string[] {
  return text
    .toLowerCase()
    .split(TOKEN_SPLIT)
    .filter((token) => token.length >= MIN_TOKEN_CHARS && !SPANISH_STOPWORDS.has(token));
}

export interface LexicalIndex {
  readonly documentTokens: string[][];
  readonly inverseDocumentFrequency: Map<string, number>;
}

export function buildLexicalIndex(documents: string[]): LexicalIndex {
  const documentTokens = documents.map((text) => [...new Set(tokenizeLexical(text))]);
  const documentFrequency = new Map<string, number>();
  for (const tokens of documentTokens) {
    for (const token of tokens) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
  }
  const inverseDocumentFrequency = new Map<string, number>();
  const total = Math.max(documentTokens.length, 1);
  for (const [token, frequency] of documentFrequency) {
    inverseDocumentFrequency.set(token, Math.log(total / frequency));
  }
  return { documentTokens, inverseDocumentFrequency };
}

export interface LexicalScore {
  score: number;
  matchedTerms: string[];
}

export function scoreLexical(
  index: LexicalIndex,
  documentPosition: number,
  query: string,
): LexicalScore {
  const queryTerms = [...new Set(tokenizeLexical(query))];
  const documentTerms = new Set(index.documentTokens[documentPosition] ?? []);
  const matchedTerms = queryTerms.filter((term) => documentTerms.has(term));
  let score = 0;
  for (const term of matchedTerms) {
    score += index.inverseDocumentFrequency.get(term) ?? 0;
  }
  return { score, matchedTerms };
}
