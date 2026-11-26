// Records what GitHub answers for a scan, for the end-to-end tests to replay:
//   GITHUB_TOKEN=… node tests/record.ts github.com/<owner>/<repo>/tree/<commit>
// Writes tests/recordings/<owner>-<repo>-<commit>.json. The answers keep only what the scan reads.
import { mkdirSync, writeFileSync } from 'node:fs';
import { openGitHub, parseGitHubUrl } from '../src/core/github.ts';
import type { Recording } from '../src/core/replay.ts';
import { scan } from '../src/core/scan.ts';

const [input] = process.argv.slice(2);
const name = input && parseGitHubUrl(input);
if (!name || !/^[0-9a-f]{40}$/.test(name.ref ?? '')) {
  console.error('Usage: node tests/record.ts github.com/<owner>/<repo>/tree/<full commit hash>');
  process.exit(1);
}

const recording: Recording = {};
await scan(
  await openGitHub(input, {
    token: process.env.GITHUB_TOKEN || undefined,
    fetch: async (url, init) => {
      const response = await fetch(url, init);
      const text = await response.clone().text();
      const json = response.ok && url.startsWith('https://api.github.com/');
      recording[url] = { status: response.status, body: json ? shrink(url, JSON.parse(text)) : text };
      return response;
    },
  }),
);

const file = new URL(`recordings/${name.owner}-${name.repo}-${name.ref}.json`, import.meta.url);
mkdirSync(new URL('.', file), { recursive: true });
// One answer a line: small, and a new recording diffs answer by answer.
const lines = Object.entries(recording).map(([url, answer]) => `${JSON.stringify(url)}: ${JSON.stringify(answer)}`);
writeFileSync(file, `{\n${lines.join(',\n')}\n}\n`);
console.log(`${Object.keys(recording).length} answers → ${file.pathname}`);

/** Only the fields the scan reads: a truncated tree only says that it is, a file has no hash. */
function shrink(url: string, body: any): unknown {
  if (/\/repos\/[^/]+\/[^/]+$/.test(url)) return { full_name: body.full_name, default_branch: body.default_branch };
  if (url.includes('/commits/')) return { sha: body.sha };
  if (url.includes('/git/trees/')) {
    const tree = body.truncated && url.endsWith('recursive=1') ? [] : body.tree;
    return { truncated: body.truncated, tree: tree.map(({ path, mode, type, sha }: any) => (type === 'tree' ? { path, mode, type, sha } : { path, mode, type })) };
  }
  return body;
}
