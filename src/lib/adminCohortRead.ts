import "server-only";
import type { Cohort } from "@/types/cohort";
import { createServiceClient } from "@/lib/supabase/service";
import { mapRowToCohort, type CohortRow } from "@/lib/cohortsDb";

// The admin cohort page's own read of its cohort (backlog #104). It tells a
// cohort that does not exist from a read that failed, so the page says "not
// found" only for a missing row and "couldn't load" (with Retry) during an
// outage. getCohortById (src/lib/cohortsDb.ts) answers both with undefined,
// which is right for its callers (checkout, sign-up, e-transfer, the Stripe
// webhook) and is left exactly as it is.

export type AdminCohortRead =
  | { status: "found"; cohort: Cohort }
  | { status: "missing" }
  | { status: "failed" };

/** The slice of the Supabase client this read uses; a test hands in a stand-in. */
export type CohortReadClient = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

function configured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function readCohortForAdmin(id: string, client?: CohortReadClient): Promise<AdminCohortRead> {
  if (!client && !configured()) return { status: "failed" };
  try {
    const db = client ?? createServiceClient();
    const { data, error } = await db.from("cohorts").select("*").eq("id", id).maybeSingle();
    if (error) return { status: "failed" };
    if (!data) return { status: "missing" };
    return { status: "found", cohort: mapRowToCohort(data as CohortRow) };
  } catch (err) {
    console.error("Admin cohort read failed:", err instanceof Error ? err.name : typeof err);
    return { status: "failed" };
  }
}
