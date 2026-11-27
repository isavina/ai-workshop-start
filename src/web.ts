// The local web view: a field for a repository or an owner, its skills and their SKILL.md. A Node
// server on this machine only; each scan is done when asked, and nothing is stored.
import { createServer, type Server } from 'node:http';
import { AtlasError } from './core/errors.ts';
import { isFilter, skillFilter } from './core/filter.ts';
import { skillLink, type Repository, type Skill } from './core/model.ts';
import { isOwner, scan, scanOwner, type Owner, type Source } from './core/scan.ts';

export type WebOptions = {
  /** Opens what the user typed into the field, as `scan` does. */
  open(input: string): Promise<Source | Owner>;
};

/**
 * `GET /`: the page. `GET /api/scan?repository=<GitHub URL | directory | github.com/<owner>>`: the
 * scan as JSON, an owner's grouped by repository, or `{ error }` with status 400 for what the CLI
 * would explain and exit 1 for. `&q=<words>` keeps only the skills matching them, as `--filter` does, and
 * adds `total`, the skills before filtering. Another `Host`, or a request from another site → 403: see `fromThisMachine`.
 */
export function createWebServer({ open }: WebOptions): Server {
  return createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const send = (status: number, type: string, body: string) => {
      response.writeHead(status, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store' });
      response.end(body);
    };
    const json = (status: number, body: unknown) => send(status, 'application/json', JSON.stringify(body));

    if (!fromThisMachine(request.headers.host, request.headers.origin, request.headers['sec-fetch-site'])) {
      return json(403, { error: 'Skill Atlas answers only http://localhost or http://127.0.0.1, from its own page' });
    }
    if (request.method !== 'GET') return json(405, { error: 'Only GET' });
    if (url.pathname === '/') return send(200, 'text/html', PAGE);
    if (url.pathname !== '/api/scan') return json(404, { error: `Not found: ${url.pathname}` });

    const input = url.searchParams.get('repository')?.trim();
    if (!input) return json(400, { error: 'Type a GitHub URL or a directory' });
    const q = url.searchParams.get('q') ?? undefined;
    const matches = isFilter(q) ? skillFilter(q) : undefined;
    try {
      const opened = await open(input);
      if (isOwner(opened)) {
        if (!opened.authenticated) {
          throw new AtlasError(`${opened.url} is an organization or a user: scanning all of its repositories takes a request or two each; set GITHUB_TOKEN and restart skill-atlas serve`);
        }
        const result = await scanOwner(opened);
        const repositories = result.results
          .map((repository) => ({ ...repository, matched: matches ? repository.skills.filter(matches) : repository.skills }))
          .filter((repository) => repository.matched.length > 0);
        return json(200, {
          owner: { name: result.owner, url: opened.url },
          scanned: result.scanned,
          repositories: repositories.map((repository) => ({
            repository: repositoryJson(repository.repository),
            skills: repository.matched.map((skill) => skillJson(repository.repository, skill)),
          })),
          ...(matches && { total: result.results.reduce((sum, repository) => sum + repository.skills.length, 0) }),
          warnings: result.warnings,
        });
      }
      const result = await scan(opened);
      json(200, {
        repository: repositoryJson(result.repository),
        skills: (matches ? result.skills.filter(matches) : result.skills).map((skill) => skillJson(result.repository, skill)),
        ...(matches && { total: result.skills.length }),
        warnings: result.warnings,
      });
    } catch (error) {
      if (error instanceof AtlasError) return json(400, { error: error.message });
      json(500, { error: `Unexpected error: ${error instanceof Error ? error.message : String(error)}` });
    }
  });
}

/**
 * A request this machine's browser sent to this server, by its own name: `Host` is `localhost` or
 * `127.0.0.1`, any port, and `Origin`, when there is one, is that same address. Another name, as DNS
 * rebinding brings (`attacker.test` pointed at 127.0.0.1), or another site's page asking → no.
 * Another site's `<img>` or no-cors `fetch` sends no `Origin`, but browsers still send `Sec-Fetch-Site`:
 * only `same-origin` (the page's own fetch) and `none` (the address bar) pass; curl sends neither.
 */
