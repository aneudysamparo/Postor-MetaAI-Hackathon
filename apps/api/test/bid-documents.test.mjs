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

describe('F.033 with a computed offer', () => {
  const cell = '<w:tc><w:p></w:p></w:tc>';
  const header = `<w:tr><w:tc><w:p><w:r><w:t>Precio Unitario</w:t></w:r></w:p></w:tc></w:tr>`;
  const empty = `<w:tr>${cell.repeat(7)}</w:tr>`;
  const totalParagraph =
    '<w:p><w:r><w:t>VALOR  TOTAL DE LA OFERTA: ……</w:t></w:r><w:r><w:t>……… RD$</w:t></w:r></w:p>';
  const wordsParagraph =
    '<w:p><w:r><w:t>Valor total de la oferta en letras</w:t></w:r><w:r><w:t>:</w:t></w:r><w:r><w:t>…………</w:t></w:r><w:r><w:t>……</w:t></w:r></w:p>';
  const xml = `<w:p><w:r><w:t>NOMBRE DEL OFERENTE:</w:t></w:r></w:p><w:tbl>${header}${empty}</w:tbl>${totalParagraph}${wordsParagraph}`;

  it('prints unit price, ITBIS, final price, total and the total in words', () => {
    const filled = fillF033(
      xml,
      [
        {
          description: 'AP interior',
          unit: 'Unidad',
          quantity: 110,
          referenceCostDop: 33900,
          sourceDocCode: 'TIENDA-01',
          offer: { unitOfferDop: 41034.53, itbisDop: 7386.22, unitFinalDop: 48420.75 },
        },
      ],
      'NovaTech Solutions, SRL',
      { totalDop: 5326282.5, amountInWords: 'CINCO MILLONES ... CON 50/100' },
    );
    assert.ok(filled.includes('RD$ 41,034.53'));
    assert.ok(filled.includes('RD$ 7,386.22'));
    assert.ok(filled.includes('RD$ 48,420.75'));
    assert.ok(filled.includes('RD$ 5,326,282.50'));
    assert.ok(filled.includes('CINCO MILLONES ... CON 50/100'));
    assert.ok(!filled.includes('[PENDING: precio de oferta'));
  });

  it('keeps the totals pending when no offer was computed', () => {
    const filled = fillF033(xml, [], 'NovaTech Solutions, SRL');
    assert.ok(filled.includes('[PENDING: valor total]'));
    assert.ok(filled.includes('[PENDING: valor total en letras]'));
  });
});

describe('F.033 words when label and dots share one run', () => {
  it('replaces the dots after "en letras:" in place', () => {
    const xml = '<w:p><w:r><w:t>Valor total de la oferta en letras:…………………</w:t></w:r></w:p>';
    const filled = fillF033(xml, [], 'N', { totalDop: 1, amountInWords: 'UN PESOS' });
    assert.ok(filled.includes('en letras: UN PESOS'));
  });
});

describe("tender's own forms", async () => {
  const { fillTenderForm, fillLabeledBlanks, isFillableTenderForm } =
    await import('../dist/documents/tender-form-filler.js');
  const values = {
    legalName: 'NovaTech Solutions, SRL',
    rpe: '882145',
    address: 'Av. Tiradentes 456',
    phones: '809',
    email: 'info@x.do',
    representativeName: 'Miguel Peralta',
    representativePosition: 'Gerente General',
    institution: 'INDOTEL',
    tenderCode: 'INDOTEL-DAF-CM-2026-0041',
    rnc: '131-48271-9',
    dateText: '3 de noviembre de 2026',
    amendmentsText: 'Circular 001',
    itemsText: '3 Unidad — AP',
    representativeId: '001-0000000-2',
    representativeNationality: 'Dominicano',
    tenderTitle: 'Plataforma Azure',
    city: 'Santo Domingo',
    province: 'Distrito Nacional',
    day: '3',
    month: 'noviembre',
    year: '2026',
  };
  const p = (text) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;

  it('fills header controls and empty labels where the form asks', () => {
    const xml = [
      p('Click here to enter text.'),
      p('Seleccione la fecha'),
      p('3.  RNC/ Cédula/ Pasaporte del Oferente: '),
      p('5.  Domicilio legal del Oferente: '),
    ].join('');
    const filled = fillTenderForm(xml, values);
    assert.ok(filled.includes('INDOTEL-DAF-CM-2026-0041'));
    assert.ok(filled.includes('3 de noviembre de 2026'));
    assert.ok(filled.includes('del Oferente:  131-48271-9'));
    assert.ok(filled.includes('Av. Tiradentes 456'));
  });

  it('fills F.034 amendment and item lines after their sentences', () => {
    const xml = [
      p('Hemos examinado y no tenemos reservas'),
      p('________'),
      p('De conformidad con los Pliegos de Condiciones'),
      p('_______'),
    ].join('');
    const filled = fillTenderForm(xml, values);
    assert.ok(filled.includes('Circular 001'));
    assert.ok(filled.includes('3 Unidad — AP'));
  });

  it('fills declaration blanks by the words before them, numbers in words', () => {
    const out = fillLabeledBlanks(
      'Quien suscribe, Señor (a) ____ _____, de Nacionalidad ____, actuando en nombre de ______, a los ____ (    ) días del mes de ____ del año ____ (   ). Otro ____',
      values,
    );
    assert.ok(
      out.startsWith('Quien suscribe, Señor (a) Miguel Peralta, de Nacionalidad Dominicano'),
    );
    assert.ok(out.includes('actuando en nombre de NovaTech Solutions, SRL'));
    assert.ok(
      out.includes('a los 3 (tres) días del mes de noviembre del año 2026 (dos mil veintiséis)'),
    );
    assert.ok(out.endsWith('Otro ____'));
  });

  it('handles the ethics-commitment wording too', () => {
    const out = fillLabeledBlanks(
      'Quien suscribe, ______, realizada en la ciudad ______, provincia ______, a los 3 (______) de ______ del año 2026 (_____).',
      values,
    );
    assert.equal(
      out,
      'Quien suscribe, Miguel Peralta, realizada en la ciudad Santo Domingo, provincia Distrito Nacional, a los 3 (tres) de noviembre del año 2026 (dos mil veintiséis).',
    );
  });

  it('fills the ethics-commitment number blanks ("núm.")', () => {
    const out = fillLabeledBlanks(
      'pasaporte núm. ______, actuando como persona física o en representación de la persona jurídica o consorcio ______, del Registro Nacional del Contribuyente (RNC) núm. ____ y del Registro de Proveedores del Estado (RPE) núm. ____, que participa en el procedimiento de contratación pública núm. ____, relativo a ____, llevado a cabo por la institución contratante ____, reconoce',
      values,
    );
    for (const expected of [
      '001-0000000-2',
      'consorcio NovaTech',
      '(RNC) núm. 131-48271-9',
      '(RPE) núm. 882145',
      'núm. INDOTEL-DAF-CM-2026-0041',
      'relativo a Plataforma Azure',
      'contratante INDOTEL',
    ]) {
      assert.ok(out.includes(expected), expected);
    }
  });

  it('treats only bidder forms as fillable', () => {
    assert.equal(isFillableTenderForm('B-SNCC_F042_Informacion_Oferente.docx'), true);
    assert.equal(
      isFillableTenderForm('C-MODELO DE CONTRATO DE EJECUCIÓN DE SERVICIOS.docx'),
      false,
    );
    assert.equal(isFillableTenderForm('B-SNCC_F033_Of_Economica.docx'), false);
    assert.equal(isFillableTenderForm('A-Pliego de condiciones.pdf'), false);
  });
});
