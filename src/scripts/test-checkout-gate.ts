// Run from project root: npx tsx src/scripts/test-checkout-gate.ts
//
// Pins backlog #38: /api/checkout and /api/enroll/etransfer run the enroll
// page's own gate (src/lib/enrollGate.ts) before creating anything, and a
// payment settles onto an invite by id or named participant — the email
// fallback is for legacy sessions on cohorts anyone may join, never a private
// cohort.

import {
  decideEnrollGate,
  inviteSettlement,
  cohortRequiresInvite,
  settledByInvite,
  scrubParticipantIds,
  seatsRefuse,
  foreignRows,
  enrollmentRowsToFlip,
  gateRefusal,
  unmatchedSignal,
  etransferRowPlan,
  claimCredit,
  levelGatePlan,
  requestedParticipantIds,
  COHORT_FULL_ERROR,
  INVITE_ONLY_ERROR,
  type GatePlayer,
} from "../lib/enrollGate";
import { cohortAdmitsLevel } from "../lib/tiers";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DECLINED_INVITE_ERROR } from "../lib/checkoutInvite";
import { seatsFromSnapshot } from "../lib/seatCount";
import type { Cohort } from "../types/cohort";

const TODAY = "2026-10-08";
const INVITE_ID = "2f6b1c4e-9a3d-4e8f-b7c2-1d5e6f7a8b9c";

function cohort(overrides: Partial<Cohort>): Cohort {
  return {
    id: "coh_private",
    programId: "adult-bootcamps",
    locationId: "",
    label: "Fall Cohort",
    startDate: "2026-11-02",
    endDate: "2026-12-14",
    weeks: 6,
    sessions: [{ day: "Sat", start: "10:00", end: "11:00" }],
    capacityMin: 4,
    capacityMax: 6,
    priceCents: 21000,
    currency: "CAD",
    status: "open",
    visibility: "private",
    dbStatus: "inviting",
    ...overrides,
  };
}

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
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

const privateCohort = cohort({});
const publicCohort = cohort({ id: "coh_public", visibility: "public" });
const gated = cohort({ id: "coh_gated", levelMin: 3, levelMax: 4 });

