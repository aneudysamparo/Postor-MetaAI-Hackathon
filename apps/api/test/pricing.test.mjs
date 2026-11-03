// Maintained unit tests for T6.1 pure logic (node:test, no framework).
// Run: npm run test -w @postor/api   (builds first, then exercises dist)
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { computeTotals, guardPrices } from '../dist/agents/pricing/pricing.service.js';

const QUOTES = [
  {
    docCode: 'DOC-QUOT-001',
    text: 'Valida hasta: 2026-12-31 Laptop Lenovo ThinkPad T14 12 RD$ 68,500.00',
  },
  {
    docCode: 'DOC-QUOT-002',
    text: 'Valida hasta: 2026-06-30 Switch gestionable 24 puertos PoE 6 RD$ 24,800.00',
  },
];

function item(overrides) {
  return {
    item: 'x',
    specification: 'y',
    quantity: 2,
    unit: 'unidad',
    unitPrice: null,
    currency: 'DOP',
    sourceUrl: null,
    sourceDate: null,
    assumptions: [],
    status: 'ok',
    sourceDocCode: null,
    validUntil: null,
    requirementIds: [],
    tenderPage: null,
    ...overrides,
  };
}

const TODAY = '2026-11-03';

describe('pricing guard', () => {
  it('keeps a price that literally appears in a valid quotation', () => {
    const [guarded] = guardPrices(
      [item({ unitPrice: 68500, sourceDocCode: 'DOC-QUOT-001' })],
      QUOTES,
      TODAY,
    );
    assert.equal(guarded.status, 'ok');
    assert.equal(guarded.unitPrice, 68500);
    assert.equal(guarded.validUntil, '2026-12-31');
  });

  it('removes an invented price', () => {
    const [guarded] = guardPrices(
      [item({ unitPrice: 70000, sourceDocCode: 'DOC-QUOT-001' })],
      QUOTES,
      TODAY,
    );
    assert.equal(guarded.unitPrice, null);
    assert.equal(guarded.status, 'insufficient_data');
  });

  it('downgrades an expired quotation and keeps the historical note', () => {
    const [guarded] = guardPrices(
      [item({ unitPrice: 24800, sourceDocCode: 'DOC-QUOT-002', validUntil: '2027-01-01' })],
      QUOTES,
      TODAY,
    );
    assert.equal(guarded.status, 'insufficient_data');
    assert.equal(guarded.unitPrice, null);
    assert.equal(guarded.validUntil, '2026-06-30');
    assert.ok(guarded.assumptions.some((note) => note.includes('expired')));
  });

  it('never leaves an ok item without a price', () => {
    const [guarded] = guardPrices([item({ status: 'ok' })], QUOTES, TODAY);
    assert.equal(guarded.status, 'insufficient_data');
  });

  it('totals only priced items', () => {
    const totals = computeTotals([
      item({ unitPrice: 68500, quantity: 2 }),
      item({ status: 'insufficient_data' }),
    ]);
    assert.deepEqual(totals, { pricedItems: 1, pendingItems: 1, quotedSubtotalDop: 137000 });
  });
});

describe('economic offer (F.033)', async () => {
  const { amountInWordsDop } = await import('../dist/agents/pricing/amount-in-words.js');
  const { buildEconomicOffer } = await import('../dist/agents/pricing/offer-pricing.js');
  const { priceServiceEffort } = await import('../dist/agents/pricing/pricing-catalog.js');
  const policy = {
    itbis_pct: 18,
    offer_target_pct_of_budget: 97,
    offer_band_pct_of_budget: { min: 95, max: 99 },
    min_margin_pct: 10,
    service_rates: [
      { role: 'Desarrollador full-stack', rate_dop_per_hour: 1250 },
      { role: 'Arquitecto cloud', rate_dop_per_hour: 1800 },
    ],
  };
  const item = (id, quantity, estimate = null) => ({
    id,
    kind: 'good',
    description: `Item ${id}`,
    unit: 'Unidad',
    quantity,
    file: 'pliego.pdf',
    page: 5,
    estimated_unit_price_dop: estimate,
  });
  const cost = (itemId, unitPrice) => ({
    itemId,
    unitPrice,
    status: 'ok',
    sourceDocCode: 'TIENDA-01',
    assumptions: [],
  });

  it('writes amounts the way F.033 asks (Spanish words, cents as NN/100)', () => {
    assert.equal(
      amountInWordsDop(1940000),
      'UN MILLÓN NOVECIENTOS CUARENTA MIL PESOS DOMINICANOS CON 00/100',
    );
    assert.equal(amountInWordsDop(2000000), 'DOS MILLONES DE PESOS DOMINICANOS CON 00/100');
    assert.equal(
      amountInWordsDop(21521.5),
      'VEINTIÚN MIL QUINIENTOS VEINTIÚN PESOS DOMINICANOS CON 50/100',
    );
  });

  it('targets 97% of the budget with one uniform markup and ITBIS per line', () => {
    const offer = buildEconomicOffer({
      items: [item('D-1', 110, 49920), item('D-3', 7, 188820)],
      pricing: [cost('D-1', 33900), cost('D-3', 127600)],
      budgetDop: 7000000,
      policy,
    });
    assert.equal(offer.status, 'in_band');
    assert.ok(offer.pctOfBudget >= 96.9 && offer.pctOfBudget <= 97.1);
    const [line] = offer.lines;
    assert.equal(line.itbisDop, Math.round(line.unitOfferDop * 0.18 * 100) / 100);
    assert.equal(line.unitFinalDop, Math.round((line.unitOfferDop + line.itbisDop) * 100) / 100);
    assert.ok(offer.marginPct > 10);
    assert.match(offer.amountInWords, /PESOS DOMINICANOS CON \d\d\/100$/);
  });

  it('never goes below the minimum margin and flags a budget it cannot meet', () => {
    const offer = buildEconomicOffer({
      items: [item('X-1', 1)],
      pricing: [cost('X-1', 1000000)],
      budgetDop: 1100000,
      policy,
    });
    assert.equal(offer.marginPct, 10);
    assert.equal(offer.status, 'over_budget');
  });

  it('marks the offer incomplete when an item has no reliable cost', () => {
    const offer = buildEconomicOffer({
      items: [item('X-1', 1), item('X-2', 1)],
      pricing: [cost('X-1', 1000), { ...cost('X-2', null), status: 'insufficient_data' }],
      budgetDop: 5000,
      policy,
    });
    assert.equal(offer.status, 'incomplete');
    assert.equal(offer.lines[1].unitOfferDop, null);
  });

  it('prices services from effort x rate card, never from the model', () => {
    const priced = priceServiceEffort(
      {
        itemId: 'A-1',
        item: 'Servicios',
        specification: 'x',
        quantity: 1,
        unit: 'UD',
        unitPrice: 999999,
        currency: 'DOP',
        sourceUrl: null,
        sourceDate: null,
        assumptions: [],
        status: 'ok',
        effort: [
          { role: 'Arquitecto cloud', hours: 100 },
          { role: 'Desarrollador full-stack', hours: 40 },
        ],
      },
      policy,
    );
    assert.equal(priced.unitPrice, 230000);
    assert.equal(priced.sourceDocCode, 'TARIFAS-NOVATECH');
    const unknown = priceServiceEffort(
      { ...priced, effort: [{ role: 'Astronauta', hours: 10 }], assumptions: [] },
      policy,
    );
    assert.equal(unknown.unitPrice, null);
    assert.equal(unknown.status, 'insufficient_data');
  });
});
