// End to end on real repositories, each at a fixed commit: what GitHub answered, recorded by
// tests/record.ts into tests/recordings/, replayed through the command as the CLI runs it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { replay, type Recording } from '../src/core/replay.ts';
import { atlas } from './helpers.ts';

/** `skill-atlas scan github.com/<repository>/tree/<commit>`, answered from its recording. */
async function scanAt(repository: string, commit: string) {
  const file = new URL(`recordings/${repository.replace('/', '-')}-${commit}.json`, import.meta.url);
  const recording: Recording = JSON.parse(readFileSync(file, 'utf8'));
  // With a token, so it shows that a fixed commit is listed through its tree, not code search.
  return atlas(['scan', `github.com/${repository}/tree/${commit}`], { github: replay(recording) });
}

const TRUNCATED =
  'warning: the tree is too large to list at once; looked only in .agents/skills, .claude/skills, .github/skills, agent/skills ' +
  '(GITHUB_TOKEN searches everywhere on the default branch)';

test('JetBrains/koog: the skills in .claude/skills; the SKILL.md files of its test resources are not skills', async () => {
  const commit = '709079e4a34d6c9234583352550e6a2b88a0bb85';
  const koog = await scanAt('JetBrains/koog', commit);
  assert.equal(koog.code, 0, koog.stderr);
  assert.equal(koog.stderr, '');
  const blob = `https://github.com/JetBrains/koog/blob/${commit}`;
  assert.equal(
    koog.stdout,
    [
      'JetBrains/koog · 2 skills',
      'add-java-code-snippets-in-docs — Use when the user asks to add Java tabs/examples to mkdocs docs that already have ' +
        'Kotlin examples (files under docs/docs/**.md using === "Kotlin" / Knit INCLUDE+SUFFIX blocks).',
      `  ${blob}/.claude/skills/add-java-code-snippets-in-docs/SKILL.md`,
      'split-jvm-nonjvm — Splits a class or several classes in the common source set commonMain into JVM and non-JVM parts ' +
        'into jvmCommonMain and nonJvmCommonMain.',
      `  ${blob}/.claude/skills/split-jvm-nonjvm/SKILL.md`,
    ].join('\n'),
  );
});

test('JetBrains/MPS: a tree too large for one answer; each skill in .agents/skills, also in .claude/skills', async () => {
  const commit = '1cbf7f783dbc5c74c8e5231d31f61b02829143de';
  const mps = await scanAt('JetBrains/MPS', commit);
  assert.equal(mps.code, 0, mps.stderr);
  assert.equal(mps.stderr, TRUNCATED);
  const [header, ...lines] = mps.stdout.split('\n');
  assert.equal(header, 'JetBrains/MPS · 43 skills');
  const names: string[] = [];
  for (let i = 0; i < lines.length; i += 3) {
    const name = lines[i].split(' — ')[0];
    names.push(name);
    assert.equal(lines[i + 1], `  https://github.com/JetBrains/MPS/blob/${commit}/.agents/skills/${name}/SKILL.md`);
    assert.equal(lines[i + 2], `  also in .claude/skills/${name}/SKILL.md`);
  }
  assert.equal(names.length, 43);
  assert.deepEqual(names, [...names].sort());
  assert.equal(lines[0], 'actions — Guidelines for implementing IntelliJ actions (AnAction).');
});

test('JetBrains/android: a tree too large for one answer, and no skill', async () => {
  const android = await scanAt('JetBrains/android', '294d4c098cb833f7a457cd891a125de82d4e1715');
  assert.equal(android.code, 0, android.stderr);
  assert.equal(android.stdout, 'JetBrains/android · 0 skills');
  assert.equal(android.stderr, TRUNCATED);
});