function fromThisMachine(host: string | undefined, origin: string | undefined, site: string | undefined): boolean {
  if (site !== undefined && !['same-origin', 'none'].includes(site.toLowerCase())) return false;
  if (!host) return false;
  let address: URL;
  try {
    address = new URL(`http://${host}`);
  } catch {
    return false;
  }
  if (address.hostname !== 'localhost' && address.hostname !== '127.0.0.1') return false;
  return origin === undefined || origin.toLowerCase() === address.origin;
}

function repositoryJson({ id, url, commit }: Repository) {
  return { id, url, commit };
}

function skillJson(repository: Repository, skill: Skill) {
  const { id, name, description, path, copies, text } = skill;
  return { id, name, description, path, link: skillLink(repository, skill), copies, text };
}

/** Listens on this machine only; resolves with the address, such as `http://localhost:4173`. */
export function listen(server: Server, port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    server.once('error', (error: NodeJS.ErrnoException) =>
      reject(error.code === 'EADDRINUSE' ? new AtlasError(`Port ${port} is in use; try skill-atlas serve <port>`) : error),
    );
    server.listen(port, '127.0.0.1', () => {
      const address = server.address();
      resolve(`http://localhost:${typeof address === 'object' && address ? address.port : port}`);
    });
  });
}

// String.raw: the script's backslashes, as in its regular expressions, are served as they are written.
const PAGE = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Skill Atlas</title>
<style>
  :root {
    color-scheme: light dark;
    --fg: #18181b; --muted: #71717a; --faint: #a1a1aa; --bg: #fafafa; --surface: #fff; --sunken: #f4f4f5;
    --border: #e4e4e7; --accent: #4f46e5; --accent-soft: #eef2ff; --mark: #e0e7ff;
    --warn: #a16207; --warn-soft: #fefce8; --error: #dc2626; --error-soft: #fef2f2;
    --shadow: 0 1px 2px rgb(0 0 0 / .04), 0 1px 1px rgb(0 0 0 / .02);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --fg: #ececef; --muted: #9b9ba4; --faint: #63636b; --bg: #0c0c0e; --surface: #141417; --sunken: #1b1b1f;
      --border: #27272c; --accent: #a5b4fc; --accent-soft: #1e1b4b; --mark: #312e81;
      --warn: #d4a72c; --warn-soft: #1f1a07; --error: #f87171; --error-soft: #2a1111;
      --shadow: none;
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--fg); background: var(--bg); -webkit-font-smoothing: antialiased; }
  .wrap { max-width: 1240px; margin: 0 auto; padding: 0 32px; }
  a { color: inherit; text-decoration-color: var(--faint); text-underline-offset: 2px; }
  a:hover { color: var(--accent); text-decoration-color: currentColor; }
  code, pre, .path, kbd { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
  button, input { font: inherit; color: inherit; }
  button { cursor: pointer; }
  :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

  header { padding: 40px 0 8px; }
  .brand { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; }
  .brand svg { color: var(--accent); }
  h1 { margin: 0; font-size: 17px; font-weight: 600; letter-spacing: -.01em; }
  .tagline { color: var(--muted); font-size: 13px; }
  .tagline::before { content: "·"; margin-right: 10px; color: var(--faint); }
  form { display: flex; gap: 6px; padding: 5px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; box-shadow: var(--shadow); }
  form:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
  form input:focus-visible, #filter:focus-visible { outline: none; }
  form input { flex: 1; min-width: 0; padding: 7px 10px; background: none; border: 0; outline: none; font-size: 15px; }
  form input::placeholder { color: var(--faint); }
  form button { padding: 7px 18px; font-weight: 500; color: var(--bg); background: var(--fg); border: 0; border-radius: 8px; }
  form button:hover { opacity: .88; }
  form button:disabled { opacity: .45; cursor: progress; }
  #hint { margin: 10px 2px 0; color: var(--muted); font-size: 12.5px; line-height: 1.6; }
  #hint code { padding: 1px 5px; font-size: 11.5px; color: var(--fg); background: var(--sunken); border-radius: 4px; }

  #status { margin: 20px 0 0; min-height: 22px; color: var(--muted); font-size: 13px; }
  #status a { color: var(--fg); font-weight: 600; text-decoration: none; }
  #status a:hover { color: var(--accent); }
  #status.error { padding: 10px 14px; color: var(--error); background: var(--error-soft); border: 1px solid color-mix(in srgb, var(--error) 25%, transparent); border-radius: 10px; }
  #warnings { margin: 10px 0 0; padding: 0; list-style: none; }
  #warnings li { position: relative; padding: 3px 0 3px 16px; color: var(--warn); font-size: 12.5px; overflow-wrap: anywhere; }
  #warnings li::before { content: ""; position: absolute; left: 2px; top: .8em; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }

  main { display: grid; grid-template-columns: minmax(260px, 360px) minmax(0, 1fr); gap: 20px; margin: 16px auto 40px; align-items: start; }
  main[hidden] { display: none; }
  aside, #skill { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; box-shadow: var(--shadow); }
  aside { position: sticky; top: 16px; display: flex; flex-direction: column; max-height: calc(100vh - 32px); overflow: hidden; }
  .filter { position: relative; padding: 10px; border-bottom: 1px solid var(--border); }
  .filter svg { position: absolute; left: 22px; top: 50%; transform: translateY(-50%); color: var(--faint); pointer-events: none; }
  #filter { width: 100%; padding: 7px 34px 7px 34px; background: var(--sunken); border: 1px solid transparent; border-radius: 8px; outline: none; }
  #filter:focus { background: var(--surface); border-color: var(--accent); }
  #filter::placeholder { color: var(--faint); }
  #filter::-webkit-search-cancel-button { display: none; }
  .filter kbd { position: absolute; right: 20px; top: 50%; transform: translateY(-50%); padding: 0 6px; font-size: 11px; line-height: 18px; color: var(--faint); border: 1px solid var(--border); border-radius: 5px; pointer-events: none; }
  #filter:focus + kbd, #filter:not(:placeholder-shown) + kbd { display: none; }
  #skills { flex: 1; margin: 0; padding: 6px; list-style: none; overflow: auto; }
  #skills button { display: block; width: 100%; padding: 9px 12px; text-align: left; background: none; border: 0; border-radius: 8px; }
  #skills button:hover { background: var(--sunken); }
  #skills button[aria-current="true"] { background: var(--accent-soft); }
  #skills button[aria-current="true"] .name { color: var(--accent); }
  #skills .repository { display: flex; justify-content: space-between; gap: 8px; padding: 14px 12px 4px; font-size: 11.5px; font-weight: 600; letter-spacing: .02em; color: var(--muted); overflow-wrap: anywhere; }
  #skills .repository:first-child { padding-top: 6px; }
  #skills .repository a { text-decoration: none; }
  #skills .repository .count { font-weight: 400; color: var(--faint); white-space: nowrap; }
  #skills .empty { padding: 28px 12px; text-align: center; color: var(--muted); font-size: 13px; }
  .name { font-weight: 600; font-size: 13.5px; }
  .description { display: block; margin-top: 1px; color: var(--muted); font-size: 12.5px; line-height: 1.5; }
  .path { display: block; margin-top: 3px; color: var(--faint); font-size: 11px; overflow-wrap: anywhere; }
  mark { color: inherit; background: var(--mark); border-radius: 3px; box-shadow: 0 0 0 1px var(--mark); }

  #skill { padding: 24px 28px 28px; min-width: 0; }
  #skill:empty { display: none; }
  #skill h2 { margin: 0; font-size: 20px; font-weight: 600; letter-spacing: -.015em; }
  #skill .meta { margin: 6px 0 18px; color: var(--muted); font-size: 12.5px; overflow-wrap: anywhere; }
  #skill .meta a { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 12px; }
  pre { margin: 0; padding: 18px 20px; background: var(--sunken); border-radius: 10px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12.5px; line-height: 1.65; }
</style>
</head>
<body>
<div class="wrap">
<header>
  <div class="brand">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="m15.5 8.5-2 5-5 2 2-5z"/></svg>
    <h1>Skill Atlas</h1>
    <span class="tagline">Every SKILL.md in a repository</span>
  </div>
  <form id="scan">
    <input name="repository" aria-label="Repository" aria-describedby="hint" placeholder="https://github.com/isavina/ai-workshop-start" required>
    <button type="submit">Scan</button>
  </form>
  <p id="hint">Paste a GitHub repository URL, such as <code>https://github.com/isavina/ai-workshop-start</code>.
    For a branch, tag or commit, add <code>/tree/&lt;name or hash&gt;</code>.
    A directory on this machine, such as <code>/home/me/my-project</code>, works too.
    An organization or a user, such as <code>https://github.com/JetBrains</code>, scans every repository; it needs <code>GITHUB_TOKEN</code>.</p>
</header>
<p id="status" role="status"></p>
<ul id="warnings"></ul>
<main hidden>
  <aside>
    <div class="filter">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input id="filter" type="search" aria-label="Filter skills" placeholder="Filter by name or description" autocomplete="off" spellcheck="false">
      <kbd>/</kbd>
    </div>
    <ul id="skills"></ul>
  </aside>
  <article id="skill"></article>
</main>
</div>
<script>
const form = document.getElementById('scan');
const field = form.elements.repository;
const status = document.getElementById('status');
const warnings = document.getElementById('warnings');
const main = document.querySelector('main');
const filter = document.getElementById('filter');
const list = document.getElementById('skills');
const article = document.getElementById('skill');
/** The scan shown, and the skill selected in it. */
let current;

/** The same filter as the CLI's --filter and the API's q: src/core/filter.ts. */
const skillFilter = ${String(skillFilter)};
const isFilter = ${String(isFilter)};

function element(tag, properties = {}, ...children) {
  const node = Object.assign(document.createElement(tag), properties);
  node.append(...children);
  return node;
}

function say(text, error = false) {
  status.textContent = text;
  status.className = error ? 'error' : '';
}

function count(n, one, many) {
  return n + ' ' + (n === 1 ? one : many);
}

/** github.com/<owner>, as the server reads it: every repository, which takes a while. */
const OWNER = /^(?:https?:\/\/)?(?:www\.)?github\.com\/[\w-]+\/?$/i;

/** The words typed in the filter, if there are any to filter by. */
function words() {
  return isFilter(filter.value) ? filter.value.trim() : undefined;
}

/** The text, each word starting with one of the filter's words marked. */
function marked(text) {
  const typed = words();
  if (!typed) return [text];
  // Only letters and digits are left, nothing to escape; the longest first, as an alternation takes
  // the first that matches: "c code" marks "code", not only its "c".
  const typedWords = typed.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).sort((a, b) => b.length - a.length);
  const pattern = new RegExp('(?<![\\p{L}\\p{N}])(?:' + typedWords.join('|') + ')', 'giu');
  const parts = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    parts.push(text.slice(last, match.index), element('mark', { textContent: match[0] }));
    last = match.index + match[0].length;
  }
  parts.push(text.slice(last));
  return parts.filter((part) => part !== '');
}

