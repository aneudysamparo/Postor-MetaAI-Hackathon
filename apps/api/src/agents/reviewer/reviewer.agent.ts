import { Injectable } from '@nestjs/common';
import { ReviewReport, ReviewReportSchema } from '@postor/contracts';
import { MetaModelService } from '../../models/meta-model.service';
import { BaseAgent } from '../base/base-agent';

export interface ReviewerAgentInput {
  tenderHeader: string;
  requirementsText: string;
  findingsText: string;
  pricingText: string;
  draftJson: string;
  // Caps list lengths in the answer (output length drives latency).
  maxItemsPerList: number;
}

// The reviewer runs on a DIFFERENT Meta model than the writer: Muse Wonder,
// a max-effort reasoning model, audits what Muse Spark drafted, so the
// critique is not the author grading its own work. META_MODEL_REVIEWER
// overrides it (e.g. back to muse-spark-1.3).
const DEFAULT_REVIEWER_MODEL = 'muse-wonder-1.0';

// Agent 6 (PRD section 7, Bid Reviewer). Reads the draft against the
// requirements and the compliance matrix and reports omissions, unbacked
// claims and contradictions. A deterministic coverage check is merged on top
// of its answer by the drafting service, so omissions cannot be missed.
@Injectable()
export class ReviewerAgent extends BaseAgent<ReviewerAgentInput, ReviewReport> {
  protected readonly agentName = 'reviewer';
  protected readonly agentRole = 'Bid Reviewer Agent';
  protected readonly taskName = 'review';
  protected readonly promptVersion = 'reviewer-v2';
  protected readonly outputSchema = ReviewReportSchema;

  public constructor(metaModel: MetaModelService) {
    super(metaModel);
  }

  protected modelFor(): string {
    const configured = (process.env.META_MODEL_REVIEWER ?? '').trim();
    if (configured.length > 0) {
      return configured;
    }
    return DEFAULT_REVIEWER_MODEL;
  }

  protected buildTaskPrompt(input: ReviewerAgentInput): string {
    return [
      'Review this technical proposal draft against the tender.',
      '',
      input.tenderHeader,
      '',
      'Tender requirements (id, mandatory flag, pliego page):',
      input.requirementsText,
      '',
      'Compliance findings (what the company can actually prove):',
      input.findingsText,
      '',
      'Pricing research:',
      input.pricingText,
      '',
      'Draft (JSON):',
      input.draftJson,
      '',
      'Checks:',
      '- covered: requirement ids the draft answers explicitly.',
      '- omitted: mandatory requirement ids with no answer in the draft.',
      '- unsupportedClaims: statements not backed by a finding, a DOC code or',
      '  a quotation (e.g. a requirement presented as met when its finding is',
      '  unknown or not_met, an invented quantity, warranty or date).',
      '- contradictions: quantities, dates or specs that disagree with the',
      '  tender or between sections.',
      '- recommendedFixes: concrete corrections, one per problem.',
      `- Report at most ${input.maxItemsPerList} entries per list, most important first.`,
      '- verdict: pass only with no omitted mandatory ids, no unsupported',
      '  claims and no contradictions; blocked when the compliance verdict is',
      '  no_go or a structural blocker makes the bid inadmissible; otherwise',
      '  needs_revision. Pending markers alone do not block a pass.',
      '',
      'Response format: reply with EXACTLY this JSON shape, no extra keys:',
      '{"verdict": "pass|needs_revision|blocked", "covered": ["<ids>"],',
      ' "omitted": ["<ids>"], "unsupportedClaims": [{"claim": "<text>",',
      ' "reason": "<why>"}], "contradictions": ["<text>"],',
      ' "recommendedFixes": ["<text>"]}',
    ].join('\n');
  }
}
