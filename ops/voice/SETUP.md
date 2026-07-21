# Telegram Voice Pipeline — Setup Guide

This walks through standing up the mobile fallback channel described in
`ops/plans/voice-pipeline.md`. Once done, sending a voice memo (or text) to
your Telegram bot opens a PR on `theOricle/tennisbootcamp`, and you can tap
`[MERGE] [CLOSE] [HOLD]` from your phone.

Estimated time: ~90 minutes for first run-through, ~10 minutes for re-deploy.

---

## 0. Prereqs

You need accounts (most free) on:

- [Telegram](https://telegram.org) — already have it on your phone
- [Cloudflare](https://cloudflare.com) — free tier
- [GitHub](https://github.com) — already have for `theOricle/tennisbootcamp`
- [Anthropic Console](https://console.anthropic.com) — already have an API key
- [OpenAI Platform](https://platform.openai.com) — needed for Whisper (transcription)

Local tools:

- Node 20+
- `npm` or `pnpm`
- Cloudflare Wrangler CLI (`npm i -g wrangler`)

---

## 1. Create the Telegram bot (5 min)

1. In Telegram, message [@BotFather](https://t.me/BotFather).
2. Send `/newbot`. Pick a name (`Tennis Bootcamp Bot`) and username
   (`tb_code_bot` or similar — must end in `bot`).
3. BotFather replies with a token like `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`.
   Save this somewhere safe (1Password). This is your `TELEGRAM_BOT_TOKEN`.
4. Send `/start` to your new bot from your own Telegram account.
5. In a browser, hit:
   ```
   https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates
   ```
   Look for `"chat":{"id":NNNNNNNN,...}`. That number is your
   `TELEGRAM_ALLOWED_CHAT_ID`. Save it.

**Optional but recommended:** in BotFather, run `/setprivacy` → choose
`Disable`. This lets the bot see all messages in private chats with you (which
is what we want).

---

## 2. Create a Cloudflare Worker (10 min)

1. Sign in to [Cloudflare](https://dash.cloudflare.com).
2. From your local machine:
   ```bash
   cd ops/voice/bridge
   npm install
   npx wrangler login
   ```
3. Edit `wrangler.toml`:
   - Update `WORKER_BASE_URL` to your Workers subdomain once you know it
     (you'll see it after first deploy).
4. Set secrets:
   ```bash
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   npx wrangler secret put TELEGRAM_ALLOWED_CHAT_ID
   npx wrangler secret put GITHUB_PAT
   npx wrangler secret put ANTHROPIC_API_KEY
   npx wrangler secret put OPENAI_API_KEY
   npx wrangler secret put CALLBACK_SECRET    # random 32-char string
   ```
   Generate `CALLBACK_SECRET` with:
   ```bash
   openssl rand -hex 16
   ```
5. Deploy:
   ```bash
   npx wrangler deploy
   ```
   Wrangler prints a URL like `https://tb-voice-bridge.<subdomain>.workers.dev`.
   Save this — it's your `WORKER_BASE_URL`.
6. Update `wrangler.toml`'s `WORKER_BASE_URL` to match, then re-deploy.

---

## 3. Generate the GitHub Personal Access Token (5 min)

1. Go to [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new).
2. Token type: **Fine-grained**.
3. Resource owner: `theOricle`.
4. Repository access: **Only select repositories** → pick `tennisbootcamp`.
5. Permissions (Repository):
   - **Actions:** Read and Write
   - **Contents:** Read and Write
   - **Pull requests:** Read and Write
   - **Metadata:** Read (auto-granted)
6. Expiration: 90 days (set a calendar reminder to rotate).
7. Generate and copy the token. Save in 1Password.
8. Run `npx wrangler secret put GITHUB_PAT` and paste it in.

---

## 4. Add GitHub repo secrets (5 min)

In the repo, go to **Settings → Secrets and variables → Actions**.

Add:

| Name | Value |
|---|---|
| `ANTHROPIC_API_KEY` | your Anthropic API key |
| `WORKER_CALLBACK_URL` | the `https://tb-voice-bridge.<subdomain>.workers.dev` URL from step 2 |
| `CALLBACK_SECRET` | the same random hex string you used as a Worker secret |

The default `GITHUB_TOKEN` is provided automatically — no need to add it.

---

## 5. Register the Telegram webhook (1 min)

Tell Telegram where to send updates:

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://tb-voice-bridge.<subdomain>.workers.dev/telegram","allowed_updates":["message","callback_query"]}'
```

Verify with:

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"
```

You should see your Worker URL and `"pending_update_count":0`.

---

## 6. Smoke test — Phase 1 (5 min)

In Telegram, send `/start` to your bot. You should get the welcome message.

Send `/status`. You should get either "No open PRs" or a list.

Send a text message: `"add a test comment to README saying voice pipeline live"`.
You should see:
- 📝 the brain's interpretation
- ✅ "Dispatched" with the branch name and ETA

Watch the GitHub Actions tab — a "Voice Task" run should appear within ~30s
and finish in ~5–8 min. Then a Telegram message arrives with:

```
PR #N: Add voice pipeline comment to README
Branch: voice/readme-voice-pipeline-note
1 files, +2/-0
CI: ⏳
PR: https://github.com/theOricle/tennisbootcamp/pull/N

[ ✅ MERGE ]  [ ❌ CLOSE ]  [ ⏸ HOLD ]
```

Tap **MERGE**. The message updates to "✅ PR #N merged. Vercel deploying…".
About 2 minutes later (if Vercel webhook is wired — Phase 4), you get
"🚀 Live: https://…".

---

## 7. Voice memo — Phase 2 (1 min)

Open the bot chat in Telegram. Hold the mic button at the bottom right, speak
your task ("add a placeholder section for testimonials below coaches with three
sample cards"), release. The flow is identical to a text message, just with
transcription at the top.

---

## 8. Vercel deploy webhook (optional — Phase 4)

So the bot can tell you when the production site is live after a merge:

1. In Vercel, project **Settings → Webhooks → Add**.
2. URL: `https://tb-voice-bridge.<subdomain>.workers.dev/vercel/deploy/<CALLBACK_SECRET>`
3. Events: `deployment.succeeded`, `deployment.error`.
4. Save.

After the next production deploy, the bot will message you "🚀 Live: …".

---

## 9. Troubleshooting

**Bot doesn't reply to messages.**
- Check `getWebhookInfo` — `last_error_message` will tell you if Telegram is
  failing to deliver to the Worker.
- `npx wrangler tail` in `ops/voice/bridge` streams Worker logs live.

**Workflow dispatches but Claude Code does nothing.**
- Check the Action run logs. Common cause: `ANTHROPIC_API_KEY` not set or
  invalid in repo Secrets.

**MERGE button does nothing.**
- The Worker's `prChecksStatus` will refuse to merge if CI is pending or red.
  Wait for CI (lint + typecheck) to finish, then tap MERGE again.

**Transcription comes out garbled.**
- Whisper handles accents and English well but can stumble on technical jargon
  ("Tailwind" sometimes becomes "Tailwind" or "tail wind"). Just send the
  message again, more slowly.

**`wrangler deploy` errors with "nodejs_compat" warning.**
- Ensure `compatibility_flags = ["nodejs_compat"]` is in `wrangler.toml` and
  `compatibility_date` is recent.

---

## 10. Daily operation

- Voice memo or text message → 5–10 min later → buttons in Telegram.
- Tap MERGE or CLOSE on each PR. HOLD leaves it open for later.
- `/status` lists open PRs.
- Anything destructive or that mentions `/api/intake`, `.env`, secrets, or
  `.github/workflows/` is auto-refused by the Worker + the workflow as a
  second-layer check.

You can also dispatch from your laptop's Claude Code if a voice round-trip
feels heavy — that's Track 1 in `ops/plans/voice-pipeline.md`. The two
tracks share the same repo and CI, so you can mix them freely.

---

## 11. Rotating credentials

Every 90 days:

1. Generate a new GitHub PAT (step 3).
2. `npx wrangler secret put GITHUB_PAT` with the new value.
3. Revoke the old PAT in GitHub settings.

Other secrets (Anthropic, OpenAI, Telegram, Cloudflare) rotate only on
suspicion of compromise. Telegram bot tokens can be re-rolled in BotFather via
`/revoke`.
