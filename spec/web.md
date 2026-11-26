# Web view
`./skill-atlas serve [port]`: a local page at `http://localhost:<port>`, 4173 by default
- Prints its address; runs until stopped. Only on *this machine* (`127.0.0.1`)
- A port in use, or not a port → a clear message, exit code 1
## Page
- A **field** for a repository: what `scan` takes, a GitHub URL, `…/tree/<ref>`, a directory or `github.com/<owner>`
- Under it, a **hint** on what to paste there, with an example
- Its **skills**: the same scan, the same order; name, *full* description, path
- The selected skill's **SKILL.md**: as it is, front matter included; its link, `also in`
- Warnings and errors: the same messages as the CLI, on the page
- The address keeps `?repository=…&skill=<path>`: a scan can be linked and reloaded
- Each scan is done when asked; *nothing is stored*
- While it scans, the page says so, with the seconds so far
- A new scan, asked or by going back, replaces one still running: only the latest shows its progress and result
## Organization
`github.com/<owner>`, an organization or a user: the [same scan as the CLI](analysis.md#organization)
- Every public repository at its default branch; no forks, archived or empty repositories
- Needs `GITHUB_TOKEN` (JetBrains: ~900 repositories, ~1,000 requests); without it → a clear message,
  status 400, *nothing asked of GitHub*
- A total, `JetBrains · N skills in M repositories`: M counts the repositories *with skills*
- Then the skills **grouped by repository**, by `owner/repo`; only repositories with skills
- The selected skill's **SKILL.md** as for one repository, with its repository
- The address keeps `?repository=github.com/<owner>&skill=<owner>/<repo>:<path>`
- A repository that fails (gone, too large) → a *warning*, `owner/repo: …`; the scan goes on
- Rate limit, unreachable GitHub, a rejected token, an unknown owner → status 400, *no partial result*
## API
`GET /api/scan?repository=<input>` → `{ repository, skills, warnings }`, each skill with its `link` and `text`;
a message the CLI would exit 1 for → status 400, `{ error }`

`GET /api/scan?repository=github.com/<owner>` → `{ owner: { name, url }, scanned, repositories, warnings }`;
each of `repositories`, with skills only: `{ repository, skills }`, as above
