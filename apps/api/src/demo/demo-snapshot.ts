// Recorded demo runs (judges without an API key). The snapshot holds the
// latest usable run per tender: events, agent runs, every model call (prompt,
// response, tokens, duration), artifacts and evidence rows. Nothing is
// simulated: these are real runs exported from a live database.
//
// Database ids are machine-local (cuids minted at ingestion and brain load),
// so the snapshot also stores NATURAL keys for the rows it references:
// opportunity -> tender code, tender document -> code + file name, company
// -> name. Import rebuilds those rows locally, maps old ids to new ones, and
// rewrites every occurrence before inserting.
import { INestApplicationContext } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { readFileSync, writeFileSync } from 'node:fs';
import { BidDocumentsService } from '../documents/bid-documents.service';
import { DocumentIngestionService } from '../documents/document-ingestion.service';
import { TENDER_SOURCE, TenderSource } from '../documents/tender-source';
import { PrismaService } from '../prisma/prisma.service';
import { DemoResetService } from '../workflow/demo-reset.service';

const SNAPSHOT_VERSION = 1;
const USABLE_STATUSES = new Set(['completed', 'needs_review']);
const JSON_INDENT = 1;

interface NaturalKeys {
  opportunities: Record<string, string>;
  documents: Record<string, string>;
  companies: Record<string, string>;
}

export interface DemoSnapshot {
  version: number;
  exportedAt: string;
  keys: NaturalKeys;
  runs: unknown[];
}

function documentKey(code: string, fileName: string): string {
  return `${code}::${fileName}`;
}

// Pure (unit-tested): replaces every old id with its local id. cuids are
// unique 25-char tokens, so a plain textual replacement is unambiguous.
export function remapIds(serialized: string, idMap: Map<string, string>): string {
  let result = serialized;
  for (const [oldId, newId] of idMap) {
    if (oldId !== newId) {
      result = result.split(oldId).join(newId);
    }
  }
  return result;
}

export async function exportSnapshot(
  app: INestApplicationContext,
  path: string,
): Promise<string[]> {
  const prisma = app.get(PrismaService);
  const reset = app.get(DemoResetService);
  const opportunities = await prisma.opportunity.findMany({ include: { documents: true } });
  const keys: NaturalKeys = { opportunities: {}, documents: {}, companies: {} };
  const runs: unknown[] = [];
  const exported: string[] = [];
  for (const opportunity of opportunities) {
    keys.opportunities[opportunity.id] = opportunity.code;
    for (const document of opportunity.documents) {
      keys.documents[document.id] = documentKey(opportunity.code, document.fileName);
    }
    const candidates = await prisma.workflowRun.findMany({
      where: { opportunityId: opportunity.id },
      orderBy: { startedAt: 'desc' },
    });
    const latest = candidates.find(
      (run) => USABLE_STATUSES.has(run.status) && reset.isVisible(opportunity.id, run.startedAt),
    );
    if (latest === undefined) {
      continue;
    }
    const run = await prisma.workflowRun.findUniqueOrThrow({
      where: { id: latest.id },
      include: {
        events: true,
        agentRuns: { include: { modelCalls: true } },
        artifacts: { include: { evidence: true } },
      },
    });
    const company = await prisma.company.findUniqueOrThrow({ where: { id: run.companyId } });
    keys.companies[company.id] = company.name;
    runs.push(run);
    exported.push(`${opportunity.code} ${run.id} ${run.status}`);
  }
  const snapshot: DemoSnapshot = {
    version: SNAPSHOT_VERSION,
    exportedAt: new Date().toISOString(),
    keys,
    runs,
  };
  writeFileSync(path, JSON.stringify(snapshot, null, JSON_INDENT));
  return exported;
}

interface SnapshotRun {
  id: string;
  opportunityId: string;
  companyId: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  events: Record<string, unknown>[];
  agentRuns: (Record<string, unknown> & { modelCalls: Record<string, unknown>[] })[];
  artifacts: (Record<string, unknown> & { evidence: Record<string, unknown>[] })[];
}

function toDate(value: unknown): Date | null {
  if (typeof value !== 'string') {
    return null;
  }
  return new Date(value);
}

