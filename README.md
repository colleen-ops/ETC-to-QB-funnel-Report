# Getty Weekly Funnel Report

Pulls EnTrance + QuickBase + Close, builds the four canvas tables, posts to
`#getty-daily-pulse`. Runs on a GitHub Actions cron — no laptop, no server,
no MCP.

## Setup

**1. Push to a private repo.**

**2. Settings → Secrets and variables → Actions → New repository secret:**

| Secret | Where to get it |
|---|---|
| `ENTRANCE_EMAIL` | your EnTrance login |
| `ENTRANCE_PASSWORD` | your EnTrance password |
| `ENTRANCE_WORKSPACE_ID` | optional — auto-detected at login |
| `QB_USER_TOKEN` | QuickBase → My Preferences → Manage User Tokens |
| `CLOSE_API_KEY` | Close → Settings → API Keys |
| `SLACK_BOT_TOKEN` | Slack app, scopes below |

Slack bot scopes needed: `channels:read`, `chat:write`, `canvases:write`,
`im:write`.

**3. Test before trusting it:**
Actions → Getty Weekly Funnel → Run workflow → check **dry run**.
Prints the whole canvas to the job log. Posts nothing.

**4. Go live.** Cron is `0 11 * * 1` = Monday 7am ET. Change in
`.github/workflows/weekly-funnel.yml`.

## Files

| File | Job |
|---|---|
| `src/config.js` | **Every rule you'd want to change.** Field IDs, stage ranks, campaign codes, thresholds |
| `src/entrance.js` | Step 1 — campaigns, split→family rollup |
| `src/quickbase.js` | Step 2 — one paginated pull |
| `src/merchants.js` | Steps 2–3 — merchant list, best stage, funded logic, campaign credit |
| `src/close.js` | Step 4 — targeted lookups, lead source, touches |
| `src/render.js` | Step 5 — tables A–D |
| `src/slack.js` | Step 6 — canvas + post + Colleen error DM |
| `src/index.js` | Orchestrator |

## Rules baked in

- Counts **merchants** (distinct field 208), never deal rows. One list feeds
  every table.
- `Funded` is decided by **status**, never by a funded-date filter.
- Funded month = field 51, falling back to field 7, and the merchant gets
  flagged `no funded date`.
- Campaign credit only when the code matches **and** the campaign was sent on
  or before the funded month's end.
- Close wins when its Lead Source disagrees with QB field 18.
- Blank-source lookups capped at 30/run; overflow goes in the Colleen DM.
- Errors never reach the canvas or the channel.

## Security

Repo has zero secrets — all env vars. Keep it private and protect `main`:
anyone with write access can add a workflow that prints your secrets.
