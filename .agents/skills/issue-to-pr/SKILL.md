---
name: issue-to-pr
description: Implement a GitHub issue of Skill Atlas with its spec and tests, and open a pull request for it. Use when asked to fix, implement or "do" an issue by number or URL.
---

# Issue to pull request

One issue, one branch, one pull request. Never push to `main`, never merge.

## 1. Understand the issue

```console
$ gh issue view <number> --json number,title,body,labels,comments
```

- Restate what it asks in one sentence, and how the result will be checked: a command and what it prints.
- Read [spec/](../../../spec/) and find the decision it touches. Unclear, or against the spec → ask
  before writing code; do not guess.
- Do what the issue asks and nothing more; anything else you notice goes into the pull request, as a note.

## 2. Branch

```console
$ git switch main && git pull
$ git switch -c issue-<number>-<two-or-three-words>
$ npm ci
```

## 3. Spec, then tests, then code

1. **Spec:** change `spec/` first, in its terse style: one line a decision, edge cases included.
2. **Tests:** an integration test for every case the spec now has, through `atlas()` in
   `tests/helpers.ts` or the CLI; see them fail.
   - Where skills live → a directory in `fixture/` and a row in `fixture/README.md`.
   - What GitHub answers → `replay()`; a real repository at a fixed commit →
     `npm run record -- github.com/<owner>/<repo>/tree/<commit>` and its `.txt` compared.
3. **Code:** the core in `src/core/` (no Node APIs), the CLI and the commands thin; a failure the user
   can fix is an `AtlasError`.

## 4. Done

```console
$ npm test
$ npm run typecheck
$ ./skill-atlas scan <what the issue is about>
```

All tests pass, no type errors, and the command prints what step 1 said it would. Then review the
branch with [code-review](../code-review/SKILL.md) on `git diff main...HEAD` and fix what it finds.

## 5. Commit and open the pull request

Commit with a subject in the imperative and a body that says why; end it with `Closes #<number>`.

```console
$ git push -u origin HEAD
$ gh pr create --base main --title "<the subject>" --body-file <file>
```

The body:

```markdown
<What changed and why, in two or three sentences.>

**Spec:** <the decisions added or changed in spec/>
**Tests:** <the cases they cover>
**Checked:** `npm test`, `npm run typecheck`, `./skill-atlas scan …` → <what it printed>
<Notes: what was out of scope, open questions.>

Closes #<number>
```

Report the pull request's URL. Any step that failed or was skipped is said in the report and in the body.
