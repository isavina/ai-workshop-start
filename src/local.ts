import { readdir, readFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { AtlasError } from './core/errors.ts';
import type { Source } from './core/scan.ts';

/** Never part of a repository's own files. */
const SKIPPED = new Set(['.git', 'node_modules']);

/** A local checkout as a repository: named after its directory, linked with file:// URLs. */
export async function openDirectory(input: string): Promise<Source> {
  const root = resolve(input);
  const name = basename(root);
  const paths: string[] = [];
  const warnings: string[] = [];
  try {
    await walk(root, '', paths, warnings);
  } catch {
    throw new AtlasError(`Not a GitHub URL or a readable directory: ${input}`);
  }
  return {
    repository: { id: name, organization: 'local', name, url: pathToFileURL(root).href, commit: '' },
    paths,
    // In path order, not the order the file system lists them in.
    warnings: warnings.sort(),
    read: (path) => readFile(join(root, path)).then((bytes) => new Uint8Array(bytes), () => undefined),
  };
}

/**
 * Every regular file under the directory, as a path relative to the root. The root unreadable ends
 * the walk; a subdirectory unreadable (another user's, such as a Docker volume) is a warning.
 */
async function walk(root: string, directory: string, paths: string[], warnings: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(join(root, directory), { withFileTypes: true });
  } catch (error) {
    if (!directory) throw error;
    warnings.push(`${directory}: cannot read this directory; skipped`);
    return;
  }
  // One list for the whole walk: a large repository has more files than a spread can pass.
  for (const entry of entries) {
    const path = directory ? `${directory}/${entry.name}` : entry.name;
    if (entry.isDirectory() && !SKIPPED.has(entry.name)) await walk(root, path, paths, warnings);
    else if (entry.isFile()) paths.push(path);
  }
}
