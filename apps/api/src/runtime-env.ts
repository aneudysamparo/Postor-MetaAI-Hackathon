import { existsSync } from 'node:fs';
import { join } from 'node:path';

// Boot-time environment for `npm run dev` / `npm start` (judges' path):
// 1. loads the repo-root .env (the Meta key never leaves the server);
// 2. picks the database the same way `brain:load` does: POSTOR_DB wins,
//    otherwise the SQLite file created by `init --db=sqlite` means SQLite,
//    else the Postgres DATABASE_URL from .env.
// Variables already set in the shell always win over .env.
const SQLITE_FILE = 'postor.sqlite';

export function resolveRepoRoot(): string {
  // dist/runtime-env.js and src/runtime-env.ts both sit three levels below.
  return join(__dirname, '..', '..', '..');
}

export function loadRuntimeEnv(): { database: 'sqlite' | 'postgres' } {
  const root = resolveRepoRoot();
  const envFile = join(root, '.env');
  if (existsSync(envFile)) {
    process.loadEnvFile(envFile);
  }
  const sqlitePath = join(root, 'storage', SQLITE_FILE);
  const forced = (process.env.POSTOR_DB ?? '').trim().toLowerCase();
  const sqliteChosen = forced === 'sqlite' || (forced.length === 0 && existsSync(sqlitePath));
  if (sqliteChosen) {
    process.env.DATABASE_URL = `file:${sqlitePath}`;
    return { database: 'sqlite' };
  }
  return { database: 'postgres' };
}
