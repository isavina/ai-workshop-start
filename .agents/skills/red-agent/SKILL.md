---
name: red-agent
description: Try to break the Skill Atlas web view on this machine and file a GitHub issue for each bug found — with the steps, what the spec expects, what happens, and a video — labelled "Delegated to AI" so the issue-to-pr automation fixes it. Use when asked to break, attack, red-team or hunt bugs in the web view.
---

# Red agent

Break the web view, then prove each break: a bug is filed only when it reproduces twice and a video
shows it. Find bugs; do not fix them. The code, the tests and `main` stay as they are.

**Only this machine.** Attack the server you start on `127.0.0.1` and directories you make in `/tmp`.
Never attack GitHub or anything else; scans of real repositories are fine, a flood of them is not
(`gh api rate_limit --jq .resources.core.remaining` before and after). Never show the token: not in a
page, a video, an issue or a log.

## 1. Set up

```console
$ npm ci
$ export GITHUB_TOKEN=$(gh auth token)        # organizations; without it, their cases are skipped
$ ./skill-atlas serve 4175 & SERVER=$!         # stop it at the end: kill $SERVER
$ git rev-parse --short HEAD                   # the commit under attack, for every issue
$ E=${AIR_ARTIFACTS_DIR:-/tmp}/red-agent; mkdir -p "$E"
```

The browser as in [qa, Set up](../qa/SKILL.md#2-set-up), outside the repository: Playwright in
`/tmp/qa-browser`, Chromium. No browser → stop and report it; a bug without a video is not filed.

## 2. Know what correct is

Read [spec/web.md](../../../spec/web.md) and [spec/cli.md](../../../spec/cli.md#filter). A **bug** is:
the page or the API differs from the spec; a crash, a hang, a blank page, a stack trace; a scan that
never ends or shows another scan's result; a security hole (script from a SKILL.md runs, a file
outside the scanned directory is read, the server answers off this machine). Not a bug: what the spec
allows, a matter of taste, a slow GitHub. Those go into the report, not into issues.

## 3. Attack

Cover each area; for each, try the edges, not the happy path:

| Area | Try |
| --- | --- |
| The field | empty, spaces, 10,000 characters, Unicode and emoji, `github.com/a/b/tree/` with no ref, a ref with `/` and `#`, `..`, `~`, a file instead of a directory, a URL with `?`/`#` |
| Hostile skills | a directory in `/tmp` whose SKILL.md has `<img src=x onerror=alert(1)>`, `</pre><script>`, a `javascript:` link, 5 MB of text, binary bytes, a name of 1,000 characters, front matter that is not YAML |
| The filter | regex characters `.* ( [ \`, quotes, `%`, only separators `- _ /`, very long, words that match nothing, typing fast |
| The address | hand-edited `?repository=`, `&skill=` pointing nowhere or at `../../etc/passwd`, `&q=` with `%00` or broken `%`-encoding, parameters twice |
| Timing | scan, then another before it ends; back and forward during a scan; reload mid-scan; double-click submit; `/` and `Escape` while scanning |
| Organizations | without a token, an unknown owner, a user instead of an organization, one with no public repositories |
| The API | `POST`, no `repository`, `repository` twice, a huge one, `curl` with `Origin:` from another site |

Drive the page with Playwright as a person would; check what is visible (`#status`, `#warnings li`,
`#skills .name`, `#skill pre`, `page.url()`), and listen for `page.on('dialog')`, `page.on('pageerror')`
and `page.on('console')`. Use `curl` for the API.

## 4. Prove each bug

1. **Reproduce** it from a fresh page, twice. Once only → flaky: report it, do not file it.
2. **Shorten** the steps to the fewest that still break it.
3. **Record** them in a new browser context, so the video starts at the first step:

   ```js
   const context = await browser.newContext({ recordVideo: { dir: E, size: { width: 1280, height: 800 } } });
   const page = await context.newPage();
   // … the steps, with a pause of a second at the moment it breaks …
   await context.close();                       // writes the video
   const video = await page.video().path();     // .webm; under 10 MB, or record fewer steps
   ```

4. **Look for it**: the same bug may be filed already, open or closed:

   ```console
   $ gh issue list --state all --search '"red-agent:key=<key>" in:body' --json number,state,title
   ```

   `<key>` names the bug in a few words, `filter-regex-crash`: the same bug keeps its key. Found →
   do not file it again; add a comment if it is closed but back.

## 5. File it

Upload the video next to the code, on a branch of its own (no `git push`; never to `main`):

```console
$ gh api repos/<owner>/<repo>/git/ref/heads/red-agent-evidence --silent 2>/dev/null || \
    gh api -X POST repos/<owner>/<repo>/git/refs -f ref=refs/heads/red-agent-evidence -f sha=$(gh api repos/<owner>/<repo>/commits/main --jq .sha)
$ base64 < "$video" | tr -d '\n' > /tmp/video.b64
$ gh api -X PUT repos/<owner>/<repo>/contents/red-agent/<key>.webm -f branch=red-agent-evidence \
    -f message="Red agent: video of <key>" -F content=@/tmp/video.b64 --jq .content.html_url
```

Then one issue, labelled `bug` and `Delegated to AI` (the label starts
[issue-to-pr](../issue-to-pr/SKILL.md)):

```console
$ gh issue create --title "Web view: <what breaks> when <what you do>" --label bug --label "Delegated to AI" --body-file <file>
```

```markdown
<What breaks, in one sentence.>

**Steps**, at <commit>, `./skill-atlas serve` with `GITHUB_TOKEN` <set / not set>:
1. Open http://localhost:4173/…
2. …

**Expected:** <what spec/web.md says, quoted, with the line: `spec/web.md` "…">
**Actual:** <what the page shows: the text, the console error, the dialog>
**Video:** <html_url of the upload>
**Severity:** <security / broken / wrong / cosmetic>, because <who it hurts and how>

**Done when:** a test that fails now and passes after the fix (an integration test, or a browser test
in `tests/browser/`), and the steps above no longer break it.

<!-- red-agent:key=<key> -->
```

At most **five** issues a run, the most severe first: each one starts an automation. The rest go into
the report, to file next time.

## Report

Each area attacked and what was tried; each bug with its issue's link, or why it was not filed
(flaky, already filed, over five); what looked odd but is allowed by the spec. Then the requests left
of the rate limit, and that the server is stopped and `git status --short` is clean.
