import "server-only";
import type { Cohort, CohortDbStatus, CohortStatus, SessionSlot } from "@/types/cohort";
import { cohorts as staticCohorts } from "@/content/cohorts";
import { createServiceClient } from "@/lib/supabase/service";
import { scheduledEndDate } from "@/lib/makeup";
import { tierInCohortRange } from "@/lib/tiers";

// Supabase-backed cohort reads (Phase 3). The static file src/content/cohorts.ts
// is the fallback whenever Supabase is unconfigured (build time, fresh dev
// setup) or the cohorts table is missing/empty (migration 0004 not yet run) —
// so every existing page keeps rendering while the database comes online.

export type CohortRow = {
  id: string;
  program_id: string;
  label: string;
  level_min: string | number | null;
  level_max: string | number | null;
  location_label: string | null;
  start_date: string;
  weeks: number;
  sessions: unknown;
  price_cents: number;
  currency: string;
  capacity_min: number;
  capacity_max: number;
  visibility: "public" | "private";
  status: CohortDbStatus;
  invite_hold_hours: number;
  makeup_max_weeks: number;
  credit_followup: boolean;
  created_at: string;
};

function supabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

const VALID_DAYS = new Set(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);

function parseSessions(input: unknown): SessionSlot[] {
  let raw: unknown = input;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (s): s is SessionSlot =>
      !!s &&
      typeof s === "object" &&
      VALID_DAYS.has((s as SessionSlot).day) &&
      typeof (s as SessionSlot).start === "string" &&
      typeof (s as SessionSlot).end === "string"
  );
}

function toNumberOrNull(v: string | number | null): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

/**
 * Lifecycle → display status. draft cohorts read as "upcoming" (visible, not
 * enrollable), inviting/confirmed as "open"; a running/finished/cancelled
 * cohort is no longer enrollable, which the existing UI expresses as "full".
 */
export function displayStatus(db: CohortDbStatus): CohortStatus {
  switch (db) {
    case "draft":
      return "upcoming";
    case "inviting":
    case "confirmed":
      return "open";
    default:
      return "full";
  }
}

export function mapRowToCohort(row: CohortRow): Cohort {
  const sessions = parseSessions(row.sessions);
  return {
    id: row.id,
    programId: row.program_id,
    locationId: row.location_label ?? "",
    label: row.label,
    startDate: row.start_date,
    endDate: scheduledEndDate(row.start_date, row.weeks, sessions),
    weeks: row.weeks,
    sessions,
    capacityMin: row.capacity_min,
    capacityMax: row.capacity_max,
    priceCents: row.price_cents,
    currency: "CAD",
    status: displayStatus(row.status),
    levelMin: toNumberOrNull(row.level_min),
    levelMax: toNumberOrNull(row.level_max),
    visibility: row.visibility,
    dbStatus: row.status,
    inviteHoldHours: row.invite_hold_hours,
    makeupMaxWeeks: row.makeup_max_weeks,
    creditFollowup: row.credit_followup,
  };
}

/** All cohorts, Supabase first, static file as the fallback. */
export async function getAllCohorts(): Promise<Cohort[]> {
  if (!supabaseConfigured()) return staticCohorts;
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("cohorts")
      .select("*")
      .order("start_date", { ascending: true });
    // An empty table means migration 0004 (with its seed) hasn't run yet —
    // keep serving the static file rather than an empty site.
    if (error || !data || data.length === 0) return staticCohorts;
    return (data as CohortRow[]).map(mapRowToCohort);
  } catch (err) {
    console.error("getAllCohorts failed — falling back to static file:", err);
    return staticCohorts;
  }
}

export async function getCohortById(id: string): Promise<Cohort | undefined> {
  if (!supabaseConfigured()) return staticCohorts.find((c) => c.id === id);
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("cohorts")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return staticCohorts.find((c) => c.id === id);
    return mapRowToCohort(data as CohortRow);
  } catch (err) {
    console.error("getCohortById failed — falling back to static file:", err);
    return staticCohorts.find((c) => c.id === id);
  }
}

/** Publicly listed cohorts (program pages, homepage grid): public + open/upcoming. */
export async function getPublicCohorts(): Promise<Cohort[]> {
  const all = await getAllCohorts();
  return all.filter(
    (c) =>
      (c.visibility ?? "public") === "public" &&
      (c.status === "open" || c.status === "upcoming")
  );
}

/**
 * Open cohorts matching a player's tier — the dashboard "Open for your tier"
 * list. Includes private tier-gated cohorts: a signed-in player whose level
 * falls in the band is admitted by /enroll without an invite token.
 */
export async function getOpenCohortsForLevel(
  level: number | string | null | undefined
): Promise<Cohort[]> {
  if (level === null || level === undefined || level === "") return [];
  const all = await getAllCohorts();
  return all.filter(
    (c) => c.status === "open" && tierInCohortRange(level, c.levelMin, c.levelMax)
  );
}
