// The admin's words for stored values (audit L20, L23): program titles, not
// slugs; statuses in sentence case, not raw enum values; a self-estimate as
// the player said it, with the provisional tier it maps to. Pure, so the
// admin clients (all "use client") and the tests share it.

import { programs } from "@/content/programs";
import { provisionalTierFor, selfLevelLabel } from "@/lib/level";

/** "Youth Bootcamps" for "youth-programs"; the id itself when unknown. */
export function programTitleFor(programId: string): string {
  return programs.find((p) => p.id === programId)?.title ?? programId;
}

export const COHORT_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  // Backlog #95: a public one is listed on the site until its first class,
  // a private one takes its invitees. A draft opens from its page, or with
  // its first invitation.
  inviting: "Open",
  confirmed: "Confirmed",
  running: "Running",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const INVITE_STATUS_LABELS: Record<string, string> = {
  invited: "Invited",
  paid: "Paid",
  expired: "Expired",
  declined: "Declined",
};

/**
 * A card payment on the cohort page (backlog #84): an enrollment row's
 * status as the coach reads it. A test payment (Stripe test keys, or mock
 * mode) took no money and holds no seat, and says so; a full refund or a
 * dispute in Stripe released the seat.
 */
export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  paid: "Paid",
  test_paid: "Test payment",
  refunded: "Refunded",
  disputed: "Disputed",
};

export const BOOKING_STATUS_LABELS: Record<string, string> = {
  pending: "Awaiting payment",
  booked: "Booked",
  completed: "Completed",
  no_show: "No-show",
  requested: "Requested",
  expired: "Expired",
  cancelled: "Cancelled",
  // Backlog #84: a test-mode payment holds no slot; a full refund or a
  // dispute in Stripe released the booking.
  test: "Test booking",
  refunded: "Refunded",
  disputed: "Disputed",
};

/** A stored status in sentence case: the table's word, else the value tidied. */
export function statusLabel(table: Record<string, string>, status: string | null | undefined): string {
  if (!status) return "";
  const known = table[status];
  if (known) return known;
  const words = status.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * "Quiz: I can rally (≈ Novice)" — the player's own answer and the tier it
 * maps to (owner D4), always marked as approximate; "Quiz: Not sure" with no
 * tier. Empty when there is no answer on file.
 */
export function selfEstimateLine(
  value: string | null | undefined,
  { self = true, source = "Quiz" }: { self?: boolean; source?: string } = {}
): string {
  if (value === null || value === undefined) return "";
  const label = selfLevelLabel(value, { self }) || value.trim();
  if (!label) return "";
  const tier = provisionalTierFor(value);
  return `${source}: ${label}${tier ? ` (≈ ${tier.name})` : ""}`;
}
