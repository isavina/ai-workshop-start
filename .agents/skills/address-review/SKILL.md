---
name: address-review
description: Address the review comments on a Skill Atlas pull request — check each one, fix it with a test, push, and reply in its thread. Use when asked to address, fix or answer a review, or given a pull request with comments.
---

# Address review

Every comment gets an answer: a fix, or a reason why not. Never resolve a thread; the reviewer does.

## 1. Read the review

```console
$ gh pr view <number> --json title,headRefName,baseRefName,mergeable,url
$ gh pr view <number> --json reviews,comments
$ gh api --paginate repos/<owner>/<repo>/pulls/<number>/comments --jq '.[] | {id, in_reply_to_id, path, line, user: .user.login, body}'
```

`--paginate`: without it only the first page (30) comes back, replies included.

Which threads wait for an answer depends on each thread's last comment, not on `in_reply_to_id`.
A thread answered in an earlier round still has its first comment without `in_reply_to_id`. A
reviewer's follow-up inside a thread has one. A thread waits when its last comment is not a reply of
ours:

```console
$ gh api graphql --paginate -F owner=<owner> -F repo=<repo> -F number=<number> -f query='
    query($owner: String!, $repo: String!, $number: Int!, $endCursor: String) {
      repository(owner: $owner, name: $repo) { pullRequest(number: $number) {
        reviewThreads(first: 100, after: $endCursor) {
          nodes { path line
            first: comments(first: 1) { nodes { databaseId } }
            last: comments(last: 1) { nodes { databaseId author { login } body } } }
          pageInfo { hasNextPage endCursor } } } } }' \
  --jq '.data.repository.pullRequest.reviewThreads.nodes[] | .first.nodes[0] as $f | .last.nodes[0] as $l
    | select($l.databaseId == $f.databaseId or $l.author.login != "<login>" or ($l.body | contains("<signature>") | not))
    | {id: $f.databaseId, path, line, last: $l.body}'
```

`id` is the comment to reply to. `<login>` is the account the replies are posted from. GraphQL gives
a bot's login without `[bot]`. `<signature>` is the part of our replies' signature that is the same on
every run and that the reviewer's comments do not contain, for example
`Name: Address Review Skill Runner / Run:`. Never the run link: it changes on every run, so a full
signature matches no earlier reply and every thread waits again. `Produced by Air Automations.` alone
is not enough when the review is signed with it too. `""` when we do not sign our replies. When the
review and this skill post from the same account, for example one bot running both, the signature is
the only way to tell our replies from the reviewer's comments. Each node is a whole thread, so a
`--jq` that runs once per page still sees every thread whole.

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
checked and why nothing changed.

## 6. Remove the label

Once every comment is answered (fixed and replied to, or replied to with why not) and the fixes are
pushed, remove the label the review added ([code-review](../code-review/SKILL.md)). In an automation,
where the platform pushes after the run, the fixes only need to be committed: removing the label is
the run's last action.

```console
$ gh pr edit <number> --remove-label review-suggested
```

The push starts the review again; it adds the label back if anything is left. A comment still open,
waiting on the reviewer's answer → the label stays.

## Report

Each comment with its outcome (fixed, not changed, asked) and a link to the reply; what was pushed;
the checks' result (`gh pr checks <number>`); whether the label was removed. Anything not done is said.
