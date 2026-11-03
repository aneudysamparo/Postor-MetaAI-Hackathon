import type { EconomicOffer, OfferLine, OfferStatus, PricingFinding } from '@postor/contracts';
import { amountInWordsDop } from './amount-in-words';
import type { PricingPolicy, TenderItem } from './pricing-catalog';

// Economic offer (SNCC.F.033), deterministic and unit-tested. The model
// never sets a price: costs come from store catalogs or the company rate
// card (checked by guardPrices), and this module applies the company's
// pricing policy:
//  - target: the total offer WITH ITBIS at `offer_target_pct_of_budget` of
//    the tender's reference budget (e.g. 97% of RD$2,000,000 = 1,940,000);
//  - every line gets the same markup over cost, so the margin is uniform
//    and traceable;
//  - the markup never drops below `min_margin_pct`: if the target leaves
//    less, the price is raised to that floor and the status says so (a
//    person decides whether to bid);
//  - a total above the budget, or any unpriced line, is flagged, never
//    hidden.

const PERCENT = 100;
const CENT = 100;
// Above this margin over cost the price is driven by the budget, not by
// the cost: a person should check that the effort/costs cover the scope.
const HIGH_MARGIN_REVIEW_PCT = 60;

function round2(value: number): number {
  return Math.round(value * CENT) / CENT;
}

function pct(value: number): number {
  return value / PERCENT;
}

export interface OfferInput {
  items: TenderItem[];
  pricing: PricingFinding[];
  budgetDop: number | null;
  policy: PricingPolicy;
}

// Pricing finding for each tender item (by itemId), only when it is usable.
function pricedCost(item: TenderItem, pricing: PricingFinding[]): PricingFinding | null {
  const finding = pricing.find((entry) => entry.itemId === item.id);
  if (finding === undefined || finding.status !== 'ok' || finding.unitPrice === null) {
    return null;
  }
  return finding;
}

export function buildEconomicOffer(input: OfferInput): EconomicOffer {
  const { policy } = input;
  const itbisRate = pct(policy.itbis_pct);
  const minMarkup = pct(policy.min_margin_pct);
  const notes: string[] = [];
  const costed = input.items.map((item) => ({ item, finding: pricedCost(item, input.pricing) }));
  let costTotal = 0;
  let costWithTax = 0;
  for (const entry of costed) {
    if (entry.finding !== null) {
      const lineCost = (entry.finding.unitPrice ?? 0) * entry.item.quantity;
      costTotal += lineCost;
      costWithTax += lineCost * (1 + itbisRate);
    }
  }
  const missing = costed.filter((entry) => entry.finding === null);
  let markup = minMarkup;
  let status: OfferStatus = 'in_band';
  if (input.budgetDop === null) {
    status = 'no_budget';
    notes.push(
      `La licitación no publica presupuesto: se aplica el margen mínimo (${policy.min_margin_pct}%).`,
    );
  } else if (costWithTax > 0) {
    const target = input.budgetDop * pct(policy.offer_target_pct_of_budget);
    markup = target / costWithTax - 1;
    if (markup < minMarkup) {
      markup = minMarkup;
      status = 'margin_floor';
      notes.push(
        `Al ${policy.offer_target_pct_of_budget}% del presupuesto el margen sería menor al mínimo (${policy.min_margin_pct}%): se sube al mínimo.`,
      );
    }
  }
  const lines: OfferLine[] = costed.map(({ item, finding }) => {
    const base: OfferLine = {
      itemId: item.id,
      description: item.description,
      unit: item.unit,
      quantity: item.quantity,
      unitCostDop: null,
      costSource: null,
      unitOfferDop: null,
      itbisDop: null,
      unitFinalDop: null,
      lineTotalDop: null,
      estimatedUnitPriceDop: item.estimated_unit_price_dop,
      tenderPage: item.page,
    };
    if (finding === null || finding.unitPrice === null) {
      return base;
    }
    const unitOffer = round2(finding.unitPrice * (1 + markup));
    const itbis = round2(unitOffer * itbisRate);
    const unitFinal = round2(unitOffer + itbis);
    const estimated = item.estimated_unit_price_dop;
    if (estimated !== null && unitFinal > estimated) {
      notes.push(
        `${item.id}: precio final RD$ ${unitFinal} supera el estimado unitario de la entidad (RD$ ${estimated}, pliego p${item.page}).`,
      );
    }
    return {
      ...base,
      unitCostDop: finding.unitPrice,
      costSource: finding.sourceDocCode ?? null,
      unitOfferDop: unitOffer,
      itbisDop: itbis,
      unitFinalDop: unitFinal,
      lineTotalDop: round2(unitFinal * item.quantity),
    };
  });
  const offerTotal = round2(lines.reduce((sum, line) => sum + (line.lineTotalDop ?? 0), 0));
  const offerBeforeTax = lines.reduce(
    (sum, line) => sum + (line.unitOfferDop ?? 0) * (line.quantity ?? 0),
    0,
  );
  let pctOfBudget: number | null = null;
  if (input.budgetDop !== null && input.budgetDop > 0) {
    pctOfBudget = round2((offerTotal / input.budgetDop) * PERCENT);
    if (pctOfBudget > PERCENT) {
      status = 'over_budget';
      notes.push('La oferta supera el presupuesto de referencia: no es competitiva así.');
    }
  }
  if (missing.length > 0) {
    status = 'incomplete';
    notes.push(
      `Sin costo fiable para: ${missing.map((entry) => entry.item.id).join(', ')}. El total no está completo.`,
    );
  }
  let marginPct: number | null = null;
  if (costTotal > 0) {
    marginPct = round2(((offerBeforeTax - costTotal) / costTotal) * PERCENT);
    if (marginPct > HIGH_MARGIN_REVIEW_PCT) {
      notes.push(
        `Margen alto (${marginPct}%): verifica que el costo estimado cubra todo el alcance antes de ofertar.`,
      );
    }
  }
  return {
    status,
    lines,
    budgetDop: input.budgetDop,
    costTotalDop: round2(costTotal),
    offerTotalDop: offerTotal,
    pctOfBudget,
    marginPct,
    itbisPct: policy.itbis_pct,
    targetPctOfBudget: policy.offer_target_pct_of_budget,
    bandPctOfBudget: policy.offer_band_pct_of_budget,
    minMarginPct: policy.min_margin_pct,
    amountInWords: amountInWordsDop(offerTotal),
    notes,
  };
}
