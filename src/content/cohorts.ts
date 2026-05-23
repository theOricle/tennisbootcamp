import type { Cohort } from "@/types/cohort";

export const cohorts: Cohort[] = [
  // ─── Bootcamps ────────────────────────────────────────────────────────────
  {
    id: "bootcamps-balliol-summer-2026",
    programId: "bootcamps",
    locationId: "balliol",
    label: "Summer Cohort",
    startDate: "2026-06-07",
    endDate: "2026-07-12",
    weeks: 6,
    sessions: [
      { day: "Wed", start: "17:00", end: "18:00" },
      { day: "Fri", start: "17:00", end: "18:00" },
    ],
    capacityMin: 6,
    capacityMax: 8,
    priceCents: 0, // PLACEHOLDER — real price TBA
    currency: "CAD",
    status: "open",
  },
  {
    id: "bootcamps-king-summer-2026",
    programId: "bootcamps",
    locationId: "king",
    label: "Summer Cohort",
    startDate: "2026-06-10",
    endDate: "2026-07-15",
    weeks: 6,
    sessions: [
      { day: "Tue", start: "18:00", end: "19:00" },
      { day: "Thu", start: "18:00", end: "19:00" },
    ],
    capacityMin: 6,
    capacityMax: 8,
    priceCents: 0, // PLACEHOLDER — real price TBA
    currency: "CAD",
    status: "open",
  },

  // ─── Kid's Summer Camp ────────────────────────────────────────────────────
  {
    id: "kids-summer-camp-balliol-week1-2026",
    programId: "kids-summer-camp",
    locationId: "balliol",
    label: "Week 1 — July",
    startDate: "2026-07-07",
    endDate: "2026-07-11",
    weeks: 1,
    sessions: [
      { day: "Mon", start: "09:00", end: "15:00" },
      { day: "Tue", start: "09:00", end: "15:00" },
      { day: "Wed", start: "09:00", end: "15:00" },
      { day: "Thu", start: "09:00", end: "15:00" },
      { day: "Fri", start: "09:00", end: "15:00" },
    ],
    capacityMin: 6,
    capacityMax: 12,
    priceCents: 0, // PLACEHOLDER — real price TBA
    currency: "CAD",
    status: "upcoming",
  },
  {
    id: "kids-summer-camp-balliol-week2-2026",
    programId: "kids-summer-camp",
    locationId: "balliol",
    label: "Week 2 — August",
    startDate: "2026-08-04",
    endDate: "2026-08-08",
    weeks: 1,
    sessions: [
      { day: "Mon", start: "09:00", end: "15:00" },
      { day: "Tue", start: "09:00", end: "15:00" },
      { day: "Wed", start: "09:00", end: "15:00" },
      { day: "Thu", start: "09:00", end: "15:00" },
      { day: "Fri", start: "09:00", end: "15:00" },
    ],
    capacityMin: 6,
    capacityMax: 12,
    priceCents: 0, // PLACEHOLDER — real price TBA
    currency: "CAD",
    status: "upcoming",
  },

  // ─── Group Lessons ────────────────────────────────────────────────────────
  {
    id: "group-lessons-king-fall-2026",
    programId: "group-lessons",
    locationId: "king",
    label: "Fall Session",
    startDate: "2026-09-08",
    endDate: "2026-10-27",
    weeks: 7,
    sessions: [
      { day: "Mon", start: "19:00", end: "20:30" },
      { day: "Sat", start: "10:00", end: "11:30" },
    ],
    capacityMin: 4,
    capacityMax: 6,
    priceCents: 0, // PLACEHOLDER — real price TBA
    currency: "CAD",
    status: "upcoming",
  },
];
