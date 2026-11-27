// How an admin page reads its lists (backlog #104). One rule for the four
// data pages (cohorts, a cohort, assessments, players): a read that fails
// says what it could not load and offers Retry, a lapsed sign-in says so and
// links back through the page's own gate, an unknown cohort reads as not
// found, and none of them is ever shown as an empty list. What was already
// on screen stays.
//
// Pure, with no React: the admin clients (all "use client") and the tests
// share it. `fetchImpl` is the browser's fetch on the pages and a stand-in in
// the tests.

/** Why a read gave nothing to show. */
export type LoadProblem =
  /** The admin sign-in has ended (401 or 403): Retry cannot work, signing in again can. */
  | "signed_out"
  /** The thing asked for does not exist (404). */
  | "not_found"
  /** Anything else: the server refused, the answer was unreadable, or it never arrived. */
  | "failed";

export type LoadResult<T> = { ok: true; data: T } | { ok: false; problem: LoadProblem };

/** The problem an HTTP status is, or null for an answer to read. */
export function problemForStatus(status: number): LoadProblem | null {
  if (status === 401 || status === 403) return "signed_out";
  if (status === 404) return "not_found";
  return status >= 200 && status < 300 ? null : "failed";
}

type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/**
 * One GET, read to the end: the parsed body, or the problem. A network
 * failure, an unreadable body and a refusal are all `failed`; `accept` lets
 * a page refuse an answer that arrived whole but says the read behind it
 * failed (the cohorts list's `dbReady: false`).
 */
export async function adminRead<T>(
  url: string,
  fetchImpl: FetchLike = fetch,
  accept: (data: T) => boolean = () => true
): Promise<LoadResult<T>> {
  try {
    const res = await fetchImpl(url);
    const problem = problemForStatus(res.status);
    if (problem) return { ok: false, problem };
    const data = (await res.json()) as T;
    if (data === null || typeof data !== "object" || !accept(data)) return { ok: false, problem: "failed" };
    return { ok: true, data };
  } catch {
    return { ok: false, problem: "failed" };
  }
}

/**
 * The cohorts list, read once: its rows, or why there are none to show. The
 * list route answers `dbReady: false` for any read it could not make (and
 * with no database configured): that is a failed read, never an empty list.
 */
export async function loadCohortList<T>(fetchImpl?: FetchLike): Promise<LoadResult<T[]>> {
  const result = await adminRead<{ cohorts?: T[]; dbReady?: boolean }>(
    "/api/admin/cohorts",
    fetchImpl,
    (d) => d.dbReady === true
  );
  return result.ok ? { ok: true, data: result.data.cohorts ?? [] } : result;
}

/** What a list shows after a read: the new rows, or the ones already on screen when it failed. */
export function keepOnFailure<T, R>(previous: T, result: LoadResult<R>, pick: (data: R) => T): T {
  return result.ok ? pick(result.data) : previous;
}

/** The first problem among several reads that says the sign-in ended, else null. */
export function signedOutAmong(results: readonly LoadResult<unknown>[]): boolean {
  return results.some((r) => !r.ok && r.problem === "signed_out");
}

/** A read's problem, or null when it answered. */
export function problemOf(result: LoadResult<unknown>): LoadProblem | null {
  return result.ok ? null : result.problem;
}

// ─── The words ────────────────────────────────────────────────────────────────

/** A lapsed admin sign-in, on every admin data page. */
export const SIGNED_OUT_LINE = "Your admin sign-in has ended.";
/** Its one way out: the page itself, whose gate sends the coach to the password or the code step. */
export const SIGN_IN_AGAIN = "Sign in again";
export const RETRY = "Retry";

/** "Couldn't load the cohorts.": what a failed read says, naming what it was loading. */
export function couldNotLoad(what: string): string {
  return `Couldn't load ${what}.`;
}

/** An unknown cohort id, on the cohort's own page; "← Cohorts" above it is the way back. */
export const COHORT_NOT_FOUND = "We couldn't find this cohort.";
