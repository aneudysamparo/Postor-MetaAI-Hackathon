import { Injectable } from '@nestjs/common';
import { DraftOffer, EconomicOffer, PricingFinding, ReviewReport } from '@postor/contracts';
import JSZip from 'jszip';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import {
  F033Line,
  F033Totals,
  FillValues,
  fillF033,
  fillRedRuns,
  insertDemoBanner,
  replaceForeignLeftovers,
} from './bid-document-filler';
import { NormalizedTender } from './tender-source';

export interface GeneratedFile {
  fileName: string;
  kind: 'form' | 'f033' | 'draft';
  source: string;
  pendingMarkers: number;
}

export interface BidDocumentsInput {
  runId: string;
  tender: NormalizedTender;
  profile: unknown;
  pricing: PricingFinding[];
  // Economic offer computed in offer mode; null keeps prices [PENDING].
  offer?: EconomicOffer | null;
  draft: DraftOffer | null;
  review: ReviewReport | null;
}

const DOCUMENT_XML = 'word/document.xml';
const HEADER_XML_PATTERN = /^word\/(header|footer)\d*\.xml$/;
const F033_FILE_PATTERN = /F033/i;
const PENDING_PATTERN = /\[PENDING/g;
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const UNKNOWN_VALUE = '[PENDING: dato no disponible en el perfil]';

// Repo layout: dist/documents/*.js sits four levels below the repo root,
// like resolveDefaultTendersDir. Overridable for deployments.
export function resolveDataDir(): string {
  const override = (process.env.POSTOR_DATA_DIR ?? '').trim();
  if (override.length > 0) {
    return override;
  }
  return join(__dirname, '..', '..', '..', '..', 'data');
}

export function resolveOutputsDir(): string {
  const override = (process.env.POSTOR_OUTPUTS_DIR ?? '').trim();
  if (override.length > 0) {
    return override;
  }
  return join(__dirname, '..', '..', '..', '..', 'storage', 'outputs');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(record: unknown, key: string): string {
  if (isRecord(record) && typeof record[key] === 'string') {
    return record[key] as string;
  }
  return UNKNOWN_VALUE;
}

// Every value comes from the company profile (fictional, DEMO-marked) or the
// tender; a missing key prints a [PENDING] marker instead of a guess.
export function fillValuesFrom(profile: unknown, tender: NormalizedTender): FillValues {
  let company: unknown;
  let representative: unknown;
  if (isRecord(profile)) {
    company = profile.company;
    representative = profile.legal_representative;
  }
  let phones = UNKNOWN_VALUE;
  if (isRecord(company) && Array.isArray(company.phones_fictional)) {
    phones = company.phones_fictional.join(' / ');
  }
  return {
    legalName: readString(company, 'legal_name'),
    rpe: readString(company, 'rpe_fictional'),
    address: readString(company, 'address'),
    phones,
    email: readString(company, 'email'),
    representativeName: readString(representative, 'name'),
    representativePosition: readString(representative, 'position'),
    institution: tender.institution,
    tenderCode: tender.code,
  };
}

// Offer mode: one F.033 line per pliego item with the computed prices.
export function toF033OfferLines(offer: EconomicOffer): F033Line[] {
  return offer.lines.map((line) => {
    let priced: F033Line['offer'] = null;
    if (line.unitOfferDop !== null && line.itbisDop !== null && line.unitFinalDop !== null) {
      priced = {
        unitOfferDop: line.unitOfferDop,
        itbisDop: line.itbisDop,
        unitFinalDop: line.unitFinalDop,
      };
    }
    return {
      description: line.description,
      unit: line.unit,
      quantity: line.quantity,
      referenceCostDop: line.unitCostDop,
      sourceDocCode: line.costSource,
      offer: priced,
    };
  });
}

export function toF033Lines(pricing: PricingFinding[]): F033Line[] {
  return pricing.map((item) => {
    let referenceCostDop: number | null = null;
    if (item.status === 'ok') {
      referenceCostDop = item.unitPrice;
    }
    return {
      description: item.item,
      unit: item.unit,
      quantity: item.quantity,
      referenceCostDop,
      sourceDocCode: item.sourceDocCode ?? null,
    };
  });
}

export function renderDraftMarkdown(
  tender: NormalizedTender,
  draft: DraftOffer,
  review: ReviewReport | null,
): string {
  const lines = [
    `# Borrador de oferta técnica — ${tender.code}`,
    '',
    `> BORRADOR GENERADO POR POSTOR (DEMO). Empresa ficticia. Revisión humana obligatoria; nada se envía automáticamente.`,
    '',
    `**Entidad:** ${tender.institution}  `,
    `**Objeto:** ${tender.title}`,
    '',
  ];
  for (const section of draft.sections) {
    lines.push(`## ${section.title}`, '', section.body, '');
    if (section.requirementIds.length > 0) {
      lines.push(`_Responde a: ${section.requirementIds.join(', ')}_`, '');
    }
  }
  if (draft.assumptions.length > 0) {
    lines.push('## Supuestos', '', ...draft.assumptions.map((item) => `- ${item}`), '');
  }
  if (draft.pendingFields.length > 0) {
    lines.push('## Pendientes', '', ...draft.pendingFields.map((item) => `- ${item}`), '');
  }
  if (review !== null) {
    lines.push(`## Revisión automática: ${review.verdict}`, '');
    lines.push(...review.recommendedFixes.map((fix) => `- ${fix}`), '');
  }
  return lines.join('\n');
}

function countPending(text: string): number {
  return (text.match(PENDING_PATTERN) ?? []).length;
}

// T6.2 (templates) + T6.4 (F.033): writes the editable bid package for one
// run under storage/outputs/<runId>/. Originals are read, never modified.
@Injectable()
export class BidDocumentsService {
  public async generate(input: BidDocumentsInput): Promise<GeneratedFile[]> {
    const outputDir = join(resolveOutputsDir(), input.runId);
    mkdirSync(outputDir, { recursive: true });
    const values = fillValuesFrom(input.profile, input.tender);
    const files: GeneratedFile[] = [];
    const templatesDir = join(resolveDataDir(), 'templates');
    for (const name of readdirSync(templatesDir).filter((entry) => entry.endsWith('.docx'))) {
      const result = await this.fillDocx(join(templatesDir, name), (xml, isBody) => {
        let filled = replaceForeignLeftovers(
          fillRedRuns(xml, values),
          input.tender.code,
          input.tender.institution,
        );
        if (isBody) {
          filled = insertDemoBanner(filled);
        }
        return filled;
      });
      writeFileSync(join(outputDir, name), result.buffer);
      files.push({
        fileName: name,
        kind: 'form',
        source: `data/templates/${name}`,
        pendingMarkers: result.pending,
      });
    }
    const f033 = input.tender.files.find((file) => F033_FILE_PATTERN.test(file.fileName));
    if (f033 !== undefined) {
      const offer = input.offer ?? null;
      let lines = toF033Lines(input.pricing);
      let totals: F033Totals | null = null;
      if (offer !== null) {
        lines = toF033OfferLines(offer);
        const complete = offer.status !== 'incomplete';
        if (complete) {
          totals = { totalDop: offer.offerTotalDop, amountInWords: offer.amountInWords };
        }
      }
      const outputName = 'SNCC_F033_Oferta_Economica_BORRADOR.docx';
      const result = await this.fillDocx(f033.absolutePath, (xml, isBody) => {
        if (!isBody) {
          return xml;
        }
        return insertDemoBanner(fillF033(xml, lines, values.legalName, totals));
      });
      writeFileSync(join(outputDir, outputName), result.buffer);
      files.push({
        fileName: outputName,
        kind: 'f033',
        source: f033.fileName,
        pendingMarkers: result.pending,
      });
    }
    if (input.draft !== null) {
      const markdown = renderDraftMarkdown(input.tender, input.draft, input.review);
      const outputName = 'borrador-oferta-tecnica.md';
      writeFileSync(join(outputDir, outputName), markdown, 'utf8');
      files.push({
        fileName: outputName,
        kind: 'draft',
        source: 'writer',
        pendingMarkers: countPending(markdown),
      });
    }
    return files;
  }

  public readOutput(runId: string, fileName: string): { buffer: Buffer; mime: string } {
    const safeName = basename(fileName);
    const buffer = readFileSync(join(resolveOutputsDir(), basename(runId), safeName));
    let mime = 'text/markdown; charset=utf-8';
    if (safeName.endsWith('.docx')) {
      mime = DOCX_MIME;
    }
    return { buffer, mime };
  }

  private async fillDocx(
    path: string,
    transform: (xml: string, isBody: boolean) => string,
  ): Promise<{ buffer: Buffer; pending: number }> {
    const zip = await JSZip.loadAsync(readFileSync(path));
    let pending = 0;
    for (const entryName of Object.keys(zip.files)) {
      const isBody = entryName === DOCUMENT_XML;
      if (!isBody && !HEADER_XML_PATTERN.test(entryName)) {
        continue;
      }
      const entry = zip.file(entryName);
      if (entry === null) {
        continue;
      }
      const transformed = transform(await entry.async('string'), isBody);
      pending += countPending(transformed);
      zip.file(entryName, transformed);
    }
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    return { buffer, pending };
  }
}
