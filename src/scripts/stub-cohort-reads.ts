// Import this file, after ./stub-server-only, before a page that reads the
// public blocks through src/lib/cohortsDb.ts (getPublicCohorts: /programs,
// /locations).
//
// Those reads ask Supabase through createServiceClient
// (src/lib/supabase/service.ts), and only when the project's URL and service
// key are set. `npm test` has no database, so this sets both to stand-in
// values (never a real key) and points that one module at a stand-in client.
// It answers the cohorts read with the rows a test hands it (setCohortRows),
// or fails the way a broken read does (failCohortReads: an error in the
// answer, or a throw). It also clears the Sheets settings, so the seat read
// stays unconfigured and nothing leaves this process. Test-only: nothing
// under src/app or src/components imports it.

import Module from "node:module";

type Resolve = (this: unknown, request: string, ...rest: unknown[]) => string;
type Answer = { data: unknown[] | null; error: { message: string } | null };

let rows: unknown[] = [];
let failure: "error" | "throw" | null = null;

/** The cohort rows the next reads return, as Supabase stores them (CohortRow). */
export function setCohortRows(next: readonly unknown[]): void {
  rows = [...next];
  failure = null;
}

/** Make the next reads fail: an error in the answer, or a thrown one. */
export function failCohortReads(how: "error" | "throw"): void {
  failure = how;
}

/** The stand-in for src/lib/supabase/service.ts: the one query getAllCohorts makes. */
export function createServiceClient() {
  return {
    from(table: string) {
      const query = {
        select: () => query,
        order: (): Promise<Answer> => {
          if (failure === "throw") return Promise.reject(new Error("stand-in read failed"));
          if (failure === "error") return Promise.resolve({ data: null, error: { message: "stand-in read failed" } });
          return Promise.resolve({ data: table === "cohorts" ? [...rows] : [], error: null });
        },
      };
      return query;
    },
  };
}

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "stand-in";
delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
delete process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

const loader = Module as unknown as { _resolveFilename: Resolve };
const original = loader._resolveFilename;
const SERVICE = /[\\/]src[\\/]lib[\\/]supabase[\\/]service\.ts$/;

loader._resolveFilename = function (this: unknown, request: string, ...rest: unknown[]) {
  const resolved = original.call(this, request, ...rest);
  return SERVICE.test(resolved) ? __filename : resolved;
};
