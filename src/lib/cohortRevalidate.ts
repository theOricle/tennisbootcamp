import "server-only";
import { revalidatePath } from "next/cache";

/**
 * The public pages that list cohorts (audit M39): home and /programs show each
 * program's next cohort, and every /programs/[slug] page lists its open
 * cohorts with seats. All three are rebuilt at most once a minute on their
 * own (`revalidate = 60`); a cohort change from the admin or the payment
 * flow rebuilds them at once.
 */
export const COHORT_PAGES = ["/", "/programs"] as const;
export const COHORT_DETAIL_ROUTE = "/programs/[slug]";

/**
 * Mark the cohort pages stale. Never throws: outside a request (a script, a
 * test) Next has nowhere to record it, and a missed refresh only waits for
 * the next minute's rebuild.
 */
export function revalidateCohortPages(): void {
  try {
    for (const path of COHORT_PAGES) revalidatePath(path);
    revalidatePath(COHORT_DETAIL_ROUTE, "page");
  } catch (err) {
    console.warn(
      "[cohorts] page revalidation skipped:",
      err instanceof Error ? err.message : err
    );
  }
}
