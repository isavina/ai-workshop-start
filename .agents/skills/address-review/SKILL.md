---
name: address-review
description: Address the review comments on a Skill Atlas pull request — check each one, fix it with a test, push, and reply in its thread. Use when asked to address, fix or answer a review, or given a pull request with comments.
---

# Address review

Every comment gets an answer: a fix, or a reason why not, and only one. Never resolve a thread; the
reviewer does.

Started by the `review-suggested` label, in an automation: check first that the label is still on the
pull request. Gone → another run answered this review already; stop.

```console
$ gh pr view <number> --json labels --jq '[.labels[].name] | index("review-suggested")'   # null → stop
```

## 1. Read the review

```console
$ gh pr view <number> --json title,headRefName,baseRefName,mergeable,url
$ gh pr view <number> --json reviews,comments
$ gh api --paginate repos/<owner>/<repo>/pulls/<number>/comments --jq '.[] | {id, in_reply_to_id, path, line, user: .user.login, body}'
```

`--paginate`: without it only the first page (30) comes back, replies included.

Which threads wait for an answer is told by the hidden markers [code-review](../code-review/SKILL.md#in-the-review-loop)
puts on each comment, not by its author: the review and the answers may post from the same account.
A thread waits when its last comment is not an answer, that is, has no `skill-atlas:reply` marker:
a finding, a follow-up, or a person's comment. Answers from before the markers are signed
`Name: Address Review Skill Runner / Run:` instead; they count as answers too.

```console
$ gh api graphql --paginate -F owner=<owner> -F repo=<repo> -F number=<number> -f query='
    query($owner: String!, $repo: String!, $number: Int!, $endCursor: String) {
      repository(owner: $owner, name: $repo) { pullRequest(number: $number) {
        reviewThreads(first: 100, after: $endCursor) {
          nodes { path line isResolved
            last: comments(last: 1) { nodes { databaseId body } } }
          pageInfo { hasNextPage endCursor } } } } }' \
  --jq '.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved | not) | .last.nodes[0] as $l
    | select($l.body | (contains("skill-atlas:reply") or contains("Name: Address Review Skill Runner / Run:")) | not)
    | {id: $l.databaseId, path, line, last: $l.body}'
```

`id` is the comment to answer. Each node is a whole thread, so a `--jq` that runs once per page still
sees every thread whole. A resolved thread needs nothing.

Then check out the pull request's branch and compare it with the remote:

```console
$ git fetch origin && git switch <headRefName>
$ git merge --ff-only origin/<headRefName>         # catch up if the local branch is behind
$ git log --oneline origin/<headRefName>..HEAD    # local commits a push would add too
```

If the fast-forward fails, the local and remote branches have diverged: stop and report it.

## 2. Check each comment

Before changing anything, find out whether the comment is right: reproduce the failure it describes,
read the code it points at, check its claim about GitHub against the live API.

- **Right** → fix it.
- **Wrong** → no change; the reply shows why (what you ran, what it printed).
- **Unclear, or against the spec** → ask the reviewer in the thread, or ask the user; do not guess.

Fix what the comment asks, nothing more. A bot's review is checked the same way as a person's.

## 3. Fix

For each comment, as in [issue-to-pr](../issue-to-pr/SKILL.md):

1. A behaviour change → `spec/` first.
2. A test that fails without the fix: run it with the fix taken out and see it fail.
3. The fix, then `npm test` and `npm run typecheck`.

Then review the change with [code-review](../code-review/SKILL.md).

## 4. Commit and push

One commit for the review, the subject `Address review of #<number>: <what>`, the body one line a comment.

Push only when the user asked for it, and say first what the push adds: the review commit and any local
commit from step 1. In an automation that pushes to the pull request's branch, the platform pushes the
commit when the run ends: do not push yourself. On a branch already reviewed, never rebase or force-push; for conflicts with the
base, merge it in:

```console
$ git merge origin/<baseRefName>      # resolve, npm test, commit
$ git push origin <headRefName>
```

## 5. Reply in each thread

```console
$ gh api repos/<owner>/<repo>/pulls/<number>/comments/<id>/replies -f body='<reply>'
$ gh pr comment <number> --body '<reply>'                      # a comment outside the code
```

A reply says the commit, what changed, and how it was checked: `Fixed in <sha>: <change>. <The test
that fails without it / the command and what it prints>.` For a comment that was wrong: what was
checked and why nothing changed. Its last line is the marker of the comment it answers:

```
<!-- skill-atlas:reply to=<id> -->
```

Right before each reply, read the thread again: a `skill-atlas:reply to=<id>` already there → it is
answered; do not post another.

## 6. Remove the label

Once every comment is answered (fixed and replied to, or replied to with why not) and the fixes are
pushed, remove the label the review added ([code-review](../code-review/SKILL.md)). In an automation,
where the platform pushes after the run, the fixes only need to be committed: removing the label is
the run's last action.

```console
$ gh pr edit <number> --remove-label review-suggested
```

Remove it also when a reply asks the reviewer something: the question is in its thread, and the
label would only stop the next round from starting. The push starts the review again; it adds the label
back if anything is left. No commit → no push and no new review: the loop ends here.

## Report

Each comment with its outcome (fixed, not changed, asked) and a link to the reply; what was pushed;
the checks' result (`gh pr checks <number>`); whether the label was removed. Anything not done is said.
