#!/usr/bin/env node
// The Node client: a GitHub repository through the GitHub API, or a local directory; stdout and
// stderr, or the local web view; claude -p for --cluster. Nothing is stored.
import { claude } from './claude.ts';
import { run } from './commands.ts';
import { openGitHub, openOwner, parseGitHubOwner, parseGitHubUrl } from './core/github.ts';
import { openDirectory } from './local.ts';
import { createWebServer, listen } from './web.ts';

const token = process.env.GITHUB_TOKEN || undefined;
const open = (input: string) =>
  parseGitHubUrl(input) ? openGitHub(input, { fetch, token })
  : parseGitHubOwner(input) ? openOwner(input, { fetch, token })
  : openDirectory(input);

const cluster = claude();

process.exitCode = await run(process.argv.slice(2), {
  open,
  cluster,
  print: (text) => console.log(text),
  error: (text) => console.error(text),
  serve: (port) => listen(createWebServer({ open, cluster }), port),
});
