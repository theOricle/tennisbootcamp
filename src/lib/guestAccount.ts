// A signed-out form and the account its typed email may name (backlog #84,
// part 5; audit follow-up, owner 2026-11-14).
//
// With no one signed in, a typed email proves nothing. The quiz, the booking,
// enroll, checkout and e-transfer never attach anything to an account that
// already exists for it: no player added, no availability overwritten, no
// enrollment, booking or invite owned by it. Those rows stay unowned and link
// when the address owner signs in through their own emailed link
// (/auth/callback runs linkEnrollmentsToAccount, which re-checks the address).
// An address with no account still gets one, with its set-password email:
// that is the sign-up.
//
// The routes do this account work after their response (next/server
// `after`), so the answer and its timing are the same whether or not an
// account exists; before the response a signed-out submission is only the
// typed block (guestPlayer), which is what the Sheet row is built from.
//
// Pure: the store is injected, so src/scripts/test-guest-writes.ts drives the
// whole decision with an in-memory fake. The real store is
// guestAccountStore() in src/lib/household.ts.

import { ageBandToWho, isAgeBand } from "@/lib/ageBand";
import { selfEstimateToLevel } from "@/lib/level";
import {
  cleanParticipantName,
  isRelationship,
  normalizeParticipantName,
  type ParticipantInput,
  type Relationship,
} from "@/lib/participantInput";
import { normalizeEmail } from "@/lib/supabase/adminUsers";

/** One person a signed-out submission names, exactly as it was typed. */
export type GuestPlayer = {
  /** The player's name: the block's, else the default, else the holder's. */
  participantName: string;
  relationship: Relationship | "";
  /** The holder themselves: no relationship, "self", or the holder's own name. */
  isHolder: boolean;
  /** The typed block, for the participant created on a brand-new account. */
  block: ParticipantInput | null;
  selfLevel: string | null;
  /** Sheet columns 5–6 for this player, when they named an age band. */
  legacyWho: "adult" | "youth" | null;
  legacyLevel: string | null;
};

/**
 * The account holder's name on a sign-up (backlog #102): the holder's own,
 * `accountName`, before the guardian's. On a youth group whose parent or
 * guardian is someone else the page asks the holder's own name and posts it
 * there, so the account carries it and the guardian stays the guardian. A
 * request with no `accountName` falls back as it always has: the guardian,
 * then the player.
 */
export function enrollHolderName(body: {
  accountName?: unknown;
  guardianName?: unknown;
  participantName?: unknown;
}): string {
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  return text(body.accountName) || text(body.guardianName) || text(body.participantName);
}

/**
 * The typed block as a player, with no account read or written. The holder
 * rule and the name fallbacks are the ones src/lib/household.ts always used.
 */
export function guestPlayer(
  block: ParticipantInput | null,
  holder: { name: string; defaultName?: string }
): GuestPlayer {
  const holderName = holder.name.trim();
  const blockName = cleanParticipantName(block?.name) || cleanParticipantName(holder.defaultName);
  const relationship = isRelationship(block?.relationship) ? (block?.relationship as Relationship) : null;
  const selfLevel =
    typeof block?.selfLevel === "string" && block.selfLevel.trim() ? block.selfLevel.trim() : null;
  const ageBand = isAgeBand(block?.ageBand) ? block?.ageBand : null;
  return {
    participantName: blockName || holderName,
    relationship: relationship ?? "",
    isHolder:
      !relationship ||
      relationship === "self" ||
      (!!blockName && blockName.toLowerCase() === holderName.toLowerCase()),
    block,
    selfLevel,
    legacyWho: ageBand ? ageBandToWho(ageBand) : null,
    legacyLevel: ageBand ? (selfEstimateToLevel(selfLevel) ?? "") : null,
  };
}

/**
 * Every person a signed-out household submission names, in order: blocks
 * with no name drop out, and a submission naming nobody is the holder alone.
 */
export function guestPlayers(
  blocks: readonly (ParticipantInput | null)[] | null | undefined,
  holder: { name: string }
): GuestPlayer[] {
  const named = (blocks ?? []).filter((b) => cleanParticipantName(b?.name).length > 0);
  const list: (ParticipantInput | null)[] = named.length > 0 ? named : [null];
  return list.map((b) => guestPlayer(b, { name: holder.name, defaultName: holder.name }));
}

/** What the after-response work may do with accounts. */
export type GuestAccountStore = {
  /** The account for this (normalized) address, or null. */
  findAccountId(email: string): Promise<string | null>;
  /**
   * Create the account silently (no email). Resolves to its id only when
   * this call created it — null when it already existed, or could not be made.
   */
  createAccount(email: string): Promise<string | null>;
  /** Fill a blank name or phone on the account holder's profile; never overwrites. */
  fillContact(accountId: string, contact: { fullName: string | null; phone: string | null }): Promise<void>;
  /** The holder's own 'self' participant, made if missing. */
  ensureSelf(accountId: string, fullName: string): Promise<string | null>;
  /** Add one person to the account; resolves to the new participant's id. */
  addPlayer(accountId: string, player: GuestPlayer): Promise<string | null>;
};

