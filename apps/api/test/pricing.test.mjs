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
