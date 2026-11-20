// Run from project root: npx tsx src/scripts/test-credit-rules.ts
//
// Pins backlog #84 part 1 (audit follow-up, owner 2026-11-14): the $20
// assessment credit, the wildcards in a typed email, and the email check on
// the two payment routes.
//
//   1. Checkout applies a credit only when someone is signed in, and only one
//      that belongs to that account's own players, found by participant id.
//      A typed email never finds a credit: signed out, nothing is looked up.
//   2. Every `ilike` on an email in src/ escapes its wildcards with
//      ilikePattern and keeps only the rows whose address is exactly the one
//      asked for (PostgREST reads `*` as `%`, so the escape alone is not
//      enough). Invites store the address lowercased and are matched exactly.
//      A `%` or `_` in a typed email matches nothing but itself.
//   3. Checkout and e-transfer check the email's format the way the other
//      forms do (isValidEmail), before anything is saved.
//
// Pure: it calls pure functions and reads source files. No network, no
// database, no env. Exits non-zero on any failure.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkoutCreditParticipants, scrubParticipantIds } from "../lib/enrollGate";
import { ilikePattern, rowsWithEmail } from "../lib/enrollmentLink";
import { isValidEmail } from "../lib/botCheck";
import { normalizeEmail } from "../lib/supabase/adminUsers";

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

// ─── A small model of the database, for the scenarios below ───────────────────

/**
 * PostgreSQL ILIKE with backslash escapes, after PostgREST has turned every
 * `*` into `%` (it does that for like/ilike operands). Enough to show what a
 * pattern would match; the real reads run in Supabase.
 */
function ilikeMatches(pattern: string, value: string): boolean {
  const p = pattern.replace(/\*/g, "%");
  const esc = (c: string) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let re = "^";
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === "\\" && i + 1 < p.length) {
      re += esc(p[++i]);
    } else if (c === "%") {
      re += "[\\s\\S]*";
    } else if (c === "_") {
      re += "[\\s\\S]";
    } else {
      re += esc(c);
    }
  }
  return new RegExp(`${re}$`, "i").test(value);
}

type Booking = {
  id: string;
  email: string;
  participant_id: string | null;
  status: string;
  paid: boolean;
  credit_status: string;
};

// Two families, each with a completed, paid, unused assessment.
const BOOKINGS: Booking[] = [
  { id: "bk_maya", email: "dana@example.com", participant_id: "p_maya", status: "completed", paid: true, credit_status: "unused" },
  { id: "bk_leo", email: "dana@example.com", participant_id: "p_leo", status: "completed", paid: true, credit_status: "unused" },
  { id: "bk_sam", email: "rui@example.org", participant_id: "p_sam", status: "completed", paid: true, credit_status: "unused" },
];

/** The credit query findUnusedCredit runs: one participant's own, newest unused. */
function creditFor(participantId: string | null): string | null {
  if (!participantId) return null;
  const hit = BOOKINGS.find(
    (b) =>
      b.participant_id === participantId &&
      b.status === "completed" &&
      b.paid &&
      b.credit_status === "unused"
  );
  return hit?.id ?? null;
}

/** What /api/checkout does with the players a request names. */
function checkoutCredits(input: {
  signedIn: boolean;
  owned: string[];
  players: { participantId?: string | null }[];
}): (string | null)[] {
  const scrubbed = scrubParticipantIds(input.players, input.signedIn ? new Set(input.owned) : null);
  return checkoutCreditParticipants(input.signedIn, scrubbed).map(creditFor);
}

// ─── 1. Whose credit a checkout may use ───────────────────────────────────────

console.log("checkoutCreditParticipants — signed in, own players only");
{
  check(
    "signed out → nobody is looked up, whatever ids the body sends",
    checkoutCreditParticipants(false, [{ participantId: "p_maya" }, { participantId: "p_sam" }]),
    [null, null]
  );
  check(
    "signed in → each player's own id (the scrub already kept only the account's own)",
    checkoutCreditParticipants(true, [{ participantId: "p_maya" }, { participantId: " p_leo " }]),
    ["p_maya", "p_leo"]
  );
  check(
    "signed in, a player with no id (a failed ownership read) → no lookup for them",
    checkoutCreditParticipants(true, [{ participantId: null }, { participantId: "" }, {}]),
    [null, null, null]
  );
  check("the rule takes no email at all", checkoutCreditParticipants.length, 2);
}

