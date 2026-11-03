import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { DraftOffer, VoiceNoteMapping } from '@postor/contracts';
import { VoiceNoteAgent } from '../agents/voice-note/voice-note.agent';
import { MetaModelService } from '../models/meta-model.service';
import { PrismaService } from '../prisma/prisma.service';
import { AGENT_RUN_STATUS, WORKFLOW_EVENT } from './workflow-state';

// Voice answers to the draft's [PENDING] items, after a run has finished:
//  1. Muse Voice Transcribe turns the WAV clip into text;
//  2. Muse Spark (VoiceNoteAgent) maps the statements to pending items.
// Both calls are traced like any agent call, and the result is stored as a
// `voice_note` artifact of the run. Answers are user declarations: the
// draft and the bid files are not rewritten, and each answer names the
// document that would prove it.

const META_PROVIDER = 'meta';
const FIRST_ATTEMPT = 1;
const VOICE_STEP = 'voice.note';
// Spanish tenders and a Dominican bid manager: bias recognition to Spanish.
const VOICE_LANGUAGES = ['Spanish'];
// Acronyms and codes in the pending items (CCNA, PMP, RPE, SNCC.F.047...)
// are the words speech-to-text most often mishears; pass them as hints.
const KEYWORD_PATTERN = /\b[A-Z][A-Z0-9.-]{2,}\b/g;
const MAX_KEYWORDS = 20;
// Muse Voice Transcribe accepts up to 10 minutes; a pending answer is short.
const MAX_CLIP_BYTES = 4_194_304; // 4 MiB ≈ 2 minutes of 16 kHz mono PCM
const WAV_HEADER = 'RIFF';
const WAV_HEADER_BYTES = 4;

export interface VoiceNoteResult {
  artifactId: string;
  transcript: string;
  audioDurationMs: number | null;
  mapping: VoiceNoteMapping;
  pendingItems: string[];
}

// Pure (unit-tested): the draft's open items, global list first, then the
// per-section ones, without duplicates or empty entries.
export function collectPendingItems(draft: DraftOffer): string[] {
  const seen = new Set<string>();
  const items: string[] = [];
  const all = [...draft.pendingFields, ...draft.sections.flatMap((section) => section.pending)];
  for (const raw of all) {
    const item = raw.trim();
    if (item.length > 0 && !seen.has(item)) {
      seen.add(item);
      items.push(item);
    }
  }
  return items;
}

// Pure (unit-tested): recognition hints taken from the pending items.
export function voiceKeywords(pendingItems: string[]): string[] {
  const found = new Set<string>();
  for (const item of pendingItems) {
    for (const match of item.match(KEYWORD_PATTERN) ?? []) {
      found.add(match.replace(/[.-]+$/, ''));
    }
  }
  return [...found].slice(0, MAX_KEYWORDS);
}

