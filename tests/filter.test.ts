// The filter in spec/cli.md and spec/web.md: `scan --filter <words>` and `GET /api/scan?…&q=<words>`,
// checked on ./fixture, whose skills are:
//   build             Build the subproject with its own Gradle wrapper. Use before running its tests.
//   code-style        Follow the project's code style. Use before committing Kotlin or Java changes.
//   commits           Write commit messages the way this repository does. Use for every commit.
//   plain, release-checklist: no description
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createWebServer, listen } from '../src/web.ts';
import { atlas, FIXTURE, opener } from './helpers.ts';

/** The names `scan ./fixture --filter <words>` prints, after checking its header and exit code. */
async function filtered(words: string): Promise<string[]> {
  const result = await atlas(['scan', FIXTURE, '--filter', words]);
  assert.equal(result.code, 0, result.stderr);
  const [header, ...lines] = result.stdout.split('\n');
  const names = lines.filter((line) => !line.startsWith('  ') && !line.startsWith('No skill')).map((line) => line.split(' — ')[0]);
  assert.equal(header, `fixture · ${names.length} of 5 skills`, words);
  return names;
}

test('--filter: a word of the name', async () => {
  assert.deepEqual(await filtered('plain'), ['plain']);
  assert.deepEqual(await filtered('checklist'), ['release-checklist']);
});

test('--filter: a word of the description; not the rest of the SKILL.md', async () => {
  assert.deepEqual(await filtered('gradle'), ['build']);
  assert.deepEqual(await filtered('kotlin'), ['code-style']);
  // In the SKILL.md's text only, not in its name or description.
  assert.deepEqual(await filtered('caret'), []);
  assert.deepEqual(await filtered('front matter'), []);
});

test('--filter: case-insensitive', async () => {
  assert.deepEqual(await filtered('GRADLE'), ['build']);
  assert.deepEqual(await filtered('Kotlin'), ['code-style']);
});

test('--filter: several words → the skills with all of them, in the name or the description', async () => {
  assert.deepEqual(await filtered('use before'), ['build', 'code-style']);
  assert.deepEqual(await filtered('use before kotlin'), ['code-style']);
  assert.deepEqual(await filtered('style committing'), ['code-style']);
  assert.deepEqual(await filtered('gradle kotlin'), []);
});

test('--filter: -, _, / and spaces separate words; code style, code-style and Code_Style are the same', async () => {
  for (const words of ['code style', 'code-style', 'Code_Style', 'code/style', '  code   style ']) {
    assert.deepEqual(await filtered(words), ['code-style'], words);
  }
  assert.deepEqual(await filtered('release-checklist'), ['release-checklist']);
});

test('--filter: a word matches the start of a word, not its middle', async () => {
  assert.deepEqual(await filtered('commit'), ['code-style', 'commits']);
  assert.deepEqual(await filtered('chec'), ['release-checklist']);
  assert.deepEqual(await filtered('rel che'), ['release-checklist']);
  assert.deepEqual(await filtered('ommit'), []);
  assert.deepEqual(await filtered('heck'), []);
});

test('--filter: no match → the header, an empty list and No skill matches, exit code 0', async () => {
  const none = await atlas(['scan', FIXTURE, '--filter', 'deploy']);
  assert.equal(none.code, 0);
  assert.equal(none.stdout, ['fixture · 0 of 5 skills', 'No skill matches "deploy"'].join('\n'));
  // The warnings are the scan's, filtered or not.
  assert.equal(none.stderr, (await atlas(['scan', FIXTURE])).stderr);
});

test('--filter=<words> is the same; no words to filter by → every skill, as without --filter', async () => {
  assert.deepEqual(await atlas(['scan', '--filter=gradle', FIXTURE]), await atlas(['scan', FIXTURE, '--filter', 'gradle']));
  const all = await atlas(['scan', FIXTURE]);
  for (const words of ['', ' ', '-_/']) assert.deepEqual(await atlas(['scan', FIXTURE, '--filter', words]), all, JSON.stringify(words));
});

test('scan: --filter without words, an unknown option or two inputs → the usage, exit code 1', async () => {
  for (const args of [[FIXTURE, '--filter'], [FIXTURE, '--filtre', 'x'], [FIXTURE, FIXTURE], [FIXTURE, '--filter', 'a', '--filter', 'b'], []]) {
    const wrong = await atlas(['scan', ...args]);
    assert.equal(wrong.code, 1, args.join(' '));
    assert.equal(wrong.stderr, 'Usage: skill-atlas scan <GitHub URL | directory> [--filter <words>] [--cluster]');
  }
});

test('the web view: &q=<words> → the same skills as --filter, and the total before filtering', async (t) => {
  const server = createWebServer({ open: opener() });
  const address = await listen(server, 0);
  t.after(() => server.close());
  const scanned = async (q?: string) => {
    const query = new URLSearchParams({ repository: FIXTURE, ...(q !== undefined && { q }) });
    const response = await fetch(`${address}/api/scan?${query}`);
    assert.equal(response.status, 200);
    return (await response.json()) as { skills: { name: string }[]; total?: number; warnings: string[] };
  };
  for (const words of ['use before', 'Code_Style', 'commit', 'chec', 'caret']) {
    const body = await scanned(words);
    assert.deepEqual(body.skills.map((skill) => skill.name), await filtered(words), words);
    assert.equal(body.total, 5);
    assert.equal(body.warnings.length, 2);
  }
  // Without words to filter by: every skill, and no total, as without q.
  assert.deepEqual(await scanned(' '), await scanned());
  assert.equal((await scanned()).total, undefined);
});
