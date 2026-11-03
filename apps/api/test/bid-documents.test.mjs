// Maintained unit tests for T6.2/T6.4 form filling (node:test, no framework).
// Run: npm run test -w @postor/api   (builds first, then exercises dist)
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  decideRedRun,
  f033Cells,
  fillF033,
  fillRedRuns,
} from '../dist/documents/bid-document-filler.js';
import { toF033Lines } from '../dist/documents/bid-documents.service.js';

const VALUES = {
  legalName: 'NovaTech Solutions, SRL',
  rpe: '882145',
  address: 'Av. Demo 1',
  phones: '809-555-0142',
  email: 'info@demo.do',
  representativeName: 'Miguel Demo',
  representativePosition: 'Gerente General',
  institution: 'Instituto Demo',
  tenderCode: 'DEMO-2026-0001',
};

const RED = '<w:rPr><w:color w:val="FF0000"/></w:rPr>';

function red(text) {
  return `<w:r>${RED}<w:t>${text}</w:t></w:r>`;
}

describe('red instruction runs', () => {
  it('fills the consortium rule before the legal-name rule', () => {
    const action = decideRedRun(
      '[indicar el nombre jurídico de cada miembro del Consorcio]',
      VALUES,
    );
    assert.equal(action.kind, 'pending');
  });

  it('fills fields from company data and drops long instructions', () => {
    assert.deepEqual(decideRedRun('[indicar el nombre jurídico del Oferente]', VALUES), {
      kind: 'fill',
      text: 'NovaTech Solutions, SRL',
    });
    const instruction = `[El Oferente deberá completar este formulario ${'x'.repeat(100)}]`;
    assert.equal(decideRedRun(instruction, VALUES).kind, 'drop');
  });

  it('turns unknown bracketed fields into PENDING markers', () => {
    assert.equal(decideRedRun('[indicar el número de fax]', VALUES).kind, 'pending');
    assert.deepEqual(decideRedRun('[indicar la fecha de constitución]', VALUES), {
      kind: 'pending',
      text: '[PENDING: indicar la fecha de constitución]',
    });
  });

  it('joins a split instruction and removes the red color', () => {
    const xml = `<w:p>${red('[indicar el nombre')}${red(' jurídico del Oferente]')}</w:p>`;
    const filled = fillRedRuns(xml, VALUES);
    assert.ok(filled.includes('NovaTech Solutions, SRL'));
    assert.ok(!filled.includes('FF0000'));
    assert.ok(!filled.includes('jurídico del Oferente]'));
  });
});

describe('F.033', () => {
  const cell = '<w:tc><w:p></w:p></w:tc>';
  const header = `<w:tr><w:tc><w:p><w:r><w:t>Precio Unitario</w:t></w:r></w:p></w:tc></w:tr>`;
  const empty = `<w:tr>${cell.repeat(7)}</w:tr>`;
  const xml = `<w:p><w:r><w:t>NOMBRE DEL OFERENTE:</w:t></w:r></w:p><w:tbl>${header}${empty}</w:tbl>`;

  it('never prints an offer price, only the reference cost', () => {
    const cells = f033Cells(
      {
        description: 'AP',
        unit: 'u',
        quantity: 4,
        referenceCostDop: 9600,
        sourceDocCode: 'DOC-QUOT-002',
      },
      1,
    );
    assert.equal(cells[3], '4');
    assert.ok(cells[4].startsWith('[PENDING: precio de oferta; costo ref. RD$ 9,600.00'));
  });

  it('fills the empty row and clones it for extra lines', () => {
    const lines = [
      {
        description: 'Switch',
        unit: 'u',
        quantity: 2,
        referenceCostDop: null,
        sourceDocCode: null,
      },
      { description: 'AP', unit: 'u', quantity: 40, referenceCostDop: null, sourceDocCode: null },
    ];
    const filled = fillF033(xml, lines, 'NovaTech Solutions, SRL');
    assert.ok(filled.includes('NOMBRE DEL OFERENTE: NovaTech Solutions, SRL'));
    assert.equal((filled.match(/<w:tr>/g) ?? []).length, 3);
    assert.ok(filled.includes('Switch') && filled.includes('AP'));
  });

  it('uses only valid quotation costs as reference', () => {
    const lines = toF033Lines([
      { item: 'A', unit: 'u', quantity: 1, unitPrice: 10, status: 'ok', sourceDocCode: 'Q1' },
      {
        item: 'B',
        unit: 'u',
        quantity: 1,
        unitPrice: 20,
        status: 'no_reliable_match',
        sourceDocCode: 'Q2',
      },
    ]);
    assert.equal(lines[0].referenceCostDop, 10);
    assert.equal(lines[1].referenceCostDop, null);
  });
});
