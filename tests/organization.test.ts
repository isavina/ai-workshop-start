// The decisions on an organization or a user in spec/analysis.md, spec/cli.md and spec/web.md,
// checked on what the command prints for a small organization, JetBrains-like, answered below.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { replay, type Recording } from '../src/core/replay.ts';
import { createWebServer, listen } from '../src/web.ts';
import { atlas, EXAMPLE_COMMIT, opener } from './helpers.ts';

const API = 'https://api.github.com';
const RAW = 'https://raw.githubusercontent.com';

type Listed = { name: string; fork?: boolean; archived?: boolean; branch?: string };

/** What GitHub lists for `/users/<owner>/repos`, a page of 100 at a time. */
function listing(owner: string, repositories: Listed[]): Recording {
  const recording: Recording = {};
  for (let page = 1; page === 1 || (page - 1) * 100 <= repositories.length; page++) {
    recording[`${API}/users/${owner}/repos?per_page=100&page=${page}`] = {
      status: 200,
      body: repositories.slice((page - 1) * 100, page * 100).map(({ name, fork = false, archived = false, branch = 'main' }) => ({
        full_name: `${owner}/${name}`,
        default_branch: branch,
        fork,
        archived,
        owner: { login: owner },
      })),
    };
  }
  return recording;
}

/** A repository at EXAMPLE_COMMIT whose tree holds these files, each SKILL.md with its text. */
function repository(id: string, files: Record<string, string>, branch = 'main'): Recording {
  const recording: Recording = {
    [`${API}/repos/${id}/commits/${branch}`]: { status: 200, body: { sha: EXAMPLE_COMMIT } },
    [`${API}/repos/${id}/git/trees/${EXAMPLE_COMMIT}?recursive=1`]: {
      status: 200,
      body: { truncated: false, tree: Object.keys(files).map((path) => ({ path, mode: '100644', type: 'blob' })) },
    },
  };
  for (const [path, text] of Object.entries(files)) recording[`${RAW}/${id}/${EXAMPLE_COMMIT}/${path}`] = { status: 200, body: text };
  return recording;
}

const skill = (name: string) => `---\nname: ${name}\ndescription: The ${name} skill. More.\n---\n`;
const blob = (id: string, path: string) => `  https://github.com/${id}/blob/${EXAMPLE_COMMIT}/${path}`;

// 120 forks first: the listing takes two pages, and none of them is ever opened.
const forks: Listed[] = Array.from({ length: 120 }, (_, i) => ({ name: `fork-${i}`, fork: true }));
const ACME: Recording = {
  ...listing('Acme', [
    ...forks,
    { name: 'zeta' },
    { name: 'Alpha', branch: 'develop' },
    { name: 'no-skills' },
    { name: 'empty' },
    { name: 'gone' },
    { name: 'old', archived: true },
    { name: 'broken' },
  ]),
  ...repository('Acme/zeta', { '.claude/skills/deploy/SKILL.md': skill('deploy'), '.github/skills/deploy/SKILL.md': skill('deploy') }),
  ...repository('Acme/Alpha', { '.agents/skills/review/SKILL.md': skill('review'), 'web/.claude/skills/build/SKILL.md': skill('build') }, 'develop'),
  ...repository('Acme/no-skills', { 'README.md': '# No skills', 'docs/skills/example/SKILL.md': skill('example') }),
  ...repository('Acme/broken', { '.claude/skills/plain/SKILL.md': '# No front matter\n' }),
  // What GitHub answers for a repository without a commit, and for one deleted after the listing.
  [`${API}/repos/Acme/empty/commits/main`]: { status: 409, body: { message: 'Git Repository is empty.' } },
  [`${API}/repos/Acme/gone/commits/main`]: { status: 404, body: { message: 'Not Found' } },
};

