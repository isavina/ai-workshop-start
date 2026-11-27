// Runs the commands the way the CLI does, with GitHub answering from EXAMPLE below.
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../src/commands.ts';
import { openGitHub, openOwner, parseGitHubOwner, parseGitHubUrl, type Fetch } from '../src/core/github.ts';
import { replay, type Recording } from '../src/core/replay.ts';
import { openDirectory } from '../src/local.ts';

export const FIXTURE = fileURLToPath(new URL('../fixture', import.meta.url));
export const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

/** The commit GitHub answers for JetBrains/example. */
export const EXAMPLE_COMMIT = '5ab6270ab772d113e8ad52ebfcaa0109c522ae00';

/** What GitHub answers for a small repository, JetBrains/example, with one skill. */
const EXAMPLE: Recording = {
  'https://api.github.com/repos/JetBrains/example': { status: 200, body: { full_name: 'JetBrains/example', default_branch: 'main' } },
  'https://api.github.com/repos/JetBrains/example/commits/main': { status: 200, body: { sha: EXAMPLE_COMMIT } },
  'https://api.github.com/search/code?q=filename:SKILL.md+repo:JetBrains/example&per_page=100&page=1': {
    status: 200,
    body: { total_count: 1, items: [{ path: '.claude/skills/commits/SKILL.md' }] },
  },
  [`https://raw.githubusercontent.com/JetBrains/example/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`]: {
    status: 200,
    body: '---\nname: commits\ndescription: Write commit messages the way this repository does. Use for every commit.\n---\n# Commits\n',
  },
};

/** What the CLI opens for an input, with GitHub answering from EXAMPLE, or from `github`. */
export function opener({ github = replay(EXAMPLE), token = 'test' } = {}) {
  // With a token, through code search, as EXAMPLE answers it; without one, through the tree.
  return (input: string) =>
    parseGitHubUrl(input) ? openGitHub(input, { fetch: github, token })
    : parseGitHubOwner(input) ? openOwner(input, { fetch: github, token })
    : openDirectory(input);
}

/** `skill-atlas <args>`, as the CLI runs it, with GitHub answering from EXAMPLE, or from `github`. */
export async function atlas(args: string[], options: { github?: Fetch; token?: string } = {}) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await run(args, {
    open: opener(options),
    print: (text) => stdout.push(text),
    error: (text) => stderr.push(text),
  });
  return { code, stdout: stdout.join('\n'), stderr: stderr.join('\n') };
}

/** What a terminal shows for `skill-atlas … 2>&1`: the output, then the warnings. */
export function printed({ stdout, stderr }: { stdout: string; stderr: string }): string {
  return [stdout, stderr].filter(Boolean).map((text) => `${text}\n`).join('');
}

/**
 * Spawn options for a CLI that file permissions apply to. Root reads every directory, `chmod 000`
 * or not, so as root (CI's container) the CLI runs as `nobody`.
 */
export const UNPRIVILEGED = process.getuid?.() === 0 ? { uid: 65534, gid: 65534 } : {};

/** A directory with the skill `ok` and an unreadable subdirectory, `private`; removed after the test. */
export function withUnreadableSubdirectory(t: { after(fn: () => void): void }): string {
  const root = mkdtempSync(join(tmpdir(), 'skill-atlas-'));
  t.after(() => {
    chmodSync(join(root, 'private'), 0o755);
    rmSync(root, { recursive: true, force: true });
  });
  chmodSync(root, 0o755); // readable by `nobody`
  mkdirSync(join(root, '.agents/skills/ok'), { recursive: true });
  writeFileSync(join(root, '.agents/skills/ok/SKILL.md'), '---\nname: ok\ndescription: fine\n---\n');
  mkdirSync(join(root, 'private'));
  chmodSync(join(root, 'private'), 0);
  return root;
}
