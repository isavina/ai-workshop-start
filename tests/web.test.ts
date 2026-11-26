// The decisions in spec/web.md, checked on the server the CLI starts, with GitHub answering from
// tests/helpers.ts, and on the real `skill-atlas serve`.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
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
  assert.match(page.text, /<input name="repository"[^>]*aria-describedby="hint"[^>]*placeholder="https:\/\/github\.com\/isavina\/ai-workshop-start"/);
  // Under the field, a hint on what to paste there: a GitHub URL, /tree/<ref>, or a directory.
  const hint = /<p id="hint">([\s\S]*?)<\/p>/.exec(page.text)?.[1] ?? '';
  assert.match(hint, /Paste a GitHub repository URL, such as <code>https:\/\/github\.com\/isavina\/ai-workshop-start<\/code>/);
  assert.match(hint, /<code>\/tree\/&lt;name or hash&gt;<\/code>/);
  assert.match(hint, /A directory on this machine/);
  assert.match(hint, /An organization or a user, such as <code>https:\/\/github\.com\/JetBrains<\/code>, scans every repository; it needs <code>GITHUB_TOKEN<\/code>/);
  // While it scans, the page says so; an owner's skills are grouped, and selected by owner/repo:path.
  assert.match(page.text, /say\('Scanning ' \+ what/);
  assert.match(page.text, /className: 'repository'/);
  assert.match(page.text, /result\.owner \? \(skill\) => skill\.id : \(skill\) => skill\.path/);
  assert.match(page.text, /<ul id="skills">/);
  assert.match(page.text, /<article id="skill">/);
  // The address keeps the scan and the selected skill.
  assert.match(page.text, /query\.get\('repository'\)/);
  assert.match(page.text, /query\.get\('skill'\)/);
  // The page's script, as served, is valid JavaScript: a template literal eats unescaped backslashes.
  const script = /<script>([\s\S]*?)<\/script>/.exec(page.text)?.[1] ?? '';
  assert.doesNotThrow(() => new Function(script));
  assert.match(script, /const OWNER = \/\^\(\?:https\?:\\\/\\\/\)/);
  // The SKILL.md and the names are shown as text, never as HTML.
  assert.doesNotMatch(page.text, /innerHTML/);
});

/** An element of the page, as far as its script uses one: children, text, attributes and listeners. */
class FakeElement {
  children: (FakeElement | string)[] = [];
  attributes: Record<string, string> = {};
  listeners: Record<string, (event: unknown) => void> = {};
  [property: string]: unknown;
  tagName: string;
  constructor(tagName: string) {
    this.tagName = tagName;
  }
  get textContent(): string {
    return this.children.map((child) => (typeof child === 'string' ? child : child.textContent)).join('');
  }
  set textContent(text: string) {
    this.children = [String(text)];
  }
  append(...children: (FakeElement | string)[]) {
    this.children.push(...children);
  }
  replaceChildren(...children: (FakeElement | string)[]) {
    this.children = [...children];
  }
  setAttribute(name: string, value: string) {
    this.attributes[name] = value;
  }
  addEventListener(type: string, listener: (event: unknown) => void) {
    this.listeners[type] = listener;
  }
  focus() {}
  querySelectorAll(tag: string): FakeElement[] {
    return this.children.flatMap((child) =>
      typeof child === 'string' ? [] : [...(child.tagName === tag ? [child] : []), ...child.querySelectorAll(tag)]);
  }
  querySelector(tag: string): FakeElement | undefined {
    return this.querySelectorAll(tag)[0];
  }
}

/** The served page's script, run on fake elements; its fetches and timers answered by the test. */
async function pageScript(search: string) {
  const page = await get('/');
  const script = /<script>([\s\S]*?)<\/script>/.exec(page.text)?.[1] ?? '';
  const elements: Record<string, FakeElement> = {};
  for (const id of ['scan', 'status', 'warnings', 'skills', 'skill']) elements[id] = new FakeElement(id);
  const field = new FakeElement('input');
  const button = new FakeElement('button');
  elements.scan.elements = { repository: field };
  elements.scan.append(button);
  const main = new FakeElement('main');
  const fetches: { url: string; answer: (body: unknown) => Promise<void> }[] = [];
  const timers = new Map<number, () => void>();
  let timerId = 0;
  const windowListeners: Record<string, () => void> = {};
  const location = { search };
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  runInNewContext(script, {
    document: {
      getElementById: (id: string) => elements[id],
      querySelector: () => main,
      createElement: (tag: string) => new FakeElement(tag),
    },
    window: { addEventListener: (type: string, listener: () => void) => (windowListeners[type] = listener) },
    location,
    history: { pushState: () => {}, replaceState: () => {} },
    URLSearchParams,
    Date,
    setInterval: (callback: () => void) => (timers.set(++timerId, callback), timerId),
    clearInterval: (id: number) => timers.delete(id),
    fetch: (url: string) =>
      new Promise((resolve) => {
        fetches.push({
          url,
          answer: async (body) => {
            resolve({ ok: true, json: async () => body });
            await settle();
          },
        });
      }),
  });
  return {
    status: elements.status,
    list: elements.skills,
    main,
    button,
    fetches,
    tick: () => [...timers.values()].forEach((callback) => callback()),
    submit: (repository: string) => {
      field.value = repository;
      elements.scan.listeners.submit({ preventDefault() {} });
    },
    back: (to: string) => {
      location.search = to;
      windowListeners.popstate();
    },
  };
}

