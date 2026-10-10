import Link from "next/link";
import type { ReactNode } from "react";
import type { Cohort } from "@/types/cohort";
import type { Program } from "@/types/program";
import type { CohortSessionRow } from "@/lib/cohortsDb";
import { dayNameForDate } from "@/lib/makeup";
import {
  RELATIONSHIP_LABELS,
  isRelationship,
  type PlayerRecord,
} from "@/lib/players";
import { VENUE_LINE } from "@/lib/membership";
import { hasLevel, levelNumber, type PlacedSpan } from "@/lib/tiers";
import { isCohortPublic } from "@/lib/cohortVisibility";
import { artFocusForCohort } from "@/lib/plates/variant";
import { RankCard, TierLine, TierRangeBadges } from "@/components/tiers";
import { ProgramPlate } from "@/components/plates/ProgramPlate";
import { PlateMark } from "@/components/plates/PlateMark";
import { AgeBandChips } from "@/components/programs/AgeBandChips";
import { ProgramCardList } from "@/components/sections/ProgramCard";
import { suggestionsSubCopy, type ProgramFit, type SuggestedProgram } from "@/lib/programCatalog";
import { AvailabilityEditor } from "./AvailabilityEditor";

// Presentation only. The page (page.tsx) reads everything behind the holder's
// session and hands it over as plain data; nothing in here touches Supabase.
// One surface style throughout — the homepage card: rounded-2xl, border
// white/10, bg white/5, shadow. Mobile order top to bottom: next step, tiers,
// my programs, where we train, availability, suggestions.
//
// The tier moment (audit M24) is the RankCard: one wide card for a single
// player, one compact card per player in a household. It is the only place
// on the page a tier is drawn; the header and the side card carry no badge.

export type DashboardEnrollment = {
  id: string;
  cohort_id: string;
  program: string | null;
  participant_name: string | null;
  status: string;
  created_at: string;
};

export type DashboardViewProps = {
  firstName: string;
  /** The account holder's own player record. */
  self: PlayerRecord | null;
  /** Everyone on the account, holder first. */
  players: PlayerRecord[];
  enrollments: DashboardEnrollment[];
  /** Every cohort (enrollment lookups + the public ones for suggestion cards). */
  cohorts: Cohort[];
  /** Dated session rows keyed by cohort id (empty when none are generated yet). */
  sessionsByCohort: Record<string, CohortSessionRow[]>;
  /** Open cohorts in the holder's tier that they aren't enrolled in. */
  openForTier: Cohort[];
  /**
   * "Suggested for you" (audit M31): programs the account isn't enrolled in
   * that fit at least one player's age and level, with the ranked player each
   * one fits, from suggestProgramsFor().
   */
  suggestions: SuggestedProgram[];
  programs: Program[];
  /**
   * A quiz-placed player's cohort band, by player id (audit L17, owner D6-B):
   * the RankCard's Placed state for a player with no level who trains in a
   * tier-banded cohort. Absent or null means unranked.
   */
  placedSpans?: Record<string, PlacedSpan | null>;
  /** Today in Toronto as "YYYY-MM-DD" — splits upcoming from past sessions. */
  today: string;
};

export const SURFACE = "rounded-2xl border border-white/10 bg-white/5 shadow-md";

const DAY_NAMES: Record<string, string> = {
  Mon: "Mondays",
  Tue: "Tuesdays",
  Wed: "Wednesdays",
  Thu: "Thursdays",
  Fri: "Fridays",
  Sat: "Saturdays",
  Sun: "Sundays",
};

function fmt12h(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 || 12;
  return m === 0 ? `${hour}${suffix}` : `${hour}:${String(m).padStart(2, "0")}${suffix}`;
}

function fmtSessionDate(iso: string): string {
  const [y, mo, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d)).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function fmtSlot(start: string, end: string): string {
  return `${fmt12h(start.slice(0, 5))}–${fmt12h(end.slice(0, 5))}`;
}

