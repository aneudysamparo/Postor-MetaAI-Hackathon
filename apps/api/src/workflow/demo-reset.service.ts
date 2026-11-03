import { Injectable } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { resolveRepoRoot } from '../runtime-env';

// Demo reset (for judges and live presentations): hides earlier analyses so
// a tender can be analyzed again from a clean card. Nothing is deleted:
// runs, model calls and traces stay in the database; the feed and the ficha
// just ignore runs that started before the reset instant. The marker lives
// in storage/ (gitignored) next to the local database.
interface ResetMarkers {
  all: string | null;
  byOpportunity: Record<string, string>;
}

const JSON_INDENT = 2;
const EMPTY_MARKERS: ResetMarkers = { all: null, byOpportunity: {} };

export function resetMarkersPath(): string {
  return join(resolveRepoRoot(), 'storage', 'demo-reset.json');
}

// Pure visibility rule (unit-tested): a run is visible when it started after
// both the global reset and the reset of its own opportunity.
export function isRunVisible(
  markers: ResetMarkers,
  opportunityId: string,
  startedAt: Date,
): boolean {
  const cutoffs = [markers.all, markers.byOpportunity[opportunityId] ?? null].filter(
    (value): value is string => value !== null,
  );
  return cutoffs.every((cutoff) => startedAt.getTime() > new Date(cutoff).getTime());
}

@Injectable()
export class DemoResetService {
  public read(): ResetMarkers {
    const path = resetMarkersPath();
    if (!existsSync(path)) {
      return EMPTY_MARKERS;
    }
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<ResetMarkers>;
      return { all: parsed.all ?? null, byOpportunity: parsed.byOpportunity ?? {} };
    } catch {
      return EMPTY_MARKERS;
    }
  }

  public reset(opportunityId: string | null): ResetMarkers {
    const markers = this.read();
    const now = new Date().toISOString();
    let next: ResetMarkers = { all: now, byOpportunity: {} };
    if (opportunityId !== null) {
      next = { ...markers, byOpportunity: { ...markers.byOpportunity, [opportunityId]: now } };
    }
    const path = resetMarkersPath();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(next, null, JSON_INDENT));
    return next;
  }

  public isVisible(opportunityId: string, startedAt: Date): boolean {
    return isRunVisible(this.read(), opportunityId, startedAt);
  }
}
