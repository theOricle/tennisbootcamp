// Open a draft cohort to the public from its admin page, and take an open one
// back to draft while nobody holds a seat in it (backlog #95). Pure and
// client-safe: the admin API's guard and the cohort page's controls read the
// same rules, so the page offers a move only when the API would make it, and
// the API checks every request again before it writes.
//
//   draft → inviting   only when the cohort is public and its first class is
//                      still ahead in Toronto: the moment the site would list
//                      it (isCohortRenderable and isCohortPublic,
//                      src/lib/cohortVisibility.ts, read here, never changed).
//   inviting → draft   only while no seat is held or paid (seatHeldOrPaid).
//
// Every other request is refused with a plain line and writes nothing. The
// admin screens call `inviting` "Open" (src/lib/adminLabels.ts).

import type { Cohort } from "@/types/cohort";
import { isCohortRenderable } from "@/lib/cohortVisibility";

/** The two moves, by the admin API's action names. */
export const OPENING_MOVES = ["open", "back_to_draft"] as const;
export type OpeningMove = (typeof OPENING_MOVES)[number];

// ─── Seats ────────────────────────────────────────────────────────────────────

/**
 * The seat records one cohort holds, as the enrollment path writes them
 * (traced from /enroll/[cohortId], /api/checkout, /api/enroll/etransfer and
 * the Stripe webhook):
 *   - its cohort_invites rows. `invited` is a held spot: an invitation's
 *     hold, or an e-transfer the player says is on its way (the hold row
 *     recordEtransferIntent writes). `paid` is a seat paid for, by card or by
 *     an e-transfer the coach marked received;
 *   - its enrollments rows (Supabase), `paid` once a card payment settles or
 *     the coach marks an e-transfer received. A card payment on a public
 *     cohort with no invitation settles onto no invite, so this row is its
 *     record;
 *   - its rows on the Sheet's enrollments tab marked `paid`: the record the
 *     sign-up page's seat count reads (seatsFromSnapshot, src/lib/seatCount.ts).
 * As the seat count reads them, none of these holds a seat: a test payment
 * (test_paid), a refund or a dispute, an expired or declined invite, or a
 * checkout that was never paid (pending).
 */
export type SeatRecords = {
  /** The status of each of the cohort's cohort_invites rows. */
  inviteStatuses: readonly (string | null | undefined)[];
  /** The status of each of the cohort's enrollments rows. */
  enrollmentStatuses: readonly (string | null | undefined)[];
  /**
   * The cohort's paid rows on the Sheet, or null when the Sheet isn't set up
   * (local development), where the sign-up page skips its seat count too.
   */
  sheetPaidRows: number | null;
};

/** The invite statuses that hold a seat: a live hold, or paid. */
export const SEAT_INVITE_STATUSES: readonly string[] = ["invited", "paid"];
/** The enrollment row status that holds a seat. */
export const SEAT_ENROLLMENT_STATUSES: readonly string[] = ["paid"];

/** Does any record hold a seat, or show one paid for? */
export function seatHeldOrPaid(records: SeatRecords): boolean {
  return (
    records.inviteStatuses.some((s) => SEAT_INVITE_STATUSES.includes(s ?? "")) ||
    records.enrollmentStatuses.some((s) => SEAT_ENROLLMENT_STATUSES.includes(s ?? "")) ||
    (records.sheetPaidRows ?? 0) > 0
  );
}

// ─── The rules ────────────────────────────────────────────────────────────────

/**
 * Is the cohort's first class still ahead in Toronto? The site's own rule and
 * clock (isCohortRenderable), read as if the cohort were open. `when` is the
 * moment in Toronto, "YYYY-MM-DDTHH:MM"; left out, it is now.
 */
export function firstClassAhead(cohort: Cohort, when?: string): boolean {
  return isCohortRenderable({ ...cohort, dbStatus: "inviting" }, when);
}

/** The button that opens a draft, and the line under it. */
export const OPEN_BUTTON = "Open to the public";
export const OPEN_LINE = "A draft is hidden from the site. Once it's open, the site lists it until its first class.";
/** A private draft's line on its page, and the API's answer when asked to open one. */
export const PRIVATE_LINE = "A private cohort opens when you send its first invitation.";
/** The button that takes an open cohort back to draft. */
export const BACK_TO_DRAFT_BUTTON = "Back to draft";

/** What a refused move says, shown in the cohort page's status line. */
export const OPENING_ERRORS = {
  notFound: "Cohort not found.",
  notDraft: "Only a draft can open.",
  private: PRIVATE_LINE,
  started: "Its first class has started, so it can't open.",
  notOpen: "Only an open cohort can go back to draft.",
  seatTaken: "A player holds or has paid for a seat, so it can't go back to draft.",
  seatsUnread: "Couldn't check the seats. Try again.",
  // The line every other status change on the page gives when it loses the race.
  changed: "That cohort changed state — refresh and try again.",
  unknown: "Unknown action.",
} as const;

export type OpeningDecision =
  | { ok: true; from: "draft"; to: "inviting" }
  | { ok: true; from: "inviting"; to: "draft" }
  | { ok: false; error: string };

