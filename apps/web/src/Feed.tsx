import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { fetchOpportunities } from './api';
import type { Opportunity } from './api';
import { Chip, MatchChip, StatusChip, VerdictChip, formatMoney } from './ui';

const PREVIEW_MAX_CHARS = 260;

function previewOf(opportunity: Opportunity): string {
  const summary = opportunity.latestRun?.summary ?? null;
  if (summary === null) {
    return 'Aún sin análisis: abre la ficha y corre el análisis en vivo.';
  }
  return summary.slice(0, PREVIEW_MAX_CHARS);
}

export function Feed({
  onOpen,
}: {
  onOpen: (opportunityId: string, code: string) => void;
}): JSX.Element {
  const [opportunities, setOpportunities] = useState<Opportunity[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOpportunities()
      .then(setOpportunities)
      .catch((reason: unknown) => setError(String(reason)));
  }, []);

  if (error !== null) {
    return <p className="error">No se pudo cargar el feed: {error}</p>;
  }
  if (opportunities === null) {
    return <p>Cargando oportunidades…</p>;
  }
  return (
    <div>
      <p className="kicker">
        Procesos publicados en el portal DGCP · expedientes originales sin modificar
      </p>
      <div className="feed-head">
        <h2>Oportunidades</h2>
        <span className="count">
          <b>{opportunities.length}</b> procesos
        </span>
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
                <Chip tone="neutral">{opportunity.documentCount} documentos</Chip>
              </div>
              <div className="card-money">
                <div className="money">RD$ {formatMoney(opportunity.amount)}</div>
                <div className="close">Cierra: {opportunity.closeDateRd ?? '—'}</div>
              </div>
            </div>
            <h3 className="card-title">{opportunity.title}</h3>
            <p className="card-sub">
              {opportunity.entity} · {opportunity.code}
            </p>
            <p className="preview">
              <b>Vista previa:</b> {previewOf(opportunity)}
            </p>
            <div className="card-actions">
              <button className="btn" onClick={() => onOpen(opportunity.id, opportunity.code)}>
                Ver ficha →
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
