import type { Program } from "@/types/program";

export const programs: Program[] = [
  {
    id: "bootcamps",
    slug: "bootcamps",
    title: "Bootcamps",
    description: "High-intensity group training for athletes who compete or want to.",
    longDescription:
      "If you're serious about competing, this is where you belong. Each six-week cohort runs two on-court sessions plus one fitness session every week — structured reps, live-ball patterns, and real match-play pressure. " +
      "Sina leads every session and tracks your progress against actual benchmarks, so you finish each cohort knowing exactly what improved and what to sharpen next. Not a drop-in class. Not casual hitting. A real training block.",
    type: "Bootcamp",
    comingSoon: false,
    ctaText: "Get Priority Placement",
    ctaHref: "/intake?program=bootcamps",
    imageSrc: "/images/programs/bootcamps.png",
    schedule: "Six-week cohorts · two on-court + one fitness session per week",
    currency: "CAD",
    ageGroup: "Ages 14+",
    locationId: "balliol",
    includes: [
      "Live-ball pattern play (cross-court, inside-out, serve+1)",
      "Explosive first-step & change-of-direction footwork",
      "Second-serve reliability under pressure",
      "Point construction & shot tolerance",
      "Match-play simulation with score pressure",
      "Dedicated strength & conditioning block",
      "Benchmarked progress each cohort",
    ],
  },
  {
    id: "kids-summer-camp",
    slug: "kids-summer-camp",
    title: "Kid's Summer Camp",
    description: "A full-day tennis experience your kid will actually want to come back to.",
    longDescription:
      "Running through July and August, every day is a mix of stroke fundamentals, match play, physical literacy games, and team challenges. " +
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
      "Physical-literacy & agility games",
      "Daily match play grouped by ability",
      "Hand-eye & movement drills",
      "Teamwork challenges and on-court games",
      "Daily skill tracking",
      "Lunch & snacks included",
    ],
  },
  {
    id: "group-lessons",
    slug: "group-lessons",
    title: "Group Lessons",
    description: "Adult group lessons that actually move the needle.",
    longDescription:
      "Each 90-minute session is capped at 6 players per court — more reps, more feedback, less waiting around. " +
      "You'll work through structured progressions across your forehand, backhand, serve, return, volleys, and live-ball patterns. " +
      "No filler drills. No endless warm-up rallies. Every week builds on the last, and you'll feel the difference.",
    type: "Group Lessons",
    comingSoon: true,
    ctaText: "Notify Me When Open",
    ctaHref: "/programs/group-lessons",
    imageSrc: "/images/programs/group-lessons.png",
    schedule: "Weekly evening + weekend slots (schedule TBA)",
    ageGroup: "Adults 18+",
    currency: "CAD",
    includes: [
      "Capped at 6 per court — more reps, less standing around",
      "Structured progressions across every stroke",
      "Live-ball rally tolerance",
      "Tactical patterns (serve / return / approach / net)",
      "Real-time correction every session",
    ],
  },
];
