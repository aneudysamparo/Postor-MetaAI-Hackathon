import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Demo cards: one row per tender with its document count and the status of
// its latest analysis run (null when never analyzed). WorkflowRun holds a
// plain opportunityId (no Prisma relation), so latest runs resolve in code.
@Controller('opportunities')
export class OpportunitiesController {
  public constructor(private readonly prisma: PrismaService) {}

  @Get()
  public async list() {
    const opportunities = await this.prisma.opportunity.findMany({
      orderBy: { code: 'asc' },
      include: { documents: { select: { id: true } } },
    });
    const runs = await this.prisma.workflowRun.findMany({
      orderBy: { startedAt: 'desc' },
      select: { opportunityId: true, status: true },
    });
    const latestByOpportunity = new Map<string, string>();
    for (const run of runs) {
      if (!latestByOpportunity.has(run.opportunityId)) {
        latestByOpportunity.set(run.opportunityId, run.status);
      }
    }
    return opportunities.map((opportunity) => ({
      id: opportunity.id,
      code: opportunity.code,
      title: opportunity.title,
      entity: opportunity.entity,
      amount: opportunity.amount,
      deadline: opportunity.deadline,
      documentCount: opportunity.documents.length,
      lastRunStatus: latestByOpportunity.get(opportunity.id) ?? null,
    }));
  }
}
