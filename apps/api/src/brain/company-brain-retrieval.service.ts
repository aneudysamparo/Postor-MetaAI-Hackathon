import { Injectable } from '@nestjs/common';
import { join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { EmbeddingProvider, HashEmbeddingProvider, cosineSimilarity } from './embedding-provider';
import { GraphRelations } from './graph-relations';
import { buildLexicalIndex, scoreLexical } from './lexical-scorer';
import { StructuredFact, buildStructuredFacts } from './structured-facts';

export interface RetrievalFilters {
  documentTypes?: string[];
  excludeExpired?: boolean;
  projectIds?: string[];
}

export interface RetrievalRequest {
  companyId: string;
  query: string;
  taskType: string;
  requestor?: string;
  filters?: RetrievalFilters;
  maxResults?: number;
  workflowId?: string;
  agentRunId?: string;
}

export interface EvidenceChunkDto {
  chunkId: string;
  documentId: string;
  fileName: string;
  documentType: string;
  page: number | null;
  text: string;
  lexicalScore: number;
  semanticScore: number;
  hybridScore: number;
  matchedTerms: string[];
}

export interface RelatedEntityDto {
  id: string;
  type: string;
  relation: string;
  viaDocument: string;
}

export interface CompanyContextResult {
  companyId: string;
  structuredFacts: StructuredFact[];
  evidenceChunks: EvidenceChunkDto[];
  relatedEntities: RelatedEntityDto[];
  warnings: string[];
  retrievalTraceId: string;
}

const DEFAULT_MAX_RESULTS = 8;
const MAX_RESULTS_CAP = 50;
const LEXICAL_WEIGHT = 0.6;
const SEMANTIC_WEIGHT = 0.4;
const UNSCOPED_WORKFLOW = 'unscoped';
const GRAPH_FILE = 'docs-graph.json';
const DOC_CODE_PATTERN = /DOC-[A-Z-]+-\d+/;

// Document codes have variable segments (DOC-CV-004, DOC-CERT-EXP-001):
// the pattern must span hyphens or multi-segment codes stop resolving.
export function extractDocCode(fileName: string): string {
  const match = DOC_CODE_PATTERN.exec(fileName);
  return match === null ? fileName : match[0];
}
const EXPIRED_STATUS_PATTERN = /vencid|expir/i;

interface StoredChunk {
  id: string;
  documentId: string;
  page: number | null;
  text: string;
  embedding: number[];
  fileName: string;
  documentType: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string');
}

// Expiry comes from profile data, never from a hardcoded list: entities whose
// status reads expired, whose expires date passed, or named in an expiry gap.
function collectExpiredDocIds(profile: unknown, today: Date): Set<string> {
  const expired = new Set<string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const entry of value) {
        visit(entry);
      }
      return;
    }
    if (!isRecord(value)) {
      return;
    }
    const documentId = value.document_id;
    if (typeof documentId === 'string') {
      const status = typeof value.status === 'string' ? value.status : '';
      const expires = typeof value.expires === 'string' ? new Date(value.expires) : null;
      const statusExpired = EXPIRED_STATUS_PATTERN.test(status);
      const dateExpired = expires !== null && !Number.isNaN(expires.getTime()) && expires < today;
      if (statusExpired || dateExpired) {
        expired.add(documentId);
      }
    }
    for (const entry of Object.values(value)) {
      visit(entry);
    }
  };
  visit(profile);
  if (isRecord(profile) && Array.isArray(profile.known_gaps_summary)) {
    for (const gap of profile.known_gaps_summary) {
      if (typeof gap !== 'string' || !EXPIRED_STATUS_PATTERN.test(gap)) {
        continue;
      }
      // Gaps can name several docs ("DOC-QUOT-002, DOC-QUOT-003"): scan all.
      const global = new RegExp(DOC_CODE_PATTERN.source, 'g');
      let found = global.exec(gap);
      while (found !== null) {
        expired.add(found[0]);
        found = global.exec(gap);
      }
    }
  }
  return expired;
}

function projectEvidenceDocIds(profile: unknown, projectIds: string[]): Set<string> {
  const wanted = new Set(projectIds);
  const docIds = new Set<string>();
  if (!isRecord(profile) || !Array.isArray(profile.experience)) {
    return docIds;
  }
  for (const project of profile.experience) {
    if (!isRecord(project) || !wanted.has(String(project.project_id ?? ''))) {
      continue;
    }
    for (const id of toStringList(project.evidence_document_ids)) {
      docIds.add(id);
    }
  }
  return docIds;
}

@Injectable()
export class CompanyBrainRetrieval {
  private readonly embeddings: EmbeddingProvider = new HashEmbeddingProvider();

  public constructor(private readonly prisma: PrismaService) {}

