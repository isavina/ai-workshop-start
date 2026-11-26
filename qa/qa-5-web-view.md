# QA-5 Web view

`./skill-atlas serve`: the page, a scan, a skill, the address ([spec/web.md](../spec/web.md)).

**Needs:** a browser (steps marked **(browser)**); network for steps 6 and 10.

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

   Expected: its `SKILL.md`, its path as a link, `also in .github/skills/commits/SKILL.md`. The address:
   `?repository=<root>/fixture&skill=.claude/skills/commits/SKILL.md`.

5. **(browser)** Reload the page

   Expected: the same scan, `commits` still selected.

6. **(browser)** Scan `github.com/JetBrains/koog/tree/709079e4a34d6c9234583352550e6a2b88a0bb85`

   Expected: `JetBrains/koog · 2 skills`, links into GitHub at that commit; while it scans, the page
   says `Scanning … N s` and the button is disabled.

7. **(browser)** Go **Back**, then **Back** again to the bare page

   Expected: first the fixture's scan again; then an empty page, nothing scanning, the field focused.

8. **(browser)** Scan `/nope`

   Expected: `Not a GitHub URL or a readable directory: /nope`, as an error, on the page.

9. **(browser)** Scan a repository whose `SKILL.md` has HTML, such as a local copy of `fixture` with
   `<img src=x onerror=alert(1)>` added to a description

   Expected: the text shown as it is; no image, no alert.

10. `curl -sI http://localhost:4173/` and `curl -s 'http://localhost:4173/api/scan?repository=/nope' -w ' %{http_code}\n'`

    Expected: `Cache-Control: no-store`; `{"error":"Not a GitHub URL or a readable directory: /nope"} 400`.

11. From another machine on the network, open `http://<this machine's address>:4173`

    Expected: it does not connect: the server listens on 127.0.0.1 only.
