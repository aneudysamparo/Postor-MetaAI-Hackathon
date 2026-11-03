import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { CompanyDocReader } from './company-doc-reader';
import { EmbeddingProvider, HashEmbeddingProvider } from './embedding-provider';
import { chunkText } from './text-chunker';

export interface BrainLoadStats {
  companyId: string;
  companyName: string;
  documents: number;
  chunks: number;
  skipped: string[];
}

const PROFILE_FILE = 'company-profile.json';
const DOCS_DIR = 'docs';
const SEED_SOURCE = 'company-brain seed (T2B)';
const SEEDED_VERIFICATION = 'extracted_unverified';

const DOCUMENT_TYPE_PREFIXES: Array<[string, string]> = [
  ['DOC-CONTRACT', 'contract'],
  ['DOC-INVOICE', 'invoice'],
  ['DOC-INV-', 'invoice'],
  ['DOC-ACCEPTANCE', 'acceptance'],
  ['DOC-REF', 'reference'],
  ['DOC-CV', 'cv'],
  ['DOC-CERT', 'certification'],
  ['DOC-LEGAL', 'legal'],
  ['DOC-FIN', 'financial'],
  ['DOC-QUOT', 'quotation'],
  ['DOC-TEAM', 'team_roster'],
  ['DOC-CORP', 'corporate_profile'],
];

function inferDocumentType(fileName: string): string {
  const upper = fileName.toUpperCase();
  for (const [prefix, type] of DOCUMENT_TYPE_PREFIXES) {
    if (upper.startsWith(prefix)) {
      return type;
    }
  }
  return 'other';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

@Injectable()
export class CompanyBrainLoader {
  private readonly embeddings: EmbeddingProvider = new HashEmbeddingProvider();

  public constructor(
    private readonly prisma: PrismaService,
    private readonly docReader: CompanyDocReader,
  ) {}

  // Wipe-and-reload per company: extraction is deterministic, so a second load
  // yields the identical brain. Skipped files are reported, never silent.
  public async loadCompanyBrain(companyBrainDir: string): Promise<BrainLoadStats> {
    const profile = JSON.parse(
      readFileSync(join(companyBrainDir, PROFILE_FILE), 'utf8'),
    ) as unknown;
    if (!isRecord(profile) || !isRecord(profile.company)) {
      throw new Error('company-profile.json misses its company block.');
    }
    const companyBlock = profile.company;
    const companyName =
      typeof companyBlock.legal_name === 'string' ? companyBlock.legal_name : 'unknown';
    const existing = await this.prisma.company.findFirst({ where: { name: companyName } });
    const company =
      existing === null
        ? await this.prisma.company.create({
            data: {
              name: companyName,
              rnc: typeof companyBlock.rnc_fictional === 'string' ? companyBlock.rnc_fictional : '',
              profile: JSON.parse(JSON.stringify(profile)) as object,
              isFictional: true,
            },
          })
        : await this.prisma.company.update({
            where: { id: existing.id },
            data: { profile: JSON.parse(JSON.stringify(profile)) as object },
          });
    await this.prisma.companyBrainDoc.deleteMany({ where: { companyId: company.id } });

    const fileNames = readdirSync(join(companyBrainDir, DOCS_DIR))
      .filter((name) => !name.startsWith('.'))
      .sort();
    const skipped: string[] = [];
    let chunks = 0;
    for (const fileName of fileNames) {
      try {
        chunks += await this.loadOneDocument(company.id, companyBrainDir, fileName);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        skipped.push(`${fileName}: ${detail}`);
      }
    }
    const documents = fileNames.length - skipped.length;
    return { companyId: company.id, companyName, documents, chunks, skipped };
  }

  private async loadOneDocument(
    companyId: string,
    companyBrainDir: string,
    fileName: string,
  ): Promise<number> {
    const absolutePath = join(companyBrainDir, DOCS_DIR, fileName);
    const { text, pageBreaks } = await this.docReader.readDocument(absolutePath, fileName);
    const parts = chunkText(text, pageBreaks);
    const vectors = await this.embeddings.embed(parts.map((part) => part.text));
    const sha256 = createHash('sha256').update(readFileSync(absolutePath)).digest('hex');
    const document = await this.prisma.companyBrainDoc.create({
      data: {
        companyId,
        documentType: inferDocumentType(fileName),
        verificationStatus: SEEDED_VERIFICATION,
        source: SEED_SOURCE,
        fileName,
        sha256,
      },
    });
    for (let index = 0; index < parts.length; index += 1) {
      await this.prisma.brainChunk.create({
        data: {
          documentId: document.id,
          page: parts[index].page,
          text: parts[index].text,
          embedding: vectors[index],
        },
      });
    }
    return parts.length;
  }
}
