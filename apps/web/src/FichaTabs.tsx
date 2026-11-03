import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { documentFileUrl, fetchDocuments, generatedFileUrl } from './api';
import type {
  DocumentGuardResult,
  ModelCall,
  Opportunity,
  RunArtifacts,
  TenderDocumentRow,
  TraceResponse,
} from './api';
import type { EvidenceTarget } from './EvidenceModal';
import { OfferTable } from './OfferTable';
import { VoicePending } from './VoicePending';
import {
  Chip,
  LabeledItem,
  MatchChip,
  RichText,
  Section,
  StatusChip,
  VerdictChip,
  formatDateTime,
  formatMoney,
  formatRdLocal,
} from './ui';
import type { Tone } from './ui';

const PERCENT_SCALE = 100;
const MILLISECONDS_PER_SECOND = 1000;
const COST_DECIMALS = 5;
const RUN_COST_DECIMALS = 4;

// ---- Resumen ----

const RECOMMENDATION_LABELS: Record<string, { label: string; tone: Tone }> = {
  go: { label: 'Preliminary: bid', tone: 'ok' },
  no_go: { label: 'Preliminary: don’t bid', tone: 'bad' },
  needs_review: { label: 'Preliminary: review', tone: 'warn' },
};

// A whole entry wrapped as "[PENDING: ...]" reads better without the wrapper
// inside the amber "Missing information" card.
function unwrapPending(text: string): string {
  const match = /^\[PENDING:\s*([\s\S]*)\]$/.exec(text.trim());
  return match?.[1] ?? text;
}

