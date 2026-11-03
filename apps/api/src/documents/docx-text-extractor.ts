import { Injectable } from '@nestjs/common';
import { extractRawText } from 'mammoth';
import { readFileSync } from 'node:fs';

export interface DocxExtraction {
  text: string;
}

@Injectable()
export class DocxTextExtractor {
  public async extract(absolutePath: string): Promise<DocxExtraction> {
    const result = await extractRawText({ buffer: readFileSync(absolutePath) });
    return { text: result.value.replace(/\s+/g, ' ').trim() };
  }
}
