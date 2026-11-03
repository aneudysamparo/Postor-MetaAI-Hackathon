// Maintained unit tests for T6.2/T6.3 pure logic (node:test, no framework).
// Run: npm run test -w @postor/api   (builds first, then exercises dist)
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  mergeCoverage,
  renderPricing,
  renderReviewFeedback,
} from '../dist/agents/writer/bid-drafting.service.js';

function requirement(id, mandatory, page = 3) {
  return { id, mandatory, title: `title ${id}`, category: 'technical', source: { page } };
}

const REQUIREMENTS = [
  requirement('R1', true),
  requirement('R2', true, 7),
  requirement('R3', false),
];

function draft(ids) {
  return {
    sections: [{ title: 'Matriz', body: 'x', requirementIds: ids, pending: [] }],
    assumptions: [],
    pendingFields: [],
  };
}

function review(overrides = {}) {
  return {
    verdict: 'pass',
    covered: [],
    omitted: [],
    unsupportedClaims: [],
    contradictions: [],
    recommendedFixes: [],
    ...overrides,
  };
}

describe('review coverage merge', () => {
  it('catches a mandatory requirement the reviewer model missed', () => {
    const merged = mergeCoverage(review(), draft(['R1']), REQUIREMENTS, null);
    assert.deepEqual(merged.deterministicOmissions, ['R2']);
    assert.deepEqual(merged.review.omitted, ['R2']);
    assert.equal(merged.review.verdict, 'needs_revision');
    assert.ok(merged.review.recommendedFixes.some((fix) => fix.includes('p7')));
  });

  it('passes a draft that answers every mandatory id', () => {
    const merged = mergeCoverage(review(), draft(['R1', 'R2']), REQUIREMENTS, null);
    assert.equal(merged.review.verdict, 'pass');
    assert.deepEqual(merged.deterministicOmissions, []);
  });

  it('blocks when the compliance verdict is no_go', () => {
    const merged = mergeCoverage(review(), draft(['R1', 'R2']), REQUIREMENTS, {
      verdict: 'no_go',
    });
    assert.equal(merged.review.verdict, 'blocked');
  });

  it('drops ids the model invented', () => {
    const merged = mergeCoverage(
      review({ covered: ['R1', 'R9'], omitted: ['R8'] }),
      draft(['R1', 'R2']),
      REQUIREMENTS,
      null,
    );
    assert.deepEqual(merged.review.covered, ['R1']);
    assert.deepEqual(merged.review.omitted, []);
  });
});

describe('drafting renderers', () => {
  it('marks unpriced items as pending', () => {
    const text = renderPricing([
      { item: 'Switch', quantity: 2, unit: 'u', unitPrice: null, status: 'insufficient_data' },
    ]);
    assert.ok(text.includes('[PENDING: price]'));
  });

  it('turns review problems into writer feedback lines', () => {
    const text = renderReviewFeedback(
      review({ omitted: ['R2'], unsupportedClaims: [{ claim: 'ISO 9001', reason: 'no DOC' }] }),
    );
    assert.ok(text.includes('R2'));
    assert.ok(text.includes('ISO 9001'));
  });
});
