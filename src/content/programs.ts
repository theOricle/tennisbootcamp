import type { Program, ProgramGroup, TimetableSlot } from "@/types/program";
import { ageBandsLabel, type AgeBand } from "@/lib/ageBand";
import { formatClassTime, twelveHourStart } from "@/lib/programCatalog";
import { LEVEL_MAX, LEVEL_MIN, tierById, type TierId } from "@/lib/tiers";

// The catalog (owner, 2026-10-12): three programs — Youth Bootcamps, Adult
// Bootcamps and Private Lessons — and the groups inside them, each group its
// own card with an age range, one level tag (owner, 2026-10-13), a class
// time, a price and a status. High Performance is a youth group; Kids' Summer
// Camp left the catalog (src/lib/programRedirects.ts keeps both old URLs
// landing). The group lineup is the one editable list below; every program's
// timetable, level span and schedule line is derived from it. Homepage cards
// are the listed programs in this order.

// Cohort length and price, one setting (backlog #27, owner 2026-10-03). Every
// page, email, metadata line and the admin new-cohort default reads these.
/** Price of one weekend class, in whole CAD dollars. */
export const SESSION_PRICE: number = 35;
/**
 * Weeks in one cohort. Changing it changes the Program Policies text
 * (/legal/refund-policy), so set EFFECTIVE_DATE in src/content/policies.ts to
 * the merge day in the same PR.
 */
export const COHORT_WEEKS: number = 6;
/**
 * Length of one weekend class, in minutes. Matches the "60-minute" copy below
 * (test-structured-data pins it to each schedule line); used for structured
 * data durations.
 */
export const SESSION_MINUTES: number = 60;

const NUMBER_WORDS = [
  "zero", "one", "two", "three", "four", "five", "six",
  "seven", "eight", "nine", "ten", "eleven", "twelve",
] as const;

/** 1 to 12 in words ("six", "three"); larger numbers fall back to digits. */
export function numberInWords(n: number): string {
  return Number.isInteger(n) && n >= 1 && n <= 12 ? NUMBER_WORDS[n] : String(n);
}

/** Whole dollars as "$210", anything else as "$52.50". */
export function formatDollars(amount: number): string {
  return Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;
}

/** Cohort total in CAD dollars (SESSION_PRICE × COHORT_WEEKS). */
export const COHORT_TOTAL = SESSION_PRICE * COHORT_WEEKS;
export const COHORT_TOTAL_CENTS = COHORT_TOTAL * 100;
/** One of two equal instalments: half the cohort total. */
export const INSTALMENT_AMOUNT = COHORT_TOTAL / 2;

/** "six" */
export const COHORT_WEEKS_WORD = numberInWords(COHORT_WEEKS);
/** "six weeks" */
export const COHORT_LENGTH = `${COHORT_WEEKS_WORD} week${COHORT_WEEKS === 1 ? "" : "s"}`;
/** "six-week" (adjective: "six-week cohorts") */
export const COHORT_LENGTH_ADJ = `${COHORT_WEEKS_WORD}-week`;
/** "$35" */
export const SESSION_PRICE_LABEL = formatDollars(SESSION_PRICE);
/** "$210" */
export const COHORT_TOTAL_LABEL = formatDollars(COHORT_TOTAL);
/** "$105" */
export const INSTALMENT_LABEL = formatDollars(INSTALMENT_AMOUNT);

const PRICE_LINE =
  `${SESSION_PRICE_LABEL} a session, ${COHORT_TOTAL_LABEL} for the ${COHORT_LENGTH}. If you took the $20 assessment, that $20 comes off the price.`;

/** "$35 a session · $210 for six weeks" — the one-line price on program and group cards. */
export const PRICE_SUMMARY = `${SESSION_PRICE_LABEL} a session · ${COHORT_TOTAL_LABEL} for ${COHORT_LENGTH}`;

/** Private lessons carry no public rate (owner, 2026-10-12). */
export const PRIVATE_LESSONS_PRICE = "Rates on request";

export const CONTACT_EMAIL = "info@tennisbootcamp.ca";

// Who each program is for at band level (audit M37), youngest first. Exact
// ages live on the groups below; see the `ageBands` note in src/types/program.ts.
const YOUTH_BANDS: AgeBand[] = ["junior", "teen"];
const ANY_AGE_BANDS: AgeBand[] = ["junior", "teen", "adult"];
const ADULT_BANDS: AgeBand[] = ["adult"];

