// Claude for --cluster and the web view's Cluster button: `claude -p`, the prompt on its stdin, its
// answer from its stdout. `SKILL_ATLAS_CLAUDE` names another command, as the tests' fake one.
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import type { Ask } from './core/cluster.ts';
import { AtlasError } from './core/errors.ts';

export type ClaudeOptions = {
  /** The command, one executable without arguments; `SKILL_ATLAS_CLAUDE`, else `claude`. */
  command?: string;
  /** How long it may take, in milliseconds: 2 minutes. */
  timeout?: number;
};

export const CLAUDE_TIMEOUT = 2 * 60 * 1000;

/**
 * A text answer and nothing else: no tools, no MCP servers, no skills or slash commands, no session
 * saved; run in the temporary directory, so no project's CLAUDE.md or settings are read. Claude sees
 * the prompt, the skills' names and descriptions, only.
 */
export const CLAUDE_ARGS = ['-p', '--tools', '', '--strict-mcp-config', '--no-session-persistence', '--disable-slash-commands'];

export function claude({ command = process.env.SKILL_ATLAS_CLAUDE || 'claude', timeout = CLAUDE_TIMEOUT }: ClaudeOptions = {}): Ask {
  return (prompt, signal) =>
    new Promise((resolve, reject) => {
      const child = spawn(command, CLAUDE_ARGS, { cwd: tmpdir(), stdio: ['pipe', 'pipe', 'pipe'] });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let settled = false;
      /** Settles once; stops the command, and stops waiting for anything it started that holds its output. */
      const settle = (error: AtlasError | undefined, answer = '') => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
        child.stdout.destroy();
        child.stderr.destroy();
        if (error) reject(error);
        else resolve(answer);
      };
      const timer = setTimeout(() => settle(new AtlasError(`claude -p did not answer in ${seconds(timeout)}`)), timeout);
      const abort = () => settle(new AtlasError('claude -p was cancelled'));
      if (signal?.aborted) return abort();
      signal?.addEventListener('abort', abort);
      child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
      child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
      // A command that exits before reading all of the prompt: its exit says what went wrong.
      child.stdin.on('error', () => {});
      child.once('error', (error: NodeJS.ErrnoException) =>
        settle(new AtlasError(
          error.code === 'ENOENT' ? `Cannot run ${command}: not found; install Claude Code, or set SKILL_ATLAS_CLAUDE to its command`
          : error.code === 'EACCES' ? `Cannot run ${command}: not an executable; SKILL_ATLAS_CLAUDE is the path of one command, without arguments`
          : `Cannot run ${command}: ${error.message}`,
        )));
      // The command's exit; its output, once all of it is read.
      child.once('close', (code, exitSignal) => {
        // claude -p says what went wrong, such as "Not logged in · Please run /login", on stdout.
        const output = Buffer.concat(stdout).toString('utf8');
        const error = Buffer.concat(stderr).toString('utf8').trim() || output.trim();
        if (code === 0) return settle(undefined, output);
        settle(new AtlasError(`claude -p failed (${code === null ? exitSignal : `exit code ${code}`})${error ? `: ${error.split('\n')[0]}` : ''}`));
      });
      child.stdin.end(prompt);
    });
}

function seconds(ms: number): string {
  return ms % 60_000 === 0 ? `${ms / 60_000} minute${ms === 60_000 ? '' : 's'}` : `${ms / 1000} s`;
}
