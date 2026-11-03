// Typed client for the Postor API. Every call goes through /api (Vite proxy
// in dev); the browser never sees the Meta key or calls a model directly.
import type {
  ComplianceFinding,
  ComplianceVerdict,
  DraftOffer,
  OpportunityAssessment,
  PricingFinding,
  ReviewReport,
  TenderRequirement,
  VisualEvidence,
} from '@postor/contracts';

const API_BASE = '/api';

export type Verdict = ComplianceVerdict['verdict'];

export interface LatestRun {
  id: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  verdict: Verdict | null;
  matchLevel: string | null;
  summary: string | null;
  mode: RunMode;
}

export type RunMode = 'lite' | 'full';

export interface Opportunity {
  id: string;
  code: string;
  title: string;
  entity: string;
  amount: number | null;
  deadline: string | null;
  closeDateRd: string | null;
  modality: string | null;
  portalUrl: string | null;
  documentCount: number;
  latestRun: LatestRun | null;
}

export interface ModelCall {
  id: string;
  modelRequested: string;
  modelReturned: string | null;
  promptSystem: string | null;
  promptTask: string | null;
  promptVersion: string | null;
  responseRaw: unknown;
  responseNorm: unknown;
  tokensIn: number | null;
  tokensOut: number | null;
  durationMs: number | null;
  status: string;
  estimatedCostUsd?: number;
}

export interface AgentRun {
  id: string;
  agent: string;
  task: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  modelCalls: ModelCall[];
}

export interface WorkflowEvent {
  id: string;
  type: string;
  agent: string | null;
  createdAt: string;
  metadata: Record<string, unknown> | null;
}

export interface WorkflowRun {
  id: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  agentRuns: AgentRun[];
  events: WorkflowEvent[];
}

export interface EvidenceRow {
  id: string;
  documentId: string;
  page: number;
  section: string | null;
  method: string;
}

export interface Artifact {
  id: string;
  type: string;
  producedBy: string;
  data: unknown;
  evidence: EvidenceRow[];
}

export interface CostSummary {
  rates: { inputUsdPerMillionTokens: number; outputUsdPerMillionTokens: number; source: string };
  tokensIn: number;
  tokensOut: number;
  modelDurationMs: number;
  estimatedCostUsd: number;
  label: string;
}

export interface TraceResponse extends WorkflowRun {
  artifacts: Artifact[];
  costSummary: CostSummary;
}

export interface FinancialCheck {
  solvency: number | null;
  liquidity: number | null;
  debt: number | null;
  annualRevenueDop: number | null;
  concentrationRatio: number | null;
}

export interface GeneratedFile {
  fileName: string;
  kind: 'form' | 'f033' | 'draft';
  source: string;
  pendingMarkers: number;
}

// Artifact payloads, keyed by artifact type (see workflow-runner.service.ts).
export interface RunArtifacts {
  assessment: OpportunityAssessment | null;
  requirements: TenderRequirement[];
  contradictions: string[];
  failedWindows: { fileName: string; startPage: number; endPage: number; error: string }[];
  findings: ComplianceFinding[];
  verdict: ComplianceVerdict | null;
  financials: FinancialCheck | null;
  visual: VisualEvidence[];
  samGap: string | null;
  pricing: PricingFinding[];
  offer: EconomicOffer | null;
  pricingTotals: {
    pricedItems: number;
    pendingItems: number;
    quotedSubtotalDop: number | null;
  } | null;
  draft: DraftOffer | null;
  review: ReviewReport | null;
  reviewRounds: { review: ReviewReport; deterministicOmissions: string[] }[];
  files: GeneratedFile[];
  requirementsArtifactId: string | null;
  guard: DocumentGuardResult | null;
  voiceNotes: VoiceNote[];
}

// Economic offer (SNCC.F.033) computed by the API from store/rate costs and
// the company's pricing policy (mirrors EconomicOfferSchema).
export interface OfferLine {
  itemId: string | null;
  description: string;
  unit: string | null;
  quantity: number | null;
  unitCostDop: number | null;
  costSource: string | null;
  unitOfferDop: number | null;
  itbisDop: number | null;
  unitFinalDop: number | null;
  lineTotalDop: number | null;
  estimatedUnitPriceDop: number | null;
  tenderPage: number | null;
}

