// The dashboard's states (audit M25, M26, M30, M32): what the next-step card
// says, what each enrollment's chip reads, and the credit line. Pure — no
// React, no database — so the page and test-dashboard-state.ts read one
// rule. src/app/dashboard/page.tsx reads the rows; this decides the words.
//
// The next-step card is the one primary on the page and picks the most
// urgent thing on the account, in this order:
//   1. an open invite: a spot held for a player, with its hold deadline
//   2. an e-transfer waiting on Sina: amount, recipient and memo
//   3. a booked assessment: date, time and what to bring
//   4. the next session of a paid enrollment (pending and cancelled ones
//      never drive it)
//   5. a paid cohort whose dates aren't generated yet
//   6. otherwise: Sina is placing the players, nothing else to do.

import type { Cohort } from "@/types/cohort";
import { formatDollars, numberInWords } from "@/content/programs";
import { dayNameForDate } from "@/lib/makeup";
import { etransferMemo } from "@/lib/paymentTransitions";
import { formatTierSpan, hasLevel } from "@/lib/tiers";
import { firstNameOf, namesList, possessive, type RosterPlayer } from "@/lib/householdView";

// ─── Row shapes (what page.tsx hands over) ────────────────────────────────────

export type DashEnrollment = {
  id: string;
  cohort_id: string;
  program: string | null;
  participant_name: string | null;
  status: string;
  created_at: string;
};

export type DashSession = {
  id: string;
  cohort_id: string;
  session_date: string;
  start_time: string;
  end_time: string;
  status: "scheduled" | "completed" | "cancelled";
  makeup_for: string | null;
};

export type DashInvite = {
  id: string;
  cohort_id: string;
  token: string;
  status: "invited" | "paid" | "declined" | "expired";
  expires_at: string;
  payment_method?: "card" | "etransfer" | null;
  participant_id?: string | null;
  /**
   * The player's name as the e-transfer intent wrote it (backlog #38), for an
   * invite that names no participant (a signed-out enroll).
   */
  payment_note?: string | null;
  /** Price minus the player's unused $20, for an unpaid invite. */
  amountDueCents: number | null;
  /**
   * The assessment booking whose $20 `amountDueCents` takes off, if any. Two
   * invites under one email with no participant find the same booking; the
   * $20 comes off once (etransferTotalCents).
   */
  creditBookingId?: string | null;
};

export type DashBooking = {
  id: string;
  participantId: string | null;
  playerName: string;
  /** "YYYY-MM-DD" */
  date: string;
  /** "HH:MM" */
  start: string;
  locationLabel: string | null;
};

export type DashCredit = {
  bookingId: string;
  participantId: string | null;
  playerName: string;
  creditCents: number;
};

type ProgramRef = { id: string; title: string };

// ─── Formatting (fixed, so server and tests agree) ────────────────────────────

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_PLURAL: Record<string, string> = {
  Mon: "Mondays",
  Tue: "Tuesdays",
  Wed: "Wednesdays",
  Thu: "Thursdays",
  Fri: "Fridays",
  Sat: "Saturdays",
  Sun: "Sundays",
};

/** "17:00" | "17:00:00" → "5pm"; "17:30" → "5:30pm". */
export function fmt12h(time: string): string {
  const [h, m] = time.slice(0, 5).split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 || 12;
  return m === 0 ? `${hour}${suffix}` : `${hour}:${String(m).padStart(2, "0")}${suffix}`;
}

/** "2026-10-18" → "Oct 18". */
export function fmtMonthDay(iso: string): string {
  const [, mo, d] = iso.split("-").map(Number);
  return `${MONTHS[mo - 1]} ${d}`;
}

/** "2026-10-18" → "Sat Oct 18". */
export function fmtDayDate(iso: string): string {
  return `${dayNameForDate(iso)} ${fmtMonthDay(iso)}`;
}

/**
 * An invite's hold deadline in Toronto time: "Fri, Oct 17, 6:00pm". Holds
 * are stored as UTC instants; the player reads the clock they live on.
 */
