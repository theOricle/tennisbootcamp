import type { Cohort } from "@/types/cohort";
import { todayIso } from "@/lib/cohortVisibility";
import { addDaysISO } from "@/lib/makeup";
import { adminMoney } from "@/lib/adminLabels";

// "Waiting on you" on /admin (backlog #104): what the coach has to act on,
// as a short list over the five cards. Each line is a count, a few plain
// words and a link to the page where it is done:
//
//   e-transfers a player says they sent and the coach has not marked
//   received, per cohort, with each amount due as the cohort's page shows it;
//   assessment requests that have no time yet;
//   today's and tomorrow's assessments, by the date in Toronto;
//   held spots whose hold ends today, per cohort.
//
// Test bookings are left out, and card payments are not counted at all (a
// test payment holds no seat). When nothing waits it says so in one quiet
// line. When a read failed, or came back cut short of the rows that match,
// it says it could not check, and never that nothing waits.
//
// Pure, with no database: the reads live in src/lib/adminDeskReads.ts
// (server-only, called after the admin gate), and
// src/scripts/test-coach-tools.ts drives every line with rows in memory.

/** The slice of a cohort the desk reads. */
export type DeskCohort = Pick<Cohort, "id" | "label" | "dbStatus">;

/** The slice of an invite row the desk reads. */
export type DeskInvite = {
  id: string;
  cohort_id: string;
  status: string;
  payment_method: string | null;
  /** The hold's end, a UTC instant. */
  expires_at: string;
};

/** The slice of an assessment booking the desk reads; `block_date` is its day in Toronto, null with no slot. */
export type DeskBooking = { id: string; status: string; block_date: string | null };

/** One read's answer: its rows, or that it failed. */
export type DeskRead<T> = { ok: true; data: T } | { ok: false };

export type DeskLine = {
  key: string;
  count: number;
  /** The few words after the count: "e-transfers to mark received". */
  text: string;
  /** The smaller line under it: the cohort, and the amounts due. */
  detail: string | null;
  href: string;
};

/** A side of the desk that could not be read: what it says, and the page to look on. */
export type DeskGap = { key: string; text: string; href: string; linkLabel: string };

export type Desk = {
  lines: DeskLine[];
  gaps: DeskGap[];
  /** Every read answered and nothing waits: the one quiet line shows. */
  quiet: boolean;
};

export const DESK_HEADING = "Waiting on you";
export const DESK_QUIET_LINE = "Nothing is waiting on you.";
export const DESK_COHORTS_GAP = "Couldn't check the e-transfers and held spots.";
export const DESK_ASSESSMENTS_GAP = "Couldn't check the assessments.";

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** The cohort statuses that can still take a payment: every one but cancelled and completed. */
export const LIVE_COHORT_STATUSES = ["draft", "inviting", "confirmed", "running"] as const;

/** A cohort the coach still acts on: not cancelled, not completed. */
function cohortIsLive(cohort: DeskCohort | undefined): cohort is DeskCohort {
  return !!cohort && (LIVE_COHORT_STATUSES as readonly string[]).includes(cohort.dbStatus ?? "");
}

/**
 * An e-transfer sent and not yet marked received: the invite is unpaid
 * (invited, or expired when its hold lapsed while the money was on its way)
 * and its payment method is e-transfer. The cohort page reads these rows
 * "E-transfer sent, awaiting receipt" and offers "Mark paid…" on both.
 */
export function transferIsWaiting(invite: { status: string; payment_method?: string | null }): boolean {
  return (invite.status === "invited" || invite.status === "expired") && invite.payment_method === "etransfer";
}

/**
 * A held spot whose hold ends today in Toronto and has not ended yet. A
 * waiting e-transfer is not counted here: it has its own line.
 */
export function holdEndsToday(invite: DeskInvite, now: Date): boolean {
  if (invite.status !== "invited" || invite.payment_method === "etransfer") return false;
  const end = new Date(invite.expires_at);
  if (Number.isNaN(end.getTime()) || end.getTime() <= now.getTime()) return false;
  return todayIso(end) === todayIso(now);
}

/** "$190 due" · "$190 and $170 due" · "$190, $170 and $170 due": each amount as the cohort's page shows it. */
export function amountsDue(cents: readonly number[]): string {
  const each = cents.map(adminMoney);
  if (each.length === 0) return "";
  const list = each.length === 1 ? each[0] : `${each.slice(0, -1).join(", ")} and ${each[each.length - 1]}`;
  return `${list} due`;
}

