// Lite mode (fast demo path): instead of reading 37-56 page pliegos in
// 12-page windows, the analyst step reads a curated "dossier simplificado"
// per tender: the key requirements, each citing the original file + page.
//
// The dossiers were authored together with the design oracle, so they also
// carry the expected answer ("Decisivo", "Estado esperado", evidence notes
// in "Fuente original", "Lectura del caso", "Veredicto de diseño", and
// review-point rows). NONE of that reaches the agents: this parser keeps
// only requirement id, requirement text, type, and the cited file + page.
// Compliance must reach its own verdict against the Company Brain.
import { TenderRequirement, TenderRequirementSchema } from '@postor/contracts';

export interface DossierRow {
  rowId: string;
  text: string;
  kind: string;
  sourceFile: string | null;
  sourcePage: number | null;
}

export interface DossierDocument {
  id: string;
  fileName: string;
  pageCount: number;
}

const TABLE_ROW_PATTERN = /^\|\s*(R[A-Z]-\d+)\s*\|/;
const FILE_PATTERN = /`([^`]+)`/;
const PAGE_PATTERN = /\bp(\d+)\b/;
// Rows the oracle added as conclusions about the company (not tender
// requirements). The verdict computes these itself (e.g. concentration).
const ORACLE_ROW_MARKERS = ['PUNTO DE REVISIÓN'];
const MARKDOWN_EMPHASIS = /\*\*/g;
const KIND_TO_CATEGORY: Record<string, TenderRequirement['category']> = {
  técnico: 'technical',
  tecnico: 'technical',
  legal: 'legal',
  financiero: 'economic',
  económico: 'economic',
  economico: 'economic',
  administrativo: 'administrative',
};
const FIRST_PAGE = 1;
const VERIFIED_CONFIDENCE = 0.9;
const UNPAGED_CONFIDENCE = 0.5;
// Column positions in the dossier table:
// | ID | Requisito | Tipo | Decisivo | Estado esperado | Fuente original |
const COLUMN_ID = 0;
const COLUMN_TEXT = 1;
const COLUMN_KIND = 2;
const COLUMN_SOURCE = 5;

function cellsOf(line: string): string[] {
  return line
    .split('|')
    .slice(1, -1)
    .map((cell) => cell.trim());
}

export function parseDossier(markdown: string): DossierRow[] {
  const rows: DossierRow[] = [];
  for (const line of markdown.split('\n')) {
    if (!TABLE_ROW_PATTERN.test(line)) {
      continue;
    }
    const cells = cellsOf(line);
    const text = (cells[COLUMN_TEXT] ?? '').replace(MARKDOWN_EMPHASIS, '').trim();
    const isOracleRow = ORACLE_ROW_MARKERS.some((marker) => text.includes(marker));
    if (isOracleRow || text.length === 0) {
      continue;
    }
    // Only the cited file and page survive from the source column; its
    // free text (evidence notes, "CONDICIÓN", "brecha deliberada") is the
    // oracle's reasoning and is discarded.
    const source = cells[COLUMN_SOURCE] ?? '';
    const fileMatch = FILE_PATTERN.exec(source);
    const pageMatch = PAGE_PATTERN.exec(source);
    let sourcePage: number | null = null;
    if (pageMatch !== null) {
      sourcePage = Number(pageMatch[1]);
    }
    rows.push({
      rowId: cells[COLUMN_ID] ?? '',
      text,
      kind: (cells[COLUMN_KIND] ?? '').toLowerCase(),
      sourceFile: fileMatch?.[1] ?? null,
      sourcePage,
    });
  }
  return rows;
}

// Maps dossier rows to contract requirements. A row citing a known tender
// file + page is "verified" and opens that exact page; a row without a
// usable citation points at the pliego's first page, flagged "unknown"
// with lower confidence, so the UI never pretends to a precise citation.
export function toLiteRequirements(
  rows: DossierRow[],
  documents: DossierDocument[],
  pliego: DossierDocument,
): TenderRequirement[] {
  const byFileName = new Map(documents.map((document) => [document.fileName, document]));
  return rows.map((row) => {
    let cited: DossierDocument | undefined;
    if (row.sourceFile !== null) {
      cited = byFileName.get(row.sourceFile);
    }
    const document = cited ?? pliego;
    const pageIsValid =
      cited !== undefined &&
      row.sourcePage !== null &&
      row.sourcePage >= FIRST_PAGE &&
      row.sourcePage <= Math.max(document.pageCount, FIRST_PAGE);
    let page = FIRST_PAGE;
    let status: TenderRequirement['status'] = 'unknown';
    let confidence = UNPAGED_CONFIDENCE;
    if (pageIsValid && row.sourcePage !== null) {
      page = row.sourcePage;
      status = 'verified';
      confidence = VERIFIED_CONFIDENCE;
    }
    const baseId = `${document.id}-p${page}-${row.rowId}`;
    return TenderRequirementSchema.parse({
      id: baseId,
      category: KIND_TO_CATEGORY[row.kind] ?? 'administrative',
      title: row.text,
      originalText: row.text,
      plainExplanation:
        'Key requirement from the lite dossier (a summary); open the cited page for the exact pliego wording.',
      mandatory: true,
      source: {
        documentId: document.id,
        page,
        section: `Lite dossier ${row.rowId}`,
        evidenceId: `${baseId}-ev`,
        method: 'text',
      },
      confidence,
      status,
    });
  });
}

// Lite Company Brain: the DOC codes the lite manifest lists as decisive.
export function liteDocCodes(manifest: unknown): string[] {
  if (typeof manifest !== 'object' || manifest === null) {
    return [];
  }
  const documents = (manifest as { documents?: unknown }).documents;
  if (!Array.isArray(documents)) {
    return [];
  }
  return documents
    .map((entry) => (entry as { doc_id?: unknown }).doc_id)
    .filter((code): code is string => typeof code === 'string');
}
