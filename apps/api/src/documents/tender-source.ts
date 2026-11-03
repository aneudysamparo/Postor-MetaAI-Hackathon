// TenderSource: the seam between the demo and production tender feeds.
// Agents and the orchestrator only see this interface. The demo serves local
// fixtures (LocalTenderSource); production will serve the external procurement
// API with identical DTOs (ApiTenderSource).
export type TenderFileKind = 'pdf' | 'docx' | 'other';

export type TenderFileRole = 'pliego' | 'amendment' | 'form' | 'technical' | 'admin' | 'other';

export interface TenderFileRef {
  fileName: string;
  absolutePath: string;
  sizeBytes: number;
  sha256: string;
  kind: TenderFileKind;
  role: TenderFileRole;
}

export interface NormalizedTender {
  caseKey: string;
  code: string;
  institution: string;
  title: string;
  estimatedAmountDop: number | null;
  closeDateRd: string | null;
  modality: string;
  portalUrl: string | null;
  files: TenderFileRef[];
  pliego: TenderFileRef;
  amendments: TenderFileRef[];
}

export interface TenderSource {
  listTenders(): Promise<NormalizedTender[]>;
  getTender(caseKey: string): Promise<NormalizedTender>;
}

export const TENDER_SOURCE = Symbol('TENDER_SOURCE');
