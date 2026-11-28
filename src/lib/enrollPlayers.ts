// Who an enrollment is for, and what can stop each player (owner, 2026-10-12:
// "enrollment always asks who it's for … all contingencies handled"). Pure
// and client-safe: the enroll wizard, the enroll page and
// src/scripts/test-quiz-state.ts read one rule each. Nothing here touches
// React, Next or Supabase; the I/O (which players are already in a cohort,
// which invite names which player) is the page's, and it hands the facts in.

import { AGE_BAND_QUERIES, groupTakesAge } from "@/lib/programFilters";
import { isAgeBand, type AgeBand } from "@/lib/ageBand";
import type { ProgramGroup } from "@/types/program";
import { provisionalTierFor } from "@/lib/level";
import {
  cohortAdmitsLevel,
  formatTierLevel,
  formatTierSpan,
  hasLevel,
  levelNumber,
  tierOverlapsRange,
} from "@/lib/tiers";
import { MAX_PARTICIPANTS_PER_ACCOUNT, normalizeParticipantName } from "@/lib/participantInput";

// ─── Age fit ──────────────────────────────────────────────────────────────────

/** The group's ages in words: "7–10", "16 and up", "" for any age. */
export function groupAgesLabel(group: Pick<ProgramGroup, "ageMin" | "ageMax">): string {
  if (group.ageMin === null && group.ageMax === null) return "";
  if (group.ageMax === null) return `${group.ageMin} and up`;
  if (group.ageMin === null) return `up to ${group.ageMax}`;
  return `${group.ageMin}–${group.ageMax}`;
}

/**
 * Does the group take a player of this age band? A band spans ages (a teen
 * is 14–17), so it fits when the two ranges overlap, as the catalog filter
 * reads it. An unknown band (null, or a row from before migration 0009)
 * blocks nobody: the date of birth on the next step settles it.
 */
export function groupTakesBand(
  group: Pick<ProgramGroup, "ageMin" | "ageMax">,
  band: AgeBand | null | undefined
): boolean {
  if (!band || !isAgeBand(band)) return true;
  return groupTakesAge(group, AGE_BAND_QUERIES[band]);
}

/** Does the group take a player who is exactly this old? */
export function groupTakesExactAge(group: Pick<ProgramGroup, "ageMin" | "ageMax">, age: number): boolean {
  if (!Number.isInteger(age)) return true;
  if (group.ageMin !== null && age < group.ageMin) return false;
  if (group.ageMax !== null && age > group.ageMax) return false;
  return true;
}

/**
 * The words that block a player whose age band sits outside the group (warn
 * and block, then offer the right group). Null when the band fits or is
 * unknown.
 */
export function ageBandBlock(
  group: Pick<ProgramGroup, "name" | "ageMin" | "ageMax">,
  band: AgeBand | null | undefined
): string | null {
  if (groupTakesBand(group, band)) return null;
  return `Outside this group's ages (${groupAgesLabel(group)})`;
}

/**
 * A youth group: its oldest age is set and under 18 (backlog #97). Every
 * player it takes is a minor, so signed out its sign-up page offers "My
 * child" and "Someone else", and the guardian block is on screen from the
 * start of step 2. An adult group, an any-age group or no group is not one.
 */
export function isYouthGroup(group: Pick<ProgramGroup, "ageMax"> | null | undefined): boolean {
  return group?.ageMax != null && group.ageMax < 18;
}

/** The slice of a player on the account the pre-selection reads. */
export type PreselectPlayer = {
  id: string;
  isMinor: boolean;
  ageBand?: AgeBand | null;
};

/**
 * Signed in on a youth group (backlog #101): the players the chooser may tick
 * for the holder before they choose. Never an adult: a player counts only
 * when their age band is one the group takes, or, with no band on file, when
 * they are under 18 (the date of birth on the next step then settles the
 * exact age). Null on any other group, whose chooser starts as it always has.
 */
export function youthPreselectIds(
  group: Pick<ProgramGroup, "ageMin" | "ageMax"> | null | undefined,
  participants: readonly PreselectPlayer[]
): string[] | null {
  if (!group || !isYouthGroup(group)) return null;
  return participants
    .filter((p) => (p.ageBand && isAgeBand(p.ageBand) ? groupTakesBand(group, p.ageBand) : p.isMinor))
    .map((p) => p.id);
}

/**
 * Who the chooser starts on, signed in. The player an invitation names
 * always. Then, on a youth group (`youthIds` set), the one player who fits
 * when exactly one can be picked, else nobody, and the holder chooses. On any
 * other group the holder themselves, else the first player who can be picked.
 */
