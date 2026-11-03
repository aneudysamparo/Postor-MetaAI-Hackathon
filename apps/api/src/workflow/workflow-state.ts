// Pure workflow vocabulary: statuses, steps, and events shared by the
// orchestrator, the controllers, and the future frontend. No Nest imports
// here, so this file is unit-testable with plain node:test.
export const WORKFLOW_STATUS = {
  QUEUED: 'queued',
  RUNNING: 'running',
  COMPLETED: 'completed',
  NEEDS_REVIEW: 'needs_review',
  FAILED: 'failed',
} as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUS)[keyof typeof WORKFLOW_STATUS];

export const AGENT_RUN_STATUS = {
  QUEUED: 'queued',
  RUNNING: 'running',
  OK: 'ok',
  FAILED: 'failed',
} as const;
export type AgentRunStatus = (typeof AGENT_RUN_STATUS)[keyof typeof AGENT_RUN_STATUS];

export const WORKFLOW_EVENT = {
  CREATED: 'workflow.created',
  STARTED: 'workflow.started',
  STEP_STARTED: 'workflow.step_started',
  STEP_COMPLETED: 'workflow.step_completed',
  STEP_FAILED: 'workflow.step_failed',
  COMPLETED: 'workflow.completed',
  NEEDS_REVIEW: 'workflow.needs_review',
  FAILED: 'workflow.failed',
} as const;
export type WorkflowEventType = (typeof WORKFLOW_EVENT)[keyof typeof WORKFLOW_EVENT];

// Steps the runner executes today (TECH section 8, steps 1-4).
export const IMPLEMENTED_STEPS = [
  'load_context',
  'opportunity.evaluate',
  'tender_analyst.extract',
  'consolidate',
  'visual.read',
  'compliance.evaluate',
  'pricing.research',
] as const;

// Agents that join in T6. Listed on results so the UI can label the run
// as a partial pipeline instead of a final verdict.
export const PENDING_STEPS = ['writer.draft', 'reviewer.review'] as const;

const TERMINAL_STATUSES: readonly WorkflowStatus[] = [
  WORKFLOW_STATUS.COMPLETED,
  WORKFLOW_STATUS.NEEDS_REVIEW,
  WORKFLOW_STATUS.FAILED,
];

const ALLOWED_TRANSITIONS: Record<WorkflowStatus, readonly WorkflowStatus[]> = {
  [WORKFLOW_STATUS.QUEUED]: [WORKFLOW_STATUS.RUNNING, WORKFLOW_STATUS.FAILED],
  [WORKFLOW_STATUS.RUNNING]: [
    WORKFLOW_STATUS.COMPLETED,
    WORKFLOW_STATUS.NEEDS_REVIEW,
    WORKFLOW_STATUS.FAILED,
  ],
  [WORKFLOW_STATUS.COMPLETED]: [],
  [WORKFLOW_STATUS.NEEDS_REVIEW]: [],
  [WORKFLOW_STATUS.FAILED]: [],
};

export function isTerminalStatus(status: WorkflowStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

// Evidence rows scope the contract evidenceId (stable per requirement) with
// the artifact id (unique per run): re-running a tender must not collide
// with rows from earlier runs. The evidence endpoint rebuilds this same
// composite from its URL params, so requirement citations still open it.
export function evidenceRowId(artifactId: string, evidenceId: string): string {
  return `${artifactId}-${evidenceId}`;
}

// Guards the state machine: terminal runs never move, and a run can only
// advance along the declared transitions. Throws on any illegal move.
export function assertTransition(from: WorkflowStatus, to: WorkflowStatus): void {
  const allowed = ALLOWED_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new Error(`Illegal workflow transition: ${from} -> ${to}.`);
  }
}
