export type SessionSlot = {
  day: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
  start: string; // "17:00"
  end: string;   // "18:00"
};

export type CohortStatus = "open" | "waitlist" | "full" | "upcoming";

// Lifecycle status of a Supabase-backed cohort (public.cohorts.status).
// Display mapping lives in src/lib/cohortsDb.ts.
export type CohortDbStatus =
  | "draft"
  | "inviting"
  | "confirmed"
  | "running"
  | "completed"
  | "cancelled";

export type Cohort = {
  id: string;           // e.g. "bootcamps-balliol-2026-summer"
  programId: string;    // FK → Program.id
  locationId: string;   // FK → Location.id, or a free-text label for admin-created cohorts
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

  // Supabase-backed fields (Phase 3). Absent on static-fallback cohorts.
  levelMin?: number | null;      // coach-level band the cohort is built for
  levelMax?: number | null;      // (both null = not tier-gated)
  visibility?: "public" | "private";
  dbStatus?: CohortDbStatus;
  inviteHoldHours?: number;
  makeupMaxWeeks?: number;
  creditFollowup?: boolean;      // cancellations exceeded the make-up cap
};
