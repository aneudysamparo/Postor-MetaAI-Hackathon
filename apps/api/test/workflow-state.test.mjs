// Maintained unit tests for the workflow state machine (node:test).
// Run: npm run test -w @postor/api   (builds first, then exercises dist)
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  IMPLEMENTED_STEPS,
  PENDING_STEPS,
  WORKFLOW_STATUS,
  assertTransition,
  evidenceRowId,
  isTerminalStatus,
} from '../dist/workflow/workflow-state.js';

describe('workflow state machine', () => {
  it('accepts the happy-path transitions', () => {
    assert.doesNotThrow(() => assertTransition(WORKFLOW_STATUS.QUEUED, WORKFLOW_STATUS.RUNNING));
    assert.doesNotThrow(() => assertTransition(WORKFLOW_STATUS.RUNNING, WORKFLOW_STATUS.COMPLETED));
  });

  it('accepts failure landings from running', () => {
    assert.doesNotThrow(() =>
      assertTransition(WORKFLOW_STATUS.RUNNING, WORKFLOW_STATUS.NEEDS_REVIEW),
    );
    assert.doesNotThrow(() => assertTransition(WORKFLOW_STATUS.RUNNING, WORKFLOW_STATUS.FAILED));
  });

  it('rejects moves out of terminal states', () => {
    assert.throws(() => assertTransition(WORKFLOW_STATUS.COMPLETED, WORKFLOW_STATUS.RUNNING));
    assert.throws(() => assertTransition(WORKFLOW_STATUS.NEEDS_REVIEW, WORKFLOW_STATUS.RUNNING));
    assert.throws(() => assertTransition(WORKFLOW_STATUS.FAILED, WORKFLOW_STATUS.QUEUED));
  });

  it('rejects queued jumping straight to a terminal state', () => {
    assert.throws(() => assertTransition(WORKFLOW_STATUS.QUEUED, WORKFLOW_STATUS.COMPLETED));
  });

  it('marks completed, needs_review, and failed as terminal', () => {
    assert.equal(isTerminalStatus(WORKFLOW_STATUS.COMPLETED), true);
    assert.equal(isTerminalStatus(WORKFLOW_STATUS.NEEDS_REVIEW), true);
    assert.equal(isTerminalStatus(WORKFLOW_STATUS.FAILED), true);
    assert.equal(isTerminalStatus(WORKFLOW_STATUS.RUNNING), false);
    assert.equal(isTerminalStatus(WORKFLOW_STATUS.QUEUED), false);
  });

  it('keeps the pipeline steps disjoint from the pending agents', () => {
    const overlap = IMPLEMENTED_STEPS.filter((step) => PENDING_STEPS.includes(step));
    assert.equal(overlap.length, 0);
    assert.ok(IMPLEMENTED_STEPS.includes('compliance.evaluate'));
    assert.ok(IMPLEMENTED_STEPS.includes('pricing.research'));
    assert.ok(IMPLEMENTED_STEPS.includes('reviewer.review'));
  });

  it('scopes evidence rows per run so re-runs never collide', () => {
    const first = evidenceRowId('artifact-1', 'doc-p2-0-ev');
    const second = evidenceRowId('artifact-2', 'doc-p2-0-ev');
    assert.notEqual(first, second);
    assert.ok(first.includes('doc-p2-0-ev'));
  });
});

describe('bounded concurrency pool', async () => {
  const { mapWithConcurrency } = await import('../dist/agents/base/concurrency.js');

  it('keeps input order and never exceeds the limit', async () => {
    let inFlight = 0;
    let peak = 0;
    const delays = [30, 5, 20, 1, 10];
    const results = await mapWithConcurrency(delays, 2, async (delay, index) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, delay));
      inFlight -= 1;
      return index;
    });
    assert.deepEqual(results, [0, 1, 2, 3, 4]);
    assert.equal(peak, 2);
  });
});