// ─── How joining works (joining flow, owner 2026-10-12) ──────────────────────
// Groups are open to join for anyone whose age and level fit; the coach
// confirms the level on court in week one. A player in the wrong group is
// moved (every scheduled group costs the same), and when no group fits, the
// player is refunded in full. High Performance is by approval: the quiz,
// then our coaches' approval, never a required assessment. The $20
// assessment is optional, for certainty before paying.
//
// The Program Policies (/legal/refund-policy, src/content/policies.ts) are
// unchanged and these lines add no legal terms: no day counts, no fees. Week
// one sits inside the policies' full-refund window, which runs from the later
// of the written agreement and the first session. The policy sentence for
// move-or-refund goes to counsel before public launch.

/** Step 3's promise in full, on the How joining works section. */
export const RIGHT_GROUP_PROMISE =
  "If another group fits you better, we move you to it at the same price. If none does, we refund you in full.";

/** The same promise on a group card's "Week 1" row. */
export const RIGHT_GROUP_PROMISE_SHORT =
  "Your coach confirms your level. If another group fits better, we move you; if none does, full refund.";

/** How a by-approval group (High Performance) is joined, on its card and the How joining works section. */
export const APPROVAL_LINE =
  "Take the 2-minute quiz and our coaches approve each spot. No assessment needed.";

/** The optional assessment, for certainty before paying, with its mechanic spelled out (voice.md rule 2). */
export const ASSESSMENT_CERTAINTY_LINE =
  "The assessment is optional: 20 minutes on court for $20, and if you enroll in a program afterward that $20 comes off the price.";

// The last line of a scheduled program's description: pick, then the
// week-one check. The assessment is offered on the page, never required.
export const PLACEMENT_LINE =
  "Pick the group that fits your age and level, and your coach confirms your level on court in week one.";

// ─── Groups (owner lineup, 2026-10-13) ───────────────────────────────────────
// One level per group and a level-led title, "{Level} {Audience} Bootcamp"
// (owner: "Just one tag for each program, e.g. Intermediate Adult bootcamp.
// The date is embedded in the card, it is not the main focus"). Youth
// Bootcamps, Saturdays: Beginner Junior Bootcamp 7–10 at 12:00; Novice Youth
// Bootcamp 11–15 at 1:00; High Performance Youth Bootcamp 12–17 at 2:00 (by
// approval). Adult Bootcamps, Sundays, 16 and up: Beginner at 4:00,
// Intermediate at 5:00, Advanced at 6:00. Private Lessons: any age and level,
// by arrangement. Every group trains at Newtonbrook Tennis Club, our one
// location today (owner, 2026-10-12; src/content/locations.ts). The ids stay
// as they were, so anchors, redirects and the quiz's links keep landing.

/** "Intermediate Adult Bootcamp": the level-led title of a bootcamp group. */
export function bootcampTitle(level: TierId, audience: "Junior" | "Youth" | "Adult"): string {
  return `${tierById(level).name} ${audience} Bootcamp`;
}

