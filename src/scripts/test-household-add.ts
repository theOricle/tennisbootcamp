// Run from project root: npx tsx src/scripts/test-household-add.ts
// Pins the rule a signed-in quiz uses to add someone to the holder's account
// (src/lib/participantInput.ts, backlog #24): every create lands on the
// account the server passes in (the Supabase session's user), a block can
// never name an account, a block naming the holder adds nobody, and the
// validation is the one the guest path has always used. Exits non-zero on
// any failure.

import {
  MAX_PARTICIPANTS_PER_ACCOUNT,
  PARTICIPANT_CAP_ERROR,
  PARTICIPANT_NAME_MAX,
  RELATIONSHIPS,
  blockIsMinor,
  cleanParticipantName,
  findExistingParticipant,
  isAddedRelationship,
  isRelationship,
  newParticipantInput,
  normalizeParticipantName,
  participantCapReached,
  plannedAdditions,
} from "../lib/participantInput";

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

// The signed-in user, as /api/intake reads it from the server-side session.
const SESSION = "11111111-1111-4111-8111-111111111111";
// What an attacker would like the participant to land on.
const FORGED = "99999999-9999-4999-8999-999999999999";

// ─── Vocabulary ───────────────────────────────────────────────────────────────

console.log("vocabulary");
check("relationships unchanged", [...RELATIONSHIPS], ["self", "child", "spouse", "other"]);
check("isRelationship accepts the four", RELATIONSHIPS.map(isRelationship), [true, true, true, true]);
check("isRelationship rejects anything else", [isRelationship("parent"), isRelationship(""), isRelationship(null), isRelationship(1)], [false, false, false, false]);
check("an added person is never 'self'", RELATIONSHIPS.map(isAddedRelationship), [false, true, true, true]);
check("name cap matches POST /api/participants", PARTICIPANT_NAME_MAX, 120);
check("names are trimmed and capped", cleanParticipantName(`  ${"x".repeat(130)}  `).length, 120);
check("a non-string name is empty", [cleanParticipantName(null), cleanParticipantName(42), cleanParticipantName({})], ["", "", ""]);

// ─── One block → one create, under the session only ──────────────────────────

console.log("signed-in add creates under the session's account");
const child = { name: " Maya Chen ", relationship: "child", isMinor: true, ageBand: "junior", selfLevel: "rally" };
check("a child block becomes the guest path's create", newParticipantInput(SESSION, child), {
  accountId: SESSION,
  fullName: "Maya Chen",
  relationship: "child",
  isMinor: true,
});
check("a spouse block is an adult by default", newParticipantInput(SESSION, { name: "Sam Chen", relationship: "spouse" }), {
  accountId: SESSION,
  fullName: "Sam Chen",
  relationship: "spouse",
  isMinor: false,
});
check("isMinor is true only when exactly true", [
  newParticipantInput(SESSION, { name: "A", relationship: "other", isMinor: "true" })?.isMinor,
  newParticipantInput(SESSION, { name: "A", relationship: "other", isMinor: 1 })?.isMinor,
  newParticipantInput(SESSION, { name: "A", relationship: "other", isMinor: true })?.isMinor,
], [false, false, true]);

console.log("a forged account id in the body is ignored");
const forgedBlock = {
  ...child,
  accountId: FORGED,
  account_id: FORGED,
  participantId: FORGED,
  id: FORGED,
  holderId: FORGED,
};
check("the create lands on the session's account", newParticipantInput(SESSION, forgedBlock)?.accountId, SESSION);
check("no forged key survives into the create", Object.keys(newParticipantInput(SESSION, forgedBlock) ?? {}).sort(), ["accountId", "fullName", "isMinor", "relationship"]);
check(
  "a whole forged submission still lands on the session",
  plannedAdditions(SESSION, [forgedBlock, { ...forgedBlock, name: "Noah Chen" }]).map((a) => a.create.accountId),
  [SESSION, SESSION]
);

// ─── Who adds nobody ─────────────────────────────────────────────────────────

console.log("blocks that add nobody");
check("the holder is picked, never created: a 'self' block is null", newParticipantInput(SESSION, { name: "Sina K", relationship: "self" }), null);
check("no name, no create", newParticipantInput(SESSION, { name: "   ", relationship: "child" }), null);
check("an unknown relationship, no create", newParticipantInput(SESSION, { name: "Maya", relationship: "cousin" }), null);
check("a missing relationship, no create", newParticipantInput(SESSION, { name: "Maya" }), null);
check("null and undefined blocks are null", [newParticipantInput(SESSION, null), newParticipantInput(SESSION, undefined)], [null, null]);

