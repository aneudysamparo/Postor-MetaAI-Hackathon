import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { BidDocumentsService } from '../documents/bid-documents.service';
import { z } from 'zod';
import { WorkflowRunner } from './workflow-runner.service';

const StartWorkflowBodySchema = z.object({
  opportunityId: z.string().min(1),
  companyId: z.string().min(1).optional(),
});

// TECH section 8 REST endpoints. POST returns the queued run at once; the
// live UI polls GET /workflows/:id until the status turns terminal.
@Controller('workflows')
export class WorkflowController {
  public constructor(
    private readonly runner: WorkflowRunner,
    private readonly bidDocuments: BidDocumentsService,
  ) {}

  @Post()
  public start(@Body() body: unknown) {
    const parsed = StartWorkflowBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Body must be { opportunityId: string, companyId?: string }.');
    }
    return this.runner.startWorkflow(parsed.data);
  }

  @Get(':id')
  public status(@Param('id') id: string) {
    return this.runner.getRun(id);
  }

  @Get(':id/results')
  public results(@Param('id') id: string) {
    return this.runner.getResults(id);
  }

  @Get(':id/trace')
  public trace(@Param('id') id: string) {
    return this.runner.getTrace(id);
  }

  // Downloads one generated bid file (editable .docx or the Markdown draft).
  // The service strips any path component, so only files of this run's own
  // output folder can be served.
  @Get(':id/files/:name')
  public file(@Param('id') id: string, @Param('name') name: string, @Res() response: Response) {
    try {
      const file = this.bidDocuments.readOutput(id, name);
      response.setHeader('Content-Type', file.mime);
      response.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(name)}"`,
      );
      response.send(file.buffer);
    } catch {
      throw new NotFoundException(`No generated file ${name} for workflow ${id}.`);
    }
  }
}
