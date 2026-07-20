/**
 * Tennis Bootcamp Voice Bridge — Cloudflare Worker
 *
 * Routes:
 *   POST /telegram        ← Telegram webhook (voice memos, text, button taps)
 *   POST /github/done     ← GitHub Actions callback when a voice-task PR is ready
 *   POST /vercel/deploy   ← Vercel deploy webhook (optional)
 *
 * Auth model: every inbound request from Telegram is checked against the
 * configured allowed chat ID. /github/done and /vercel/deploy are protected
 * by a shared secret in the URL path or Authorization header.
 *
 * See ops/plans/voice-pipeline.md for the full architecture.
 */

interface Env {
  // Telegram
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_ALLOWED_CHAT_ID: string;

  // GitHub
  GITHUB_PAT: string;
  GITHUB_REPO: string; // e.g. "theOricle/tennisbootcamp"

  // LLMs
  ANTHROPIC_API_KEY: string;

  // Cloudflare Workers AI binding (configured in wrangler.toml [ai])
  AI: Ai;

  // Self-reference (for GitHub callback URL)
  WORKER_BASE_URL: string;

  // Shared secret for inbound callbacks
  CALLBACK_SECRET: string;
}

interface TelegramUpdate {
  message?: {
    chat: { id: number };
    from: { id: number };
    voice?: { file_id: string; duration: number };
    text?: string;
    message_id: number;
  };
  callback_query?: {
    id: string;
    from: { id: number };
    message: { chat: { id: number }; message_id: number };
    data: string; // "merge:14" | "close:14" | "hold:14"
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// HARDCODED SAFETY BLOCKLIST — never let the AI touch these
// ──────────────────────────────────────────────────────────────────────────────
const BLOCKLIST_PATTERNS = [
  /\/api\/intake/i,
  /\.env(\.|$)/i,
  /\bsecret/i,
  /force[ -]push/i,
  /\brm -rf/i,
  /\bdrop table/i,
  /\btruncate/i,
  /\bdelete branch/i,
  /\.github\/workflows/i,
  /\.claude\/memory/i,
];

function isBlocked(text: string): { blocked: true; reason: string } | { blocked: false } {
  for (const re of BLOCKLIST_PATTERNS) {
    if (re.test(text)) {
      return { blocked: true, reason: `Refused — matches blocked pattern \`${re.source}\`. Edit it yourself if you really mean it.` };
    }
  }
  return { blocked: false };
}

// ──────────────────────────────────────────────────────────────────────────────
// MAIN ENTRYPOINT
// ──────────────────────────────────────────────────────────────────────────────
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (req.method !== "POST") return text(200, "OK — voice bridge alive");

    try {
      if (url.pathname === "/telegram") return await handleTelegram(req, env);
      if (url.pathname === `/github/done/${env.CALLBACK_SECRET}`) return await handleGithubDone(req, env);
      if (url.pathname === `/vercel/deploy/${env.CALLBACK_SECRET}`) return await handleVercelDeploy(req, env);
      return text(404, "not found");
    } catch (e: any) {
      console.error("bridge error:", e?.stack || e?.message || e);
      return text(500, "error");
    }
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// TELEGRAM
// ──────────────────────────────────────────────────────────────────────────────
async function handleTelegram(req: Request, env: Env): Promise<Response> {
  const update = (await req.json()) as TelegramUpdate;
  const allowedId = parseInt(env.TELEGRAM_ALLOWED_CHAT_ID, 10);

  if (update.callback_query) {
    if (update.callback_query.from.id !== allowedId) return text(200, "ok");
    return await handleCallback(update.callback_query, env);
  }

  if (update.message) {
    if (update.message.from.id !== allowedId) return text(200, "ok");
    return await handleMessage(update.message, env);
  }

  return text(200, "ok");
}

async function handleMessage(msg: NonNullable<TelegramUpdate["message"]>, env: Env): Promise<Response> {
  let userText: string;

  if (msg.voice) {
    await sendTelegram(msg.chat.id, "🎤 transcribing…", env);
    try {
      const audioBlob = await downloadTelegramFile(msg.voice.file_id, env);
      userText = await transcribeWithWhisper(audioBlob, env);
    } catch (e: any) {
      await sendTelegram(msg.chat.id, `🔴 transcription failed: ${e.message}`, env);
      return text(200, "ok");
    }
    await sendTelegram(msg.chat.id, `📝 _heard:_ "${escapeMarkdown(userText)}"`, env, { markdown: true });
  } else if (msg.text) {
    userText = msg.text.trim();
    if (userText.startsWith("/")) return await handleSlashCommand(userText, msg.chat.id, env);
  } else {
    return text(200, "ok");
  }

  // Safety: hard blocklist before involving Claude at all
  const block = isBlocked(userText);
  if (block.blocked) {
    await sendTelegram(msg.chat.id, `🚫 ${block.reason}`, env);
    return text(200, "ok");
  }

  // Ask Claude what to do
  const result = await callClaudeBrain(userText, env);

  if (result.kind === "dispatch") {
    const secondaryBlock = isBlocked(result.description);
    if (secondaryBlock.blocked) {
      await sendTelegram(msg.chat.id, `🚫 ${secondaryBlock.reason}`, env);
      return text(200, "ok");
    }
    await dispatchVoiceTask(result, env);
    await sendTelegram(
      msg.chat.id,
      `✅ Dispatched\n*Task:* ${escapeMarkdown(result.title)}\n*Branch:* \`${result.branch}\`\n*ETA:* 6–10 min`,
      env,
      { markdown: true },
    );
  } else if (result.kind === "reply") {
    await sendTelegram(msg.chat.id, result.text, env);
  } else if (result.kind === "refuse") {
    await sendTelegram(msg.chat.id, `🚫 ${result.reason}`, env);
  }

  return text(200, "ok");
}

async function handleCallback(cb: NonNullable<TelegramUpdate["callback_query"]>, env: Env): Promise<Response> {
  await answerCallbackQuery(cb.id, env);

  const [action, prNumberStr] = cb.data.split(":");
  const prNumber = parseInt(prNumberStr, 10);
  const chatId = cb.message.chat.id;
  const messageId = cb.message.message_id;

  if (action === "merge") {
    const ci = await prChecksStatus(prNumber, env);
    if (ci !== "success") {
      await sendTelegram(chatId, `🔴 PR #${prNumber}: CI is *${ci}*. Refusing to merge. Fix it first or merge manually.`, env, { markdown: true });
      return text(200, "ok");
    }
    try {
      await mergePR(prNumber, env);
      await editMessage(chatId, messageId, `✅ PR #${prNumber} merged. Vercel deploying…`, env);
    } catch (e: any) {
      await sendTelegram(chatId, `🔴 merge failed: ${e.message}`, env);
    }
  } else if (action === "close") {
    await closePR(prNumber, env);
    await editMessage(chatId, messageId, `❌ PR #${prNumber} closed.`, env);
  } else if (action === "hold") {
    await editMessage(chatId, messageId, `⏸ PR #${prNumber} on hold. Decide later.`, env);
  }

  return text(200, "ok");
}

async function handleSlashCommand(cmd: string, chatId: number, env: Env): Promise<Response> {
  if (cmd === "/start") {
    await sendTelegram(
      chatId,
      "👋 Tennis Bootcamp voice bot ready.\nSend a voice memo describing what you want changed and I'll open a PR.\nButtons on each PR: MERGE / CLOSE / HOLD.",
      env,
    );
  } else if (cmd === "/help") {
    await sendTelegram(
      chatId,
      "*Commands*\n`/start` — intro\n`/help` — this\n`/status` — open PRs\n\nOtherwise: voice memo or text. Voice is recommended.",
      env,
      { markdown: true },
    );
  } else if (cmd === "/status") {
    const prs = await listOpenPRs(env);
    if (prs.length === 0) {
      await sendTelegram(chatId, "No open PRs.", env);
    } else {
      const lines = prs.map((p: any) => `• #${p.number} — ${p.title} (\`${p.head.ref}\`)`).join("\n");
      await sendTelegram(chatId, `*Open PRs*\n${lines}`, env, { markdown: true });
    }
  } else {
    await sendTelegram(chatId, `Unknown command: \`${cmd}\``, env, { markdown: true });
  }
  return text(200, "ok");
}

// ──────────────────────────────────────────────────────────────────────────────
// CLAUDE BRAIN — decide if message is a task or chat
// ──────────────────────────────────────────────────────────────────────────────
type BrainResult =
  | { kind: "dispatch"; title: string; description: string; branch: string; complexity: "simple" | "medium" | "complex" }
  | { kind: "reply"; text: string }
  | { kind: "refuse"; reason: string };

async function callClaudeBrain(userText: string, env: Env): Promise<BrainResult> {
  const systemPrompt = `You are the brain of Sina's mobile voice bot for tennisbootcamp.ca.

Your job: classify the incoming message and respond with exactly ONE of the tools below.

Project context (read carefully — do not relitigate decisions in these notes):
- Repo: ${env.GITHUB_REPO} (Next.js 16, App Router, TypeScript, Tailwind, deployed to Vercel)
- Primary work happens on Sina's laptop in Claude Code. You are the MOBILE fallback for 2–5 tasks/day when he's away from the desk.
- Conversion flow: /intake → /api/intake → Google Sheets. NEVER modify the intake pipeline.
- Brand voice: premium, athletic, world-class coach. Not SaaS, not startup.
- Standing decisions are in .claude/memory/DECISIONS.md.

Tools:
1. dispatch_code_task — when the user is asking you to change code. Provide title (≤60 chars), description (the full task as Claude Code will see it; expand abbreviations and infer specifics), branch (kebab-case starting with "voice/"), complexity (simple = single file <50 LOC, medium = multi-file feature, complex = cross-cutting refactor).
2. reply_to_user — when the user is asking a question, having a conversation, or clarifying a previous task. Be terse.
3. refuse — when the request is dangerous, would touch protected files, or is ambiguous in a way that risks breaking things. Explain briefly.

Output: JSON only. No prose outside the JSON. Schema:
{ "tool": "dispatch_code_task" | "reply_to_user" | "refuse", ...args }

Refuse if the message asks to touch: /api/intake, .env*, secrets, .github/workflows, .claude/memory, or anything destructive (force push, rm -rf, drop, truncate).`;

  const body = {
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: systemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userText }],
  };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    return { kind: "reply", text: `🔴 Anthropic API error: ${res.status} ${errText.slice(0, 200)}` };
  }

  const data: any = await res.json();
  const raw = data.content?.[0]?.text || "";
  const parsed = extractJSON(raw);

  if (!parsed) {
    return { kind: "reply", text: `(brain returned unparseable output, treating as chat) ${raw.slice(0, 400)}` };
  }

  if (parsed.tool === "dispatch_code_task") {
    return {
      kind: "dispatch",
      title: String(parsed.title || "Untitled voice task").slice(0, 60),
      description: String(parsed.description || ""),
      branch: sanitizeBranch(String(parsed.branch || `voice/${Date.now()}`)),
      complexity: ["simple", "medium", "complex"].includes(parsed.complexity) ? parsed.complexity : "medium",
    };
  }
  if (parsed.tool === "reply_to_user") {
    return { kind: "reply", text: String(parsed.text || "(empty reply)") };
  }
  if (parsed.tool === "refuse") {
    return { kind: "refuse", reason: String(parsed.reason || "refused") };
  }
  return { kind: "reply", text: raw };
}

