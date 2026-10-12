import type { Program, ProgramGroup, TimetableSlot } from "@/types/program";
import { ageBandsLabel, type AgeBand } from "@/lib/ageBand";
import { formatClassTime, twelveHourStart } from "@/lib/programCatalog";

// The catalog (owner, 2026-10-12): three programs — Youth Bootcamps, Adult
// Bootcamps and Private Lessons — and the groups inside them, each group its
// own card with an age range, a level band, a class time, a price and a
// status. High Performance is a youth group; Kids' Summer Camp left the
// catalog (src/lib/programRedirects.ts keeps both old URLs landing). The
// group lineup is the one editable list below; every program's timetable,
// level span and schedule line is derived from it. Homepage cards are the
// listed programs in this order.

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

// The assessment is optional: our coaches place each player (backlog #20 review).
export const PLACEMENT_LINE =
  "Our coaches place each player by level and schedule, and a 20-minute assessment is available if you want your level confirmed on court first. It is $20, and if you enroll in a program afterward that $20 comes off the price.";

// ─── Groups (owner lineup, 2026-10-12) ───────────────────────────────────────
// Youth Bootcamps, Saturdays: 12:00 ages 7–10 Beginner – Novice; 1:00 ages
// 11–15 Beginner – Intermediate; 2:00 High Performance ages 12–17
// Intermediate – Elite. Adult Bootcamps, Sundays, 16 and up: 4:00 Beginner –
// Novice; 5:00 Intermediate; 6:00 Advanced – Elite. Private Lessons: any age
// and level, by arrangement. Level bands are whole tiers (x.0–y.5).

export const programGroups: ProgramGroup[] = [
  {
    id: "youth-7-10",
    programSlug: "youth-programs",
    name: "Ages 7–10",
    ageMin: 7,
    ageMax: 10,
    levelMin: 1.0,
    levelMax: 2.5,
    day: "Saturday",
    start: "12:00",
    end: "13:00",
    price: PRICE_SUMMARY,
    status: "forming",
  },
  {
    id: "youth-11-15",
    programSlug: "youth-programs",
    name: "Ages 11–15",
    ageMin: 11,
    ageMax: 15,
    levelMin: 1.0,
    levelMax: 3.5,
    day: "Saturday",
    start: "13:00",
    end: "14:00",
    price: PRICE_SUMMARY,
    status: "forming",
  },
  {
    // The competitive track (voice.md: tournament dialect allowed here only).
    id: "high-performance",
    programSlug: "youth-programs",
    name: "High Performance",
    ageMin: 12,
    ageMax: 17,
    levelMin: 3.0,
    levelMax: 5.5,
    day: "Saturday",
    start: "14:00",
    end: "15:00",
    price: PRICE_SUMMARY,
    status: "forming",
    note: "The competitive track: players who compete, or are training to. Pattern play, serve plus the next shot, and match play with the score on.",
  },
  {
    id: "adult-newer",
    programSlug: "bootcamps",
    name: "Newer players",
    ageMin: 16,
    ageMax: null,
    levelMin: 1.0,
    levelMax: 2.5,
    day: "Sunday",
    start: "16:00",
    end: "17:00",
    price: PRICE_SUMMARY,
    status: "forming",
  },
  {
    id: "adult-intermediate",
    programSlug: "bootcamps",
    name: "Intermediate",
    ageMin: 16,
    ageMax: null,
    levelMin: 3.0,
    levelMax: 3.5,
    day: "Sunday",
    start: "17:00",
    end: "18:00",
    price: PRICE_SUMMARY,
    status: "forming",
  },
  {
    id: "adult-advanced",
    programSlug: "bootcamps",
    name: "Advanced",
    ageMin: 16,
    ageMax: null,
    levelMin: 4.0,
    levelMax: 5.5,
    day: "Sunday",
    start: "18:00",
    end: "19:00",
    price: PRICE_SUMMARY,
    status: "forming",
  },
  {
    id: "private-lessons",
    programSlug: "private-lessons",
    name: "One-to-one coaching",
    ageMin: null,
    ageMax: null,
    levelMin: 1.0,
    levelMax: 7.0,
    day: null,
    start: null,
    end: null,
    price: PRIVATE_LESSONS_PRICE,
    status: "arranged",
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
      ? [{ day: g.day, time: formatClassTime(g.start, g.end), group: g.name, levelMin: g.levelMin, levelMax: g.levelMax }]
      : []
  );
}

/** The union of the groups' level bands. */
function spanFor(slug: string): { levelMin: number; levelMax: number } {
  const groups = groupsForProgram(slug);
  return {
    levelMin: Math.min(...groups.map((g) => g.levelMin)),
    levelMax: Math.max(...groups.map((g) => g.levelMax)),
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
      "Three groups run back to back: ages 7–10 at 12:00, ages 11–15 at 1:00, and High Performance at 2:00 for players 12–17 who compete, or are training to. " +
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
      "Three groups: ages 7–10, ages 11–15 and High Performance (12–17)",
      "Grouped by level within each class",
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
      `Sunday tennis for adults in Toronto, 16 and up: newer, intermediate and advanced classes back to back. ${SESSION_PRICE_LABEL} a session in ${COHORT_LENGTH_ADJ} cohorts.`,
    longDescription:
      `Each cohort is a fixed group that trains together for ${COHORT_LENGTH}, one ${SESSION_MINUTES}-minute class every Sunday. ` +
      "Three levels run back to back: 4:00 for newer players, 5:00 for intermediate, 6:00 for advanced. Players 16 and up are welcome. " +
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
    levelNote: "Newer, intermediate and advanced classes, back to back",
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
      "Three levels: newer, intermediate, advanced",
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
