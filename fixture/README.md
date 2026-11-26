# fixture

A small repository for the tests: what is a project skill, and what is not (spec/analysis.md).

| Path | Case |
| --- | --- |
| `.claude/skills/commits` | a skill |
| `.github/skills/commits` | its copy in another agent's folder: `also in` |
| `.github/skills/code-style` | a skill in another agent's folder |
| `.agents/skills/release-checklist` | malformed front matter |
| `.claude/skills/plain` | no front matter: still a skill |
| `subproject/.claude/skills/build` | a subproject's skill |
| `agent/skills/linked` | a symbolic link to `commits`: not followed |
| `.claude/skills/SKILL.md` | directly in the root: not a skill |
| `.claude/skills/group/nested` | two directories below the root: not a skill |
| `.claude/skills/lowercase/skill.md` | not named `SKILL.md`: not a skill |
| `docs/examples/skills/example` | outside the skill roots: not a skill |
