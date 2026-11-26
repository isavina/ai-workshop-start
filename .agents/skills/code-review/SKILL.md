---
name: code-review
description: Review a change to Skill Atlas against its spec, its architecture and its tests. Use before committing, when asked to review a diff, a branch or a pull request, or when checking work another agent did.
---

# Code review

Review what changed, not the whole repository: `git diff` for the working tree, `git diff main...HEAD`
for a branch. Read [spec/](../../../spec/) first: it says what the code must do.

## Run

```console
$ npm ci          # a fresh checkout only
$ npm test
$ npm run typecheck
```

A failing test or type error is the first finding. The tests never reach the network; nothing to set up.

## Check

**Spec and tests**
- A change in behaviour changes `spec/` in the same commit, in its terse style: one line a decision.
- Every case in the spec has an integration test: through `atlas()` in `tests/helpers.ts` or the CLI
  itself, not a unit test of a helper.
- A new case of where skills live goes into `fixture/` and its table in `fixture/README.md`.
- Output changed on purpose → the `.txt` files in `tests/recordings/` are refreshed with
  `npm run record -- github.com/<owner>/<repo>/tree/<commit>`; read their diff, it is the change.

**What a project skill is** (spec/analysis.md)
- Only `<base>/<root>/<skill>/SKILL.md` under the four skill roots; no symbolic links, no `node_modules`.
- Copies of one skill under several roots of one base are one skill, `also in` the others.

**Architecture**
- Core is fetch → find → parse in `src/core/`, with no Node APIs: the browser runs it too.
  The CLI (`src/cli.ts`) and the commands (`src/commands.ts`) stay thin.
- A failure the user can fix is an `AtlasError` with a clear message: exit code 1, no stack trace.
- Warnings go to stderr, results to stdout; the scan goes on after a warning.
- Nothing is stored: no files written, no caches between runs.
- Output is deterministic: sorted by name, then path, without the locale.

**GitHub**
- Every GitHub request in a test is answered by `replay()`; an unrecorded one fails the test.
- The scanned commit is resolved once, and every link and file read pins it.
- Code search only with a token and only on the default branch; elsewhere, the tree.
- Rate limits, 404 and unreachable GitHub each end in their own message.

**Code**
- Reads like the code around it: short doc comments on exports, plain names, no dead code.
- No new dependency without a reason the change states.

## Report

Findings first, the most severe first. Each one: `file:line`, what is wrong, and the input that shows it
(a repository, a path, a command and what it prints). Then what was run and its result. No finding →
say so, and what was checked.
