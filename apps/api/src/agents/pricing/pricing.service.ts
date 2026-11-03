import { Injectable } from '@nestjs/common';
import {
  EconomicOffer,
  PricingFinding,
  PricingFindingSchema,
  TenderRequirement,
  VisualEvidence,
} from '@postor/contracts';
import { extractDocCode } from '../../brain/company-brain-retrieval.service';
import { NormalizedTender } from '../../documents/tender-source';
import { PrismaService } from '../../prisma/prisma.service';
import { AgentCallTrace } from '../base/base-agent';
import { buildEconomicOffer } from './offer-pricing';
import { PricingOfferAgent } from './pricing-offer.agent';
import { PricingAgent } from './pricing.agent';
import {
  loadPricingPolicy,
  loadStores,
  loadTenderItems,
  priceServiceEffort,
  rateCardText,
  storeText,
} from './pricing-catalog';
import type { TenderItem } from './pricing-catalog';

export interface QuotationText {
  docCode: string;
  text: string;
}

export interface PricingResult {
  items: PricingFinding[];
  totals: PricingTotals;
  trace: AgentCallTrace;
  rawItems: PricingFinding[];
  // Offer mode only (the tender has an items.json): the SNCC.F.033 offer.
  offer: EconomicOffer | null;
}

export interface PricingTotals {
  pricedItems: number;
  pendingItems: number;
  // Sum of quantity x unitPrice over the "ok" items only, in DOP; null when
  // nothing could be priced. Never compared against the budget as if it were
  // a full offer: pending items are not in it.
  quotedSubtotalDop: number | null;
}

const QUOTATION_DOCUMENT_TYPE = 'quotation';
const VALID_UNTIL_PATTERN = /Valida hasta:\s*(\d{4}-\d{2}-\d{2})/i;
const PRICED_CATEGORIES = new Set(['technical', 'economic']);
const ISO_DATE_LENGTH = 10;
const MONEY_FRACTION_DIGITS = 2;

// "24800" must appear in the quote as "24,800.00" (the brain's format) or
// as a bare number; anything else means the model produced the number.
function priceAppearsIn(price: number, text: string): boolean {
  const formatted = price.toLocaleString('en-US', {
    minimumFractionDigits: MONEY_FRACTION_DIGITS,
    maximumFractionDigits: MONEY_FRACTION_DIGITS,
  });
  return text.includes(formatted) || text.includes(String(price));
}

function readValidUntil(text: string): string | null {
  const match = VALID_UNTIL_PATTERN.exec(text);
  if (match === null) {
    return null;
  }
  return match[1] ?? null;
}

// Deterministic guard over the model output (unit-tested). The model may
// only copy prices; this function enforces it:
// - a price whose quotation is unknown, or that does not literally appear in
//   that quotation, is removed and the item becomes insufficient_data;
// - validity comes from the quotation text, never from the model, and an
//   expired quotation downgrades the item to insufficient_data while the
//   historical price stays visible as an assumption.
export function guardPrices(
  items: PricingFinding[],
  quotations: QuotationText[],
  todayIso: string,
): PricingFinding[] {
  const byCode = new Map(quotations.map((quotation) => [quotation.docCode, quotation.text]));
  return items.map((raw) => {
    const item = PricingFindingSchema.parse({
      ...raw,
      sourceDocCode: raw.sourceDocCode ?? null,
      validUntil: raw.validUntil ?? null,
      requirementIds: raw.requirementIds ?? [],
      tenderPage: raw.tenderPage ?? null,
    });
    const assumptions = [...item.assumptions];
    if (item.unitPrice === null) {
      if (item.status === 'ok') {
        return { ...item, status: 'insufficient_data' as const, assumptions };
      }
      return item;
    }
    const quoteText = byCode.get(item.sourceDocCode ?? '');
    if (quoteText === undefined || !priceAppearsIn(item.unitPrice, quoteText)) {
      assumptions.push('Price removed: it does not appear in any company quotation.');
      return {
        ...item,
        unitPrice: null,
        sourceDocCode: null,
        validUntil: null,
        status: 'insufficient_data' as const,
        assumptions,
      };
    }
    const validUntil = readValidUntil(quoteText);
    const expired = validUntil !== null && validUntil < todayIso;
    if (expired) {
      assumptions.push(
        `Quotation ${item.sourceDocCode} expired on ${validUntil}: historical price RD$ ${item.unitPrice}, request a new quote.`,
      );
      return {
        ...item,
        unitPrice: null,
        validUntil,
        status: 'insufficient_data' as const,
        assumptions,
      };
    }
    return { ...item, validUntil, currency: item.currency ?? 'DOP', assumptions };
  });
}

export function computeTotals(items: PricingFinding[]): PricingTotals {
  let subtotal = 0;
  let pricedItems = 0;
  for (const item of items) {
    const priced = item.status === 'ok' && item.unitPrice !== null;
    if (priced) {
      pricedItems += 1;
      subtotal += (item.quantity ?? 1) * (item.unitPrice ?? 0);
    }
  }
  let quotedSubtotalDop: number | null = null;
  if (pricedItems > 0) {
    quotedSubtotalDop = subtotal;
  }
  return { pricedItems, pendingItems: items.length - pricedItems, quotedSubtotalDop };
}

