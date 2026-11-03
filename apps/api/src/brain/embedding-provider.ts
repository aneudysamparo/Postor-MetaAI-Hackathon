// Embedding provider interface + deterministic baseline.
//
// P0 DEFAULT PER SPEC (PRD section 23.3): lexical search plus LOCAL
// multilingual embeddings behind this interface, so a verified transformer
// provider can be swapped in without touching retrieval code. The bundled
// HashEmbeddingProvider is a zero-dependency deterministic baseline (feature
// hashing over tokens): real vectors with honest cosine similarity, weak
// semantics. It exists so the hybrid pipeline is fully testable offline; the
// transformer-backed provider is a named follow-up, not a silent gap.
export interface EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

const HASH_DIMENSIONS = 256;
const FNV_OFFSET_BASIS = 2166136261;
const FNV_PRIME = 16777619;
const TOKEN_PATTERN = /[^\p{L}\p{N}]+/u;

function hashToken(token: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length !== right.length || left.length === 0) {
    return 0;
  }
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }
  if (leftNorm === 0 || rightNorm === 0) {
    return 0;
  }
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

export class HashEmbeddingProvider implements EmbeddingProvider {
  public readonly name = 'hash-baseline-v1';
  public readonly dimensions = HASH_DIMENSIONS;

  public async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => this.embedOne(text));
  }

  private embedOne(text: string): number[] {
    const vector = new Array<number>(HASH_DIMENSIONS).fill(0);
    const tokens = text
      .toLowerCase()
      .split(TOKEN_PATTERN)
      .filter((token) => token.length > 0);
    for (const token of tokens) {
      vector[hashToken(token) % HASH_DIMENSIONS] += 1;
    }
    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    if (norm === 0) {
      return vector;
    }
    return vector.map((value) => value / norm);
  }
}