console.log("Scenarios — the credit a checkout ends up with");
{
  check(
    "a signed-out checkout naming another family's email gets no credit",
    checkoutCredits({ signedIn: false, owned: [], players: [{ participantId: null }] }),
    [null]
  );
  check(
    "a signed-out checkout naming another family's player id gets no credit",
    checkoutCredits({ signedIn: false, owned: [], players: [{ participantId: "p_maya" }] }),
    [null]
  );
  check(
    "a signed-out checkout with `%` as its email gets no credit (the email is never read)",
    checkoutCredits({ signedIn: false, owned: [], players: [{ participantId: null }, { participantId: null }] }),
    [null, null]
  );
  check(
    "a signed-in account gets its own players' credits",
    checkoutCredits({ signedIn: true, owned: ["p_maya", "p_leo"], players: [{ participantId: "p_maya" }, { participantId: "p_leo" }] }),
    ["bk_maya", "bk_leo"]
  );
  check(
    "a signed-in account naming another family's player gets nothing for that seat",
    checkoutCredits({ signedIn: true, owned: ["p_sam"], players: [{ participantId: "p_maya" }, { participantId: "p_sam" }] }),
    [null, "bk_sam"]
  );
  check(
    "a player with no credit of their own never borrows a sibling's",
    checkoutCredits({ signedIn: true, owned: ["p_maya", "p_new"], players: [{ participantId: "p_new" }] }),
    [null]
  );
}

// ─── 2. Wildcards in a typed email ────────────────────────────────────────────

console.log("ilike — what a typed address can match");
{
  const emails = ["dana@example.com", "rui@example.org", "a_b@example.com", "%@%.%", "*@*.*"];
  check("`%@%.%` passes the email format check, so the read must be safe on its own", isValidEmail("%@%.%"), true);
  check("unescaped, `%@%.%` matches every address (the hole)", emails.filter((e) => ilikeMatches("%@%.%", e)).length, emails.length);
  check(
    "escaped, `%@%.%` matches only itself",
    emails.filter((e) => ilikeMatches(ilikePattern("%@%.%"), e)),
    ["%@%.%"]
  );
  check(
    "escaped, `a_b@example.com` matches only itself, never aXb",
    ["a_b@example.com", "aXb@example.com"].filter((e) => ilikeMatches(ilikePattern("a_b@example.com"), e)),
    ["a_b@example.com"]
  );
  check(
    "PostgREST reads `*` as `%`: the escape alone still lets `*@*.*` through…",
    emails.filter((e) => ilikeMatches(ilikePattern("*@*.*"), e)).length,
    emails.length
  );
  const rows = emails.map((email, i) => ({ id: `r${i}`, email }));
  check(
    "…so every read keeps only the exact address: `*@*.*` is left with itself",
    rowsWithEmail(
      rows.filter((r) => ilikeMatches(ilikePattern("*@*.*"), r.email)),
      "*@*.*",
      (r) => r.email
    ).map((r) => r.id),
    ["r4"]
  );
  check(
    "the exact re-check folds case and padding",
    rowsWithEmail([{ e: "  Dana@Example.com " }, { e: "dana@example.org" }], "dana@example.com", (r) => r.e).length,
    1
  );
  check("a blank address keeps nothing", rowsWithEmail([{ e: "" }, { e: "dana@example.com" }], "  ", (r) => r.e), []);
}

console.log("Scenario — the e-transfer route with `%@%.%` lands on no one's invite");
{
  // Invites store the address lowercased; the route's lookups are exact.
  const invites = [
    { id: "inv_dana", email: "dana@example.com", status: "invited" },
    { id: "inv_rui", email: "rui@example.org", status: "invited" },
  ];
  const typed = normalizeEmail("%@%.%");
  check("an exact match on the normalized address finds nobody", invites.filter((i) => i.email === typed).map((i) => i.id), []);
  check(
    "the old unescaped ilike would have landed on the newest invite of anyone",
    invites.filter((i) => ilikeMatches(typed, i.email)).map((i) => i.id),
    ["inv_dana", "inv_rui"]
  );
}

// ─── Source: the wiring the rules depend on ───────────────────────────────────

