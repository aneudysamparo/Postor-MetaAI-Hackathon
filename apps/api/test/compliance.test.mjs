// Maintained unit tests for T4 pure logic (node:test, no framework).
// Run: npm run test -w @postor/api   (builds first, then exercises dist)
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { buildFinancialCheck } from '../dist/agents/compliance/compliance-financials.js';
import { buildVerdict } from '../dist/agents/compliance/compliance-verdict.js';
import { chunkArray } from '../dist/agents/compliance/compliance.service.js';

const PROFILE = {
  financial_profile: {
    annual_revenue: { 2024: 8400000, 2025: 10200000 },
    total_assets: 7500000,
    total_liabilities: 2800000,
    equity: 4700000,
    current_liquidity: 1.8,
  },
};

function requirement(id, mandatory = true) {
  return { id, mandatory };
}

function finding(id, overrides = {}) {
  return {
    requirementId: id,
    status: 'met',
    reason: `Evidence supports ${id}.`,
    companyEvidenceIds: ['DOC-REF-001'],
    missingInformation: [],
    risk: 'low',
    recommendedAction: 'No action needed.',
    requiresHumanReview: false,
    blocker: false,
    suggestedOwner: null,
    ...overrides,
  };
}

function verdictOf(findings, requirements, tenderAmountDop, closeDateRd = '2026-11-10 09:00') {
  return buildVerdict({
    findings,
    requirements,
    financials: buildFinancialCheck(PROFILE, tenderAmountDop),
    closeDateRd,
  });
}

describe('compliance financials', () => {
  it('computes the oracle ratios from profile numbers', () => {
    const check = buildFinancialCheck(PROFILE, 8743800);
    assert.equal(check.solvency, 2.68);
    assert.equal(check.liquidity, 1.8);
    assert.equal(check.debt, 0.6);
    assert.equal(check.annualRevenueDop, 10200000);
    assert.equal(check.concentrationRatio, 0.8572);
  });

  it('returns nulls when the profile lacks financials', () => {
    const check = buildFinancialCheck({ company: {} }, 1000);
    assert.equal(check.solvency, null);
    assert.equal(check.concentrationRatio, null);
  });
});

describe('compliance verdict', () => {
  it('goes when nothing is not_met and concentration is low', () => {
    const requirements = [requirement('r1'), requirement('r2')];
    const findings = [finding('r1'), finding('r2', { status: 'unknown' })];
    const verdict = verdictOf(findings, requirements, 2000000);
    assert.equal(verdict.verdict, 'go');
    assert.equal(verdict.conditions.length, 0);
    assert.equal(verdict.counts.unknown, 1);
  });

  it('attaches owner and deadline to every solvable gap', () => {
    const requirements = [requirement('r1'), requirement('r2')];
    const findings = [
      finding('r1'),
      finding('r2', {
        status: 'not_met',
        reason: 'CCNA expired and no cabling certificate.',
        recommendedAction: 'Renew the certification before closing.',
        suggestedOwner: 'hr_lead',
      }),
    ];
    const verdict = verdictOf(findings, requirements, 2000000, '2026-11-06 14:30');
    assert.equal(verdict.verdict, 'go_with_conditions');
    assert.equal(verdict.conditions.length, 1);
    assert.equal(verdict.conditions[0].owner, 'hr_lead');
    assert.equal(verdict.conditions[0].deadline, '2026-11-06 14:30');
  });

  it('stops on a mandatory structural blocker', () => {
    const requirements = [requirement('r1')];
    const findings = [
      finding('r1', {
        status: 'not_met',
        blocker: true,
        reason: 'Factory letter is CUMPLE/NO CUMPLE and structurally absent.',
      }),
    ];
    const verdict = verdictOf(findings, requirements, 5700000);
    assert.equal(verdict.verdict, 'no_go');
    assert.equal(verdict.conditions.length, 0);
  });

  it('sends disputed-only blockers to human review, not no_go', () => {
    const requirements = [requirement('r1'), requirement('r2')];
    const findings = [
      finding('r1', {
        status: 'not_met',
        blocker: true,
        blockerBasis: 'disputed',
        reason: 'Fiber coverage file might come from a partner ISP.',
        recommendedAction: 'Confirm with the entity whether a partner coverage file is accepted.',
      }),
      finding('r2'),
    ];
    const verdict = verdictOf(findings, requirements, 2000000);
    assert.equal(verdict.verdict, 'needs_review');
    assert.equal(verdict.conditions.length, 1);
  });

  it('still says no_go when one blocker is clear', () => {
    const requirements = [requirement('r1'), requirement('r2')];
    const findings = [
      finding('r1', { status: 'not_met', blocker: true, blockerBasis: 'disputed' }),
      finding('r2', { status: 'not_met', blocker: true, blockerBasis: 'clear' }),
    ];
    assert.equal(verdictOf(findings, requirements, 2000000).verdict, 'no_go');
  });

  it('degrades an optional blocker to a condition', () => {
    const requirements = [requirement('r1', false)];
    const findings = [finding('r1', { status: 'not_met', blocker: true })];
    const verdict = verdictOf(findings, requirements, 2000000);
    assert.equal(verdict.verdict, 'go_with_conditions');
    assert.equal(verdict.conditions.length, 1);
  });

  it('asks for human review on high concentration despite clean findings', () => {
    const requirements = [requirement('r1')];
    const findings = [finding('r1')];
    const verdict = verdictOf(findings, requirements, 8743800);
    assert.equal(verdict.verdict, 'needs_review');
    assert.match(verdict.rationale, /86%/);
  });
});

describe('compliance batching', () => {
  it('chunks requirements into full batches plus a remainder', () => {
    assert.deepEqual(chunkArray([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
    assert.deepEqual(chunkArray([], 8), []);
  });
});
