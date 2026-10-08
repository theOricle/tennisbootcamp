// Run from project root: npx tsx src/scripts/test-reset-guard.ts
// Pins the /api/auth/reset-password gate (src/lib/resetGuard.ts, backlog
// #29 + #36): the bot check decides first, a drop and a success share one
// body, only the request's shape can earn a 400, the route never answers
// differently for a known and an unknown address, the response goes out
// before the lookup / generateLink / send (which run in after()), the
// per-address cooldown only ever skips a send, the form sends the two
// protection fields, and no log line can carry an address. Exits non-zero
// on any failure.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  HONEYPOT_FIELD,
  FILL_TIME_FIELD,
  MIN_FILL_TIME_MS,
  TEXT_LIMITS,
} from "../lib/botCheck";
import {
  decideReset,
  findUserByEmail,
  RESET_COOLDOWN_MS,
  RESET_INVALID_EMAIL,
  RESET_LOG_ROUTE,
  RESET_RESPONSE,
  withinResetCooldown,
} from "../lib/resetGuard";

let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}\n      expected ${e}\n      got      ${a}`);
  }
}

const protection = { [HONEYPOT_FIELD]: "", [FILL_TIME_FIELD]: MIN_FILL_TIME_MS + 3000 };
const human = { email: "player@example.com", ...protection };

// ─── Order of operations ─────────────────────────────────────────────────────

console.log("order of operations");

check("a real request is accepted with its email", decideReset(human), {
  action: "accept",
  email: "player@example.com",
});
check(
  "honeypot filled → drop",
  decideReset({ ...human, [HONEYPOT_FIELD]: "http://x" }),
  { action: "drop", reason: "honeypot" }
);
check(
  "too fast → drop",
  decideReset({ ...human, [FILL_TIME_FIELD]: 400 }),
  { action: "drop", reason: "too_fast" }
);
check(
  "what the old form sent (email only, no fill time) → drop",
  decideReset({ email: "player@example.com" }),
  { action: "drop", reason: "no_fill_time" }
);
check(
  "a bot with a bad email is dropped, not rejected (bot check runs first)",
  decideReset({ ...human, email: "nope", [HONEYPOT_FIELD]: "x" }),
  { action: "drop", reason: "honeypot" }
);
check(
  "a drop carries no personal data",
  Object.keys(decideReset({ ...human, [HONEYPOT_FIELD]: "x" })).sort(),
  ["action", "reason"]
);
check("non-object body → drop", decideReset("just a string").action, "drop");
check("null body (unparseable JSON) → drop", decideReset(null).action, "drop");

// ─── Email shape ─────────────────────────────────────────────────────────────

console.log("email shape");

check(
  "missing email → 400",
  decideReset(protection),
  { action: "reject", status: 400, error: RESET_INVALID_EMAIL }
);
check(
  "non-string email → 400",
  decideReset({ ...protection, email: 42 }).action,
  "reject"
);
check(
  "malformed email → 400",
  decideReset({ ...human, email: "player@example" }).action,
  "reject"
);
check(
  "email is trimmed",
  decideReset({ ...human, email: "  player@example.com  " }),
  { action: "accept", email: "player@example.com" }
);
check(
  "an email over the cap is rejected, never truncated into another address",
  decideReset({ ...human, email: "a".repeat(TEXT_LIMITS.email) + "@example.com" }).action,
  "reject"
);

// ─── Cooldown (backlog #36) ──────────────────────────────────────────────────

console.log("cooldown");

const NOW = Date.parse("2026-10-08T12:00:00.000Z");
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

check("the window is 60 seconds", RESET_COOLDOWN_MS, 60_000);
check("a link generated 5s ago → inside, skip the send", withinResetCooldown(iso(5_000), NOW), true);
check(
  "a link generated 59.999s ago → still inside",
  withinResetCooldown(iso(RESET_COOLDOWN_MS - 1), NOW),
  true
);
check(
  "a link generated exactly 60s ago → outside, send",
  withinResetCooldown(iso(RESET_COOLDOWN_MS), NOW),
  false
);
check("a link generated an hour ago → outside, send", withinResetCooldown(iso(3_600_000), NOW), false);
check("a stamp ahead of now (clock skew) → inside", withinResetCooldown(iso(-2_000), NOW), true);
check("never sent (undefined) → send", withinResetCooldown(undefined, NOW), false);
check("never sent (null) → send", withinResetCooldown(null, NOW), false);
check("empty string → send", withinResetCooldown("", NOW), false);
check("unparseable stamp → send, never silently skipped", withinResetCooldown("yesterday", NOW), false);
check(
  "Supabase's own stamp format (no fractional seconds, offset) parses",
  withinResetCooldown("2026-10-08T11:59:30+00:00", NOW),
  true
);

const users = [
  { id: "a", email: "Player@Example.com", recovery_sent_at: iso(10_000) },
  { id: "b", email: "other@example.com" },
  { id: "c", email: null },
];
check("lookup matches case-insensitively", findUserByEmail(users, "player@example.com")?.id, "a");
check("lookup trims", findUserByEmail(users, "  other@example.com ")?.id, "b");
check("no match → undefined (falls through to generateLink)", findUserByEmail(users, "nobody@example.com"), undefined);
check("empty target never matches a user without an email", findUserByEmail(users, ""), undefined);
check(
  "found and inside the window → skip",
  (() => {
    const u = findUserByEmail(users, "player@example.com");
    return Boolean(u && withinResetCooldown(u.recovery_sent_at, NOW));
  })(),
  true
);
check(
  "found but never sent → send",
  (() => {
    const u = findUserByEmail(users, "other@example.com");
    return Boolean(u && withinResetCooldown((u as { recovery_sent_at?: string }).recovery_sent_at, NOW));
  })(),
  false
);

// ─── The route ───────────────────────────────────────────────────────────────

console.log("route");

const routeSrc = readFileSync(
  join(process.cwd(), "src/app/api/auth/reset-password/route.ts"),
  "utf8"
);
const jsonReturns = routeSrc.match(/NextResponse\.json\([^)]*\)/g) ?? [];
const okReturns = jsonReturns.filter((r) => r.includes("RESET_RESPONSE"));
const errorReturns = jsonReturns.filter((r) => !r.includes("RESET_RESPONSE"));

check("the success body is { ok: true }", RESET_RESPONSE, { ok: true });
check(
  "every 200 path (drop, no Supabase, accepted) answers the one body",
  okReturns.length,
  3
);
check(
  "the only other responses are the two 400s (body too large, bad email shape)",
  errorReturns.map((r) => /status: (?:400|decision\.status)/.test(r)),
  [true, true]
);
check(
  "a known and an unknown address get the same answer (no 404, no 'not found')",
  /status: 404|not found|no account|no user/i.test(routeSrc),
  false
);
check("the bot check runs before Supabase is touched", (() => {
  const guard = routeSrc.indexOf("decideReset(");
  const supabase = routeSrc.indexOf("createServiceClient()");
  return guard > 0 && supabase > guard;
})(), true);
check("redirect URLs still come from NEXT_PUBLIC_SITE_URL", routeSrc.includes("process.env.NEXT_PUBLIC_SITE_URL"), true);
check("the route logs through logBotDrop with the route name", RESET_LOG_ROUTE, "reset-password");

// Timing (backlog #36): the response is returned before any of the lookup,
// generateLink or the send — those run in after(), outside POST.
check("the route imports after() from next/server", /import \{[^}]*\bafter\b[^}]*\} from "next\/server"/.test(routeSrc), true);
const postBody = routeSrc.slice(routeSrc.indexOf("export async function POST"), routeSrc.indexOf("async function sendRecovery"));
check("POST schedules the work with after() and returns the one body right after", (() => {
  const scheduled = postBody.indexOf("after(() => sendRecovery(");
  const returned = postBody.indexOf("return NextResponse.json(RESET_RESPONSE)", scheduled);
  return scheduled > 0 && returned > scheduled;
})(), true);
check("POST itself never touches Supabase, generateLink, the lookup or Resend", /createServiceClient\(|generateLink\(|listUsers\(|sendLinkEmail\(/.test(postBody), false);
check("POST never awaits the post-response work", /await sendRecovery/.test(routeSrc), false);
check("the cooldown is checked before generateLink", (() => {
  const cooldown = routeSrc.indexOf("withinResetCooldown(");
  const link = routeSrc.indexOf("generateLink(");
  return cooldown > 0 && link > cooldown;
})(), true);
check("a lookup that finds nobody still falls through to generateLink (no early return on !user)", /if \(!user\)/.test(routeSrc), false);
check("the post-response work is wrapped so nothing escapes after()", /async function sendRecovery[\s\S]*?try \{[\s\S]*?\} catch \(err: unknown\)/.test(routeSrc), true);
check("the error object itself is never logged (Resend echoes the recipient)", /console\.error\([^;]*[(,]\s*err\s*[),]/.test(routeSrc), false);
check(
  "no log line interpolates the email or an error message (Supabase and Resend echo the address)",
  /console\.(?:log|warn|error)\([^;]*(?:\$\{email\}|[(,]\s*email\b|\.message)/.test(routeSrc),
  false
);
check(
  "the old email-only 400 is gone (a raw script learns nothing from the shape check it never reaches)",
  routeSrc.includes("Email is required."),
  false
);

// ─── The form ────────────────────────────────────────────────────────────────

console.log("form");

const formSrc = readFileSync(
  join(process.cwd(), "src/app/auth/forgot-password/page.tsx"),
  "utf8"
);
check("the form mounts the honeypot", formSrc.includes("{bot.field}"), true);
check(
  "the form sends the protection fields with the email",
  formSrc.includes("...bot.payload()"),
  true
);
check("the form posts to the protected route", formSrc.includes('"/api/auth/reset-password"'), true);

// ─── Done ─────────────────────────────────────────────────────────────────────

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nAll reset-guard tests passed.");
