import { Injectable } from '@nestjs/common';
import {
  ComplianceFinding,
  ComplianceFindingSchema,
  ComplianceVerdict,
  TenderRequirement,
  TenderRequirementSchema,
} from '@postor/contracts';
import { AgentContextBuilder, BuiltAgentContext } from '../../brain/agent-context-builder.service';
import {
  CompanyBrainRetrieval,
  CompanyContextResult,
  extractDocCode,
} from '../../brain/company-brain-retrieval.service';
import { NormalizedTender } from '../../documents/tender-source';
import { PrismaService } from '../../prisma/prisma.service';
import { AgentCallTrace } from '../base/base-agent';
import { mapWithConcurrency } from '../base/concurrency';
import { ComplianceAgent, ComplianceBatchRequirement } from './compliance.agent';
import {
  FinancialCheck,
  buildFinancialCheck,
  renderFinancialContext,
} from './compliance-financials';
import { buildVerdict } from './compliance-verdict';

export interface ComplianceEvaluationInput {
  workflowId: string;
  agentRunId: string;
  opportunityId: string;
  companyId: string;
  tender: NormalizedTender;
}

export interface ComplianceEvaluation {
  findings: ComplianceFinding[];
  verdict: ComplianceVerdict;
  financials: FinancialCheck;
  batchesRun: number;
  traces: AgentCallTrace[];
  // Parallel to traces: the validated findings of each batch call, so the
  // orchestrator can persist the exact normalized response per ModelCall.
  batchFindings: ComplianceFinding[][];
  retrievalTraceIds: string[];
}

// Requirements per model call: small enough to keep every requirement plus
// its evidence in context, large enough to bound the call count.
const COMPLIANCE_BATCH_SIZE = 8;
const CORRECTION_RETRIES = 1;
// Batch calls in flight at once (see mapWithConcurrency).
const COMPLIANCE_CONCURRENCY = 4;
// Compliance needs facts AND verbatim excerpts: the default budget fits the
// ~5.8k-char fact block but starves excerpts to zero (seen live), so the
// model would judge from facts alone. 12k chars holds both.
const COMPLIANCE_CONTEXT_CHARS = 12000;

export function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size));
  }
  return chunks;
}

