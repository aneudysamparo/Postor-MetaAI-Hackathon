import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DocxTextExtractor } from './docx-text-extractor';
import {
  PageQuality,
  classifyPageQuality,
  detectDisorderedTable,
  measureMojibake,
} from './page-quality';
import { PdfPageData, PdfTextExtractor } from './pdf-text-extractor';
import { TENDER_SOURCE, TenderFileRef, TenderSource } from './tender-source';

export interface PageExtractionRecord {
  page: number;
  chars: number;
  quality: PageQuality;
  hasImages: boolean;
  mojibakeRatio: number;
  disorderedTable: boolean;
  preview: string;
}

export interface DocumentExtractionRecord {
  extractor: string;
  extractedAt: string;
  kind: string;
  pages: PageExtractionRecord[];
  fullTextChars: number;
  qualityCounts: Record<PageQuality, number>;
  note: string | null;
}

export interface TenderIngestionSummary {
  caseKey: string;
  code: string;
  files: number;
  pages: number;
  qualityCounts: Record<PageQuality, number>;
}

// Stored previews keep the Trace view readable. Full text is never persisted:
// agents re-extract it deterministically from disk via the extractors.
const PREVIEW_CHARS = 500;
const EXTRACTION_FORMAT = 't2.1';
const RD_UTC_OFFSET = '-04:00';

function emptyQualityCounts(): Record<PageQuality, number> {
  return { text: 0, mixed: 0, scanned: 0, poor: 0, failed: 0 };
}

function toPlainJson(record: DocumentExtractionRecord): object {
  return JSON.parse(JSON.stringify(record)) as object;
}

function parseRdCloseDate(value: string | null): Date | null {
  if (value === null) {
    return null;
  }
  const iso = `${value.replace(' ', 'T')}:00${RD_UTC_OFFSET}`;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

@Injectable()
export class DocumentIngestionService {
  public constructor(
    private readonly prisma: PrismaService,
    @Inject(TENDER_SOURCE) private readonly tenderSource: TenderSource,
    private readonly pdfExtractor: PdfTextExtractor,
    private readonly docxExtractor: DocxTextExtractor,
  ) {}

  // Reproducible by design: previous rows for the tender are replaced, so a
  // second run yields byte-identical extraction records.
  public async ingestTender(caseKey: string): Promise<TenderIngestionSummary> {
    const tender = await this.tenderSource.getTender(caseKey);
    const opportunity = await this.prisma.opportunity.upsert({
      where: { code: tender.code },
      update: {
        title: tender.title,
        entity: tender.institution,
        amount: tender.estimatedAmountDop,
        deadline: parseRdCloseDate(tender.closeDateRd),
      },
      create: {
        code: tender.code,
        title: tender.title,
        entity: tender.institution,
        amount: tender.estimatedAmountDop,
        deadline: parseRdCloseDate(tender.closeDateRd),
      },
    });
    await this.prisma.tenderDocument.deleteMany({
      where: { opportunityId: opportunity.id },
    });
    const qualityCounts = emptyQualityCounts();
    let pages = 0;
    for (const file of tender.files) {
      const record = await this.extractFile(file);
      for (const page of record.pages) {
        qualityCounts[page.quality] += 1;
      }
      pages += record.pages.length;
      await this.prisma.tenderDocument.create({
        data: {
          opportunityId: opportunity.id,
          fileName: file.fileName,
          pageCount: record.pages.length,
          sha256: file.sha256,
          extraction: toPlainJson(record),
        },
      });
    }
    return { caseKey, code: tender.code, files: tender.files.length, pages, qualityCounts };
  }

  private async extractFile(file: TenderFileRef): Promise<DocumentExtractionRecord> {
    try {
      if (file.kind === 'pdf') {
        return await this.extractPdf(file);
      }
      if (file.kind === 'docx') {
        return await this.extractDocx(file);
      }
      return this.failedRecord(file.kind, `Unsupported kind for extraction: ${file.kind}.`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return this.failedRecord(file.kind, `Extraction threw: ${detail}`);
    }
  }

  private async extractPdf(file: TenderFileRef): Promise<DocumentExtractionRecord> {
    const pdf = await this.pdfExtractor.extract(file.absolutePath);
    const pages = pdf.pages.map((page) => this.classifyPdfPage(page));
    return this.buildRecord('pdfjs-legacy', file.kind, pages, null);
  }

  private async extractDocx(file: TenderFileRef): Promise<DocumentExtractionRecord> {
    const docx = await this.docxExtractor.extract(file.absolutePath);
    const chars = docx.text.length;
    const page: PageExtractionRecord = {
      page: 1,
      chars,
      quality: chars === 0 ? 'failed' : 'text',
      hasImages: false,
      mojibakeRatio: 0,
      disorderedTable: false,
      preview: docx.text.slice(0, PREVIEW_CHARS),
    };
    const note = chars === 0 ? 'Docx yielded no text.' : null;
    return this.buildRecord('mammoth', file.kind, [page], note);
  }

  private classifyPdfPage(page: PdfPageData): PageExtractionRecord {
    const chars = page.text.length;
    const mojibakeRatio = measureMojibake(page.text);
    const disorderedTable = detectDisorderedTable(page.words);
    const quality = classifyPageQuality({
      chars,
      mojibakeRatio,
      disorderedTable,
      hasImages: page.hasImages,
    });
    return {
      page: page.page,
      chars,
      quality,
      hasImages: page.hasImages,
      mojibakeRatio,
      disorderedTable,
      preview: page.text.slice(0, PREVIEW_CHARS),
    };
  }

  private buildRecord(
    extractor: string,
    kind: string,
    pages: PageExtractionRecord[],
    note: string | null,
  ): DocumentExtractionRecord {
    const qualityCounts = emptyQualityCounts();
    let fullTextChars = 0;
    for (const page of pages) {
      qualityCounts[page.quality] += 1;
      fullTextChars += page.chars;
    }
    return {
      extractor: `${extractor}@${EXTRACTION_FORMAT}`,
      extractedAt: new Date().toISOString(),
      kind,
      pages,
      fullTextChars,
      qualityCounts,
      note,
    };
  }

  private failedRecord(kind: string, note: string): DocumentExtractionRecord {
    return this.buildRecord('none', kind, [], note);
  }
}
