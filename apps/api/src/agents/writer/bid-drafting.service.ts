import { Injectable } from '@nestjs/common';
import {
  ComplianceFinding,
  ComplianceVerdict,
  DraftOffer,
  PricingFinding,
  ReviewReport,
  TenderRequirement,
} from '@postor/contracts';
import { StructuredFact } from '../../brain/structured-facts';
import { NormalizedTender } from '../../documents/tender-source';
import { AgentCallTrace } from '../base/base-agent';
import { ReviewerAgent } from '../reviewer/reviewer.agent';
import { WriterAgent } from './writer.agent';

export interface DraftingInput {
  tender: NormalizedTender;
  requirements: TenderRequirement[];
  findings: ComplianceFinding[];
  verdict: ComplianceVerdict | null;
  pricing: PricingFinding[];
  facts: StructuredFact[];
}

export interface DraftingRound {
  draft: DraftOffer;
  review: ReviewReport;
  // Mandatory requirement ids the deterministic coverage check found
  // unanswered, whatever the reviewer model said.
  deterministicOmissions: string[];
}

export interface DraftingResult {
  rounds: DraftingRound[];
  finalDraft: DraftOffer;
  finalReview: ReviewReport;
  writerTraces: AgentCallTrace[];
  reviewerTraces: AgentCallTrace[];
}

const NOT_AVAILABLE = 'not available';
const REASON_PREVIEW_CHARS = 160;

export function renderRequirements(requirements: TenderRequirement[]): string {
  return requirements
    .map((item) => {
      let mandatoryLabel = 'optional';
      if (item.mandatory) {
        mandatoryLabel = 'MANDATORY';
      }
      return `- [${item.id}] ${mandatoryLabel} p${item.source.page} (${item.category}) ${item.title}`;
    })
    .join('\n');
}

export function renderFindings(findings: ComplianceFinding[]): string {
  if (findings.length === 0) {
    return NOT_AVAILABLE;
  }
  return findings
    .map((finding) => {
      const evidence = finding.companyEvidenceIds.join(', ') || 'no evidence';
      const reason = finding.reason.slice(0, REASON_PREVIEW_CHARS);
      return `- [${finding.requirementId}] ${finding.status} (${evidence}): ${reason}`;
    })
    .join('\n');
}

export function renderPricing(items: PricingFinding[]): string {
  if (items.length === 0) {
    return NOT_AVAILABLE;
  }
  return items
    .map((item) => {
      let price = '[PENDING: price]';
      if (item.unitPrice !== null) {
        price = `RD$ ${item.unitPrice} (${item.sourceDocCode ?? 'quote'})`;
      }
      return `- ${item.item} x${item.quantity ?? '?'} ${item.unit ?? ''}: ${price} [${item.status}]`;
    })
    .join('\n');
}

export function renderVerdict(verdict: ComplianceVerdict | null): string {
  if (verdict === null) {
    return NOT_AVAILABLE;
  }
  const conditions = verdict.conditions
    .map(
      (condition) =>
        `- ${condition.description} (owner ${condition.owner}, by ${condition.deadline})`,
    )
    .join('\n');
  return [`${verdict.verdict}: ${verdict.rationale}`, conditions].join('\n');
}

export function renderTenderHeader(tender: NormalizedTender): string {
  let budget = 'not stated';
  if (tender.estimatedAmountDop !== null) {
    budget = `RD$ ${tender.estimatedAmountDop}`;
  }
  return [
    `Tender ${tender.code} — ${tender.institution}`,
    `Object: ${tender.title}`,
    `Modality: ${tender.modality}. Budget: ${budget}. Closes: ${tender.closeDateRd ?? 'unknown'}.`,
  ].join('\n');
}

