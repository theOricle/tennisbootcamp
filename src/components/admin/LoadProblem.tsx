import Link from "next/link";
import {
  BACK_TO_COHORTS,
  COHORT_NOT_FOUND,
  RETRY,
  SIGNED_OUT_LINE,
  SIGN_IN_AGAIN,
  couldNotLoad,
  type LoadProblem,
} from "@/lib/adminLoad";

// What an admin list shows in place of its rows when its read gave nothing
// (backlog #104): what it could not load with Retry, a lapsed sign-in with
// the way back in and no Retry, or a cohort that does not exist with the way
// back to the list. Never an empty-list line, and never a word about how the
// database is set up.

const ACTION_CLASS =
  "inline-flex min-h-[44px] items-center rounded-full border border-white/20 px-4 text-sm font-semibold text-white/70 transition hover:border-[#B4E655]/50 hover:text-white";

export function AdminLoadProblem({
  problem,
  what,
  here,
  onRetry,
}: {
  problem: LoadProblem;
  /** What the read was loading, as the sentence names it: "the cohorts". */
  what: string;
  /** The page's own path. Its server gate routes a reload to the password or the code step. */
  here: string;
  onRetry: () => void;
}) {
  if (problem === "signed_out") {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p role="alert" className="text-sm text-red-300">
          {SIGNED_OUT_LINE}
        </p>
        {/* A plain link, so the browser asks the server for the page and its gate answers. */}
        <a href={here} className={ACTION_CLASS}>
          {SIGN_IN_AGAIN}
        </a>
      </div>
    );
  }
  if (problem === "not_found") {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p role="alert" className="text-sm text-red-300">
          {COHORT_NOT_FOUND}
        </p>
        <Link href="/admin/cohorts" className={ACTION_CLASS}>
          {BACK_TO_COHORTS}
        </Link>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <p role="alert" className="text-sm text-red-300">
        {couldNotLoad(what)}
      </p>
      <button type="button" onClick={onRetry} className={ACTION_CLASS}>
        {RETRY}
      </button>
    </div>
  );
}