function FitCard({
  title,
  tone,
  items,
  empty,
  unwrap = false,
}: {
  title: string;
  tone: 'ok' | 'bad' | 'warn';
  items: string[];
  empty: string;
  unwrap?: boolean;
}): JSX.Element {
  return (
    <div className={`fit-card fit-${tone}`}>
      <h4>
        {title} <span className="muted">({items.length})</span>
      </h4>
      {items.length === 0 && <p className="muted">{empty}</p>}
      <ul>
        {items.map((item) => {
          let text = item;
          if (unwrap) {
            text = unwrapPending(item);
          }
          return (
            <li key={item}>
              <LabeledItem text={text} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function SummaryTab({
  opportunity,
  artifacts,
}: {
  opportunity: Opportunity;
  artifacts: RunArtifacts;
}): JSX.Element {
  const assessment = artifacts.assessment;
  const dated = artifacts.requirements.filter((requirement) => requirement.deadline !== undefined);
  let recommendation: { label: string; tone: Tone } | undefined;
  if (assessment !== null) {
    recommendation = RECOMMENDATION_LABELS[assessment.recommendation];
  }
  return (
    <div>
      <Section title="Preview">
        {assessment === null && <p className="muted">No opportunity assessment.</p>}
        {assessment !== null && (
          <div>
            <p className="chips-row">
              <MatchChip level={assessment.matchLevel} />
              {recommendation !== undefined && (
                <Chip tone={recommendation.tone}>{recommendation.label}</Chip>
              )}
              <VerdictChip verdict={artifacts.verdict?.verdict ?? null} />
              <span className="muted">
                The final verdict comes from Compliance after reading the pliego.
              </span>
            </p>
            <p className="lead">
              <RichText text={assessment.summary} />
            </p>
            <details>
              <summary>Why this fit?</summary>
              <p className="muted">
                <RichText text={assessment.justification} />
              </p>
            </details>
          </div>
        )}
      </Section>
      {assessment !== null && (
        <section className="panel">
          <h3 className="panel-title">Fit with the company</h3>
          <div className="fit-grid">
            <FitCard
              title="Relevant capabilities"
              tone="ok"
              items={assessment.relevantCapabilities}
              empty="None identified."
            />
            <FitCard
              title="Conflicts"
              tone="bad"
              items={assessment.incompatibilities}
              empty="None detected."
            />
            <FitCard
              title="Missing information"
              tone="warn"
              items={assessment.missingInformation}
              empty="Nothing pending."
              unwrap
            />
          </div>
        </section>
      )}
      <div className="grid2">
        <Section title={`Items (${artifacts.pricing.length})`}>
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th>Cant.</th>
              </tr>
            </thead>
            <tbody>
              {artifacts.pricing.map((item) => (
                <tr key={item.item}>
                  <td>{item.item}</td>
                  <td>{item.quantity ?? '[PENDING]'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
        <Section title="Schedule">
          <ul className="kv">
            <li>
              <b>Bids close:</b> {formatRdLocal(opportunity.closeDateRd)}
            </li>
            {dated.map((requirement) => (
              <li key={requirement.id}>
                <b>{formatRdLocal(requirement.deadline)}:</b> {requirement.title} (pliego p
                {requirement.source.page})
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}

// ---- Análisis ----

export function AnalysisTab({ artifacts }: { artifacts: RunArtifacts }): JSX.Element {
  const verdict = artifacts.verdict;
  const financials = artifacts.financials;
  if (verdict === null) {
    return <p className="muted">The verdict appears when the compliance agent finishes.</p>;
  }
  const blockers = artifacts.findings.filter((finding) => finding.status === 'not_met');
  return (
    <div>
      <Section title="Verdict">
        <p>
          <VerdictChip verdict={verdict.verdict} />
        </p>
        <p>{verdict.rationale}</p>
        <p className="muted">
          {verdict.counts.met} met · {verdict.counts.not_met} not met · {verdict.counts.unknown} to
          verify · {verdict.counts.not_applicable} not applicable (total {verdict.counts.total})
        </p>
      </Section>
      <Section title={`Conditions (${verdict.conditions.length})`}>
        <ul className="checks">
          {verdict.conditions.map((condition) => (
            <li key={`${condition.requirementId}-${condition.description}`}>
              <span className="box">☐</span> {condition.description}{' '}
              <span className="muted">
                · owner {condition.owner} · before {formatRdLocal(condition.deadline)}
              </span>
            </li>
          ))}
          {verdict.conditions.length === 0 && <li className="muted">No open conditions.</li>}
        </ul>
      </Section>
      {blockers.length > 0 && (
        <Section title="Requirements not met">
          <ul>
            {blockers.map((finding) => (
              <li key={finding.requirementId}>
                <b>{finding.requirementId}</b>{' '}
                {Boolean(finding.blocker) && finding.blockerBasis !== 'disputed' && (
                  <Chip tone="bad">blocker</Chip>
                )}
                {finding.blockerBasis === 'disputed' && <Chip tone="warn">disputed blocker</Chip>}{' '}
                {finding.reason}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {financials !== null && (
        <Section title="Financial capacity (computed from the profile)">
          <ul className="kv">
            <li>
              <b>Solvency:</b> {financials.solvency ?? '—'} · <b>Liquidity:</b>{' '}
              {financials.liquidity ?? '—'} · <b>Debt ratio:</b> {financials.debt ?? '—'}
            </li>
            {financials.concentrationRatio !== null && (
              <li>
                <b>Contract vs annual revenue:</b>{' '}
                {Math.round(financials.concentrationRatio * PERCENT_SCALE)}% of RD${' '}
                {formatMoney(financials.annualRevenueDop)}
              </li>
            )}
          </ul>
        </Section>
      )}
      <Section title="Document safety">
        {artifacts.guard === null && (
          <p className="muted">The document guard did not run in this analysis.</p>
        )}
        {artifacts.guard !== null && (
          <div>
            <p>
              {artifacts.guard.flagged.length === 0 && (
                <Chip tone="ok">no embedded instructions</Chip>
              )}
              {artifacts.guard.flagged.length > 0 && (
                <Chip tone="bad">{artifacts.guard.flagged.length} fragmento(s) sospechosos</Chip>
              )}{' '}
              <span className="muted">
                <GuardSummary guard={artifacts.guard} /> Documents are always treated as data, never
                as instructions.
              </span>
            </p>
            <ul className="checks">
              {artifacts.guard.flagged.map((finding) => (
                <li key={`${finding.fileName}-${finding.page}-${finding.score}`}>
                  <Chip tone="bad">{Math.round(finding.score * PERCENT_SCALE)}%</Chip>{' '}
                  <b>
                    {finding.fileName} p{finding.page}
                  </b>{' '}
                  {finding.reason !== undefined && finding.reason !== null && (
                    <span>{finding.reason} </span>
                  )}
                  <span className="muted">“{finding.excerpt}…”</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>
      {artifacts.contradictions.length > 0 && (
        <Section title="Contradictions detected in the tender file">
          <ul>
            {artifacts.contradictions.map((contradiction) => (
              <li key={contradiction}>{contradiction}</li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

// How the guard reached its result: Muse Spark judges only what the
// deterministic screen escalated; Prompt Guard 2 scores every fragment.
function GuardSummary({ guard }: { guard: DocumentGuardResult }): JSX.Element {
  if (guard.backend === 'muse_spark') {
    return (
      <>
        {guard.scannedChunks} pliego and amendment fragments screened; {guard.escalatedChunks ?? 0}{' '}
        with AI-directed language judged by <code>{guard.model}</code> (umbral {guard.threshold}).
      </>
    );
  }
  return (
    <>
      {guard.scannedChunks} pliego and amendment fragments checked with <code>{guard.model}</code>{' '}
      (umbral {guard.threshold}).
    </>
  );
}

// ---- Requisitos ----

const CATEGORY_LABELS: Record<string, string> = {
  administrative: 'administrative',
  legal: 'legal',
  technical: 'technical',
  economic: 'economic',
};

export function RequirementsTab({
  artifacts,
  onOpenEvidence,
}: {
  artifacts: RunArtifacts;
  onOpenEvidence: (target: EvidenceTarget) => void;
}): JSX.Element {
  const findingById = new Map(
    artifacts.findings.map((finding) => [finding.requirementId, finding]),
  );
  return (
    <>
      {artifacts.failedWindows.length > 0 && (
        <p className="banner">
          Pages not read by the analyst (the model returned no valid result after reintentar):{' '}
          {artifacts.failedWindows
            .map((window) => `${window.fileName} pp. ${window.startPage}–${window.endPage}`)
            .join('; ')}
          . Review them by hand: no requirements listed there does not mean there are none.
        </p>
      )}
      <Section
        title={`${artifacts.requirements.length} requirements extracted from the pliego and amendments`}
      >
        <table>
          <thead>
            <tr>
              <th>Requirement</th>
              <th>Tipo</th>
              <th>Status</th>
              <th>Source</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {artifacts.requirements.map((requirement) => {
              const finding = findingById.get(requirement.id);
              const artifactId = artifacts.requirementsArtifactId;
              return (
                <tr key={requirement.id}>
                  <td>
                    {requirement.title}{' '}
                    {requirement.mandatory && <Chip tone="neutral">obligatorio</Chip>}
                  </td>
                  <td>{CATEGORY_LABELS[requirement.category] ?? requirement.category}</td>
                  <td>
                    {finding !== undefined ? (
                      <StatusChip status={finding.status} />
                    ) : (
                      <Chip tone="neutral">not assessed</Chip>
                    )}
                  </td>
                  <td>
                    {artifactId !== null && (
                      <button
                        className="link"
                        onClick={() =>
                          onOpenEvidence({
                            kind: 'requirement',
                            artifactId,
                            evidenceId: requirement.source.evidenceId,
                            title: requirement.title,
                            originalText: requirement.originalText,
                          })
                        }
                      >
                        pliego p{requirement.source.page}
                      </button>
                    )}
                  </td>
                  <td className="muted">
                    {finding?.reason ?? requirement.plainExplanation}
                    {finding !== undefined && finding.companyEvidenceIds.length > 0 && (
                      <div>
                        <code>{finding.companyEvidenceIds.join(', ')}</code>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>
    </>
  );
}

// ---- Productos ----

export function ProductsTab({
  artifacts,
  onOpenEvidence,
}: {
  artifacts: RunArtifacts;
  onOpenEvidence: (target: EvidenceTarget) => void;
}): JSX.Element {
  return (
    <div>
      <Section title="Pliego items × supplier quotations (Company Brain)">
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Specification</th>
              <th>Status</th>
              <th>Source</th>
              <th>Notas</th>
            </tr>
          </thead>
          <tbody>
            {artifacts.pricing.map((item) => (
              <tr key={item.item}>
                <td>{item.item}</td>
                <td className="muted">{item.specification}</td>
                <td>
                  <StatusChip status={item.status} />
                </td>
                <td>
                  {item.sourceDocCode !== null && item.sourceDocCode !== undefined && (
                    <code>{item.sourceDocCode}</code>
                  )}
                  {item.validUntil !== null && item.validUntil !== undefined && (
                    <div className="muted">valid until {formatRdLocal(item.validUntil)}</div>
                  )}
                </td>
                <td className="muted">{item.assumptions.join(' · ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted">
          Only prices printed in Company Brain quotations are used; every price is checked against
          the quotation text and its validity. Everything else stays [PENDING].
        </p>
      </Section>
      <Section title={`Visual reading: SAM 3.1 + Muse Spark (${artifacts.visual.length})`}>
        <p className="muted">
          SAM 3.1 locates official marks (signatures, initials, logos) and Muse Spark reads the
          scanned page. Open a page to see the regions over the original.
        </p>
        {artifacts.samGap !== null && (
          <p className="banner">
            SAM 3.1 did not answer in this run; the page was read whole by Muse Spark and is cited
            by page number. Detail: {artifacts.samGap}
          </p>
        )}
        <ul className="checks">
          {artifacts.visual.map((item) => (
            <li key={item.evidenceId}>
              <button className="link" onClick={() => onOpenEvidence({ kind: 'visual', item })}>
                {item.fileName} · p{item.page}
              </button>{' '}
              {item.regions.length > 0 && (
                <Chip tone="info">SAM: {item.regions.length} region(s)</Chip>
              )}{' '}
              {item.requiresHumanReview && <Chip tone="warn">human review</Chip>}{' '}
              <span className="muted">{item.reading?.summary ?? item.note}</span>
            </li>
          ))}
          {artifacts.visual.length === 0 && (
            <li className="muted">This run did not review scanned pages.</li>
          )}
        </ul>
      </Section>
    </div>
  );
}

// ---- Costos ----

export function CostsTab({
  opportunity,
  artifacts,
}: {
  opportunity: Opportunity;
  artifacts: RunArtifacts;
}): JSX.Element {
  const totals = artifacts.pricingTotals;
  return (
    <div className="grid2">
      <Section title="Cost sheet (RD$, valid quotations)">
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Cant.</th>
              <th>Unit cost</th>
              <th>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {artifacts.pricing.map((item) => {
              const priced = item.status === 'ok' && item.unitPrice !== null;
              let subtotal = '[PENDING]';
              if (priced && item.quantity !== null && item.unitPrice !== null) {
                subtotal = formatMoney(item.quantity * item.unitPrice);
              }
              let unitCost = '[PENDING]';
              if (priced) {
                unitCost = formatMoney(item.unitPrice);
              }
              return (
                <tr key={item.item}>
                  <td>{item.item}</td>
                  <td>{item.quantity ?? '—'}</td>
                  <td className="num">{unitCost}</td>
                  <td className="num">{subtotal}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>
      <Section title="Offer (RD$)">
        <ul className="kv">
          <li>
            <b>Pliego reference amount:</b> {formatMoney(opportunity.amount)}
          </li>
          <li>
            <b>Quoted cost (priced items):</b> {formatMoney(totals?.quotedSubtotalDop ?? null)}
          </li>
          <li>
            <b>Items without a reliable price:</b> {totals?.pendingItems ?? 0}
          </li>
          <li>
            <b>Offer price:</b> [PENDING: margin and final price are decided by the company]
          </li>
        </ul>
        <p className="muted">
          Postor never invents prices or margins: cost comes from valid quotations and a person sets
          the final price in the F.033.
        </p>
      </Section>
    </div>
  );
}

// ---- Traza ----

function seconds(milliseconds: number | null): string {
  if (milliseconds === null) {
    return '—';
  }
  return `${(milliseconds / MILLISECONDS_PER_SECOND).toFixed(1)} s`;
}

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 1);
}

function CallDetails({ call, index }: { call: ModelCall; index: number }): JSX.Element {
  return (
    <div>
      <span className="muted">
        call {index + 1} · <code>{call.modelReturned ?? call.modelRequested}</code> · prompt{' '}
        <code>{call.promptVersion ?? '—'}</code> · {call.tokensIn ?? 0} → {call.tokensOut ?? 0}{' '}
        tokens · {seconds(call.durationMs)} · US${' '}
        {(call.estimatedCostUsd ?? 0).toFixed(COST_DECIMALS)} (estimate)
      </span>
      <details>
        <summary>inputs (prompt sent)</summary>
        <pre>{call.promptSystem}</pre>
        <pre>{call.promptTask}</pre>
      </details>
      <details>
        <summary>response received</summary>
        <pre>{prettyJson(call.responseNorm ?? call.responseRaw)}</pre>
      </details>
    </div>
  );
}

// Model family for the color legend shared with "How it works".
function modelFamily(model: string): string {
  const lower = model.toLowerCase();
  if (lower.includes('wonder')) {
    return 'wonder';
  }
  if (lower.includes('sam')) {
    return 'sam';
  }
  if (lower.includes('prompt-guard')) {
    return 'guard';
  }
  if (lower.includes('voice')) {
    return 'voice';
  }
  return 'spark';
}

function modelUsage(trace: TraceResponse): { model: string; family: string; calls: number }[] {
  const counts = new Map<string, number>();
  for (const agentRun of trace.agentRuns) {
    for (const call of agentRun.modelCalls) {
      const model = call.modelReturned ?? call.modelRequested;
      counts.set(model, (counts.get(model) ?? 0) + 1);
    }
  }
  return [...counts.entries()].map(([model, calls]) => ({
    model,
    family: modelFamily(model),
    calls,
  }));
}

// AgentRun rows say "ok"; the shared chip vocabulary says "completed".
function agentRunStatus(status: string): string {
  if (status === 'ok') {
    return 'completed';
  }
  return status;
}

export function TraceTab({ trace }: { trace: TraceResponse }): JSX.Element {
  const summary = trace.costSummary;
  return (
    <div>
      <Section title="Run summary">
        <p>
          <StatusChip status={trace.status} /> started {formatDateTime(trace.startedAt)} · finished{' '}
          {formatDateTime(trace.finishedAt)}
        </p>
        <p className="muted">
          {summary.tokensIn.toLocaleString()} tokens in · {summary.tokensOut.toLocaleString()} out ·
          model time {seconds(summary.modelDurationMs)} · estimated cost US${' '}
          {summary.estimatedCostUsd.toFixed(RUN_COST_DECIMALS)} (tokens × rates{' '}
          {summary.rates.inputUsdPerMillionTokens}/{summary.rates.outputUsdPerMillionTokens} US$ per
          million
          {summary.rates.source === 'placeholder' && ', reference rates — configure them in .env'})
        </p>
      </Section>
      <Section title="Models that acted in this run">
        <div className="lane-tags">
          {modelUsage(trace).map((usage) => (
            <span key={usage.model} className={`model-tag model-${usage.family}`}>
              {usage.model} · {usage.calls} llamada(s)
            </span>
          ))}
        </div>
      </Section>
      <Section title="Pipeline steps (agent, time, model)">
        <ol className="trace">
          {trace.agentRuns.map((agentRun) => {
            let duration: number | null = null;
            if (agentRun.finishedAt !== null) {
              duration =
                new Date(agentRun.finishedAt).getTime() - new Date(agentRun.startedAt).getTime();
            }
            return (
              <li key={agentRun.id}>
                <b>{agentRun.agent}</b> <StatusChip status={agentRunStatus(agentRun.status)} />{' '}
                <span className="muted">
                  · {formatDateTime(agentRun.startedAt)} · {seconds(duration)} ·{' '}
                  {agentRun.modelCalls.length} calls
                </span>
                {agentRun.error !== null && <p className="error">{agentRun.error}</p>}
                {agentRun.modelCalls.map((call, index) => (
                  <CallDetails key={call.id} call={call} index={index} />
                ))}
              </li>
            );
          })}
        </ol>
      </Section>
      <Section title={`Events (${trace.events.length})`}>
        <details>
          <summary>see workflow.* events</summary>
          <pre>
            {trace.events
              .map(
                (event) =>
                  `${event.createdAt}  ${event.type}  ${event.agent ?? ''}  ${JSON.stringify(event.metadata)}`,
              )
              .join('\n')}
          </pre>
        </details>
      </Section>
    </div>
  );
}

// ---- Validación humana (Formularios + Documentos) ----

interface Validation {
  f033: boolean;
  draft: boolean;
}

const EMPTY_VALIDATION: Validation = { f033: false, draft: false };

// Human sign-off per run, kept in the browser: it gates downloads in this
// UI only. Postor never submits, signs or sends anything.
function useValidation(runId: string): [Validation, (next: Validation) => void] {
  const key = `postor-validation-${runId}`;
  const [validation, setValidation] = useState<Validation>(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored === null) {
        return EMPTY_VALIDATION;
      }
      return { ...EMPTY_VALIDATION, ...(JSON.parse(stored) as Partial<Validation>) };
    } catch {
      return EMPTY_VALIDATION;
    }
  });
  const update = (next: Validation): void => {
    setValidation(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Storage may be unavailable (private mode): the gate still works in memory.
    }
  };
  return [validation, update];
}

export function FormsTab({
  runId,
  artifacts,
}: {
  runId: string;
  artifacts: RunArtifacts;
  opportunityId: string;
}): JSX.Element {
  const [validation, setValidation] = useValidation(runId);
  const review = artifacts.review;
  return (
    <div>
      {artifacts.offer !== null && <OfferTable offer={artifacts.offer} />}
      {artifacts.offer === null && (
        <Section title={`SNCC.F.033 — Economic offer (${artifacts.pricing.length} lines)`}>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Description</th>
                <th>Unit</th>
                <th>Cant.</th>
                <th>Unit price</th>
                <th>ITBIS</th>
                <th>Final</th>
              </tr>
            </thead>
            <tbody>
              {artifacts.pricing.map((item, index) => (
                <tr key={item.item}>
                  <td>{index + 1}</td>
                  <td>{item.item}</td>
                  <td>{item.unit ?? '[PENDING]'}</td>
                  <td>{item.quantity ?? '[PENDING]'}</td>
                  <td className="muted">
                    [PENDING: offer price]
                    {item.status === 'ok' &&
                      item.unitPrice !== null &&
                      ` ref. cost RD$ ${formatMoney(item.unitPrice)}`}
                  </td>
                  <td className="muted">[PENDING]</td>
                  <td className="muted">[PENDING]</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}
      {review !== null && (
        <Section title="Automatic draft review">
          <p>
            <StatusChip status={review.verdict} />{' '}
            <span className="muted">
              {artifacts.reviewRounds.length} round(s) · {review.covered.length} requirements
              covered · {review.omitted.length} omitted
            </span>
          </p>
          {artifacts.reviewRounds.length > 1 && (
            <p className="muted">
              First review: {artifacts.reviewRounds[0]?.review.verdict} with{' '}
              {artifacts.reviewRounds[0]?.review.omitted.length ?? 0} omissions and{' '}
              {artifacts.reviewRounds[0]?.review.unsupportedClaims.length ?? 0} unsupported claims →
              the writer corrected once.
            </p>
          )}
          <ul className="checks">
            {review.unsupportedClaims.map((claim) => (
              <li key={claim.claim}>
                <Chip tone="bad">unsupported</Chip> {claim.claim}{' '}
                <span className="muted">— {claim.reason}</span>
              </li>
            ))}
            {review.contradictions.map((contradiction) => (
              <li key={contradiction}>
                <Chip tone="warn">contradiction</Chip> {contradiction}
              </li>
            ))}
            {review.recommendedFixes.map((fix) => (
              <li key={fix}>
                <Chip tone="neutral">fix</Chip> {fix}
              </li>
            ))}
          </ul>
        </Section>
      )}
      <Section title="Human validation (unlocks downloads)">
        <label className="check">
          <input
            type="checkbox"
            checked={validation.f033}
            onChange={(event) => setValidation({ ...validation, f033: event.target.checked })}
          />
          I reviewed the F.033 and will set the offer prices myself
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={validation.draft}
            onChange={(event) => setValidation({ ...validation, draft: event.target.checked })}
          />
          I reviewed the draft and the [PENDING] items before signing and stamping
        </label>
        {validation.f033 && validation.draft ? (
          <p>
            <Chip tone="ok">Validated — downloads enabled</Chip>
          </p>
        ) : (
          <p className="muted">No download without human validation.</p>
        )}
      </Section>
    </div>
  );
}

const FILE_KIND_LABELS: Record<string, string> = {
  tender_form: 'tender form, filled',
  form: 'SNCC template',
  f033: 'priced F.033',
  draft: 'technical offer',
};

export function DocumentsTab({
  runId,
  artifacts,
  opportunityId,
  metaKey,
  onVoiceNote,
}: {
  runId: string;
  artifacts: RunArtifacts;
  opportunityId: string;
  metaKey: string;
  onVoiceNote: () => Promise<unknown>;
}): JSX.Element {
  const [validation] = useValidation(runId);
  const [originals, setOriginals] = useState<TenderDocumentRow[]>([]);
  useEffect(() => {
    fetchDocuments(opportunityId)
      .then(setOriginals)
      .catch(() => setOriginals([]));
  }, [opportunityId]);
  const unlocked = validation.f033 && validation.draft;
  return (
    <div>
      <Section title={`Generated offer draft (${artifacts.files.length} editable files)`}>
        <ul className="files">
          {artifacts.files.map((file) => (
            <li key={file.fileName}>
              {unlocked ? (
                <a href={generatedFileUrl(runId, file.fileName)}>{file.fileName}</a>
              ) : (
                <span>{file.fileName}</span>
              )}{' '}
              <span className="muted">
                · {FILE_KIND_LABELS[file.kind] ?? file.kind} · {file.pendingMarkers} [PENDING] ·
                from: {file.source}
              </span>
            </li>
          ))}
        </ul>
        {!unlocked && <p className="muted">Downloads locked: validate in the Forms tab.</p>}
        <p className="banner">
          Postor never submits, signs or sends anything. The company reviews, completes the
          [PENDING] items, signs, stamps and submits on its own through the procurement portal.
        </p>
      </Section>
      <VoicePending runId={runId} artifacts={artifacts} metaKey={metaKey} onAdded={onVoiceNote} />
      <Section title={`Original tender file (${originals.length} documents, unmodified)`}>
        <ul className="files">
          {originals.map((document) => (
            <li key={document.id}>
              <a href={documentFileUrl(document.id, null)} target="_blank" rel="noreferrer">
                {document.fileName}
              </a>{' '}
              <span className="muted">· {document.pageCount} pages</span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