function extractJSON(s: string): any | null {
  // Tolerate fences / leading prose
  const match = s.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function sanitizeBranch(b: string): string {
  let out = b.toLowerCase().replace(/[^a-z0-9/_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (!out.startsWith("voice/")) out = `voice/${out}`;
  return out.slice(0, 80);
}

// ──────────────────────────────────────────────────────────────────────────────
// WHISPER
// ──────────────────────────────────────────────────────────────────────────────
async function downloadTelegramFile(fileId: string, env: Env): Promise<Blob> {
  const metaRes = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`);
  const meta: any = await metaRes.json();
  if (!meta.ok) throw new Error(`telegram getFile: ${JSON.stringify(meta)}`);
  const fileRes = await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${meta.result.file_path}`);
  if (!fileRes.ok) throw new Error(`telegram file download: ${fileRes.status}`);
  return await fileRes.blob();
}

async function transcribeWithWhisper(blob: Blob, env: Env): Promise<string> {
  // Cloudflare Workers AI Whisper model — same vendor as the Worker,
  // no extra API key needed, free tier covers light voice-memo use.
  const buffer = await blob.arrayBuffer();
  const audio = [...new Uint8Array(buffer)];

  const response = (await env.AI.run("@cf/openai/whisper", { audio })) as { text?: string };
  return String(response?.text || "").trim();
}

// ──────────────────────────────────────────────────────────────────────────────
// GITHUB
// ──────────────────────────────────────────────────────────────────────────────
async function dispatchVoiceTask(
  task: { title: string; description: string; branch: string; complexity: string },
  env: Env,
): Promise<void> {
  const url = `https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/voice-task.yml/dispatches`;
  const res = await fetch(url, {
    method: "POST",
    headers: githubHeaders(env),
    body: JSON.stringify({
      ref: "main",
      inputs: {
        title: task.title,
        description: task.description,
        branch: task.branch,
        complexity: task.complexity,
      },
    }),
  });
  if (!res.ok) throw new Error(`workflow_dispatch: ${res.status} ${await res.text()}`);
}

async function mergePR(prNumber: number, env: Env): Promise<void> {
  const url = `https://api.github.com/repos/${env.GITHUB_REPO}/pulls/${prNumber}/merge`;
  const res = await fetch(url, {
    method: "PUT",
    headers: githubHeaders(env),
    body: JSON.stringify({ merge_method: "squash" }),
  });
  if (!res.ok) throw new Error(`merge: ${res.status} ${await res.text()}`);
}

async function closePR(prNumber: number, env: Env): Promise<void> {
  const url = `https://api.github.com/repos/${env.GITHUB_REPO}/pulls/${prNumber}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: githubHeaders(env),
    body: JSON.stringify({ state: "closed" }),
  });
  if (!res.ok) throw new Error(`close: ${res.status} ${await res.text()}`);
}

async function prChecksStatus(prNumber: number, env: Env): Promise<"success" | "pending" | "failure" | "unknown"> {
  const prRes = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/pulls/${prNumber}`, { headers: githubHeaders(env) });
  if (!prRes.ok) return "unknown";
  const pr: any = await prRes.json();
  const sha = pr.head?.sha;
  if (!sha) return "unknown";

  const checksRes = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/commits/${sha}/check-runs`, { headers: githubHeaders(env) });
  if (!checksRes.ok) return "unknown";
  const data: any = await checksRes.json();
  const runs: any[] = data.check_runs || [];
  if (runs.length === 0) return "pending";

  if (runs.some((r) => r.status !== "completed")) return "pending";
  if (runs.some((r) => r.conclusion === "failure" || r.conclusion === "cancelled")) return "failure";
  return "success";
}

async function listOpenPRs(env: Env): Promise<any[]> {
  const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/pulls?state=open&per_page=20`, { headers: githubHeaders(env) });
  if (!res.ok) return [];
  return (await res.json()) as any[];
}

