import { AtlasError, EmptyRepositoryError, NotFoundError } from './errors.ts';
import { SKILL_ROOTS } from './find.ts';
import type { Owner, Source } from './scan.ts';

/** The part of `fetch` the core uses, so tests and the browser can pass their own. */
export type Fetch = (url: string, init?: { headers?: Record<string, string> }) => Promise<Response>;

export type GitHubOptions = {
  fetch: Fetch;
  /**
   * With a token, skills on the default branch are found through code search; without it, or at
   * another branch, tag or commit, through the tree: code search sees only the default branch.
   * Code search that finds nothing falls back to the tree: GitHub does not index forks, nor
   * repositories it has not indexed yet.
   */
  token?: string;
};

const API = 'https://api.github.com';
const RAW = 'https://raw.githubusercontent.com';

/**
 * `https://github.com/owner/repo`, with or without the scheme, a trailing slash or `.git`; or
 * `…/tree/<ref>`, where everything after `tree/` is the branch, tag or commit.
 */
export function parseGitHubUrl(input: string): { owner: string; repo: string; ref?: string } | undefined {
  const match = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/tree\/(.+?))?\/?$/i.exec(input.trim());
  return match ? { owner: match[1], repo: match[2], ref: match[3] } : undefined;
}

/**
 * `https://github.com/owner`, with or without the scheme or a trailing slash: an organization or a
 * user, all of whose repositories are scanned.
 */
export function parseGitHubOwner(input: string): string | undefined {
  return /^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w-]+)\/?$/i.exec(input.trim())?.[1];
}

/** Resolves the ref, or the default branch, to a commit and lists the files that may be skills. */
export async function openGitHub(input: string, options: GitHubOptions): Promise<Source> {
  const name = parseGitHubUrl(input);
  if (!name) throw new AtlasError(`Not a GitHub repository URL: ${input}`);
  const github = client(options);
  const info = await github.json<RepositoryInfo>(
    `${API}/repos/${name.owner}/${name.repo}`,
    `Repository not found: https://github.com/${name.owner}/${name.repo}`,
  );
  const ref = name.ref ?? info.default_branch;
  const search = Boolean(options.token) && ref === info.default_branch;
  return openRepository(github, info, ref, search ? 'search' : 'tree');
}

/**
 * Every public repository of an organization or a user but forks and archived ones, sorted by
 * `owner/repo`; each one opens at its default branch, through its tree: code search allows only
 * 10 requests a minute.
 */
