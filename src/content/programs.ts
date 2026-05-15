import type { Program } from "@/types/program";

export const programs: Program[] = [
  {
    id: "bootcamps",
    slug: "bootcamps",
    title: "Bootcamps",
    description: "High-intensity group training for measurable improvement.",
    longDescription:
      "Six-week competitive bootcamps for serious players. Two on-court sessions plus one fitness session weekly. " +
      "Stroke mechanics, point construction, mental toughness, and match-play scenarios — assessed against measurable benchmarks. " +
      "Sina Kassaian leads each cohort.",
    type: "Bootcamp",
    comingSoon: false,
    ctaText: "Get Priority Placement",
    ctaHref: "/intake?program=bootcamps",
    imageSrc: "/images/programs/bootcamps.png",
    schedule: "Six-week cohorts, two on-court + one fitness session per week",
    currency: "CAD",
    ageGroup: "Ages 14+",
    locationId: "balliol",
  },
  {
    id: "kids-summer-camp",
    slug: "kids-summer-camp",
    title: "Kid's Summer Camp",
    description: "Fun, structured training for juniors with fundamentals and confidence.",
    longDescription:
      "Full-day junior tennis camp running through July and August. Stroke fundamentals, match play, " +
      "physical literacy games, and team challenges. Lunch and snacks included. " +
      "Open to all skill levels; juniors are placed in matched groups.",
    type: "Summer Camp",
    comingSoon: true,
    ctaText: "Notify Me When Open",
    ctaHref: "/programs/kids-summer-camp",
    imageSrc: "/images/programs/kids-summer-camp.png",
    schedule: "Weeks running July–August (dates TBA)",
    ageGroup: "Ages 7–13",
    currency: "CAD",
  },
  {
    id: "group-lessons",
    slug: "group-lessons",
    title: "Group Lessons",
    description: "Adult group lessons with clear progressions and lots of reps.",
    longDescription:
      "Weekly group lessons for adults — 90 minutes, max 6 players per court. Progressions across forehand, " +
      "backhand, serve, return, volleys, and live-ball patterns. Designed for steady improvement, not warm-ups and rallies.",
    type: "Group Lessons",
    comingSoon: true,
    ctaText: "Notify Me When Open",
    ctaHref: "/programs/group-lessons",
    imageSrc: "/images/programs/group-lessons.png",
    schedule: "Weekly evening + weekend slots (schedule TBA)",
    ageGroup: "Adults 18+",
    currency: "CAD",
  },
];