test('an organization: the total, then each repository with skills, by owner/repo; forks, archived and empty ones left out', async () => {
  // With a token, and still through each tree: no code search is recorded.
  const acme = await atlas(['scan', 'https://github.com/Acme/'], { github: replay(ACME) });
  assert.equal(acme.code, 0, acme.stderr);
  assert.equal(
    acme.stdout,
    [
      'Acme · 4 skills in 3 of 6 repositories',
      '',
      'Acme/Alpha · 2 skills',
      'build — The build skill.',
      blob('Acme/Alpha', 'web/.claude/skills/build/SKILL.md'),
      'review — The review skill.',
      blob('Acme/Alpha', '.agents/skills/review/SKILL.md'),
      '',
      'Acme/broken · 1 skill',
      'plain',
      blob('Acme/broken', '.claude/skills/plain/SKILL.md'),
      '',
      'Acme/zeta · 1 skill',
      'deploy — The deploy skill.',
      blob('Acme/zeta', '.claude/skills/deploy/SKILL.md'),
      '  also in .github/skills/deploy/SKILL.md',
    ].join('\n'),
  );
  // A repository that fails is a warning; each warning starts with its repository.
  assert.equal(
    acme.stderr,
    [
      'warning: Acme/broken: .claude/skills/plain/SKILL.md: no front matter; using the directory name',
      'warning: Acme/gone: Branch, tag or commit not found in https://github.com/Acme/gone: main; skipped',
    ].join('\n'),
  );
});

test('an organization, --filter: N of M skills in K of S repositories; only the repositories with a match', async () => {
  const review = await atlas(['scan', 'github.com/Acme', '--filter', 'Review'], { github: replay(ACME) });
  assert.equal(review.code, 0, review.stderr);
  assert.equal(
    review.stdout,
    ['Acme · 1 of 4 skills in 1 of 6 repositories', '', 'Acme/Alpha · 1 of 2 skills', 'review — The review skill.', blob('Acme/Alpha', '.agents/skills/review/SKILL.md')].join('\n'),
  );
  // The warnings, as without a filter.
  assert.equal(review.stderr, (await atlas(['scan', 'github.com/Acme'], { github: replay(ACME) })).stderr);

  // Several words: in the description, `The … skill.`, of every skill; `de` starts only `deploy`.
  const several = await atlas(['scan', 'github.com/Acme', '--filter', 'the-skill de'], { github: replay(ACME) });
  assert.equal(several.stdout.split('\n')[0], 'Acme · 1 of 4 skills in 1 of 6 repositories');
  assert.match(several.stdout, /^Acme\/zeta · 1 of 1 skill$/m);

  const none = await atlas(['scan', 'github.com/Acme', '--filter', 'release'], { github: replay(ACME) });
  assert.equal(none.code, 0);
  assert.equal(none.stdout, 'Acme · 0 of 4 skills in 0 of 6 repositories\n\nNo skill matches "release"');
});

test('the web view: an organization, &q=<words>: only the repositories with a match, and the total', async () => {
  const { status, body } = await webScan('github.com/Acme', { github: replay(ACME) }, 'build');
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.total, 4);
  assert.equal(body.scanned, 6);
  assert.deepEqual(
    body.repositories.map((group: { repository: { id: string }; skills: { name: string }[] }) => [group.repository.id, group.skills.map((skill) => skill.name)]),
    [['Acme/Alpha', ['build']]],
  );
  const cli = await atlas(['scan', 'github.com/Acme', '--filter', 'build'], { github: replay(ACME) });
  assert.ok(cli.stdout.split('\n').includes(`  ${body.repositories[0].skills[0].link}`));
  const none = await webScan('github.com/Acme', { github: replay(ACME) }, 'release');
  assert.deepEqual([none.body.total, none.body.repositories], [4, []]);
});

test('a user, without GITHUB_TOKEN: github.com/<owner> lists the same way', async () => {
  const github = replay({ ...listing('someone', [{ name: 'notes' }]), ...repository('someone/notes', { '.claude/skills/todo/SKILL.md': skill('todo') }) });
  const user = await atlas(['scan', 'github.com/someone'], { github, token: '' });
  assert.equal(user.code, 0, user.stderr);
  assert.equal(
    user.stdout,
    ['someone · 1 skill in 1 of 1 repository', '', 'someone/notes · 1 skill', 'todo — The todo skill.', blob('someone/notes', '.claude/skills/todo/SKILL.md')].join('\n'),
  );
  assert.equal(user.stderr, '');

  const nothing = await atlas(['scan', 'github.com/nobody-home'], { github: replay(listing('nobody-home', [])) });
  assert.equal(nothing.code, 0, nothing.stderr);
  assert.equal(nothing.stdout, 'nobody-home · 0 skills in 0 of 0 repositories');
});

