// Read-only diagnostics: probes the machine and the dataset, then prints the
// fix for everything failing. Never writes, never calls the model API.
import {
  checkCompanyProfile,
  checkDocsGraph,
  checkExpectedResults,
  checkTemplates,
  checkTenders,
} from './dataset-checks.js';
import { resolveRepoPaths } from './paths.js';
import {
  probeDependencies,
  probeDocker,
  probeEnvFile,
  probeMetaKey,
  probeNodeVersion,
} from './probes.js';
import { StepRunner, hasFlag, printJson, printSummary } from './report.js';

async function main(): Promise<void> {
  const startedAt = new Date();
  const paths = resolveRepoPaths();
  const runner = new StepRunner('doctor');
  const jsonOutput = hasFlag(process.argv, '--json');
  const fixes: string[] = [];

  const probes = [
    probeNodeVersion(),
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
    if (!probe.passed && probe.fix.length > 0) {
      fixes.push(`${probe.name}: ${probe.fix}`);
    }
  }

  const datasetSteps = [
    { name: 'company-profile', check: checkCompanyProfile },
    { name: 'docs-graph', check: checkDocsGraph },
    { name: 'tenders', check: checkTenders },
    { name: 'templates', check: checkTemplates },
    { name: 'expected-results', check: checkExpectedResults },
  ];
  let datasetFailed = false;
  for (const step of datasetSteps) {
    const passed = await runner.runStep(step.name, () => step.check(paths));
    datasetFailed = datasetFailed || !passed;
  }

  const report = runner.finish(startedAt);
  if (jsonOutput) {
    printJson(report);
  } else {
    printSummary(report);
    if (fixes.length > 0) {
      console.log('\nFixes:');
      for (const fix of fixes) {
        console.log(`- ${fix}`);
      }
    }
    if (datasetFailed) {
      console.log('\nDataset failures mean the checkout is incomplete: re-clone and retry.');
    }
  }
  process.exitCode = report.success ? 0 : 1;
}

main().catch((error: unknown) => {
  const detail = error instanceof Error ? error.message : String(error);
  console.log(`FAIL doctor — ${detail}`);
  process.exitCode = 1;
});
