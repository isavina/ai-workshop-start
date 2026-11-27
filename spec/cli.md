# Command line
`./skill-atlas scan <GitHub URL | directory>`
`./skill-atlas scan github.com/JetBrains`: every repository of an [organization or a user](analysis.md#organization)
`./skill-atlas scan github.com/JetBrains/MPS/tree/<commit>`: at a branch, tag or commit
`./skill-atlas scan <input> --filter <words>` (or `--filter=<words>`): only the [matching skills](#filter)
`./skill-atlas scan <input> --cluster`: the skills [grouped by topic](#cluster), by `claude -p`
Prints the result **at once**; *nothing is stored*.
`GITHUB_TOKEN`, optional: a higher GitHub rate limit.
`SKILL_ATLAS_CLAUDE`, optional: the `claude` command `--cluster` runs, `claude` by default; one executable, no arguments.
`./skill-atlas serve [port]`: the [web view](web.md).
## Output
```
JetBrains/kotlin · 6 skills
build-tools-bump-gradle-api — Bumps the Gradle API…
  https://github.com/JetBrains/kotlin/blob/<commit>/…
```
- Sorted by **name**; the description's *first sentence*
- `also in <paths>` for copies; warnings go to *stderr*
## Organization
```
JetBrains · 8 skills in 2 of 512 repositories

JetBrains/koog · 2 skills
add-java-code-snippets-in-docs — Use when the user asks to add Java tabs/examples…
  https://github.com/JetBrains/koog/blob/<commit>/…

JetBrains/kotlin · 6 skills
…
```
- The total: skills, repositories with skills, repositories scanned
- Then each repository *with skills*, as above, sorted by `owner/repo`, a blank line before each
- Warnings start with the repository: `warning: JetBrains/x: …`
## Filter
`--filter review`: the skills with these words in their **name or description**, not the rest of the SKILL.md
- Case-insensitive, by words: `-`, `_`, `/`, spaces (any punctuation) separate them;
  `code review`, `code-review` and `Code_Review` are the same filter
- Several words → a skill has *all* of them; a word matches the *start* of a word: `rev` finds `review`, `view` does not
- The header says `N of M skills`; on an organization `N of M skills in K of S repositories`, K those with a match,
  each repository `owner/repo · N of M skills`; repositories without a match are not printed
- No match → the header, then `No skill matches "<words>"`; exit code 0
- No words to filter by (`""`, `-`) → every skill, as without `--filter`; `--filter` twice, or without words → the usage, exit 1
- The warnings are the scan's, filtered or not
- One filter, `src/core/filter.ts`, for the CLI, the API and the page
## Cluster
`--cluster`: the skills grouped by topic or purpose; Claude picks the groups, through `claude -p`
```
fixture · 5 skills · 3 clusters

Build and release · 2 skills
build — Build the subproject with its own Gradle wrapper.
  file:///…
…

Other · 1 skill
plain
  file:///…
```
- The header is the scan's, then ` · K clusters`; a blank line before each cluster, `<label> · N skills`,
  then its skills as usual, sorted by name
- Clusters sorted by label; `Other`, at most one, *last*
- Claude sees only the skills' **names and descriptions**, the prompt on stdin of `claude -p`; *nothing is stored*
- A text answer only: `--tools ""`, `--strict-mcp-config`, `--disable-slash-commands`, `--no-session-persistence`,
  run in the temporary directory, so no project's `CLAUDE.md` or settings
- Its answer is checked: *2 to 8* clusters, each with a label (at most 60 characters) and skills, every
  skill in *exactly one*; otherwise invalid. The JSON alone, or in prose or a ```json block
- `claude -p` missing, not an executable, failing (its message, from stderr or stdout), invalid, or *2 minutes*
  without an answer (it is killed, not waited for) → a clear message, exit code 1, no partial result, no fallback
- With `--filter`, filtered first; only the matching skills are clustered
- Fewer than 2 skills (after the filter) → *no clustering*, the list as without `--cluster`; `claude` is not run
- An organization: all its skills clustered together, each `owner/repo · <name> — …`; sorted by name, then repository
- `--cluster` twice, or `--cluster=…` → the usage, exit 1
- One module, `src/core/cluster.ts`, for the CLI and the web view; `SKILL_ATLAS_CLAUDE` runs instead of `claude`
