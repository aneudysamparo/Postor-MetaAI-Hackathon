/**
 * Shared agent contracts for Postor AI Bid Team.
 *
 * Agents never exchange free text: every input and output crossing the
 * orchestrator is validated against one of these Zod schemas. Each schema
 * has an inferred TypeScript type with the same name minus the suffix.
 */
import { z } from 'zod';

const MIN_CONFIDENCE = 0;
const MAX_CONFIDENCE = 1;

export const RequirementCategorySchema = z.enum([
  'administrative',
  'legal',
  'technical',
  'economic',
]);
export type RequirementCategory = z.infer<typeof RequirementCategorySchema>;

export const ComplianceStatusSchema = z.enum(['met', 'not_met', 'unknown', 'not_applicable']);
export type ComplianceStatus = z.infer<typeof ComplianceStatusSchema>;

export const VerdictSchema = z.enum(['go', 'go_with_conditions', 'no_go', 'needs_review']);
export type Verdict = z.infer<typeof VerdictSchema>;

export const EvidenceMethodSchema = z.enum(['text', 'vision', 'sam_region']);
export type EvidenceMethod = z.infer<typeof EvidenceMethodSchema>;

export const EvidenceRefSchema = z.object({
  documentId: z.string().min(1),
  page: z.number().int().positive(),
  section: z.string().optional(),
  evidenceId: z.string().min(1),
  method: EvidenceMethodSchema,
});
export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;

export const RequirementVerificationSchema = z.enum(['unknown', 'verified']);
export type RequirementVerification = z.infer<typeof RequirementVerificationSchema>;

export const TenderRequirementSchema = z.object({
  id: z.string().min(1),
  category: RequirementCategorySchema,
  title: z.string().min(1),
  originalText: z.string().min(1),
  plainExplanation: z.string().min(1),
  mandatory: z.boolean(),
  source: EvidenceRefSchema,
  consequence: z.string().optional(),
  deadline: z.string().optional(),
  confidence: z.number().min(MIN_CONFIDENCE).max(MAX_CONFIDENCE),
  status: RequirementVerificationSchema,
});
export type TenderRequirement = z.infer<typeof TenderRequirementSchema>;

export const RiskLevelSchema = z.enum(['low', 'medium', 'high']);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const ComplianceFindingSchema = z.object({
  requirementId: z.string().min(1),
  status: ComplianceStatusSchema,
  reason: z.string().min(1),
  companyEvidenceIds: z.array(z.string()),
  missingInformation: z.array(z.string()),
  risk: RiskLevelSchema,
  recommendedAction: z.string().min(1),
  requiresHumanReview: z.boolean(),
  // True only when the gap cannot be closed before the tender closes (a
  // structural blocker such as a missing manufacturer authorization the
  // tender demands as admissibility). Nullish: the model emits explicit
  // nulls, the service normalizes them to false.
  blocker: z.boolean().nullish(),
  // Only meaningful when blocker is true. "clear": the bidder plainly lacks
  // what the tender demands. "disputed": the requirement might be met
  // another way (partner, subcontractor, consortium) or its wording is
  // ambiguous for this bidder. Disputed-only blockers send the verdict to
  // needs_review instead of no_go. Nullish: missing means "clear".
  blockerBasis: z.enum(['clear', 'disputed']).nullish(),
  // Role that should own the fix (null when no action is needed).
  suggestedOwner: z.string().nullish(),
});
export type ComplianceFinding = z.infer<typeof ComplianceFindingSchema>;

// What the compliance model returns per requirement batch: findings only.
// The verdict is built deterministically by the service, never by the model.
export const ComplianceOutputSchema = z.object({
  findings: z.array(ComplianceFindingSchema),
});
export type ComplianceOutput = z.infer<typeof ComplianceOutputSchema>;

export const VerdictConditionSchema = z.object({
  requirementId: z.string().min(1),
  description: z.string().min(1),
  owner: z.string().min(1),
  deadline: z.string().min(1),
});
export type VerdictCondition = z.infer<typeof VerdictConditionSchema>;

