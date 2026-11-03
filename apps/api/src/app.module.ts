import { Module } from '@nestjs/common';
import { DocumentsModule } from './documents/documents.module';
import { HealthController } from './health/health.controller';
import { ModelsModule } from './models/models.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule, ModelsModule, DocumentsModule],
  controllers: [HealthController],
})
export class AppModule {}
