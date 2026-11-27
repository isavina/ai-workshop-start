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
import { createWebServer, listen, MAX_ADDRESS, MAX_INPUT, TOO_LONG } from '../src/web.ts';
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
  for (const id of ['scan', 'status', 'warnings', 'filter', 'skills', 'skill']) elements[id] = new FakeElement(id);
  elements.filter.value = '';
  const field = new FakeElement('input');
  const button = new FakeElement('button');
  elements.scan.elements = { repository: field };
  elements.scan.append(button);
  const main = new FakeElement('main');
  const fetches: { url: string; answer: (body: unknown) => Promise<void>; fail: (status: number, statusText: string) => Promise<void> }[] = [];
  const timers = new Map<number, () => void>();
  let timerId = 0;
  const windowListeners: Record<string, () => void> = {};
  const location = { search };
  const addresses: string[] = [];
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  runInNewContext(script, {
    document: {
      getElementById: (id: string) => elements[id],
      querySelector: () => main,
      createElement: (tag: string) => new FakeElement(tag),
      addEventListener: () => {},
    },
    window: { addEventListener: (type: string, listener: () => void) => (windowListeners[type] = listener) },
    location,
    history: {
      pushState: (_: unknown, __: string, url: string) => addresses.push(url),
      replaceState: (_: unknown, __: string, url: string) => (addresses[Math.max(0, addresses.length - 1)] = url),
    },
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
          /** An answer with no JSON in it, such as a proxy's or an empty one. */
          fail: async (status, statusText) => {
            resolve({ ok: false, status, statusText, json: async () => { throw new SyntaxError('Unexpected end of JSON input'); } });
            await settle();
          },
        });
      }),
  });
  return {
    status: elements.status,
    list: elements.skills,
    article: elements.skill,
    main,
    /** The address, as the page last set it. */
    address: () => addresses.at(-1),
    filter: (words: string) => {
      elements.filter.value = words;
      elements.filter.listeners.input({});
    },
    click: (name: string) =>
      (elements.skills.querySelectorAll('button').find((button) => button.textContent.startsWith(name))?.onclick as () => void)(),
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

test('a long input, 1,500 emoji (18 KB encoded): the CLI message, status 400; reloaded, the page', async () => {
  const input = '😀'.repeat(1500);
  assert.ok(encodeURIComponent(input).length > 16 * 1024, "longer than Node's default header limit");
  assert.deepEqual(await scanOf(input), { status: 400, body: { error: `Not a GitHub URL or a readable directory: ${input}` } });
  const reloaded = await get(`/?repository=${encodeURIComponent(input)}`);
  assert.equal(reloaded.status, 200);
  assert.match(reloaded.text, /<input name="repository"/);
});

test('an address over 1 MiB: status 431 and the page, the field with it; the server goes on', async () => {
  for (const path of [`/?repository=${'x'.repeat(MAX_ADDRESS)}`, `/api/scan?repository=${'x'.repeat(MAX_ADDRESS)}`]) {
    const answered = await get(path);
    assert.equal(answered.status, 431);
    assert.equal(answered.type, 'text/html; charset=utf-8');
    assert.match(answered.text, /<input name="repository"/);
  }
  assert.equal((await get('/')).status, 200);
});

test('the page: an input too long for the server to read → Too long to be a repository, in the error colour, nothing asked', async () => {
  const input = 'x'.repeat(MAX_INPUT + 1);
  const page = await pageScript('?repository=' + input);
  assert.equal(page.fetches.length, 0);
  assert.equal(page.status.textContent, TOO_LONG);
  assert.equal(page.status.className, 'error');
  assert.equal(page.button.disabled, false);
  // The longest it asks for, the server reads.
  const longest = 'x'.repeat(MAX_INPUT);
  assert.equal((await scanOf(longest)).body.error, `Not a GitHub URL or a readable directory: ${longest}`);
});

test('the page: an answer that is not JSON is said as such, in the error colour, not as an unreachable server', async () => {
  const page = await pageScript('?repository=' + encodeURIComponent('/nope'));
  await page.fetches[0].fail(431, 'Request Header Fields Too Large');
  assert.equal(page.status.textContent, 'The Skill Atlas server answered 431 Request Header Fields Too Large, not a scan');
  assert.equal(page.status.className, 'error');
  assert.equal(page.button.disabled, false);
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

/** A scan as the API answers it: one repository's skills, or an owner's, grouped by repository. */
const skillOf = (repository: string, name: string, description: string) => ({
  id: `${repository}:.claude/skills/${name}/SKILL.md`,
  name,
  description,
  path: `.claude/skills/${name}/SKILL.md`,
  link: `https://github.com/${repository}/blob/x/.claude/skills/${name}/SKILL.md`,
  copies: [],
  text: `---\nname: ${name}\n---\n`,
});
const ONE = {
  repository: { id: 'Acme/tools', url: 'https://github.com/Acme/tools' },
  skills: [
    skillOf('Acme/tools', 'code-review', 'Review a pull request.'),
    skillOf('Acme/tools', 'commits', 'Write commit messages.'),
    skillOf('Acme/tools', 'release', 'Tag and announce a release; review the notes.'),
  ],
  warnings: [],
};
const shownNames = (list: FakeElement) =>
  list.querySelectorAll('span').filter((span) => span.className === 'name').map((span) => span.textContent);

test('the page: the filter is instant, on the scan already done; N of M skills; the address keeps &q=', async () => {
  const page = await pageScript('?repository=Acme%2Ftools');
  await page.fetches[0].answer(ONE);
  assert.equal(page.status.textContent, 'Acme/tools · 3 skills');
  assert.deepEqual(shownNames(page.list), ['code-review', 'commits', 'release']);

  page.filter('rev');
  assert.equal(page.fetches.length, 1, 'never scans again');
  assert.equal(page.status.textContent, 'Acme/tools · 2 of 3 skills');
  assert.deepEqual(shownNames(page.list), ['code-review', 'release']);
  // The words matched are marked, at the start of a word.
  const marks = page.list.querySelectorAll('mark').map((mark) => mark.textContent);
  assert.deepEqual(marks, ['rev', 'Rev', 'rev']);
  assert.equal(page.address(), '?repository=Acme%2Ftools&q=rev&skill=.claude%2Fskills%2Fcode-review%2FSKILL.md');

  // The same filter as the CLI: separators, several words, all of them.
  page.filter('Code_Review');
  assert.deepEqual(shownNames(page.list), ['code-review']);
  // A shorter word does not hide a longer one: `c code` marks `code`, not only its `c`.
  page.filter('c code');
  assert.deepEqual(shownNames(page.list), ['code-review']);
  assert.deepEqual(page.list.querySelectorAll('mark').map((mark) => mark.textContent), ['code']);
  page.filter('review notes');
  assert.deepEqual(shownNames(page.list), ['release']);

  // release, the only match, was selected; it stays, with every skill shown again.
  page.filter('');
  assert.equal(page.status.textContent, 'Acme/tools · 3 skills');
  assert.equal(page.address(), '?repository=Acme%2Ftools&skill=.claude%2Fskills%2Frelease%2FSKILL.md');
});

test('the page: the selected skill stays open while it matches; otherwise the first match; no match → No skill matches', async () => {
  const page = await pageScript('?repository=Acme%2Ftools');
  await page.fetches[0].answer(ONE);
  page.click('release');
  assert.equal((page.article.querySelector('h2') as FakeElement).textContent, 'release');

  page.filter('review');
  assert.equal((page.article.querySelector('h2') as FakeElement).textContent, 'release', 'still matches');
  page.filter('commit');
  assert.equal((page.article.querySelector('h2') as FakeElement).textContent, 'commits', 'the first match');
  assert.match(page.address() ?? '', /&q=commit&skill=\.claude%2Fskills%2Fcommits%2FSKILL\.md$/);

  page.filter('deploy');
  assert.deepEqual(shownNames(page.list), []);
  assert.equal(page.list.textContent, 'No skill matches "deploy"');
  assert.equal(page.status.textContent, 'Acme/tools · 0 of 3 skills');
  assert.equal(page.article.children.length, 0);
  assert.equal(page.main.hidden, false, 'the filter stays, to change it');
  assert.equal(page.address(), '?repository=Acme%2Ftools&q=deploy');
});

test('the page: a filtered address, reloaded, shows the same; an organization, only repositories with a match', async () => {
  const organization = {
    owner: { name: 'Acme', url: 'https://github.com/Acme' },
    scanned: 3,
    repositories: [
      { repository: { id: 'Acme/tools', url: 'https://github.com/Acme/tools' }, skills: ONE.skills },
      { repository: { id: 'Acme/web', url: 'https://github.com/Acme/web' }, skills: [skillOf('Acme/web', 'deploy', 'Deploy the site.')] },
    ],
    warnings: [],
  };
  const page = await pageScript('?repository=github.com%2FAcme&q=review&skill=Acme%2Ftools%3A.claude%2Fskills%2Frelease%2FSKILL.md');
  assert.equal(page.fetches[0].url, '/api/scan?repository=github.com%2FAcme', 'the whole scan: the page filters it');
  await page.fetches[0].answer(organization);
  assert.equal(page.status.textContent, 'Acme · 2 of 4 skills in 1 repository');
  assert.deepEqual(
    page.list.children.map((item) => (item as FakeElement).className === 'repository' ? `[${(item as FakeElement).textContent}]` : (item as FakeElement).textContent.split('.')[0]),
    ['[Acme/tools2 skills]', 'code-reviewReview a pull request', 'releaseTag and announce a release; review the notes'],
  );
  assert.equal((page.article.querySelector('h2') as FakeElement).textContent, 'release');

  page.filter('');
  assert.equal(page.status.textContent, 'Acme · 4 skills in 2 repositories');
});

test('the page: a new scan keeps the filter, in the address too; it asks for the whole scan', async () => {
  const page = await pageScript('?repository=Acme%2Ftools');
  await page.fetches[0].answer(ONE);
  page.filter('review');
  page.submit('Acme/other');
  assert.equal(page.address(), '?repository=Acme%2Fother&q=review');
  assert.equal(page.fetches[1].url, '/api/scan?repository=Acme%2Fother');
  await page.fetches[1].answer({ ...ONE, repository: { id: 'Acme/other', url: 'https://github.com/Acme/other' } });
  assert.equal(page.status.textContent, 'Acme/other · 2 of 3 skills');
  assert.deepEqual(shownNames(page.list), ['code-review', 'release']);
});
