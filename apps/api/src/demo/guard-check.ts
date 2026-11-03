// Document guard check for any file (demo + diagnostics):
//   node dist/demo/guard-check.js <file.pdf|file.docx|file.txt>
// Extracts the text per page, chunks it like the pipeline does, scores it
// with Meta Llama Prompt Guard 2 (POSTOR_GUARD_URL) and prints the result.
import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { DocxTextExtractor } from '../documents/docx-text-extractor';
import { PdfTextExtractor } from '../documents/pdf-text-extractor';
import { DocumentGuardService, chunkForGuard } from '../models/document-guard.service';
import { loadRuntimeEnv } from '../runtime-env';

const PERCENT_SCALE = 100;
const EXCERPT_CHARS = 110;

async function pageTexts(path: string): Promise<string[]> {
  const extension = extname(path).toLowerCase();
  if (extension === '.pdf') {
    const extraction = await new PdfTextExtractor().extract(path);
    return extraction.pages.map((page) => page.text);
  }
  if (extension === '.docx') {
    const extraction = await new DocxTextExtractor().extract(path);
    return [extraction.text];
  }
  return [readFileSync(path, 'utf8')];
}

async function main(): Promise<void> {
  loadRuntimeEnv();
  const path = process.argv[2];
  if (path === undefined) {
    throw new Error('Usage: guard-check.js <file.pdf|file.docx|file.txt>');
  }
  const pages = await pageTexts(path);
  const chunks = pages.flatMap((text, index) =>
    chunkForGuard(text).map((chunk) => ({ fileName: path, page: index + 1, text: chunk })),
  );
  const scan = await new DocumentGuardService().scan(chunks);
  process.stdout.write(
    `${scan.model}: ${scan.scannedChunks} chunks, threshold ${scan.threshold}, flagged ${scan.flagged.length}\n`,
  );
  for (const finding of scan.flagged) {
    const percent = Math.round(finding.score * PERCENT_SCALE);
    process.stdout.write(
      `  FLAGGED p${finding.page} ${percent}%: ${finding.text.slice(0, EXCERPT_CHARS)}…\n`,
    );
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