console.log("decideEnrollGate — the page's rule, re-run by the payment routes");
{
  check(
    "private cohort, no token → 403",
    decideEnrollGate({ cohort: privateCohort, tokenSent: false, lookup: null, payable: true, today: TODAY }),
    { allowed: false, status: 403, expired: false }
  );
  check(
    "private cohort, token from another cohort (lookup finds no row here) → 403",
    decideEnrollGate({
      cohort: privateCohort,
      tokenSent: true,
      lookup: { state: "invalid" },
      payable: true,
      today: TODAY,
    }),
    { allowed: false, status: 403, expired: true }
  );
  check(
    "private cohort, invite row that belongs to another cohort → 403",
    decideEnrollGate({
      cohort: privateCohort,
      tokenSent: true,
      lookup: { state: "valid", invite: { id: INVITE_ID, cohort_id: "coh_other" } },
      payable: true,
      today: TODAY,
    }),
    { allowed: false, status: 403, expired: true }
  );
  check(
    "private cohort, valid invite in this cohort → allowed",
    decideEnrollGate({
      cohort: privateCohort,
      tokenSent: true,
      lookup: { state: "valid", invite: { id: INVITE_ID, cohort_id: "coh_private" } },
      payable: true,
      today: TODAY,
    }),
    { allowed: true, via: "invite" }
  );
  check(
    "private cohort, hold lapsed mid-checkout → still payable at the routes",
    decideEnrollGate({
      cohort: privateCohort,
      tokenSent: true,
      lookup: { state: "expired" },
      payable: true,
      today: TODAY,
    }),
    { allowed: true, via: "invite" }
  );
  check(
    "private cohort, expired token on the page itself → 403 (expired copy)",
    decideEnrollGate({ cohort: privateCohort, tokenSent: true, lookup: { state: "expired" }, today: TODAY }),
    { allowed: false, status: 403, expired: true }
  );
  check(
    "public cohort, no token → allowed, unchanged",
    decideEnrollGate({ cohort: publicCohort, tokenSent: false, lookup: null, payable: true, today: TODAY }),
    { allowed: true, via: "public" }
  );
  check(
    "public cohort, stray invalid token → still allowed",
    decideEnrollGate({ cohort: publicCohort, tokenSent: true, lookup: { state: "invalid" }, payable: true, today: TODAY }),
    { allowed: true, via: "public" }
  );
  check(
    "tier-gated private cohort, signed-in player inside the band → allowed",
    decideEnrollGate({ cohort: gated, tokenSent: false, lookup: null, playerLevel: 3.5, payable: true, today: TODAY }),
    { allowed: true, via: "level" }
  );
  check(
    "tier-gated private cohort, player outside the band → 403",
    decideEnrollGate({ cohort: gated, tokenSent: false, lookup: null, playerLevel: 5, payable: true, today: TODAY }),
    { allowed: false, status: 403, expired: false }
  );
  check(
    "private cohort with no band never admits by level",
    decideEnrollGate({ cohort: privateCohort, tokenSent: false, lookup: null, playerLevel: 3.5, payable: true, today: TODAY }),
    { allowed: false, status: 403, expired: false }
  );
  check(
    "draft cohort → 404 before the invite is even considered",
    decideEnrollGate({
      cohort: cohort({ dbStatus: "draft" }),
      tokenSent: true,
      lookup: { state: "valid", invite: { id: INVITE_ID } },
      payable: true,
      today: TODAY,
    }),
    { allowed: false, status: 404 }
  );
  check(
    "cohort that already started → 404",
    decideEnrollGate({ cohort: cohort({ startDate: "2026-10-01" }), tokenSent: false, lookup: null, today: TODAY }),
    { allowed: false, status: 404 }
  );
  check(
    "missing cohort → 404",
    decideEnrollGate({ cohort: undefined, tokenSent: false, lookup: null, today: TODAY }),
    { allowed: false, status: 404 }
  );
}

console.log("gateRefusal — what a refused route answers");
{
  check(
    "private cohort, no admitting token → 403 with the one invite-only line",
    gateRefusal({ decision: { allowed: false, status: 403, expired: false }, declined: false }),
    { error: INVITE_ONLY_ERROR, status: 403 }
  );
  check("the line names the way out", INVITE_ONLY_ERROR.includes("info@tennisbootcamp.ca"), true);
  check(
    "declined token → #75's declined copy and 409, not the generic line",
    gateRefusal({ decision: { allowed: false, status: 403, expired: true }, declined: true }),
    { error: DECLINED_INVITE_ERROR, status: 409 }
  );
  check(
    "cohort not renderable → 404 even if the token was declined",
    gateRefusal({ decision: { allowed: false, status: 404 }, declined: true }),
    { error: "Cohort not found.", status: 404 }
  );
  check("allowed → nothing to answer", gateRefusal({ decision: { allowed: true, via: "public" }, declined: false }), null);
}

console.log("unmatchedSignal — when a settled-to-nothing player reaches the inbox");
{
  check("matched → silent", unmatchedSignal({ matched: true, alreadyPaid: false, requiresInvite: true }), { warn: false, email: false });
  check(
    "unmatched on a private cohort → warn and email",
    unmatchedSignal({ matched: false, alreadyPaid: false, requiresInvite: true }),
    { warn: true, email: true }
  );
  check(
    "unmatched on a public cohort → warn only (no invite is the ordinary case)",
    unmatchedSignal({ matched: false, alreadyPaid: false, requiresInvite: false }),
    { warn: true, email: false }
  );
  check(
    "invite already paid (Stripe retry), single player → warn only",
    unmatchedSignal({ matched: false, alreadyPaid: true, requiresInvite: true }),
    { warn: true, email: false }
  );
  check(
    "already paid found by participant on a household session → trusted, warn only",
    unmatchedSignal({ matched: false, alreadyPaid: true, requiresInvite: true, byParticipant: true, playerCount: 2 }),
    { warn: true, email: false }
  );
  check(
    "already paid found by EMAIL on a household session → a sibling's paid invite, so still email",
    unmatchedSignal({ matched: false, alreadyPaid: true, requiresInvite: true, byParticipant: false, playerCount: 2 }),
    { warn: true, email: true }
  );
  check(
    "already paid found by email, single player → trusted",
    unmatchedSignal({ matched: false, alreadyPaid: true, requiresInvite: true, byParticipant: false, playerCount: 1 }),
    { warn: true, email: false }
  );
}

