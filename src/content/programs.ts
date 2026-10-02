import type { Program } from "@/types/program";
import { AGE_BAND_LABELS } from "@/lib/ageBand";

// Weekend offer (backlog #20, owner decision 2026-10-01): once a week, 60
// minutes, six-week cohorts. Homepage cards are programs.slice(0, 3), so the
// order of the first three entries is the order visitors see.

const PRICE_LINE =
  "$35 a session, $210 for the six weeks. If you took the $20 assessment, that $20 comes off the price.";

// The assessment is optional: Sina places each player (backlog #20 review).
export const PLACEMENT_LINE =
  "Sina places each player by level and schedule, and a 20-minute assessment is available if you want your level confirmed on court first. It is $20, and if you enroll in a program afterward that $20 comes off the price.";

export const programs: Program[] = [
  {
    id: "youth-programs",
    slug: "youth-programs",
    title: "Youth Programs",
    description: "Saturday group classes for juniors and teens, grouped by age and level.",
    longDescription:
      "Each cohort is a fixed group that trains together for six weeks, one 60-minute class every Saturday. " +
      `${AGE_BAND_LABELS.junior} players train at 12:00 and ${AGE_BAND_LABELS.teen} players at 1:00, and each class is grouped by level, so a first-season player and a club player are not on the same drill. ` +
      "Every class works the fundamentals — forehand, backhand, serve, volley and movement — and puts them into rally and point play the same day. " +
      PLACEMENT_LINE,
    type: "Youth Programs",
    comingSoon: false,
    ctaText: "View Program",
    ctaHref: "/programs/youth-programs",
    imageSrc: "/images/programs/kids-summer-camp.png",
    schedule: "Once a week · 60 minutes · six-week cohorts · Saturdays 12:00 and 1:00",
    priceCents: 21000,
    currency: "CAD",
    ageGroup: `${AGE_BAND_LABELS.junior} · ${AGE_BAND_LABELS.teen}`,
    priceLine: PRICE_LINE,
    timetable: [
      { day: "Saturday", time: "12:00–1:00 pm", group: AGE_BAND_LABELS.junior },
      { day: "Saturday", time: "1:00–2:00 pm", group: AGE_BAND_LABELS.teen },
    ],
    includes: [
      "One 60-minute class a week for six weeks",
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
    longDescription:
      "One 60-minute class every Saturday at 2:00, in six-week cohorts. This is the competitive tier: players who already compete, or are training to, whatever their age. " +
      "Classes are built around live-ball pattern play, serve plus the next shot, building points on purpose, and match play with the score on. " +
      PLACEMENT_LINE,
    type: "High Performance",
    comingSoon: false,
    ctaText: "View Program",
    ctaHref: "/programs/high-performance",
    imageSrc: "/images/programs/bootcamps.png",
    schedule: "Once a week · 60 minutes · six-week cohorts · Saturdays 2:00",
    priceCents: 21000,
    currency: "CAD",
    ageGroup: "Competitive and elite players · any age",
    priceLine: PRICE_LINE,
    timetable: [
      { day: "Saturday", time: "2:00–3:00 pm", group: "Competitive and elite players" },
    ],
    includes: [
      "One 60-minute class a week for six weeks",
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
    longDescription:
      "Each cohort is a fixed group that trains together for six weeks, one 60-minute class every Sunday. " +
      "Three levels run back to back: 4:00 for newer players, 5:00 for intermediate, 6:00 for advanced. " +
      "Each class works one part of the game — groundstrokes, serve and return, net play, rally and point play — and the six weeks build on each other. " +
      PLACEMENT_LINE,
    type: "Bootcamp",
    comingSoon: false,
    ctaText: "View Program",
    ctaHref: "/programs/bootcamps",
    imageSrc: "/images/programs/group-lessons.png",
    schedule: "Once a week · 60 minutes · six-week cohorts · Sundays 4:00, 5:00 and 6:00",
    priceCents: 21000,
    currency: "CAD",
    ageGroup: AGE_BAND_LABELS.adult,
    priceLine: PRICE_LINE,
    timetable: [
      { day: "Sunday", time: "4:00–5:00 pm", group: "Newer players" },
      { day: "Sunday", time: "5:00–6:00 pm", group: "Intermediate" },
      { day: "Sunday", time: "6:00–7:00 pm", group: "Advanced" },
    ],
    includes: [
      "One 60-minute class a week for six weeks",
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
    description: "A full-day tennis experience your kid will actually want to come back to.",
    longDescription:
      "Running through July and August, every day is a mix of stroke fundamentals, match play, movement games, and team challenges. " +
      "Kids are grouped by ability so everyone gets the right level of challenge — whether it's their first time on a court or they've been playing for a few years. " +
      "All skill levels welcome. Lunch and snacks included.",
    type: "Summer Camp",
    comingSoon: true,
    ctaText: "Notify Me When Open",
    ctaHref: "/programs/kids-summer-camp",
    imageSrc: "/images/programs/kids-summer-camp.png",
    schedule: "Weeks running July–August (dates TBA)",
    ageGroup: "Ages 7–13",
    currency: "CAD",
    includes: [
      "Stroke fundamentals (forehand, backhand, serve, volley)",
      "Movement and agility games",
      "Daily match play grouped by ability",
      "Hand-eye & movement drills",
      "Teamwork challenges and on-court games",
      "Daily skill tracking",
      "Lunch & snacks included",
    ],
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
    imageSrc: "/images/programs/group-lessons.png",
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
