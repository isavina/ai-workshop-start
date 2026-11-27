# QA-2 GitHub repository

`./skill-atlas scan <GitHub URL>` against live GitHub: the default branch, a commit, the link
([spec/analysis.md](../spec/analysis.md), [spec/cli.md](../spec/cli.md)).

**Needs:** network; `GITHUB_TOKEN` for steps 3, 4 and 6.

1. `./skill-atlas scan github.com/JetBrains/koog/tree/709079e4a34d6c9234583352550e6a2b88a0bb85`

   Expected: exactly the text in
   [tests/recordings/JetBrains-koog-…​.txt](../tests/recordings/JetBrains-koog-709079e4a34d6c9234583352550e6a2b88a0bb85.txt),
   `JetBrains/koog · 2 skills` first; exit code 0. Check:
   `./skill-atlas scan … 2>&1 | diff - tests/recordings/JetBrains-koog-709079e4a34d6c9234583352550e6a2b88a0bb85.txt`
   prints nothing.

2. Open a link from step 1 in a browser, or `curl -sI <link> | head -1`.

   Expected: GitHub shows that `SKILL.md` (`HTTP/2 200`); the link has the full commit, not a branch.

3. `time ./skill-atlas scan https://github.com/JetBrains/intellij-community`, with `GITHUB_TOKEN`

   Expected: `JetBrains/intellij-community · N skills`, N > 0, every link
   `https://github.com/JetBrains/intellij-community/blob/<40-hex commit>/…/SKILL.md`; `real` under 5 s.

4. The same as 3 with `www.`, `http://` and a trailing `/`: `./skill-atlas scan http://www.github.com/JetBrains/intellij-community/`

   Expected: the same output as step 3.

5. `./skill-atlas scan github.com/JetBrains/koog/tree/develop`, a branch

   Expected: `JetBrains/koog · N skills`; links pinned to the branch's current commit, not to `develop`.

6. `./skill-atlas scan https://github.com/isavina/ai-workshop-start`, with `GITHUB_TOKEN`: a fork, which
   code search does not index

   Expected: `isavina/ai-workshop-start · N skills`, N > 0: the skills in `.agents/skills/` and in
   `fixture/`, found through the tree; not `0 skills`.
