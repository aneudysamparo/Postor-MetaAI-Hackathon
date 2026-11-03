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

export function formatDateTime(iso: string | null | undefined): string {
  if (iso === null || iso === undefined) {
    return '—';
  }
  return new Date(iso).toLocaleString('es-DO', { dateStyle: 'medium', timeStyle: 'short' });
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
