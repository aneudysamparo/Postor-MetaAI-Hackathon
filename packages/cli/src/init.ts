// Full preset for a fresh clone: prerequisites, env + Meta key gate, database
// branch (Docker Postgres or SQLite fallback), dataset validation, workspace
// build, and one tiny live call proving the key works. Ends with a readiness
// report and the next commands. Flags:
//   --db=auto|postgres|sqlite   database branch (default auto)
//   --check                     validate only, change nothing
//   --force                     recreate the disposable database
//   --json                      machine-readable report
import { execFile } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  readlinkSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { Socket } from 'node:net';
import { promisify } from 'node:util';
import { join } from 'node:path';
import {
  checkCompanyProfile,
  checkDocsGraph,
  checkExpectedResults,
  checkTemplates,
  checkTenders,
} from './dataset-checks.js';
import { RepoPaths, resolveRepoPaths } from './paths.js';
import {
  parseDotEnvFile,
  probeDependencies,
  probeDocker,
  probeEnvFile,
  probeMetaKey,
  probeNodeVersion,
} from './probes.js';
import {
  JSON_INDENT_SPACES,
  StepRunner,
  hasFlag,
  printJson,
  printSummary,
  readOption,
  userArgv,
} from './report.js';

const execFileAsync = promisify(execFile);

type DbMode = 'postgres' | 'sqlite';

const POSTGRES_HOST = '127.0.0.1';
const POSTGRES_PORT = 5432;
const TCP_RETRY_DELAY_MS = 1000;
const TCP_READY_BUDGET_MS = 60_000;
const NPM_INSTALL_TIMEOUT_MS = 600_000;
const DOCKER_TIMEOUT_MS = 300_000;
const PRISMA_TIMEOUT_MS = 120_000;
const BUILD_TIMEOUT_MS = 300_000;
const ERROR_TAIL_LINES = 20;
const API_ENV_LINK_TARGET = '../../.env';

interface CommandResult {
  stdout: string;
}