export function initialSelection<T extends { id: string; relationship: string }>(input: {
  participants: readonly T[];
  canPick: (id: string) => boolean;
  locked: (id: string) => boolean;
  youthIds: readonly string[] | null | undefined;
}): string | null {
  const pickable = input.participants.filter((p) => input.canPick(p.id));
  const invited = pickable.find((p) => input.locked(p.id));
  if (invited) return invited.id;
  if (input.youthIds) {
    const fits = pickable.filter((p) => input.youthIds!.includes(p.id));
    return fits.length === 1 ? fits[0].id : null;
  }
  return (pickable.find((p) => p.relationship === "self") ?? pickable[0])?.id ?? null;
}

// ─── The guardian's contact (backlog #101) ────────────────────────────────────

/** The one choice that opens the guardian's own email and phone. */
export const GUARDIAN_OTHER_LABEL = "The parent or guardian is someone else";

/** Under "Parent / Guardian" on a youth group: who signs, and where we reach them. */
export function guardianHint(other: boolean): string {
  return `The parent or guardian signs the waiver for every player under 18. We'll reach them at the email and phone ${other ? "below" : "above"}.`;
}

/**
 * The guardian's email and phone as the page checks and posts them. On a
 * youth group the account holder's serve as the guardian's, asked once,
 * unless the holder says the parent or guardian is someone else; then, and
 * on every other group, the guardian's own fields do.
 */
export function guardianContact(input: {
  /** A youth group: the holder's contact is the guardian's by default. */
  askOnce: boolean;
  /** "The parent or guardian is someone else" is ticked. */
  other: boolean;
  holderEmail: string;
  holderPhone: string;
  guardianEmail: string;
  guardianPhone: string;
}): { email: string; phone: string; fromHolder: boolean } {
  if (input.askOnce && !input.other) {
    return { email: input.holderEmail, phone: input.holderPhone, fromHolder: true };
  }
  return { email: input.guardianEmail, phone: input.guardianPhone, fromHolder: false };
}

/** The holder's own name, asked on step 2 when the parent or guardian is someone else. */
export const HOLDER_NAME_LABEL = "Your full name";
export const HOLDER_NAME_HINT = "The account goes in your name. The parent or guardian stays as named below.";

/**
 * Whether step 2 asks the account holder's own name (backlog #102): on a
 * youth group, with a player under 18, once "The parent or guardian is
 * someone else" is ticked. Everywhere else the guardian is the holder, or
 * the holder is the player, and no name is asked twice.
 */
export function asksHolderName(input: { askOnce: boolean; isMinor: boolean; other: boolean }): boolean {
  return input.askOnce && input.isMinor && input.other;
}

/**
 * The account holder's name as the page posts it (`accountName`). The
 * holder's own when step 2 asked it; else the guardian's when a player is
 * under 18, else the first player's, as before.
 */
export function postedHolderName(input: {
  askOnce: boolean;
  isMinor: boolean;
  other: boolean;
  holderName: string;
  guardianName: string;
  firstPlayerName: string;
}): string {
  if (asksHolderName(input)) return input.holderName.trim();
  return input.isMinor ? input.guardianName : input.firstPlayerName;
}

