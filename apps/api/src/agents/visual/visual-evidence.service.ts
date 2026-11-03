import { Injectable, Logger } from '@nestjs/common';
import {
  TenderRequirement,
  VisualEvidence,
  VisualPageReading,
  VisualPageReadingSchema,
  VisualRegionBox,
} from '@postor/contracts';
import { PdfPageRenderer } from '../../documents/pdf-page-renderer';
import { NormalizedTender } from '../../documents/tender-source';
import { MetaModelService } from '../../models/meta-model.service';
import { PrismaService } from '../../prisma/prisma.service';
import { buildSystemPrompt } from '../base/agent-system-prompt';
import { AgentCallTrace } from '../base/base-agent';

export interface PageCandidate {
  documentId: string;
  page: number;
  quality: string;
  requirementIds: string[];
}

export interface StoredPageSignal {
  quality: string;
  hasImages: boolean;
}

export interface VisualEvidenceRun {
  evidence: VisualEvidence[];
  traces: AgentCallTrace[];
  // Parallel to traces: the parsed reading per call (null when unparseable).
  readings: (VisualPageReading | null)[];
  samGap: string | null;
}

// Page qualities that justify spending a vision call (PRD section 8.2 step
// 5). "text" pages are already read reliably by the text layer.
const VISUAL_QUALITIES = new Set(['scanned', 'poor', 'mixed']);
// Upper bound of vision calls per run: each one is ~10-20 s live, and the
// demo must finish a run in minutes. Pages beyond the cap stay text-only and
// keep their quality flag for the reviewer.
const MAX_VISUAL_PAGES = 2;
// Technical and economic requirements carry the bill-of-goods tables that
// scans garble most; they are read first.
const PRIORITY_CATEGORIES = new Set(['technical', 'economic']);
const VISION_PROMPT_VERSION = 'visual-reader-v1';
// Concepts sam-3.1 is asked to localize on scanned tender pages. Verified
// live: "handwritten signature" finds the committee initials DGCP pliegos
// carry on every page, "logo" finds institutional marks. Generic document
// concepts ("table", "text") return no instances, so they are not used.
const SAM_CONCEPTS = ['handwritten signature', 'logo'];
const SAM_PROMPT_VERSION = 'sam-concepts-v1';
const COVER_PAGE = 1;
const LITE_VISUAL_PAGES = 1;

export interface VisualOptions {
  maxPages: number;
  coverFallback: boolean;
}

export const FULL_VISUAL: VisualOptions = { maxPages: MAX_VISUAL_PAGES, coverFallback: false };
export const LITE_VISUAL: VisualOptions = { maxPages: LITE_VISUAL_PAGES, coverFallback: true };
const JSON_OBJECT_PATTERN = /\{[\s\S]*\}/;

function pageKey(documentId: string, page: number): string {
  return `${documentId}#${page}`;
}

// Pure page selection (unit-tested): requirement-cited pages whose stored
// quality is scanned/poor/mixed AND that carry images, priority categories
// first, then document order. Every selected page keeps the requirement ids
// that cite it so the UI can link evidence back to the requirement.
export function selectVisualPages(
  requirements: TenderRequirement[],
  signals: Map<string, StoredPageSignal>,
  limit: number = MAX_VISUAL_PAGES,
): PageCandidate[] {
  const byPage = new Map<string, PageCandidate & { priority: boolean; order: number }>();
  requirements.forEach((requirement, order) => {
    const key = pageKey(requirement.source.documentId, requirement.source.page);
    const signal = signals.get(key);
    if (signal === undefined || !signal.hasImages || !VISUAL_QUALITIES.has(signal.quality)) {
      return;
    }
    const priority = PRIORITY_CATEGORIES.has(requirement.category);
    const existing = byPage.get(key);
    if (existing === undefined) {
      byPage.set(key, {
        documentId: requirement.source.documentId,
        page: requirement.source.page,
        quality: signal.quality,
        requirementIds: [requirement.id],
        priority,
        order,
      });
      return;
    }
    existing.requirementIds.push(requirement.id);
    existing.priority = existing.priority || priority;
  });
  const ranked = [...byPage.values()].sort((left, right) => {
    const leftFirst = -1;
    const rightFirst = 1;
    if (left.priority && !right.priority) {
      return leftFirst;
    }
    if (right.priority && !left.priority) {
      return rightFirst;
    }
    return left.order - right.order;
  });
  return ranked.slice(0, limit).map((entry) => ({
    documentId: entry.documentId,
    page: entry.page,
    quality: entry.quality,
    requirementIds: entry.requirementIds,
  }));
}