function githubHeaders(env: Env): Record<string, string> {
  return {
    Authorization: `Bearer ${env.GITHUB_PAT}`,
    "User-Agent": "tb-voice-bridge",
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// GITHUB ACTIONS CALLBACK
// ──────────────────────────────────────────────────────────────────────────────
async function handleGithubDone(req: Request, env: Env): Promise<Response> {
  const data: any = await req.json();
  const chatId = parseInt(env.TELEGRAM_ALLOWED_CHAT_ID, 10);

  if (data.status === "failure") {
    await sendTelegram(
      chatId,
      `🔴 *Voice task failed*\nTask: ${escapeMarkdown(data.title || "?")}\nBranch: \`${data.branch || "?"}\`\nStep: ${data.failed_step || "?"}\nLogs: ${data.run_url || ""}`,
      env,
      { markdown: true },
    );
    return text(200, "ok");
  }

  const lines = [
    `*PR #${data.pr_number}: ${escapeMarkdown(data.title)}*`,
    `Branch: \`${data.branch}\``,
    `${data.files_changed} files, +${data.lines_added}/-${data.lines_removed}`,
    `CI: ${data.ci_status === "success" ? "✅" : data.ci_status === "pending" ? "⏳" : "🔴"}`,
  ];
  if (data.preview_url) lines.push(`Preview: ${data.preview_url}`);
  lines.push(`PR: ${data.pr_url}`);

  await sendTelegram(chatId, lines.join("\n"), env, {
    markdown: true,
    keyboard: [
      [
        { text: "✅ MERGE", callback_data: `merge:${data.pr_number}` },
        { text: "❌ CLOSE", callback_data: `close:${data.pr_number}` },
        { text: "⏸ HOLD", callback_data: `hold:${data.pr_number}` },
      ],
    ],
  });

  return text(200, "ok");
}

// ──────────────────────────────────────────────────────────────────────────────
// VERCEL DEPLOY CALLBACK
// ──────────────────────────────────────────────────────────────────────────────
async function handleVercelDeploy(req: Request, env: Env): Promise<Response> {
  const data: any = await req.json();
  const chatId = parseInt(env.TELEGRAM_ALLOWED_CHAT_ID, 10);

  if (data.type === "deployment.succeeded" || data.type === "deployment-ready") {
    const url = data.payload?.deployment?.url || data.payload?.url;
    if (url && data.payload?.target === "production") {
      await sendTelegram(chatId, `🚀 Live: https://${url}`, env);
    }
  } else if (data.type === "deployment.error" || data.type === "deployment-error") {
    await sendTelegram(chatId, `🔴 Vercel deploy failed. Check the dashboard.`, env);
  }

  return text(200, "ok");
}

// ──────────────────────────────────────────────────────────────────────────────
// TELEGRAM HELPERS
// ──────────────────────────────────────────────────────────────────────────────
async function sendTelegram(
  chatId: number,
  textBody: string,
  env: Env,
  opts: { markdown?: boolean; keyboard?: any[][] } = {},
): Promise<void> {
  const body: any = { chat_id: chatId, text: textBody, disable_web_page_preview: true };
  if (opts.markdown) body.parse_mode = "Markdown";
  if (opts.keyboard) body.reply_markup = { inline_keyboard: opts.keyboard };
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function editMessage(chatId: number, messageId: number, textBody: string, env: Env): Promise<void> {
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text: textBody, parse_mode: "Markdown" }),
  });
}

async function answerCallbackQuery(callbackId: string, env: Env): Promise<void> {
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackId }),
  });
}

async function getTelegramFileUrl(fileId: string, env: Env): Promise<string> {
  const metaRes = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`);
  const meta: any = await metaRes.json();
  return `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${meta.result.file_path}`;
}

// ──────────────────────────────────────────────────────────────────────────────
// UTILITY
// ──────────────────────────────────────────────────────────────────────────────
function text(status: number, body: string): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/plain" } });
}

function escapeMarkdown(s: string): string {
  return s.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}
