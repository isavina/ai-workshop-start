// The skill-atlas commands. The same code serves the Node CLI and the browser
// terminal: everything that differs between them comes in through the context.
import { clusterSkills, type Ask, type Cluster } from './core/cluster.ts';
import { AtlasError } from './core/errors.ts';
import { isFilter, skillFilter } from './core/filter.ts';
import { skillLink, type Repository, type Skill } from './core/model.ts';
import { isOwner, scan, scanOwner, type Owner, type Source } from './core/scan.ts';

export type Context = {
  /** Opens what the user asked to scan: a repository, or an organization's or a user's repositories. */
  open(input: string): Promise<Source | Owner>;
  print(text: string): void;
  /** Errors and warnings. */
  error(text: string): void;
  /** Claude, for `--cluster`: `claude -p`; only the Node CLI has it. */
  cluster?: Ask;
  /** Starts the local web view and resolves with its address; only the Node CLI has one. */
  serve?(port: number): Promise<string>;
};

const usage = `Usage: skill-atlas <command>

  scan <GitHub URL | directory>   find every SKILL.md in a repository and print it;
                                  github.com/<owner>: in every repository of an organization or a user
    --filter <words>              only the skills with these words in their names and descriptions
    --cluster                     the skills grouped by topic, by claude -p
  serve [port]                    open the web view at http://localhost:<port> (4173 by default)
  help                            show this help`;

/** Runs one command; returns its exit code. */
export async function run(args: string[], context: Context): Promise<number> {
  const [command = 'help', ...rest] = args;
  try {
    if (command === 'scan') await scanCommand(rest, context);
    else if (command === 'serve') await serveCommand(rest, context);
    else if (command === 'help') context.print(usage);
    else throw new AtlasError(`Unknown command: ${command}\n\n${usage}`);
    return 0;
  } catch (error) {
    if (!(error instanceof AtlasError)) throw error;
    context.error(error.message);
    return 1;
  }
}

const scanUsage = 'Usage: skill-atlas scan <GitHub URL | directory> [--filter <words>] [--cluster]';

type ScanOptions = { words?: string; cluster: boolean };

/** `<input>`, the words of `--filter <words>` or `--filter=<words>`, if any, and `--cluster`. */
function scanArguments(args: string[]): { input: string } & ScanOptions {
  const inputs: string[] = [];
  let words: string | undefined;
  let cluster = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--cluster' && !cluster) cluster = true;
    else if (arg === '--filter' && i + 1 < args.length && words === undefined) words = args[++i];
    else if (arg.startsWith('--filter=') && words === undefined) words = arg.slice('--filter='.length);
    else if (arg.startsWith('--')) throw new AtlasError(scanUsage);
    else inputs.push(arg);
  }
  if (inputs.length !== 1) throw new AtlasError(scanUsage);
  return { input: inputs[0], words: isFilter(words) ? words.trim() : undefined, cluster };
}

async function scanCommand(args: string[], context: Context) {
  const { input, ...options } = scanArguments(args);
  const { words } = options;
  // Without Claude, nothing is scanned: the browser terminal says so at once.
  if (options.cluster && !context.cluster) throw new AtlasError('--cluster: claude -p runs only from the command line');
  const opened = await context.open(input);
  if (isOwner(opened)) return scanOwnerCommand(opened, options, context);
  const result = await scan(opened);
  const skills = words ? result.skills.filter(skillFilter(words)) : result.skills;
  const clusters = options.cluster ? await clusterSkills(skills, context.cluster!) : [];
  if (clusters.length > 0) {
    context.print(`${repositoryHeader(result.repository, skills, words ? result.skills.length : undefined)} · ${count(clusters.length, 'cluster', 'clusters')}`);
    printClusters(clusters, (skill) => printSkill(result.repository, skill, context), context);
  } else {
    printRepository(result.repository, skills, words ? result.skills.length : undefined, context);
  }
  if (words && skills.length === 0) context.print(noMatch(words));
  for (const warning of result.warnings) context.error(`warning: ${warning}`);
}

/**
 * The total, then each repository with skills, a blank line before it; filtered, only those with a match.
 * Clustered, all the skills together, each with its repository, under their clusters' labels.
 */