function weeklySlots(cohort: Cohort): string {
  return cohort.sessions
    .map((s) => `${DAY_NAMES[s.day] ?? s.day} ${fmt12h(s.start)}–${fmt12h(s.end)}`)
    .join(", ");
}

function relationshipLine(player: PlayerRecord): string {
  const rel = isRelationship(player.relationship)
    ? RELATIONSHIP_LABELS[player.relationship]
    : "";
  return `${rel}${player.is_minor ? " · Under 18" : ""}`;
}

/** Section heading used everywhere on the page — one style, no divider rules. */
function SectionHeading({
  id,
  title,
  sub,
  aside,
}: {
  id?: string;
  title: string;
  sub?: string;
  aside?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 id={id} className="scroll-mt-24 text-xl font-semibold text-white">
          {title}
        </h2>
        {sub && <p className="mt-1 text-sm text-white/60">{sub}</p>}
      </div>
      {aside}
    </div>
  );
}

/** A text link that is still a 44px target (audit L31). */
const linkClass =
  "inline-flex min-h-[44px] items-center rounded text-sm font-semibold text-white/70 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427]";

const primaryButton =
  "inline-flex min-h-[44px] items-center justify-center rounded-full bg-[#B4E655] px-6 text-sm font-semibold text-[#061427] transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427]";

const secondaryButton =
  "inline-flex min-h-[44px] items-center justify-center rounded-full border border-white/25 px-6 text-sm font-semibold text-white/80 transition hover:border-white/45 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427]";

// ─── Sessions ────────────────────────────────────────────────────────────────

type SessionWithMakeup = { row: CohortSessionRow; replaces?: CohortSessionRow };

function splitSessions(sessions: CohortSessionRow[], today: string) {
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const visible = sessions
    .filter((s) => s.status !== "cancelled")
    .map<SessionWithMakeup>((row) => ({
      row,
      replaces: row.makeup_for ? byId.get(row.makeup_for) : undefined,
    }));
  const upcoming = visible.filter((s) => s.row.session_date >= today);
  const past = visible.filter((s) => s.row.session_date < today).reverse();
  return { upcoming, past };
}

