// Maintained unit tests for T7.1 cost estimates (node:test, no framework).
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { estimateCallCost, loadCostRates } from '../dist/observability/cost-estimate.js';

describe('cost estimate', () => {
  it('uses configured rates when both are set', () => {
    const rates = loadCostRates({
      META_COST_INPUT_USD_PER_MTOK: '2',
      META_COST_OUTPUT_USD_PER_MTOK: '4',
    });
    assert.equal(rates.source, 'env');
    assert.equal(estimateCallCost(1_000_000, 500_000, rates).estimatedCostUsd, 4);
  });

  it('falls back to labeled placeholder rates', () => {
    const rates = loadCostRates({ META_COST_INPUT_USD_PER_MTOK: 'abc' });
    assert.equal(rates.source, 'placeholder');
  });

  it('treats missing token counts as zero', () => {
    const rates = loadCostRates({});
    assert.equal(estimateCallCost(null, null, rates).estimatedCostUsd, 0);
  });
});
