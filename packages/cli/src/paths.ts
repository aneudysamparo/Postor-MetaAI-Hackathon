// Single place resolving every path the CLIs touch, so a judge can run them
// from the repo root and every consumer agrees on locations.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface RepoPaths {
  root: string;
  envFile: string;
  envExample: string;
  apiEnvLink: string;
  dataDir: string;
  companyBrainDir: string;
  tendersDir: string;
  templatesDir: string;
  expectedResultsDir: string;
  storageDir: string;
  readinessFile: string;
  sqliteBaselineFile: string;
  apiPrismaDir: string;
  apiDistDir: string;
}

export function resolveRepoPaths(): RepoPaths {
  // This file lives at <root>/packages/cli/src (or dist) — three levels down.
  const here = dirname(fileURLToPath(import.meta.url));
  const root = join(here, '..', '..', '..');
  const storageDir = join(root, 'storage');
  return {
    root,
    envFile: join(root, '.env'),
    envExample: join(root, '.env.example'),
    apiEnvLink: join(root, 'apps', 'api', '.env'),
    dataDir: join(root, 'data'),
    companyBrainDir: join(root, 'data', 'company-brain'),
    tendersDir: join(root, 'data', 'tenders'),
    templatesDir: join(root, 'data', 'templates'),
    expectedResultsDir: join(root, 'data', 'expected-results'),
    storageDir,
    readinessFile: join(storageDir, 'readiness.json'),
    sqliteBaselineFile: join(storageDir, 'sqlite-baseline.sql'),
    apiPrismaDir: join(root, 'apps', 'api', 'prisma'),
    apiDistDir: join(root, 'apps', 'api', 'dist'),
  };
}
