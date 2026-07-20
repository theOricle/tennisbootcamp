# Two-Track Pipeline: Claude Code on laptop + Telegram on phone

Generated: 2026-05-10
Supersedes: live-voice-call design (kept as Phase 6+ expansion)

Goal: be productive on this project from anywhere. At the desk, use Claude Code with the Anthropic subscription (flat fee, near-unlimited throughput). On the go, record a Telegram voice memo, get a PR opened, tap MERGE when ready.

Decisions locked 2026-05-10:
- **Two-track architecture.** Subscription-priced Claude Code on the laptop is the *primary* interface (dozens of tasks/day for $20–100/mo). Telegram pipeline is the *mobile fallback* for 2–5 tasks/day when away from the desk.
- Both tracks push to the same repo (`theOricle/tennisbootcamp`) on feature branches; main is reached only via PR + explicit merge.
- Mobile pipeline is voice-memo-first (no live phone calls in v1).
- Mobile compute on GitHub Actions (fresh sandbox per task, free).
- **Telegram** replaces both Vapi (inbound voice) and Twilio (outbound SMS) — one free app handles voice in, transcription pickup, notifications back, and inline action buttons.
- AI commits to feature branch, opens PR, awaits one-tap confirmation before merge.

## Track 1 — laptop / Claude Code (primary)

Already installed and in use. No new setup needed beyond confirming the Anthropic subscription tier:

- **Pro (~$20/mo)** — ~45 messages per 5h rolling window. Covers ~10–20 tasks/day. Fine for solo-evening work.
- **Max 5x (~$100/mo)** — ~5× Pro's quota. ~50–100 tasks/day. Right tier if Tennis Bootcamp is a daily project.
- **Max 20x (~$200/mo)** — effectively unlimited. Only worth it if multiple projects are running in parallel.

How it stays coordinated with Track 2: same repo, same `.claude/memory/` files, same CI. A laptop session and a Telegram-dispatched session are interchangeable — both read PROGRESS.md / DECISIONS.md before changing code, both open PRs on feature branches. Sina can start something on the laptop, send a voice memo from his car to refine it, and pick it back up at the desk.

## Track 2 — Telegram pipeline (mobile fallback)

Detailed below. Budgeted for 2–5 tasks/day at ~$10–15/mo (API-priced, since Anthropic's subscription doesn't apply to headless API calls outside Claude Code).

---

## Architecture (one-page view)

```
Android Telegram app
  │  (hold mic button → speak 20s memo → release)
  ▼
Telegram cloud  ────────── webhook ──────────►  Cloudflare Worker (bridge)
                                                       │
                                                       │  download .ogg voice file
                                                       ▼
                                                OpenAI Whisper API
                                                  (transcribe)
                                                       │
                                                       ▼
                                          Anthropic API: Claude Sonnet 4.6
                                          (decide: code task vs chat,
                                           with prompt caching for memory files)
                                                       │
                                                       ├── if chat → reply via Telegram
                                                       │
                                                       └── if code task
                                                                │
                                                                ▼
                                                  GitHub workflow_dispatch
                                                                │
                                                                ▼
                                                  Ubuntu runner (free tier)
                                                  ├─ npm ci
                                                  ├─ Claude Code (or direct
                                                  │   API for trivial edits)
                                                  ├─ lint + typecheck
                                                  ├─ git push <branch>
                                                  └─ gh pr create
                                                                │
                                                                │ callback POST
                                                                ▼
                                                  Cloudflare Worker
                                                                │
                                                                ▼
                                                  Telegram bot sends:
                                                  "PR #14 ready ✓
                                                   3 files, 187 lines, CI ✓
                                                   Preview: <link>
                                                   [MERGE] [CLOSE] [HOLD]"
                                                                │
                                                                │ Sina taps a button
                                                                ▼
                                                  Worker → GitHub merge/close
                                                                │
                                                                ▼
                                                  Vercel auto-deploys
                                                                │
                                                                ▼
                                                  Telegram: "Live: <prod URL>"
```

Plain English: speak into Telegram → bot transcribes and dispatches → GitHub runs Claude Code → bot pings you with a button → tap MERGE → it's live. No phone calls, no laptop.

---

## Why Telegram (vs SMS, WhatsApp, email)

