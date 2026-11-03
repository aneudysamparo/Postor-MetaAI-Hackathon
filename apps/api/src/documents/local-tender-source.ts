import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  NormalizedTender,
  TenderFileKind,
  TenderFileRef,
  TenderFileRole,
  TenderSource,
} from './tender-source';

const SHORTLIST_FILE = 'shortlist.json';
const ORIGINAL_DIR = 'original';
const METADATA_FILE = 'metadata.json';
const AMENDMENT_PREFIX = 'D-MENSAJE-PUBLICO';
const PLIEGOS_PER_CASE = 1;

const FORM_NAME_HINT =
  /sncc|f0\d\d|d0\d\d|debida|compromiso|declaraci|jurada|diligencia|formulario|oferente|oferta/i;
const TECHNICAL_NAME_HINT = /especific|ficha|t[eé]cnica|estudio|plano|t[eé]rminos/i;
const ADMIN_NAME_HINT =
  /acta|solicitud|convocatoria|aprobaci|contrato|odigo|tico|politica|denuncia|dictamen|monitoreo|enmienda|circular|respuesta|informe|correo|mercado|requerimiento|recomendaci|peritos|compra/i;

export function resolveDefaultTendersDir(): string {
  const override = (process.env.TENDER_DATA_DIR ?? '').trim();
  if (override.length > 0) {
    return override;
  }
  // dist/documents/*.js (or src/documents/*.ts under tsx) sit four levels below the repo root.
  return join(__dirname, '..', '..', '..', '..', 'data', 'tenders');
}

function classifyKind(fileName: string): TenderFileKind {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.pdf')) {
    return 'pdf';
  }
  if (lower.endsWith('.docx')) {
    return 'docx';
  }
  return 'other';
}

function classifyRole(fileName: string): TenderFileRole {
  if (fileName.toLowerCase().includes('pliego')) {
    return 'pliego';
  }
  if (fileName.startsWith(AMENDMENT_PREFIX)) {
    return 'amendment';
  }
  // Best-effort labels for browsing; only pliego/amendment drive the pipeline.
  if (FORM_NAME_HINT.test(fileName)) {
    return 'form';
  }
  if (TECHNICAL_NAME_HINT.test(fileName)) {
    return 'technical';
  }
  if (ADMIN_NAME_HINT.test(fileName)) {
    return 'admin';
  }
  return 'other';
}

function sha256Of(absolutePath: string): string {
  return createHash('sha256').update(readFileSync(absolutePath)).digest('hex');
}

interface TenderMetadata {
  code?: unknown;
  institution?: unknown;
  title?: unknown;
  estimated_amount_dop?: unknown;
  close_date_rd?: unknown;
  modality?: unknown;
  portal_url?: unknown;
}

function toText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function toNullableText(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

@Injectable()
export class LocalTenderSource implements TenderSource {
  public constructor(private readonly tendersDir: string = resolveDefaultTendersDir()) {}

  public async listTenders(): Promise<NormalizedTender[]> {
    const caseKeys = readdirSync(this.tendersDir)
      .filter((name) => name !== SHORTLIST_FILE && !name.startsWith('.'))
      .sort();
    const tenders: NormalizedTender[] = [];
    for (const caseKey of caseKeys) {
      tenders.push(await this.getTender(caseKey));
    }
    return tenders;
  }

  public async getTender(caseKey: string): Promise<NormalizedTender> {
    const caseDir = join(this.tendersDir, caseKey);
    const metadata = JSON.parse(
      readFileSync(join(caseDir, METADATA_FILE), 'utf8'),
    ) as TenderMetadata;
    const originalDir = join(caseDir, ORIGINAL_DIR);
    if (!existsSync(originalDir)) {
      throw new Error(`Tender ${caseKey} misses its ${ORIGINAL_DIR}/ folder.`);
    }
    const files: TenderFileRef[] = readdirSync(originalDir)
      .filter((name) => !name.startsWith('.'))
      .sort()
      .map((fileName) => {
        const absolutePath = join(originalDir, fileName);
        return {
          fileName,
          absolutePath,
          sizeBytes: statSync(absolutePath).size,
          sha256: sha256Of(absolutePath),
          kind: classifyKind(fileName),
          role: classifyRole(fileName),
        };
      });
    const pliegos = files.filter((file) => file.role === 'pliego');
    if (pliegos.length !== PLIEGOS_PER_CASE) {
      const names = pliegos.map((file) => file.fileName).join(', ');
      throw new Error(
        `Tender ${caseKey} must hold exactly one pliego, found ${pliegos.length} (${names}).`,
      );
    }
    return {
      caseKey,
      code: toText(metadata.code),
      institution: toText(metadata.institution),
      title: toText(metadata.title),
      estimatedAmountDop: toNullableNumber(metadata.estimated_amount_dop),
      closeDateRd: toNullableText(metadata.close_date_rd),
      modality: toText(metadata.modality),
      portalUrl: toNullableText(metadata.portal_url),
      files,
      pliego: pliegos[0],
      amendments: files.filter((file) => file.role === 'amendment'),
    };
  }
}
