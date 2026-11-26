/** A skill found in a repository: its SKILL.md, its name and its copies. */
export type SkillFile = { path: string; name: string; copies: string[] };

/** Where agents keep a repository's own skills, in the order a copy's place is chosen. */
export const SKILL_ROOTS = ['.agents/skills', '.claude/skills', '.github/skills', 'agent/skills'];

/**
 * Every project skill, `<base>/<root>/<skill>/SKILL.md`, named after its directory. The same
 * directory under several roots of one base is one skill, at the first root; the others are copies.
 */
export function findSkills(paths: string[]): SkillFile[] {
  const skills = new Map<string, Located[]>();
  for (const path of paths) {
    const located = locate(path);
    if (!located) continue;
    const key = `${located.base}\0${located.name}`;
    skills.set(key, [...(skills.get(key) ?? []), located]);
  }
  return [...skills.values()]
    .map((copies) => copies.sort((a, b) => a.root - b.root || (a.path < b.path ? -1 : 1)))
    .map(([first, ...others]) => ({ path: first.path, name: first.name, copies: others.map((copy) => copy.path) }))
    .sort((a, b) => (a.path < b.path ? -1 : 1));
}

type Located = { path: string; base: string; name: string; root: number };

/** Where a path is as a skill, or undefined if it is not one. */
function locate(path: string): Located | undefined {
  const segments = path.split('/');
  if (segments.at(-1) !== 'SKILL.md' || segments.includes('node_modules')) return undefined;
  const directory = segments.slice(0, -2).join('/');
  const root = SKILL_ROOTS.findIndex((candidate) => directory === candidate || directory.endsWith(`/${candidate}`));
  if (root < 0) return undefined;
  return { path, base: directory.slice(0, -SKILL_ROOTS[root].length), name: segments.at(-2)!, root };
}
