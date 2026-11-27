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

5. `./skill-atlas scan fixture --filter commit 2>/dev/null`

   Expected, exit code 0: only the skills with a word starting `commit` in their name or description
   ([spec/cli.md](../spec/cli.md#filter)); `code-style` for its `committing`:
   ```
   fixture · 2 of 5 skills
   code-style — Follow the project's code style.
     file://<root>/fixture/.github/skills/code-style/SKILL.md
   commits — Write commit messages the way this repository does.
     file://<root>/fixture/.claude/skills/commits/SKILL.md
     also in .github/skills/commits/SKILL.md
   ```

6. `./skill-atlas scan fixture --filter=Build_Gradle 2>/dev/null`, then `--filter "use before"`

   Expected: `fixture · 1 of 5 skills`, only `build`: case and separators do not matter. Then
   `fixture · 2 of 5 skills`, `build` and `code-style`: every word, in the name or the description.

7. `./skill-atlas scan fixture --filter mit 2>/dev/null; echo $?`

   Expected: a word matches only the start of a word, so nothing here:
   ```
   fixture · 0 of 5 skills
   No skill matches "mit"
   0
   ```

8. `./skill-atlas scan fixture --filter commit >/dev/null`

   Expected: the same two warnings as step 3: the warnings are the scan's, filtered or not.

9. `./skill-atlas scan fixture --filter -`, then `./skill-atlas scan fixture --filter`, then `--filter a --filter b`

   Expected: first `fixture · 5 skills`, every skill, as without `--filter`: no words to filter by. Then,
   twice, on stderr, exit code 1:
   `Usage: skill-atlas scan <GitHub URL | directory> [--filter <words>]`.

10. A directory with an unreadable subdirectory, such as another user's Docker volume:
   ```
   mkdir -p /tmp/qa-perm/.agents/skills/ok /tmp/qa-perm/private
   printf -- '---\nname: ok\ndescription: fine\n---\n' > /tmp/qa-perm/.agents/skills/ok/SKILL.md
   chmod 000 /tmp/qa-perm/private && ./skill-atlas scan /tmp/qa-perm; echo $?
   chmod 755 /tmp/qa-perm/private && rm -r /tmp/qa-perm
   ```
   Expected: `qa-perm · 1 skill`, `ok — fine`, its link, exit code 0, and on stderr
   `warning: private: cannot read this directory; skipped`. (As root every directory is readable: no warning.)

11. `git status --short`

   Expected: nothing new: the scan stored nothing.
