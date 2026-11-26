# Skill Atlas

Every agent skill in a repository, in the terminal: `./skill-atlas scan` finds each project skill's
`SKILL.md` and prints its name, description and link. It reads GitHub through its API: no clone,
nothing stored.

```console
$ npm ci
$ ./skill-atlas scan github.com/JetBrains/koog/tree/709079e4a34d6c9234583352550e6a2b88a0bb85
JetBrains/koog · 2 skills
add-java-code-snippets-in-docs — Use when the user asks to add Java tabs/examples to mkdocs docs that already have Kotlin examples (files under docs/docs/**.md using === "Kotlin" / Knit INCLUDE+SUFFIX blocks).
  https://github.com/JetBrains/koog/blob/709079e4a34d6c9234583352550e6a2b88a0bb85/.claude/skills/add-java-code-snippets-in-docs/SKILL.md
split-jvm-nonjvm — Splits a class or several classes in the common source set commonMain into JVM and non-JVM parts into jvmCommonMain and nonJvmCommonMain.
  https://github.com/JetBrains/koog/blob/709079e4a34d6c9234583352550e6a2b88a0bb85/.claude/skills/split-jvm-nonjvm/SKILL.md
```

Requires Node.js 24 or later.

## Usage

```console
$ ./skill-atlas scan https://github.com/JetBrains/kotlin            # the default branch
$ ./skill-atlas scan github.com/JetBrains/MPS/tree/<branch, tag or commit>
$ ./skill-atlas scan ~/projects/my-repository                       # a local checkout
$ GITHUB_TOKEN=$(gh auth token) ./skill-atlas scan github.com/JetBrains   # every repository of an organization
```

- Skills are sorted by name; each shows its description's first sentence and a link pinned to the
  scanned commit. `also in` lists the same skill in other agents' folders.
- Warnings, such as malformed front matter, go to stderr; the scan goes on.
- An organization or a user: every repository but forks and archived ones, at its default branch;
  only those with skills are printed, after a total ([spec/analysis.md](spec/analysis.md#organization)).
- GitHub allows 60 requests an hour without a token. Set `GITHUB_TOKEN` for more, for example
  `GITHUB_TOKEN=$(gh auth token) ./skill-atlas scan …`.

Or in the browser: `./skill-atlas serve` opens a local web view at http://localhost:4173, with a field
for a repository, its skills and each one's SKILL.md ([spec/web.md](spec/web.md)). Paste
`https://github.com/JetBrains` there for a whole organization, grouped by repository; start it with
`GITHUB_TOKEN=$(gh auth token) ./skill-atlas serve` for that.
[A short demo](docs/demo/organization-scan.mp4) of an organization scan.

## What counts as a skill

A project skill is `<root>/<skill>/SKILL.md`, where the root is `.agents/skills`, `.claude/skills`,
`.github/skills` or `agent/skills`, at the repository root or in a subproject. A `SKILL.md` anywhere
else (docs, test data, `node_modules`) is not one. The edge cases are in
[spec/analysis.md](spec/analysis.md#project-skill).

## Development

```console
$ npm test            # all tests, offline
$ npm run typecheck
```

The end-to-end tests replay what GitHub answered for real repositories at fixed commits and compare
the output with the stored one; both are in [tests/recordings/](tests/recordings/). To add or
refresh one:

```console
$ GITHUB_TOKEN=$(gh auth token) npm run record -- github.com/JetBrains/MPS/tree/<full commit hash>
```

- [spec/](spec/): what it does; update it with the code.
- [qa/](qa/README.md): the manual test scripts, run by hand or with the [qa skill](.agents/skills/qa/SKILL.md).
- [AGENTS.md](AGENTS.md): the definition of done.
- [fixture/](fixture/README.md): a small repository, one directory per edge case.
- [.agents/skills/code-review](.agents/skills/code-review/SKILL.md): how a change is reviewed.
