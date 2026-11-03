import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import type { JSX } from 'react';
import { fetchOpportunities, resetDemo } from './api';
import type { Opportunity } from './api';
import { Chip, MatchChip, StatusChip, VerdictChip, formatMoney, formatRdLocal } from './ui';

const PREVIEW_MAX_CHARS = 260;

function previewOf(opportunity: Opportunity): string {
  const summary = opportunity.latestRun?.summary ?? null;
  if (summary === null) {
    return 'No analysis yet: open the opportunity and run the live analysis.';
  }
  return summary.slice(0, PREVIEW_MAX_CHARS);
}

export function Feed(): JSX.Element {
  const navigate = useNavigate();
  const [resetting, setResetting] = useState(false);
  const [opportunities, setOpportunities] = useState<Opportunity[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = (): void => {
    fetchOpportunities()
      .then(setOpportunities)
      .catch((reason: unknown) => setError(String(reason)));
  };

  useEffect(load, []);

  // Clears every card for a fresh demo. Past runs stay in the database
  // (only hidden), so traces are never lost.
  async function onResetAll(): Promise<void> {
    const confirmed = window.confirm(
      'Reset the demo? The 4 opportunities will show no analysis (history is kept).',
    );
    if (!confirmed) {
      return;
    }
    setResetting(true);
    try {
      await resetDemo(null);
      load();
    } catch (reason) {
      setError(String(reason));
    } finally {
      setResetting(false);
    }
  }

  if (error !== null) {
    return <p className="error">No se pudo cargar el feed: {error}</p>;
  }
  if (opportunities === null) {
    return <p>Loading opportunities…</p>;
  }
  return (
    <div>
      <p className="kicker">Processes published on the DGCP portal · original files, unmodified</p>
      <div className="feed-head">
        <h2>Opportunities</h2>
        <span className="count">
          <b>{opportunities.length}</b> processes
        </span>
        <button
          className="btn btn-ghost reset"
          onClick={() => void onResetAll()}
          disabled={resetting}
        >
          ↺ Reset demo
        </button>
      </div>
      <div className="cards">
        {opportunities.map((opportunity) => (
          <article key={opportunity.id} className="card">
            <div className="card-top">
              <div className="card-tags">
                {opportunity.modality !== null && <Chip>{opportunity.modality}</Chip>}
                <VerdictChip verdict={opportunity.latestRun?.verdict ?? null} />
                <MatchChip level={opportunity.latestRun?.matchLevel ?? null} />
                {opportunity.latestRun !== null && opportunity.latestRun.status !== 'completed' && (
                  <StatusChip status={opportunity.latestRun.status} />
                )}
                <Chip tone="neutral">{opportunity.documentCount} documents</Chip>
              </div>
              <div className="card-money">
                <div className="money">RD$ {formatMoney(opportunity.amount)}</div>
                <div className="close">Cierra: {formatRdLocal(opportunity.closeDateRd)}</div>
              </div>
            </div>
            <h3 className="card-title">{opportunity.title}</h3>
            <p className="card-sub">
              {opportunity.entity} · {opportunity.code}
            </p>
            <p className="preview">
              <b>Preview:</b> {previewOf(opportunity)}
            </p>
            <div className="card-actions">
              <button
                className="btn"
                onClick={() => void navigate(`/opportunities/${opportunity.code}`)}
              >
                Open →
              </button>
              {opportunity.portalUrl !== null && (
                <a
                  className="btn btn-ghost"
                  href={opportunity.portalUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Portal DGCP
                </a>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
