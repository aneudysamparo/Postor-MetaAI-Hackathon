import { Injectable } from '@nestjs/common';
import { ComplianceOutput, ComplianceOutputSchema } from '@postor/contracts';
import { MetaModelService } from '../../models/meta-model.service';
import { BaseAgent } from '../base/base-agent';

export interface ComplianceBatchRequirement {
  id: string;
  title: string;
  category: string;
  mandatory: boolean;
  originalText: string;
  sourcePage: number;
  consequence: string | null;
}

export interface ComplianceAgentInput {
  requirements: ComplianceBatchRequirement[];
  companyFactsText: string;
  evidenceExcerptsText: string;
  financialContextText: string;
  tenderCloseDateRd: string;
  // Set only on the service-level correction retry (TECH section 8: one
  // retry with the injected error); empty on the first attempt.
  correctionNote?: string;
}

// Agent 3 (PRD section 7, RAG section 23.7): evaluates one batch of tender
// requirements against the company brain. It emits findings only — the
// verdict is derived deterministically by the service, never by the model.
@Injectable()
export class ComplianceAgent extends BaseAgent<ComplianceAgentInput, ComplianceOutput> {
  protected readonly agentName = 'compliance';
  protected readonly agentRole = 'Compliance Agent';
  protected readonly taskName = 'evaluate';
  protected readonly promptVersion = 'compliance-v1';
  protected readonly outputSchema = ComplianceOutputSchema;

  public constructor(metaModel: MetaModelService) {
    super(metaModel);
  }

  protected buildTaskPrompt(input: ComplianceAgentInput): string {
    const requirements = input.requirements
      .map((requirement) => this.renderRequirement(requirement))
      .join('\n\n');
    const sections = [
      'Evaluate each tender requirement below against the company information.',
      `Tender closes: ${input.tenderCloseDateRd}.`,
      '',
      'Requirements:',
      requirements,
      '',
      'Company facts (source of truth):',
      input.companyFactsText,
      '',
      'Company document excerpts (cite these DOC codes as evidence):',
      input.evidenceExcerptsText,
      '',
      'Company financials (exact figures, computed from the profile):',
      input.financialContextText,
      '',
      'Status rules:',
      '- met: sufficient evidence supports compliance; name the DOC codes.',
      '- not_met: sufficient evidence proves non-compliance; explain why.',
      '- unknown: the information does not allow a decision. A missing',
      '  document is NOT proof of non-compliance — use unknown, except when',
      '  the tender makes the document a CUMPLE/NO CUMPLE admissibility',
      '  criterion and it is structurally absent: that is not_met.',
      '- not_applicable: the requirement does not apply; justify why.',
      '',
      'Judgment rules:',
      '- A distributor quotation supports price and availability but NEVER',
      '  proves manufacturer authorization or partnership; say so explicitly.',
      '- An expired document (see warnings) cannot prove current compliance.',
      '- When two sources disagree, say so in the reason; never pick silently.',
      '- blocker is true ONLY when the gap cannot be closed before the tender',
      '  closes (for example a missing manufacturer authorization the tender',
      '  demands as admissibility). A gap fixable in time is never a blocker.',
      '- Forms, declarations, and commitments the bidder completes during bid',
      '  preparation (SNCC.F.xxx forms, sworn statements, bonds to be issued)',
      '  are satisfiable actions: mark unknown with a recommendedAction to',
      '  complete them, never not_met. Reserve not_met for qualifications the',
      '  company cannot currently prove (experience, certifications,',
      '  authorizations, references).',
      '- requiresHumanReview is true when the evidence is thin, conflicting,',
      '  expired, or the stakes are high despite the status.',
      '- Cover every listed requirement exactly once, by its id.',
      '',
      'Response format: reply with EXACTLY this JSON shape, no extra keys:',
      '{"findings": [{"requirementId": "<one listed [id], exactly as written>",',
      '  "status": "met|not_met|unknown|not_applicable",',
      '  "reason": "<why, citing DOC codes>",',
      '  "companyEvidenceIds": ["<DOC codes from the excerpts, or empty>"],',
      '  "missingInformation": ["<what is still needed, or empty>"],',
      '  "risk": "low|medium|high",',
      '  "recommendedAction": "<concrete next step, or \'No action needed.\'>",',
      '  "requiresHumanReview": true,',
      '  "blocker": false,',
      '  "suggestedOwner": "<role or null>"}]}',
    ];
    if (input.correctionNote !== undefined && input.correctionNote.length > 0) {
      sections.push('', 'Correction from the previous attempt (fix this):', input.correctionNote);
    }
    return sections.join('\n');
  }

  private renderRequirement(requirement: ComplianceBatchRequirement): string {
    const lines = [
      `- [${requirement.id}] (${requirement.category}, mandatory: ${requirement.mandatory}, pliego p${requirement.sourcePage})`,
      `  Title: ${requirement.title}`,
      `  Text: ${requirement.originalText}`,
    ];
    if (requirement.consequence !== null) {
      lines.push(`  Consequence of non-compliance: ${requirement.consequence}`);
    }
    return lines.join('\n');
  }
}