console.log("claimCredit — each $20 credit applies to at most one player");
{
  const found = { bookingId: "bk_1", creditCents: 2000 };
  check("first player keeps the credit", claimCredit(found, []), found);
  check("a later player who finds the same booking gets none", claimCredit(found, ["bk_1"]), null);
  check("a different booking is still a credit", claimCredit({ bookingId: "bk_2", creditCents: 2000 }, ["bk_1"]), {
    bookingId: "bk_2",
    creditCents: 2000,
  });
  check("no credit found → none", claimCredit(null, ["bk_1"]), null);
  check("works with a Set of claimed ids", claimCredit(found, new Set(["bk_1"])), null);
}

console.log("etransferRowPlan — one invite row per player on a transfer");
{
  check(
    "first player with the token → token, then the email fallback (unchanged), else create",
    etransferRowPlan({ hasToken: true, participantId: null, playerIndex: 0 }),
    ["token", "email", "create"]
  );
  check(
    "first player, no token, no participant → newest live invite for the email, else create",
    etransferRowPlan({ hasToken: false, participantId: null, playerIndex: 0 }),
    ["email", "create"]
  );
  check(
    "second player, no token, no participant → never player one's row by email; reuse a free e-transfer row, else create",
    etransferRowPlan({ hasToken: false, participantId: null, playerIndex: 1 }),
    ["reuse", "create"]
  );
  check(
    "third player → same (a retry reuses, adds no rows)",
    etransferRowPlan({ hasToken: false, participantId: undefined, playerIndex: 2 }),
    ["reuse", "create"]
  );
  check(
    "named participant → their own invite, else create (any index)",
    etransferRowPlan({ hasToken: false, participantId: "p_2", playerIndex: 1 }),
    ["participant", "create"]
  );
  check(
    "first player with token and participant → token, participant, create",
    etransferRowPlan({ hasToken: true, participantId: "p_1", playerIndex: 0 }),
    ["token", "participant", "create"]
  );
}

