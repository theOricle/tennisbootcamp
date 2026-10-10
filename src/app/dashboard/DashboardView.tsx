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
import { AGE_BAND_LABELS } from "@/lib/ageBand";
import { VENUE_LINE } from "@/lib/membership";
import { formatTierLevel, formatTierSpan, hasLevel, levelNumber, type PlacedSpan } from "@/lib/tiers";
import { isCohortPublic } from "@/lib/cohortVisibility";
import { artFocusForCohort } from "@/lib/plates/variant";
import {
  ENROLLMENT_CHIP,
  enrollmentNote,
  enrollmentState,
  fmt12h,
  fmtMonthDay,
  weeklySlots,
  type NextStep,
} from "@/lib/dashboardState";
import { firstNameOf, namesList, possessive } from "@/lib/householdView";
import { RankCard, TierLine, TierRangeBadges } from "@/components/tiers";
import { ProgramPlate } from "@/components/plates/ProgramPlate";
import { PlateMark } from "@/components/plates/PlateMark";
import { AgeBandChips } from "@/components/programs/AgeBandChips";
import { ProgramCardList } from "@/components/sections/ProgramCard";
import { suggestionsSubCopy, type ProgramFit, type SuggestedProgram } from "@/lib/programCatalog";
import { AvailabilityEditor } from "./AvailabilityEditor";

// Presentation only. The page (page.tsx) reads everything behind the holder's
// session and hands it over as plain data; the words for each state come
// from src/lib/dashboardState.ts. One surface style throughout — the
// homepage card: rounded-2xl, border white/10, bg white/5. Mobile order top
// to bottom: next step, tiers, my programs, open groups, players, availability,
// suggestions.
//
// The next-step card is the one primary on the page (audit M32): every other
// action is an outline button or a text link. The page speaks to the players
// who train (audit M26): a parent who registered only a child reads about
// that child by name, never "you" as an unranked player.

export type DashboardEnrollment = {
  id: string;
  cohort_id: string;
  program: string | null;
  participant_name: string | null;
  status: string;
  created_at: string;
};

/** An open cohort and the players on the account its band admits (audit M27). */
export type OpenForTier = { cohort: Cohort; players: PlayerRecord[] };