@Injectable()
export class ComplianceService {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly retrieval: CompanyBrainRetrieval,
    private readonly contextBuilder: AgentContextBuilder,
    private readonly agent: ComplianceAgent,
  ) {}

  // TECH section 8 step 4: every requirement from the analyst artifact,
  // evaluated against structured facts + retrieved excerpts in batches.
  public async evaluate(input: ComplianceEvaluationInput): Promise<ComplianceEvaluation> {
    const requirements = await this.loadRequirements(input.workflowId);
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: input.companyId },
    });
    const opportunity = await this.prisma.opportunity.findUniqueOrThrow({
      where: { id: input.opportunityId },
    });
    const financials = buildFinancialCheck(company.profile, opportunity.amount);
    const financialContextText = renderFinancialContext(financials);
    const findings: ComplianceFinding[] = [];
    const traces: AgentCallTrace[] = [];
    const batchFindings: ComplianceFinding[][] = [];
    const retrievalTraceIds: string[] = [];
    const batches = chunkArray(requirements, COMPLIANCE_BATCH_SIZE);
    // Batches are independent: a bounded pool runs them concurrently and
    // returns results in batch order, so findings keep requirement order.
    const results = await mapWithConcurrency(batches, COMPLIANCE_CONCURRENCY, async (batch) => {
      const retrieval = await this.retrieval.retrieveCompanyContext({
        companyId: input.companyId,
        query: this.batchQuery(batch),
        taskType: 'compliance',
        requestor: 'compliance.evaluate',
        workflowId: input.workflowId,
        agentRunId: input.agentRunId,
      });
      const context = await this.contextBuilder.buildAgentContext({
        retrieval,
        maxChars: COMPLIANCE_CONTEXT_CHARS,
      });
      const result = await this.evaluateBatchWithRetry(batch, retrieval, context, {
        financialContextText,
        closeDateRd: input.tender.closeDateRd ?? 'unknown',
      });
      return { ...result, retrievalTraceId: retrieval.retrievalTraceId };
    });
    for (const result of results) {
      retrievalTraceIds.push(result.retrievalTraceId);
      traces.push(result.trace);
      batchFindings.push(result.findings);
      findings.push(...result.findings);
    }
    const verdict = buildVerdict({
      findings,
      requirements,
      financials,
      closeDateRd: input.tender.closeDateRd,
    });
    return {
      findings,
      verdict,
      financials,
      batchesRun: batches.length,
      traces,
      batchFindings,
      retrievalTraceIds,
    };
  }

  private async loadRequirements(workflowId: string): Promise<TenderRequirement[]> {
    const artifact = await this.prisma.artifact.findFirst({
      where: { workflowId, type: 'requirements' },
    });
    if (artifact === null) {
      throw new Error('Compliance found no requirements artifact; the analyst step failed.');
    }
    const payload = artifact.data as { requirements?: unknown };
    return TenderRequirementSchema.array().parse(payload.requirements ?? []);
  }

  private batchQuery(batch: TenderRequirement[]): string {
    return batch.map((requirement) => requirement.title).join('. ');
  }

  private renderEvidence(retrieval: CompanyContextResult, context: BuiltAgentContext): string {
    const lines = context.excerpts.map((excerpt) => {
      const code = extractDocCode(excerpt.fileName);
      const page = excerpt.page === null ? 'unpaged' : `p${excerpt.page}`;
      return `[${code} ${page}] ${excerpt.text}`;
    });
    for (const warning of retrieval.warnings) {
      lines.push(`Warning: ${warning}`);
    }
    if (context.truncated) {
      lines.push('(Context truncated to budget; facts take precedence over excerpts.)');
    }
    return lines.join('\n');
  }

  private toBatchRequirements(batch: TenderRequirement[]): ComplianceBatchRequirement[] {
    return batch.map((requirement) => ({
      id: requirement.id,
      title: requirement.title,
      category: requirement.category,
      mandatory: requirement.mandatory,
      originalText: requirement.originalText,
      sourcePage: requirement.source.page,
      consequence: requirement.consequence ?? null,
    }));
  }

  // The model must cover every batched requirement exactly once. On any
  // coverage gap the service retries once with the error injected; a second
  // failure throws so the orchestrator flags the agent failed.
  private async evaluateBatchWithRetry(
    batch: TenderRequirement[],
    retrieval: CompanyContextResult,
    context: BuiltAgentContext,
    shared: { financialContextText: string; closeDateRd: string },
  ): Promise<{ findings: ComplianceFinding[]; trace: AgentCallTrace }> {
    const requirements = this.toBatchRequirements(batch);
    const base = {
      requirements,
      companyFactsText: context.factsText,
      evidenceExcerptsText: this.renderEvidence(retrieval, context),
      financialContextText: shared.financialContextText,
      tenderCloseDateRd: shared.closeDateRd,
    };
    const first = await this.agent.run(base);
    const firstError = this.coverageError(batch, first.data.findings);
    if (firstError === null) {
      return { findings: this.normalize(first.data.findings), trace: first.trace };
    }
    const second = await this.agent.run({ ...base, correctionNote: firstError });
    const secondError = this.coverageError(batch, second.data.findings);
    if (secondError !== null) {
      throw new Error(
        `Compliance batch still invalid after ${CORRECTION_RETRIES} retry: ${secondError}`,
      );
    }
    return { findings: this.normalize(second.data.findings), trace: second.trace };
  }

  private coverageError(batch: TenderRequirement[], findings: ComplianceFinding[]): string | null {
    const expected = new Set(batch.map((requirement) => requirement.id));
    const seen = new Set<string>();
    const unknown: string[] = [];
    const duplicated: string[] = [];
    for (const finding of findings) {
      if (!expected.has(finding.requirementId)) {
        unknown.push(finding.requirementId);
      }
      if (seen.has(finding.requirementId)) {
        duplicated.push(finding.requirementId);
      }
      seen.add(finding.requirementId);
    }
    const missing = [...expected].filter((id) => !seen.has(id));
    const problems: string[] = [];
    if (missing.length > 0) {
      problems.push(`missing findings for: ${missing.join(', ')}`);
    }
    if (unknown.length > 0) {
      problems.push(`findings for out-of-batch ids: ${unknown.join(', ')}`);
    }
    if (duplicated.length > 0) {
      problems.push(`duplicated findings for: ${duplicated.join(', ')}`);
    }
    if (problems.length === 0) {
      return null;
    }
    return `${problems.join('. ')}. Return exactly one finding per listed requirement id.`;
  }

  // Nullish model outputs normalize to their clean form before persistence,
  // mirroring the analyst mapper policy.
  private normalize(findings: ComplianceFinding[]): ComplianceFinding[] {
    return findings.map((finding) =>
      ComplianceFindingSchema.parse({
        ...finding,
        blocker: finding.blocker ?? false,
        suggestedOwner: finding.suggestedOwner ?? null,
      }),
    );
  }
}
