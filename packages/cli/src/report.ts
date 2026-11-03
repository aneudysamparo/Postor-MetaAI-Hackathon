// Shared step runner and report printer for seed/init/doctor.
// Every step records pass/fail, elapsed time, and a one-line detail so the
// final report (human table or --json) shows exactly what ran and why.
export interface StepOutcome {
  name: string;
  passed: boolean;
  detail: string;
  durationMs: number;
}

export interface RunReport {
  command: string;
  startedAt: string;
  steps: StepOutcome[];
  success: boolean;
}

type StepFn = () => Promise<string> | string;

const PASS_MARK = 'ok  ';
const FAIL_MARK = 'FAIL';

export const JSON_INDENT_SPACES = 2;

// process.argv[0] is node and [1] is the script: user flags start at [2].
export const ARGV_USER_ARGS_START = 2;

export function userArgv(): string[] {
  return process.argv.slice(ARGV_USER_ARGS_START);
}

export class StepRunner {
  private readonly steps: StepOutcome[] = [];

  public constructor(private readonly command: string) {}

  public async runStep(name: string, fn: StepFn): Promise<boolean> {
    const startedAt = Date.now();
    try {
      const detail = await fn();
      this.steps.push({ name, passed: true, detail, durationMs: Date.now() - startedAt });
      console.log(`${PASS_MARK} ${name} — ${detail}`);
      return true;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.steps.push({ name, passed: false, detail, durationMs: Date.now() - startedAt });
      console.log(`${FAIL_MARK} ${name} — ${detail}`);
      return false;
    }
  }

  public finish(startedAt: Date): RunReport {
    const success = this.steps.every((step) => step.passed);
    return {
      command: this.command,
      startedAt: startedAt.toISOString(),
      steps: this.steps,
      success,
    };
  }
}

export function printSummary(report: RunReport): void {
  const passed = report.steps.filter((step) => step.passed).length;
  console.log(`\n${report.command}: ${passed}/${report.steps.length} steps passed.`);
}

export function printJson(report: RunReport): void {
  console.log(JSON.stringify(report, null, JSON_INDENT_SPACES));
}

export function hasFlag(argv: string[], flag: string): boolean {
  return argv.includes(flag);
}

export function readOption(argv: string[], name: string): string | null {
  const prefix = `--${name}=`;
  const match = argv.find((arg) => arg.startsWith(prefix));
  if (match === undefined) {
    return null;
  }
  return match.slice(prefix.length);
}