export type DashboardViewProps = {
  /** "Welcome, Dana" on a first visit, "Welcome back, Dana" after (audit M32). */
  heading: string;
  /** The account holder's own player record. */
  self: PlayerRecord | null;
  /** Everyone on the account, holder first. */
  players: PlayerRecord[];
  /** The people on the account who train (src/lib/householdView.ts). */
  roster: PlayerRecord[];
  /** "you" when the holder is the only player; "named" otherwise. */
  voice: "you" | "named";
  /** The most urgent thing on the account (src/lib/dashboardState.ts). */
  nextStep: NextStep;
  /** The unused $20 assessment line, when one exists (audit M25). */
  creditLine: string | null;
  enrollments: DashboardEnrollment[];
  /** Every cohort (enrollment lookups + the public ones for suggestion cards). */
  cohorts: Cohort[];
  /** Dated session rows keyed by cohort id (empty when none are generated yet). */
  sessionsByCohort: Record<string, CohortSessionRow[]>;
  /** Open cohorts a player on the account may join by level, not yet enrolled. */
  openForTier: OpenForTier[];
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

function fmtSessionDate(iso: string): string {
  return fmtMonthDay(iso);
}

function fmtSlot(start: string, end: string): string {
  return `${fmt12h(start)}–${fmt12h(end)}`;
}

function relationshipLine(player: PlayerRecord): string {
  const rel = isRelationship(player.relationship)
    ? RELATIONSHIP_LABELS[player.relationship]
    : "";
  const age = player.age_band ? AGE_BAND_LABELS[player.age_band] : player.is_minor ? "Under 18" : "";
  return [rel, age].filter(Boolean).join(" · ");
}

/** The player's tier in words for dense rows: "Deuce · 3.0", "Placed · Deuce group", "Unranked". */
function tierWords(player: PlayerRecord, placed: PlacedSpan | null | undefined): string {
  if (hasLevel(player.level)) return formatTierLevel(player.level);
  if (placed) return `Placed · ${formatTierSpan(placed.min, placed.max)} group`;
  return "Unranked";
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

const CHIP_TONE: Record<"lime" | "neutral" | "warn" | "muted", string> = {
  lime: "bg-[#B4E655]/10 text-[#B4E655]",
  neutral: "border border-white/15 bg-white/5 text-white/85",
  warn: "border border-amber-300/30 bg-amber-300/10 text-amber-100",
  muted: "border border-dashed border-white/25 text-white/75",
};

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

// ─── Tiers (audit M24, M26) ──────────────────────────────────────────────────

function TierSection({
  roster,
  self,
  placedSpans,
}: {
  roster: PlayerRecord[];
  self: PlayerRecord | null;
  placedSpans: Record<string, PlacedSpan | null>;
}) {
  if (roster.length === 0) return null;

  if (roster.length === 1) {
    const player = roster[0];
    const isSelf = player.id === self?.id;
    const title = isSelf ? "Your tier" : `${possessive(firstNameOf(player.full_name) || "Your player")} tier`;
    return (
      <section aria-labelledby="tiers">
        {/* The card's own eyebrow names the player; the heading is for the outline. */}
        <h2 id="tiers" className="sr-only">
          {title}
        </h2>
        <RankCard
          player={player}
          layout="wide"
          isSelf={isSelf}
          placedSpan={placedSpans[player.id] ?? null}
          headingLevel="h3"
        />
      </section>
    );
  }

  const columns = roster.length >= 3 ? "md:grid-cols-2 xl:grid-cols-3" : "md:grid-cols-2";
  return (
    <section aria-labelledby="tiers">
      <SectionHeading id="tiers" title="Your players' tiers" sub="Each player's level, set by Sina." />
      <div className={`grid gap-4 ${columns}`}>
        {roster.map((player) => (
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

// ─── My programs ─────────────────────────────────────────────────────────────

function EnrollmentCard({
  enrollment,
  cohort,
  program,
  sessions,
  today,
}: {
  enrollment: DashboardEnrollment;
  cohort: Cohort | undefined;
  program: Program | undefined;
  sessions: CohortSessionRow[];
  today: string;
}) {
  const state = enrollmentState(enrollment, cohort);
  const chip = ENROLLMENT_CHIP[state];
  const note = enrollmentNote(state);
  const active = state === "enrolled" || state === "test";
  const hasDated = sessions.some((s) => s.status !== "cancelled");
  return (
    <article className={`${SURFACE} overflow-hidden`}>
      {/* The program's Court Plate, flush to the top (design specs §4.8):
          the strip frame, profiled by the cohort's band, the court side
          picked by its id. */}
      {program && (
        <div className="aspect-[3/1] w-full overflow-hidden border-b border-white/10 bg-[#061427]">
          <ProgramPlate
            plate={program.plate}
            frame="strip"
            density="compact"
            comingSoon={program.comingSoon || state === "cancelled"}
            levelMin={cohort?.levelMin}
            levelMax={cohort?.levelMax}
            seed={cohort?.id ?? enrollment.cohort_id}
            focusSlot={cohort ? artFocusForCohort(program, cohort) : null}
          />
        </div>
      )}
      <div className="p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-white">
              {program?.title ?? enrollment.program ?? enrollment.cohort_id}
            </h3>
            <p className="mt-1 text-sm text-white/60">
              {[cohort?.label, enrollment.participant_name ? `Player: ${enrollment.participant_name}` : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          {/* The row's state in words (audit M25): never the raw status. */}
          <span
            className={`inline-flex min-h-6 shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold ${CHIP_TONE[chip.tone]}`}
          >
            {chip.label}
          </span>
        </div>
        {/* Age as chips, the cohort's tier span as a chip (audit M24). */}
        {(program?.ageBands.length || cohort) && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {program && <AgeBandChips bands={program.ageBands} />}
            {cohort && <TierRangeBadges levelMin={cohort.levelMin} levelMax={cohort.levelMax} />}
          </div>
        )}
        {note && <p className="mt-3 text-sm leading-relaxed text-white/70">{note}</p>}

        {active && hasDated ? (
          <SessionList sessions={sessions} today={today} />
        ) : state !== "cancelled" && cohort && cohort.sessions.length > 0 ? (
          <div className="mt-4 border-t border-white/10 pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#B4E655]">
              Weekly schedule
            </p>
            <p className="mt-1 text-sm text-white/80">
              {weeklySlots(cohort)}
              {cohort.startDate ? `, starting ${fmtMonthDay(cohort.startDate)}` : ""}
            </p>
          </div>
        ) : null}
      </div>
    </article>
  );
}

// ─── View ────────────────────────────────────────────────────────────────────

export function DashboardView(props: DashboardViewProps) {
  const {
    heading,
    self,
    roster,
    voice,
    nextStep: step,
    creditLine,
    enrollments,
    cohorts,
    sessionsByCohort,
    openForTier,
    suggestions,
    programs,
    placedSpans = {},
    today,
  } = props;

  const publicCohorts = cohorts.filter((c) => isCohortPublic(c, today));
  const several = roster.length > 1;
  const names = roster.map((p) => (p.id === self?.id ? "you" : firstNameOf(p.full_name) || "your player"));
  const openCount = (playerId: string) =>
    openForTier.filter((m) => m.players.some((p) => p.id === playerId)).length;

  // "Open for your tier" in the voice of the players it is for.
  const openTitle =
    voice === "you"
      ? "Open for your tier"
      : several
        ? "Open for your players"
        : `Open for ${possessive(names[0] ?? "your player")} tier`;

  return (
    <div className="space-y-10">
      {/* Header card — welcome and one next step. The tier lives in its own
          section below (audit M24), not as a badge here. */}
      <section className={`${SURFACE} p-6 md:p-8`} aria-labelledby="dashboard-welcome">
        <div className="grid gap-6 lg:grid-cols-5 lg:gap-10">
          <div className="lg:col-span-2">
            <h1 id="dashboard-welcome" className="text-2xl font-semibold text-white md:text-3xl">
              {heading}
            </h1>
            <p className="mt-1 text-sm text-white/60">
              {voice === "you"
                ? "Your enrollments and upcoming programs."
                : `Enrollments and programs for ${namesList(names)}.`}
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
            {/* The unused $20, with its condition (audit M25) — unless the
                invite above already did the sum. */}
            {creditLine && step.kind !== "invite" && (
              <p className="mt-3 border-t border-white/10 pt-3 text-sm leading-relaxed text-white/75">
                {creditLine}
              </p>
            )}
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
      <TierSection roster={roster} self={self} placedSpans={placedSpans} />

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
                  ? "Every cohort on your account, with its dated sessions."
                  : undefined
              }
            />

            {enrollments.length === 0 ? (
              // The truth, and no second primary (audit M32): the next step
              // above already says what happens. A held spot or a pending
              // e-transfer means Sina has placed someone, so the card says
              // nothing is enrolled yet and points up instead of "placing".
              <div className={`${SURFACE} p-6`}>
                <p className="text-sm leading-relaxed text-white/75">
                  {step.kind === "invite"
                    ? "Nothing is enrolled yet. Claim the spot held above and the program shows here."
                    : step.kind === "etransfer"
                    ? "Nothing is enrolled yet. The program shows here once Sina confirms the e-transfer above."
                    : voice === "you"
                    ? "Sina is placing you — your group, dates and price land here."
                    : `Sina is placing ${namesList(names)} — ${several ? "groups, dates and prices" : "the group, dates and price"} land here.`}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {enrollments.map((enrollment) => {
                  const cohort = cohorts.find((c) => c.id === enrollment.cohort_id);
                  const program = programs.find(
                    (p) => p.id === (cohort?.programId ?? enrollment.program)
                  );
                  return (
                    <EnrollmentCard
                      key={enrollment.id}
                      enrollment={enrollment}
                      cohort={cohort}
                      program={program}
                      sessions={sessionsByCohort[enrollment.cohort_id] ?? []}
                      today={today}
                    />
                  );
                })}
              </div>
            )}
          </section>

          {/* Open cohorts a player's level admits (audit M27): per player, by
              the same numeric rule /enroll uses. The span rail carries the
              player's marker; the button is an outline, the next step above
              is the page's one primary (audit M32). */}
          {openForTier.length > 0 && (
            <section aria-labelledby="open-for-tier">
              <SectionHeading
                id="open-for-tier"
                title={openTitle}
                sub="Cohorts whose level band fits, with room left."
              />
              <div className="space-y-4">
                {openForTier.map(({ cohort: c, players: fits }) => {
                  const program = programs.find((p) => p.id === c.programId);
                  const first = fits[0];
                  const firstLevel = levelNumber(first?.level);
                  const fitNames = fits.map((p) =>
                    p.id === self?.id ? "you" : firstNameOf(p.full_name) || "your player"
                  );
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
                              {voice === "named" && (
                                <p className="mt-1 text-sm font-semibold text-white/85">
                                  Fits {namesList(fitNames)}
                                </p>
                              )}
                            </div>
                            <TierRangeBadges levelMin={c.levelMin} levelMax={c.levelMax} />
                          </div>
                        </div>
                      </div>
                      <TierLine
                        variant="rail"
                        size="sm"
                        span={{ min: c.levelMin, max: c.levelMax }}
                        marker={
                          firstLevel !== null
                            ? {
                                level: firstLevel,
                                label: first.id === self?.id ? "You" : firstNameOf(first.full_name) || "Player",
                              }
                            : null
                        }
                        labels="ends"
                        className="mt-4"
                      />
                      <Link href={`/enroll/${c.id}`} className={`${secondaryButton} mt-4`}>
                        Enroll{voice === "named" && fits.length === 1 && first.id !== self?.id ? ` ${firstNameOf(first.full_name)}` : ""} →
                      </Link>
                    </article>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        {/* Side column — the players (households), then the venue line. */}
        <aside className="space-y-6">
          {voice === "named" && (
            <section className={`${SURFACE} p-5 md:p-6`} aria-labelledby="your-players">
              <h2 id="your-players" className="text-base font-semibold text-white">
                {several ? "Your players" : "Your player"}
              </h2>
              {/* One line per player: "Maya · Deuce 3.0 — 1 cohort open" (audit M26). */}
              <ul className="mt-4 divide-y divide-white/10">
                {roster.map((player) => {
                  const open = openCount(player.id);
                  return (
                    <li key={player.id} className="py-3 first:pt-0 last:pb-0">
                      <p className="text-sm font-semibold text-white">
                        {player.full_name?.trim() || "Unnamed player"}
                      </p>
                      <p className="text-xs text-white/60">{relationshipLine(player)}</p>
                      <p className="mt-1 text-sm text-white/80">
                        {tierWords(player, placedSpans[player.id])}
                        {open > 0 && (
                          <>
                            {" — "}
                            <Link
                              href="#open-for-tier"
                              className="font-semibold text-[#B4E655] underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50"
                            >
                              {open} cohort{open === 1 ? "" : "s"} open
                            </Link>
                          </>
                        )}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section className={`${SURFACE} p-5 md:p-6`} aria-labelledby="where-we-train">
            <h2 id="where-we-train" className="text-base font-semibold text-white">
              Where we train
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-white/70">{VENUE_LINE}</p>
          </section>
        </aside>
      </div>

      {/* Availability — one card per player who trains. Explained once, here
          (audit M32). */}
      <section id="availability" className="scroll-mt-24" aria-labelledby="availability-heading">
        <SectionHeading
          id="availability-heading"
          title={
            voice === "you"
              ? "Your availability"
              : several
                ? "Your players' availability"
                : `${possessive(names[0] ?? "Your player")} availability`
          }
          sub="Sina builds every group around the times its players can train. Keep this current."
        />
        <div className={`grid gap-4 ${several ? "lg:grid-cols-2" : "lg:grid-cols-3"}`}>
          {roster.map((player) => (
            <div
              key={player.id}
              className={`${SURFACE} p-5 md:p-6 ${several ? "" : "lg:col-span-2"}`}
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
                showName={voice === "named"}
                initialAvailability={player.availability}
                initialNote={player.availability_note ?? ""}
                updatedAt={player.availability_updated_at}
                source={player.availability_source}
              />
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-white/60">
          Training someone else too — a child, a partner, or yourself? Add them through{" "}
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
            sub={suggestionsSubCopy(roster, suggestions)}
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
