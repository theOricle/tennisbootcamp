// Run from project root: npx tsx src/scripts/test-guest-writes.ts
//
// Pins backlog #84 part 5 (audit follow-up, owner 2026-11-14): a typed email
// never writes into an existing account.
//
//   1. With no one signed in, the quiz, the booking, enroll, checkout and
//      e-transfer attach nothing to an account that already exists for the
//      typed email: no player added, no availability overwritten, no
//      enrollment, booking or invite owned by it. Those rows stay unowned and
//      link when the address owner signs in through their own emailed link
//      (/auth/callback runs linkEnrollmentsToAccount, which re-checks the
//      address). Nothing else links rows any more.
//   2. An address with no account still gets its account and its
//      set-password email, as before: that is the sign-up.
//   3. The response and its timing do not depend on whether an account
//      exists: every signed-out route does its account work after the
//      response (next/server `after`), and the Sheet row lands as before.
//
// The account work is driven here with an in-memory store, so every route's
// signed-out path is exercised for both cases: an existing account's email
// changes nothing in that account; a new address creates one account.
//
// Pure: it calls pure functions and reads source files. No network, no
// database, no env. Exits non-zero on any failure.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  guestPlayer,
  guestPlayers,
  linkedBookingPlayer,
  settleGuestPlayers,
  type GuestAccountStore,
  type GuestPlayer,
} from "../lib/guestAccount";
import { enrollmentNoticePlan, enrollmentOwner } from "../lib/enrollmentLink";

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

// ─── An in-memory account store ───────────────────────────────────────────────

type Account = { id: string; email: string; name: string | null; players: { id: string; name: string; relationship: string }[] };

function makeStore(existing: Account[] = []) {
  const accounts = new Map<string, Account>(existing.map((a) => [a.email, structuredClone(a)]));
  const writes: string[] = [];
  let n = 0;
  const byId = (id: string) => [...accounts.values()].find((a) => a.id === id);
  const store: GuestAccountStore = {
    async findAccountId(email) {
      return accounts.get(email)?.id ?? null;
    },
    async createAccount(email) {
      if (accounts.has(email)) return null; // it exists: never "created" by this call
      const id = `acct_${++n}`;
      accounts.set(email, { id, email, name: null, players: [] });
      writes.push(`create ${email}`);
      return id;
    },
    async fillContact(accountId, contact) {
      const a = byId(accountId);
      if (a && !a.name && contact.fullName) a.name = contact.fullName;
      writes.push(`contact ${accountId}`);
    },
    async ensureSelf(accountId, fullName) {
      const a = byId(accountId);
      if (!a) return null;
      let self = a.players.find((p) => p.relationship === "self");
      if (!self) {
        self = { id: `p_${++n}`, name: fullName, relationship: "self" };
        a.players.push(self);
        writes.push(`self ${accountId}`);
      }
      return self.id;
    },
    async addPlayer(accountId, player) {
      const a = byId(accountId);
      if (!a) return null;
      const id = `p_${++n}`;
      a.players.push({ id, name: player.participantName, relationship: player.relationship || "other" });
      writes.push(`player ${accountId} ${player.participantName}`);
      return id;
    },
  };
  return { store, accounts, writes };
}

const DANA: Account = {
  id: "acct_dana",
  email: "dana@example.com",
  name: "Dana Chen",
  players: [{ id: "p_dana", name: "Dana Chen", relationship: "self" }],
};
const snapshot = (a: Account | undefined) => JSON.stringify(a);

// ─── 1. Who a typed block is ──────────────────────────────────────────────────

