import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PricingFinding } from '@postor/contracts';
import { resolveDataDir } from '../../documents/bid-documents.service';

// Price sources for the economic offer, all DEMO data under data/:
//  - tenders/<case>/items.json: the items the pliego asks to price, with
//    file + page (transcribed; the pliego itself is never modified);
//  - suppliers/tiendas-DEMO.json: fictional stores with product catalogs
//    and validity dates (the only source of goods costs);
//  - company-brain/pricing-policy.json: NovaTech's hourly rates for
//    services, ITBIS, target share of the budget and minimum margin.

export interface TenderItem {
  id: string;
  kind: 'good' | 'service';
  description: string;
  unit: string;
  quantity: number;
  file: string;
  page: number;
  estimated_unit_price_dop: number | null;
}

export interface StoreProduct {
  sku: string;
  name: string;
  unit: string;
  price_dop: number;
  stock: number | null;
}

export interface Store {
  id: string;
  name: string;
  line: string;
  valid_until: string;
  notes: string;
  products: StoreProduct[];
}

export interface PricingPolicy {
  itbis_pct: number;
  offer_target_pct_of_budget: number;
  offer_band_pct_of_budget: { min: number; max: number };
  min_margin_pct: number;
  service_rates: { role: string; rate_dop_per_hour: number }[];
}

// Source code of every service cost: the company's own rate card.
export const RATE_CARD_SOURCE = 'TARIFAS-NOVATECH';
const MONEY_FRACTION_DIGITS = 2;
const CENTS_PER_PESO = 100;

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

export function loadTenderItems(caseKey: string): TenderItem[] | null {
  const path = join(resolveDataDir(), 'tenders', caseKey, 'items.json');
  if (!existsSync(path)) {
    return null;
  }
  return readJson<{ items: TenderItem[] }>(path).items;
}

export function loadStores(): Store[] {
  return readJson<{ stores: Store[] }>(join(resolveDataDir(), 'suppliers', 'tiendas-DEMO.json'))
    .stores;
}

export function loadPricingPolicy(): PricingPolicy {
  return readJson<PricingPolicy>(join(resolveDataDir(), 'company-brain', 'pricing-policy.json'));
}

export function formatDop(amount: number): string {
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: MONEY_FRACTION_DIGITS,
    maximumFractionDigits: MONEY_FRACTION_DIGITS,
  });
}

// One store as the text the pricing model reads and the price guard checks
// ("Valida hasta" is what guardPrices reads for validity).
export function storeText(store: Store): string {
  const products = store.products.map(
    (product) =>
      `- ${product.sku} | ${product.name} | ${product.unit} | RD$ ${formatDop(product.price_dop)}`,
  );
  return [
    `${store.name} — ${store.line}. Valida hasta: ${store.valid_until}. ${store.notes}`,
    ...products,
  ].join('\n');
}

export function rateCardText(policy: PricingPolicy): string {
  return policy.service_rates
    .map((rate) => `- ${rate.role}: RD$ ${formatDop(rate.rate_dop_per_hour)} por hora`)
    .join('\n');
}

// Services are priced from effort x rate in code. Pure (unit-tested): the
// model's hours per role become the unit cost; an unknown role or no hours
// leave the item without a price instead of guessing.
export function priceServiceEffort(finding: PricingFinding, policy: PricingPolicy): PricingFinding {
  const effort = finding.effort ?? [];
  const rates = new Map(policy.service_rates.map((rate) => [rate.role, rate.rate_dop_per_hour]));
  const unknownRoles = effort.filter((entry) => !rates.has(entry.role));
  const totalHours = effort.reduce((sum, entry) => sum + entry.hours, 0);
  if (effort.length === 0 || unknownRoles.length > 0 || totalHours === 0) {
    return {
      ...finding,
      unitPrice: null,
      sourceDocCode: null,
      status: 'insufficient_data',
      assumptions: [
        ...finding.assumptions,
        'Service effort missing or uses roles outside the rate card: cost not computed.',
      ],
    };
  }
  const cost = effort.reduce((sum, entry) => sum + entry.hours * (rates.get(entry.role) ?? 0), 0);
  const breakdown = effort
    .map((entry) => `${entry.role} ${entry.hours} h x RD$ ${formatDop(rates.get(entry.role) ?? 0)}`)
    .join(' + ');
  return {
    ...finding,
    unitPrice: Math.round(cost * CENTS_PER_PESO) / CENTS_PER_PESO,
    sourceDocCode: RATE_CARD_SOURCE,
    validUntil: null,
    status: 'ok',
    assumptions: [
      ...finding.assumptions,
      `Costo = ${breakdown} (horas estimadas por el modelo; revisión humana).`,
    ],
  };
}
