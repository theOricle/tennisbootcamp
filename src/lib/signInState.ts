import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  verifiedTotpFactor,
  type AssuranceLevel,
  type FactorLike,
} from "@/lib/signInCode";

/**
 * What the server knows about the signed-in session (backlog #92): who it is,
 * the level the session has reached, and the confirmed authenticator-app
 * factor on the account, if any.
 */
export type SignInState = {
  user: { id: string; email: string };
  /** "aal2" once the session has passed its code. Null when it could not be read. */
  aal: AssuranceLevel | null;
  /** The confirmed authenticator-app factor, or null. */
  totpFactorId: string | null;
};

/**
 * Read the session from verified sources only. The user and their factors
 * come from `getUser()`, which asks the Auth server; the level comes from
 * `getClaims()`, which checks the access token's signature (or asks the Auth
 * server, for a symmetric key) before its claims are read. The claims must be
 * the same user's. The session object in the cookie is never trusted for
 * either.
 *
 * Null when nobody is signed in or no auth backend is configured.
 */
export async function readSignInState(client?: SupabaseClient): Promise<SignInState | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return null;
  }
  const supabase = client ?? (await createClient());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  let aal: AssuranceLevel | null = null;
  try {
    const { data, error } = await supabase.auth.getClaims();
    if (error) console.error("Sign-in level not read: the claims were refused");
    const claims = error ? null : data?.claims;
    if (claims && claims.sub === user.id) {
      if (claims.aal === "aal2") aal = "aal2";
      else if (claims.aal === "aal1") aal = "aal1";
    }
  } catch {
    // The level could not be verified: it stays unknown, which never passes.
    // One fixed line, no user data.
    console.error("Sign-in level not read: the claims check failed");
  }

  const factors = (user.factors ?? []) as FactorLike[];
  return {
    user: { id: user.id, email: user.email ?? "" },
    aal,
    totpFactorId: verifiedTotpFactor(factors)?.id ?? null,
  };
}
