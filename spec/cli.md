# Command line
`./skill-atlas scan <GitHub URL | directory>`
`./skill-atlas scan github.com/JetBrains`: every repository of an [organization or a user](analysis.md#organization)
`./skill-atlas scan github.com/JetBrains/MPS/tree/<commit>`: at a branch, tag or commit
`./skill-atlas scan <input> --filter <words>` (or `--filter=<words>`): only the [matching skills](#filter)
Prints the result **at once**; *nothing is stored*.
`GITHUB_TOKEN`, optional: a higher GitHub rate limit.
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