/**
 * May this cohort make this move now? Open: a public draft whose first class
 * is still ahead. Back to draft: an open cohort with no seat held or paid;
 * `seatHeldOrPaid` is read for that move only, and left out it counts as
 * held. Anything else is refused.
 */
export function decideOpening(input: {
  move: string;
  cohort: Cohort | null | undefined;
  seatHeldOrPaid?: boolean;
  when?: string;
}): OpeningDecision {
  const { move, cohort } = input;
  if (!cohort || !cohort.dbStatus) return { ok: false, error: OPENING_ERRORS.notFound };
  if (move === "open") {
    if (cohort.dbStatus !== "draft") return { ok: false, error: OPENING_ERRORS.notDraft };
    if (cohort.visibility !== "public") return { ok: false, error: OPENING_ERRORS.private };
    if (!firstClassAhead(cohort, input.when)) return { ok: false, error: OPENING_ERRORS.started };
    return { ok: true, from: "draft", to: "inviting" };
  }
  if (move === "back_to_draft") {
    if (cohort.dbStatus !== "inviting") return { ok: false, error: OPENING_ERRORS.notOpen };
    if (input.seatHeldOrPaid !== false) return { ok: false, error: OPENING_ERRORS.seatTaken };
    return { ok: true, from: "inviting", to: "draft" };
  }
  return { ok: false, error: OPENING_ERRORS.unknown };
}

/** The opening row on the cohort page: at most one per cohort. */
export type OpeningControl = "open" | "private" | "back_to_draft" | null;

/**
 * Which opening row the cohort page shows: "open" (the button and its line)
 * for a draft the API would open; "private" (the line alone) for a private
 * draft whose first class is still ahead; "back_to_draft" (the button) for an
 * open cohort the API would take back, judged on the records the page has
 * read; none for a draft whose first class has passed, or any other status.
 */
export function openingControl(cohort: Cohort, records: SeatRecords, when?: string): OpeningControl {
  if (decideOpening({ move: "open", cohort, when }).ok) return "open";
  if (cohort.dbStatus === "draft" && cohort.visibility === "private" && firstClassAhead(cohort, when)) {
    return "private";
  }
  if (decideOpening({ move: "back_to_draft", cohort, seatHeldOrPaid: seatHeldOrPaid(records), when }).ok) {
    return "back_to_draft";
  }
  return null;
}

// ─── The API's move ───────────────────────────────────────────────────────────

/** What the API's move reads and writes, passed in so the tests can run it on a fake store. */
export type OpeningStore = {
  readCohort: (id: string) => Promise<Cohort | null | undefined>;
  /** The cohort's seat records; null, or a throw, when one could not be read. */
  readSeatRecords: (cohort: Cohort) => Promise<SeatRecords | null>;
  /**
   * Compare-and-set: the cohort moves from `from` to `to` only while it still
   * reads `from`. `moved` is false when it no longer did.
   */
  setStatusIf: (id: string, from: string, to: string) => Promise<{ moved: boolean; error?: string }>;
  /** Mark the public pages that list cohorts stale. */
  revalidate: () => void;
};

export type OpeningResult = { ok: true; status: "inviting" | "draft" } | { ok: false; error: string };

/**
 * The admin API's two actions, "open" and "back_to_draft": read the cohort,
 * and for back_to_draft its seat records; decide; then one compare-and-set on
 * the status the decision allowed the move from, and the public pages
 * refresh. A refusal writes nothing.
 */
export async function runOpeningMove(
  store: OpeningStore,
  input: { cohortId: string; move: string; when?: string }
): Promise<OpeningResult> {
  const cohort = await store.readCohort(input.cohortId);
  let held: boolean | undefined;
  if (input.move === "back_to_draft" && cohort?.dbStatus === "inviting") {
    const records = await store.readSeatRecords(cohort).catch(() => null);
    if (!records) return { ok: false, error: OPENING_ERRORS.seatsUnread };
    held = seatHeldOrPaid(records);
  }
  const decision = decideOpening({ move: input.move, cohort, seatHeldOrPaid: held, when: input.when });
  if (!decision.ok) return decision;
  const flip = await store.setStatusIf(input.cohortId, decision.from, decision.to);
  if (flip.error) return { ok: false, error: flip.error };
  if (!flip.moved) return { ok: false, error: OPENING_ERRORS.changed };
  store.revalidate();
  return { ok: true, status: decision.to };
}

// ─── set_status ───────────────────────────────────────────────────────────────

/**
 * The statuses the API's set_status still sets, exactly as before: draft and
 * open move only through the two actions above, and a cohort is confirmed
 * when its paid players reach the minimum (or by Reopen cohort).
 */
export const DIRECT_STATUSES: readonly string[] = ["running", "completed", "cancelled"];
export const DIRECT_STATUS_ERROR = "That status can't be set directly.";

/** set_status's refusal for a status it doesn't set, else null. */
export function directStatusRefusal(status: string): string | null {
  return DIRECT_STATUSES.includes(status) ? null : DIRECT_STATUS_ERROR;
}
