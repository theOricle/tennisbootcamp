"use client";

import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { recommendPrograms, type Recommendation } from "@/lib/recommend";
import { trackEvent, trackAssessmentCtaClick } from "@/lib/analytics";
import { useBotCheck } from "@/lib/useBotCheck";
import { MIN_FILL_TIME_MS } from "@/lib/botCheck";
import { LEAD_SOURCE_FIELD } from "@/lib/leadSource";
import { storedFirstTouch } from "@/lib/firstTouchBrowser";
import { provisionalTierFor, selfEstimateToLevel, type SelfLevel } from "@/lib/level";
import { AGE_BAND_LABELS, ageBandToWho, type AgeBand } from "@/lib/ageBand";
import { levelWithinRange, type Tier } from "@/lib/tiers";
import { TierChip, TierEmblem, TierLine } from "@/components/tiers";
import type { Program, TimetableSlot } from "@/types/program";
import {
  availabilityToLegacySlots,
  parseAvailability,
  type Availability,
} from "@/lib/availability";
import {
  FIELD_MESSAGES,
  emailError,
  firstIssueId,
  issuesById,
  phoneError,
  requiredError,
  type FieldIssue,
} from "@/lib/formValidation";
import { useFocusOnChange, useFocusOnMount } from "@/lib/useFocusOnChange";
import {
  AvailabilityGrid,
  AvailabilityHoursLegend,
} from "@/components/ui/AvailabilityGrid";
import {
  FieldError,
  FormAlert,
  HINT_CLASS,
  INPUT_CLASS,
  LABEL_CLASS,
  LiveStatus,
  errorIdFor,
  fieldA11y,
} from "@/components/ui/Input";
import { FOCUS_RING } from "@/components/ui/focus";
import { TextLink } from "@/components/ui/TextLink";
import {
  WhoIsThisFor,
  useHousehold,
  EMPTY_HOUSEHOLD,
  householdIssues,
  householdPeople,
  type HouseholdValue,
} from "@/components/participants/WhoIsThisFor";

// ─── Types ────────────────────────────────────────────────────────────────────

type StepType = "contact" | "availability" | "household";

type Step = {
  id: string;
  title: string;
  subtitle?: string;
  type: StepType;
};

type FormState = {
  /** Who the quiz is about — one row per player (backlog #11). */
  household: HouseholdValue;
  goals: string[];
  programs: string[];
  preferredLocationIds: string[];
  availability: Availability;
  notes?: string;
  name?: string;
  phone?: string;
  email?: string;
  newsletter?: boolean;
};

/**
 * One player's match. Age and level are asked per person on the household
 * step (backlog #14), so a parent registering a 9-year-old and a 15-year-old
 * gets a separate read for each.
 */
type PersonResult = {
  key: string;
  name: string;
  ageBand: AgeBand;
  /** The recommender's level, or undefined when they answered "not sure". */
  level?: SelfLevel;
  recommendations: Recommendation[];
};

// ─── Utilities ────────────────────────────────────────────────────────────────

function cn(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

/** The availability grid's first cell: where focus goes when no time is picked. */
const AVAILABILITY_FIELD_ID = "intake-availability";

/** Ids of the contact fields, in screen order. */
const CONTACT_IDS = {
  name: "intake-name",
  phone: "intake-phone",
  email: "intake-email",
} as const;

// ─── Draft (audit L12) ────────────────────────────────────────────────────────
// The answers survive a refresh in this tab. sessionStorage only, so the
// draft goes when the tab closes, and it is cleared once the quiz is sent.

const DRAFT_KEY = "tb-intake-draft-v1";

type Draft = { stepIndex: number; form: FormState };

function readDraft(): Draft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<Draft>;
    const f = d.form;
    if (!f || typeof f !== "object" || !f.household || !Array.isArray(f.household.guests)) {
      return null;
    }
    return {
      stepIndex: typeof d.stepIndex === "number" ? Math.max(0, Math.min(2, d.stepIndex)) : 0,
      form: {
        ...f,
        household: {
          selectedIds: Array.isArray(f.household.selectedIds) ? f.household.selectedIds : [],
          guests: f.household.guests,
          profiles: f.household.profiles ?? {},
        },
        goals: Array.isArray(f.goals) ? f.goals : [],
        programs: Array.isArray(f.programs) ? f.programs : [],
        preferredLocationIds: [],
        availability: parseAvailability(f.availability),
      },
    };
  } catch {
    return null;
  }
}

function writeDraft(draft: Draft | null) {
  try {
    if (draft) window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    else window.sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // Storage blocked: the quiz still works, it just won't survive a refresh.
  }
}

/**
 * A restored draft can reach Submit within a second of a reload, and the
 * route silently drops anything sent under MIN_FILL_TIME_MS after navigation
 * start (backlog #25). Wait out the remainder so a person is never dropped.
 */
function waitForFillTime(): Promise<void> {
  const elapsed = typeof performance !== "undefined" ? performance.now() : MIN_FILL_TIME_MS;
  const remaining = MIN_FILL_TIME_MS + 250 - elapsed;
  return remaining > 0 ? new Promise((r) => setTimeout(r, remaining)) : Promise.resolve();
}