export async function openOwner(input: string, options: GitHubOptions): Promise<Owner> {
  const login = parseGitHubOwner(input);
  if (!login) throw new AtlasError(`Not a GitHub organization or user URL: ${input}`);
  const github = client(options);
  const byId = new Map<string, RepositoryInfo>();
  return {
    url: `https://github.com/${login}`,
    authenticated: Boolean(options.token),
    async list() {
      const listed: (RepositoryInfo & { fork: boolean; archived: boolean; owner: { login: string } })[] = [];
      for (let page = 1; ; page++) {
        const answer = await github.json<typeof listed>(
          `${API}/users/${login}/repos?per_page=100&page=${page}`,
          `Organization or user not found: https://github.com/${login}`,
        );
        listed.push(...answer);
        if (answer.length < 100) break;
      }
      for (const info of listed) if (!info.fork && !info.archived) byId.set(info.full_name, info);
      const repositories = [...byId.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      return { owner: listed[0]?.owner.login ?? login, repositories };
    },
    open: (id) => openRepository(github, byId.get(id)!, byId.get(id)!.default_branch, 'tree, alone'),
  };
}

type RepositoryInfo = { full_name: string; default_branch: string };

/**
 * One repository at a ref: through code search, through the tree, or through the tree as part of
 * an organization, where a repository is better scanned alone when its tree is too large.
 */
async function openRepository(github: Client, info: RepositoryInfo, ref: string, how: 'search' | 'tree' | 'tree, alone'): Promise<Source> {
  const id = info.full_name;
  const { sha } = await github.json<{ sha: string }>(
    `${API}/repos/${id}/commits/${encodePath(ref)}`,
    `Branch, tag or commit not found in https://github.com/${id}: ${ref}`,
  );
  const warnings: string[] = [];
  const hint = how === 'tree' ? 'GITHUB_TOKEN searches everywhere on the default branch' : 'scan it alone with GITHUB_TOKEN to search everywhere';
  let paths = how === 'search' ? await searchPaths(github, id) : await treePaths(github, id, sha, warnings, hint);
  // Not in the search index (a fork, or too new): the tree has what code search does not.
  if (how === 'search' && paths.length === 0) {
    paths = await treePaths(github, id, sha, warnings, 'code search found nothing: a fork, or not indexed yet');
  }
  const [organization, repo] = id.split('/');
  return {
    repository: { id, organization, name: repo, url: `https://github.com/${id}`, commit: sha },
    paths,
    warnings,
    read: (path) => github.raw(`${RAW}/${id}/${sha}/${encodePath(path)}`),
  };
}

/** Code search looks at the whole default branch, 100 results a page. */
async function searchPaths(github: Client, id: string): Promise<string[]> {
  const paths = new Set<string>(); // pages can repeat a result
  // GitHub returns at most 1000 results: ten pages.
  for (let page = 1; page <= 10; page++) {
    const result = await github.json<{ total_count: number; items: { path: string }[] }>(
      `${API}/search/code?q=filename:SKILL.md+repo:${id}&per_page=100&page=${page}`,
    );
    for (const item of result.items) paths.add(item.path);
    if (result.items.length < 100 || page * 100 >= result.total_count) break;
  }
  return [...paths];
}

type Tree = { truncated: boolean; tree: { path: string; mode: string; type: string; sha: string }[] };

/** The whole tree at once, or only the skill roots when it is too large for one answer. */
async function treePaths(github: Client, id: string, sha: string, warnings: string[], hint: string): Promise<string[]> {
  const tree = await github.json<Tree>(`${API}/repos/${id}/git/trees/${sha}?recursive=1`);
  if (!tree.truncated) return files(tree);
  warnings.push(`the tree is too large to list at once; looked only in ${SKILL_ROOTS.join(', ')} (${hint})`);
  const paths: string[] = [];
  for (const root of SKILL_ROOTS) {
    const rootSha = await directory(github, id, sha, root);
    if (!rootSha) continue;
    const subtree = await github.json<Tree>(`${API}/repos/${id}/git/trees/${rootSha}?recursive=1`);
    paths.push(...files(subtree).map((path) => `${root}/${path}`));
  }
  return paths;
}

/** Walks down one level at a time; the directory's tree, or undefined if it does not exist. */
async function directory(github: Client, id: string, sha: string, path: string): Promise<string | undefined> {
  let current = sha;
  for (const segment of path.split('/')) {
    const tree = await github.json<Tree>(`${API}/repos/${id}/git/trees/${current}`);
    const entry = tree.tree.find((item) => item.path === segment && item.type === 'tree');
    if (!entry) return undefined;
    current = entry.sha;
  }
  return current;
}

/** Regular files only: a symbolic link's content is its target, not a SKILL.md. */
function files(tree: Tree): string[] {
  return tree.tree.filter((item) => item.type === 'blob' && item.mode !== '120000').map((item) => item.path);
}

type Client = ReturnType<typeof client>;

function client({ fetch, token }: GitHubOptions) {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const answers = new Map<string, Promise<unknown>>(); // the root tree is asked for once per skill root

  async function get(url: string, init?: { headers: Record<string, string> }): Promise<Response> {
    try {
      return await fetch(url, init);
    } catch (error) {
      throw new AtlasError(`Cannot reach GitHub: ${describe(error)}`);
    }
  }

  async function request(url: string, notFound: string): Promise<unknown> {
    const response = await get(url, { headers });
    if (response.ok) return response.json();
    const body: unknown = await response.json().catch(() => undefined);
    const message = (body as { message?: unknown } | undefined)?.message;
    const text = typeof message === 'string' ? message : '';
    // 422: a commit hash that is not in the repository. 409: a repository without a commit.
    if (response.status === 404 || response.status === 422) throw new NotFoundError(notFound);
    if (response.status === 409 && /empty/i.test(text)) {
      throw new EmptyRepositoryError(`Repository is empty: https://github.com/${/\/repos\/([^/]+\/[^/]+)/.exec(url)?.[1] ?? url}`);
    }
    if ((response.status === 403 || response.status === 429) && /rate limit/i.test(text)) {
      throw new AtlasError(`GitHub rate limit reached; ${token ? 'try again in a minute' : 'set GITHUB_TOKEN'}`);
    }
    if (response.status === 401) throw new AtlasError('GitHub rejected the token in GITHUB_TOKEN');
    throw new AtlasError(`GitHub answered ${response.status} for ${url}${text && `: ${text}`}`);
  }

  return {
    /** A GitHub API answer; `notFound` explains a 404. */
    json<T>(url: string, notFound = `Not found on GitHub: ${url}`): Promise<T> {
      if (!answers.has(url)) answers.set(url, request(url, notFound));
      return answers.get(url) as Promise<T>;
    },
    /** A file's bytes at the scanned commit, or undefined if it is not there. */
    async raw(url: string): Promise<Uint8Array | undefined> {
      const response = await get(url);
      if (response.status === 404) return undefined;
      if (!response.ok) throw new AtlasError(`GitHub answered ${response.status} for ${url}`);
      return new Uint8Array(await response.arrayBuffer());
    },
  };
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return error.cause instanceof Error ? `${error.message} (${error.cause.message})` : error.message;
}
