import { useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';
import {
  fetchOpportunities,
  fetchTrace,
  readArtifacts,
  readStoredMetaKey,
  resetDemo,
  startWorkflow,
  storeMetaKey,
} from './api';
import type { Opportunity, RunMode, TraceResponse } from './api';
import { Link, useNavigate, useParams } from 'react-router';
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
import { Chip, Stat, StatusChip, VerdictChip, formatMoney, formatRdLocal } from './ui';

// Tab label + URL slug (/oportunidades/:code/:tab).
const TABS = [
  { label: 'Resumen', slug: 'resumen' },
  { label: 'Análisis', slug: 'analisis' },
  { label: 'Requisitos', slug: 'requisitos' },
  { label: 'Productos', slug: 'productos' },
  { label: 'Costos', slug: 'costos' },
  { label: 'Traza', slug: 'traza' },
  { label: 'Formularios', slug: 'formularios' },
  { label: 'Documentos', slug: 'documentos' },
] as const;
type TabSlug = (typeof TABS)[number]['slug'];
const DEFAULT_TAB: TabSlug = 'resumen';

function tabFromParam(param: string | undefined): TabSlug {
  const match = TABS.find((entry) => entry.slug === param);
  return match?.slug ?? DEFAULT_TAB;
}

const MODE_LABELS: Record<RunMode, string> = {
  lite: 'modo rápido',
  full: 'modo completo',
};
const SECONDS_PER_MINUTE = 60;
const MILLISECONDS_PER_SECOND = 1000;
const SECOND_DIGITS = 2;

// "2:41" elapsed for the live demo clock (until finished, then final).
function elapsedLabel(trace: TraceResponse, now: number): string {
  let end = now;
  if (trace.finishedAt !== null) {
    end = new Date(trace.finishedAt).getTime();
  }
  const totalSeconds = Math.max(
    0,
    Math.round((end - new Date(trace.startedAt).getTime()) / MILLISECONDS_PER_SECOND),
  );
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  const seconds = String(totalSeconds % SECONDS_PER_MINUTE).padStart(SECOND_DIGITS, '0');
  return `${minutes}:${seconds}`;
}

function modeOf(trace: TraceResponse): RunMode {
  const created = trace.events.find((event) => event.type === 'workflow.created');
  const mode = created?.metadata?.mode;
  if (mode === 'lite') {
    return 'lite';
  }
  return 'full';
}

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
  { step: 'guard.scan', label: 'Guardia de documentos (Muse Spark)' },
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

export function Ficha({ userKeyRequired }: { userKeyRequired: boolean }): JSX.Element {
  const params = useParams();
  const navigate = useNavigate();
  const code = params.code ?? '';
  const tab = tabFromParam(params.tab);
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [trace, setTrace] = useState<TraceResponse | null>(null);
  const [mode, setMode] = useState<RunMode>('lite');
  const [metaKey, setMetaKey] = useState(() => readStoredMetaKey());
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [evidenceTarget, setEvidenceTarget] = useState<EvidenceTarget | null>(null);

  useEffect(() => {
    fetchOpportunities()
      .then((all) => {
        const match = all.find((entry) => entry.code === code) ?? null;
        if (match === null) {
          setError(`No existe la oportunidad ${code}.`);
        }
        setOpportunity(match);
        setRunId(match?.latestRun?.id ?? null);
      })
      .catch((reason: unknown) => setError(String(reason)));
  }, [code]);

  const goToTab = (slug: TabSlug): void => {
    void navigate(`/oportunidades/${code}/${slug}`);
  };

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
        setNow(Date.now());
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
      if (opportunity === null) {
        return;
      }
      const run = await startWorkflow(opportunity.id, mode, metaKey.trim());
      setTrace(null);
      setRunId(run.id);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setStarting(false);
    }
  }

  // Hides this tender's previous analyses so it can be shown from zero.
  async function onReset(): Promise<void> {
    if (opportunity === null) {
      return;
    }
    const confirmed = window.confirm(
      `¿Reiniciar el análisis de ${opportunity.code}? El historial se conserva, solo se oculta.`,
    );
    if (!confirmed) {
      return;
    }
    try {
      await resetDemo(opportunity.id);
      setTrace(null);
      setRunId(null);
    } catch (reason) {
      setError(String(reason));
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

  let keyHint: string | undefined;
  if (userKeyRequired && metaKey.trim().length === 0) {
    keyHint =
      'El análisis en vivo usa tu propia Meta API key; las corridas grabadas no la necesitan.';
  }
  let runButtonLabel = '▶ Correr análisis en vivo';
  if (trace !== null) {
    runButtonLabel = '↺ Re-correr análisis en vivo';
  }

  return (
    <div>
      <Link className="link" to="/oportunidades">
        ← Oportunidades
      </Link>
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
        {trace !== null && <Chip tone="neutral">{MODE_LABELS[modeOf(trace)]}</Chip>}
        {trace !== null && <Chip tone="info">⏱ {elapsedLabel(trace, now)}</Chip>}
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
          <button
            className="btn"
            onClick={() => void onRunLive()}
            disabled={starting || (userKeyRequired && metaKey.trim().length === 0)}
            title={keyHint}
          >
            {runButtonLabel}
          </button>
        )}
        {userKeyRequired && (
          <label className="muted">
            Tu Meta API key{' '}
            <input
              type="password"
              value={metaKey}
              placeholder="solo para esta pestaña"
              onChange={(event) => {
                setMetaKey(event.target.value);
                storeMetaKey(event.target.value);
              }}
            />
          </label>
        )}
        <label className="muted">
          Modo{' '}
          <select
            value={mode}
            onChange={(event) => setMode(event.target.value as RunMode)}
            disabled={running}
          >
            <option value="lite">Rápido · requisitos clave (~2-3 min)</option>
            <option value="full">Completo · pliego entero (10-20 min)</option>
          </select>
        </label>
        {trace !== null && !running && (
          <button className="btn btn-ghost" onClick={() => void onReset()}>
            Reiniciar análisis
          </button>
        )}
        <span className="muted">
          6 agentes sobre el expediente real con Muse Spark; veredicto y precios pasan por reglas
          deterministas auditables.
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
        <Stat label="Cierre ofertas" value={formatRdLocal(opportunity.closeDateRd)} />
        <Stat
          label="Veredicto"
          value={<VerdictChip verdict={artifacts.verdict?.verdict ?? null} />}
        />
        <Stat label="Expediente" value={`${opportunity.documentCount} documentos originales`} />
      </div>

      <nav className="tabs">
        {TABS.map((entry) => {
          let className = 'tab';
          if (entry.slug === tab) {
            className = 'tab active';
          }
          return (
            <button key={entry.slug} className={className} onClick={() => goToTab(entry.slug)}>
              {entry.label}
            </button>
          );
        })}
      </nav>

      {trace === null && (
        <p className="muted">
          Esta oportunidad aún no tiene análisis. Corre el análisis en vivo para llenarla.
        </p>
      )}
      {trace !== null && tab === 'resumen' && (
        <SummaryTab opportunity={opportunity} artifacts={artifacts} />
      )}
      {trace !== null && tab === 'analisis' && <AnalysisTab artifacts={artifacts} />}
      {trace !== null && tab === 'requisitos' && (
        <RequirementsTab artifacts={artifacts} onOpenEvidence={openEvidence} />
      )}
      {trace !== null && tab === 'productos' && (
        <ProductsTab artifacts={artifacts} onOpenEvidence={openEvidence} />
      )}
      {trace !== null && tab === 'costos' && (
        <CostsTab opportunity={opportunity} artifacts={artifacts} />
      )}
      {trace !== null && tab === 'traza' && <TraceTab trace={trace} />}
      {trace !== null && tab === 'formularios' && (
        <FormsTab runId={trace.id} artifacts={artifacts} opportunityId={opportunity.id} />
      )}
      {trace !== null && tab === 'documentos' && (
        <DocumentsTab runId={trace.id} artifacts={artifacts} opportunityId={opportunity.id} />
      )}
      {evidenceTarget !== null && (
        <EvidenceModal target={evidenceTarget} onClose={() => setEvidenceTarget(null)} />
      )}
    </div>
  );
}