type Router = ReturnType<typeof useRouter>;

/**
 * Hand the booking form what the quiz already knows. The booking page takes
 * one player per slot; a household starts with the first and comes back.
 * Every self-estimate, "elite" included, is passed through (audit M21).
 */
function goToBooking(
  router: Router,
  form: FormState,
  level: SelfLevel | undefined
) {
  try {
    sessionStorage.setItem(
      "assessmentPrefill",
      JSON.stringify({
        name: form.name,
        email: form.email,
        phone: form.phone,
        selfLevel: level,
        availability: form.availability,
        household: form.household,
      })
    );
  } catch {
    // sessionStorage unavailable — booking form just starts empty.
  }
  trackAssessmentCtaClick("intake-result");
  router.push("/assessment/book");
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ProgressBar({ step, total }: { step: number; total: number }) {
  const value = Math.round((step / total) * 100);
  return (
    <div
      role="progressbar"
      aria-label="Quiz progress"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={step}
      aria-valuetext={`Step ${step} of ${total}`}
      className="h-2 w-full overflow-hidden rounded-full bg-white/10"
    >
      <div
        className="h-full rounded-full bg-[#B4E655] motion-safe:transition-all"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

// ─── Tentative-match result screens (funnel flip) ─────────────────────────────

/** "12:00–1:00 pm" → "12:00", the class start as the timetable states it. */
function startOf(slot: TimetableSlot): string {
  return slot.time.split("–")[0];
}

/**
 * The class this player would join, from the program's own timetable (audit
 * M17): the slot for their age band, or the slot whose level band holds their
 * provisional tier, or the program's one class. "Saturdays 12:00–1:00 pm ·
 * Junior (7–13)". Null when the timetable is empty or nothing matches, and the
 * program's schedule line stands in.
 */
function classLineFor(program: Program, ageBand: AgeBand, tier: Tier | null): string | null {
  const slots = program.timetable ?? [];
  if (slots.length === 0) return null;
  const byAge = slots.find((s) => s.ageBand === ageBand);
  const byTier =
    tier && slots.find((s) => s.levelMin !== undefined && levelWithinRange(tier.id, s.levelMin, s.levelMax));
  const slot = byAge ?? byTier ?? (slots.length === 1 ? slots[0] : null);
  if (!slot) {
    // Several banded classes and no tier to pick one: name the day and every start.
    const day = `${slots[0].day}s`;
    const starts = slots.map(startOf);
    const list = starts.length > 1 ? `${starts.slice(0, -1).join(", ")} and ${starts[starts.length - 1]}` : starts[0];
    return `${day} ${list}`;
  }
  const qualifier = slot.ageBand ? AGE_BAND_LABELS[slot.ageBand] : slot.levelMin !== undefined ? slot.group : null;
  return [`${slot.day}s ${slot.time}`, qualifier].filter(Boolean).join(" · ");
}

/**
 * The one program card, identical wherever a player's match is shown: a link
 * to the program page carrying the class line and the price (audit M17).
 * The whole card is the link; the arrow is decoration.
 */
function ProgramMatchCard({
  rec,
  ageBand,
  tier,
}: {
  rec: Recommendation;
  ageBand: AgeBand;
  tier: Tier | null;
}) {
  const { program } = rec;
  const when = classLineFor(program, ageBand, tier) ?? program.schedule ?? null;
  return (
    <Link
      href={`/programs/${program.slug}`}
      className={`group mt-5 block rounded-2xl border border-[#B4E655]/30 bg-[#B4E655]/5 p-5 transition hover:border-[#B4E655]/60 ${FOCUS_RING}`}
    >
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-white/60">{program.type}</span>
      <span className="mt-1 block text-lg font-semibold text-white">{program.title}</span>
      <dl className="mt-3 grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-1.5 text-sm">
        {when && (
          <>
            <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-white/60 pt-0.5">When</dt>
            <dd className="text-white/90">{when}</dd>
          </>
        )}
        {program.priceSummary && (
          <>
            <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-white/60 pt-0.5">Price</dt>
            <dd className="tabular-nums text-white/90">{program.priceSummary}</dd>
          </>
        )}
      </dl>
      <span aria-hidden="true" className="mt-3 block text-sm font-semibold text-[#B4E655]">
        View Program{" "}
        <span className="inline-block motion-safe:transition-transform motion-safe:duration-150 motion-safe:group-hover:translate-x-1">
          →
        </span>
      </span>
    </Link>
  );
}

/**
 * The player's first name when the quiz was about someone other than the
 * holder (a parent taking it for one child), else undefined so the copy says
 * "you". The same rule as the quiz email's subjectOf(): first names compared
 * case-insensitively, the holder being the contact name in form.name.
 */
function otherPlayerFirst(playerName?: string, holderName?: string): string | undefined {
  const player = (playerName ?? "").trim().split(/\s+/)[0] ?? "";
  const holder = (holderName ?? "").trim().split(/\s+/)[0] ?? "";
  if (!player || player.toLowerCase() === holder.toLowerCase()) return undefined;
  return player;
}

/** The dashed "Provisional" chip beside a likely tier (design specs §3.4). */
const PROVISIONAL_CHIP =
  "inline-flex min-h-6 items-center rounded-full border border-dashed border-white/30 bg-white/5 px-2.5 py-1 text-xs font-medium text-white/85";

/**
 * The tier moment on the result screen (audit M17, L30; design specs §3.7):
 * the player's likely tier from the self-estimate map (owner D4) as a 56px
 * provisional emblem, the name, a "Provisional" chip and the compact ladder.
 * A player who answered "Not sure" or "Prefer not to say" is thanked and
 * shown the seven tiers, with no guess.
 */
function LikelyTierBlock({ tier, firstName }: { tier: Tier | null; firstName?: string }) {
  const whom = firstName ? firstName : "you";
  if (!tier) {
    return (
      <div className="mt-6 border-t border-white/10 pt-5">
        <p className="text-base font-semibold text-white">
          Thanks for telling us about {firstName ? `${firstName}'s` : "your"} game.
        </p>
        <p className="mt-1 text-sm leading-relaxed text-white/70">
          Sina places every player on one of seven tiers, Love to Grand Slam.
        </p>
        <TierLine variant="ladder" orientation="horizontal" density="compact" className="mt-5" />
      </div>
    );
  }
  return (
    <div className="mt-6 border-t border-white/10 pt-5">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-white/60">
        {firstName ? `${firstName}'s likely starting tier` : "Your likely starting tier"}
      </span>
      <div className="mt-3 flex items-center gap-4">
        <TierEmblem tier={tier.id} state="provisional" size={56} decorative className="shrink-0" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-2xl font-semibold tracking-tight text-white">{tier.name}</p>
            <span className={PROVISIONAL_CHIP}>Provisional</span>
          </div>
          <p className="mt-0.5 text-sm text-white/70">{tier.blurb}</p>
        </div>
      </div>
      <TierLine
        variant="ladder"
        orientation="horizontal"
        density="compact"
        level={tier.id}
        provisional
        className="mt-5"
      />
      <p className="mt-4 text-sm leading-relaxed text-white/70">
        From your answers. Sina confirms {firstName ? `${firstName}'s` : "your"} tier when he places {whom}.
      </p>
    </div>
  );
}

const OUTLINE_BUTTON = `inline-flex min-h-[48px] items-center justify-center rounded-full border border-[#B4E655]/60 px-6 py-3 text-sm font-semibold text-[#B4E655] transition hover:border-[#B4E655] hover:bg-[#B4E655]/10 ${FOCUS_RING}`;

/** The result screen's chrome: the wizard card, flat on phones (audit L10). */
const RESULT_CARD =
  "md:rounded-3xl md:border md:border-white/10 md:bg-white/5 md:p-8";

/**
 * The intake is already saved when any result screen renders, so every one
 * opens by saying so: nothing else is required (backlog #19). Its h1 takes
 * focus when the screen appears (audit M19), so a screen-reader user hears
 * the result instead of silence on a vanished Submit button. The next step
 * is stated as it works today: Sina emails an invitation when a group that
 * fits is forming (audit M17). No window is promised until the owner sets
 * one (D21).
 */
function IntakeComplete({
  name,
  household,
  signedIn,
}: {
  name?: string;
  household: boolean;
  signedIn: boolean;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useFocusOnMount(headingRef);
  const firstName = (name ?? "").trim().split(/\s+/)[0];
  return (
    <>
      <span className="text-xs font-semibold uppercase tracking-wide text-[#B4E655]">
        Quiz complete
      </span>
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="mt-2 text-2xl font-semibold focus:outline-none md:text-3xl"
      >
        {firstName ? `You're all set, ${firstName}.` : "You're all set."}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-white/70">
        {household
          ? "Your answers are in and there's nothing else you need to do. Sina reviews each player's level and your schedule, then places each of them in a group and a time that fit."
          : "Your answers are in and there's nothing else you need to do. Sina reviews your level and schedule, then places you in a group and a time that fit."}
      </p>
      <p className="mt-3 text-sm leading-relaxed text-white/70">
        {household
          ? "When a group that fits a player's level and your schedule is forming, Sina emails you an invitation with the day, time and price."
          : "When a group that fits your level and schedule is forming, Sina emails you an invitation with the day, time and price."}
      </p>
      {/* Only a brand-new email gets the set-password link; a signed-in holder has one. */}
      {!signedIn && (
        <p className="mt-3 text-sm leading-relaxed text-white/70">
          The first time you use an email address with us, we send it a link to set a password.
        </p>
      )}
    </>
  );
}

/** The assessment, offered — never required. Same booking hand-off as before. */
function AssessmentSuggestion({
  onBook,
  household,
}: {
  onBook: () => void;
  household: boolean;
}) {
  return (
    <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
      <p className="text-sm font-semibold text-white">Optional: an on-court assessment</p>
      <p className="mt-1 text-sm leading-relaxed text-white/70">
        {household
          ? "If you'd like a player's level confirmed on court before they're placed, you can book a 20-minute assessment with the coach, one player per slot. The assessment is $20 per player, and if that player enrolls in a program afterward their $20 comes off the price."
          : "If you'd like your level confirmed on court before you're placed, you can book a 20-minute assessment with the coach. The assessment is $20, and if you enroll in a program afterward that $20 comes off the price."}
      </p>
      <button type="button" onClick={onBook} className={cn("mt-4", OUTLINE_BUTTON)}>
        Book Your Assessment
      </button>
    </div>
  );
}

/** The two demoted links, shared by every result screen: 44px targets (audit L4). */
function ResultLinks() {
  return (
    <div className="mt-6 flex flex-wrap gap-3">
      <Link
        href="/"
        className={`inline-flex min-h-[44px] items-center rounded-full bg-white/10 px-5 text-sm font-semibold text-white transition hover:bg-white/15 ${FOCUS_RING}`}
      >
        Back to Home
      </Link>
      <Link
        href="/programs"
        className={`inline-flex min-h-[44px] items-center rounded-full border border-white/25 px-5 text-sm font-semibold text-white/80 transition hover:border-white/45 hover:text-white ${FOCUS_RING}`}
      >
        Browse Programs
      </Link>
    </div>
  );
}

/** One player: confirmation, their tentative match, the optional assessment. */
function TentativeMatchScreen({
  result,
  form,
  signedIn,
}: {
  result: PersonResult;
  form: FormState;
  signedIn: boolean;
}) {
  const router = useRouter();
  const top = result.recommendations[0];
  const tier = provisionalTierFor(result.level);

  return (
    <main className="min-h-screen bg-[#061427] text-white">
      <div className="mx-auto max-w-2xl px-6 py-10 md:py-16">
        <div className={RESULT_CARD}>
          <IntakeComplete name={form.name} household={false} signedIn={signedIn} />

          {/* The likely tier, named as provisional (audit M17) */}
          <LikelyTierBlock tier={tier} firstName={otherPlayerFirst(result.name, form.name)} />

          {/* The match, as information: a link to the program with its class and price */}
          {top && (
            <div className="mt-6 border-t border-white/10 pt-5">
              <span className="text-xs font-semibold uppercase tracking-wide text-white/60">
                Your tentative match
              </span>
              <ProgramMatchCard rec={top} ageBand={result.ageBand} tier={tier} />
            </div>
          )}

          <AssessmentSuggestion
            household={false}
            onBook={() => goToBooking(router, form, result.level)}
          />

          <ResultLinks />
        </div>
      </div>
    </main>
  );
}

/** Two or more players: confirmation, one read each, the optional assessment. */
function HouseholdMatchScreen({
  results,
  form,
  signedIn,
}: {
  results: PersonResult[];
  form: FormState;
  signedIn: boolean;
}) {
  const router = useRouter();
  const first = results[0];
  const anyTier = results.some((r) => provisionalTierFor(r.level) !== null);

  return (
    <main className="min-h-screen bg-[#061427] text-white">
      <div className="mx-auto max-w-2xl px-6 py-10 md:py-16">
        <div className={RESULT_CARD}>
          <IntakeComplete name={form.name} household signedIn={signedIn} />

          {/* Each player's likely tier as a provisional chip and rail (audit
              M17), the ladder once, then each player's match. */}
          <div className="mt-6 border-t border-white/10 pt-5">
            <span className="text-xs font-semibold uppercase tracking-wide text-white/60">
              Likely starting tiers for your {results.length} players
            </span>
            <ul role="list" className="mt-3 space-y-4">
              {results.map((r) => {
                const tier = provisionalTierFor(r.level);
                const first = r.name.trim().split(/\s+/)[0] || r.name;
                return (
                  <li key={r.key}>
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                      <p className="text-base font-semibold text-white">{r.name}</p>
                      {tier ? (
                        <TierChip level={tier.id} provisional />
                      ) : (
                        <span className={PROVISIONAL_CHIP}>Sina sets {first}&apos;s tier</span>
                      )}
                    </div>
                    <TierLine
                      variant="rail"
                      size="sm"
                      level={tier?.id ?? null}
                      provisional
                      labels="none"
                      className="mt-2"
                    />
                  </li>
                );
              })}
            </ul>
            <TierLine variant="ladder" orientation="horizontal" density="compact" className="mt-6" />
            <p className="mt-4 text-sm leading-relaxed text-white/70">
              {anyTier
                ? "From your answers. Sina confirms each player's tier when he places them."
                : "Sina places every player on one of seven tiers, Love to Grand Slam."}
            </p>
          </div>

          {/* The matches, as information */}
          <div className="mt-6 border-t border-white/10 pt-5">
            <span className="text-xs font-semibold uppercase tracking-wide text-white/60">
              Tentative matches for your {results.length} players
            </span>
            <div className="mt-2 space-y-6">
              {results.map((r) => {
                const top = r.recommendations[0];
                return (
                  <div key={r.key} className="border-t border-white/10 pt-5 first:border-t-0 first:pt-2">
                    <p className="text-base font-semibold text-white">{r.name}</p>
                    {top ? (
                      <ProgramMatchCard rec={top} ageBand={r.ageBand} tier={provisionalTierFor(r.level)} />
                    ) : (
                      <p className="mt-3 text-sm text-white/70">
                        Nothing lines up on paper — Sina places them from their answers.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <AssessmentSuggestion
            household
            onBook={() => goToBooking(router, form, first?.level)}
          />

          <ResultLinks />
        </div>
      </div>
    </main>
  );
}

/** No program lines up on paper: confirmation and the optional assessment. */
function FallbackScreen({
  form,
  level,
  playerName,
  household,
  signedIn,
}: {
  form: FormState;
  level?: SelfLevel;
  /** The one player's name, so a parent reads their child's name (see otherPlayerFirst). */
  playerName?: string;
  household: boolean;
  signedIn: boolean;
}) {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-[#061427] text-white">
      <div className="mx-auto max-w-2xl px-6 py-10 md:py-16">
        <div className={RESULT_CARD}>
          <IntakeComplete name={form.name} household={household} signedIn={signedIn} />

          {/* One player still gets their likely tier; a household with no match is thanked. */}
          {!household && (
            <LikelyTierBlock
              tier={provisionalTierFor(level)}
              firstName={otherPlayerFirst(playerName, form.name)}
            />
          )}

          <AssessmentSuggestion
            household={household}
            onBook={() => goToBooking(router, form, level)}
          />

          <ResultLinks />
        </div>
      </div>
    </main>
  );
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

function IntakePageInner() {
  const searchParams = useSearchParams();
  const programParam = searchParams.get("program");

  // Keep pre-selection so ?program=bootcamps still seeds the recommendation engine
  const slugToOptionId: Record<string, string> = {
    "youth-programs": "youth",
    "high-performance": "high-performance",
    bootcamps: "bootcamp",
    "kids-summer-camp": "camp",
    "group-lessons": "group",
  };
  const preselectedProgram =
    programParam && slugToOptionId[programParam] ? [slugToOptionId[programParam]] : [];

  // A saved draft is restored after the first render (the server never sees
  // sessionStorage), and nothing is written back until it has been read.
  const [draftChecked, setDraftChecked] = useState(false);
  const restoredDraft = useRef(false);

  const [stepIndex, setStepIndex] = useState(0);
  // Bot protection (backlog #25): honeypot + time since the quiz rendered.
  const bot = useBotCheck();
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  // One entry per player the quiz was about (backlog #14).
  const [results, setResults] = useState<PersonResult[]>([]);
  // Field ids whose problems are on screen: added when Next is pressed or a
  // filled field loses focus, so nothing turns red while a person types.
  const [shown, setShown] = useState<Set<string>>(() => new Set());
  // The list under the primary button, after a Next press that found gaps.
  const [pressedWithGaps, setPressedWithGaps] = useState(false);

  const household = useHousehold();
  const [form, setForm] = useState<FormState>({
    household: EMPTY_HOUSEHOLD,
    goals: [],
    programs: preselectedProgram,
    // No venue step (backlog #1): court details are confirmed in the booking
    // email. Kept empty so the /api/intake payload shape is unchanged.
    preferredLocationIds: [],
    availability: { days: {}, v: 1 },
    newsletter: false,
  });

  // Who the quiz is about decides the words (audit M18, L11): a parent
  // answering only for a child reads "they" and is asked for their own name
  // as the parent or guardian.
  const forSelf = household.signedIn
    ? form.household.selectedIds.some(
        (id) => household.participants.find((p) => p.id === id)?.relationship === "self"
      )
    : form.household.guests.some((g) => g.relationship === "self");

  const steps: Step[] = useMemo(
    () => [
      {
        id: "household",
        title: "Who is this for?",
        subtitle:
          "Yourself, your child, both — add everyone you want placed. We ask each person's age and where their game is right now, and each one gets their own read.",
        type: "household",
      },
      {
        id: "availability",
        title: forSelf ? "When can you train?" : "When can they train?",
        subtitle:
          "One schedule for everyone you added — you can adjust it per person later. Tap every slot that works: groups form around shared availability, so the more times you give us, the more groups fit.",
        type: "availability",
      },
      {
        id: "contact",
        title: "Where can we reach you?",
        subtitle:
          "The first time you use an email address with us, we send it a link to set a password. We only reach out when we're forming groups that fit your level and schedule.",
        type: "contact",
      },
    ],
    [forSelf]
  );

  const current = steps[stepIndex];
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Next and Back land on the new step's heading (audit M19).
  useFocusOnChange(headingRef, stepIndex);

  useEffect(() => {
    trackEvent("intake_start");
    // Restore a draft from this tab (audit L12). On the microtask queue, so
    // no state is set synchronously inside the mount effect.
    Promise.resolve().then(() => {
      const draft = readDraft();
      if (draft) {
        restoredDraft.current = true;
        setForm(draft.form);
        setStepIndex(draft.stepIndex);
      }
      setDraftChecked(true);
    });
  }, []);

  // Keep the draft current; a sent quiz has no draft.
  useEffect(() => {
    if (!draftChecked || submitted) return;
    writeDraft({ stepIndex, form });
  }, [form, stepIndex, submitted, draftChecked]);

  /** What stops the current step, one issue per field, in screen order. */
  function stepIssues(stepId: string = current.id): FieldIssue[] {
    switch (stepId) {
      case "household":
        // A name and a self-estimate for every player: the quiz places each
        // of them off those two answers plus their age band.
        return householdIssues(form.household, household.signedIn, household.participants, {
          requireProfile: true,
        });
      case "availability": {
        const any = Object.values(form.availability.days).some((b) => b && b.length > 0);
        return any ? [] : [{ id: AVAILABILITY_FIELD_ID, message: FIELD_MESSAGES.availabilityMissing }];
      }
      case "contact": {
        const out: FieldIssue[] = [];
        const nameErr = requiredError(form.name ?? "");
        const phoneErr = phoneError(form.phone ?? "");
        const emailErr = emailError(form.email ?? "");
        if (nameErr) out.push({ id: CONTACT_IDS.name, message: nameErr });
        if (phoneErr) out.push({ id: CONTACT_IDS.phone, message: phoneErr });
        if (emailErr) out.push({ id: CONTACT_IDS.email, message: emailErr });
        return out;
      }
      default:
        return [];
    }
  }

  const issues = stepIssues();
  const visibleIssues = issues.filter((i) => shown.has(i.id));
  const errors = issuesById(visibleIssues);

  /** Show a field's problem once a filled field loses focus. */
  function revealOnBlur(id: string, value: string) {
    if (!value.trim()) return;
    setShown((s) => (s.has(id) ? s : new Set(s).add(id)));
  }

  /** The holder's name, prefilled from the "Myself" block (audit M18). */
  function selfName(): string {
    if (household.signedIn) {
      const self = household.participants.find(
        (p) => p.relationship === "self" && form.household.selectedIds.includes(p.id)
      );
      return self?.name?.trim() ?? "";
    }
    return form.household.guests.find((g) => g.relationship === "self")?.name.trim() ?? "";
  }

  async function onSubmit() {
    setSubmitting(true);
    setSubmitError(false);
    try {
      if (restoredDraft.current) await waitForFillTime();
      // One read per player: their own age band and self-estimate, the
      // household's shared availability and program interest (backlog #14).
      // The rule-based recommender still consumes the legacy slot list, so
      // derive it from the grid once and share it across the players.
      const slots = availabilityToLegacySlots(form.availability);
      const people = householdPeople(
        form.household,
        household.signedIn,
        household.participants
      );
      const personResults: PersonResult[] = people.map((p) => {
        const level = selfEstimateToLevel(p.selfLevel);
        return {
          key: p.key,
          name: p.name,
          ageBand: p.ageBand,
          level,
          recommendations: recommendPrograms({
            who: ageBandToWho(p.ageBand),
            ageBand: p.ageBand,
            level,
            goals: form.goals,
            programs: form.programs,
            preferredLocationIds: form.preferredLocationIds,
            availability: slots,
          }),
        };
      });
      // Sheet columns 5–6 (`who`, `level`) describe the row's player. The
      // route writes each resolved participant's own values; these are the
      // fallback for a row it could not resolve, and for a lone player they
      // are exactly what the deleted steps used to send.
      const primary = personResults[0];
      const topProgram = primary?.recommendations[0]?.program.slug ?? "";

      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          who: primary ? ageBandToWho(primary.ageBand) : "",
          level: primary?.level ?? "",
          // Not a Sheet column — it keeps the recommendation email on the same
          // read as the card the player just saw.
          ageBand: primary?.ageBand ?? "",
          // goals, programs, notes not collected in wizard — send empty defaults
          goals: form.goals,
          programs: form.programs,
          notes: form.notes ?? "",
          // backward-compat: col 9 (area) populated with preferredLocationIds
          area: form.preferredLocationIds.join(", "),
          // col 16: structured availability grid; API serializes to compact string
          availability: form.availability,
          recommendedProgram: topProgram,
          // Who the quiz is about (cols 18–22, one row per player).
          participantIds: form.household.selectedIds,
          // Signed in, each chosen player's own age band and self-estimate.
          participantProfiles: form.household.profiles,
          participants: form.household.guests
            .filter((g) => g.name.trim())
            .map((g) => ({
              name: g.name.trim(),
              relationship: g.relationship,
              isMinor: g.isMinor,
              ageBand: g.ageBand,
              selfLevel: g.selfLevel || undefined,
            })),
          // Where this visitor came from (cols 23–29, backlog #26): the
          // first-touch record, or nothing for a direct visit.
          [LEAD_SOURCE_FIELD]: storedFirstTouch() ?? undefined,
          // Read and dropped by the route — never a Sheet column.
          ...bot.payload(),
        }),
      });
      if (!res.ok) throw new Error("Submission failed");
      // Signed in, the route answers with the ids of the people this quiz was
      // about, including anyone just added (backlog #24). Fold them into the
      // household so "Book Your Assessment" starts with the new player
      // selectable, and drop the typed blocks: they are participants now.
      const data = (await res.json().catch(() => ({}))) as { participantIds?: unknown };
      if (household.signedIn && Array.isArray(data.participantIds)) {
        const ids = data.participantIds.filter((x): x is string => typeof x === "string");
        setForm((s) => ({
          ...s,
          household: {
            ...s.household,
            selectedIds: Array.from(new Set([...s.household.selectedIds, ...ids])),
            guests: s.household.guests.filter((g) => g.relationship === "self"),
          },
        }));
      }
      trackEvent("intake_complete", { participants: personResults.length });
      writeDraft(null);
      setResults(personResults);
      setSubmitted(true);
    } catch (err) {
      console.error("Intake submission error:", err);
      setSubmitError(true);
    } finally {
      setSubmitting(false);
    }
  }

  /** Move to a step, clearing the previous step's problem list. */
  function goTo(index: number) {
    setPressedWithGaps(false);
    setStepIndex(index);
  }

  // The primary button is always enabled (audit M19): pressing it with gaps
  // shows each problem by its field, lists them under the button and moves
  // focus to the first one.
  function next() {
    if (submitting) return;
    const found = stepIssues();
    if (found.length > 0) {
      setShown((s) => {
        const out = new Set(s);
        for (const i of found) out.add(i.id);
        return out;
      });
      setPressedWithGaps(true);
      const id = firstIssueId(found);
      if (id) requestAnimationFrame(() => document.getElementById(id)?.focus());
      return;
    }
    if (stepIndex === steps.length - 1) {
      void onSubmit();
      return;
    }
    const nextIndex = Math.min(stepIndex + 1, steps.length - 1);
    if (steps[nextIndex].id === "contact" && !form.name?.trim()) {
      const name = selfName();
      if (name) setForm((s) => ({ ...s, name }));
    }
    goTo(nextIndex);
  }

  /** "Skip for now" on the availability step (audit L11): no times sent. */
  function skipAvailability() {
    if (!form.name?.trim()) {
      const name = selfName();
      if (name) setForm((s) => ({ ...s, name }));
    }
    goTo(stepIndex + 1);
  }

  function back() {
    goTo(Math.max(stepIndex - 1, 0));
  }

  // ── Submitted ─────────────────────────────────────────────────────────────
  if (submitted) {
    if (!results.some((r) => r.recommendations.length > 0)) {
      return (
        <FallbackScreen
          form={form}
          level={results[0]?.level}
          playerName={results[0]?.name}
          household={results.length > 1}
          signedIn={household.signedIn}
        />
      );
    }
    // One player reads as a single card; a household gets a card each.
    if (results.length === 1) {
      return (
        <TentativeMatchScreen result={results[0]} form={form} signedIn={household.signedIn} />
      );
    }
    return (
      <HouseholdMatchScreen results={results} form={form} signedIn={household.signedIn} />
    );
  }

  const isLast = stepIndex === steps.length - 1;
  // One problem shows by its field; two or more are also listed by the button.
  const showGapList = pressedWithGaps && visibleIssues.length > 1;

  // ── Wizard ────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-[#061427] text-white">
      <div className="mx-auto max-w-2xl px-6 pt-6 md:py-14">
        {/* Top bar */}
        <div className="mb-4 flex items-center justify-between md:mb-8">
          <TextLink href="/">← Home</TextLink>
          <p className="text-sm text-white/70" aria-hidden="true">
            Step {stepIndex + 1} of {steps.length}
          </p>
        </div>

        {/* The wizard card, flat on phones so fields keep their width (audit L10). */}
        <div className="md:rounded-3xl md:border md:border-white/10 md:bg-white/5 md:p-8">
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#B4E655]">
              The 2-minute quiz
            </p>
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="mt-2 text-2xl font-semibold focus:outline-none md:text-3xl"
            >
              <span className="sr-only">
                Step {stepIndex + 1} of {steps.length}:{" "}
              </span>
              {current.title}
            </h1>
            {current.subtitle ? (
              <p className="mt-2 text-sm text-white/70">{current.subtitle}</p>
            ) : null}
          </div>

          <div className="mb-6">
            <ProgressBar step={stepIndex + 1} total={steps.length} />
          </div>

          {/* Step content */}
          <div className="space-y-3">
            {current.type === "household" ? (
              <WhoIsThisFor
                household={household}
                value={form.household}
                onChange={(next) => setForm((s) => ({ ...s, household: next }))}
                multiple
                collectProfile
                addInline
                errors={errors}
              />
            ) : null}

            {current.type === "availability" ? (
              <>
                <AvailabilityHoursLegend />
                <p id="intake-availability-hint" className={HINT_CLASS}>
                  Classes run on Saturdays and Sundays, so those come first.
                </p>
                <AvailabilityGrid
                  value={form.availability}
                  onChange={(next) => setForm((s) => ({ ...s, availability: next }))}
                  weekendFirst
                  label={forSelf ? "Times you can train" : "Times they can train"}
                  firstCellId={AVAILABILITY_FIELD_ID}
                  describedBy={[
                    "intake-availability-hint",
                    errors[AVAILABILITY_FIELD_ID] ? errorIdFor(AVAILABILITY_FIELD_ID) : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                />
                <FieldError fieldId={AVAILABILITY_FIELD_ID} message={errors[AVAILABILITY_FIELD_ID]} />
              </>
            ) : null}

            {current.type === "contact" ? (
              <form
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  next();
                }}
                className="grid gap-4"
              >
                {bot.field}
                <div className="grid gap-1.5">
                  <label htmlFor={CONTACT_IDS.name} className={LABEL_CLASS}>
                    {forSelf ? "Your full name" : "Your full name (parent or guardian)"}
                  </label>
                  <input
                    id={CONTACT_IDS.name}
                    type="text"
                    autoComplete="name"
                    required
                    value={form.name ?? ""}
                    onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                    onBlur={(e) => revealOnBlur(CONTACT_IDS.name, e.target.value)}
                    className={INPUT_CLASS}
                    placeholder="Your name"
                    {...fieldA11y(CONTACT_IDS.name, { error: errors[CONTACT_IDS.name] })}
                  />
                  <FieldError fieldId={CONTACT_IDS.name} message={errors[CONTACT_IDS.name]} />
                </div>
                <div className="grid gap-1.5">
                  <label htmlFor={CONTACT_IDS.phone} className={LABEL_CLASS}>
                    Phone — so Sina can text you about times
                  </label>
                  <input
                    id={CONTACT_IDS.phone}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    required
                    value={form.phone ?? ""}
                    onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))}
                    onBlur={(e) => revealOnBlur(CONTACT_IDS.phone, e.target.value)}
                    className={INPUT_CLASS}
                    placeholder="(647) 555-1234"
                    {...fieldA11y(CONTACT_IDS.phone, { error: errors[CONTACT_IDS.phone] })}
                  />
                  <FieldError fieldId={CONTACT_IDS.phone} message={errors[CONTACT_IDS.phone]} />
                </div>
                <div className="grid gap-1.5">
                  <label htmlFor={CONTACT_IDS.email} className={LABEL_CLASS}>
                    Email
                  </label>
                  <input
                    id={CONTACT_IDS.email}
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    required
                    value={form.email ?? ""}
                    onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
                    onBlur={(e) => revealOnBlur(CONTACT_IDS.email, e.target.value)}
                    className={INPUT_CLASS}
                    placeholder="you@email.com"
                    {...fieldA11y(CONTACT_IDS.email, { error: errors[CONTACT_IDS.email] })}
                  />
                  <FieldError fieldId={CONTACT_IDS.email} message={errors[CONTACT_IDS.email]} />
                </div>
                <label className="mt-1 flex min-h-[44px] cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <input
                    type="checkbox"
                    checked={!!form.newsletter}
                    onChange={(e) => setForm((s) => ({ ...s, newsletter: e.target.checked }))}
                    className={`h-4 w-4 shrink-0 accent-[#B4E655] ${FOCUS_RING}`}
                  />
                  <span className="text-sm text-white/75">
                    Also email me when new programs and dates open
                  </span>
                </label>
                <p className="text-xs text-white/60">
                  How we handle your information:{" "}
                  <Link
                    href="/legal/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#B4E655] underline-offset-2 hover:underline"
                  >
                    Privacy Policy
                  </Link>
                </p>
                {/* Enables Enter-to-advance from any field; the visible CTA lives in the footer */}
                <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">
                  Continue
                </button>
              </form>
            ) : null}
          </div>

          {submitError && (
            <FormAlert className="mt-6">
              Something went wrong and your answers weren&apos;t sent. Try again, or email us at
              info@tennisbootcamp.ca.
            </FormAlert>
          )}
          <LiveStatus message={submitting ? "Sending your answers…" : ""} />

          {/* What stops Next, listed once it has been pressed (audit M18). In
              the flow, not in the sticky bar, so it never covers the fields. */}
          {showGapList && (
            <div id="intake-missing" className="mt-6 text-sm text-red-400">
              <p className="font-semibold">To continue:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {visibleIssues.map((i) => (
                  <li key={i.id}>{i.message}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Footer: sticky on phones with the safe area, so Next is always
              in reach (audit L10); in the card from md. */}
          <div className="sticky bottom-0 z-10 -mx-6 mt-6 border-t border-white/10 bg-[#061427] px-6 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
            <div className="flex items-center justify-between gap-3">
              {stepIndex > 0 && (
                <button
                  type="button"
                  onClick={back}
                  disabled={submitting}
                  className={`min-h-[44px] rounded-full bg-white/10 px-5 py-3 text-sm font-semibold text-white hover:bg-white/15 disabled:cursor-not-allowed disabled:text-white/30 ${FOCUS_RING}`}
                >
                  Back
                </button>
              )}
              <div className="ml-auto flex items-center gap-2">
                {current.type === "availability" && issues.length > 0 && (
                  <button
                    type="button"
                    onClick={skipAvailability}
                    className={`min-h-[44px] rounded-full px-4 text-sm font-semibold text-white/75 transition hover:text-white ${FOCUS_RING}`}
                  >
                    Skip for now
                  </button>
                )}
                <button
                  type="button"
                  onClick={next}
                  aria-disabled={submitting || undefined}
                  aria-describedby={showGapList ? "intake-missing" : undefined}
                  className={cn(
                    "inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[#B4E655] px-6 py-3 text-sm font-semibold text-[#061427]",
                    FOCUS_RING,
                    submitting ? "cursor-wait" : "hover:brightness-110"
                  )}
                >
                  {submitting && (
                    <svg className="h-4 w-4 motion-safe:animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  )}
                  {isLast ? (submitting ? "Submitting…" : "Submit") : "Next"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function IntakePage() {
  return (
    <Suspense>
      <IntakePageInner />
    </Suspense>
  );
}
