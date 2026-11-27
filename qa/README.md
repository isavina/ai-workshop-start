# Manual test scripts

What a tester checks by hand before a release: each script is the app run as a person runs it, the
CLI in a terminal, the web view in a browser, against real GitHub. The tests in `tests/` replay
recorded answers offline; these scripts catch what they cannot (live GitHub, a real browser, speed).

Run them with the [qa skill](../.agents/skills/qa/SKILL.md), or by hand: each step, then compare
what you see with **Expected**. A step that differs is a failure; write down what you saw.

| Script | What it covers | Needs |
| --- | --- | --- |
| [QA-1 Local directory](qa-1-local-directory.md) | `scan <directory>`: what is a skill, copies, warnings, `--filter` | — |
| [QA-2 GitHub repository](qa-2-github-repository.md) | `scan <GitHub URL>`: default branch, a commit, links, speed | network |
| [QA-3 Errors](qa-3-errors.md) | clear messages, exit code 1, rate limit, token | network |
| [QA-4 Organization](qa-4-organization.md) | `scan github.com/<owner>`, filtered too | network, `GITHUB_TOKEN` |
| [QA-5 Web view](qa-5-web-view.md) | `serve`: the page, a scan, a skill, the address, the filter, the look | browser |
| [QA-6 Web view, organization](qa-6-web-organization.md) | an owner on the page, filtered too | browser, `GITHUB_TOKEN` |
| [QA-7 Clusters](qa-7-cluster.md) | `--cluster` and the **Cluster** button, by `claude -p` | `claude`, browser |

## Before you start

```console
$ npm ci
$ export GITHUB_TOKEN=$(gh auth token)    # QA-4, QA-6 and some steps of QA-2, QA-3
```

Run from the repository root; `<root>` below is its absolute path.

## Format

Each script: an id, what it checks, what it needs, then numbered steps. Each step is an action and
what the tester should see. `…` in Expected stands for text that changes (a commit, a count) and is not
checked. A step marked **(browser)** needs a person or a driven browser; an HTTP client cannot see it.

A change in behaviour updates `spec/`, its tests and the script that shows it, in the same commit.