export function fmtHoldDeadline(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const dayPeriod = get("dayPeriod").toLowerCase().replace(/\./g, "").replace(/\s/g, "");
  return `${get("weekday").replace(/\.$/, "")}, ${get("month").replace(/\.$/, "")} ${get("day")}, ${get("hour")}:${get("minute")}${dayPeriod}`;
}

/** "Saturdays 12pm–1pm" from a cohort's weekly slots. */
export function weeklySlots(cohort: Pick<Cohort, "sessions">): string {
  return cohort.sessions
    .map((s) => `${DAY_PLURAL[s.day] ?? s.day} ${fmt12h(s.start)}–${fmt12h(s.end)}`)
    .join(", ");
}

function money(cents: number): string {
  return formatDollars(Math.round(cents) / 100);
}

function weeksPhrase(weeks: number): string {
  return `${numberInWords(weeks)} week${weeks === 1 ? "" : "s"}`;
}

// ─── Enrollment status (audit M25, M30) ───────────────────────────────────────

export type EnrollmentState =
  | "enrolled"
  | "test"
  | "etransfer-pending"
  | "payment-pending"
  | "cancelled"
  | "on-file";

/**
 * What an enrollment row is right now. A cancelled cohort wins over the
 * row's own status (audit M30): the sessions are off whatever was paid.
 */
export function enrollmentState(
  enrollment: Pick<DashEnrollment, "status">,
  cohort: Pick<Cohort, "dbStatus" | "paymentMode"> | null | undefined
): EnrollmentState {
  if (cohort?.dbStatus === "cancelled") return "cancelled";
  if (enrollment.status === "paid") return "enrolled";
  if (enrollment.status === "test_paid") return "test";
  if (enrollment.status === "pending" || enrollment.status === "pending_etransfer") {
    return cohort?.paymentMode === "etransfer" ? "etransfer-pending" : "payment-pending";
  }
  return "on-file";
}

/** True when the enrollment's sessions are the player's own (it drives "Next session"). */
export function enrollmentIsActive(state: EnrollmentState): boolean {
  return state === "enrolled" || state === "test";
}

/** The chip on My programs and /profile: sentence case, never a raw status. */
export const ENROLLMENT_CHIP: Record<EnrollmentState, { label: string; tone: "lime" | "neutral" | "warn" | "muted" }> = {
  enrolled: { label: "Enrolled", tone: "lime" },
  test: { label: "Test enrollment", tone: "neutral" },
  "etransfer-pending": { label: "E-transfer pending", tone: "warn" },
  "payment-pending": { label: "Payment pending", tone: "warn" },
  cancelled: { label: "Cancelled", tone: "muted" },
  "on-file": { label: "On file", tone: "neutral" },
};

/** The line under a card whose state needs one; null for the ordinary ones. */
export function enrollmentNote(state: EnrollmentState): string | null {
  switch (state) {
    case "cancelled":
      // Owner decision D22 (what a cancellation tells players) is open, so
      // the card promises nothing beyond the fact and who follows up.
      return "This cohort was cancelled. Sina will contact you directly.";
    case "etransfer-pending":
      return "The spot is held while Sina confirms the e-transfer arrived.";
    case "payment-pending":
      return "The card payment didn't complete. Email info@tennisbootcamp.ca if that looks wrong.";
    case "test":
      return "A test enrollment: no money was taken.";
    default:
      return null;
  }
}

// ─── Who a row is about ───────────────────────────────────────────────────────