- Free, no per-message cost
- Native voice memo recording (hold the mic button — same gesture you already use)
- Public Bot API with webhooks (works in 5 minutes via @BotFather)
- Voice messages arrive as downloadable `.ogg` files
- Inline keyboard buttons mean MERGE / CLOSE / HOLD are one tap, not "reply MERGE"
- Notifications are rich: clickable links, code blocks, formatting
- Same chat works on Android, desktop, web, tablet — pick up wherever you are
- Restricting bot access to Sina's user ID is a one-line check

WhatsApp's Bot API requires a Business account and template-message approvals — not worth it for a single user. SMS via Twilio adds ~$0.0079/msg + a number rental. Email is slow and rich-formatted replies are awkward. Telegram is the clear win.

---

## Component-by-component

### 1. Android side

- Install Telegram (free)
- Pin the bot chat to the top
- That's it. No Tasker, no third-party app, no Android dev.

Optional: add a homescreen widget that opens the bot chat directly. Telegram supports per-chat shortcuts.

### 2. Telegram bot

- Created via @BotFather → instant bot token
- Webhook URL points at the Cloudflare Worker
- Restricted to Sina's Telegram user ID (any other user is silently ignored)
- Inline keyboards for MERGE / CLOSE / HOLD on every PR-ready message
- Bot username: e.g. `@tb_code_bot`

### 3. Bridge: Cloudflare Worker

A single Worker handles every webhook:

| Endpoint | Trigger | Action |
|----------|---------|--------|
| `POST /telegram` | Telegram webhook | If voice message → download → Whisper → Claude → either reply or dispatch_code_task. If callback_query (button tap) → call GitHub merge/close API. |
| `POST /github/done` | GitHub Action callback when PR is ready | Send Telegram message with PR summary + inline buttons |
| `POST /vercel/deploy` | Vercel deploy webhook (when main updates) | Send Telegram message: "Live: <url>" |

Lives at `https://tb-voice-bridge.<your>.workers.dev`. Free tier (100k requests/day) is ~1000× more than we'll use.

### 4. STT: OpenAI Whisper API

- $0.006 per minute of audio
- A 30-second voice memo = $0.003
- Lower error rate than Deepgram on noisy mobile recordings (your car is the worst case)
- One env var on the Worker: `OPENAI_API_KEY`

If cost becomes an issue at high volume, swap to **Deepgram** (~$0.0043/min batch) or self-host **Whisper Turbo** on a $4 Hetzner VPS for unlimited free transcription. Not worth it until 5000+ memos/month.

### 5. LLM brain: Claude Sonnet 4.6 with prompt caching

The Worker calls Anthropic with:
- A cached system block: full `CLAUDE.md` + `.claude/memory/PROGRESS.md` + `DECISIONS.md` + `OPEN_QUESTIONS.md` (~15k tokens, cached for 5 min, 90% cheaper on repeat hits)
- The transcript as the user message
- Tool definitions: `dispatch_code_task`, `reply_to_user`, `get_pr_status`, `merge_pr`, `close_pr`

Claude's job:
- Decide: is this a code task, a question, or a clarification on a previous task?
- If task: extract title + description + branch name, call `dispatch_code_task`
- If question / chat: answer via `reply_to_user`
- Refuse anything touching `/api/intake`, `.env*`, secrets, or hardcoded blocklist words

### 6. Compute: GitHub Actions

`.github/workflows/voice-task.yml` (already designed in the previous plan version — same file). Runs Claude Code on a fresh Ubuntu runner, opens a PR, posts back to the Worker.

`.github/workflows/voice-merge.yml` runs `gh pr merge <number> --squash --delete-branch`.

Both triggered via workflow_dispatch from the Worker.

### 7. Trivial-edit fast path (optimization)

For tasks where Claude judges "this is a single-file, <50 LOC change," the Worker skips Claude Code entirely and does a direct Anthropic API call: send the file content + edit instruction → get diff back → Worker commits + pushes. Saves ~90% of tokens and ~3 minutes of runner time on simple edits ("fix typo," "bump version," "rename variable").

### 8. Haiku routing for simple tasks

Claude classifies task complexity in the brain step. Simple → route runner to Claude Haiku 4.5 (3× cheaper than Sonnet, plenty for one-file changes). Complex → Sonnet. Saves another ~50% of token cost on the simple half.

---

## End-to-end example

