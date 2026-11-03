import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { BidDocumentsService } from '../documents/bid-documents.service';
import { normalizeUserKey, runWithMetaKey, userKeyRequired } from '../models/request-meta-key';
import { z } from 'zod';
import { VoiceNoteService } from './voice-note.service';
import { WorkflowRunner } from './workflow-runner.service';

const META_KEY_HEADER = 'x-meta-api-key';

const StartWorkflowBodySchema = z.object({
  opportunityId: z.string().min(1),
  companyId: z.string().min(1).optional(),
  mode: z.enum(['lite', 'full']).optional(),
});

// TECH section 8 REST endpoints. POST returns the queued run at once; the
// live UI polls GET /workflows/:id until the status turns terminal.
@Controller('workflows')
export class WorkflowController {
  public constructor(
    private readonly runner: WorkflowRunner,
    private readonly bidDocuments: BidDocumentsService,
    private readonly voiceNotes: VoiceNoteService,
  ) {}

  @Post()
  public start(@Body() body: unknown, @Headers(META_KEY_HEADER) metaKeyHeader?: string) {
    const parsed = StartWorkflowBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        'Body must be { opportunityId: string, companyId?: string, mode?: "lite" | "full" }.',
      );
    }
    const metaKey = this.resolveMetaKey(metaKeyHeader);
    return this.runner.startWorkflow({ ...parsed.data, metaKey });
  }

  // Voice answer to the draft's [PENDING] items: the body is the WAV clip
  // itself (Content-Type audio/wav, parsed raw in http-setup.ts).
  @Post(':id/voice-notes')
  public voiceNote(
    @Param('id') id: string,
    @Req() request: Request,
    @Headers(META_KEY_HEADER) metaKeyHeader?: string,
  ) {
    const metaKey = this.resolveMetaKey(metaKeyHeader);
    return runWithMetaKey(metaKey, () => this.voiceNotes.addVoiceNote(id, request.body as Buffer));
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

  // Bring-your-own-key: the visitor's key (if any) only lives in this
  // request's async context; it is never persisted, logged or echoed back.
  private resolveMetaKey(metaKeyHeader: string | undefined): string | null {
    let metaKey: string | null = null;
    if (metaKeyHeader !== undefined && metaKeyHeader.length > 0) {
      metaKey = normalizeUserKey(metaKeyHeader);
      if (metaKey === null) {
        throw new BadRequestException('The Meta API key header is malformed.');
      }
    }
    const serverKeyPresent = (process.env.META_API_KEY ?? '').trim().length > 0;
    const needsUserKey = userKeyRequired() || !serverKeyPresent;
    if (needsUserKey && metaKey === null) {
      throw new BadRequestException(
        'Live analysis on this deployment needs your own Meta API key (x-meta-api-key).',
      );
    }
    return metaKey;
  }
}
