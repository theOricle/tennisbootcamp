import Link from "next/link";
import type { ReactNode } from "react";
import { CreditWaitingNote } from "@/components/account/CreditWaitingNote";
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
import { locationForCohort } from "@/content/locations";
import { programGroups } from "@/content/programs";
import {
  formatTierLevel,
  formatTierSpan,
  hasLevel,
  levelNumber,
  tierForLevel,
  type PlacedSpan,
} from "@/lib/tiers";
import {
  ENROLLMENT_CHIP,
  enrollmentIsActive,
  fmtMonthDay,
  weeklySlots,
  type DashBooking,
  type DashInvite,
  type EnrollmentState,
  type NextStep,
} from "@/lib/dashboardState";
import {
  comingUp,
  enrolledGroups,
  groupNotes,
  timesLine,
  type ComingUpItem,
  type EnrolledGroup,
} from "@/lib/dashboardCalm";
import { firstNameOf, namesList, possessive } from "@/lib/householdView";
import { LevelTag, TierEmblem, TierLine, TierRangeBadges, formatShortDate } from "@/components/tiers";
import { OPEN_GROUPS_HEADING, OpenGroupsList } from "@/components/sections/OpenGroups";
import { QuizSideLine } from "@/components/ui/MainAction";
import { Button } from "@/components/ui/Button";
import { CARD_CLASS } from "@/components/ui/Card";
import { Heading } from "@/components/ui/Heading";
import { TEXT_LINK_LIME, TEXT_LINK_MUTED } from "@/components/ui/TextLink";
import { CalendarIcon, ClockIcon } from "@/components/ui/icons";
import { PinIcon } from "@/components/locations/LocationLine";
import { NEWSLETTER_ANCHOR } from "@/content/site";
import { signedInOpenCards, type GroupCard } from "@/lib/groupBlocks";
import { formatClassHours, programWhoWhenLine, type SuggestedProgram } from "@/lib/programCatalog";
import { PlayerTimes } from "./PlayerTimes";

// Presentation only. The page (page.tsx) reads everything behind the holder's
// session and hands it over as plain data; the words for each state come
// from src/lib/dashboardState.ts and the lists from src/lib/dashboardCalm.ts.
//
// The dashboard in the site's one look (backlog #105). Top to bottom: the
// welcome as a plain heading with "Edit profile"; the next step, the page's
// one card with a lime button, and only when there is something to do;
// "Coming up", every dated item; one card per group with each player's own
// status; groups with dates, the /programs cards; one players section (level
// emblem, the week as one line, "Edit times" opens the grid, "Add another
// player"); suggestions only when no group with dates is listed. Under the
// next step every section reads heading left, content right from lg, the
// "Good to know" pattern on /programs. The rules it follows: no capital
// label over a heading, every heading on the Heading scale, one card style
// (Card, no shadow, never a card in a card, no side stripe), 12-hour times,
// the group's name and never the coach's block label, no arrow typed after
// a link's words.

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
  /**
   * A paid assessment booked under this address while signed out, not on the
   * account yet (safety review): named, with the link that puts it there.
   */
  creditWaiting?: boolean;
  enrollments: DashboardEnrollment[];
  /** Every cohort (enrollment lookups). */
  cohorts: Cohort[];
  /** Dated session rows keyed by cohort id (empty when none are generated yet). */
  sessionsByCohort: Record<string, CohortSessionRow[]>;
  /** The account's upcoming assessment bookings, for "Coming up". */
  bookings?: DashBooking[];
  /** The account's invites: a held spot's deadline is listed in "Coming up". */
  invites?: DashInvite[];
  /** The current instant (ISO); holds are compared against it. Defaults to now. */
  now?: string;
  /** Open cohorts a player on the account may join by level, not yet enrolled. */
  openForTier: OpenForTier[];
  /**
   * The open blocks as group cards (owner, 2026-11-19), each with "Enroll" to
   * its sign-up page: the same cards as /programs, for this account
   * (accountOpenCards, src/lib/groupBlocks.ts).
   */
  openGroups?: GroupCard[];
  /** Whether any block is open at all, listed for this account or not. */
  anyGroupOpen?: boolean;
  /** Programs that fit a player, shown only when no group with dates is listed. */
  suggestions: SuggestedProgram[];
  programs: Program[];
  /** A quiz-placed player's cohort band, by player id (audit L17, owner D6-B). */
  placedSpans?: Record<string, PlacedSpan | null>;
  /** Today in Toronto as "YYYY-MM-DD". */
  today: string;
  /** Whether anyone on the account has taken the 2-minute quiz. */
  quizTaken?: boolean;
};

