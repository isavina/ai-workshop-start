// A fake `claude -p` for the tests, run through SKILL_ATLAS_CLAUDE: never the real one. It reads the
// prompt from stdin, as `claude -p` does, and answers as its mode, the first argument, says:
//   topics  each skill by a word of its name or description: "Build and release", "Code and commits",
//           else "Other"; the JSON in a ```json block, after a sentence, as Claude may answer
//   fails   an error on stdout, as claude -p reports one, exit code 1
//   slow    no answer for 60 s
//   args    its arguments and directory on stdout, as an error: exit code 1
const [mode, ...args] = process.argv.slice(2);
let prompt = '';
for await (const chunk of process.stdin) prompt += chunk;

if (mode === 'fails') {
  console.log('Not logged in · Please run /login');
  process.exit(1);
}
if (mode === 'args') {
  console.log(`${JSON.stringify(args)} in ${process.cwd()}`);
  process.exit(1);
}
if (mode === 'slow') await new Promise((resolve) => setTimeout(resolve, 60_000));

const topics: [string, RegExp][] = [
  ['Build and release', /\b(build|release|deploy|gradle)/i],
  ['Code and commits', /\b(code|commit|review)/i],
];
const clusters = new Map<string, number[]>();
for (const [, number, skill] of prompt.matchAll(/^(\d+)\. (.*)$/gm)) {
  const label = topics.find(([, words]) => words.test(skill))?.[0] ?? 'Other';
  clusters.set(label, [...(clusters.get(label) ?? []), Number(number)]);
}
const answer = { clusters: [...clusters].map(([label, skills]) => ({ label, skills })) };
console.log(`Here are the clusters:\n\`\`\`json\n${JSON.stringify(answer, null, 2)}\n\`\`\``);
