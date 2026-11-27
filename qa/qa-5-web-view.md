# QA-5 Web view

`./skill-atlas serve`: the page, a scan, a skill, the address ([spec/web.md](../spec/web.md)).

**Needs:** a browser (steps marked **(browser)**); network for steps 6 and 14.

1. `./skill-atlas serve`

   Expected: `Skill Atlas at http://localhost:4173 · Ctrl+C to stop`; it keeps running.

2. **(browser)** Open http://localhost:4173

   Expected: the title `Skill Atlas`; a field with a **Scan** button; under it the hint: a GitHub URL
   with an example, `/tree/<name or hash>`, a directory, an organization needing `GITHUB_TOKEN`. No skills yet.

3. **(browser)** Type `<root>/fixture` into the field, press **Scan**

   Expected: `fixture · 5 skills`; the warnings for `release-checklist` and `plain`, as in
   [QA-1](qa-1-local-directory.md) step 3; the skills in the CLI's order, each with its name, *full*
   description and path. The first one is selected: its `SKILL.md` as it is, front matter included.

4. **(browser)** Click `commits`

   Expected: its `SKILL.md`, its path as a link, `also in .github/skills/commits/SKILL.md`. The address,
   percent-encoded, `<root>` too, with every `/` written `%2F` (`%2Fworkspaces%2F…`):
   `?repository=<root>%2Ffixture&skill=.claude%2Fskills%2Fcommits%2FSKILL.md`.

5. **(browser)** Reload the page

   Expected: the same scan, `commits` still selected.

6. **(browser)** Scan `github.com/JetBrains/koog/tree/709079e4a34d6c9234583352550e6a2b88a0bb85`

   Expected: `JetBrains/koog · 2 skills`, links into GitHub at that commit; while it scans, the page
   says `Scanning … N s` and the button is disabled.

7. **(browser)** Go **Back**, then **Back** again to the bare page

   Expected: first the fixture's scan again; then an empty page, nothing scanning, the field focused.

8. **(browser)** Scan `<root>/fixture` again; press `/`, type `use before`

   Expected: `/` puts the cursor in the filter field above the skills. At each key, without scanning
   again (no `Scanning…`): `fixture · 2 of 5 skills`, `build` and `code-style`; the words typed marked
   in their names and descriptions (`Use`, `before`). The address ends in `&q=use+before&skill=…`.

9. **(browser)** Reload the page, then scan `<root>/fixture` once more

   Expected: the same filtered list after the reload; the new scan keeps the filter, `2 of 5 skills`.

10. **(browser)** Type `c code` into the filter, then `deploy`, then press `Escape`

    Expected: `c code` → `fixture · 1 of 5 skills`, `code-style` with `code` marked whole, not only its
    `c`. `deploy` → an empty list, `No skill matches "deploy"`, no SKILL.md; the field stays. `Escape`
    clears the field: every skill again, `fixture · 5 skills`, no `&q=` in the address.

11. **(browser)** Look at the page, in light and then in dark mode (the system's setting)

    Expected: as the baselines in `tests/browser/screenshots/` show: the compass mark, `Skill Atlas` and
    its tagline; the field and **Scan** in one rounded box; the skills and the SKILL.md in two rounded
    panels, the filter field with its `/` key at the top of the skills; the selected skill tinted in the
    accent colour; marks highlighted; warnings with a dot; an error in a red box. Nothing overlaps or is
    cut off; dark mode is dark throughout.

12. **(browser)** Scan `/nope`

   Expected: `Not a GitHub URL or a readable directory: /nope`, as an error, on the page.

   Then paste 1,500 × 😀 (`node -e 'console.log("😀".repeat(1500))'`), press **Scan**, and reload the page

   Expected: `Not a GitHub URL or a readable directory: 😀😀…`, as an error, before and after the
   reload; after the reload, the field with the emoji in it. Never `Cannot reach the Skill Atlas server`.

   Then paste more than 1 MiB (`node -e 'console.log("x".repeat(1048576))'`), press **Scan**, and reload

   Expected: `Too long to be a repository: paste a GitHub URL or a directory`, as an error, the field
   with the input; the address is the bare `http://localhost:4173/`, and the reload gives the bare page:
   an empty field, no message. The same with more than 2 MB (`node -e 'console.log("x".repeat(2097252))'`). Each too-long
   **Scan** adds its own bare `/` to the history, so **Back** gives the bare page of the 1 MiB input;
   **Back** again, the emoji error; **Back** a third time, the `/nope` error.

   Then open `http://localhost:4173/?repository=` followed by more than 1 MiB of `x`

   Expected: the page, the field with the input, `Too long to be a repository: …` as an error; never a blank page.

13. **(browser)** Scan a repository whose `SKILL.md` has HTML, such as a local copy of `fixture` with
   `<img src=x onerror=alert(1)>` added to a description

   Expected: the text shown as it is; no image, no alert.

14. `curl -s -D - -o /dev/null http://localhost:4173/` and `curl -s 'http://localhost:4173/api/scan?repository=/nope' -w ' %{http_code}\n'`

    Then `curl -s 'http://localhost:4173/api/scan?repository=<root>/fixture&q=commit'`

    Expected: `HTTP/1.1 200 OK` with `Cache-Control: no-store`; `{"error":"Not a GitHub URL or a readable directory: /nope"} 400`.
    Then only `code-style` and `commits` in `skills`, with `"total":5`: the same filter as the CLI.

15. From another machine on the network, open `http://<this machine's address>:4173`

    Expected: it does not connect: the server listens on 127.0.0.1 only.
