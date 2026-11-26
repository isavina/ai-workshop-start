// The decisions in spec/analysis.md and spec/cli.md, checked on what the real command prints for
// ./fixture and for small GitHub repositories answered in tests/helpers.ts and below.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { openGitHub } from '../src/core/github.ts';
import { parseSkill } from '../src/core/parse.ts';
import { replay } from '../src/core/replay.ts';
import { atlas, CLI, EXAMPLE_COMMIT, FIXTURE } from './helpers.ts';

const fixture = await atlas(['scan', FIXTURE]);
const example = await atlas(['scan', 'github.com/JetBrains/example']);

test('malformed front matter → the directory name, no description and a warning', () => {
  const parsed = parseSkill(readFileSync(join(FIXTURE, '.agents/skills/release-checklist/SKILL.md'), 'utf8'));
  assert.equal(parsed.name, undefined);
  assert.equal(parsed.description, '');
  assert.equal(
    parsed.warning,
    'malformed front matter: Nested mappings are not allowed in compact mappings at line 3, column 14; using the directory name',
  );
});

test('scan prints the repository, then each skill with its first sentence and pinned link', () => {
  assert.equal(example.code, 0, example.stderr);
  assert.equal(
    example.stdout,
    [
      'JetBrains/example · 1 skill',
      'commits — Write commit messages the way this repository does.',
      `  https://github.com/JetBrains/example/blob/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`,
    ].join('\n'),
  );
});

test('./fixture: every project skill, sorted by name, linked to its file, copies and warnings', () => {
  const root = pathToFileURL(FIXTURE).href;
  assert.equal(fixture.code, 0);
  assert.equal(
    fixture.stdout,
    [
      'fixture · 5 skills',
      'build — Build the subproject with its own Gradle wrapper.',
      `  ${root}/subproject/.claude/skills/build/SKILL.md`,
      "code-style — Follow the project's code style.",
      `  ${root}/.github/skills/code-style/SKILL.md`,
      'commits — Write commit messages the way this repository does.',
      `  ${root}/.claude/skills/commits/SKILL.md`,
      '  also in .github/skills/commits/SKILL.md',
      'plain',
      `  ${root}/.claude/skills/plain/SKILL.md`,
      'release-checklist',
      `  ${root}/.agents/skills/release-checklist/SKILL.md`,
    ].join('\n'),
  );
  assert.equal(
    fixture.stderr.replace(/(malformed front matter): .*;/, '$1: …;'),
    [
      'warning: .agents/skills/release-checklist/SKILL.md: malformed front matter: …; using the directory name',
      'warning: .claude/skills/plain/SKILL.md: no front matter; using the directory name',
    ].join('\n'),
  );
});

test('not a project skill: outside a skill root, directly in it, nested deeper, not SKILL.md, a symbolic link', () => {
  for (const path of [
    'docs/examples/skills/example/SKILL.md',
    '.claude/skills/SKILL.md',
    '.claude/skills/group/nested/SKILL.md',
    '.claude/skills/lowercase/skill.md',
    'agent/skills/linked',
  ]) {
    assert.doesNotMatch(`${fixture.stdout}\n${fixture.stderr}`, new RegExp(`${path.replaceAll('.', '\\.')}\\b`), path);
  }
  assert.doesNotMatch(fixture.stdout, /not-a-skill/);
});

test('on GitHub, through the tree: the same model; node_modules, symbolic links and plugin skills are left out', async () => {
  const blob = (path: string, mode = '100644') => ({ path, mode, type: 'blob', sha: '0' });
  const raw = `https://raw.githubusercontent.com/JetBrains/monorepo/${EXAMPLE_COMMIT}`;
  const skill = (name: string) => ({ status: 200, body: `---\nname: ${name}\ndescription: The ${name} skill.\n---\n` });
  const github = replay({
    'https://api.github.com/repos/JetBrains/monorepo': { status: 200, body: { full_name: 'JetBrains/monorepo', default_branch: 'main' } },
    'https://api.github.com/repos/JetBrains/monorepo/commits/main': { status: 200, body: { sha: EXAMPLE_COMMIT } },
    [`https://api.github.com/repos/JetBrains/monorepo/git/trees/${EXAMPLE_COMMIT}?recursive=1`]: {
      status: 200,
      body: {
        truncated: false,
        tree: [
          blob('.agents/skills/review/SKILL.md'),
          blob('.claude/skills/review/SKILL.md'),
          blob('.claude/skills/linked', '120000'),
          blob('web/.claude/skills/review/SKILL.md'),
          blob('web/node_modules/some-package/.claude/skills/vendored/SKILL.md'),
          blob('plugins/tools/skills/format/SKILL.md'),
          blob('skills/published/SKILL.md'),
          blob('SKILL.md'),
        ],
      },
    },
    [`${raw}/.agents/skills/review/SKILL.md`]: skill('review'),
    [`${raw}/web/.claude/skills/review/SKILL.md`]: skill('review'),
  });
  const monorepo = await atlas(['scan', 'https://github.com/JetBrains/monorepo'], { github, token: '' });
  assert.equal(monorepo.code, 0, monorepo.stderr);
  assert.equal(monorepo.stderr, '');
  const blobUrl = `https://github.com/JetBrains/monorepo/blob/${EXAMPLE_COMMIT}`;
  assert.equal(
    monorepo.stdout,
    [
      'JetBrains/monorepo · 2 skills',
      'review — The review skill.',
      `  ${blobUrl}/.agents/skills/review/SKILL.md`,
      '  also in .claude/skills/review/SKILL.md',
      'review — The review skill.',
      `  ${blobUrl}/web/.claude/skills/review/SKILL.md`,
    ].join('\n'),
  );
});