function norm(name: string | null | undefined): string {
  return (name ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/** The roster player an invite, booking or credit names, by id then by name. */
export function playerFor<T extends RosterPlayer>(
  roster: readonly T[],
  ref: { participantId?: string | null; name?: string | null }
): T | null {
  if (ref.participantId) {
    const byId = roster.find((p) => p.id === ref.participantId);
    if (byId) return byId;
  }
  const name = norm(ref.name);
  if (name) return roster.find((p) => norm(p.full_name) === name) ?? null;
  return null;
}

// ─── Next step ────────────────────────────────────────────────────────────────

export type NextStepKind =
  | "invite"
  | "etransfer"
  | "assessment"
  | "session"
  | "dates-coming"
  | "placing"
  | "placed";

export type NextStep = {
  kind: NextStepKind;
  eyebrow: string;
  headline: string;
  detail: string;
  primary?: { href: string; label: string };
  secondary?: { href: string; label: string };
};

export type NextStepInput = {
  /** The holder's own player record. */
  selfId: string | null;
  /** The people on the account who train (src/lib/householdView.ts). */
  roster: readonly RosterPlayer[];
  /** "you" when the holder is the only player; "named" otherwise. */
  voice: "you" | "named";
  enrollments: readonly DashEnrollment[];
  cohorts: readonly Cohort[];
  sessionsByCohort: Record<string, readonly DashSession[]>;
  programs: readonly ProgramRef[];
  invites: readonly DashInvite[];
  bookings: readonly DashBooking[];
  /** Interac recipient (src/lib/paymentTransitions.ts etransferRecipient). */
  recipientEmail: string;
  /** "YYYY-MM-DD" in Toronto. */
  today: string;
  /** The current instant (ISO); invite holds are compared against it. */
  now: string;
};

const ASSESSMENT_LINE =
  "If you want a level confirmed on court first, the 20-minute assessment is optional. It costs $20, and if you enroll in a program afterward that $20 comes off the price.";
const BRING_LINE = "Bring a racquet if you have one, water, and court shoes.";

function programTitle(programs: readonly ProgramRef[], cohort: Cohort | undefined, fallback: string): string {
  return programs.find((p) => p.id === cohort?.programId)?.title ?? fallback;
}

/** "Deuce group" for a banded cohort, else the cohort's own label. */
function groupName(cohort: Cohort): string {
  const span = formatTierSpan(cohort.levelMin, cohort.levelMax);
  return span ? `${span} group` : cohort.label;
}

/**
 * True when a row's own name (an e-transfer note, a booking's player name)
 * is the holder's: the full name, or the first name alone, folded for case
 * and spaces.
 */
function namesHolder(input: NextStepInput, name: string | null): boolean {
  const holder = input.roster.find((p) => p.id === input.selfId)?.full_name;
  if (!norm(holder) || !norm(name)) return false;
  return norm(name) === norm(holder) || norm(firstNameOf(name)) === norm(firstNameOf(holder));
}

/**
 * The player a row is for: "your" / "Maya's", and the name used in buttons.
 * A row with no roster player is the holder's under "you" only when it names
 * nobody or names the holder; a row named for someone else (a signed-out
 * enroll's note, "Leo Chen") reads by that name.
 */
function whose(
  input: NextStepInput,
  player: RosterPlayer | null,
  fallbackName: string | null
): { owner: string; Owner: string; name: string | null; isSelf: boolean } {
  const isSelf =
    (player !== null && player.id === input.selfId) ||
    (player === null &&
      input.voice === "you" &&
      (!norm(fallbackName) || namesHolder(input, fallbackName)));
  if (isSelf) return { owner: "your", Owner: "Your", name: null, isSelf: true };
  const name = firstNameOf(player?.full_name ?? fallbackName) || "your player";
  const p = name === "your player" ? "your player's" : possessive(name);
  return { owner: p, Owner: p.charAt(0).toUpperCase() + p.slice(1), name, isSelf: false };
}

/**
 * Which of two waiting rows for one player stands: a live hold over a lapsed
 * one, else the newer hold.
 */
function replacesHold(kept: DashInvite, next: DashInvite): boolean {
  if (kept.status !== next.status) return next.status === "invited";
  return next.expires_at > kept.expires_at;
}

function cohortIsLive(cohort: Cohort | undefined, today: string): cohort is Cohort {
  return (
    !!cohort &&
    cohort.dbStatus !== "cancelled" &&
    cohort.dbStatus !== "completed" &&
    cohort.startDate >= today
  );
}

export function nextStepFor(input: NextStepInput): NextStep {
  const { roster, enrollments, cohorts, sessionsByCohort, programs, today, now } = input;
  const cohortById = new Map(cohorts.map((c) => [c.id, c]));

  // 1. An open invite: a held spot, not yet paid for or sent by e-transfer.
  const paidCohorts = new Set(
    enrollments
      .filter((e) => enrollmentIsActive(enrollmentState(e, cohortById.get(e.cohort_id))))
      .map((e) => e.cohort_id)
  );
  const open = input.invites
    .filter(
      (i) =>
        i.status === "invited" &&
        i.payment_method !== "etransfer" &&
        i.expires_at > now &&
        cohortIsLive(cohortById.get(i.cohort_id), today) &&
        !(paidCohorts.has(i.cohort_id) && input.voice === "you")
    )
    .sort((a, b) => a.expires_at.localeCompare(b.expires_at));
  if (open.length > 0) {
    const invite = open[0];
    const cohort = cohortById.get(invite.cohort_id) as Cohort;
    const who = whose(input, playerFor(roster, { participantId: invite.participant_id }), null);
    const price = money(cohort.priceCents);
    const due =
      invite.amountDueCents !== null && invite.amountDueCents < cohort.priceCents
        ? ` ${who.isSelf ? "Your" : who.Owner} $20 assessment comes off the price, so ${money(invite.amountDueCents)} is due.`
        : "";
    return {
      kind: "invite",
      eyebrow: "Spot held",
      headline: `${who.Owner} spot is held until ${fmtHoldDeadline(invite.expires_at)}.`,
      detail:
        `${programTitle(programs, cohort, cohort.programId)}, ${groupName(cohort)}. ` +
        `${weeklySlots(cohort)}, starting ${fmtMonthDay(cohort.startDate)}. ` +
        `${price} for the ${weeksPhrase(cohort.weeks)}.${due}`,
      primary: {
        href: `/enroll/${encodeURIComponent(cohort.id)}?invite=${encodeURIComponent(invite.token)}`,
        label: who.isSelf ? "Claim my spot" : `Claim ${who.name}'s spot`,
      },
    };
  }

  // 2. An e-transfer sent and waiting on Sina's confirmation. One transfer
  // can cover a household (the enroll wizard sends one for every player in a
  // cohort), so the card adds up every waiting invite in that cohort and
  // repeats the wizard's memo, everyone's name joined with " + ".
  const waiting = input.invites
    .filter(
      (i) =>
        (i.status === "invited" || i.status === "expired") &&
        i.payment_method === "etransfer" &&
        cohortIsLive(cohortById.get(i.cohort_id), today)
    )
    .sort((a, b) =>
      (cohortById.get(a.cohort_id)?.startDate ?? "").localeCompare(cohortById.get(b.cohort_id)?.startDate ?? "")
    );
  if (waiting.length > 0) {
    const cohort = cohortById.get(waiting[0].cohort_id) as Cohort;
    // One row per player: a lapsed hold beside a newer row for the same
    // player (the coach re-invited, or the player sent it again) is one
    // spot and one amount, not two.
    const byPlayer = new Map<
      string,
      { invite: DashInvite; who: ReturnType<typeof whose>; fullName: string }
    >();
    for (const i of waiting) {
      if (i.cohort_id !== cohort.id) continue;
      const note = i.payment_note?.trim() || null;
      const player = playerFor(roster, { participantId: i.participant_id, name: note });
      const who = whose(input, player, note);
      // "self" only for a row tied to the holder by player or note. Two rows
      // that name nobody (one email invited twice before the account
      // existed) can't be told apart, so each keeps its own spot and amount.
      const key = who.isSelf && (player || note)
        ? "self"
        : player
          ? `p:${player.id}`
          : i.participant_id
            ? `p:${i.participant_id}`
            : note
              ? `n:${norm(note)}`
              : `r:${i.id}`;
      const kept = byPlayer.get(key);
      if (kept && !replacesHold(kept.invite, i)) continue;
      byPlayer.set(key, { invite: i, who, fullName: player?.full_name?.trim() || note || kept?.fullName || "" });
    }
    const people = [...byPlayer.values()];
    const group = people.map((p) => p.invite);
    const amount = etransferTotalCents(group, cohort.priceCents);
    const memo = etransferMemo(
      people.map((p) => p.fullName).filter(Boolean).join(" + "),
      cohort.label
    );
    const program = programTitle(programs, cohort, cohort.programId);
    const [one] = people;
    const several = people.length > 1;
    const labels = people.map((p) => (p.who.isSelf ? "you" : p.who.name ?? "your player"));
    // Rows that read the same ("you and you": two rows naming nobody) are
    // counted instead of named.
    const counted = new Set(labels).size < labels.length;
    const names = namesList(labels);
    return {
      kind: "etransfer",
      eyebrow: "Payment pending",
      headline:
        !several && one.who.isSelf
          ? "Sina is confirming your e-transfer."
          : counted
            ? `Sina is confirming the e-transfer for ${people.length} spots.`
            : `Sina is confirming the e-transfer for ${names}.`,
      detail:
        `${money(amount)} to ${input.recipientEmail}, memo “${memo}”. ` +
        (counted
          ? `The ${people.length} spots in ${program} are held while Sina confirms it arrived.`
          : several
            ? `The spots for ${names} in ${program} are held while Sina confirms it arrived.`
            : `${one.who.Owner} spot in ${program} is held while Sina confirms it arrived.`),
      secondary: { href: "#my-programs", label: "See my programs" },
    };
  }

  // 3. A booked assessment.
  const booking = input.bookings.find((b) => b.date >= today);
  if (booking) {
    const who = whose(input, playerFor(roster, { participantId: booking.participantId, name: booking.playerName }), booking.playerName);
    return {
      kind: "assessment",
      eyebrow: who.isSelf ? "Your assessment" : `${who.Owner} assessment`,
      headline: `${fmtDayDate(booking.date)} · ${fmt12h(booking.start)}`,
      detail: `20 minutes on court with Sina${booking.locationLabel ? `, ${booking.locationLabel}` : ""}. ${BRING_LINE}`,
      secondary: { href: "#availability", label: "Update my availability" },
    };
  }

  // 4. The next session of a paid enrollment.
  let soonest: { row: DashSession; enrollment: DashEnrollment } | null = null;
  for (const enrollment of enrollments) {
    const cohort = cohortById.get(enrollment.cohort_id);
    if (!enrollmentIsActive(enrollmentState(enrollment, cohort))) continue;
    for (const row of sessionsByCohort[enrollment.cohort_id] ?? []) {
      if (row.status === "cancelled" || row.session_date < today) continue;
      if (
        !soonest ||
        row.session_date < soonest.row.session_date ||
        (row.session_date === soonest.row.session_date && row.start_time < soonest.row.start_time)
      ) {
        soonest = { row, enrollment };
      }
    }
  }
  if (soonest) {
    const { row, enrollment } = soonest;
    const cohort = cohortById.get(enrollment.cohort_id);
    return {
      kind: "session",
      eyebrow: "Next session",
      headline: `${fmtDayDate(row.session_date)} · ${fmt12h(row.start_time)}–${fmt12h(row.end_time)}`,
      detail: [
        programTitle(programs, cohort, enrollment.program ?? enrollment.cohort_id),
        cohort?.label,
        input.voice === "named" ? enrollment.participant_name : null,
      ]
        .filter(Boolean)
        .join(" · "),
      secondary: { href: "#my-programs", label: "See all sessions" },
    };
  }

  // 5. Paid into a cohort whose dates aren't generated yet.
  const placed = enrollments
    .filter((e) => enrollmentIsActive(enrollmentState(e, cohortById.get(e.cohort_id))))
    .map((e) => cohortById.get(e.cohort_id))
    .find((c) => c && c.sessions.length > 0 && !(sessionsByCohort[c.id] ?? []).length);
  if (placed) {
    return {
      kind: "dates-coming",
      eyebrow: "Next step",
      headline: "Session dates are coming.",
      detail: `${programTitle(programs, placed, placed.programId)} trains ${weeklySlots(placed)}. Sina confirms the dates once the group is set.`,
      secondary: { href: "#my-programs", label: "See my programs" },
    };
  }

  // 6. Nothing booked: Sina places the players from the quiz.
  const unplaced = roster.filter((p) => !hasLevel(p.level));
  if (input.voice === "you" || roster.length === 0) {
    return unplaced.length > 0 || roster.length === 0
      ? {
          kind: "placing",
          eyebrow: "Next step",
          headline: "Sina is placing you in a group and time.",
          detail: `There is nothing else you need to do. ${ASSESSMENT_LINE}`,
          primary: { href: "#availability", label: "Update my availability" },
          secondary: { href: "/assessment/book", label: "Book Your Assessment" },
        }
      : {
          kind: "placed",
          eyebrow: "Next step",
          headline: "Your level is set. Sina is placing you in a group.",
          detail: "There is nothing else you need to do. Your group, dates and price land here once Sina sets them.",
          primary: { href: "#availability", label: "Update my availability" },
          secondary: { href: "/programs", label: "Browse Programs" },
        };
  }
  const everyone = roster.map((p) => (p.id === input.selfId ? "you" : firstNameOf(p.full_name) || "your player"));
  const many = roster.length > 1;
  return {
    kind: unplaced.length > 0 ? "placing" : "placed",
    eyebrow: "Next step",
    headline: `Sina is placing ${namesList(everyone)} in ${many ? "groups and times" : "a group and time"}.`,
    detail:
      unplaced.length > 0
        ? `There is nothing else you need to do. ${ASSESSMENT_LINE}`
        : "There is nothing else you need to do. Groups, dates and prices land here once Sina sets them.",
    primary: { href: "#availability", label: many ? "Update availability" : `Update ${possessive(everyone[0] ?? "their")} availability` },
    secondary:
      unplaced.length > 0
        ? { href: "/assessment/book", label: "Book Your Assessment" }
        : { href: "/programs", label: "Browse Programs" },
  };
}

/**
 * What one e-transfer for these invites comes to: each player's amount due
 * (the cohort price when it couldn't be read), with a $20 that two invites
 * found on the same assessment booking taken off once, as the enroll wizard
 * and recordEtransferIntent take it.
 */
export function etransferTotalCents(
  invites: readonly Pick<DashInvite, "amountDueCents" | "creditBookingId">[],
  priceCents: number
): number {
  const used = new Set<string>();
  let total = 0;
  for (const invite of invites) {
    const booking = invite.creditBookingId ?? null;
    if (booking && used.has(booking)) {
      total += priceCents;
      continue;
    }
    if (booking) used.add(booking);
    total += invite.amountDueCents ?? priceCents;
  }
  return total;
}

// ─── Credit line (audit M25) ──────────────────────────────────────────────────

/**
 * The $20 still waiting to come off a price, said with its condition (voice
 * rule 2): "Your $20 assessment comes off the price when you enroll in a
 * program." Null with no unused credit.
 */
export function creditLine(
  credits: readonly DashCredit[],
  roster: readonly RosterPlayer[],
  selfId: string | null
): string | null {
  if (credits.length === 0) return null;
  const owners = credits.map((c) => {
    const player = playerFor(roster, { participantId: c.participantId, name: c.playerName });
    if (player && player.id === selfId) return "you";
    return firstNameOf(player?.full_name ?? c.playerName) || "your player";
  });
  const unique = [...new Set(owners)];
  if (unique.length === 1 && unique[0] === "you") {
    return "Your $20 assessment comes off the price when you enroll in a program.";
  }
  if (unique.length === 1) {
    return `${possessive(unique[0])} $20 assessment comes off the price when ${unique[0]} enrolls in a program.`;
  }
  const label = namesList(unique.map((o) => (o === "you" ? "yours" : possessive(o))));
  return `The $20 assessments (${label}) each come off the price when that player enrolls in a program.`;
}

// ─── Header (audit M32) ───────────────────────────────────────────────────────

/**
 * "Welcome back, Dana" once the account has history (an enrollment, a booking,
 * an invite or a level); a first visit reads "Welcome, Dana".
 */
export function welcomeHeading(firstName: string, returning: boolean): string {
  const base = returning ? "Welcome back" : "Welcome";
  return firstName ? `${base}, ${firstName}` : base;
}
