# Repository analysis
## Input
A **GitHub repository** URL, or a local directory
## Output
Every `SKILL.md`: **name**, **description**, **link**
## Architecture
Core: fetch → find → parse. CLI: a *thin client*.
Skill: id = `repo:path`, name, description, commit
## Details
- **GitHub API**, no clone; *under 5 s* for intellij-community
- The name: front matter, else the directory
- The link pins the *scanned commit*
- Malformed front matter → a *warning*, the scan goes on
- Unreachable repository → a clear message, exit code 1
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
