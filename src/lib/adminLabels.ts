// The admin's words for stored values (audit L20, L23): program titles, not
// slugs; statuses in sentence case, not raw enum values; a self-estimate as
// the player said it, with the provisional tier it maps to. Pure, so the
// admin clients (all "use client") and the tests share it.

import { programs } from "@/content/programs";
import { provisionalTierFor, selfLevelLabel } from "@/lib/level";

/** "Youth Programs" for "youth-programs"; the id itself when unknown. */
export function programTitleFor(programId: string): string {
  return programs.find((p) => p.id === programId)?.title ?? programId;
}

export const COHORT_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  inviting: "Inviting",
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

export const BOOKING_STATUS_LABELS: Record<string, string> = {
  pending: "Awaiting payment",
  booked: "Booked",
  completed: "Completed",
  no_show: "No-show",
  requested: "Requested",
  expired: "Expired",
  cancelled: "Cancelled",
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
 * "Quiz: I can rally (≈ Rally)" — the player's own answer and the tier it
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