test('a tree too large for one answer: only the skill roots, and a warning to scan the repository alone', async () => {
  const github = replay({
    ...listing('Big', [{ name: 'mono' }]),
    [`${API}/repos/Big/mono/commits/main`]: { status: 200, body: { sha: EXAMPLE_COMMIT } },
    [`${API}/repos/Big/mono/git/trees/${EXAMPLE_COMMIT}?recursive=1`]: { status: 200, body: { truncated: true, tree: [] } },
    [`${API}/repos/Big/mono/git/trees/${EXAMPLE_COMMIT}`]: { status: 200, body: { truncated: false, tree: [] } },
  });
  const big = await atlas(['scan', 'github.com/Big'], { github });
  assert.equal(big.code, 0, big.stderr);
  assert.equal(big.stdout, 'Big · 0 skills in 0 of 1 repository');
  assert.equal(
    big.stderr,
    'warning: Big/mono: the tree is too large to list at once; looked only in .agents/skills, .claude/skills, .github/skills, agent/skills ' +
      '(scan it alone with GITHUB_TOKEN to search everywhere)',
  );
});

test('rate limit during the scan → a clear message, exit code 1, no partial result', async () => {
  const github = replay({
    ...listing('Acme', [{ name: 'one' }, { name: 'two' }]),
    ...repository('Acme/one', { '.claude/skills/a/SKILL.md': skill('a') }),
    [`${API}/repos/Acme/two/commits/main`]: { status: 403, body: { message: 'API rate limit exceeded for user ID 1.' } },
  });
  const limited = await atlas(['scan', 'github.com/Acme'], { github });
  assert.equal(limited.code, 1);
  assert.equal(limited.stdout, '');
  assert.equal(limited.stderr, 'GitHub rate limit reached; try again in a minute');
});

test('an unknown organization or user → a clear message, exit code 1', async () => {
  const github = replay({ [`${API}/users/no-such-owner/repos?per_page=100&page=1`]: { status: 404, body: { message: 'Not Found' } } });
  const unknown = await atlas(['scan', 'github.com/no-such-owner'], { github });
  assert.equal(unknown.code, 1);
  assert.equal(unknown.stdout, '');
  assert.equal(unknown.stderr, 'Organization or user not found: https://github.com/no-such-owner');
});

/** `GET /api/scan?repository=<input>` on the web view's server, with GitHub answering from `github`. */
async function webScan(input: string, options: { github: ReturnType<typeof replay>; token?: string }, q?: string) {
  const server = createWebServer({ open: opener(options) });
  const address = await listen(server, 0);
  try {
    const filter = q === undefined ? '' : `&q=${encodeURIComponent(q)}`;
    const response = await fetch(`${address}/api/scan?repository=${encodeURIComponent(input)}${filter}`);
    return { status: response.status, body: JSON.parse(await response.text()) };
  } finally {
    server.close();
  }
}

test('the web view: an organization, the same scan as the CLI, its skills grouped by repository', async () => {
  const cli = await atlas(['scan', 'https://github.com/Acme'], { github: replay(ACME) });
  const { status, body } = await webScan('https://github.com/Acme', { github: replay(ACME) });
  assert.equal(status, 200, JSON.stringify(body));
  assert.deepEqual(body.owner, { name: 'Acme', url: 'https://github.com/Acme' });
  assert.equal(body.scanned, 6);
  // Only the repositories with skills, by owner/repo; each skill as for one repository.
  assert.deepEqual(
    body.repositories.map((group: { repository: { id: string }; skills: { id: string }[] }) => [group.repository.id, group.skills.map((skill) => skill.id)]),
    [
      ['Acme/Alpha', ['Acme/Alpha:web/.claude/skills/build/SKILL.md', 'Acme/Alpha:.agents/skills/review/SKILL.md']],
      ['Acme/broken', ['Acme/broken:.claude/skills/plain/SKILL.md']],
      ['Acme/zeta', ['Acme/zeta:.claude/skills/deploy/SKILL.md']],
    ],
  );
  assert.deepEqual(body.repositories[2], {
    repository: { id: 'Acme/zeta', url: 'https://github.com/Acme/zeta', commit: EXAMPLE_COMMIT },
    skills: [
      {
        id: 'Acme/zeta:.claude/skills/deploy/SKILL.md',
        name: 'deploy',
        description: 'The deploy skill. More.',
        path: '.claude/skills/deploy/SKILL.md',
        link: `https://github.com/Acme/zeta/blob/${EXAMPLE_COMMIT}/.claude/skills/deploy/SKILL.md`,
        copies: ['.github/skills/deploy/SKILL.md'],
        text: skill('deploy'),
      },
    ],
  });
  // The same links and warnings as the CLI prints.
  for (const group of body.repositories) for (const { link } of group.skills) assert.ok(cli.stdout.split('\n').includes(`  ${link}`), link);
  assert.equal(body.warnings.map((warning: string) => `warning: ${warning}`).join('\n'), cli.stderr);
});