  public async retrieveCompanyContext(request: RetrievalRequest): Promise<CompanyContextResult> {
    const startedAt = Date.now();
    const company = await this.prisma.company.findUnique({ where: { id: request.companyId } });
    if (company === null) {
      throw new Error(`Unknown company: ${request.companyId}. Retrieval is company-scoped.`);
    }
    const facts = buildStructuredFacts(company.profile);
    const expiredDocIds = collectExpiredDocIds(company.profile, new Date());
    const rows = await this.prisma.brainChunk.findMany({
      where: { document: { companyId: request.companyId } },
      include: { document: true },
      orderBy: [{ document: { fileName: 'asc' } }, { page: 'asc' }],
    });
    const chunks: StoredChunk[] = rows.map((row) => ({
      id: row.id,
      documentId: row.documentId,
      page: row.page,
      text: row.text,
      embedding: Array.isArray(row.embedding) ? (row.embedding as number[]) : [],
      fileName: row.document.fileName,
      documentType: row.document.documentType,
    }));

    const filters = request.filters ?? {};
    const projectDocs =
      filters.projectIds === undefined || filters.projectIds.length === 0
        ? null
        : projectEvidenceDocIds(company.profile, filters.projectIds);
    const mustExcludeExpired = filters.excludeExpired ?? false;
    const candidates = chunks.filter((chunk) => {
      if (
        filters.documentTypes !== undefined &&
        !filters.documentTypes.includes(chunk.documentType)
      ) {
        return false;
      }
      if (mustExcludeExpired && expiredDocIds.has(this.docCodeOf(chunk.fileName))) {
        return false;
      }
      if (projectDocs !== null) {
        return projectDocs.has(this.docCodeOf(chunk.fileName));
      }
      return true;
    });

    const warnings: string[] = [];
    const evidence = await this.rankCandidates(candidates, request.query, request.maxResults);
    if (evidence.bestLexical === 0) {
      warnings.push('No lexical match in the Company Brain for this query.');
    }
    for (const chunk of evidence.top) {
      if (expiredDocIds.has(this.docCodeOf(chunk.fileName))) {
        warnings.push(
          `Document ${this.docCodeOf(chunk.fileName)} (${chunk.fileName}) is expired: treat it as historical.`,
        );
      }
    }

    const relations = new GraphRelations(this.graphPathOf(request.companyId));
    const relatedEntities = this.collectRelated(relations, evidence.top);

    const trace = await this.prisma.retrievalTrace.create({
      data: {
        workflowId: request.workflowId ?? UNSCOPED_WORKFLOW,
        agentRunId: request.agentRunId ?? null,
        companyId: request.companyId,
        query: request.query,
        filters: JSON.parse(
          JSON.stringify({
            taskType: request.taskType,
            requestor: request.requestor ?? 'unknown',
            ...filters,
          }),
        ) as object,
        chunkIds: evidence.top.map((chunk) => ({
          chunkId: chunk.chunkId,
          documentId: chunk.documentId,
          fileName: chunk.fileName,
          page: chunk.page,
          hybridScore: chunk.hybridScore,
        })),
        sentToModel: [],
        latencyMs: Date.now() - startedAt,
      },
    });
    return {
      companyId: request.companyId,
      structuredFacts: facts,
      evidenceChunks: evidence.top,
      relatedEntities,
      warnings,
      retrievalTraceId: trace.id,
    };
  }

  private docCodeOf(fileName: string): string {
    return extractDocCode(fileName);
  }

  private graphPathOf(_companyId: string): string {
    // Single demo company: the graph ships with the fixtures. Multi-tenant
    // deployments resolve this per company.
    return join(__dirname, '..', '..', '..', '..', 'data', 'company-brain', GRAPH_FILE);
  }

  private async rankCandidates(
    candidates: StoredChunk[],
    query: string,
    maxResults: number | undefined,
  ): Promise<{ top: EvidenceChunkDto[]; bestLexical: number }> {
    if (candidates.length === 0) {
      return { top: [], bestLexical: 0 };
    }
    const index = buildLexicalIndex(candidates.map((chunk) => chunk.text));
    const [queryVector] = await this.embeddings.embed([query]);
    const scored = candidates.map((chunk, position) => {
      const lexical = scoreLexical(index, position, query);
      const semantic = cosineSimilarity(queryVector, chunk.embedding);
      return { chunk, lexical, semantic };
    });
    const bestLexical = Math.max(...scored.map((entry) => entry.lexical.score));
    const ranked: EvidenceChunkDto[] = scored.map((entry) => {
      const lexicalNorm = bestLexical > 0 ? entry.lexical.score / bestLexical : 0;
      const semanticClamped = Math.min(Math.max(entry.semantic, 0), 1);
      return {
        chunkId: entry.chunk.id,
        documentId: entry.chunk.documentId,
        fileName: entry.chunk.fileName,
        documentType: entry.chunk.documentType,
        page: entry.chunk.page,
        text: entry.chunk.text,
        lexicalScore: entry.lexical.score,
        semanticScore: entry.semantic,
        hybridScore: lexicalNorm * LEXICAL_WEIGHT + semanticClamped * SEMANTIC_WEIGHT,
        matchedTerms: entry.lexical.matchedTerms,
      };
    });
    ranked.sort((left, right) => right.hybridScore - left.hybridScore);
    const limit = Math.min(maxResults ?? DEFAULT_MAX_RESULTS, MAX_RESULTS_CAP);
    const top = bestLexical === 0 ? [] : ranked.slice(0, limit);
    return { top, bestLexical };
  }

  private collectRelated(
    relations: GraphRelations,
    chunks: EvidenceChunkDto[],
  ): RelatedEntityDto[] {
    const seen = new Set<string>();
    const related: RelatedEntityDto[] = [];
    for (const chunk of chunks) {
      for (const neighbor of relations.relatedTo(this.docCodeOf(chunk.fileName))) {
        if (seen.has(neighbor.id)) {
          continue;
        }
        seen.add(neighbor.id);
        related.push({ ...neighbor, viaDocument: chunk.fileName });
      }
    }
    return related;
  }
}
