import type { Program } from "@/types/program";
import { AGE_BAND_LABELS } from "@/lib/ageBand";

// Weekend offer (backlog #20, owner decision 2026-10-01): once a week, 60
// minutes, fixed-length cohorts. Homepage cards are programs.slice(0, 3), so
// the order of the first three entries is the order visitors see.

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

/** Kids' Summer Camp, one week, in whole CAD dollars (locked price, voice.md). */
export const CAMP_WEEK_PRICE: number = 499;
/** "$499" */
export const CAMP_WEEK_PRICE_LABEL = formatDollars(CAMP_WEEK_PRICE);

const PRICE_LINE =
  `${SESSION_PRICE_LABEL} a session, ${COHORT_TOTAL_LABEL} for the ${COHORT_LENGTH}. If you took the $20 assessment, that $20 comes off the price.`;

// The assessment is optional: Sina places each player (backlog #20 review).
export const PLACEMENT_LINE =
  "Sina places each player by level and schedule, and a 20-minute assessment is available if you want your level confirmed on court first. It is $20, and if you enroll in a program afterward that $20 comes off the price.";

export const programs: Program[] = [
  {
    id: "youth-programs",
    slug: "youth-programs",
    title: "Youth Programs",
    description: "Saturday group classes for juniors and teens, grouped by age and level.",
    metaDescription:
      `Saturday tennis in Toronto for juniors 7–13 and teens 14–17, grouped by level. ${SESSION_PRICE_LABEL} a session in ${COHORT_LENGTH_ADJ} cohorts. Take the 2-minute quiz to be placed.`,
    longDescription:
      `Each cohort is a fixed group that trains together for ${COHORT_LENGTH}, one 60-minute class every Saturday. ` +
      `${AGE_BAND_LABELS.junior} players train at 12:00 and ${AGE_BAND_LABELS.teen} players at 1:00, and each class is grouped by level, so a first-season player and a club player are not on the same drill. ` +
      "Every class works the fundamentals — forehand, backhand, serve, volley and movement — and puts them into rally and point play the same day. " +
      PLACEMENT_LINE,
    type: "Weekend group class",
    comingSoon: false,
    ctaText: "View Program",
    ctaHref: "/programs/youth-programs",
    schedule: `Once a week · 60 minutes · ${COHORT_LENGTH_ADJ} cohorts · Saturdays 12:00 and 1:00`,
    priceCents: COHORT_TOTAL_CENTS,
    currency: "CAD",
    ageGroup: `${AGE_BAND_LABELS.junior} · ${AGE_BAND_LABELS.teen}`,
    priceLine: PRICE_LINE,
    timetable: [
      { day: "Saturday", time: "12:00–1:00 pm", group: AGE_BAND_LABELS.junior },
      { day: "Saturday", time: "1:00–2:00 pm", group: AGE_BAND_LABELS.teen },
    ],
    includes: [
      `One 60-minute class a week for ${COHORT_LENGTH}`,
      "Juniors and teens in separate classes",
      "Grouped by level within each class",
      "Forehand, backhand, serve and volley fundamentals",
      "Movement and agility work",
      "Rally and point play every class",
    ],
  },
  {
    id: "high-performance",
    slug: "high-performance",
    title: "High Performance",
    description: "A Saturday class for competitive and elite players, at any age.",
    metaDescription:
      `A Saturday tennis class in Toronto for players who compete, or are training to, at any age. ${SESSION_PRICE_LABEL} a session in ${COHORT_LENGTH_ADJ} cohorts. Take the 2-minute quiz.`,
    longDescription:
      `One 60-minute class every Saturday at 2:00, in ${COHORT_LENGTH_ADJ} cohorts. This is the competitive track: players who already compete, or are training to, whatever their age. ` +
      "Classes are built around live-ball pattern play, serve plus the next shot, building points on purpose, and match play with the score on. " +
      PLACEMENT_LINE,
    type: "Weekend group class",
    comingSoon: false,
    ctaText: "View Program",
    ctaHref: "/programs/high-performance",
    schedule: `Once a week · 60 minutes · ${COHORT_LENGTH_ADJ} cohorts · Saturdays 2:00`,
    priceCents: COHORT_TOTAL_CENTS,
    currency: "CAD",
    ageGroup: "Competitive and elite players · any age",
    priceLine: PRICE_LINE,
    timetable: [
      { day: "Saturday", time: "2:00–3:00 pm", group: "Competitive and elite players" },
    ],
    includes: [
      `One 60-minute class a week for ${COHORT_LENGTH}`,
      "Live-ball pattern play (cross-court, inside-out)",
      "Serve plus the next shot",
      "Second-serve reliability under pressure",
      "Building points on purpose",
      "Match play with the score on",
    ],
  },
  {
    // id and slug stay "bootcamps" so /programs/bootcamps and existing cohort
    // and enrollment rows keep resolving (backlog #20).
    id: "bootcamps",
    slug: "bootcamps",
    title: "Adult Bootcamps",
    description: "Sunday group classes for adults, in three levels back to back.",
    metaDescription:
      `Sunday tennis for adults in Toronto: newer, intermediate and advanced classes, back to back. ${SESSION_PRICE_LABEL} a session in ${COHORT_LENGTH_ADJ} cohorts. Take the 2-minute quiz.`,
    longDescription:
      `Each cohort is a fixed group that trains together for ${COHORT_LENGTH}, one 60-minute class every Sunday. ` +
      "Three levels run back to back: 4:00 for newer players, 5:00 for intermediate, 6:00 for advanced. " +
      `Each class works one part of the game — groundstrokes, serve and return, net play, rally and point play — and the ${COHORT_LENGTH} build on each other. ` +
      PLACEMENT_LINE,
    type: "Weekend group class",
    comingSoon: false,
    ctaText: "View Program",
    ctaHref: "/programs/bootcamps",
    schedule: `Once a week · 60 minutes · ${COHORT_LENGTH_ADJ} cohorts · Sundays 4:00, 5:00 and 6:00`,
    priceCents: COHORT_TOTAL_CENTS,
    currency: "CAD",
    ageGroup: AGE_BAND_LABELS.adult,
    priceLine: PRICE_LINE,
    timetable: [
      { day: "Sunday", time: "4:00–5:00 pm", group: "Newer players" },
      { day: "Sunday", time: "5:00–6:00 pm", group: "Intermediate" },
      { day: "Sunday", time: "6:00–7:00 pm", group: "Advanced" },
    ],
    includes: [
      `One 60-minute class a week for ${COHORT_LENGTH}`,
      "Three levels: newer, intermediate, advanced",
      "Groundstrokes, serve and return, net play",
      "Rally and point play every class",
      "Corrections from the coach every session",
    ],
  },
  {
    id: "kids-summer-camp",
    slug: "kids-summer-camp",
    title: "Kids' Summer Camp",
    // Decided facts only (owner D10): ages 7–13, the weekly price, summer.
    // Days, hours, meals and what each day covers stay off the page until
    // Sina confirms them.
    description: `A summer tennis camp for juniors 7–13, ${CAMP_WEEK_PRICE_LABEL} a week. Dates are not set yet.`,
    metaDescription:
      `A summer tennis camp in Toronto for juniors 7–13, ${CAMP_WEEK_PRICE_LABEL} a week. Dates are not set yet; leave your email and we'll tell you when it opens.`,
    longDescription:
      `Kids' Summer Camp is for ${AGE_BAND_LABELS.junior} players. ` +
      "The weeks, the daily hours and what each day covers will be posted here before enrollment opens.",
    type: "Summer Camp",
    comingSoon: true,
    ctaText: "Notify Me When Open",
    ctaHref: "/programs/kids-summer-camp",
    schedule: "Summer · dates not set yet",
    ageGroup: "Ages 7–13",
    currency: "CAD",
    related: {
      text: `Looking for something sooner? Youth Programs runs Saturday classes for ${AGE_BAND_LABELS.junior}.`,
      label: "View Youth Programs",
      href: "/programs/youth-programs",
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
    schedule: "Weekly evening + weekend slots (schedule TBA)",
    ageGroup: "Adults 18+",
    currency: "CAD",
    includes: [
      "Capped at 6 per court — more reps, less standing around",
      "Structured progressions across every stroke",
      "Staying steady through long points",
      "Tactical patterns (serve / return / approach / net)",
      "Real-time correction every session",
    ],
  },
];

/** Programs shown publicly — retired entries stay above only so ids resolve. */
export const listedPrograms: Program[] = programs.filter((p) => !p.unlisted);
