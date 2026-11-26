// The filter: which skills match the words typed, by their names and descriptions. One function for
// the CLI, the API and the page, whose script embeds it as it is: it has to stay self-contained.

/**
 * A predicate for the skills matching `words`: case-insensitive, by words; `-`, `_`, `/`, spaces and
 * any other punctuation separate words, so `code review`, `code-review` and `Code_Review` are the
 * same. A skill matches when *every* word of the filter starts a word of its name or description:
 * `rev` finds `review`. No words, such as `""`, match every skill.
 */
export function skillFilter(words: string): (skill: { name: string; description: string }) => boolean {
  const split = (text: string) => text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const wanted = split(words);
  return (skill) => {
    const own = split(`${skill.name} ${skill.description}`);
    return wanted.every((word) => own.some((candidate) => candidate.startsWith(word)));
  };
}

/** Whether `words` has any word to filter by; `" - "` has none. */
export function isFilter(words: string | undefined): words is string {
  return /[\p{L}\p{N}]/u.test(words ?? '');
}
