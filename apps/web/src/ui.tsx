import type { JSX, ReactNode } from 'react';
import type { Verdict } from './api';

export type Tone = 'info' | 'ok' | 'warn' | 'bad' | 'neutral';

const MONEY_FRACTION_DIGITS = 2;

export function formatMoney(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) {
    return '—';
  }
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: MONEY_FRACTION_DIGITS,
    maximumFractionDigits: MONEY_FRACTION_DIGITS,
  });
}

const MONTH_NAMES = [
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
const NOON_HOUR = 12;
const MINUTE_DIGITS = 2;
// Tender dates and run times are shown in Dominican Republic time.
const RD_TIME_ZONE = 'America/Santo_Domingo';
const RD_LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/;

interface DateParts {
  year: number;
  month: number;
  day: number;
  hour: number | null;
  minute: number | null;
}

// "noviembre 5, 2026, 3:00 p.m." (the time part only when known).
function renderDate(parts: DateParts): string {
  const monthName = MONTH_NAMES[parts.month - 1] ?? String(parts.month);
  const datePart = `${monthName} ${parts.day}, ${parts.year}`;
  if (parts.hour === null || parts.minute === null) {
    return datePart;
  }
  let suffix = 'a.m.';
  if (parts.hour >= NOON_HOUR) {
    suffix = 'p.m.';
  }
  let hour12 = parts.hour % NOON_HOUR;
  if (hour12 === 0) {
    hour12 = NOON_HOUR;
  }
  const minutes = String(parts.minute).padStart(MINUTE_DIGITS, '0');
  return `${datePart}, ${hour12}:${minutes} ${suffix}`;
}

// Tender close dates arrive as RD local text ("2026-11-05 15:00"): they are
// already in Dominican time, so they are reformatted without any timezone
// conversion.
export function formatRdLocal(text: string | null | undefined): string {
  if (text === null || text === undefined) {
    return '—';
  }
  const match = RD_LOCAL_PATTERN.exec(text);
  if (match === null) {
    return text;
  }
  let hour: number | null = null;
  let minute: number | null = null;
  if (match[4] !== undefined && match[5] !== undefined) {
    hour = Number(match[4]);
    minute = Number(match[5]);
  }
  return renderDate({
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour,
    minute,
  });
}

// Server timestamps (UTC ISO) shown in Dominican time.
export function formatDateTime(iso: string | null | undefined): string {
  if (iso === null || iso === undefined) {
    return '—';
  }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: RD_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const value = (type: string): number => Number(parts.find((part) => part.type === type)?.value);
  return renderDate({
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
  });
}

export function Chip({
  tone = 'info',
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}): JSX.Element {
  return <span className={`chip chip-${tone}`}>{children}</span>;
}

export function Stat({ label, value }: { label: string; value: ReactNode }): JSX.Element {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <section className="panel">
      <h3 className="panel-title">{title}</h3>
      {children}
    </section>
  );
}

const VERDICT_LABELS: Record<Verdict, { label: string; tone: Tone }> = {
  go: { label: 'GO', tone: 'ok' },
  go_with_conditions: { label: 'GO WITH CONDITIONS', tone: 'warn' },
  no_go: { label: 'NO GO', tone: 'bad' },
  needs_review: { label: 'NEEDS REVIEW', tone: 'info' },
};

export function VerdictChip({ verdict }: { verdict: Verdict | null }): JSX.Element {
  if (verdict === null) {
    return <Chip tone="neutral">Sin análisis</Chip>;
  }
  const entry = VERDICT_LABELS[verdict];
  return <Chip tone={entry.tone}>{entry.label}</Chip>;
}

const STATUS_TONES: Record<string, Tone> = {
  met: 'ok',
  not_met: 'bad',
  unknown: 'warn',
  not_applicable: 'neutral',
  ok: 'ok',
  insufficient_data: 'warn',
  no_reliable_match: 'bad',
  pass: 'ok',
  needs_revision: 'warn',
  blocked: 'bad',
  completed: 'ok',
  needs_review: 'warn',
  failed: 'bad',
  running: 'info',
  queued: 'neutral',
};

const STATUS_LABELS: Record<string, string> = {
  met: 'cumple',
  not_met: 'no cumple',
  unknown: 'por verificar',
  not_applicable: 'no aplica',
  ok: 'cotizado',
  insufficient_data: 'sin dato fiable',
  no_reliable_match: 'no cumple spec',
  pass: 'aprobado',
  needs_revision: 'requiere revisión',
  blocked: 'bloqueado',
  completed: 'completado',
  needs_review: 'revisión humana',
  failed: 'falló',
  running: 'en curso',
  queued: 'en cola',
};

export function StatusChip({ status }: { status: string }): JSX.Element {
  return <Chip tone={STATUS_TONES[status] ?? 'neutral'}>{STATUS_LABELS[status] ?? status}</Chip>;
}

const MATCH_LABELS: Record<string, { label: string; tone: Tone }> = {
  high: { label: 'Match alto', tone: 'ok' },
  medium: { label: 'Match medio', tone: 'warn' },
  low: { label: 'Match bajo', tone: 'bad' },
};

export function MatchChip({ level }: { level: string | null }): JSX.Element | null {
  if (level === null) {
    return null;
  }
  const entry = MATCH_LABELS[level];
  if (entry === undefined) {
    return null;
  }
  return <Chip tone={entry.tone}>{entry.label}</Chip>;
}

// Model text carries inline citations ("[DOC-CERT-003]", "[profile]") and
// pending markers ("[PENDING: ...]"). RichText renders them as compact
// chips so the prose stays readable and every source stays visible.
const BRACKET_PATTERN = /\[([^\]]+)\]/g;
const PENDING_PREFIX = 'PENDING:';

export function RichText({ text }: { text: string }): JSX.Element {
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(BRACKET_PATTERN)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      parts.push(text.slice(cursor, index));
    }
    const inner = (match[1] ?? '').trim();
    if (inner.startsWith(PENDING_PREFIX)) {
      parts.push(
        <span key={index} className="chip chip-warn pending">
          pendiente: {inner.slice(PENDING_PREFIX.length).trim()}
        </span>,
      );
    } else {
      parts.push(
        <span key={index} className="src" title="Fuente en el Company Brain o el expediente">
          {inner}
        </span>,
      );
    }
    cursor = index + match[0].length;
  }
  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }
  return <>{parts}</>;
}

const LABEL_SEPARATOR = ': ';
// Longer prefixes are sentences, not labels.
const LABEL_MAX_CHARS = 48;

// "Label: details" items (the model's usual list shape) get a bold label.
export function LabeledItem({ text }: { text: string }): JSX.Element {
  const separator = text.indexOf(LABEL_SEPARATOR);
  const hasLabel = separator > 0 && separator <= LABEL_MAX_CHARS && !text.startsWith('[');
  if (!hasLabel) {
    return <RichText text={text} />;
  }
  const label = text.slice(0, separator);
  let rest = text.slice(separator + LABEL_SEPARATOR.length).trim();
  // The model often repeats the label as the first words of the details.
  if (rest.toLowerCase().startsWith(label.toLowerCase())) {
    rest = rest.slice(label.length).trim();
  }
  return (
    <>
      <b>{label}</b> <RichText text={rest} />
    </>
  );
}
