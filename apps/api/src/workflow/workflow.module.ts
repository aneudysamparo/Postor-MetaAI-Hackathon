import { Module } from '@nestjs/common';
import { ComplianceAgent } from '../agents/compliance/compliance.agent';
import { ComplianceService } from '../agents/compliance/compliance.service';
import { PricingAgent } from '../agents/pricing/pricing.agent';
import { PricingService } from '../agents/pricing/pricing.service';
import { ReviewerAgent } from '../agents/reviewer/reviewer.agent';
import { BidDraftingService } from '../agents/writer/bid-drafting.service';
import { WriterAgent } from '../agents/writer/writer.agent';
import { OpportunityAgent } from '../agents/opportunity/opportunity.agent';
import { TenderAnalystAgent } from '../agents/tender-analyst/tender-analyst.agent';
import { TenderAnalystService } from '../agents/tender-analyst/tender-analyst.service';
import { VisualEvidenceService } from '../agents/visual/visual-evidence.service';
import { BrainModule } from '../brain/brain.module';
import { DocumentsModule } from '../documents/documents.module';
import { ModelsModule } from '../models/models.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DemoResetService } from './demo-reset.service';
import { EvidenceController } from './evidence.controller';
import { OpportunitiesController } from './opportunities.controller';
import { WorkflowController } from './workflow.controller';
import { WorkflowRunner } from './workflow-runner.service';

// Agents live here until T6 grows enough of them to deserve their own module.
@Module({
  imports: [PrismaModule, ModelsModule, DocumentsModule, BrainModule],
  controllers: [WorkflowController, OpportunitiesController, EvidenceController],
  providers: [
    WorkflowRunner,
    DemoResetService,
    OpportunityAgent,
    TenderAnalystAgent,
    TenderAnalystService,
    ComplianceAgent,
    ComplianceService,
    VisualEvidenceService,
    PricingAgent,
    PricingService,
    WriterAgent,
    ReviewerAgent,
    BidDraftingService,
  ],
})
export class WorkflowModule {}
