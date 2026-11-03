// Derives the SQLite fallback schema from the canonical PostgreSQL schema.
// The canonical file stays the single source of truth: this script only swaps
// the provider and the database URL, then asserts the result still validates.
// Used by `npm run init` on machines without Docker (see roadmap T1.2).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const canonicalSchemaPath = join(scriptDir, 'schema.prisma');
const derivedSchemaPath = join(scriptDir, 'schema.sqlite.prisma');
const sqliteFileUrl = 'file:../../../storage/postor.sqlite';

const POSTGRES_PROVIDER_LINE = 'provider = "postgresql"';
const SQLITE_PROVIDER_LINE = 'provider = "sqlite"';
const GENERATED_HEADER = `// GENERATED FILE — do not edit by hand.
// Derived from schema.prisma by derive-sqlite-schema.mjs.
// The SQLite database is disposable: init may drop and recreate it.
`;

function replaceOnce(source, searchText, replacementText, label) {
  const occurrences = source.split(searchText).length - 1;
  if (occurrences !== 1) {
    throw new Error(`Expected exactly 1 ${label}, found ${occurrences}. Refusing to guess.`);
  }
  return source.replace(searchText, replacementText);
}

function deriveSqliteSchema() {
  mkdirSync(join(scriptDir, '..', '..', '..', 'storage'), { recursive: true });
  const canonical = readFileSync(canonicalSchemaPath, 'utf8');
  const withSqliteProvider = replaceOnce(
    canonical,
    POSTGRES_PROVIDER_LINE,
    SQLITE_PROVIDER_LINE,
    'PostgreSQL provider line',
  );
  const databaseUrlPattern = /url\s*=\s*env\("DATABASE_URL"\)/;
  if (!databaseUrlPattern.test(withSqliteProvider)) {
    throw new Error('Expected a single url = env("DATABASE_URL") line. Refusing to guess.');
  }
  const derived =
    GENERATED_HEADER + withSqliteProvider.replace(databaseUrlPattern, `url = "${sqliteFileUrl}"`);
  writeFileSync(derivedSchemaPath, derived);
  console.log(`Derived ${derivedSchemaPath}`);
}

deriveSqliteSchema();