async function runCommand(
  command: string,
  args: string[],
  options: { cwd: string; env: Record<string, string | undefined>; timeoutMs: number },
): Promise<CommandResult> {
  try {
    const { stdout } = await execFileAsync(command, args, {
      cwd: options.cwd,
      env: options.env,
      timeout: options.timeoutMs,
      maxBuffer: 4_096_000,
    });
    return { stdout };
  } catch (error) {
    const output =
      error instanceof Error ? ((error as Error & { stderr?: string }).stderr ?? '') : '';
    const tail = output
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .slice(-ERROR_TAIL_LINES)
      .join('\n');
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${command} ${args.join(' ')} failed: ${tail.length > 0 ? tail : detail}`);
  }
}

function waitForTcp(host: string, port: number, budgetMs: number): Promise<void> {
  const deadline = Date.now() + budgetMs;
  return new Promise((resolve, reject) => {
    const attempt = (): void => {
      const socket = new Socket();
      const cleanup = (): void => {
        socket.removeAllListeners();
        socket.destroy();
      };
      socket.once('connect', () => {
        cleanup();
        resolve();
      });
      socket.once('error', () => {
        cleanup();
        if (Date.now() >= deadline) {
          reject(new Error(`Timed out waiting for ${host}:${port}. Is Postgres up?`));
          return;
        }
        setTimeout(attempt, TCP_RETRY_DELAY_MS);
      });
      socket.connect(port, host);
    };
    attempt();
  });
}

function mergedEnv(paths: RepoPaths): Record<string, string | undefined> {
  const fileEnv = existsSync(paths.envFile) ? parseDotEnvFile(paths.envFile) : {};
  return { ...fileEnv, ...process.env };
}

function ensureApiEnvLink(paths: RepoPaths): string {
  try {
    const target = readlinkSync(paths.apiEnvLink);
    if (target === API_ENV_LINK_TARGET) {
      return 'apps/api/.env already links to the root .env';
    }
    return `apps/api/.env points at ${target}; left untouched`;
    // Not a symlink (or unreadable): fall through to the file check below.
  } catch (error) {
    void error;
  }
  if (existsSync(paths.apiEnvLink)) {
    return 'apps/api/.env is a real file; left untouched';
  }
  symlinkSync(API_ENV_LINK_TARGET, paths.apiEnvLink);
  return 'linked apps/api/.env -> ../../.env';
}

async function resolveDbMode(paths: RepoPaths, flag: string): Promise<DbMode> {
  if (flag === 'postgres' || flag === 'sqlite') {
    return flag;
  }
  if (flag !== 'auto') {
    throw new Error(`Unknown --db=${flag}. Use auto, postgres, or sqlite.`);
  }
  const docker = await probeDocker();
  return docker.passed ? 'postgres' : 'sqlite';
}

async function setupPostgres(
  paths: RepoPaths,
  env: Record<string, string | undefined>,
): Promise<string> {
  if ((env.DATABASE_URL ?? '').trim().length === 0) {
    throw new Error('DATABASE_URL is empty: set it in .env before the Postgres branch.');
  }
  await runCommand('docker', ['compose', 'up', '-d', 'db'], {
    cwd: paths.root,
    env,
    timeoutMs: DOCKER_TIMEOUT_MS,
  });
  await waitForTcp(POSTGRES_HOST, POSTGRES_PORT, TCP_READY_BUDGET_MS);
  const prismaBin = join(paths.root, 'node_modules', '.bin', 'prisma');
  const migrationsDir = join(paths.apiPrismaDir, 'migrations');
  if (existsSync(migrationsDir)) {
    await runCommand(prismaBin, ['migrate', 'deploy', '--schema=apps/api/prisma/schema.prisma'], {
      cwd: paths.root,
      env,
      timeoutMs: PRISMA_TIMEOUT_MS,
    });
  } else {
    // No versioned migrations yet: push the schema directly for the demo.
    await runCommand(prismaBin, ['db', 'push', '--schema=apps/api/prisma/schema.prisma'], {
      cwd: paths.root,
      env,
      timeoutMs: PRISMA_TIMEOUT_MS,
    });
  }
  await runCommand(prismaBin, ['generate', '--schema=apps/api/prisma/schema.prisma'], {
    cwd: paths.root,
    env,
    timeoutMs: PRISMA_TIMEOUT_MS,
  });
  return 'postgres up, schema applied, client generated';
}

async function setupSqlite(
  paths: RepoPaths,
  env: Record<string, string | undefined>,
  force: boolean,
): Promise<string> {
  if (force) {
    const sqliteFile = join(paths.storageDir, 'postor.sqlite');
    if (existsSync(sqliteFile)) {
      unlinkSync(sqliteFile);
    }
  }
  await runCommand('node', [join(paths.apiPrismaDir, 'derive-sqlite-schema.mjs')], {
    cwd: paths.root,
    env,
    timeoutMs: PRISMA_TIMEOUT_MS,
  });
  const prismaBin = join(paths.root, 'node_modules', '.bin', 'prisma');
  await runCommand(prismaBin, ['db', 'push', '--schema=apps/api/prisma/schema.sqlite.prisma'], {
    cwd: paths.root,
    env,
    timeoutMs: PRISMA_TIMEOUT_MS,
  });
  const baseline = await runCommand(
    prismaBin,
    [
      'migrate',
      'diff',
      '--from-empty',
      '--to-schema-datamodel',
      'apps/api/prisma/schema.sqlite.prisma',
      '--script',
    ],
    { cwd: paths.root, env, timeoutMs: PRISMA_TIMEOUT_MS },
  );
  writeFileSync(paths.sqliteBaselineFile, baseline.stdout);
  await runCommand(prismaBin, ['generate', '--schema=apps/api/prisma/schema.sqlite.prisma'], {
    cwd: paths.root,
    env,
    timeoutMs: PRISMA_TIMEOUT_MS,
  });
  return 'sqlite pushed, baseline.sql written, client generated';
}

async function runSmokeTest(paths: RepoPaths, fileEnv: Record<string, string>): Promise<string> {
  // Fill process env from the .env file for the service below. Real env wins,
  // and values are never printed.
  for (const [key, value] of Object.entries(fileEnv)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
  const serviceModule = await import(join(paths.apiDistDir, 'models', 'meta-model.service.js'));
  const requireFromRoot = createRequire(join(paths.root, 'package.json'));
  const { z } = requireFromRoot('zod') as typeof import('zod');
  const service = new serviceModule.MetaModelService() as {
    completeJson(request: {
      systemPrompt: string;
      taskPrompt: string;
      schema: unknown;
    }): Promise<{ modelReturned: string | null }>;
  };
  const startedAt = Date.now();
  try {
    const result = await service.completeJson({
      systemPrompt: 'Reply with JSON only.',
      taskPrompt: 'Return {"alive": true} and nothing else.',
      schema: z.object({ alive: z.boolean() }),
    });
    const model = result.modelReturned ?? 'unknown';
    return `live call ok in ${Date.now() - startedAt}ms (model ${model})`;
  } catch (error) {
    if (error instanceof serviceModule.MetaAuthError) {
      throw new Error(`Meta rejected the key: ${(error as Error).message}`);
    }
    if (error instanceof serviceModule.MetaTimeoutError) {
      throw new Error(`Meta unreachable (network/timeout): ${(error as Error).message}`);
    }
    throw new Error(`Smoke test failed, wire format may have changed: ${(error as Error).message}`);
  }
}

function printUsage(): void {
  console.log(
    [
      'Usage: npm run init -- [--db=auto|postgres|sqlite] [--check] [--force] [--json]',
      '  --db      database branch (default auto: postgres with Docker, else sqlite)',
      '  --check   validate only, change nothing',
      '  --force   recreate the disposable database',
      '  --json    machine-readable report',
    ].join('\n'),
  );
}

async function main(): Promise<void> {
  const argv = userArgv();
  if (argv.includes('--help') || argv.includes('-h')) {
    printUsage();
    return;
  }
  const startedAt = new Date();
  const paths = resolveRepoPaths();
  const runner = new StepRunner('init');
  const jsonOutput = hasFlag(argv, '--json');
  const checkOnly = hasFlag(argv, '--check');
  const force = hasFlag(argv, '--force');
  const dbFlag = readOption(argv, '--db') ?? 'auto';

  // Read-only probes first: cheap failures before any writes.
  const nodeProbe = probeNodeVersion();
  const probesOk = await runner.runStep('prerequisites', () => {
    if (!nodeProbe.passed) {
      throw new Error(nodeProbe.detail);
    }
    return nodeProbe.detail;
  });
  if (!probesOk) {
    return finish(runner, startedAt, paths, jsonOutput, null);
  }

  const fileEnv = existsSync(paths.envFile) ? parseDotEnvFile(paths.envFile) : {};
  const effectiveKey = (process.env.META_API_KEY ?? fileEnv.META_API_KEY ?? '').trim();

  if (checkOnly) {
    await runCheckOnly(runner, paths);
    return finish(runner, startedAt, paths, jsonOutput, null);
  }

  const depsOk = await runner.runStep('dependencies', async () => {
    if (existsSync(join(paths.root, 'node_modules'))) {
      return 'node_modules present';
    }
    await runCommand('npm', ['install'], {
      cwd: paths.root,
      env: { ...process.env },
      timeoutMs: NPM_INSTALL_TIMEOUT_MS,
    });
    return 'installed via npm install';
  });
  if (!depsOk) {
    return finish(runner, startedAt, paths, jsonOutput, null);
  }

  const envOk = await runner.runStep('env-file', () => {
    if (existsSync(paths.envFile)) {
      return '.env present';
    }
    copyFileSync(paths.envExample, paths.envFile);
    throw new Error('Created .env from the template: paste META_API_KEY into it and re-run.');
  });
  if (!envOk) {
    return finish(runner, startedAt, paths, jsonOutput, null);
  }

  const keyOk = await runner.runStep('meta-key-gate', () => {
    if (effectiveKey.length === 0) {
      throw new Error(
        'META_API_KEY is empty: request the demo key from the team, paste it into .env, and re-run.',
      );
    }
    return 'key present (masked, validity proven by the smoke test)';
  });
  if (!keyOk) {
    return finish(runner, startedAt, paths, jsonOutput, null);
  }

  let dbMode: DbMode = 'sqlite';
  const dbOk = await runner.runStep('database', async () => {
    dbMode = await resolveDbMode(paths, dbFlag);
    const env = mergedEnv(paths);
    if (dbMode === 'postgres') {
      return await setupPostgres(paths, env);
    }
    return await setupSqlite(paths, env, force);
  });
  if (!dbOk) {
    return finish(runner, startedAt, paths, jsonOutput, null);
  }

  await runner.runStep('api-env-link', () => ensureApiEnvLink(paths));
  await runner.runStep('dataset', () => {
    checkCompanyProfile(paths);
    checkDocsGraph(paths);
    checkTenders(paths);
    checkTemplates(paths);
    checkExpectedResults(paths);
    return 'profile, graph, tenders, templates, scenarios valid';
  });

  const buildOk = await runner.runStep('build', async () => {
    const turboBin = join(paths.root, 'node_modules', '.bin', 'turbo');
    await runCommand(turboBin, ['run', 'build'], {
      cwd: paths.root,
      env: mergedEnv(paths),
      timeoutMs: BUILD_TIMEOUT_MS,
    });
    return 'turbo build green';
  });
  if (!buildOk) {
    return finish(runner, startedAt, paths, jsonOutput, dbMode);
  }

  // dist is fresh after the build above, so run the compiled loader directly.
  const brainOk = await runner.runStep('brain-load', async () => {
    const loader = join(paths.root, 'packages', 'cli', 'dist', 'brain-load.js');
    await runCommand('node', [loader, `--db=${dbMode}`], {
      cwd: paths.root,
      env: mergedEnv(paths),
      timeoutMs: BUILD_TIMEOUT_MS,
    });
    return `company brain loaded (${dbMode})`;
  });
  if (!brainOk) {
    return finish(runner, startedAt, paths, jsonOutput, dbMode);
  }

  await runner.runStep('smoke-test', () => runSmokeTest(paths, fileEnv));
  return finish(runner, startedAt, paths, jsonOutput, dbMode);
}

async function runCheckOnly(runner: StepRunner, paths: RepoPaths): Promise<void> {
  const probes = [
    probeEnvFile(paths),
    probeMetaKey(paths),
    await probeDocker(),
    await probeDependencies(paths),
  ];
  for (const probe of probes) {
    await runner.runStep(probe.name, () => {
      if (!probe.passed) {
        throw new Error(probe.detail);
      }
      return probe.detail;
    });
  }
  await runner.runStep('dataset', () => {
    checkCompanyProfile(paths);
    checkDocsGraph(paths);
    checkTenders(paths);
    checkTemplates(paths);
    checkExpectedResults(paths);
    return 'profile, graph, tenders, templates, scenarios valid';
  });
}

function finish(
  runner: StepRunner,
  startedAt: Date,
  paths: RepoPaths,
  jsonOutput: boolean,
  dbMode: DbMode | null,
): void {
  const report = runner.finish(startedAt);
  if (report.success) {
    const readiness = {
      command: report.command,
      generatedAt: new Date().toISOString(),
      dbMode,
      steps: report.steps.map((step) => ({ name: step.name, detail: step.detail })),
    };
    writeFileSync(paths.readinessFile, `${JSON.stringify(readiness, null, JSON_INDENT_SPACES)}\n`);
  }
  if (jsonOutput) {
    printJson(report);
  } else {
    printSummary(report);
    if (report.success) {
      console.log(`\nReadiness written to ${paths.readinessFile}`);
      console.log('Next:');
      console.log('- npm run dev        (API + web)');
      console.log('- open Opportunities and run Case A');
      console.log('- npm run doctor     (if anything misbehaves)');
    }
  }
  process.exitCode = report.success ? 0 : 1;
}

main().catch((error: unknown) => {
  const detail = error instanceof Error ? error.message : String(error);
  console.log(`FAIL init — ${detail}`);
  process.exitCode = 1;
});
