import { Injectable } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { PositionedWord } from './page-quality';

export interface PdfPageData {
  page: number;
  text: string;
  words: PositionedWord[];
  hasImages: boolean;
}

export interface PdfExtraction {
  pageCount: number;
  pages: PdfPageData[];
}

interface PdfTextItem {
  str?: unknown;
  transform?: unknown;
}

function toWord(item: PdfTextItem): PositionedWord | null {
  if (typeof item.str !== 'string') {
    return null;
  }
  const transform = item.transform;
  if (!Array.isArray(transform) || typeof transform[4] !== 'number') {
    return { x: 0, y: 0, text: item.str };
  }
  const y = transform[5];
  return { x: transform[4], y: typeof y === 'number' ? y : 0, text: item.str };
}

@Injectable()
export class PdfTextExtractor {
  public async extract(absolutePath: string): Promise<PdfExtraction> {
    // The legacy build is the documented Node.js entry point (v6 warns on other builds).
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const data = new Uint8Array(readFileSync(absolutePath));
    const document = await pdfjs.getDocument({ data }).promise;
    try {
      const pages: PdfPageData[] = [];
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        pages.push(await this.extractPage(pdfjs, document, pageNumber));
      }
      return { pageCount: document.numPages, pages };
    } finally {
      await document.cleanup();
    }
  }

  private async extractPage(
    pdfjs: typeof import('pdfjs-dist'),
    document: { getPage(page: number): Promise<unknown> },
    pageNumber: number,
  ): Promise<PdfPageData> {
    const page = (await document.getPage(pageNumber)) as {
      getTextContent(): Promise<{ items: PdfTextItem[] }>;
      getOperatorList(): Promise<{ fnArray: number[] }>;
    };
    const content = await page.getTextContent();
    const words: PositionedWord[] = [];
    for (const item of content.items) {
      const word = toWord(item);
      if (word !== null) {
        words.push(word);
      }
    }
    const text = words
      .map((word) => word.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    const operators = await page.getOperatorList();
    return {
      page: pageNumber,
      text,
      words,
      hasImages: operators.fnArray.includes(pdfjs.OPS.paintImageXObject),
    };
  }
}
