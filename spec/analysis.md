# Repository analysis
## Input
A **GitHub repository** URL, or a local directory
- At the default branch, or at `/tree/<branch, tag or commit>`: everything after `tree/`

Or a **GitHub organization or user**, `github.com/<owner>`: each of its repositories
## Output
Every `SKILL.md`: **name**, **description**, **link**
## Architecture
Core: fetch → find → parse. CLI and web view: *thin clients*.
Skill: id = `repo:path`, name, description, commit, the SKILL.md text
## Details
- **GitHub API**, no clone; *under 5 s* for intellij-community
- The name: front matter, else the directory
- The link pins the *scanned commit*
- Malformed front matter, too many YAML aliases (an alias bomb) included → a *warning*, the scan goes on
- Unreachable repository, or an unknown branch, tag or commit → a clear message, exit code 1
- An empty repository, without a commit → a clear message, exit code 1
- Code search (with `GITHUB_TOKEN`) only on the default branch; elsewhere, the tree
- A tree too large for one answer → only the skill roots at the repository root, and a *warning*
## Organization
`github.com/<owner>`: every repository of an organization or a user, each scanned as above
- At each repository's *default branch*, through its *tree*: code search allows 10 requests a minute
- Public repositories only; **forks** and **archived** repositories are left out
- An empty repository: left out, no warning
- A repository that fails (gone, unknown branch) → a *warning*, the scan goes on
- Rate limit, unreachable GitHub or a rejected token → a clear message, exit code 1, no partial result
- An unknown organization or user → a clear message, exit code 1
- *Under 5 s* is for one repository; an organization takes one or two requests a repository
- Without `GITHUB_TOKEN`, 60 requests an hour: enough only for a few repositories
## Project skill
A skill that agents working *in the repository* load: `<base>/<root>/<skill>/SKILL.md`
- **root**: `.agents/skills`, `.claude/skills`, `.github/skills`, `agent/skills`
- **base**: the repository root or *any subdirectory* (a monorepo's subprojects)
- Exactly `SKILL.md`, exactly *one directory* below the root
- Not a skill: a `SKILL.md` anywhere else (docs, test data, a plugin's `skills/`), `skill.md`,
  `<root>/SKILL.md`, `<root>/<group>/<skill>/SKILL.md`, anything under `node_modules`
- Symbolic links are *not followed*: a linked skill is listed once, where it really is
- **Copies**: the same `<skill>` directory under several roots of one base is *one skill*,
  at the first root in the order above; the others are `also in`
- The same `<skill>` in different bases: *different skills*
- No front matter, or no description: *still a skill*
