# QA-7 Clusters

`--cluster` and the web view's **Cluster** button: the skills grouped by topic by a real `claude -p`
([spec/cli.md](../spec/cli.md#cluster), [spec/web.md](../spec/web.md#cluster)).

**Needs:** [Claude Code](https://code.claude.com) on `PATH`, logged in (`claude -p "hi"` answers); a browser
(steps marked **(browser)**); network and `GITHUB_TOKEN` for step 7. Claude picks the groups and their
labels: they change from run to run; the rules do not.

1. `./skill-atlas scan ./fixture --cluster; echo "exit $?"`

   Expected: in a few seconds, `fixture · 5 skills · K clusters`, K from 2 to 5. Then each cluster, a blank
   line before it, `<label> · N skills` and its skills as without `--cluster`, by name; the labels in
   alphabetical order, an `Other` cluster, if any, last. Every one of the 5 skills exactly once. The
   warnings of [QA-1](qa-1-local-directory.md) step 3 after them; `exit 0`.

2. `./skill-atlas scan ./fixture --filter "use before" --cluster`

   Expected: `fixture · 2 of 5 skills · 2 clusters`: only `build` and `code-style`, one in each.

3. `./skill-atlas scan ./fixture --filter gradle --cluster`

   Expected: at once, exactly what it prints without `--cluster`: `fixture · 1 of 5 skills`, `build`; no
   cluster, Claude not asked.

4. `SKILL_ATLAS_CLAUDE=tests/claude/topics ./skill-atlas scan ./fixture --cluster`

   Expected: the tests' fake Claude, the same every run: `fixture · 5 skills · 3 clusters`, then
   `Build and release · 2 skills` (`build`, `release-checklist`), `Code and commits · 2 skills`
   (`code-style`, `commits`, also in `.github/skills/commits/SKILL.md`), `Other · 1 skill` (`plain`).

5. `SKILL_ATLAS_CLAUDE=tests/claude/fails ./skill-atlas scan ./fixture --cluster; echo "exit $?"`, then the
   same with `SKILL_ATLAS_CLAUDE=/no/such/claude`

   Expected: no skills, `claude -p failed (exit code 1): Not logged in · Please run /login`, `exit 1`;
   then `Cannot run /no/such/claude: not found; install Claude Code, or set SKILL_ATLAS_CLAUDE to its command`, `exit 1`.

6. `./skill-atlas scan ./fixture --cluster --cluster`

   Expected: `Usage: skill-atlas scan <GitHub URL | directory> [--filter <words>] [--cluster]`, exit code 1.

7. `./skill-atlas scan github.com/JetBrains --cluster`

   Expected: after the scan and Claude, `JetBrains · N skills in M of S repositories · K clusters`, K from 2
   to 8; all the skills together, each `JetBrains/<repo> · <name> — …`, by name, then repository.

8. **(browser)** `./skill-atlas serve`; open http://localhost:4173, scan `<root>/fixture`

   Expected: next to the filter field, a **Cluster** button.

9. **(browser)** Press **Cluster**

   Expected: it says `Clustering…` and waits; then `fixture · 5 skills · K clusters`, the skills under
   their labels, each label with its count, `Other` last; the button stays pressed; no new scan. The
   address ends with `&cluster=1&skill=…`.

10. **(browser)** Reload the page

    Expected: scanned, then clustered again: the same layout; Claude may pick other labels.

11. **(browser)** Type `use` into the filter

    Expected: the clusters are gone: the plain, filtered list, `fixture · 3 of 5 skills`; no
    `cluster=1` in the address. Press **Cluster**: only those 3 skills are clustered. Press it again:
    the plain list.

12. **(browser)** Type `gradle` into the filter

    Expected: one skill shown; **Cluster** is disabled.

13. **(browser)** Stop the server; start it with `SKILL_ATLAS_CLAUDE=/no/such/claude ./skill-atlas serve`,
    scan `<root>/fixture`, press **Cluster**

    Expected: `Cannot run /no/such/claude: …` in the error colour; the plain list stays.
