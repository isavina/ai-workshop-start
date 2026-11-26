---
name: code-review
description: Review a change to Skill Atlas, the CLI or the web view, against its spec, its architecture and its tests. Use before committing, when asked to review a diff, a branch or a pull request, or when checking work another agent did.
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
- Every case in the spec has an integration test: through `atlas()` in `tests/helpers.ts`, the CLI
  itself or, for the web view, its server in `tests/web.test.ts`; not a unit test of a helper.
- A new case of where skills live goes into `fixture/` and its table in `fixture/README.md`.
- Output changed on purpose → the `.txt` files in `tests/recordings/` are refreshed with
  `npm run record -- github.com/<owner>/<repo>/tree/<commit>`; read their diff, it is the change.

**What a project skill is** (spec/analysis.md)
- Only `<base>/<root>/<skill>/SKILL.md` under the four skill roots; no symbolic links, no `node_modules`.
- Copies of one skill under several roots of one base are one skill, `also in` the others.

**Architecture**
- Core is fetch → find → parse in `src/core/`, with no Node APIs: the browser runs it too.
  The CLI (`src/cli.ts`), the commands (`src/commands.ts`) and the web view (`src/web.ts`) stay thin:
  they call `scan` with the same `open`, and none of them finds or parses skills on its own.
- A failure the user can fix is an `AtlasError` with a clear message: exit code 1, no stack trace.
- Warnings go to stderr, results to stdout (on the page: the warnings list); the scan goes on after a warning.
- Nothing is stored: no files written, no caches between runs.
- Output is deterministic: sorted by name, then path, without the locale.

**GitHub**
- Every GitHub request in a test is answered by `replay()`; an unrecorded one fails the test.
- The scanned commit is resolved once, and every link and file read pins it.
- Code search only with a token and only on the default branch; elsewhere, the tree.
- Rate limits, 404 and unreachable GitHub each end in their own message.

**Web view** (spec/web.md)
- The server listens on `127.0.0.1` only, never on all interfaces: the field reads any local directory.
- The page shows what the CLI shows: the same skills, order, copies, warnings and error messages.
  An `AtlasError` → status 400 `{ error }`; anything else → 500. A new or renamed field of
  `GET /api/scan` changes spec/web.md and `tests/web.test.ts` with it.
- A `SKILL.md`, a name or a description comes from any repository someone types in: it goes into the
  page as text (`textContent`, `<pre>`), never as HTML (`innerHTML`, `insertAdjacentHTML`), and a link's
  `href` comes only from `skillLink` or the repository's URL.
- The address keeps `?repository=…&skill=<path>`; a reload shows the same skill.
- Nothing stored here either: `Cache-Control: no-store`, no `localStorage`, no scan kept between requests.
- `serve`: a port in use, or not a port → a clear message, exit code 1.

**Code**
- Reads like the code around it: short doc comments on exports, plain names, no dead code.
- No new dependency without a reason the change states.

## Report

Findings first, the most severe first. Each one: `file:line`, what is wrong, and the input that shows it
(a repository, a path, a command and what it prints). Then what was run and its result. No finding →
say so, and what was checked.

## Label the pull request

The last step of reviewing a pull request. At least one finding to address → label it
`review-suggested`: the label starts [address-review](../address-review/SKILL.md), which removes it
once every point is answered. No finding → no label, and the loop ends.

At most three rounds, so count first how often the label was added before:

```console
$ gh api --paginate repos/<owner>/<repo>/issues/<number>/events \
    --jq '.[] | select(.event == "labeled" and .label.name == "review-suggested") | .id' | wc -l
```

Fewer than three → create, remove and add the label:

```console
$ gh label create review-suggested --color FBCA04 --description "A review left suggestions to address" --force
$ gh pr edit <number> --remove-label review-suggested   # a label already on it fires no event
$ gh pr edit <number> --add-label review-suggested
```

Three or more → do not add it again; comment on the pull request that the review loop stopped after
three rounds, with the findings still open, for a person to decide.
