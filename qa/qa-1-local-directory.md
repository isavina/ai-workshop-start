# QA-1 Local directory

`./skill-atlas scan <directory>` on [fixture/](../fixture/README.md): which `SKILL.md` is a project
skill, copies, and warnings ([spec/analysis.md](../spec/analysis.md#project-skill)).

**Needs:** nothing; works offline.

1. `./skill-atlas scan fixture`

   Expected, on stdout, exit code 0 (`echo $?`):
   ```
   fixture · 5 skills
   build — Build the subproject with its own Gradle wrapper.
     file://<root>/fixture/subproject/.claude/skills/build/SKILL.md
   code-style — Follow the project's code style.
     file://<root>/fixture/.github/skills/code-style/SKILL.md
   commits — Write commit messages the way this repository does.
     file://<root>/fixture/.claude/skills/commits/SKILL.md
     also in .github/skills/commits/SKILL.md
   plain
     file://<root>/fixture/.claude/skills/plain/SKILL.md
   release-checklist
     file://<root>/fixture/.agents/skills/release-checklist/SKILL.md
   ```
   - Sorted by name; a description shows only its first sentence.
   - `commits` once, `also in` its copy; `linked` (a symbolic link) not listed.
   - Not listed: `.claude/skills/SKILL.md`, `group/nested`, `lowercase/skill.md`, `docs/examples/…`.

2. `./skill-atlas scan fixture 2>/dev/null`

   Expected: the same as step 1 without warnings: the warnings went to stderr.

3. `./skill-atlas scan fixture >/dev/null`

   Expected, only the two warnings; the scan went on after them:
   ```
   warning: .agents/skills/release-checklist/SKILL.md: malformed front matter: …; using the directory name
   warning: .claude/skills/plain/SKILL.md: no front matter; using the directory name
   ```

4. `./skill-atlas scan "$PWD/fixture/"`, an absolute path with a trailing slash

   Expected: the same skills as step 1.

5. `git status --short`

   Expected: nothing new: the scan stored nothing.
