// Backlog #38: the enroll page's gate, re-checked server-side at payment.
//
// /enroll/[cohortId] decides who may enroll: the cohort must be renderable
// (src/lib/cohortVisibility.ts), and a private cohort admits a valid invite
// token for that cohort or, when the cohort is tier-gated, a signed-in player
// whose coach-assigned level sits inside [level_min, level_max]. Before this
// module /api/checkout and /api/enroll/etransfer trusted whatever the browser
// posted — cohortId, inviteToken, contactEmail — so the gate could be walked
// around with one fetch. Both routes now run the same decision as the page,
// through `resolveEnrollGate`, before a Stripe session or e-transfer row
// exists.
//
// `decideEnrollGate` and `inviteSettlement` are pure (pinned by
// src/scripts/test-checkout-gate.ts); `resolveEnrollGate` does the I/O.

import type { Cohort } from "@/types/cohort";
import { isCohortRenderable, todayIso } from "@/lib/cohortVisibility";
import { levelWithinRange } from "@/lib/tiers";
import { DECLINED_INVITE_ERROR } from "@/lib/checkoutInvite";

/** What getInviteByToken reported, as far as the gate cares. */
export type GateInviteLookup =
  | { state: "valid"; invite: { id: string; email?: string; cohort_id?: string } }
  | { state: "expired" | "invalid" };

export type EnrollGateDecision =
  | { allowed: true; via: "public" | "invite" | "level" }
  | { allowed: false; status: 404 }
  | { allowed: false; status: 403; expired: boolean };

/**
 * The gate rule itself, shared by the page and both payment routes.
 *
 * `payable` is the payment routes' one extension: an invite whose hold lapsed
 * between page load and paying (`lookup.state === "expired"`, which
 * getInviteByToken only reports for a row in this cohort) is still admitted,
 * because PAYABLE_STATUSES includes `expired` and the payment settles onto
 * that row (backlog #30/#34). The page keeps refusing an expired token.
 */
export function decideEnrollGate(input: {
  cohort: Cohort | null | undefined;
  /** Whether the request carried a token at all (drives the gate's copy). */
  tokenSent: boolean;
  /** getInviteByToken(cohort.id, token), or null when no token was sent. */
  lookup: GateInviteLookup | null;
  /** The signed-in player's coach-assigned level, if any. */
  playerLevel?: number | string | null;
  payable?: boolean;
  today?: string;
}): EnrollGateDecision {
  const { cohort, tokenSent, lookup, playerLevel } = input;
  const today = input.today ?? todayIso();
  if (!cohort || !isCohortRenderable(cohort, today)) {
    return { allowed: false, status: 404 };
  }
  if (cohort.visibility !== "private") return { allowed: true, via: "public" };

  if (lookup?.state === "valid") {
    // getInviteByToken already pins the cohort; this guards a caller that
    // looked the token up elsewhere.
    const sameCohort = !lookup.invite.cohort_id || lookup.invite.cohort_id === cohort.id;
    if (sameCohort) return { allowed: true, via: "invite" };
  }
  if (input.payable && lookup?.state === "expired") {
    return { allowed: true, via: "invite" };
  }
  if (
    (cohort.levelMin != null || cohort.levelMax != null) &&
    levelWithinRange(playerLevel, cohort.levelMin, cohort.levelMax)
  ) {
    return { allowed: true, via: "level" };
  }
  return { allowed: false, status: 403, expired: tokenSent };
}

/**
 * How a payment finds the invite it settles onto (webhook and mock checkout).
 *
 *   1. The first player's invite row id from session metadata (backlog #30).
 *   2. The legacy `inviteToken` metadata of a session created before the #30
 *      deploy — branch intact, removal no earlier than 2026-10-12.
 *   3. A named participant: that player's own invite in the cohort, never the
 *      email.
 *   4. The email fallback, only for a session that names neither an invite nor
 *      a participant (pre-household sessions), and never on a cohort that
 *      requires an invite — the email in metadata is the one the payer typed.
 *
 * Returns the lookup fields for markInvitePaidAndMaybeConfirm, or null when
 * there is nothing safe to settle by.
 */