test('the page: a new scan replaces one still running; the earlier one shows neither its progress nor its result', async () => {
  const one = (id: string, name: string) => ({
    repository: { id, url: `https://github.com/${id}` },
    skills: [{ name, description: '', path: `.claude/skills/${name}/SKILL.md`, link: `https://github.com/${id}/blob/x`, copies: [], text: '' }],
    warnings: [],
  });
  const single = one('isavina/ai-workshop-start', 'commits');
  const organization = {
    owner: { name: 'JetBrains', url: 'https://github.com/JetBrains' },
    scanned: 1,
    repositories: [{ repository: { id: 'JetBrains/MPS', url: 'https://github.com/JetBrains/MPS' }, skills: [{ ...one('JetBrains/MPS', 'bugfix').skills[0], id: 'JetBrains/MPS:x' }] }],
    warnings: [],
  };
  const page = await pageScript('?repository=https://github.com/isavina/ai-workshop-start');
  await page.fetches[0].answer(single);
  assert.match(page.list.textContent, /commits/);

  page.submit('https://github.com/JetBrains');
  page.tick();
  assert.match(page.status.textContent, /^Scanning every repository of https:\/\/github\.com\/JetBrains… \d+ s$/);
  page.back('?repository=https://github.com/isavina/ai-workshop-start');
  assert.equal(page.fetches.length, 3);
  // The organization's timer no longer says it is scanning; its result, when it comes, is dropped.
  page.tick();
  assert.match(page.status.textContent, /^Scanning https:\/\/github\.com\/isavina\/ai-workshop-start… \d+ s$/);
  await page.fetches[1].answer(organization);
  assert.match(page.status.textContent, /^Scanning https:\/\/github\.com\/isavina\/ai-workshop-start… \d+ s$/);
  assert.doesNotMatch(page.list.textContent, /bugfix/);
  page.tick();
  assert.match(page.status.textContent, /^Scanning https:\/\/github\.com\/isavina\/ai-workshop-start… \d+ s$/);
  assert.equal(page.button.disabled, true, 'the button waits for the scan still running');
  // The scan the user went back to is the one shown.
  await page.fetches[2].answer(single);
  assert.equal(page.status.textContent, 'isavina/ai-workshop-start · 1 skill');
  assert.match(page.list.textContent, /commits/);
  assert.doesNotMatch(page.list.textContent, /bugfix/);
  assert.equal(page.button.disabled, false);
  page.tick();
  assert.equal(page.status.textContent, 'isavina/ai-workshop-start · 1 skill');
});

test('the page: going back to the bare page drops a scan still running; it shows neither its progress nor its result', async () => {
  const organization = {
    owner: { name: 'JetBrains', url: 'https://github.com/JetBrains' },
    scanned: 1,
    repositories: [{
      repository: { id: 'JetBrains/MPS', url: 'https://github.com/JetBrains/MPS' },
      skills: [{ id: 'JetBrains/MPS:x', name: 'bugfix', description: '', path: 'x', link: 'https://github.com/JetBrains/MPS/blob/x', copies: [], text: '' }],
    }],
    warnings: [],
  };
  const page = await pageScript('');
  page.submit('https://github.com/JetBrains');
  page.tick();
  assert.match(page.status.textContent, /^Scanning every repository of https:\/\/github\.com\/JetBrains… \d+ s$/);
  page.back('');
  assert.equal(page.fetches.length, 1, 'nothing to scan on the bare page');
  assert.equal(page.status.textContent, '');
  assert.equal(page.button.disabled, false);
  page.tick();
  assert.equal(page.status.textContent, '');
  await page.fetches[0].answer(organization);
  assert.equal(page.status.textContent, '');
  assert.doesNotMatch(page.list.textContent, /bugfix/);
  assert.equal(page.main.hidden, true);
  assert.equal(page.button.disabled, false);
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