export const FindingCountsSchema = z.object({
  met: z.number().int().nonnegative(),
  not_met: z.number().int().nonnegative(),
  unknown: z.number().int().nonnegative(),
  not_applicable: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});
export type FindingCounts = z.infer<typeof FindingCountsSchema>;

// Deterministic verdict over the findings (service-built, see
// compliance-verdict.ts): rationale cites counts and decisive reasons,
// conditions carry owner + deadline for every solvable gap.
export const ComplianceVerdictSchema = z.object({
  verdict: VerdictSchema,
  rationale: z.string().min(1),
  conditions: z.array(VerdictConditionSchema),
  counts: FindingCountsSchema,
});
export type ComplianceVerdict = z.infer<typeof ComplianceVerdictSchema>;

export const PricingStatusSchema = z.enum(['ok', 'insufficient_data', 'no_reliable_match']);
export type PricingStatus = z.infer<typeof PricingStatusSchema>;

export const PricingFindingSchema = z.object({
  item: z.string().min(1),
  specification: z.string().min(1),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  unitPrice: z.number().nullable(),
  currency: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  sourceDate: z.string().nullable(),
  assumptions: z.array(z.string()),
  status: PricingStatusSchema,
  // T6.1 traceability (nullish: the model emits explicit nulls). The
  // company-brain quotation that backs the price, its validity end date,
  // the tender requirements that ask for the item, and the pliego page.
  sourceDocCode: z.string().nullish(),
  validUntil: z.string().nullish(),
  requirementIds: z.array(z.string()).nullish(),
  tenderPage: z.number().int().positive().nullish(),
  // Offer pricing: the pliego item this line prices (items.json id), and for
  // services the estimated effort per role; the unit cost of a service is
  // computed in code from the company's rate card, never by the model.
  itemId: z.string().nullish(),
  effort: z.array(z.object({ role: z.string().min(1), hours: z.number().nonnegative() })).nullish(),
});
export type PricingFinding = z.infer<typeof PricingFindingSchema>;

// The economic offer (SNCC.F.033) computed by deterministic code from the
// priced costs, the company's pricing policy and the tender budget.
export const OfferStatusSchema = z.enum([
  'in_band',
  'margin_floor',
  'over_budget',
  'incomplete',
  'no_budget',
]);
export type OfferStatus = z.infer<typeof OfferStatusSchema>;

export const OfferLineSchema = z.object({
  itemId: z.string().nullable(),
  description: z.string(),
  unit: z.string().nullable(),
  quantity: z.number().nullable(),
  unitCostDop: z.number().nullable(),
  costSource: z.string().nullable(),
  unitOfferDop: z.number().nullable(),
  itbisDop: z.number().nullable(),
  unitFinalDop: z.number().nullable(),
  lineTotalDop: z.number().nullable(),
  estimatedUnitPriceDop: z.number().nullable(),
  tenderPage: z.number().nullable(),
});
export type OfferLine = z.infer<typeof OfferLineSchema>;

export const EconomicOfferSchema = z.object({
  status: OfferStatusSchema,
  lines: z.array(OfferLineSchema),
  budgetDop: z.number().nullable(),
  costTotalDop: z.number(),
  offerTotalDop: z.number(),
  pctOfBudget: z.number().nullable(),
  marginPct: z.number().nullable(),
  itbisPct: z.number(),
  targetPctOfBudget: z.number(),
  bandPctOfBudget: z.object({ min: z.number(), max: z.number() }),
  minMarginPct: z.number(),
  amountInWords: z.string(),
  notes: z.array(z.string()),
});
export type EconomicOffer = z.infer<typeof EconomicOfferSchema>;

// What the pricing model returns: one entry per item the tender asks to
// price. The service re-checks every price against the quotation text.
export const PricingOutputSchema = z.object({
  items: z.array(PricingFindingSchema),
});
export type PricingOutput = z.infer<typeof PricingOutputSchema>;

export const DraftOfferSectionSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  requirementIds: z.array(z.string()),
  pending: z.array(z.string()),
});
export type DraftOfferSection = z.infer<typeof DraftOfferSectionSchema>;

export const DraftOfferSchema = z.object({
  sections: z.array(DraftOfferSectionSchema),
  assumptions: z.array(z.string()),
  pendingFields: z.array(z.string()),
});
export type DraftOffer = z.infer<typeof DraftOfferSchema>;

