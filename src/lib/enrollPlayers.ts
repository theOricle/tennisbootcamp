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
  // A tier spans id.0–id.5 (Novice is 2.0–2.5): it is inside when either end is.
  const inside =
    !banded ||
    cohortAdmitsLevel(tier.id, span.min ?? null, span.max ?? null) ||
    cohortAdmitsLevel(tier.id + 0.5, span.min ?? null, span.max ?? null);
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
