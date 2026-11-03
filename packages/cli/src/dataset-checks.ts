// Offline dataset validation (acceptance AC-M2-01/02/03). Pure file checks:
// no model calls, no network, no database. Shared by `seed`, `init`, and
// `doctor` so all three agree on what "dataset ready" means.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { RepoPaths } from './paths';

const EXPECTED_COMPANY_DOCS = 41;
const EXPECTED_GRAPH_NODES = 56;
const EXPECTED_GRAPH_EDGES = 80;
const EXPECTED_CAPABILITIES = 9;
const EXPECTED_PROJECTS = 5;
const EXPECTED_TEAM_MEMBERS = 12;
const EXPECTED_SUPPLIERS = 4;
const EXPECTED_TENDER_CASES = 4;
const EXPECTED_TEMPLATES = 6;
const EXPECTED_SCENARIOS = 4;
const PLIEGOS_PER_CASE = 1;

const EXPECTED_VERDICTS: Record<string, string> = {
  A: 'GO',
  B: 'GO_WITH_CONDITIONS',
  C: 'NO_GO',
  D: 'NEEDS_REVIEW',
};

const AMENDMENT_PREFIX = 'D-MENSAJE-PUBLICO';
const SHORTLIST_FILE = 'shortlist.json';

function readJsonFile(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isExplicitlyTrue(value: unknown): boolean {
  return typeof value === 'boolean' && value;
}

function hasVerification(entity: unknown, where: string): void {
  if (!isRecord(entity)) {
    throw new Error(`${where} is not an object.`);
  }
  for (const field of ['verification_level', 'source']) {
    const value = entity[field];
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(`${where} misses a usable ${field}.`);
    }
  }
}

function checkEntityList(value: unknown, expected: number, where: string): void {
  if (!Array.isArray(value) || value.length !== expected) {
    const found = Array.isArray(value) ? value.length : typeof value;
    throw new Error(`${where}: expected ${expected} entries, found ${found}.`);
  }
  value.forEach((entry, index) => hasVerification(entry, `${where}[${index}]`));
}

// AC-M2-01: structured profile + fictional document store.
export function checkCompanyProfile(paths: RepoPaths): string {
  const profilePath = join(paths.companyBrainDir, 'company-profile.json');
  const profile: unknown = readJsonFile(profilePath);
  if (!isRecord(profile) || !isExplicitlyTrue(profile.fictional)) {
    throw new Error('company-profile.json must carry "fictional": true.');
  }
  checkEntityList(profile.capabilities, EXPECTED_CAPABILITIES, 'capabilities');
  checkEntityList(profile.experience, EXPECTED_PROJECTS, 'experience');
  checkEntityList(profile.team, EXPECTED_TEAM_MEMBERS, 'team');
  checkEntityList(profile.suppliers, EXPECTED_SUPPLIERS, 'suppliers');
  hasVerification(profile.legal_representative, 'legal_representative');

  const certifications = profile.certifications;
  if (!isRecord(certifications)) {
    throw new Error('certifications block is missing.');
  }
  // Deliberate planted gaps: no manufacturer authorizations and no company
  // ISO certs. These drive the NO_GO (case C) and conditional (case B) paths,
  // so seed asserts their absence instead of assuming it.
  for (const gap of ['manufacturer_authorizations', 'company_certifications']) {
    const list = certifications[gap];
    if (!Array.isArray(list) || list.length !== 0) {
      throw new Error(`Expected an empty ${gap} list (planted demo gap).`);
    }
  }
  const individuals = certifications.individual;
  if (!Array.isArray(individuals) || individuals.length === 0) {
    throw new Error('Expected at least one individual certification.');
  }
  individuals.forEach((entry, index) => hasVerification(entry, `individual[${index}]`));

  const compliance = profile.compliance;
  if (!isRecord(compliance)) {
    throw new Error('compliance block is missing.');
  }
  for (const key of ['dgii', 'tss', 'rnc', 'mercantile_registry', 'rpe']) {
    if (!isRecord(compliance[key])) {
      throw new Error(`compliance.${key} is missing.`);
    }
  }

  const docNames = readdirSync(join(paths.companyBrainDir, 'docs'));
  if (docNames.length !== EXPECTED_COMPANY_DOCS) {
    throw new Error(`Expected ${EXPECTED_COMPANY_DOCS} company docs, found ${docNames.length}.`);
  }
  const profileJson = JSON.stringify(profile);
  if (!profileJson.includes('FICTIC')) {
    throw new Error('Company profile lost its fictional-use notice.');
  }
  return `${EXPECTED_COMPANY_DOCS} fictional docs, verified profile sections.`;
}

