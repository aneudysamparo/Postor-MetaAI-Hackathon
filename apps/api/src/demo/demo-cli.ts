// Demo snapshot CLI:
//   node dist/demo/demo-cli.js export [path]   (needs a database with runs)
//   node dist/demo/demo-cli.js import [path]   (works without META_API_KEY)
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { join } from 'node:path';
import { AppModule } from '../app.module';
import { loadRuntimeEnv, resolveRepoRoot } from '../runtime-env';
import { exportSnapshot, importSnapshot } from './demo-snapshot';

const DEFAULT_SNAPSHOT = join(resolveRepoRoot(), 'data', 'demo-runs', 'snapshot.json');

async function main(): Promise<void> {
  loadRuntimeEnv();
  const command = process.argv[2];
  const path = process.argv[3] ?? DEFAULT_SNAPSHOT;
  if (command !== 'export' && command !== 'import') {
    throw new Error('Usage: demo-cli.js export|import [snapshot.json]');
  }
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    let lines: string[];
    if (command === 'export') {
      lines = await exportSnapshot(app, path);
    } else {
      lines = await importSnapshot(app, path);
    }
    for (const line of lines) {
      process.stdout.write(`${command}: ${line}\n`);
    }
    process.stdout.write(`${command} done (${path})\n`);
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
