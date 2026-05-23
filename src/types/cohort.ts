export type SessionSlot = {
  day: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
  start: string; // "17:00"
  end: string;   // "18:00"
};

export type CohortStatus = "open" | "waitlist" | "full" | "upcoming";

export type Cohort = {
  id: string;           // e.g. "bootcamps-balliol-2026-summer"
  programId: string;    // FK → Program.id
  locationId: string;   // FK → Location.id
  label: string;        // "Summer Cohort"
  startDate: string;    // ISO "2026-06-07"
  endDate: string;      // ISO "2026-07-12"
  weeks: number;        // 6
  sessions: SessionSlot[];
  capacityMin: number;  // 6
  capacityMax: number;  // 8
  priceCents: number;   // PLACEHOLDER until real prices set
  currency: "CAD";
  status: CohortStatus;
};
