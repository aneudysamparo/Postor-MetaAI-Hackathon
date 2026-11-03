// Loads the Company Brain into the active database: structured profile,
// document rows, and embedded chunks. Called by `init` after the build and
// usable standalone (`npm run brain:load -- --db=sqlite|postgres`).
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { runCommand } from './exec.js';
import { resolveRepoPaths } from './paths.js';
import { parseDotEnvFile } from './probes.js';
import { StepRunner, hasFlag, printJson, printSummary, readOption, userArgv } from './report.js';

type DbMode = 'sqlite' | 'postgres';

const SQLITE_FILE = 'postor.sqlite';
const GENERATE_TIMEOUT_MS = 120_000;

function resolveDbMode(paths: ReturnType<typeof resolveRepoPaths>, flag: string): DbMode {
  if (flag === 'sqlite' || flag === 'postgres') {
    return flag;
  }
  if (flag !== 'auto') {
    throw new Error(`Unknown --db=${flag}. Use auto, postgres, or sqlite.`);
  }
  return existsSync(join(paths.storageDir, SQLITE_FILE)) ? 'sqlite' : 'postgres';
}

async function main(): Promise<void> {
  const argv = userArgv();
  const startedAt = new Date();
  const paths = resolveRepoPaths();
  const runner = new StepRunner('brain:load');
  const jsonOutput = hasFlag(argv, '--json');
  const mode = resolveDbMode(paths, readOption(argv, 'db') ?? 'auto');

  if (mode === 'sqlite') {
    process.env.DATABASE_URL = `file:${join(paths.storageDir, SQLITE_FILE)}`;
  } else {
    const fileEnv = existsSync(paths.envFile) ? parseDotEnvFile(paths.envFile) : {};
    const url = (process.env.DATABASE_URL ?? fileEnv.DATABASE_URL ?? '').trim();
    if (url.length === 0) {
      throw new Error('DATABASE_URL is empty: set it in .env for the postgres branch.');
    }
    process.env.DATABASE_URL = url;
  }

  // The generated client is branch-specific: regenerate it for the active
  // branch so a stale client can never talk to the wrong database.
  await runner.runStep('client', async () => {
    const prismaBin = join(paths.root, 'node_modules', '.bin', 'prisma');
    const schema =
      mode === 'sqlite'
        ? 'apps/api/prisma/schema.sqlite.prisma'
        : 'apps/api/prisma/schema.prisma';
    if (mode === 'sqlite') {
      await runCommand('node', [join(paths.apiPrismaDir, 'derive-sqlite-schema.mjs')], {
        cwd: paths.root,
        env: { ...process.env },
        timeoutMs: GENERATE_TIMEOUT_MS,
      });
    }
    await runCommand(prismaBin, ['generate', `--schema=${schema}`], {
      cwd: paths.root,
      env: { ...process.env },
      timeoutMs: GENERATE_TIMEOUT_MS,
    });
    return `client generated for ${mode}`;
  });

  // The API ships as CommonJS: load it through require, no Nest context needed.
  const requireApi = createRequire(join(paths.root, 'apps', 'api', 'package.json'));
  requireApi('reflect-metadata');
  const { PrismaService } = requireApi(
    join(paths.apiDistDir, 'prisma', 'prisma.service.js'),
  ) as typeof import('../../../apps/api/dist/prisma/prisma.service.js');
  const { PdfTextExtractor } = requireApi(
    join(paths.apiDistDir, 'documents', 'pdf-text-extractor.js'),
  ) as typeof import('../../../apps/api/dist/documents/pdf-text-extractor.js');
  const { DocxTextExtractor } = requireApi(
    join(paths.apiDistDir, 'documents', 'docx-text-extractor.js'),
  ) as typeof import('../../../apps/api/dist/documents/docx-text-extractor.js');
  const { CompanyDocReader } = requireApi(
    join(paths.apiDistDir, 'brain', 'company-doc-reader.js'),
  ) as typeof import('../../../apps/api/dist/brain/company-doc-reader.js');
  const { CompanyBrainLoader } = requireApi(
    join(paths.apiDistDir, 'brain', 'company-brain-loader.service.js'),
  ) as typeof import('../../../apps/api/dist/brain/company-brain-loader.service.js');

  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    await runner.runStep('load', async () => {
      const loader = new CompanyBrainLoader(
        prisma,
        new CompanyDocReader(new PdfTextExtractor(), new DocxTextExtractor()),
      );
      const stats = await loader.loadCompanyBrain(paths.companyBrainDir);
      const skipped = stats.skipped.length === 0 ? 'none' : stats.skipped.join('; ');
      return `${stats.companyName}: ${stats.documents} docs, ${stats.chunks} chunks (skipped: ${skipped})`;
    });
  } finally {
    await prisma.$disconnect();
  }

  const report = runner.finish(startedAt);
  if (jsonOutput) {
    printJson(report);
  } else {
    printSummary(report);
  }
  process.exitCode = report.success ? 0 : 1;
}

main().catch((error: unknown) => {
  const detail = error instanceof Error ? error.message : String(error);
  console.log(`FAIL brain:load — ${detail}`);
  process.exitCode = 1;
});
