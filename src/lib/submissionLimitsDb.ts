import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import {
  DAY_MS,
  clientAddress,
  isMissingTable,
  takeTicket,
  type LimitScope,
  type LimitStore,
  type StoredHit,
  type SubmissionTicket,
} from "@/lib/submissionLimits";

// The table behind the submission limits (backlog #84, part 6; migration
// 0011). One row per counted try per key: the form, a keyed hash of the
// network address or of the email, and the time. Never the address or the
// email itself: takeTicket hashes them with the service-role key, a secret
// the server already holds and nothing else sees, and this store writes
// exactly the rows it is handed. Rows older than a day are deleted as the
// limits are checked.
//
// The count is takeTicket's (src/lib/submissionLimits.ts): record the try,
// then count, then take it back when it is over — atomic without a lock.
//
// This never blocks a form on its own trouble: before migration 0011 runs it
// logs one warning and lets everything through, as the routes always did; a
// read or write that fails lets the request through too.

/** The ticket of a form the limits do not apply to (off, or the table's trouble). */
const OPEN_TICKET: SubmissionTicket = { allowed: true, release: async () => {} };
/** At most one clean-up of day-old rows per server instance per ten minutes. */
const PURGE_EVERY_MS = 10 * 60 * 1000;

let warnedMissing = false;
let lastPurge = 0;

class LimitStoreError extends Error {
  constructor(code: string | null | undefined) {
    super(`submission_limits: ${code ?? "unknown"}`);
    this.name = "LimitStoreError";
  }
}

/**
 * Count this try against its network address and its email, and say whether
 * it may go ahead. A refused try is not counted. The caller answers a refusal
 * with SUBMISSION_LIMIT_ERROR and a 429 before any work, and calls
 * `release()` when it then refuses the try for a reason of its own.
 */
export async function checkSubmissionLimit(
  req: { headers: { get(name: string): string | null } },
  scope: LimitScope,
  email: string | null | undefined
): Promise<SubmissionTicket> {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !secret) return OPEN_TICKET;
  try {
    const supabase = createServiceClient();
    const store: LimitStore = {
      async insert(rows) {
        const { data, error } = await supabase.from("submission_limits").insert(rows).select("id");
        if (error) {
          if (isMissingTable(error)) return "missing";
          throw new LimitStoreError(error.code);
        }
        return ((data ?? []) as { id: string }[]).map((r) => r.id);
      },
      async readWindow(keys, since) {
        const { data, error } = await supabase
          .from("submission_limits")
          .select("id, key_hash, scope, created_at")
          .in("key_hash", keys)
          .gt("created_at", since)
          .limit(5000);
        if (error) throw new LimitStoreError(error.code);
        return (data ?? []) as StoredHit[];
      },
      async remove(ids) {
        if (ids.length === 0) return;
        const { error } = await supabase.from("submission_limits").delete().in("id", ids);
        if (error) console.error("[submission limits] take-back failed:", error.code ?? "unknown");
      },
    };

    const now = Date.now();
    const ticket = await takeTicket(store, {
      secret,
      scope,
      address: clientAddress(req.headers),
      email,
      now,
    });
    if (ticket === "missing") {
      if (!warnedMissing) {
        warnedMissing = true;
        console.warn("[submission limits] table not found: run migration 0011. Forms are not limited until then.");
      }
      return OPEN_TICKET;
    }
    if (!ticket.allowed) console.warn(`[submission limits] ${scope}: refused`);

    // Day-old rows go: nothing older is ever read, and none is kept.
    if (now - lastPurge > PURGE_EVERY_MS) {
      lastPurge = now;
      const { error: purgeError } = await supabase
        .from("submission_limits")
        .delete()
        .lt("created_at", new Date(now - DAY_MS).toISOString());
      if (purgeError) console.error("[submission limits] clean-up failed:", purgeError.code ?? "unknown");
    }
    return ticket;
  } catch (err) {
    console.error(
      "[submission limits] check failed; this request is not limited:",
      err instanceof Error ? err.name : typeof err
    );
    return OPEN_TICKET;
  }
}
