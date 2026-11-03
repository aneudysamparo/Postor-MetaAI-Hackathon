/**
 * Base class for the six specialized agents.
 *
 * Every agent run produces two things: the validated output the orchestrator
 * consumes, and the trace the Agent Trace view persists (which model ran,
 * which prompt version was sent, what it cost in tokens and time). Agents
 * never call the model layer directly — always through `run`.
 */
import { z } from 'zod';
import { ChatUsage, MetaModelService } from '../../models/meta-model.service';
import { buildSystemPrompt } from './agent-system-prompt';

export interface AgentCallTrace {
  agentName: string;
  taskName: string;
  promptVersion: string;
  systemPrompt: string;
  taskPrompt: string;
  modelRequested: string;
  modelReturned: string | null;
  usage: ChatUsage;
  durationMs: number;
  rawResponse: string | null;
}

export interface AgentResult<TOutput> {
  data: TOutput;
  trace: AgentCallTrace;
}

export abstract class BaseAgent<TInput, TOutput> {
  protected abstract readonly agentName: string;
  protected abstract readonly agentRole: string;
  protected abstract readonly taskName: string;
  protected abstract readonly promptVersion: string;
  protected abstract readonly outputSchema: z.ZodType<TOutput>;

  protected constructor(protected readonly metaModel: MetaModelService) {}

  // Model routing per agent: undefined uses the default reasoning model
  // (muse-spark). An agent overrides this to route its task elsewhere.
  protected modelFor(): string | undefined {
    return undefined;
  }

  protected abstract buildTaskPrompt(input: TInput): string;

  public async run(input: TInput): Promise<AgentResult<TOutput>> {
    const systemPrompt = buildSystemPrompt(this.agentRole);
    const taskPrompt = this.buildTaskPrompt(input);
    const completion = await this.metaModel.completeJson({
      systemPrompt,
      taskPrompt,
      schema: this.outputSchema,
      model: this.modelFor(),
    });
    return {
      data: completion.data,
      trace: {
        agentName: this.agentName,
        taskName: this.taskName,
        promptVersion: this.promptVersion,
        systemPrompt,
        taskPrompt,
        modelRequested: completion.modelRequested,
        modelReturned: completion.modelReturned,
        usage: completion.usage,
        durationMs: completion.durationMs,
        rawResponse: completion.rawResponse,
      },
    };
  }
}