export const programGroups: ProgramGroup[] = [
  {
    id: "youth-7-10",
    programSlug: "youth-programs",
    locationId: "newtonbrook",
    name: bootcampTitle(1, "Junior"),
    ageMin: 7,
    ageMax: 10,
    level: 1,
    day: "Saturday",
    start: "12:00",
    end: "13:00",
    price: PRICE_SUMMARY,
    status: "forming",
    joining: "open",
  },
  {
    id: "youth-11-15",
    programSlug: "youth-programs",
    locationId: "newtonbrook",
    name: bootcampTitle(2, "Youth"),
    ageMin: 11,
    ageMax: 15,
    level: 2,
    day: "Saturday",
    start: "13:00",
    end: "14:00",
    price: PRICE_SUMMARY,
    status: "forming",
    joining: "open",
  },
  {
    // The competitive track (voice.md: tournament dialect allowed here only).
    // Its level tag is the High Performance tier (5.0–7.0); the card and the
    // note say what the group is, so the tier and the group never blur.
    id: "high-performance",
    programSlug: "youth-programs",
    locationId: "newtonbrook",
    name: bootcampTitle(5, "Youth"),
    ageMin: 12,
    ageMax: 17,
    level: 5,
    day: "Saturday",
    start: "14:00",
    end: "15:00",
    price: PRICE_SUMMARY,
    status: "forming",
    // By approval (owner, 2026-10-12): the quiz, then our coaches' yes.
    joining: "approval",
    note: "The competitive track: players who compete, or are training to. Pattern play, serve plus the next shot, and match play with the score on.",
  },
  {
    id: "adult-newer",
    programSlug: "bootcamps",
    locationId: "newtonbrook",
    name: bootcampTitle(1, "Adult"),
    ageMin: 16,
    ageMax: null,
    level: 1,
    day: "Sunday",
    start: "16:00",
    end: "17:00",
    price: PRICE_SUMMARY,
    status: "forming",
    joining: "open",
  },
  {
    id: "adult-intermediate",
    programSlug: "bootcamps",
    locationId: "newtonbrook",
    name: bootcampTitle(3, "Adult"),
    ageMin: 16,
    ageMax: null,
    level: 3,
    day: "Sunday",
    start: "17:00",
    end: "18:00",
    price: PRICE_SUMMARY,
    status: "forming",
    joining: "open",
  },
  {
    id: "adult-advanced",
    programSlug: "bootcamps",
    locationId: "newtonbrook",
    name: bootcampTitle(4, "Adult"),
    ageMin: 16,
    ageMax: null,
    level: 4,
    day: "Sunday",
    start: "18:00",
    end: "19:00",
    price: PRICE_SUMMARY,
    status: "forming",
    joining: "open",
  },
  {
    id: "private-lessons",
    programSlug: "private-lessons",
    locationId: "newtonbrook",
    name: "One-to-one coaching",
    ageMin: null,
    ageMax: null,
    level: null,
    day: null,
    start: null,
    end: null,
    price: PRIVATE_LESSONS_PRICE,
    status: "arranged",
    joining: "open",
  },
];

/** The groups of one program, in lineup order. */
export function groupsForProgram(slug: string): ProgramGroup[] {
  return programGroups.filter((g) => g.programSlug === slug);
}

/** A group by id, or undefined. */
export function groupById(id: string): ProgramGroup | undefined {
  return programGroups.find((g) => g.id === id);
}

// ─── Derived from the groups ─────────────────────────────────────────────────

/** One timetable slot per scheduled group, in lineup order. */
function timetableFor(slug: string): TimetableSlot[] {
  return groupsForProgram(slug).flatMap((g) =>
    g.day && g.start && g.end
      ? [{ day: g.day, time: formatClassTime(g.start, g.end), group: g.name, level: g.level }]
      : []
  );
}

/**
 * The numeric span the groups' tiers together cover (internal: fit checks
 * only). A group built for any level (private lessons) spans the ladder.
 */
function spanFor(slug: string): { levelMin: number; levelMax: number } {
  const bands = groupsForProgram(slug).map((g) =>
    g.level === null
      ? { min: LEVEL_MIN, max: LEVEL_MAX }
      : { min: tierById(g.level).levelMin, max: tierById(g.level).levelMax }
  );
  return {
    levelMin: Math.min(...bands.map((b) => b.min)),
    levelMax: Math.max(...bands.map((b) => b.max)),
  };
}

/** "12:00, 1:00 and 2:00": the class starts of a program's groups. */
function startsFor(slug: string): string {
  const starts = groupsForProgram(slug).flatMap((g) => (g.start ? [twelveHourStart(g.start)] : []));
  if (starts.length <= 1) return starts[0] ?? "";
  return `${starts.slice(0, -1).join(", ")} and ${starts[starts.length - 1]}`;
}

/** "Once a week · 60 minutes · six-week cohorts · Saturdays 12:00, 1:00 and 2:00" */
function scheduleFor(slug: string, day: string): string {
  return `Once a week · ${SESSION_MINUTES} minutes · ${COHORT_LENGTH_ADJ} cohorts · ${day}s ${startsFor(slug)}`;
}

