// The skill-atlas commands. The same code serves the Node CLI and the browser
// terminal: everything that differs between them comes in through the context.
import { AtlasError } from './core/errors.ts';
import { filterSkills, filterWords } from './core/filter.ts';
import { skillLink, type Repository, type Skill } from './core/model.ts';
import { isOwner, scan, scanOwner, type Owner, type Source } from './core/scan.ts';

export type Context = {
  /** Opens what the user asked to scan: a repository, or an organization's or a user's repositories. */
  open(input: string): Promise<Source | Owner>;
  print(text: string): void;
  /** Errors and warnings. */
  error(text: string): void;
  /** Starts the local web view and resolves with its address; only the Node CLI has one. */
  serve?(port: number): Promise<string>;
};

const usage = `Usage: skill-atlas <command>

  scan <GitHub URL | directory>   find every SKILL.md in a repository and print it;
                                  github.com/<owner>: in every repository of an organization or a user
       [--filter <words>]         only the skills with these words in their name and description
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

async function scanCommand(args: string[], context: Context) {
  const { input, filter } = scanArgs(args);
  const opened = await context.open(input);
  if (isOwner(opened)) return scanOwnerCommand(opened, filter, context);
  const result = await scan(opened);
  printRepository(result.repository, result.skills, filter, context);
  if (filter && filterSkills(result.skills, filter).length === 0) context.print(noMatch(filter));
  for (const warning of result.warnings) context.error(`warning: ${warning}`);
}

/** `<input> [--filter <words>]`, in either order; a filter without words is no filter. */
function scanArgs(args: string[]): { input: string; filter?: string } {
  const usage = 'Usage: skill-atlas scan <GitHub URL | directory> [--filter <words>]';
  const rest = [...args];
  let filter: string | undefined;
  const at = rest.indexOf('--filter');
  if (at !== -1) {
    if (at + 1 >= rest.length) throw new AtlasError(usage);
    filter = rest.splice(at, 2)[1].trim();
  }
  if (rest.length !== 1 || rest[0].startsWith('--')) throw new AtlasError(usage);
  return { input: rest[0], filter: filter && filterWords(filter).length > 0 ? filter : undefined };
}

/**
 * The total, then each repository with skills, a blank line before it. Filtered: `N of M skills`,
 * and only the repositories with a skill that matches.
 */
async function scanOwnerCommand(owner: Owner, filter: string | undefined, context: Context) {
  const result = await scanOwner(owner);
  const all = result.results.reduce((sum, repository) => sum + repository.skills.length, 0);
  const matches = result.results.map((repository) => filterSkills(repository.skills, filter ?? '').length);
  const shown = result.results.filter((_, index) => matches[index] > 0);
  const matched = matches.reduce((sum, n) => sum + n, 0);
  context.print(
    `${result.owner} · ${filter ? `${matched} of ${count(all, 'skill', 'skills')}` : count(all, 'skill', 'skills')} ` +
      `in ${shown.length} of ${count(result.scanned, 'repository', 'repositories')}`,
  );
  for (const repository of shown) {
    context.print('');
    printRepository(repository.repository, repository.skills, filter, context);
  }
  if (filter && matched === 0) context.print(`\n${noMatch(filter)}`);
  for (const warning of result.warnings) context.error(`warning: ${warning}`);
}

function noMatch(filter: string): string {
  return `No skill matches "${filter}"`;
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
 * `<owner>/<repo> · N skills`, then each skill's name, first sentence and link. Filtered:
 * `N of M skills`, and only the skills that match.
 */
function printRepository(repository: Repository, all: Skill[], filter: string | undefined, { print }: Context) {
  const skills = filterSkills(all, filter ?? '');
  const total = count(all.length, 'skill', 'skills');
  print(`${repository.id} · ${filter ? `${skills.length} of ${total}` : total}`);
  for (const skill of skills) {
    print(skill.description ? `${skill.name} — ${firstSentence(skill.description)}` : skill.name);
    print(`  ${skillLink(repository, skill)}`);
    if (skill.copies.length > 0) print(`  also in ${skill.copies.join(', ')}`);
  }
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function firstSentence(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return /^.*?[.!?](?=\s|$)/.exec(line)?.[0] ?? line;
}
