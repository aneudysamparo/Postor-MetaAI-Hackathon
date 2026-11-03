import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  ComplianceFinding,
  ComplianceVerdict,
  DraftOffer,
  PricingFinding,
  ReviewReport,
  TenderRequirement,
  TenderRequirementSchema,
  VisualEvidence,
} from '@postor/contracts';
import { Prisma } from '@prisma/client';
import { AgentCallTrace } from '../agents/base/base-agent';
import { ComplianceService } from '../agents/compliance/compliance.service';
import { BidDraftingService } from '../agents/writer/bid-drafting.service';
import { PricingService } from '../agents/pricing/pricing.service';
import { OpportunityAgent, OpportunityInput } from '../agents/opportunity/opportunity.agent';
import { TenderAnalystService } from '../agents/tender-analyst/tender-analyst.service';
import { VisualEvidenceService } from '../agents/visual/visual-evidence.service';
import { StructuredFact, buildStructuredFacts } from '../brain/structured-facts';
import { BidDocumentsService } from '../documents/bid-documents.service';
import { DocumentIngestionService } from '../documents/document-ingestion.service';
import { NormalizedTender, TENDER_SOURCE, TenderSource } from '../documents/tender-source';
import { PrismaService } from '../prisma/prisma.service';
import {
  AGENT_RUN_STATUS,
  PENDING_STEPS,
  WORKFLOW_EVENT,
  WORKFLOW_STATUS,
  WorkflowStatus,
  assertTransition,
  evidenceRowId,
} from './workflow-state';

export interface StartWorkflowInput {
  opportunityId: string;
  companyId?: string;
}

interface LoadedContext {
  companyId: string;
  opportunityId: string;
  caseKey: string;
  tender: NormalizedTender;
  facts: StructuredFact[];
  documentIds: string[];
}

const SINGLE_COMPANY_COUNT = 1;
const FIRST_ATTEMPT = 1;

// BidOrchestrator (TECH section 8): runs the agent pipeline for one tender,
// persists every step as AgentRun/ModelCall/Artifact/Evidence rows, and emits
// workflow.* events for the Agent Trace view.
//
// Execution is async in-process: POST /workflows returns the queued run at
// once and the pipeline continues in the background, so the live UI can poll
// GET /workflows/:id. Concurrent runs interleave (no queue in P0).
//
// Failure rules (TECH section 8):
// - a crashed agent never wipes prior work: its AgentRun is flagged failed
//   and the workflow lands on needs_review with the survivors preserved;
// - schema validation already retries once with the injected error inside
//   MetaModelService, so the runner does not retry a second time.
@Injectable()
export class WorkflowRunner {
  private readonly logger = new Logger(WorkflowRunner.name);

  public constructor(
    private readonly prisma: PrismaService,
    @Inject(TENDER_SOURCE) private readonly tenderSource: TenderSource,
    private readonly ingestion: DocumentIngestionService,
    private readonly opportunity: OpportunityAgent,
    private readonly analyst: TenderAnalystService,
    private readonly compliance: ComplianceService,
    private readonly visual: VisualEvidenceService,
    private readonly pricing: PricingService,
    private readonly drafting: BidDraftingService,
    private readonly bidDocuments: BidDocumentsService,
  ) {}

  public async startWorkflow(input: StartWorkflowInput) {
    const opportunity = await this.prisma.opportunity.findUnique({
      where: { id: input.opportunityId },
    });
    if (opportunity === null) {
      throw new NotFoundException(`Unknown opportunity: ${input.opportunityId}.`);
    }
    const company = await this.resolveCompany(input.companyId);
    const run = await this.prisma.workflowRun.create({
      data: {
        opportunityId: opportunity.id,
        companyId: company.id,
        status: WORKFLOW_STATUS.QUEUED,
      },
    });
    await this.emit(run.id, WORKFLOW_EVENT.CREATED, null, null, {
      opportunityId: opportunity.id,
      companyId: company.id,
    });
    // Fire-and-forget by design (see class comment). The last-resort catch
    // only logs: execute() already funnels every expected failure into the
    // run status, so reaching here means persistence itself broke.
    void this.execute(run.id).catch((error: unknown) => {
      this.logger.error(`Workflow ${run.id} crashed outside the state machine: ${String(error)}`);
    });
    return run;
  }

