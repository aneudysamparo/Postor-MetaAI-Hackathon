import { Injectable } from '@nestjs/common';
import { OpportunityAssessmentDraft, OpportunityAssessmentDraftSchema } from '@postor/contracts';
import { MetaModelService } from '../../models/meta-model.service';
import { StructuredFact } from '../../brain/structured-facts';
import { BaseAgent } from '../base/base-agent';

export interface OpportunityInput {
  code: string;
  institution: string;
  title: string;
  estimatedAmountDop: number | null;
  closeDateRd: string | null;
  modality: string;
  facts: StructuredFact[];
}

// Agent 1 (PRD section 7): metadata-level match between the tender and the
// company. It NEVER reads the pliego: per its PRD constraint it cannot judge
// eligibility from a description, so its recommendation stays preliminary
// until document and compliance analysis confirm it.
@Injectable()
export class OpportunityAgent extends BaseAgent<OpportunityInput, OpportunityAssessmentDraft> {
  protected readonly agentName = 'opportunity';
  protected readonly agentRole = 'Opportunity Agent';
  protected readonly taskName = 'evaluate';
  protected readonly promptVersion = 'opportunity-v1';
  protected readonly outputSchema = OpportunityAssessmentDraftSchema;

  public constructor(metaModel: MetaModelService) {
    super(metaModel);
  }

  protected buildTaskPrompt(input: OpportunityInput): string {
    const facts = input.facts
      .map((fact) => `- ${fact.label}: ${fact.value} [${fact.source}]`)
      .join('\n');
    const amount =
      input.estimatedAmountDop === null ? 'not published' : `DOP ${input.estimatedAmountDop}`;
    return [
      'Evaluate whether this public tender deserves a full bid analysis.',
      '',
      `Tender: ${input.code} — ${input.title}`,
      `Institution: ${input.institution}`,
      `Modality: ${input.modality}`,
      `Reference amount: ${amount}`,
      `Closing: ${input.closeDateRd ?? 'unknown'}`,
      '',
      'Company facts (source of truth, fictional demo company):',
      facts,
      '',
      'Tasks:',
      '1. Understand the procurement object and the products or services requested.',
      '2. Compare them against the company capabilities above.',
      '3. Name evident incompatibilities (object, scale, modality, timing).',
      '4. List company information that still needs verification.',
      '5. Recommend go, no_go, or needs_review with a justification.',
      '',
      'Constraint: this is a PRELIMINARY recommendation from general data only.',
      'Final eligibility is decided after document and compliance analysis.',
      'Never invent company data; unknowns go to missingInformation.',
    ].join('\n');
  }
}
