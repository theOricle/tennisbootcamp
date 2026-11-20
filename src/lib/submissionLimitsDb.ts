import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { normalizeEmail } from "@/lib/supabase/adminUsers";
import {
  DAY_MS,
  clientAddress,
  isMissingTable,
  limitKeyHash,
  limitVerdict,
  type LimitHit,
  type LimitScope,
} from "@/lib/submissionLimits";

// The table behind the submission limits (backlog #84, part 6; migration
// 0011). One row per counted submission per key: the form, a keyed hash of
// the network address or of the email, and the time. Never the address or
// the email itself: the hash is keyed with the service-role key, a secret
// the server already holds and nothing else sees. Rows older than a day are
// deleted as the limits are checked.
//
// This never blocks a form on its own trouble: before migration 0011 runs it
// logs one warning and lets everything through, as the routes always did; a
// read that fails lets the request through too.

const ALLOWED = { allowed: true } as const;
/** At most one clean-up of day-old rows per server instance per ten minutes. */
const PURGE_EVERY_MS = 10 * 60 * 1000;

let warnedMissing = false;
let lastPurge = 0;

/**
 * Count this submission against its network address and its email, and say
 * whether it may go ahead. A refused one is not counted. The caller answers a
 * refusal with SUBMISSION_LIMIT_ERROR and a 429, before any work.
 */
export async function checkSubmissionLimit(
  req: { headers: { get(name: string): string | null } },
  scope: LimitScope,
  email: string | null | undefined
): Promise<{ allowed: boolean }> {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !secret) return ALLOWED;
  try {
    const supabase = createServiceClient();
    const addressHash = limitKeyHash(secret, "address", clientAddress(req.headers));
    const normalized = normalizeEmail(email ?? "");
    const emailHash = normalized ? limitKeyHash(secret, "email", normalized) : null;
    const keys = emailHash ? [addressHash, emailHash] : [addressHash];
    const now = Date.now();
    const since = new Date(now - DAY_MS).toISOString();

    const { data, error } = await supabase
      .from("submission_limits")
      .select("key_hash, scope, created_at")
      .in("key_hash", keys)
      .gt("created_at", since)
      .limit(2000);
    if (error) {
      if (isMissingTable(error)) {
        if (!warnedMissing) {
          warnedMissing = true;
          console.warn("[submission limits] table not found: run migration 0011. Forms are not limited until then.");
        }
      } else {
        console.error("[submission limits] read failed; this request is not limited:", error.code ?? "unknown");
      }
      return ALLOWED;
    }

    const hits: LimitHit[] = ((data ?? []) as { key_hash: string; scope: string; created_at: string }[]).map(
      (r) => ({ keyHash: r.key_hash, scope: r.scope, createdAt: r.created_at })
    );
    const verdict = limitVerdict({ scope, addressHash, emailHash, hits, now });
    if (!verdict.allowed) {
      console.warn(`[submission limits] ${scope}: refused`);
      return verdict;
    }

    const createdAt = new Date(now).toISOString();
    const { error: insertError } = await supabase
      .from("submission_limits")
      .insert(keys.map((keyHash) => ({ scope, key_hash: keyHash, created_at: createdAt })));
    if (insertError) {
      console.error("[submission limits] write failed:", insertError.code ?? "unknown");
    }

    // Day-old rows go: nothing older is ever read, and none is kept.
    if (now - lastPurge > PURGE_EVERY_MS) {
      lastPurge = now;
      const { error: purgeError } = await supabase
        .from("submission_limits")
        .delete()
        .lt("created_at", since);
      if (purgeError) console.error("[submission limits] clean-up failed:", purgeError.code ?? "unknown");
    }
    return ALLOWED;
  } catch (err) {
    console.error(
      "[submission limits] check failed; this request is not limited:",
      err instanceof Error ? err.name : typeof err
    );
    return ALLOWED;
  }
}