// AC-M2-02: relationship graph integrity.
export function checkDocsGraph(paths: RepoPaths): string {
  const graph: unknown = readJsonFile(join(paths.companyBrainDir, 'docs-graph.json'));
  if (!isRecord(graph)) {
    throw new Error('docs-graph.json must be an object.');
  }
  const nodes = graph.nodes;
  const edges = graph.edges;
  if (!Array.isArray(nodes) || nodes.length !== EXPECTED_GRAPH_NODES) {
    const found = Array.isArray(nodes) ? nodes.length : typeof nodes;
    throw new Error(`Expected ${EXPECTED_GRAPH_NODES} nodes, found ${found}.`);
  }
  if (!Array.isArray(edges) || edges.length !== EXPECTED_GRAPH_EDGES) {
    const found = Array.isArray(edges) ? edges.length : typeof edges;
    throw new Error(`Expected ${EXPECTED_GRAPH_EDGES} edges, found ${found}.`);
  }
  const nodeIds = new Set<string>();
  for (const node of nodes) {
    if (!isRecord(node) || typeof node.id !== 'string') {
      throw new Error('Every graph node needs a string id.');
    }
    nodeIds.add(node.id);
  }
  // Quotation edges point at suppliers (SUP-*) which live in the structured
  // profile, not as graph nodes. An endpoint resolving to a profile supplier
  // is linked, not dangling.
  const profileForSuppliers: unknown = readJsonFile(
    join(paths.companyBrainDir, 'company-profile.json'),
  );
  const supplierIds = new Set<string>();
  if (isRecord(profileForSuppliers) && Array.isArray(profileForSuppliers.suppliers)) {
    for (const supplier of profileForSuppliers.suppliers) {
      if (isRecord(supplier) && typeof supplier.id === 'string') {
        supplierIds.add(supplier.id);
      }
    }
  }
  edges.forEach((edge, index) => {
    if (!isRecord(edge) || typeof edge.from !== 'string' || typeof edge.to !== 'string') {
      throw new Error(`Edge ${index} needs string from/to endpoints.`);
    }
    const fromLinked = nodeIds.has(edge.from) || supplierIds.has(edge.from);
    const toLinked = nodeIds.has(edge.to) || supplierIds.has(edge.to);
    if (!fromLinked || !toLinked) {
      throw new Error(`Edge ${index} dangles (${edge.from} -> ${edge.to}).`);
    }
  });

  // Every evidence id referenced by the profile must map to a real file.
  const profile: unknown = readJsonFile(join(paths.companyBrainDir, 'company-profile.json'));
  const docNames = readdirSync(join(paths.companyBrainDir, 'docs'));
  const evidenceIds = new Set<string>();
  collectEvidenceIds(profile, evidenceIds);
  const missing = [...evidenceIds].filter((id) => !docNames.some((name) => name.includes(id)));
  if (missing.length > 0) {
    throw new Error(`Evidence without a file: ${missing.join(', ')}.`);
  }
  return `${EXPECTED_GRAPH_NODES} nodes, ${EXPECTED_GRAPH_EDGES} edges, evidence linked.`;
}

function collectEvidenceIds(value: unknown, into: Set<string>): void {
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectEvidenceIds(entry, into);
    }
    return;
  }
  if (!isRecord(value)) {
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if ((key === 'evidence_document_ids' || key === 'cv_document_id') && entry !== undefined) {
      const ids = Array.isArray(entry) ? entry : [entry];
      for (const id of ids) {
        if (typeof id === 'string') {
          into.add(id);
        }
      }
    } else {
      collectEvidenceIds(entry, into);
    }
  }
}

// AC-M2-03: tender fixtures (real DGCP originals, read-only).
export function checkTenders(paths: RepoPaths): string {
  const entries = readdirSync(paths.tendersDir).filter((name) => name !== SHORTLIST_FILE);
  if (entries.length !== EXPECTED_TENDER_CASES) {
    throw new Error(`Expected ${EXPECTED_TENDER_CASES} tender cases, found ${entries.length}.`);
  }
  let amendmentCount = 0;
  for (const entry of entries) {
    const caseDir = join(paths.tendersDir, entry);
    const metadata: unknown = readJsonFile(join(caseDir, 'metadata.json'));
    if (!isRecord(metadata) || typeof metadata.code !== 'string') {
      throw new Error(`${entry}/metadata.json misses its tender code.`);
    }
    const originalDir = join(caseDir, 'original');
    if (!existsSync(originalDir)) {
      throw new Error(`${entry} misses its original/ folder.`);
    }
    const files = readdirSync(originalDir);
    const pliegos = files.filter((name) => name.toLowerCase().includes('pliego'));
    if (pliegos.length !== PLIEGOS_PER_CASE) {
      throw new Error(`${entry} must hold exactly one pliego, found ${pliegos.length}.`);
    }
    amendmentCount += files.filter((name) => name.startsWith(AMENDMENT_PREFIX)).length;
  }
  return `${EXPECTED_TENDER_CASES} cases, one pliego each, ${amendmentCount} amendments.`;
}

export function checkTemplates(paths: RepoPaths): string {
  const names = readdirSync(paths.templatesDir);
  if (names.length !== EXPECTED_TEMPLATES) {
    throw new Error(`Expected ${EXPECTED_TEMPLATES} templates, found ${names.length}.`);
  }
  for (const name of names) {
    if (!name.toLowerCase().endsWith('.docx')) {
      throw new Error(`Template ${name} is not a .docx file.`);
    }
    const size = statSync(join(paths.templatesDir, name)).size;
    if (size === 0) {
      throw new Error(`Template ${name} is empty.`);
    }
  }
  return `${EXPECTED_TEMPLATES} non-empty .docx templates.`;
}

export function checkExpectedResults(paths: RepoPaths): string {
  const scenarios: unknown = readJsonFile(join(paths.expectedResultsDir, 'scenarios.json'));
  if (!isRecord(scenarios) || !isExplicitlyTrue(scenarios.fictional)) {
    throw new Error('scenarios.json must carry "fictional": true.');
  }
  const list = scenarios.scenarios;
  if (!Array.isArray(list) || list.length !== EXPECTED_SCENARIOS) {
    throw new Error(`Expected ${EXPECTED_SCENARIOS} design scenarios.`);
  }
  for (const entry of list) {
    if (!isRecord(entry) || typeof entry.case !== 'string') {
      throw new Error('Every scenario needs a case letter.');
    }
    const expected = EXPECTED_VERDICTS[entry.case];
    if (expected === undefined || entry.design_decision !== expected) {
      throw new Error(`Case ${entry.case} must design-resolve to ${expected}.`);
    }
  }
  return `${EXPECTED_SCENARIOS} design verdicts match the benchmark.`;
}
