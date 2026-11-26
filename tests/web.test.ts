// The decisions in spec/web.md, checked on the server the CLI starts, with GitHub answering from
// tests/helpers.ts, and on the real `skill-atlas serve`.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createWebServer, listen } from '../src/web.ts';
import { atlas, CLI, EXAMPLE_COMMIT, FIXTURE, opener } from './helpers.ts';

const server = createWebServer({ open: opener() });
const address = await listen(server, 0);
test.after(() => server.close());

async function get(path: string) {
  const response = await fetch(`${address}${path}`);
  return { status: response.status, type: response.headers.get('content-type'), text: await response.text() };
}

const scanOf = async (repository: string) => {
  const response = await get(`/api/scan?repository=${encodeURIComponent(repository)}`);
  return { status: response.status, body: JSON.parse(response.text) };
};

test('only on this machine', () => {
  const bound = server.address();
  assert.equal(typeof bound === 'object' && bound?.address, '127.0.0.1');
  assert.match(address, /^http:\/\/localhost:\d+$/);
});

test('the page: a field for a repository, the skills and the selected SKILL.md', async () => {
  const page = await get('/');
  assert.equal(page.status, 200);
  assert.equal(page.type, 'text/html; charset=utf-8');
  assert.match(page.text, /<input name="repository"[^>]*placeholder="https:\/\/github\.com\/isavina\/ai-workshop-start/);
  assert.match(page.text, /<ul id="skills">/);
  assert.match(page.text, /<article id="skill">/);
  // The address keeps the scan and the selected skill.
  assert.match(page.text, /query\.get\('repository'\)/);
  assert.match(page.text, /query\.get\('skill'\)/);
  // The SKILL.md and the names are shown as text, never as HTML.
  assert.doesNotMatch(page.text, /innerHTML/);
});

test('a GitHub repository: its skills, each with its full description, pinned link and SKILL.md', async () => {
  const { status, body } = await scanOf('https://github.com/JetBrains/example');
  assert.equal(status, 200);
  assert.deepEqual(body, {
    repository: { id: 'JetBrains/example', url: 'https://github.com/JetBrains/example', commit: EXAMPLE_COMMIT },
    skills: [
      {
        id: 'JetBrains/example:.claude/skills/commits/SKILL.md',
        name: 'commits',
        description: 'Write commit messages the way this repository does. Use for every commit.',
        path: '.claude/skills/commits/SKILL.md',
        link: `https://github.com/JetBrains/example/blob/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`,
        copies: [],
        text: '---\nname: commits\ndescription: Write commit messages the way this repository does. Use for every commit.\n---\n# Commits\n',
      },
    ],
    warnings: [],
  });
});

test('a directory: the same skills, order, copies and warnings as the CLI; each SKILL.md as it is', async () => {
  const cli = await atlas(['scan', FIXTURE]);
  const { status, body } = await scanOf(FIXTURE);
  assert.equal(status, 200);
  assert.equal(body.repository.id, 'fixture');
  assert.deepEqual(
    body.skills.map((skill: { name: string }) => skill.name),
    ['build', 'code-style', 'commits', 'plain', 'release-checklist'],
  );
  for (const skill of body.skills) {
    assert.match(cli.stdout, new RegExp(`^  ${skill.link.replaceAll('.', '\\.')}$`, 'm'));
    assert.equal(skill.text, readFileSync(join(FIXTURE, skill.path), 'utf8'), skill.path);
  }
  assert.deepEqual(body.skills.find((skill: { name: string }) => skill.name === 'commits').copies, ['.github/skills/commits/SKILL.md']);
  assert.equal(body.warnings.map((warning: string) => `warning: ${warning}`).join('\n'), cli.stderr);
});

test('errors: the same messages as the CLI, with status 400', async () => {
  assert.deepEqual(await scanOf(join(FIXTURE, 'no-such-directory')), {
    status: 400,
    body: { error: `Not a GitHub URL or a readable directory: ${join(FIXTURE, 'no-such-directory')}` },
  });
  assert.deepEqual(await scanOf('https://github.com/JetBrains/not-answered'), {
    status: 400,
    body: { error: 'Cannot reach GitHub: not recorded: https://api.github.com/repos/JetBrains/not-answered' },
  });
  assert.deepEqual(await get('/api/scan'), {
    status: 400,
    type: 'application/json; charset=utf-8',
    text: JSON.stringify({ error: 'Type a GitHub URL or a directory' }),
  });
  assert.equal((await get('/no-such-page')).status, 404);
});

test('skill-atlas serve: prints its address, serves the page and scans, stores nothing', async (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'skill-atlas-'));
  const child = spawn(process.execPath, [CLI, 'serve', '0'], { cwd });
  t.after(() => {
    child.kill();
    rmSync(cwd, { recursive: true, force: true });
  });
  const line = await new Promise<string>((resolve, reject) => {
    child.stdout.setEncoding('utf8').once('data', resolve);
    child.once('exit', (code) => reject(new Error(`exited with ${code}`)));
  });
  const [, url] = /^Skill Atlas at (http:\/\/localhost:\d+) · Ctrl\+C to stop\n$/.exec(line) ?? [];
  assert.ok(url, line);
  assert.match(await (await fetch(url)).text(), /<title>Skill Atlas<\/title>/);
  const scanned = (await (await fetch(`${url}/api/scan?repository=${encodeURIComponent(FIXTURE)}`)).json()) as { skills: unknown[] };
  assert.equal(scanned.skills.length, 5);
  assert.deepEqual(readdirSync(cwd), []);
});

test('skill-atlas serve: a port in use, or not a port → a clear message, exit code 1', async (t) => {
  const taken = createServer();
  await new Promise<void>((resolve) => taken.listen(0, '127.0.0.1', resolve));
  t.after(() => taken.close());
  const port = (taken.address() as { port: number }).port;
  const inUse = spawnSync(process.execPath, [CLI, 'serve', String(port)], { encoding: 'utf8' });
  assert.equal(inUse.status, 1);
  assert.equal(inUse.stderr, `Port ${port} is in use; try skill-atlas serve <port>\n`);

  for (const args of [['serve', 'eighty'], ['serve', '70000'], ['serve', '1', '2']]) {
    const wrong = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
    assert.equal(wrong.status, 1, args.join(' '));
    assert.equal(wrong.stderr, 'Usage: skill-atlas serve [port]\n');
  }
});

test('the browser terminal has no web view of its own', async () => {
  const served = await atlas(['serve']);
  assert.equal(served.code, 1);
  assert.equal(served.stderr, 'serve: the web view runs only from the command line');
});
