// Fills bid forms (.docx) without touching their layout (T6.2 templates +
// T6.4 SNCC.F.033). Word stores text in runs (<w:r>); the forms mark
// instructions in red (FF0000). Every red run is either filled from company
// data, dropped (pure instructions), kept as a title, or turned into an
// explicit [PENDING: ...] marker. Nothing else in the XML changes.
//
// Pure string functions: unit-tested without files.

export interface FillValues {
  legalName: string;
  rpe: string;
  address: string;
  phones: string;
  email: string;
  representativeName: string;
  representativePosition: string;
  institution: string;
  tenderCode: string;
}

export interface F033Line {
  description: string;
  unit: string | null;
  quantity: number | null;
  // Supplier cost from a valid quotation, shown as reference only: the offer
  // price adds the company's margin, which is a human decision.
  referenceCostDop: number | null;
  sourceDocCode: string | null;
}

type RedRunAction =
  | { kind: 'fill'; text: string }
  | { kind: 'keep' }
  | { kind: 'drop' }
  | { kind: 'pending'; text: string };

const RED_COLOR_PATTERN = /<w:color w:val="FF0000"[^>]*\/>/;
const TEXT_PATTERN = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
const ROW_PATTERN = /<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g;
const CELL_PATTERN = /<w:tc>[\s\S]*?<\/w:tc>/g;
// Red text longer than this with no fill rule is a paragraph of form
// instructions ("El Oferente deberá completar..."), not a field.
const INSTRUCTION_MIN_CHARS = 100;
// Short unbracketed red text is a form title ("presentación de oferta").
const TITLE_MAX_CHARS = 60;
const F033_HEADER_MARKER = 'Precio Unitario';
const F033_OFFERER_LABEL = 'NOMBRE DEL OFERENTE:';
const DEMO_BANNER =
  'BORRADOR GENERADO POR POSTOR (DEMO) — EMPRESA FICTICIA. Revisar, completar los [PENDING], firmar y sellar manualmente. No se envía a ninguna entidad.';
const MONEY_FRACTION_DIGITS = 2;

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function runText(run: string): string {
  return [...run.matchAll(TEXT_PATTERN)].map((match) => decodeXml(match[1] ?? '')).join('');
}

function stripBrackets(text: string): string {
  return text
    .replace(/^[\s[(]+/, '')
    .replace(/[\])\s]+$/, '')
    .trim();
}

