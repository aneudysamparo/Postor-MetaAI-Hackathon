// Maintained unit tests for T3 pure logic (node:test, no framework).
// Run: npm run test -w @postor/api   (builds first, then exercises dist)
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { toTenderRequirement } from '../../../packages/contracts/dist/index.js';
import {
  buildWindows,
  mergeContradictions,
  mergeDrafts,
} from '../dist/agents/tender-analyst/tender-analyst.service.js';

const CONTEXT = { documentId: 'doc-1', pageCount: 8, method: 'text' };

function draft(overrides = {}) {
  return {
    title: 'Bid bond',
    originalText: 'Presentar garantia de seriedad.',
    plainExplanation: 'A bid bond is required.',
    category: 'legal',
    mandatory: true,
    page: 4,
    confidence: 0.9,
    ...overrides,
  };
}

describe('requirement mapper', () => {
  it('verifies citations inside the page range', () => {
    const requirement = toTenderRequirement(draft({ page: 4 }), CONTEXT, 0);
    assert.equal(requirement.status, 'verified');
    assert.equal(requirement.source.page, 4);
    assert.equal(requirement.source.evidenceId, 'doc-1-p4-0-ev');
  });

  it('keeps over-range citations visible but unknown', () => {
    const requirement = toTenderRequirement(draft({ page: 99 }), CONTEXT, 1);
    assert.equal(requirement.status, 'unknown');
    assert.equal(requirement.source.page, 99);
  });

  it('repairs non-positive pages to 1 and marks unknown', () => {
    const requirement = toTenderRequirement(draft({ page: 0 }), CONTEXT, 2);
    assert.equal(requirement.status, 'unknown');
    assert.equal(requirement.source.page, 1);
  });
});

describe('window builder', () => {
  it('emits a single window for short documents', () => {
    assert.deepEqual(buildWindows(8), [{ startPage: 1, endPage: 8 }]);
  });

  it('slides with overlap past the first window', () => {
    assert.deepEqual(buildWindows(13), [
      { startPage: 1, endPage: 12 },
      { startPage: 11, endPage: 13 },
    ]);
  });

  it('emits nothing for empty documents', () => {
    assert.deepEqual(buildWindows(0), []);
  });
});

describe('draft merge', () => {
  it('drops overlap duplicates keeping the first', () => {
    const first = { draft: draft({ title: 'Bid Bond!' }), documentId: 'd', pageCount: 8, order: 1 };
    const dupe = { draft: draft({ title: 'bid bond' }), documentId: 'd', pageCount: 8, order: 2 };
    const other = {
      draft: draft({ title: 'Insurance', page: 5 }),
      documentId: 'd',
      pageCount: 8,
      order: 3,
    };
    const merged = mergeDrafts([dupe, other, first]);
    assert.equal(merged.length, 2);
    assert.equal(merged[0].order, 1);
  });

  it('merges contradictions trimmed and deduped', () => {
    assert.deepEqual(
      mergeContradictions([
        ['  A vs B ', ''],
        ['a vs b', 'C'],
      ]),
      ['A vs B', 'C'],
    );
  });
});
