# Command line
`./skill-atlas scan <GitHub URL | directory>`
`./skill-atlas scan github.com/JetBrains/MPS/tree/<commit>`: at a branch, tag or commit
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