const FACT_GLYPH = "mt-[3px] h-[15px] w-[15px] shrink-0 opacity-65";

const CHIP_BASE = "inline-flex min-h-6 shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium";
const CHIP_TONE: Record<"lime" | "neutral" | "warn" | "muted", string> = {
  lime: "bg-[#B4E655]/10 text-[#B4E655]",
  neutral: "border border-white/15 bg-white/5 text-white/85",
  warn: "border border-yellow-400/30 bg-yellow-400/10 text-yellow-200",
  muted: "border border-dashed border-white/25 text-white/75",
};

function relationshipLine(player: PlayerRecord): string {
  const rel = isRelationship(player.relationship) ? RELATIONSHIP_LABELS[player.relationship] : "";
  const age = player.age_band ? AGE_BAND_LABELS[player.age_band] : player.is_minor ? "Under 18" : "";
  return [rel, age].filter(Boolean).join(" · ");
}

/**
 * "Groups with dates" lists a full block with "Notify me". This page carries
 * no newsletter line of its own (FooterNewsletter), so the button opens the
 * one on /programs.
 */
const NOTIFY_HREF = `/programs#${NEWSLETTER_ANCHOR}`;

/** A small chevron for a disclosure, drawn, never a text glyph. */
function Chevron({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`h-4 w-4 ${className}`} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

/** "e-transfer" never breaks at its hyphen. */
function keepWhole(text: string): string {
  return text.replace(/e-transfer/g, "e‑transfer");
}

// ─── A section: heading left, content right from lg ─────────────────────────

function Section({
  id,
  title,
  sub,
  children,
}: {
  id: string;
  title: string;
  sub?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`${id}-heading`}
      id={id}
      className="grid scroll-mt-24 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.3fr)] lg:gap-12"
    >
      <div>
        <Heading id={`${id}-heading`} className="text-balance">
          {title}
        </Heading>
        {sub && <p className="mt-2 max-w-md text-[15px] text-white/70">{sub}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

// ─── The next step: the page's one card with a lime button ───────────────────

function NextStepCard({
  step,
  creditLine,
  creditWaiting,
}: {
  step: NextStep;
  creditLine: string | null;
  creditWaiting: boolean;
}) {
  const hasActions = Boolean(step.primary || step.secondary || step.quizSideLine);
  return (
    <section aria-labelledby="next-step" className={`${CARD_CLASS} p-6 md:p-8`}>
      <Heading id="next-step" className="max-w-3xl text-balance">
        {keepWhole(step.headline)}
      </Heading>
      {/* A waiting e-transfer: what to type, as three labelled values. */}
      {step.facts && (
        <dl className="mt-5 flex flex-wrap gap-x-10 gap-y-3">
          {step.facts.map((f) => (
            <div key={f.label} className="min-w-0">
              <dt className="text-sm text-white/60">{f.label}</dt>
              <dd className="mt-0.5 break-words text-[17px] font-semibold tabular-nums text-white">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className={`${step.facts ? "mt-4" : "mt-3"} max-w-2xl text-[15px] leading-relaxed text-white/75`}>
        {keepWhole(step.detail)}
      </p>
      {/* The unused $20, with its condition (audit M25), unless the
          invite above already did the sum. */}
      {creditLine && step.kind !== "invite" && (
        <p className="mt-4 max-w-2xl border-t border-white/10 pt-4 text-[15px] leading-relaxed text-white/75">{creditLine}</p>
      )}
      {creditWaiting && (
        <CreditWaitingNote page="dashboard" next="/dashboard" className="mt-4 border-t border-white/10 pt-4" />
      )}
      {hasActions && (
        <div className="mt-6">
          {(step.primary || step.secondary) && (
            <div className="flex flex-wrap gap-3">
              {/* The page's one lime button. */}
              {step.primary && <Button href={step.primary.href}>{step.primary.label}</Button>}
              {step.secondary && (
                <Button variant="secondary" href={step.secondary.href}>
                  {step.secondary.label}
                </Button>
              )}
            </div>
          )}
          {/* The quiz as the main action's side line, never a lime button. */}
          {step.quizSideLine && <QuizSideLine source="dashboard" className="mt-3" />}
        </div>
      )}
    </section>
  );
}

// ─── Coming up ───────────────────────────────────────────────────────────────

function ComingUpList({ items }: { items: ComingUpItem[] }) {
  return (
    <ul role="list" className="divide-y divide-white/10 border-y border-white/10">
      {items.map((item) => (
        <li key={item.id} className="flex items-start gap-5 py-3.5">
          <p className="w-[3.75rem] shrink-0 tabular-nums">
            <span className="block text-xs text-white/60">{item.weekday}</span>
            <span className="block text-[15px] font-semibold text-white">{item.day}</span>
          </p>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-white">
              {item.title}
              <span className="whitespace-nowrap font-normal tabular-nums text-white/75"> · {item.time}</span>
            </p>
            <p className="text-sm text-white/70">{item.detail}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ─── Your groups: one per block, with its players ────────────────────────────

function PlayerChips({ group, notes }: { group: EnrolledGroup; notes: string[] }) {
  return (
    <>
      <ul role="list" className="space-y-2">
        {group.players.map((p) => {
          const chip = ENROLLMENT_CHIP[p.state];
          return (
            <li key={p.enrollmentId} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="text-[15px] font-medium text-white">{p.name ?? "You"}</span>
              <span className={`${CHIP_BASE} ${CHIP_TONE[chip.tone]}`}>{chip.label}</span>
            </li>
          );
        })}
      </ul>
      {/* Each state's own line, once, however many players share it. */}
      {notes.map((note) => (
        <p key={note} className="mt-2 text-sm text-white/70">
          {note}
        </p>
      ))}
    </>
  );
}

function GroupFacts({ group }: { group: EnrolledGroup }) {
  const club = group.cohort ? locationForCohort(group.cohort)?.name : null;
  return (
    <ul role="list" className="mt-2 space-y-1 text-sm text-white/75">
      {group.dates && (
        <li className="flex items-start gap-2 font-medium tabular-nums text-white">
          <CalendarIcon className={FACT_GLYPH} />
          {group.dates}
        </li>
      )}
      {group.days && (
        <li className="flex items-start gap-2 tabular-nums">
          <ClockIcon className={FACT_GLYPH} />
          {group.days}
        </li>
      )}
      {club && (
        <li className="flex items-start gap-2">
          <PinIcon className={FACT_GLYPH} />
          {club}
        </li>
      )}
    </ul>
  );
}

function ClassRow({ row, replaces, muted = false }: { row: CohortSessionRow; replaces?: CohortSessionRow; muted?: boolean }) {
  return (
    <li className={`flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm tabular-nums ${muted ? "text-white/60" : "text-white/80"}`}>
      <span className="w-[6.5rem] shrink-0 font-medium">
        {dayNameForDate(row.session_date)} {fmtMonthDay(row.session_date)}
      </span>
      <span>{formatClassHours(row.start_time.slice(0, 5), row.end_time.slice(0, 5))}</span>
      {row.makeup_for && (
        <span className={`${CHIP_BASE} bg-sky-400/15 text-sky-200`}>
          Make-up{replaces ? `, replaces ${fmtMonthDay(replaces.session_date)}` : ""}
        </span>
      )}
    </li>
  );
}

/**
 * The dated classes of a block that has them, behind one line: the ones to
 * come, then the ones already played. A cancelled class is not listed; its
 * make-up names the date it replaces.
 */
function ClassDates({ sessions, today }: { sessions: CohortSessionRow[]; today: string }) {
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const held = sessions.filter((s) => s.status !== "cancelled");
  const upcoming = held.filter((s) => s.session_date >= today);
  const past = held.filter((s) => s.session_date < today).reverse();
  if (held.length === 0) return null;
  return (
    <details className="group mt-4 border-t border-white/10 pt-1">
      <summary className={`${TEXT_LINK_MUTED} cursor-pointer list-none gap-1.5 font-semibold [&::-webkit-details-marker]:hidden`}>
        <Chevron className="transition-transform group-open:rotate-90" />
        Class dates ({upcoming.length > 0 ? upcoming.length : held.length})
      </summary>
      {upcoming.length > 0 && (
        <ul role="list" className="divide-y divide-white/10 pb-1">
          {upcoming.map((s) => (
            <ClassRow key={s.id} row={s} replaces={s.makeup_for ? byId.get(s.makeup_for) : undefined} />
          ))}
        </ul>
      )}
      {past.length > 0 && (
        <>
          <p className="pt-2 text-sm text-white/60">Past</p>
          <ul role="list" className="divide-y divide-white/10 pb-1">
            {past.map((s) => (
              <ClassRow key={s.id} row={s} replaces={s.makeup_for ? byId.get(s.makeup_for) : undefined} muted />
            ))}
          </ul>
        </>
      )}
    </details>
  );
}

function EnrolledGroupCard({
  group,
  sessions,
  today,
  quietStates,
}: {
  group: EnrolledGroup;
  sessions: CohortSessionRow[];
  today: string;
  /** States whose line the next step already said. */
  quietStates: readonly EnrollmentState[];
}) {
  const active = group.players.some((p) => enrollmentIsActive(p.state));
  return (
    <article className={`${CARD_CLASS} p-5 md:p-6`}>
      <div className="grid gap-5 sm:grid-cols-2 sm:gap-8">
        <div className="min-w-0">
          <LevelTag level={group.level} plain />
          <Heading as="h3" className="mt-2 leading-tight">
            {group.name}
          </Heading>
          <GroupFacts group={group} />
        </div>
        <div className="border-t border-white/10 pt-4 sm:border-l sm:border-t-0 sm:pl-8 sm:pt-0">
          <PlayerChips group={group} notes={groupNotes(group, quietStates)} />
        </div>
      </div>
      {active && <ClassDates sessions={sessions} today={today} />}
    </article>
  );
}

// ─── Players ─────────────────────────────────────────────────────────────────

/** The player's level in one line, with the moment a provisional one is settled. */
function levelLine(player: PlayerRecord, placed: PlacedSpan | null | undefined): string {
  if (hasLevel(player.level)) {
    const set = formatShortDate(player.level_assessed_at);
    return `${formatTierLevel(player.level).replace(" · ", " · ")}${set ? ` · Set by our coaches · ${set}` : ""}`;
  }
  if (placed) {
    return `${formatTierSpan(placed.min, placed.max)} group, provisional until our coaches confirm it on court in week one.`;
  }
  return "No level yet. Our coaches confirm it on court in week one.";
}

function PlayerRow({
  player,
  placed,
  named,
}: {
  player: PlayerRecord;
  placed: PlacedSpan | null | undefined;
  named: boolean;
}) {
  const tier = tierForLevel(player.level) ?? (placed ? tierForLevel(placed.min) : null);
  const meta = relationshipLine(player);
  return (
    <li className="py-4">
      <div className="flex items-start gap-4">
        <TierEmblem
          tier={tier?.id ?? null}
          state={hasLevel(player.level) ? "earned" : "provisional"}
          size={44}
          decorative
          className="mt-0.5 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <Heading as="h3" className="leading-tight">
            {player.full_name?.trim() || "Unnamed player"}
          </Heading>
          {meta && <p className="mt-0.5 text-sm text-white/60">{meta}</p>}
          <p className="mt-1 text-sm text-white/85">{levelLine(player, placed)}</p>
          <div className="mt-1.5">
            <PlayerTimes
              participantId={player.id}
              participantName={firstNameOf(player.full_name)}
              showName={named}
              line={timesLine(player.availability)}
              availability={player.availability}
              note={player.availability_note ?? ""}
              updatedAt={player.availability_updated_at}
              source={player.availability_source}
            />
          </div>
        </div>
      </div>
    </li>
  );
}

/**
 * Under the players: add a player, and retake the quiz if the answers
 * changed. An account that never took the quiz (it enrolled as a guest) is
 * offered it here as a text link, unless the next step already offers it as
 * its side line.
 */
function PlayerLinks({ quizTaken, quizOffered, several }: { quizTaken: boolean; quizOffered: boolean; several: boolean }) {
  return (
    <>
      {!quizTaken && quizOffered && (
        <p className="mt-4 text-sm text-white/70">
          {several
            ? "Not placed yet? Take the 2-minute quiz and our coaches place each player by level and schedule."
            : "Not placed yet? Take the 2-minute quiz and our coaches place you by level and schedule."}
        </p>
      )}
      <p className="mt-2 flex flex-wrap items-center gap-x-6">
        <Link href="/intake?add=1" className={TEXT_LINK_LIME}>
          Add another player
        </Link>
        {quizTaken ? (
          <Link href="/intake?retake=1" className={TEXT_LINK_MUTED}>
            Retake the quiz
          </Link>
        ) : quizOffered ? (
          <Link href="/intake" className={TEXT_LINK_MUTED}>
            Take the 2-minute quiz
          </Link>
        ) : null}
      </p>
    </>
  );
}

// ─── Suggestions, as rows ────────────────────────────────────────────────────

function SuggestionRows({ suggestions }: { suggestions: SuggestedProgram[] }) {
  return (
    <ul role="list" className="divide-y divide-white/10 border-y border-white/10">
      {suggestions.map(({ program, fit }) => {
        const groups = programGroups.filter((g) => g.programSlug === program.id);
        const line = [programWhoWhenLine(groups), fit ? `Fits ${fit.name ?? "you"}` : null].filter(Boolean).join(" · ");
        return (
          <li key={program.id} className="flex flex-wrap items-center justify-between gap-x-6 py-3">
            <div className="min-w-0">
              <Heading as="h3" className="leading-tight">
                {program.title}
              </Heading>
              <p className="mt-0.5 text-sm text-white/70">{line}</p>
            </div>
            <Link href={program.ctaHref} className={TEXT_LINK_LIME}>
              See details<span className="sr-only">: {program.title}</span>
            </Link>
          </li>
        );
      })}
    </ul>
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
    creditWaiting = false,
    enrollments,
    cohorts,
    sessionsByCohort,
    bookings = [],
    invites = [],
    openForTier,
    openGroups = [],
    anyGroupOpen,
    suggestions,
    programs,
    placedSpans = {},
    today,
    now = new Date().toISOString(),
    quizTaken = true,
  } = props;

  const several = roster.length > 1;
  const named = voice === "named";
  const names = roster.map((p) => (p.id === self?.id ? "you" : firstNameOf(p.full_name) || "your player"));
  const whom = several ? "your players" : (names[0] ?? "you");

  const groups = enrolledGroups(enrollments, cohorts, programs);
  // Every dated item on the account but the one the next step shows.
  const upcoming = comingUp({
    selfId: self?.id ?? null,
    roster,
    voice,
    enrollments,
    cohorts,
    programs,
    sessionsByCohort,
    bookings,
    invites,
    today,
    now,
    shown: step.shown,
  });
  // Suggestions only when no group with dates is listed.
  const showSuggestions = suggestions.length > 0 && signedInOpenCards(openGroups).length === 0;
  // The e-transfer step already says the spot is held; the card's chip is enough.
  const quietStates: EnrollmentState[] = step.kind === "etransfer" ? ["etransfer-pending"] : [];

  return (
    <div className="space-y-8 md:space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
        <Heading as="h1" id="dashboard-welcome">
          {heading}
        </Heading>
        <Link href="/profile" className={TEXT_LINK_MUTED}>
          Edit profile
        </Link>
      </header>

      <NextStepCard step={step} creditLine={creditLine} creditWaiting={creditWaiting} />

      <div className="space-y-12 pt-4 md:space-y-16 md:pt-6">
        {upcoming.length > 0 && (
          <Section id="coming-up" title="Coming up">
            <ComingUpList items={upcoming} />
          </Section>
        )}

        {groups.length > 0 && (
          <Section id="my-programs" title={groups.length === 1 ? "Your group" : "Your groups"}>
            <div className="space-y-3">
              {groups.map((g) => (
                <EnrolledGroupCard
                  key={g.cohortId}
                  group={g}
                  sessions={sessionsByCohort[g.cohortId] ?? []}
                  today={today}
                  quietStates={quietStates}
                />
              ))}
            </div>
          </Section>
        )}

        {/* Groups with dates: the same cards as /programs, each "Enroll" an
            outline under the next step. With none listed, the one line that
            is true. */}
        <Section id="open-groups" title={OPEN_GROUPS_HEADING}>
          <OpenGroupsList
            cards={openGroups}
            quiet
            blocksOpen={anyGroupOpen}
            whom={whom}
            empty="line"
            notifyHref={NOTIFY_HREF}
          />
        </Section>

        {/* Open cohorts a player's level admits (audit M27), private blocks only. */}
        {openForTier.length > 0 && (
          <Section
            id="open-for-tier"
            title={voice === "you" ? "Open for your tier" : several ? "Open for your players" : `Open for ${possessive(names[0] ?? "your player")} tier`}
            sub="Cohorts whose level band fits, with room left."
          >
            <div className="space-y-3">
              {openForTier.map(({ cohort, players: fits }) => {
                const program = programs.find((p) => p.id === cohort.programId);
                const first = fits[0];
                const firstLevel = levelNumber(first?.level);
                const fitNames = fits.map((p) => (p.id === self?.id ? "you" : firstNameOf(p.full_name) || "your player"));
                return (
                  <article key={cohort.id} className={`${CARD_CLASS} p-5 md:p-6`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Heading as="h3">{program?.title ?? cohort.programId}</Heading>
                        <p className="mt-1 text-sm text-white/70">
                          Starts {fmtMonthDay(cohort.startDate)} · {cohort.weeks} week{cohort.weeks === 1 ? "" : "s"} · {weeklySlots(cohort)}
                        </p>
                        {named && <p className="mt-1 text-sm font-semibold text-white/85">Fits {namesList(fitNames)}</p>}
                      </div>
                      <TierRangeBadges levelMin={cohort.levelMin} levelMax={cohort.levelMax} />
                    </div>
                    <TierLine
                      variant="rail"
                      size="sm"
                      span={{ min: cohort.levelMin, max: cohort.levelMax }}
                      marker={
                        firstLevel !== null
                          ? { level: firstLevel, label: first.id === self?.id ? "You" : firstNameOf(first.full_name) || "Player" }
                          : null
                      }
                      labels="ends"
                      className="mt-4"
                    />
                    <Button variant="secondary" href={`/enroll/${cohort.id}`} className="mt-4">
                      Enroll{named && fits.length === 1 && first.id !== self?.id ? ` ${firstNameOf(first.full_name)}` : ""}
                    </Button>
                  </article>
                );
              })}
            </div>
          </Section>
        )}

        <Section
          id="availability"
          title={named ? (several ? "Your players" : "Your player") : "Your level and times"}
          sub="Our coaches build every group around the times its players can train. Keep this current."
        >
          {roster.length > 0 && (
            <ul role="list" className="divide-y divide-white/10 border-y border-white/10">
              {roster.map((player) => (
                <PlayerRow key={player.id} player={player} placed={placedSpans[player.id]} named={named} />
              ))}
            </ul>
          )}
          <PlayerLinks quizTaken={quizTaken} quizOffered={!step.quizSideLine} several={several} />
        </Section>

        {showSuggestions && (
          <Section id="suggested" title="Suggested for you">
            <SuggestionRows suggestions={suggestions} />
          </Section>
        )}
      </div>
    </div>
  );
}
