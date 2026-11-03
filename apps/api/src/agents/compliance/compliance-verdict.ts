import { ComplianceFinding, ComplianceVerdict, TenderRequirement } from '@postor/contracts';
import { FinancialCheck } from './compliance-financials';

export interface VerdictInput {
  findings: ComplianceFinding[];
  requirements: TenderRequirement[];
  financials: FinancialCheck;
  closeDateRd: string | null;
}

// A tender worth half (or more) of annual revenue is a human risk call even
// when every requirement is met: concentration and working-capital risk
// cannot be cleared by documents alone. Case D sits at ~86%.
const CONCENTRATION_REVIEW_THRESHOLD = 0.5;
const PERCENT_SCALE = 100;
const UNKNOWN_DEADLINE = 'unknown';
const DEFAULT_CONDITION_OWNER = 'bid_owner';

function mandatoryById(requirements: TenderRequirement[]): Map<string, boolean> {
  return new Map(requirements.map((requirement) => [requirement.id, requirement.mandatory]));
}

function isBlocker(finding: ComplianceFinding): boolean {
  const flagged = finding.blocker ?? false;
  return flagged;
}

function countBy(findings: ComplianceFinding[], status: ComplianceFinding['status']): number {
  return findings.filter((finding) => finding.status === status).length;
}

// Deterministic verdict over the findings (TECH section 8 step 4, PRD Agent
// 3 "Final recommendation" + go_with_conditions from section 22). Precedence:
// structural blockers first, then concentration risk, then solvable gaps,
// else go. Unknowns never block go by themselves: they stay visible on the
// checklist with requiresHumanReview for the reviewer and the user.
export function buildVerdict(input: VerdictInput): ComplianceVerdict {
  const mandatory = mandatoryById(input.requirements);
  const structural = input.findings.filter(
    (finding) => finding.status === 'not_met' && isBlocker(finding),
  );
  // Only mandatory blockers stop the bid: a structural gap on an optional
  // requirement degrades to a solvable condition.
  const isMandatory = (finding: ComplianceFinding): boolean =>
    mandatory.get(finding.requirementId) ?? false;
  const blockers = structural.filter((finding) => isMandatory(finding));
  const optionalBlockers = structural.filter((finding) => !isMandatory(finding));
  const gaps = input.findings.filter(
    (finding) => finding.status === 'not_met' && !isBlocker(finding),
  );
  const allGaps = [...gaps, ...optionalBlockers];
  const counts = {
    met: countBy(input.findings, 'met'),
    not_met: countBy(input.findings, 'not_met'),
    unknown: countBy(input.findings, 'unknown'),
    not_applicable: countBy(input.findings, 'not_applicable'),
    total: input.findings.length,
  };
  const deadline = input.closeDateRd ?? UNKNOWN_DEADLINE;

  // Disputed blockers (might be met through a partner, or the wording is
  // ambiguous) never produce no_go alone: they need a human reading first.
  const clearBlockers = blockers.filter((finding) => finding.blockerBasis !== 'disputed');
  const disputedBlockers = blockers.filter((finding) => finding.blockerBasis === 'disputed');
  if (clearBlockers.length > 0) {
    const reasons = clearBlockers.map((finding) => finding.reason).join(' ');
    return {
      verdict: 'no_go',
      rationale:
        `Structural blocker${clearBlockers.length > 1 ? 's' : ''} that cannot be closed before ` +
        `the tender closes: ${reasons}`,
      conditions: [],
      counts,
    };
  }
  if (disputedBlockers.length > 0) {
    const reasons = disputedBlockers
      .map((finding) => `${finding.requirementId}: ${finding.reason}`)
      .join(' ');
    return {
      verdict: 'needs_review',
      rationale:
        `Possible blockers that need a human reading of the tender before deciding ` +
        `(they might be met through a partner or the wording is ambiguous): ${reasons}`,
      conditions: disputedBlockers.map((finding) => ({
        requirementId: finding.requirementId,
        description: finding.recommendedAction,
        owner: finding.suggestedOwner ?? DEFAULT_CONDITION_OWNER,
        deadline,
      })),
      counts,
    };
  }
  const concentration = input.financials.concentrationRatio;
  if (concentration !== null && concentration >= CONCENTRATION_REVIEW_THRESHOLD) {
    const percent = Math.round(concentration * PERCENT_SCALE);
    return {
      verdict: 'needs_review',
      rationale:
        `Requirements hold (${counts.met} met, ${counts.not_met} not met), but the tender ` +
        `equals ${percent}% of annual revenue: concentration and working-capital risk ` +
        `need a human decision before bidding.`,
      conditions: [],
      counts,
    };
  }
  if (allGaps.length > 0) {
    const conditions = allGaps.map((finding) => ({
      requirementId: finding.requirementId,
      description: finding.recommendedAction,
      owner: finding.suggestedOwner ?? DEFAULT_CONDITION_OWNER,
      deadline,
    }));
    const gapList = allGaps
      .map((finding) => `${finding.requirementId}: ${finding.reason}`)
      .join(' ');
    return {
      verdict: 'go_with_conditions',
      rationale:
        `Bid only after closing ${allGaps.length} solvable gap${allGaps.length > 1 ? 's' : ''} ` +
        `before ${deadline}: ${gapList}`,
      conditions,
      counts,
    };
  }
  return {
    verdict: 'go',
    rationale:
      `No blockers and no open gaps (${counts.met} met, ${counts.unknown} unknown, ` +
      `${counts.not_applicable} not applicable). Unknowns stay flagged for review.`,
    conditions: [],
    counts,
  };
}
