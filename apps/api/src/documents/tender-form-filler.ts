// Fills the tender's OWN forms (the .docx files each DGCP tender publishes:
// SNCC.F.034, SNCC.F.042, ethics commitments, due-diligence forms...) where
// the form asks, the way a bidder fills them by hand:
//  - header content controls: "Click here to enter text." is the file
//    number, "Seleccione la fecha" the date, "Nombre del Capitulo y/o
//    dependencia gubernamental" the contracting entity;
//  - labels left empty after the colon ("3. RNC/ Cédula/ Pasaporte del
//    Oferente: ") get the value right after the label;
//  - underscore blanks: "Fecha: ____", "en calidad de ____", and the F.034
//    lines for the amendments examined and the goods/services offered.
// Red instructions are handled by fillRedRuns (shared with the templates).
// Pure string functions over word/document.xml: the original file is never
// modified, a filled copy is written to the run's output folder.

import { integerInWords } from '../agents/pricing/amount-in-words';
import { escapeXml, type FillValues } from './bid-document-filler';

export interface TenderFormValues extends FillValues {
  rnc: string;
  // Spanish long date, e.g. "3 de noviembre de 2026" (Santo Domingo time).
  dateText: string;
  // F.034 a): amendments examined; b): goods/services offered.
  amendmentsText: string;
  itemsText: string;
  representativeId: string;
  representativeNationality: string;
  tenderTitle: string;
  city: string;
  province: string;
  day: string;
  month: string;
  year: string;
}

const PARAGRAPH_PATTERN = /<w:p[ >][\s\S]*?<\/w:p>/g;
const TEXT_NODE_PATTERN = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
const UNDERSCORES_PATTERN = /_{3,}/;
const PROCUREMENT_DEPARTMENT = 'Departamento de Compras y Contrataciones';
const SPANISH_MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];
const RD_TIME_ZONE = 'America/Santo_Domingo';

export function spanishLongDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: RD_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date);
  const read = (type: string): number =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');
  return `${read('day')} de ${SPANISH_MONTHS[read('month') - 1] ?? ''} de ${read('year')}`;
}

function decode(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function paragraphText(paragraph: string): string {
  return [...paragraph.matchAll(TEXT_NODE_PATTERN)].map((match) => decode(match[1] ?? '')).join('');
}

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

// Writes `value` into the first text node of the paragraph and empties the
// others: the paragraph keeps its own formatting (font, alignment, control).
function replaceParagraphText(paragraph: string, value: string): string {
  let first = true;
  return paragraph.replace(TEXT_NODE_PATTERN, () => {
    if (first) {
      first = false;
      return `<w:t xml:space="preserve">${escapeXml(value)}</w:t>`;
    }
    return '<w:t></w:t>';
  });
}

// Appends text after the last text node (a label that ends with ":").
function appendToParagraph(paragraph: string, value: string): string {
  const nodes = [...paragraph.matchAll(TEXT_NODE_PATTERN)];
  const last = nodes[nodes.length - 1];
  if (last === undefined || last.index === undefined) {
    return paragraph;
  }
  const end = last.index + last[0].length - '</w:t>'.length;
  const opening = last[0].slice(0, last[0].indexOf('>') + 1);
  const preserved = opening.includes('xml:space') ? '' : ' xml:space="preserve"';
  const head = paragraph.slice(0, last.index);
  const body = paragraph.slice(last.index + opening.length, end);
  return `${head}${opening.replace('<w:t', `<w:t${preserved}`)}${body} ${escapeXml(value)}${paragraph.slice(end)}`;
}

// Blank rules: the words right before a "____" blank say what goes there
// (how Dominican declarations are written: "Señor (a) ____, de
// Nacionalidad ____, ... actuando en nombre de ____ ... (RNC) No. ____").
const BLANK_RULES: { before: RegExp; value: (values: TenderFormValues) => string }[] = [
  { before: /se[ñn]or ?\(a\)\s*$/, value: (values) => values.representativeName },
  { before: /quien suscribe,?\s*$/, value: (values) => values.representativeName },
  { before: /provincia\s*$/, value: (values) => values.province },
  { before: /\) de\s*$/, value: (values) => values.month },
  { before: /nacionalidad\s*$/, value: (values) => values.representativeNationality },
  { before: /estado civil\s*$/, value: () => '[PENDING: estado civil]' },
  { before: /\(rnc\) (no|n[uú]m)\.?\s*$/, value: (values) => values.rnc },
  { before: /\(rpe\) (no|n[uú]m)\.?\s*$/, value: (values) => values.rpe },
  {
    before: /(pasaporte|c[eé]dula[^,]*) (no|n[uú]m)\.?\s*$/,
    value: (values) => values.representativeId,
  },
  { before: /contrataci[oó]n p[uú]blica (no|n[uú]m)\.?\s*$/, value: (values) => values.tenderCode },
  { before: /relativo a\s*$/, value: (values) => values.tenderTitle },
  { before: /instituci[oó]n contratante\s*$/, value: (values) => values.institution },
  { before: /persona jur[ií]dica o consorcio\s*$/, value: (values) => values.legalName },
  { before: /actuando en nombre de\s*$/, value: (values) => values.legalName },
  { before: /\(rnc\) no\.?\s*$|rnc:?\s*$/, value: (values) => values.rnc },
  { before: /con domicilio en\s*$/, value: (values) => values.address },
  { before: /ciudad( de)?\s*$/, value: (values) => values.city },
  { before: /a los\s*$/, value: (values) => values.day },
  { before: /del mes de\s*$/, value: (values) => values.month },
  { before: /del a[ñn]o\s*$/, value: (values) => values.year },
  { before: /en calidad de\s*$/, value: (values) => values.representativePosition },
  { before: /fecha:?\s*$/, value: (values) => values.dateText },
  { before: /\(nombre y apellido\)\s*$/, value: (values) => values.representativeName },
];
const BLANK_PATTERN = /_{3,}/g;
// How much text before a blank identifies it ("de Nacionalidad").
const BLANK_CONTEXT_CHARS = 60;

