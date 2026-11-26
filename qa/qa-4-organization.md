# QA-4 Organization

`./skill-atlas scan github.com/<owner>`: every repository of an organization or a user
([spec/analysis.md](../spec/analysis.md#organization), [spec/cli.md](../spec/cli.md#organization)).

**Needs:** network, `GITHUB_TOKEN`; about 250 requests.

1. `time ./skill-atlas scan github.com/Kotlin`

   Expected, exit code 0, in about 15 s or less:
   ```
   Kotlin · N skills in M of R repositories

   Kotlin/dataframe · 1 skill
   …
   ```
   - The total first: N skills, M repositories with skills, R scanned (about 100).
   - Then only repositories with skills, sorted by `owner/repo`, a blank line before each; their N adds up.
   - No fork and no archived repository among them (check one on GitHub).

2. `./skill-atlas scan github.com/anthropics >/dev/null`

   Expected: each warning starts with its repository, `warning: anthropics/<repo>: …`; a repository
   with a tree too large (`anthropics/fermats-last-theorem` today) says so, and the scan goes on.

3. `./skill-atlas scan github.com/<a user with only forks or no repositories>`, such as your own account if it has none

   Expected: `<user> · 0 skills in 0 of 0 repositories`, or `… in 0 of R`; exit code 0.

4. `GITHUB_TOKEN=bad ./skill-atlas scan github.com/Kotlin`

   Expected: `GitHub rejected the token in GITHUB_TOKEN`; exit code 1; no partial result on stdout.
