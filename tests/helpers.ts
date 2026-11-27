// Runs the commands the way the CLI does, with GitHub answering from EXAMPLE below.
import { fileURLToPath } from 'node:url';
import { claude } from '../src/claude.ts';
import { run } from '../src/commands.ts';
import type { Ask } from '../src/core/cluster.ts';
import { openGitHub, openOwner, parseGitHubOwner, parseGitHubUrl, type Fetch } from '../src/core/github.ts';
import { replay, type Recording } from '../src/core/replay.ts';
import { openDirectory } from '../src/local.ts';

export const FIXTURE = fileURLToPath(new URL('../fixture', import.meta.url));
export const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

/** The fake `claude -p` commands, by how they answer: tests/claude/fake-claude.ts. */
export const FAKE_CLAUDE = {
  topics: fileURLToPath(new URL('claude/topics', import.meta.url)),
  fails: fileURLToPath(new URL('claude/fails', import.meta.url)),
  slow: fileURLToPath(new URL('claude/slow', import.meta.url)),
  slowWrapper: fileURLToPath(new URL('claude/slow-wrapper', import.meta.url)),
  args: fileURLToPath(new URL('claude/args', import.meta.url)),
};

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

/**
 * `skill-atlas <args>`, as the CLI runs it, with GitHub answering from EXAMPLE, or from `github`; Claude,
 * for `--cluster`, is `claude`: a command run as `claude -p` is, or the answer itself. Without it, as in
 * the browser terminal, there is none.
 */
export async function atlas(args: string[], options: { github?: Fetch; token?: string; claude?: string | Ask } = {}) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await run(args, {
    open: opener(options),
    cluster: typeof options.claude === 'string' ? claude({ command: options.claude }) : options.claude,
    print: (text) => stdout.push(text),
    error: (text) => stderr.push(text),
  });
  return { code, stdout: stdout.join('\n'), stderr: stderr.join('\n') };
}

/** What a terminal shows for `skill-atlas … 2>&1`: the output, then the warnings. */
export function printed({ stdout, stderr }: { stdout: string; stderr: string }): string {
  return [stdout, stderr].filter(Boolean).map((text) => `${text}\n`).join('');
}