// Pure (unit-tested): fills each blank its preceding words identify. A
// blank right after a filled one (a split line) is removed; any other
// blank stays for a person.
export function fillLabeledBlanks(text: string, values: TenderFormValues): string {
  let output = '';
  let cursor = 0;
  let previousFilledEnd = -1;
  for (const match of text.matchAll(BLANK_PATTERN)) {
    const start = match.index ?? 0;
    const before = text.slice(cursor, start);
    const context = normalize(`${output}${before}`).slice(-BLANK_CONTEXT_CHARS);
    const rule = BLANK_RULES.find((candidate) => candidate.before.test(context));
    if (rule !== undefined) {
      output += `${before} ${rule.value(values)} `.replace(/ {2,}/g, ' ');
      previousFilledEnd = start + match[0].length;
    } else if (
      (previousFilledEnd >= 0 && before.trim().length === 0) ||
      context.endsWith(normalize(values.representativeName))
    ) {
      // A split blank, or the line already carries the signer's name.
      output += `${before} `;
    } else {
      output += before + match[0];
    }
    cursor = start + match[0].length;
  }
  // "a los 3 (   ) días", "del año 2026 (   )": the parentheses take the
  // number in words, as these declarations are written by hand.
  const withWords = `${output}${text.slice(cursor)}`.replace(
    /(\d+)\s*\([\s_]*\)/g,
    (_match, digits: string) => `${digits} (${integerInWords(Number(digits)).toLowerCase()})`,
  );
  return withWords.replace(/ +([,;.)])/g, '$1').replace(/ {2,}/g, ' ');
}

// Empty labels: the value goes right after the colon.
const LABEL_RULES: { label: RegExp; value: (values: TenderFormValues) => string }[] = [
  { label: /rnc.*del oferente:\s*$/, value: (values) => values.rnc },
  { label: /domicilio legal del oferente:\s*$/, value: (values) => values.address },
  {
    label: /^(\d+\.\s*)?nombre\/? ?raz[oó]n social del oferente:\s*$/,
    value: (values) => values.legalName,
  },
  { label: /rpe del oferente:\s*$/, value: (values) => values.rpe },
];

// Placeholder paragraphs (content controls) and what replaces them.
const PLACEHOLDER_RULES: { text: RegExp; value: (values: TenderFormValues) => string }[] = [
  { text: /^click here to enter text\.?$/, value: (values) => values.tenderCode },
  { text: /^seleccione la fecha$/, value: (values) => values.dateText },
  {
    text: /^nombre del cap[ií]tulo y\/o dependencia gubernamental$/,
    value: (values) => values.institution,
  },
  {
    text: /^nombre del departamento [óo] unidad funcional que genera el formulario$/,
    value: () => PROCUREMENT_DEPARTMENT,
  },
  { text: /^indicar nombre de la entidad contratante$/, value: (values) => values.institution },
];

export function fillTenderForm(xml: string, values: TenderFormValues): string {
  // F.034: the underscore line right after "Hemos examinado…" lists the
  // amendments; the one after "De conformidad…" lists what is offered.
  let pendingBlank: 'amendments' | 'items' | null = null;
  return xml.replace(PARAGRAPH_PATTERN, (paragraph) => {
    const text = paragraphText(paragraph);
    const lower = normalize(text);
    if (lower.length === 0) {
      return paragraph;
    }
    const placeholder = PLACEHOLDER_RULES.find((rule) => rule.text.test(lower));
    if (placeholder !== undefined) {
      return replaceParagraphText(paragraph, placeholder.value(values));
    }
    if (/^_+$/.test(lower.replace(/\s/g, '')) && pendingBlank !== null) {
      const value = pendingBlank === 'amendments' ? values.amendmentsText : values.itemsText;
      pendingBlank = null;
      return replaceParagraphText(paragraph, value);
    }
    if (lower.startsWith('hemos examinado')) {
      pendingBlank = 'amendments';
    } else if (lower.startsWith('de conformidad con los pliegos')) {
      pendingBlank = 'items';
    }
    if (UNDERSCORES_PATTERN.test(text)) {
      const filled = fillLabeledBlanks(text, values);
      if (filled !== text) {
        return replaceParagraphText(paragraph, filled);
      }
    }
    const label = LABEL_RULES.find((rule) => rule.label.test(lower));
    if (label !== undefined) {
      return appendToParagraph(paragraph, label.value(values));
    }
    return paragraph;
  });
}

// Which tender files are forms the bidder fills (not the pliego, contract
// models, reports or the F.033, which has its own priced filler).
const NOT_A_FORM_PATTERN =
  /F033|modelo de contrato|licitaci[oó]n p[uú]blica nacional|pliego|informe|acta|circular|enmienda|solicitud/i;

export function isFillableTenderForm(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.docx') && !NOT_A_FORM_PATTERN.test(fileName);
}
