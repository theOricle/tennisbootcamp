import "server-only";
import type { Cohort, CohortDbStatus, CohortStatus, SessionSlot } from "@/types/cohort";
import { createServiceClient } from "@/lib/supabase/service";
import { scheduledEndDate } from "@/lib/makeup";
import { tierInCohortRange } from "@/lib/tiers";
import { isCohortPublic, isCohortRenderable } from "@/lib/cohortVisibility";

// Supabase-backed cohort reads (Phase 3). Supabase is the only source: when it
// is unconfigured (build time, fresh dev setup) or the cohorts table is
// missing/empty, readers get an empty list and pages render their empty state
// (backlog #1 — the static fallback file was removed so stale cohorts can
// never render).

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
  payment_mode?: "card" | "etransfer" | null; // migration 0006; absent before it runs
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
    paymentMode: row.payment_mode === "etransfer" ? "etransfer" : "card",
  };
}


/** All cohorts in Supabase, every status (admin, enrollment lookups). */
export async function getAllCohorts(): Promise<Cohort[]> {
  if (!supabaseConfigured()) return [];
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("cohorts")
      .select("*")
      .order("start_date", { ascending: true });
    if (error || !data) return [];
    return (data as CohortRow[]).map(mapRowToCohort);
  } catch (err) {
    console.error("getAllCohorts failed:", err);
    return [];
  }
}

export async function getCohortById(id: string): Promise<Cohort | undefined> {
  if (!supabaseConfigured()) return undefined;
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("cohorts")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return undefined;
    return mapRowToCohort(data as CohortRow);
  } catch (err) {
    console.error("getCohortById failed:", err);
    return undefined;
  }
}

/**
 * Publicly listed cohorts (program pages, homepage grid): public visibility,
 * inviting or confirmed, start date not in the past. Draft and cancelled
 * cohorts never render publicly.
 */
export async function getPublicCohorts(): Promise<Cohort[]> {
  const all = await getAllCohorts();
  return all.filter((c) => isCohortPublic(c));
}

export type CohortSessionRow = {
  id: string;
  cohort_id: string;
  session_date: string;
  start_time: string;
  end_time: string;
  status: "scheduled" | "completed" | "cancelled";
  cancellation_reason: string | null;
  makeup_for: string | null;
};

/** Dated session rows for a set of cohorts (dashboard session lists). */
export async function getSessionsForCohorts(
  cohortIds: string[]
): Promise<CohortSessionRow[]> {
  if (!supabaseConfigured() || cohortIds.length === 0) return [];
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("cohort_sessions")
      .select("*")
      .in("cohort_id", cohortIds)
      .order("session_date", { ascending: true })
      .order("start_time", { ascending: true });
    if (error || !data) return [];
    return data as CohortSessionRow[];
  } catch (err) {
    console.error("getSessionsForCohorts failed:", err);
    return [];
  }
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
    (c) => isCohortRenderable(c) && tierInCohortRange(level, c.levelMin, c.levelMax)
  );
}
