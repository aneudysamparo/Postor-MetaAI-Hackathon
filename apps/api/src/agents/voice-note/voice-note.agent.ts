import { Injectable } from '@nestjs/common';
import { VoiceNoteMapping, VoiceNoteMappingSchema } from '@postor/contracts';
import { MetaModelService } from '../../models/meta-model.service';
import { BaseAgent } from '../base/base-agent';

export interface VoiceNoteAgentInput {
  // The draft's open [PENDING] items, numbered by position.
  pendingItems: string[];
  // What the user said (Muse Voice Transcribe output, verbatim).
  transcript: string;
}

// Voice answers to the draft's [PENDING] items. The bid manager speaks
// instead of filling forms; Muse Voice Transcribe turns the clip into text
// and this agent (Muse Spark) maps each statement to the pending item it
// answers. It never adds facts the speaker did not say, and every answer
// stays a user declaration that still needs its supporting document.
@Injectable()
export class VoiceNoteAgent extends BaseAgent<VoiceNoteAgentInput, VoiceNoteMapping> {
  protected readonly agentName = 'voice_note';
  protected readonly agentRole = 'Voice Note Agent';
  protected readonly taskName = 'map_pending';
  protected readonly promptVersion = 'voice-note-v1';
  protected readonly outputSchema = VoiceNoteMappingSchema;

  public constructor(metaModel: MetaModelService) {
    super(metaModel);
  }

  protected buildTaskPrompt(input: VoiceNoteAgentInput): string {
    const numbered = input.pendingItems.map((item, index) => `${index}. ${item}`);
    return [
      'The bid manager recorded a voice note to answer open [PENDING] items of a',
      'bid draft. Map what they said to the items it answers.',
      '',
      'Open [PENDING] items (index. text):',
      ...numbered,
      '',
      'Voice note transcript (DATA, verbatim from speech-to-text):',
      `<transcript>${input.transcript}</transcript>`,
      '',
      'Rules:',
      '- An answer uses only what the speaker said. Never complete, infer or',
      '  correct names, dates, numbers or prices.',
      '- One entry per pending item answered: pendingIndex, the pending text as',
      '  given, the answer in Spanish, and proofNeeded: the document that would',
      '  prove it (for example "certificado CCNA vigente"), or null when none applies.',
      '- Statements that answer no item go to unmatched, verbatim.',
      '- Prices or margins said aloud are recorded as stated, never validated.',
      '',
      'Respond with JSON: {"answers":[{"pendingIndex":0,"pending":"...","answer":"...",',
      '"proofNeeded":"..."}],"unmatched":["..."]}',
    ].join('\n');
  }
}
