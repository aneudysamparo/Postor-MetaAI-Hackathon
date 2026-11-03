import { Module } from '@nestjs/common';
import { BrainModule } from './brain/brain.module';
import { DocumentsModule } from './documents/documents.module';
import { HealthController } from './health/health.controller';
import { ModelsModule } from './models/models.module';
import { PrismaModule } from './prisma/prisma.module';
import { WorkflowModule } from './workflow/workflow.module';

@Module({
  imports: [PrismaModule, ModelsModule, DocumentsModule, BrainModule, WorkflowModule],
  controllers: [HealthController],
})
export class AppModule {}