@Injectable()
export class VoiceNoteService {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly metaModel: MetaModelService,
    private readonly agent: VoiceNoteAgent,
  ) {}

  public async addVoiceNote(runId: string, wav: Buffer): Promise<VoiceNoteResult> {
    this.assertWav(wav);
    const draftArtifact = await this.prisma.artifact.findFirst({
      where: { workflowId: runId, type: 'draft_offer' },
      orderBy: { createdAt: 'desc' },
    });
    if (draftArtifact === null) {
      throw new NotFoundException(`Run ${runId} has no bid draft to answer.`);
    }
    const payload = draftArtifact.data as unknown as { draft?: DraftOffer };
    if (payload.draft === undefined) {
      throw new NotFoundException(`Run ${runId} has no bid draft to answer.`);
    }
    const pendingItems = collectPendingItems(payload.draft);
    if (pendingItems.length === 0) {
      throw new BadRequestException('The draft has no [PENDING] items left to answer.');
    }
    const agentRun = await this.prisma.agentRun.create({
      data: {
        workflowId: runId,
        agent: 'voice_note',
        task: 'answer_pending',
        status: AGENT_RUN_STATUS.RUNNING,
        attempt: FIRST_ATTEMPT,
        inputIds: [draftArtifact.id],
      },
    });
    try {
      const keywords = voiceKeywords(pendingItems);
      const transcription = await this.metaModel.transcribeAudio({
        wav,
        languageBias: VOICE_LANGUAGES,
        keywords,
      });
      await this.prisma.modelCall.create({
        data: {
          agentRunId: agentRun.id,
          provider: META_PROVIDER,
          modelRequested: transcription.modelRequested,
          modelReturned: transcription.modelRequested,
          promptSystem: '',
          promptTask:
            `WAV clip, ${wav.length} bytes; languageBias ${VOICE_LANGUAGES.join(', ')}; ` +
            `keywords ${keywords.join(', ')}`,
          promptVersion: 'asr-push-to-talk',
          requestParams: { agent: 'voice_note', task: 'transcribe' },
          responseRaw: { sessionId: transcription.sessionId },
          responseNorm: {
            transcript: transcription.transcript,
            audioDurationMs: transcription.audioDurationMs,
          },
          tokensIn: null,
          tokensOut: null,
          durationMs: transcription.durationMs,
          status: 'ok',
        },
      });
      if (transcription.transcript.length === 0) {
        throw new BadRequestException('No speech was recognized in the clip.');
      }
      const mapped = await this.agent.run({ pendingItems, transcript: transcription.transcript });
      await this.prisma.modelCall.create({
        data: {
          agentRunId: agentRun.id,
          provider: META_PROVIDER,
          modelRequested: mapped.trace.modelRequested,
          modelReturned: mapped.trace.modelReturned,
          promptSystem: mapped.trace.systemPrompt,
          promptTask: mapped.trace.taskPrompt,
          promptVersion: mapped.trace.promptVersion,
          requestParams: { agent: 'voice_note', task: 'map_pending' },
          responseRaw: this.rawJson(mapped.trace.rawResponse),
          responseNorm: mapped.data as unknown as Prisma.InputJsonValue,
          tokensIn: mapped.trace.usage.inputTokens,
          tokensOut: mapped.trace.usage.outputTokens,
          durationMs: mapped.trace.durationMs,
          status: 'ok',
        },
      });
      // Keep only answers that point at a real pending item.
      const mapping: VoiceNoteMapping = {
        answers: mapped.data.answers.filter((answer) => answer.pendingIndex < pendingItems.length),
        unmatched: mapped.data.unmatched,
      };
      const artifact = await this.prisma.artifact.create({
        data: {
          workflowId: runId,
          type: 'voice_note',
          producedBy: 'voice_note',
          data: {
            transcript: transcription.transcript,
            audioDurationMs: transcription.audioDurationMs,
            pendingItems,
            ...mapping,
          } as unknown as Prisma.InputJsonValue,
        },
      });
      await this.prisma.agentRun.update({
        where: { id: agentRun.id },
        data: {
          status: AGENT_RUN_STATUS.OK,
          outputIds: [artifact.id],
          finishedAt: new Date(),
        },
      });
      await this.prisma.workflowEvent.create({
        data: {
          workflowId: runId,
          type: WORKFLOW_EVENT.STEP_COMPLETED,
          agent: 'voice_note',
          refId: agentRun.id,
          metadata: { step: VOICE_STEP, answers: mapping.answers.length },
        },
      });
      return {
        artifactId: artifact.id,
        transcript: transcription.transcript,
        audioDurationMs: transcription.audioDurationMs,
        mapping,
        pendingItems,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.agentRun.update({
        where: { id: agentRun.id },
        data: { status: AGENT_RUN_STATUS.FAILED, finishedAt: new Date(), error: message },
      });
      throw error;
    }
  }

  private assertWav(wav: Buffer): void {
    if (!Buffer.isBuffer(wav) || wav.length <= WAV_HEADER_BYTES) {
      throw new BadRequestException('Send the voice note as an audio/wav body.');
    }
    if (wav.length > MAX_CLIP_BYTES) {
      throw new BadRequestException('The voice note is too long (max ~2 minutes).');
    }
    if (wav.subarray(0, WAV_HEADER_BYTES).toString('ascii') !== WAV_HEADER) {
      throw new BadRequestException('The voice note must be a WAV file.');
    }
  }

  private rawJson(raw: string | null): Prisma.InputJsonValue {
    if (raw === null) {
      return { text: null };
    }
    try {
      return JSON.parse(raw) as Prisma.InputJsonValue;
    } catch {
      return { text: raw };
    }
  }
}
