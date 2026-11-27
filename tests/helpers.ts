// Runs the commands the way the CLI does, with GitHub answering from EXAMPLE below.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
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
 * A new directory with two skills: `laughs`, whose front matter is a YAML alias bomb (10 000 strings
 * from a few lines, more aliases than the parser allows), and `fine`. The caller removes it.
 */
export function aliasBomb(): string {
  const directory = mkdtempSync(join(tmpdir(), 'skill-atlas-bomb-'));
  const skill = (name: string, text: string) => {
    mkdirSync(join(directory, '.agents/skills', name), { recursive: true });
    writeFileSync(join(directory, '.agents/skills', name, 'SKILL.md'), text);
  };
  skill(
    'laughs',
    [
      '---',
      'name: bomb',
      'a: &a ["x","x","x","x","x","x","x","x","x","x"]',
      'b: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a,*a]',
      'c: &c [*b,*b,*b,*b,*b,*b,*b,*b,*b,*b]',
      'd: &d [*c,*c,*c,*c,*c,*c,*c,*c,*c,*c]',
      'description: alias bomb',
      '---',
      'body',
      '',
    ].join('\n'),
  );
  skill('fine', '---\nname: fine\ndescription: A fine skill.\n---\n');
  return directory;
}