```
[Sina, between coaching sessions, opens Telegram. Holds mic.]
   Sina (voice): "Add a testimonials section to the homepage between the
                  coaches grid and the events list. Three placeholder
                  testimonials with names, ratings, and a quote. Match
                  the brand brief — no SaaS gradients."
   [release mic, message sends]

[Within 5 seconds:]
   Bot: "Got it. Dispatching: 'Add testimonials section to homepage'.
        Branch: voice/homepage-testimonials. ETA 6 min."

[Sina puts phone away, runs a 1-on-1 lesson.]

[6 minutes later, Telegram notification:]
   Bot: "PR #15: Add testimonials section ✓
         2 files, 124 lines added, 0 removed
         CI: ✓ lint  ✓ typecheck  ✓ build
         Preview: tennisbootcamp-git-voice-homepage-testim.vercel.app
         [ MERGE ]  [ CLOSE ]  [ HOLD ]"

[Sina taps MERGE.]
   Bot: "Merged. Vercel deploying."

[~2 min later:]
   Bot: "Live: tennisbootcamp.ca ✓"
```

Total Sina time: ~30 seconds of speaking + one tap. Total cost: ~$0.05.

---

## Setup checklist (Phase 0 — prereqs, ~20 min, no code)

| # | Action | Where | Notes |
|---|--------|-------|-------|
| 1 | Create Telegram account if needed | Telegram app | Free. |
| 2 | Talk to @BotFather, run `/newbot` | Telegram | Get bot token. Save in 1Password. |
| 3 | Send any message to your new bot, then visit `https://api.telegram.org/bot<TOKEN>/getUpdates` | Browser | Find your `chat.id` → save it. The Worker will only respond to this ID. |
| 4 | Create Cloudflare account | cloudflare.com | Free. |
| 5 | Create a Workers project | Cloudflare Workers dashboard | One free Worker is enough. |
| 6 | Generate GitHub fine-grained PAT | github.com/settings/tokens | Repo: `theOricle/tennisbootcamp`. Permissions: `contents:write`, `pull-requests:write`, `actions:write`. |
| 7 | Confirm Anthropic + OpenAI API keys | console.anthropic.com / platform.openai.com | Need both. |
| 8 | Add Worker secrets | Cloudflare Worker dashboard | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_CHAT_ID`, `GITHUB_PAT`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` |
| 9 | Add GitHub repo secrets | repo Settings → Secrets | `ANTHROPIC_API_KEY`, `WORKER_CALLBACK_URL` |

---

## Phased rollout (~3 hours total, can be done in one evening)

### Phase 1 — Voice memo → transcript echo (45 min)
Goal: prove the Telegram→Worker→Whisper plumbing works before any GitHub piece exists.

- Create Telegram bot, set webhook to Worker
- Worker handles `POST /telegram` for voice messages: download file from Telegram, send to Whisper, reply with the transcript
- Test: send a voice memo, get the transcribed text back

If this works, the hardest plumbing is done.

### Phase 2 — Brain + GitHub dispatch (1 hour)
- Add Anthropic call to the Worker: transcript + cached system prompt + tools
- Add `dispatch_code_task` tool implementation that calls GitHub workflow_dispatch
- Add `.github/workflows/voice-task.yml` (Claude Code in runner, opens PR)
- Action's last step: `curl POST $WORKER_CALLBACK_URL/github/done` with PR data
- Worker `/github/done` handler: send Telegram message with PR summary + inline keyboard `[MERGE][CLOSE][HOLD]`
- Test with low-stakes task: "add a comment to README"
- Verify: PR appears in GitHub, Telegram message arrives with buttons

### Phase 3 — Button actions + merge workflow (45 min)
- Worker's `callback_query` handler (button taps) routes to:
  - MERGE → call `gh pr merge` via GitHub API directly (no separate workflow needed)
  - CLOSE → call `gh pr close` via GitHub API
  - HOLD → reply "OK, I'll leave it open. Ping me when you've decided."
- Add Vercel deploy webhook → Worker → Telegram "Live: <url>"
- Test: full round trip, voice memo to live deploy

### Phase 4 — Hardening + optimizations (30 min)
- Worker rejects any inbound message not from `TELEGRAM_ALLOWED_CHAT_ID`
- Hardcoded blocklist on dispatch: refuse if description matches `/api/intake`, `.env`, `secret`, `force push`, `rm -rf`, `drop`, `truncate`
- Prompt caching enabled on Anthropic system block (1 line of config)
- Haiku-vs-Sonnet routing in workflow based on task classification
- Daily 8am Telegram digest: "Yesterday: 4 PRs merged, 1 in HOLD."
- Quiet hours: between 10pm–7am, Telegram messages are sent silently (no notification sound) — Telegram supports this natively via `disable_notification: true`

