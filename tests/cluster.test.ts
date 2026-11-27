// --cluster in spec/cli.md: the skills grouped by topic, by `claude -p`, checked on ./fixture, whose skills
// are build, code-style, commits, plain and release-checklist; Claude is tests/claude/, never the real one.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { claude, CLAUDE_TIMEOUT } from '../src/claude.ts';
import type { Ask } from '../src/core/cluster.ts';
import { atlas, CLI, FAKE_CLAUDE, FIXTURE } from './helpers.ts';

const link = (path: string) => `  file://${FIXTURE}/${path}`;

/** Claude answering `clusters`, by the skills' numbers in the prompt; the prompts it was asked, in `asked`. */
function answering(clusters: unknown, asked: string[] = []): Ask {
  return async (prompt) => {
    asked.push(prompt);
    return typeof clusters === 'string' ? clusters : JSON.stringify({ clusters });
  };
}

/** The names in the prompt, by number: what Claude was asked to cluster. */
const promptNames = (prompt: string) => [...prompt.matchAll(/^\d+\. ([^ \n]+)/gm)].map(([, name]) => name);

test('--cluster: the header with the number of clusters; each cluster, a blank line before it, `<label> · N skills`, its skills as usual', async () => {
  const result = await atlas(['scan', FIXTURE, '--cluster'], { claude: FAKE_CLAUDE.topics });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(
    result.stdout,
    [
      'fixture · 5 skills · 3 clusters',
      '',
      'Build and release · 2 skills',
      'build — Build the subproject with its own Gradle wrapper.',
      link('subproject/.claude/skills/build/SKILL.md'),
      'release-checklist',
      link('.agents/skills/release-checklist/SKILL.md'),
      '',
      'Code and commits · 2 skills',
      "code-style — Follow the project's code style.",
      link('.github/skills/code-style/SKILL.md'),
      'commits — Write commit messages the way this repository does.',
      link('.claude/skills/commits/SKILL.md'),
      '  also in .github/skills/commits/SKILL.md',
      '',
      'Other · 1 skill',
      'plain',
      link('.claude/skills/plain/SKILL.md'),
    ].join('\n'),
  );
  // The warnings are the scan's.
  assert.equal(result.stderr, (await atlas(['scan', FIXTURE])).stderr);
});

test('--cluster: clusters sorted by label, case-insensitive; Other last; each cluster\'s skills by name', async () => {
  // Numbers as the prompt has them: 1 build, 2 code-style, 3 commits, 4 plain, 5 release-checklist.
  const result = await atlas(['scan', FIXTURE, '--cluster'], {
    claude: answering([
      { label: 'Other', skills: [4] },
      { label: 'zeta', skills: [5, 1] },
      { label: 'Alpha', skills: [3, 2] },
    ]),
  });
  assert.equal(result.code, 0, result.stderr);
  const lines = result.stdout.split('\n');
  assert.equal(lines[0], 'fixture · 5 skills · 3 clusters');
  assert.deepEqual(lines.filter((line) => / · \d+ skills?$/.test(line)), ['Alpha · 2 skills', 'zeta · 2 skills', 'Other · 1 skill']);
  assert.deepEqual(
    lines.filter((line) => line && !line.startsWith('  ') && !line.includes(' · ')).map((line) => line.split(' — ')[0]),
    ['code-style', 'commits', 'build', 'release-checklist', 'plain'],
  );
});

test('--cluster: Claude sees only the names and descriptions, by number, and the rules', async () => {
  const asked: string[] = [];
  await atlas(['scan', FIXTURE, '--cluster'], { claude: answering([{ label: 'A', skills: [1, 2, 3] }, { label: 'B', skills: [4, 5] }], asked) });
  assert.equal(asked.length, 1);
  const [prompt] = asked;
  assert.match(prompt, /^1\. build — Build the subproject with its own Gradle wrapper\. Use before running its tests\.$/m);
  assert.match(prompt, /^4\. plain$/m);
  assert.deepEqual(promptNames(prompt), ['build', 'code-style', 'commits', 'plain', 'release-checklist']);
  assert.match(prompt, /Between 2 and 5 clusters/);
  assert.match(prompt, /exactly one cluster/);
  assert.match(prompt, /"Other" only for skills that fit no other cluster; at most one/);
  assert.match(prompt, /JSON only/);
  // Not the rest of the SKILL.md, nor where it is.
  assert.doesNotMatch(prompt, /caret|front matter|SKILL\.md|file:/);
});