// Voice answers to [PENDING] items (Muse Voice Transcribe -> Muse Spark).
// Every answer is a declaration by the user, never verified evidence: it
// names the document that would prove it, and the draft keeps the marker
// until a person attaches that document.
export const VoiceNoteAnswerSchema = z.object({
  pendingIndex: z.number().int().nonnegative(),
  pending: z.string().min(1),
  answer: z.string().min(1),
  proofNeeded: z.string().nullish(),
});
export type VoiceNoteAnswer = z.infer<typeof VoiceNoteAnswerSchema>;

export const VoiceNoteMappingSchema = z.object({
  answers: z.array(VoiceNoteAnswerSchema),
  // What the speaker said that answers no pending item (kept, not dropped).
  unmatched: z.array(z.string()),
});
export type VoiceNoteMapping = z.infer<typeof VoiceNoteMappingSchema>;

export const ReviewVerdictSchema = z.enum(['pass', 'needs_revision', 'blocked']);
export type ReviewVerdict = z.infer<typeof ReviewVerdictSchema>;

export const UnsupportedClaimSchema = z.object({
  claim: z.string().min(1),
  reason: z.string().min(1),
});
export type UnsupportedClaim = z.infer<typeof UnsupportedClaimSchema>;

export const ReviewReportSchema = z.object({
  verdict: ReviewVerdictSchema,
  covered: z.array(z.string()),
  omitted: z.array(z.string()),
  unsupportedClaims: z.array(UnsupportedClaimSchema),
  contradictions: z.array(z.string()),
  recommendedFixes: z.array(z.string()),
});
export type ReviewReport = z.infer<typeof ReviewReportSchema>;

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

// ---- T3: opportunity assessment + analyst drafts ----

export const MatchLevelSchema = z.enum(['high', 'medium', 'low']);
export type MatchLevel = z.infer<typeof MatchLevelSchema>;

export const InitialRecommendationSchema = z.enum(['go', 'no_go', 'needs_review']);
export type InitialRecommendation = z.infer<typeof InitialRecommendationSchema>;

export const OpportunityAssessmentSchema = z.object({
  summary: z.string().min(1),
  matchLevel: MatchLevelSchema,
  recommendation: InitialRecommendationSchema,
  justification: z.string().min(1),
  relevantCapabilities: z.array(z.string()),
  incompatibilities: z.array(z.string()),
  missingInformation: z.array(z.string()),
});
export type OpportunityAssessment = z.infer<typeof OpportunityAssessmentSchema>;

// What the model actually returns: live runs (case B) showed list entries
// coming back as objects. The agent validates this lenient shape and
// toOpportunityAssessment normalizes every entry to text, so one stray
// object never fails the whole step.
export const OpportunityAssessmentDraftSchema = OpportunityAssessmentSchema.extend({
  relevantCapabilities: z.array(z.unknown()),
  incompatibilities: z.array(z.unknown()),
  missingInformation: z.array(z.unknown()),
});
export type OpportunityAssessmentDraft = z.infer<typeof OpportunityAssessmentDraftSchema>;

function entryToText(entry: unknown): string | null {
  if (typeof entry === 'string') {
    return entry;
  }
  if (typeof entry === 'object' && entry !== null) {
    const parts = Object.values(entry).filter((value) => typeof value === 'string');
    if (parts.length > 0) {
      return parts.join(' — ');
    }
    return JSON.stringify(entry);
  }
  return null;
}

function entriesToText(entries: unknown[]): string[] {
  return entries.map(entryToText).filter((entry): entry is string => entry !== null);
}

export function toOpportunityAssessment(draft: OpportunityAssessmentDraft): OpportunityAssessment {
  return OpportunityAssessmentSchema.parse({
    ...draft,
    relevantCapabilities: entriesToText(draft.relevantCapabilities),
    incompatibilities: entriesToText(draft.incompatibilities),
    missingInformation: entriesToText(draft.missingInformation),
  });
}