// Fill rules, most specific first ("nombre jurídico de cada miembro del
// Consorcio" must hit the consortium rule before the legal-name rule).
export function decideRedRun(text: string, values: FillValues): RedRunAction {
  const lower = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (lower.length === 0) {
    return { kind: 'keep' };
  }
  if (lower.includes('consorcio')) {
    return { kind: 'pending', text: '[PENDING: confirmar si se oferta en consorcio]' };
  }
  if (lower.includes('institución contratante') || lower.includes('desarrollo provincial')) {
    return { kind: 'fill', text: values.institution };
  }
  if (lower.includes('registro de proveedores')) {
    return { kind: 'fill', text: values.rpe };
  }
  if (lower.includes('nombre del representante') || lower.includes('nombre y apellido')) {
    return { kind: 'fill', text: values.representativeName };
  }
  if (lower.includes('personas autorizadas a firmar')) {
    return {
      kind: 'fill',
      text: `${values.representativeName}, ${values.representativePosition}`,
    };
  }
  if (lower.includes('nombre del oferente') || lower.includes('nombre jurídico del oferente')) {
    return { kind: 'fill', text: values.legalName };
  }
  if (lower.includes('dirección del representante')) {
    return { kind: 'fill', text: values.address };
  }
  if (lower.includes('teléfono')) {
    return { kind: 'fill', text: values.phones };
  }
  if (lower.includes('correo')) {
    return { kind: 'fill', text: values.email };
  }
  if (lower.length >= INSTRUCTION_MIN_CHARS) {
    return { kind: 'drop' };
  }
  const bracketed = /^[[(]/.test(lower);
  if (!bracketed && lower.length <= TITLE_MAX_CHARS) {
    return { kind: 'keep' };
  }
  return { kind: 'pending', text: `[PENDING: ${stripBrackets(text)}]` };
}

function setRunText(run: string, text: string): string {
  const withoutRed = run.replace(RED_COLOR_PATTERN, '');
  const textNode = `<w:t xml:space="preserve">${escapeXml(text)}</w:t>`;
  const firstText = withoutRed.search(TEXT_PATTERN);
  const cleared = withoutRed.replace(TEXT_PATTERN, '');
  if (firstText < 0) {
    return cleared.replace('</w:r>', `${textNode}</w:r>`);
  }
  return `${cleared.slice(0, firstText)}${textNode}${cleared.slice(firstText)}`;
}

// Innermost runs only: text boxes nest whole paragraphs (and their runs)
// inside an outer run, so a plain non-greedy <w:r>...</w:r> match could
// swallow an outer run up to an inner closing tag.
const INNERMOST_RUN_PATTERN = /<w:r(?:\s[^>]*)?>(?:(?!<w:r[\s>])[\s\S])*?<\/w:r>/g;
// Markup Word leaves between the pieces of one split instruction.
const RUN_GAP_PATTERN = /^(?:\s|<w:proofErr[^>]*\/>|<w:bookmark(?:Start|End)[^>]*\/>)*$/;

// Consecutive red runs form one instruction (Word splits "[indicar el
// nombre" / " jurídico]" freely), so adjacent red runs are joined, decided
// once, written into the first run, and the rest are removed.
export function fillRedRuns(xml: string, values: FillValues): string {
  const runs = [...xml.matchAll(INNERMOST_RUN_PATTERN)];
  let output = '';
  let cursor = 0;
  let index = 0;
  while (index < runs.length) {
    const match = runs[index];
    if (match === undefined || match.index === undefined) {
      break;
    }
    if (!RED_COLOR_PATTERN.test(match[0])) {
      index += 1;
      continue;
    }
    const group = [match];
    let next = index + 1;
    while (next < runs.length) {
      const previous = group[group.length - 1] ?? match;
      const candidate = runs[next];
      if (candidate === undefined || candidate.index === undefined) {
        break;
      }
      const gap = xml.slice((previous.index ?? 0) + previous[0].length, candidate.index);
      const adjacentRed = RED_COLOR_PATTERN.test(candidate[0]) && RUN_GAP_PATTERN.test(gap);
      if (!adjacentRed) {
        break;
      }
      group.push(candidate);
      next += 1;
    }
    const lastRun = group[group.length - 1] ?? match;
    const groupEnd = (lastRun.index ?? match.index) + lastRun[0].length;
    const text = group.map((run) => runText(run[0])).join('');
    const action = decideRedRun(text, values);
    let replacement = '';
    if (action.kind === 'fill' || action.kind === 'pending') {
      replacement = setRunText(match[0], action.text);
    } else if (action.kind === 'keep') {
      replacement = setRunText(match[0], text);
    }
    output += xml.slice(cursor, match.index) + replacement;
    cursor = groupEnd;
    index = next;
  }
  return output + xml.slice(cursor);
}

// The SNCC templates were exported from another tender: its file number
// and contracting unit are printed in headers and content controls. Both
// are replaced with the tender being bid.
export function replaceForeignLeftovers(
  xml: string,
  tenderCode: string,
  institution: string,
): string {
  return xml
    .replace(/DESARROLLO PROVINCIA-CCC-LPN-2026-0004/g, escapeXml(tenderCode))
    .replace(/Dirección de Desarrollo Provincial/g, escapeXml(institution));
}

export function insertDemoBanner(documentXml: string): string {
  const banner =
    '<w:p><w:r><w:rPr><w:b/><w:color w:val="C00000"/></w:rPr>' +
    `<w:t xml:space="preserve">${escapeXml(DEMO_BANNER)}</w:t></w:r></w:p>`;
  return documentXml.replace(/<w:body>/, `<w:body>${banner}`);
}

function writeIntoEmptyCell(cell: string, text: string): string {
  const run = `<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
  const closing = cell.indexOf('</w:p>');
  if (closing < 0) {
    return cell;
  }
  return `${cell.slice(0, closing)}${run}${cell.slice(closing)}`;
}

function formatDop(amount: number): string {
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: MONEY_FRACTION_DIGITS,
    maximumFractionDigits: MONEY_FRACTION_DIGITS,
  });
}

export function f033Cells(line: F033Line, itemNumber: number): string[] {
  let priceCell = '[PENDING: precio de oferta]';
  if (line.referenceCostDop !== null) {
    priceCell = `[PENDING: precio de oferta; costo ref. RD$ ${formatDop(line.referenceCostDop)} ${line.sourceDocCode ?? ''}]`;
  }
  let quantityCell = '[PENDING: cantidad]';
  if (line.quantity !== null) {
    quantityCell = String(line.quantity);
  }
  return [
    String(itemNumber),
    line.description,
    line.unit ?? '[PENDING: unidad]',
    quantityCell,
    priceCell,
    '[PENDING: ITBIS]',
    '[PENDING: precio final]',
  ];
}

// T6.4: the tender's own blank F.033 is the layout authority. Its item table
// (the one whose header holds "Precio Unitario") keeps every row; empty rows
// receive one line each, and extra lines clone the last empty row.
export function fillF033(xml: string, lines: F033Line[], legalName: string): string {
  const withOfferer = xml.replace(
    new RegExp(`(${F033_OFFERER_LABEL}[\\s\\S]*?)(</w:t>)`),
    `$1 ${escapeXml(legalName)}$2`,
  );
  return withOfferer.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/, (table) => {
    if (!table.includes(F033_HEADER_MARKER)) {
      return table;
    }
    const rows = [...table.matchAll(ROW_PATTERN)].map((match) => match[0]);
    const emptyRows = rows.filter((row) => runText(row).trim().length === 0);
    const template = emptyRows[emptyRows.length - 1];
    if (template === undefined) {
      return table;
    }
    const filledRows: string[] = [];
    lines.forEach((line, index) => {
      const base = emptyRows[index] ?? template;
      const cells = f033Cells(line, index + 1);
      let cellIndex = 0;
      filledRows.push(
        base.replace(CELL_PATTERN, (cell) => {
          const text = cells[cellIndex] ?? '';
          cellIndex += 1;
          return writeIntoEmptyCell(cell, text);
        }),
      );
    });
    let rebuilt = table;
    const usedEmpty = Math.min(lines.length, emptyRows.length);
    for (let index = 0; index < usedEmpty; index += 1) {
      const original = emptyRows[index];
      const filled = filledRows[index];
      if (original !== undefined && filled !== undefined) {
        rebuilt = rebuilt.replace(original, filled);
      }
    }
    const extra = filledRows.slice(usedEmpty).join('');
    if (extra.length > 0) {
      const anchor = filledRows[usedEmpty - 1] ?? emptyRows[emptyRows.length - 1] ?? '';
      rebuilt = rebuilt.replace(anchor, `${anchor}${extra}`);
    }
    return rebuilt;
  });
}