console.log("guestPlayer — the typed block, never an account's record");
{
  const holder = { name: "Dana Chen" };
  const self = guestPlayer({ name: "Dana Chen", relationship: "self", ageBand: "adult", selfLevel: "rally" }, holder);
  check("the holder is the holder", [self.isHolder, self.participantName, self.relationship], [true, "Dana Chen", "self"]);
  check("the holder's own answers ride on the row (cols 5–6)", [self.legacyWho, self.selfLevel], ["adult", "rally"]);
  const child = guestPlayer({ name: "Maya Chen", relationship: "child", ageBand: "junior" }, holder);
  check("a child is someone else", [child.isHolder, child.participantName, child.relationship, child.legacyWho], [false, "Maya Chen", "child", "youth"]);
  check("a block with no relationship is the holder", guestPlayer({ name: "Dana Chen" }, holder).isHolder);
  check("the holder's own name under another relationship is still the holder", guestPlayer({ name: "dana chen", relationship: "child" }, holder).isHolder);
  check("no block → the holder, under their own name", [guestPlayer(null, holder).participantName, guestPlayer(null, holder).isHolder], ["Dana Chen", true]);
  check("guestPlayers: blocks without a name drop out, and none at all is the holder", guestPlayers([{ name: " " }, null], holder).map((p) => p.participantName), ["Dana Chen"]);
  check("guestPlayers keeps order", guestPlayers([{ name: "Maya", relationship: "child" }, { name: "Leo", relationship: "child" }], holder).map((p) => p.participantName), ["Maya", "Leo"]);
}

// ─── 2. The account work, after the response ──────────────────────────────────

const people = (blocks: Parameters<typeof guestPlayers>[0]): GuestPlayer[] => guestPlayers(blocks, { name: "Dana Chen" });

async function settleScenarios() {
console.log("settleGuestPlayers — an existing account's email changes nothing in that account");
for (const [route, blocks] of [
  ["quiz (the holder)", [{ name: "Dana Chen", relationship: "self", ageBand: "adult" }]],
  ["quiz (two children)", [{ name: "Maya Chen", relationship: "child" }, { name: "Leo Chen", relationship: "child" }]],
  ["booking (a child)", [{ name: "Maya Chen", relationship: "child" }]],
  ["enroll (holder and child)", [{ name: "Dana Chen", relationship: "self" }, { name: "Maya Chen", relationship: "child" }]],
] as const) {
  const { store, accounts, writes } = makeStore([DANA]);
  const before = snapshot(accounts.get("dana@example.com"));
  const outcome = await settleGuestPlayers(store, {
    email: "  Dana@Example.com ",
    holderName: "Someone Else",
    holderPhone: "+1 416 555 0100",
    players: people(blocks as never),
  });
  check(`${route}: the account is left as it was`, snapshot(accounts.get("dana@example.com")), before);
  check(`${route}: nothing written`, writes, []);
  check(`${route}: reported as existing`, outcome, { kind: "existing" });
}

console.log("settleGuestPlayers — a new address creates one account");
{
  const quiz = makeStore([DANA]);
  const holderOnly = await settleGuestPlayers(quiz.store, {
    email: "new@example.com",
    holderName: "Ana Ruiz",
    holderPhone: null,
    players: guestPlayers([{ name: "Ana Ruiz", relationship: "self" }], { name: "Ana Ruiz" }),
  });
  check("the holder alone: no account yet — the set-password invite makes it, as before", holderOnly, { kind: "new", accountId: null, playerIds: [null] });
  check("…and nothing is written before that", quiz.writes, []);

  const kids = makeStore([DANA]);
  const outcome = await settleGuestPlayers(kids.store, {
    email: "new@example.com",
    holderName: "Ana Ruiz",
    holderPhone: "(647) 555-1234",
    players: guestPlayers(
      [{ name: "Ana Ruiz", relationship: "self" }, { name: "Sol Ruiz", relationship: "child" }, { name: "Lu Ruiz", relationship: "child" }],
      { name: "Ana Ruiz" }
    ),
  });
  const created = kids.accounts.get("new@example.com");
  check("one account is created", kids.writes.filter((w) => w.startsWith("create")).length, 1);
  check("it holds the holder and both children", created?.players.map((p) => `${p.name}:${p.relationship}`), ["Ana Ruiz:self", "Sol Ruiz:child", "Lu Ruiz:child"]);
  check("the ids line up with the players (the holder has none of its own here)", outcome.kind === "new" && outcome.playerIds.map((id) => id !== null), [false, true, true]);
  check("Dana's account is untouched", snapshot(kids.accounts.get("dana@example.com")), snapshot(DANA));
}

console.log("settleGuestPlayers — a race never lands in someone else's account");
{
  const { store, writes } = makeStore();
  // Another request made the account between this one's lookup and its create.
  let lookups = 0;
  const racing: GuestAccountStore = {
    ...store,
    async findAccountId() {
      lookups++;
      return lookups === 1 ? null : "acct_other";
    },
    async createAccount() {
      return null;
    },
  };
  const outcome = await settleGuestPlayers(racing, {
    email: "race@example.com",
    holderName: "Ana",
    holderPhone: null,
    players: guestPlayers([{ name: "Sol", relationship: "child" }], { name: "Ana" }),
  });
  check("an account that appeared meanwhile is treated as existing", outcome, { kind: "existing" });
  check("…and nothing is written into it", writes, []);
}
}

