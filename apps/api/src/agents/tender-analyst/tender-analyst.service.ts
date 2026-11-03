import { Inject, Injectable } from '@nestjs/common';
import {
  AnalystWindowOutput,
  RequirementDraft,
  TenderRequirement,
  toTenderRequirement,
} from '@postor/contracts';
import { DocxTextExtractor } from '../../documents/docx-text-extractor';
import { PdfTextExtractor } from '../../documents/pdf-text-extractor';
import { TENDER_SOURCE, TenderFileRef, TenderSource } from '../../documents/tender-source';
import { PrismaService } from '../../prisma/prisma.service';
import { AgentCallTrace } from '../base/base-agent';
import { AnalystPageInput, TenderAnalystAgent } from './tender-analyst.agent';

export interface PageWindow {
  startPage: number;
  endPage: number;
}

export interface TaggedDraft {
  draft: RequirementDraft;
  documentId: string;
  pageCount: number;
  order: number;
}

export interface MergedAnalysis {
  requirements: TenderRequirement[];
  contradictions: string[];
  windowsRun: number;
  traces: AgentCallTrace[];
  // Parallel to traces: the validated output of each window call, so the
  // orchestrator can persist the exact normalized response per ModelCall.
  windowOutputs: AnalystWindowOutput[];
}

interface StoredPageQuality {
  page?: unknown;
  quality?: unknown;
}

const ANALYST_WINDOW_PAGES = 12;
const ANALYST_WINDOW_OVERLAP = 2;
const UNKNOWN_QUALITY = 'unknown';

// Windows slide with overlap so requirements spanning a boundary are seen
// whole by at least one call. Overlap must stay smaller than the window.
export function buildWindows(pageCount: number): PageWindow[] {
  if (pageCount <= 0) {
    return [];
  }
  const windows: PageWindow[] = [];
  let start = 1;
  for (;;) {
    const end = Math.min(start + ANALYST_WINDOW_PAGES - 1, pageCount);
    windows.push({ startPage: start, endPage: end });
    if (end >= pageCount) {
      break;
    }
    start = end - ANALYST_WINDOW_OVERLAP + 1;
  }
  return windows;
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

// Overlap duplicates collapse on document + page + normalized title,
// keeping the first occurrence (earlier windows win).
export function mergeDrafts(tagged: TaggedDraft[]): TaggedDraft[] {
  const seen = new Set<string>();
  const merged: TaggedDraft[] = [];
  const ordered = [...tagged].sort((left, right) => left.order - right.order);
  for (const entry of ordered) {
    const key = `${entry.documentId}|${entry.draft.page}|${normalizeTitle(entry.draft.title)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(entry);
  }
  return merged;
}

// The model returns contradictions as plain strings most of the time, but
// live runs show objects (and nulls) slipping through even after the retry.
// Objects stringify to JSON so no reported contradiction is lost; anything
// without text is dropped.
export function normalizeContradictions(entries: unknown[]): string[] {
  const normalized: string[] = [];
  for (const entry of entries) {
    if (typeof entry === 'string') {
      normalized.push(entry);
    } else if (typeof entry === 'object' && entry !== null) {
      normalized.push(JSON.stringify(entry));
    }
  }
  return normalized;
}

export function mergeContradictions(lists: string[][]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const list of lists) {
    for (const entry of list) {
      const trimmed = entry.trim();
      const key = trimmed.toLowerCase();
      if (trimmed.length === 0 || seen.has(key)) {
        continue;
      }
      seen.add(key);
      merged.push(trimmed);
    }
  }
  return merged;
}

@Injectable()
export class TenderAnalystService {
  public constructor(
    private readonly prisma: PrismaService,
    @Inject(TENDER_SOURCE) private readonly tenderSource: TenderSource,
    private readonly agent: TenderAnalystAgent,
    private readonly pdfExtractor: PdfTextExtractor,
    private readonly docxExtractor: DocxTextExtractor,
  ) {}

  // T3 scope: pliego + amendments. The machinery is doc-agnostic, so technical
  // specs join later by extending this list.
  public async analyzeCase(caseKey: string, opportunityId: string): Promise<MergedAnalysis> {
    const tender = await this.tenderSource.getTender(caseKey);
    const rows = await this.prisma.tenderDocument.findMany({ where: { opportunityId } });
    const rowByFile = new Map(rows.map((row) => [row.fileName, row]));
    const targets = [tender.pliego, ...tender.amendments];
    const tagged: TaggedDraft[] = [];
    const contradictionLists: unknown[][] = [];
    const traces: AgentCallTrace[] = [];
    const windowOutputs: AnalystWindowOutput[] = [];
    let windowsRun = 0;
    let order = 0;
    for (const file of targets) {
      const row = rowByFile.get(file.fileName);
      if (row === undefined) {
        throw new Error(`Ingested row missing for ${file.fileName}; ingest the tender first.`);
      }
      const pages = await this.fullPageTexts(file);
      const qualities = this.pageQualitiesOf(row.extraction);
      for (const window of buildWindows(pages.length)) {
        const input = {
          documentLabel: file.role === 'pliego' ? 'pliego de condiciones' : 'amendment',
          fileName: file.fileName,
          startPage: window.startPage,
          endPage: window.endPage,
          pages: this.sliceWindow(pages, qualities, window),
        };
        const result = await this.agent.run(input);
        traces.push(result.trace);
        windowOutputs.push(result.data);
        windowsRun += 1;
        for (const draft of result.data.requirements) {
          order += 1;
          tagged.push({ draft, documentId: row.id, pageCount: row.pageCount, order });
        }
        contradictionLists.push(result.data.contradictions);
      }
    }
    const merged = mergeDrafts(tagged);
    const requirements = merged.map((entry, index) =>
      toTenderRequirement(
        entry.draft,
        { documentId: entry.documentId, pageCount: entry.pageCount, method: 'text' },
        index,
      ),
    );
    const normalizedLists = contradictionLists.map((list) => normalizeContradictions(list));
    return {
      requirements,
      contradictions: mergeContradictions(normalizedLists),
      windowsRun,
      traces,
      windowOutputs,
    };
  }

  private async fullPageTexts(file: TenderFileRef): Promise<string[]> {
    if (file.kind === 'pdf') {
      const pdf = await this.pdfExtractor.extract(file.absolutePath);
      return pdf.pages.map((page) => page.text);
    }
    if (file.kind === 'docx') {
      const docx = await this.docxExtractor.extract(file.absolutePath);
      return [docx.text];
    }
    return [];
  }

  private pageQualitiesOf(extraction: unknown): string[] {
    if (typeof extraction !== 'object' || extraction === null) {
      return [];
    }
    const pages = (extraction as { pages?: StoredPageQuality[] }).pages;
    if (!Array.isArray(pages)) {
      return [];
    }
    return pages.map((page) => (typeof page.quality === 'string' ? page.quality : UNKNOWN_QUALITY));
  }

  private sliceWindow(
    pages: string[],
    qualities: string[],
    window: PageWindow,
  ): AnalystPageInput[] {
    const slice: AnalystPageInput[] = [];
    for (let page = window.startPage; page <= window.endPage; page += 1) {
      slice.push({
        page,
        text: pages[page - 1] ?? '',
        quality: qualities[page - 1] ?? UNKNOWN_QUALITY,
      });
    }
    return slice;
  }
}
