import { Injectable } from '@nestjs/common';
import { DraftOffer, DraftOfferSchema } from '@postor/contracts';
import { MetaModelService } from '../../models/meta-model.service';
import { BaseAgent } from '../base/base-agent';

export interface WriterAgentInput {
  tenderHeader: string;
  verdictText: string;
  requirementsText: string;
  findingsText: string;
  pricingText: string;
  companyFactsText: string;
  // Set only on the correction round: the reviewer's observations to fix,
  // plus the previous draft so the writer edits instead of starting over.
  reviewerFeedback?: string;
  previousDraftJson?: string;
}

// Agent 5 (PRD section 7, Bid Writer). Drafts the technical proposal in the
// order the pliego asks for, using only the facts, findings and quotations it
// receives. Anything it cannot back becomes a [PENDING: ...] marker.
@Injectable()
export class WriterAgent extends BaseAgent<WriterAgentInput, DraftOffer> {
  protected readonly agentName = 'writer';
  protected readonly agentRole = 'Bid Writer Agent';
  protected readonly taskName = 'draft';
  protected readonly promptVersion = 'writer-v1';
  protected readonly outputSchema = DraftOfferSchema;

  public constructor(metaModel: MetaModelService) {
    super(metaModel);
  }

  protected buildTaskPrompt(input: WriterAgentInput): string {
    const sections = [
      'Write the technical proposal draft for this tender. Spanish is the',
      'language of the tender: write the section bodies in Spanish.',
      '',
      input.tenderHeader,
      '',
      'Go/No-Go verdict and open conditions:',
      input.verdictText,
      '',
      'Tender requirements (id, mandatory flag, pliego page):',
      input.requirementsText,
      '',
      'Compliance findings per requirement (status, company evidence):',
      input.findingsText,
      '',
      'Pricing research (prices only from company quotations):',
      input.pricingText,
      '',
      'Company facts (the only allowed company data):',
      input.companyFactsText,
      '',
      'Structure: follow the order the pliego requests. When it does not say,',
      'use only the sections that apply among: company identification,',
      'presentation, understanding of the object, scope, proposed solution,',
      'technical specifications, execution plan, timeline, work team,',
      'relevant experience, warranty and support, requirements response',
      'matrix, pending documents and annexes.',
      '',
      'Rules:',
      '- Never invent projects, references, certifications, staff, warranties,',
      '  prices or commitments. Missing data is written inline as',
      "  [PENDING: <what must be confirmed>] and repeated in that section's",
      '  "pending" list and in "pendingFields".',
      '- Cite company evidence inline by DOC code (e.g. "DOC-REF-001").',
      '- A requirement with status not_met or unknown is never described as',
      '  met: state the gap and the action instead.',
      '- requirementIds of a section lists every requirement id it answers.',
      '  The response matrix section must reference every mandatory id.',
      '- Keep each body under 1200 characters; at most 13 sections.',
      '- The company is a fictional demo entity: never call it real.',
      '',
      'Response format: reply with EXACTLY this JSON shape, no extra keys:',
      '{"sections": [{"title": "<section title>", "body": "<text>",',
      '  "requirementIds": ["<ids>"], "pending": ["<pending items>"]}],',
      ' "assumptions": ["<explicit assumptions>"],',
      ' "pendingFields": ["<every [PENDING] in the draft>"]}',
    ];
    if (input.reviewerFeedback !== undefined && input.previousDraftJson !== undefined) {
      sections.push(
        '',
        'CORRECTION ROUND. Previous draft:',
        input.previousDraftJson,
        '',
        'Reviewer observations to fix (do not fix by inventing data; unknown',
        'facts become [PENDING: ...]):',
        input.reviewerFeedback,
      );
    }
    return sections.join('\n');
  }
}