console.log("enrollmentRowsToFlip — scoped to the player, with the pre-#38 fallback");
{
  const header = ["timestamp", "cohort_id", "program", "location", "participant_name", "participant_dob", "is_minor", "contact_email", "contact_phone", "guardian_name", "guardian_email", "guardian_phone", "consent_signed_name", "consent_agreed_at", "waiver_version", "status", "assessment_credit", "account_email", "account_name", "participant_relationship", "participant_id"];
  const row = (cohort: string, email: string, status: string, participantId: string) => [
    "t", cohort, "", "", "", "", "no", email, "", "", "", "", "", "", "", status, "", "", "", "", participantId,
  ];
  const household = {
    header,
    rows: [
      row("coh_1", "parent@example.com", "pending_etransfer", "p_child_a"), // row 2
      row("coh_1", "parent@example.com", "pending_etransfer", "p_child_b"), // row 3
      row("coh_1", "other@example.com", "pending_etransfer", "p_child_a"),  // row 4
      row("coh_2", "parent@example.com", "pending_etransfer", "p_child_a"), // row 5
      row("coh_1", "parent@example.com", "paid", "p_child_b"),              // row 6
    ],
  };
  const base = { cohortId: "coh_1", email: "parent@example.com", from: ["pending", "pending_etransfer"] };
  check("scoped: one sibling's invite flips only their rows", enrollmentRowsToFlip(household, { ...base, participantId: "p_child_b" }), [3]);
  check("scoped: the other sibling", enrollmentRowsToFlip(household, { ...base, participantId: "p_child_a" }), [2]);
  check("no participant → every pending row for the email (pre-#38)", enrollmentRowsToFlip(household, base), [2, 3]);
  check(
    "a different id on every row (holder's self participant vs the child) → fallback flips the email's rows",
    enrollmentRowsToFlip(household, { ...base, participantId: "p_self" }),
    [2, 3]
  );
  const signedOut = {
    header,
    rows: [
      row("coh_1", "parent@example.com", "pending_etransfer", ""), // row 2
      row("coh_1", "parent@example.com", "pending_etransfer", ""), // row 3
    ],
  };
  check("blank col U (signed-out household) → fallback flips the email's rows", enrollmentRowsToFlip(signedOut, { ...base, participantId: "p_self" }), [2, 3]);
  const noColumn = { header: header.slice(0, 16), rows: [row("coh_1", "parent@example.com", "pending", "x").slice(0, 16)] };
  check("tab without the column → by email", enrollmentRowsToFlip(noColumn, { ...base, participantId: "p_self" }), [2]);
  check("email match is case-insensitive and trimmed", enrollmentRowsToFlip(household, { ...base, email: "  Parent@Example.com " }), [2, 3]);
  check("status outside `from` never flips", enrollmentRowsToFlip(household, { ...base, from: ["pending"] }), []);
  check("missing core columns → nothing", enrollmentRowsToFlip({ header: ["x"], rows: [["y"]] }, base), []);
}

console.log("inviteSettlement — how a payment finds its invite");
{
  check(
    "first player with an invite id → by id only, no email",
    inviteSettlement({
      inviteId: INVITE_ID,
      participantId: "p_1",
      contactEmail: "payer@example.com",
      requiresInvite: true,
      isFirstPlayer: true,
    }),
    { inviteId: INVITE_ID }
  );
  check(
    "named participant, no invite id → by participant, email fallback not used",
    inviteSettlement({
      participantId: "p_2",
      contactEmail: "payer@example.com",
      requiresInvite: false,
      isFirstPlayer: false,
    }),
    { participantId: "p_2" }
  );
  check(
    "second household player with an invite id on the session → their own participant",
    inviteSettlement({
      inviteId: INVITE_ID,
      participantId: "p_2",
      contactEmail: "payer@example.com",
      requiresInvite: true,
      isFirstPlayer: false,
    }),
    { participantId: "p_2" }
  );
  check(
    "legacy session (no id, no participant) on a public cohort → email fallback",
    inviteSettlement({ contactEmail: "payer@example.com", requiresInvite: false, isFirstPlayer: true }),
    { email: "payer@example.com" }
  );
  check(
    "legacy session on a private cohort → nothing to settle by",
    inviteSettlement({ contactEmail: "anyone@example.com", requiresInvite: true, isFirstPlayer: true }),
    null
  );
  check(
    "legacy inviteToken session still settles by token (removal no earlier than 2026-10-12)",
    inviteSettlement({
      legacyInviteToken: "tok_8f3a9c2e5b7d4a1f",
      contactEmail: "payer@example.com",
      requiresInvite: true,
      isFirstPlayer: true,
    }),
    { inviteToken: "tok_8f3a9c2e5b7d4a1f", email: "payer@example.com" }
  );
  check(
    "invite id wins over the legacy token",
    inviteSettlement({
      inviteId: INVITE_ID,
      legacyInviteToken: "tok_8f3a9c2e5b7d4a1f",
      requiresInvite: true,
      isFirstPlayer: true,
    }),
    { inviteId: INVITE_ID }
  );
  check(
    "blank email on a public cohort → nothing",
    inviteSettlement({ contactEmail: "  ", requiresInvite: false, isFirstPlayer: true }),
    null
  );
  check("private cohort requires an invite", cohortRequiresInvite(privateCohort), true);
  check("public cohort does not", cohortRequiresInvite(publicCohort), false);
  check("cohort that could not be read → requires an invite (fail closed)", cohortRequiresInvite(undefined), true);
}

