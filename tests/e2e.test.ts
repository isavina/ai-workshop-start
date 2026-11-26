// End to end on real repositories, each at a fixed commit: what GitHub answered, recorded by
// tests/record.ts into tests/recordings/, replayed through the command as the CLI runs it and
// compared with the output stored next to it. `npm run record` refreshes both.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { replay, type Recording } from '../src/core/replay.ts';
import { atlas, printed } from './helpers.ts';

/**
 * `skill-atlas scan github.com/<repository>/tree/<commit>`, answered from its recording, after
 * checking that it prints exactly the stored output.
 */
async function scanAt(repository: string, commit: string) {
  const file = fileURLToPath(new URL(`recordings/${repository.replace('/', '-')}-${commit}`, import.meta.url));
  const recording: Recording = JSON.parse(readFileSync(`${file}.json`, 'utf8'));
  // With a token, so it shows that a fixed commit is listed through its tree, not code search.
  const output = await atlas(['scan', `github.com/${repository}/tree/${commit}`], { github: replay(recording) });
  assert.equal(output.code, 0, output.stderr);
  assert.equal(printed(output), readFileSync(`${file}.txt`, 'utf8'));
  return output;
}

const TRUNCATED =
  'warning: the tree is too large to list at once; looked only in .agents/skills, .claude/skills, .github/skills, agent/skills ' +
  '(GITHUB_TOKEN searches everywhere on the default branch)';

test('JetBrains/koog: the skills in .claude/skills; the SKILL.md files of its test resources are not skills', async () => {
  const koog = await scanAt('JetBrains/koog', '709079e4a34d6c9234583352550e6a2b88a0bb85');
  assert.equal(koog.stdout.split('\n')[0], 'JetBrains/koog · 2 skills');
  assert.doesNotMatch(koog.stdout, /integration-tests/);
  assert.equal(koog.stderr, '');
});

test('JetBrains/MPS: a tree too large for one answer; each skill in .agents/skills, also in .claude/skills', async () => {
  const commit = '1cbf7f783dbc5c74c8e5231d31f61b02829143de';
  const mps = await scanAt('JetBrains/MPS', commit);
  const [header, ...lines] = mps.stdout.split('\n');
  assert.equal(header, 'JetBrains/MPS · 43 skills');
  for (let i = 0; i < lines.length; i += 3) {
    const name = lines[i].split(' — ')[0];
    assert.equal(lines[i + 1], `  https://github.com/JetBrains/MPS/blob/${commit}/.agents/skills/${name}/SKILL.md`);
    assert.equal(lines[i + 2], `  also in .claude/skills/${name}/SKILL.md`);
  }
  assert.equal(mps.stderr, TRUNCATED);
});

test('JetBrains/android: a tree too large for one answer, and no skill', async () => {
  const android = await scanAt('JetBrains/android', '294d4c098cb833f7a457cd891a125de82d4e1715');
  assert.equal(android.stdout, 'JetBrains/android · 0 skills');
  assert.equal(android.stderr, TRUNCATED);
});
