// Maintained unit tests for T5 pure logic (node:test, no framework).
// Run: npm run test -w @postor/api   (builds first, then exercises dist)
import { strict as assert } from 'node:assert';
import { existsSync } from 'node:fs';
import { describe, it } from 'node:test';
import { pdfjsAssetOptions } from '../dist/documents/pdf-page-renderer.js';
import {
  parseVisualReading,
  selectVisualPages,
} from '../dist/agents/visual/visual-evidence.service.js';

function requirement(id, documentId, page, category = 'technical') {
  return { id, category, source: { documentId, page, evidenceId: `EV-${id}`, method: 'text' } };
}

function signals(entries) {
  return new Map(entries.map(([key, quality, hasImages]) => [key, { quality, hasImages }]));
}

describe('visual page selection', () => {
  it('skips text pages and pages without images', () => {
    const picked = selectVisualPages(
      [requirement('R1', 'D', 1), requirement('R2', 'D', 2), requirement('R3', 'D', 3)],
      signals([
        ['D#1', 'text', true],
        ['D#2', 'mixed', false],
        ['D#3', 'scanned', true],
      ]),
    );
    assert.deepEqual(
      picked.map((entry) => entry.page),
      [3],
    );
  });

  it('puts technical pages first, groups requirement ids, and caps the count', () => {
    const picked = selectVisualPages(
      [
        requirement('R1', 'D', 1, 'administrative'),
        requirement('R2', 'D', 5, 'technical'),
        requirement('R3', 'D', 5, 'legal'),
        requirement('R4', 'D', 9, 'economic'),
      ],
      signals([
        ['D#1', 'mixed', true],
        ['D#5', 'mixed', true],
        ['D#9', 'poor', true],
      ]),
      2,
    );
    assert.deepEqual(
      picked.map((entry) => entry.page),
      [5, 9],
    );
    assert.deepEqual(picked[0].requirementIds, ['R2', 'R3']);
  });
});

describe('visual reading parser', () => {
  it('extracts the JSON object from surrounding prose', () => {
    const reading = parseVisualReading(
      'Here it is: {"readable": true, "summary": "Switch PoE", "keyFacts": ["24 puertos"], "tableRows": []} done',
    );
    assert.equal(reading.readable, true);
    assert.deepEqual(reading.keyFacts, ['24 puertos']);
  });

  it('returns null for invalid or missing JSON so the page goes to review', () => {
    assert.equal(parseVisualReading('no json here'), null);
    assert.equal(parseVisualReading('{"readable": "yes"}'), null);
  });
});

describe('pdfjs assets', () => {
  it('points at the wasm and font folders shipped with pdfjs-dist', () => {
    const options = pdfjsAssetOptions();
    assert.ok(existsSync(options.wasmUrl));
    assert.ok(existsSync(options.standardFontDataUrl));
  });
});

describe('sam-3.1 lane parser', async () => {
  const { parseSamBoxes } = await import('../dist/models/meta-model.service.js');

  it('reads every box with the image size it refers to (live sample)', () => {
    // Shape captured live 2026-11-03 ("handwritten signature" on case D p10).
    const lane =
      '<0f>0<|box;x1=830;y1=708;x2=869;y2=795;w=918;h=1188|><|mask;x=0;y=0;data=88,40,~!!!*&|>' +
      '<0f>1<|box;x1=860;y1=839;x2=888;y2=909;w=918;h=1188|><|mask;x=0;y=0;data=71,29,~!!|>';
    const regions = parseSamBoxes(lane, 'handwritten signature');
    assert.equal(regions.length, 2);
    assert.deepEqual(regions[0], {
      label: 'handwritten signature',
      box: { x: 830, y: 708, width: 39, height: 87 },
      imageWidth: 918,
      imageHeight: 1188,
      confidence: null,
    });
  });

  it('treats an empty lane as "no instance", not an error', () => {
    assert.deepEqual(parseSamBoxes('', 'table'), []);
  });
});
