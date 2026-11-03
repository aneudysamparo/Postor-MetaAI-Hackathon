import { Module } from '@nestjs/common';
import { OpportunityAgent } from '../agents/opportunity/opportunity.agent';
import { TenderAnalystAgent } from '../agents/tender-analyst/tender-analyst.agent';
import { TenderAnalystService } from '../agents/tender-analyst/tender-analyst.service';
import { BrainModule } from '../brain/brain.module';
import { DocumentsModule } from '../documents/documents.module';
import { ModelsModule } from '../models/models.module';
import { PrismaModule } from '../prisma/prisma.module';
import { EvidenceController } from './evidence.controller';
import { OpportunitiesController } from './opportunities.controller';
import { WorkflowController } from './workflow.controller';
import { WorkflowRunner } from './workflow-runner.service';

// Agents live here until T6 grows enough of them to deserve their own module.
@Module({
  imports: [PrismaModule, ModelsModule, DocumentsModule, BrainModule],
  controllers: [WorkflowController, OpportunitiesController, EvidenceController],
  providers: [WorkflowRunner, OpportunityAgent, TenderAnalystAgent, TenderAnalystService],
})
export class WorkflowModule {}