test('the CLI prints the result at once and stores nothing', (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'skill-atlas-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const scanned = spawnSync(process.execPath, [CLI, 'scan', FIXTURE], { cwd, encoding: 'utf8' });
  assert.equal(scanned.status, 0, scanned.stderr);
  assert.equal(scanned.stdout, `${fixture.stdout}\n`);
  assert.deepEqual(readdirSync(cwd), []);
});

test('unreachable repository → a clear message, exit code 1', async () => {
  const missing = spawnSync(process.execPath, [CLI, 'scan', join(FIXTURE, 'no-such-directory')], { encoding: 'utf8' });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /^Not a GitHub URL or a readable directory: .*no-such-directory\n$/);

  // What GitHub answers for a repository that does not exist.
  const notFound = replay({ 'https://api.github.com/repos/JetBrains/no-such-repository': { status: 404, body: { message: 'Not Found' } } });
  await assert.rejects(openGitHub('https://github.com/JetBrains/no-such-repository', { fetch: notFound }), {
    message: 'Repository not found: https://github.com/JetBrains/no-such-repository',
  });

  const offline = await atlas(['scan', 'https://github.com/JetBrains/not-answered']);
  assert.equal(offline.code, 1);
  assert.match(offline.stderr, /^Cannot reach GitHub: not recorded: https:\/\/api\.github\.com\/repos\/JetBrains\/not-answered$/);
});

test('rate limit → a message that asks for GITHUB_TOKEN', async () => {
  const limited = replay({
    'https://api.github.com/repos/JetBrains/MPS': {
      status: 403,
      body: { message: 'API rate limit exceeded for 192.0.2.1. (But here is the good news: ...)' },
    },
  });
  await assert.rejects(openGitHub('https://github.com/JetBrains/MPS', { fetch: limited }), {
    message: 'GitHub rate limit reached; set GITHUB_TOKEN',
  });
});

test('a branch, tag or commit: /tree/<ref> is resolved to the commit the links pin; an unknown one → a clear message', async () => {
  const github = replay({
    'https://api.github.com/repos/JetBrains/example': { status: 200, body: { full_name: 'JetBrains/example', default_branch: 'main' } },
    'https://api.github.com/repos/JetBrains/example/commits/release/1.0': { status: 200, body: { sha: EXAMPLE_COMMIT } },
    [`https://api.github.com/repos/JetBrains/example/git/trees/${EXAMPLE_COMMIT}?recursive=1`]: {
      status: 200,
      body: { truncated: false, tree: [{ path: '.claude/skills/commits/SKILL.md', mode: '100644', type: 'blob' }] },
    },
    [`https://raw.githubusercontent.com/JetBrains/example/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`]: {
      status: 200,
      body: '---\nname: commits\ndescription: Write commit messages.\n---\n',
    },
    'https://api.github.com/repos/JetBrains/example/commits/no-such-branch': { status: 404, body: { message: 'Not Found' } },
  });
  // With a token: code search sees only the default branch, so the tree is listed.
  const release = await atlas(['scan', 'https://github.com/JetBrains/example/tree/release/1.0/'], { github });
  assert.equal(release.code, 0, release.stderr);
  assert.equal(
    release.stdout,
    [
      'JetBrains/example · 1 skill',
      'commits — Write commit messages.',
      `  https://github.com/JetBrains/example/blob/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`,
    ].join('\n'),
  );

  const unknown = await atlas(['scan', 'github.com/JetBrains/example/tree/no-such-branch'], { github });
  assert.equal(unknown.code, 1);
  assert.equal(unknown.stderr, 'Branch, tag or commit not found in https://github.com/JetBrains/example: no-such-branch');
});