// Deterministic layer over the reviewer model (unit-tested): every mandatory
// requirement id must be referenced by some draft section. Missing ids are
// added to "omitted" with a concrete fix, a no_go compliance verdict forces
// "blocked", and a "pass" with omissions becomes "needs_revision". Ids the
// model invents (not in the requirement list) are dropped.
export function mergeCoverage(
  review: ReviewReport,
  draft: DraftOffer,
  requirements: TenderRequirement[],
  verdict: ComplianceVerdict | null,
): { review: ReviewReport; deterministicOmissions: string[] } {
  const known = new Set(requirements.map((item) => item.id));
  const referenced = new Set(draft.sections.flatMap((section) => section.requirementIds));
  const deterministicOmissions = requirements
    .filter((item) => item.mandatory && !referenced.has(item.id))
    .map((item) => item.id);
  const omitted = [
    ...new Set([...review.omitted.filter((id) => known.has(id)), ...deterministicOmissions]),
  ];
  const fixes = [...review.recommendedFixes];
  for (const id of deterministicOmissions) {
    const requirement = requirements.find((item) => item.id === id);
    if (requirement !== undefined) {
      fixes.push(
        `Answer mandatory requirement ${id} (pliego p${requirement.source.page}): ${requirement.title}.`,
      );
    }
  }
  let reviewVerdict = review.verdict;
  const hasProblems =
    omitted.length > 0 || review.unsupportedClaims.length > 0 || review.contradictions.length > 0;
  if (reviewVerdict === 'pass' && hasProblems) {
    reviewVerdict = 'needs_revision';
  }
  const complianceBlocks = verdict !== null && verdict.verdict === 'no_go';
  if (complianceBlocks) {
    reviewVerdict = 'blocked';
  }
  return {
    review: {
      ...review,
      verdict: reviewVerdict,
      covered: review.covered.filter((id) => known.has(id)),
      omitted,
      recommendedFixes: fixes,
    },
    deterministicOmissions,
  };
}

export function renderReviewFeedback(review: ReviewReport): string {
  const lines: string[] = [];
  for (const id of review.omitted) {
    lines.push(`- Omitted mandatory requirement: ${id}`);
  }
  for (const claim of review.unsupportedClaims) {
    lines.push(`- Unsupported claim: "${claim.claim}" — ${claim.reason}`);
  }
  for (const contradiction of review.contradictions) {
    lines.push(`- Contradiction: ${contradiction}`);
  }
  for (const fix of review.recommendedFixes) {
    lines.push(`- Fix: ${fix}`);
  }
  return lines.join('\n');
}

// T6.2 + T6.3 (PRD section 7 Agents 5-6, correction cycle): writer drafts,
// reviewer checks, and when the review asks for revision the writer gets ONE
// correction round followed by a final review. A blocked review stops there:
// rewriting cannot fix a structural blocker.
@Injectable()
export class BidDraftingService {
  public constructor(
    private readonly writer: WriterAgent,
    private readonly reviewer: ReviewerAgent,
  ) {}

  public async draftAndReview(input: DraftingInput): Promise<DraftingResult> {
    const shared = {
      tenderHeader: renderTenderHeader(input.tender),
      requirementsText: renderRequirements(input.requirements),
      findingsText: renderFindings(input.findings),
      pricingText: renderPricing(input.pricing),
    };
    const writerBase = {
      ...shared,
      verdictText: renderVerdict(input.verdict),
      companyFactsText: input.facts
        .map((fact) => `- ${fact.label}: ${fact.value} [${fact.source}]`)
        .join('\n'),
    };
    const writerTraces: AgentCallTrace[] = [];
    const reviewerTraces: AgentCallTrace[] = [];
    const rounds: DraftingRound[] = [];

    const firstDraft = await this.writer.run(writerBase);
    writerTraces.push(firstDraft.trace);
    const firstRound = await this.review(firstDraft.data, input, shared, reviewerTraces);
    rounds.push(firstRound);

    const needsCorrection = firstRound.review.verdict === 'needs_revision';
    if (needsCorrection) {
      const corrected = await this.writer.run({
        ...writerBase,
        reviewerFeedback: renderReviewFeedback(firstRound.review),
        previousDraftJson: JSON.stringify(firstDraft.data),
      });
      writerTraces.push(corrected.trace);
      rounds.push(await this.review(corrected.data, input, shared, reviewerTraces));
    }
    const last = rounds[rounds.length - 1] ?? firstRound;
    return {
      rounds,
      finalDraft: last.draft,
      finalReview: last.review,
      writerTraces,
      reviewerTraces,
    };
  }

  private async review(
    draft: DraftOffer,
    input: DraftingInput,
    shared: {
      tenderHeader: string;
      requirementsText: string;
      findingsText: string;
      pricingText: string;
    },
    traces: AgentCallTrace[],
  ): Promise<DraftingRound> {
    const result = await this.reviewer.run({ ...shared, draftJson: JSON.stringify(draft) });
    traces.push(result.trace);
    const merged = mergeCoverage(result.data, draft, input.requirements, input.verdict);
    return { draft, review: merged.review, deterministicOmissions: merged.deterministicOmissions };
  }
}
