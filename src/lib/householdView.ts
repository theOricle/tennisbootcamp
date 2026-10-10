// Who on an account actually trains (audit M26, M34). Pure: no React, no
// database, so the dashboard, /profile, /admin/players and the tests read one
// rule.
//
// Every account has a 'self' participant (src/lib/players.ts), because the
// holder is the one who signs in and pays. That does not make them a player:
// a parent who took the quiz only for their child has a 'self' row with
// nothing behind it. Before this rule the dashboard greeted that parent as an
// unranked player ("Sina will place you…"), gave them an availability card,
// and listed them in the admin's Unranked queue as "Myself".
//
// The holder counts as a player when anything names them: a coach level, an
// age band or self-estimate from a quiz or booking (migration 0009), a week of
// availability on file (the quiz writes it only to the players it was about),
// a booking or invite carrying their participant id, or an enrollment row in
// their name. On an account with nobody else on it the holder is always the
// player — the pre-household behaviour.

import { hasAnyAvailability } from "@/lib/availability";

export type RosterPlayer = {
  id: string;
  relationship: string;
  full_name: string | null;
  level: number | string | null;
  availability?: unknown;
  age_band?: string | null;
  self_level?: string | null;
};

/** What the account's records say about who has been named on them. */
export type PlayerEvidence = {
  /** Participant ids on the account's bookings and invites. */
  participantIds?: Iterable<string | null | undefined>;
  /** The player names on the account's enrollment rows. */
  enrollmentNames?: Iterable<string | null | undefined>;
};

function norm(name: string | null | undefined): string {
  return (name ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function hasLevelValue(level: number | string | null | undefined): boolean {
  if (level === null || level === undefined || level === "") return false;
  return Number.isFinite(Number(level));
}

/**
 * True when the account holder is one of the players on the account. False
 * only for an account-only holder: someone else is on the account and
 * nothing names the holder as a player.
 */
export function holderIsPlayer(
  self: RosterPlayer,
  players: readonly RosterPlayer[],
  evidence: PlayerEvidence = {}
): boolean {
  const others = players.filter((p) => p.id !== self.id);
  if (others.length === 0) return true;
  if (hasLevelValue(self.level)) return true;
  if (self.age_band) return true;
  if (self.self_level !== null && self.self_level !== undefined) return true;
  if (hasAnyAvailability(self.availability)) return true;
  for (const id of evidence.participantIds ?? []) if (id && id === self.id) return true;
  const name = norm(self.full_name);
  if (name) {
    for (const n of evidence.enrollmentNames ?? []) if (norm(n) === name) return true;
  }
  return false;
}

/**
 * The people on the account who train, holder first when they do. Everyone
 * who is not the holder always trains (they were added as a player).
 */
export function trainingRoster<T extends RosterPlayer>(
  players: readonly T[],
  evidence: PlayerEvidence = {}
): T[] {
  const self = players.find((p) => p.relationship === "self");
  if (!self) return [...players];
  return players.filter((p) => p !== self || holderIsPlayer(self, players, evidence));
}

/**
 * How the dashboard speaks: "you" when the holder is the only player, "named"
 * when it speaks about players by name (a parent of one child, or a
 * household of several).
 */
export function rosterVoice(
  roster: readonly RosterPlayer[],
  selfId: string | null | undefined
): "you" | "named" {
  return roster.length === 1 && roster[0].id === selfId ? "you" : "named";
}

/** "Maya" from "Maya Chen"; "" when there is no name. */
export function firstNameOf(full: string | null | undefined): string {
  return (full ?? "").trim().split(/\s+/)[0] || "";
}

/** "Maya", "Maya and Leo", "Maya, Leo and Sam". */
export function namesList(names: readonly string[]): string {
  const list = names.filter(Boolean);
  if (list.length <= 1) return list[0] ?? "";
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

/** "Maya's", "James'" — the possessive the dashboard copy uses. */
export function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`;
}

/**
 * Why a player can't be removed from an account, or null when they can: the
 * holder themselves, a player Sina has levelled, and anyone with history
 * behind them — a booking, an invite or an enrollment — stay (migration 0007:
 * "a participant with bookings behind them is history, not a typo").
 */
export function removalBlocker(
  player: { relationship: string; level: number | string | null },
  history: { bookings: number; invites: number; enrollments: number }
): string | null {
  if (player.relationship === "self") return "The account holder stays on the account.";
  if (hasLevelValue(player.level)) return "Sina has set this player's level, so they stay on file.";
  if (history.bookings + history.invites + history.enrollments > 0) {
    return "This player has a booking or enrollment on file, so they stay on the account.";
  }
  return null;
}