  public async getRun(runId: string) {
    const run = await this.prisma.workflowRun.findUnique({
      where: { id: runId },
      include: {
        agentRuns: { orderBy: { startedAt: 'asc' }, include: { modelCalls: true } },
        events: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (run === null) {
      throw new NotFoundException(`Unknown workflow: ${runId}.`);
    }
    return run;
  }

  public async getResults(runId: string) {
    const run = await this.getRun(runId);
    const artifacts = await this.prisma.artifact.findMany({
      where: { workflowId: runId },
      include: { evidence: true },
      orderBy: { createdAt: 'asc' },
    });
    const failedAgents = run.agentRuns
      .filter((agentRun) => agentRun.status === AGENT_RUN_STATUS.FAILED)
      .map((agentRun) => agentRun.agent);
    return { run, artifacts, failedAgents, pendingSteps: [...PENDING_STEPS] };
  }

  public async getTrace(runId: string) {
    const run = await this.getRun(runId);
    const artifacts = await this.prisma.artifact.findMany({
      where: { workflowId: runId },
      include: { evidence: true },
      orderBy: { createdAt: 'asc' },
    });
    return { ...run, artifacts };
  }

  private async execute(runId: string): Promise<void> {
    try {
      await this.transition(runId, WORKFLOW_STATUS.RUNNING);
      await this.emit(runId, WORKFLOW_EVENT.STARTED, null, null, {});
      const context = await this.loadContext(runId);
      const outcomes = await Promise.allSettled([
        this.runOpportunity(runId, context),
        this.runAnalyst(runId, context),
      ]);
      const failures = this.collectFailures(outcomes);
      // A crashed analyst leaves no requirements artifact: consolidation is
      // skipped (not failed) so the run lands on needs_review with the
      // surviving outputs preserved, per the TECH section 8 failure rule.
      const analystFailed = failures.includes('tender_analyst');
      if (analystFailed) {
        await this.emit(runId, WORKFLOW_EVENT.STEP_COMPLETED, 'orchestrator', null, {
          step: 'consolidate',
          skipped: true,
          reason: 'tender_analyst failed; nothing to consolidate.',
        });
      } else {
        await this.consolidate(runId);
      }
      // Step 3b (T5): visual reading of the few requirement pages the text
      // layer reads poorly. Same skip rule as consolidation.
      if (analystFailed) {
        await this.emit(runId, WORKFLOW_EVENT.STEP_COMPLETED, 'orchestrator', null, {
          step: 'visual.read',
          skipped: true,
          reason: 'tender_analyst failed; no requirement pages to read.',
        });
      } else {
        try {
          await this.runVisual(runId, context);
        } catch {
          failures.push('visual_reader');
        }
      }
      // Step 4 runs sequentially: it consumes the consolidated requirements.
      // Without them it is skipped like consolidation, not failed.
      if (analystFailed) {
        await this.emit(runId, WORKFLOW_EVENT.STEP_COMPLETED, 'orchestrator', null, {
          step: 'compliance.evaluate',
          skipped: true,
          reason: 'tender_analyst failed; no requirements to evaluate.',
        });
      } else {
        try {
          await this.runCompliance(runId, context);
        } catch {
          failures.push('compliance');
        }
        // Step 5 (T6.1): pricing reads requirements + visual evidence, not
        // compliance, so a compliance crash does not block it.
        try {
          await this.runPricing(runId, context);
        } catch {
          failures.push('pricing');
        }
        // Steps 6-7 (T6.2/T6.3): draft + review with one correction round.
        // They use whatever compliance and pricing produced (empty on a
        // crash), so a draft always exists for the human to finish.
        try {
          await this.runDrafting(runId, context);
        } catch {
          failures.push('writer');
        }
        // Step 8 (T6.2 forms + T6.4 F.033): deterministic, no model call.
        try {
          await this.runDocuments(runId, context);
        } catch {
          failures.push('documents');
        }
      }
      if (failures.length > 0) {
        await this.transition(runId, WORKFLOW_STATUS.NEEDS_REVIEW);
        await this.emit(runId, WORKFLOW_EVENT.NEEDS_REVIEW, null, null, {
          failedAgents: failures,
          reason: 'One or more agents failed; surviving outputs are preserved.',
        });
        return;
      }
      await this.transition(runId, WORKFLOW_STATUS.COMPLETED);
      await this.emit(runId, WORKFLOW_EVENT.COMPLETED, null, null, {
        pendingSteps: [...PENDING_STEPS],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.transition(runId, WORKFLOW_STATUS.FAILED);
      await this.emit(runId, WORKFLOW_EVENT.FAILED, null, null, { error: message });
    }
  }

  // Step 1 (TECH section 8): company + opportunity + documents. Ingestion is
  // idempotent, so a fresh database self-heals: POST /workflows just works.
  private async loadContext(runId: string): Promise<LoadedContext> {
    await this.emit(runId, WORKFLOW_EVENT.STEP_STARTED, 'orchestrator', null, {
      step: 'load_context',
    });
    const run = await this.prisma.workflowRun.findUniqueOrThrow({ where: { id: runId } });
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: run.companyId },
    });
    const opportunity = await this.prisma.opportunity.findUniqueOrThrow({
      where: { id: run.opportunityId },
    });
    const tender = await this.findTenderByCode(opportunity.code);
    const stored = await this.prisma.tenderDocument.count({
      where: { opportunityId: opportunity.id },
    });
    let ingested = false;
    if (stored === 0) {
      await this.ingestion.ingestTender(tender.caseKey);
      ingested = true;
    }
    const rows = await this.prisma.tenderDocument.findMany({
      where: { opportunityId: opportunity.id },
      select: { id: true },
    });
    await this.emit(runId, WORKFLOW_EVENT.STEP_COMPLETED, 'orchestrator', null, {
      step: 'load_context',
      caseKey: tender.caseKey,
      ingested,
      documents: rows.length,
    });
    return {
      companyId: company.id,
      opportunityId: opportunity.id,
      caseKey: tender.caseKey,
      tender,
      facts: buildStructuredFacts(company.profile),
      documentIds: rows.map((row) => row.id),
    };
  }

  // Step 2a: metadata-level fit. Reads tender metadata + company facts only,
  // never the pliego (the agent's own PRD constraint).
  private async runOpportunity(runId: string, context: LoadedContext): Promise<void> {
    const agentRun = await this.startAgentRun(runId, 'opportunity', 'evaluate', []);
    await this.emit(runId, WORKFLOW_EVENT.STEP_STARTED, 'opportunity', agentRun.id, {
      step: 'opportunity.evaluate',
    });
    try {
      const input = this.opportunityInputOf(context);
      const result = await this.opportunity.run(input);
      await this.saveModelCall(agentRun.id, result.trace, result.data);
      const artifact = await this.prisma.artifact.create({
        data: {
          workflowId: runId,
          type: 'opportunity_assessment',
          producedBy: 'opportunity',
          data: result.data as unknown as Prisma.InputJsonValue,
        },
      });
      await this.finishAgentRun(agentRun.id, [artifact.id], null);
      await this.emit(runId, WORKFLOW_EVENT.STEP_COMPLETED, 'opportunity', agentRun.id, {
        step: 'opportunity.evaluate',
        recommendation: result.data.recommendation,
      });
    } catch (error) {
      await this.failAgentRun(runId, agentRun.id, 'opportunity', 'opportunity.evaluate', error);
      throw error;
    }
  }

  // Step 2b: pliego + amendments to structured requirements with doc+page
  // evidence. Runs in parallel with the opportunity agent.
  private async runAnalyst(runId: string, context: LoadedContext): Promise<void> {
    const agentRun = await this.startAgentRun(
      runId,
      'tender_analyst',
      'extract',
      context.documentIds,
    );
    await this.emit(runId, WORKFLOW_EVENT.STEP_STARTED, 'tender_analyst', agentRun.id, {
      step: 'tender_analyst.extract',
    });
    try {
      const analysis = await this.analyst.analyzeCase(context.caseKey, context.opportunityId);
      for (let index = 0; index < analysis.traces.length; index += 1) {
        const trace = analysis.traces[index];
        const windowOutput = analysis.windowOutputs[index];
        if (trace !== undefined && windowOutput !== undefined) {
          await this.saveModelCall(agentRun.id, trace, windowOutput);
        }
      }
      const artifact = await this.prisma.artifact.create({
        data: {
          workflowId: runId,
          type: 'requirements',
          producedBy: 'tender_analyst',
          data: {
            requirements: analysis.requirements,
            contradictions: analysis.contradictions,
            windowsRun: analysis.windowsRun,
          } as unknown as Prisma.InputJsonValue,
        },
      });
      await this.saveRequirementEvidence(artifact.id, analysis.requirements);
      await this.finishAgentRun(agentRun.id, [artifact.id], null);
      await this.emit(runId, WORKFLOW_EVENT.STEP_COMPLETED, 'tender_analyst', agentRun.id, {
        step: 'tender_analyst.extract',
        requirements: analysis.requirements.length,
        contradictions: analysis.contradictions.length,
        windowsRun: analysis.windowsRun,
      });
    } catch (error) {
      await this.failAgentRun(
        runId,
        agentRun.id,
        'tender_analyst',
        'tender_analyst.extract',
        error,
      );
      throw error;
    }
  }

  // Step 4: requirement x company brain to findings + deterministic
  // verdict. Compliance findings cite requirement ids and company DOC codes;
  // they need no new evidence rows because requirement evidence already
  // lives on the requirements artifact (reusing those ids would collide).
  private async runCompliance(runId: string, context: LoadedContext): Promise<void> {
    const agentRun = await this.startAgentRun(runId, 'compliance', 'evaluate', context.documentIds);
    await this.emit(runId, WORKFLOW_EVENT.STEP_STARTED, 'compliance', agentRun.id, {
      step: 'compliance.evaluate',
    });
    try {
      const evaluation = await this.compliance.evaluate({
        workflowId: runId,
        agentRunId: agentRun.id,
        opportunityId: context.opportunityId,
        companyId: context.companyId,
        tender: context.tender,
      });
      for (let index = 0; index < evaluation.traces.length; index += 1) {
        const trace = evaluation.traces[index];
        const findings = evaluation.batchFindings[index];
        if (trace !== undefined && findings !== undefined) {
          await this.saveModelCall(agentRun.id, trace, { findings });
        }
      }
      const artifact = await this.prisma.artifact.create({
        data: {
          workflowId: runId,
          type: 'compliance',
          producedBy: 'compliance',
          data: {
            findings: evaluation.findings,
            verdict: evaluation.verdict,
            financials: evaluation.financials,
            batchesRun: evaluation.batchesRun,
            retrievalTraceIds: evaluation.retrievalTraceIds,
          } as unknown as Prisma.InputJsonValue,
        },
      });
      await this.finishAgentRun(agentRun.id, [artifact.id], null);
      await this.emit(runId, WORKFLOW_EVENT.STEP_COMPLETED, 'compliance', agentRun.id, {
        step: 'compliance.evaluate',
        verdict: evaluation.verdict.verdict,
        findings: evaluation.findings.length,
        batchesRun: evaluation.batchesRun,
      });
    } catch (error) {
      await this.failAgentRun(runId, agentRun.id, 'compliance', 'compliance.evaluate', error);
      throw error;
    }
  }

  // Step 3b (T5, TECH section 6 step 4c): renders requirement pages whose
  // stored quality is scanned/poor/mixed, records the sam-3.1 outcome, and
  // reads them with the vision model. Each page becomes an Evidence row with
  // method vision (or sam_region when sam returns boxes).
  private async runVisual(runId: string, context: LoadedContext): Promise<void> {
    const agentRun = await this.startAgentRun(runId, 'visual_reader', 'read_page', []);
    await this.emit(runId, WORKFLOW_EVENT.STEP_STARTED, 'visual_reader', agentRun.id, {
      step: 'visual.read',
    });
    try {
      const requirements = await this.loadRequirements(runId);
      const result = await this.visual.collect(context.tender, requirements);
      for (let index = 0; index < result.traces.length; index += 1) {
        const trace = result.traces[index];
        if (trace !== undefined) {
          await this.saveModelCall(agentRun.id, trace, result.readings[index] ?? null);
        }
      }
      const artifact = await this.prisma.artifact.create({
        data: {
          workflowId: runId,
          type: 'visual_evidence',
          producedBy: 'visual_reader',
          data: {
            evidence: result.evidence,
            samGap: result.samGap,
          } as unknown as Prisma.InputJsonValue,
        },
      });
      for (const item of result.evidence) {
        await this.prisma.artifactEvidence.create({
          data: {
            id: evidenceRowId(artifact.id, item.evidenceId),
            artifactId: artifact.id,
            documentId: item.documentId,
            page: item.page,
            section: item.reading?.summary ?? null,
            method: item.method,
            region: item.regions as unknown as Prisma.InputJsonValue,
          },
        });
      }
      await this.finishAgentRun(agentRun.id, [artifact.id], null);
      await this.emit(runId, WORKFLOW_EVENT.STEP_COMPLETED, 'visual_reader', agentRun.id, {
        step: 'visual.read',
        pagesRead: result.evidence.length,
        humanReview: result.evidence.filter((item) => item.requiresHumanReview).length,
        samGap: result.samGap,
      });
    } catch (error) {
      await this.failAgentRun(runId, agentRun.id, 'visual_reader', 'visual.read', error);
      throw error;
    }
  }

  // Step 5 (T6.1, PRD section 7 Agent 4): tender items x company quotations.
  // Prices are copied from quotations only and re-checked by guardPrices.
  private async runPricing(runId: string, context: LoadedContext): Promise<void> {
    const agentRun = await this.startAgentRun(runId, 'pricing', 'research', []);
    await this.emit(runId, WORKFLOW_EVENT.STEP_STARTED, 'pricing', agentRun.id, {
      step: 'pricing.research',
    });
    try {
      const requirements = await this.loadRequirements(runId);
      const visualEvidence = await this.loadVisualEvidence(runId);
      const result = await this.pricing.research({
        companyId: context.companyId,
        tender: context.tender,
        requirements,
        visualEvidence,
      });
      await this.saveModelCall(agentRun.id, result.trace, { items: result.rawItems });
      const artifact = await this.prisma.artifact.create({
        data: {
          workflowId: runId,
          type: 'pricing',
          producedBy: 'pricing',
          data: {
            items: result.items,
            totals: result.totals,
          } as unknown as Prisma.InputJsonValue,
        },
      });
      await this.finishAgentRun(agentRun.id, [artifact.id], null);
      await this.emit(runId, WORKFLOW_EVENT.STEP_COMPLETED, 'pricing', agentRun.id, {
        step: 'pricing.research',
        items: result.items.length,
        priced: result.totals.pricedItems,
        pending: result.totals.pendingItems,
      });
    } catch (error) {
      await this.failAgentRun(runId, agentRun.id, 'pricing', 'pricing.research', error);
      throw error;
    }
  }

  // Steps 6-7 (PRD section 7 Agents 5-6): the drafting service runs writer
  // -> reviewer -> (one correction) -> reviewer. Writer and reviewer get
  // their own AgentRun rows so the trace shows each call under its agent.
  private async runDrafting(runId: string, context: LoadedContext): Promise<void> {
    const writerRun = await this.startAgentRun(runId, 'writer', 'draft', []);
    const reviewerRun = await this.startAgentRun(runId, 'reviewer', 'review', []);
    await this.emit(runId, WORKFLOW_EVENT.STEP_STARTED, 'writer', writerRun.id, {
      step: 'writer.draft',
    });
    try {
      const compliance = await this.loadCompliance(runId);
      const result = await this.drafting.draftAndReview({
        tender: context.tender,
        requirements: await this.loadRequirements(runId),
        findings: compliance.findings,
        verdict: compliance.verdict,
        pricing: await this.loadPricing(runId),
        facts: context.facts,
      });
      for (let index = 0; index < result.writerTraces.length; index += 1) {
        const trace = result.writerTraces[index];
        const round = result.rounds[index];
        if (trace !== undefined && round !== undefined) {
          await this.saveModelCall(writerRun.id, trace, round.draft);
        }
      }
      for (let index = 0; index < result.reviewerTraces.length; index += 1) {
        const trace = result.reviewerTraces[index];
        const round = result.rounds[index];
        if (trace !== undefined && round !== undefined) {
          await this.saveModelCall(reviewerRun.id, trace, round.review);
        }
      }
      const draftArtifact = await this.prisma.artifact.create({
        data: {
          workflowId: runId,
          type: 'draft_offer',
          producedBy: 'writer',
          data: {
            draft: result.finalDraft,
            rounds: result.rounds.length,
          } as unknown as Prisma.InputJsonValue,
        },
      });
      const reviewArtifact = await this.prisma.artifact.create({
        data: {
          workflowId: runId,
          type: 'review_report',
          producedBy: 'reviewer',
          data: {
            review: result.finalReview,
            rounds: result.rounds.map((round) => ({
              review: round.review,
              deterministicOmissions: round.deterministicOmissions,
            })),
          } as unknown as Prisma.InputJsonValue,
        },
      });
      await this.finishAgentRun(writerRun.id, [draftArtifact.id], null);
      await this.emit(runId, WORKFLOW_EVENT.STEP_COMPLETED, 'writer', writerRun.id, {
        step: 'writer.draft',
        sections: result.finalDraft.sections.length,
        pendingFields: result.finalDraft.pendingFields.length,
        rounds: result.rounds.length,
      });
      await this.finishAgentRun(reviewerRun.id, [reviewArtifact.id], null);
      await this.emit(runId, WORKFLOW_EVENT.STEP_COMPLETED, 'reviewer', reviewerRun.id, {
        step: 'reviewer.review',
        verdict: result.finalReview.verdict,
        firstVerdict: result.rounds[0]?.review.verdict ?? null,
        omitted: result.finalReview.omitted.length,
      });
    } catch (error) {
      await this.failAgentRun(runId, writerRun.id, 'writer', 'writer.draft', error);
      await this.failAgentRun(runId, reviewerRun.id, 'reviewer', 'reviewer.review', error);
      throw error;
    }
  }

  // Step 8: fills the SNCC forms and the tender's own F.033 from the company
  // profile + pricing, and writes the draft as Markdown. Files land under
  // storage/outputs/<runId>/ and are served by GET /workflows/:id/files/:name.
  private async runDocuments(runId: string, context: LoadedContext): Promise<void> {
    await this.emit(runId, WORKFLOW_EVENT.STEP_STARTED, 'orchestrator', null, {
      step: 'documents.generate',
    });
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: context.companyId },
    });
    const draftArtifact = await this.prisma.artifact.findFirst({
      where: { workflowId: runId, type: 'draft_offer' },
    });
    const reviewArtifact = await this.prisma.artifact.findFirst({
      where: { workflowId: runId, type: 'review_report' },
    });
    const draftPayload = (draftArtifact?.data ?? {}) as { draft?: DraftOffer };
    const reviewPayload = (reviewArtifact?.data ?? {}) as { review?: ReviewReport };
    const files = await this.bidDocuments.generate({
      runId,
      tender: context.tender,
      profile: company.profile,
      pricing: await this.loadPricing(runId),
      draft: draftPayload.draft ?? null,
      review: reviewPayload.review ?? null,
    });
    await this.prisma.artifact.create({
      data: {
        workflowId: runId,
        type: 'bid_documents',
        producedBy: 'orchestrator',
        data: { files } as unknown as Prisma.InputJsonValue,
      },
    });
    await this.emit(runId, WORKFLOW_EVENT.STEP_COMPLETED, 'orchestrator', null, {
      step: 'documents.generate',
      files: files.length,
      pendingMarkers: files.reduce((sum, file) => sum + file.pendingMarkers, 0),
    });
  }

  private async loadCompliance(
    runId: string,
  ): Promise<{ findings: ComplianceFinding[]; verdict: ComplianceVerdict | null }> {
    const artifact = await this.prisma.artifact.findFirst({
      where: { workflowId: runId, type: 'compliance' },
    });
    if (artifact === null) {
      return { findings: [], verdict: null };
    }
    const payload = artifact.data as {
      findings?: ComplianceFinding[];
      verdict?: ComplianceVerdict;
    };
    return { findings: payload.findings ?? [], verdict: payload.verdict ?? null };
  }

  private async loadPricing(runId: string): Promise<PricingFinding[]> {
    const artifact = await this.prisma.artifact.findFirst({
      where: { workflowId: runId, type: 'pricing' },
    });
    if (artifact === null) {
      return [];
    }
    const payload = artifact.data as { items?: PricingFinding[] };
    return payload.items ?? [];
  }

  private async loadVisualEvidence(runId: string): Promise<VisualEvidence[]> {
    const artifact = await this.prisma.artifact.findFirst({
      where: { workflowId: runId, type: 'visual_evidence' },
    });
    if (artifact === null) {
      return [];
    }
    const payload = artifact.data as { evidence?: VisualEvidence[] };
    return payload.evidence ?? [];
  }

  private async loadRequirements(runId: string): Promise<TenderRequirement[]> {
    const artifact = await this.prisma.artifact.findFirst({
      where: { workflowId: runId, type: 'requirements' },
    });
    if (artifact === null) {
      return [];
    }
    const payload = artifact.data as { requirements?: unknown };
    return TenderRequirementSchema.array().parse(payload.requirements ?? []);
  }

  // Step 3: re-validates the merged requirements (defense in depth: the
  // mapper already validated each one) and reports verification counts.
  private async consolidate(runId: string): Promise<void> {
    await this.emit(runId, WORKFLOW_EVENT.STEP_STARTED, 'orchestrator', null, {
      step: 'consolidate',
    });
    const artifact = await this.prisma.artifact.findFirst({
      where: { workflowId: runId, type: 'requirements' },
    });
    if (artifact === null) {
      throw new Error('Consolidation found no requirements artifact; the analyst step failed.');
    }
    const payload = artifact.data as { requirements?: unknown };
    const requirements = TenderRequirementSchema.array().parse(payload.requirements ?? []);
    const verified = requirements.filter((item) => item.status === 'verified').length;
    await this.emit(runId, WORKFLOW_EVENT.STEP_COMPLETED, 'orchestrator', null, {
      step: 'consolidate',
      total: requirements.length,
      verified,
      unknown: requirements.length - verified,
    });
  }

  private async resolveCompany(companyId: string | undefined) {
    if (companyId !== undefined) {
      const company = await this.prisma.company.findUnique({ where: { id: companyId } });
      if (company === null) {
        throw new NotFoundException(`Unknown company: ${companyId}.`);
      }
      return company;
    }
    const companies = await this.prisma.company.findMany({ orderBy: { createdAt: 'asc' } });
    if (companies.length === SINGLE_COMPANY_COUNT) {
      const only = companies[0];
      if (only !== undefined) {
        return only;
      }
    }
    throw new BadRequestException(
      'companyId is required: the database holds zero or several companies.',
    );
  }

  private async findTenderByCode(code: string): Promise<NormalizedTender> {
    const tenders = await this.tenderSource.listTenders();
    const tender = tenders.find((entry) => entry.code === code);
    if (tender === undefined) {
      throw new Error(`No tender source entry matches opportunity code ${code}.`);
    }
    return tender;
  }

  private opportunityInputOf(context: LoadedContext): OpportunityInput {
    return {
      code: context.tender.code,
      institution: context.tender.institution,
      title: context.tender.title,
      estimatedAmountDop: context.tender.estimatedAmountDop,
      closeDateRd: context.tender.closeDateRd,
      modality: context.tender.modality,
      facts: context.facts,
    };
  }

  private async startAgentRun(workflowId: string, agent: string, task: string, inputIds: string[]) {
    return this.prisma.agentRun.create({
      data: {
        workflowId,
        agent,
        task,
        status: AGENT_RUN_STATUS.RUNNING,
        attempt: FIRST_ATTEMPT,
        inputIds,
      },
    });
  }

  private async finishAgentRun(agentRunId: string, outputIds: string[], error: string | null) {
    const failed = error !== null;
    await this.prisma.agentRun.update({
      where: { id: agentRunId },
      data: {
        status: failed ? AGENT_RUN_STATUS.FAILED : AGENT_RUN_STATUS.OK,
        outputIds,
        finishedAt: new Date(),
        error,
      },
    });
  }

  private async failAgentRun(
    runId: string,
    agentRunId: string,
    agent: string,
    step: string,
    error: unknown,
  ): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    await this.finishAgentRun(agentRunId, [], message);
    await this.emit(runId, WORKFLOW_EVENT.STEP_FAILED, agent, agentRunId, { step, error: message });
  }

  // Every model call becomes a ModelCall row: effective prompts, raw and
  // normalized responses, tokens, and duration — the Agent Trace source.
  private async saveModelCall(
    agentRunId: string,
    trace: AgentCallTrace,
    responseNorm: unknown,
  ): Promise<void> {
    await this.prisma.modelCall.create({
      data: {
        agentRunId,
        provider: 'meta',
        modelRequested: trace.modelRequested,
        modelReturned: trace.modelReturned,
        promptSystem: trace.systemPrompt,
        promptTask: trace.taskPrompt,
        promptVersion: trace.promptVersion,
        requestParams: {
          agent: trace.agentName,
          task: trace.taskName,
        },
        responseRaw: this.rawResponseJson(trace.rawResponse),
        responseNorm: responseNorm as Prisma.InputJsonValue,
        tokensIn: trace.usage.inputTokens,
        tokensOut: trace.usage.outputTokens,
        durationMs: trace.durationMs,
        status: 'ok',
      },
    });
  }

  private rawResponseJson(raw: string | null): Prisma.InputJsonValue {
    if (raw === null) {
      return { text: null };
    }
    try {
      return JSON.parse(raw) as Prisma.InputJsonValue;
    } catch {
      return { text: raw };
    }
  }

  // Evidence rows scope the contract evidenceId with the artifact id (see
  // evidenceRowId): a requirement citation opens exactly this row, and
  // re-running a tender never collides with earlier runs.
  private async saveRequirementEvidence(
    artifactId: string,
    requirements: TenderRequirement[],
  ): Promise<void> {
    for (const requirement of requirements) {
      await this.prisma.artifactEvidence.create({
        data: {
          id: evidenceRowId(artifactId, requirement.source.evidenceId),
          artifactId,
          documentId: requirement.source.documentId,
          page: requirement.source.page,
          section: requirement.source.section ?? null,
          method: requirement.source.method,
        },
      });
    }
  }

  private collectFailures(outcomes: PromiseSettledResult<void>[]): string[] {
    const failures: string[] = [];
    const agents = ['opportunity', 'tender_analyst'];
    for (let index = 0; index < outcomes.length; index += 1) {
      const outcome = outcomes[index];
      const agent = agents[index];
      if (outcome !== undefined && outcome.status === 'rejected' && agent !== undefined) {
        failures.push(agent);
      }
    }
    return failures;
  }

  private async transition(runId: string, to: WorkflowStatus): Promise<void> {
    const run = await this.prisma.workflowRun.findUniqueOrThrow({ where: { id: runId } });
    assertTransition(run.status as WorkflowStatus, to);
    const finished = to !== WORKFLOW_STATUS.RUNNING;
    await this.prisma.workflowRun.update({
      where: { id: runId },
      data: { status: to, finishedAt: finished ? new Date() : null },
    });
  }

  private async emit(
    workflowId: string,
    type: string,
    agent: string | null,
    refId: string | null,
    metadata: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.prisma.workflowEvent.create({
      data: { workflowId, type, agent, refId, metadata },
    });
  }
}
