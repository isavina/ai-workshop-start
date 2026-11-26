// The filter: skills by the words of their name and description. The CLI, the API and the page
// all use these functions; the page gets their source as it is, so each one uses only the others.

/**
 * The words of a filter, a name or a description: lowercase, split at `-`, `_`, `/`, spaces and any
 * other character that is not a letter or a digit. `Code_Review` → `code`, `review`.
 */
export function filterWords(text: string): string[] {
  return text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/**
 * Whether every word of the filter starts a word of the skill's name or description: `rev` finds
 * `review`. A filter without words matches every skill.
 */
export function matchesFilter(skill: { name: string; description: string }, filter: string): boolean {
  const own = filterWords(`${skill.name} ${skill.description}`);
  return filterWords(filter).every((word) => own.some((each) => each.startsWith(word)));
}

/** The skills that match the filter, in their order. */
export function filterSkills<T extends { name: string; description: string }>(skills: T[], filter: string): T[] {
  return skills.filter((skill) => matchesFilter(skill, filter));
}