// ─── The whole submission, in order ───────────────────────────────────────────

console.log("plannedAdditions");
const submission = [
  { name: "Sina K", relationship: "self", selfLevel: "competitive" }, // the holder: picked from the list, skipped here
  child,
  "not an object",
  null,
  ["an", "array"],
  { name: "", relationship: "child" },
  { name: "Noah Chen", relationship: "child", isMinor: true, ageBand: "teen", selfLevel: "new" },
  { name: "Grandpa", relationship: "nephew" },
];
const planned = plannedAdditions(SESSION, submission);
check("only real additions, in typed order", planned.map((a) => a.create.fullName), ["Maya Chen", "Noah Chen"]);
check("each pairs the create with its own block (age band + self-estimate ride along)", planned.map((a) => [a.block.ageBand, a.block.selfLevel]), [["junior", "rally"], ["teen", "new"]]);
check("every create is under the session", planned.every((a) => a.create.accountId === SESSION), true);
check("a non-array adds nobody", [plannedAdditions(SESSION, undefined), plannedAdditions(SESSION, {}), plannedAdditions(SESSION, "x")], [[], [], []]);
check("an empty array adds nobody", plannedAdditions(SESSION, []), []);

// ─── isMinor comes from the age band ─────────────────────────────────────────

console.log("isMinor follows the age band");
check("a junior is a minor whatever isMinor says", blockIsMinor({ ageBand: "junior", isMinor: false }), true);
check("a teen is a minor", blockIsMinor({ ageBand: "teen" }), true);
check("an adult is not, whatever isMinor says", blockIsMinor({ ageBand: "adult", isMinor: true }), false);
check("no band: only an exact true counts", [blockIsMinor({ isMinor: true }), blockIsMinor({ isMinor: "true" }), blockIsMinor({})], [true, false, false]);
check("an unknown band falls back to isMinor", blockIsMinor({ ageBand: "senior", isMinor: true }), true);
check("the create carries the band's answer", newParticipantInput(SESSION, { name: "Maya", relationship: "child", ageBand: "adult", isMinor: true })?.isMinor, false);

// ─── Reuse before create (a retried or re-run quiz) ───────────────────────────

console.log("an existing twin is reused");
const existing = [
  { id: "p-self", full_name: "Dana Chen", relationship: "self" },
  { id: "p-maya", full_name: "Maya Chen", relationship: "child" },
  { id: "p-maya-2", full_name: "maya chen", relationship: "child" },
  { id: "p-sam", full_name: "Sam Chen", relationship: "spouse" },
  { id: "p-blank", full_name: null, relationship: "other" },
];
const maya = newParticipantInput(SESSION, child)!;
check("same name, same relationship → the oldest match", findExistingParticipant(existing, maya)?.id, "p-maya");
check("case and surrounding whitespace do not matter", findExistingParticipant(existing, { fullName: "  MAYA   chen ", relationship: "child" })?.id, "p-maya");
check("the same name under another relationship is someone else", findExistingParticipant(existing, { fullName: "Maya Chen", relationship: "other" }), null);
check("a different name is nobody", findExistingParticipant(existing, { fullName: "Noah Chen", relationship: "child" }), null);
check("a blank name never matches a blank row", findExistingParticipant(existing, { fullName: "   ", relationship: "other" }), null);
check("the holder is never matched by an add", findExistingParticipant(existing, { fullName: "Dana Chen", relationship: "spouse" }), null);
check("an empty household matches nobody", findExistingParticipant([], maya), null);
check("normalisation", [normalizeParticipantName("  Maya   Chen "), normalizeParticipantName(null), normalizeParticipantName(undefined)], ["maya chen", "", ""]);

// ─── Per-household cap ────────────────────────────────────────────────────────

console.log("per-household cap");
check("12 per account", MAX_PARTICIPANTS_PER_ACCOUNT, 12);
check("eleven may take one more", participantCapReached(11), false);
check("twelve may not", participantCapReached(12), true);
check("beyond twelve may not", participantCapReached(40), true);
check("an empty account may", participantCapReached(0), false);
check("the message names the number and the way out", [PARTICIPANT_CAP_ERROR.includes("12"), PARTICIPANT_CAP_ERROR.includes("info@tennisbootcamp.ca")], [true, true]);

// ─── Result ───────────────────────────────────────────────────────────────────

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall checks passed");
