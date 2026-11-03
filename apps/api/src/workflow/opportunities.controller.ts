import { Body, Controller, Get, Inject, NotFoundException, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { createReadStream } from 'node:fs';
import { TENDER_SOURCE, TenderSource } from '../documents/tender-source';
import { PrismaService } from '../prisma/prisma.service';
import { DemoResetService } from './demo-reset.service';

interface LatestRunSummary {
  id: string;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  verdict: string | null;
  matchLevel: string | null;
  summary: string | null;
  mode: string;
}

const PDF_MIME = 'application/pdf';
// Terminal statuses that carry results worth showing on the feed.
const USABLE_STATUSES = new Set(['completed', 'needs_review']);
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// Feed + tender documents for the UI. WorkflowRun holds a plain
// opportunityId (no Prisma relation), so latest runs resolve in code.
@Controller()
export class OpportunitiesController {
  public constructor(
    private readonly prisma: PrismaService,
    @Inject(TENDER_SOURCE) private readonly tenderSource: TenderSource,
    private readonly demoReset: DemoResetService,
  ) {}

  // Hides earlier analyses (all, or one opportunity) so the demo can start
  // clean. Nothing is deleted; see DemoResetService.
  @Post('demo/reset')
  public reset(@Body() body: { opportunityId?: unknown }) {
    let opportunityId: string | null = null;
    if (typeof body?.opportunityId === 'string' && body.opportunityId.length > 0) {
      opportunityId = body.opportunityId;
    }
    this.demoReset.reset(opportunityId);
    return { reset: opportunityId ?? 'all' };
  }

  // One card per tender: metadata from the tender source, document count,
  // and the latest run with its verdict (compliance) and match level
  // (opportunity agent) when they exist.
  @Get('opportunities')
  public async list() {
    const opportunities = await this.prisma.opportunity.findMany({
      orderBy: { code: 'asc' },
      include: { documents: { select: { id: true } } },
    });
    const tenders = await this.tenderSource.listTenders();
    const runs = await this.prisma.workflowRun.findMany({ orderBy: { startedAt: 'desc' } });
    // The card shows the latest run that finished with results; a newer
    // failed or interrupted run must not hide the last usable analysis.
    const latestByOpportunity = new Map<string, (typeof runs)[number]>();
    for (const run of runs) {
      if (!this.demoReset.isVisible(run.opportunityId, run.startedAt)) {
        continue;
      }
      const current = latestByOpportunity.get(run.opportunityId);
      const usable = USABLE_STATUSES.has(run.status);
      if (current === undefined) {
        latestByOpportunity.set(run.opportunityId, run);
      } else if (usable && !USABLE_STATUSES.has(current.status)) {
        latestByOpportunity.set(run.opportunityId, run);
      }
    }
    const result = [];
    for (const opportunity of opportunities) {
      const tender = tenders.find((entry) => entry.code === opportunity.code);
      const run = latestByOpportunity.get(opportunity.id);
      let latestRun: LatestRunSummary | null = null;
      if (run !== undefined) {
        latestRun = await this.summarizeRun(run);
      }
      result.push({
        id: opportunity.id,
        code: opportunity.code,
        title: opportunity.title,
        entity: opportunity.entity,
        amount: opportunity.amount,
        deadline: opportunity.deadline,
        closeDateRd: tender?.closeDateRd ?? null,
        modality: tender?.modality ?? null,
        portalUrl: tender?.portalUrl ?? null,
        documentCount: opportunity.documents.length,
        latestRun,
      });
    }
    return result;
  }

  @Get('opportunities/:id/documents')
  public async documents(@Param('id') id: string) {
    const rows = await this.prisma.tenderDocument.findMany({
      where: { opportunityId: id },
      orderBy: { fileName: 'asc' },
      select: { id: true, fileName: true, pageCount: true },
    });
    return rows;
  }

  // Serves the ORIGINAL tender file, byte-identical, so a citation can open
  // the real page (the UI appends #page=N for PDFs). Only files the tender
  // source lists can be served.
  @Get('documents/:id/file')
  public async file(@Param('id') id: string, @Res() response: Response) {
    const row = await this.prisma.tenderDocument.findUnique({
      where: { id },
      include: { opportunity: true },
    });
    if (row === null) {
      throw new NotFoundException(`Unknown document ${id}.`);
    }
    const tenders = await this.tenderSource.listTenders();
    const tender = tenders.find((entry) => entry.code === row.opportunity.code);
    const file = tender?.files.find((entry) => entry.fileName === row.fileName);
    if (file === undefined) {
      throw new NotFoundException(`Document ${id} is not in the tender source.`);
    }
    let mime = 'application/octet-stream';
    if (file.kind === 'pdf') {
      mime = PDF_MIME;
    } else if (file.kind === 'docx') {
      mime = DOCX_MIME;
    }
    response.setHeader('Content-Type', mime);
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(file.fileName)}"`,
    );
    createReadStream(file.absolutePath).pipe(response);
  }

  // Company Brain profile view (INSTRUCCIONES-6): the fictional company the
  // demo bids for, plus its indexed documents. Marked fictional end to end.
  @Get('company')
  public async company() {
    const company = await this.prisma.company.findFirst({ orderBy: { createdAt: 'asc' } });
    if (company === null) {
      throw new NotFoundException('No company loaded; run the brain:load command.');
    }
    const documents = await this.prisma.companyBrainDoc.findMany({
      where: { companyId: company.id },
      orderBy: { fileName: 'asc' },
      select: {
        id: true,
        fileName: true,
        documentType: true,
        issueDate: true,
        expiryDate: true,
        verificationStatus: true,
      },
    });
    return {
      id: company.id,
      name: company.name,
      isFictional: company.isFictional,
      profile: company.profile,
      documents,
    };
  }

  private async summarizeRun(run: {
    id: string;
    status: string;
    startedAt: Date;
    finishedAt: Date | null;
  }): Promise<LatestRunSummary> {
    const artifacts = await this.prisma.artifact.findMany({
      where: { workflowId: run.id, type: { in: ['compliance', 'opportunity_assessment'] } },
    });
    const created = await this.prisma.workflowEvent.findFirst({
      where: { workflowId: run.id, type: 'workflow.created' },
    });
    const createdMetadata = (created?.metadata ?? {}) as { mode?: unknown };
    // Runs created before lite mode existed were always full analyses.
    let mode = 'full';
    if (typeof createdMetadata.mode === 'string') {
      mode = createdMetadata.mode;
    }
    let verdict: string | null = null;
    let matchLevel: string | null = null;
    let summary: string | null = null;
    for (const artifact of artifacts) {
      const data = artifact.data as Record<string, unknown>;
      if (artifact.type === 'compliance') {
        const stored = data.verdict as { verdict?: string } | undefined;
        verdict = stored?.verdict ?? null;
      } else {
        if (typeof data.matchLevel === 'string') {
          matchLevel = data.matchLevel;
        }
        if (typeof data.summary === 'string') {
          summary = data.summary;
        }
      }
    }
    return {
      id: run.id,
      status: run.status,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      verdict,
      matchLevel,
      summary,
      mode,
    };
  }
}