export function inviteSettlement(params: {
  inviteId?: string;
  legacyInviteToken?: string;
  participantId?: string;
  contactEmail?: string;
  /** cohort.visibility === "private" (or the cohort could not be read). */
  requiresInvite: boolean;
  /** The invite row (id or token) belongs to the first player only. */
  isFirstPlayer: boolean;
  /**
   * An earlier player in this same session settled onto an invite row in
   * this cohort by id or token. The payer has then proved they hold an invite
   * here, so a later signed-out player with no participant may still settle
   * by the email fallback on a private cohort (a parent paying for two
   * children off one invite link).
   */
  priorInviteProof?: boolean;
}): { inviteId?: string; inviteToken?: string; participantId?: string; email?: string } | null {
  const { inviteId, legacyInviteToken, participantId, contactEmail, requiresInvite } = params;
  const email = (contactEmail ?? "").trim() || undefined;
  if (params.isFirstPlayer && inviteId) return { inviteId };
  if (params.isFirstPlayer && legacyInviteToken) {
    return { inviteToken: legacyInviteToken, email };
  }
  if (participantId) return { participantId };
  if ((!requiresInvite || params.priorInviteProof) && email) return { email };
  return null;
}

/**
 * Whether a payment on this cohort may settle by email at all. A cohort that
 * could not be read fails closed: no email fallback.
 */
export function cohortRequiresInvite(cohort: Cohort | null | undefined): boolean {
  if (!cohort) return true;
  return cohort.visibility === "private";
}

/** Did a settlement by invite id or token land on a row in this cohort? */
export function settledByInvite(
  by: { inviteId?: string; inviteToken?: string } | null,
  matched: boolean
): boolean {
  return Boolean(by && (by.inviteId || by.inviteToken) && matched);
}

// ─── Participant ownership ────────────────────────────────────────────────────

/**
 * Only the signed-in account's own people may be named on a payment (the
 * household rule, src/lib/household.ts: `participant.account_id` must equal
 * the session's account). `owned` is that account's participant ids; null
 * means nobody is signed in, and then every id is dropped — a signed-out
 * caller cannot name a participant, so it cannot spend another household's
 * $20 credit or settle onto their invite.
 */
export function scrubParticipantIds<T extends { participantId?: string | null }>(
  players: T[],
  owned: ReadonlySet<string> | null
): T[] {
  return players.map((p) => {
    const id = (p.participantId ?? "").trim();
    const keep = Boolean(id) && owned !== null && owned.has(id);
    return keep ? { ...p, participantId: id } : { ...p, participantId: null };
  });
}

// ─── Enrollment Sheet checks (seats and row ownership) ────────────────────────

/** Sent back with a 409 when the cohort has no seat left for this payment. */
export const COHORT_FULL_ERROR =
  "This cohort is full. Email info@tennisbootcamp.ca and we'll find you the next one.";

/** Sent back with a 400 when a row number does not belong to this cohort. */
export const ROW_MISMATCH_ERROR =
  "That enrollment doesn't match this cohort — reload the page and try again, or email info@tennisbootcamp.ca.";

/** Sent back with a 503 when the Sheet could not be read to verify the rows. */
export const RECORDS_UNAVAILABLE_ERROR =
  "Couldn't reach the enrollment records — please try again in a minute or email info@tennisbootcamp.ca.";

export type EnrollmentSheetSnapshot = { header: string[]; rows: string[][] };

/** The page's seat rule, for a payment covering `playerCount` seats. */
export function seatsRefuse(seatsRemaining: number | null, playerCount: number): boolean {
  if (seatsRemaining === null) return false;
  return seatsRemaining <= 0 || seatsRemaining < Math.max(1, playerCount);
}

/**
 * Which of the client-supplied enrollment row numbers are NOT rows of this
 * cohort on the enrollments tab. The Sheet is the record a paid status is
 * written onto, so a row number is only trusted once the Sheet says it sits
 * under this cohort_id. Header row is 1; data rows are 2-based.
 */
export function foreignRows(
  snapshot: EnrollmentSheetSnapshot,
  cohortId: string,
  rowNumbers: number[]
): number[] {
  const cohortCol = snapshot.header.indexOf("cohort_id");
  if (cohortCol === -1) return rowNumbers.slice();
  return rowNumbers.filter((n) => {
    if (!Number.isInteger(n) || n < 2) return true;
    const row = snapshot.rows[n - 2];
    return !row || String(row[cohortCol] ?? "") !== cohortId;
  });
}

export type ResolvedEnrollGate = {
  decision: EnrollGateDecision;
  /** The token's lookup in this cohort, for the invite id and email. */
  lookup: GateInviteLookup | null;
  /** The invited account holder's email when admitted by a valid token. */
  inviteEmail: string | null;
  /** The token names a declined invite in this cohort (refused with #75's copy). */
  declined: boolean;
};

/** Sent back with a 403 when a private cohort has no admitting invite. */
export const INVITE_ONLY_ERROR =
  "This cohort is invite-only — email info@tennisbootcamp.ca for an invite.";