console.log("inviteSettlement — later players once the first proved an invite here");
{
  check(
    "signed-out second player on a private cohort, first settled by invite id → email allowed",
    inviteSettlement({
      inviteId: INVITE_ID,
      contactEmail: "parent@example.com",
      requiresInvite: true,
      isFirstPlayer: false,
      priorInviteProof: true,
    }),
    { email: "parent@example.com" }
  );
  check(
    "same, but the first player matched nothing → still nothing for the second",
    inviteSettlement({
      inviteId: INVITE_ID,
      contactEmail: "parent@example.com",
      requiresInvite: true,
      isFirstPlayer: false,
      priorInviteProof: false,
    }),
    null
  );
  check(
    "a named participant still wins over the chained email",
    inviteSettlement({
      participantId: "p_2",
      contactEmail: "parent@example.com",
      requiresInvite: true,
      isFirstPlayer: false,
      priorInviteProof: true,
    }),
    { participantId: "p_2" }
  );
  check("settled by id and matched → proof", settledByInvite({ inviteId: INVITE_ID }, true), true);
  check("settled by legacy token and matched → proof", settledByInvite({ inviteToken: "tok" }, true), true);
  check("settled by id but no row matched → no proof", settledByInvite({ inviteId: INVITE_ID }, false), false);
  check("settled by participant → no proof", settledByInvite({ participantId: "p_1" } as { inviteId?: string }, true), false);
  check("nothing to settle by → no proof", settledByInvite(null, true), false);
}

console.log("scrubParticipantIds — only the signed-in account's own people");
{
  const sent = [
    { name: "Maya", participantId: "p_mine" },
    { name: "Leo", participantId: "p_theirs" },
    { name: "Guest", participantId: null },
  ];
  check(
    "signed in: a foreign participant id is dropped, own id kept, null stays null",
    scrubParticipantIds(sent, new Set(["p_mine"])).map((p) => p.participantId),
    ["p_mine", null, null]
  );
  check(
    "signed out: every participant id is dropped",
    scrubParticipantIds(sent, null).map((p) => p.participantId),
    [null, null, null]
  );
  check("names and the rest of the player survive", scrubParticipantIds(sent, null).map((p) => p.name), [
    "Maya",
    "Leo",
    "Guest",
  ]);
  check("whitespace-padded own id is trimmed", scrubParticipantIds([{ participantId: " p_mine " }], new Set(["p_mine"]))[0].participantId, "p_mine");
  check(
    "foreign id → null, so the credit lookup can never spend another household's $20",
    scrubParticipantIds([{ participantId: "p_theirs" }], new Set(["p_mine"]))[0].participantId,
    null
  );
}

console.log("seatsRefuse — the page's seat rule, per player on the payment");
{
  check("unknown seat count (Sheets unconfigured) never refuses", seatsRefuse(null, 2), false);
  check("no seats → refuse", seatsRefuse(0, 1), true);
  check("one seat, one player → allowed", seatsRefuse(1, 1), false);
  check("one seat, two players → refuse", seatsRefuse(1, 2), true);
  check("plenty → allowed", seatsRefuse(6, 2), false);
  check("message names the way out", COHORT_FULL_ERROR.includes("info@tennisbootcamp.ca"), true);
}

