// The dashboard's lists (backlog #105): "Coming up", one card per group with
// its players, and a player's times as one line. Pure, with no React and no
// database, so the page and test-dashboard-one-look.ts read one rule.

import type { Cohort } from "@/types/cohort";
import { BANDS, DAYS, DAY_LABELS, parseAvailability, type Band } from "@/lib/availability";
import {
  enrollmentIsActive,
  enrollmentNote,
  enrollmentState,
  fmt12h,
  fmtMonthDay,
  openHolds,
  playerFor,
  torontoStamp,
  whose,
  type AccountVoice,
  type DashBooking,
  type DashEnrollment,
  type DashInvite,
  type DashSession,
  type EnrollmentState,
  type NextStepShown,
} from "@/lib/dashboardState";
import { blockFacts, groupForBlock } from "@/lib/groupBlocks";
import { firstNameOf, namesList } from "@/lib/householdView";
import { dayNameForDate } from "@/lib/makeup";
import { formatClassHours } from "@/lib/programCatalog";
import type { TierId } from "@/lib/tiers";

type ProgramRef = { id: string; title: string };

// ─── One card per group ───────────────────────────────────────────────────────

export type GroupPlayer = {
  enrollmentId: string;
  /** The player's name as the enrollment wrote it, or null on a one-player account. */
  name: string | null;
  state: EnrollmentState;
};

export type EnrolledGroup = {
  cohortId: string;
  /** The group's name as a family reads it on /programs, never the coach's block label. */
  name: string;
  level: TierId | null;
  cohort: Cohort | undefined;
  /** "Jan 16 – Feb 20", from the block's first class to its last. */
  dates: string | null;
  /** "Saturdays 1–2pm", the cards' own style. */
  days: string | null;
  players: GroupPlayer[];
};

/** A group's name where a family reads it: the card's title on /programs. */
export function groupNameFor(
  cohort: Cohort | undefined,
  programs: readonly ProgramRef[],
  fallback?: string | null
): string {
  const group = cohort ? groupForBlock(cohort) : null;
  return (
    group?.name ??
    programs.find((p) => p.id === (cohort?.programId ?? fallback))?.title ??
    fallback ??
    "Your group"
  );
}

/**
 * The account's enrollments, one entry per block, each with its players and
 * every player's own state, in the order the blocks start.
 */
export function enrolledGroups(
  enrollments: readonly DashEnrollment[],
  cohorts: readonly Cohort[],
  programs: readonly ProgramRef[]
): EnrolledGroup[] {
  const byCohort = new Map<string, EnrolledGroup>();
  for (const e of enrollments) {
    const cohort = cohorts.find((c) => c.id === e.cohort_id);
    let entry = byCohort.get(e.cohort_id);
    if (!entry) {
      const facts = cohort && cohort.sessions.length > 0 ? blockFacts(cohort) : null;
      entry = {
        cohortId: e.cohort_id,
        name: groupNameFor(cohort, programs, e.program),
        level: (cohort ? groupForBlock(cohort)?.level : null) ?? null,
        cohort,
        dates: facts?.dates ?? null,
        days: facts?.days ?? null,
        players: [],
      };
      byCohort.set(e.cohort_id, entry);
    }
    entry.players.push({
      enrollmentId: e.id,
      name: e.participant_name?.trim() || null,
      state: enrollmentState(e, cohort),
    });
  }
  return [...byCohort.values()].sort((a, b) =>
    (a.cohort?.startDate ?? "").localeCompare(b.cohort?.startDate ?? "")
  );
}

/**
 * The lines under a group's players: each state's own note, once, however
 * many players share it. `quiet` states say nothing (the next step already
 * said it).
 */
export function groupNotes(group: EnrolledGroup, quiet: readonly EnrollmentState[] = []): string[] {
  const notes: string[] = [];
  for (const p of group.players) {
    if (quiet.includes(p.state)) continue;
    const note = enrollmentNote(p.state);
    if (note && !notes.includes(note)) notes.push(note);
  }
  return notes;
}

// ─── Coming up ────────────────────────────────────────────────────────────────

export type ComingUpItem = {
  id: string;
  /** "YYYY-MM-DDTHH:MM" on the Toronto clock: the order of the list. */
  at: string;
  /** "Sat" */
  weekday: string;
  /** "Dec 5" */
  day: string;
  /** "10:20am", "1–2pm", "until 6pm" */
  time: string;
  /** "Leo's assessment", "First class", "Your held spot" */
  title: string;
  /** "Intermediate Youth Bootcamp · Maya", "20 minutes on court · Newtonbrook Tennis Club" */
  detail: string;
};

export type ComingUpInput = AccountVoice & {
  enrollments: readonly DashEnrollment[];
  cohorts: readonly Cohort[];
  programs: readonly ProgramRef[];
  sessionsByCohort: Record<string, readonly DashSession[]>;
  bookings: readonly DashBooking[];
  invites: readonly DashInvite[];
  /** "YYYY-MM-DD" in Toronto. */
  today: string;
  /** The current instant (ISO); invite holds are compared against it. */
  now: string;
  /** The item the next step shows as its own heading: never said twice. */
  shown: NextStepShown;
};

