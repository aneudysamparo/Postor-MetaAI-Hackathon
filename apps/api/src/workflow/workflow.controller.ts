import { BadRequestException, Body, Controller, Get, Param, Post } from '@nestjs/common';
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
  public constructor(private readonly runner: WorkflowRunner) {}

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
}