function SessionRow({ row, replaces, muted = false }: SessionWithMakeup & { muted?: boolean }) {
  return (
    <li
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm ${
        muted ? "text-white/60" : "text-white/80"
      }`}
    >
      <span className="w-[7.5rem] shrink-0 font-medium">
        {dayNameForDate(row.session_date)} {fmtSessionDate(row.session_date)}
      </span>
      <span>{fmtSlot(row.start_time, row.end_time)}</span>
      {row.makeup_for && (
        <span className="rounded-full bg-sky-400/15 px-2 py-0.5 text-xs font-semibold text-sky-200">
          Make-up{replaces ? ` · replaces ${fmtSessionDate(replaces.session_date)}` : ""}
        </span>
      )}
    </li>
  );
}

/**
 * Dated sessions for an enrolled cohort: upcoming first, past ones collapsed
 * behind a disclosure so a finished block no longer reads as current.
 * Make-ups are badged with the session they replace.
 */
function SessionList({
  sessions,
  today,
}: {
  sessions: CohortSessionRow[];
  today: string;
}) {
  const { upcoming, past } = splitSessions(sessions, today);
  return (
    <div className="mt-4 border-t border-white/10 pt-3">
      {upcoming.length > 0 ? (
        <>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#B4E655]">
            Upcoming
          </p>
          <ul className="mt-1 divide-y divide-white/5">
            {upcoming.map((s) => (
              <SessionRow key={s.row.id} {...s} />
            ))}
          </ul>
        </>
      ) : (
        <p className="text-sm text-white/60">No upcoming sessions.</p>
      )}
      {past.length > 0 && (
        <details className="group mt-3">
          {/* A 44px target (audit L31). */}
          <summary className="inline-flex min-h-[44px] cursor-pointer list-none items-center rounded text-sm font-semibold text-white/70 transition-colors hover:text-white [&::-webkit-details-marker]:hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427]">
            <span className="inline-block w-4 transition-transform group-open:rotate-90" aria-hidden="true">
              ›
            </span>
            Past sessions ({past.length})
          </summary>
          <ul className="mt-1 divide-y divide-white/5 pl-4">
            {past.map((s) => (
              <SessionRow key={s.row.id} {...s} muted />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

// ─── Next step ───────────────────────────────────────────────────────────────

type NextStep = {
  eyebrow: string;
  headline: string;
  detail: string;
  primary?: { href: string; label: string };
  secondary?: { href: string; label: string };
};

function nextStepFor(props: DashboardViewProps): NextStep {
  const { self, enrollments, cohorts, sessionsByCohort, programs, today } = props;

  // The earliest dated, not-cancelled session on or after today across every
  // enrollment on the account.
  let soonest: { row: CohortSessionRow; enrollment: DashboardEnrollment } | null = null;
  for (const enrollment of enrollments) {
    for (const row of sessionsByCohort[enrollment.cohort_id] ?? []) {
      if (row.status === "cancelled" || row.session_date < today) continue;
      if (
        !soonest ||
        row.session_date < soonest.row.session_date ||
        (row.session_date === soonest.row.session_date &&
          row.start_time < soonest.row.start_time)
      ) {
        soonest = { row, enrollment };
      }
    }
  }

  if (soonest) {
    const { row, enrollment } = soonest;
    const cohort = cohorts.find((c) => c.id === enrollment.cohort_id);
    const program = programs.find((p) => p.id === (cohort?.programId ?? enrollment.program));
    return {
      eyebrow: "Next session",
      headline: `${dayNameForDate(row.session_date)} ${fmtSessionDate(row.session_date)} · ${fmtSlot(
        row.start_time,
        row.end_time
      )}`,
      detail: [
        program?.title ?? enrollment.program ?? enrollment.cohort_id,
        cohort?.label,
        enrollment.participant_name,
      ]
        .filter(Boolean)
        .join(" · "),
      secondary: { href: "#my-programs", label: "See all sessions" },
    };
  }

  // Enrolled in a cohort whose dates aren't generated yet — the player is
  // placed; the weekly slot is the only schedule on record.
  const pending = enrollments
    .map((e) => cohorts.find((c) => c.id === e.cohort_id))
    .find((c) => c && c.sessions.length > 0 && !(sessionsByCohort[c.id] ?? []).length);
  if (pending) {
    const program = programs.find((p) => p.id === pending.programId);
    return {
      eyebrow: "Next step",
      headline: "Your session dates are coming.",
      detail: `${program?.title ?? pending.programId} trains ${weeklySlots(
        pending
      )}. Dates are confirmed once the group is set.`,
      secondary: { href: "#my-programs", label: "See my programs" },
    };
  }

  const headline = "Sina will place you in a group and time.";

  if (!hasLevel(self?.level)) {
    return {
      eyebrow: "Next step",
      headline,
      detail:
        "There is nothing else you need to do. Keeping your availability current helps Sina place you. If you want your level confirmed on court first, you can book a 20-minute assessment. The assessment is $20, and if you enroll in a program afterward that $20 comes off the price.",
      primary: { href: "#availability", label: "Update my availability" },
      secondary: { href: "/assessment/book", label: "Book Your Assessment" },
    };
  }

  return {
    eyebrow: "Next step",
    headline,
    detail:
      "Your level is set. Keep your availability current and your coach can build a cohort around it.",
    primary: { href: "#availability", label: "Update my availability" },
    secondary: { href: "/programs", label: "Browse Programs" },
  };
}

// ─── Tiers (audit M24) ───────────────────────────────────────────────────────

/**
 * Who gets a RankCard. A single player: the holder. A household: every
 * player who is not the holder, plus the holder only when Sina has set their
 * level or placed them in a banded group — an account-only parent is not a
 * player, and an "Unranked" card for them would say they are.
 */
function tierPlayers(
  players: PlayerRecord[],
  self: PlayerRecord | null,
  placedSpans: Record<string, PlacedSpan | null>
): PlayerRecord[] {
  if (players.length <= 1) return players;
  return players.filter(
    (p) => p.id !== self?.id || hasLevel(p.level) || Boolean(placedSpans[p.id])
  );
}

function TierSection({
  players,
  self,
  placedSpans,
}: {
  players: PlayerRecord[];
  self: PlayerRecord | null;
  placedSpans: Record<string, PlacedSpan | null>;
}) {
  const household = players.length > 1;
  const shown = tierPlayers(players, self, placedSpans);
  if (shown.length === 0) return null;

  if (!household) {
    const player = shown[0];
    return (
      <section aria-labelledby="tiers">
        {/* The card's own eyebrow reads "Your tier"; the heading is for the outline. */}
        <h2 id="tiers" className="sr-only">
          Your tier
        </h2>
        <RankCard
          player={player}
          layout="wide"
          isSelf={player.id === self?.id}
          placedSpan={placedSpans[player.id] ?? null}
          headingLevel="h3"
        />
      </section>
    );
  }

  const columns = shown.length >= 3 ? "md:grid-cols-2 xl:grid-cols-3" : "md:grid-cols-2";
  return (
    <section aria-labelledby="tiers">
      <SectionHeading id="tiers" title="Your players' tiers" sub="Each player's level, set by Sina." />
      <div className={`grid gap-4 ${columns}`}>
        {shown.map((player) => (
          <RankCard
            key={player.id}
            player={player}
            layout="compact"
            isSelf={player.id === self?.id}
            placedSpan={placedSpans[player.id] ?? null}
            headingLevel="h3"
          />
        ))}
      </div>
    </section>
  );
}

// ─── View ────────────────────────────────────────────────────────────────────

export function DashboardView(props: DashboardViewProps) {
  const {
    firstName,
    self,
    players,
    enrollments,
    cohorts,
    sessionsByCohort,
    openForTier,
    suggestions,
    programs,
    placedSpans = {},
    today,
  } = props;

  const step = nextStepFor(props);
  const publicCohorts = cohorts.filter((c) => isCohortPublic(c, today));
  const household = players.length > 1;
  const selfLevel = levelNumber(self?.level);

  return (
    <div className="space-y-10">
      {/* Header card — welcome and one next step. The tier lives in its own
          section below (audit M24), not as a badge here. */}
      <section className={`${SURFACE} p-6 md:p-8`} aria-labelledby="dashboard-welcome">
        <div className="grid gap-6 lg:grid-cols-5 lg:gap-10">
          <div className="lg:col-span-2">
            <h1 id="dashboard-welcome" className="text-2xl font-semibold text-white md:text-3xl">
              Welcome back{firstName ? `, ${firstName}` : ""}
            </h1>
            <p className="mt-1 text-sm text-white/60">
              Your enrollments and upcoming programs.
            </p>
            <div className="mt-3">
              <Link href="/profile" className={linkClass}>
                Edit profile
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-[#B4E655]/20 bg-[#061427]/60 p-5 md:p-6 lg:col-span-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#B4E655]">
              {step.eyebrow}
            </p>
            <p className="mt-2 text-lg font-semibold text-white md:text-xl">{step.headline}</p>
            <p className="mt-2 text-sm leading-relaxed text-white/70">{step.detail}</p>
            {(step.primary || step.secondary) && (
              <div className="mt-5 flex flex-wrap gap-3">
                {step.primary && (
                  <Link href={step.primary.href} className={primaryButton}>
                    {step.primary.label}
                  </Link>
                )}
                {step.secondary && (
                  <Link href={step.secondary.href} className={secondaryButton}>
                    {step.secondary.label}
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Tiers — the RankCard, wide for one player, compact per household player */}
      <TierSection players={players} self={self} placedSpans={placedSpans} />

      {/* Main + side */}
      <div className="grid gap-10 lg:grid-cols-3 lg:gap-8">
        <div className="space-y-10 lg:col-span-2">
          {/* My programs */}
          <section aria-labelledby="my-programs">
            <SectionHeading
              id="my-programs"
              title="My programs"
              sub={
                enrollments.length > 0
                  ? "Every cohort you're enrolled in, with its dated sessions."
                  : undefined
              }
            />

            {enrollments.length === 0 ? (
              <div className={`${SURFACE} p-6`}>
                <p className="text-sm text-white/70">
                  You haven&apos;t enrolled in any programs yet.
                </p>
                <Link href="/programs" className={`${primaryButton} mt-4`}>
                  Browse Programs
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {enrollments.map((enrollment) => {
                  const cohort = cohorts.find((c) => c.id === enrollment.cohort_id);
                  const program = programs.find(
                    (p) => p.id === (cohort?.programId ?? enrollment.program)
                  );
                  const dated = sessionsByCohort[enrollment.cohort_id] ?? [];
                  const hasDated = dated.some((s) => s.status !== "cancelled");
                  return (
                    <article key={enrollment.id} className={`${SURFACE} overflow-hidden`}>
                      {/* The program's Court Plate, flush to the top (design
                          specs §4.8): the strip frame, profiled by the
                          cohort's band, the court side picked by its id. */}
                      {program && (
                        <div className="aspect-[3/1] w-full overflow-hidden border-b border-white/10 bg-[#061427]">
                          <ProgramPlate
                            plate={program.plate}
                            frame="strip"
                            density="compact"
                            comingSoon={program.comingSoon}
                            levelMin={cohort?.levelMin}
                            levelMax={cohort?.levelMax}
                            seed={cohort?.id ?? enrollment.cohort_id}
                            focusSlot={cohort ? artFocusForCohort(program, cohort) : null}
                          />
                        </div>
                      )}
                      <div className="p-5 md:p-6">
                        <h3 className="text-lg font-semibold text-white">
                          {program?.title ?? enrollment.program ?? enrollment.cohort_id}
                        </h3>
                        <p className="mt-1 text-sm text-white/60">
                          {[cohort?.label, enrollment.participant_name ? `Player: ${enrollment.participant_name}` : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        {/* Age as chips, the cohort's tier span as a chip (audit M24). */}
                        {(program?.ageBands.length || cohort) && (
                          <div className="mt-3 flex flex-wrap items-center gap-1.5">
                            {program && <AgeBandChips bands={program.ageBands} />}
                            {cohort && <TierRangeBadges levelMin={cohort.levelMin} levelMax={cohort.levelMax} />}
                          </div>
                        )}

                        {hasDated ? (
                          <SessionList sessions={dated} today={today} />
                        ) : cohort && cohort.sessions.length > 0 ? (
                          <div className="mt-4 border-t border-white/10 pt-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-[#B4E655]">
                              Weekly schedule
                            </p>
                            <ul className="mt-1 space-y-1 text-sm text-white/80">
                              {cohort.sessions.map((s) => (
                                <li key={s.day}>
                                  {DAY_NAMES[s.day] ?? s.day} {fmt12h(s.start)}–{fmt12h(s.end)}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {/* Open cohorts matching the player's tier: the span rail with the
              player's marker shows where they sit inside the band (audit M24). */}
          {openForTier.length > 0 && (
            <section aria-labelledby="open-for-tier">
              <SectionHeading
                id="open-for-tier"
                title="Open for your tier"
                sub="Cohorts built for your level that still have room."
              />
              <div className="space-y-4">
                {openForTier.map((c) => {
                  const program = programs.find((p) => p.id === c.programId);
                  return (
                    <article key={c.id} className={`${SURFACE} p-5 md:p-6`}>
                      <div className="flex items-start gap-4">
                        {program && (
                          <PlateMark plate={program.plate} size={56} focusSlot={artFocusForCohort(program, c)} />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h3 className="text-lg font-semibold text-white">
                                {program?.title ?? c.programId} · {c.label}
                              </h3>
                              <p className="mt-1 text-sm text-white/60">
                                Starts {fmtSessionDate(c.startDate)} · {c.weeks} week
                                {c.weeks === 1 ? "" : "s"} · {weeklySlots(c)}
                              </p>
                            </div>
                            <TierRangeBadges levelMin={c.levelMin} levelMax={c.levelMax} />
                          </div>
                        </div>
                      </div>
                      <TierLine
                        variant="rail"
                        size="sm"
                        span={{ min: c.levelMin, max: c.levelMax }}
                        marker={selfLevel !== null ? { level: selfLevel, label: "You" } : null}
                        labels="ends"
                        className="mt-4"
                      />
                      <Link href={`/enroll/${c.id}`} className={`${primaryButton} mt-4`}>
                        Enroll →
                      </Link>
                    </article>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        {/* Side column */}
        <aside className="space-y-6">
          <section className={`${SURFACE} p-5 md:p-6`} aria-labelledby="your-week">
            <h2 id="your-week" className="text-base font-semibold text-white">
              {household ? "Your players" : "Your week"}
            </h2>
            {household && (
              <ul className="mt-4 divide-y divide-white/10">
                {players.map((player) => (
                  <li key={player.id} className="py-3 first:pt-0 last:pb-0">
                    <p className="text-sm font-semibold text-white">
                      {player.full_name?.trim() || "Unnamed player"}
                    </p>
                    <p className="text-xs text-white/60">{relationshipLine(player)}</p>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-sm text-white/60">
              Groups form around shared availability. Keep {household ? "every" : "your"} week
              current and your coach can place {household ? "each player" : "you"} in a cohort that
              fits.
            </p>
            <Link href="#availability" className={`${secondaryButton} mt-3 w-full`}>
              Edit availability
            </Link>
          </section>

          <section className={`${SURFACE} p-5 md:p-6`} aria-labelledby="where-we-train">
            <h2 id="where-we-train" className="text-base font-semibold text-white">
              Where we train
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-white/70">{VENUE_LINE}</p>
          </section>
        </aside>
      </div>

      {/* Availability — one card per person on the account */}
      <section id="availability" className="scroll-mt-24" aria-labelledby="availability-heading">
        <SectionHeading
          id="availability-heading"
          title={household ? "Your players' availability" : "Your availability"}
          sub="The week your coach builds cohorts around."
        />
        <div className={`grid gap-4 ${household ? "lg:grid-cols-2" : "lg:grid-cols-3"}`}>
          {players.map((player) => (
            <div
              key={player.id}
              className={`${SURFACE} p-5 md:p-6 ${household ? "" : "lg:col-span-2"}`}
            >
              <div className="mb-4">
                <p className="text-base font-semibold text-white">
                  {player.full_name?.trim() || "Unnamed player"}
                </p>
                <p className="text-xs text-white/60">{relationshipLine(player)}</p>
              </div>
              <AvailabilityEditor
                participantId={player.id}
                participantName={player.full_name?.trim() ?? ""}
                showName={household}
                initialAvailability={player.availability}
                initialNote={player.availability_note ?? ""}
                updatedAt={player.availability_updated_at}
                source={player.availability_source}
              />
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-white/60">
          Training someone else too — a child, a partner? Add them through{" "}
          <Link
            href="/intake"
            className="font-semibold text-[#B4E655]/80 underline-offset-2 hover:text-[#B4E655] hover:underline"
          >
            the 2-minute quiz
          </Link>
          .
        </p>
      </section>

      {/* Suggested for you (audit M31, H7): the same spec-sheet card as the
          home grid, filtered by each player's age and level, with "Fits
          Maya" and her place on the rail. Hidden when there is nothing to
          suggest. */}
      {suggestions.length > 0 && (
        <section aria-labelledby="suggested">
          <SectionHeading
            id="suggested"
            title="Suggested for you"
            sub={suggestionsSubCopy(players, suggestions)}
            aside={
              <Link href="/programs" className={linkClass}>
                Browse Programs →
              </Link>
            }
          />
          <ProgramCardList
            programs={suggestions.map((s) => s.program)}
            publicCohorts={publicCohorts}
            fits={Object.fromEntries(suggestions.map((s) => [s.program.id, s.fit])) as Record<string, ProgramFit>}
            layout="grid"
          />
        </section>
      )}
    </div>
  );
}