export interface EconomicOffer {
  status: 'in_band' | 'margin_floor' | 'over_budget' | 'incomplete' | 'no_budget';
  lines: OfferLine[];
  budgetDop: number | null;
  costTotalDop: number;
  offerTotalDop: number;
  pctOfBudget: number | null;
  marginPct: number | null;
  itbisPct: number;
  targetPctOfBudget: number;
  bandPctOfBudget: { min: number; max: number };
  minMarginPct: number;
  amountInWords: string;
  notes: string[];
}

export interface StoreCatalog {
  id: string;
  name: string;
  line: string;
  valid_until: string;
  notes: string;
  products: { sku: string; name: string; unit: string; price_dop: number; stock: number | null }[];
}

export interface StoresResponse {
  stores: StoreCatalog[];
  policy: {
    itbis_pct: number;
    offer_target_pct_of_budget: number;
    offer_band_pct_of_budget: { min: number; max: number };
    min_margin_pct: number;
    rationale: string;
    service_rates: { role: string; rate_dop_per_hour: number }[];
  };
}

export function fetchStores(): Promise<StoresResponse> {
  return getJson<StoresResponse>('/stores');
}

export interface VoiceNote {
  transcript: string;
  audioDurationMs: number | null;
  pendingItems: string[];
  answers: { pendingIndex: number; pending: string; answer: string; proofNeeded?: string | null }[];
  unmatched: string[];
}

export interface DocumentGuardResult {
  // Older runs (Prompt Guard 2 only) carry no backend / escalatedChunks.
  backend?: 'muse_spark' | 'prompt_guard_2';
  model: string;
  scannedChunks: number;
  escalatedChunks?: number;
  threshold: number;
  flagged: {
    fileName: string;
    page: number;
    score: number;
    reason?: string | null;
    excerpt: string;
  }[];
}

export interface TenderDocumentRow {
  id: string;
  fileName: string;
  pageCount: number;
}

export interface EvidenceDetail {
  evidence: EvidenceRow;
  document: { id: string; fileName: string; pageCount: number };
  pagePreview: { text: string; quality: string } | null;
}

export interface CompanyBrain {
  id: string;
  name: string;
  isFictional: boolean;
  profile: Record<string, unknown>;
  documents: {
    id: string;
    fileName: string;
    documentType: string;
    issueDate: string | null;
    expiryDate: string | null;
    verificationStatus: string;
  }[];
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} on ${path}`);
  }
  return (await response.json()) as T;
}

export function fetchOpportunities(): Promise<Opportunity[]> {
  return getJson<Opportunity[]>('/opportunities');
}

export function fetchDocuments(opportunityId: string): Promise<TenderDocumentRow[]> {
  return getJson<TenderDocumentRow[]>(`/opportunities/${opportunityId}/documents`);
}

export function fetchRun(runId: string): Promise<WorkflowRun> {
  return getJson<WorkflowRun>(`/workflows/${runId}`);
}

export function fetchTrace(runId: string): Promise<TraceResponse> {
  return getJson<TraceResponse>(`/workflows/${runId}/trace`);
}

export function fetchEvidence(artifactId: string, evidenceId: string): Promise<EvidenceDetail> {
  return getJson<EvidenceDetail>(
    `/artifacts/${artifactId}/evidence/${encodeURIComponent(evidenceId)}`,
  );
}

export function fetchCompany(): Promise<CompanyBrain> {
  return getJson<CompanyBrain>('/company');
}

export async function startWorkflow(
  opportunityId: string,
  mode: RunMode,
  metaKey: string,
): Promise<{ id: string }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  // The visitor's own Meta key goes ONLY on this request (public demo).
  if (metaKey.length > 0) {
    headers['x-meta-api-key'] = metaKey;
  }
  const response = await fetch(`${API_BASE}/workflows`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ opportunityId, mode }),
  });
  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(detail?.message ?? `${response.status} ${response.statusText}`);
  }
  return (await response.json()) as { id: string };
}

// Voice answer to the draft's [PENDING] items (WAV body). Like a run, it
// calls Meta models, so the visitor's key travels on this request only.
export async function postVoiceNote(runId: string, wav: Blob, metaKey: string): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'audio/wav' };
  if (metaKey.length > 0) {
    headers['x-meta-api-key'] = metaKey;
  }
  const response = await fetch(`${API_BASE}/workflows/${runId}/voice-notes`, {
    method: 'POST',
    headers,
    body: wav,
  });
  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(detail?.message ?? `${response.status} ${response.statusText}`);
  }
}

export interface AccessStatus {
  required: boolean;
  granted: boolean;
  userKeyRequired: boolean;
}

export function fetchAccess(): Promise<AccessStatus> {
  return getJson<AccessStatus>('/access');
}

export async function grantAccess(token: string): Promise<void> {
  const response = await fetch(`${API_BASE}/access`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  if (!response.ok) {
    throw new Error('Invalid access token.');
  }
}

// Visitor's Meta key: kept in sessionStorage (this tab only), sent only when
// starting a live analysis. Storage can be unavailable (private mode).
const META_KEY_STORAGE = 'postor-meta-key';

export function readStoredMetaKey(): string {
  try {
    return sessionStorage.getItem(META_KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

export function storeMetaKey(key: string): void {
  try {
    sessionStorage.setItem(META_KEY_STORAGE, key);
  } catch {
    // Not persisted: the key still works for this page view.
  }
}

// Hides earlier analyses (one opportunity, or all with null). Nothing is
// deleted server-side.
export async function resetDemo(opportunityId: string | null): Promise<void> {
  const body: { opportunityId?: string } = {};
  if (opportunityId !== null) {
    body.opportunityId = opportunityId;
  }
  const response = await fetch(`${API_BASE}/demo/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} resetting the demo`);
  }
}

export function documentFileUrl(documentId: string, page: number | null): string {
  let anchor = '';
  if (page !== null) {
    anchor = `#page=${page}`;
  }
  return `${API_BASE}/documents/${documentId}/file${anchor}`;
}

