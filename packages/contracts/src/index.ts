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
});
export type ComplianceFinding = z.infer<typeof ComplianceFindingSchema>;

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
});
export type PricingFinding = z.infer<typeof PricingFindingSchema>;

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

// What the analyst model returns per window: no ids (the service mints them),
// page as cited (the mapper validates it against the real page count).
export const RequirementDraftSchema = z.object({
  title: z.string().min(1),
  originalText: z.string().min(1),
  plainExplanation: z.string().min(1),
  category: RequirementCategorySchema,
  mandatory: z.boolean(),
  page: z.number().int(),
  section: z.string().optional(),
  consequence: z.string().optional(),
  deadline: z.string().optional(),
  confidence: z.number().min(MIN_CONFIDENCE).max(MAX_CONFIDENCE),
});
export type RequirementDraft = z.infer<typeof RequirementDraftSchema>;

export const AnalystWindowOutputSchema = z.object({
  requirements: z.array(RequirementDraftSchema),
  contradictions: z.array(z.string()),
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
      section: draft.section,
      evidenceId: `${stem}-ev`,
      method: context.method,
    },
    consequence: draft.consequence,
    deadline: draft.deadline,
    confidence: draft.confidence,
    status: pageValid ? 'verified' : 'unknown',
  });
}
