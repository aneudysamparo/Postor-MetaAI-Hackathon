// Maintained unit tests for the lite dossier path (node:test, no framework).
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  liteDocCodes,
  parseDossier,
  toLiteRequirements,
} from '../dist/agents/tender-analyst/lite-dossier.js';
import { resolveWorkflowMode } from '../dist/workflow/workflow-state.js';

const DOSSIER = [
  '**Veredicto de diseño:** GO_WITH_CONDITIONS',
  '| ID | Requisito | Tipo | Decisivo | Estado esperado (NovaTech) | Fuente original |',
  '|---|---|---|---|---|---|',
  '| RB-05 | Ingeniero certificado en cableado | técnico | sí | not_met | `B-Pliego.pdf`, p25 — CCNA VENCIDA → **CONDICIÓN 1 (subsanable)** |',
  '| RB-07 | RPE / TSS / DGII vigentes | legal | no | met | DOC-LEGAL-006 / DOC-LEGAL-005 |',
  '| RD-07 | **PUNTO DE REVISIÓN:** el contrato representa ≈86% | financiero | sí | needs_review | DOC-FIN-2025 |',
  '**Lectura del caso:** dos brechas → **GO_WITH_CONDITIONS**.',
].join('\n');

const PLIEGO = { id: 'doc-pliego', fileName: 'B-Pliego.pdf', pageCount: 37 };

describe('lite dossier parser', () => {
  it('keeps requirement, type and citation only', () => {
    const rows = parseDossier(DOSSIER);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0], {
      rowId: 'RB-05',
      text: 'Ingeniero certificado en cableado',
      kind: 'técnico',
      sourceFile: 'B-Pliego.pdf',
      sourcePage: 25,
    });
  });

  it('never lets the oracle answer reach the requirements', () => {
    const requirements = toLiteRequirements(parseDossier(DOSSIER), [PLIEGO], PLIEGO);
    const serialized = JSON.stringify(requirements);
    for (const leak of [
      'not_met',
      'CONDICIÓN',
      'VENCIDA',
      'GO_WITH_CONDITIONS',
      '86%',
      'needs_review',
    ]) {
      assert.ok(!serialized.includes(leak), `oracle text leaked: ${leak}`);
    }
  });

  it('cites the real page when known and flags unpaged rows', () => {
    const [cited, unpaged] = toLiteRequirements(parseDossier(DOSSIER), [PLIEGO], PLIEGO);
    assert.equal(cited.source.page, 25);
    assert.equal(cited.status, 'verified');
    assert.equal(unpaged.source.page, 1);
    assert.equal(unpaged.status, 'unknown');
  });

  it('parses the four shipped dossiers without oracle leaks', () => {
    for (const caseKey of [
      'caso-A-desarrollo-software-cne',
      'caso-B-wifi-indotel',
      'caso-C-licencias-microsoft-uaf',
      'caso-D-equipos-red-isfodosu',
    ]) {
      const markdown = readFileSync(
        `../../data/lite/tenders/${caseKey}/dossier-simplificado.md`,
        'utf8',
      );
      const rows = parseDossier(markdown);
      assert.ok(rows.length >= 8, `${caseKey} rows`);
      assert.ok(!JSON.stringify(rows).includes('Estado esperado'));
    }
  });

  it('reads the lite manifest DOC codes', () => {
    const manifest = JSON.parse(readFileSync('../../data/lite/lite-manifest.json', 'utf8'));
    const codes = liteDocCodes(manifest);
    assert.equal(codes.length, 21);
    assert.ok(codes.includes('DOC-FIN-2025'));
  });
});

describe('workflow mode', () => {
  it('prefers the request, then the env, then lite', () => {
    assert.equal(resolveWorkflowMode('full', 'lite'), 'full');
    assert.equal(resolveWorkflowMode(undefined, 'FULL'), 'full');
    assert.equal(resolveWorkflowMode('bogus', undefined), 'lite');
  });
});

describe('demo reset visibility', async () => {
  const { isRunVisible } = await import('../dist/workflow/demo-reset.service.js');
  const markers = { all: '2026-11-03T10:00:00Z', byOpportunity: { opp1: '2026-11-03T12:00:00Z' } };

  it('hides runs started before the global reset', () => {
    assert.equal(isRunVisible(markers, 'opp2', new Date('2026-11-03T09:00:00Z')), false);
    assert.equal(isRunVisible(markers, 'opp2', new Date('2026-11-03T11:00:00Z')), true);
  });

  it('applies the per-opportunity reset on top', () => {
    assert.equal(isRunVisible(markers, 'opp1', new Date('2026-11-03T11:00:00Z')), false);
    assert.equal(isRunVisible(markers, 'opp1', new Date('2026-11-03T13:00:00Z')), true);
  });
});
