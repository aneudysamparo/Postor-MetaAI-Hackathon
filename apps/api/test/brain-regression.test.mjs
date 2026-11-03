// Maintained regression tests for the Company Brain (node:test, no framework).
// Run: npm run test -w @postor/api   (builds first, then exercises dist)
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { extractDocCode } from '../dist/brain/company-brain-retrieval.service.js';
import { buildLexicalIndex, scoreLexical } from '../dist/brain/lexical-scorer.js';
import { classifyPageQuality } from '../dist/documents/page-quality.js';

describe('document codes', () => {
  it('resolves multi-segment codes (DOC-CERT-EXP-001)', () => {
    assert.equal(extractDocCode('DOC-CERT-EXP-001.pdf'), 'DOC-CERT-EXP-001');
  });

  it('resolves simple codes (DOC-CV-004)', () => {
    assert.equal(extractDocCode('DOC-CV-004.pdf'), 'DOC-CV-004');
  });

  it('falls back to the file name without a code', () => {
    assert.equal(extractDocCode('notes.txt'), 'notes.txt');
  });
});

describe('page quality boundaries', () => {
  it('marks empty pages as scanned', () => {
    assert.equal(
      classifyPageQuality({ chars: 0, mojibakeRatio: 0, disorderedTable: false, hasImages: true }),
      'scanned',
    );
  });

  it('marks short pages as scanned', () => {
    assert.equal(
      classifyPageQuality({
        chars: 49,
        mojibakeRatio: 0,
        disorderedTable: false,
        hasImages: false,
      }),
      'scanned',
    );
  });

  it('marks mojibake pages as poor', () => {
    assert.equal(
      classifyPageQuality({
        chars: 500,
        mojibakeRatio: 0.2,
        disorderedTable: false,
        hasImages: false,
      }),
      'poor',
    );
  });

  it('marks illustrated text pages as mixed', () => {
    assert.equal(
      classifyPageQuality({
        chars: 500,
        mojibakeRatio: 0,
        disorderedTable: false,
        hasImages: true,
      }),
      'mixed',
    );
  });

  it('marks clean text pages as text', () => {
    assert.equal(
      classifyPageQuality({
        chars: 500,
        mojibakeRatio: 0,
        disorderedTable: false,
        hasImages: false,
      }),
      'text',
    );
  });
});

describe('lexical matching', () => {
  it('finds certification codes by term', () => {
    const index = buildLexicalIndex([
      'carlos reyes network associate ccna cisco vencida',
      'laura mendez gerente proyectos pmp',
    ]);
    const hit = scoreLexical(index, 0, 'CCNA network engineer');
    assert.ok(hit.score > 0);
    assert.ok(hit.matchedTerms.includes('ccna'));
    const miss = scoreLexical(index, 1, 'CCNA network engineer');
    assert.equal(miss.matchedTerms.length, 0);
  });
});