---

## Cost model (realistic monthly)

### Combined (two-track) budget

| Component | Cost |
|---|---|
| Claude Pro (laptop, primary) | $20/mo |
| _OR_ Claude Max 5x (laptop, primary, heavy use) | $100/mo |
| Telegram pipeline (mobile fallback, ~3 tasks/day) | ~$10–15/mo |
| **Total (Pro + mobile)** | **~$30–35/mo** |
| **Total (Max 5x + mobile)** | **~$110–115/mo** |

### Mobile pipeline alone (Track 2) — honest per-task costs

A real-world task in the runner is ~$0.15–0.25 average (mix of trivial / Haiku / Sonnet, 70–80% cache effectiveness). Earlier estimates were too optimistic; this is closer to ground truth.

| Mobile-only volume | Tasks/month | Monthly cost |
|---|---|---|
| ~2 tasks/day | ~60 | ~$10–15 |
| ~5 tasks/day | ~150 | ~$25–35 |
| ~10 tasks/day | ~300 | ~$45–60 |

If mobile volume creeps above ~5/day, the cheaper move is to do that work at the desk on the subscription tier instead. The mobile pipeline is intentionally sized for "ship something while I'm away from the laptop," not as the main driver.

---

## Three risks + mitigations

1. **Voice memo misheard, AI dispatches the wrong thing.**
   *Mitigation:* the bot replies with its 1-sentence interpretation BEFORE dispatching. If wrong, you reply with another voice memo: "no, I meant X." The bot updates context and re-dispatches. The PR is on a feature branch — no production impact until you tap MERGE.

2. **Bad code reaches main because the diff summary was misleading.**
   *Mitigation:* the MERGE button in Telegram triggers a GitHub API call that re-checks `gh pr checks` server-side. If lint/typecheck/build fail, the merge is refused and the bot replies "CI failed, fix these first: ..." with the failed check names. You can never merge red CI.

3. **Bot token leaks → someone else can talk to it.**
   *Mitigation:* the Worker's first line of defense is `if (msg.from.id !== ALLOWED_CHAT_ID) return 200;` — silent ignore. Even with the bot token, only Sina's user ID can trigger anything. Combined with the dispatch blocklist, the blast radius of a stolen token is "someone can spam your bot, but nothing reaches your repo."

---

## What this design intentionally drops vs. live-call

- No real-time conversation. If you need to clarify mid-task, you send another voice memo and the bot adjusts. ~30s round trip vs instant.
- No AI calling you. You only get Telegram notifications. Bigger picture: you sleep better.
- No phone number to maintain.
- No Vapi or Twilio account.

If you ever want real-time voice for hard planning conversations or destructive ops, the live-call design (Vapi + outbound calls) becomes a Phase 6 expansion that lives alongside this one — same GitHub workflow, just a second input channel. Not building it now.

---

## Phase 5+ ideas (after MVP)

- **Voice memos with attached images:** Telegram supports photo + voice in one message. AI sees a screenshot of a Figma frame, reads the voice memo describing the change, dispatches the right code task. Useful for design-driven tweaks.
- **Push notifications for failed deploys:** Vercel webhook → Telegram "🔴 Deploy failed: <link to logs>".
- **Voice-driven Vercel env var management:** AI tool that updates Vercel project env vars via API. Solves the "env vars stuck on the other computer" problem in OPEN_QUESTIONS.md. Lets you fix it without leaving Telegram.
- **Voice-driven Figma annotations:** AI tool that POSTs to Figma's REST API to leave comments on frames.
- **Standup digest:** every morning at 8:30am, bot sends a single message — "Yesterday: 3 PRs merged. Today's open PRs: #15 (HOLD). Blocked items: GA4 ID, Calendly URL."
- **Conversation history search:** "What did we ship last week?" → bot searches commits + PR titles, summarizes.
- **Voice-driven content edits:** "Update the bootcamps program description to mention winter availability." → no code task, just a content file edit. Trivial-edit fast path handles this in <60s.

---

## Open questions before starting

1. Telegram bot username preference? Default: `@tb_code_bot`.
2. Daily 8am digest — yes, no, or different time?
3. Quiet hours — 10pm–7am as default? (Messages still arrive, just silenced.)
4. For the trivial-edit fast path: any file types you want to *exclude* from auto-edits? (Suggested defaults: `package.json`, `package-lock.json`, anything in `.github/`, anything in `.claude/memory/`.)