test('--cluster with --filter: filtered first; only the matching skills are clustered', async () => {
  const asked: string[] = [];
  const result = await atlas(['scan', FIXTURE, '--filter', 'use before', '--cluster'], {
    claude: answering([{ label: 'Build', skills: [1] }, { label: 'Style', skills: [2] }], asked),
  });
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(promptNames(asked[0]), ['build', 'code-style']);
  assert.equal(result.stdout.split('\n')[0], 'fixture · 2 of 5 skills · 2 clusters');
  assert.match(result.stdout, /^Build · 1 skill\nbuild — /m);
  // In either order.
  const reversed = await atlas(['scan', FIXTURE, '--cluster', '--filter=use before'], { claude: FAKE_CLAUDE.topics });
  assert.equal(reversed.stdout.split('\n')[0], 'fixture · 2 of 5 skills · 2 clusters');
});

test('--cluster: fewer than 2 skills → no clustering, the list as without --cluster; claude is not run', async () => {
  const asked: string[] = [];
  const ask = answering([], asked);
  for (const words of ['gradle', 'deploy']) {
    const clustered = await atlas(['scan', FIXTURE, '--filter', words, '--cluster'], { claude: ask });
    assert.deepEqual(clustered, await atlas(['scan', FIXTURE, '--filter', words]), words);
  }
  assert.deepEqual(asked, []);
  // Without a claude command at all.
  const missing = await atlas(['scan', FIXTURE, '--filter', 'gradle', '--cluster'], { claude: '/no/such/claude' });
  assert.equal(missing.code, 0, missing.stderr);
});

test('--cluster: an invalid answer → a clear message, exit code 1, no partial result', async () => {
  const invalid: [unknown, string][] = [
    ['Sorry, I cannot do that.', 'no JSON with "clusters" in its answer'],
    [{ groups: [] }, 'no JSON with "clusters" in its answer'],
    [[{ label: 'All', skills: [1, 2, 3, 4, 5] }], '1 clusters, not 2 to 8'],
    [Array.from({ length: 9 }, (_, i) => ({ label: `C${i}`, skills: [i + 1] })), '9 clusters, not 2 to 8'],
    [[{ label: 'A', skills: [1, 2, 3] }, { label: 'B', skills: [3, 4, 5] }], 'skill 3 is in "A" and in "B"'],
    [[{ label: 'A', skills: [1, 2] }, { label: 'B', skills: [3] }], 'skills 4, 5 in no cluster'],
    [[{ label: 'A', skills: [1, 2, 3, 4] }, { label: 'B', skills: [5, 6] }], '"B" has no skill 6'],
    [[{ label: 'A', skills: [1, 2, 3, 4] }, { label: 'B', skills: ['5'] }], '"B" has no skill "5"'],
    [[{ label: 'A', skills: [1, 2, 3, 4, 5] }, { label: 'B', skills: [] }], '"B" has no skills'],
    [[{ label: ' ', skills: [1, 2] }, { label: 'B', skills: [3, 4, 5] }], 'a cluster without a label'],
    [[{ label: 'Other', skills: [1, 2] }, { label: 'other', skills: [3, 4, 5] }], 'two clusters labelled "other"'],
    [[{ label: 'x'.repeat(61), skills: [1, 2] }, { label: 'B', skills: [3, 4, 5] }], 'a label longer than 60 characters'],
  ];
  for (const [answer, reason] of invalid) {
    const result = await atlas(['scan', FIXTURE, '--cluster'], { claude: answering(answer) });
    assert.deepEqual(result, { code: 1, stdout: '', stderr: `claude -p gave an invalid clustering: ${reason}` }, reason);
  }
});

test('--cluster: the JSON alone, or in a ```json block after a sentence', async () => {
  const clusters = [{ label: 'A', skills: [1, 2, 3] }, { label: 'B', skills: [4, 5] }];
  for (const answer of [
    JSON.stringify({ clusters }),
    `Sure.\n\`\`\`json\n${JSON.stringify({ clusters }, null, 2)}\n\`\`\`\n`,
    `Grouped {as asked}: ${JSON.stringify({ clusters })}`,
  ]) {
    const result = await atlas(['scan', FIXTURE, '--cluster'], { claude: answering(answer) });
    assert.equal(result.stdout.split('\n')[0], 'fixture · 5 skills · 2 clusters');
  }
});