test('the web view: an organization without GITHUB_TOKEN → a clear message, status 400, nothing asked of GitHub', async () => {
  // Nothing recorded: a request to GitHub would be "Cannot reach GitHub".
  assert.deepEqual(await webScan('https://github.com/JetBrains', { github: replay({}), token: '' }), {
    status: 400,
    body: {
      error: 'https://github.com/JetBrains is an organization or a user: scanning all of its repositories takes a request or two each; set GITHUB_TOKEN and restart skill-atlas serve',
    },
  });
});

test('the web view: a tree too large is a warning; the rate limit, unreachable GitHub, a rejected token or an unknown owner → status 400, no partial result', async () => {
  const big = await webScan('github.com/Big', {
    github: replay({
      ...listing('Big', [{ name: 'mono' }, { name: 'small' }]),
      [`${API}/repos/Big/mono/commits/main`]: { status: 200, body: { sha: EXAMPLE_COMMIT } },
      [`${API}/repos/Big/mono/git/trees/${EXAMPLE_COMMIT}?recursive=1`]: { status: 200, body: { truncated: true, tree: [] } },
      [`${API}/repos/Big/mono/git/trees/${EXAMPLE_COMMIT}`]: { status: 200, body: { truncated: false, tree: [] } },
      ...repository('Big/small', { '.claude/skills/a/SKILL.md': skill('a') }),
    }),
  });
  assert.equal(big.status, 200);
  assert.deepEqual(big.body.repositories.map((group: { repository: { id: string } }) => group.repository.id), ['Big/small']);
  assert.deepEqual(big.body.warnings, [
    'Big/mono: the tree is too large to list at once; looked only in .agents/skills, .claude/skills, .github/skills, agent/skills ' +
      '(scan it alone with GITHUB_TOKEN to search everywhere)',
  ]);

  const limited = await webScan('github.com/Acme', {
    github: replay({
      ...listing('Acme', [{ name: 'one' }, { name: 'two' }]),
      ...repository('Acme/one', { '.claude/skills/a/SKILL.md': skill('a') }),
      [`${API}/repos/Acme/two/commits/main`]: { status: 403, body: { message: 'API rate limit exceeded for user ID 1.' } },
    }),
  });
  assert.deepEqual(limited, { status: 400, body: { error: 'GitHub rate limit reached; try again in a minute' } });

  const unknown = await webScan('github.com/no-such-owner', {
    github: replay({ [`${API}/users/no-such-owner/repos?per_page=100&page=1`]: { status: 404, body: { message: 'Not Found' } } }),
  });
  assert.deepEqual(unknown, { status: 400, body: { error: 'Organization or user not found: https://github.com/no-such-owner' } });

  // Nothing recorded: GitHub cannot be reached.
  const unreachable = await webScan('github.com/Acme', { github: replay({}) });
  assert.deepEqual(unreachable, {
    status: 400,
    body: { error: `Cannot reach GitHub: not recorded: ${API}/users/Acme/repos?per_page=100&page=1` },
  });

  const rejected = await webScan('github.com/Acme', {
    github: replay({ [`${API}/users/Acme/repos?per_page=100&page=1`]: { status: 401, body: { message: 'Bad credentials' } } }),
  });
  assert.deepEqual(rejected, { status: 400, body: { error: 'GitHub rejected the token in GITHUB_TOKEN' } });
});