export type CohortSide = {
  cohorts: readonly DeskCohort[];
  invites: readonly DeskInvite[];
  /**
   * What each waiting e-transfer owes, by invite id, read with the function
   * the cohort's page uses; null where that read failed. A cohort with any
   * amount missing shows its count alone.
   */
  amountDueCents: ReadonlyMap<string, number | null>;
};

/** The cohort lines: e-transfers to mark received, then held spots that end today, each per cohort. */
function cohortLines(side: CohortSide, now: Date): { transfers: DeskLine[]; holds: DeskLine[] } {
  const byId = new Map(side.cohorts.map((c) => [c.id, c]));
  const transfers: DeskLine[] = [];
  const holds: DeskLine[] = [];
  for (const cohort of side.cohorts) {
    if (!cohortIsLive(byId.get(cohort.id))) continue;
    const mine = side.invites.filter((i) => i.cohort_id === cohort.id);
    const waiting = mine.filter(transferIsWaiting);
    if (waiting.length > 0) {
      const amounts = waiting.map((i) => side.amountDueCents.get(i.id) ?? null);
      const known = amounts.every((a): a is number => typeof a === "number");
      transfers.push({
        key: `transfers-${cohort.id}`,
        count: waiting.length,
        text: plural(waiting.length, "e-transfer to mark received", "e-transfers to mark received"),
        detail: known ? `${cohort.label} · ${amountsDue(amounts as number[])}` : cohort.label,
        href: `/admin/cohorts/${cohort.id}`,
      });
    }
    const ending = mine.filter((i) => holdEndsToday(i, now));
    if (ending.length > 0) {
      holds.push({
        key: `holds-${cohort.id}`,
        count: ending.length,
        text: plural(ending.length, "held spot ends today", "held spots end today"),
        detail: cohort.label,
        href: `/admin/cohorts/${cohort.id}`,
      });
    }
  }
  return { transfers, holds };
}

/** The assessment lines: requests with no time, then today's and tomorrow's bookings. Test bookings never count. */
function assessmentLines(bookings: readonly DeskBooking[], now: Date): DeskLine[] {
  const today = todayIso(now);
  const tomorrow = addDaysISO(today, 1);
  const requests = bookings.filter((b) => b.status === "requested").length;
  const booked = bookings.filter((b) => b.status === "booked");
  const onToday = booked.filter((b) => b.block_date === today).length;
  const onTomorrow = booked.filter((b) => b.block_date === tomorrow).length;
  const href = "/admin/assessments";
  const lines: DeskLine[] = [];
  if (requests > 0) {
    lines.push({
      key: "requests",
      count: requests,
      text: plural(requests, "assessment request without a time", "assessment requests without a time"),
      detail: null,
      href,
    });
  }
  if (onToday > 0) {
    lines.push({ key: "today", count: onToday, text: plural(onToday, "assessment today", "assessments today"), detail: null, href });
  }
  if (onTomorrow > 0) {
    lines.push({
      key: "tomorrow",
      count: onTomorrow,
      text: plural(onTomorrow, "assessment tomorrow", "assessments tomorrow"),
      detail: null,
      href,
    });
  }
  return lines;
}

/**
 * The desk from its two reads. A side that failed adds a line saying it
 * could not check; the other side's lines still show. The quiet line shows
 * only when both sides answered and neither has anything.
 */
export function deskFrom(input: {
  now: Date;
  cohorts: DeskRead<CohortSide>;
  assessments: DeskRead<readonly DeskBooking[]>;
}): Desk {
  const cohortSide = input.cohorts.ok ? cohortLines(input.cohorts.data, input.now) : { transfers: [], holds: [] };
  const assessmentSide = input.assessments.ok ? assessmentLines(input.assessments.data, input.now) : [];
  const lines = [...cohortSide.transfers, ...assessmentSide, ...cohortSide.holds];
  const gaps: DeskGap[] = [];
  if (!input.cohorts.ok) {
    gaps.push({ key: "cohorts", text: DESK_COHORTS_GAP, href: "/admin/cohorts", linkLabel: "Open Cohorts" });
  }
  if (!input.assessments.ok) {
    gaps.push({ key: "assessments", text: DESK_ASSESSMENTS_GAP, href: "/admin/assessments", linkLabel: "Open Assessments" });
  }
  return { lines, gaps, quiet: gaps.length === 0 && lines.length === 0 };
}
