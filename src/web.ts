// The local web view: a field for a repository or an owner, its skills and their SKILL.md. A Node
// server on this machine only; each scan is done when asked, and nothing is stored.
import { createServer, type Server } from 'node:http';
import { AtlasError } from './core/errors.ts';
import { skillLink, type Repository, type Skill } from './core/model.ts';
import { isOwner, scan, scanOwner, type Owner, type Source } from './core/scan.ts';

export type WebOptions = {
  /** Opens what the user typed into the field, as `scan` does. */
  open(input: string): Promise<Source | Owner>;
};

/**
 * `GET /`: the page. `GET /api/scan?repository=<GitHub URL | directory | github.com/<owner>>`: the
 * scan as JSON, an owner's grouped by repository, or `{ error }` with status 400 for what the CLI
 * would explain and exit 1 for.
 */
export function createWebServer({ open }: WebOptions): Server {
  return createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const send = (status: number, type: string, body: string) => {
      response.writeHead(status, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store' });
      response.end(body);
    };
    const json = (status: number, body: unknown) => send(status, 'application/json', JSON.stringify(body));

    if (request.method !== 'GET') return json(405, { error: 'Only GET' });
    if (url.pathname === '/') return send(200, 'text/html', PAGE);
    if (url.pathname !== '/api/scan') return json(404, { error: `Not found: ${url.pathname}` });

    const input = url.searchParams.get('repository')?.trim();
    if (!input) return json(400, { error: 'Type a GitHub URL or a directory' });
    try {
      const opened = await open(input);
      if (isOwner(opened)) {
        if (!opened.authenticated) {
          throw new AtlasError(`${opened.url} is an organization or a user: scanning all of its repositories takes a request or two each; set GITHUB_TOKEN and restart skill-atlas serve`);
        }
        const result = await scanOwner(opened);
        return json(200, {
          owner: { name: result.owner, url: opened.url },
          scanned: result.scanned,
          repositories: result.results.map((repository) => ({
            repository: repositoryJson(repository.repository),
            skills: repository.skills.map((skill) => skillJson(repository.repository, skill)),
          })),
          warnings: result.warnings,
        });
      }
      const result = await scan(opened);
      json(200, {
        repository: repositoryJson(result.repository),
        skills: result.skills.map((skill) => skillJson(result.repository, skill)),
        warnings: result.warnings,
      });
    } catch (error) {
      if (error instanceof AtlasError) return json(400, { error: error.message });
      json(500, { error: `Unexpected error: ${error instanceof Error ? error.message : String(error)}` });
    }
  });
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

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Skill Atlas</title>
<style>
  :root { color-scheme: light dark; --fg: #1f2328; --muted: #656d76; --bg: #fff; --panel: #f6f8fa; --border: #d0d7de; --accent: #0969da; --warn: #9a6700; --error: #cf222e; }
  @media (prefers-color-scheme: dark) { :root { --fg: #e6edf3; --muted: #8d96a0; --bg: #0d1117; --panel: #161b22; --border: #30363d; --accent: #4493f8; --warn: #d29922; --error: #f85149; } }
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px/1.5 system-ui, sans-serif; color: var(--fg); background: var(--bg); }
  header { padding: 16px 24px; border-bottom: 1px solid var(--border); }
  h1 { margin: 0 0 12px; font-size: 18px; }
  form { display: flex; gap: 8px; max-width: 960px; }
  input { flex: 1; padding: 8px 10px; font: inherit; color: inherit; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; }
  button { font: inherit; color: inherit; cursor: pointer; }
  form button { padding: 8px 16px; background: var(--accent); color: #fff; border: 0; border-radius: 6px; }
  form button:disabled { opacity: .6; cursor: progress; }
  #hint { margin: 6px 0 0; max-width: 960px; color: var(--muted); font-size: 13px; }
  #hint code { font: 12px ui-monospace, monospace; }
  #status { margin: 12px 24px 0; }
  #status.error { color: var(--error); }
  #warnings { margin: 8px 24px 0; padding-left: 20px; color: var(--warn); }
  main { display: grid; grid-template-columns: minmax(240px, 360px) 1fr; gap: 0; margin-top: 12px; border-top: 1px solid var(--border); }
  main[hidden] { display: none; }
  #skills { list-style: none; margin: 0; padding: 0; border-right: 1px solid var(--border); overflow: auto; max-height: calc(100vh - 170px); }
  #skills button { display: block; width: 100%; text-align: left; padding: 10px 16px; background: none; border: 0; border-bottom: 1px solid var(--border); }
  #skills button:hover { background: var(--panel); }
  #skills button[aria-current="true"] { background: var(--panel); box-shadow: inset 3px 0 var(--accent); }
  #skills .repository { padding: 12px 16px 6px; font-weight: 600; background: var(--panel); border-bottom: 1px solid var(--border); overflow-wrap: anywhere; }
  #skills .repository .count { font-weight: normal; color: var(--muted); }
  .name { font-weight: 600; }
  .description, .path { display: block; color: var(--muted); font-size: 13px; }
  .path { font-family: ui-monospace, monospace; font-size: 12px; overflow-wrap: anywhere; }
  #skill { padding: 16px 24px; min-width: 0; }
  #skill h2 { margin: 0; font-size: 18px; }
  #skill .meta { margin: 4px 0 12px; color: var(--muted); }
  a { color: var(--accent); }
  pre { margin: 0; padding: 16px; background: var(--panel); border: 1px solid var(--border); border-radius: 6px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font: 13px/1.5 ui-monospace, monospace; }
</style>
</head>
<body>
<header>
  <h1>Skill Atlas</h1>
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
  <ul id="skills"></ul>
  <article id="skill"></article>
</main>
<script>
const form = document.getElementById('scan');
const field = form.elements.repository;
const status = document.getElementById('status');
const warnings = document.getElementById('warnings');
const main = document.querySelector('main');
const list = document.getElementById('skills');
const article = document.getElementById('skill');
let current;

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
const OWNER = /^(?:https?:\\/\\/)?(?:www\\.)?github\\.com\\/[\\w-]+\\/?$/i;

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
 * skills, and selected by id, <owner>/<repo>:<path>.
 */
function show(repository, result, selected) {
  const groups = result.owner ? result.repositories : [{ repository: result.repository, skills: result.skills }];
  const key = result.owner ? (skill) => skill.id : (skill) => skill.path;
  const skills = groups.flatMap((group) => group.skills.map((skill) => ({ ...skill, repository: group.repository })));
  current = { repository, skills, key, owner: Boolean(result.owner) };
  status.replaceChildren(
    result.owner
      ? element('a', { href: result.owner.url, textContent: result.owner.name })
      : element('a', { href: result.repository.url, textContent: result.repository.id }),
    ' · ' + count(skills.length, 'skill', 'skills') + (result.owner ? ' in ' + count(groups.length, 'repository', 'repositories') : ''),
  );
  status.className = '';
  warnings.replaceChildren(...result.warnings.map((text) => element('li', { textContent: 'warning: ' + text })));
  const button = (skill) => element('li', {},
    element('button', { type: 'button', onclick: () => select(key(skill)) },
      element('span', { className: 'name', textContent: skill.name }),
      skill.description ? element('span', { className: 'description', textContent: skill.description }) : '',
      element('span', { className: 'path', textContent: skill.path }),
    ),
  );
  list.replaceChildren(...groups.flatMap((group) => [
    ...(result.owner ? [element('li', { className: 'repository' },
      element('a', { href: group.repository.url, textContent: group.repository.id }),
      element('span', { className: 'count', textContent: ' · ' + count(group.skills.length, 'skill', 'skills') }),
    )] : []),
    ...group.skills.map(button),
  ]));
  main.hidden = skills.length === 0;
  select(skills.some((skill) => key(skill) === selected) ? selected : skills[0] && key(skills[0]), false);
}

function select(selected, remember = true) {
  if (!selected) return article.replaceChildren();
  const { skills, key } = current;
  const index = skills.findIndex((skill) => key(skill) === selected);
  const skill = skills[index];
  list.querySelectorAll('button').forEach((button, i) => button.setAttribute('aria-current', String(i === index)));
  article.replaceChildren(
    element('h2', { textContent: skill.name }),
    element('p', { className: 'meta' },
      current.owner ? skill.repository.id + ' · ' : '',
      element('a', { href: skill.link, target: '_blank', rel: 'noopener', textContent: skill.path }),
      skill.copies.length ? ' · also in ' + skill.copies.join(', ') : '',
    ),
    element('pre', { textContent: skill.text }),
  );
  if (remember) setAddress(current.repository, selected, 'replaceState');
}

function setAddress(repository, skill, how) {
  const query = new URLSearchParams({ repository });
  if (skill) query.set('skill', skill);
  history[how](null, '', '?' + query);
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const repository = field.value.trim();
  setAddress(repository, undefined, 'pushState');
  load(repository);
});

function fromAddress() {
  const query = new URLSearchParams(location.search);
  const repository = query.get('repository');
  if (repository) return load(repository, query.get('skill'));
  // The bare page: nothing scanned. A scan still running is dropped, as a newer one would.
  loading++;
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
