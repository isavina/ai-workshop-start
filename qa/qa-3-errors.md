# QA-3 Errors

What the user can fix gets a clear message, no stack trace, exit code 1
([spec/analysis.md](../spec/analysis.md#details)). Check the exit code with `echo $?` after each step.

**Needs:** network for steps 3–7.

| # | Step | Expected (stderr), exit code |
| --- | --- | --- |
| 1 | `./skill-atlas` | the usage, `Usage: skill-atlas <command>` with `scan`, `serve`, `help`; 0 |
| 2 | `./skill-atlas scan /nope` | `Not a GitHub URL or a readable directory: /nope`; 1 |
| 3 | `./skill-atlas scan github.com/JetBrains/no-such-repo-xyz` | `Repository not found: https://github.com/JetBrains/no-such-repo-xyz`; 1 |
| 4 | `./skill-atlas scan github.com/JetBrains/koog/tree/no-such-branch-xyz` | `Branch, tag or commit not found in https://github.com/JetBrains/koog: no-such-branch-xyz`; 1 |
| 5 | `./skill-atlas scan github.com/no-such-owner-xyz-123` | `Organization or user not found: https://github.com/no-such-owner-xyz-123`; 1 |
| 6 | `GITHUB_TOKEN=bad ./skill-atlas scan github.com/JetBrains/koog` | `GitHub rejected the token in GITHUB_TOKEN`; 1 |
| 7 | Without a token, `./skill-atlas scan github.com/JetBrains/koog` again and again until GitHub's 60 requests an hour run out | first the skills; then `GitHub rate limit reached; set GITHUB_TOKEN`; 1 |
| 8 | Disconnect the network, or `NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:9 ./skill-atlas scan github.com/JetBrains/koog` | `Cannot reach GitHub: …`; 1 |
| 9 | `./skill-atlas serve abc` | `Usage: skill-atlas serve [port]`; 1 |
| 10 | `./skill-atlas serve 4180` in one terminal, the same in another | the second: `Port 4180 is in use; try skill-atlas serve <port>`; 1 |

In none of them: a stack trace, `at …` lines, or `Unexpected error`.
