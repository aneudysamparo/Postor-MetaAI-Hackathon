import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CompanyContextResult, EvidenceChunkDto } from './company-brain-retrieval.service';

export interface BuiltExcerpt {
  chunkId: string;
  documentId: string;
  fileName: string;
  page: number | null;
  text: string;
}

export interface BuiltAgentContext {
  factsText: string;
  factsIncluded: number;
  excerpts: BuiltExcerpt[];
  totalChars: number;
  truncated: boolean;
}

export interface ContextBuildRequest {
  retrieval: CompanyContextResult;
  maxChars?: number;
}

const DEFAULT_CONTEXT_CHARS = 6000;

// Packs retrieval output into the bounded context an agent call receives —
// facts first (source of truth), then excerpts greedily — and records the
// exact fragments on the retrieval trace for the Company Context debugger.
@Injectable()
export class AgentContextBuilder {
  public constructor(private readonly prisma: PrismaService) {}

  public async buildAgentContext(request: ContextBuildRequest): Promise<BuiltAgentContext> {
    const budget = request.maxChars ?? DEFAULT_CONTEXT_CHARS;
    const factsText = request.retrieval.structuredFacts
      .map((fact) => `- ${fact.label}: ${fact.value} [${fact.source}]`)
      .join('\n');
    const excerpts: BuiltExcerpt[] = [];
    let usedChars = factsText.length;
    let truncated = factsText.length > budget;
    const fittingFacts = truncated ? factsText.slice(0, budget) : factsText;
    if (!truncated) {
      for (const chunk of request.retrieval.evidenceChunks) {
        if (usedChars + chunk.text.length > budget) {
          truncated = true;
          break;
        }
        excerpts.push(this.toExcerpt(chunk));
        usedChars += chunk.text.length;
      }
    }
    await this.prisma.retrievalTrace.update({
      where: { id: request.retrieval.retrievalTraceId },
      data: {
        sentToModel: JSON.parse(JSON.stringify({ facts: fittingFacts, excerpts })) as object,
      },
    });
    return {
      factsText: fittingFacts,
      factsIncluded: request.retrieval.structuredFacts.length,
      excerpts,
      totalChars: usedChars,
      truncated,
    };
  }

  private toExcerpt(chunk: EvidenceChunkDto): BuiltExcerpt {
    return {
      chunkId: chunk.chunkId,
      documentId: chunk.documentId,
      fileName: chunk.fileName,
      page: chunk.page,
      text: chunk.text,
    };
  }
}