// The vision endpoint answers in free text; this pulls the first JSON object
// out of it and validates it. Anything that does not validate is treated as
// "not readable" so the page goes to human review instead of being trusted.
export function parseVisualReading(text: string): VisualPageReading | null {
  const match = JSON_OBJECT_PATTERN.exec(text);
  if (match === null) {
    return null;
  }
  try {
    const parsed = VisualPageReadingSchema.safeParse(JSON.parse(match[0]));
    if (parsed.success) {
      return parsed.data;
    }
    return null;
  } catch {
    return null;
  }
}

// Visual evidence route (T5, TECH section 6 step 4c): for the few pages the
// text layer reads poorly, render the page, ask sam-3.1 to localize official
// marks (signatures, logos: localization ONLY) and muse-spark-1.3 to read
// the page, in parallel.
@Injectable()
export class VisualEvidenceService {
  private readonly logger = new Logger(VisualEvidenceService.name);

  public constructor(
    private readonly prisma: PrismaService,
    private readonly renderer: PdfPageRenderer,
    private readonly metaModel: MetaModelService,
  ) {}

  public async collect(
    tender: NormalizedTender,
    requirements: TenderRequirement[],
    options: VisualOptions = FULL_VISUAL,
  ): Promise<VisualEvidenceRun> {
    const documentIds = [...new Set(requirements.map((item) => item.source.documentId))];
    const documents = await this.prisma.tenderDocument.findMany({
      where: { id: { in: documentIds } },
    });
    const signals = new Map<string, StoredPageSignal>();
    const fileNames = new Map<string, string>();
    for (const document of documents) {
      fileNames.set(document.id, document.fileName);
      for (const page of readStoredPages(document.extraction)) {
        signals.set(pageKey(document.id, page.page), page);
      }
    }
    let candidates = selectVisualPages(requirements, signals, options.maxPages);
    // Lite fallback: when no cited page is scanned, check the pliego cover
    // for its official marks (institution logo, signatures), so the bidder
    // knows the document carries them.
    if (candidates.length === 0 && options.coverFallback) {
      const pliegoRow = documents.find((document) => document.fileName === tender.pliego.fileName);
      if (pliegoRow !== undefined) {
        const coverSignal = signals.get(pageKey(pliegoRow.id, COVER_PAGE));
        candidates = [
          {
            documentId: pliegoRow.id,
            page: COVER_PAGE,
            quality: coverSignal?.quality ?? 'text',
            requirementIds: [],
          },
        ];
      }
    }
    const evidence: VisualEvidence[] = [];
    const traces: AgentCallTrace[] = [];
    const readings: (VisualPageReading | null)[] = [];
    let samGap: string | null = null;
    for (const candidate of candidates) {
      const fileName = fileNames.get(candidate.documentId) ?? '';
      const file = tender.files.find((entry) => entry.fileName === fileName);
      if (file === undefined || file.kind !== 'pdf') {
        continue;
      }
      const rendered = await this.renderer.renderPage(file.absolutePath, candidate.page);
      // SAM localization and the vision read are independent: run together.
      const [sam, read] = await Promise.all([
        this.trySegment(rendered.dataUrl),
        this.readPage(rendered.dataUrl, fileName, candidate.page),
      ]);
      if (sam.gap !== null) {
        samGap = sam.gap;
      }
      for (const samTrace of sam.traces) {
        traces.push(samTrace);
        readings.push(null);
      }
      traces.push(read.trace);
      readings.push(read.reading);
      evidence.push(this.toEvidence(candidate, fileName, sam, read.reading));
    }
    return { evidence, traces, readings, samGap };
  }

  // sam-3.1 localizes regions only; it never reads text. One call per
  // concept; each call is traced like any model call (prompt = concept,
  // response = the boxes found). A transport failure is recorded as a gap
  // instead of inventing coordinates.
  private async trySegment(imageUrl: string): Promise<{
    regions: VisualRegionBox[];
    gap: string | null;
    traces: AgentCallTrace[];
  }> {
    const regions: VisualRegionBox[] = [];
    const traces: AgentCallTrace[] = [];
    let gap: string | null = null;
    for (const concept of SAM_CONCEPTS) {
      try {
        const result = await this.metaModel.segmentRegions({ imageUrl, hint: { label: concept } });
        const boxes = result.regions.map((region) => ({
          label: region.label,
          ...region.box,
          imageWidth: region.imageWidth,
          imageHeight: region.imageHeight,
        }));
        regions.push(...boxes);
        traces.push({
          agentName: 'visual_reader',
          taskName: 'segment',
          promptVersion: SAM_PROMPT_VERSION,
          systemPrompt: '',
          taskPrompt: concept,
          modelRequested: result.modelRequested,
          modelReturned: result.modelReturned,
          usage: { inputTokens: null, outputTokens: null },
          durationMs: result.durationMs,
          rawResponse: JSON.stringify({ concept, boxes }),
        });
      } catch (error) {
        gap = error instanceof Error ? error.message : String(error);
      }
    }
    return { regions, gap, traces };
  }