/** Counts the scans: only the latest one may show its progress and result, and enable the button. */
let loading = 0;

async function load(repository, selected) {
  const mine = ++loading;
  field.value = repository;
  form.querySelector('button').disabled = true;
  const what = OWNER.test(repository) ? 'every repository of ' + repository : repository;
  const started = Date.now();
  const scanning = () => mine === loading
    ? say('Scanning ' + what + '… ' + Math.round((Date.now() - started) / 1000) + ' s')
    : clearInterval(timer);
  const timer = setInterval(scanning, 1000);
  scanning();
  warnings.replaceChildren();
  main.hidden = true;
  current = undefined;
  try {
    const response = await fetch('/api/scan?repository=' + encodeURIComponent(repository));
    const result = await response.json();
    if (mine !== loading) return;
    if (!response.ok) return say(result.error, true);
    show(repository, result, selected);
  } catch (error) {
    if (mine === loading) say('Cannot reach the Skill Atlas server: ' + error.message, true);
  } finally {
    clearInterval(timer);
    if (mine === loading) form.querySelector('button').disabled = false;
  }
}

/**
 * One repository's skills, selected by path; or an owner's, grouped by repository, only those with
 * skills, and selected by id, <owner>/<repo>:<path>. Then filtered, on the page, as the filter says.
 */
