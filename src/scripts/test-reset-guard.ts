// Run from project root: npx tsx src/scripts/test-reset-guard.ts
// Pins the /api/auth/reset-password gate (src/lib/resetGuard.ts, backlog
// #29): the bot check decides first, a drop and a success share one body,
// only the request's shape can earn a 400, the route never answers
// differently for a known and an unknown address, the form sends the two
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
  RESET_INVALID_EMAIL,
  RESET_LOG_ROUTE,
  RESET_RESPONSE,
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
  "every 200 path (drop, no Supabase, generateLink error, email sent) answers the one body",
  okReturns.length,
  4
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
check("the route logs through logBotDrop with the route name", RESET_LOG_ROUTE, "reset-password");
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
