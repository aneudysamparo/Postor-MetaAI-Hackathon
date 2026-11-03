import { Injectable } from '@nestjs/common';
import { PricingOutput, PricingOutputSchema } from '@postor/contracts';
import { MetaModelService } from '../../models/meta-model.service';
import { BaseAgent } from '../base/base-agent';

export interface PricingOfferAgentInput {
  tenderCode: string;
  tenderTitle: string;
  todayIso: string;
  // Pliego items (id | kind | quantity unit | description | page).
  itemsText: string;
  // Every DEMO store catalog, verbatim, with its store id.
  quotationsText: string;
  // The company's hourly rate card for services.
  rateCardText: string;
}

// Agent 4 in offer mode (Research & Pricing, pricing-v2): prices the items
// the pliego lists for the economic offer (SNCC.F.033). Goods: the model
// picks the cheapest valid matching catalog product and copies its price
// (guardPrices re-checks it literally). Services: it only estimates effort
// per role; code turns hours x rate into cost (priceServiceEffort). The
// offer price itself is never the model's: see offer-pricing.ts.
@Injectable()
export class PricingOfferAgent extends BaseAgent<PricingOfferAgentInput, PricingOutput> {
  protected readonly agentName = 'pricing';
  protected readonly agentRole = 'Research & Pricing Agent';
  protected readonly taskName = 'offer';
  protected readonly promptVersion = 'pricing-v2';
  protected readonly outputSchema = PricingOutputSchema;

  public constructor(metaModel: MetaModelService) {
    super(metaModel);
  }

  // pricing-v2: one entry per pliego item. Goods take the cost printed in a
  // store catalog (cheapest valid matching product); services return effort
  // per role only, and code computes the cost from the rate card.
  protected buildTaskPrompt(input: PricingOfferAgentInput): string {
    return [
      `Tender ${input.tenderCode}: ${input.tenderTitle}.`,
      `Today is ${input.todayIso}.`,
      '',
      'Items the pliego asks to price (id | kind | quantity unit | description | page):',
      input.itemsText,
      '',
      'Supplier store catalogs (the ONLY allowed source of goods costs, prices',
      'without ITBIS):',
      input.quotationsText,
      '',
      "Company rate card for services (the bidder's own team):",
      input.rateCardText,
      '',
      'Task: return exactly one entry per item, in the same order, with itemId',
      'set to the item id.',
      '',
      'Rules for goods (kind good):',
      '- Find the catalog products that meet the item description. Pick the',
      '  cheapest one from a store whose "Valida hasta" date is not before today.',
      '- unitPrice is the exact price printed on that product line, as a number',
      '  without separators; sourceDocCode is the store id (e.g. TIENDA-01);',
      '  validUntil is that store\'s "Valida hasta" date; specification names the',
      '  product and SKU chosen. Never estimate, average or convert prices.',
      '- No matching product: unitPrice null, status insufficient_data.',
      'Rules for services (kind service):',
      '- Do not set a price. Fill effort: hours per role, using ONLY role names',
      '  from the rate card, for ONE unit of the item (e.g. one month). Use hours',
      '  the pliego states when it states them; otherwise estimate the full effort',
      '  a Dominican IT firm would staff for a public contract of this scope:',
      '  analysis, design, implementation, testing, documentation, knowledge',
      '  transfer, project management and any accompaniment/support period the',
      '  item mentions. Say the basis in assumptions.',
      '- unitPrice null, sourceDocCode null, status ok.',
      'For every item: quantity and unit as given; tenderPage as given;',
      'requirementIds []; assumptions short (product chosen, why that store, effort basis).',
      '',
      'Response format: reply with EXACTLY this JSON shape, no extra keys:',
      '{"items": [{"itemId": "<id>", "item": "<short name>", "specification": "<product + SKU or scope>",',
      '  "quantity": 1, "unit": "<unit>", "unitPrice": null, "currency": "DOP",',
      '  "sourceUrl": null, "sourceDate": null, "assumptions": [],',
      '  "status": "ok|insufficient_data|no_reliable_match", "sourceDocCode": null,',
      '  "validUntil": null, "requirementIds": [], "tenderPage": 1,',
      '  "effort": [{"role": "<rate card role>", "hours": 0}]}]}',
    ].join('\n');
  }
}
