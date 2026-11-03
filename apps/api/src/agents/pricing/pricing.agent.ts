import { Injectable } from '@nestjs/common';
import { PricingOutput, PricingOutputSchema } from '@postor/contracts';
import { MetaModelService } from '../../models/meta-model.service';
import { BaseAgent } from '../base/base-agent';

export interface PricingAgentInput {
  tenderCode: string;
  tenderTitle: string;
  estimatedAmountDop: number | null;
  // Rendered requirement lines (id, page, text) that describe goods/services.
  requirementsText: string;
  // Vision transcriptions of scanned bill-of-goods pages (T5), if any.
  visualText: string;
  // Every company-brain quotation, verbatim, with its DOC code.
  quotationsText: string;
  todayIso: string;
}

// Agent 4 (PRD section 7, Research & Pricing). It maps what the tender asks
// to price onto the company's supplier quotations. It never estimates: a
// price exists only when a quotation line states it, and the service checks
// that literally afterwards (see pricing.service.ts).
@Injectable()
export class PricingAgent extends BaseAgent<PricingAgentInput, PricingOutput> {
  protected readonly agentName = 'pricing';
  protected readonly agentRole = 'Research & Pricing Agent';
  protected readonly taskName = 'research';
  protected readonly promptVersion = 'pricing-v1';
  protected readonly outputSchema = PricingOutputSchema;

  public constructor(metaModel: MetaModelService) {
    super(metaModel);
  }

  protected buildTaskPrompt(input: PricingAgentInput): string {
    let budget = 'not stated';
    if (input.estimatedAmountDop !== null) {
      budget = `RD$ ${input.estimatedAmountDop}`;
    }
    return [
      `Tender ${input.tenderCode}: ${input.tenderTitle}. Reference budget: ${budget}.`,
      `Today is ${input.todayIso}.`,
      '',
      'Tender requirements that describe what must be supplied:',
      input.requirementsText,
      '',
      'Scanned bill-of-goods pages read by the vision model (may be empty):',
      input.visualText,
      '',
      'Company supplier quotations (the ONLY allowed price source):',
      input.quotationsText,
      '',
      'Task: list each good or service the bidder must price (merge duplicates;',
      'at most 12 items). For each one, look for a matching quotation line.',
      '',
      'Rules:',
      '- unitPrice is the exact unit price printed on the matching quotation',
      '  line, as a number without separators. No match: unitPrice null.',
      '- Never estimate, average, extrapolate or convert prices.',
      '- sourceDocCode is the DOC code of that quotation; validUntil is its',
      '  "Valida hasta" date (YYYY-MM-DD).',
      '- status: ok when a matching line exists and the quotation is valid',
      '  today; insufficient_data when no quotation covers the item or it is',
      '  expired; no_reliable_match when a line exists but the product does',
      '  not meet the tender specification (say why in assumptions).',
      '- quantity and unit come from the tender text; null if not stated.',
      '- requirementIds lists the tender requirement ids the item comes from;',
      '  tenderPage is the pliego page that states the item.',
      '- assumptions: short notes (expired quote, spec gap, quantity unclear).',
      '',
      'Response format: reply with EXACTLY this JSON shape, no extra keys:',
      '{"items": [{"item": "<short name>", "specification": "<tender spec>",',
      '  "quantity": 1, "unit": "<unit or null>", "unitPrice": null,',
      '  "currency": "DOP", "sourceUrl": null, "sourceDate": "<quote date or null>",',
      '  "assumptions": [], "status": "ok|insufficient_data|no_reliable_match",',
      '  "sourceDocCode": "<DOC code or null>", "validUntil": "<date or null>",',
      '  "requirementIds": [], "tenderPage": 1}]}',
    ].join('\n');
  }
}
