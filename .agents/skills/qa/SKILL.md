---
name: qa
description: Run the manual test scripts in qa/ against the real Skill Atlas, the CLI in a terminal and the web view in a browser, and report each step as passed, failed or blocked with what was seen. Use instead of checking by hand, before a release, after a change to the CLI or the web view, or when asked to QA, smoke-test or "check it works for real".
---

# QA

The scripts in [qa/](../../../qa/README.md) are what a tester does by hand. Do them as the tester
would: the real app, live GitHub, a real browser; never the replayed tests, never a shortcut through
the code. Do not change the code or the scripts while running them: a run reports, it does not fix.

## 1. Choose the scripts

- Asked for all, or before a release → every script in `qa/`, in order.
- After a change → the scripts for what it touches (`git diff main...HEAD --stat`): `src/web.ts` →
  QA-5, QA-6; `src/cli.ts`, `src/commands.ts` → QA-1 to QA-4; `src/core/` → all of them.
- Asked for one → that one.

## 2. Set up

```console
$ npm ci
$ export GITHUB_TOKEN=$(gh auth token)     # QA-4, QA-6; without it those steps are blocked
$ gh api rate_limit --jq .resources.core.remaining   # an organization takes ~250 requests
$ mkdir -p "$AIR_ARTIFACTS_DIR/qa"          # or /tmp/qa: the evidence
```

**Browser**, for the steps marked **(browser)**: Playwright, installed outside the repository so
nothing is added to `package.json`:

```console
$ mkdir -p /tmp/qa-browser && cd /tmp/qa-browser && npm init -y && npm i playwright && npx playwright install --with-deps chromium
```

Drive the page with a script in `/tmp/qa-browser`: `chromium.launch()`, `page.goto(…)`,
`page.fill('input[name=repository]', …)`, `page.click('button[type=submit]')`, then read what a person
sees: `page.locator('#status').textContent()`, `#warnings li`, `#skills .name`, `#skill pre`,
`page.url()`, `page.goBack()`, `page.reload()`, and `page.on('dialog', …)` for an alert. Take a
screenshot for each step into the evidence directory. Use the visible text, not the server's JSON:
the JSON is what QA-5 step 10 checks.

No browser can be installed (no network for its download) → the browser steps are **blocked**; their
API part (the same scan through `curl …/api/scan`) can still be checked and said so. Never mark a
browser step passed from `curl` alone.

## 3. Run each step

For every step: run exactly what it says, from the repository root, and capture stdout, stderr and the
exit code separately:

```console
$ ./skill-atlas scan fixture >out.txt 2>err.txt; echo "exit $?"
```

Compare with **Expected** literally: the text, the order, stdout against stderr, the exit code, the
time where one is given (`time`). `…` matches anything; `<root>` is the repository's absolute path.

- Matches → **passed**.
- Differs → **failed**. Run it once more: a second, different result is **flaky**. Keep the output.
- Cannot be done here (no token, no browser, a second machine, a disconnected network, a rate limit
  you should not burn) → **blocked**, with the reason. A step that needs to be "disconnected" can be
  done with an unreachable proxy instead: `NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:9 ./skill-atlas scan …`.
- Expected disagrees with `spec/` → **failed**, and say which is wrong: the script is out of date, or the
  app is.

Stop every `serve` you started (`kill %1`) and check `git status --short` is clean when done.

## Report

A table, one row a step:

| Script | Step | Result | Seen |
| --- | --- | --- | --- |
| QA-1 | 1 | passed | |
| QA-3 | 7 | blocked | would use up the hour's 60 unauthenticated requests |

Then, the failures first: the command, what Expected says, what it printed (stdout, stderr, exit
code), the screenshot. Then the counts (passed, failed, flaky, blocked), what was skipped and why, and
where the evidence is. A step not run is never reported as passed.
