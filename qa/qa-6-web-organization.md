# QA-6 Web view, organization

An organization or a user on the page ([spec/web.md](../spec/web.md#organization)).

**Needs:** a browser, network; `GITHUB_TOKEN` for steps 2–4.

1. `./skill-atlas serve` without `GITHUB_TOKEN`; **(browser)** scan `https://github.com/Kotlin`

   Expected, at once: an error that it scans every repository and needs `GITHUB_TOKEN`, restart
   `skill-atlas serve`. `curl -s 'http://localhost:4173/api/scan?repository=github.com/Kotlin' -w ' %{http_code}'`
   says the same with `400`.

2. `GITHUB_TOKEN=$(gh auth token) ./skill-atlas serve`; **(browser)** scan `https://github.com/Kotlin`

   Expected: `Scanning every repository of https://github.com/Kotlin… N s` counting up; then
   `Kotlin · N skills in M repositories`, the same N and M as [QA-4](qa-4-organization.md) step 1;
   skills grouped under each repository, by `owner/repo`, only repositories with skills.

3. **(browser)** Click a skill of `Kotlin/multik`

   Expected: its `SKILL.md` with `Kotlin/multik · <path>`; the address
   `?repository=https://github.com/Kotlin&skill=Kotlin/multik:<path>`; a reload shows it again.

4. **(browser)** Scan `https://github.com/Kotlin`, then at once `<root>/fixture`

   Expected: only the fixture's progress and result; the organization's never replaces it.
