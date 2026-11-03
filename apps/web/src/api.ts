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

export async function startWorkflow(opportunityId: string, mode: RunMode): Promise<{ id: string }> {
  const response = await fetch(`${API_BASE}/workflows`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ opportunityId, mode }),
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} starting the analysis`);
  }
  return (await response.json()) as { id: string };
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
  const pricing = dataOf<{ items?: PricingFinding[]; totals?: RunArtifacts['pricingTotals'] }>(
    artifacts,
    'pricing',
  );
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
    draft: draft?.draft ?? null,
    review: review?.review ?? null,
    reviewRounds: review?.rounds ?? [],
    files: documents?.files ?? [],
    requirementsArtifactId: requirementsArtifact?.id ?? null,
  };
}
