// Read-only environment probes shared by `init --check` and `doctor`.
// Probes never write anything: they report the machine state plus the fix.
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { RepoPaths } from './paths';

const execFileAsync = promisify(execFile);
const MIN_NODE_MAJOR = 20;
const COMMAND_TIMEOUT_MS = 15_000;

export interface ProbeOutcome {
  name: string;
  passed: boolean;
  detail: string;
  fix: string;
}

export function probeNodeVersion(): ProbeOutcome {
  const major = Number(process.versions.node.split('.')[0]);
  const passed = Number.isInteger(major) && major >= MIN_NODE_MAJOR;
  return {
    name: 'node',
    passed,
    detail: `node ${process.versions.node} (needs >= ${MIN_NODE_MAJOR})`,
    fix: passed ? '' : 'Install Node 20+ (see .nvmrc) and retry.',
  };
}

export function probeEnvFile(paths: RepoPaths): ProbeOutcome {
  if (!existsSync(paths.envFile)) {
    return {
      name: 'env-file',
      passed: false,
      detail: '.env is missing',
      fix: 'Run `npm run init`: it creates .env from .env.example, then asks for the key.',
    };
  }
  return { name: 'env-file', passed: true, detail: '.env exists', fix: '' };
}

export function probeMetaKey(paths: RepoPaths): ProbeOutcome {
  if (!existsSync(paths.envFile)) {
    return {
      name: 'meta-key',
      passed: false,
      detail: '.env is missing, key unknown',
      fix: 'Run `npm run init` first.',
    };
  }
  const key = readDotEnvValue(paths.envFile, 'META_API_KEY');
  if (key.length === 0) {
    return {
      name: 'meta-key',
      passed: false,
      detail: 'META_API_KEY is empty',
      fix: 'Request the demo key from the team, paste it into .env, and re-run.',
    };
  }
  return { name: 'meta-key', passed: true, detail: 'META_API_KEY is set (masked)', fix: '' };
}

export async function probeDocker(): Promise<ProbeOutcome> {
  try {
    await execFileAsync('docker', ['info'], { timeout: COMMAND_TIMEOUT_MS });
    return { name: 'docker', passed: true, detail: 'docker responds', fix: '' };
  } catch (error) {
    const detail = error instanceof Error ? error.message.split('\n')[0] : String(error);
    return {
      name: 'docker',
      passed: false,
      detail: `docker unavailable (${detail})`,
      fix: 'Use `npm run init -- --db=sqlite`, or install Docker Desktop and retry.',
    };
  }
}

export async function probeDependencies(paths: RepoPaths): Promise<ProbeOutcome> {
  try {
    await execFileAsync('npm', ['ls', '--omit=dev', '--prefix', paths.root, '--depth=0'], {
      timeout: COMMAND_TIMEOUT_MS,
    });
    return { name: 'dependencies', passed: true, detail: 'node_modules resolve', fix: '' };
  } catch (error) {
    const detail = error instanceof Error ? error.message.split('\n')[0] : String(error);
    return {
      name: 'dependencies',
      passed: false,
      detail: `npm ls failed (${detail})`,
      fix: 'Run `npm install`, then re-run.',
    };
  }
}

export function parseDotEnvFile(envPath: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) {
      continue;
    }
    const separator = trimmed.indexOf('=');
    if (separator === -1) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed
      .slice(separator + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    values[key] = value;
  }
  return values;
}

export function readDotEnvValue(envPath: string, name: string): string {
  const lines = readFileSync(envPath, 'utf8').split('\n');
  const prefix = `${name}=`;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith(prefix)) {
      return trimmed
        .slice(prefix.length)
        .trim()
        .replace(/^["']|["']$/g, '');
    }
  }
  return '';
}