test('--cluster: claude -p missing or failing → a clear message, exit code 1, no fallback to the plain scan', async () => {
  assert.deepEqual(await atlas(['scan', FIXTURE, '--cluster'], { claude: '/no/such/claude' }), {
    code: 1,
    stdout: '',
    stderr: 'Cannot run /no/such/claude: not found; install Claude Code, or set SKILL_ATLAS_CLAUDE to its command',
  });
  assert.deepEqual(await atlas(['scan', FIXTURE, '--cluster'], { claude: FAKE_CLAUDE.fails }), {
    code: 1,
    stdout: '',
    stderr: 'claude -p failed (exit code 1): Not logged in · Please run /login',
  });
});

test('--cluster: 2 minutes without an answer → a clear message, exit code 1', async () => {
  assert.equal(CLAUDE_TIMEOUT, 2 * 60 * 1000);
  const ask = claude({ command: FAKE_CLAUDE.slow, timeout: 300 });
  const started = Date.now();
  assert.deepEqual(await atlas(['scan', FIXTURE, '--cluster'], { claude: ask }), {
    code: 1,
    stdout: '',
    stderr: 'claude -p did not answer in 0.3 s',
  });
  assert.ok(Date.now() - started < 10_000, 'the slow claude is stopped, not waited for');
  // Also through a wrapper without exec, whose child holds its output: not waited for either.
  const wrapped = Date.now();
  await assert.rejects(claude({ command: FAKE_CLAUDE.slowWrapper, timeout: 300 })('x'), /did not answer in 0\.3 s/);
  assert.ok(Date.now() - wrapped < 10_000, 'the wrapper\'s child is not waited for');
  // Stopped when asked, as the web view does when its page goes away.
  const stop = new AbortController();
  const stopped = claude({ command: FAKE_CLAUDE.slow })('x', stop.signal);
  stop.abort();
  await assert.rejects(stopped, /claude -p was cancelled/);
});

test('--cluster: claude -p with no tools, no MCP servers, no slash commands, no session saved, outside the project', async () => {
  const result = await atlas(['scan', FIXTURE, '--cluster'], { claude: FAKE_CLAUDE.args });
  assert.equal(result.code, 1);
  assert.equal(
    result.stderr,
    `claude -p failed (exit code 1): ${JSON.stringify(['-p', '--tools', '', '--strict-mcp-config', '--no-session-persistence', '--disable-slash-commands'])} in ${realpathSync(tmpdir())}`,
  );
});

test('--cluster: SKILL_ATLAS_CLAUDE not an executable → a clear message, exit code 1', async () => {
  assert.deepEqual(await atlas(['scan', FIXTURE, '--cluster'], { claude: FIXTURE }), {
    code: 1,
    stdout: '',
    stderr: `Cannot run ${FIXTURE}: not an executable; SKILL_ATLAS_CLAUDE is the path of one command, without arguments`,
  });
});

test('--cluster: twice, or with a value → the usage, exit 1; the help shows it', async () => {
  for (const args of [['--cluster', '--cluster'], ['--cluster=yes']]) {
    assert.deepEqual(await atlas(['scan', FIXTURE, ...args], { claude: FAKE_CLAUDE.topics }), {
      code: 1,
      stdout: '',
      stderr: 'Usage: skill-atlas scan <GitHub URL | directory> [--filter <words>] [--cluster]',
    });
  }
  assert.match((await atlas(['help'])).stdout, /^ {4}--cluster {21}the skills grouped by topic, by claude -p$/m);
});

test('--cluster in the browser terminal: no claude -p there, a clear message', async () => {
  assert.deepEqual(await atlas(['scan', FIXTURE, '--cluster']), {
    code: 1,
    stdout: '',
    stderr: '--cluster: claude -p runs only from the command line',
  });
});

test('skill-atlas scan --cluster: the real CLI runs SKILL_ATLAS_CLAUDE as claude -p, the prompt on its stdin; nothing else changes', () => {
  const run = (env: Record<string, string>) =>
    spawnSync(process.execPath, [CLI, 'scan', FIXTURE, '--cluster'], { encoding: 'utf8', env: { ...process.env, ...env } });
  const clustered = run({ SKILL_ATLAS_CLAUDE: FAKE_CLAUDE.topics });
  assert.equal(clustered.status, 0, clustered.stderr);
  assert.match(clustered.stdout, /^fixture · 5 skills · 3 clusters\n\nBuild and release · 2 skills\n/);
  // claude, by default: on PATH, or a clear message.
  const fallback = run({ SKILL_ATLAS_CLAUDE: '', PATH: '/nonexistent' });
  assert.equal(fallback.status, 1);
  assert.equal(fallback.stderr, 'Cannot run claude: not found; install Claude Code, or set SKILL_ATLAS_CLAUDE to its command\n');
  assert.equal(fallback.stdout, '');
});