// T6.1 (PRD section 7 Agent 4): tender items x company quotations. All
// quotations are passed whole (four short documents), so the agent never
// misses one because of retrieval ranking.
@Injectable()
export class PricingService {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly agent: PricingAgent,
    private readonly offerAgent: PricingOfferAgent,
  ) {}

  public async research(input: {
    companyId: string;
    tender: NormalizedTender;
    requirements: TenderRequirement[];
    visualEvidence: VisualEvidence[];
  }): Promise<PricingResult> {
    const todayIso = new Date().toISOString().slice(0, ISO_DATE_LENGTH);
    const tenderItems = loadTenderItems(input.tender.caseKey);
    if (tenderItems !== null) {
      return this.priceOffer(input.tender, tenderItems, todayIso);
    }
    const quotations = await this.loadQuotations(input.companyId);
    const priced = input.requirements.filter((requirement) =>
      PRICED_CATEGORIES.has(requirement.category),
    );
    const result = await this.agent.run({
      tenderCode: input.tender.code,
      tenderTitle: input.tender.title,
      estimatedAmountDop: input.tender.estimatedAmountDop,
      requirementsText: priced
        .map((item) => `- [${item.id}] (pliego p${item.source.page}) ${item.originalText}`)
        .join('\n'),
      visualText: input.visualEvidence
        .filter((item) => item.reading !== null)
        .map((item) => {
          const facts = item.reading?.keyFacts.join(' | ') ?? '';
          return `- ${item.fileName} p${item.page}: ${facts}`;
        })
        .join('\n'),
      quotationsText: quotations.map((item) => `[${item.docCode}] ${item.text}`).join('\n\n'),
      todayIso,
    });
    const items = guardPrices(result.data.items, quotations, todayIso);
    return {
      items,
      totals: computeTotals(items),
      trace: result.trace,
      rawItems: result.data.items,
      offer: null,
    };
  }

  // Offer mode: the pliego's item list x DEMO store catalogs + the company
  // rate card, then the deterministic economic offer (offer-pricing.ts).
  private async priceOffer(
    tender: NormalizedTender,
    tenderItems: TenderItem[],
    todayIso: string,
  ): Promise<PricingResult> {
    const stores = loadStores();
    const policy = loadPricingPolicy();
    const catalogs: QuotationText[] = stores.map((store) => ({
      docCode: store.id,
      text: storeText(store),
    }));
    const result = await this.offerAgent.run({
      tenderCode: tender.code,
      tenderTitle: tender.title,
      todayIso,
      itemsText: tenderItems
        .map(
          (item) =>
            `- ${item.id} | ${item.kind} | ${item.quantity} ${item.unit} | ${item.description} | pliego p${item.page}`,
        )
        .join('\n'),
      quotationsText: catalogs
        .map((catalog) => `[${catalog.docCode}] ${catalog.text}`)
        .join('\n\n'),
      rateCardText: rateCardText(policy),
    });
    const kindById = new Map(tenderItems.map((item) => [item.id, item.kind]));
    // Quantities and units come from the pliego item list, never the model.
    const byId = new Map(tenderItems.map((item) => [item.id, item]));
    const normalized = result.data.items.map((finding) => {
      const item = byId.get(finding.itemId ?? '');
      if (item === undefined) {
        return finding;
      }
      return { ...finding, quantity: item.quantity, unit: item.unit, tenderPage: item.page };
    });
    const goods = guardPrices(
      normalized.filter((finding) => kindById.get(finding.itemId ?? '') !== 'service'),
      catalogs,
      todayIso,
    );
    const services = normalized
      .filter((finding) => kindById.get(finding.itemId ?? '') === 'service')
      .map((finding) => priceServiceEffort(finding, policy));
    const priced = [...goods, ...services];
    const ordered = tenderItems
      .map((item) => priced.find((finding) => finding.itemId === item.id))
      .filter((finding): finding is PricingFinding => finding !== undefined);
    const offer = buildEconomicOffer({
      items: tenderItems,
      pricing: ordered,
      budgetDop: tender.estimatedAmountDop,
      policy,
    });
    return {
      items: ordered,
      totals: computeTotals(ordered),
      trace: result.trace,
      rawItems: result.data.items,
      offer,
    };
  }

  private async loadQuotations(companyId: string): Promise<QuotationText[]> {
    const documents = await this.prisma.companyBrainDoc.findMany({
      where: { companyId, documentType: QUOTATION_DOCUMENT_TYPE },
      include: { chunks: true },
      orderBy: { fileName: 'asc' },
    });
    return documents.map((document) => ({
      docCode: extractDocCode(document.fileName),
      text: document.chunks.map((chunk) => chunk.text).join(' '),
    }));
  }
}
