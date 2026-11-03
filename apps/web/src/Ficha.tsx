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

// Tab label + URL slug (/opportunities/:code/:tab).
const TABS = [
  { label: 'Summary', slug: 'summary' },
  { label: 'Analysis', slug: 'analysis' },
  { label: 'Requirements', slug: 'requirements' },
  { label: 'Products', slug: 'products' },
  { label: 'Costs', slug: 'costs' },
  { label: 'Trace', slug: 'trace' },
  { label: 'Forms', slug: 'forms' },
  { label: 'Documents', slug: 'documents' },
] as const;
type TabSlug = (typeof TABS)[number]['slug'];
const DEFAULT_TAB: TabSlug = 'summary';

function tabFromParam(param: string | undefined): TabSlug {
  const match = TABS.find((entry) => entry.slug === param);
  return match?.slug ?? DEFAULT_TAB;
}

const MODE_LABELS: Record<RunMode, string> = {
  lite: 'fast mode',
  full: 'full mode',
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
  { step: 'load_context', label: 'Load tender file and company' },
  { step: 'guard.scan', label: 'Document guard (injection screen)' },
  { step: 'opportunity.evaluate', label: 'Opportunity agent' },
  { step: 'tender_analyst.extract', label: 'Tender analyst' },
  { step: 'consolidate', label: 'Consolidate requirements' },
  { step: 'visual.read', label: 'Visual reading (scanned pages)' },
  { step: 'compliance.evaluate', label: 'Compliance + verdict' },
  { step: 'pricing.research', label: 'Price research' },
  { step: 'writer.draft', label: 'Offer writer' },
  { step: 'reviewer.review', label: 'Offer reviewer' },
  { step: 'documents.generate', label: 'Forms and F.033' },
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
  pending: { label: 'pending', tone: 'neutral' },
  running: { label: 'running', tone: 'info' },
  done: { label: 'done', tone: 'ok' },
  failed: { label: 'failed', tone: 'bad' },
  skipped: { label: 'skipped', tone: 'neutral' },
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
          setError(`Opportunity ${code} does not exist.`);
        }
        setOpportunity(match);
        setRunId(match?.latestRun?.id ?? null);
      })
      .catch((reason: unknown) => setError(String(reason)));
  }, [code]);

  const goToTab = (slug: TabSlug): void => {
    void navigate(`/opportunities/${code}/${slug}`);
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
      `Reset the analysis of ${opportunity.code}? History is kept, only hidden.`,
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
    return <p>Loading…</p>;
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
    keyHint = 'Live analysis uses your own Meta API key; recorded runs don’t need it.';
  }
  let runButtonLabel = '▶ Run live analysis';
  if (trace !== null) {
    runButtonLabel = '↺ Re-run live analysis';
  }

  return (
    <div>
      <Link className="link" to="/opportunities">
        ← Opportunities
      </Link>
      <p className="kicker">{opportunity.code}</p>
      <h2>{opportunity.title}</h2>
      <p className="sub">
        {opportunity.entity} · {opportunity.modality ?? '—'}
      </p>

      <div className="meta-strip">
        <span>
          <b>Engine of this run:</b>
        </span>
        {trace === null && <Chip tone="neutral">no run</Chip>}
        {trace !== null && <StatusChip status={trace.status} />}
        {trace !== null && <Chip tone="neutral">{MODE_LABELS[modeOf(trace)]}</Chip>}
        {trace !== null && <Chip tone="info">⏱ {elapsedLabel(trace, now)}</Chip>}
        {models.map((model) => (
          <Chip key={model}>{model}</Chip>
        ))}
        {trace !== null && (
          <span className="muted">
            {modelCalls} model calls · {trace.costSummary.tokensIn.toLocaleString()} tokens in /{' '}
            {trace.costSummary.tokensOut.toLocaleString()} out · estimated cost US${' '}
            {trace.costSummary.estimatedCostUsd.toFixed(COST_DECIMALS)}
            {trace.costSummary.rates.source === 'placeholder' && ' (reference rates)'}
          </span>
        )}
      </div>
      <div className="meta-strip">
        {running ? (
          <button className="btn" disabled>
            Analyzing…
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
            Your Meta API key{' '}
            <input
              type="password"
              value={metaKey}
              placeholder="only for this tab"
              onChange={(event) => {
                setMetaKey(event.target.value);
                storeMetaKey(event.target.value);
              }}
            />
          </label>
        )}
        <label className="muted">
          Mode{' '}
          <select
            value={mode}
            onChange={(event) => setMode(event.target.value as RunMode)}
            disabled={running}
          >
            <option value="lite">Fast · key requirements (~2-3 min)</option>
            <option value="full">Full · entire pliego (10-20 min)</option>
          </select>
        </label>
        {trace !== null && !running && (
          <button className="btn btn-ghost" onClick={() => void onReset()}>
            Reset analysis
          </button>
        )}
        <span className="muted">
          6 agents on the real tender file with Muse Spark; verdict and prices pass auditable
          deterministic rules.
        </span>
        {error !== null && <span className="error">{error}</span>}
      </div>

      {trace !== null && (running || trace.status !== 'completed') && (
        <section className="panel">
          <h3 className="panel-title">Run progress</h3>
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
        <Stat label="Reference amount" value={`RD$ ${formatMoney(opportunity.amount)}`} />
        <Stat label="Bids close" value={formatRdLocal(opportunity.closeDateRd)} />
        <Stat
          label="Verdict"
          value={<VerdictChip verdict={artifacts.verdict?.verdict ?? null} />}
        />
        <Stat label="Tender file" value={`${opportunity.documentCount} original documents`} />
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
          This opportunity has no analysis yet. Run the live analysis to fill it.
        </p>
      )}
      {trace !== null && tab === 'summary' && (
        <SummaryTab opportunity={opportunity} artifacts={artifacts} />
      )}
      {trace !== null && tab === 'analysis' && <AnalysisTab artifacts={artifacts} />}
      {trace !== null && tab === 'requirements' && (
        <RequirementsTab artifacts={artifacts} onOpenEvidence={openEvidence} />
      )}
      {trace !== null && tab === 'products' && (
        <ProductsTab artifacts={artifacts} onOpenEvidence={openEvidence} />
      )}
      {trace !== null && tab === 'costs' && (
        <CostsTab opportunity={opportunity} artifacts={artifacts} />
      )}
      {trace !== null && tab === 'trace' && <TraceTab trace={trace} />}
      {trace !== null && tab === 'forms' && (
        <FormsTab runId={trace.id} artifacts={artifacts} opportunityId={opportunity.id} />
      )}
      {trace !== null && tab === 'documents' && (
        <DocumentsTab
          runId={trace.id}
          artifacts={artifacts}
          opportunityId={opportunity.id}
          metaKey={metaKey}
          onVoiceNote={() => refresh(trace.id)}
        />
      )}
      {evidenceTarget !== null && (
        <EvidenceModal target={evidenceTarget} onClose={() => setEvidenceTarget(null)} />
      )}
    </div>
  );
}
