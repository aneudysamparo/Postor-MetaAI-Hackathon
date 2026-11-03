import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { AgentContextBuilder } from './agent-context-builder.service';
import { CompanyBrainLoader } from './company-brain-loader.service';
import { CompanyBrainRetrieval } from './company-brain-retrieval.service';
import { CompanyDocReader } from './company-doc-reader';

@Module({
  imports: [DocumentsModule],
  providers: [CompanyDocReader, CompanyBrainLoader, CompanyBrainRetrieval, AgentContextBuilder],
  exports: [CompanyBrainLoader, CompanyBrainRetrieval, AgentContextBuilder],
})
export class BrainModule {}
