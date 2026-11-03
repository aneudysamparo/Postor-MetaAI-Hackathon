// Offline dataset seeding: validates every demo input and prepares the local
// storage/ tree. Makes no model calls, needs no key, touches no database —
// judges can run it on a plane and still verify the dataset is intact.
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  checkCompanyProfile,
  checkDocsGraph,
  checkExpectedResults,
  checkTemplates,
  checkTenders,
} from './dataset-checks.js';
import { resolveRepoPaths } from './paths.js';
import {
  JSON_INDENT_SPACES,
  RunReport,
  StepRunner,
  hasFlag,
  printJson,
  printSummary,
} from './report.js';

async function main(): Promise<RunReport> {
  const startedAt = new Date();
  const paths = resolveRepoPaths();
  const runner = new StepRunner('seed');
  const jsonOutput = hasFlag(process.argv, '--json');

  await runner.runStep('company-profile', () => checkCompanyProfile(paths));
  await runner.runStep('docs-graph', () => checkDocsGraph(paths));
  await runner.runStep('tenders', () => checkTenders(paths));
  await runner.runStep('templates', () => checkTemplates(paths));
  await runner.runStep('expected-results', () => checkExpectedResults(paths));
  await runner.runStep('storage', () => {
    mkdirSync(paths.storageDir, { recursive: true });
    return `storage/ ready at ${paths.storageDir}`;
  });

  const report = runner.finish(startedAt);
  if (report.success) {
    const readiness = {
      command: report.command,
      generatedAt: new Date().toISOString(),
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
      console.log('Next: npm run init   (full preset incl. database + live check)');
    }
  }
  return report;
}

main()
  .then((report) => {
    process.exitCode = report.success ? 0 : 1;
  })
  .catch((error: unknown) => {
    const detail = error instanceof Error ? error.message : String(error);
    console.log(`FAIL seed — ${detail}`);
    process.exitCode = 1;
  });
