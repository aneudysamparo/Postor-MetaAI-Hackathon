import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { documentFileUrl, fetchDocuments, generatedFileUrl } from './api';
import type { ModelCall, Opportunity, RunArtifacts, TenderDocumentRow, TraceResponse } from './api';
import type { EvidenceTarget } from './EvidenceModal';
import { Chip, Section, StatusChip, VerdictChip, formatDateTime, formatMoney } from './ui';

const PERCENT_SCALE = 100;
const MILLISECONDS_PER_SECOND = 1000;
const COST_DECIMALS = 5;
const RUN_COST_DECIMALS = 4;

// ---- Resumen ----

export function SummaryTab({
  opportunity,
  artifacts,
}: {
  opportunity: Opportunity;
  artifacts: RunArtifacts;
}): JSX.Element {
  const assessment = artifacts.assessment;
  const dated = artifacts.requirements.filter((requirement) => requirement.deadline !== undefined);
  return (
    <div className="grid2">
      <Section title="Vista previa">
        <p>{assessment?.summary ?? 'Sin evaluación de oportunidad.'}</p>
        {assessment !== null && <p className="muted">{assessment.justification}</p>}
      </Section>
      <Section title={`Ítems (${artifacts.pricing.length})`}>
        <table>
          <thead>
            <tr>
              <th>Descripción</th>
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
      <Section title="Ajuste con la empresa">
        {assessment !== null && (
          <ul className="kv">
            <li>
              <b>Capacidades relevantes:</b> {assessment.relevantCapabilities.join('; ') || '—'}
            </li>
            <li>
              <b>Incompatibilidades:</b>{' '}
              {assessment.incompatibilities.join('; ') || 'ninguna detectada'}
            </li>
            <li>
              <b>Falta información:</b> {assessment.missingInformation.join('; ') || '—'}
            </li>
          </ul>
        )}
      </Section>
      <Section title="Cronograma">
        <ul className="kv">
          <li>
            <b>Cierre de ofertas:</b> {opportunity.closeDateRd ?? '—'}
          </li>
          {dated.map((requirement) => (
            <li key={requirement.id}>
              <b>{requirement.deadline}:</b> {requirement.title} (pliego p{requirement.source.page})
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

// ---- Análisis ----

export function AnalysisTab({ artifacts }: { artifacts: RunArtifacts }): JSX.Element {
  const verdict = artifacts.verdict;
  const financials = artifacts.financials;
  if (verdict === null) {
    return <p className="muted">El veredicto aparece cuando termina el agente de cumplimiento.</p>;
  }
  const blockers = artifacts.findings.filter((finding) => finding.status === 'not_met');
  return (
    <div>
      <Section title="Veredicto">
        <p>
          <VerdictChip verdict={verdict.verdict} />
        </p>
        <p>{verdict.rationale}</p>
        <p className="muted">
          {verdict.counts.met} cumple · {verdict.counts.not_met} no cumple ·{' '}
          {verdict.counts.unknown} por verificar · {verdict.counts.not_applicable} no aplica (total{' '}
          {verdict.counts.total})
        </p>
      </Section>
      <Section title={`Condiciones (${verdict.conditions.length})`}>
        <ul className="checks">
          {verdict.conditions.map((condition) => (
            <li key={`${condition.requirementId}-${condition.description}`}>
              <span className="box">☐</span> {condition.description}{' '}
              <span className="muted">
                · responsable {condition.owner} · antes de {condition.deadline}
              </span>
            </li>
          ))}
          {verdict.conditions.length === 0 && <li className="muted">Sin condiciones abiertas.</li>}
        </ul>
      </Section>
      {blockers.length > 0 && (
        <Section title="Requisitos no cumplidos">
          <ul>
            {blockers.map((finding) => (
              <li key={finding.requirementId}>
                <b>{finding.requirementId}</b>{' '}
                {Boolean(finding.blocker) && <Chip tone="bad">bloqueante</Chip>} {finding.reason}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {financials !== null && (
        <Section title="Capacidad financiera (calculada del perfil)">
          <ul className="kv">
            <li>
              <b>Solvencia:</b> {financials.solvency ?? '—'} · <b>Liquidez:</b>{' '}
              {financials.liquidity ?? '—'} · <b>Endeudamiento:</b> {financials.debt ?? '—'}
            </li>
            {financials.concentrationRatio !== null && (
              <li>
                <b>Contrato vs facturación anual:</b>{' '}
                {Math.round(financials.concentrationRatio * PERCENT_SCALE)}% de RD${' '}
                {formatMoney(financials.annualRevenueDop)}
              </li>
            )}
          </ul>
        </Section>
      )}
      {artifacts.contradictions.length > 0 && (
        <Section title="Contradicciones detectadas en el expediente">
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

// ---- Requisitos ----

const CATEGORY_LABELS: Record<string, string> = {
  administrative: 'administrativo',
  legal: 'legal',
  technical: 'técnico',
  economic: 'económico',
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
          Páginas no leídas por el analista (el modelo no devolvió un resultado válido tras
          reintentar):{' '}
          {artifacts.failedWindows
            .map((window) => `${window.fileName} pp. ${window.startPage}–${window.endPage}`)
            .join('; ')}
          . Revísalas a mano: que no aparezcan requisitos ahí no significa que no existan.
        </p>
      )}
      <Section
        title={`${artifacts.requirements.length} requisitos extraídos del pliego y enmiendas`}
      >
        <table>
          <thead>
            <tr>
              <th>Requisito</th>
              <th>Tipo</th>
              <th>Estado</th>
              <th>Fuente</th>
              <th>Nota</th>
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
                      <Chip tone="neutral">sin evaluar</Chip>
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
      <Section title="Ítems del pliego × cotizaciones de proveedores (Company Brain)">
        <table>
          <thead>
            <tr>
              <th>Ítem</th>
              <th>Especificación</th>
              <th>Estado</th>
              <th>Fuente</th>
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
                    <div className="muted">válida hasta {item.validUntil}</div>
                  )}
                </td>
                <td className="muted">{item.assumptions.join(' · ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted">
          Solo se usan precios impresos en cotizaciones del Company Brain; cada precio se verifica
          contra el texto de la cotización y su vigencia. Lo demás queda como [PENDING].
        </p>
      </Section>
      <Section title={`Lectura visual de páginas escaneadas (${artifacts.visual.length})`}>
        {artifacts.samGap !== null && (
          <p className="banner">
            SAM 3.1 (localización de regiones) no disponible en esta cuenta: la página se lee
            completa con Muse Spark y se cita con su número de página. Detalle: {artifacts.samGap}
          </p>
        )}
        <ul className="checks">
          {artifacts.visual.map((item) => (
            <li key={item.evidenceId}>
              <button className="link" onClick={() => onOpenEvidence({ kind: 'visual', item })}>
                {item.fileName} · p{item.page}
              </button>{' '}
              {item.requiresHumanReview && <Chip tone="warn">revisión humana</Chip>}{' '}
              <span className="muted">{item.reading?.summary ?? item.note}</span>
            </li>
          ))}
          {artifacts.visual.length === 0 && (
            <li className="muted">No hubo páginas escaneadas citadas por requisitos.</li>
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
      <Section title="Hoja de costos (RD$, cotizaciones vigentes)">
        <table>
          <thead>
            <tr>
              <th>Ítem</th>
              <th>Cant.</th>
              <th>Costo unit.</th>
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
      <Section title="Oferta (RD$)">
        <ul className="kv">
          <li>
            <b>Referencial del pliego:</b> {formatMoney(opportunity.amount)}
          </li>
          <li>
            <b>Costo cotizado (ítems con precio):</b>{' '}
            {formatMoney(totals?.quotedSubtotalDop ?? null)}
          </li>
          <li>
            <b>Ítems sin precio fiable:</b> {totals?.pendingItems ?? 0}
          </li>
          <li>
            <b>Precio de oferta:</b> [PENDING: margen y precio final los decide la empresa]
          </li>
        </ul>
        <p className="muted">
          Postor no inventa precios ni márgenes: el costo sale de cotizaciones vigentes y el precio
          final lo fija una persona en el F.033.
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
        llamada {index + 1} · <code>{call.modelReturned ?? call.modelRequested}</code> · prompt{' '}
        <code>{call.promptVersion ?? '—'}</code> · {call.tokensIn ?? 0} → {call.tokensOut ?? 0}{' '}
        tokens · {seconds(call.durationMs)} · US${' '}
        {(call.estimatedCostUsd ?? 0).toFixed(COST_DECIMALS)} (estimado)
      </span>
      <details>
        <summary>insumos (prompt enviado)</summary>
        <pre>{call.promptSystem}</pre>
        <pre>{call.promptTask}</pre>
      </details>
      <details>
        <summary>respuesta recibida</summary>
        <pre>{prettyJson(call.responseNorm ?? call.responseRaw)}</pre>
      </details>
    </div>
  );
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
      <Section title="Resumen de la corrida">
        <p>
          <StatusChip status={trace.status} /> inició {formatDateTime(trace.startedAt)} · terminó{' '}
          {formatDateTime(trace.finishedAt)}
        </p>
        <p className="muted">
          {summary.tokensIn.toLocaleString()} tokens de entrada ·{' '}
          {summary.tokensOut.toLocaleString()} de salida · tiempo de modelo{' '}
          {seconds(summary.modelDurationMs)} · costo estimado US${' '}
          {summary.estimatedCostUsd.toFixed(RUN_COST_DECIMALS)} (tokens × tarifas{' '}
          {summary.rates.inputUsdPerMillionTokens}/{summary.rates.outputUsdPerMillionTokens} US$ por
          millón
          {summary.rates.source === 'placeholder' &&
            ', tarifas de referencia — configúralas en .env'}
          )
        </p>
      </Section>
      <Section title="Pasos del pipeline (agente, hora, modelo)">
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
                  {agentRun.modelCalls.length} llamadas
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
      <Section title={`Eventos (${trace.events.length})`}>
        <details>
          <summary>ver eventos workflow.*</summary>
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
      <Section title={`SNCC.F.033 — Oferta económica (${artifacts.pricing.length} líneas)`}>
        <table>
          <thead>
            <tr>
              <th>Ítem</th>
              <th>Descripción</th>
              <th>Unidad</th>
              <th>Cant.</th>
              <th>Precio unitario</th>
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
                  [PENDING: precio de oferta]
                  {item.status === 'ok' &&
                    item.unitPrice !== null &&
                    ` costo ref. RD$ ${formatMoney(item.unitPrice)}`}
                </td>
                <td className="muted">[PENDING]</td>
                <td className="muted">[PENDING]</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      {review !== null && (
        <Section title="Revisión automática del borrador">
          <p>
            <StatusChip status={review.verdict} />{' '}
            <span className="muted">
              {artifacts.reviewRounds.length} ronda(s) · {review.covered.length} requisitos
              cubiertos · {review.omitted.length} omitidos
            </span>
          </p>
          {artifacts.reviewRounds.length > 1 && (
            <p className="muted">
              Primera revisión: {artifacts.reviewRounds[0]?.review.verdict} con{' '}
              {artifacts.reviewRounds[0]?.review.omitted.length ?? 0} omisiones y{' '}
              {artifacts.reviewRounds[0]?.review.unsupportedClaims.length ?? 0} afirmaciones sin
              respaldo → el redactor corrigió una vez.
            </p>
          )}
          <ul className="checks">
            {review.unsupportedClaims.map((claim) => (
              <li key={claim.claim}>
                <Chip tone="bad">sin respaldo</Chip> {claim.claim}{' '}
                <span className="muted">— {claim.reason}</span>
              </li>
            ))}
            {review.contradictions.map((contradiction) => (
              <li key={contradiction}>
                <Chip tone="warn">contradicción</Chip> {contradiction}
              </li>
            ))}
            {review.recommendedFixes.map((fix) => (
              <li key={fix}>
                <Chip tone="neutral">corregir</Chip> {fix}
              </li>
            ))}
          </ul>
        </Section>
      )}
      <Section title="Validación humana (desbloquea las descargas)">
        <label className="check">
          <input
            type="checkbox"
            checked={validation.f033}
            onChange={(event) => setValidation({ ...validation, f033: event.target.checked })}
          />
          Revisé el F.033 y fijaré los precios de oferta yo mismo
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={validation.draft}
            onChange={(event) => setValidation({ ...validation, draft: event.target.checked })}
          />
          Revisé el borrador y los [PENDING] antes de firmar y sellar
        </label>
        {validation.f033 && validation.draft ? (
          <p>
            <Chip tone="ok">Validado — descargas habilitadas</Chip>
          </p>
        ) : (
          <p className="muted">Sin validación humana no hay descarga.</p>
        )}
      </Section>
    </div>
  );
}

export function DocumentsTab({
  runId,
  artifacts,
  opportunityId,
}: {
  runId: string;
  artifacts: RunArtifacts;
  opportunityId: string;
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
      <Section title={`Borrador de oferta generado (${artifacts.files.length} archivos editables)`}>
        <ul className="files">
          {artifacts.files.map((file) => (
            <li key={file.fileName}>
              {unlocked ? (
                <a href={generatedFileUrl(runId, file.fileName)}>{file.fileName}</a>
              ) : (
                <span>{file.fileName}</span>
              )}{' '}
              <span className="muted">
                · {file.pendingMarkers} [PENDING] · base: {file.source}
              </span>
            </li>
          ))}
        </ul>
        {!unlocked && (
          <p className="muted">Descargas bloqueadas: valida en la pestaña Formularios.</p>
        )}
        <p className="banner">
          Postor no envía, firma ni presenta nada. La empresa revisa, completa los [PENDING], firma,
          sella y presenta por su cuenta en el portal de compras.
        </p>
      </Section>
      <Section title={`Expediente original (${originals.length} documentos, sin modificar)`}>
        <ul className="files">
          {originals.map((document) => (
            <li key={document.id}>
              <a href={documentFileUrl(document.id, null)} target="_blank" rel="noreferrer">
                {document.fileName}
              </a>{' '}
              <span className="muted">· {document.pageCount} págs.</span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