console.log("Source — findUnusedCredit reads by participant, never by email");
{
  const src = read("src/lib/assessmentCredit.ts");
  const start = src.indexOf("export async function findUnusedCredit(");
  const end = src.indexOf("\n}\n", start);
  const body = start === -1 ? "" : src.slice(start, end);
  check("findUnusedCredit exists", start !== -1);
  check("it takes one participant id", /export async function findUnusedCredit\(\s*participantId: string \| null \| undefined\s*\)/.test(src));
  check("it filters by participant_id", body.includes('.eq("participant_id", id)'));
  check("it never reads by email", /\.ilike\(|"email"/.test(body), false);
}

console.log("Source — checkout looks a credit up only for a signed-in account's own players");
{
  const route = read("src/app/api/checkout/route.ts");
  check("the route asks checkoutCreditParticipants who to look up", route.includes("checkoutCreditParticipants(Boolean(signedIn), players)"));
  check("findUnusedCredit gets a participant id, never the contact email", /findUnusedCredit\(enrollmentMeta|findUnusedCredit\([^)]*contactEmail/.test(route), false);
  check("the ownership scrub runs before the credit lookup", route.indexOf("scrubParticipantIds(") < route.indexOf("checkoutCreditParticipants("));
}

console.log("Source — every ilike on an email escapes and re-checks; invites match exactly");
{
  const files = [
    "src/lib/assessmentCredit.ts",
    "src/lib/assessments.ts",
    "src/lib/cohortActions.ts",
    "src/lib/players.ts",
    "src/lib/supabase/enrollmentActions.ts",
  ];
  for (const file of files) {
    const src = read(file);
    const calls = src.match(/\.ilike\(\s*"[a-z_]*email[a-z_]*",[^)]*\)?[^\n]*/g) ?? [];
    for (const call of calls) {
      check(`${file}: ${call.trim().slice(0, 70)} … is escaped`, call.includes("ilikePattern("));
    }
    if (calls.length > 0) {
      check(`${file}: the ilike reads are re-checked exactly`, src.includes("rowsWithEmail(") || src.includes("enrollmentRowsToLink("));
    }
  }
  const cohort = read("src/lib/cohortActions.ts");
  check("cohortActions: no ilike on the invites' email (stored lowercased, matched exactly)", /\.ilike\(\s*"email"/.test(cohort), false);
  check("cohortActions: the email fallbacks match the normalized address", (cohort.match(/\.eq\("email", (email|address)\)/g) ?? []).length >= 4);
}

console.log("Source — checkout and e-transfer check the email's format");
{
  const checkout = read("src/app/api/checkout/route.ts");
  check("checkout: isValidEmail", checkout.includes("isValidEmail("));
  check("checkout: …before any enrollment row or Stripe session", checkout.indexOf("isValidEmail(") < checkout.indexOf("saveEnrollmentToSupabase(") && checkout.indexOf("isValidEmail(") < checkout.indexOf("createCheckoutSession("));
  check("checkout: the other forms' words", checkout.includes("INVALID_EMAIL_ERROR"));
  const etransfer = read("src/app/api/enroll/etransfer/route.ts");
  check("e-transfer: isValidEmail", etransfer.includes("isValidEmail("));
  check("e-transfer: …before any invite row", etransfer.indexOf("isValidEmail(") < etransfer.indexOf("recordEtransferIntent("));
  const actions = read("src/lib/cohortActions.ts");
  check("recordEtransferIntent: the shared format check, not a regex of its own", actions.includes("if (!isValidEmail(email))"));
}

console.log("Source — the sign-up page: the credit for the visitor's own players, one plain line signed out");
{
  const page = read("src/app/enroll/[cohortId]/page.tsx");
  check("the page never looks a credit up by an email", /findUnusedCredit\(\s*(creditEmail|inviteEmail|sessionEmail)/.test(page), false);
  check("the page passes whether someone is signed in", page.includes("signedIn={Boolean(sessionEmail)}"));
  const wizard = read("src/app/enroll/[cohortId]/EnrollWizard.tsx");
  check("signed out, the summary says the $20 comes off once they sign in", wizard.includes("Completed your $20 assessment? Sign in first, and that $20 comes off this price at payment."));
  check("signed in, the line is the one it always was", wizard.includes("Completed your $20 assessment? It comes off this price automatically"));
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll credit-rule checks passed.");