function show(repository, result, selected) {
  const groups = result.owner ? result.repositories : [{ repository: result.repository, skills: result.skills }];
  const key = result.owner ? (skill) => skill.id : (skill) => skill.path;
  const skills = groups.flatMap((group) => group.skills.map((skill) => ({ ...skill, repository: group.repository })));
  current = { repository, result, groups, skills, key, owner: Boolean(result.owner), selected };
  warnings.replaceChildren(...result.warnings.map((text) => element('li', { textContent: 'warning: ' + text })));
  main.hidden = skills.length === 0;
  render();
}

/** The scan shown, filtered: the total, the matching skills, the selected one if it still matches. */
function render() {
  const { result, groups, skills, key, owner } = current;
  const typed = words();
  const matches = typed ? skillFilter(typed) : () => true;
  const shown = groups
    .map((group) => ({ ...group, skills: group.skills.filter(matches) }))
    .filter((group) => group.skills.length > 0);
  const matched = shown.flatMap((group) => group.skills.map((skill) => key(skill)));
  status.replaceChildren(
    owner
      ? element('a', { href: result.owner.url, textContent: result.owner.name })
      : element('a', { href: result.repository.url, textContent: result.repository.id }),
    ' · ' + (typed ? matched.length + ' of ' : '') + count(skills.length, 'skill', 'skills') +
      (owner ? ' in ' + count(typed ? shown.length : groups.length, 'repository', 'repositories') : ''),
  );
  status.className = '';
  const button = (skill) => element('li', {},
    element('button', { type: 'button', skill: key(skill), onclick: () => select(key(skill)) },
      element('span', { className: 'name' }, ...marked(skill.name)),
      skill.description ? element('span', { className: 'description' }, ...marked(skill.description)) : '',
      element('span', { className: 'path', textContent: skill.path }),
    ),
  );
  list.replaceChildren(...shown.flatMap((group) => [
    ...(owner ? [element('li', { className: 'repository' },
      element('a', { href: group.repository.url, textContent: group.repository.id }),
      element('span', { className: 'count', textContent: count(group.skills.length, 'skill', 'skills') }),
    )] : []),
    ...group.skills.map(button),
  ]));
  if (typed && matched.length === 0) list.append(element('li', { className: 'empty', textContent: 'No skill matches "' + typed + '"' }));
  select(matched.includes(current.selected) ? current.selected : matched[0], false);
}

