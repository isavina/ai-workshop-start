// The filter in spec/analysis.md and spec/cli.md: `skill-atlas scan <input> --filter <words>` on the
// fixture, and the API's `&q=<words>` giving the same skills. An organization: organization.test.ts;
// the page: web.test.ts.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createWebServer, listen } from '../src/web.ts';
import { atlas, FIXTURE, opener } from './helpers.ts';

/** The names `scan <fixture> --filter <words>` prints, after checking its header and exit code. */
async function names(filter: string, total = 5) {
  const filtered = await atlas(['scan', FIXTURE, '--filter', filter]);
  assert.equal(filtered.code, 0, filtered.stderr);
  const [header, ...lines] = filtered.stdout.split('\n');
  const shown = lines.filter((line) => /^\S/.test(line) && !line.startsWith('No skill matches')).map((line) => line.split(' — ')[0]);
  assert.equal(header, `fixture · ${shown.length} of ${total} skills`, filter);
  return shown;
}

test('--filter: a word of the name', async () => {
  assert.deepEqual(await names('commits'), ['commits']);
  assert.deepEqual(await names('checklist'), ['release-checklist']);
});

test('--filter: a word of the description only', async () => {
  assert.deepEqual(await names('gradle'), ['build']);
  assert.deepEqual(await names('messages'), ['commits']);
  // Not the rest of the SKILL.md: `tabs` and `caret` are only in the text under the front matter.
  assert.deepEqual(await names('tabs'), []);
  assert.deepEqual(await names('caret'), []);
});

test('--filter: several words → the skills with all of them, in the name or the description', async () => {
  assert.deepEqual(await names('build tests'), ['build']);
  assert.deepEqual(await names('project style'), ['code-style']);
  assert.deepEqual(await names('build commit'), []);
});

test('--filter: case-insensitive; -, _, / and spaces separate words', async () => {
  for (const filter of ['code style', 'code-style', 'Code_Style', 'CODE/style', '  code   style ']) {
    assert.deepEqual(await names(filter), ['code-style'], filter);
  }
});

test('--filter: a word matches the start of a word, not its middle', async () => {
  assert.deepEqual(await names('grad'), ['build']);
  // `commits`, and code-style's `committing`.
  assert.deepEqual(await names('com'), ['code-style', 'commits']);
  assert.deepEqual(await names('radle'), []);
});

test('--filter: no match → the header, a message, exit code 0; the warnings as without a filter', async () => {
  const none = await atlas(['scan', FIXTURE, '--filter', 'deploy']);
  const all = await atlas(['scan', FIXTURE]);
  assert.equal(none.code, 0);
  assert.equal(none.stdout, 'fixture · 0 of 5 skills\nNo skill matches "deploy"');
  assert.equal(none.stderr, all.stderr);
});

test('--filter: before or after the input; each skill printed as without a filter', async () => {
  const all = await atlas(['scan', FIXTURE]);
  const before = await atlas(['scan', '--filter', 'commits', FIXTURE]);
  const after = await atlas(['scan', FIXTURE, '--filter', 'commits']);
  assert.equal(before.stdout, after.stdout);
  const [, ...lines] = after.stdout.split('\n');
  assert.deepEqual(lines, all.stdout.split('\n').filter((line, i, every) => every.slice(i - 2, i + 1).some((each) => each.startsWith('commits'))));
  assert.deepEqual(lines.length, 3, 'name, link, also in');
});

test('--filter without words: without its value → the usage, exit code 1; empty → no filter', async () => {
  for (const args of [['scan', FIXTURE, '--filter'], ['scan', '--filter', FIXTURE], ['scan', '--filter', 'x']]) {
    const wrong = await atlas(args);
    assert.equal(wrong.code, 1, args.join(' '));
    assert.equal(wrong.stderr, 'Usage: skill-atlas scan <GitHub URL | directory> [--filter <words>]');
  }
  for (const filter of ['', ' ', '-_/']) {
    assert.equal((await atlas(['scan', FIXTURE, '--filter', filter])).stdout, (await atlas(['scan', FIXTURE])).stdout, `"${filter}"`);
  }
});

test('the API: &q=<words> gives the skills --filter prints, and the total', async () => {
  const server = createWebServer({ open: opener() });
  const address = await listen(server, 0);
  try {
    for (const q of ['code-style', 'Gradle', 'grad', 'build tests', 'deploy']) {
      const response = await fetch(`${address}/api/scan?repository=${encodeURIComponent(FIXTURE)}&q=${encodeURIComponent(q)}`);
      const body = (await response.json()) as { total?: number; skills: { name: string }[] };
      assert.equal(response.status, 200);
      assert.equal(body.total, 5);
      assert.deepEqual(body.skills.map((skill: { name: string }) => skill.name), await names(q), q);
    }
    // Without words, no filter: no total, every skill.
    const all = (await (await fetch(`${address}/api/scan?repository=${encodeURIComponent(FIXTURE)}&q=`)).json()) as { total?: number; skills: unknown[] };
    assert.equal(all.total, undefined);
    assert.equal(all.skills.length, 5);
  } finally {
    server.close();
  }
});