// ─── 3. Rows a signed-out payment saves ───────────────────────────────────────

console.log("checkout and e-transfer — signed out, every row is unowned");
{
  check("enrollmentOwner: signed in → the session's account", enrollmentOwner("u_session"), "u_session");
  check("enrollmentOwner: signed out → nobody, whatever the email's account", enrollmentOwner(null), null);
  check("enrollmentOwner: a blank session counts as signed out", enrollmentOwner(""), null);
  check("enrollmentOwner takes no email at all", enrollmentOwner.length, 1);
}

console.log("enrollmentNoticePlan — what the address hears; nothing is linked from here");
{
  const plan = (o: Partial<Parameters<typeof enrollmentNoticePlan>[0]>) =>
    enrollmentNoticePlan({ accountExists: false, needsSetup: false, setupSentForCohort: false, force: false, ...o });
  check("a new address → the set-up email (the account is created with it)", plan({}), "set-up");
  check("an account never signed in to → the set-up email, once per cohort", plan({ accountExists: true, needsSetup: true }), "set-up");
  check("…already sent for this cohort → nothing", plan({ accountExists: true, needsSetup: true, setupSentForCohort: true }), "none");
  check("…unless the coach resends on purpose", plan({ accountExists: true, needsSetup: true, setupSentForCohort: true, force: true }), "set-up");
  check("an account in use → \"You're enrolled\"", plan({ accountExists: true }), "enrolled");
}

console.log("linkedBookingPlayer — whose result a booking carries once it links at sign-in");
{
  const players = [
    { id: "p_dana", full_name: "Dana Chen" },
    { id: "p_maya", full_name: "Maya Chen" },
  ];
  check("the booking's own participant, when it is on the account", linkedBookingPlayer({ participantId: "p_maya", name: "Whoever" }, players), "p_maya");
  check("a participant from another account is ignored: the name decides", linkedBookingPlayer({ participantId: "p_other", name: "Maya Chen" }, players), "p_maya");
  check("the one player with the booking's name (case and spaces aside)", linkedBookingPlayer({ participantId: null, name: "  maya   CHEN " }, players), "p_maya");
  check(
    "two players with that name → nobody: the result stays on the booking for the coach",
    linkedBookingPlayer({ participantId: null, name: "Sam" }, [...players, { id: "a", full_name: "Sam" }, { id: "b", full_name: "sam" }]),
    null
  );
  check("no player with that name → nobody", linkedBookingPlayer({ participantId: null, name: "Leo Chen" }, players), null);
  check("a brand-new account with no players yet: the holder, made now", linkedBookingPlayer({ participantId: null, name: "Ana Ruiz" }, []), "new-self");
}

// ─── Source: every route's signed-out path ────────────────────────────────────

