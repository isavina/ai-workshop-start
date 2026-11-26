# Command line
`./skill-atlas scan <GitHub URL | directory>`
`./skill-atlas scan github.com/JetBrains`: every repository of an [organization or a user](analysis.md#organization)
`./skill-atlas scan github.com/JetBrains/MPS/tree/<commit>`: at a branch, tag or commit
`./skill-atlas scan <input> --filter <words>`: only the skills that [match](analysis.md#filter); before or after `<input>`
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
## Filtered
```
JetBrains/kotlin · 2 of 6 skills
…
```
- The header: `N of M skills`, M the skills before the filter
- No match → the header, `No skill matches "<words>"`, exit code 0
- `--filter` without its words → the usage, exit code 1
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
- Filtered: `JetBrains · N of M skills in K of 512 repositories`, K the repositories *with a match*;
  only those are shown, each `owner/repo · n of m skills`; no match → a blank line, then `No skill matches "<words>"`