/** Whole years from a date of birth ("2014-03-09") to today, or null when it is not a date. */
export function computeAge(dob: string, today: Date = new Date()): number | null {
  if (!dob) return null;
  const birth = new Date(dob + "T00:00:00");
  if (isNaN(birth.getTime())) return null;
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

/**
 * Under 18 by the typed date of birth. Signed out on the sign-up page this
 * is a player's only under-18 flag (backlog #97): the blocks ask no age, so
 * the band a block's relationship assumes is never read.
 */
export function dobIsMinor(dob: string, today: Date = new Date()): boolean {
  const age = computeAge(dob, today);
  return age !== null && age < 18;
}

/** The DOB field's problem when the exact age is outside the group, else null. */
export function dobAgeError(
  group: Pick<ProgramGroup, "ageMin" | "ageMax"> | null | undefined,
  age: number | null
): string | null {
  if (!group || age === null || groupTakesExactAge(group, age)) return null;
  return `This group takes ages ${groupAgesLabel(group)}, so a player who is ${age} needs a different group. See the groups for their age below.`;
}

/** The catalog filtered to a band, where the right group is. */
export function rightGroupHref(band: AgeBand | null | undefined, locationId: string | null | undefined): string {
  const params = new URLSearchParams();
  if (locationId) params.set("location", locationId);
  if (band && isAgeBand(band)) params.set("age", AGE_BAND_QUERIES[band].value);
  const qs = params.toString();
  return qs ? `/programs?${qs}` : "/programs";
}

// ─── Level notes ─────────────────────────────────────────────────────────────

/** The slice of a player the level note reads. */
export type LevelNotePlayer = {
  name: string;
  /** Coach-assigned level, or null while unranked. */
  level: number | string | null | undefined;
  /** The quiz's self-estimate, when the coach has set no level. */
  selfLevel?: string | null;
};

/**
 * Levels never block an open group (joining flow, owner 2026-10-12): the
 * coach confirms every level on court in week one, and moves or refunds.
 * The note says where a player stands against the cohort's band — a coach
 * level outside it, or a provisional tier from the quiz — and nothing when
 * there is nothing to say (inside the band, or no level and no estimate).
 */
export function levelNote(
  player: LevelNotePlayer,
  span: { min: number | null | undefined; max: number | null | undefined }
): string | null {
  const banded = span.min != null || span.max != null;
  const band = banded ? formatTierSpan(span.min ?? null, span.max ?? null) : "";
  if (hasLevel(player.level) && levelNumber(player.level) !== null) {
    if (!banded || cohortAdmitsLevel(player.level, span.min ?? null, span.max ?? null)) return null;
    return `${player.name}: ${formatTierLevel(player.level)}, outside this group's ${band} band. Our coaches confirm every level on court in week one and move a player to the group that fits, at the same price.`;
  }
  const tier = provisionalTierFor(player.selfLevel);
  if (!tier) return null;
  // A tier spans its levelMin–levelMax (Novice is 2.0–2.5, High Performance
  // 5.0–7.0): it is inside when any of its half steps is.
  const inside = !banded || tierOverlapsRange(tier, span.min ?? null, span.max ?? null);
  return inside
    ? `${player.name}: provisional ${tier.name}, from the quiz. Our coaches confirm it on court in week one.`
    : `${player.name}: provisional ${tier.name}, from the quiz, outside this group's ${band} band. Our coaches confirm every level on court in week one and move a player to the group that fits, at the same price.`;
}

// ─── Who can be picked ───────────────────────────────────────────────────────

/** Why a player on the account cannot take a seat in this cohort. */
export type BlockedPlayer = { id: string; reason: string };

/** The reason a player already in the cohort shows, disabled. */
export function alreadyInCohortReason(kind: "enrolled" | "invited" | "pending"): string {
  switch (kind) {
    case "enrolled":
      return "Already enrolled in this group";
    case "pending":
      return "Already has a spot held in this group (payment pending)";
    default:
      return "Already invited to this group — open the link in that email";
  }
}

/**
 * What an enrollment row in a player's name means for the chooser: enrolled
 * only when the seat was paid for, a spot held while an e-transfer is on its
 * way, and nothing otherwise. A test payment enrolls nobody (safety review):
 * it took no money and holds no seat, so the player can still be chosen. The
 * same goes for a row that was refunded, disputed or never finished.
 */
export function enrollmentRowBlocks(status: string | null | undefined): "enrolled" | "pending" | null {
  if (status === "paid") return "enrolled";
  if (status === "pending_etransfer") return "pending";
  return null;
}

/**
 * An invitation for one player locks the chooser to them: the others show
 * disabled with the reason, and the invited player cannot be unticked.
 */
export function invitedLockReasons(
  participants: readonly { id: string; name: string | null }[],
  invitedId: string | null | undefined
): Record<string, string> {
  if (!invitedId || !participants.some((p) => p.id === invitedId)) return {};
  const invited = participants.find((p) => p.id === invitedId);
  const name = invited?.name?.trim() || "one player";
  const out: Record<string, string> = {};
  for (const p of participants) {
    if (p.id !== invitedId) out[p.id] = `This invitation is for ${name}`;
  }
  return out;
}

/** True when the account cannot take another player (the cap, backlog #24). */
export function accountAtCap(playerCount: number): boolean {
  return playerCount >= MAX_PARTICIPANTS_PER_ACCOUNT;
}

/**
 * A new player whose name matches one already on the account (same name,
 * spaces and case aside) is that player: reused, never a twin. Null when
 * nobody matches.
 */
export function matchingPlayer<T extends { id: string; name: string | null }>(
  participants: readonly T[],
  name: string
): T | null {
  const wanted = normalizeParticipantName(name);
  if (!wanted) return null;
  return participants.find((p) => normalizeParticipantName(p.name) === wanted) ?? null;
}

/** What the chooser says when it reused a player instead of adding a twin. */
export function reusedPlayerNote(name: string): string {
  return `${name.trim()} is already on your account, so we picked them.`;
}

function lowerFirst(s: string): string {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

/**
 * What the chooser says when the typed name is a player on the account who
 * cannot take a seat here (already in this group, outside its ages, outside
 * its level band): the row's own reason, instead of picking them — typing
 * the name is not a way around a disabled row.
 */
export function twinBlockedNote(name: string | null | undefined, reason: string): string {
  return `${(name ?? "").trim() || "That player"} is already on your account — ${lowerFirst(reason)}.`;
}

/**
 * The issue the wizard raises when a chosen player carries a reason not to
 * take a seat (a player added a moment ago whose age band is outside the
 * group, once the account reloads): the step stops on it, with the reason.
 */
export function pickedButBlockedIssue(name: string | null | undefined, reason: string): string {
  return `${(name ?? "").trim() || "This player"} can't take a seat here — ${lowerFirst(reason)}. Untick them to continue.`;
}

/**
 * "Send account email" (admin) is offered only where there is an enrollment
 * to speak of: a paid invite, or an e-transfer on its way. For a bare or
 * expired invitation nobody enrolled, so the set-up email ("X is down for
 * Fall A") and the enrolled note would both be false, and the send would
 * mint an account for an address that never enrolled. The route refuses the
 * same cases.
 */
export function accountEmailOffered(invite: {
  status: string;
  payment_method?: string | null;
}): boolean {
  if (invite.status === "paid") return true;
  return invite.status !== "declined" && invite.payment_method === "etransfer";
}

/** The route's refusal for an invite the account email is not offered on. */
export const ACCOUNT_EMAIL_NOT_OFFERED =
  "The account email goes only to a paid invite, or one with an e-transfer on its way.";

// ─── Seats ───────────────────────────────────────────────────────────────────

/**
 * The seat rule on the chooser: a payment for more players than seats left
 * is refused by the routes (seatsRefuse), so the wizard stops it first with
 * the number. Null when there is room, or the seat count is unknown.
 */
export function seatCapIssue(seatsRemaining: number | null, playerCount: number): string | null {
  if (seatsRemaining === null || playerCount <= seatsRemaining) return null;
  if (seatsRemaining <= 0) return "This group has no spots left.";
  return seatsRemaining === 1
    ? "Only 1 spot is left in this group, so choose one player."
    : `Only ${seatsRemaining} spots are left in this group, so choose at most ${seatsRemaining} players.`;
}

// ─── After the enrollment: the account email ─────────────────────────────────
//
// There is no password step inside the wizard (fix round 2). A guest enrolls
// with an email address nobody has proved yet, so a password typed there
// could only be honoured after the address is confirmed — and the set-up
// email that confirms it already lands on /set-password, where the owner
// sets one. The owner's "or while enrolling" (decisions.md 2026-10-12) is
// logged as a follow-up that needs an emailed code verified inside the
// wizard before a typed password is kept.

/** The slice of a GoTrue user the set-up rule reads. */
export type AccountSetupUser = {
  email_confirmed_at?: string | null;
  last_sign_in_at?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

/**
 * Does this account still need setting up? A user who has never confirmed
 * their email nor signed in — one the site provisioned silently for a
 * child's quiz or booking, or invited but who never set a password — gets
 * the set-up email after an enrollment. Anyone who has signed in, or
 * confirmed their address, gets the short "you're enrolled" note instead:
 * never a second set-password email.
 */
export function accountNeedsSetup(user: AccountSetupUser | null | undefined): boolean {
  if (!user) return true;
  return !user.email_confirmed_at && !user.last_sign_in_at;
}

/** Where the set-up emails already sent are recorded, on the user's own metadata. */
export const SETUP_EMAIL_META_KEY = "tb_setup_emails";

/**
 * Has the set-up email for this enrollment (its cohort) already gone out?
 * A duplicate submit, or a retry of "I've sent it", must not send a second
 * one; a later enrollment in another cohort may.
 */
export function setupEmailSentFor(meta: Record<string, unknown> | null | undefined, cohortId: string): boolean {
  const sent = meta?.[SETUP_EMAIL_META_KEY];
  if (!sent || typeof sent !== "object" || Array.isArray(sent)) return false;
  return typeof (sent as Record<string, unknown>)[cohortId] === "string";
}

/** The metadata patch that records this send. */
export function recordSetupEmail(
  meta: Record<string, unknown> | null | undefined,
  cohortId: string,
  sentAt: string
): Record<string, unknown> {
  const current = meta?.[SETUP_EMAIL_META_KEY];
  const sent =
    current && typeof current === "object" && !Array.isArray(current)
      ? { ...(current as Record<string, unknown>) }
      : {};
  sent[cohortId] = sentAt;
  return { [SETUP_EMAIL_META_KEY]: sent };
}

/** "Maya", "Maya and Leo", "Maya, Leo and Sam" — the players an email names. */
export function playersPhrase(names: readonly (string | null | undefined)[]): string {
  const list = names.map((n) => (n ?? "").trim()).filter(Boolean);
  if (list.length === 0) return "";
  if (list.length === 1) return list[0];
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}