console.log("foreignRows + seatsFromSnapshot — one Sheet read, two answers");
{
  const snapshot = {
    header: ["timestamp", "cohort_id", "program", "location", "participant_name", "participant_dob", "is_minor", "contact_email", "contact_phone", "guardian_name", "guardian_email", "guardian_phone", "consent_signed_name", "consent_agreed_at", "waiver_version", "status"],
    rows: [
      ["t", "coh_private", "", "", "Maya", "", "no", "a@example.com", "", "", "", "", "", "", "", "paid"],   // row 2
      ["t", "coh_other", "", "", "Leo", "", "no", "b@example.com", "", "", "", "", "", "", "", "pending"],  // row 3
      ["t", "coh_private", "", "", "Ana", "", "no", "c@example.com", "", "", "", "", "", "", "", "pending"], // row 4
    ],
  };
  check("rows of this cohort pass", foreignRows(snapshot, "coh_private", [2, 4]), []);
  check("a row of another cohort is foreign", foreignRows(snapshot, "coh_private", [2, 3]), [3]);
  check("a row past the end of the sheet is foreign", foreignRows(snapshot, "coh_private", [99]), [99]);
  check("the header row and nonsense numbers are foreign", foreignRows(snapshot, "coh_private", [1, 0, -4, 2.5]), [1, 0, -4, 2.5]);
  check("no cohort_id column → nothing can be trusted", foreignRows({ header: ["x"], rows: [["y"]] }, "coh_private", [2]), [2]);
  check("seats: capacity minus this cohort's paid rows", seatsFromSnapshot(snapshot, "coh_private", 6), 5);
  check("seats: pending rows don't count", seatsFromSnapshot(snapshot, "coh_other", 6), 6);
  check("seats: empty tab → full capacity", seatsFromSnapshot({ header: [], rows: [] }, "coh_private", 6), 6);
  check("seats: never below zero", seatsFromSnapshot(snapshot, "coh_private", 1), 0);
}

// ─── Audit M27: the level gate reads each player, through one rule ──────────

console.log("levelGatePlan + decideEnrollGate — per-player levels (audit M27)");
{
  const deuceOnly = cohort({ id: "coh_deuce", levelMin: 3, levelMax: 3 });
  const household: GatePlayer[] = [
    { id: "p_self", relationship: "self", level: null }, // the parent, unranked
    { id: "p_maya", relationship: "child", level: 3.0 }, // inside 3.0–4.0
    { id: "p_leo", relationship: "child", level: 2.0 }, // outside
  ];
  const gate = (levels: (number | string | null)[], c: Cohort = gated) =>
    decideEnrollGate({ cohort: c, tokenSent: false, lookup: null, playerLevels: levels, payable: true, today: TODAY });

  // The page: the holder may open the wizard when any player is inside.
  const page = levelGatePlan(gated, household);
  check("page: a ranked child admits the unranked parent's account", gate(page.levels), { allowed: true, via: "level" });
  check("page: only the players inside the band are offered", page.eligibleIds, ["p_maya"]);
  check(
    "page: nobody inside → refused, nobody offered",
    [gate(levelGatePlan(deuceOnly, [{ id: "a", relationship: "self", level: 2.5 }]).levels, deuceOnly), levelGatePlan(deuceOnly, [{ id: "a", relationship: "self", level: 2.5 }]).eligibleIds],
    [{ allowed: false, status: 403, expired: false }, []]
  );

  // The payment routes: every player on the request must be inside.
  check("route: the child inside the band → allowed", gate(levelGatePlan(gated, household, ["p_maya"]).levels), { allowed: true, via: "level" });
  check(
    "route: a sibling outside the band on the same payment → 403",
    gate(levelGatePlan(gated, household, ["p_maya", "p_leo"]).levels),
    { allowed: false, status: 403, expired: false }
  );
  check(
    "route: a typed player with no id has no level → 403",
    gate(levelGatePlan(gated, household, ["p_maya", null]).levels),
    { allowed: false, status: 403, expired: false }
  );
  check(
    "route: an id from another account has no level here → 403",
    gate(levelGatePlan(gated, household, ["p_someone_else"]).levels),
    { allowed: false, status: 403, expired: false }
  );
  check(
    "route: a legacy body naming nobody is the holder alone (unranked → 403)",
    gate(levelGatePlan(gated, household, []).levels),
    { allowed: false, status: 403, expired: false }
  );
  check(
    "route: a legacy body from a ranked solo holder still passes",
    gate(levelGatePlan(gated, [{ id: "solo", relationship: "self", level: 3.5 }], []).levels),
    { allowed: true, via: "level" }
  );
  check("route: no players signed in → no levels → 403", gate(levelGatePlan(gated, [], ["x"]).levels), { allowed: false, status: 403, expired: false });

  // One rule (cohortAdmitsLevel): a 3.5 player is not in a 3.0–3.0 cohort,
  // even though both are "Deuce". The dashboard list and the gate agree.
  check(
    "half-step band: 3.5 refused by a 3.0–3.0 cohort",
    gate([3.5], deuceOnly),
    { allowed: false, status: 403, expired: false }
  );
  check("half-step band: the list rule agrees (3.5 not admitted)", cohortAdmitsLevel(3.5, 3, 3), false);
  check("half-step band: 3.0 admitted by both", [gate([3.0], deuceOnly).allowed, cohortAdmitsLevel(3.0, 3, 3)], [true, true]);
  check("an unbanded cohort admits nobody by level", cohortAdmitsLevel(3.0, null, null), false);
  check("open-ended band: min only", [cohortAdmitsLevel(6.5, 4, null), cohortAdmitsLevel(3.5, 4, null)], [true, false]);
  let agree = true;
  for (const min of [null, 1, 2.5, 3, 3.5, 4]) {
    for (const max of [null, 3, 3.5, 4.5, 7]) {
      for (let level = 1; level <= 7; level += 0.5) {
        const c = cohort({ id: "coh_sweep", levelMin: min, levelMax: max });
        const viaGate = gate([level], c).allowed;
        if (viaGate !== cohortAdmitsLevel(level, min, max)) agree = false;
      }
    }
  }
  check("gate === list rule for every band and level on the half-step grid", agree, true);
  check("playerLevel (one player) still works", decideEnrollGate({ cohort: gated, tokenSent: false, lookup: null, playerLevel: 3.5, today: TODAY }), { allowed: true, via: "level" });
  check("an empty playerLevels never admits", gate([]), { allowed: false, status: 403, expired: false });
}

