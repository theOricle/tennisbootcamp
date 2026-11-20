// Run from project root: npx tsx src/scripts/test-submission-limits.ts
//
// Pins backlog #84 part 6 (audit follow-up, owner 2026-11-14): limits on
// repeated submissions to the public forms, and the bot check on the three
// payment routes.
//
//   1. Per network address and per email, on the quiz, the booking, enroll,
//      checkout, e-transfer, the newsletter and program interest
//      (reset-password keeps its own cooldown). The numbers let a family
//      entering two children and retrying once through; a script on one
//      address cannot spend the day's 100 transactional emails.
//   2. A refusal is one plain line (429) with nothing an attacker can use:
//      not which limit, not how many, not when.
//   3. One additive table (migration 0011): RLS on, no policy for visitors or
//      accounts, written only by the server. It stores keyed hashes, never an
//      address or an email, and rows older than a day are deleted. Until the
//      migration runs the routes work as before and log one warning.
//   4. Checkout, enroll and e-transfer run the existing bot check (honeypot
//      and fill time), with the fields sent from the sign-up wizard.
//
// Pure: it calls pure functions and reads source files. No network, no
// database, no env. Exits non-zero on any failure.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  LIMITS,
  LIMIT_SCOPES,
  MAIL_SCOPES,
  SUBMISSION_LIMIT_ERROR,
  clientAddress,
  isMissingTable,
  limitKeyHash,
  limitVerdict,
  type LimitHit,
  type LimitScope,
} from "../lib/submissionLimits";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown = true) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}
      expected ${e}
      got      ${a}`);
  }
}

const ROOT = process.cwd();
// Either line ending: this repo is checked out with CRLF on Windows.
const read = (path: string) => readFileSync(join(ROOT, path), "utf8").replace(/\r\n/g, "\n");

const SECRET = "test-secret-not-a-real-key";
const MIN = 60_000;
const START = Date.parse("2026-11-20T09:00:00.000Z");

/** A model of the table: submit() asks the verdict, records the hits only when allowed. */
function makeLedger() {
  const hits: LimitHit[] = [];
  return {
    hits,
    submit(scope: LimitScope, address: string, email: string, at: number): boolean {
      const addressHash = limitKeyHash(SECRET, "address", address);
      const emailHash = limitKeyHash(SECRET, "email", email);
      const recent = hits.filter((h) => Date.parse(h.createdAt) > at - 24 * 60 * MIN);
      const { allowed } = limitVerdict({ scope, addressHash, emailHash, hits: recent, now: at });
      if (allowed) {
        const createdAt = new Date(at).toISOString();
        hits.push({ keyHash: addressHash, scope, createdAt }, { keyHash: emailHash, scope, createdAt });
      }
      return allowed;
    },
  };
}

/** Transactional emails a submission can send, at most (src/lib/email.ts via each route). */
const EMAILS_PER_SUBMISSION: Record<LimitScope, number> = {
  intake: 2, // the quiz result, the set-password email
  book: 3, // request received, the inbox notice, the set-password email
  etransfer: 3, // the instructions, the inbox notice, the account email
  enroll: 0,
  checkout: 0, // the account email follows the payment, not the submit
  newsletter: 0, // MailerLite's own, not ours
  interest: 0,
};

// ─── 1. The numbers ───────────────────────────────────────────────────────────

console.log("The numbers");
{
  check("seven forms are limited", [...LIMIT_SCOPES], ["intake", "book", "enroll", "checkout", "etransfer", "newsletter", "interest"]);
  check("the forms that send our email", [...MAIL_SCOPES], ["intake", "book", "etransfer"]);
  check("per address, per form: 10 an hour, 30 a day", LIMITS.perAddress, { hour: 10, day: 30 });
  check("per email, per form: 5 an hour, 10 a day", LIMITS.perEmail, { hour: 5, day: 10 });
  check("across the email-sending forms: 12 a day per address and per email", LIMITS.mail, { addressDay: 12, emailDay: 12 });
}

console.log("Scenario — a family entering two children and retrying once is never refused");
{
  const ledger = makeLedger();
  const home = "203.0.113.7";
  const mom = "dana@example.com";
  let t = START;
  let refused = 0;
  // Every form, each child separately, each retried once: the most a family
  // would ever send in one day from one home and one inbox.
  for (const scope of LIMIT_SCOPES) {
    for (let i = 0; i < 4; i++) {
      if (!ledger.submit(scope, home, mom, t)) refused++;
      t += 2 * MIN;
    }
  }
  check("28 submissions in under an hour, none refused", refused, 0);
}

console.log("Scenario — a script on one address cannot spend the day's 100 emails");
{
  const ledger = makeLedger();
  const bot = "198.51.100.9";
  let sent = 0;
  let t = START;
  // A day of submissions, a new email each time, cycling through the forms
  // that send email, every two minutes.
  for (let i = 0; i < 720; i++) {
    const scope = MAIL_SCOPES[i % MAIL_SCOPES.length];
    if (ledger.submit(scope, bot, `victim${i}@example.com`, t)) sent += EMAILS_PER_SUBMISSION[scope];
    t += 2 * MIN;
  }
  check("at most 36 emails in a day (12 submissions × 3)", sent <= 36);
  check("…well under the 100 a day", sent < 100);
}

console.log("Scenario — one inbox, hammered from many addresses");
{
  const ledger = makeLedger();
  let allowed = 0;
  for (let i = 0; i < 50; i++) {
    if (ledger.submit("intake", `192.0.2.${i}`, "dana@example.com", START + i * MIN)) allowed++;
  }
  check("five quizzes an hour for one email, whatever the address", allowed, 5);
}

console.log("Scenario — the windows slide");
{
  const ledger = makeLedger();
  for (let i = 0; i < 5; i++) ledger.submit("newsletter", "203.0.113.1", "a@example.com", START + i * MIN);
  check("the sixth in the hour is refused", ledger.submit("newsletter", "203.0.113.1", "a@example.com", START + 10 * MIN), false);
  check("an hour later it goes through", ledger.submit("newsletter", "203.0.113.1", "a@example.com", START + 70 * MIN), true);
  check("a refusal is not counted (the ledger only grows on a yes)", ledger.hits.length, 12);
}

// ─── 2. What is stored, and what a refusal says ───────────────────────────────

console.log("limitKeyHash — a keyed hash, never the value");
{
  const h = limitKeyHash(SECRET, "email", "dana@example.com");
  check("64 hex characters", /^[0-9a-f]{64}$/.test(h));
  check("the same input, the same hash", limitKeyHash(SECRET, "email", "dana@example.com"), h);
  check("an address and an email of the same text differ", limitKeyHash(SECRET, "address", "dana@example.com") === h, false);
  check("another secret, another hash", limitKeyHash("another-secret", "email", "dana@example.com") === h, false);
  check("the value does not appear in it", h.includes("dana"), false);
}

console.log("clientAddress — the network address Vercel reports");
{
  const headers = (h: Record<string, string>) => ({ get: (n: string) => h[n.toLowerCase()] ?? null });
  check("the first x-forwarded-for entry", clientAddress(headers({ "x-forwarded-for": " 203.0.113.7 , 10.0.0.1" })), "203.0.113.7");
  check("else x-real-ip", clientAddress(headers({ "x-real-ip": "198.51.100.2" })), "198.51.100.2");
  check("else unknown (all such requests share one bucket)", clientAddress(headers({})), "unknown");
}

console.log("The refusal line");
{
  check("it names the inbox", SUBMISSION_LIMIT_ERROR.includes("info@tennisbootcamp.ca"));
  check("it says no number", /\d/.test(SUBMISSION_LIMIT_ERROR.replace("info@tennisbootcamp.ca", "")), false);
  check("it never says which key tripped (no address, no IP, no 'your email')", /\b(IP|address)\b|\b(your|this) email\b/i.test(SUBMISSION_LIMIT_ERROR), false);
  check("no exclamation mark", SUBMISSION_LIMIT_ERROR.includes("!"), false);
}

console.log("isMissingTable — before migration 0011 runs");
{
  check("PostgREST's missing-table code", isMissingTable({ code: "PGRST205", message: "Could not find the table" }));
  check("Postgres's undefined-table code", isMissingTable({ code: "42P01", message: "relation does not exist" }));
  check("any other error is not that", isMissingTable({ code: "57014", message: "timeout" }), false);
  check("no error is not that", isMissingTable(null), false);
}

// ─── 3. The migration ─────────────────────────────────────────────────────────

console.log("Migration 0011 — one additive table, server only");
{
  const path = "supabase/migrations/0011_submission_limits.sql";
  check("the migration exists", existsSync(join(ROOT, path)));
  const sqlRaw = read(path);
  const verifyAt = sqlRaw.indexOf("-- verify:");
  check("it carries a -- verify: block", verifyAt > 0);
  const body = sqlRaw
    .slice(0, verifyAt)
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .toLowerCase();
  check("create table if not exists", body.includes("create table if not exists public.submission_limits ("));
  check("the columns are an id, the form, the keyed hash and the time — no address or email", /create table if not exists public\.submission_limits \( id uuid primary key default gen_random_uuid\(\), scope text not null, key_hash text not null, created_at timestamptz not null default now\(\) \);/.test(body));
  check("guarded do $$ blocks for its checks", (body.match(/do \$\$ begin if not exists \(/g) ?? []).length >= 2);
  check("the hash is 64 hex characters, checked by the table", body.includes("check (key_hash ~ '^[0-9a-f]{64}$')"));
  check("row level security is on", body.includes("alter table public.submission_limits enable row level security;"));
  check("no policy at all", /create policy/.test(body), false);
  check("visitors and accounts get nothing", body.includes("revoke all on table public.submission_limits from public, anon, authenticated;"));
  check("the server reads, writes and deletes", body.includes("grant select, insert, delete on table public.submission_limits to service_role;"));
  check("indexed for the window reads and the clean-up", body.includes("create index if not exists submission_limits_key_idx") && body.includes("create index if not exists submission_limits_created_idx"));
  check("nothing else is touched (no other table altered)", (body.match(/alter table public\.(\w+)/g) ?? []).every((m) => m.endsWith("submission_limits")));
  check("no drop, no update, no delete in the migration itself", /\b(drop table|drop column|update public|delete from)\b/.test(body), false);
}

// ─── 4. The wiring ────────────────────────────────────────────────────────────

const ROUTES: [string, LimitScope][] = [
  ["src/app/api/intake/route.ts", "intake"],
  ["src/app/api/assessment/book/route.ts", "book"],
  ["src/app/api/enroll/route.ts", "enroll"],
  ["src/app/api/checkout/route.ts", "checkout"],
  ["src/app/api/enroll/etransfer/route.ts", "etransfer"],
  ["src/app/api/newsletter/route.ts", "newsletter"],
  ["src/app/api/program-interest/route.ts", "interest"],
];

console.log("Source — every public form route checks its limits before the work");
for (const [file, scope] of ROUTES) {
  const src = read(file);
  const at = src.indexOf(`checkSubmissionLimit(req, "${scope}",`);
  check(`${file}: checks the "${scope}" limits`, at !== -1);
  check(`${file}: answers a refusal with the plain line and a 429`, src.includes("{ error: SUBMISSION_LIMIT_ERROR }, { status: 429 }"));
  const work = ["values.append(", "saveEnrollmentToSupabase(", "createCheckoutSession(", "recordEtransferIntent(", "createPendingBooking(", "createRequestedBooking(", "subscribeToMailerLite("]
    .map((w) => src.indexOf(w))
    .filter((i) => i !== -1);
  check(`${file}: …before anything is written or sent`, work.every((w) => at < w));
}
{
  const reset = read("src/app/api/auth/reset-password/route.ts");
  check("reset-password keeps its own cooldown (no second limit)", reset.includes("checkSubmissionLimit("), false);
}

console.log("Source — the store: keyed hashes, a day's rows, one warning");
{
  const db = read("src/lib/submissionLimitsDb.ts");
  check("server only", db.startsWith('import "server-only";'));
  check("the key is a secret the server already has", db.includes("process.env.SUPABASE_SERVICE_ROLE_KEY"));
  check("it stores hashes only", db.includes("key_hash: ") && !/\bemail: |\baddress: /.test(db.slice(db.indexOf(".insert(")).slice(0, 300)));
  check("hits are recorded only on a yes", db.indexOf("if (!verdict.allowed)") < db.indexOf(".insert("));
  check("rows older than a day are deleted", db.includes('.lt("created_at",'));
  check("before the migration: works as before, one warning", db.includes("let warnedMissing = false") && db.includes("if (!warnedMissing)"));
  check("a store it cannot read never blocks a form", db.includes("return ALLOWED"));
}

console.log("Source — the bot check on checkout, enroll and e-transfer, fed by the wizard");
{
  for (const file of ["src/app/api/checkout/route.ts", "src/app/api/enroll/route.ts", "src/app/api/enroll/etransfer/route.ts"]) {
    const src = read(file);
    const at = src.indexOf("checkBot(body)");
    check(`${file}: runs checkBot`, at !== -1);
    check(`${file}: a bot is dropped silently, logged without the body`, src.includes("logBotDrop("));
    check(`${file}: …before its limits and its work`, at < src.indexOf("checkSubmissionLimit("));
  }
  const wizard = read("src/app/enroll/[cohortId]/EnrollWizard.tsx");
  check("the wizard holds the honeypot field", wizard.includes("const bot = useBotCheck();") && wizard.includes("{bot.field}"));
  check("it sends the bot fields to all three routes", (wizard.match(/\.\.\.bot\.payload\(\)/g) ?? []).length, 3);
  check("it shows a 429's plain line", wizard.includes("res.status !== 429"));
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll submission-limit checks passed.");