// What the analyst model returns per window: no ids (the service mints them),
// page as cited (the mapper validates it against the real page count).
export const RequirementDraftSchema = z.object({
  title: z.string().min(1),
  originalText: z.string().min(1),
  plainExplanation: z.string().min(1),
  category: RequirementCategorySchema,
  mandatory: z.boolean(),
  page: z.number().int(),
  section: z.string().nullish(),
  consequence: z.string().nullish(),
  deadline: z.string().nullish(),
  confidence: z.number().min(MIN_CONFIDENCE).max(MAX_CONFIDENCE),
});
export type RequirementDraft = z.infer<typeof RequirementDraftSchema>;

export const AnalystWindowOutputSchema = z.object({
  requirements: z.array(RequirementDraftSchema),
  // Free-form by design: the model sometimes returns objects or nulls here
  // despite the prompt. The service normalizes entries to strings (objects
  // via JSON) and drops non-textual ones instead of failing the batch.
  contradictions: z.array(z.unknown()),
});
export type AnalystWindowOutput = z.infer<typeof AnalystWindowOutputSchema>;

export interface RequirementEvidenceContext {
  documentId: string;
  pageCount: number;
  method: z.infer<typeof EvidenceMethodSchema>;
}

// Page policy (documented, reversible): a citation inside [1, pageCount] is
// structurally verified; anything else keeps its cited page when positive
// (so reviewers see what the model claimed) with status unknown. Pages below
// 1 are stored as 1 because the contract requires positive pages — the
// unknown status carries the invalidity, never the location.
export function toTenderRequirement(
  draft: RequirementDraft,
  context: RequirementEvidenceContext,
  index: number,
): TenderRequirement {
  const pageValid = draft.page >= 1 && draft.page <= context.pageCount;
  const page = Math.max(draft.page, 1);
  const stem = `${context.documentId}-p${page}-${index}`;
  // The model often emits explicit nulls for absent optionals; the contract
  // wants them absent, so nulls normalize to undefined here.
  const section = draft.section ?? undefined;
  const consequence = draft.consequence ?? undefined;
  const deadline = draft.deadline ?? undefined;
  return TenderRequirementSchema.parse({
    id: stem,
    category: draft.category,
    title: draft.title,
    originalText: draft.originalText,
    plainExplanation: draft.plainExplanation,
    mandatory: draft.mandatory,
    source: {
      documentId: context.documentId,
      page,
      section,
      evidenceId: `${stem}-ev`,
      method: context.method,
    },
    consequence,
    deadline,
    confidence: draft.confidence,
    status: pageValid ? 'verified' : 'unknown',
  });
}

// ---- T5: visual evidence route (TECH section 6 step 4c) ----

// What the vision model returns after reading one rendered page. The model
// transcribes; it never judges compliance here.
export const VisualPageReadingSchema = z.object({
  readable: z.boolean(),
  summary: z.string(),
  keyFacts: z.array(z.string()),
  tableRows: z.array(z.string()),
});
export type VisualPageReading = z.infer<typeof VisualPageReadingSchema>;

// sam-3.1 outcome per page: regions found, no instance of the concepts, or
// "unavailable" when the call itself failed (no fake boxes, ever).
export const SamStatusSchema = z.enum(['unavailable', 'no_region', 'regions_found']);
export type SamStatus = z.infer<typeof SamStatusSchema>;

export const VisualRegionBoxSchema = z.object({
  label: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  // Pixel size of the rendered page the box refers to.
  imageWidth: z.number(),
  imageHeight: z.number(),
});
export type VisualRegionBox = z.infer<typeof VisualRegionBoxSchema>;

export const VisualEvidenceSchema = z.object({
  evidenceId: z.string().min(1),
  documentId: z.string().min(1),
  fileName: z.string().min(1),
  page: z.number().int().positive(),
  pageQuality: z.string(),
  method: EvidenceMethodSchema,
  samStatus: SamStatusSchema,
  regions: z.array(VisualRegionBoxSchema),
  reading: VisualPageReadingSchema.nullable(),
  requirementIds: z.array(z.string()),
  requiresHumanReview: z.boolean(),
  note: z.string(),
});
export type VisualEvidence = z.infer<typeof VisualEvidenceSchema>;