function select(selected, remember = true) {
  current.selected = selected;
  const { skills, key } = current;
  const index = skills.findIndex((skill) => key(skill) === selected);
  const skill = skills[index];
  list.querySelectorAll('button').forEach((button) => button.setAttribute('aria-current', String(button.skill === selected)));
  if (remember) setAddress('replaceState');
  if (!skill) return article.replaceChildren();
  article.replaceChildren(
    element('h2', { textContent: skill.name }),
    element('p', { className: 'meta' },
      current.owner ? skill.repository.id + ' · ' : '',
      element('a', { href: skill.link, target: '_blank', rel: 'noopener', textContent: skill.path }),
      skill.copies.length ? ' · also in ' + skill.copies.join(', ') : '',
    ),
    element('pre', { textContent: skill.text }),
  );
}

/** ?repository=…&q=…&skill=…: the scan, the filter and the selected skill, as shown. */
function setAddress(how, repository = current.repository, skill = current && current.selected) {
  const query = new URLSearchParams({ repository });
  const typed = words();
  if (typed) query.set('q', typed);
  if (skill) query.set('skill', skill);
  history[how](null, '', '?' + query);
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const repository = field.value.trim();
  setAddress('pushState', repository, null);
  load(repository);
});

// Filtering is instant, on the scan already done; it never scans again.
function filtered() {
  if (!current) return;
  render();
  setAddress('replaceState');
}
filter.addEventListener('input', filtered);
filter.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !filter.value) return;
  filter.value = '';
  filtered();
});
document.addEventListener('keydown', (event) => {
  const typing = event.target && /^(INPUT|TEXTAREA)$/.test(event.target.tagName);
  if (event.key === '/' && !typing && !main.hidden) {
    event.preventDefault();
    filter.focus();
  }
});

function fromAddress() {
  const query = new URLSearchParams(location.search);
  const repository = query.get('repository');
  filter.value = query.get('q') || '';
  if (repository) return load(repository, query.get('skill'));
  // The bare page: nothing scanned. A scan still running is dropped, as a newer one would.
  loading++;
  current = undefined;
  say('');
  warnings.replaceChildren();
  main.hidden = true;
  form.querySelector('button').disabled = false;
  field.focus();
}
window.addEventListener('popstate', fromAddress);
fromAddress();
</script>
</body>
</html>
`;