  private async readPage(
    imageUrl: string,
    fileName: string,
    page: number,
  ): Promise<{ reading: VisualPageReading | null; trace: AgentCallTrace }> {
    // The vision call carries one user message (text + image), so the shared
    // system rules travel at the top of the text part. The trace stores both
    // halves separately, exactly as sent.
    const systemPrompt = buildSystemPrompt('Visual Reader');
    const taskPrompt = [
      `This image is page ${page} of the tender document "${fileName}".`,
      'Read it as a scanned page. Transcribe what matters for a bidder:',
      'item descriptions, quantities, technical specifications, deadlines,',
      'and any table rows. Copy text as written; do not translate it.',
      'If the page is illegible, set readable to false.',
      'Reply with EXACTLY this JSON shape:',
      '{"readable": true, "summary": "<one or two sentences>",',
      ' "keyFacts": ["<fact as written on the page>"],',
      ' "tableRows": ["<one table row per entry, cells separated by |>"]}',
    ].join('\n');
    const analysis = await this.metaModel.analyzeImage({
      imageUrl,
      taskPrompt: `${systemPrompt}\n\n${taskPrompt}`,
    });
    const reading = parseVisualReading(analysis.text);
    if (reading === null) {
      this.logger.warn(`Vision reading of ${fileName} p${page} did not validate; flagged.`);
    }
    return {
      reading,
      trace: {
        agentName: 'visual_reader',
        taskName: 'read_page',
        promptVersion: VISION_PROMPT_VERSION,
        systemPrompt,
        taskPrompt,
        modelRequested: analysis.modelRequested,
        modelReturned: analysis.modelReturned,
        usage: analysis.usage,
        durationMs: analysis.durationMs,
        rawResponse: analysis.text,
      },
    };
  }

  private toEvidence(
    candidate: PageCandidate,
    fileName: string,
    sam: { regions: VisualRegionBox[]; gap: string | null },
    reading: VisualPageReading | null,
  ): VisualEvidence {
    const regionsFound = sam.regions.length > 0;
    let samStatus: VisualEvidence['samStatus'] = 'no_region';
    if (sam.gap !== null) {
      samStatus = 'unavailable';
    } else if (regionsFound) {
      samStatus = 'regions_found';
    }
    const readable = reading !== null && reading.readable;
    let note = 'Page read by the vision model; cite it with the page number.';
    if (regionsFound) {
      const labels = [...new Set(sam.regions.map((region) => region.label))].join(', ');
      note = `SAM 3.1 localized ${sam.regions.length} official mark(s) (${labels}) on this page; cited by coordinates. Text read by the vision model.`;
    }
    if (!readable) {
      note = 'The page could not be read reliably: kept for human review.';
    }
    let method: VisualEvidence['method'] = 'vision';
    if (regionsFound) {
      method = 'sam_region';
    }
    return {
      evidenceId: `VIS-${candidate.documentId}-p${candidate.page}`,
      documentId: candidate.documentId,
      fileName,
      page: candidate.page,
      pageQuality: candidate.quality,
      method,
      samStatus,
      regions: sam.regions,
      reading,
      requirementIds: candidate.requirementIds,
      requiresHumanReview: !readable,
      note,
    };
  }
}

function readStoredPages(extraction: unknown): (StoredPageSignal & { page: number })[] {
  if (typeof extraction !== 'object' || extraction === null) {
    return [];
  }
  const pages = (extraction as { pages?: unknown }).pages;
  if (!Array.isArray(pages)) {
    return [];
  }
  const result: (StoredPageSignal & { page: number })[] = [];
  for (const entry of pages as Record<string, unknown>[]) {
    if (typeof entry.page === 'number' && typeof entry.quality === 'string') {
      result.push({
        page: entry.page,
        quality: entry.quality,
        hasImages: typeof entry.hasImages === 'boolean' && entry.hasImages,
      });
    }
  }
  return result;
}