export async function importSnapshot(
  app: INestApplicationContext,
  path: string,
): Promise<string[]> {
  const prisma = app.get(PrismaService);
  const ingestion = app.get(DocumentIngestionService);
  const tenderSource = app.get<TenderSource>(TENDER_SOURCE);
  const bidDocuments = app.get(BidDocumentsService);
  const raw = readFileSync(path, 'utf8');
  const snapshot = JSON.parse(raw) as DemoSnapshot;
  const idMap = new Map<string, string>();

  // Companies by name (loaded by brain:load during init).
  for (const [oldId, name] of Object.entries(snapshot.keys.companies)) {
    const company = await prisma.company.findFirst({ where: { name } });
    if (company === null) {
      throw new Error(`Company "${name}" is not loaded; run init (brain-load) first.`);
    }
    idMap.set(oldId, company.id);
  }
  // Tenders: ingest locally (no model call), then map by code / file name.
  const tenders = await tenderSource.listTenders();
  for (const [oldId, code] of Object.entries(snapshot.keys.opportunities)) {
    const tender = tenders.find((entry) => entry.code === code);
    if (tender === undefined) {
      continue;
    }
    let opportunity = await prisma.opportunity.findUnique({
      where: { code },
      include: { documents: true },
    });
    if (opportunity === null || opportunity.documents.length === 0) {
      await ingestion.ingestTender(tender.caseKey);
      opportunity = await prisma.opportunity.findUnique({
        where: { code },
        include: { documents: true },
      });
    }
    if (opportunity === null) {
      continue;
    }
    idMap.set(oldId, opportunity.id);
    for (const document of opportunity.documents) {
      const key = documentKey(code, document.fileName);
      const oldDocumentId = Object.entries(snapshot.keys.documents).find(
        ([, value]) => value === key,
      )?.[0];
      if (oldDocumentId !== undefined) {
        idMap.set(oldDocumentId, document.id);
      }
    }
  }

  const runs = JSON.parse(remapIds(JSON.stringify(snapshot.runs), idMap)) as SnapshotRun[];
  const imported: string[] = [];
  for (const run of runs) {
    const exists = await prisma.workflowRun.findUnique({ where: { id: run.id } });
    if (exists !== null) {
      imported.push(`${run.id} already present`);
      continue;
    }
    await prisma.workflowRun.create({
      data: {
        id: run.id,
        opportunityId: run.opportunityId,
        companyId: run.companyId,
        status: run.status,
        startedAt: new Date(run.startedAt),
        finishedAt: toDate(run.finishedAt),
      },
    });
    for (const event of run.events) {
      await prisma.workflowEvent.create({
        data: {
          id: String(event.id),
          workflowId: run.id,
          type: String(event.type),
          agent: (event.agent as string | null) ?? null,
          refId: (event.refId as string | null) ?? null,
          metadata: (event.metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          createdAt: new Date(String(event.createdAt)),
        },
      });
    }
    for (const agentRun of run.agentRuns) {
      await prisma.agentRun.create({
        data: {
          id: String(agentRun.id),
          workflowId: run.id,
          agent: String(agentRun.agent),
          task: String(agentRun.task),
          status: String(agentRun.status),
          attempt: Number(agentRun.attempt),
          inputIds: agentRun.inputIds as Prisma.InputJsonValue,
          outputIds: agentRun.outputIds as Prisma.InputJsonValue,
          startedAt: new Date(String(agentRun.startedAt)),
          finishedAt: toDate(agentRun.finishedAt),
          error: (agentRun.error as string | null) ?? null,
        },
      });
      for (const call of agentRun.modelCalls) {
        await prisma.modelCall.create({
          data: {
            ...(call as Prisma.ModelCallUncheckedCreateInput),
            agentRunId: String(agentRun.id),
            requestParams: (call.requestParams ?? Prisma.JsonNull) as Prisma.InputJsonValue,
            responseRaw: (call.responseRaw ?? Prisma.JsonNull) as Prisma.InputJsonValue,
            responseNorm: (call.responseNorm ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          },
        });
      }
    }
    for (const artifact of run.artifacts) {
      await prisma.artifact.create({
        data: {
          id: String(artifact.id),
          workflowId: run.id,
          type: String(artifact.type),
          producedBy: String(artifact.producedBy),
          version: Number(artifact.version),
          data: artifact.data as Prisma.InputJsonValue,
          status: String(artifact.status),
          createdAt: new Date(String(artifact.createdAt)),
        },
      });
      for (const evidence of artifact.evidence) {
        await prisma.artifactEvidence.create({
          data: {
            ...(evidence as Prisma.ArtifactEvidenceUncheckedCreateInput),
            region: (evidence.region ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          },
        });
      }
    }
    await regenerateBidFiles(run, prisma, tenderSource, bidDocuments);
    imported.push(`${run.id} ${run.status}`);
  }
  return imported;
}

// The generated forms/F.033/draft are deterministic outputs of the stored
// artifacts, so they are rebuilt locally instead of shipping .docx files.
async function regenerateBidFiles(
  run: SnapshotRun,
  prisma: PrismaService,
  tenderSource: TenderSource,
  bidDocuments: BidDocumentsService,
): Promise<void> {
  const opportunity = await prisma.opportunity.findUnique({ where: { id: run.opportunityId } });
  const company = await prisma.company.findUnique({ where: { id: run.companyId } });
  const tender = (await tenderSource.listTenders()).find(
    (entry) => entry.code === opportunity?.code,
  );
  if (opportunity === null || company === null || tender === undefined) {
    return;
  }
  const dataOf = (type: string): Record<string, unknown> => {
    const artifact = run.artifacts.find((entry) => entry.type === type);
    return (artifact?.data ?? {}) as Record<string, unknown>;
  };
  const hasDocuments = run.artifacts.some((entry) => entry.type === 'bid_documents');
  if (!hasDocuments) {
    return;
  }
  await bidDocuments.generate({
    runId: run.id,
    tender,
    profile: company.profile,
    pricing: (dataOf('pricing').items ?? []) as never,
    draft: (dataOf('draft_offer').draft ?? null) as never,
    review: (dataOf('review_report').review ?? null) as never,
  });
}