console.log("requestedParticipantIds — what the routes hand the gate");
{
  check("ids in order, blanks are typed players", requestedParticipantIds([{ participantId: " a " }, { participantId: "" }, { name: "Leo" }]), ["a", null, null]);
  check("no array → legacy body", requestedParticipantIds(undefined), []);
  check("not an array → legacy body", requestedParticipantIds({ participantId: "a" }), []);
}

console.log("source — the gate reads players through players.ts, not profiles.level");
{
  const src = readFileSync(join(process.cwd(), "src", "lib", "enrollGate.ts"), "utf8");
  check("enrollGate no longer reads the profiles table", /from\("profiles"\)/.test(src), false);
  check("enrollGate lists the account's participants", src.includes("listParticipantsForAccount"), true);
  for (const route of ["checkout/route.ts", "enroll/etransfer/route.ts", "enroll/route.ts"]) {
    const r = readFileSync(join(process.cwd(), "src", "app", "api", ...route.split("/")), "utf8");
    check(`${route} passes the request's participant ids to the gate`, r.includes("participantIds: ") && r.includes("requestedParticipantIds"), true);
  }
  const dash = readFileSync(join(process.cwd(), "src", "app", "dashboard", "page.tsx"), "utf8");
  check("dashboard lists open cohorts per player", dash.includes("getOpenCohortsForPlayers(roster)"), true);
  check("dashboard no longer keys the list to the holder's level", /getOpenCohortsForLevel\(self/.test(dash), false);
  const db = readFileSync(join(process.cwd(), "src", "lib", "cohortsDb.ts"), "utf8");
  check("the list uses the gate's rule", db.includes("cohortAdmitsLevel") && !db.includes("tierInCohortRange"), true);
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll checks passed.");
