// Shared subprocess runner for the CLIs. Failures include the tail of BOTH
// stdout and stderr, so a failing child step stays diagnosable.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ERROR_TAIL_LINES = 20;
const MAX_COMMAND_OUTPUT = 4_096_000;

export interface CommandOptions {
  cwd: string;
  env: Record<string, string | undefined>;
  timeoutMs: number;
}

function tailOf(output: string): string {
  return output
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .slice(-ERROR_TAIL_LINES)
    .join('\n');
}

export async function runCommand(
  command: string,
  args: string[],
  options: CommandOptions,
): Promise<string> {
  try {
    const { stdout } = await execFileAsync(command, args, {
      cwd: options.cwd,
      env: options.env,
      timeout: options.timeoutMs,
      maxBuffer: MAX_COMMAND_OUTPUT,
    });
    return stdout;
  } catch (error) {
    const child = error as Error & { stdout?: string; stderr?: string };
    const combined = `${child.stdout ?? ''}\n${child.stderr ?? ''}`;
    const tail = tailOf(combined);
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${command} ${args.join(' ')} failed: ${tail.length > 0 ? tail : detail}`);
  }
}
