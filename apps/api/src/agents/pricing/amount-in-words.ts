// SNCC.F.033 asks for the total "en letras". Pure (unit-tested): an amount
// in Dominican pesos -> Spanish words, upper case, cents as NN/100, the way
// Dominican public-procurement forms write it:
//   1940000    -> "UN MILLÓN NOVECIENTOS CUARENTA MIL PESOS DOMINICANOS CON 00/100"

const UNITS = [
  '',
  'UNO',
  'DOS',
  'TRES',
  'CUATRO',
  'CINCO',
  'SEIS',
  'SIETE',
  'OCHO',
  'NUEVE',
  'DIEZ',
  'ONCE',
  'DOCE',
  'TRECE',
  'CATORCE',
  'QUINCE',
  'DIECISÉIS',
  'DIECISIETE',
  'DIECIOCHO',
  'DIECINUEVE',
  'VEINTE',
  'VEINTIUNO',
  'VEINTIDÓS',
  'VEINTITRÉS',
  'VEINTICUATRO',
  'VEINTICINCO',
  'VEINTISÉIS',
  'VEINTISIETE',
  'VEINTIOCHO',
  'VEINTINUEVE',
];
const TENS = [
  '',
  '',
  '',
  'TREINTA',
  'CUARENTA',
  'CINCUENTA',
  'SESENTA',
  'SETENTA',
  'OCHENTA',
  'NOVENTA',
];
const HUNDREDS = [
  '',
  'CIENTO',
  'DOSCIENTOS',
  'TRESCIENTOS',
  'CUATROCIENTOS',
  'QUINIENTOS',
  'SEISCIENTOS',
  'SETECIENTOS',
  'OCHOCIENTOS',
  'NOVECIENTOS',
];
const TEN = 10;
const HUNDRED = 100;
const THOUSAND = 1_000;
const MILLION = 1_000_000;
const TWENTY_NINE = 29;
const CENTS_DIGITS = 2;

// 0..999 in words; `apocope` turns a final "UNO" into "UN" before a noun
// ("UN MIL" is written "MIL", "VEINTIUN MILLONES").
function underThousand(value: number, apocope: boolean): string {
  if (value === HUNDRED) {
    return 'CIEN';
  }
  const hundreds = Math.floor(value / HUNDRED);
  const rest = value % HUNDRED;
  const parts: string[] = [];
  if (hundreds > 0) {
    parts.push(HUNDREDS[hundreds] ?? '');
  }
  if (rest > 0 && rest <= TWENTY_NINE) {
    parts.push(UNITS[rest] ?? '');
  }
  if (rest > TWENTY_NINE) {
    const tens = TENS[Math.floor(rest / TEN)] ?? '';
    const units = rest % TEN;
    if (units === 0) {
      parts.push(tens);
    } else {
      parts.push(`${tens} Y ${UNITS[units] ?? ''}`);
    }
  }
  const words = parts.join(' ');
  if (apocope) {
    return apocopate(words);
  }
  return words;
}

// Before a noun "UNO" shortens: "UN MILLÓN", "VEINTIÚN MIL", "UN PESO".
function apocopate(words: string): string {
  return words.replace(/VEINTIUNO$/, 'VEINTIÚN').replace(/UNO$/, 'UN');
}

export function integerInWords(value: number): string {
  if (value === 0) {
    return 'CERO';
  }
  const millions = Math.floor(value / MILLION);
  const thousands = Math.floor((value % MILLION) / THOUSAND);
  const rest = value % THOUSAND;
  const parts: string[] = [];
  if (millions === 1) {
    parts.push('UN MILLÓN');
  } else if (millions > 1) {
    parts.push(`${apocopate(integerInWords(millions))} MILLONES`);
  }
  if (thousands === 1) {
    parts.push('MIL');
  } else if (thousands > 1) {
    parts.push(`${underThousand(thousands, true)} MIL`);
  }
  if (rest > 0) {
    parts.push(underThousand(rest, false));
  }
  return parts.join(' ');
}

export function amountInWordsDop(amount: number): string {
  const cents = Math.round(amount * HUNDRED);
  const pesos = Math.floor(cents / HUNDRED);
  const centsPart = String(cents % HUNDRED).padStart(CENTS_DIGITS, '0');
  let currency = 'PESOS DOMINICANOS';
  // "UN MILLÓN DE PESOS", "DOS MILLONES DE PESOS": whole millions take "DE".
  if (pesos > 0 && pesos % MILLION === 0) {
    currency = `DE ${currency}`;
  }
  return `${apocopate(integerInWords(pesos))} ${currency} CON ${centsPart}/100`;
}