// Rendered page PNG (same pixels SAM saw, so its boxes overlay 1:1).
export function pageImageUrl(documentId: string, page: number): string {
  return `${API_BASE}/documents/${documentId}/pages/${page}`;
}

export function generatedFileUrl(runId: string, fileName: string): string {
  return `${API_BASE}/workflows/${runId}/files/${encodeURIComponent(fileName)}`;
}

function dataOf<T>(artifacts: Artifact[], type: string): T | null {
  const artifact = artifacts.find((entry) => entry.type === type);
  if (artifact === undefined) {
    return null;
  }
  return artifact.data as T;
}

// Flattens the artifact list into the shape the tabs read.
export function readArtifacts(artifacts: Artifact[]): RunArtifacts {
  const requirements = dataOf<{
    requirements?: TenderRequirement[];
    contradictions?: string[];
    failedWindows?: RunArtifacts['failedWindows'];
  }>(artifacts, 'requirements');
  const compliance = dataOf<{
    findings?: ComplianceFinding[];
    verdict?: ComplianceVerdict;
    financials?: FinancialCheck;
  }>(artifacts, 'compliance');
  const visual = dataOf<{ evidence?: VisualEvidence[]; samGap?: string | null }>(
    artifacts,
    'visual_evidence',
  );
  const pricing = dataOf<{
    items?: PricingFinding[];
    totals?: RunArtifacts['pricingTotals'];
    offer?: EconomicOffer | null;
  }>(artifacts, 'pricing');
  const draft = dataOf<{ draft?: DraftOffer }>(artifacts, 'draft_offer');
  const review = dataOf<{ review?: ReviewReport; rounds?: RunArtifacts['reviewRounds'] }>(
    artifacts,
    'review_report',
  );
  const documents = dataOf<{ files?: GeneratedFile[] }>(artifacts, 'bid_documents');
  const requirementsArtifact = artifacts.find((entry) => entry.type === 'requirements');
  return {
    assessment: dataOf<OpportunityAssessment>(artifacts, 'opportunity_assessment'),
    requirements: requirements?.requirements ?? [],
    contradictions: requirements?.contradictions ?? [],
    failedWindows: requirements?.failedWindows ?? [],
    findings: compliance?.findings ?? [],
    verdict: compliance?.verdict ?? null,
    financials: compliance?.financials ?? null,
    visual: visual?.evidence ?? [],
    samGap: visual?.samGap ?? null,
    pricing: pricing?.items ?? [],
    pricingTotals: pricing?.totals ?? null,
    offer: pricing?.offer ?? null,
    draft: draft?.draft ?? null,
    review: review?.review ?? null,
    reviewRounds: review?.rounds ?? [],
    files: documents?.files ?? [],
    requirementsArtifactId: requirementsArtifact?.id ?? null,
    guard: dataOf<DocumentGuardResult>(artifacts, 'document_guard'),
    voiceNotes: artifacts
      .filter((entry) => entry.type === 'voice_note')
      .map((entry) => entry.data as VoiceNote),
  };
}
