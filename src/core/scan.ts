import { EmptyRepositoryError, NotFoundError } from './errors.ts';
import { findSkills, type SkillFile } from './find.ts';
import { sortSkills, type Repository, type Skill } from './model.ts';
import { parseSkill } from './parse.ts';

/** A repository to scan: its files, and how to read them. */
export type Source = {
  repository: Repository;
  /** Every file path, relative to the repository root. */
  paths: string[];
  /** What listing the files had to leave out. */
  warnings: string[];
  /** The file's bytes, or undefined if it is not there. */
  read(path: string): Promise<Uint8Array | undefined>;
};

export type ScanResult = { repository: Repository; skills: Skill[]; warnings: string[] };

/** An organization or a user: its repositories, listed when asked, and how to open each one. */
export type Owner = {
  /** `https://github.com/<owner>`, as typed. */
  url: string;
  /** Whether GitHub is asked with a token: without one, 60 requests an hour, a few repositories. */
  authenticated: boolean;
  /** The owner's name as GitHub writes it, and its repositories as `owner/repo`, sorted. */
  list(): Promise<{ owner: string; repositories: string[] }>;
  /** One of the listed repositories. */
  open(id: string): Promise<Source>;
};

export type OwnerResult = {
  owner: string;
  /** How many repositories were scanned, with skills or without. */
  scanned: number;
  /** The repositories with skills, by `owner/repo`. */
  results: ScanResult[];
  /** Each one starts with its repository: `owner/repo: …`. */
  warnings: string[];
};

/** How many repositories are scanned at the same time. */
const AT_ONCE = 8;

/**
 * Every repository of an owner, a few at a time. A repository that is gone, or has no such branch,
 * is a warning and an empty one is left out; anything else, such as the rate limit, ends the scan.
 */
export async function scanOwner(owner: Owner): Promise<OwnerResult> {
  const { owner: name, repositories } = await owner.list();
  const outcomes: { result?: ScanResult; warning?: string }[] = [];
  let next = 0;
  let failed = false; // the others stop asking after a failure that ends the scan
  async function worker() {
    while (!failed && next < repositories.length) {
      const index = next++;
      const id = repositories[index];
      try {
        outcomes[index] = { result: await scan(await owner.open(id)) };
      } catch (error) {
        if (error instanceof EmptyRepositoryError) outcomes[index] = {};
        else if (error instanceof NotFoundError) outcomes[index] = { warning: `${error.message}; skipped` };
        else {
          failed = true;
          throw error;
        }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(AT_ONCE, repositories.length) }, worker));
  const results = outcomes.flatMap((outcome) => (outcome.result ? [outcome.result] : []));
  return {
    owner: name,
    scanned: repositories.length,
    results: results.filter((result) => result.skills.length > 0),
    warnings: outcomes.flatMap((outcome, index) => {
      const id = repositories[index];
      const own = outcome.result?.warnings ?? (outcome.warning ? [outcome.warning] : []);
      return own.map((warning) => `${id}: ${warning}`);
    }),
  };
}

/** An owner's repositories, rather than one repository's files. */
export function isOwner(opened: Source | Owner): opened is Owner {
  return 'list' in opened;
}

/** fetch → find → parse. Nothing is stored: the result is all there is. */
export async function scan(source: Source): Promise<ScanResult> {
  const files = findSkills(source.paths);
  // The files are read at the same time: on GitHub, each one is a request.
  const results = await Promise.all(files.map((file) => readSkill(source, file)));
  return {
    repository: source.repository,
    skills: sortSkills(results.flatMap((result) => (result.skill ? [result.skill] : []))),
    warnings: [...source.warnings, ...results.flatMap((result) => (result.warning ? [result.warning] : []))],
  };
}

async function readSkill(source: Source, file: SkillFile): Promise<{ skill?: Skill; warning?: string }> {
  const bytes = await source.read(file.path);
  if (!bytes) return { warning: `${file.path}: listed, but not found at the scanned commit; skipped` };
  const text = new TextDecoder().decode(bytes);
  const parsed = parseSkill(text);
  const skill: Skill = {
    id: `${source.repository.id}:${file.path}`,
    repository: source.repository.id,
    path: file.path,
    name: parsed.name ?? file.name,
    description: parsed.description,
    commit: source.repository.commit,
    copies: file.copies,
    text,
  };
  return { skill, warning: parsed.warning && `${file.path}: ${parsed.warning}` };
}
