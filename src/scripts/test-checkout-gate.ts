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
  COHORT_FULL_ERROR,
} from "../lib/enrollGate";
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

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll checks passed.");
