import { useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';
import { fetchOpportunities, fetchTrace, readArtifacts, startWorkflow } from './api';
import type { Opportunity, TraceResponse } from './api';
import { EvidenceModal } from './EvidenceModal';
import type { EvidenceTarget } from './EvidenceModal';
import {
  AnalysisTab,
  CostsTab,
  DocumentsTab,
  FormsTab,
  ProductsTab,
  RequirementsTab,
  SummaryTab,
  TraceTab,
} from './FichaTabs';
import { Chip, Stat, StatusChip, VerdictChip, formatMoney } from './ui';

const TABS = [
  'Resumen',
  'Análisis',
  'Requisitos',
  'Productos',
  'Costos',
  'Traza',
  'Formularios',
  'Documentos',
] as const;
type TabName = (typeof TABS)[number];

// Live analysis polls the real run every 2 s (PRD section 10: no fake
// animations). The pipeline writes artifacts as it goes, so tabs fill in
// while the run is still going.
const POLL_INTERVAL_MS = 2000;
// Run-level cost shown with four decimals (cents of a cent).
const COST_DECIMALS = 4;
const TERMINAL_STATUSES = new Set(['completed', 'needs_review', 'failed']);

// Steps in pipeline order, with their Spanish labels for the live list.
const PIPELINE_STEPS: { step: string; label: string }[] = [
  { step: 'load_context', label: 'Cargar expediente y empresa' },
  { step: 'opportunity.evaluate', label: 'Agente de Oportunidad' },
  { step: 'tender_analyst.extract', label: 'Analista del pliego' },
  { step: 'consolidate', label: 'Consolidar requisitos' },
  { step: 'visual.read', label: 'Lectura visual (páginas escaneadas)' },
  { step: 'compliance.evaluate', label: 'Cumplimiento + veredicto' },
  { step: 'pricing.research', label: 'Investigación de precios' },
  { step: 'writer.draft', label: 'Redactor de la oferta' },
  { step: 'reviewer.review', label: 'Revisor de la oferta' },
  { step: 'documents.generate', label: 'Formularios y F.033' },
];

type StepState = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

function stepStates(trace: TraceResponse | null): Map<string, StepState> {
  const states = new Map<string, StepState>();
  if (trace === null) {
    return states;
  }
  for (const event of trace.events) {
    const step = event.metadata?.step;
    if (typeof step !== 'string') {
      continue;
    }
    if (event.type === 'workflow.step_started') {
      states.set(step, 'running');
    } else if (event.type === 'workflow.step_completed') {
      const skipped = Boolean(event.metadata?.skipped);
      let state: StepState = 'done';
      if (skipped) {
        state = 'skipped';
      }
      states.set(step, state);
    } else if (event.type === 'workflow.step_failed') {
      states.set(step, 'failed');
    }
  }
  return states;
}

const STEP_CHIPS: Record<StepState, { label: string; tone: 'ok' | 'info' | 'bad' | 'neutral' }> = {
  pending: { label: 'pendiente', tone: 'neutral' },
  running: { label: 'en curso', tone: 'info' },
  done: { label: 'listo', tone: 'ok' },
  failed: { label: 'falló', tone: 'bad' },
  skipped: { label: 'omitido', tone: 'neutral' },
};

export function Ficha({
  opportunityId,
  onBack,
}: {
  opportunityId: string;
  onBack: () => void;
}): JSX.Element {
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [trace, setTrace] = useState<TraceResponse | null>(null);
  const [tab, setTab] = useState<TabName>('Resumen');
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [evidenceTarget, setEvidenceTarget] = useState<EvidenceTarget | null>(null);

  useEffect(() => {
    fetchOpportunities()
      .then((all) => {
        const match = all.find((entry) => entry.id === opportunityId) ?? null;
        setOpportunity(match);
        setRunId(match?.latestRun?.id ?? null);
      })
      .catch((reason: unknown) => setError(String(reason)));
  }, [opportunityId]);

  const refresh = useCallback(async (id: string): Promise<TraceResponse> => {
    const latest = await fetchTrace(id);
    setTrace(latest);
    return latest;
  }, []);

  useEffect(() => {
    if (runId === null) {
      return undefined;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async (): Promise<void> => {
      try {
        const latest = await refresh(runId);
        if (!cancelled && !TERMINAL_STATUSES.has(latest.status)) {
          timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
        }
      } catch (reason) {
        if (!cancelled) {
          setError(String(reason));
        }
      }
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    };
  }, [runId, refresh]);

  async function onRunLive(): Promise<void> {
    setStarting(true);
    setError(null);
    try {
      const run = await startWorkflow(opportunityId);
      setTrace(null);
      setRunId(run.id);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setStarting(false);
    }
  }

  if (opportunity === null) {
    if (error !== null) {
      return <p className="error">{error}</p>;
    }
    return <p>Cargando ficha…</p>;
  }
  const artifacts = readArtifacts(trace?.artifacts ?? []);
  const running = trace !== null && !TERMINAL_STATUSES.has(trace.status);
  const states = stepStates(trace);
  const modelCalls =
    trace?.agentRuns.reduce((sum, agentRun) => sum + agentRun.modelCalls.length, 0) ?? 0;
  const models = [
    ...new Set(
      trace?.agentRuns.flatMap((agentRun) =>
        agentRun.modelCalls.map((call) => call.modelReturned ?? call.modelRequested),
      ) ?? [],
    ),
  ];
  const openEvidence = (target: EvidenceTarget): void => setEvidenceTarget(target);

  let runButtonLabel = '▶ Correr análisis en vivo';
  if (trace !== null) {
    runButtonLabel = '↺ Re-correr análisis en vivo';
  }

  return (
    <div>
      <button className="link" onClick={onBack}>
        ← Oportunidades
      </button>
      <p className="kicker">{opportunity.code}</p>
      <h2>{opportunity.title}</h2>
      <p className="sub">
        {opportunity.entity} · {opportunity.modality ?? '—'}
      </p>

      <div className="meta-strip">
        <span>
          <b>Motor de esta corrida:</b>
        </span>
        {trace === null && <Chip tone="neutral">sin corrida</Chip>}
        {trace !== null && <StatusChip status={trace.status} />}
        {models.map((model) => (
          <Chip key={model}>{model}</Chip>
        ))}
        {trace !== null && (
          <span className="muted">
            {modelCalls} llamadas al modelo · {trace.costSummary.tokensIn.toLocaleString()} tokens
            entrada / {trace.costSummary.tokensOut.toLocaleString()} salida · costo estimado US${' '}
            {trace.costSummary.estimatedCostUsd.toFixed(COST_DECIMALS)}
            {trace.costSummary.rates.source === 'placeholder' && ' (tarifas de referencia)'}
          </span>
        )}
      </div>
      <div className="meta-strip">
        {running ? (
          <button className="btn" disabled>
            Analizando…
          </button>
        ) : (
          <button className="btn" onClick={() => void onRunLive()} disabled={starting}>
            {runButtonLabel}
          </button>
        )}
        <span className="muted">
          Corre los 6 agentes sobre el expediente real con Muse Spark; el veredicto y los precios
          pasan por reglas deterministas auditables.
        </span>
        {error !== null && <span className="error">{error}</span>}
      </div>

      {trace !== null && (running || trace.status !== 'completed') && (
        <section className="panel">
          <h3 className="panel-title">Progreso de la corrida</h3>
          <ul className="steps">
            {PIPELINE_STEPS.map((entry) => {
              const state = states.get(entry.step) ?? 'pending';
              const chip = STEP_CHIPS[state];
              return (
                <li key={entry.step}>
                  <Chip tone={chip.tone}>{chip.label}</Chip> {entry.label}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="stats">
        <Stat label="Referencial" value={`RD$ ${formatMoney(opportunity.amount)}`} />
        <Stat label="Cierre ofertas" value={opportunity.closeDateRd ?? '—'} />
        <Stat
          label="Veredicto"
          value={<VerdictChip verdict={artifacts.verdict?.verdict ?? null} />}
        />
        <Stat label="Expediente" value={`${opportunity.documentCount} documentos originales`} />
      </div>

      <nav className="tabs">
        {TABS.map((name) => {
          let className = 'tab';
          if (name === tab) {
            className = 'tab active';
          }
          return (
            <button key={name} className={className} onClick={() => setTab(name)}>
              {name}
            </button>
          );
        })}
      </nav>

      {trace === null && (
        <p className="muted">
          Esta oportunidad aún no tiene análisis. Corre el análisis en vivo para llenarla.
        </p>
      )}
      {trace !== null && tab === 'Resumen' && (
        <SummaryTab opportunity={opportunity} artifacts={artifacts} />
      )}
      {trace !== null && tab === 'Análisis' && <AnalysisTab artifacts={artifacts} />}
      {trace !== null && tab === 'Requisitos' && (
        <RequirementsTab artifacts={artifacts} onOpenEvidence={openEvidence} />
      )}
      {trace !== null && tab === 'Productos' && (
        <ProductsTab artifacts={artifacts} onOpenEvidence={openEvidence} />
      )}
      {trace !== null && tab === 'Costos' && (
        <CostsTab opportunity={opportunity} artifacts={artifacts} />
      )}
      {trace !== null && tab === 'Traza' && <TraceTab trace={trace} />}
      {trace !== null && tab === 'Formularios' && (
        <FormsTab runId={trace.id} artifacts={artifacts} opportunityId={opportunity.id} />
      )}
      {trace !== null && tab === 'Documentos' && (
        <DocumentsTab runId={trace.id} artifacts={artifacts} opportunityId={opportunity.id} />
      )}
      {evidenceTarget !== null && (
        <EvidenceModal target={evidenceTarget} onClose={() => setEvidenceTarget(null)} />
      )}
    </div>
  );
}