export type GuestSettlement =
  /** No usable address: nothing to do. */
  | { kind: "skipped" }
  /** An account already had this address: nothing was written, nothing attached. */
  | { kind: "existing" }
  /**
   * No account before this submission. When it named someone other than the
   * holder, the account was created here (silently) and they were added to
   * it; `playerIds` lines up with the players (null for the holder). With
   * the holder alone, `accountId` is null: the set-password invite creates
   * the account, as it always did.
   */
  | { kind: "new"; accountId: string | null; playerIds: (string | null)[] };

/**
 * The account work for a signed-out submission, after the response. Writes
 * only into an account this call created; an address that has one (or gets
 * one from a concurrent request meanwhile) is left exactly as it is.
 */
export async function settleGuestPlayers(
  store: GuestAccountStore,
  input: { email: string; holderName: string; holderPhone: string | null; players: GuestPlayer[] }
): Promise<GuestSettlement> {
  const email = normalizeEmail(input.email);
  if (!email) return { kind: "skipped" };
  if (await store.findAccountId(email)) return { kind: "existing" };

  const playerIds: (string | null)[] = input.players.map(() => null);
  if (!input.players.some((p) => !p.isHolder)) return { kind: "new", accountId: null, playerIds };

  const accountId = await store.createAccount(email);
  if (!accountId) {
    // Not made by this call: another request made it meanwhile, or the write
    // failed. Either way, never write into an account this call did not make.
    if (await store.findAccountId(email)) return { kind: "existing" };
    return { kind: "new", accountId: null, playerIds };
  }
  const holderName = input.holderName.trim();
  await store.fillContact(accountId, { fullName: holderName || null, phone: input.holderPhone });
  await store.ensureSelf(accountId, holderName);
  for (const [i, player] of input.players.entries()) {
    if (!player.isHolder) playerIds[i] = await store.addPlayer(accountId, player);
  }
  return { kind: "new", accountId, playerIds };
}

/** The calendar day an instant falls on in Toronto, "YYYY-MM-DD"; null when it cannot be read. */
function torontoDay(iso: string | null | undefined): string | null {
  const at = Date.parse(iso ?? "");
  if (Number.isNaN(at)) return null;
  return new Date(at).toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
}

/**
 * Whether a linked booking's level may be written onto its player (safety
 * review). A booking can link long after it was completed, and the coach may
 * have set the player's level by hand since: that newer level stays, and the
 * old result stays on the booking.
 *
 * The booking row records no time of completion, so the day of the assessment
 * (its slot's date) stands in for it, the earliest the result can be: a level
 * set on a later day than the assessment is kept. A player with no level, or
 * one whose level carries no date, takes the booking's. When the assessment
 * day cannot be read, a dated level is kept: nothing is overwritten on a guess.
 *
 * `playerLevelSetAt` is the player's level_assessed_at as read before the
 * link wrote anything, so two bookings linking at once are both weighed
 * against the level the coach left, never against each other's write.
 */
export function linkedLevelApplies(input: {
  playerHasLevel: boolean;
  playerLevelSetAt: string | null | undefined;
  /** The assessment's own day, "YYYY-MM-DD" (assessment_blocks.block_date). */
  assessedOn: string | null | undefined;
}): boolean {
  if (!input.playerHasLevel) return true;
  const levelDay = torontoDay(input.playerLevelSetAt);
  if (!levelDay) return true;
  const assessedOn = (input.assessedOn ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(assessedOn)) return false;
  return levelDay <= assessedOn;
}

/**
 * Whose player a booking's result reaches once the booking links to an
 * account (its owner signed in through their own emailed link; backlog #84):
 * the booking's own participant when it is on the account; else the one
 * player on the account with the booking's name; else, on a brand-new
 * account with no player yet, the holder ("new-self": a guest booking for
 * someone else on a new address already made its player when it was taken).
 * Anything less clear is nobody: the level and the availability stay on the
 * booking for the coach, never on a guessed player.
 */
export function linkedBookingPlayer(
  booking: { participantId: string | null; name: string },
  players: readonly { id: string; full_name: string | null }[]
): string | "new-self" | null {
  if (booking.participantId && players.some((p) => p.id === booking.participantId)) {
    return booking.participantId;
  }
  if (players.length === 0) return "new-self";
  const name = normalizeParticipantName(booking.name);
  const matches = name ? players.filter((p) => normalizeParticipantName(p.full_name) === name) : [];
  return matches.length === 1 ? matches[0].id : null;
}
