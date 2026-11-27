// Clustering: the skills grouped by topic or purpose, by Claude. One module for the CLI and the web
// view; Claude itself comes in as `ask`, so the core needs no Node APIs. Claude sees only the names
// and descriptions, and its answer is checked before anything is shown.
import { AtlasError } from './errors.ts';

/** Asks Claude, as `claude -p` does: the prompt in, the answer's text out; `signal` stops it. */
export type Ask = (prompt: string, signal?: AbortSignal) => Promise<string>;

/** One group of skills, with the label Claude gave it. */
export type Cluster<T> = { label: string; skills: T[] };

/** What Claude sees of a skill. */
export type Clusterable = { name: string; description: string };

export const MIN_CLUSTERS = 2;
export const MAX_CLUSTERS = 8;
/** The longest label: "short", with room. */
export const MAX_LABEL = 60;
const OTHER = 'other';

/**
 * The skills, clustered by `ask`: sorted by label, `Other` last. Fewer than 2 skills are not clustered:
 * `[]`, and Claude is not asked. An answer that is not a clustering of exactly these skills → an
 * `AtlasError`.
 */
export async function clusterSkills<T extends Clusterable>(skills: T[], ask: Ask, signal?: AbortSignal): Promise<Cluster<T>[]> {
  if (skills.length < MIN_CLUSTERS) return [];
  return parseClusters(await ask(clusterPrompt(skills), signal), skills);
}

/** The prompt: the rules, the answer's shape, then each skill by number, its name and description only. */
export function clusterPrompt(skills: Clusterable[]): string {
  const most = Math.min(MAX_CLUSTERS, skills.length);
  return [
    'Group these agent skills into clusters by topic or purpose.',
    '',
    'Rules:',
    `- Between ${MIN_CLUSTERS} and ${most} clusters, each with a short label of one to four words, at most ${MAX_LABEL} characters.`,
    '- Every skill in exactly one cluster, by its number.',
    '- "Other" only for skills that fit no other cluster; at most one such cluster.',
    '',
    'Answer with JSON only, no other text: {"clusters": [{"label": "<label>", "skills": [<number>, ...]}, ...]}',
    '',
    'Skills:',
    ...skills.map((skill, i) => {
      const description = oneLine(skill.description);
      return `${i + 1}. ${oneLine(skill.name)}${description ? ` — ${description}` : ''}`;
    }),
  ].join('\n');
}

/** Claude's answer, checked against the skills it was asked about; sorted, `Other` last, each cluster's skills in their order. */
export function parseClusters<T>(answer: string, skills: T[]): Cluster<T>[] {
  const invalid = (reason: string) => new AtlasError(`claude -p gave an invalid clustering: ${reason}`);
  const json = parseJson(answer);
  const clusters = (json as { clusters?: unknown } | undefined)?.clusters;
  if (!Array.isArray(clusters)) throw invalid('no JSON with "clusters" in its answer');
  if (clusters.length < MIN_CLUSTERS || clusters.length > MAX_CLUSTERS) {
    throw invalid(`${clusters.length} clusters, not ${MIN_CLUSTERS} to ${MAX_CLUSTERS}`);
  }
  const placed = new Map<number, string>();
  const labels = new Set<string>();
  const result = clusters.map((cluster: { label?: unknown; skills?: unknown }) => {
    const label = typeof cluster?.label === 'string' ? oneLine(cluster.label) : '';
    if (!label) throw invalid('a cluster without a label');
    if (label.length > MAX_LABEL) throw invalid(`a label longer than ${MAX_LABEL} characters`);
    if (labels.has(label.toLowerCase())) throw invalid(`two clusters labelled "${label}"`);
    labels.add(label.toLowerCase());
    const numbers = cluster.skills;
    if (!Array.isArray(numbers) || numbers.length === 0) throw invalid(`"${label}" has no skills`);
    for (const number of numbers) {
      if (!Number.isInteger(number) || number < 1 || number > skills.length) throw invalid(`"${label}" has no skill ${JSON.stringify(number)}`);
      const other = placed.get(number);
      if (other !== undefined) throw invalid(`skill ${number} is in "${other}" and in "${label}"`);
      placed.set(number, label);
    }
    // In the order they came in: sorted by name, for a scan.
    return { label, skills: [...(numbers as number[])].sort((a, b) => a - b).map((number) => skills[number - 1]) };
  });
  const missing = skills.map((_, i) => i + 1).filter((number) => !placed.has(number));
  if (missing.length > 0) throw invalid(`skill${missing.length === 1 ? '' : 's'} ${missing.join(', ')} in no cluster`);
  return sortClusters(result);
}

/** By label, case-insensitive, whatever the locale; `Other` last. */
export function sortClusters<T>(clusters: Cluster<T>[]): Cluster<T>[] {
  const key = (cluster: Cluster<T>) => [cluster.label.toLowerCase() === OTHER ? 1 : 0, cluster.label.toLowerCase(), cluster.label] as const;
  const compare = (a: Cluster<T>, b: Cluster<T>) => {
    const [x, y] = [key(a), key(b)];
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
    return 0;
  };
  return [...clusters].sort(compare);
}

/**
 * The answer's JSON: all of it, or the object with "clusters" in it, as in a ```json block or after a
 * sentence, braces in the sentence too.
 */
function parseJson(answer: string): unknown {
  const text = answer.trim();
  const end = text.lastIndexOf('}') + 1;
  const starts = [0, ...[...text.matchAll(/\{/g)].map((match) => match.index)];
  for (const start of starts) {
    try {
      const json = JSON.parse(start === 0 ? text : text.slice(start, end));
      if (start === 0 || (json as { clusters?: unknown } | null)?.clusters !== undefined) return json;
    } catch {
      // Not JSON from here; the next brace, or none.
    }
  }
  return undefined;
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
