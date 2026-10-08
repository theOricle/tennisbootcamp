// A new participant, as a public form describes one (backlog #24).
//
// Pure on purpose: both branches of src/lib/household.ts — a guest registering
// someone under a brand-new account, and a signed-in holder adding someone to
// theirs — turn a typed block into the same `createParticipant` input through
// `newParticipantInput`, so there is exactly one validation rule and
// src/scripts/test-household-add.ts can pin it without Supabase.
//
// The account the person lands on is always the caller's argument — the
// session user on the signed-in path, the provisioned account on the guest
// path. Nothing in the block can name an account: `accountId`, `account_id`,
// `participantId` or any other key a client might add are never read.

import { ageBandIsMinor, isAgeBand } from "@/lib/ageBand";

export const RELATIONSHIPS = ["self", "child", "spouse", "other"] as const;
export type Relationship = (typeof RELATIONSHIPS)[number];

export function isRelationship(x: unknown): x is Relationship {
  return typeof x === "string" && (RELATIONSHIPS as readonly string[]).includes(x);
}

/** Someone other than the holder — the only kind of person a form can add. */
export type AddedRelationship = Exclude<Relationship, "self">;

export function isAddedRelationship(x: unknown): x is AddedRelationship {
  return isRelationship(x) && x !== "self";
}

/** One "who is this for?" block as the wizards send it. */
export type ParticipantInput = {
  name?: unknown;
  relationship?: unknown;
  isMinor?: unknown;
  /** "adult" | "teen" | "junior", asked per person since backlog #14. */
  ageBand?: unknown;
  selfLevel?: unknown;
};

/** Same cap as POST /api/participants and the Sheet's name cell. */
export const PARTICIPANT_NAME_MAX = 120;

export function cleanParticipantName(v: unknown): string {
  return typeof v === "string" ? v.trim().slice(0, PARTICIPANT_NAME_MAX) : "";
}

/** Exactly what `createParticipant` (src/lib/players.ts) takes. */
export type NewParticipantInput = {
  accountId: string;
  fullName: string;
  relationship: AddedRelationship;
  isMinor: boolean;
};

/**
 * Under 18, from the block. The age band is the only source of `isMinor`
 * (backlog #14) whenever a block carries one; a block without a band (the
 * enroll wizard, an older client) is a minor only when it says exactly `true`.
 */
export function blockIsMinor(block: ParticipantInput | null | undefined): boolean {
  return isAgeBand(block?.ageBand)
    ? ageBandIsMinor(block.ageBand)
    : block?.isMinor === true;
}

/**
 * The create for one block, or null when the block names nobody or names the
 * holder themselves (a form never adds a second "self"; the holder is picked,
 * not created).
 */
export function newParticipantInput(
  accountId: string,
  block: ParticipantInput | null | undefined
): NewParticipantInput | null {
  const fullName = cleanParticipantName(block?.name);
  if (!fullName || !isAddedRelationship(block?.relationship)) return null;
  return {
    accountId,
    fullName,
    relationship: block.relationship,
    isMinor: blockIsMinor(block),
  };
}

// ─── Reuse before create ─────────────────────────────────────────────────────

/** Trimmed, lower-cased, inner whitespace collapsed: "Maya  Chen " = "maya chen". */
export function normalizeParticipantName(name: string | null | undefined): string {
  return (name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** The subset of a participant row the match reads. */
export type ExistingParticipant = {
  id: string;
  full_name: string | null;
  relationship: string;
};

/**
 * A participant the holder already has with the same normalised name and
 * the same relationship — a retried or re-run quiz reuses them instead of
 * creating a twin. The first match in the list (oldest, as
 * listParticipantsForAccount orders them) wins.
 */
export function findExistingParticipant<T extends ExistingParticipant>(
  existing: readonly T[],
  create: Pick<NewParticipantInput, "fullName" | "relationship">
): T | null {
  const wanted = normalizeParticipantName(create.fullName);
  if (!wanted) return null;
  return (
    existing.find(
      (p) =>
        p.relationship === create.relationship &&
        normalizeParticipantName(p.full_name) === wanted
    ) ?? null
  );
}

// ─── Per-household cap ────────────────────────────────────────────────────────

/** Participants one account may hold, the holder included. */
export const MAX_PARTICIPANTS_PER_ACCOUNT = 12;

/** True when an account with `count` participants may not take another. */
export function participantCapReached(count: number): boolean {
  return count >= MAX_PARTICIPANTS_PER_ACCOUNT;
}

/** What createParticipant reports at the cap; the routes map it to a 409. */
export const PARTICIPANT_CAP_ERROR = `An account can hold up to ${MAX_PARTICIPANTS_PER_ACCOUNT} players. Email info@tennisbootcamp.ca to add more.`;

/** A block paired with its create; only blocks that would create someone. */
export type PlannedAddition = {
  block: ParticipantInput;
  create: NewParticipantInput;
};

/**
 * The people a signed-in submission adds to the holder's account, in the
 * order they were typed. Anything that is not an array, not an object, has no
 * name, or names the holder is skipped — the holder is already selectable.
 */
export function plannedAdditions(
  accountId: string,
  participants: unknown
): PlannedAddition[] {
  if (!Array.isArray(participants)) return [];
  const out: PlannedAddition[] = [];
  for (const raw of participants) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const block = raw as ParticipantInput;
    const create = newParticipantInput(accountId, block);
    if (create) out.push({ block, create });
  }
  return out;
}
