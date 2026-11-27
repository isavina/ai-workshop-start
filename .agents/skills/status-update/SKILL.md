---
name: status-update
description: Post the status of this repository to Slack — the pull requests merged and the issues resolved since a time and date, plus what is in review or in progress, one mark per item, grouped by person. Use when asked for a status update, a digest of what was done, or what happened since a time.
---

# Status update

Who did what since a time, from GitHub, posted to **#is-test-air-bot** in the
**aiworkshopmunich2026.slack.com** workspace. Every line is checked against GitHub before it is
posted; nothing is guessed.

## 1. The time window

- **Since:** the time and date you were given ("since 09:30", "since yesterday 14:00"). None → the
  `until` of this skill's last post in the channel (step 4). No earlier post → 24 hours ago.
- **Until:** now.
- Times in **`Europe/Berlin`**, converted with that zone (`TZ=Europe/Berlin date`), never a fixed
  offset: it is CET (UTC+1) in winter and CEST (UTC+2) from late March to late October. The header
  shows the zone's abbreviation for the date (`date +%Z`): `27 Nov 2026, 09:30 – 12:30 CET`,
  `15 Jun 2026, 09:30 – 12:30 CEST`, or with both dates when the window crosses midnight:
  `26 Nov 2026, 14:00 – 27 Nov 2026, 12:30 CET`.

## 2. Collect, from GitHub

```console
$ gh pr list --state all --limit 200 --json number,title,author,state,isDraft,createdAt,updatedAt,mergedAt,closingIssuesReferences,url
$ gh issue list --state all --limit 200 --json number,title,author,state,stateReason,closedAt,updatedAt,labels,url
$ gh api repos/<owner>/<repo>/issues/<number>/events --jq '.[] | select(.event == "labeled" and .label.name == "Delegated to AI") | .actor.login'
```

**One mark per item**, and one item per piece of work: a pull request and the issue it closes are one
item, the pull request, with `closes #<issue>`.

| Mark | Item | When |
| --- | --- | --- |
| ✅ done | a pull request **merged** in the window | `mergedAt` in the window |
| ✅ done | an issue **closed as completed** in the window, by no pull request listed | `stateReason == "COMPLETED"`, `closedAt` in the window |
| 👀 in review | an **open** pull request, not a draft, created or updated in the window | |
| 🔄 in progress | an open **draft** pull request, or an open issue labelled `Delegated to AI` without an open pull request, updated in the window | |

Left out: issues closed as not planned, pull requests closed without merging, anything untouched in
the window.

**The person** of an item: the pull request's author, or the issue's author. Work by the Air app
belongs to whoever added `Delegated to AI` to its issue; that is the Air app too (the red agent's
bugs) → `@Air`. The Air app has several names: `app/jetbrains-air` as an author in `gh pr list`,
`jetbrains-air[bot]` or `jetbrains-air` as an actor in events; any of them is the Air app. People are
written by their GitHub login: `@isavina`.

## 3. Write it

```
Status · 27 Nov 2026, 09:30 – 12:30 CET
@isavina
✅ #20: Add a red-agent skill
✅ #18: Slack steps wait in the foreground
👀 #21: Cluster the skills by topic with claude -p, closes #19
@Air
👀 #27: Warn on a YAML alias bomb in front matter, closes #23
🔄 #22: Another site can read local SKILL.md files, delegated
```

- `#<number>: <title>`, the title shortened to what was done, then a few words when they help: `closes
  #19`, `asked in Slack`, `2 review rounds`. Each item a link: `<url|#20>`.
- Done first, then in review, then in progress; by number inside each. People by login, `@Air` last.
- Nothing in the window → one line: `Status · <window> · nothing merged or resolved`.

**Check every line** against GitHub right before posting: the number exists, the state and the time are
what the mark says, the person is right. A line that does not hold is dropped and said in the report.

## 4. Post it

With the token the environment has in `SLACK_BOT_TOKEN`; never print it or put it anywhere. The
window goes along as metadata, so the next run starts where this one ended:

```console
$ jq -n --arg text "$STATUS" --arg since "<since, ISO 8601>" --arg until "<until, ISO 8601>" \
    '{channel: "#is-test-air-bot", text: $text, unfurl_links: false,
      metadata: {event_type: "skill_atlas_status", event_payload: {since: $since, until: $until}}}' \
  | curl -s https://slack.com/api/chat.postMessage -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
      -H 'Content-Type: application/json; charset=utf-8' --data @- | jq '{ok, error, channel, ts}'
```

The last post's `until`, for step 1, before anything is posted. `conversations.history` takes only the
channel's ID (`#is-test-air-bot` → `channel_not_found`), so look the ID up by name first; the channel
is private, hence `private_channel` (scopes `channels:read`, `groups:read`). Keep each raw reply and
check `.ok` before reading it: a reply with `ok: false` has no `.channels` or `.messages`, and jq on it
prints nothing, which would look like "no channel" or "no earlier post". `conversations.list` pages
with `response_metadata.next_cursor` and may return fewer channels than `limit` when more exist, so
follow the cursor until the channel turns up or the cursor is empty:

```console
$ CHANNEL_ID= CURSOR= SLACK_ERROR=
$ while :; do
    R=$(curl -s -G https://slack.com/api/conversations.list -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
      --data-urlencode types=public_channel,private_channel --data-urlencode exclude_archived=true \
      --data-urlencode limit=1000 --data-urlencode cursor="$CURSOR")
    jq -e .ok <<<"$R" >/dev/null || { SLACK_ERROR="conversations.list: $(jq -r '.error // "no JSON reply"' <<<"$R")"; break; }
    CHANNEL_ID=$(jq -r '.channels[] | select(.name == "is-test-air-bot") | .id' <<<"$R")
    CURSOR=$(jq -r '.response_metadata.next_cursor // empty' <<<"$R")
    { [ -n "$CHANNEL_ID" ] || [ -z "$CURSOR" ]; } && break
  done
$ [ -n "$CHANNEL_ID" ] && {
    R=$(curl -s -G https://slack.com/api/conversations.history -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
      --data-urlencode channel="$CHANNEL_ID" --data-urlencode include_all_metadata=true --data-urlencode limit=200)
    jq -e .ok <<<"$R" >/dev/null || SLACK_ERROR="conversations.history: $(jq -r '.error // "no JSON reply"' <<<"$R")"
  }
$ [ -z "$SLACK_ERROR" ] && [ -n "$CHANNEL_ID" ] \
  && jq -r '[.messages[] | select(.metadata.event_type == "skill_atlas_status")][0].metadata.event_payload.until // empty' <<<"$R"
$ echo "${SLACK_ERROR:-ok}"
```

- Both calls succeeded and found the last post → its `until` is the since.
- Both succeeded and found nothing (no such channel on any page, or no earlier post) → 24 hours ago,
  and the report says which.
- `SLACK_ERROR` set → do not fall back silently and do not post: print the status instead, and say the
  `error` in the report (`not_in_channel`: invite the bot; `missing_scope`: the token needs
  `chat:write`, `channels:read` and `groups:read`, and `channels:history` or `groups:history` for a
  private channel).

The same for the post: `ok: false` → say the `error` in the report. No `SLACK_BOT_TOKEN` → print the
status instead of posting it, and say so.

## Report

The window, the post's link (`chat.getPermalink`) or why it was not posted, the number of items by
mark, and any line dropped by the check and why.
