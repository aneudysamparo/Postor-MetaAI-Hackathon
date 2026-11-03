import { Injectable } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { DocxTextExtractor } from '../documents/docx-text-extractor';
import { PdfTextExtractor } from '../documents/pdf-text-extractor';
import { PageBreak } from './text-chunker';

export interface CompanyDocumentText {
  text: string;
  pageBreaks: PageBreak[];
}

const PAGE_SEPARATOR = '\n\n';
const PLAIN_TEXT_EXTENSIONS = ['.md', '.csv', '.txt'];

@Injectable()
export class CompanyDocReader {
  public constructor(
    private readonly pdfExtractor: PdfTextExtractor,
    private readonly docxExtractor: DocxTextExtractor,
  ) {}

  public async readDocument(absolutePath: string, fileName: string): Promise<CompanyDocumentText> {
    const lower = fileName.toLowerCase();
    if (lower.endsWith('.pdf')) {
      return this.readPdf(absolutePath);
    }
    if (lower.endsWith('.docx')) {
      const docx = await this.docxExtractor.extract(absolutePath);
      return { text: docx.text, pageBreaks: [{ page: null, startChar: 0 }] };
    }
    if (PLAIN_TEXT_EXTENSIONS.some((extension) => lower.endsWith(extension))) {
      const text = readFileSync(absolutePath, 'utf8').replace(/\s+/g, ' ').trim();
      return { text, pageBreaks: [{ page: null, startChar: 0 }] };
    }
    throw new Error(`No reader for company file: ${fileName}.`);
  }

  private async readPdf(absolutePath: string): Promise<CompanyDocumentText> {
    const pdf = await this.pdfExtractor.extract(absolutePath);
    const parts: string[] = [];
    const pageBreaks: PageBreak[] = [];
    let offset = 0;
    for (const page of pdf.pages) {
      pageBreaks.push({ page: page.page, startChar: offset });
      parts.push(page.text);
      offset += page.text.length + PAGE_SEPARATOR.length;
    }
    return { text: parts.join(PAGE_SEPARATOR), pageBreaks };
  }
}