/**
 * Every dated thing on the account, soonest first, with no cap: a held
 * spot's deadline, a booked assessment, and each paid group's next class
 * (its first class until the block starts). Only the item the next step
 * shows as its heading is left out, so nothing booked is hidden and no date
 * is said twice.
 */
export function comingUp(input: ComingUpInput): ComingUpItem[] {
  const items: ComingUpItem[] = [];
  const cohortById = new Map(input.cohorts.map((c) => [c.id, c]));
  const named = input.voice === "named";

  // A spot held for a player, until its deadline on the Toronto clock.
  for (const invite of openHolds(input, cohortById)) {
    if (invite.id === input.shown.inviteId) continue;
    const at = torontoStamp(invite.expires_at);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(at)) continue;
    const who = whose(input, playerFor(input.roster, { participantId: invite.participant_id }), null);
    const date = at.slice(0, 10);
    items.push({
      id: `hold-${invite.id}`,
      at,
      weekday: dayNameForDate(date),
      day: fmtMonthDay(date),
      time: `until ${fmt12h(at.slice(11))}`,
      title: `${who.Owner} held spot`,
      detail: groupNameFor(cohortById.get(invite.cohort_id), input.programs),
    });
  }

  for (const b of input.bookings) {
    if (b.date < input.today || b.id === input.shown.bookingId) continue;
    const who = whose(
      input,
      playerFor(input.roster, { participantId: b.participantId, name: b.playerName }),
      b.playerName
    );
    items.push({
      id: `booking-${b.id}`,
      at: `${b.date}T${b.start.slice(0, 5)}`,
      weekday: dayNameForDate(b.date),
      day: fmtMonthDay(b.date),
      time: fmt12h(b.start),
      title: `${who.Owner} assessment`,
      detail: ["20 minutes on court", b.locationLabel].filter(Boolean).join(" · "),
    });
  }

  for (const group of enrolledGroups(input.enrollments, input.cohorts, input.programs)) {
    const active = group.players.filter((p) => enrollmentIsActive(p.state));
    if (active.length === 0 || !group.cohort) continue;
    if (group.cohort.dbStatus === "completed") continue;
    const who = named ? namesList([...new Set(active.map((p) => firstNameOf(p.name)).filter(Boolean))]) : "";
    const detail = [group.name, who].filter(Boolean).join(" · ");
    const rows = [...(input.sessionsByCohort[group.cohortId] ?? [])].sort((a, b) =>
      (a.session_date + a.start_time).localeCompare(b.session_date + b.start_time)
    );
    const next = rows.find((s) => s.status !== "cancelled" && s.session_date >= input.today);
    if (next) {
      if (next.id === input.shown.sessionId) continue;
      // The first class of the block that runs: nothing ran before it.
      const first = !rows.some((s) => s.status !== "cancelled" && s.session_date < next.session_date);
      items.push({
        id: `class-${next.id}`,
        at: `${next.session_date}T${next.start_time.slice(0, 5)}`,
        weekday: dayNameForDate(next.session_date),
        day: fmtMonthDay(next.session_date),
        time: formatClassHours(next.start_time.slice(0, 5), next.end_time.slice(0, 5)),
        title: next.makeup_for ? "Make-up class" : first ? "First class" : "Next class",
        detail,
      });
      continue;
    }
    // No dated rows yet: the block's own first day and weekly time.
    const slot = group.cohort.sessions[0];
    if (rows.length === 0 && slot && group.cohort.startDate >= input.today) {
      items.push({
        id: `first-${group.cohortId}`,
        at: `${group.cohort.startDate}T${slot.start.slice(0, 5)}`,
        weekday: dayNameForDate(group.cohort.startDate),
        day: fmtMonthDay(group.cohort.startDate),
        time: formatClassHours(slot.start, slot.end),
        title: "First class",
        detail,
      });
    }
  }

  return items.sort((a, b) => a.at.localeCompare(b.at));
}

// ─── A player's times, as one line ────────────────────────────────────────────

const BAND_WORD: Record<Band, string> = { mor: "morning", aft: "afternoon", eve: "evening" };

/**
 * "Wed evening · Sat morning and afternoon · Sun afternoon": the week a
 * player can train, in the grid's own day order. Empty when nothing is on file.
 */
export function timesLine(availability: unknown): string {
  const { days } = parseAvailability(availability);
  return DAYS.filter((d) => days[d]?.length)
    .map((d) => {
      const bands = BANDS.filter((b) => days[d]?.includes(b)).map((b) => BAND_WORD[b]);
      const words = bands.length === 3 ? "all day" : bands.join(" and ");
      return `${DAY_LABELS[d]} ${words}`;
    })
    .join(" · ");
}