export const programs: Program[] = [
  {
    // id and slug stay "youth-programs" so old cohort and enrollment rows and
    // the quiz's ?program= links keep resolving (owner, 2026-10-12).
    id: "youth-programs",
    slug: "youth-programs",
    title: "Youth Bootcamps",
    description: "Saturday group classes for ages 7–17, in three groups by age and level.",
    metaDescription:
      `Saturday tennis in Toronto for ages 7–17: three groups by age and level, High Performance included. ${SESSION_PRICE_LABEL} a session in ${COHORT_LENGTH_ADJ} cohorts.`,
    longDescription:
      `Each cohort is a fixed group that trains together for ${COHORT_LENGTH}, one ${SESSION_MINUTES}-minute class every Saturday. ` +
      "Three groups run back to back: the Beginner Junior Bootcamp (ages 7–10) at 12:00, the Novice Youth Bootcamp (ages 11–15) at 1:00, and the High Performance Youth Bootcamp at 2:00 for players 12–17 who compete, or are training to. " +
      "Every class works the fundamentals — forehand, backhand, serve, volley and movement — and puts them into rally and point play the same day. " +
      PLACEMENT_LINE,
    type: "Weekend group class",
    comingSoon: false,
    ctaText: "View Program",
    ctaHref: "/programs/youth-programs",
    photo: {
      src: "/images/programs/youth-bootcamps.webp",
      width: 1600,
      height: 1000,
      alt: "A young player in a cap steps into a forehand on an outdoor hard court.",
    },
    plate: "youth-programs",
    plateAlt:
      "Court diagram: a cross-court rally, three shots landing deep in the target zone, then recovery to the middle.",
    plateCaption: "Cross-court rallies. Every rep aimed past the service line.",
    ageBands: YOUTH_BANDS,
    ...spanFor("youth-programs"),
    levelNote: "Three groups by age and level, from a first season to the competitive track",
    priceSummary: PRICE_SUMMARY,
    enrollmentStatus: "forming",
    schedule: scheduleFor("youth-programs", "Saturday"),
    priceCents: COHORT_TOTAL_CENTS,
    currency: "CAD",
    ageGroup: ageBandsLabel(YOUTH_BANDS),
    priceLine: PRICE_LINE,
    timetable: timetableFor("youth-programs"),
    includes: [
      `One ${SESSION_MINUTES}-minute class a week for ${COHORT_LENGTH}`,
      "Three groups: Beginner (ages 7–10), Novice (ages 11–15) and High Performance (ages 12–17)",
      "One level per group, confirmed on court in week one",
      "Forehand, backhand, serve and volley fundamentals",
      "Movement and agility work",
      "Rally and point play every class",
    ],
  },
  {
    // id and slug stay "bootcamps" so /programs/bootcamps and existing cohort
    // and enrollment rows keep resolving (backlog #20).
    id: "bootcamps",
    slug: "bootcamps",
    title: "Adult Bootcamps",
    description: "Sunday group classes for adults and players 16 and up, in three levels back to back.",
    metaDescription:
      `Sunday tennis for adults in Toronto, 16 and up: Beginner, Intermediate and Advanced classes back to back. ${SESSION_PRICE_LABEL} a session in ${COHORT_LENGTH_ADJ} cohorts.`,
    longDescription:
      `Each cohort is a fixed group that trains together for ${COHORT_LENGTH}, one ${SESSION_MINUTES}-minute class every Sunday. ` +
      "Three levels run back to back: Beginner at 4:00, Intermediate at 5:00, Advanced at 6:00. Players 16 and up are welcome. " +
      `Each class works one part of the game — groundstrokes, serve and return, net play, rally and point play — and the ${COHORT_LENGTH} build on each other. ` +
      PLACEMENT_LINE,
    type: "Weekend group class",
    comingSoon: false,
    ctaText: "View Program",
    ctaHref: "/programs/bootcamps",
    photo: {
      src: "/images/programs/adult-bootcamps.webp",
      width: 1600,
      height: 1000,
      alt: "A woman leaps into a forehand on a blue hard court, racket drawn back.",
    },
    plate: "bootcamps",
    plateAlt:
      "Court diagram: three ball flights from the same spot, from a high arc landing short to a flat drive landing deep.",
    plateCaption: "Three levels on Sunday. As the level goes up, the ball flies flatter and lands deeper.",
    ageBands: ADULT_BANDS,
    ...spanFor("bootcamps"),
    levelNote: "Beginner, Intermediate and Advanced classes, back to back",
    priceSummary: PRICE_SUMMARY,
    enrollmentStatus: "forming",
    schedule: scheduleFor("bootcamps", "Sunday"),
    priceCents: COHORT_TOTAL_CENTS,
    currency: "CAD",
    ageGroup: ageBandsLabel(ADULT_BANDS),
    priceLine: PRICE_LINE,
    timetable: timetableFor("bootcamps"),
    includes: [
      `One ${SESSION_MINUTES}-minute class a week for ${COHORT_LENGTH}`,
      "Three levels: Beginner, Intermediate, Advanced",
      "Groundstrokes, serve and return, net play",
      "Rally and point play every class",
      "Corrections from the coach every session",
    ],
  },
  {
    id: "private-lessons",
    slug: "private-lessons",
    title: "Private Lessons",
    description: "One-to-one coaching for any age and level, at a time arranged with you.",
    metaDescription:
      "Private tennis lessons in Toronto for any age and level, at a time arranged with you. Rates on request. Take the 2-minute quiz or email us.",
    longDescription:
      "A private lesson is one player and one coach on court, built around your game: the strokes, patterns or match situations you want to work on, at a pace set by you. " +
      "Any age and any level. Times are arranged with you, and rates are on request. " +
      `Take the 2-minute quiz and tell us what you want to work on, or email ${CONTACT_EMAIL}.`,
    type: "One-to-one coaching",
    comingSoon: false,
    ctaText: "View Program",
    ctaHref: "/programs/private-lessons",
    photo: {
      src: "/images/programs/private-lessons.webp",
      width: 1600,
      height: 1000,
      alt: "A coach at the net feeds balls from a cart to a player on the far side of the court.",
    },
    plate: "court",
    plateAlt: "Court diagram: a cross-court rally.",
    ageBands: ANY_AGE_BANDS,
    ...spanFor("private-lessons"),
    levelNote: "Any level, from a first lesson to tournament play",
    priceSummary: PRIVATE_LESSONS_PRICE,
    schedule: "By arrangement",
    currency: "CAD",
    ageGroup: ageBandsLabel(ANY_AGE_BANDS),
    priceLine: `${PRIVATE_LESSONS_PRICE}. Email ${CONTACT_EMAIL} or take the 2-minute quiz, and we'll come back to you with times and a rate.`,
  },
  {
    // High Performance became a group inside Youth Bootcamps (owner,
    // 2026-10-12). Kept unlisted so cohort and enrollment rows built under
    // this id keep their title; /programs/high-performance redirects.
    id: "high-performance",
    slug: "high-performance",
    title: "High Performance",
    description: "The competitive track, now a Saturday group inside Youth Bootcamps.",
    longDescription: "The competitive track, now a Saturday group inside Youth Bootcamps.",
    type: "Weekend group class",
    unlisted: true,
    ctaText: "View Program",
    ctaHref: "/programs/youth-programs#high-performance",
    plate: "high-performance",
    plateAlt: "Court diagram: a serve to the T, the return, and the next shot into the open corner.",
    ageBands: ANY_AGE_BANDS,
    ageGroup: ageBandsLabel(ANY_AGE_BANDS),
    currency: "CAD",
    related: {
      text: "High Performance is a group inside Youth Bootcamps.",
      label: "View Youth Bootcamps",
      href: "/programs/youth-programs#high-performance",
    },
  },
  {
    // Retired 2026-10-01: off every public listing, kept so old rows resolve.
    id: "group-lessons",
    slug: "group-lessons",
    title: "Group Lessons",
    description: "Adult lessons capped at six per court — more reps, more feedback, week-over-week progression.",
    longDescription:
      "Each 90-minute session is capped at 6 players per court — more reps, more feedback, less waiting around. " +
      "You'll work through structured progressions across your forehand, backhand, serve, return, volleys, and realistic rally play. " +
      "No filler drills. No endless warm-up rallies. Every week builds on the last.",
    type: "Group Lessons",
    comingSoon: true,
    unlisted: true,
    ctaText: "Notify Me When Open",
    ctaHref: "/programs/group-lessons",
    plate: "court",
    plateAlt: "Court diagram: a cross-court rally.",
    ageBands: ADULT_BANDS,
    schedule: "Weekly evening + weekend slots (schedule TBA)",
    ageGroup: ageBandsLabel(ADULT_BANDS),
    currency: "CAD",
  },
];

/** Programs shown publicly — retired entries stay above only so ids resolve. */
export const listedPrograms: Program[] = programs.filter((p) => !p.unlisted);

/** A listed program by slug, or undefined. */
export function programBySlug(slug: string): Program | undefined {
  return listedPrograms.find((p) => p.slug === slug);
}