/**
 * The JSON a payment route (or /api/enroll) answers a refused gate with. A
 * declined token gets #75's own copy and status, not the generic line.
 */
export function gateRefusal(
  gate: Pick<ResolvedEnrollGate, "decision" | "declined">
): { error: string; status: 403 | 404 | 409 } | null {
  const { decision } = gate;
  if (decision.allowed) return null;
  if (decision.status === 404) return { error: "Cohort not found.", status: 404 };
  if (gate.declined) return { error: DECLINED_INVITE_ERROR, status: 409 };
  return { error: INVITE_ONLY_ERROR, status: 403 };
}

/**
 * Whether a player that settled onto no invite is worth the coach's inbox.
 * The console line is always written; the email only when the cohort runs
 * on invites (a public cohort with no invite is the ordinary case) and the
 * invite is not simply already paid (a Stripe retry of a settled session).
 */
export function unmatchedSignal(params: {
  matched: boolean;
  alreadyPaid: boolean;
  requiresInvite: boolean;
}): { warn: boolean; email: boolean } {
  const { matched, alreadyPaid, requiresInvite } = params;
  if (matched) return { warn: false, email: false };
  return { warn: true, email: requiresInvite && !alreadyPaid };
}

// ─── E-transfer rail: which invite row a player's transfer lands on ───────────

export type EtransferRowPlan = "token" | "participant" | "email" | "create";

/**
 * recordEtransferIntent resolves one invite row per player. The token names
 * the first player's row; a participant names their own; the newest live
 * invite for the email serves the FIRST player only — for a later player it
 * would be player one's row, so they get a row of their own instead (backlog
 * #38). Mirrors how the rail already creates a row for a level-admitted
 * player with no invite.
 */
export function etransferRowPlan(params: {
  hasToken: boolean;
  participantId: string | null | undefined;
  playerIndex: number;
}): EtransferRowPlan[] {
  const steps: EtransferRowPlan[] = [];
  if (params.hasToken) steps.push("token");
  if (params.participantId) steps.push("participant");
  else if (params.playerIndex === 0) steps.push("email");
  steps.push("create");
  return steps;
}

/**
 * Run the gate for a cohort and the token the request carried (query, cookie
 * or JSON body). The signed-in player's level is only read when a tier-gated
 * private cohort has no admitting token, exactly as the page did.
 */
export async function resolveEnrollGate(
  cohort: Cohort | null | undefined,
  token: string | null | undefined,
  opts: { payable?: boolean } = {}
): Promise<ResolvedEnrollGate> {
  const tokenParam = (token ?? "").trim() || null;
  const tokenSent = Boolean(tokenParam);
  const first = decideEnrollGate({ cohort, tokenSent, lookup: null, payable: opts.payable });
  if (!first.allowed && first.status === 404) {
    return { decision: first, lookup: null, inviteEmail: null, declined: false };
  }

  // The token is looked up whenever one was sent (a public cohort's checkout
  // still links the payment to its invite row); the level only when a
  // tier-gated private cohort has nothing else admitting the player.
  const c = cohort as Cohort;
  let lookup: GateInviteLookup | null = null;
  if (tokenParam) {
    const { getInviteByToken } = await import("@/lib/cohortActions");
    lookup = await getInviteByToken(c.id, tokenParam);
  }
  let decision = decideEnrollGate({ cohort: c, tokenSent, lookup, payable: opts.payable });
  if (!decision.allowed && (c.levelMin != null || c.levelMax != null)) {
    decision = decideEnrollGate({
      cohort: c,
      tokenSent,
      lookup,
      playerLevel: await signedInPlayerLevel(),
      payable: opts.payable,
    });
  }
  const inviteEmail =
    decision.allowed && decision.via === "invite" && lookup?.state === "valid"
      ? lookup.invite.email ?? null
      : null;
  // getInviteByToken folds a declined row into "invalid"; the refusal copy
  // tells a declined player what to do (#75), so look once more when refused.
  let declined = false;
  if (!decision.allowed && tokenParam && lookup?.state === "invalid") {
    const { findInviteRefByToken } = await import("@/lib/cohortActions");
    const row = await findInviteRefByToken(c.id, tokenParam).catch(() => null);
    declined = row?.status === "declined";
  }
  return { decision, lookup, inviteEmail, declined };
}

/** The signed-in player's coach-assigned level from their profile, else null. */
async function signedInPlayerLevel(): Promise<number | string | null> {
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: profile } = await supabase
      .from("profiles")
      .select("level")
      .eq("id", user.id)
      .maybeSingle();
    return (profile as { level?: number | string | null } | null)?.level ?? null;
  } catch {
    return null;
  }
}