console.log("Source — the signed-out branch touches no account before the response");
{
  const household = read("src/lib/household.ts");
  const start = household.indexOf("// ── Signed out");
  const end = household.indexOf("\n}\n", start);
  const branch = start === -1 ? "" : household.slice(start, end);
  check("the signed-out branch exists", start !== -1);
  for (const call of ["findUserIdByEmail(", "ensureAccountForEmail(", "createParticipant(", "ensureSelfParticipant(", "fillPlayerContact(", "rememberAnswers(", "getAccount("]) {
    check(`it never calls ${call}`, branch.includes(call), false);
  }
  check("it answers with the typed block (guestPlayer)", branch.includes("guestPlayer("));
}

console.log("Source — each route does its signed-out account work after the response");
{
  const intake = read("src/app/api/intake/route.ts");
  check("quiz: imports after", /import \{[^}]*\bafter\b[^}]*\} from "next\/server"/.test(intake));
  check("quiz: a guest's account work runs in after()", /after\(\(\) =>\s*provisionGuestIntake\(/.test(intake));
  check("quiz: signed in, the grid lands on the session's own account", intake.includes("provisionSessionIntake({"));
  check("quiz: the old by-typed-email provisioning is gone", intake.includes("provisionIntakeAccount("), false);
  check("quiz: the Sheet append still comes before the response", intake.indexOf("values.append(") < intake.indexOf("const res = signedIn"));

  const book = read("src/app/api/assessment/book/route.ts");
  check("booking: imports after", /import \{[^}]*\bafter\b[^}]*\} from "next\/server"/.test(book));
  check("booking: a guest's account work runs in after()", book.includes("attachGuestBooking(") && book.includes("after("));
  check("booking: the request's emails and account step run after the response", /after\(\(\) =>\s*finishRequestedBooking\(/.test(book));

  const enroll = read("src/app/api/enroll/route.ts");
  check("enroll: a guest's new account is made after the response", /after\(\(\) =>\s*settleGuestSubmission\(/.test(enroll));

  const checkout = read("src/app/api/checkout/route.ts");
  check("checkout: the owner is the session, never the email's account", checkout.includes("const ownerId = enrollmentOwner(signedIn?.id)"));
  check("checkout: no email lookup for an owner", checkout.includes("resolveEnrollmentUserId("), false);
  check("checkout: the submit itself sends no account email (the payment does; a test payment never)", checkout.includes("notifyEnrollmentAccount("), false);

  const etransfer = read("src/app/api/enroll/etransfer/route.ts");
  check("e-transfer: the owner is the session, never the email's account", etransfer.includes("const ownerId = enrollmentOwner(signedIn?.id)"));
  check("e-transfer: no email lookup for an owner", etransfer.includes("resolveEnrollmentUserId("), false);
  check("e-transfer: the invite is the session's or nobody's", etransfer.includes("accountId: ownerId"));
  check("e-transfer: the account email runs after the response", /after\(\(\) =>\s*notifyEnrollmentAccount\(/.test(etransfer));

  const hook = read("src/app/api/webhooks/stripe/route.ts");
  check("webhook: the owner is whoever owns the session's rows, never a lookup by email", hook.includes("enrollmentRowsOwner(paidEnrollmentIds)") && !hook.includes("resolveEnrollmentUserId("));
}

console.log("Source — rows link only when the owner signs in through their emailed link");
{
  const actions = read("src/lib/supabase/enrollmentActions.ts");
  const calls = actions.match(/\blinkEnrollmentsToAccount\(/g) ?? [];
  check("enrollmentActions defines linkEnrollmentsToAccount and never calls it", calls.length, 1);
  check("the link still asks Supabase whose address it is", actions.includes("auth.admin.getUserById(userId)"));
  check("no owner write outside the link itself", (actions.match(/\.update\(\{ user_id: \w+ \}\)/g) ?? []).length, 1);
  check("no lookup of an owner by email remains", actions.includes("resolveEnrollmentUserId"), false);
  const account = read("src/lib/intakeAccount.ts");
  check("the quiz never links rows", account.includes("linkEnrollmentsToAccount("), false);
  const callback = read("src/app/auth/callback/route.ts");
  check("the callback links the signed-in owner's own rows", callback.includes("linkEnrollmentsToAccount(user.id, user.email)"));
  check("…only after the emailed link signed them in", callback.indexOf("linkEnrollmentsToAccount(") > callback.indexOf("verifyOtp(") && callback.indexOf("linkEnrollmentsToAccount(") > callback.indexOf("exchangeCodeForSession("));
  check("…and never blocks the sign-in", /linkEnrollmentsToAccount\(user\.id, user\.email\)\.catch\(/.test(callback));
}

console.log("Source — a guest's booking, request and invite stay unowned");
{
  const assessments = read("src/lib/assessments.ts");
  const household = assessments.slice(assessments.indexOf("export async function bookingHousehold("));
  const householdBody = household.slice(0, household.indexOf("\n}\n"));
  check("a booking's player is its own participant, never one found by email or guessed from the account", householdBody.length > 0 && !/resolveParticipantId\(|findUserIdByEmail\(|ensureSelfParticipant\(/.test(householdBody));
  const complete = assessments.slice(assessments.indexOf("export async function completeBooking("));
  const completeBody = complete.slice(0, complete.indexOf("\n}\n"));
  check("completion writes the level and the availability only into a linked booking's player", /if \(household\.participantId\) \{[\s\S]*setPlayerLevel\(household\.participantId[\s\S]*setKnownPlayerAvailability\(household\.participantId/.test(completeBody));
  check("…and never outside that check", completeBody.indexOf("setPlayerLevel(") > completeBody.indexOf("if (household.participantId) {") && completeBody.indexOf("setKnownPlayerAvailability(") > completeBody.indexOf("if (household.participantId) {"));
  check("…addressed to that player, never by the booking's email", completeBody.includes("setPlayerAvailabilityByEmail("), false);
  const players = read("src/lib/players.ts");
  const known = players.slice(players.indexOf("export async function setKnownPlayerAvailability("));
  const knownBody = known.slice(0, known.indexOf("\n}\n"));
  check("the player-addressed write never resolves anyone by email", knownBody.length > 0 && !/resolveParticipantId\(|findUserIdByEmail\(|ensureSelfParticipant\(/.test(knownBody));
  const link = assessments.slice(assessments.indexOf("export async function linkBookingsToAccount("));
  const linkBody = link.slice(0, link.indexOf("\n}\n"));
  check("a linked booking's result is addressed to its player, never by email", linkBody.includes("setKnownPlayerAvailability(participantId") && !linkBody.includes("setPlayerAvailabilityByEmail("));
  check("bookings link at sign-in: the address is re-checked against the account", linkBody.includes("emailBelongsToAccount(owner.user.email, target)"));
  check("…read with the escaped, re-checked email", linkBody.includes('.ilike("email", ilikePattern(target))') && linkBody.includes("rowsWithEmail("));
  check("…only unowned bookings", linkBody.includes('.is("user_id", null)'));
  check("…and a recorded result reaches only the clear player", linkBody.includes("linkedBookingPlayer("));
  const callbackSrc = read("src/app/auth/callback/route.ts");
  check("the callback links the owner's bookings too", callbackSrc.includes("linkBookingsToAccount(user.id, user.email)"));
  check("the guest request's availability lands only in an account this request made", assessments.includes("if (ownAccountId)"));
  const actions = read("src/lib/cohortActions.ts");
  check("recordEtransferIntent no longer looks an owner up by email", /user_id: await findUserIdByEmail\(email\)/.test(actions), false);
  check("signed out, the email fallback lands only on an unowned invite", actions.includes('.is("user_id", null)') && actions.includes('.is("participant_id", null)'));
}

async function main() {
  await settleScenarios();
  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll guest-write checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