async function scanOwnerCommand(owner: Owner, { words, cluster }: ScanOptions, context: Context) {
  const result = await scanOwner(owner);
  const matches = words ? skillFilter(words) : () => true;
  const repositories = result.results
    .map((repository) => ({ ...repository, matched: repository.skills.filter(matches) }))
    .filter((repository) => repository.matched.length > 0);
  const total = result.results.reduce((sum, repository) => sum + repository.skills.length, 0);
  const matched = repositories.reduce((sum, repository) => sum + repository.matched.length, 0);
  const header =
    `${result.owner} · ${skillCount(matched, total, Boolean(words))} in ${repositories.length} of ` +
    count(result.scanned, 'repository', 'repositories');
  const skills = repositories.flatMap(({ repository, matched }) => matched.map((skill) => ({ repository, skill })));
  const clusters = cluster
    ? await clusterSkills(skills.map((each) => ({ ...each, name: each.skill.name, description: each.skill.description })), context.cluster!)
    : [];
  if (clusters.length > 0) {
    context.print(`${header} · ${count(clusters.length, 'cluster', 'clusters')}`);
    const byName = (a: { name: string; repository: Repository }, b: { name: string; repository: Repository }) =>
      compare(a.name, b.name) || compare(a.repository.id, b.repository.id);
    printClusters(
      clusters.map((each) => ({ ...each, skills: [...each.skills].sort(byName) })),
      ({ repository, skill }) => printSkill(repository, skill, context, `${repository.id} · `),
      context,
    );
    for (const warning of result.warnings) context.error(`warning: ${warning}`);
    return;
  }
  context.print(header);
  for (const repository of repositories) {
    context.print('');
    printRepository(repository.repository, repository.matched, words ? repository.skills.length : undefined, context);
  }
  if (words && matched === 0) context.print(noMatch(words));
  for (const warning of result.warnings) context.error(`warning: ${warning}`);
}

/** `N skills`; filtered, `N of M skills`. */
function skillCount(shown: number, total: number, filtered: boolean): string {
  return filtered ? `${shown} of ${count(total, 'skill', 'skills')}` : count(shown, 'skill', 'skills');
}

function noMatch(words: string): string {
  return `No skill matches "${words}"`;
}

async function serveCommand(args: string[], context: Context) {
  const usage = 'Usage: skill-atlas serve [port]';
  if (args.length > 1 || (args.length === 1 && !/^\d+$/.test(args[0]))) throw new AtlasError(usage);
  const port = args.length === 1 ? Number(args[0]) : 4173;
  if (port > 65535) throw new AtlasError(usage);
  if (!context.serve) throw new AtlasError('serve: the web view runs only from the command line');
  context.print(`Skill Atlas at ${await context.serve(port)} · Ctrl+C to stop`);
}

/**
 * `<owner>/<repo> · N skills`, or `N of M skills` when filtered (`total`), then each skill's name, first
 * sentence and link.
 */
function printRepository(repository: Repository, skills: Skill[], total: number | undefined, context: Context) {
  context.print(repositoryHeader(repository, skills, total));
  for (const skill of skills) printSkill(repository, skill, context);
}

function repositoryHeader(repository: Repository, skills: Skill[], total: number | undefined): string {
  return `${repository.id} · ${skillCount(skills.length, total ?? skills.length, total !== undefined)}`;
}

/** A skill's name and first sentence, after `prefix`; its link; `also in`. */
function printSkill(repository: Repository, skill: Skill, { print }: Context, prefix = '') {
  print(prefix + (skill.description ? `${skill.name} — ${firstSentence(skill.description)}` : skill.name));
  print(`  ${skillLink(repository, skill)}`);
  if (skill.copies.length > 0) print(`  also in ${skill.copies.join(', ')}`);
}

/** Each cluster, a blank line before it: `<label> · N skills`, then its skills, in the order given. */
function printClusters<T>(clusters: Cluster<T>[], printOne: (skill: T) => void, { print }: Context) {
  for (const cluster of clusters) {
    print('');
    print(`${cluster.label} · ${count(cluster.skills.length, 'skill', 'skills')}`);
    cluster.skills.forEach(printOne);
  }
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function firstSentence(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return /^.*?[.!?](?=\s|$)/.exec(line)?.[0] ?? line;
}
